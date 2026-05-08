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


settings = Settings()
