import assert from "node:assert/strict";
import test from "node:test";

import {
    createBackgroundRuntime,
    currentCacheMetadata,
    jsonResponse
} from "./helpers/background-runtime.js";


function professorNode(overrides = {}) {
    return {
        id: "teacher-1",
        firstName: "Ada",
        lastName: "Lovelace",
        department: "Computer Science",
        legacyId: 123,
        avgRating: 4.8,
        numRatings: 42,
        avgDifficulty: 3.2,
        wouldTakeAgainPercent: 95,
        ...overrides
    };
}


function searchResponse(edges) {
    return jsonResponse({data: {newSearch: {teachers: {edges}}}});
}


test("initializeCache loads current professor entries and ignores unrelated storage", async () => {
    let fetchCount = 0;
    const cached = professorNode();
    const cacheKey = '["ada lovelace","computer science"]';
    const runtime = await createBackgroundRuntime({
        storedItems: {
            ...currentCacheMetadata(),
            [`professor:${cacheKey}`]: cached,
            unrelated: {keep: true}
        },
        fetchImpl: async () => {
            fetchCount += 1;
            return searchResponse([]);
        }
    });

    const result = await runtime.evaluate("fetchMostLikelyProfessor")(
        " ADA   LOVELACE ",
        "the CS"
    );

    assert.equal(result.id, cached.id);
    assert.equal(fetchCount, 0);
    assert.equal(runtime.storageCalls.clear, 0);
});


test("initializeCache replaces missing, mismatched, non-numeric, and stale metadata", async t => {
    const maxAge = 3 * 7 * 24 * 60 * 60 * 1_000;
    const cases = {
        missing: {},
        "schema mismatch": currentCacheMetadata({cacheSchemaVersion: 1}),
        stale: currentCacheMetadata({cacheTimestamp: Date.now() - maxAge - 1}),
        "non-numeric timestamp": currentCacheMetadata({cacheTimestamp: "today"})
    };

    for (const [name, storedItems] of Object.entries(cases)) {
        await t.test(name, async () => {
            const runtime = await createBackgroundRuntime({
                storedItems: {...storedItems, "professor:old": professorNode()}
            });
            assert.equal(runtime.storageCalls.clear, 1);
            assert.equal(runtime.storageItems.cacheSchemaVersion, 2);
            assert.equal(typeof runtime.storageItems.cacheTimestamp, "number");
            assert.equal("professor:old" in runtime.storageItems, false);
        });
    }
});


test("cache initialization storage failures are non-fatal and logged once", async () => {
    const failure = new Error("storage unavailable");
    const runtime = await createBackgroundRuntime({
        storageOverrides: {
            async get() {
                throw failure;
            }
        }
    });

    assert.equal(runtime.warnings.length, 1);
    assert.equal(runtime.warnings[0][0], "Could not initialize professor cache:");
    assert.equal(runtime.warnings[0][1], failure);
    assert.equal(await runtime.evaluate("fetchMostLikelyProfessor")("", "anything"), null);
});


test("fetchProfessorCandidates normalizes nodes, filters invalid records, and tolerates malformed edges", async () => {
    let responseBody = {
        data: {newSearch: {teachers: {edges: [
            {node: professorNode({avgRating: "4.25", numRatings: "8"})},
            {node: {id: 123, firstName: "Invalid"}},
            null
        ]}}}
    };
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => jsonResponse(responseBody)
    });

    const fetchCandidates = runtime.evaluate("fetchProfessorCandidates");
    const candidates = await fetchCandidates("Ada Lovelace", "school", 20);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].avgRating, 4.25);
    assert.equal(candidates[0].numRatings, 8);

    responseBody = {data: {newSearch: {teachers: {edges: {not: "an array"}}}}};
    const malformed = await fetchCandidates("Different Name", "school", 20);
    assert.deepEqual(Array.from(malformed), []);
});


