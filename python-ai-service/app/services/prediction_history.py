"""Persistent snapshots of genuine model probabilities at over boundaries."""

import json
import logging
import math
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.config import PREDICTION_HISTORY_PATH
from app.services.cricket_analytics import calculate_match_analytics

logger = logging.getLogger(__name__)
_history_lock = Lock()


def record_over_snapshot(
    match: dict[str, Any],
    batting_probability: float,
    *,
    model_version: str,
    history_path: Path | None = None,
) -> None:
    analytics = calculate_match_analytics(match)
    legal_balls = analytics["legal_balls_bowled"]
    match_id = match.get("id")
    if (
        not isinstance(match_id, str)
        or not match_id
        or legal_balls == 0
        or legal_balls % 6 != 0
        or not math.isfinite(batting_probability)
        or not 0 <= batting_probability <= 1
    ):
        return

    over_number = legal_balls // 6
    snapshot = {
        "match_id": match_id,
        "innings": analytics["current_innings"],
        "over": over_number,
        "batting_team": analytics["batting_team"],
        "bowling_team": match.get("bowlingTeam"),
        "batting_team_win_probability": batting_probability,
        "bowling_team_win_probability": 1.0 - batting_probability,
        "model_version": model_version,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    path = history_path or PREDICTION_HISTORY_PATH

    with _history_lock:
        history = _read_history(path)
        existing = next(
            (
                row
                for row in history
                if row.get("match_id") == match_id
                and row.get("innings") == snapshot["innings"]
                and row.get("over") == over_number
            ),
            None,
        )
        if existing:
            return
        history.append(snapshot)
        _write_history(path, history)


def list_match_snapshots(
    match_id: str,
    *,
    history_path: Path | None = None,
) -> list[dict[str, Any]]:
    path = history_path or PREDICTION_HISTORY_PATH
    with _history_lock:
        return sorted(
            [row for row in _read_history(path) if row.get("match_id") == match_id],
            key=lambda row: (row.get("innings", 0), row.get("over", 0)),
        )


def _read_history(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError):
        logger.exception("Unable to read prediction history from %s", path)
        return []
    return payload if isinstance(payload, list) else []


def _write_history(path: Path, history: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            delete=False,
        ) as temporary_file:
            json.dump(history, temporary_file, indent=2)
            temporary_path = Path(temporary_file.name)
        os.replace(temporary_path, path)
    except OSError:
        logger.exception("Unable to save prediction history to %s", path)
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)