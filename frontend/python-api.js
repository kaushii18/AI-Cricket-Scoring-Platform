// Match creation and scoring use the same-origin Node API. The versioned Python
// API remains available for optional REST and analytics endpoints.
(function () {
    const defaultApiBase = `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
    const apiBase = (window.CRICPULSE_PYTHON_API_BASE || defaultApiBase)
        .replace(/\/$/, "");

    async function request(path, options = {}) {
        const response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options?.headers || {})
            }
        });
        const payload = await response.json();

        if (!response.ok) {
            const detail = payload.detail;
            const message = Array.isArray(detail)
                ? detail.map((issue) => issue.msg || "Invalid request").join(" ")
                : detail || payload.message || "Python API request failed.";
            throw new Error(message);
        }

        return payload;
    }

    function post(path, body) {
        return request(path, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    async function nodeRequest(path, options = {}) {
        const response = await fetch(`${window.location.origin}/api${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
        const payload = await response.json();

        if (!response.ok) {
            const detail = payload.detail;
            const detailMessage = typeof detail === "string"
                ? detail
                : detail?.message;
            throw new Error(
                payload.message ||
                payload.error ||
                detailMessage ||
                "The match server request failed."
            );
        }

        return payload;
    }

    async function exportMatches() {
        const response = await fetch(`${window.location.origin}/api/matches/export`);
        if (!response.ok) {
            const payload = await response.json();
            throw new Error(
                payload.message || "Unable to export the match archive."
            );
        }

        return response.blob();
    }

    function nodePost(path, body) {
        return nodeRequest(path, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    window.CricPulsePythonAPI = Object.freeze({
        baseUrl: apiBase,
        health: () => request("/health"),
        matches: () => nodeRequest("/matches"),
        match: (matchId) => nodeRequest(`/matches/${encodeURIComponent(matchId)}`),
        createMatch: (match) => nodePost("/matches", match),
        tossMatch: (matchId, callerTeam, call) => nodePost(
            `/matches/${encodeURIComponent(matchId)}/toss/flip`,
            { callerTeam, call }
        ),
        decideToss: (matchId, actorTeam, decision) => nodePost(
            `/matches/${encodeURIComponent(matchId)}/toss/decision`,
            { actorTeam, decision }
        ),
        matchesFromNode: () => nodeRequest("/matches"),
        exportMatches,
        importMatches: (matches) => nodePost("/matches/import", { matches }),
        matchFromNode: (matchId) => nodeRequest(
            `/matches/${encodeURIComponent(matchId)}`
        ),
        analyzeMatchState: (matchId) => nodePost(
            "/ai/analyze/match",
            { matchId }
        ),
        predictMatchWin: (matchId) => nodePost(
            "/ai/predict/win",
            { matchId }
        ),
        generateMatchInsights: (matchId) => nodePost(
            "/ai/insights",
            { matchId }
        ),
        matchMomentum: (matchId) => nodePost(
            "/ai/momentum",
            { matchId }
        ),
        playerAnalysis: (matchId) => nodePost(
            "/ai/player-analysis",
            { matchId }
        ),
        matchSummary: (matchId) => nodePost(
            "/ai/match-summary",
            { matchId }
        ),
        predictionHistory: (matchId) => nodeRequest(
            `/ai/prediction-history/${encodeURIComponent(matchId)}`
        ),
        tournamentAnalytics: () => nodeRequest("/ai/tournament"),
        recordBall: (matchId, ball) => nodePost(`/matches/${encodeURIComponent(matchId)}/balls`, ball),
        undoBall: (matchId) => nodePost(`/matches/${encodeURIComponent(matchId)}/undo`, {}),
        swapStrike: (matchId) => nodePost(`/matches/${encodeURIComponent(matchId)}/swap-strike`, {}),
        changeBowler: (matchId, bowlerId) => nodePost(`/matches/${encodeURIComponent(matchId)}/change-bowler`, { bowlerId }),
        changeBatsman: (matchId, data) => nodePost(`/matches/${encodeURIComponent(matchId)}/change-batsman`, data),
        updatePlayerName: (matchId, playerId, name) => nodeRequest(`/matches/${encodeURIComponent(matchId)}/players/${encodeURIComponent(playerId)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
        updatePlayers: (matchId, players) => nodePost(`/matches/${encodeURIComponent(matchId)}/players`, players),
        resetMatch: (matchId) => nodePost(`/matches/${encodeURIComponent(matchId)}/reset`, {}),
        setPlayerOfMatch: (matchId, playerId) => nodePost(`/matches/${encodeURIComponent(matchId)}/player-of-the-match`, { playerId }),
        teams: () => request("/teams"),
        createTeam: (team) => post("/teams", team),
        players: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/players`),
        scores: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/scores`),
        overs: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/overs`),
        statistics: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/statistics`),
        insights: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/insights`)
    });
})();