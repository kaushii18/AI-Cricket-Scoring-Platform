```javascript
// ==========================================
// CRICPULSE - MAIN JAVASCRIPT
// ==========================================

// =========================
// MATCH MODAL
// =========================

function openMatchModal() {
    const modal = document.getElementById("matchModal");

    if (!modal) {
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


// =========================
// CREATE MATCH
// =========================

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

    const team1 = team1Input.value.trim();
    const team2 = team2Input.value.trim();
    const overs = Number(oversInput.value);
    const tossWinner = tossInput.value;
    const tossDecision = tossDecisionInput.value;

    // Check team names
    if (team1 === "" || team2 === "") {
        alert("Please enter both team names.");
        return;
    }

    // Check duplicate team names
    if (team1.toLowerCase() === team2.toLowerCase()) {
        alert("Team 1 and Team 2 must be different.");
        return;
    }

    // Check overs
    if (![5, 10, 20, 50].includes(overs)) {
        alert("Please select a valid number of overs.");
        return;
    }

    // Check toss
    if (!["team1", "team2"].includes(tossWinner)) {
        alert("Please select the toss winner.");
        return;
    }

    // Check toss decision
    if (!["bat", "bowl"].includes(tossDecision)) {
        alert("Please select the toss decision.");
        return;
    }

    // Save complete match information
    const matchData = {
        team1: team1,
        team2: team2,
        overs: overs,
        tossWinner: tossWinner,
        tossDecision: tossDecision
    };

    localStorage.setItem(
        "cricPulseMatch",
        JSON.stringify(matchData)
    );

    // Close popup
    closeMatchModal();

    // Open live scorer
    window.location.href = "scorer.html";
}


// =========================
// TOURNAMENT TABS
// =========================

function switchTab(button, contentId) {
    if (!button) {
        return;
    }

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
    });

    document.querySelectorAll(".tab-content").forEach(function (content) {
        content.classList.remove("active");
    });

    button.classList.add("active");
    button.setAttribute("aria-selected", "true");

    const selectedContent = document.getElementById(contentId);

    if (selectedContent) {
        selectedContent.classList.add("active");
    }
}


// =========================
// ESCAPE KEY
// =========================

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeMatchModal();
    }
});
```
