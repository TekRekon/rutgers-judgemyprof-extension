import assert from "node:assert/strict";
import test from "node:test";

import {createBackgroundRuntime, currentCacheMetadata} from "./helpers/background-runtime.js";


test("network and cache constants are bounded and internally consistent", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});

    assert.equal(runtime.context.API_URL, "https://www.ratemyprofessors.com/graphql");
    assert.equal(runtime.context.CACHE_SCHEMA_VERSION, 3);
    assert.equal(runtime.context.CACHE_MAX_AGE_MS, 3 * 7 * 24 * 60 * 60 * 1_000);
    assert.ok(runtime.context.MAX_CONCURRENT_API_REQUESTS >= 1);
    assert.ok(runtime.context.MAX_CONCURRENT_API_REQUESTS <= 10);
    assert.ok(runtime.context.MAX_FETCH_RETRIES >= 0);
    assert.ok(runtime.context.FETCH_TIMEOUT_MS > 0);
    assert.ok(runtime.context.FETCH_RETRY_BASE_DELAY_MS > 0);
    assert.ok(runtime.context.FETCH_RETRY_MAX_DELAY_MS >= runtime.context.FETCH_RETRY_BASE_DELAY_MS);
    assert.deepEqual(Array.from(runtime.context.RETRYABLE_STATUS_CODES), [408, 425, 429, 500, 502, 503, 504]);
});


test("the combined professor query requests every field used by the UI", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const query = runtime.context.ProfessorSearchQuery;

    for (const variable of ["$text: String!", "$schoolID: ID!", "$first: Int!"]) {
        assert.match(query, new RegExp(variable.replace(/[!$]/g, "\\$&")));
    }
    for (const field of [
        "id", "department", "legacyId", "firstName", "lastName", "avgRating",
        "numRatings", "avgDifficulty", "wouldTakeAgainPercent"
    ]) {
        assert.match(query, new RegExp(`\\b${field}\\b`));
    }
    assert.doesNotMatch(query, /authorization|authToken|teacher\s*\(id/i);
});


test("school configuration is ordered, unique, non-empty, and includes every Rutgers campus", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const schools = runtime.context.SCHOOLS;
    const schoolIDs = schools.map(([id]) => id);

    assert.ok(schools.length >= 5);
    assert.equal(new Set(schoolIDs).size, schools.length);
    for (const [id, name, campuses] of schools) {
        assert.match(id, /^U2Nob29sL/);
        assert.match(name, /Rutgers/i);
        const values = Array.isArray(campuses) ? campuses : [campuses];
        assert.ok(values.length >= 1);
        assert.ok(values.every(campus => ["NB", "NK", "CM"].includes(campus)));
    }
    assert.deepEqual({...runtime.context.CAMPUS_CODES}, {
        NEWARK: "NK",
        CAMDEN: "CM",
        NEW_BRUNSWICK: "NB",
        ONLINE_NEWARK: "ONLINE_NK",
        ONLINE_CAMDEN: "ONLINE_CM",
        ONLINE_NEW_BRUNSWICK: "ONLINE_NB"
    });
});


test("department and verified-name alias configuration cannot be mutated at runtime", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});

    assert.equal(Object.isFrozen(runtime.context.departmentAliases), true);
    assert.equal(Object.isFrozen(runtime.context.nameTokenAliases), true);
    assert.equal(Object.isFrozen(runtime.context.professorSearchCorrections), true);
    assert.equal(runtime.context.nameTokenAliases.sandy, "sandra");
    assert.equal(runtime.context.professorSearchCorrections.cuadrado, "caudrado");
});
