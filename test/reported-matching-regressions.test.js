import assert from "node:assert/strict";
import test from "node:test";

import {
    createBackgroundRuntime,
    currentCacheMetadata,
    jsonResponse
} from "./helpers/background-runtime.js";


function professorNode({
    id,
    legacyId,
    firstName,
    lastName,
    department,
    numRatings = 1
}) {
    return {
        id,
        legacyId,
        firstName,
        lastName,
        department,
        numRatings,
        avgRating: 4,
        avgDifficulty: 3,
        wouldTakeAgainPercent: 80
    };
}


function searchResponse(nodes) {
    return jsonResponse({
        data: {
            newSearch: {
                teachers: {
                    edges: nodes.map(node => ({node}))
                }
            }
        }
    });
}


const weijieSong = professorNode({
    id: "weijie-song",
    legacyId: 1_270_555,
    firstName: "Weijie",
    lastName: "Song",
    department: "Chinese",
    numRatings: 8
});
const weiSong = professorNode({
    id: "wei-song",
    legacyId: 1_597_360,
    firstName: "Wei",
    lastName: "Song",
    department: "Engineering",
    numRatings: 1_000
});
const sandyBurns = professorNode({
    id: "sandy-burns",
    legacyId: 1_383_581,
    firstName: "Sandy",
    lastName: "Burns",
    department: "Mathematics",
    numRatings: 26
});
const mariaCaudrado = professorNode({
    id: "maria-caudrado",
    legacyId: 3_048_136,
    firstName: "Maria",
    lastName: "Caudrado",
    department: "Mathematics",
    numRatings: 8
});
const pabloMejiaRamos = professorNode({
    id: "pablo-mejia-ramos",
    legacyId: 1_310_221,
    firstName: "Pablo",
    lastName: "Mejia Ramos",
    department: "Mathematics",
    numRatings: 17
});
const victorBarrettoAranda = professorNode({
    id: "victor-barretto-aranda",
    legacyId: 2_008_587,
    firstName: "Victor",
    lastName: "Barretto-Aranda",
    department: "Mathematics",
    numRatings: 17
});


test("reported regression: exact WEIJIE SONG outranks the Wei Song prefix match", async () => {
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => searchResponse([weijieSong, weiSong])
    });

    const selected = await runtime.evaluate("fetchMostLikelyProfessor")(
        "WEIJIE SONG",
        "MODERN CHINESE LITERATURE IN TRANSLATION Chinese"
    );

    assert.equal(selected.legacyId, 1_270_555);
    assert.equal(selected.department, "Chinese");
    assert.ok(
        runtime.evaluate("professorNameMatchScore")("WEIJIE SONG", weijieSong)
        > runtime.evaluate("professorNameMatchScore")("WEIJIE SONG", weiSong)
    );
});


test("department scoring finds an exact subject token inside a long course description", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const score = runtime.evaluate("departmentMatchScore");
    const longChineseCourse = "MODERN CHINESE LITERATURE IN TRANSLATION Chinese";

    assert.equal(score("Chinese", longChineseCourse), 1);
    assert.equal(score("Engineering", longChineseCourse), 0);
    assert.equal(score("Mathematics", "Calculus I"), 0.9);
    assert.equal(score("", longChineseCourse), 0);
});


test("reported regression: verified Sandra/Sandy equivalence finds Sandy Burns without broad fuzzy matching", async () => {
    const tinaBurns = professorNode({
        id: "tina-burns",
        legacyId: 3_066_620,
        firstName: "Tina",
        lastName: "Burns",
        department: "Computer Science",
        numRatings: 100
    });
    const sandraRussell = professorNode({
        id: "sandra-russell",
        legacyId: 1_660_160,
        firstName: "Sandra",
        lastName: "Russell-Jones",
        department: "History",
        numRatings: 100
    });
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => searchResponse([tinaBurns, sandraRussell, sandyBurns])
    });

    const selected = await runtime.evaluate("fetchMostLikelyProfessor")(
        "SANDRA BURNS",
        "ELEMENTARY ALGEBRA Mathematics"
    );

    assert.equal(selected.legacyId, 1_383_581);
    const matches = runtime.evaluate("professorNameMatches");
    assert.equal(matches("Sandra Burns", sandyBurns), true);
    assert.equal(matches("Sandra Burns", tinaBurns), false);
    assert.equal(matches("Sandra Burns", sandraRussell), false);
    assert.equal(matches("Sandra Jones", {firstName: "Sandy", lastName: "Jones"}), true);
    assert.equal(matches("Alice Baker", {firstName: "Alicia", lastName: "Baker"}), false);
});


test("reported regression: RMP's Cuadrado typo uses one bounded fallback round", async () => {
    let fetchCount = 0;
    const searchTexts = [];
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (_url, init) => {
            fetchCount += 1;
            const {variables} = JSON.parse(init.body);
            searchTexts.push(variables.text);
            return variables.text === "caudrado"
                ? searchResponse([mariaCaudrado])
                : searchResponse([]);
        }
    });

    const selected = await runtime.evaluate("fetchMostLikelyProfessor")(
        "CUADRADO",
        "ELEMENTARY ALGEBRA Mathematics"
    );

    assert.equal(selected.legacyId, 3_048_136);
    assert.equal(fetchCount, 10);
    assert.deepEqual(new Set(searchTexts), new Set(["CUADRADO", "caudrado"]));
    assert.equal(runtime.evaluate("professorNameMatches")("Cuadrado", mariaCaudrado), true);
});


