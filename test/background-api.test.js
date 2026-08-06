import assert from "node:assert/strict";
import test from "node:test";

import {
    createBackgroundRuntime,
    currentCacheMetadata,
    jsonResponse
} from "./helpers/background-runtime.js";


test("apiFetch sends a cookie-free JSON request without obsolete authorization", async () => {
    let capturedURL;
    let capturedInit;
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (url, init) => {
            capturedURL = url;
            capturedInit = init;
            return jsonResponse({data: {ok: true}});
        }
    });

    const result = await runtime.evaluate("apiFetch")("query Test { ok }", {value: 1});

    assert.equal(capturedURL, "https://www.ratemyprofessors.com/graphql");
    assert.equal(capturedInit.method, "POST");
    assert.equal(capturedInit.credentials, "omit");
    assert.equal(capturedInit.headers["Content-Type"], "application/json");
    assert.equal("Authorization" in capturedInit.headers, false);
    assert.ok(capturedInit.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(capturedInit.body), {
        query: "query Test { ok }",
        variables: {value: 1}
    });
    assert.equal(result.data.ok, true);
});


test("apiFetch reports invalid JSON and missing GraphQL data", async t => {
    await t.test("invalid JSON", async () => {
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async () => new Response("not-json")
        });
        await assert.rejects(
            runtime.evaluate("apiFetch")("query Test { ok }", {}),
            /API fetch failed: invalid JSON response/
        );
    });

    await t.test("missing data property", async () => {
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async () => jsonResponse({extensions: {}})
        });
        await assert.rejects(
            runtime.evaluate("apiFetch")("query Test { ok }", {}),
            /API fetch failed: no data returned/
        );
    });
});


test("apiFetch retains a defensive failure when configured with a negative retry budget", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    runtime.context.MAX_FETCH_RETRIES = -1;
    await assert.rejects(
        runtime.evaluate("apiFetch")("query Test { ok }", {}),
        /API fetch failed/
    );
});


test("apiFetch reports every useful GraphQL error, even alongside partial data", async () => {
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => jsonResponse({
            data: {partial: true},
            errors: [{message: "First failure"}, {}, {message: "Second failure"}]
        })
    });

    await assert.rejects(
        runtime.evaluate("apiFetch")("query Test { ok }", {}),
        /API fetch failed: First failure; Second failure/
    );
});


test("apiFetch retries every configured transient HTTP status", async t => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
        await t.test(String(status), async () => {
            let fetchCount = 0;
            const runtime = await createBackgroundRuntime({
                storedItems: currentCacheMetadata(),
                fetchImpl: async () => {
                    fetchCount += 1;
                    return fetchCount === 1
                        ? new Response("busy", {status, headers: {"Retry-After": "0"}})
                        : jsonResponse({data: {ok: true}});
                }
            });

            const result = await runtime.evaluate("apiFetch")("query Test { ok }", {});
            assert.equal(fetchCount, 2);
            assert.equal(result.data.ok, true);
        });
    }
});


test("apiFetch does not retry permanent client errors", async t => {
    for (const status of [400, 401, 403, 404, 422]) {
        await t.test(String(status), async () => {
            let fetchCount = 0;
            const runtime = await createBackgroundRuntime({
                storedItems: currentCacheMetadata(),
                fetchImpl: async () => {
                    fetchCount += 1;
                    return new Response("Permanent failure", {status});
                }
            });
            await assert.rejects(
                runtime.evaluate("apiFetch")("query Test { ok }", {}),
                new RegExp(`code ${status}`)
            );
            assert.equal(fetchCount, 1);
        });
    }
});


test("apiFetch exhausts the bounded retry budget for responses and network errors", async t => {
    await t.test("retryable response", async () => {
        let fetchCount = 0;
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async () => {
                fetchCount += 1;
                return new Response("still busy", {status: 503, headers: {"Retry-After": "0"}});
            }
        });
        await assert.rejects(
            runtime.evaluate("apiFetch")("query Test { ok }", {}),
            /code 503, still busy/
        );
        assert.equal(fetchCount, 3);
    });

    await t.test("network failure", async () => {
        let fetchCount = 0;
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async () => {
                fetchCount += 1;
                throw new TypeError("offline");
            }
        });
        runtime.context.FETCH_RETRY_BASE_DELAY_MS = 0;
        await assert.rejects(
            runtime.evaluate("apiFetch")("query Test { ok }", {}),
            /could not reach RateMyProfessors \(offline\)/
        );
        assert.equal(fetchCount, 3);
    });
});


