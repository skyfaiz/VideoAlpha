import os
import json
import time
import base64
import tempfile
import shutil
import uuid
import asyncio
import re
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional

from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse

from config import settings
from clients import InfinitetalkS3Client

router = APIRouter()
executor = ThreadPoolExecutor(max_workers=4)

JOBS_FILE = "outputs/jobs_history.json"


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


# Persistent job store (only real submitted jobs)
jobs: Dict[str, dict] = _load_jobs()

DATA_URI_RE = re.compile(r"^data:[^;]+;base64,", re.IGNORECASE)


def get_client() -> InfinitetalkS3Client:
    return InfinitetalkS3Client(
        runpod_endpoint_id=settings.INFINITETALK_ENDPOINT_ID,
        runpod_api_key=settings.RUNPOD_API_KEY,
        s3_endpoint_url=settings.S3_ENDPOINT_URL,
        s3_access_key_id=settings.S3_ACCESS_KEY_ID,
        s3_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        s3_bucket_name=settings.S3_BUCKET_NAME,
        s3_region=settings.S3_REGION
    )


def strip_data_uri(b64_string: str) -> str:
    """Strip a `data:<mime>;base64,` prefix if present, since the worker expects raw base64."""
    return DATA_URI_RE.sub("", b64_string)


async def save_upload(file: UploadFile, tmpdir: str) -> str:
    path = os.path.join(tmpdir, file.filename)
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)
    return path


async def resolve_input(
    field_prefix: str,
    mode: str,
    upload_file: Optional[UploadFile],
    url_value: Optional[str],
    path_value: Optional[str],
    base64_value: Optional[str],
    tmpdir: str,
    s3_prefix: str,
    client: InfinitetalkS3Client
) -> Optional[Dict[str, str]]:
    """
    Resolve a single media/audio input into a `{key: value}` dict ready to merge
    into the RunPod job input, based on the selected input mode.

    mode: "upload_s3" | "upload_base64" | "url" | "path" | "base64" | "none"
    """
    if mode == "url" and url_value:
        return {f"{field_prefix}_url": url_value}

    if mode == "path" and path_value:
        return {f"{field_prefix}_path": path_value}

    if mode == "base64" and base64_value:
        return {f"{field_prefix}_base64": strip_data_uri(base64_value)}

    if mode == "upload_base64" and upload_file:
        content = await upload_file.read()
        encoded = base64.b64encode(content).decode("utf-8")
        return {f"{field_prefix}_base64": encoded}

    if mode == "upload_s3" and upload_file:
        local_path = await save_upload(upload_file, tmpdir)
        timestamp = int(time.time())
        s3_key = f"input/infinitetalk/{timestamp}_{os.path.basename(local_path)}"
        s3_path = client.upload_to_s3(local_path, s3_key)
        if not s3_path:
            raise HTTPException(status_code=502, detail=f"Failed to upload {field_prefix} to S3")
        return {f"{field_prefix}_path": s3_path}

    return None


def _format_size(num_bytes: int) -> str:
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.0f} KB"
    return f"{num_bytes / (1024 * 1024):.1f} MB"


