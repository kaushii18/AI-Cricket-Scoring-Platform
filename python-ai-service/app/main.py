"""Independent FastAPI application for CricPulse AI features."""

from contextlib import asynccontextmanager
import logging
from typing import AsyncIterator

from fastapi import FastAPI
from openai import AsyncOpenAI

from app.api.routes.analytics import router as analytics_router
from app.api.routes.insights import router as insights_router
from app.api.routes.predictions import router as predictions_router
from app.core.config import OPENAI_API_KEY, OPENAI_TIMEOUT_SECONDS
from app.services.win_prediction import load_model

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.win_model = load_model()
    app.state.openai_client = (
        AsyncOpenAI(
            api_key=OPENAI_API_KEY,
            timeout=OPENAI_TIMEOUT_SECONDS,
            max_retries=0,
        )
        if OPENAI_API_KEY
        else None
    )
    app.state.insights_cache = {}
    if app.state.win_model is None:
        logger.warning(
            "Win prediction model is unavailable. Train it from completed CricPulse "
            "history with `python -m app.train_model`."
        )
    if app.state.openai_client is None:
        logger.warning("LLM insights are disabled because OPENAI_API_KEY is not configured.")
    try:
        yield
    finally:
        if app.state.openai_client is not None:
            await app.state.openai_client.close()


app = FastAPI(
    title="CricPulse AI Service",
    version="1.0.0",
    lifespan=lifespan,
)
app.include_router(analytics_router)
app.include_router(insights_router)
app.include_router(predictions_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cricpulse-ai"}