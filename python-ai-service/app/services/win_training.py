"""Grouped training and evaluation for the live win prediction model."""

from collections.abc import Iterable
from typing import Any

import joblib
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.core.config import MIN_TRAINING_MATCHES, MODEL_PATH
from app.services.cricket_analytics import calculate_match_analytics
from app.services.win_prediction import (
    FEATURE_NAMES,
    extract_win_features,
    feature_vector,
)


class InsufficientTrainingDataError(ValueError):
    """Raised when there are too few independent completed matches to train."""


def _integer(value: Any) -> int:
    parsed = int(value or 0)
    if parsed < 0:
        raise ValueError("Match totals must be non-negative.")
    return parsed


def _winner_key(match: dict[str, Any]) -> str | None:
    if match.get("status") != "COMPLETED" or not match.get("result"):
        return None

    teams = match.get("teams")
    deliveries = match.get("balls")
    if not isinstance(teams, dict) or not isinstance(deliveries, list):
        return None

    innings_seen = {
        delivery.get("innings")
        for delivery in deliveries
        if isinstance(delivery, dict)
    }
    if not {1, 2}.issubset(innings_seen):
        return None

    try:
        team_runs = {
            key: _integer(teams[key].get("runs"))
            for key in ("team1", "team2")
            if isinstance(teams.get(key), dict)
        }
    except (TypeError, ValueError):
        return None

    if len(team_runs) != 2 or team_runs["team1"] == team_runs["team2"]:
        return None
    return max(team_runs, key=team_runs.get)


def build_training_examples(
    matches: Iterable[dict[str, Any]],
) -> tuple[list[list[float]], list[int], list[str]]:
    feature_rows: list[list[float]] = []
    labels: list[int] = []
    groups: list[str] = []

    for match in matches:
        winner = _winner_key(match)
        match_id = match.get("id")
        teams = match.get("teams")
        deliveries = match.get("balls")
        if (
            winner is None
            or not isinstance(match_id, str)
            or not isinstance(teams, dict)
            or not isinstance(deliveries, list)
        ):
            continue

        team_keys_by_name = {
            team.get("name"): key
            for key in ("team1", "team2")
            if isinstance((team := teams.get(key)), dict)
            and isinstance(team.get("name"), str)
        }
        valid_deliveries = [
            delivery
            for delivery in deliveries
            if isinstance(delivery, dict)
            and delivery.get("innings") in (1, 2)
            and delivery.get("battingTeam") in team_keys_by_name
        ]
        if {delivery["innings"] for delivery in valid_deliveries} != {1, 2}:
            continue

        state_teams = {
            key: {
                "name": teams[key]["name"],
                "runs": 0,
                "balls": 0,
                "wickets": 0,
            }
            for key in ("team1", "team2")
        }
        prefix: list[dict[str, Any]] = []
        started_innings: set[int] = set()
        match_features: list[tuple[list[float], int]] = []

        for delivery in valid_deliveries:
            innings = int(delivery["innings"])
            batting_team_name = delivery["battingTeam"]
            batting_key = team_keys_by_name[batting_team_name]

            if innings not in started_innings:
                started_innings.add(innings)
                initial_state = {
                    "id": match_id,
                    "overs": match.get("overs"),
                    "currentInnings": innings,
                    "status": "LIVE",
                    "battingTeam": batting_team_name,
                    "target": match.get("target") if innings == 2 else None,
                    "teams": {
                        key: dict(team_state)
                        for key, team_state in state_teams.items()
                    },
                    "balls": list(prefix),
                }
                try:
                    features = extract_win_features(initial_state)
                except (TypeError, ValueError):
                    features = None
                if features is not None:
                    match_features.append(
                        (feature_vector(features), int(batting_key == winner))
                    )

            try:
                runs = _integer(delivery.get("runs"))
                extras = _integer(delivery.get("extras"))
                wickets = _integer(delivery.get("wickets"))
            except (TypeError, ValueError):
                continue

            team_state = state_teams[batting_key]
            team_state["runs"] += runs + extras
            team_state["wickets"] += wickets
            if delivery.get("legalDelivery", True) is not False:
                team_state["balls"] += 1
            prefix.append(delivery)

            current_state = {
                "id": match_id,
                "overs": match.get("overs"),
                "currentInnings": innings,
                "status": "LIVE",
                "battingTeam": batting_team_name,
                "target": match.get("target") if innings == 2 else None,
                "teams": {
                    key: dict(team_state)
                    for key, team_state in state_teams.items()
                },
                "balls": list(prefix),
            }
            try:
                analytics = calculate_match_analytics(current_state)
                if analytics["innings_completed"]:
                    continue
                features = extract_win_features(current_state)
            except (TypeError, ValueError):
                continue

            match_features.append(
                (feature_vector(features), int(batting_key == winner))
            )

        if match_features:
            feature_rows.extend(row for row, _ in match_features)
            labels.extend(label for _, label in match_features)
            groups.extend([match_id] * len(match_features))

    return feature_rows, labels, groups


