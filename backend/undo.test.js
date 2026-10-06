const test = require("node:test");
const assert = require("node:assert/strict");
const { undoLegacyDelivery } = require("./undo");

function createPlayer(id, name) {
    return {
        id,
        name,
        battingOrder: 1,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        wickets: 0,
        bowlerBalls: 0,
        runsConceded: 0,
        out: false
    };
}

function createLegacyMatch() {
    return {
        overs: 5,
        status: "LIVE",
        result: null,
        currentInnings: 1,
        battingTeam: "Falcons",
        bowlingTeam: "Tigers",
        target: null,
        teams: {
            team1: {
                name: "Falcons",
                runs: 5,
                extras: 1,
                wickets: 0,
                balls: 1,
                players: [createPlayer("batter", "Batter")]
            },
            team2: {
                name: "Tigers",
                runs: 0,
                extras: 0,
                wickets: 0,
                balls: 0,
                players: [createPlayer("bowler", "Bowler")]
            }
        },
        activePlayers: {},
        balls: [
            {
                innings: 1,
                battingTeam: "Falcons",
                bowlingTeam: "Tigers",
                strikerId: "batter",
                nonStrikerId: "runner",
                bowlerId: "bowler",
                runs: 4,
                extras: 0,
                wickets: 0,
                legalDelivery: true
            },
            {
                innings: 1,
                battingTeam: "Falcons",
                bowlingTeam: "Tigers",
                strikerId: "batter",
                nonStrikerId: "runner",
                bowlerId: "bowler",
                runs: 0,
                extras: 1,
                wickets: 0,
                legalDelivery: false
            }
        ],
        undoStack: []
    };
}

test("undoes the latest delivery when a legacy match has no snapshots", () => {
    const match = createLegacyMatch();

    assert.equal(undoLegacyDelivery(match), null);
    assert.equal(match.balls.length, 1);
    assert.equal(match.teams.team1.runs, 4);
    assert.equal(match.teams.team1.extras, 0);
    assert.equal(match.teams.team1.balls, 1);
    assert.equal(match.teams.team1.players[0].runs, 4);
    assert.equal(match.teams.team1.players[0].balls, 1);
    assert.equal(match.teams.team2.players[0].runsConceded, 4);
    assert.deepEqual(match.activePlayers, {
        strikerId: "batter",
        nonStrikerId: "runner",
        bowlerId: "bowler"
    });
});

test("undoing an innings-ending ball returns the match to the first innings", () => {
    const match = createLegacyMatch();
    match.currentInnings = 2;
    match.battingTeam = "Tigers";
    match.bowlingTeam = "Falcons";
    match.target = 8;
    match.teams.team1.runs = 7;
    match.teams.team1.balls = 6;
    match.teams.team1.players[0].runs = 0;
    match.teams.team1.players[0].balls = 0;
    match.balls = Array.from({ length: 6 }, (_, index) => ({
        innings: 1,
        battingTeam: "Falcons",
        bowlingTeam: "Tigers",
        strikerId: "batter",
        nonStrikerId: "runner",
        bowlerId: "bowler",
        runs: index === 5 ? 2 : 1,
        extras: 0,
        wickets: 0,
        legalDelivery: true
    }));

    assert.equal(undoLegacyDelivery(match), null);
    assert.equal(match.currentInnings, 1);
    assert.equal(match.battingTeam, "Falcons");
    assert.equal(match.bowlingTeam, "Tigers");
    assert.equal(match.target, null);
    assert.equal(match.teams.team1.runs, 5);
    assert.equal(match.teams.team1.balls, 5);
    assert.equal(match.teams.team1.players[0].runs, 5);
});