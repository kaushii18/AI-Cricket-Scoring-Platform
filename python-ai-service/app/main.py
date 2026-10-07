"""Independent FastAPI application for CricPulse AI features."""

from contextlib import asynccontextmanager
import logging
from typing import AsyncIterator

from fastapi import FastAPI

from app.api.routes.analytics import router as analytics_router
from app.api.routes.predictions import router as predictions_router
from app.services.win_prediction import load_model

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.win_model = load_model()
    if app.state.win_model is None:
        logger.warning(
            "Win prediction model is unavailable. Train it from completed CricPulse "
            "history with `python -m app.train_model`."
        )
    yield


app = FastAPI(
    title="CricPulse AI Service",
    version="1.0.0",
    lifespan=lifespan,
)
app.include_router(analytics_router)
app.include_router(predictions_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cricpulse-ai"}