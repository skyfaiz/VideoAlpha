from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit

import aiohttp
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import Response

try:
    from .minimax_payload_builder import (
        ASPECT_RATIOS,
        DEFAULT_WORKFLOW_ID,
        FPS,
        QUANT_PROFILES,
        SECONDS_MAX,
        SECONDS_MIN,
        SECONDS_STEP,
        build_payload,
        get_workflow_advanced_fields,
        get_workflows_catalog,
    )
    from .workflow_support import (
        apply_input_filename_map,
        build_output_path,
        collect_output_entries,
        collect_text_outputs,
        decode_base64_data,
        extract_history_error,
        guess_media_type,
        write_input_images,
    )
except ImportError:
    from minimax_payload_builder import (
        ASPECT_RATIOS,
        DEFAULT_WORKFLOW_ID,
        FPS,
        QUANT_PROFILES,
        SECONDS_MAX,
        SECONDS_MIN,
        SECONDS_STEP,
        build_payload,
        get_workflow_advanced_fields,
        get_workflows_catalog,
    )
    from workflow_support import (
        apply_input_filename_map,
        build_output_path,
        collect_output_entries,
        collect_text_outputs,
        decode_base64_data,
        extract_history_error,
        guess_media_type,
        write_input_images,
    )

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"

# Load local .env or parent backend/.env if present
for _candidate_env in (
    ROOT_DIR / ".env",
    ROOT_DIR.parent / ".env",
    ROOT_DIR.parent.parent / ".env",
    ROOT_DIR.parent / "LTX2.5-serverless" / ".env",
):
    if _candidate_env.exists():
        for _line in _candidate_env.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(
                    _k.strip(), _v.strip().strip('"').strip("'")
                )

def _load_runpod_key_from_mcp_configs() -> str:
    """Fall back to the Bearer token configured for the local RunPod MCP server."""
    candidates = [
        ROOT_DIR / ".devin" / "mcp_config.local.json",
        ROOT_DIR / ".devin" / "mcp_config.json",
        ROOT_DIR.parent / ".devin" / "mcp_config.local.json",
        ROOT_DIR.parent / ".devin" / "mcp_config.json",
        ROOT_DIR.parent.parent / ".devin" / "mcp_config.local.json",
        ROOT_DIR.parent.parent / ".devin" / "mcp_config.json",
        ROOT_DIR.parent.parent.parent / ".devin" / "mcp_config.local.json",
        ROOT_DIR.parent / "LTX2.5-serverless" / ".devin" / "mcp_config.local.json",
        Path.home() / ".config" / "devin" / "mcp_config.local.json",
        Path.home() / ".config" / "devin" / "mcp_config.json",
    ]
    for path in candidates:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        server = (data.get("mcpServers") or {}).get("runpod") or {}
        env_key = ((server.get("env") or {}).get("RUNPOD_API_KEY") or "").strip()
        header = ((server.get("headers") or {}).get("Authorization") or "").strip()
        if env_key:
            return env_key
        if header.lower().startswith("bearer "):
            return header[7:].strip()
        if header:
            return header
    return ""


DEFAULT_RUNPOD_API_KEY = (
    os.environ.get("RUNPOD_API_KEY", "").strip()
    or _load_runpod_key_from_mcp_configs()
)
DEFAULT_OPENROUTER_API_KEY = (
    os.environ.get("OPENROUTER_API_KEY", "").strip()
    or os.environ.get("LLM_KEY", "").strip()
)
RUNPOD_MCP_URL = os.environ.get("RUNPOD_MCP_URL", "https://mcp.runpod.io/").strip()

MINIMAX_POD_NAME = os.environ.get("MINIMAX_POD_NAME", "minimax-h3-pod").strip()
MINIMAX_POD_IMAGE = os.environ.get(
    "MINIMAX_POD_IMAGE", "hearmeman/comfyui-minimax-template:v10"
).strip()
MINIMAX_VOLUME_ID = os.environ.get("MINIMAX_VOLUME_ID", "vkqbtcijow").strip()
MINIMAX_VOLUME_NAME = os.environ.get("MINIMAX_VOLUME_NAME", "ltx25-models").strip()
MINIMAX_VOLUME_SIZE_GB = int(os.environ.get("MINIMAX_VOLUME_SIZE_GB", "165"))
MINIMAX_DATA_CENTER_ID = os.environ.get("MINIMAX_DATA_CENTER_ID", "EUR-IS-2").strip()
MINIMAX_MOUNT_PATH = os.environ.get("MINIMAX_MOUNT_PATH", "/workspace").strip()
MINIMAX_DEFAULT_QUANT = os.environ.get("MINIMAX_DEFAULT_QUANT", "int8").strip()
MINIMAX_HF_SECRET_REF = os.environ.get(
    "MINIMAX_HF_SECRET_REF", "{{ RUNPOD_SECRET_hf_access_token }}"
).strip()

CACHED_OUTPUTS_DIR = ROOT_DIR / "outputs"
CACHED_OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

MINIMAX_GPU_OPTIONS = [
    {
        "id": "NVIDIA L40S",
        "label": "NVIDIA L40S · 48 GB VRAM ($1.09/hr)",
        "vram_gb": 48,
        "price_hr": 1.09,
    },
    {
        "id": "NVIDIA RTX PRO 6000 Blackwell Server Edition MIG 2g.48gb",
        "label": "RTX PRO 6000 MIG · 48 GB VRAM ($1.29/hr)",
        "vram_gb": 48,
        "price_hr": 1.29,
    },
    {
        "id": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
        "label": "RTX PRO 6000 Blackwell · 96 GB VRAM ($2.49/hr)",
        "vram_gb": 96,
        "price_hr": 2.49,
    },
    {
        "id": "NVIDIA H100 80GB HBM3",
        "label": "NVIDIA H100 · 80 GB HBM3 ($3.99/hr)",
        "vram_gb": 80,
        "price_hr": 3.99,
    },
    {
        "id": "NVIDIA GeForce RTX 5090",
        "label": "NVIDIA RTX 5090 · 32 GB VRAM ($1.19/hr)",
        "vram_gb": 32,
        "price_hr": 1.19,
    },
]

