import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";


const constantsSource = await readFile(new URL("../src/js/constants.js", import.meta.url), "utf8");
const fuseSource = await readFile(new URL("../src/js/fuse.js", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("../src/js/background.js", import.meta.url), "utf8");


async function createBackgroundContext({fetchImpl, storedItems = {}} = {}) {
    const storageItems = {...storedItems};
    let messageListener = null;
    const storage = {
        async get() {
            return {...storageItems};
        },
        async set(items) {
            Object.assign(storageItems, items);
        },
        async clear() {
            for (const key of Object.keys(storageItems)) {
                delete storageItems[key];
            }
        }
    };

    const context = vm.createContext({
        AbortController,
        Date,
        Error,
        Headers,
        JSON,
        Map,
        Math,
        Number,
        Object,
        Promise,
        Reflect,
        Response,
        Set,
        String,
        TextDecoder,
        URL,
        URLSearchParams,
        clearTimeout,
        console,
        fetch: fetchImpl ?? (async () => jsonResponse({data: {newSearch: {teachers: {edges: []}}}})),
        importScripts() {},
        setTimeout,
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    }
                }
            },
            storage: {local: storage}
        }
    });
    context.self = context;

    vm.runInContext(constantsSource, context, {filename: "constants.js"});
    vm.runInContext(fuseSource, context, {filename: "fuse.js"});
    vm.runInContext(backgroundSource, context, {filename: "background.js"});
    await vm.runInContext("cacheReady", context);

    return {
        context,
        messageListener,
        storageItems,
        evaluate(expression) {
            return vm.runInContext(expression, context);
        }
    };
}


function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {"Content-Type": "application/json"},
        ...init
    });
}


test("apiFetch omits cookies, sends JSON, and does not send the obsolete authorization header", async () => {
    let capturedURL;
    let capturedInit;
    const runtime = await createBackgroundContext({
        fetchImpl: async (url, init) => {
            capturedURL = url;
            capturedInit = init;
            return jsonResponse({data: {ok: true}});
        }
    });

    const result = await runtime.evaluate("apiFetch")("query Test { ok }", {value: 1});

    assert.equal(capturedURL, "https://www.ratemyprofessors.com/graphql");
    assert.equal(capturedInit.credentials, "omit");
    assert.equal(capturedInit.headers["Content-Type"], "application/json");
    assert.equal("Authorization" in capturedInit.headers, false);
    assert.deepEqual(JSON.parse(capturedInit.body), {
        query: "query Test { ok }",
        variables: {value: 1}
    });
    assert.equal(result.data.ok, true);
});


test("apiFetch reports the bounded, sanitized nginx error reason", async () => {
    const runtime = await createBackgroundContext({
        fetchImpl: async () => new Response(
            "<html><head><title>400 Request Header Or Cookie Too Large</title></head><script>bad()</script></html>",
            {status: 400}
        )
    });

    await assert.rejects(
        runtime.evaluate("apiFetch")("query Test { ok }", {}),
        error => {
            assert.match(error.message, /400 Request Header Or Cookie Too Large/);
            assert.doesNotMatch(error.message, /<|>|script/);
            return true;
        }
    );
});


test("apiFetch retries a transient response and respects a zero Retry-After", async () => {
    let fetchCount = 0;
    const runtime = await createBackgroundContext({
        fetchImpl: async () => {
            fetchCount += 1;
            if (fetchCount === 1) {
                return new Response("busy", {status: 503, headers: {"Retry-After": "0"}});
            }
            return jsonResponse({data: {ok: true}});
        }
    });
    runtime.context.FETCH_RETRY_BASE_DELAY_MS = 0;

    const result = await runtime.evaluate("apiFetch")("query Test { ok }", {});

    assert.equal(fetchCount, 2);
    assert.equal(result.data.ok, true);
});


test("apiFetch surfaces GraphQL errors returned with HTTP 200", async () => {
    const runtime = await createBackgroundContext({
        fetchImpl: async () => jsonResponse({data: null, errors: [{message: "Unknown teacher"}]})
    });

    await assert.rejects(
        runtime.evaluate("apiFetch")("query Test { ok }", {}),
        /API fetch failed: Unknown teacher/
    );
});


test("a professor lookup fetches five complete search results and reuses its cache", async () => {
    let fetchCount = 0;
    const runtime = await createBackgroundContext({
        fetchImpl: async (_url, init) => {
            fetchCount += 1;
            const {query, variables} = JSON.parse(init.body);
            assert.match(query, /wouldTakeAgainPercent/);
            const edges = variables.schoolID === "U2Nob29sLTgyNQ=="
                ? [{
                    node: {
                        id: "teacher-1",
                        firstName: "John",
                        lastName: "McGann",
                        department: "Psychology",
                        legacyId: 123,
                        avgRating: 4.6,
                        numRatings: 51,
                        avgDifficulty: 3.5,
                        wouldTakeAgainPercent: 92.85
                    }
                }]
                : [];
            return jsonResponse({data: {newSearch: {teachers: {edges}}}});
        }
    });

    const lookup = runtime.evaluate("fetchMostLikelyProfessor");
    const firstResult = await lookup("John McGann", "Introduction to Psychology");
    const secondResult = await lookup("  JOHN   MCGANN ", "Introduction to Psychology");

    assert.equal(fetchCount, 5);
    assert.equal(firstResult.id, "teacher-1");
    assert.equal(secondResult.id, "teacher-1");
});


test("department matching never mutates cached professor records", async () => {
    const runtime = await createBackgroundContext();
    const professors = [
        {id: "one", department: "Management", numRatings: 10},
        {id: "two", department: "Physics", numRatings: 5}
    ];

    const selected = runtime.evaluate("selectMostLikelyProfessor")(professors, "Business Management");

    assert.equal(selected.id, "one");
    assert.equal(professors[0].department, "Management");
    assert.equal(professors[1].department, "Physics");
});


test("name matching handles accents, middle names, and reversed CSP names", async () => {
    const runtime = await createBackgroundContext();
    const matches = runtime.evaluate("professorNameMatches");
    const professor = {firstName: "José", lastName: "García"};

    assert.equal(matches("Jose Miguel Garcia", professor), true);
    assert.equal(matches("Garcia Jose", professor), true);
    assert.equal(matches("Smith John", professor), false);
});


test("the API queue enforces the configured global concurrency limit", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const runtime = await createBackgroundContext({
        fetchImpl: async () => {
            activeRequests += 1;
            maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
            await new Promise(resolve => setTimeout(resolve, 10));
            activeRequests -= 1;
            return jsonResponse({data: {ok: true}});
        }
    });
    runtime.context.MAX_CONCURRENT_API_REQUESTS = 2;

    const apiFetch = runtime.evaluate("apiFetch");
    await Promise.all(Array.from({length: 6}, (_, index) =>
        apiFetch("query Test { ok }", {index})
    ));

    assert.equal(maximumActiveRequests, 2);
});


test("resetCache waits for storage and writes fresh cache metadata", async () => {
    const runtime = await createBackgroundContext({
        storedItems: {
            cacheTimestamp: Date.now(),
            cacheSchemaVersion: 2,
            "professor:old": {id: "old"}
        }
    });

    await runtime.evaluate("resetCache")();

    assert.equal(runtime.storageItems.cacheSchemaVersion, 2);
    assert.equal(typeof runtime.storageItems.cacheTimestamp, "number");
    assert.equal("professor:old" in runtime.storageItems, false);
});
