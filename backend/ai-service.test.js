const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeMatch, checkAiHealth } = require("./ai-service");

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