COMFY_INPUT_DIR = os.environ.get("COMFY_INPUT_DIR", "/ComfyUI/input")
COMFY_OUTPUT_DIR = os.environ.get("COMFY_OUTPUT_DIR", "/ComfyUI/output")
LOCAL_COMFY_NODE = os.environ.get("LOCAL_COMFY_NODE", "127.0.0.1:8188").strip()
POD_SUBMIT_JOBS: dict[str, dict[str, Any]] = {}

# Idle safety watchdog: terminate the GPU Pod when no job arrives within this window.
POD_IDLE_TIMEOUT_SECONDS = int(os.environ.get("POD_IDLE_TIMEOUT_SECONDS", "180"))
POD_IDLE_CHECK_INTERVAL_SECONDS = max(
    5, int(os.environ.get("POD_IDLE_CHECK_INTERVAL_SECONDS", "15"))
)
POD_ACTIVE_JOB_MAX_AGE_SECONDS = int(
    os.environ.get("POD_ACTIVE_JOB_MAX_AGE_SECONDS", "1800")
)
POD_COMFY_PORT = int(os.environ.get("POD_COMFY_PORT", "8188"))
POD_RUN_HISTORY_LIMIT = 10
POD_ACTIVITY: dict[str, Any] = {
    "last_activity_at": None,
    "last_reason": "",
    "auto_terminated_at": None,
    "auto_terminated_pod_id": "",
}
POD_COST_HISTORY_FILE = CACHED_OUTPUTS_DIR / "pod_cost_history.json"


