import os
import json
import time
import shutil
import tempfile
import uuid
import asyncio
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional, List

import boto3
from botocore.client import Config
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse

from config import settings
from clients import RunningHubClient, RunningHubError

router = APIRouter()
executor = ThreadPoolExecutor(max_workers=4)

JOBS_FILE = "outputs/characterswap_jobs.json"

# RunningHub binary upload limit is 30MB; larger files go through a
# presigned S3 URL which the loading node downloads directly.
RH_UPLOAD_LIMIT = 28 * 1024 * 1024


def _load_jobs() -> Dict[str, dict]:
    try:
        if os.path.exists(JOBS_FILE):
            with open(JOBS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_jobs():
    try:
        os.makedirs(os.path.dirname(JOBS_FILE), exist_ok=True)
        with open(JOBS_FILE, "w", encoding="utf-8") as f:
            json.dump(jobs, f, indent=2)
    except Exception:
        pass


jobs: Dict[str, dict] = _load_jobs()


def get_client() -> RunningHubClient:
    if not settings.RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=503, detail="RUNNINGHUB_API_KEY is not configured in .env")
    return RunningHubClient(
        api_key=settings.RUNNINGHUB_API_KEY,
        app_id=settings.RUNNINGHUB_CHARSWAP_APP_ID,
        base_url=settings.RUNNINGHUB_BASE_URL,
    )


async def save_upload(file: UploadFile, tmpdir: str) -> str:
    path = os.path.join(tmpdir, file.filename)
    with open(path, "wb") as f:
        f.write(await file.read())
    return path


def _s3_presigned_url(local_path: str) -> Optional[str]:
    """Upload to S3 and return a presigned GET URL (24h) for large files."""
    if not (settings.S3_ENDPOINT_URL and settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY):
        return None
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
        key = f"input/characterswap/{int(time.time())}_{os.path.basename(local_path)}"
        s3.upload_file(local_path, settings.S3_BUCKET_NAME, key)
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
            ExpiresIn=86400,
        )
    except Exception:
        return None


def _pick_node(
    nodes: List[dict],
    field_type: str,
    node_id: Optional[str],
    field_name: Optional[str],
) -> Optional[dict]:
    """Find the app node matching an explicit nodeId/fieldName, else the first of a fieldType."""
    if node_id:
        for n in nodes:
            if n.get("nodeId") == str(node_id) and (not field_name or n.get("fieldName") == field_name):
                return n
        return None
    for n in nodes:
        if str(n.get("fieldType", "")).upper() == field_type:
            return n
    return None


def _resolve_media_value(client: RunningHubClient, local_path: str) -> Optional[str]:
    """Upload to RunningHub, or fall back to a presigned S3 URL for big files."""
    if os.path.getsize(local_path) <= RH_UPLOAD_LIMIT:
        file_name = client.upload_file(local_path)
        if file_name:
            return file_name
    url = _s3_presigned_url(local_path)
    return url