test("correctly spelled primary results suppress typo fallback and unrelated near-names stay rejected", async () => {
    let fetchCount = 0;
    const correctlySpelled = professorNode({
        id: "correct-cuadrado",
        legacyId: 999,
        firstName: "Maria",
        lastName: "Cuadrado",
        department: "Mathematics"
    });
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async () => {
            fetchCount += 1;
            return searchResponse([correctlySpelled]);
        }
    });

    const selected = await runtime.evaluate("fetchMostLikelyProfessor")("Cuadrado", "Mathematics");
    assert.equal(selected.legacyId, 999);
    assert.equal(fetchCount, 5);
    assert.equal(
        runtime.evaluate("professorNameMatches")(
            "Cuadrado",
            {firstName: "Maria", lastName: "Quadrado"}
        ),
        false
    );
    assert.equal(runtime.evaluate("nameTokenMatchScore")("ann", "joann"), 0);
    assert.equal(runtime.evaluate("nameTokenMatchScore")("", "joann"), 0);
});


test("ranking order is name confidence, then department evidence, then review count", async () => {
    const runtime = await createBackgroundRuntime({storedItems: currentCacheMetadata()});
    const select = runtime.evaluate("selectMostLikelyProfessor");

    assert.equal(
        select([weiSong, weijieSong], "Engineering", "Weijie Song").legacyId,
        1_270_555,
        "an exact name must beat a prefix even when the prefix department and review count are stronger"
    );

    const chineseLowReviews = {...weijieSong, id: "chinese-low", numRatings: 1};
    const engineeringHighReviews = {...weijieSong, id: "engineering-high", department: "Engineering", numRatings: 100};
    assert.equal(
        select([engineeringHighReviews, chineseLowReviews], "Chinese", "Weijie Song").id,
        "chinese-low"
    );

    const tiedLow = {...weijieSong, id: "tied-low", numRatings: 1};
    const tiedHigh = {...weijieSong, id: "tied-high", numRatings: 10};
    assert.equal(select([tiedLow, tiedHigh], "Chinese", "Weijie Song").id, "tied-high");
});


test("reported regression: hyphenated MEJIA-RAMOS retries with spaces and matches a compound surname", async () => {
    let fetchCount = 0;
    const searchTexts = [];
    const robertRamos = professorNode({
        id: "robert-ramos",
        legacyId: 1_872_350,
        firstName: "Robert",
        lastName: "Ramos",
        department: "Ethnic Studies",
        numRatings: 100
    });
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (_url, init) => {
            fetchCount += 1;
            const {variables} = JSON.parse(init.body);
            searchTexts.push(variables.text);
            return variables.text === "mejia ramos"
                ? searchResponse([robertRamos, pabloMejiaRamos])
                : searchResponse([]);
        }
    });

    const selected = await runtime.evaluate("fetchMostLikelyProfessor")(
        "MEJIA-RAMOS",
        "INTRO MATH REASONING Mathematics"
    );

    assert.equal(selected.legacyId, 1_310_221);
    assert.equal(fetchCount, 10);
    assert.deepEqual(new Set(searchTexts), new Set(["MEJIA-RAMOS", "mejia ramos"]));
    assert.equal(runtime.evaluate("professorNameMatches")("MEJIA-RAMOS", pabloMejiaRamos), true);
    assert.equal(runtime.evaluate("professorNameMatches")("MEJIA-RAMOS", robertRamos), false);
});


test("reported regression: compound-surname blocking finds BARRETO-ARANDA despite RMP's extra letter", async () => {
    let fetchCount = 0;
    const searchTexts = [];
    const noraBarrett = professorNode({
        id: "nora-barrett",
        legacyId: 2_866_770,
        firstName: "Nora",
        lastName: "Barrett",
        department: "Psychology",
        numRatings: 1_000
    });
    const runtime = await createBackgroundRuntime({
        storedItems: currentCacheMetadata(),
        fetchImpl: async (_url, init) => {
            fetchCount += 1;
            const {variables} = JSON.parse(init.body);
            searchTexts.push(variables.text);
            return variables.text === "barret"
                ? searchResponse([noraBarrett, victorBarrettoAranda, sandyBurns])
                : searchResponse([]);
        }
    });

    const selected = await runtime.evaluate("fetchMostLikelyProfessor")(
        "BARRETO-ARANDA",
        "CALCULUS I FOR THE LIFE AND SOCIAL SCIENCES Mathematics"
    );

    assert.equal(selected.legacyId, 2_008_587);
    assert.equal(fetchCount, 15);
    assert.deepEqual(
        new Set(searchTexts),
        new Set(["BARRETO-ARANDA", "barreto aranda", "barret"])
    );
    assert.deepEqual(
        Array.from(runtime.evaluate("getFallbackProfessorSearchNames")("BARRETO-ARANDA")),
        ["barreto aranda", "barret"]
    );
    assert.equal(runtime.context.professorSearchCorrections.barreto, undefined);
    assert.equal(runtime.context.nameTokenAliases.barreto, undefined);
    assert.equal(runtime.evaluate("professorNameMatches")("BARRETO-ARANDA", victorBarrettoAranda), true);
    assert.equal(runtime.evaluate("professorNameMatches")("BARRETO-ARANDA", sandyBurns), false);
    assert.equal(runtime.evaluate("professorNameMatches")("BARRETO-ARANDA", noraBarrett), false);
});