def load_pod_cost_history() -> list[dict[str, Any]]:
    try:
        if POD_COST_HISTORY_FILE.exists():
            raw = json.loads(POD_COST_HISTORY_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                return raw
    except Exception:
        pass
    return []


def save_pod_cost_history() -> None:
    try:
        POD_COST_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        POD_COST_HISTORY_FILE.write_text(
            json.dumps(POD_RUN_HISTORY, indent=2), encoding="utf-8"
        )
    except Exception:
        pass


def total_pod_cost() -> float:
    return round(
        sum(float(entry.get("cost") or 0.0) for entry in POD_RUN_HISTORY), 4
    )


POD_RUN_HISTORY: list[dict[str, Any]] = load_pod_cost_history()
_POD_WATCHDOG_TASK: asyncio.Task | None = None


def ensure_pod_idle_watchdog_started() -> None:
    """Start the idle watchdog once, even when hosted as a mounted sub-app."""
    global _POD_WATCHDOG_TASK
    if POD_IDLE_TIMEOUT_SECONDS <= 0:
        return
    if _POD_WATCHDOG_TASK is not None and not _POD_WATCHDOG_TASK.done():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    _POD_WATCHDOG_TASK = loop.create_task(pod_idle_watchdog())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_pod_idle_watchdog_started()
    try:
        yield
    finally:
        task = _POD_WATCHDOG_TASK
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task


app = FastAPI(title="MiniMax H3 Studio & Pod Controller", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.middleware("http")
async def disable_frontend_caching(request: Request, call_next) -> Response:
    ensure_pod_idle_watchdog_started()
    response = await call_next(request)
    if request.url.path.endswith("/") or "/static/" in request.url.path:
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


class PayloadRequest(BaseModel):
    workflow_id: str = Field(default=DEFAULT_WORKFLOW_ID, min_length=1)
    prompt: str = Field(default="", max_length=10000)
    seconds: float = Field(default=5.0, ge=SECONDS_MIN, le=SECONDS_MAX)
    aspect_ratio: str = Field(default="9:16")
    image_name: str = Field(default="")
    image_data_url: str = Field(default="")
    openrouter_api_key: str = Field(default="")
    references: list[dict[str, Any]] = Field(default_factory=list)
    refmods: list[dict[str, Any]] = Field(default_factory=list)
    studio_files: list[dict[str, Any]] = Field(default_factory=list)
    quant_profile: str = Field(default="int8")
    overrides: dict[str, Any] = Field(default_factory=dict)


class PodSubmitRequest(BaseModel):
    payload: dict[str, Any]
    timeout_seconds: int = Field(default=900, ge=5, le=3600)


class PodDeployRequest(BaseModel):
    gpu_id: str = "NVIDIA L40S"
    quant_profile: str = "int8"
    download_viggle_animate: bool = False
    volume_id: str = ""
    data_center_id: str = ""


class PodLifecycleActionRequest(BaseModel):
    action: str = Field(..., pattern="^(start|stop|restart|terminate)$")
    pod_id: str = ""


def is_local_comfy_environment() -> bool:
    return Path(COMFY_INPUT_DIR).exists()


def normalize_node_host(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise RuntimeError("LOCAL_COMFY_NODE is not configured.")
    if "://" in normalized:
        parsed = urlsplit(normalized)
        if not parsed.netloc:
            raise RuntimeError(f"Invalid LOCAL_COMFY_NODE value: {value}")
        normalized = parsed.netloc
    return normalized.rstrip("/")


def get_pod_submit_node() -> str:
    return normalize_node_host(LOCAL_COMFY_NODE)


def prepare_pod_images(
    images: list[dict[str, str]] | None,
) -> tuple[dict[str, str], list[dict[str, str]]]:
    if not images:
        return {}, []

    job_prefix = f"frontend-{uuid.uuid4().hex[:10]}"
    replacements: dict[str, str] = {}
    prepared_images: list[dict[str, str]] = []

    for image in images:
        image_name = image.get("name")
        image_data = image.get("image")
        subfolder = (image.get("subfolder") or "").strip().strip("/")
        if not image_name or not image_data:
            raise ValueError(
                "'images' must be a list of objects with 'name' and 'image' keys."
            )

        if subfolder:
            prepared_images.append(
                {"name": image_name, "image": image_data, "subfolder": subfolder}
            )
        else:
            scoped_name = f"{job_prefix}_{Path(image_name).name}"
            replacements[image_name] = scoped_name
            prepared_images.append(
                {"name": scoped_name, "image": image_data, "subfolder": ""}
            )

    return replacements, prepared_images


async def upload_images_to_remote_comfy(
    session: aiohttp.ClientSession,
    comfy_base_url: str,
    images: list[dict[str, str]],
) -> None:
    for item in images:
        fname = item["name"]
        subfolder = (item.get("subfolder") or "").strip().strip("/")
        raw_bytes = decode_base64_data(item["image"])
        form = aiohttp.FormData()
        form.add_field(
            "image",
            raw_bytes,
            filename=Path(fname).name,
            content_type="application/octet-stream",
        )
        form.add_field("overwrite", "true")
        if subfolder:
            form.add_field("subfolder", subfolder)

        async with session.post(f"{comfy_base_url}/upload/image", data=form) as resp:
            if resp.status >= 400:
                body = await resp.text()
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to upload '{fname}' to ComfyUI ({resp.status}): {body[:200]}",
                )


def remember_pod_submit_job(prompt_id: str, pod_id: str = "") -> None:
    POD_SUBMIT_JOBS[prompt_id] = {
        "pod_id": pod_id,
        "submitted_at": time.time(),
    }
    mark_pod_activity("job-submitted")


def get_pod_submit_render_time(prompt_id: str) -> float | None:
    job = POD_SUBMIT_JOBS.get(prompt_id)
    if not job:
        return None
    submitted_at = job.get("submitted_at")
    if not isinstance(submitted_at, (int, float)):
        return None
    return round(time.time() - submitted_at, 2)


def build_pod_output_payload(
    history_entry: dict[str, Any], pod_id: str = ""
) -> dict[str, Any]:
    raw_outputs = history_entry.get("outputs", {})
    entries = collect_output_entries(raw_outputs)
    texts = collect_text_outputs(raw_outputs)
    output: dict[str, Any] = {"images": [], "videos": [], "audios": [], "texts": texts}

    for entry in entries:
        media_type = guess_media_type(entry["filename"], entry["media_kind"])
        base_params = {
            "filename": entry["filename"],
            "subfolder": entry.get("subfolder", ""),
            "media_kind": entry["media_kind"],
        }
        if pod_id:
            base_params["pod_id"] = pod_id
        query = urlencode(base_params)
        download_query = urlencode({**base_params, "download": "1"})
        payload = {
            "filename": entry["filename"],
            "subfolder": entry.get("subfolder", ""),
            "media_type": media_type,
            "url": f"api/comfy-output?{query}",
            "download_url": f"api/comfy-output?{download_query}",
        }
        if media_type.startswith("video/"):
            output["videos"].append(payload)
        elif media_type.startswith("audio/"):
            output["audios"].append(payload)
        else:
            output["images"].append(payload)

    return {key: value for key, value in output.items() if value}


async def call_runpod_mcp(
    session: aiohttp.ClientSession,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not DEFAULT_RUNPOD_API_KEY:
        raise HTTPException(
            status_code=500, detail="RUNPOD_API_KEY is not configured on the server."
        )
    headers = {
        "Authorization": f"Bearer {DEFAULT_RUNPOD_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {},
        },
    }
    async with session.post(RUNPOD_MCP_URL, headers=headers, json=body) as resp:
        raw_text = await resp.text()
        if resp.status >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"RunPod MCP error ({resp.status}): {raw_text[:300]}",
            )

    rpc_payload: dict[str, Any] | None = None
    for line in raw_text.splitlines():
        line_str = line.strip()
        if line_str.startswith("data:"):
            candidate = line_str[5:].strip()
            if candidate:
                try:
                    rpc_payload = json.loads(candidate)
                    break
                except json.JSONDecodeError:
                    continue
    if rpc_payload is None:
        try:
            rpc_payload = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid RunPod MCP response: {raw_text[:200]}",
            ) from exc

    result = (rpc_payload or {}).get("result") or {}
    is_error = bool(result.get("isError"))
    content_items = result.get("content") or []
    text_content = ""
    for item in content_items:
        if isinstance(item, dict) and item.get("type") == "text":
            text_content = item.get("text", "")
            break

    if is_error:
        raise HTTPException(
            status_code=502, detail=text_content or "RunPod MCP tool error."
        )

    if not text_content:
        return {}
    try:
        return json.loads(text_content)
    except json.JSONDecodeError:
        return {"raw": text_content}


async def find_minimax_pod(session: aiohttp.ClientSession) -> dict[str, Any] | None:
    listed = await call_runpod_mcp(session, "list-pods", {})
    pods = listed.get("pods") or []
    for pod in pods:
        name = (pod.get("name") or "").strip()
        image = (pod.get("image") or "").strip()
        if name == MINIMAX_POD_NAME or "comfyui-minimax" in image:
            pod_id = pod.get("id")
            if pod_id:
                try:
                    return await call_runpod_mcp(session, "get-pod", {"id": pod_id})
                except Exception:
                    return pod
    return None


async def check_remote_pod_ready(
    session: aiohttp.ClientSession, pod_id: str
) -> bool:
    stats_url = f"https://{pod_id}-8188.proxy.runpod.net/system_stats"
    try:
        async with session.get(
            stats_url, timeout=aiohttp.ClientTimeout(total=4)
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                return isinstance(data, dict) and "system" in data
    except Exception:
        return False
    return False


async def fetch_pod_boot_logs(
    session: aiohttp.ClientSession, pod_id: str
) -> list[str]:
    try:
        log_data = await call_runpod_mcp(
            session,
            "stream-pod-logs",
            {"podId": pod_id, "source": "both", "tail": 45, "maxWaitMs": 800},
        )
        items = log_data.get("items") or []
        cleaned: list[str] = []
        for item in items:
            line = (item.get("line") or "").strip()
            if not line:
                continue
            if re.match(
                r"^[0-9a-f]{12}\s+(Extracting|Downloading|Waiting|Verifying|Pull complete)",
                line,
            ):
                if cleaned and cleaned[-1].startswith("Docker image pull:"):
                    cleaned[-1] = f"Docker image pull: {line}"
                else:
                    cleaned.append(f"Docker image pull: {line}")
                continue
            if not cleaned or cleaned[-1] != line:
                cleaned.append(line)
        return cleaned[-18:]
    except Exception:
        return []


def iso_utc(epoch_seconds: float | None) -> str | None:
    if not isinstance(epoch_seconds, (int, float)):
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch_seconds))


