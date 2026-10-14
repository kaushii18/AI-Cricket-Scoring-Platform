const express = require("express");
const path = require("path");
const http = require("http");
const { randomInt, randomUUID } = require("crypto");
const { Server } = require("socket.io");
const supabase = require("./supabase");
const {
    createMatchStore,
    MatchArchiveImportError,
    mergeImportedMatches
} = require("./match-store");
const { undoLegacyDelivery } = require("./undo");
const {
    analyzeMatch,
    analyzeMatchMomentum,
    analyzePlayers,
    analyzeTournament,
    checkAiHealth,
    getPredictionHistory,
    predictMatchWin,
    requestMatchInsights,
    summarizeMatch
} = require("./ai-service");

const app = express();

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const io = new Server(httpServer);

const FRONTEND_DIRECTORY = path.join(
    __dirname,
    "../frontend"
);

const DATA_DIRECTORY = path.join(
    __dirname,
    "data"
);

const MATCHES_FILE = path.join(
    DATA_DIRECTORY,
    "matches.json"
);

const VALID_OVERS = new Set(Array.from({ length: 50 }, (_, i) => i + 1));

const AI_INSIGHTS_TIMEOUT_MS = Number(process.env.AI_INSIGHTS_TIMEOUT_MS) || 25000;

app.use(
    express.json({
        limit: "12mb"
    })
);

// =====================================================
// FILE DATABASE
// =====================================================

const matchStore = createMatchStore(MATCHES_FILE);
const { readMatches, saveMatches } = matchStore;


// =====================================================
// HELPERS
// =====================================================

function battingTeamKeyForMatch(match) {

    return match.battingTeam === match.team1
        ? "team1"
        : "team2";

}


function bowlingTeamKeyForMatch(match) {

    return match.bowlingTeam === match.team1
        ? "team1"
        : "team2";

}


function createPlayer(name, index) {

    return {

        id: randomUUID(),

        name,

        battingOrder: index + 1,

        runs: 0,

        balls: 0,

        fours: 0,

        sixes: 0,

        wickets: 0,

        bowlerBalls: 0,

        runsConceded: 0,

        out: false,

        dismissalText: "not out"

    };

}


function preparePlayers(players) {

    if (!Array.isArray(players)) {
        return [];
    }

    return players
        .map((player) => {

            if (typeof player === "string") {
                return player.trim();
            }

            if (
                player &&
                typeof player.name === "string"
            ) {
                return player.name.trim();
            }

            return "";

        })
        .filter(Boolean)
        .slice(0, 15)
        .map(createPlayer);

}


function resetPlayers(players) {

    return players.map((player) => {

        return {

            ...player,

            runs: 0,

            balls: 0,

            fours: 0,

            sixes: 0,

            wickets: 0,

            bowlerBalls: 0,

            runsConceded: 0,

            out: false,

            dismissalText: "not out"

        };

    });

}


function formatDismissal(type, bowlerName, fielderName) {
    switch (type) {
        case "bowled":
            return bowlerName ? `b ${bowlerName}` : "bowled";
        case "caught":
            return fielderName ? `c ${fielderName} b ${bowlerName}` : `c & b ${bowlerName}`;
        case "lbw":
            return bowlerName ? `lbw b ${bowlerName}` : "lbw";
        case "stumped":
            return fielderName ? `st ${fielderName} b ${bowlerName}` : `st b ${bowlerName}`;
        case "run-out":
            return fielderName ? `run out (${fielderName})` : `run out`;
        case "hit-wicket":
            return bowlerName ? `hit wicket b ${bowlerName}` : "hit wicket";
        case "retired":
            return "retired hurt";
        default:
            return bowlerName ? `b ${bowlerName}` : "out";
    }
}


function getBallDisplay(runs, extras, extraType, wickets) {
    if (wickets) {
        if (extraType === "wide") return "W+wd";
        if (extraType === "no-ball") return "W+nb";
        return "W";
    }
    if (extraType === "wide") {
        return extras > 1 ? `${extras}wd` : "WD";
    }
    if (extraType === "no-ball") {
        return runs > 0 ? `${runs}nb` : (extras > 1 ? `${extras}nb` : "NB");
    }
    if (extraType === "bye") {
        return `${extras}b`;
    }
    if (extraType === "leg-bye") {
        return `${extras}lb`;
    }
    return String(runs);
}


function getTeam(match, key) {

    return match.teams[key];

}


function getBattingTeam(match) {

    return match.teams[
        battingTeamKeyForMatch(match)
    ];

}


function getBowlingTeam(match) {

    return match.teams[
        bowlingTeamKeyForMatch(match)
    ];

}


function getPlayer(team, playerId) {

    return team.players.find(
        (player) =>
            player.id === playerId
    );

}


function getAvailableBatters(team) {

    return team.players.filter(
        (player) =>
            !player.out
    );

}


function getNextAvailableBatter(
    team,
    excludeIds = []
) {

    return team.players.find(
        (player) =>
            !player.out &&
            !excludeIds.includes(player.id)
    );

}


function initializeInnings(match) {

    const battingTeam =
        getBattingTeam(match);

    const bowlingTeam =
        getBowlingTeam(match);

    battingTeam.fallOfWickets = battingTeam.fallOfWickets || [];
    battingTeam.partnerships = battingTeam.partnerships || [];
    battingTeam.oversHistory = battingTeam.oversHistory || [];

    const availableBatters =
        getAvailableBatters(
            battingTeam
        );

    const bowler =
        bowlingTeam.players[0];

    const striker = availableBatters[0] || null;
    const nonStriker = availableBatters[1] || null;

    match.activePlayers = {

        strikerId:
            striker?.id ||
            null,

        nonStrikerId:
            nonStriker?.id ||
            null,

        bowlerId:
            bowler?.id ||
            null

    };

    match.currentPartnership = {
        batter1Id: striker?.id || null,
        batter1Name: striker?.name || "Striker",
        batter1Runs: 0,
        batter2Id: nonStriker?.id || null,
        batter2Name: nonStriker?.name || "Non-Striker",
        batter2Runs: 0,
        runs: 0,
        balls: 0
    };

    match.currentOverBalls = [];

}


