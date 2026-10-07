import unittest

from app.services.cricket_analytics import calculate_match_analytics


def make_match(
    *,
    runs: int,
    balls: int,
    overs: int = 10,
    innings: int = 1,
    target: int | None = None,
    wickets: int = 0,
    status: str = "LIVE",
    other_runs: int = 0,
) -> dict:
    batting_team = "Falcons" if innings == 1 else "Tigers"
    bowling_team = "Tigers" if innings == 1 else "Falcons"
    return {
        "id": "match-test",
        "overs": overs,
        "currentInnings": innings,
        "status": status,
        "battingTeam": batting_team,
        "target": target,
        "result": None,
        "teams": {
            "team1": {
                "name": "Falcons",
                "runs": runs if innings == 1 else other_runs,
                "balls": balls if innings == 1 else 0,
                "wickets": wickets if innings == 1 else 0,
            },
            "team2": {
                "name": "Tigers",
                "runs": runs if innings == 2 else other_runs,
                "balls": balls if innings == 2 else 0,
                "wickets": wickets if innings == 2 else 0,
            },
        },
        "balls": [],
    }


class CricketAnalyticsTests(unittest.TestCase):
    def test_first_innings_rate_projection_and_overs_remaining(self) -> None:
        result = calculate_match_analytics(make_match(runs=50, balls=12))

        self.assertEqual(result["current_run_rate"], 25.0)
        self.assertIsNone(result["required_run_rate"])
        self.assertIsNone(result["runs_required"])
        self.assertEqual(result["balls_remaining"], 48)
        self.assertEqual(result["overs_remaining"], "8.0")
        self.assertEqual(result["projected_score"], 250)

    def test_second_innings_required_rate_uses_actual_remaining_balls(self) -> None:
        result = calculate_match_analytics(
            make_match(runs=20, balls=16, innings=2, target=84, other_runs=83)
        )

        self.assertEqual(result["runs_required"], 64)
        self.assertEqual(result["balls_remaining"], 44)
        self.assertEqual(result["overs_remaining"], "7.2")
        self.assertEqual(result["required_run_rate"], 8.73)
        self.assertEqual(result["projected_score"], 75)

    def test_target_reached_has_zero_runs_required_and_no_projection(self) -> None:
        result = calculate_match_analytics(
            make_match(
                runs=84,
                balls=16,
                innings=2,
                target=84,
                status="COMPLETED",
                other_runs=83,
            )
        )

        self.assertEqual(result["runs_required"], 0)
        self.assertEqual(result["required_run_rate"], 0.0)
        self.assertEqual(result["balls_remaining"], 44)
        self.assertIsNone(result["projected_score"])
        self.assertTrue(result["innings_completed"])

    def test_completed_innings_with_zero_balls_remaining_has_no_required_rate(self) -> None:
        result = calculate_match_analytics(
            make_match(
                runs=83,
                balls=60,
                innings=2,
                target=84,
                status="COMPLETED",
                other_runs=90,
            )
        )

        self.assertEqual(result["balls_remaining"], 0)
        self.assertEqual(result["overs_remaining"], "0.0")
        self.assertIsNone(result["required_run_rate"])
        self.assertIsNone(result["projected_score"])
        self.assertTrue(result["innings_completed"])

    def test_missing_target_leaves_chase_metrics_undefined(self) -> None:
        result = calculate_match_analytics(
            make_match(runs=25, balls=12, innings=2, target=None)
        )

        self.assertIsNone(result["runs_required"])
        self.assertIsNone(result["required_run_rate"])
        self.assertEqual(result["current_run_rate"], 12.5)

    def test_zero_balls_does_not_invent_a_projected_score(self) -> None:
        result = calculate_match_analytics(make_match(runs=0, balls=0))

        self.assertEqual(result["current_run_rate"], 0.0)
        self.assertIsNone(result["projected_score"])

    def test_completed_tied_match_is_reported_as_tied(self) -> None:
        result = calculate_match_analytics(
            make_match(
                runs=83,
                balls=60,
                innings=2,
                target=84,
                status="COMPLETED",
                other_runs=83,
            )
        )

        self.assertTrue(result["match_tied"])
        self.assertEqual(result["runs_required"], 1)

    def test_missing_batting_team_is_rejected(self) -> None:
        match = make_match(runs=10, balls=6)
        match["battingTeam"] = None

        with self.assertRaisesRegex(ValueError, "current batting team"):
            calculate_match_analytics(match)


if __name__ == "__main__":
    unittest.main()