"""Advanced match, player, summary, and tournament analytics."""

import hashlib
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.core.config import INSIGHTS_CACHE_TTL_SECONDS
from app.services.advanced_analytics import (
    analyze_momentum,
    analyze_players,
    analyze_tournament,
    build_match_scorecard,
)
from app.services.llm_insights import (
    generate_match_narrative,
    generate_player_analysis,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["advanced analytics"])


def _client(request: Request) -> Any | None:
    return getattr(request.app.state, "openai_client", None)


async def _cached_llm(
    request: Request,
    context: dict[str, Any],
    generator,
) -> dict[str, Any] | None:
    client = _client(request)
    if client is None:
        return None

    cache_key = hashlib.sha256(
        json.dumps(context, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    cache = request.app.state.insights_cache
    now = time.monotonic()
    for key, (created_at, _) in list(cache.items()):
        if now - created_at >= INSIGHTS_CACHE_TTL_SECONDS:
            del cache[key]
    if cache_key in cache:
        return dict(cache[cache_key][1])

    try:
        result = await generator(client, context)
    except Exception as error:
        logger.warning("Advanced LLM analysis failed (%s)", type(error).__name__)
        return None

    if INSIGHTS_CACHE_TTL_SECONDS > 0:
        if len(cache) >= 256:
            cache.clear()
        cache[cache_key] = (now, result)
    return result


@router.post("/analyze/momentum")
async def match_momentum(match: dict[str, Any]) -> dict[str, Any]:
    try:
        return analyze_momentum(match)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/ai/player-analysis")
async def player_analysis(
    match: dict[str, Any],
    request: Request,
) -> dict[str, Any]:
    try:
        facts = analyze_players(match)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    context = {
        "match_id": facts["match_id"],
        "current_innings": facts["current_innings"],
        "players": facts["players"],
    }
    llm_result = await _cached_llm(request, context, generate_player_analysis)
    return {
        **facts,
        "headline": llm_result["headline"] if llm_result else None,
        "observations": llm_result["observations"] if llm_result else [],
        "llm_available": llm_result is not None,
    }


@router.post("/ai/match-summary")
async def match_summary(
    match: dict[str, Any],
    request: Request,
) -> dict[str, Any]:
    try:
        facts = build_match_scorecard(match)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    narrative_context = {
        "result": facts["result"],
        "winner": facts["winner"],
        "teams": facts["teams"],
        "best_batter": facts["best_batter"],
        "best_bowler": facts["best_bowler"],
        "important_partnership": facts["important_partnership"],
        "turning_point": facts["turning_point"],
    }
    llm_result = await _cached_llm(
        request,
        narrative_context,
        generate_match_narrative,
    )
    return {
        **facts,
        "overall_summary": llm_result["overall_summary"] if llm_result else None,
        "llm_available": llm_result is not None,
    }


@router.post("/tournament/analytics")
async def tournament_analytics(payload: dict[str, Any]) -> dict[str, Any]:
    matches = payload.get("matches")
    if not isinstance(matches, list):
        raise HTTPException(status_code=422, detail="matches must be an array.")
    return analyze_tournament(matches)