function calculateRunRate(
    runs,
    balls
) {

    if (!balls) {
        return 0;
    }

    return Number(
        (
            runs /
            (balls / 6)
        ).toFixed(2)
    );

}


function calculateRequiredRate(
    target,
    currentRuns,
    balls,
    maximumBalls
) {

    const runsNeeded =
        Math.max(
            0,
            target - currentRuns
        );

    const ballsRemaining =
        Math.max(
            0,
            maximumBalls - balls
        );

    if (runsNeeded <= 0) {
        return 0;
    }

    if (ballsRemaining <= 0) {
        return null;
    }

    return Number(
        (
            runsNeeded /
            (ballsRemaining / 6)
        ).toFixed(2)
    );

}


// =====================================================
// CREATE MATCH
// =====================================================

function createMatch(data) {

    const {
        team1,
        team2,
        overs,
        team1Captain,
        team2Captain,
        team1Players,
        team2Players
    } = data;

    const now =
        new Date().toISOString();


    const players1 =
        preparePlayers(
            team1Players
        );


    const players2 =
        preparePlayers(
            team2Players
        );


    const match = {

        id: randomUUID(),

        team1,

        team2,

        overs,

        team1Captain,

        team2Captain,

        tossCaller: null,

        tossCallerTeam: null,

        tossCallerTeamKey: null,

        tossCall: null,

        tossResult: null,

        tossWinner: null,

        tossWinnerName: null,

        tossDecision: null,

        battingTeam: null,

        bowlingTeam: null,

        currentInnings: 1,

        status: "TOSS_PENDING",

        teams: {

            team1: {

                name: team1,

                runs: 0,

                extras: 0,

                wickets: 0,

                balls: 0,

                players: players1,

                fallOfWickets: [],

                partnerships: [],

                oversHistory: []

            },

            team2: {

                name: team2,

                runs: 0,

                extras: 0,

                wickets: 0,

                balls: 0,

                players: players2,

                fallOfWickets: [],

                partnerships: [],

                oversHistory: []

            }

        },

        activePlayers: {

            strikerId: null,

            nonStrikerId: null,

            bowlerId: null

        },

        currentPartnership: null,

        currentOverBalls: [],

        innings1Data: null,

        innings2Data: null,

        balls: [],

        recentBalls: [],

        undoStack: [],

        target: null,

        result: null,

        createdAt: now,

        updatedAt: now

    };


    return match;

}


// =====================================================
// VALIDATE MATCH
// =====================================================

function validateMatchInput(body) {

    const team1 =
        typeof body.team1 === "string"
            ? body.team1.trim()
            : "";


    const team2 =
        typeof body.team2 === "string"
            ? body.team2.trim()
            : "";


    const overs =
        Number(body.overs);

    const team1Captain =
    typeof body.team1Captain === "string"
        ? body.team1Captain.trim().slice(0, 80)
        : "";

    const team2Captain =
    typeof body.team2Captain === "string"
        ? body.team2Captain.trim().slice(0, 80)
        : "";


    const team1Players =
        Array.isArray(body.team1Players)
            ? body.team1Players
            : [];


    const team2Players =
        Array.isArray(body.team2Players)
            ? body.team2Players
            : [];


    if (!team1 || !team2) {

        return {
            error:
                "Both team names are required."
        };

    }


    if (
        team1.toLowerCase() ===
        team2.toLowerCase()
    ) {

        return {
            error:
                "The two teams must be different."
        };

    }


    if (!Number.isInteger(overs) || overs < 1 || overs > 50) {

        return {
            error:
                "Overs must be a whole number between 1 and 50."
        };

    }


    if (
        team1Players.length < 2 ||
        team2Players.length < 2
    ) {

        return {
            error:
                "Each team needs at least 2 players."
        };

    }


    return {

        value: {

            team1,

            team2,

            overs,

            team1Captain,

            team2Captain,

            team1Players,

            team2Players

        }

    };

}


// =====================================================
// HEALTH
// =====================================================

function findSavedMatchForAi(request, response) {
    const matchId = request.body?.matchId;
    if (typeof matchId !== "string" || !matchId.trim()) {
        response.status(400).json({ message: "A saved matchId is required." });
        return null;
    }

    const match = readMatches().find((item) => item.id === matchId);
    if (!match) {
        response.status(404).json({ message: "Match not found." });
        return null;
    }

    return match;
}


function respondWithAiResult(response, result, resultKey) {
    if (!result.available) {
        const statusCode = result.upstream_status === 422 ? 422 : 503;
        return response.status(statusCode).json(result);
    }

    return response.json(result[resultKey]);
}

app.get(
    "/api/health",
    (request, response) => {

        response.json({
            status: "ok"
        });

    }
);


app.get(
    "/api/ai/health",
    async (request, response) => {

        const health = await checkAiHealth();

        return response
            .status(health.available ? 200 : 503)
            .json(health);

    }
);


app.post(
    "/api/ai/analyze/match",
    async (request, response) => {

        const match = findSavedMatchForAi(request, response);
        if (!match) return;

        const result = await analyzeMatch(match);
        return respondWithAiResult(response, result, "analysis");

    }
);


app.post(
    "/api/ai/predict/win",
    async (request, response) => {

        const match = findSavedMatchForAi(request, response);
        if (!match) return;

        const result = await predictMatchWin(match);
        return respondWithAiResult(response, result, "prediction");

    }
);


app.post(
    "/api/ai/insights",
    async (request, response) => {

        const match = findSavedMatchForAi(request, response);
        if (!match) return;

        const result = await requestMatchInsights(match, {
            timeoutMs: AI_INSIGHTS_TIMEOUT_MS
        });
        return respondWithAiResult(response, result, "insights");

    }
);


