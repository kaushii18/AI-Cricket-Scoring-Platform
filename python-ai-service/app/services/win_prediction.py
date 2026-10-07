"""Feature extraction and loading for the saved win prediction model."""

import logging
from pathlib import Path
from typing import Any

import joblib

from app.core.config import MODEL_PATH
from app.services.cricket_analytics import calculate_match_analytics

logger = logging.getLogger(__name__)

FEATURE_NAMES = (
    "runs",
    "wickets",
    "overs",
    "balls_remaining",
    "target",
    "runs_required",
    "current_run_rate",
    "required_run_rate",
    "recent_runs",
    "recent_wickets",
    "innings_number",
)


def extract_win_features(match: dict[str, Any]) -> dict[str, int | float | None]:
    analytics = calculate_match_analytics(match)
    if analytics["innings_completed"]:
        raise ValueError("Win predictions are available only during a live innings.")

    innings = analytics["current_innings"]
    deliveries = match.get("balls")
    recent_deliveries = [
        delivery
        for delivery in (deliveries if isinstance(deliveries, list) else [])
        if isinstance(delivery, dict) and delivery.get("innings") == innings
    ][-6:]

    recent_runs = sum(
        int(delivery.get("runs", 0) or 0)
        + int(delivery.get("extras", 0) or 0)
        for delivery in recent_deliveries
    )
    recent_wickets = sum(
        int(delivery.get("wickets", 0) or 0)
        for delivery in recent_deliveries
    )

    return {
        "runs": analytics["runs_scored"],
        "wickets": analytics["wickets"],
        "overs": int(match["overs"]),
        "balls_remaining": analytics["balls_remaining"],
        "target": analytics["target"],
        "runs_required": analytics["runs_required"],
        "current_run_rate": analytics["current_run_rate"],
        "required_run_rate": analytics["required_run_rate"],
        "recent_runs": recent_runs,
        "recent_wickets": recent_wickets,
        "innings_number": innings,
    }


def feature_vector(features: dict[str, int | float | None]) -> list[float]:
    return [
        float("nan") if features[name] is None else float(features[name])
        for name in FEATURE_NAMES
    ]


def load_model(model_path: Path | None = None) -> dict[str, Any] | None:
    path = model_path or MODEL_PATH
    if not path.is_file():
        return None

    try:
        bundle = joblib.load(path)
    except Exception:
        logger.exception("Unable to load win prediction model from %s", path)
        return None

    if (
        not isinstance(bundle, dict)
        or bundle.get("model_version") != "v1"
        or bundle.get("feature_names") != list(FEATURE_NAMES)
        or "model" not in bundle
    ):
        logger.error("Win prediction model bundle is invalid: %s", path)
        return None

    logger.info(
        "Loaded win prediction model %s trained on %s completed matches",
        bundle["model_version"],
        bundle.get("training_match_count", "unknown"),
    )
    return bundle