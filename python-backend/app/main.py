"""FastAPI entry point for CricPulse's Python services."""

from contextlib import asynccontextmanager
import logging
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import health, matches, teams
from app.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(
    title=settings.app_name,
    description="Versioned Python API and analytics facade for CricPulse.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or [],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(matches.router, prefix=settings.api_prefix)
app.include_router(teams.router, prefix=settings.api_prefix)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, error: Exception) -> JSONResponse:
    logger.exception("Unhandled Python API error", exc_info=error)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred."},
    )