def local_clock(epoch_seconds: float | None) -> str | None:
    if not isinstance(epoch_seconds, (int, float)):
        return None
    return time.strftime("%H:%M:%S", time.localtime(epoch_seconds))


def format_duration(seconds: float | None) -> str:
    if not isinstance(seconds, (int, float)) or seconds < 0:
        return ""
    total = int(round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes}m {secs}s"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def mark_pod_activity(reason: str) -> None:
    POD_ACTIVITY["last_activity_at"] = time.time()
    POD_ACTIVITY["last_reason"] = reason


def parse_pod_started_at(pod: dict[str, Any] | None) -> float | None:
    raw = (pod or {}).get("startedAt")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def pod_runtime_seconds(pod: dict[str, Any] | None) -> float | None:
    started = parse_pod_started_at(pod)
    if started is None:
        return None
    return max(0.0, time.time() - started)


def record_pod_run(pod: dict[str, Any] | None, reason: str) -> dict[str, Any] | None:
    started = parse_pod_started_at(pod)
    if started is None or not (pod or {}).get("id"):
        return None
    terminated_at = time.time()
    duration = terminated_at - started
    cost_per_hr = (pod or {}).get("cost")
    cost = None
    if isinstance(cost_per_hr, (int, float)) and cost_per_hr >= 0:
        cost = round(float(cost_per_hr) * (duration / 3600.0), 4)
    entry = {
        "pod_id": pod.get("id", ""),
        "gpu_name": ((pod.get("gpu") or {}).get("id") or "GPU"),
        "started_at": iso_utc(started),
        "terminated_at": iso_utc(terminated_at),
        "terminated_clock": local_clock(terminated_at),
        "duration_seconds": round(duration, 1),
        "duration_display": format_duration(duration),
        "cost_per_hr": cost_per_hr if isinstance(cost_per_hr, (int, float)) else None,
        "cost": cost,
        "reason": reason,
    }
    POD_RUN_HISTORY.insert(0, entry)
    del POD_RUN_HISTORY[POD_RUN_HISTORY_LIMIT:]
    save_pod_cost_history()
    return entry


def active_pod_job_count() -> int:
    now = time.time()
    stale = [
        prompt_id
        for prompt_id, job in POD_SUBMIT_JOBS.items()
        if now - float(job.get("submitted_at") or now) > POD_ACTIVE_JOB_MAX_AGE_SECONDS
    ]
    for prompt_id in stale:
        POD_SUBMIT_JOBS.pop(prompt_id, None)
    return len(POD_SUBMIT_JOBS)


def evaluate_idle_termination(
    *,
    now: float,
    last_activity: float | None,
    pod_status: str,
    pod_ready: bool,
    active_jobs: int,
    timeout_seconds: int,
) -> dict[str, Any]:
    decision: dict[str, Any] = {
        "should_terminate": False,
        "reset_activity": False,
        "reason": "",
        "idle_seconds": 0.0,
        "remaining_seconds": None,
    }
    if timeout_seconds <= 0:
        decision["reason"] = "disabled"
        return decision
    if pod_status != "RUNNING":
        decision["reason"] = "pod-not-running"
        return decision
    if active_jobs > 0:
        decision["reason"] = "job-active"
        decision["reset_activity"] = True
        return decision
    if not pod_ready:
        decision["reason"] = "booting"
        decision["reset_activity"] = True
        return decision
    if last_activity is None:
        decision["reason"] = "activity-unknown"
        decision["reset_activity"] = True
        return decision
    idle_seconds = max(0.0, now - last_activity)
    decision["idle_seconds"] = round(idle_seconds, 1)
    decision["remaining_seconds"] = round(max(0.0, timeout_seconds - idle_seconds), 1)
    if idle_seconds >= timeout_seconds:
        decision["should_terminate"] = True
        decision["reason"] = "idle-timeout"
    else:
        decision["reason"] = "active"
    return decision


def pod_idle_payload(ready: bool) -> dict[str, Any]:
    active_jobs = active_pod_job_count()
    decision = evaluate_idle_termination(
        now=time.time(),
        last_activity=POD_ACTIVITY["last_activity_at"],
        pod_status="RUNNING" if ready else "UNKNOWN",
        pod_ready=ready,
        active_jobs=active_jobs,
        timeout_seconds=POD_IDLE_TIMEOUT_SECONDS,
    )
    return {
        "enabled": POD_IDLE_TIMEOUT_SECONDS > 0,
        "timeout_seconds": POD_IDLE_TIMEOUT_SECONDS,
        "timeout_display": format_duration(POD_IDLE_TIMEOUT_SECONDS),
        "last_activity_at": iso_utc(POD_ACTIVITY["last_activity_at"]),
        "last_activity_reason": POD_ACTIVITY["last_reason"],
        "active_jobs": active_jobs,
        "idle_seconds": decision["idle_seconds"],
        "remaining_seconds": decision["remaining_seconds"],
        "auto_terminated_at": POD_ACTIVITY["auto_terminated_at"],
        "auto_terminated_pod_id": POD_ACTIVITY["auto_terminated_pod_id"],
        "watchdog_running": bool(
            _POD_WATCHDOG_TASK is not None and not _POD_WATCHDOG_TASK.done()
        ),
    }


async def fetch_remote_comfy_queue(
    session: aiohttp.ClientSession, pod_id: str
) -> tuple[int, int] | None:
    queue_url = f"https://{pod_id}-{POD_COMFY_PORT}.proxy.runpod.net/queue"
    try:
        async with session.get(
            queue_url, timeout=aiohttp.ClientTimeout(total=6)
        ) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    return (
        len(data.get("queue_running") or []),
        len(data.get("queue_pending") or []),
    )


