"""Read-only cricket summaries derived from Node match records."""

from typing import Any


def team_entries(match: dict[str, Any]) -> list[dict[str, Any]]:
    teams = match.get("teams") or {}
    return [
        {"key": key, **team}
        for key, team in teams.items()
        if key in {"team1", "team2"} and isinstance(team, dict)
    ]


def player_summary(match: dict[str, Any]) -> dict[str, Any]:
    batting_team = match.get("battingTeam")
    bowling_team = match.get("bowlingTeam")
    result: list[dict[str, Any]] = []

    for team in team_entries(match):
        for player in team.get("players") or []:
            if not isinstance(player, dict):
                continue
            balls = int(player.get("balls", 0) or 0)
            runs = int(player.get("runs", 0) or 0)
            result.append(
                {
                    "id": player.get("id"),
                    "name": player.get("name"),
                    "team": team.get("name"),
                    "team_key": team.get("key"),
                    "batting": {
                        "runs": runs,
                        "balls": balls,
                        "fours": int(player.get("fours", 0) or 0),
                        "sixes": int(player.get("sixes", 0) or 0),
                        "strike_rate": round(runs * 100 / balls, 2) if balls else 0.0,
                        "out": bool(player.get("out", False)),
                    },
                    "bowling": {
                        "overs": f"{int(player.get('bowlerBalls', 0) or 0) // 6}.{int(player.get('bowlerBalls', 0) or 0) % 6}",
                        "balls": int(player.get("bowlerBalls", 0) or 0),
                        "runs_conceded": int(player.get("runsConceded", 0) or 0),
                        "wickets": int(player.get("wickets", 0) or 0),
                    },
                }
            )

    return {
        "match_id": match.get("id"),
        "batting_team": batting_team,
        "bowling_team": bowling_team,
        "players": result,
    }


def score_summary(match: dict[str, Any]) -> dict[str, Any]:
    return {
        "match_id": match.get("id"),
        "status": match.get("status"),
        "current_innings": match.get("currentInnings"),
        "batting_team": match.get("battingTeam"),
        "bowling_team": match.get("bowlingTeam"),
        "target": match.get("target"),
        "teams": [
            {
                "name": team.get("name"),
                "runs": int(team.get("runs", 0) or 0),
                "wickets": int(team.get("wickets", 0) or 0),
                "balls": int(team.get("balls", 0) or 0),
                "overs": f"{int(team.get('balls', 0) or 0) // 6}.{int(team.get('balls', 0) or 0) % 6}",
                "run_rate": round(
                    int(team.get("runs", 0) or 0)
                    / (int(team.get("balls", 0) or 0) / 6),
                    2,
                )
                if int(team.get("balls", 0) or 0)
                else 0.0,
            }
            for team in team_entries(match)
        ],
    }


def over_summary(match: dict[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[tuple[int, int], dict[str, Any]] = {}
    ball_counts: dict[int, int] = {}

    for ball in match.get("balls") or []:
        if not isinstance(ball, dict):
            continue
        innings = int(ball.get("innings", 1) or 1)
        delivery_number = ball_counts.get(innings, 0)
        ball_counts[innings] = delivery_number + 1
        over_number = delivery_number // 6 + 1
        key = (innings, over_number)
        over = grouped.setdefault(
            key,
            {
                "innings": innings,
                "over": over_number,
                "batting_team": ball.get("battingTeam"),
                "runs": 0,
                "wickets": 0,
                "deliveries": [],
            },
        )
        over["runs"] += int(ball.get("runs", 0) or 0)
        over["wickets"] += int(ball.get("wickets", 0) or 0)
        over["deliveries"].append(ball.get("display", str(ball.get("runs", 0))))

    return [grouped[key] for key in sorted(grouped)]


def match_insights(match: dict[str, Any]) -> dict[str, Any]:
    score = score_summary(match)
    batting = next(
        (team for team in score["teams"] if team["name"] == score["batting_team"]),
        None,
    )
    observations: list[str] = []

    if batting:
        observations.append(
            f"{batting['name']} are {batting['runs']}/{batting['wickets']} after {batting['overs']} overs."
        )
        if batting["run_rate"] > 0:
            observations.append(f"Current run rate is {batting['run_rate']:.2f} per over.")
        wickets_remaining = max(0, 10 - batting["wickets"])
        observations.append(f"{wickets_remaining} wickets remain in the innings.")

    target = match.get("target")
    if match.get("currentInnings") == 2 and target is not None and batting:
        balls_remaining = max(0, (int(match.get("overs", 0) or 0) * 6) - batting["balls"])
        runs_needed = max(0, int(target) - batting["runs"])
        required_rate = round(runs_needed / (balls_remaining / 6), 2) if balls_remaining else None
        observations.append(
            f"{runs_needed} runs are needed from {balls_remaining} balls."
        )
        if required_rate is not None:
            observations.append(f"Required run rate is {required_rate:.2f} per over.")

    return {
        "match_id": match.get("id"),
        "status": "baseline",
        "method": "rule_based",
        "disclaimer": "These are descriptive summaries, not model-generated predictions.",
        "observations": observations,
    }