test("identical concurrent candidate searches share one request and later reuse memory cache", async () => {
    let resolveFetch;
    let fetchCount = 0;
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => {
            fetchCount += 1;
            return new Promise(resolve => {
                resolveFetch = () => resolve(searchResponse([{node: professorNode()}]));
            });
        }
    });
    const fetchCandidates = runtime.evaluate("fetchProfessorCandidates");

    const first = fetchCandidates("Ada Lovelace", "school", 20);
    const second = fetchCandidates(" ADA  LOVELACE ", "school", 20);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetchCount, 1);
    resolveFetch();
    assert.equal((await first)[0].id, "teacher-1");
    assert.equal((await second)[0].id, "teacher-1");
    assert.equal((await fetchCandidates("ada lovelace", "school", 20))[0].id, "teacher-1");
    assert.equal(fetchCount, 1);
});


test("identical concurrent professor lookups share five school searches and persist one result", async () => {
    let fetchCount = 0;
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (_url, init) => {
            fetchCount += 1;
            const {variables} = JSON.parse(init.body);
            await new Promise(resolve => setTimeout(resolve, 3));
            return searchResponse(variables.schoolID === "U2Nob29sLTgyNQ=="
                ? [{node: professorNode()}]
                : []);
        }
    });
    const lookup = runtime.evaluate("fetchMostLikelyProfessor");

    const [first, second] = await Promise.all([
        lookup("Ada Lovelace", "Computer Science"),
        lookup(" ADA LOVELACE ", "the CS")
    ]);
    const third = await lookup("ada lovelace", "computer science");

    assert.equal(fetchCount, 5);
    assert.equal(first.id, "teacher-1");
    assert.equal(second.id, "teacher-1");
    assert.equal(third.id, "teacher-1");
    const professorWrites = runtime.storageCalls.set.filter(items =>
        Object.keys(items).some(key => key.startsWith("professor:"))
    );
    assert.equal(professorWrites.length, 1);
});


test("duplicate professor IDs across schools are deduplicated before selection", async () => {
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (_url, init) => {
            const {variables} = JSON.parse(init.body);
            const ratings = variables.schoolID === "U2Nob29sLTE2ODYy" ? 100 : 1;
            return searchResponse([{node: professorNode({numRatings: ratings})}]);
        }
    });

    const result = await runtime.evaluate("fetchMostLikelyProfessor")("Ada Lovelace", "CS");
    assert.equal(result.id, "teacher-1");
    assert.equal(result.numRatings, 100);
});


test("partial school failure returns available data but avoids caching an incomplete decision", async () => {
    let fetchCount = 0;
    const failedSchool = "U2Nob29sLTgyNg==";
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (_url, init) => {
            fetchCount += 1;
            const {variables} = JSON.parse(init.body);
            if (variables.schoolID === failedSchool) {
                throw new Error("school offline");
            }
            return searchResponse([{node: professorNode()}]);
        }
    });
    runtime.context.FETCH_RETRY_BASE_DELAY_MS = 0;
    const lookup = runtime.evaluate("fetchMostLikelyProfessor");

    assert.equal((await lookup("Ada Lovelace", "CS")).id, "teacher-1");
    assert.equal((await lookup("Ada Lovelace", "CS")).id, "teacher-1");

    assert.equal(fetchCount, 10);
    assert.equal(
        runtime.storageCalls.set.some(items => Object.keys(items).some(key => key.startsWith("professor:"))),
        false
    );
});


test("all school failures reject with the underlying failure", async () => {
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => {
            throw new Error("network gone");
        }
    });
    runtime.context.MAX_FETCH_RETRIES = 0;

    await assert.rejects(
        runtime.evaluate("fetchMostLikelyProfessor")("Ada Lovelace", "CS"),
        /network gone/
    );
});


test("empty results and results without departments are not persisted", async t => {
    await t.test("empty", async () => {
        const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
        assert.equal(await runtime.evaluate("fetchMostLikelyProfessor")("Nobody", "CS"), null);
        assert.equal(runtime.storageCalls.set.length, 0);
    });

    await t.test("missing department", async () => {
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async () => searchResponse([{node: professorNode({department: ""})}])
        });
        assert.equal(
            (await runtime.evaluate("fetchMostLikelyProfessor")("Ada Lovelace", "CS")).id,
            "teacher-1"
        );
        assert.equal(runtime.storageCalls.set.length, 0);
    });
});


