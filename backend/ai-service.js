const DEFAULT_AI_SERVICE_URL = "http://127.0.0.1:8001";
const DEFAULT_TIMEOUT_MS = 2000;

function unavailable(message) {
    return {
        available: false,
        status: "unavailable",
        service: "cricpulse-ai",
        error: message
    };
}

async function checkAiHealth(options = {}) {
    const serviceUrl = (
        options.serviceUrl ||
        process.env.AI_SERVICE_URL ||
        DEFAULT_AI_SERVICE_URL
    ).replace(/\/+$/, "");
    const configuredTimeout = Number(
        options.timeoutMs ?? process.env.AI_SERVICE_TIMEOUT_MS
    );
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    const fetchImpl = options.fetchImpl || globalThis.fetch;

    if (typeof fetchImpl !== "function") {
        const message = "Node.js fetch is unavailable; use Node.js 18 or later.";
        console.error(`[AI service] ${message}`);
        return unavailable(message);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs
    );

    try {
        const response = await fetchImpl(`${serviceUrl}/health`, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: controller.signal
        });

        if (!response.ok) {
            const message = `AI service returned HTTP ${response.status}.`;
            console.warn(`[AI service] ${message}`);
            return unavailable(message);
        }

        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            const message = "AI service returned an invalid health response.";
            console.warn(`[AI service] ${message}`, error.message);
            return unavailable(message);
        }

        if (payload?.status !== "ok" || payload?.service !== "cricpulse-ai") {
            const message = "AI service returned an unexpected health response.";
            console.warn(`[AI service] ${message}`);
            return unavailable(message);
        }

        return {
            available: true,
            status: payload.status,
            service: payload.service
        };
    } catch (error) {
        const timedOut = controller.signal.aborted;
        const message = timedOut
            ? `AI service health check timed out after ${timeoutMs} ms.`
            : "Unable to connect to the AI service.";
        console.warn(`[AI service] ${message}`, error.message);
        return unavailable(message);
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { checkAiHealth };