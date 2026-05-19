import os

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Agentic AI Data Visualization API"
    api_prefix: str = "/api"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    database_url: str = "sqlite:///./agentic_viz.db"
    raw_data_dir: str = "./data/raw"
    curated_data_dir: str = "./data/curated"
    allow_origins: list[str] = ["http://localhost:5173"]
    llm_provider: str = os.getenv("LLM_PROVIDER", "none")
    llm_model: str = os.getenv("LLM_MODEL", "gemini-1.5-flash")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.2"))
    google_api_key: str | None = os.getenv("GOOGLE_API_KEY")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


settings = Settings()
