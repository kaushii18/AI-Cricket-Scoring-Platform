"""Team endpoints forwarded to the current Node/Supabase implementation."""

from typing import Any

from fastapi import APIRouter, Depends

from app.api.routes.health import get_node_client
from app.schemas.matches import TeamCreateRequest
from app.services.node_api import NodeApiClient

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("")
async def list_teams(
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request("GET", "/teams")
    finally:
        await client.close()


@router.post("", status_code=201)
async def create_team(
    payload: TeamCreateRequest,
    client: NodeApiClient = Depends(get_node_client),
) -> Any:
    try:
        return await client.request(
            "POST",
            "/teams",
            json=payload.model_dump(by_alias=True),
        )
    finally:
        await client.close()