def run_characterswap_job(job_id: str, params: dict, tmpdir: str):
    try:
        jobs[job_id]["status"] = "IN_PROGRESS"
        _save_jobs()
        client = get_client()

        node_info_list: List[dict] = []

        if params["image_node"]:
            node_info_list.append({
                "nodeId": params["image_node"]["nodeId"],
                "fieldName": params["image_node"]["fieldName"],
                "fieldValue": params["image_value"],
            })
        if params["video_node"]:
            node_info_list.append({
                "nodeId": params["video_node"]["nodeId"],
                "fieldName": params["video_node"]["fieldName"],
                "fieldValue": params["video_value"],
            })
        node_info_list.extend(params.get("overrides") or [])

        task_id = client.run_app(
            node_info_list,
            instance_type=params.get("instance_type") or None,
        )
        if not task_id:
            raise RunningHubError("Task submission failed")

        jobs[job_id]["runninghub_task_id"] = task_id
        _save_jobs()

        result = client.wait_for_completion(task_id)
        if result.get("status") != "COMPLETED":
            raise RunningHubError(result.get("error") or f"Task ended with status {result.get('status')}")

        outputs = client.extract_result_urls(result.get("data") or {})
        if not outputs:
            raise RunningHubError("Task succeeded but returned no output files")

        # Prefer a video output; fall back to the first result whatever its type.
        video_out = next((o for o in outputs if o.get("outputType") in ("mp4", "mov", "webm", "avi", "mkv")), outputs[0])
        ext = video_out.get("outputType") or "mp4"
        out_path = f"outputs/{job_id}.{ext}"
        os.makedirs("outputs", exist_ok=True)

        if not client.download_file(video_out["url"], out_path):
            raise RunningHubError("Failed to download result file")

        size_mb = os.path.getsize(out_path) / (1024 * 1024)
        jobs[job_id].update({
            "status": "COMPLETED",
            "output_path": out_path,
            "size": f"{size_mb:.1f} MB",
            "result_url": video_out["url"],
            "error": None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        _save_jobs()
    except Exception as e:
        if job_id in jobs:
            jobs[job_id].update({
                "status": "FAILED",
                "output_path": None,
                "error": str(e),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            _save_jobs()
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.get("/nodes")
async def get_nodes():
    """Return the RunningHub app's editable node list (nodeInfoList)."""
    client = get_client()
    try:
        nodes = client.get_app_nodes()
    except RunningHubError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch app nodes: {e}")
    return {
        "app_id": settings.RUNNINGHUB_CHARSWAP_APP_ID,
        "nodes": nodes,
    }


@router.post("/submit")
async def submit(
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    video_url: Optional[str] = Form(None),
    instance_type: str = Form("default"),
    image_node_id: Optional[str] = Form(None),
    image_field_name: Optional[str] = Form(None),
    video_node_id: Optional[str] = Form(None),
    video_field_name: Optional[str] = Form(None),
    node_overrides: Optional[str] = Form(None),  # JSON [{nodeId, fieldName, fieldValue}]
):
    if not image and not image_url:
        raise HTTPException(status_code=400, detail="Character image is required (upload or image_url)")
    if not video and not video_url:
        raise HTTPException(status_code=400, detail="Source video is required (upload or video_url)")
    if instance_type not in ("default", "plus", "ultra", ""):
        raise HTTPException(status_code=400, detail="instance_type must be default, plus or ultra")

    overrides: List[dict] = []
    if node_overrides:
        try:
            parsed = json.loads(node_overrides)
            if isinstance(parsed, list):
                overrides = [
                    {
                        "nodeId": str(o["nodeId"]),
                        "fieldName": o["fieldName"],
                        "fieldValue": o["fieldValue"],
                    }
                    for o in parsed
                    if isinstance(o, dict) and o.get("nodeId") and o.get("fieldName")
                ]
        except (json.JSONDecodeError, KeyError):
            raise HTTPException(status_code=400, detail="node_overrides must be a JSON array of {nodeId, fieldName, fieldValue}")

    MAX_SIZE = 1024 * 1024 * 1024  # 1GB guard for local upload before S3 handoff
    for f in (image, video):
        if f:
            content = await f.read()
            if len(content) > MAX_SIZE:
                raise HTTPException(status_code=413, detail=f"{f.filename} too large (max 1GB)")
            await f.seek(0)

    client = get_client()
    tmpdir = tempfile.mkdtemp()

    try:
        # Resolve local uploads into RunningHub fileName / public URL values.
        if image:
            image_path = await save_upload(image, tmpdir)
            image_value = _resolve_media_value(client, image_path)
            if not image_value:
                raise HTTPException(status_code=502, detail="Image upload to RunningHub failed (use image_url for large files)")
        else:
            image_value = image_url

        if video:
            video_path = await save_upload(video, tmpdir)
            video_value = _resolve_media_value(client, video_path)
            if not video_value:
                raise HTTPException(status_code=502, detail="Video upload to RunningHub failed (use video_url for large files)")
        else:
            video_value = video_url

        # Map inputs onto the app's editable nodes.
        try:
            nodes = client.get_app_nodes()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch app node list: {e}")

        image_node = _pick_node(nodes, "IMAGE", image_node_id, image_field_name)
        video_node = _pick_node(nodes, "VIDEO", video_node_id, video_field_name)
        if not image_node:
            raise HTTPException(
                status_code=400,
                detail="No IMAGE node found on this app; pass image_node_id/image_field_name explicitly",
            )
        if not video_node:
            raise HTTPException(
                status_code=400,
                detail="No VIDEO node found on this app; pass video_node_id/video_field_name explicitly",
            )
    except HTTPException:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "IN_QUEUE",
        "workflow_type": "Character Swap (RunningHub)",
        "name": (image.filename if image else image_url) or "character",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "size": None,
        "output_path": None,
        "error": None,
    }
    _save_jobs()

    params = {
        "image_node": image_node,
        "video_node": video_node,
        "image_value": image_value,
        "video_value": video_value,
        "overrides": overrides,
        "instance_type": instance_type or None,
    }

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, run_characterswap_job, job_id, params, tmpdir)

    return {"job_id": job_id}


@router.get("/jobs")
async def list_jobs():
    items = [{"job_id": jid, **job} for jid, job in jobs.items()]
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return items


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    job = jobs.pop(job_id, None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _save_jobs()
    return {"deleted": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, **job}


@router.get("/download/{job_id}")
async def download(job_id: str, custom_name: str = None):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "COMPLETED":
        raise HTTPException(status_code=400, detail="Job not completed")

    output_path = job.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    filename = custom_name if custom_name else f"characterswap_{job_id}"
    if "." not in os.path.basename(filename):
        filename += os.path.splitext(output_path)[1] or ".mp4"

    return FileResponse(output_path, filename=filename)