test("cache persistence failure is best-effort and does not fail a successful lookup", async () => {
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        storageOverrides: {
            async set() {
                throw new Error("quota exceeded");
            }
        },
        fetchImpl: async () => searchResponse([{node: professorNode()}])
    });

    const result = await runtime.evaluate("fetchMostLikelyProfessor")("Ada Lovelace", "CS");
    assert.equal(result.id, "teacher-1");
    assert.equal(runtime.warnings.at(-1)[0], "Could not persist professor cache entry:");
});


test("resetCache clears memory and storage, writes fresh metadata, and invalidates late requests", async () => {
    const pendingResolvers = [];
    const runtime = await createBackgroundRuntime({
        storedItems: {
            ...currentCacheMetadata(),
            "professor:old": professorNode({id: "old"})
        },
        fetchImpl: async () => new Promise(resolve => pendingResolvers.push(resolve))
    });
    const lookupPromise = runtime.evaluate("fetchMostLikelyProfessor")("Ada Lovelace", "CS");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingResolvers.length, 5);

    await runtime.evaluate("resetCache")();
    for (const resolve of pendingResolvers) {
        resolve(searchResponse([{node: professorNode()}]));
    }
    assert.equal((await lookupPromise).id, "teacher-1");

    assert.equal(runtime.storageCalls.clear, 1);
    assert.equal(runtime.storageItems.cacheSchemaVersion, 2);
    assert.equal(typeof runtime.storageItems.cacheTimestamp, "number");
    assert.equal(Object.keys(runtime.storageItems).some(key => key.startsWith("professor:")), false);
    assert.equal(runtime.evaluate("filteredProfStats.size"), 0);
    assert.equal(runtime.evaluate("professorSearchCache.size"), 0);
});


test("background message routing validates actions and serializes successes and failures", async t => {
    await t.test("unknown and invalid messages close synchronously", async () => {
        const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
        assert.equal(await runtime.dispatchMessage(null), undefined);
        assert.equal(await runtime.dispatchMessage({}), undefined);
        assert.equal(await runtime.dispatchMessage({action: "unknown"}), undefined);
    });

    await t.test("fetch success trims request fields", async () => {
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async (_url, init) => {
                const {variables} = JSON.parse(init.body);
                assert.equal(variables.text, "Ada Lovelace");
                return searchResponse([{node: professorNode()}]);
            }
        });
        const response = await runtime.dispatchMessage({
            action: "fetchProfStats",
            profName: "  Ada Lovelace  ",
            matchText: "  CS  "
        });
        assert.equal(response.data.id, "teacher-1");
    });

    await t.test("fetch failure returns serializable details", async () => {
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            fetchImpl: async () => {
                throw new Error("offline");
            }
        });
        runtime.context.MAX_FETCH_RETRIES = 0;
        const response = await runtime.dispatchMessage({
            action: "fetchProfStats",
            profName: "Ada Lovelace",
            matchText: "CS"
        });
        assert.match(response.error.message, /offline/);
        assert.equal(typeof response.error.stack, "string");
    });

    await t.test("reset success", async () => {
        const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
        assert.deepEqual(
            JSON.parse(JSON.stringify(await runtime.dispatchMessage({action: "resetCache"}))),
            {status: 1}
        );
    });

    await t.test("reset failure", async () => {
        const runtime = await createBackgroundRuntime({
            storedItems: currentCacheMetadata(),
            storageOverrides: {
                async clear() {
                    throw new Error("locked");
                }
            }
        });
        assert.deepEqual(
            JSON.parse(JSON.stringify(await runtime.dispatchMessage({action: "resetCache"}))),
            {status: 0, errorMsg: "locked"}
        );
    });
});
