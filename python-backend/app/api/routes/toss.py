"""Fair toss flips and historical toss-decision advice."""

import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.routes.health import get_node_client
from app.schemas.matches import TossFlipRequest
from app.services.analytics import toss_decision_advice
from app.services.node_api import NodeApiClient

router = APIRouter(prefix="/toss", tags=["toss", "decision support"])


@router.post("/flip")
async def flip_toss(
    payload: TossFlipRequest,
    client: NodeApiClient = Depends(get_node_client),
) -> dict[str, Any]:
    coin_face = secrets.choice(("heads", "tails"))
    toss_winner = "team1" if coin_face == "heads" else "team2"
    winner_name = payload.team1 if toss_winner == "team1" else payload.team2

    try:
        matches = await client.request("GET", "/matches")
    except HTTPException:
        matches = []
    finally:
        await client.close()

    advice = toss_decision_advice(
        matches if isinstance(matches, list) else [],
        payload.overs,
    )

    return {
        "coin_face": coin_face,
        "toss_winner": toss_winner,
        "toss_winner_name": winner_name,
        "recommendation": advice,
    }