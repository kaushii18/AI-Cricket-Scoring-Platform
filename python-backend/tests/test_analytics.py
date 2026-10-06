import unittest

from app.services.analytics import (
    match_insights,
    over_summary,
    player_summary,
    score_summary,
    toss_decision_advice,
)


SAMPLE_MATCH = {
    "id": "sample-match",
    "overs": 5,
    "status": "LIVE",
    "currentInnings": 1,
    "battingTeam": "Falcons",
    "bowlingTeam": "Tigers",
    "target": None,
    "teams": {
        "team1": {
            "name": "Falcons",
            "runs": 5,
            "wickets": 1,
            "balls": 2,
            "players": [
                {
                    "id": "p1",
                    "name": "A Batter",
                    "runs": 5,
                    "balls": 2,
                    "fours": 1,
                    "sixes": 0,
                    "out": False,
                }
            ],
        },
        "team2": {
            "name": "Tigers",
            "runs": 0,
            "wickets": 0,
            "balls": 0,
            "players": [],
        },
    },
    "balls": [
        {"innings": 1, "runs": 4, "wickets": 0, "display": "4", "battingTeam": "Falcons"},
        {"innings": 1, "runs": 1, "wickets": 1, "display": "W", "battingTeam": "Falcons"},
        {
            "innings": 1,
            "runs": 0,
            "extras": 1,
            "legalDelivery": False,
            "wickets": 0,
            "display": "WD",
            "battingTeam": "Falcons",
        },
    ],
}


class AnalyticsTests(unittest.TestCase):
    def test_score_summary_calculates_overs_and_run_rate(self) -> None:
        summary = score_summary(SAMPLE_MATCH)
        self.assertEqual(summary["teams"][0]["overs"], "0.2")
        self.assertEqual(summary["teams"][0]["run_rate"], 15.0)

    def test_player_summary_calculates_strike_rate(self) -> None:
        summary = player_summary(SAMPLE_MATCH)
        self.assertEqual(summary["players"][0]["batting"]["strike_rate"], 250.0)

    def test_over_summary_groups_deliveries_by_innings_and_over(self) -> None:
        summary = over_summary(SAMPLE_MATCH)
        self.assertEqual(len(summary), 1)
        self.assertEqual(summary[0]["runs"], 6)
        self.assertEqual(summary[0]["wickets"], 1)

    def test_insights_are_explicitly_rule_based(self) -> None:
        insights = match_insights(SAMPLE_MATCH)
        self.assertEqual(insights["method"], "rule_based")
        self.assertTrue(insights["observations"])

    def test_toss_advice_uses_completed_same_format_outcomes(self) -> None:
        history = [
            {"status": "COMPLETED", "overs": 5, "team1": "A", "team2": "B", "tossWinner": "team1", "tossDecision": "bat", "result": "A won by 10 runs."},
            {"status": "COMPLETED", "overs": 5, "team1": "C", "team2": "D", "tossWinner": "team2", "tossDecision": "bat", "result": "D won by 2 wickets."},
            {"status": "COMPLETED", "overs": 5, "team1": "E", "team2": "F", "tossWinner": "team1", "tossDecision": "bowl", "result": "F won by 1 run."},
            {"status": "COMPLETED", "overs": 5, "team1": "G", "team2": "H", "tossWinner": "team2", "tossDecision": "bowl", "result": "G won by 4 runs."},
            {"status": "LIVE", "overs": 5, "team1": "I", "team2": "J", "tossWinner": "team1", "tossDecision": "bowl", "result": None},
        ]
        advice = toss_decision_advice(history, 5)
        self.assertEqual(advice["decision"], "bat")
        self.assertEqual(advice["sample_size"], 4)

    def test_toss_advice_does_not_guess_without_both_samples(self) -> None:
        advice = toss_decision_advice([], 20)
        self.assertIsNone(advice["decision"])
        self.assertEqual(advice["sample_size"], 0)


if __name__ == "__main__":
    unittest.main()