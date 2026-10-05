const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { randomUUID } = require("crypto");
const { Server } = require("socket.io");
const supabase = require("./supabase");

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

const VALID_OVERS = new Set([
    5,
    10,
    20,
    50
]);

app.use(
    express.json({
        limit: "50kb"
    })
);

// =====================================================
// FILE DATABASE
// =====================================================

function readMatches() {

    try {

        if (!fs.existsSync(MATCHES_FILE)) {
            return [];
        }

        const contents =
            fs.readFileSync(
                MATCHES_FILE,
                "utf8"
            );

        const matches =
            JSON.parse(contents);

        return Array.isArray(matches)
            ? matches
            : [];

    } catch (error) {

        console.error(
            "Unable to read match data:",
            error
        );

        return [];

    }
}


function saveMatches(matches) {

    fs.mkdirSync(
        DATA_DIRECTORY,
        {
            recursive: true
        }
    );

    fs.writeFileSync(
        MATCHES_FILE,
        JSON.stringify(
            matches,
            null,
            2
        ),
        "utf8"
    );

}


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

        out: false

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
        .slice(0, 11)
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

            out: false

        };

    });

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

    const availableBatters =
        getAvailableBatters(
            battingTeam
        );

    const bowler =
        bowlingTeam.players[0];

    match.activePlayers = {

        strikerId:
            availableBatters[0]?.id ||
            null,

        nonStrikerId:
            availableBatters[1]?.id ||
            null,

        bowlerId:
            bowler?.id ||
            null

    };

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
        tossWinner,
        tossDecision,
        team1Players,
        team2Players
    } = data;


    const tossWinnerName =
        tossWinner === "team1"
            ? team1
            : team2;


    const battingTeam =
        tossDecision === "bat"
            ? tossWinnerName
            : tossWinner === "team1"
                ? team2
                : team1;


    const bowlingTeam =
        battingTeam === team1
            ? team2
            : team1;


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

        tossWinner,

        tossWinnerName,

        tossDecision,

        battingTeam,

        bowlingTeam,

        currentInnings: 1,

        status: "LIVE",

        teams: {

            team1: {

                name: team1,

                runs: 0,

                wickets: 0,

                balls: 0,

                players: players1

            },

            team2: {

                name: team2,

                runs: 0,

                wickets: 0,

                balls: 0,

                players: players2

            }

        },

        activePlayers: {

            strikerId:
                players1[0]?.id ||
                null,

            nonStrikerId:
                players1[1]?.id ||
                null,

            bowlerId:
                players2[0]?.id ||
                null

        },

        balls: [],

        recentBalls: [],

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


    const tossWinner =
        body.tossWinner;


    const tossDecision =
        body.tossDecision;


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


    if (!VALID_OVERS.has(overs)) {

        return {
            error:
                "Overs must be 5, 10, 20, or 50."
        };

    }


    if (
        tossWinner !== "team1" &&
        tossWinner !== "team2"
    ) {

        return {
            error:
                "Choose the toss winner."
        };

    }


    if (
        tossDecision !== "bat" &&
        tossDecision !== "bowl"
    ) {

        return {
            error:
                "Choose whether the toss winner bats or bowls."
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

            tossWinner,

            tossDecision,

            team1Players,

            team2Players

        }

    };

}


// =====================================================
// HEALTH
// =====================================================

