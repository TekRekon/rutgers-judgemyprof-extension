import assert from "node:assert/strict";
import test from "node:test";

import {createBackgroundRuntime, currentCacheMetadata} from "./helpers/background-runtime.js";


test("normalizeName handles invalid values, Unicode, punctuation, and whitespace", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const normalizeName = runtime.evaluate("normalizeName");

    assert.equal(normalizeName(null), "");
    assert.equal(normalizeName(42), "");
    assert.equal(normalizeName("   "), "");
    assert.equal(normalizeName("  JOSÉ\tO’Neil-Smith  "), "jose o neil smith");
    assert.equal(normalizeName("李 小龍"), "李 小龍");
    assert.equal(normalizeName("A1+B_2"), "a b");
});


test("professorNameMatches supports single names, middle names, initials, and reversed CSP names", async t => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const matches = runtime.evaluate("professorNameMatches");
    const professor = {firstName: "José Miguel", lastName: "García-Smith"};

    const cases = [
        ["Jose Miguel Garcia Smith", true],
        ["Garcia Smith Jose", true],
        ["José", true],
        ["Smith", true],
        ["J Garcia", true],
        ["Garcia J", true],
        ["John Garcia", false],
        ["Jose Jones", false],
        ["", false]
    ];
    for (const [name, expected] of cases) {
        await t.test(JSON.stringify(name), () => assert.equal(matches(name, professor), expected));
    }
    assert.equal(matches("Jose Garcia", {firstName: "", lastName: ""}), false);
});


test("normalizeProfessorStats rejects invalid IDs and normalizes numeric fields without mutating input", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const normalize = runtime.evaluate("normalizeProfessorStats");
    assert.equal(normalize(null), null);
    assert.equal(normalize({id: 123}), null);

    const professor = {
        id: "teacher",
        firstName: " Ada ",
        lastName: null,
        department: 99,
        avgRating: "9",
        numRatings: "-4",
        avgDifficulty: "3.25",
        wouldTakeAgainPercent: "not-a-number"
    };
    const normalized = normalize(professor);

    assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
        id: "teacher",
        firstName: "Ada",
        lastName: "",
        department: "",
        avgRating: 5,
        numRatings: 0,
        avgDifficulty: 3.25,
        wouldTakeAgainPercent: -1
    });
    assert.equal(professor.firstName, " Ada ");

    const missing = normalize({id: "missing", avgRating: "", numRatings: null, avgDifficulty: Infinity});
    assert.equal(missing.avgRating, null);
    assert.equal(missing.numRatings, 0);
    assert.equal(missing.avgDifficulty, null);
});


test("preprocessSearchText expands abbreviations, removes stop words, and deduplicates terms", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const preprocess = runtime.evaluate("preprocessSearchText");

    assert.equal(preprocess(null), "");
    assert.equal(preprocess(" "), "");
    assert.equal(
        preprocess("The CS & CS of Cálc 101 — and BIO"),
        "computer science calculus biology"
    );
    assert.equal(preprocess("sociology social"), "sociology social");
});


test("department aliases work in both directions and preserve unknown values", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const alias = runtime.evaluate("fetchAlias");

    assert.equal(alias("Physics"), "Science Physics");
    assert.equal(alias("Science Physics", true), "Physics");
    assert.equal(alias("Astronomy"), "Astronomy");
    assert.equal(alias("Astronomy", true), "Astronomy");
    assert.equal(alias(undefined), "");
});


test("selectMostLikelyProfessor handles empty, singleton, department, and rating-count ties without mutation", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const select = runtime.evaluate("selectMostLikelyProfessor");
    const professors = [
        {id: "management", department: "Management", numRatings: 10},
        {id: "physics", department: "Physics", numRatings: 90},
        {id: "business", department: "Business", numRatings: 50}
    ];
    const snapshot = structuredClone(professors);

    assert.equal(select([], "anything"), null);
    assert.equal(select([professors[0]], "physics"), professors[0]);
    assert.equal(select(professors, "introductory physics laboratory").id, "physics");
    assert.equal(select(professors, "business management").id, "business");
    assert.equal(select(professors, "").id, "physics");
    assert.deepEqual(professors, snapshot);

    const tied = [
        {id: "first", department: "Unknown", numRatings: 4},
        {id: "second", department: "Unknown", numRatings: 4}
    ];
    assert.equal(select(tied, "unrelated").id, "first");
});


test("cache keys normalize equivalent inputs and cannot collide at separator boundaries", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const makeKey = runtime.evaluate("makeProfessorCacheKey");

    assert.equal(
        makeKey("  JOSÉ   GARCÍA ", "The CS and CS"),
        makeKey("jose garcia", "computer science")
    );
    assert.notEqual(makeKey("a_b", "c"), makeKey("a", "b_c"));
});


test("error serialization handles Error objects, strings, null, and absent stacks", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const serialize = runtime.evaluate("serializeError");
    const getMessage = runtime.evaluate("getErrorMessage");

    assert.equal(getMessage("failure"), "failure");
    assert.equal(getMessage(null), "null");
    const serialized = serialize({message: "broken"});
    assert.equal(serialized.message, "broken");
    assert.equal(serialized.stack, "broken");
});
