const test = require("node:test");
const assert = require("node:assert/strict");
const {
    analyzeMatch,
    checkAiHealth,
    predictMatchWin,
    requestMatchInsights
} = require("./ai-service");

function mockResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

test("returns the AI service health when the service responds", async () => {
    const health = await checkAiHealth({
        serviceUrl: "http://ai.test/",
        fetchImpl: async (url) => {
            assert.equal(url, "http://ai.test/health");
            return mockResponse(200, {
                status: "ok",
                service: "cricpulse-ai"
            });
        }
    });

    assert.deepEqual(health, {
        available: true,
        status: "ok",
        service: "cricpulse-ai"
    });
});

test("returns an unavailable fallback for an HTTP error", async (context) => {
    const originalWarn = console.warn;
    console.warn = () => {};
    context.after(() => {
        console.warn = originalWarn;
    });

    const health = await checkAiHealth({
        fetchImpl: async () => mockResponse(503, {})
    });

    assert.equal(health.available, false);
    assert.match(health.error, /HTTP 503/);
});

test("returns an unavailable fallback for a connection error", async (context) => {
    const originalWarn = console.warn;
    console.warn = () => {};
    context.after(() => {
        console.warn = originalWarn;
    });

    const health = await checkAiHealth({
        fetchImpl: async () => {
            throw new Error("connection refused");
        }
    });

    assert.equal(health.available, false);
    assert.match(health.error, /Unable to connect/);
});

test("returns an unavailable fallback when the health check times out", async (context) => {
    const originalWarn = console.warn;
    console.warn = () => {};
    context.after(() => {
        console.warn = originalWarn;
    });

    const health = await checkAiHealth({
        timeoutMs: 5,
        fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener(
                "abort",
                () => reject(new Error("request aborted")),
                { once: true }
            );
        })
    });

    assert.equal(health.available, false);
    assert.match(health.error, /timed out after 5 ms/);
});

test("posts the supplied CricPulse match record for analysis", async () => {
    const match = {
        id: "saved-match",
        overs: 5,
        currentInnings: 1,
        battingTeam: "Falcons"
    };
    const analysis = await analyzeMatch(match, {
        serviceUrl: "http://ai.test",
        fetchImpl: async (url, options) => {
            assert.equal(url, "http://ai.test/analyze/match");
            assert.equal(options.method, "POST");
            assert.equal(options.headers["content-type"], "application/json");
            assert.deepEqual(JSON.parse(options.body), match);
            return mockResponse(200, { current_run_rate: 6.5 });
        }
    });

    assert.deepEqual(analysis, {
        available: true,
        analysis: { current_run_rate: 6.5 }
    });
});

test("posts a saved match to the win prediction endpoint", async () => {
    const match = { id: "saved-match", status: "LIVE" };
    const result = await predictMatchWin(match, {
        serviceUrl: "http://ai.test",
        fetchImpl: async (url, options) => {
            assert.equal(url, "http://ai.test/predict/win");
            assert.equal(options.method, "POST");
            assert.deepEqual(JSON.parse(options.body), match);
            return mockResponse(200, {
                batting_team_win_probability: 0.61,
                bowling_team_win_probability: 0.39,
                model_version: "v1"
            });
        }
    });

    assert.equal(result.available, true);
    assert.equal(result.prediction.batting_team_win_probability, 0.61);
});

test("gives LLM insight requests a longer provider timeout", async () => {
    const match = { id: "saved-match", status: "LIVE" };
    const result = await requestMatchInsights(match, {
        serviceUrl: "http://ai.test",
        timeoutMs: 25000,
        fetchImpl: async (url, options) => {
            assert.equal(url, "http://ai.test/ai/insights");
            assert.equal(options.signal.aborted, false);
            assert.deepEqual(JSON.parse(options.body), match);
            return mockResponse(200, {
                headline: "A close contest",
                insights: ["The chase is active.", "Recent deliveries are even."]
            });
        }
    });

    assert.equal(result.available, true);
    assert.equal(result.insights.headline, "A close contest");
});