test("apiFetch aborts timed-out requests and clears each timeout", async () => {
    let fetchCount = 0;
    const clearedTimeouts = [];
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        clearTimeoutImpl(timeoutID) {
            clearedTimeouts.push(timeoutID);
            clearTimeout(timeoutID);
        },
        fetchImpl: async (_url, {signal}) => {
            fetchCount += 1;
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {once: true});
            });
        }
    });
    runtime.context.FETCH_TIMEOUT_MS = 5;
    runtime.context.MAX_FETCH_RETRIES = 0;

    await assert.rejects(
        runtime.evaluate("apiFetch")("query Test { ok }", {}),
        /request timed out after 5ms/
    );
    assert.equal(fetchCount, 1);
    assert.equal(clearedTimeouts.length, 1);
});


test("retry delays parse seconds and dates, cap extremes, and jitter fallback", async () => {
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        mathRandom: 0.5
    });
    const getRetryDelay = runtime.evaluate("getRetryDelay");

    assert.equal(getRetryDelay(new Response(null, {headers: {"Retry-After": "2"}}), 0), 2_000);
    assert.equal(getRetryDelay(new Response(null, {headers: {"Retry-After": "999"}}), 0), 5_000);
    assert.equal(getRetryDelay(new Response(null, {headers: {"Retry-After": "invalid"}}), 1), 800);
    assert.equal(getRetryDelay(null, 20), 5_000);

    const future = new Date(Date.now() + 1_000).toUTCString();
    const parsedDateDelay = getRetryDelay(new Response(null, {headers: {"Retry-After": future}}), 0);
    assert.ok(parsedDateDelay >= 0 && parsedDateDelay <= 1_000);
    await runtime.evaluate("delay")(1);
});


test("HTTP error reasons are bounded, entity-decoded, and stripped of markup/control characters", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const sanitize = runtime.evaluate("sanitizeErrorReason");

    assert.equal(
        sanitize(" &lt;b&gt;Bad&amp;Wrong&lt;/b&gt; &#39;quoted&#39; &quot;x&quot;\u0000 "),
        "Bad&Wrong 'quoted' \"x\""
    );

    runtime.context.fetch = async () => new Response(
        `<html><head><title>${"x".repeat(300)} &amp; safe</title></head><script>bad()</script></html>`,
        {status: 400}
    );
    await assert.rejects(runtime.evaluate("apiFetch")("query Test { ok }", {}), error => {
        const reason = error.message.slice(error.message.indexOf(", ") + 2);
        assert.equal(reason.length, 160);
        assert.doesNotMatch(reason, /<|>|script/);
        return true;
    });
});


test("error-body readers handle streams, plain text fallbacks, cancellation failures, and unreadable bodies", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const readResponsePrefix = runtime.evaluate("readResponsePrefix");
    const readErrorReason = runtime.evaluate("readErrorReason");
    const cancelResponseBody = runtime.evaluate("cancelResponseBody");

    const fallbackResponse = {
        body: null,
        async text() {
            return "abcdefgh";
        }
    };
    assert.equal(await readResponsePrefix(fallbackResponse, 4), "abcd");

    const streamed = new Response("multibyte café and extra");
    const prefix = await readResponsePrefix(streamed, 10);
    assert.ok(new TextEncoder().encode(prefix).length <= 12);

    await assert.doesNotReject(cancelResponseBody({
        body: {async cancel() { throw new Error("already closed"); }}
    }));
    assert.equal(await readErrorReason({
        body: null,
        async text() { throw new Error("unreadable"); }
    }), "");
});


test("the global API queue caps concurrency and releases slots after rejection", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    let requestNumber = 0;
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => {
            const current = ++requestNumber;
            activeRequests += 1;
            maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
            await new Promise(resolve => setTimeout(resolve, 5));
            activeRequests -= 1;
            if (current === 1) {
                return new Response("bad", {status: 400});
            }
            return jsonResponse({data: {ok: true}});
        }
    });
    runtime.context.MAX_CONCURRENT_API_REQUESTS = 2;

    const apiFetch = runtime.evaluate("apiFetch");
    const results = await Promise.allSettled(Array.from({length: 7}, (_, index) =>
        apiFetch("query Test { ok }", {index})
    ));

    assert.equal(maximumActiveRequests, 2);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 6);
    assert.equal(results.filter(result => result.status === "rejected").length, 1);
    assert.equal(runtime.evaluate("activeApiRequests"), 0);
    assert.equal(runtime.evaluate("queuedApiRequests.length"), 0);
});