app.post(
    "/api/ai/momentum",
    async (request, response) => {
        const match = findSavedMatchForAi(request, response);
        if (!match) return;
        const result = await analyzeMatchMomentum(match);
        return respondWithAiResult(response, result, "analysis");
    }
);


app.post(
    "/api/ai/player-analysis",
    async (request, response) => {
        const match = findSavedMatchForAi(request, response);
        if (!match) return;
        const result = await analyzePlayers(match);
        return respondWithAiResult(response, result, "analysis");
    }
);


app.post(
    "/api/ai/match-summary",
    async (request, response) => {
        const match = findSavedMatchForAi(request, response);
        if (!match) return;
        const result = await summarizeMatch(match);
        return respondWithAiResult(response, result, "summary");
    }
);


app.get(
    "/api/ai/prediction-history/:id",
    async (request, response) => {
        const match = readMatches().find(
            (item) => item.id === request.params.id
        );
        if (!match) {
            return response.status(404).json({ message: "Match not found." });
        }
        const result = await getPredictionHistory(match.id);
        return respondWithAiResult(response, result, "history");
    }
);


app.get(
    "/api/ai/tournament",
    async (request, response) => {
        const result = await analyzeTournament(readMatches());
        return respondWithAiResult(response, result, "analytics");
    }
);


// =====================================================
// SUPABASE TEAMS
// =====================================================

app.get(
    "/api/teams",
    async (request, response) => {

        try {

            const result =
                await supabase
                    .from("teams")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: true
                        }
                    );


            if (result.error) {

                return response
                    .status(500)
                    .json({

                        message:
                            "Unable to load teams.",

                        error:
                            result.error.message

                    });

            }


            return response.json(
                result.data || []
            );

        } catch (error) {

            return response
                .status(500)
                .json({

                    message:
                        "Unable to load teams.",

                    error:
                        error.message

                });

        }

    }
);


