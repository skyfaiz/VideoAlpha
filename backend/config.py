from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # RunPod
    INFINITETALK_ENDPOINT_ID: str
    WANANIMATE_ENDPOINT_ID: str
    RUNPOD_API_KEY: str
    RUNPOD_MCP_URL: str = "https://mcp.runpod.io/"
    OPENROUTER_API_KEY: str = ""

    # S3
    S3_ENDPOINT_URL: str
    S3_ACCESS_KEY_ID: str
    S3_SECRET_ACCESS_KEY: str
    S3_BUCKET_NAME: str
    S3_REGION: str = "eu-ro-1"

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
