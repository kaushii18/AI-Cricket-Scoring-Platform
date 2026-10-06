// ==========================================
// CRICPULSE - MAIN JAVASCRIPT
// MATCH CREATION + PLAYER SETUP
// ==========================================

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

}


// ==========================================
// ESCAPE KEY
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {
        populatePlayerInputDefaults();
        initializeLiveUpdates();
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