app.post(
    "/api/teams",
    async (request, response) => {

        try {

            const body =
                request.body || {};


            const name =
                typeof body.name === "string"
                    ? body.name.trim()
                    : "";


            const shortName =
                typeof body.short_name === "string"
                    ? body.short_name.trim()
                    : "";


            if (!name || !shortName) {

                return response
                    .status(400)
                    .json({

                        message:
                            "Team name and short name are required."

                    });

            }


            const result =
                await supabase
                    .from("teams")
                    .insert({

                        name,

                        short_name:
                            shortName

                    })
                    .select("*")
                    .single();


            if (result.error) {

                return response
                    .status(500)
                    .json({

                        message:
                            "Unable to create team.",

                        error:
                            result.error.message

                    });

            }


            return response
                .status(201)
                .json(
                    result.data
                );

        } catch (error) {

            return response
                .status(500)
                .json({

                    message:
                        "Unable to create team.",

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// GET ALL MATCHES
// =====================================================

app.get(
    "/api/matches",
    (request, response) => {

        response.json(
            readMatches()
        );

    }
);

app.get(
    "/api/matches/export",
    (request, response) => {
        const matches = readMatches();
        const date = new Date().toISOString().slice(0, 10);

        response
            .type("application/json")
            .attachment(`cricpulse-matches-${date}.json`)
            .send(JSON.stringify(matches, null, 2));
    }
);


app.post(
    "/api/matches/import",
    (request, response) => {
        let imported;
        try {
            imported = mergeImportedMatches(
                readMatches(),
                request.body?.matches
            );
        } catch (error) {
            if (error instanceof MatchArchiveImportError) {
                return response.status(error.statusCode).json({
                    message: error.message
                });
            }

            throw error;
        }

        saveMatches(imported.matches);
        io.emit("matches:imported", {
            importedCount: imported.importedCount
        });

        return response.status(201).json({
            importedCount: imported.importedCount
        });
    }
);


// =====================================================
// GET ONE MATCH
// =====================================================

app.get(
    "/api/matches/:id",
    (request, response) => {

        const matches =
            readMatches();


        const match =
            matches.find(
                (item) =>
                    item.id ===
                    request.params.id
            );


        if (!match) {

            return response
                .status(404)
                .json({

                    message:
                        "Match not found."

                });

        }


        response.json(match);

    }
);


// =====================================================
// CREATE MATCH API
// =====================================================

app.post(
    "/api/matches",
    (request, response) => {

        const validation =
            validateMatchInput(
                request.body || {}
            );


        if (validation.error) {

            return response
                .status(400)
                .json({

                    message:
                        validation.error

                });

        }


        const matches =
            readMatches();


        const match =
            createMatch(
                validation.value
            );


        matches.unshift(match);


        saveMatches(matches);


        io.emit(
            "match:created",
            match
        );


        response
            .status(201)
            .json(match);

    }
);


// =====================================================
// FLIP MATCH TOSS
// =====================================================

app.post(
    "/api/matches/:id/toss/flip",
    (request, response) => {

        const matches =
            readMatches();

        const match =
            matches.find(
                (item) =>
                    item.id ===
                    request.params.id
            );

        if (!match) {
            return response
                .status(404)
                .json({
                    message: "Match not found."
                });
        }

        if (match.status !== "TOSS_PENDING") {
            return response
                .status(409)
                .json({
                    message: "The match toss can no longer be changed."
                });
        }

        if (match.tossResult) {
            return response
                .status(409)
                .json({
                    message: "The coin has already been flipped. Reload the saved match state."
                });
        }

        const { callerTeam, call } =
            request.body || {};

        if (
            callerTeam !== "team1" &&
            callerTeam !== "team2"
        ) {
            return response
                .status(400)
                .json({
                    message: "Choose which captain will call the toss."
                });
        }

        if (call !== "heads" && call !== "tails") {
            return response
                .status(400)
                .json({
                    message: "The toss call must be heads or tails."
                });
        }

        const callerTeamName =
            callerTeam === "team1"
                ? match.team1
                : match.team2;

        const tossCaller =
            callerTeam === "team1"
                ? match.team1Captain
                : match.team2Captain;

        const tossResult =
            randomInt(0, 2) === 0
                ? "heads"
                : "tails";

        const tossWinner =
            tossResult === call
                ? callerTeam
                : callerTeam === "team1"
                    ? "team2"
                    : "team1";

        match.tossCaller =
            tossCaller || `${callerTeamName} captain`;

        match.tossCallerTeam =
            callerTeamName;

        match.tossCallerTeamKey =
            callerTeam;

        match.tossCall =
            call;

        match.tossResult =
            tossResult;

        match.tossWinner =
            tossWinner;

        match.tossWinnerName =
            tossWinner === "team1"
                ? match.team1
                : match.team2;

        match.updatedAt =
            new Date().toISOString();

        saveMatches(matches);

        io.emit(
            "match:update",
            match
        );

        return response.json(match);
    }
);


// =====================================================
// SAVE TOSS WINNER DECISION
// =====================================================

app.post(
    "/api/matches/:id/toss/decision",
    (request, response) => {

        const matches =
            readMatches();

        const match =
            matches.find(
                (item) =>
                    item.id ===
                    request.params.id
            );

        if (!match) {
            return response
                .status(404)
                .json({
                    message: "Match not found."
                });
        }

        const { actorTeam, decision } =
            request.body || {};

        if (match.tossResult !== "heads" && match.tossResult !== "tails") {
            return response
                .status(409)
                .json({
                    message: "Flip the coin before choosing to bat or bowl."
                });
        }

        if (actorTeam !== match.tossWinner) {
            return response
                .status(403)
                .json({
                    message: "Only the toss-winning team can choose to bat or bowl."
                });
        }

        if (decision !== "bat" && decision !== "bowl") {
            return response
                .status(400)
                .json({
                    message: "Choose whether the toss-winning team will bat or bowl."
                });
        }

        if (match.tossDecision) {
            if (match.tossDecision === decision) {
                return response.json(match);
            }

            return response
                .status(409)
                .json({
                    message: "The toss-winning team has already made its decision."
                });
        }

        if (match.status !== "TOSS_PENDING") {
            return response
                .status(409)
                .json({
                    message: "The match toss can no longer be changed."
                });
        }

        match.tossDecision =
            decision;

        const opposingTeam =
            match.tossWinner === "team1"
                ? "team2"
                : "team1";

        match.battingTeam =
            decision === "bat"
                ? match.tossWinnerName
                : opposingTeam === "team1"
                    ? match.team1
                    : match.team2;

        match.bowlingTeam =
            match.battingTeam === match.team1
                ? match.team2
                : match.team1;

        match.status =
            "LIVE";

        initializeInnings(match);

        match.updatedAt =
            new Date().toISOString();

        saveMatches(matches);

        io.emit(
            "match:update",
            match
        );

        return response.json(match);
    }
);


// =====================================================
// RECORD BALL
// =====================================================

app.post(
    "/api/matches/:id/balls",
    (request, response) => {

        const matches =
            readMatches();


        const match =
            matches.find(
                (item) =>
                    item.id ===
                    request.params.id
            );


        if (!match) {

            return response
                .status(404)
                .json({

                    message:
                        "Match not found."

                });

        }


        if (match.status !== "LIVE") {

            return response
                .status(400)
                .json({

                    message:
                        "This match is not live."

                });

        }


        const runs =
            Number(request.body.runs ?? 0);

        const wickets =
            Number(request.body.wickets ?? 0);

        let extras =
            Number(request.body.extras ?? 0);

        let extraType =
            request.body.extraType ?? null;

        if (extraType === "none" || extraType === "") {
            extraType = null;
        }

        const strikerId =
            request.body.strikerId ||
            match.activePlayers?.strikerId;

        const nonStrikerId =
            request.body.nonStrikerId ||
            match.activePlayers?.nonStrikerId;

        const bowlerId =
            request.body.bowlerId ||
            match.activePlayers?.bowlerId;

        if (
            !Number.isInteger(runs) ||
            runs < 0 ||
            runs > 7
        ) {
            return response
                .status(400)
                .json({
                    message: "Runs must be between 0 and 7."
                });
        }

        if (
            !Number.isInteger(wickets) ||
            wickets < 0 ||
            wickets > 1
        ) {
            return response
                .status(400)
                .json({
                    message: "Invalid wicket value."
                });
        }

        if (
            !Number.isInteger(extras) ||
            extras < 0 ||
            extras > 7
        ) {
            return response
                .status(400)
                .json({
                    message: "Extras must be between 0 and 7."
                });
        }

        const validExtraTypes = new Set(["wide", "no-ball", "bye", "leg-bye"]);
        if (extraType !== null && !validExtraTypes.has(extraType)) {
            return response
                .status(400)
                .json({
                    message: "Choose a valid extra type (wide, no-ball, bye, leg-bye)."
                });
        }

        if ((extraType === "wide" || extraType === "no-ball") && extras < 1) {
            extras = 1;
        }

        if ((extraType === "bye" || extraType === "leg-bye") && extras < 1 && runs > 0) {
            extras = runs;
        }

        const legalDelivery =
            extraType === null || extraType === "bye" || extraType === "leg-bye";

        const battingTeam =
            getBattingTeam(match);

        const bowlingTeam =
            getBowlingTeam(match);

        const striker =
            getPlayer(battingTeam, strikerId);

        const nonStriker =
            getPlayer(battingTeam, nonStrikerId);

        const bowler =
            getPlayer(bowlingTeam, bowlerId);

        if (!striker) {
            return response
                .status(400)
                .json({ message: "Select a valid striker." });
        }

        if (!nonStriker) {
            return response
                .status(400)
                .json({ message: "Select a valid non-striker." });
        }

        if (!bowler) {
            return response
                .status(400)
                .json({ message: "Select a valid bowler." });
        }

        if (striker.out || nonStriker.out) {
            return response
                .status(400)
                .json({ message: "A dismissed batter cannot bat." });
        }

        const maximumBalls =
            match.overs * 6;

        if (battingTeam.balls >= maximumBalls) {
            return response
                .status(400)
                .json({ message: "Maximum overs completed." });
        }

        const maxWickets = Math.max(1, (battingTeam.players?.length || 11) - 1);
        if (battingTeam.wickets >= maxWickets) {
            return response
                .status(400)
                .json({ message: "All wickets are down." });
        }

        if (!Array.isArray(match.undoStack)) {
            match.undoStack = [];
        }

        match.undoStack.push({
            teams: JSON.parse(JSON.stringify(match.teams)),
            activePlayers: JSON.parse(JSON.stringify(match.activePlayers)),
            status: match.status,
            currentInnings: match.currentInnings,
            battingTeam: match.battingTeam,
            bowlingTeam: match.bowlingTeam,
            target: match.target,
            result: match.result,
            currentPartnership: match.currentPartnership ? JSON.parse(JSON.stringify(match.currentPartnership)) : null,
            currentOverBalls: JSON.parse(JSON.stringify(match.currentOverBalls || [])),
            innings1Data: match.innings1Data ? JSON.parse(JSON.stringify(match.innings1Data)) : null,
            innings2Data: match.innings2Data ? JSON.parse(JSON.stringify(match.innings2Data)) : null
        });

        // -------------------------------------------------
        // BATTING & BOWLING STATS UPDATES
        // -------------------------------------------------
        if (extraType === "wide") {
            bowler.runsConceded += extras;
            battingTeam.runs += extras;
            battingTeam.extras = (battingTeam.extras || 0) + extras;
        } else if (extraType === "no-ball") {
            striker.runs += runs;
            striker.balls += 1;
            if (runs === 4) striker.fours += 1;
            if (runs === 6) striker.sixes += 1;

            bowler.runsConceded += (extras + runs);
            battingTeam.runs += (runs + extras);
            battingTeam.extras = (battingTeam.extras || 0) + extras;
        } else if (extraType === "bye" || extraType === "leg-bye") {
            striker.balls += 1;
            bowler.bowlerBalls += 1;
            battingTeam.runs += extras;
            battingTeam.extras = (battingTeam.extras || 0) + extras;
            battingTeam.balls += 1;
        } else {
            striker.runs += runs;
            striker.balls += 1;
            if (runs === 4) striker.fours += 1;
            if (runs === 6) striker.sixes += 1;

            bowler.bowlerBalls += 1;
            bowler.runsConceded += runs;
            battingTeam.runs += runs;
            battingTeam.balls += 1;
        }

        // -------------------------------------------------
        // STRIKE ROTATION & WICKETS
        // -------------------------------------------------
        let nextStriker = striker;
        let nextNonStriker = nonStriker;

        if (wickets === 1) {
            const dismissal = request.body.dismissal || {};
            const dismissalType = dismissal.type || "bowled";
            const outBatterId = dismissal.outBatterId || striker.id;
            const outBatter = (outBatterId === nonStriker.id) ? nonStriker : striker;
            const survivingBatter = (outBatter.id === striker.id) ? nonStriker : striker;

            outBatter.out = true;
            outBatter.dismissalType = dismissalType;
            outBatter.dismissalText = formatDismissal(dismissalType, bowler.name, dismissal.fielderName);

            battingTeam.wickets += 1;

            if (dismissalType !== "run-out" && dismissalType !== "retired") {
                bowler.wickets += 1;
            }

            battingTeam.fallOfWickets = battingTeam.fallOfWickets || [];
            battingTeam.fallOfWickets.push({
                wicket: battingTeam.wickets,
                score: battingTeam.runs,
                overs: `${Math.floor(battingTeam.balls / 6)}.${battingTeam.balls % 6}`,
                batterName: outBatter.name,
                batterId: outBatter.id,
                dismissalText: outBatter.dismissalText
            });

            battingTeam.partnerships = battingTeam.partnerships || [];
            if (match.currentPartnership) {
                battingTeam.partnerships.push({
                    wicket: battingTeam.wickets,
                    runs: match.currentPartnership.runs,
                    balls: match.currentPartnership.balls,
                    batter1Name: match.currentPartnership.batter1Name,
                    batter1Runs: match.currentPartnership.batter1Runs,
                    batter2Name: match.currentPartnership.batter2Name,
                    batter2Runs: match.currentPartnership.batter2Runs
                });
            }

            const newBatter = dismissal.nextBatterId
                ? getPlayer(battingTeam, dismissal.nextBatterId)
                : getNextAvailableBatter(battingTeam, [striker.id, nonStriker.id]);

            if (outBatter.id === striker.id) {
                nextStriker = newBatter || null;
                nextNonStriker = survivingBatter;
            } else {
                nextStriker = survivingBatter;
                nextNonStriker = newBatter || null;
            }

            if (newBatter) {
                match.currentPartnership = {
                    batter1Id: survivingBatter.id,
                    batter1Name: survivingBatter.name,
                    batter1Runs: 0,
                    batter2Id: newBatter.id,
                    batter2Name: newBatter.name,
                    batter2Runs: 0,
                    runs: 0,
                    balls: 0
                };
            }
        } else {
            match.currentPartnership = match.currentPartnership || {
                batter1Id: striker.id,
                batter1Name: striker.name,
                batter1Runs: 0,
                batter2Id: nonStriker.id,
                batter2Name: nonStriker.name,
                batter2Runs: 0,
                runs: 0,
                balls: 0
            };

            const runsAdded = (extraType === "bye" || extraType === "leg-bye") ? extras : (extraType === "wide" ? extras : (runs + extras));
            match.currentPartnership.runs += runsAdded;
            if (legalDelivery) {
                match.currentPartnership.balls += 1;
            }
            if (striker.id === match.currentPartnership.batter1Id) {
                match.currentPartnership.batter1Runs += runs;
            } else if (striker.id === match.currentPartnership.batter2Id) {
                match.currentPartnership.batter2Runs += runs;
            }

            let physicalRuns = runs;
            if (extraType === "bye" || extraType === "leg-bye") {
                physicalRuns = extras;
            } else if (extraType === "wide" && extras > 1) {
                physicalRuns = extras - 1;
            }
            if (physicalRuns % 2 === 1) {
                const temp = nextStriker;
                nextStriker = nextNonStriker;
                nextNonStriker = temp;
            }
        }

        // -------------------------------------------------
        // BALL LOGGING & OVER END
        // -------------------------------------------------
        const ballDisplay = typeof request.body.display === "string"
            ? request.body.display
            : getBallDisplay(runs, extras, extraType, wickets);

        const ballNumber = match.balls.length + 1;
        const ball = {
            number: ballNumber,
            innings: match.currentInnings,
            battingTeam: battingTeam.name,
            bowlingTeam: bowlingTeam.name,
            striker: striker.name,
            nonStriker: nonStriker.name,
            bowler: bowler.name,
            strikerId: striker.id,
            nonStrikerId: nonStriker.id,
            bowlerId: bowler.id,
            runs,
            extras,
            extraType,
            legalDelivery,
            wickets,
            display: ballDisplay,
            timestamp: new Date().toISOString()
        };

        match.balls.push(ball);
        match.recentBalls = match.balls.slice(-12);

        match.currentOverBalls = match.currentOverBalls || [];
        match.currentOverBalls.push({
            number: ballNumber,
            display: ballDisplay,
            runs,
            extras,
            extraType,
            wickets,
            striker: striker.name,
            bowler: bowler.name
        });

        const overFinished = legalDelivery && battingTeam.balls % 6 === 0;

        if (overFinished) {
            battingTeam.oversHistory = battingTeam.oversHistory || [];
            const overNumber = Math.floor(battingTeam.balls / 6);
            battingTeam.oversHistory.push({
                overNumber,
                bowlerId: bowler.id,
                bowlerName: bowler.name,
                balls: [...match.currentOverBalls],
                totalRuns: match.currentOverBalls.reduce((acc, b) => acc + (b.runs || 0) + (b.extras || 0), 0),
                wickets: match.currentOverBalls.filter((b) => b.wickets > 0).length,
                teamScoreAtEnd: `${battingTeam.runs}/${battingTeam.wickets}`
            });
            match.currentOverBalls = [];

            const temporary = nextStriker;
            nextStriker = nextNonStriker;
            nextNonStriker = temporary;
        }

        // -------------------------------------------------
        // ACTIVE PLAYERS UPDATE
        // -------------------------------------------------
        match.activePlayers = {
            strikerId: nextStriker?.id || null,
            nonStrikerId: nextNonStriker?.id || null,
            bowlerId: bowler.id
        };

        // -------------------------------------------------
        // SECOND INNINGS TARGET CHECK
        // -------------------------------------------------
        if (
            match.currentInnings === 2 &&
            match.target !== null &&
            battingTeam.runs >= match.target
        ) {
            match.status = "COMPLETED";
            const wicketsRemaining = maxWickets - battingTeam.wickets;
            match.result = `${battingTeam.name} won by ${wicketsRemaining} ${wicketsRemaining === 1 ? "wicket" : "wickets"}.`;
            match.innings2Data = {
                battingTeam: battingTeam.name,
                bowlingTeam: bowlingTeam.name,
                runs: battingTeam.runs,
                wickets: battingTeam.wickets,
                balls: battingTeam.balls,
                extras: battingTeam.extras,
                fallOfWickets: JSON.parse(JSON.stringify(battingTeam.fallOfWickets || [])),
                partnerships: JSON.parse(JSON.stringify(battingTeam.partnerships || [])),
                oversHistory: JSON.parse(JSON.stringify(battingTeam.oversHistory || []))
            };
        }

        // -------------------------------------------------
        // INNINGS END
        // -------------------------------------------------
        const inningsFinished =
            battingTeam.balls >= maximumBalls ||
            battingTeam.wickets >= maxWickets;

        if (
            inningsFinished &&
            match.status === "LIVE"
        ) {
            if (match.currentInnings === 1) {
                const firstInningsRuns = battingTeam.runs;
                match.target = firstInningsRuns + 1;

                match.innings1Data = {
                    battingTeam: battingTeam.name,
                    bowlingTeam: bowlingTeam.name,
                    runs: battingTeam.runs,
                    wickets: battingTeam.wickets,
                    balls: battingTeam.balls,
                    extras: battingTeam.extras,
                    fallOfWickets: JSON.parse(JSON.stringify(battingTeam.fallOfWickets || [])),
                    partnerships: JSON.parse(JSON.stringify(battingTeam.partnerships || [])),
                    oversHistory: JSON.parse(JSON.stringify(battingTeam.oversHistory || []))
                };

                const previousBattingTeam = match.battingTeam;
                const previousBowlingTeam = match.bowlingTeam;

                match.currentInnings = 2;
                match.battingTeam = previousBowlingTeam;
                match.bowlingTeam = previousBattingTeam;

                match.teams.team1.players = resetPlayers(match.teams.team1.players);
                match.teams.team2.players = resetPlayers(match.teams.team2.players);

                match.status = "LIVE";
                match.result = null;

                initializeInnings(match);
            } else {
                match.status = "COMPLETED";
                match.innings2Data = {
                    battingTeam: battingTeam.name,
                    bowlingTeam: bowlingTeam.name,
                    runs: battingTeam.runs,
                    wickets: battingTeam.wickets,
                    balls: battingTeam.balls,
                    extras: battingTeam.extras,
                    fallOfWickets: JSON.parse(JSON.stringify(battingTeam.fallOfWickets || [])),
                    partnerships: JSON.parse(JSON.stringify(battingTeam.partnerships || [])),
                    oversHistory: JSON.parse(JSON.stringify(battingTeam.oversHistory || []))
                };

                const firstTeamKey = battingTeamKeyForMatch({
                    ...match,
                    battingTeam: match.battingTeam === match.team1 ? match.team2 : match.team1
                });
                const firstInningsTeam = match.teams[firstTeamKey];
                const runDifference = firstInningsTeam.runs - battingTeam.runs;

                if (runDifference > 0) {
                    match.result = `${firstInningsTeam.name} won by ${runDifference} ${runDifference === 1 ? "run" : "runs"}.`;
                } else if (runDifference === 0) {
                    match.result = "Match tied.";
                } else {
                    const wicketsRemaining = maxWickets - battingTeam.wickets;
                    match.result = `${battingTeam.name} won by ${wicketsRemaining} ${wicketsRemaining === 1 ? "wicket" : "wickets"}.`;
                }
            }
        }


        match.updatedAt =
            new Date().toISOString();


        saveMatches(matches);


        io.emit(
            "match:update",
            match
        );


        response.json(match);

    }
);


// =====================================================
// CHANGE ACTIVE PLAYERS
// =====================================================

app.post(
    "/api/matches/:id/players",
    (request, response) => {

        const matches =
            readMatches();


        const match =
            matches.find(
                (item) =>
                    item.id ===
                    request.params.id
            );


        if (!match) {

            return response
                .status(404)
                .json({

                    message:
                        "Match not found."

                });

        }


        if (
            match.status !== "LIVE"
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "Match is not live."

                });

        }


        const battingTeam =
            getBattingTeam(match);


        const bowlingTeam =
            getBowlingTeam(match);


        const {
            strikerId,
            nonStrikerId,
            bowlerId
        } = request.body;


        const striker =
            getPlayer(
                battingTeam,
                strikerId
            );


        const nonStriker =
            getPlayer(
                battingTeam,
                nonStrikerId
            );


        const bowler =
            getPlayer(
                bowlingTeam,
                bowlerId
            );


        if (
            !striker ||
            !nonStriker ||
            !bowler
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "Invalid player selection."

                });

        }


        if (
            striker.id ===
            nonStriker.id
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "Striker and non-striker must be different."

                });

        }


        match.activePlayers = {

            strikerId,

            nonStrikerId,

            bowlerId

        };


        match.updatedAt =
            new Date().toISOString();


        saveMatches(matches);


        io.emit(
            "match:update",
            match
        );


        response.json(match);

    }
);


