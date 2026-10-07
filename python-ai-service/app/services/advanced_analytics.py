"""Advanced match facts derived exclusively from CricPulse delivery history."""

from collections import defaultdict
from typing import Any

from app.services.cricket_analytics import calculate_match_analytics


def _number(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _overs(balls: int) -> str:
    return f"{balls // 6}.{balls % 6}"


def analyze_players(match: dict[str, Any]) -> dict[str, Any]:
    """Build batting/bowling figures by replaying recorded deliveries."""
    analytics = calculate_match_analytics(match)
    players: dict[str, dict[str, Any]] = {}
    recent_by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for delivery in match.get("balls") or []:
        if not isinstance(delivery, dict):
            continue
        innings = _number(delivery.get("innings", 1))
        runs = _number(delivery.get("runs"))
        extras = _number(delivery.get("extras"))
        wickets = _number(delivery.get("wickets"))
        legal = delivery.get("legalDelivery", True) is not False
        striker_id = delivery.get("strikerId")
        bowler_id = delivery.get("bowlerId")

        if striker_id:
            batter = players.setdefault(str(striker_id), {
                "id": str(striker_id),
                "name": delivery.get("striker") or "Unknown batter",
                "team": delivery.get("battingTeam"),
                "batting": {
                    "runs": 0,
                    "balls": 0,
                    "fours": 0,
                    "sixes": 0,
                    "boundaries": 0,
                    "dismissals": 0,
                },
                "bowling": {
                    "balls": 0,
                    "runs_conceded": 0,
                    "wickets": 0,
                },
                "recent_form": [],
            })
            batting = batter["batting"]
            batting["runs"] += runs
            batting["balls"] += int(legal)
            batting["fours"] += int(runs == 4)
            batting["sixes"] += int(runs == 6)
            batting["boundaries"] += int(runs in (4, 6))
            if wickets:
                batting["dismissals"] += 1
            if innings == analytics["current_innings"]:
                recent_by_player[str(striker_id)].append({
                    "runs": runs,
                    "balls": int(legal),
                    "wickets": wickets,
                    "display": delivery.get("display"),
                })

        if bowler_id:
            bowler = players.setdefault(str(bowler_id), {
                "id": str(bowler_id),
                "name": delivery.get("bowler") or "Unknown bowler",
                "team": delivery.get("bowlingTeam"),
                "batting": {
                    "runs": 0,
                    "balls": 0,
                    "fours": 0,
                    "sixes": 0,
                    "boundaries": 0,
                    "dismissals": 0,
                },
                "bowling": {
                    "balls": 0,
                    "runs_conceded": 0,
                    "wickets": 0,
                },
                "recent_form": [],
            })
            bowling = bowler["bowling"]
            bowling["balls"] += int(legal)
            bowling["runs_conceded"] += runs + extras
            bowling["wickets"] += wickets

    player_rows = []
    for player in players.values():
        batting = player["batting"]
        bowling = player["bowling"]
        batting_balls = batting["balls"]
        bowling_balls = bowling["balls"]
        batting["strike_rate"] = (
            round(batting["runs"] * 100 / batting_balls, 2)
            if batting_balls
            else None
        )
        bowling["overs"] = _overs(bowling_balls)
        bowling["economy"] = (
            round(bowling["runs_conceded"] * 6 / bowling_balls, 2)
            if bowling_balls
            else None
        )
        player["recent_form"] = recent_by_player.get(player["id"], [])[-6:]
        player_rows.append(player)

    return {
        "match_id": match.get("id"),
        "current_innings": analytics["current_innings"],
        "players": sorted(
            player_rows,
            key=lambda item: (
                item["batting"]["runs"],
                item["bowling"]["wickets"],
            ),
            reverse=True,
        ),
    }


def analyze_momentum(match: dict[str, Any]) -> dict[str, Any]:
    """Summarize recent over outcomes and actual recorded partnerships."""
    analytics = calculate_match_analytics(match)
    innings = analytics["current_innings"]
    current_deliveries = [
        delivery
        for delivery in (match.get("balls") or [])
        if isinstance(delivery, dict)
        and _number(delivery.get("innings", 1)) == innings
    ]

    over_groups: list[dict[str, Any]] = []
    legal_count = 0
    for delivery in current_deliveries:
        over_number = legal_count // 6 + 1
        if not over_groups or over_groups[-1]["over"] != over_number:
            over_groups.append({
                "over": over_number,
                "runs": 0,
                "wickets": 0,
                "boundaries": 0,
                "legal_balls": 0,
            })
        over = over_groups[-1]
        runs = _number(delivery.get("runs"))
        extras = _number(delivery.get("extras"))
        legal = delivery.get("legalDelivery", True) is not False
        over["runs"] += runs + extras
        over["wickets"] += _number(delivery.get("wickets"))
        over["boundaries"] += int(runs in (4, 6))
        if legal:
            over["legal_balls"] += 1
            legal_count += 1

    recent_overs = over_groups[-3:]
    recent_runs = sum(over["runs"] for over in recent_overs)
    recent_wickets = sum(over["wickets"] for over in recent_overs)
    recent_boundaries = sum(over["boundaries"] for over in recent_overs)
    recent_legal_balls = sum(over["legal_balls"] for over in recent_overs)
    recent_run_rate = (
        round(recent_runs * 6 / recent_legal_balls, 2)
        if recent_legal_balls
        else None
    )
    boundary_frequency = (
        round(recent_boundaries / recent_legal_balls, 3)
        if recent_legal_balls
        else None
    )

    partnerships = _partnerships(current_deliveries)
    current_partnership = partnerships[-1] if partnerships else None
    top_partnership = max(partnerships, key=lambda item: item["runs"], default=None)

    if recent_legal_balls == 0:
        label = "Awaiting first delivery"
    elif recent_wickets > 0:
        label = "Bowling pressure"
    elif recent_run_rate is not None and recent_run_rate > analytics["current_run_rate"]:
        label = "Batting momentum"
    elif recent_run_rate is not None and recent_run_rate < analytics["current_run_rate"]:
        label = "Bowling pressure"
    else:
        label = "Even contest"

    return {
        "match_id": match.get("id"),
        "innings": innings,
        "momentum": label,
        "recent_overs": recent_overs,
        "recent_wickets": recent_wickets,
        "recent_boundaries": recent_boundaries,
        "boundary_frequency_per_legal_ball": boundary_frequency,
        "recent_run_rate": recent_run_rate,
        "current_run_rate": analytics["current_run_rate"],
        "required_run_rate": analytics["required_run_rate"],
        "runs_required": analytics["runs_required"],
        "balls_remaining": analytics["balls_remaining"],
        "current_partnership": current_partnership,
        "highest_partnership": top_partnership,
    }


def _partnerships(deliveries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    partnerships: list[dict[str, Any]] = []
    active: dict[str, Any] | None = None

    for delivery in deliveries:
        striker_id = delivery.get("strikerId")
        runner_id = delivery.get("nonStrikerId")
        pair_ids = tuple(sorted(str(value) for value in (striker_id, runner_id) if value))
        if len(pair_ids) != 2:
            continue
        if active is None or active["pair_ids"] != pair_ids:
            active = {
                "pair_ids": pair_ids,
                "batters": sorted({
                    str(delivery.get("striker") or "Unknown batter"),
                    str(delivery.get("nonStriker") or "Unknown batter"),
                }),
                "runs": 0,
                "wickets": 0,
            }
            partnerships.append(active)

        active["runs"] += _number(delivery.get("runs")) + _number(delivery.get("extras"))
        wicket = _number(delivery.get("wickets"))
        active["wickets"] += wicket
        if wicket:
            active = None

    return [
        {
            "batters": partnership["batters"],
            "runs": partnership["runs"],
            "wickets": partnership["wickets"],
        }
        for partnership in partnerships
    ]


def build_match_scorecard(match: dict[str, Any]) -> dict[str, Any]:
    """Build completed-match summary facts directly from saved deliveries."""
    if match.get("status") != "COMPLETED":
        raise ValueError("A match summary is available only after completion.")

    teams = match.get("teams")
    if not isinstance(teams, dict) or not isinstance(match.get("balls"), list):
        raise ValueError("Completed match scorecard data is incomplete.")

    team_rows = []
    for key in ("team1", "team2"):
        team = teams.get(key)
        if not isinstance(team, dict):
            raise ValueError("Completed match scorecard data is incomplete.")
        team_rows.append({
            "name": team.get("name"),
            "runs": _number(team.get("runs")),
            "wickets": _number(team.get("wickets")),
            "balls": _number(team.get("balls")),
            "overs": _overs(_number(team.get("balls"))),
        })

    result = str(match.get("result") or "")
    if not result:
        raise ValueError("Completed match result is unavailable.")

    players = analyze_players(match)["players"]
    batters = [player for player in players if player["batting"]["balls"]]
    bowlers = [player for player in players if player["bowling"]["balls"]]
    best_batter = max(
        batters,
        key=lambda player: player["batting"]["runs"],
        default=None,
    )
    best_bowler = max(
        bowlers,
        key=lambda player: (
            player["bowling"]["wickets"],
            -(player["bowling"]["runs_conceded"]),
        ),
        default=None,
    )
    partnerships = []
    for innings in (1, 2):
        innings_deliveries = [
            delivery for delivery in match["balls"]
            if isinstance(delivery, dict) and _number(delivery.get("innings")) == innings
        ]
        partnerships.extend(
            {**partnership, "innings": innings}
            for partnership in _partnerships(innings_deliveries)
        )
    important_partnership = max(
        partnerships,
        key=lambda item: item["runs"],
        default=None,
    )

    turning_point = None
    best_swing = 0
    for index, delivery in enumerate(match["balls"]):
        if not isinstance(delivery, dict):
            continue
        innings = _number(delivery.get("innings"))
        recent = [
            item for item in match["balls"][: index + 1]
            if isinstance(item, dict) and _number(item.get("innings")) == innings
        ][-6:]
        wickets = sum(_number(item.get("wickets")) for item in recent)
        runs = sum(
            _number(item.get("runs")) + _number(item.get("extras"))
            for item in recent
        )
        swing = wickets * 6 + runs
        if swing > best_swing and (wickets or any(
            _number(item.get("runs")) in (4, 6) for item in recent
        )):
            best_swing = swing
            turning_point = {
                "innings": innings,
                "over": _number(delivery.get("number", index + 1)) - 1,
                "recent_runs": runs,
                "recent_wickets": wickets,
                "delivery": delivery.get("display"),
            }

    winner = None
    if len(team_rows) == 2 and team_rows[0]["runs"] != team_rows[1]["runs"]:
        winner = max(team_rows, key=lambda team: team["runs"])["name"]

    return {
        "match_id": match.get("id"),
        "result": result,
        "winner": winner,
        "teams": team_rows,
        "best_batter": _player_summary(best_batter, "batting") if best_batter else None,
        "best_bowler": _player_summary(best_bowler, "bowling") if best_bowler else None,
        "important_partnership": important_partnership,
        "turning_point": turning_point,
    }


def _player_summary(player: dict[str, Any], discipline: str) -> dict[str, Any]:
    return {
        "name": player["name"],
        "team": player["team"],
        **player[discipline],
    }


def analyze_tournament(matches: list[dict[str, Any]], minimum_matches: int = 5) -> dict[str, Any]:
    """Summarize a real tournament only when records identify one explicitly."""
    tournament_matches: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for match in matches:
        tournament_id = (
            match.get("tournamentId")
            or match.get("tournament_id")
            or match.get("competitionId")
            or match.get("competition_id")
            or match.get("tournament")
        )
        if isinstance(tournament_id, str) and tournament_id.strip():
            tournament_matches[tournament_id.strip()].append(match)

    eligible = [
        (tournament_id, records)
        for tournament_id, records in tournament_matches.items()
        if len([record for record in records if record.get("status") == "COMPLETED"])
        >= minimum_matches
    ]
    if not eligible:
        identified_count = sum(map(len, tournament_matches.values()))
        return {
            "available": False,
            "reason": (
                "No tournament identifiers are present in saved match records."
                if identified_count == 0
                else f"At least {minimum_matches} completed matches per identified tournament are required."
            ),
            "tournaments": [],
        }

    summaries = []
    for tournament_id, records in eligible:
        completed = [record for record in records if record.get("status") == "COMPLETED"]
        team_stats: dict[str, dict[str, int]] = defaultdict(
            lambda: {"played": 0, "wins": 0, "runs": 0, "wickets": 0}
        )
        player_stats: dict[str, dict[str, Any]] = {}
        for match in completed:
            scorecard = build_match_scorecard(match)
            for team in scorecard["teams"]:
                stats = team_stats[team["name"]]
                stats["played"] += 1
                stats["runs"] += team["runs"]
                stats["wickets"] += team["wickets"]
                if team["name"] == scorecard["winner"]:
                    stats["wins"] += 1
            for player in analyze_players(match)["players"]:
                stats = player_stats.setdefault(player["id"], {
                    "name": player["name"],
                    "team": player["team"],
                    "runs": 0,
                    "balls": 0,
                    "wickets": 0,
                    "runs_conceded": 0,
                })
                for key in ("runs", "balls"):
                    stats[key] += player["batting"][key]
                stats["wickets"] += player["bowling"]["wickets"]
                stats["runs_conceded"] += player["bowling"]["runs_conceded"]

        player_rows = list(player_stats.values())
        summaries.append({
            "tournament_id": tournament_id,
            "completed_matches": len(completed),
            "run_leaders": sorted(
                player_rows,
                key=lambda player: player["runs"],
                reverse=True,
            )[:5],
            "wicket_leaders": sorted(
                player_rows,
                key=lambda player: player["wickets"],
                reverse=True,
            )[:5],
            "teams": [
                {
                    "name": name,
                    **stats,
                    "win_percentage": round(stats["wins"] * 100 / stats["played"], 2),
                }
                for name, stats in sorted(
                    team_stats.items(),
                    key=lambda item: item[1]["wins"],
                    reverse=True,
                )
            ],
        })
    return {"available": True, "reason": None, "tournaments": summaries}