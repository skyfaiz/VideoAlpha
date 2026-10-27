from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import infinitetalk, wananimate

app = FastAPI(
    title="RunPod Video GUI",
    description="GUI for Infinitetalk and WanAnimate video generation services",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(infinitetalk.router, prefix="/api/infinitetalk", tags=["Infinitetalk"])
app.include_router(wananimate.router, prefix="/api/wananimate", tags=["WanAnimate"])


@app.get("/")
async def root():
    return {
        "message": "RunPod Video GUI API",
        "docs": "/docs",
        "endpoints": {
            "infinitetalk": "/api/infinitetalk",
            "wananimate": "/api/wananimate"
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
