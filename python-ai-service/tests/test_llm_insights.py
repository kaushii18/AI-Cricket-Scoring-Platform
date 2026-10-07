import asyncio
import json
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.api.routes.insights import ai_insights
from app.services.llm_insights import (
    build_match_context,
    generate_match_insights,
)


MATCH = {
    "id": "llm-test-match",
    "overs": 5,
    "currentInnings": 2,
    "status": "LIVE",
    "battingTeam": "Falcons",
    "bowlingTeam": "Tigers",
    "target": 80,
    "teams": {
        "team1": {"name": "Falcons", "runs": 34, "wickets": 2, "balls": 18},
        "team2": {"name": "Tigers", "runs": 79, "wickets": 4, "balls": 30},
    },
    "balls": [
        {
            "innings": 2,
            "battingTeam": "Falcons",
            "display": display,
            "runs": runs,
            "extras": 0,
            "wickets": wickets,
        }
        for display, runs, wickets in (("1", 1, 0), ("W", 0, 1))
    ],
}


VALID_RESPONSE = {
    "headline": "A demanding chase",
    "insights": [
        "The batting side needs to accelerate relative to the current rate.",
        "A wicket appears in the supplied recent deliveries.",
    ],
}


class FakeOpenAIClient:
    def __init__(self, response: dict[str, object]) -> None:
        self.response = response
        self.calls = 0
        self.last_request = None
        self.chat = SimpleNamespace(completions=self)

    async def create(self, **request: object) -> SimpleNamespace:
        self.calls += 1
        self.last_request = request
        message = SimpleNamespace(
            refusal=None,
            content=json.dumps(self.response),
        )
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def fake_request(client: FakeOpenAIClient) -> SimpleNamespace:
    app = SimpleNamespace(
        state=SimpleNamespace(
            openai_client=client,
            insights_cache={},
        )
    )
    return SimpleNamespace(app=app)


class LlmInsightsTests(unittest.TestCase):
    def test_context_uses_score_rates_and_recent_match_deliveries(self) -> None:
        context = build_match_context(MATCH)

        self.assertEqual(context["score"], {"runs": 34, "wickets": 2})
        self.assertEqual(context["runs_required"], 46)
        self.assertEqual(context["recent_deliveries"][-1]["wickets"], 1)
        self.assertIsNone(context["venue"])
        self.assertIsNone(context["individual_player_details"])

    def test_structured_output_uses_openai_schema_and_validates(self) -> None:
        client = FakeOpenAIClient(VALID_RESPONSE)
        context = build_match_context(MATCH)

        result = asyncio.run(generate_match_insights(client, context))

        self.assertEqual(result, VALID_RESPONSE)
        self.assertEqual(
            client.last_request["response_format"]["type"],
            "json_schema",
        )

    def test_rejects_numbers_not_present_in_match_facts(self) -> None:
        invented = {
            **VALID_RESPONSE,
            "insights": ["The chase needs 99 runs.", VALID_RESPONSE["insights"][1]],
        }
        client = FakeOpenAIClient(invented)

        with self.assertRaisesRegex(ValueError, "not present in match data"):
            asyncio.run(generate_match_insights(client, build_match_context(MATCH)))

    def test_identical_requests_are_cached(self) -> None:
        client = FakeOpenAIClient(VALID_RESPONSE)
        request = fake_request(client)

        first = asyncio.run(ai_insights(MATCH, request))
        second = asyncio.run(ai_insights(MATCH, request))

        self.assertEqual(first, second)
        self.assertEqual(client.calls, 1)

    def test_missing_key_returns_service_unavailable(self) -> None:
        request = fake_request(None)

        with self.assertRaises(HTTPException) as error:
            asyncio.run(ai_insights(MATCH, request))

        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("OPENAI_API_KEY", error.exception.detail)


if __name__ == "__main__":
    unittest.main()