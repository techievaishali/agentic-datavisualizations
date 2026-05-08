from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db import Base, engine
from app.routers import auth, dashboard, datasets, health, reports, widgets


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        Path(settings.raw_data_dir).mkdir(parents=True, exist_ok=True)
        Path(settings.curated_data_dir).mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=engine)
        yield

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(datasets.router, prefix=settings.api_prefix)
    app.include_router(reports.router, prefix=settings.api_prefix)
    app.include_router(widgets.router, prefix=settings.api_prefix)
    app.include_router(dashboard.router, prefix=settings.api_prefix)

    return app


app = create_app()
