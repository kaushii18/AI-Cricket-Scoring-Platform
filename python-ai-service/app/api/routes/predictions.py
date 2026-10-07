"""Machine-learning prediction endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.core.config import MIN_TRAINING_MATCHES
from app.services.cricket_analytics import calculate_match_analytics
from app.services.win_prediction import extract_win_features, feature_vector

logger = logging.getLogger(__name__)
router = APIRouter(tags=["predictions"])


@router.post("/predict/win")
async def predict_win(match: dict[str, Any], request: Request) -> dict[str, Any]:
    try:
        analytics = calculate_match_analytics(match)
        if match.get("status") != "LIVE" or analytics["innings_completed"]:
            raise HTTPException(
                status_code=409,
                detail="Win predictions are available only for a live innings.",
            )
        features = extract_win_features(match)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    bowling_team = match.get("bowlingTeam")
    if not isinstance(bowling_team, str) or not bowling_team:
        raise HTTPException(
            status_code=422,
            detail="Match data must identify the current bowling team.",
        )

    bundle = getattr(request.app.state, "win_model", None)
    if bundle is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "model_not_trained",
                "message": (
                    "No trained win prediction model is available. The training "
                    f"pipeline requires at least {MIN_TRAINING_MATCHES} decisive "
                    "completed matches with both innings and ball-by-ball data. "
                    "Run `python -m app.train_model` after adding sufficient real "
                    "CricPulse history, then restart this service."
                ),
            },
        )

    try:
        model = bundle["model"]
        probabilities = model.predict_proba([feature_vector(features)])[0]
        classes = list(model.classes_)
        batting_probability = float(probabilities[classes.index(1)])
    except Exception as error:
        logger.exception("Win prediction failed")
        raise HTTPException(
            status_code=503,
            detail="The trained win prediction model could not produce a prediction.",
        ) from error

    return {
        "batting_team": analytics["batting_team"],
        "bowling_team": bowling_team,
        "batting_team_win_probability": batting_probability,
        "bowling_team_win_probability": 1.0 - batting_probability,
        "model_version": bundle["model_version"],
    }