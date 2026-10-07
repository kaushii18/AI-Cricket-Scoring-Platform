"""On-demand LLM match insights; no scoring or Socket.IO hooks."""

import hashlib
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.core.config import INSIGHTS_CACHE_TTL_SECONDS
from app.services.llm_insights import build_match_context, generate_match_insights

logger = logging.getLogger(__name__)
router = APIRouter(tags=["insights"])


@router.post("/ai/insights")
async def ai_insights(match: dict[str, Any], request: Request) -> dict[str, Any]:
    try:
        context = build_match_context(match)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    client = getattr(request.app.state, "openai_client", None)
    if client is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM insights are not configured. Add OPENAI_API_KEY to "
                "python-ai-service/.env and restart the service."
            ),
        )

    cache_key = hashlib.sha256(
        json.dumps(context, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    cache = request.app.state.insights_cache
    now = time.monotonic()
    for key, (created_at, _) in list(cache.items()):
        if now - created_at >= INSIGHTS_CACHE_TTL_SECONDS:
            del cache[key]

    cached = cache.get(cache_key)
    if cached is not None:
        return dict(cached[1])

    try:
        result = await generate_match_insights(client, context)
    except Exception as error:
        logger.warning("LLM insights request failed (%s)", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="The LLM provider did not return valid grounded insights.",
        ) from error

    if INSIGHTS_CACHE_TTL_SECONDS > 0:
        if len(cache) >= 256:
            cache.clear()
        cache[cache_key] = (now, result)
    return result