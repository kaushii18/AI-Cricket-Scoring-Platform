"""Health endpoints for the Python service and its scoring dependency."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.services.node_api import NodeApiClient

router = APIRouter(tags=["health"])


def get_node_client() -> NodeApiClient:
    return NodeApiClient()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "python-api"}


@router.get("/health/dependencies")
async def dependency_health(
    client: NodeApiClient = Depends(get_node_client),
) -> dict[str, Any]:
    try:
        node_status = await client.request("GET", "/health")
    except HTTPException as error:
        return {
            "status": "degraded",
            "dependencies": {"node_scoring_api": "unavailable"},
            "detail": error.detail,
        }
    finally:
        await client.close()

    return {
        "status": "ok",
        "dependencies": {"node_scoring_api": node_status.get("status", "unknown")},
    }