async def check_pod_idle_once() -> dict[str, Any] | None:
    if POD_IDLE_TIMEOUT_SECONDS <= 0 or not DEFAULT_RUNPOD_API_KEY:
        return None

    timeout = aiohttp.ClientTimeout(total=25)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        pod = await find_minimax_pod(session)
        if not pod or not pod.get("id"):
            POD_ACTIVITY["last_activity_at"] = None
            return None

        pod_id = pod["id"]
        status = pod.get("status", "")
        ready = (
            await check_remote_pod_ready(session, pod_id)
            if status == "RUNNING"
            else False
        )
        queue_state = (
            await fetch_remote_comfy_queue(session, pod_id) if ready else None
        )
        queue_busy = bool(queue_state and (queue_state[0] or queue_state[1]))

        decision = evaluate_idle_termination(
            now=time.time(),
            last_activity=POD_ACTIVITY["last_activity_at"],
            pod_status=status,
            pod_ready=ready,
            active_jobs=active_pod_job_count() + (1 if queue_busy else 0),
            timeout_seconds=POD_IDLE_TIMEOUT_SECONDS,
        )

        if queue_busy:
            mark_pod_activity("comfyui-queue-busy")
            return decision
        if decision["reset_activity"]:
            mark_pod_activity("pod-booting" if not ready else "job-active")
            return decision
        if decision["should_terminate"]:
            await call_runpod_mcp(session, "delete-pod", {"id": pod_id})
            record_pod_run(pod, reason="idle-timeout")
            POD_ACTIVITY["last_activity_at"] = None
            POD_ACTIVITY["last_reason"] = "auto-terminated-idle"
            POD_ACTIVITY["auto_terminated_at"] = iso_utc(time.time())
            POD_ACTIVITY["auto_terminated_pod_id"] = pod_id
        return decision


async def pod_idle_watchdog() -> None:
    while True:
        await asyncio.sleep(POD_IDLE_CHECK_INTERVAL_SECONDS)
        try:
            await check_pod_idle_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            continue


def format_pod_status_payload(
    pod: dict[str, Any] | None,
    ready: bool,
    logs: list[str],
) -> dict[str, Any]:
    default_vol = {
        "id": MINIMAX_VOLUME_ID,
        "name": MINIMAX_VOLUME_NAME,
        "size_gb": MINIMAX_VOLUME_SIZE_GB,
        "data_center_id": MINIMAX_DATA_CENTER_ID,
        "mount_path": MINIMAX_MOUNT_PATH,
    }
    if not pod:
        return {
            "exists": False,
            "pod": None,
            "logs": [],
            "default_volume": default_vol,
            "gpu_options": MINIMAX_GPU_OPTIONS,
            "quant_profiles": QUANT_PROFILES,
            "idle": pod_idle_payload(False),
            "last_run": POD_RUN_HISTORY[0] if POD_RUN_HISTORY else None,
            "run_history": POD_RUN_HISTORY[:5],
            "total_cost": total_pod_cost(),
        }

    pod_id = pod.get("id", "")
    status = pod.get("status", "UNKNOWN")
    if status == "RUNNING" and ready:
        phase = "READY"
    elif status == "RUNNING":
        phase = "BOOTSTRAPPING"
    elif status == "EXITED":
        phase = "STOPPED"
    else:
        phase = status

    net_mounts = ((pod.get("mounts") or {}).get("network")) or []
    vol_id = net_mounts[0].get("volumeId") if net_mounts else MINIMAX_VOLUME_ID
    mount_path = net_mounts[0].get("path") if net_mounts else MINIMAX_MOUNT_PATH
    gpu_info = pod.get("gpu") or {}
    pod_env = pod.get("env") or {}
    quant_profile = pod_env.get("minimax_quant", MINIMAX_DEFAULT_QUANT)
    runtime = pod_runtime_seconds(pod)
    pod_cost = pod.get("cost")
    runtime_cost = None
    if isinstance(pod_cost, (int, float)) and runtime is not None:
        runtime_cost = round(float(pod_cost) * (runtime / 3600.0), 4)

    return {
        "exists": True,
        "pod": {
            "id": pod_id,
            "name": pod.get("name", MINIMAX_POD_NAME),
            "image": pod.get("image", MINIMAX_POD_IMAGE),
            "status": status,
            "ready": ready,
            "phase": phase,
            "cost_per_hr": pod.get("cost"),
            "gpu_name": gpu_info.get("id", "GPU"),
            "cuda_version": pod.get("cudaVersion"),
            "data_center_id": pod.get("dataCenterId", MINIMAX_DATA_CENTER_ID),
            "volume_id": vol_id,
            "mount_path": mount_path,
            "quant_profile": quant_profile,
            "actions": pod.get("actions") or [],
            "comfy_url": f"https://{pod_id}-8188.proxy.runpod.net",
            "jupyter_url": f"https://{pod_id}-8888.proxy.runpod.net",
            "started_at": pod.get("startedAt"),
            "runtime_seconds": None if runtime is None else round(runtime, 1),
            "runtime_display": format_duration(runtime),
            "runtime_cost": runtime_cost,
        },
        "logs": logs,
        "default_volume": default_vol,
        "gpu_options": MINIMAX_GPU_OPTIONS,
        "quant_profiles": QUANT_PROFILES,
        "idle": pod_idle_payload(status == "RUNNING" and ready),
        "last_run": POD_RUN_HISTORY[0] if POD_RUN_HISTORY else None,
        "run_history": POD_RUN_HISTORY[:5],
        "total_cost": total_pod_cost(),
    }