def run_infinitetalk_job(job_id: str, input_data: Dict):
    try:
        if job_id in jobs:
            jobs[job_id]["status"] = "IN_PROGRESS"
            _save_jobs()
        client = get_client()

        rp_job_id = client.submit_job(input_data)
        if not rp_job_id:
            if job_id in jobs:
                jobs[job_id].update({
                    "status": "FAILED",
                    "output_path": None,
                    "error": "Job submission failed",
                    "completed_at": datetime.now(timezone.utc).isoformat()
                })
                _save_jobs()
            return

        if job_id in jobs:
            jobs[job_id]["runpod_job_id"] = rp_job_id
            _save_jobs()

        result = client.wait_for_completion(rp_job_id)

        if result.get("status") == "COMPLETED":
            out_path = f"outputs/{job_id}.mp4"
            os.makedirs("outputs", exist_ok=True)

            if client.save_video_result(result, out_path):
                size_str = _format_size(os.path.getsize(out_path)) if os.path.exists(out_path) else None
                if job_id in jobs:
                    jobs[job_id].update({
                        "status": "COMPLETED",
                        "output_path": out_path,
                        "size": size_str,
                        "error": None,
                        "completed_at": datetime.now(timezone.utc).isoformat()
                    })
                    _save_jobs()
            else:
                if job_id in jobs:
                    jobs[job_id].update({
                        "status": "FAILED",
                        "output_path": None,
                        "error": "Failed to save video result",
                        "completed_at": datetime.now(timezone.utc).isoformat()
                    })
                    _save_jobs()
        else:
            if job_id in jobs:
                jobs[job_id].update({
                    "status": "FAILED",
                    "output_path": None,
                    "error": result.get("error", "Unknown error"),
                    "completed_at": datetime.now(timezone.utc).isoformat()
                })
                _save_jobs()
    except Exception as e:
        if job_id in jobs:
            jobs[job_id].update({
                "status": "FAILED",
                "output_path": None,
                "error": str(e),
                "completed_at": datetime.now(timezone.utc).isoformat()
            })
            _save_jobs()


