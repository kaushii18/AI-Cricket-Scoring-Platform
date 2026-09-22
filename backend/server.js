const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const supabase = require("./supabase");

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_DIRECTORY = path.join(__dirname, "../frontend");
const DATA_DIRECTORY = path.join(__dirname, "data");
const MATCHES_FILE = path.join(DATA_DIRECTORY, "matches.json");

const VALID_OVERS = new Set([5, 10, 20, 50]);

app.use(express.json({ limit: "20kb" }));

// ==========================================
// MATCH DATA
// ==========================================

function readMatches() {
    try {
        if (!fs.existsSync(MATCHES_FILE)) {
            return [];
        }

        const contents = fs.readFileSync(
            MATCHES_FILE,
            "utf8"
        );

        const matches = JSON.parse(contents);

        return Array.isArray(matches) ? matches : [];
    } catch (error) {
        console.error(
            "Unable to read match data:",
            error
        );

        return [];
    }
}


function saveMatches(matches) {
    fs.mkdirSync(DATA_DIRECTORY, {
        recursive: true
    });

    fs.writeFileSync(
        MATCHES_FILE,
        JSON.stringify(matches, null, 2),
        "utf8"
    );
}


// ==========================================
// CREATE MATCH
// ==========================================

function createMatch(data) {
    const {
        team1,
        team2,
        overs,
        tossWinner,
        tossDecision
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

    const now = new Date().toISOString();

    return {
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
                balls: 0
            },

            team2: {
                name: team2,
                runs: 0,
                wickets: 0,
                balls: 0
            }
        },

        balls: [],
        recentBalls: [],

        target: null,
        result: null,

        createdAt: now,
        updatedAt: now
    };
}


// ==========================================
// VALIDATE MATCH
// ==========================================