@app.get("/api/pod/status")
async def get_pod_status_endpoint() -> dict[str, Any]:
    if not DEFAULT_RUNPOD_API_KEY:
        return format_pod_status_payload(None, False, [])
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        pod = await find_minimax_pod(session)
        if not pod:
            return format_pod_status_payload(None, False, [])
        pod_id = pod.get("id", "")
        status = pod.get("status", "")
        ready = False
        logs: list[str] = []
        if status == "RUNNING" and pod_id:
            ready, logs = await asyncio.gather(
                check_remote_pod_ready(session, pod_id),
                fetch_pod_boot_logs(session, pod_id),
            )
        return format_pod_status_payload(pod, ready, logs)


@app.get("/api/pod/live-options")
async def get_pod_live_options_endpoint() -> dict[str, Any]:
    """Query the live ComfyUI pod for installed RefMod packs and LoRAs."""
    if not DEFAULT_RUNPOD_API_KEY:
        return {"refmods": ["(none)"], "loras": []}
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        pod = await find_minimax_pod(session)
        if not pod or pod.get("status") != "RUNNING" or not pod.get("id"):
            return {"refmods": ["(none)"], "loras": []}
        pod_id = pod["id"]
        base_url = f"https://{pod_id}-8188.proxy.runpod.net"
        refmods = ["(none)"]
        loras: list[str] = []
        try:
            async with session.get(
                f"{base_url}/object_info/MiniMaxH3RefModsLoader"
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    mod_spec = (
                        ((data.get("MiniMaxH3RefModsLoader") or {}).get("input") or {})
                        .get("required", {})
                        .get("mod_1")
                    )
                    if isinstance(mod_spec, list) and mod_spec and isinstance(mod_spec[0], list):
                        refmods = mod_spec[0]
        except Exception:
            pass
        try:
            async with session.get(
                f"{base_url}/object_info/LoraLoaderModelOnly"
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    lora_spec = (
                        ((data.get("LoraLoaderModelOnly") or {}).get("input") or {})
                        .get("required", {})
                        .get("lora_name")
                    )
                    if isinstance(lora_spec, list) and lora_spec and isinstance(lora_spec[0], list):
                        loras = lora_spec[0]
        except Exception:
            pass
        return {"refmods": refmods, "loras": loras}


@app.post("/api/pod/deploy")
async def deploy_pod_endpoint(request: PodDeployRequest) -> dict[str, Any]:
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        existing = await find_minimax_pod(session)
        if existing:
            status = existing.get("status", "")
            pod_id = existing.get("id", "")
            if status == "EXITED" and pod_id:
                updated = await call_runpod_mcp(
                    session,
                    "pod-action",
                    {"id": pod_id, "body": {"action": "start"}},
                )
                mark_pod_activity("pod-start")
                return format_pod_status_payload(updated or existing, False, [])
            ready = (
                await check_remote_pod_ready(session, pod_id)
                if status == "RUNNING" and pod_id
                else False
            )
            logs = (
                await fetch_pod_boot_logs(session, pod_id)
                if status == "RUNNING" and pod_id
                else []
            )
            return format_pod_status_payload(existing, ready, logs)

        volume_id = request.volume_id.strip() or MINIMAX_VOLUME_ID
        dc_id = request.data_center_id.strip() or MINIMAX_DATA_CENTER_ID
        quant = (
            request.quant_profile.strip().lower()
            if request.quant_profile.strip().lower() in QUANT_PROFILES
            else MINIMAX_DEFAULT_QUANT
        )
        gpu_id = request.gpu_id.strip() or MINIMAX_GPU_OPTIONS[0]["id"]
        known_gpu_ids = {g["id"] for g in MINIMAX_GPU_OPTIONS}
        if gpu_id not in known_gpu_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown GPU type '{gpu_id}'. Choose one of: "
                + ", ".join(sorted(known_gpu_ids)),
            )

        pod_env: dict[str, str] = {
            "download_minimax_h3": "true",
            "minimax_quant": quant,
            "download_viggle_animate": "true"
            if request.download_viggle_animate
            else "false",
            "HF_TOKEN": MINIMAX_HF_SECRET_REF,
        }
        if DEFAULT_OPENROUTER_API_KEY:
            pod_env["OPENROUTER_API_KEY"] = DEFAULT_OPENROUTER_API_KEY
            pod_env["LLM_KEY"] = DEFAULT_OPENROUTER_API_KEY

        create_body = {
            "name": MINIMAX_POD_NAME,
            "image": MINIMAX_POD_IMAGE,
            "cloud": "SECURE",
            "dataCenterIds": [dc_id],
            "disk": 80,
            "ports": ["8188/http", "8888/http"],
            "mounts": {
                "network": [
                    {
                        "volumeId": volume_id,
                        "path": MINIMAX_MOUNT_PATH,
                    }
                ]
            },
            "gpu": {
                "id": gpu_id,
                "count": 1,
                "minCudaVersion": "13.0",
            },
            "env": pod_env,
        }
        try:
            created = await call_runpod_mcp(
                session, "create-pod", {"body": create_body}
            )
        except HTTPException as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Could not deploy '{gpu_id}' in data center {dc_id}: "
                    f"{exc.detail} Pick a different GPU and try again."
                ),
            ) from exc

        if not created or not created.get("id"):
            raise HTTPException(
                status_code=503,
                detail=f"Pod deployment for '{gpu_id}' returned no pod id.",
            )

        verified = await call_runpod_mcp(session, "get-pod", {"id": created["id"]})
        mark_pod_activity("pod-deploy")
        return format_pod_status_payload(verified or created, False, [])


