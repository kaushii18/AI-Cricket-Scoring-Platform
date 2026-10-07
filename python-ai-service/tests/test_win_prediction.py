import math
import tempfile
import unittest
from pathlib import Path

from app.services.win_prediction import (
    FEATURE_NAMES,
    extract_win_features,
    feature_vector,
    load_model,
)
from app.services.win_training import (
    InsufficientTrainingDataError,
    build_training_examples,
    train_and_save_model,
)


LIVE_MATCH = {
    "id": "saved-match-shape",
    "overs": 5,
    "currentInnings": 2,
    "status": "LIVE",
    "battingTeam": "Falcons",
    "bowlingTeam": "Tigers",
    "target": 25,
    "teams": {
        "team1": {
            "name": "Falcons",
            "runs": 17,
            "wickets": 1,
            "balls": 12,
        },
        "team2": {
            "name": "Tigers",
            "runs": 24,
            "wickets": 2,
            "balls": 30,
        },
    },
    "balls": [
        {
            "innings": 2,
            "battingTeam": "Falcons",
            "runs": runs,
            "extras": 0,
            "wickets": int(index == 5),
            "legalDelivery": True,
        }
        for index, runs in enumerate((1, 2, 0, 4, 1, 0))
    ],
}


class WinPredictionTests(unittest.TestCase):
    def test_features_derive_from_cricpulse_match_fields(self) -> None:
        features = extract_win_features(LIVE_MATCH)

        self.assertEqual(features["runs"], 17)
        self.assertEqual(features["wickets"], 1)
        self.assertEqual(features["balls_remaining"], 18)
        self.assertEqual(features["runs_required"], 8)
        self.assertEqual(features["recent_runs"], 8)
        self.assertEqual(features["recent_wickets"], 1)
        self.assertEqual(tuple(features), FEATURE_NAMES)

    def test_missing_first_innings_target_is_encoded_as_missing(self) -> None:
        first_innings = {
            **LIVE_MATCH,
            "currentInnings": 1,
            "battingTeam": "Tigers",
            "bowlingTeam": "Falcons",
            "target": None,
            "teams": {
                "team1": {
                    **LIVE_MATCH["teams"]["team1"],
                    "runs": 0,
                    "wickets": 0,
                    "balls": 0,
                },
                "team2": {
                    **LIVE_MATCH["teams"]["team2"],
                    "runs": 12,
                    "wickets": 0,
                    "balls": 6,
                },
            },
            "balls": [],
        }
        features = extract_win_features(first_innings)
        vector = feature_vector(features)

        self.assertIsNone(features["runs_required"])
        self.assertTrue(math.isnan(vector[FEATURE_NAMES.index("target")]))

    def test_no_history_produces_no_training_rows(self) -> None:
        self.assertEqual(build_training_examples([]), ([], [], []))

    def test_training_gate_does_not_write_a_model(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            model_path = Path(directory) / "win_model.joblib"

            with self.assertRaisesRegex(InsufficientTrainingDataError, "Only 0"):
                train_and_save_model(
                    [],
                    model_path=model_path,
                    minimum_matches=30,
                )

            self.assertFalse(model_path.exists())

    def test_missing_model_loads_as_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(load_model(Path(directory) / "missing.joblib"))


if __name__ == "__main__":
    unittest.main()