// =====================================================
// UNDO LAST DELIVERY
// =====================================================

app.post(
    "/api/matches/:id/undo",
    (request, response) => {

        const matches = readMatches();
        const match = matches.find(
            (item) => item.id === request.params.id
        );

        if (!match) {
            return response.status(404).json({
                message: "Match not found."
            });
        }

        if (!Array.isArray(match.balls) || match.balls.length === 0) {
            return response.status(400).json({
                message: "There is no recorded delivery available to undo."
            });
        }

        if (!Array.isArray(match.undoStack)) {
            match.undoStack = [];
        }

        if (match.undoStack.length > 0) {
            const previousState = match.undoStack.pop();
            match.balls.pop();
            match.teams = previousState.teams;
            match.activePlayers = previousState.activePlayers;
            match.status = previousState.status;
            match.currentInnings = previousState.currentInnings;
            match.battingTeam = previousState.battingTeam;
            match.bowlingTeam = previousState.bowlingTeam;
            match.target = previousState.target;
            match.result = previousState.result;
            match.currentPartnership = previousState.currentPartnership || null;
            match.currentOverBalls = previousState.currentOverBalls || [];
            match.innings1Data = previousState.innings1Data || null;
            match.innings2Data = previousState.innings2Data || null;
        } else {
            const undoError = undoLegacyDelivery(match);
            if (undoError) {
                return response.status(409).json({ message: undoError });
            }
        }

        if (match.status !== "COMPLETED") {
            match.playerOfMatch = null;
        }

        match.recentBalls = match.balls.slice(-12);
        match.updatedAt = new Date().toISOString();
        saveMatches(matches);
        io.emit("match:update", match);

        return response.json(match);

    }
);


