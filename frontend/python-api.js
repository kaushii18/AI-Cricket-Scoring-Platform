// Scoring REST requests use FastAPI, which forwards them to the existing Node engine.
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

    function nodePost(path, body) {
        return nodeRequest(path, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    window.CricPulsePythonAPI = Object.freeze({
        baseUrl: apiBase,
        health: () => request("/health"),
        matches: () => request("/matches"),
        match: (matchId) => request(`/matches/${encodeURIComponent(matchId)}`),
        createMatch: (match) => post("/matches", match),
        tossMatch: (matchId, callerTeam, call) => nodePost(
            `/matches/${encodeURIComponent(matchId)}/toss/flip`,
            { callerTeam, call }
        ),
        decideToss: (matchId, actorTeam, decision) => nodePost(
            `/matches/${encodeURIComponent(matchId)}/toss/decision`,
            { actorTeam, decision }
        ),
        matchesFromNode: () => nodeRequest("/matches"),
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
        recordBall: (matchId, ball) => post(`/matches/${encodeURIComponent(matchId)}/balls`, ball),
        undoBall: (matchId) => post(`/matches/${encodeURIComponent(matchId)}/undo`, {}),
        updatePlayers: (matchId, players) => post(`/matches/${encodeURIComponent(matchId)}/players`, players),
        resetMatch: (matchId) => post(`/matches/${encodeURIComponent(matchId)}/reset`, {}),
        setPlayerOfMatch: (matchId, playerId) => post(`/matches/${encodeURIComponent(matchId)}/player-of-the-match`, { playerId }),
        teams: () => request("/teams"),
        createTeam: (team) => post("/teams", team),
        players: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/players`),
        scores: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/scores`),
        overs: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/overs`),
        statistics: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/statistics`),
        insights: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/insights`)
    });
})();