@app.post("/api/pod/action")
async def pod_action_endpoint(request: PodLifecycleActionRequest) -> dict[str, Any]:
    timeout = aiohttp.ClientTimeout(total=25)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        pod_id = request.pod_id.strip()
        if not pod_id:
            existing = await find_minimax_pod(session)
            if not existing or not existing.get("id"):
                raise HTTPException(
                    status_code=404, detail="No active MiniMax H3 pod found."
                )
            pod_id = existing["id"]

        if request.action == "terminate":
            pod_obj = await find_minimax_pod(session)
            await call_runpod_mcp(session, "delete-pod", {"id": pod_id})
            if (pod_obj or {}).get("status") == "RUNNING":
                record_pod_run(
                    pod_obj if (pod_obj or {}).get("id") == pod_id else None,
                    reason="terminated",
                )
            POD_ACTIVITY["last_activity_at"] = None
            POD_ACTIVITY["last_reason"] = "terminated"
            return format_pod_status_payload(None, False, [])

        pre_action_pod = None
        if request.action == "stop":
            try:
                pre_action_pod = await call_runpod_mcp(
                    session, "get-pod", {"id": pod_id}
                )
            except Exception:
                pre_action_pod = None

        updated = await call_runpod_mcp(
            session,
            "pod-action",
            {"id": pod_id, "body": {"action": request.action}},
        )
        if request.action == "stop" and (pre_action_pod or {}).get("status") == "RUNNING":
            record_pod_run(pre_action_pod, reason="stopped")
        mark_pod_activity(f"pod-{request.action}")
        refreshed = await call_runpod_mcp(session, "get-pod", {"id": pod_id})
        pod_obj = refreshed or updated
        ready = False
        logs: list[str] = []
        if pod_obj and pod_obj.get("status") == "RUNNING":
            ready = await check_remote_pod_ready(session, pod_id)
            logs = await fetch_pod_boot_logs(session, pod_id)
        return format_pod_status_payload(pod_obj, ready, logs)


@app.get("/", response_class=FileResponse)
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/workflows")
async def workflows_endpoint() -> dict[str, Any]:
    return {"workflows": get_workflows_catalog()}


@app.get("/api/config")
async def config() -> dict[str, Any]:
    workflows = get_workflows_catalog()
    return {
        "fps": FPS,
        "seconds": {
            "min": SECONDS_MIN,
            "max": SECONDS_MAX,
            "step": SECONDS_STEP,
            "default": 5.0,
        },
        "aspect_ratios": ASPECT_RATIOS,
        "quant_profiles": QUANT_PROFILES,
        "default_quant": MINIMAX_DEFAULT_QUANT,
        "default_workflow_id": DEFAULT_WORKFLOW_ID,
        "workflows": workflows,
        "has_server_auth": bool(DEFAULT_RUNPOD_API_KEY),
        "has_openrouter_key": bool(DEFAULT_OPENROUTER_API_KEY),
        "advanced_fields": get_workflow_advanced_fields(DEFAULT_WORKFLOW_ID),
    }


@app.get("/api/workflows/{workflow_id}")
async def get_workflow_detail(workflow_id: str) -> dict[str, Any]:
    for wf in get_workflows_catalog():
        if wf["id"] == workflow_id:
            return wf
    raise HTTPException(status_code=404, detail=f"Unknown workflow: {workflow_id}")


@app.post("/api/payload")
async def create_payload_endpoint(request: PayloadRequest) -> dict[str, Any]:
    try:
        result = build_payload(
            workflow_id=request.workflow_id,
            prompt=request.prompt,
            seconds=request.seconds,
            aspect_ratio=request.aspect_ratio,
            image_name=request.image_name,
            image_data_url=request.image_data_url,
            openrouter_api_key=request.openrouter_api_key or DEFAULT_OPENROUTER_API_KEY,
            references=request.references,
            refmods=request.refmods,
            studio_files=request.studio_files,
            quant_profile=request.quant_profile or MINIMAX_DEFAULT_QUANT,
            overrides=request.overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "payload": {"input": result["input"]},
        "summary": result["summary"],
    }


@app.post("/api/pod-submit")
async def submit_payload_in_pod(request: PodSubmitRequest) -> dict[str, Any]:
    workflow_input = request.payload.get("input", {})
    workflow = workflow_input.get("workflow")
    images = workflow_input.get("images")
    if not isinstance(workflow, dict):
        raise HTTPException(
            status_code=400,
            detail="Payload must include input.workflow for pod submission.",
        )

    try:
        name_map, prepared_images = prepare_pod_images(images)
        prepared_workflow = apply_input_filename_map(workflow, name_map)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if is_local_comfy_environment():
        write_input_images(COMFY_INPUT_DIR, prepared_images)
        target_node = get_pod_submit_node()
        comfy_base_url = f"http://{target_node}"
        pod_id = ""
    else:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            pod = await find_minimax_pod(session)
            if not pod or pod.get("status") != "RUNNING" or not pod.get("id"):
                raise HTTPException(
                    status_code=503,
                    detail="MiniMax H3 Pod is not running. Deploy or start the Pod in the Pod Control panel first.",
                )
            pod_id = pod["id"]
            if not await check_remote_pod_ready(session, pod_id):
                raise HTTPException(
                    status_code=503,
                    detail="MiniMax H3 Pod is still bootstrapping models and ComfyUI. Please wait until status shows Ready.",
                )
            comfy_base_url = f"https://{pod_id}-8188.proxy.runpod.net"
            if prepared_images:
                await upload_images_to_remote_comfy(
                    session, comfy_base_url, prepared_images
                )

    timeout = aiohttp.ClientTimeout(total=request.timeout_seconds)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{comfy_base_url}/prompt",
                json={"prompt": prepared_workflow},
            ) as response:
                raw_body = await response.text()
                try:
                    prompt_response = json.loads(raw_body)
                except json.JSONDecodeError:
                    prompt_response = {}
                prompt_id = prompt_response.get("prompt_id")
                if response.status >= 400 or not prompt_id:
                    detail = "ComfyUI rejected the workflow submit."
                    if isinstance(prompt_response, dict) and prompt_response:
                        err_obj = prompt_response.get("error")
                        node_errs = prompt_response.get("node_errors")
                        if isinstance(err_obj, dict) and err_obj.get("message"):
                            detail = err_obj["message"]
                            if node_errs:
                                detail += f" | node_errors: {json.dumps(node_errs)[:300]}"
                        else:
                            detail = prompt_response.get("message") or json.dumps(
                                prompt_response
                            )[:400]
                    elif raw_body.strip():
                        detail = raw_body.strip()[:400]
                    raise HTTPException(status_code=502, detail=detail)

        remember_pod_submit_job(prompt_id, pod_id=pod_id)
        return {
            "ok": True,
            "status_code": 202,
            "content_type": "application/json",
            "response_json": {
                "prompt_id": prompt_id,
                "pod_id": pod_id,
                "node_used": comfy_base_url,
                "status": "queued",
            },
            "response_text": None,
        }
    except aiohttp.ClientError as exc:
        raise HTTPException(
            status_code=502, detail=f"ComfyUI request failed: {exc}"
        ) from exc


