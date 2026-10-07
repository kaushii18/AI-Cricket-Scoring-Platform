const DEFAULT_AI_SERVICE_URL = "http://127.0.0.1:8001";
const DEFAULT_TIMEOUT_MS = 2000;

function unavailable(message, upstreamStatus) {
    const result = {
        available: false,
        status: "unavailable",
        service: "cricpulse-ai",
        error: message
    };

    if (upstreamStatus) {
        result.upstream_status = upstreamStatus;
    }

    return result;
}

async function requestAiService(path, options = {}) {
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
        return { ...unavailable(message), payload: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs
    );

    try {
        const headers = { accept: "application/json" };
        const requestOptions = {
            method: options.method || "GET",
            headers,
            signal: controller.signal
        };

        if (options.body !== undefined) {
            headers["content-type"] = "application/json";
            requestOptions.body = JSON.stringify(options.body);
        }

        const response = await fetchImpl(`${serviceUrl}${path}`, {
            ...requestOptions,
        });

        if (!response.ok) {
            const message = `AI service returned HTTP ${response.status}.`;
            console.warn(`[AI service] ${message}`);
            return { ...unavailable(message, response.status), payload: null };
        }

        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            const message = "AI service returned an invalid health response.";
            console.warn(`[AI service] ${message}`, error.message);
            return { ...unavailable(message), payload: null };
        }

        return { available: true, payload };
    } catch (error) {
        const timedOut = controller.signal.aborted;
        const message = timedOut
            ? `AI service request timed out after ${timeoutMs} ms.`
            : "Unable to connect to the AI service.";
        console.warn(`[AI service] ${message}`, error.message);
        return { ...unavailable(message), payload: null };
    } finally {
        clearTimeout(timeout);
    }
}

async function checkAiHealth(options = {}) {
    const result = await requestAiService("/health", options);
    if (!result.available) {
        return result;
    }

    if (
        result.payload?.status !== "ok" ||
        result.payload?.service !== "cricpulse-ai"
    ) {
        const message = "AI service returned an unexpected health response.";
        console.warn(`[AI service] ${message}`);
        return unavailable(message);
    }

    return {
        available: true,
        status: result.payload.status,
        service: result.payload.service
    };
}

async function analyzeMatch(match, options = {}) {
    const result = await requestAiService("/analyze/match", {
        ...options,
        method: "POST",
        body: match
    });

    if (!result.available) {
        return result;
    }

    return {
        available: true,
        analysis: result.payload
    };
}

async function predictMatchWin(match, options = {}) {
    const result = await requestAiService("/predict/win", {
        ...options,
        method: "POST",
        body: match
    });

    if (!result.available) {
        return result;
    }

    return {
        available: true,
        prediction: result.payload
    };
}

async function requestMatchInsights(match, options = {}) {
    const configuredTimeout = Number(process.env.AI_INSIGHTS_TIMEOUT_MS);
    const timeoutMs = options.timeoutMs || (
        Number.isFinite(configuredTimeout) && configuredTimeout > 0
            ? configuredTimeout
            : 25000
    );
    const result = await requestAiService("/ai/insights", {
        ...options,
        timeoutMs,
        method: "POST",
        body: match
    });

    if (!result.available) {
        return result;
    }

    return {
        available: true,
        insights: result.payload
    };
}

module.exports = {
    analyzeMatch,
    checkAiHealth,
    predictMatchWin,
    requestMatchInsights
};