"""Deterministic analytics endpoints for CricPulse match state."""

from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.cricket_analytics import calculate_match_analytics

router = APIRouter(tags=["analytics"])


@router.post("/analyze/match")
async def analyze_match(match: dict[str, Any]) -> dict[str, Any]:
    try:
        return calculate_match_analytics(match)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error