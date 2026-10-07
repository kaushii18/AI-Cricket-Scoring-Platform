import tempfile
import unittest
from pathlib import Path

from app.services.advanced_analytics import (
    analyze_momentum,
    analyze_players,
    analyze_tournament,
    build_match_scorecard,
)
from app.services.prediction_history import list_match_snapshots, record_over_snapshot


def make_match(status="LIVE", innings=1):
    balls = []
    total_runs = 0
    total_wickets = 0
    for index, runs in enumerate([1, 4, 0, 2, 6, 0, 1, 0, 4, 1, 0, 0], start=1):
        wicket = int(index == 10)
        striker_id = "batter-c" if index > 10 else "batter-a"
        striker_name = "C Batter" if index > 10 else "A Batter"
        balls.append({
            "number": index,
            "innings": innings,
            "battingTeam": "Falcons",
            "bowlingTeam": "Tigers",
            "striker": striker_name,
            "nonStriker": "B Batter",
            "bowler": "C Bowler",
            "strikerId": striker_id,
            "nonStrikerId": "batter-b",
            "bowlerId": "bowler-c",
            "runs": runs,
            "extras": 0,
            "wickets": wicket,
            "legalDelivery": True,
            "display": "W" if wicket else str(runs),
        })
        total_runs += runs
        total_wickets += wicket
    return {
        "id": "match-advanced-test",
        "overs": 5,
        "currentInnings": innings,
        "status": status,
        "battingTeam": "Falcons",
        "bowlingTeam": "Tigers",
        "target": 40 if innings == 2 else None,
        "result": "Falcons won by 5 runs." if status == "COMPLETED" else None,
        "teams": {
            "team1": {
                "name": "Falcons",
                "runs": total_runs,
                "wickets": total_wickets,
                "balls": len(balls),
                "players": [],
            },
            "team2": {
                "name": "Tigers",
                "runs": total_runs - 5 if status == "COMPLETED" else 0,
                "wickets": 4 if status == "COMPLETED" else 0,
                "balls": 30 if status == "COMPLETED" else 0,
                "players": [],
            },
        },
        "balls": balls,
    }


class AdvancedAnalyticsTests(unittest.TestCase):
    def test_player_analysis_aggregates_real_delivery_facts(self):
        result = analyze_players(make_match())
        batter = next(player for player in result["players"] if player["id"] == "batter-a")
        bowler = next(player for player in result["players"] if player["id"] == "bowler-c")

        self.assertEqual(batter["batting"]["runs"], 19)
        self.assertEqual(batter["batting"]["balls"], 10)
        self.assertEqual(batter["batting"]["boundaries"], 3)
        self.assertAlmostEqual(batter["batting"]["strike_rate"], 190.0, places=2)
        self.assertEqual(bowler["bowling"]["wickets"], 1)
        self.assertEqual(bowler["bowling"]["economy"], 9.5)

    def test_momentum_includes_recent_overs_boundaries_and_partnership(self):
        result = analyze_momentum(make_match())

        self.assertEqual(len(result["recent_overs"]), 2)
        self.assertEqual(result["recent_wickets"], 1)
        self.assertEqual(result["recent_boundaries"], 3)
        self.assertEqual(result["current_partnership"]["runs"], 0)
        self.assertEqual(result["highest_partnership"]["runs"], 19)
        self.assertEqual(result["momentum"], "Bowling pressure")

    def test_completed_summary_uses_recorded_result_and_players(self):
        result = build_match_scorecard(make_match(status="COMPLETED"))

        self.assertEqual(result["winner"], "Falcons")
        self.assertEqual(result["result"], "Falcons won by 5 runs.")
        self.assertEqual(result["best_batter"]["runs"], 19)
        self.assertEqual(result["best_bowler"]["wickets"], 1)
        self.assertIsNotNone(result["important_partnership"])
        self.assertIsNotNone(result["turning_point"])

    def test_tournament_analytics_reports_missing_real_tournament_ids(self):
        result = analyze_tournament([make_match(status="COMPLETED")])

        self.assertFalse(result["available"])
        self.assertIn("identifiers", result["reason"])
        self.assertEqual(result["tournaments"], [])

    def test_prediction_history_persists_only_real_completed_over_probabilities(self):
        match = make_match()
        with tempfile.TemporaryDirectory() as directory:
            history_path = Path(directory) / "history.json"
            record_over_snapshot(
                match,
                0.63,
                model_version="v1",
                history_path=history_path,
            )
            record_over_snapshot(
                match,
                0.63,
                model_version="v1",
                history_path=history_path,
            )
            rows = list_match_snapshots("match-advanced-test", history_path=history_path)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["over"], 2)
        self.assertEqual(rows[0]["batting_team_win_probability"], 0.63)

    def test_prediction_history_ignores_non_over_boundary_state(self):
        match = make_match()
        match["teams"]["team1"]["balls"] = 11
        with tempfile.TemporaryDirectory() as directory:
            history_path = Path(directory) / "history.json"
            record_over_snapshot(
                match,
                0.63,
                model_version="v1",
                history_path=history_path,
            )
            rows = list_match_snapshots("match-advanced-test", history_path=history_path)

        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()