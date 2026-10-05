"""HTTP gateway to the existing Node scoring API."""

from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import settings


class NodeApiClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.node_api_base_url,
            timeout=httpx.Timeout(8.0, connect=3.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> Any:
        try:
            response = await self._client.request(method, path, json=json)
        except httpx.TimeoutException as error:
            raise HTTPException(
                status_code=504,
                detail="The scoring service took too long to respond.",
            ) from error
        except httpx.RequestError as error:
            raise HTTPException(
                status_code=503,
                detail="The Node scoring service is unavailable.",
            ) from error

        try:
            payload = response.json()
        except ValueError:
            payload = {"message": response.text or "Invalid response from scoring service."}

        if response.is_error:
            detail = payload.get("message", payload) if isinstance(payload, dict) else payload
            raise HTTPException(status_code=response.status_code, detail=detail)

        return payload