// =====================================================
// SET PLAYER OF THE MATCH
// =====================================================

app.post(
    "/api/matches/:id/player-of-the-match",
    (request, response) => {

        const matches = readMatches();
        const match = matches.find(
            (item) => item.id === request.params.id
        );

        if (!match) {
            return response.status(404).json({
                message: "Match not found."
            });
        }

        if (match.status !== "COMPLETED") {
            return response.status(400).json({
                message: "Player of the match can only be selected after the match is complete."
            });
        }

        const playerId = request.body?.playerId;
        const playerEntry = Object.entries(match.teams)
            .flatMap(([, team]) =>
                (team.players || []).map((player) => ({ player, team }))
            )
            .find(({ player }) => player.id === playerId);

        if (!playerEntry) {
            return response.status(400).json({
                message: "Choose a player from one of the teams in this match."
            });
        }

        match.playerOfMatch = {
            id: playerEntry.player.id,
            name: playerEntry.player.name,
            team: playerEntry.team.name
        };
        match.updatedAt = new Date().toISOString();

        saveMatches(matches);
        io.emit("match:update", match);

        return response.json(match);

    }
);


// =====================================================
// SWAP STRIKE
// =====================================================

app.post(
    "/api/matches/:id/swap-strike",
    (request, response) => {
        const matches = readMatches();
        const match = matches.find((m) => m.id === request.params.id);
        if (!match) return response.status(404).json({ message: "Match not found." });
        if (match.status !== "LIVE") return response.status(400).json({ message: "Match is not live." });

        const temp = match.activePlayers.strikerId;
        match.activePlayers.strikerId = match.activePlayers.nonStrikerId;
        match.activePlayers.nonStrikerId = temp;
        match.updatedAt = new Date().toISOString();

        saveMatches(matches);
        io.emit("match:update", match);
        return response.json(match);
    }
);


