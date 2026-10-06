// ==========================================
// CRICPULSE - MAIN JAVASCRIPT
// MATCH CREATION + PLAYER SETUP
// ==========================================

let playerSetupMode = false;
let dashboardSocket = null;
let dashboardMatches = [];


// ==========================================
// MATCH MODAL
// ==========================================

function openMatchModal() {

    const modal = document.getElementById("matchModal");

    if (!modal) {
        console.error("Match modal not found.");
        return;
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    document.getElementById("team1")?.focus();
}


function closeMatchModal() {

    const modal = document.getElementById("matchModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";
}


// ==========================================
// CREATE NEW MATCH
// ==========================================

function getPlayerNameInputs(teamKey) {

    return Array.from(
        document.querySelectorAll(
            `.${teamKey}-player-input`
        )
    )
    .map((input) =>
        input.value.trim()
    )
    .filter(Boolean);

}


function buildPlayerNameInputs(teamKey, teamName) {

    const roster =
        document.getElementById(`${teamKey}Roster`);

    if (!roster) {
        return;
    }

    const inputs = [];

    for (let index = 0; index < 11; index += 1) {

        const input = document.createElement("input");
        const playerNumber = String(index + 1).padStart(2, "0");
        input.type = "text";
        input.maxLength = 50;
        input.autocomplete = "off";
        input.className = `${teamKey}-player-input player-name-input`;
        input.setAttribute("aria-label", `${teamName} player ${index + 1}`);
        input.placeholder = `${playerNumber}  Enter player name`;

        inputs.push(input);

    }

    roster.replaceChildren(...inputs);

}


function syncDefaultPlayerNames() {

    const team1Input =
        document.getElementById("team1");

    const team2Input =
        document.getElementById("team2");

    if (!team1Input || !team2Input) {
        return;
    }

    const team1Name =
        team1Input.value.trim() || "Team 1";

    const team2Name =
        team2Input.value.trim() || "Team 2";

    const team1Heading = document.getElementById("team1RosterHeading");
    const team2Heading = document.getElementById("team2RosterHeading");

    if (team1Heading) {
        team1Heading.textContent = `${team1Name} squad`;
    }

    if (team2Heading) {
        team2Heading.textContent = `${team2Name} squad`;
    }

    Array.from(document.querySelectorAll(".team1-player-input")).forEach((input, index) => {
        input.setAttribute("aria-label", `${team1Name} player ${index + 1}`);
    });

    Array.from(document.querySelectorAll(".team2-player-input")).forEach((input, index) => {
        input.setAttribute("aria-label", `${team2Name} player ${index + 1}`);
    });

}

function populatePlayerInputDefaults() {

    buildPlayerNameInputs("team1", "Team 1");
    buildPlayerNameInputs("team2", "Team 2");
    syncDefaultPlayerNames();

    const team1Input = document.getElementById("team1");
    const team2Input = document.getElementById("team2");

    if (team1Input) {
        team1Input.addEventListener("input", syncDefaultPlayerNames);
    }

    if (team2Input) {
        team2Input.addEventListener("input", syncDefaultPlayerNames);
    }

}

async function handleMatchSubmit(event) {

    event.preventDefault();

    const team1Input =
        document.getElementById("team1");

    const team2Input =
        document.getElementById("team2");

    const oversInput =
        document.getElementById("overs");

    if (
        !team1Input ||
        !team2Input ||
        !oversInput
    ) {

        alert("Match setup form could not be loaded.");

        return;
    }


    // ==========================================
    // GET INPUT
    // ==========================================

    const team1 =
        team1Input.value.trim();

    const team2 =
        team2Input.value.trim();

    const overs =
        Number(oversInput.value);

    const team1Captain =
        document.getElementById("team1Captain")?.value.trim() || "";

    const team2Captain =
        document.getElementById("team2Captain")?.value.trim() || "";


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!team1 || !team2) {

        alert("Please enter both team names.");

        return;
    }


    if (
        team1.toLowerCase() ===
        team2.toLowerCase()
    ) {

        alert(
            "Team 1 and Team 2 must be different."
        );

        return;
    }


    if (![5, 10, 20, 50].includes(overs)) {

        alert(
            "Please select a valid number of overs."
        );

        return;
    }


    // ==========================================
    // DEFAULT PLAYERS
    //
    // We create 11 player slots for each team.
    // Names will be editable in the scorer.
    // ==========================================

    const team1Players =
        getPlayerNameInputs("team1");

    const team2Players =
        getPlayerNameInputs("team2");

    while (team1Players.length < 2) {
        team1Players.push(`${team1} Player ${team1Players.length + 1}`);
    }

    while (team2Players.length < 2) {
        team2Players.push(`${team2} Player ${team2Players.length + 1}`);
    }


    // ==========================================
    // SEND TO BACKEND
    // ==========================================

    try {

        const createButton = document.getElementById("createMatchButton");
        if (createButton) {
            createButton.disabled = true;
        }

        const savedMatch = await window.CricPulsePythonAPI.createMatch({
            team1,
            team2,
            overs,
            team1Captain,
            team2Captain,
            team1Players,
            team2Players
        });


        // ======================================
        // SAVE REAL BACKEND MATCH
        // ======================================

        localStorage.setItem(
            "cricPulseMatch",
            JSON.stringify(savedMatch)
        );


        // ======================================
        // SAVE PLAYER SETUP TEMPORARILY
        // ======================================

        localStorage.setItem(
            "cricPulsePlayers",
            JSON.stringify({

                team1: team1Players,

                team2: team2Players

            })
        );


    } catch (error) {

        console.error(
            "Unable to create match:",
            error
        );


        alert(
            error.message ||
            "Unable to create the match. Please try again."
        );

        return;
    } finally {
        const createButton = document.getElementById("createMatchButton");
        if (createButton) {
            createButton.disabled = false;
        }
    }


    // ==========================================
    // CLOSE MODAL
    // ==========================================

    closeMatchModal();


    // ==========================================
    // OPEN SCORER
    // ==========================================

    window.location.href =
        "scorer.html";
}


// ==========================================
// CREATE 11 PLAYERS
// ==========================================

function createDefaultPlayers(teamName) {

    const players = [];


    for (let i = 1; i <= 11; i++) {

        players.push({

            id:
                `${teamName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                }-player-${i}`,

            name:
                `${teamName} Player ${i}`,

            number:
                i,

            role:
                i === 1
                    ? "Batsman"
                    : i === 2
                        ? "Batsman"
                        : i >= 8
                            ? "Bowler"
                            : "All-Rounder",


            // ==================================
            // BATTING STATISTICS
            // ==================================

            batting: {

                runs: 0,

                balls: 0,

                fours: 0,

                sixes: 0,

                out: false,

                dismissal: null

            },


            // ==================================
            // BOWLING STATISTICS
            // ==================================

            bowling: {

                balls: 0,

                runs: 0,

                wickets: 0,

                wides: 0,

                noBalls: 0

            }

        });

    }


    return players;
}


// ==========================================
// GET CURRENT MATCH
// ==========================================

function getCurrentMatch() {

    const savedMatch =
        localStorage.getItem(
            "cricPulseMatch"
        );


    if (!savedMatch) {

        return null;

    }


    try {

        return JSON.parse(
            savedMatch
        );

    } catch (error) {

        console.error(
            "Unable to read saved match:",
            error
        );

        return null;
    }
}


// ==========================================
// SAVE CURRENT MATCH
// ==========================================

function saveCurrentMatch(matchData) {

    if (!matchData) {

        return false;

    }


    try {

        localStorage.setItem(
            "cricPulseMatch",
            JSON.stringify(matchData)
        );

        return true;

    } catch (error) {

        console.error(
            "Unable to save current match:",
            error
        );

        return false;
    }
}


// ==========================================
// CLEAR CURRENT MATCH
// ==========================================

function clearCurrentMatch() {

    localStorage.removeItem(
        "cricPulseMatch"
    );

    localStorage.removeItem(
        "cricPulsePlayers"
    );
}


// ==========================================
// GET PLAYERS
// ==========================================

function getCurrentPlayers() {

    const savedPlayers =
        localStorage.getItem(
            "cricPulsePlayers"
        );


    if (!savedPlayers) {

        return null;

    }


    try {

        return JSON.parse(
            savedPlayers
        );

    } catch (error) {

        console.error(
            "Unable to read player data:",
            error
        );

        return null;
    }
}


// ==========================================
// SAVE PLAYERS
// ==========================================

function saveCurrentPlayers(players) {

    if (!players) {

        return false;

    }


    try {

        localStorage.setItem(
            "cricPulsePlayers",
            JSON.stringify(players)
        );

        return true;

    } catch (error) {

        console.error(
            "Unable to save player data:",
            error
        );

        return false;
    }
}


// ==========================================
// LIVE MATCH DASHBOARD
// ==========================================

function formatMatchOvers(balls) {

    const count = Number.isFinite(Number(balls))
        ? Math.max(0, Number(balls))
        : 0;

    return `${Math.floor(count / 6)}.${count % 6}`;

}


function getMatchTeamScore(team, isYetToBat) {

    if (isYetToBat) {
        return {
            score: "Yet to bat",
            overs: ""
        };
    }

    const runs = Number.isFinite(Number(team?.runs))
        ? Number(team.runs)
        : 0;

    const wickets = Number.isFinite(Number(team?.wickets))
        ? Number(team.wickets)
        : 0;

    return {
        score: `${runs}/${wickets}`,
        overs: `${formatMatchOvers(team?.balls)} overs`
    };

}


function makeMatchTeam(name, score, overs, isBatting) {

    const team = document.createElement("div");
    team.className = "match-side";

    const teamName = document.createElement("span");
    teamName.className = "match-team-name";
    teamName.textContent = name || "Unnamed team";
    team.appendChild(teamName);

    const scoreText = document.createElement("strong");
    scoreText.className = "match-score";
    scoreText.textContent = score;
    team.appendChild(scoreText);

    if (overs) {
        const oversText = document.createElement("span");
        oversText.className = "match-overs";
        oversText.textContent = overs;
        team.appendChild(oversText);
    } else if (isBatting) {
        const inningsText = document.createElement("span");
        inningsText.className = "match-overs";
        inningsText.textContent = "Currently batting";
        team.appendChild(inningsText);
    }

    return team;

}


function renderLiveMatches() {

    const list = document.getElementById("matchList");
    const count = document.getElementById("liveMatchCount");
    const label = document.getElementById("liveMatchLabel");
    const updated = document.getElementById("matchUpdatedAt");

    if (!list || !count || !label) {
        return;
    }

    count.textContent = String(dashboardMatches.length);
    label.textContent = dashboardMatches.length === 1
        ? "match currently in play"
        : "matches currently in play";

    const fragment = document.createDocumentFragment();

    if (dashboardMatches.length === 0) {

        const empty = document.createElement("div");
        empty.className = "match-state-card";

        const heading = document.createElement("strong");
        heading.textContent = "No live matches right now";

        const message = document.createElement("p");
        message.textContent = "Start a match to see its live score appear here.";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary-button";
        button.textContent = "Set up a match";
        button.addEventListener("click", openMatchModal);

        empty.append(heading, message, button);
        fragment.appendChild(empty);

    } else {

        dashboardMatches.forEach((match) => {

            const card = document.createElement("article");
            card.className = "match-card";

            const main = document.createElement("div");
            main.className = "match-card-main";

            const meta = document.createElement("div");
            meta.className = "match-card-meta";

            const liveLabel = document.createElement("span");
            liveLabel.className = "match-live-label";
            liveLabel.textContent = "LIVE";

            const inningsLabel = document.createElement("span");
            inningsLabel.textContent =
                `INNINGS ${match.currentInnings || 1} · ${match.overs || "—"} OVERS`;

            meta.append(liveLabel, inningsLabel);

            const teams = document.createElement("div");
            teams.className = "match-teams";

            const team1 = match.teams?.team1;
            const team2 = match.teams?.team2;
            const battingKey = match.battingTeam === match.team1 ? "team1" : "team2";
            const firstScore = getMatchTeamScore(
                team1,
                match.currentInnings === 1 && battingKey !== "team1" && !team1?.balls
            );
            const secondScore = getMatchTeamScore(
                team2,
                match.currentInnings === 1 && battingKey !== "team2" && !team2?.balls
            );

            teams.append(
                makeMatchTeam(
                    match.team1,
                    firstScore.score,
                    firstScore.overs,
                    battingKey === "team1"
                )
            );

            const versus = document.createElement("span");
            versus.className = "match-vs";
            versus.textContent = "VS";
            teams.appendChild(versus);

            teams.append(
                makeMatchTeam(
                    match.team2,
                    secondScore.score,
                    secondScore.overs,
                    battingKey === "team2"
                )
            );

            main.append(meta, teams);

            const action = document.createElement("button");
            action.type = "button";
            action.className = "match-card-action";
            action.textContent = "Open scorer";
            action.setAttribute("aria-label", `Open scorer for ${match.team1} versus ${match.team2}`);
            action.addEventListener("click", () => {
                try {
                    localStorage.setItem("cricPulseMatch", JSON.stringify(match));
                    window.location.href = "scorer.html";
                } catch (error) {
                    console.error("Unable to open match:", error);
                    const errorMessage = document.getElementById("matchLoadError");
                    if (errorMessage) {
                        errorMessage.textContent = "Could not save this match in browser storage. Check your browser settings and try again.";
                        errorMessage.hidden = false;
                    }
                }
            });

            card.append(main, action);
            fragment.appendChild(card);

        });

    }

    list.replaceChildren(fragment);
    list.setAttribute("aria-busy", "false");

    if (updated) {
        updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }

}


async function refreshLiveMatches() {

    const list = document.getElementById("matchList");
    const errorMessage = document.getElementById("matchLoadError");

    if (!list) {
        return;
    }

    list.setAttribute("aria-busy", "true");

    try {

        const matches = await window.CricPulsePythonAPI.matches();

        if (!Array.isArray(matches)) {
            throw new Error("The server returned an invalid match list.");
        }

        dashboardMatches = matches.filter((match) => match.status === "LIVE");

        if (errorMessage) {
            errorMessage.hidden = true;
            errorMessage.textContent = "";
        }

        renderLiveMatches();

    } catch (error) {

        console.error("Unable to refresh live matches:", error);
        list.setAttribute("aria-busy", "false");

        if (dashboardMatches.length === 0) {
            const state = document.createElement("div");
            state.className = "match-state-card";

            const heading = document.createElement("strong");
            heading.textContent = "Live scores are unavailable";

            const message = document.createElement("p");
            message.textContent = "Check that the scoring server is running, then try again.";

            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "secondary-button";
            retry.textContent = "Retry";
            retry.addEventListener("click", refreshLiveMatches);

            state.append(heading, message, retry);
            list.replaceChildren(state);
        }

        if (errorMessage) {
            errorMessage.textContent = error.message || "Unable to load live matches.";
            errorMessage.hidden = false;
        }

    }

}


function updateConnectionStatus(connected) {

    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");

    if (dot) {
        dot.classList.toggle("offline", !connected);
    }

    if (text) {
        text.textContent = connected ? "Live updates on" : "Reconnecting";
    }

}


function initializeLiveDashboard() {

    refreshLiveMatches();

    if (typeof io !== "function") {
        updateConnectionStatus(false);
        return;
    }

    dashboardSocket = io();

    dashboardSocket.on("connect", () => {
        updateConnectionStatus(true);
        refreshLiveMatches();
    });

    dashboardSocket.on("disconnect", () => {
        updateConnectionStatus(false);
    });

    dashboardSocket.on("match:created", (match) => {
        if (match?.status === "LIVE") {
            dashboardMatches = [
                match,
                ...dashboardMatches.filter((item) => item.id !== match.id)
            ];
            renderLiveMatches();
        }
    });

    dashboardSocket.on("match:update", (match) => {
        if (!match?.id) {
            refreshLiveMatches();
            return;
        }

        dashboardMatches = match.status === "LIVE"
            ? [match, ...dashboardMatches.filter((item) => item.id !== match.id)]
            : dashboardMatches.filter((item) => item.id !== match.id);

        renderLiveMatches();
    });

}


// ==========================================
// ESCAPE KEY
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {
        populatePlayerInputDefaults();
        initializeLiveDashboard();
    }
);


document.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Escape") {

            closeMatchModal();

        }

    }
);


// ==========================================
// CLICK OUTSIDE MODAL
// ==========================================

document.addEventListener(
    "click",
    function (event) {

        const modal =
            document.getElementById(
                "matchModal"
            );


        if (!modal) {

            return;

        }


        if (event.target === modal) {

            closeMatchModal();

        }

    }
);