@app.get("/api/pod-submit/{prompt_id}")
async def get_pod_submit_status(
    prompt_id: str,
    pod_id: str = "",
) -> dict[str, Any]:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", prompt_id):
        raise HTTPException(status_code=400, detail="Invalid prompt ID.")

    timeout = aiohttp.ClientTimeout(total=25)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        if is_local_comfy_environment():
            comfy_base_url = f"http://{get_pod_submit_node()}"
            target_pod_id = ""
        else:
            target_pod_id = (
                pod_id.strip()
                or (POD_SUBMIT_JOBS.get(prompt_id) or {}).get("pod_id", "")
            )
            if not target_pod_id:
                pod = await find_minimax_pod(session)
                if not pod or pod.get("status") != "RUNNING" or not pod.get("id"):
                    raise HTTPException(
                        status_code=503, detail="MiniMax H3 Pod is no longer running."
                    )
                target_pod_id = pod["id"]
            comfy_base_url = f"https://{target_pod_id}-8188.proxy.runpod.net"

        try:
            async with session.get(
                f"{comfy_base_url}/history/{prompt_id}", allow_redirects=False
            ) as resp:
                history_data = await resp.json()
        except aiohttp.ClientError as exc:
            raise HTTPException(
                status_code=502, detail=f"ComfyUI status request failed: {exc}"
            ) from exc

        history_entry = history_data.get(prompt_id)
        if history_entry is None:
            mark_pod_activity("job-poll")
            return {
                "ok": True,
                "status_code": 202,
                "content_type": "application/json",
                "response_json": {
                    "prompt_id": prompt_id,
                    "pod_id": target_pod_id,
                    "status": "running",
                },
                "response_text": None,
            }

        exec_error = extract_history_error(history_entry)
        if exec_error:
            POD_SUBMIT_JOBS.pop(prompt_id, None)
            mark_pod_activity("job-failed")
            raise HTTPException(status_code=502, detail=exec_error)

        render_time_sec = get_pod_submit_render_time(prompt_id)
        POD_SUBMIT_JOBS.pop(prompt_id, None)
        completed_at = time.time()
        mark_pod_activity("job-completed")
        output_payload = build_pod_output_payload(history_entry, pod_id=target_pod_id)

        # Eagerly cache media files locally from remote ComfyUI /view endpoint
        if target_pod_id:
            for kind in ("videos", "images", "audios"):
                for item in output_payload.get(kind) or []:
                    fname = item.get("filename")
                    if not fname:
                        continue
                    safe_name = Path(fname).name
                    cached_path = CACHED_OUTPUTS_DIR / f"{target_pod_id}_{safe_name}"
                    if not cached_path.exists():
                        view_q = urlencode(
                            {
                                "filename": fname,
                                "subfolder": item.get("subfolder", ""),
                                "type": "output",
                            }
                        )
                        try:
                            async with session.get(
                                f"{comfy_base_url}/view?{view_q}"
                            ) as mresp:
                                if mresp.status == 200:
                                    cached_path.write_bytes(await mresp.read())
                        except Exception:
                            pass

        return {
            "ok": True,
            "status_code": 200,
            "content_type": "application/json",
            "response_json": {
                "prompt_id": prompt_id,
                "pod_id": target_pod_id,
                "status": "completed",
                "metadata": {
                    "render_time_sec": render_time_sec,
                    "duration_seconds": render_time_sec,
                    "completed_at": iso_utc(completed_at),
                    "completed_clock": local_clock(completed_at),
                },
                "output": output_payload,
            },
            "response_text": None,
        }


@app.get("/api/comfy-output")
async def get_comfy_output(
    filename: str,
    subfolder: str = "",
    media_kind: str = "video",
    download: bool = False,
    pod_id: str = "",
) -> FileResponse:
    safe_name = Path(filename).name
    cached_path = CACHED_OUTPUTS_DIR / f"{pod_id or 'local'}_{safe_name}"
    media_type = guess_media_type(filename, media_kind)

    if is_local_comfy_environment():
        try:
            output_path = build_output_path(
                COMFY_OUTPUT_DIR,
                {
                    "filename": filename,
                    "subfolder": subfolder,
                    "media_kind": media_kind,
                },
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if output_path.exists():
            return FileResponse(
                output_path,
                media_type=media_type,
                filename=safe_name if download else None,
            )

    if cached_path.exists():
        return FileResponse(
            cached_path,
            media_type=media_type,
            filename=safe_name if download else None,
        )

    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        target_pod_id = pod_id.strip()
        if not target_pod_id:
            pod = await find_minimax_pod(session)
            if pod and pod.get("id"):
                target_pod_id = pod["id"]
        if not target_pod_id:
            raise HTTPException(
                status_code=404, detail="Generated output file not found."
            )

        view_query = urlencode(
            {
                "filename": filename,
                "subfolder": subfolder,
                "type": "output",
            }
        )
        remote_url = f"https://{target_pod_id}-8188.proxy.runpod.net/view?{view_query}"
        async with session.get(remote_url) as resp:
            if resp.status >= 400:
                raise HTTPException(
                    status_code=resp.status,
                    detail="Failed to fetch generated output from remote Pod.",
                )
            data = await resp.read()
            cached_path = CACHED_OUTPUTS_DIR / f"{target_pod_id}_{safe_name}"
            cached_path.write_bytes(data)
            return FileResponse(
                cached_path,
                media_type=media_type,
                filename=safe_name if download else None,
            )
