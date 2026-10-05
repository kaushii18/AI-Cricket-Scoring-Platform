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

    window.CricPulsePythonAPI = Object.freeze({
        baseUrl: apiBase,
        health: () => request("/health"),
        flipToss: (toss) => post("/toss/flip", toss),
        matches: () => request("/matches"),
        match: (matchId) => request(`/matches/${encodeURIComponent(matchId)}`),
        createMatch: (match) => post("/matches", match),
        recordBall: (matchId, ball) => post(`/matches/${encodeURIComponent(matchId)}/balls`, ball),
        updatePlayers: (matchId, players) => post(`/matches/${encodeURIComponent(matchId)}/players`, players),
        resetMatch: (matchId) => post(`/matches/${encodeURIComponent(matchId)}/reset`, {}),
        teams: () => request("/teams"),
        createTeam: (team) => post("/teams", team),
        players: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/players`),
        scores: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/scores`),
        overs: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/overs`),
        statistics: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/statistics`),
        insights: (matchId) => request(`/matches/${encodeURIComponent(matchId)}/insights`)
    });
})();