app.get(
    "/api/health",
    (request, response) => {

        response.json({
            status: "ok"
        });

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
            Number(
                request.body.runs
            );


        const wickets =
            Number(
                request.body.wickets
            );


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
            runs > 6
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "Runs must be between 0 and 6."

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

                    message:
                        "Invalid wicket value."

                });

        }


        const battingTeam =
            getBattingTeam(match);


        const bowlingTeam =
            getBowlingTeam(match);


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


        if (!striker) {

            return response
                .status(400)
                .json({

                    message:
                        "Select a valid striker."

                });

        }


        if (!nonStriker) {

            return response
                .status(400)
                .json({

                    message:
                        "Select a valid non-striker."

                });

        }


        if (!bowler) {

            return response
                .status(400)
                .json({

                    message:
                        "Select a valid bowler."

                });

        }


        if (
            striker.out ||
            nonStriker.out
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "A dismissed batter cannot bat."

                });

        }


        const maximumBalls =
            match.overs * 6;


        if (
            battingTeam.balls >=
            maximumBalls
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "Maximum overs completed."

                });

        }


        if (
            battingTeam.wickets >= 10
        ) {

            return response
                .status(400)
                .json({

                    message:
                        "All wickets are down."

                });

        }


        // =================================================
        // BATTING UPDATE
        // =================================================

        striker.runs += runs;

        striker.balls += 1;


        if (runs === 4) {
            striker.fours += 1;
        }


        if (runs === 6) {
            striker.sixes += 1;
        }


        // =================================================
        // BOWLING UPDATE
        // =================================================

        bowler.bowlerBalls += 1;

        bowler.runsConceded += runs;


        if (wickets === 1) {

            bowler.wickets += 1;

            striker.out = true;

            battingTeam.wickets += 1;

        }


        battingTeam.runs += runs;

        battingTeam.balls += 1;


        // =================================================
        // STRIKE ROTATION
        // =================================================

        let nextStriker =
            striker;

        let nextNonStriker =
            nonStriker;


        if (runs % 2 === 1) {

            nextStriker =
                nonStriker;

            nextNonStriker =
                striker;

        }


        // =================================================
        // WICKET REPLACEMENT
        // =================================================

        if (wickets === 1) {

            const newBatter =
                getNextAvailableBatter(
                    battingTeam,
                    [
                        striker.id,
                        nonStriker.id
                    ]
                );


            if (newBatter) {

                if (
                    nextStriker.id ===
                    striker.id
                ) {

                    nextStriker =
                        newBatter;

                } else {

                    nextNonStriker =
                        newBatter;

                }

            } else {

                if (
                    nextStriker.id ===
                    striker.id
                ) {

                    nextStriker =
                        null;

                } else {

                    nextNonStriker =
                        null;

                }

            }

        }


        // =================================================
        // BALL NUMBER
        // =================================================

        const ballNumber =
            match.balls.length + 1;


        const ball = {

            number:
                ballNumber,

            innings:
                match.currentInnings,

            battingTeam:
                battingTeam.name,

            bowlingTeam:
                bowlingTeam.name,

            striker:
                striker.name,

            nonStriker:
                nonStriker.name,

            bowler:
                bowler.name,

            strikerId:
                striker.id,

            nonStrikerId:
                nonStriker.id,

            bowlerId:
                bowler.id,

            runs,

            wickets,

            display:
                typeof request.body.display ===
                "string"
                    ? request.body.display
                    : wickets
                        ? "W"
                        : String(runs),

            timestamp:
                new Date().toISOString()

        };


        match.balls.push(ball);


        match.recentBalls =
            match.balls.slice(-12);


        // =================================================
        // OVER END
        // =================================================

        const overFinished =
            battingTeam.balls % 6 === 0;


        if (overFinished) {

            const temporary =
                nextStriker;

            nextStriker =
                nextNonStriker;

            nextNonStriker =
                temporary;

        }


        // =================================================
        // UPDATE ACTIVE PLAYERS
        // =================================================

        match.activePlayers = {

            strikerId:
                nextStriker?.id ||
                null,

            nonStrikerId:
                nextNonStriker?.id ||
                null,

            bowlerId:
                bowler.id

        };


        // =================================================
        // SECOND INNINGS TARGET CHECK
        // =================================================

        if (
            match.currentInnings === 2 &&
            match.target !== null &&
            battingTeam.runs >=
                match.target
        ) {

            match.status =
                "COMPLETED";


            const wicketsRemaining =
                10 -
                battingTeam.wickets;


            match.result =
                `${battingTeam.name} won by ${wicketsRemaining} wickets.`;

        }


        // =================================================
        // INNINGS END
        // =================================================

        const inningsFinished =
            battingTeam.balls >=
                maximumBalls ||
            battingTeam.wickets >= 10;


        if (
            inningsFinished &&
            match.status === "LIVE"
        ) {

            // =============================================
            // FIRST INNINGS FINISHED
            // =============================================

            if (
                match.currentInnings === 1
            ) {

                const firstInningsRuns =
                    battingTeam.runs;


                match.target =
                    firstInningsRuns + 1;


                const previousBattingTeam =
                    match.battingTeam;


                const previousBowlingTeam =
                    match.bowlingTeam;


                match.currentInnings =
                    2;


                match.battingTeam =
                    previousBowlingTeam;


                match.bowlingTeam =
                    previousBattingTeam;


                match.teams.team1.players =
                    resetPlayers(
                        match.teams.team1.players
                    );


                match.teams.team2.players =
                    resetPlayers(
                        match.teams.team2.players
                    );


                match.status =
                    "LIVE";


                match.result =
                    null;


                initializeInnings(match);

            }


            // =============================================
            // SECOND INNINGS FINISHED
            // =============================================

            else {

                const chasingTeam =
                    battingTeam;


                const firstTeamKey =
                    battingTeamKeyForMatch({
                        ...match,

                        battingTeam:
                            match.battingTeam ===
                            match.team1
                                ? match.team2
                                : match.team1

                    });


                const firstInningsTeam =
                    match.teams[
                        firstTeamKey
                    ];


                const runDifference =
                    firstInningsTeam.runs -
                    chasingTeam.runs;


                match.status =
                    "COMPLETED";


                match.result =
                    `${firstInningsTeam.name} won by ${Math.max(
                        0,
                        runDifference
                    )} runs.`;

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


        match.teams.team1.runs = 0;
        match.teams.team1.wickets = 0;
        match.teams.team1.balls = 0;


        match.teams.team2.runs = 0;
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