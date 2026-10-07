// ==========================================
// CRICPULSE - MAIN JAVASCRIPT
// MATCH CREATION + PLAYER SETUP
// ==========================================

// ==========================================
// MATCH MODAL
// ==========================================
let dashboardMatches = [];
let showAllDashboardMatches = false;

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


function initializeLiveUpdates() {

    if (typeof io !== "function") {
        updateConnectionStatus(false);
        return;
    }

    const socket = io();

    socket.on("connect", () => {
        updateConnectionStatus(true);
    });

    socket.on("disconnect", () => {
        updateConnectionStatus(false);
    });

    socket.on("match:update", () => {
        window.clearTimeout(window.cricPulseDashboardRefresh);
        window.cricPulseDashboardRefresh = window.setTimeout(
            loadDashboardMatches,
            250
        );
    });

}


function formatTeamScore(team) {

    const runs = Number(team?.runs) || 0;
    const wickets = Number(team?.wickets) || 0;
    const balls = Number(team?.balls) || 0;

    return {
        score: `${runs}/${wickets}`,
        overs: `${Math.floor(balls / 6)}.${balls % 6} overs`
    };

}


function getMatchStatus(match) {

    if (match.status === "COMPLETED") {
        return { label: "FINAL", live: false };
    }

    if (match.status === "TOSS_PENDING") {
        return { label: "TOSS PENDING", live: false };
    }

    return { label: "LIVE", live: true };

}


function createMatchCard(match) {

    const team1 = match.teams?.team1 || {};
    const team2 = match.teams?.team2 || {};
    const team1Score = formatTeamScore(team1);
    const team2Score = formatTeamScore(team2);
    const status = getMatchStatus(match);
    const card = document.createElement("article");
    const main = document.createElement("div");
    const meta = document.createElement("div");
    const statusLabel = document.createElement("span");
    const oversLabel = document.createElement("span");
    const teams = document.createElement("div");
    const action = document.createElement("button");

    card.className = "match-card";
    main.className = "match-card-main";
    meta.className = "match-card-meta";
    statusLabel.className = status.live ? "match-live-label" : "match-status-label";
    statusLabel.textContent = status.label;
    oversLabel.textContent = match.overs ? `${match.overs} OVERS` : "MATCH";
    meta.append(statusLabel, oversLabel);

    teams.className = "match-teams";
    const vs = document.createElement("span");
    vs.className = "match-vs";
    vs.textContent = "VS";
    teams.append(
        createMatchSide(
            match.team1 || team1.name || "Team 1",
            team1,
            team1Score,
            match.battingTeam === match.team1
        ),
        vs,
        createMatchSide(
            match.team2 || team2.name || "Team 2",
            team2,
            team2Score,
            match.battingTeam === match.team2
        )
    );

    main.append(meta, teams);
    action.className = "match-card-action";
    action.type = "button";
    action.dataset.matchId = match.id;
    action.dataset.completed = String(match.status === "COMPLETED");
    action.textContent = match.status === "COMPLETED" ? "View match →" : "Continue scoring →";
    action.setAttribute("aria-label", `${action.textContent} for ${match.team1} versus ${match.team2}`);
    card.append(main, action);

    return card;

}


function createMatchSide(name, team, score, isBatting) {

    const side = document.createElement("div");
    const teamName = document.createElement("span");
    const teamScore = document.createElement("strong");
    const overs = document.createElement("span");

    side.className = "match-side";
    teamName.className = "match-team-name";
    teamName.textContent = name;
    teamScore.className = "match-score";
    teamScore.textContent = score.score;
    overs.className = "match-overs";
    overs.textContent = team.balls
        ? score.overs
        : isBatting
            ? "0.0 overs"
            : "Yet to bat";
    side.append(teamName, teamScore, overs);

    return side;

}


function showMatchListState(title, message, retry = false) {

    const list = document.getElementById("dashboardMatchList");
    if (!list) {
        return;
    }

    const state = document.createElement("div");
    const heading = document.createElement("strong");
    const copy = document.createElement("p");
    state.className = "match-state-card";
    heading.textContent = title;
    copy.textContent = message;
    state.append(heading, copy);

    if (retry) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary-button";
        button.textContent = "Try again";
        button.addEventListener("click", loadDashboardMatches);
        state.appendChild(button);
    }

    list.replaceChildren(state);
    const toggle = document.getElementById("toggleMatchesButton");
    if (toggle) {
        toggle.hidden = true;
    }

}


function createMatchGroup(title, matches) {

    if (!matches.length) {
        return null;
    }

    const group = document.createElement("section");
    const heading = document.createElement("h3");
    group.className = "match-group";
    heading.className = "match-group-heading";
    heading.textContent = title;
    group.appendChild(heading);
    matches.forEach((match) => group.appendChild(createMatchCard(match)));

    return group;

}


