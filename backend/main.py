from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from routes import infinitetalk, wananimate
from minimax_studio.frontend_app import app as minimax_app
from polly_studio.frontend_app import app as polly_app

app = FastAPI(
    title="RunPod Video GUI",
    description="GUI for Infinitetalk, WanAnimate, LTX 2.5, MiniMax H3, and Amazon Polly voice generation services",
    version="1.2.0"
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


@app.get("/minimax-app")
async def redirect_minimax_app():
    return RedirectResponse(url="/minimax-app/")


app.mount("/minimax-app", minimax_app)
app.mount("/api/minimax", minimax_app)


@app.get("/polly-app")
async def redirect_polly_app():
    return RedirectResponse(url="/polly-app/")


app.mount("/polly-app", polly_app)
app.mount("/api/polly", polly_app)


@app.get("/")
async def root():
    return {
        "message": "RunPod Video GUI API",
        "docs": "/docs",
        "endpoints": {
            "infinitetalk": "/api/infinitetalk",
            "wananimate": "/api/wananimate",
            "minimax": "/minimax-app/",
            "polly": "/polly-app/",
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
