"""Independent FastAPI application for future CricPulse AI features."""

from fastapi import FastAPI

app = FastAPI(title="CricPulse AI Service", version="1.0.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "cricpulse-ai"}