function renderDashboardMatches() {

    const list = document.getElementById("dashboardMatchList");
    const toggle = document.getElementById("toggleMatchesButton");
    if (!list) {
        return;
    }

    const activeMatches = dashboardMatches.filter(
        (match) => match.status !== "COMPLETED"
    );
    const completedMatches = dashboardMatches.filter(
        (match) => match.status === "COMPLETED"
    );
    const visibleActiveMatches = showAllDashboardMatches
        ? activeMatches
        : activeMatches.slice(0, 6);
    const visibleCompletedMatches = showAllDashboardMatches
        ? completedMatches
        : completedMatches.slice(0, 4);
    const groups = [
        createMatchGroup("In progress", visibleActiveMatches),
        createMatchGroup("Recently completed", visibleCompletedMatches)
    ].filter(Boolean);

    list.replaceChildren(...groups);
    if (toggle) {
        const hasMoreMatches = activeMatches.length > 6 || completedMatches.length > 4;
        toggle.hidden = !hasMoreMatches;
        toggle.setAttribute("aria-expanded", String(showAllDashboardMatches));
        toggle.textContent = showAllDashboardMatches
            ? "Show fewer matches"
            : `Show all ${dashboardMatches.length} matches`;
    }

    list.querySelectorAll("[data-match-id]").forEach((button) => {
        button.addEventListener("click", () => {
            openSavedMatch(button.dataset.matchId, button);
        });
    });

}


async function openSavedMatch(matchId, button) {

    if (!matchId || !window.CricPulsePythonAPI) {
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Loading…";
    }

    try {
        const match = await window.CricPulsePythonAPI.matchFromNode(matchId);
        localStorage.setItem("cricPulseMatch", JSON.stringify(match));
        window.location.href = "scorer.html";
    } catch (error) {
        console.error("Unable to open match:", error);
        alert(error.message || "Unable to open this match. Please try again.");
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.completed === "true"
                ? "View match →"
                : "Continue scoring →";
        }
    }

}


async function loadDashboardMatches() {

    const list = document.getElementById("dashboardMatchList");
    if (!list || !window.CricPulsePythonAPI) {
        return;
    }

    const errorMessage = document.getElementById("matchListError");
    const updatedLabel = document.getElementById("matchListUpdated");
    const count = document.getElementById("activeMatchCount");
    list.setAttribute("aria-busy", "true");
    if (errorMessage) {
        errorMessage.hidden = true;
        errorMessage.textContent = "";
    }

    try {
        const response = await window.CricPulsePythonAPI.matchesFromNode();
        const matches = Array.isArray(response)
            ? response
            : Array.isArray(response?.matches)
                ? response.matches
                : [];
        const sortedMatches = [...matches].sort((first, second) => {
            const firstDate = Date.parse(
                first.createdAt || first.created_at || first.updatedAt || first.updated_at || ""
            );
            const secondDate = Date.parse(
                second.createdAt || second.created_at || second.updatedAt || second.updated_at || ""
            );
            if (Number.isFinite(firstDate) && Number.isFinite(secondDate) && firstDate !== secondDate) {
                return secondDate - firstDate;
            }

            const firstIsCompleted = first.status === "COMPLETED";
            const secondIsCompleted = second.status === "COMPLETED";
            return Number(firstIsCompleted) - Number(secondIsCompleted);
        });
        const activeCount = matches.filter((match) => match.status !== "COMPLETED").length;
        dashboardMatches = sortedMatches;
        showAllDashboardMatches = false;

        if (count) {
            count.textContent = String(activeCount);
        }
        if (updatedLabel) {
            updatedLabel.textContent = "Saved matches";
        }

        if (!sortedMatches.length) {
            showMatchListState(
                "Your next innings starts here",
                "No saved matches yet. Create a match to start scoring."
            );
        } else {
            renderDashboardMatches();
        }

        if (errorMessage) {
            errorMessage.hidden = true;
        }
    } catch (error) {
        console.error("Unable to load saved matches:", error);
        if (count) {
            count.textContent = "—";
        }
        if (updatedLabel) {
            updatedLabel.textContent = "Match desk unavailable";
        }
        showMatchListState(
            "Could not load your matches",
            error.message || "Check your connection and try again.",
            true
        );
    } finally {
        list.setAttribute("aria-busy", "false");
    }

}


// ==========================================
// ESCAPE KEY
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {
        populatePlayerInputDefaults();
        initializeLiveUpdates();
        loadDashboardMatches();

        const menuToggle = document.querySelector(".menu-toggle");
        const navigation = document.getElementById("primaryNav");
        if (menuToggle && navigation) {
            menuToggle.addEventListener("click", () => {
                const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
                menuToggle.setAttribute("aria-expanded", String(!isExpanded));
                menuToggle.setAttribute(
                    "aria-label",
                    isExpanded ? "Open navigation menu" : "Close navigation menu"
                );
                navigation.classList.toggle("is-open", !isExpanded);
            });

            navigation.addEventListener("click", (event) => {
                if (event.target instanceof HTMLAnchorElement) {
                    menuToggle.setAttribute("aria-expanded", "false");
                    menuToggle.setAttribute("aria-label", "Open navigation menu");
                    navigation.classList.remove("is-open");
                }
            });
        }

        const toggleMatchesButton = document.getElementById("toggleMatchesButton");
        if (toggleMatchesButton) {
            toggleMatchesButton.addEventListener("click", () => {
                showAllDashboardMatches = !showAllDashboardMatches;
                renderDashboardMatches();
            });
        }
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