// =====================================================
// CHANGE BOWLER
// =====================================================

app.post(
    "/api/matches/:id/change-bowler",
    (request, response) => {
        const matches = readMatches();
        const match = matches.find((m) => m.id === request.params.id);
        if (!match) return response.status(404).json({ message: "Match not found." });
        if (match.status !== "LIVE") return response.status(400).json({ message: "Match is not live." });

        const { bowlerId } = request.body;
        const bowlingTeam = getBowlingTeam(match);
        const bowler = getPlayer(bowlingTeam, bowlerId);
        if (!bowler) return response.status(400).json({ message: "Select a valid bowler." });

        match.activePlayers.bowlerId = bowler.id;
        match.updatedAt = new Date().toISOString();

        saveMatches(matches);
        io.emit("match:update", match);
        return response.json(match);
    }
);


// =====================================================
// CHANGE BATSMAN
// =====================================================

app.post(
    "/api/matches/:id/change-batsman",
    (request, response) => {
        const matches = readMatches();
        const match = matches.find((m) => m.id === request.params.id);
        if (!match) return response.status(404).json({ message: "Match not found." });
        if (match.status !== "LIVE") return response.status(400).json({ message: "Match is not live." });

        const { strikerId, nonStrikerId } = request.body;
        const battingTeam = getBattingTeam(match);

        if (strikerId) {
            const striker = getPlayer(battingTeam, strikerId);
            if (!striker || striker.out) return response.status(400).json({ message: "Invalid striker." });
            match.activePlayers.strikerId = striker.id;
        }

        if (nonStrikerId) {
            const nonStriker = getPlayer(battingTeam, nonStrikerId);
            if (!nonStriker || nonStriker.out) return response.status(400).json({ message: "Invalid non-striker." });
            match.activePlayers.nonStrikerId = nonStriker.id;
        }

        match.updatedAt = new Date().toISOString();
        saveMatches(matches);
        io.emit("match:update", match);
        return response.json(match);
    }
);


