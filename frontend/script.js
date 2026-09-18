javascript
// ==========================================
// CRICPULSE - MAIN JAVASCRIPT
// Dynamic Match Management
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

function handleMatchSubmit(event) {
    event.preventDefault();

    const team1Input = document.getElementById("team1");
    const team2Input = document.getElementById("team2");
    const oversInput = document.getElementById("overs");
    const tossInput = document.getElementById("toss");
    const tossDecisionInput = document.getElementById("tossDecision");

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
    // GET USER INPUT
    // ==========================================

    const team1 = team1Input.value.trim();
    const team2 = team2Input.value.trim();

    const overs = Number(oversInput.value);

    const tossWinner = tossInput.value;
    const tossDecision = tossDecisionInput.value;


    // ==========================================
    // VALIDATION
    // ==========================================

    if (team1 === "" || team2 === "") {
        alert("Please enter both team names.");
        return;
    }


    if (team1.toLowerCase() === team2.toLowerCase()) {
        alert("Team 1 and Team 2 must be different.");
        return;
    }


    if (![5, 10, 20, 50].includes(overs)) {
        alert("Please select a valid number of overs.");
        return;
    }


    if (tossWinner !== "team1" && tossWinner !== "team2") {
        alert("Please select the toss winner.");
        return;
    }


    if (tossDecision !== "bat" && tossDecision !== "bowl") {
        alert("Please select the toss decision.");
        return;
    }


    // ==========================================
    // FIND TOSS WINNER NAME
    // ==========================================

    const tossWinnerName =
        tossWinner === "team1" ? team1 : team2;


    // ==========================================
    // FIND BATTING TEAM
    // ==========================================

    let battingTeam;

    if (tossDecision === "bat") {
        battingTeam = tossWinnerName;
    } else {
        battingTeam =
            tossWinner === "team1" ? team2 : team1;
    }


    // ==========================================
    // FIND BOWLING TEAM
    // ==========================================

    const bowlingTeam =
        battingTeam === team1 ? team2 : team1;


    // ==========================================
    // INITIAL TEAM DATA
    // ==========================================

    const team1Data = {
        name: team1,
        runs: 0,
        wickets: 0,
        balls: 0
    };


    const team2Data = {
        name: team2,
        runs: 0,
        wickets: 0,
        balls: 0
    };


    // ==========================================
    // CREATE MATCH OBJECT
    // ==========================================

    const matchData = {
        id: Date.now(),

        team1: team1,
        team2: team2,

        overs: overs,

        tossWinner: tossWinner,
        tossWinnerName: tossWinnerName,
        tossDecision: tossDecision,

        battingTeam: battingTeam,
        bowlingTeam: bowlingTeam,

        currentInnings: 1,

        status: "LIVE",

        teams: {
            team1: team1Data,
            team2: team2Data
        },

        balls: [],

        recentBalls: [],

        target: null,

        result: null,

        createdAt: new Date().toISOString()
    };


    // ==========================================
    // SAVE MATCH
    // ==========================================

    try {
        localStorage.setItem(
            "cricPulseMatch",
            JSON.stringify(matchData)
        );
    } catch (error) {
        console.error("Unable to save match:", error);

        alert("Unable to save match data.");
        return;
    }


    // ==========================================
    // CLOSE MODAL
    // ==========================================

    closeMatchModal();


    // ==========================================
    // OPEN SCORER
    // ==========================================

    window.location.href = "scorer.html";
}


// ==========================================
// GET CURRENT MATCH
// ==========================================

function getCurrentMatch() {
    const savedMatch =
        localStorage.getItem("cricPulseMatch");

    if (!savedMatch) {
        return null;
    }

    try {
        return JSON.parse(savedMatch);
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
    localStorage.removeItem("cricPulseMatch");
}


// ==========================================
// TOURNAMENT TABS
// ==========================================

function switchTab(button, contentId) {
    if (!button) {
        return;
    }


    // Remove active state from all tabs

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
    });


    // Hide all tab content

    document.querySelectorAll(".tab-content").forEach(function (content) {
        content.classList.remove("active");
    });


    // Activate selected tab

    button.classList.add("active");
    button.setAttribute("aria-selected", "true");


    // Show selected content

    const selectedContent =
        document.getElementById(contentId);

    if (selectedContent) {
        selectedContent.classList.add("active");
    }
}


// ==========================================
// CLOSE MODAL WITH ESCAPE KEY
// ==========================================

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeMatchModal();
    }
});


// ==========================================
// CLOSE MODAL WHEN CLICKING OUTSIDE
// ==========================================

document.addEventListener("click", function (event) {
    const modal = document.getElementById("matchModal");

    if (!modal) {
        return;
    }

    if (event.target === modal) {
        closeMatchModal();
    }
});
