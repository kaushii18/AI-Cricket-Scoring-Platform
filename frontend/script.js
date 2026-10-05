// ==========================================
// CRICPULSE - MAIN JAVASCRIPT
// MATCH CREATION + PLAYER SETUP
// ==========================================

let playerSetupMode = false;


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

    Array.from(document.querySelectorAll(".team1-player-input")).forEach((input, index) => {
        if (!input.dataset.customized) {
            input.value = `${team1Name} Player ${index + 1}`;
        }
    });

    Array.from(document.querySelectorAll(".team2-player-input")).forEach((input, index) => {
        if (!input.dataset.customized) {
            input.value = `${team2Name} Player ${index + 1}`;
        }
    });

    document.querySelectorAll(".player-name-input").forEach((input) => {
        input.addEventListener("input", function () {
            input.dataset.customized = String(Boolean(this.value.trim()));
        });
    });

}

function populatePlayerInputDefaults() {

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

    const tossInput =
        document.getElementById("toss");

    const tossDecisionInput =
        document.getElementById("tossDecision");


    if (
        !team1Input ||
        !team2Input ||
        !oversInput ||
        !tossInput ||
        !tossDecisionInput
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

    const tossWinner =
        tossInput.value;

    const tossDecision =
        tossDecisionInput.value;


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


    if (
        tossWinner !== "team1" &&
        tossWinner !== "team2"
    ) {

        alert(
            "Please select the toss winner."
        );

        return;
    }


    if (
        tossDecision !== "bat" &&
        tossDecision !== "bowl"
    ) {

        alert(
            "Please select the toss decision."
        );

        return;
    }


    // ==========================================
    // TOSS
    // ==========================================

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


    // ==========================================
    // DEFAULT PLAYERS
    //
    // We create 11 player slots for each team.
    // Names will be editable in the scorer.
    // ==========================================

    const team1Players =
        getPlayerNameInputs("team1")
            .length
            ? getPlayerNameInputs("team1")
            : createDefaultPlayers(team1).map((player) => player.name);

    const team2Players =
        getPlayerNameInputs("team2")
            .length
            ? getPlayerNameInputs("team2")
            : createDefaultPlayers(team2).map((player) => player.name);


    // ==========================================
    // MATCH DATA
    // ==========================================

    const matchData = {

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

        target: null,

        result: null,


        // ======================================
        // TEAM DATA
        // ======================================

        teams: {

            team1: {

                name: team1,

                runs: 0,

                wickets: 0,

                balls: 0,

                players: team1Players

            },


            team2: {

                name: team2,

                runs: 0,

                wickets: 0,

                balls: 0,

                players: team2Players

            }

        },


        // ======================================
        // SCORECARD DATA
        // ======================================

        scorecard: {

            currentBatters: [],

            currentBowler: null,

            innings: {

                first: {

                    battingTeam: battingTeam,

                    runs: 0,

                    wickets: 0,

                    balls: 0,

                    overs: overs,

                    completed: false

                },

                second: {

                    battingTeam: bowlingTeam,

                    runs: 0,

                    wickets: 0,

                    balls: 0,

                    overs: overs,

                    completed: false

                }

            }

        },


        // ======================================
        // BALL DATA
        // ======================================

        balls: [],

        recentBalls: [],


        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    // ==========================================
    // SEND TO BACKEND
    // ==========================================

    try {

        const response =
            await fetch(
                "/api/matches",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            team1,

                            team2,

                            overs,

                            tossWinner,

                            tossDecision,

                            team1Players,

                            team2Players

                        })

                }
            );


        const savedMatch =
            await response.json();


        if (!response.ok) {

            throw new Error(
                savedMatch.message ||
                "Unable to create the match."
            );

        }


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
// TOURNAMENT TABS
// ==========================================

function switchTab(
    button,
    contentId
) {

    if (!button) {

        return;

    }


    document
        .querySelectorAll(".tab-btn")
        .forEach(
            function (btn) {

                btn.classList.remove(
                    "active"
                );

                btn.setAttribute(
                    "aria-selected",
                    "false"
                );

            }
        );


    document
        .querySelectorAll(".tab-content")
        .forEach(
            function (content) {

                content.classList.remove(
                    "active"
                );

            }
        );


    button.classList.add(
        "active"
    );


    button.setAttribute(
        "aria-selected",
        "true"
    );


    const selectedContent =
        document.getElementById(
            contentId
        );


    if (selectedContent) {

        selectedContent.classList.add(
            "active"
        );

    }
}


// ==========================================
// ESCAPE KEY
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {
        populatePlayerInputDefaults();
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