function validateMatchInput(body) {
    const team1 =
        typeof body.team1 === "string"
            ? body.team1.trim()
            : "";

    const team2 =
        typeof body.team2 === "string"
            ? body.team2.trim()
            : "";

    const overs = Number(body.overs);

    const tossWinner = body.tossWinner;
    const tossDecision = body.tossDecision;

    if (!team1 || !team2) {
        return {
            error: "Both team names are required."
        };
    }

    if (
        team1.toLowerCase() ===
        team2.toLowerCase()
    ) {
        return {
            error: "The two teams must be different."
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
            error: "Choose the toss winner."
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

    return {
        value: {
            team1,
            team2,
            overs,
            tossWinner,
            tossDecision
        }
    };
}


// ==========================================
// HEALTH
// ==========================================

app.get("/api/health", (request, response) => {
    response.json({
        status: "ok"
    });
});


// ==========================================
// TEAMS
// ==========================================

app.get("/api/teams", async (request, response) => {
    try {
        const result = await supabase
            .from("teams")
            .select("*")
            .order("created_at", {
                ascending: true
            });

        if (result.error) {
            console.error(
                "Supabase teams error:",
                result.error
            );

            return response.status(500).json({
                message: "Unable to load teams.",
                error: result.error.message
            });
        }

        return response.json(
            result.data || []
        );
    } catch (error) {
        console.error(
            "Teams API error:",
            error
        );

        return response.status(500).json({
            message: "Unable to load teams.",
            error: error.message
        });
    }
});


app.post("/api/teams", async (request, response) => {
    try {
        const body = request.body || {};

        const name =
            typeof body.name === "string"
                ? body.name.trim()
                : "";

        const shortName =
            typeof body.short_name === "string"
                ? body.short_name.trim()
                : "";

        if (!name || !shortName) {
            return response.status(400).json({
                message:
                    "Team name and short name are required."
            });
        }

        const result = await supabase
            .from("teams")
            .insert({
                name,
                short_name: shortName
            })
            .select("*")
            .single();

        if (result.error) {
            console.error(
                "Supabase create team error:",
                result.error
            );

            return response.status(500).json({
                message: "Unable to create team.",
                error: result.error.message
            });
        }

        return response.status(201).json(
            result.data
        );
    } catch (error) {
        console.error(
            "Create team API error:",
            error
        );

        return response.status(500).json({
            message: "Unable to create team.",
            error: error.message
        });
    }
});


// ==========================================
// MATCHES
// ==========================================

app.get("/api/matches", (request, response) => {
    const matches = readMatches();

    response.json(matches);
});


app.get("/api/matches/:id", (request, response) => {
    const matches = readMatches();

    const match = matches.find(
        (item) =>
            item.id === request.params.id
    );

    if (!match) {
        return response.status(404).json({
            message: "Match not found."
        });
    }

    response.json(match);
});


app.post("/api/matches", (request, response) => {
    const validation =
        validateMatchInput(
            request.body || {}
        );

    if (validation.error) {
        return response.status(400).json({
            message: validation.error
        });
    }

    const matches = readMatches();

    const match =
        createMatch(validation.value);

    matches.unshift(match);

    saveMatches(matches);

    response.status(201).json(match);
});


// ==========================================
// RECORD BALL
// ==========================================

app.post(
    "/api/matches/:id/balls",
    (request, response) => {

        const matches = readMatches();

        const match = matches.find(
            (item) =>
                item.id === request.params.id
        );

        if (!match) {
            return response.status(404).json({
                message: "Match not found."
            });
        }


        if (match.status !== "LIVE") {
            return response.status(400).json({
                message: "This match is not live."
            });
        }


        const runs = Number(request.body.runs);
        const wickets = Number(request.body.wickets);


        if (
            !Number.isInteger(runs) ||
            runs < 0 ||
            !Number.isInteger(wickets) ||
            wickets < 0
        ) {
            return response.status(400).json({
                message: "Invalid ball data."
            });
        }


        if (wickets > 1) {
            return response.status(400).json({
                message: "Only one wicket can be recorded per ball."
            });
        }


        const battingTeam =
            match.battingTeam === match.team1
                ? match.teams.team1
                : match.teams.team2;


        const maximumBalls =
            match.overs * 6;


        if (battingTeam.balls >= maximumBalls) {
            return response.status(400).json({
                message: "Maximum overs completed."
            });
        }


        if (battingTeam.wickets >= 10) {
            return response.status(400).json({
                message: "All wickets are down."
            });
        }


        // Update score

        battingTeam.runs += runs;

        battingTeam.wickets += wickets;

        battingTeam.balls += 1;


        // Create ball record

        const ball = {
            number: match.balls.length + 1,
            runs: runs,
            wickets: wickets,
            display:
                typeof request.body.display === "string"
                    ? request.body.display
                    : wickets > 0
                        ? "W"
                        : String(runs),
            timestamp: new Date().toISOString()
        };


        match.balls.push(ball);


        // Keep only recent 12 balls

        match.recentBalls =
            match.balls.slice(-12);


        match.updatedAt =
            new Date().toISOString();


        // Check innings completion

        if (
            battingTeam.balls >= maximumBalls ||
            battingTeam.wickets >= 10
        ) {
            match.status = "COMPLETED";
        }


        saveMatches(matches);


        return response.json(match);
    }
);


// ==========================================
// RESET MATCH
// ==========================================

app.post(
    "/api/matches/:id/reset",
    (request, response) => {

        const matches = readMatches();

        const match = matches.find(
            (item) =>
                item.id === request.params.id
        );

        if (!match) {
            return response.status(404).json({
                message: "Match not found."
            });
        }


        match.teams.team1.runs = 0;
        match.teams.team1.wickets = 0;
        match.teams.team1.balls = 0;


        match.teams.team2.runs = 0;
        match.teams.team2.wickets = 0;
        match.teams.team2.balls = 0;


        match.balls = [];
        match.recentBalls = [];


        match.currentInnings = 1;
        match.status = "LIVE";
        match.target = null;
        match.result = null;


        match.updatedAt =
            new Date().toISOString();


        saveMatches(matches);


        return response.json(match);
    }
);


// ==========================================
// FRONTEND
// ==========================================

app.use(
    express.static(FRONTEND_DIRECTORY)
);


app.get("/", (request, response) => {
    response.sendFile(
        path.join(
            FRONTEND_DIRECTORY,
            "index.html"
        )
    );
});


// ==========================================
// ERROR HANDLER
// ==========================================

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
            return response.status(400).json({
                message:
                    "Request data must be valid JSON."
            });
        }


        response.status(500).json({
            message:
                "Something went wrong on the server."
        });
    }
);


// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log(
        `CricPulse is running at http://localhost:${PORT}`
    );
});