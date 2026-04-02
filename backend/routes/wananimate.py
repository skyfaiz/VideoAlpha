import os
import tempfile
import shutil
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional

from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse

from config import settings
from clients import WanAnimateS3Client

router = APIRouter()
executor = ThreadPoolExecutor(max_workers=4)

# In-memory job store
jobs: Dict[str, dict] = {}


def get_client() -> WanAnimateS3Client:
    return WanAnimateS3Client(
        runpod_endpoint_id=settings.WANANIMATE_ENDPOINT_ID,
        runpod_api_key=settings.RUNPOD_API_KEY,
        s3_endpoint_url=settings.S3_ENDPOINT_URL,
        s3_access_key_id=settings.S3_ACCESS_KEY_ID,
        s3_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        s3_bucket_name=settings.S3_BUCKET_NAME,
        s3_region=settings.S3_REGION
    )


async def handle_upload(file: UploadFile, tmpdir: str) -> str:
    path = os.path.join(tmpdir, file.filename)
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)
    return path


def run_wananimate_job(
    job_id: str,
    image_path: str,
    video_path: Optional[str],
    prompt: str,
    negative_prompt: Optional[str],
    seed: int,
    width: int,
    height: int,
    fps: int,
    cfg: float,
    steps: int,
    tmpdir: str
):
    try:
        jobs[job_id]["status"] = "IN_PROGRESS"
        client = get_client()
        
        result = client.create_animation_from_files(
            image_path=image_path,
            video_path=video_path,
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed,
            width=width,
            height=height,
            fps=fps,
            cfg=cfg,
            steps=steps
        )
        
        if result.get("status") == "COMPLETED":
            out_path = f"outputs/{job_id}.mp4"
            os.makedirs("outputs", exist_ok=True)
            
            if client.save_video_result(result, out_path):
                jobs[job_id] = {
                    "status": "COMPLETED",
                    "output_path": out_path,
                    "error": None
                }
            else:
                jobs[job_id] = {
                    "status": "FAILED",
                    "output_path": None,
                    "error": "Failed to save video result"
                }
        else:
            jobs[job_id] = {
                "status": "FAILED",
                "output_path": None,
                "error": result.get("error", "Unknown error")
            }
    except Exception as e:
        jobs[job_id] = {
            "status": "FAILED",
            "output_path": None,
            "error": str(e)
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.post("/submit")
async def submit(
    image: UploadFile = File(...),
    video: UploadFile = File(None),
    prompt: str = Form(...),
    negative_prompt: str = Form("blurry, low quality, distorted"),
    seed: int = Form(12345),
    width: int = Form(832),
    height: int = Form(480),
    fps: int = Form(16),
    cfg: float = Form(1.0),
    steps: int = Form(6)
):
    # Validate file sizes (max 200MB each)
    MAX_SIZE = 200 * 1024 * 1024
    
    image_content = await image.read()
    if len(image_content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Image file too large (max 200MB)")
    await image.seek(0)
    
    if video:
        video_content = await video.read()
        if len(video_content) > MAX_SIZE:
            raise HTTPException(status_code=413, detail="Video file too large (max 200MB)")
        await video.seek(0)
    
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "IN_QUEUE", "output_path": None, "error": None}
    
    tmpdir = tempfile.mkdtemp()
    image_path = await handle_upload(image, tmpdir)
    video_path = None
    if video:
        video_path = await handle_upload(video, tmpdir)
    
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        executor,
        run_wananimate_job,
        job_id,
        image_path,
        video_path,
        prompt,
        negative_prompt if negative_prompt else None,
        seed,
        width,
        height,
        fps,
        cfg,
        steps,
        tmpdir
    )
    
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {
        "status": job["status"],
        "error": job.get("error")
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
    filename = custom_name if custom_name else f"wananimate_{job_id}.mp4"
    if not filename.endswith('.mp4'):
        filename += '.mp4'
    
    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=filename
    )