def _make_model():
    return make_pipeline(
        SimpleImputer(
            strategy="median",
            add_indicator=True,
            keep_empty_features=True,
        ),
        StandardScaler(),
        LogisticRegression(max_iter=1000, random_state=42),
    )


def _grouped_holdout(
    features: list[list[float]],
    labels: list[int],
    groups: list[str],
) -> tuple[list[int], list[int]]:
    splitter = GroupShuffleSplit(
        n_splits=40,
        test_size=0.2,
        random_state=42,
    )
    for training_indices, test_indices in splitter.split(features, labels, groups):
        training_labels = {labels[index] for index in training_indices}
        test_labels = {labels[index] for index in test_indices}
        if training_labels == {0, 1} and test_labels == {0, 1}:
            return list(training_indices), list(test_indices)

    raise InsufficientTrainingDataError(
        "Unable to create a match-grouped holdout containing both outcomes; "
        "add more completed wins for both teams before training."
    )


def train_and_save_model(
    matches: Iterable[dict[str, Any]],
    *,
    model_path=MODEL_PATH,
    minimum_matches: int = MIN_TRAINING_MATCHES,
) -> dict[str, Any]:
    features, labels, groups = build_training_examples(matches)
    match_count = len(set(groups))
    if match_count < minimum_matches:
        raise InsufficientTrainingDataError(
            f"Only {match_count} decisive completed matches have usable "
            f"two-innings ball-by-ball data; at least {minimum_matches} are "
            "required. Collect genuine completed CricPulse matches before training."
        )

    training_indices, test_indices = _grouped_holdout(features, labels, groups)
    evaluation_model = _make_model()
    evaluation_model.fit(
        [features[index] for index in training_indices],
        [labels[index] for index in training_indices],
    )
    test_features = [features[index] for index in test_indices]
    test_labels = [labels[index] for index in test_indices]
    probabilities = evaluation_model.predict_proba(test_features)
    classifier = evaluation_model.named_steps["logisticregression"]
    positive_index = list(classifier.classes_).index(1)
    batting_probabilities = probabilities[:, positive_index]
    predictions = evaluation_model.predict(test_features)

    evaluation = {
        "split": "grouped_holdout_by_match",
        "accuracy": round(float(accuracy_score(test_labels, predictions)), 4),
        "log_loss": round(
            float(log_loss(test_labels, probabilities, labels=[0, 1])),
            4,
        ),
        "brier_score": round(
            float(brier_score_loss(test_labels, batting_probabilities)),
            4,
        ),
        "roc_auc": round(
            float(roc_auc_score(test_labels, batting_probabilities)),
            4,
        ),
        "held_out_matches": len({groups[index] for index in test_indices}),
    }

    final_model = _make_model()
    final_model.fit(features, labels)
    bundle = {
        "model_version": "v1",
        "feature_names": list(FEATURE_NAMES),
        "model": final_model,
        "training_match_count": match_count,
        "training_sample_count": len(labels),
        "evaluation": evaluation,
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, model_path)
    return {
        "model_version": bundle["model_version"],
        "training_match_count": match_count,
        "training_sample_count": len(labels),
        "evaluation": evaluation,
        "model_path": str(model_path),
    }