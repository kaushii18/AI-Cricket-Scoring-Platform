"""Validated payloads for match-related write operations."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MatchCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    team1: str = Field(min_length=1, max_length=50)
    team2: str = Field(min_length=1, max_length=50)
    overs: Literal[5, 10, 20, 50]
    toss_winner: Literal["team1", "team2"] = Field(alias="tossWinner")
    toss_decision: Literal["bat", "bowl"] = Field(alias="tossDecision")
    team1_players: list[str] = Field(alias="team1Players", min_length=2, max_length=11)
    team2_players: list[str] = Field(alias="team2Players", min_length=2, max_length=11)

    @field_validator("team1", "team2")
    @classmethod
    def trim_team_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Team names cannot be blank.")
        return value

    @field_validator("team1_players", "team2_players")
    @classmethod
    def validate_player_names(cls, values: list[str]) -> list[str]:
        cleaned = [name.strip() for name in values if name.strip()]
        if len(cleaned) < 2:
            raise ValueError("Each team needs at least 2 player names.")
        return cleaned

    @model_validator(mode="after")
    def validate_teams_are_distinct(self) -> "MatchCreateRequest":
        if self.team1.casefold() == self.team2.casefold():
            raise ValueError("The two teams must be different.")
        return self


class BallRecordRequest(BaseModel):
    runs: int = Field(ge=0, le=6)
    wickets: int = Field(default=0, ge=0, le=1)
    display: str | None = Field(default=None, max_length=12)


class ActivePlayersRequest(BaseModel):
    striker_id: str = Field(alias="strikerId", min_length=1)
    non_striker_id: str = Field(alias="nonStrikerId", min_length=1)
    bowler_id: str = Field(alias="bowlerId", min_length=1)

    @model_validator(mode="after")
    def validate_batters_are_distinct(self) -> "ActivePlayersRequest":
        if self.striker_id == self.non_striker_id:
            raise ValueError("Striker and non-striker must be different.")
        return self


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    short_name: str = Field(alias="short_name", min_length=1, max_length=12)

    @field_validator("name", "short_name")
    @classmethod
    def trim_team_fields(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Team name and short name cannot be blank.")
        return value