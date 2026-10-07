"""Deterministic analytics derived from CricPulse match records."""

from typing import Any


def _integer(value: Any, field: str, *, default: int | None = None) -> int:
    if value is None and default is not None:
        return default
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a non-negative integer.")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be a non-negative integer.") from error
    if parsed < 0 or parsed != value:
        raise ValueError(f"{field} must be a non-negative integer.")
    return parsed


def _legal_balls_from_history(match: dict[str, Any], innings: int) -> int:
    deliveries = match.get("balls")
    if not isinstance(deliveries, list):
        return 0
    return sum(
        1
        for delivery in deliveries
        if isinstance(delivery, dict)
        and delivery.get("innings") == innings
        and delivery.get("legalDelivery", True) is not False
    )


def _overs_notation(balls: int) -> str:
    return f"{balls // 6}.{balls % 6}"


def calculate_match_analytics(match: dict[str, Any]) -> dict[str, Any]:
    """Calculate current-innings metrics from the saved CricPulse match shape."""
    if not isinstance(match, dict):
        raise ValueError("Match data must be a JSON object.")

    overs = _integer(match.get("overs"), "overs")
    if overs == 0:
        raise ValueError("overs must be greater than zero.")

    innings = _integer(match.get("currentInnings", 1), "currentInnings")
    if innings not in (1, 2):
        raise ValueError("currentInnings must be 1 or 2.")

    teams = match.get("teams")
    if not isinstance(teams, dict):
        raise ValueError("Match data must include a teams object.")

    batting_team_name = match.get("battingTeam")
    batting_team = next(
        (
            team
            for team in teams.values()
            if isinstance(team, dict) and team.get("name") == batting_team_name
        ),
        None,
    )
    if not isinstance(batting_team, dict):
        raise ValueError("Match data must identify the current batting team.")

    runs = _integer(batting_team.get("runs", 0), "batting team runs")
    wickets = _integer(batting_team.get("wickets", 0), "batting team wickets")
    team_balls = batting_team.get("balls")
    balls_bowled = (
        _integer(team_balls, "batting team balls")
        if team_balls is not None
        else _legal_balls_from_history(match, innings)
    )
    maximum_balls = overs * 6
    balls_remaining = max(0, maximum_balls - balls_bowled)

    target_value = match.get("target")
    target = (
        _integer(target_value, "target")
        if target_value is not None
        else None
    )
    runs_required = (
        max(0, target - runs)
        if innings == 2 and target is not None
        else None
    )

    status = str(match.get("status") or "").upper()
    target_reached = runs_required == 0 and innings == 2 and target is not None
    innings_completed = (
        status == "COMPLETED"
        or balls_bowled >= maximum_balls
        or wickets >= 10
        or target_reached
    )

    current_run_rate = (
        round(runs * 6 / balls_bowled, 2)
        if balls_bowled
        else 0.0
    )

    if runs_required is None:
        required_run_rate = None
    elif target_reached:
        required_run_rate = 0.0
    elif innings_completed or balls_remaining == 0:
        required_run_rate = None
    else:
        required_run_rate = round(runs_required * 6 / balls_remaining, 2)

    projected_score = (
        int(runs * maximum_balls / balls_bowled + 0.5)
        if balls_bowled and not innings_completed
        else None
    )

    other_team_runs = [
        _integer(team.get("runs", 0), "team runs")
        for team in teams.values()
        if isinstance(team, dict) and team is not batting_team
    ]
    result_text = str(match.get("result") or "").casefold()
    match_tied = status == "COMPLETED" and (
        "tied" in result_text
        or "tie" in result_text
        or (bool(other_team_runs) and runs == other_team_runs[0])
    )

    return {
        "match_id": match.get("id"),
        "status": status or None,
        "current_innings": innings,
        "batting_team": batting_team_name,
        "runs_scored": runs,
        "wickets": wickets,
        "legal_balls_bowled": balls_bowled,
        "current_run_rate": current_run_rate,
        "required_run_rate": required_run_rate,
        "runs_required": runs_required,
        "balls_remaining": balls_remaining,
        "overs_remaining": _overs_notation(balls_remaining),
        "projected_score": projected_score,
        "target": target,
        "innings_completed": innings_completed,
        "match_tied": match_tied,
    }