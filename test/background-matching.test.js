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
        ["Garcia Smith", true],
        ["José", true],
        ["Smith", true],
        ["J Garcia", true],
        ["Garcia J", true],
        ["John Garcia", false],
        ["Garcia Smyth", false],
        ["Jose Jones", false],
        ["", false]
    ];
    for (const [name, expected] of cases) {
        await t.test(JSON.stringify(name), () => assert.equal(matches(name, professor), expected));
    }
    assert.equal(matches("Jose Garcia", {firstName: "", lastName: ""}), false);
});


test("compound surname approximation permits only one insertion or deletion with an exact anchor", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const score = runtime.evaluate("compoundSurnameMatchScore");
    const oneEdit = runtime.evaluate("isSingleInsertionOrDeletionApart");

    assert.equal(score(["mejia", "ramos"], ["mejia", "ramos"]), 1);
    assert.equal(score(["barreto", "aranda"], ["barretto", "aranda"]), 0.95);
    assert.equal(score(["barreto", "aranda"], ["barretto", "arando"]), 0);
    assert.equal(score(["garcia", "smith"], ["garcia", "smyth"]), 0);
    assert.equal(score(["longname", "surname"], ["longnam", "surnam"]), 0);
    assert.equal(score(["solo"], ["solo"]), 0);
    assert.equal(oneEdit("barreto", "barretto"), true);
    assert.equal(oneEdit("smith", "smyth"), false);
    assert.equal(oneEdit("same", "same"), false);
    assert.equal(oneEdit("ab", "abcd"), false);
});


test("professor search fallbacks and query normalization reject invalid input defensively", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});

    assert.deepEqual(Array.from(runtime.evaluate("getFallbackProfessorSearchNames")(null)), []);
    assert.equal(runtime.evaluate("normalizeProfessorSearchQuery")(null), "");
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


test("obvious discipline conflicts veto weak-name candidates without entering adjacent or exact-name cases", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const select = runtime.evaluate("selectMostLikelyProfessor");
    const conflicts = runtime.evaluate("hasObviousDepartmentConflict");
    const classify = runtime.evaluate("classifyDiscipline");
    const musicLee = {
        id: "music-lee",
        firstName: "Morgan",
        lastName: "Lee",
        department: "Music",
        numRatings: 1_000
    };
    const mathLee = {
        id: "math-lee",
        firstName: "Maria",
        lastName: "Lee",
        department: "Mathematics",
        numRatings: 1
    };

    assert.equal(select([musicLee], "Calculus Mathematics", "Lee", "Mathematics"), null);
    assert.equal(select([musicLee, mathLee], "Calculus Mathematics", "Lee", "Mathematics").id, "math-lee");
    assert.equal(
        select([musicLee], "Calculus Mathematics", "Morgan Lee", "Mathematics").id,
        "music-lee",
        "a complete exact identity remains eligible because cross-department teaching is possible"
    );
    assert.equal(select([musicLee], "Calculus Mathematics", "Lee", "").id, "music-lee");
    assert.equal(conflicts("Computer Science", "Mathematics", "Lee", mathLee), false);
    assert.equal(conflicts("Unknown Studies", "Music", "Lee", musicLee), false);
    assert.equal(conflicts("Mathematics", "", "Lee", musicLee), false);
    assert.equal(conflicts("Theater", "Nursing", "Lee", musicLee), true);
    assert.equal(classify("MATHEMATICS (640)"), "mathematics");
    assert.equal(classify("Musicology and Music"), "music");
    assert.equal(classify("Biomedical Engineering"), "engineering");
    assert.equal(classify("unclassified interdisciplinary studies"), "");
    assert.equal(classify(null), "");
});


test("cache keys normalize equivalent inputs and cannot collide at separator boundaries", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const makeKey = runtime.evaluate("makeProfessorCacheKey");

    assert.equal(
        makeKey("  JOSÉ   GARCÍA ", "The CS and CS"),
        makeKey("jose garcia", "computer science")
    );
    assert.notEqual(makeKey("a_b", "c"), makeKey("a", "b_c"));
    assert.equal(
        makeKey("Ada Lovelace", "Calculus", " Mathematics "),
        makeKey("ada lovelace", "calculus", "mathematics")
    );
    assert.notEqual(
        makeKey("Ada Lovelace", "Calculus", "Mathematics"),
        makeKey("Ada Lovelace", "Calculus", "Music")
    );
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
