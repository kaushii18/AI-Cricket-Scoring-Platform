import unittest
from typing import Any

import httpx

from app.api.routes.health import get_node_client
from app.main import app


MATCH = {
    "id": "match-1",
    "team1": "Falcons",
    "team2": "Tigers",
    "overs": 5,
    "status": "LIVE",
    "currentInnings": 1,
    "battingTeam": "Falcons",
    "bowlingTeam": "Tigers",
    "target": None,
    "teams": {
        "team1": {
            "name": "Falcons",
            "runs": 6,
            "wickets": 0,
            "balls": 2,
            "players": [],
        },
        "team2": {
            "name": "Tigers",
            "runs": 0,
            "wickets": 0,
            "balls": 0,
            "players": [],
        },
    },
    "balls": [],
}


class FakeNodeApiClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []

    async def close(self) -> None:
        return None

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> Any:
        self.calls.append((method, path, json))
        if path == "/health":
            return {"status": "ok"}
        if path == "/matches":
            return [MATCH]
        if path == "/matches/match-1":
            return MATCH
        return MATCH


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.node_client = FakeNodeApiClient()
        app.dependency_overrides[get_node_client] = lambda: self.node_client
        transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        app.dependency_overrides.clear()

    async def test_health_endpoint(self) -> None:
        response = await self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "python-api")

    async def test_score_endpoint_derives_team_totals(self) -> None:
        response = await self.client.get("/api/v1/matches/match-1/scores")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["teams"][0]["runs"], 6)
        self.assertEqual(response.json()["teams"][0]["overs"], "0.2")

    async def test_valid_match_creation_is_forwarded_to_node(self) -> None:
        payload = {
            "team1": "Falcons",
            "team2": "Tigers",
            "overs": 5,
            "tossWinner": "team1",
            "tossDecision": "bat",
            "team1Players": ["A", "B"],
            "team2Players": ["C", "D"],
        }
        response = await self.client.post("/api/v1/matches", json=payload)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.node_client.calls[-1], ("POST", "/matches", payload))

    async def test_ball_recording_is_forwarded_to_node(self) -> None:
        payload = {"runs": 4, "wickets": 0, "display": "4"}
        response = await self.client.post(
            "/api/v1/matches/match-1/balls",
            json=payload,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.node_client.calls[-1],
            ("POST", "/matches/match-1/balls", payload),
        )

    async def test_invalid_match_is_rejected_before_forwarding(self) -> None:
        response = await self.client.post(
            "/api/v1/matches",
            json={
                "team1": "Falcons",
                "team2": "Falcons",
                "overs": 7,
                "tossWinner": "team1",
                "tossDecision": "bat",
                "team1Players": ["A", "B"],
                "team2Players": ["C", "D"],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.node_client.calls, [])


if __name__ == "__main__":
    unittest.main()