@router.post("/submit")
async def submit(
    input_type: str = Form("image"),
    person_count: str = Form("single"),

    # Media input (image for I2V, video for V2V)
    media_input_mode: str = Form("upload_s3"),  # upload_s3 | upload_base64 | url | path | base64
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    video_url: Optional[str] = Form(None),
    image_path: Optional[str] = Form(None),
    video_path: Optional[str] = Form(None),
    image_base64: Optional[str] = Form(None),
    video_base64: Optional[str] = Form(None),

    # Audio input (person 1)
    audio_input_mode: str = Form("upload_s3"),
    audio: Optional[UploadFile] = File(None),
    wav_url: Optional[str] = Form(None),
    wav_path: Optional[str] = Form(None),
    wav_base64: Optional[str] = Form(None),

    # Second audio input (person 2, multi-person only)
    audio_2_input_mode: str = Form("none"),  # same options + "none" (reuse audio 1 on worker)
    audio_2: Optional[UploadFile] = File(None),
    wav_url_2: Optional[str] = Form(None),
    wav_path_2: Optional[str] = Form(None),
    wav_base64_2: Optional[str] = Form(None),

    prompt: str = Form("A person talking naturally"),
    width: int = Form(544),
    height: int = Form(960),
    max_frame: Optional[int] = Form(None),
    force_offload: bool = Form(True),
    use_network_volume: bool = Form(False)
):
    if input_type not in ("image", "video"):
        raise HTTPException(status_code=400, detail="input_type must be 'image' or 'video'")
    if person_count not in ("single", "multi"):
        raise HTTPException(status_code=400, detail="person_count must be 'single' or 'multi'")

    media_field = "image" if input_type == "image" else "video"
    media_upload = image if input_type == "image" else video
    media_url = image_url if input_type == "image" else video_url
    media_path = image_path if input_type == "image" else video_path
    media_base64 = image_base64 if input_type == "image" else video_base64

    if media_input_mode in ("upload_s3", "upload_base64") and not media_upload:
        raise HTTPException(status_code=400, detail=f"{media_field} file required for upload mode")
    if media_input_mode == "url" and not media_url:
        raise HTTPException(status_code=400, detail=f"{media_field}_url required for url mode")
    if media_input_mode == "path" and not media_path:
        raise HTTPException(status_code=400, detail=f"{media_field}_path required for path mode")
    if media_input_mode == "base64" and not media_base64:
        raise HTTPException(status_code=400, detail=f"{media_field}_base64 required for base64 mode")

    if audio_input_mode in ("upload_s3", "upload_base64") and not audio:
        raise HTTPException(status_code=400, detail="Audio file required for upload mode")
    if audio_input_mode == "url" and not wav_url:
        raise HTTPException(status_code=400, detail="wav_url required for url mode")
    if audio_input_mode == "path" and not wav_path:
        raise HTTPException(status_code=400, detail="wav_path required for path mode")
    if audio_input_mode == "base64" and not wav_base64:
        raise HTTPException(status_code=400, detail="wav_base64 required for base64 mode")

    if person_count == "multi" and audio_2_input_mode in ("upload_s3", "upload_base64") and not audio_2:
        raise HTTPException(status_code=400, detail="Second audio file required for multi-person upload mode")

    # Validate file sizes (max 200MB each)
    MAX_SIZE = 200 * 1024 * 1024
    for f in (media_upload, audio, audio_2):
        if f:
            content = await f.read()
            if len(content) > MAX_SIZE:
                raise HTTPException(status_code=413, detail=f"{f.filename} too large (max 200MB)")
            await f.seek(0)

    wf_prefix = "I2V" if input_type == "image" else "V2V"
    wf_suffix = "Single" if person_count == "single" else "Multi"
    workflow_label = f"{wf_prefix} {wf_suffix}"

    if media_upload and media_upload.filename:
        media_name = media_upload.filename
    elif media_url:
        media_name = media_url.rstrip("/").split("/")[-1] or media_url
    elif media_path:
        media_name = os.path.basename(media_path) or media_path
    else:
        media_name = f"{media_field}_base64"

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "IN_QUEUE",
        "workflow_type": workflow_label,
        "input_type": input_type,
        "person_count": person_count,
        "name": media_name,
        "prompt": prompt,
        "resolution": f"{width}×{height}",
        "media_mode": media_input_mode,
        "audio_mode": audio_input_mode,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "size": None,
        "output_path": None,
        "error": None
    }
    _save_jobs()

    tmpdir = tempfile.mkdtemp()
    client = get_client()

    try:
        input_data: Dict = {
            "input_type": input_type,
            "person_count": person_count,
            "prompt": prompt,
            "width": width,
            "height": height,
            "force_offload": force_offload
        }
        if max_frame:
            input_data["max_frame"] = max_frame
        if use_network_volume:
            input_data["network_volume"] = True

        media_result = await resolve_input(
            media_field, media_input_mode, media_upload, media_url, media_path, media_base64,
            tmpdir, "input/infinitetalk", client
        )
        if not media_result:
            raise HTTPException(status_code=400, detail=f"Could not resolve {media_field} input")
        input_data.update(media_result)

        audio_result = await resolve_input(
            "wav", audio_input_mode, audio, wav_url, wav_path, wav_base64,
            tmpdir, "input/infinitetalk", client
        )
        if not audio_result:
            raise HTTPException(status_code=400, detail="Could not resolve audio input")
        input_data.update(audio_result)

        if person_count == "multi" and audio_2_input_mode != "none":
            audio_2_result = await resolve_input(
                "wav_2", audio_2_input_mode, audio_2, wav_url_2, wav_path_2, wav_base64_2,
                tmpdir, "input/infinitetalk", client
            )
            if audio_2_result:
                remapped = {}
                for k, v in audio_2_result.items():
                    suffix = k.split("wav_2", 1)[1]
                    remapped[f"wav{suffix}_2"] = v
                input_data.update(remapped)
    except HTTPException:
        jobs.pop(job_id, None)
        _save_jobs()
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
    except Exception as e:
        jobs.pop(job_id, None)
        _save_jobs()
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

    loop = asyncio.get_event_loop()

    def _run_and_cleanup():
        try:
            run_infinitetalk_job(job_id, input_data)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    loop.run_in_executor(executor, _run_and_cleanup)

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

    return {
        "job_id": job_id,
        **job
    }


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

    # Use custom name if provided, otherwise default
    filename = custom_name if custom_name else f"infinitetalk_{job_id}.mp4"
    if not filename.endswith('.mp4'):
        filename += '.mp4'

    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=filename
    )
