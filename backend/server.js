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

function readMatches() {
    try {
        const contents = fs.readFileSync(MATCHES_FILE, "utf8");
        const matches = JSON.parse(contents);

        return Array.isArray(matches) ? matches : [];
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Unable to read match data:", error);
        }

        return [];
    }
}

function saveMatches(matches) {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });

    const temporaryFile = `${MATCHES_FILE}.tmp`;

    fs.writeFileSync(
        temporaryFile,
        JSON.stringify(matches, null, 2)
    );

    fs.renameSync(temporaryFile, MATCHES_FILE);
}

function createMatch({
    team1,
    team2,
    overs,
    tossWinner,
    tossDecision
}) {
    const tossWinnerName =
        tossWinner === "team1" ? team1 : team2;

    const battingTeam =
        tossDecision === "bat"
            ? tossWinnerName
            : tossWinner === "team1"
                ? team2
                : team1;

    const bowlingTeam =
        battingTeam === team1 ? team2 : team1;

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

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

    if (team1.toLowerCase() === team2.toLowerCase()) {
        return {
            error: "The two teams must be different."
        };
    }

    if (!VALID_OVERS.has(overs)) {
        return {
            error: "Overs must be 5, 10, 20, or 50."
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
            error: "Choose whether the toss winner bats or bowls."
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

app.use(express.json({ limit: "20kb" }));

// ----------------------------------------
// HEALTH CHECK
// ----------------------------------------

app.get("/api/health", (request, response) => {
    response.json({
        status: "ok"
    });
});

// ----------------------------------------
// TEAMS - SUPABASE
// ----------------------------------------

app.get("/api/teams", async (request, response) => {
    try {
        const { data, error } = await supabase
            .from("teams")
            .select("*")
            .order("id", {
                ascending: true
            });

        if (error) {
            console.error("Supabase teams error:", error);

            return response.status(500).json({
                message: "Unable to load teams."
            });
        }

        response.json(data);
    } catch (error) {
        console.error("Teams API error:", error);

        response.status(500).json({
            message: "Something went wrong while loading teams."
        });
    }
});

app.post("/api/teams", async (request, response) => {
    try {
        const name =
            typeof request.body.name === "string"
                ? request.body.name.trim()
                : "";

        const shortName =
            typeof request.body.short_name === "string"
                ? request.body.short_name.trim()
                : "";

        if (!name || !shortName) {
            return response.status(400).json({
                message: "Team name and short name are required."
            });
        }

        const { data, error } = await supabase
            .from("teams")
            .insert([
                {
                    name,
                    short_name: shortName
                }
            ])
            .select()
            .single();

        if (error) {
            console.error("Supabase create team error:", error);

            return response.status(500).json({
                message: "Unable to create team."
            });
        }

        response.status(201).json(data);
    } catch (error) {
        console.error("Create team API error:", error);

        response.status(500).json({
            message: "Something went wrong while creating the team."
        });
    }
});

// ----------------------------------------
// EXISTING MATCH SYSTEM
// ----------------------------------------

app.get("/api/matches", (request, response) => {
    response.json(readMatches());
});

app.get("/api/matches/:id", (request, response) => {
    const match = readMatches().find(
        (item) => item.id === request.params.id
    );

    if (!match) {
        return response.status(404).json({
            message: "Match not found."
        });
    }

    response.json(match);
});

app.post("/api/matches", (request, response) => {
    const validation = validateMatchInput(
        request.body || {}
    );

    if (validation.error) {
        return response.status(400).json({
            message: validation.error
        });
    }

    const matches = readMatches();

    const match = createMatch(
        validation.value
    );

    matches.unshift(match);

    saveMatches(matches);

    response.status(201).json(match);
});

// ----------------------------------------
// FRONTEND
// ----------------------------------------

app.use(express.static(FRONTEND_DIRECTORY));

app.get("/", (request, response) => {
    response.sendFile(
        path.join(
            FRONTEND_DIRECTORY,
            "index.html"
        )
    );
});

// ----------------------------------------
// ERROR HANDLER
// ----------------------------------------

app.use(
    (
        error,
        request,
        response,
        next
    ) => {
        if (
            error instanceof SyntaxError &&
            "body" in error
        ) {
            return response.status(400).json({
                message:
                    "Request data must be valid JSON."
            });
        }

        console.error(
            "Unexpected server error:",
            error
        );

        response.status(500).json({
            message:
                "Something went wrong on the server."
        });
    }
);

// ----------------------------------------
// START SERVER
// ----------------------------------------

app.listen(PORT, () => {
    console.log(
        `CricPulse is running at http://localhost:${PORT}`
    );
});