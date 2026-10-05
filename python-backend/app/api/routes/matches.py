"""Match facade and derived cricket analytics routes."""

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends

from app.api.routes.health import get_node_client
from app.schemas.matches import (
    ActivePlayersRequest,
    BallRecordRequest,
    MatchCreateRequest,
)
from app.services.analytics import (
    match_insights,
    over_summary,
    player_summary,
    score_summary,
)
from app.services.node_api import NodeApiClient

router = APIRouter(prefix="/matches", tags=["matches", "scores", "statistics"])


async def _match(client: NodeApiClient, match_id: str) -> dict[str, Any]:
    return await client.request("GET", f"/matches/{quote(match_id, safe='')}")


@router.get("")
async def list_matches(
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request("GET", "/matches")
    finally:
        await client.close()


@router.post("", status_code=201)
async def create_match(
    payload: MatchCreateRequest,
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request(
            "POST",
            "/matches",
            json=payload.model_dump(by_alias=True),
        )
    finally:
        await client.close()


@router.get("/{match_id}")
async def get_match(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await _match(client, match_id)
    finally:
        await client.close()


@router.post("/{match_id}/balls")
async def record_ball(
    match_id: str,
    payload: BallRecordRequest,
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request(
            "POST",
            f"/matches/{quote(match_id, safe='')}/balls",
            json=payload.model_dump(exclude_none=True),
        )
    finally:
        await client.close()


@router.post("/{match_id}/players")
async def set_active_players(
    match_id: str,
    payload: ActivePlayersRequest,
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request(
            "POST",
            f"/matches/{quote(match_id, safe='')}/players",
            json=payload.model_dump(by_alias=True),
        )
    finally:
        await client.close()


@router.post("/{match_id}/reset")
async def reset_match(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request(
            "POST", f"/matches/{quote(match_id, safe='')}/reset"
        )
    finally:
        await client.close()


@router.get("/{match_id}/players")
async def get_players(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> dict[str, Any]:
    try:
        return player_summary(await _match(client, match_id))
    finally:
        await client.close()


@router.get("/{match_id}/scores")
async def get_scores(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> dict[str, Any]:
    try:
        return score_summary(await _match(client, match_id))
    finally:
        await client.close()


@router.get("/{match_id}/overs")
async def get_overs(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> list[dict[str, Any]]:
    try:
        return over_summary(await _match(client, match_id))
    finally:
        await client.close()


@router.get("/{match_id}/statistics")
async def get_statistics(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> dict[str, Any]:
    try:
        return player_summary(await _match(client, match_id))
    finally:
        await client.close()


@router.get("/{match_id}/insights")
async def get_insights(
    match_id: str,
    client: NodeApiClient = Depends(get_node_client),
) -> dict[str, Any]:
    try:
        return match_insights(await _match(client, match_id))
    finally:
        await client.close()