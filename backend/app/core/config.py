import os
from pathlib import Path

from dotenv import load_dotenv

from pydantic import BaseModel


backend_root = Path(__file__).resolve().parents[2]
load_dotenv(backend_root / ".env")


class Settings(BaseModel):
    app_name: str = "Agentic AI Data Visualization API"
    api_prefix: str = "/api"
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./agentic_viz.db")
    raw_data_dir: str = os.getenv("RAW_DATA_DIR", "./data/raw")
    curated_data_dir: str = os.getenv("CURATED_DATA_DIR", "./data/curated")
    allow_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("ALLOW_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]
    llm_provider: str = os.getenv("LLM_PROVIDER", "none")
    llm_model: str = os.getenv("LLM_MODEL", "gemini-1.5-flash")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.2"))
    google_api_key: str | None = os.getenv("GOOGLE_API_KEY")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


settings = Settings()
