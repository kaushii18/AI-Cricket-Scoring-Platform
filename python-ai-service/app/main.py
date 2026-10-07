"""Independent FastAPI application for future CricPulse AI features."""

from fastapi import FastAPI

from app.api.routes.analytics import router as analytics_router

app = FastAPI(title="CricPulse AI Service", version="1.0.0")
app.include_router(analytics_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cricpulse-ai"}