// =====================================================
// RENAME PLAYER
// =====================================================

app.patch(
    "/api/matches/:id/players/:playerId",
    (request, response) => {
        const matches = readMatches();
        const match = matches.find((m) => m.id === request.params.id);
        if (!match) return response.status(404).json({ message: "Match not found." });

        const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
        if (!name) return response.status(400).json({ message: "A valid player name is required." });

        let playerFound = false;
        for (const teamKey of ["team1", "team2"]) {
            const team = match.teams[teamKey];
            if (team && Array.isArray(team.players)) {
                const player = team.players.find((p) => p.id === request.params.playerId);
                if (player) {
                    player.name = name.slice(0, 50);
                    playerFound = true;
                    break;
                }
            }
        }

        if (!playerFound) {
            return response.status(404).json({ message: "Player not found." });
        }

        match.updatedAt = new Date().toISOString();
        saveMatches(matches);
        io.emit("match:update", match);
        return response.json(match);
    }
);


// =====================================================
// RESET MATCH
// =====================================================

app.post(
    "/api/matches/:id/reset",
    (request, response) => {

        const matches =
            readMatches();


        const match =
            matches.find(
                (item) =>
                    item.id ===
                    request.params.id
            );


        if (!match) {

            return response
                .status(404)
                .json({

                    message:
                        "Match not found."

                });

        }

        if (match.status === "TOSS_PENDING") {
            return response
                .status(409)
                .json({
                    message: "Complete the toss before resetting the match."
                });
        }


        match.teams.team1.runs = 0;
        match.teams.team1.extras = 0;
        match.teams.team1.wickets = 0;
        match.teams.team1.balls = 0;


        match.teams.team2.runs = 0;
        match.teams.team2.extras = 0;
        match.teams.team2.wickets = 0;
        match.teams.team2.balls = 0;


        match.teams.team1.players =
            resetPlayers(
                match.teams.team1.players
            );


        match.teams.team2.players =
            resetPlayers(
                match.teams.team2.players
            );


        match.balls = [];

        match.recentBalls = [];

        match.undoStack = [];


        const originalBattingTeam =
            match.tossDecision === "bat"
                ? match.tossWinnerName
                : match.tossWinner === "team1"
                    ? match.team2
                    : match.team1;


        const originalBowlingTeam =
            originalBattingTeam ===
            match.team1
                ? match.team2
                : match.team1;


        match.battingTeam =
            originalBattingTeam;


        match.bowlingTeam =
            originalBowlingTeam;


        match.currentInnings = 1;

        match.status = "LIVE";

        match.target = null;

        match.result = null;

        match.playerOfMatch = null;


        initializeInnings(match);


        match.updatedAt =
            new Date().toISOString();


        saveMatches(matches);


        io.emit(
            "match:update",
            match
        );


        response.json(match);

    }
);


// =====================================================
// SOCKET.IO
// =====================================================

io.on(
    "connection",
    (socket) => {

        console.log(
            `CricPulse screen connected: ${socket.id}`
        );


        socket.on(
            "disconnect",
            () => {

                console.log(
                    `CricPulse screen disconnected: ${socket.id}`
                );

            }
        );

    }
);


// =====================================================
// FRONTEND
// =====================================================

app.use(
    express.static(
        FRONTEND_DIRECTORY
    )
);


app.get(
    "/",
    (request, response) => {

        response.sendFile(
            path.join(
                FRONTEND_DIRECTORY,
                "index.html"
            )
        );

    }
);


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (
        error,
        request,
        response,
        next
    ) => {

        console.error(
            "Unexpected server error:",
            error
        );


        if (
            error instanceof SyntaxError &&
            "body" in error
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "Request data must be valid JSON."

                });

        }


        response
            .status(500)
            .json({

                message:
                    "Something went wrong on the server."

            });

    }
);


// =====================================================
// START
// =====================================================

httpServer.listen(
    PORT,
    () => {

        console.log(
            `CricPulse is running at http://localhost:${PORT}`
        );

    }
);