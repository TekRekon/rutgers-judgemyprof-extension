importScripts("./constants.js");


const CACHE_KEY_PREFIX = "professor:";
const CACHE_TIMESTAMP_KEY = "cacheTimestamp";
const CACHE_SCHEMA_KEY = "cacheSchemaVersion";
const SEARCH_SCHOOL_LIMIT = 5;
const SEARCH_RESULTS_PER_SCHOOL = 20;
const ERROR_RESPONSE_MAX_BYTES = 4_096;
const ERROR_REASON_MAX_LENGTH = 160;
const MIN_NAME_MATCH_SCORE = 0.85;
const MIN_COMPOUND_PREFIX_LENGTH = 6;
const MIN_APPROXIMATE_SURNAME_TOKEN_LENGTH = 5;

const STOP_WORDS = new Set([
    "the", "and", "or", "of", "in", "for", "to", "a", "an", "is", "at", "by", "on", "with"
]);

const ABBREVIATIONS = Object.freeze({
    cs: "computer science",
    cse: "computer science engineering",
    ee: "electrical engineering",
    me: "mechanical engineering",
    ce: "civil engineering",
    bio: "biology",
    chem: "chemistry",
    phys: "physics",
    math: "mathematics",
    stats: "statistics",
    econ: "economics",
    psych: "psychology",
    phil: "philosophy",
    hist: "history",
    lit: "literature",
    eng: "english",
    mgmt: "management",
    bus: "business",
    acct: "accounting",
    fin: "finance",
    mkt: "marketing",
    ops: "operations",
    sci: "science",
    tech: "technology",
    info: "information",
    sys: "systems",
    dev: "development",
    prog: "programming",
    lang: "language",
    comm: "communications",
    med: "medicine",
    health: "health",
    env: "environmental",
    soc: "sociology",
    anth: "anthropology",
    geo: "geography",
    poli: "political",
    govt: "government",
    admin: "administration",
    edu: "education",
    relig: "religion",
    art: "arts",
    mus: "music",
    thea: "theater",
    calc: "calculus"
});

// These deliberately broad families are used only for a small set of unambiguous conflicts.
// Unknown and adjacent disciplines remain eligible rather than being guessed at.
const DISCIPLINE_PHRASES = Object.freeze({
    mathematics: Object.freeze(["mathematics", "mathematical science", "math", "statistics", "calculus", "algebra"]),
    music: Object.freeze(["music", "musicology"]),
    performing_arts: Object.freeze(["performing arts", "dance", "theater", "theatre", "acting"]),
    computing: Object.freeze(["computer science", "computing", "informatics", "information technology", "data science"]),
    engineering: Object.freeze(["engineering"]),
    social_sciences: Object.freeze([
        "social science", "social sciences", "sociology", "social work",
        "anthropology", "political science", "psychology", "criminal justice"
    ]),
    life_sciences: Object.freeze(["life science", "biology", "biological science", "genetics", "microbiology", "biochemistry", "neuroscience"]),
    physical_sciences: Object.freeze(["physical science", "physics", "chemistry", "geology", "astronomy", "earth science"]),
    health_sciences: Object.freeze(["health science", "nursing", "medicine", "medical", "pharmacy", "dentistry", "dental", "public health"])
});

const OBVIOUS_DISCIPLINE_CONFLICTS = new Set([
    "computing|music",
    "computing|performing_arts",
    "engineering|music",
    "engineering|performing_arts",
    "health_sciences|music",
    "health_sciences|performing_arts",
    "life_sciences|music",
    "life_sciences|performing_arts",
    "mathematics|music",
    "mathematics|performing_arts",
    "music|physical_sciences",
    "music|social_sciences",
    "performing_arts|physical_sciences"
]);

const originalDepartmentByAlias = new Map(
    Object.entries(departmentAliases).map(([department, alias]) => [alias, department])
);

let filteredProfStats = new Map();
let professorSearchCache = new Map();
let fetchPromises = createFetchPromiseMaps();
let cacheGeneration = 0;
let activeApiRequests = 0;
const queuedApiRequests = [];
const cacheReady = initializeCache();


chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!request || typeof request.action !== "string") {
        return false;
    }

    if (request.action === "fetchProfStats") {
        handleFetchStatsRequest(request)
            .then(profStats => sendResponse({data: profStats}))
            .catch(error => sendResponse({error: serializeError(error)}));
        return true;
    }

    if (request.action === "resetCache") {
        resetCache()
            .then(() => sendResponse({status: 1}))
            .catch(error => sendResponse({status: 0, errorMsg: getErrorMessage(error)}));
        return true;
    }

    return false;
});


function createFetchPromiseMaps() {
    return {
        professorSearch: new Map(),
        mostLikelyProfessor: new Map()
    };
}


async function handleFetchStatsRequest(request) {
    await cacheReady;
    const profName = typeof request.profName === "string" ? request.profName.trim() : "";
    const matchText = typeof request.matchText === "string" ? request.matchText.trim() : "";
    const subjectName = typeof request.subjectName === "string" ? request.subjectName.trim() : "";
    return fetchMostLikelyProfessor(profName, matchText, subjectName);
}


async function resetCache() {
    await cacheReady;
    cacheGeneration += 1;
    filteredProfStats.clear();
    professorSearchCache.clear();
    fetchPromises = createFetchPromiseMaps();

    await chrome.storage.local.clear();
    await chrome.storage.local.set(createCacheMetadata());
}


/**
 * Finds the most likely RateMyProfessors record for a Rutgers instructor.
 * Five school searches run concurrently, while apiFetch enforces a global network concurrency cap.
 *
 * @param {string} profName - Instructor name from the Rutgers page.
 * @param {string} [matchText=""] - Course and subject text used to compare departments.
 * @param {string} [subjectName=""] - Canonical Rutgers subject used for conservative mismatch checks.
 * @returns {Promise<Object|null>} The selected professor record, or null when no record matches.
 */
async function fetchMostLikelyProfessor(profName, matchText = "", subjectName = "") {
    if (!profName) {
        return null;
    }

    const cacheKey = makeProfessorCacheKey(profName, matchText, subjectName);
    if (filteredProfStats.has(cacheKey)) {
        return filteredProfStats.get(cacheKey);
    }

    const existingPromise = fetchPromises.mostLikelyProfessor.get(cacheKey);
    if (existingPromise) {
        return existingPromise;
    }

    const generation = cacheGeneration;
    const promise = (async () => {
        const primarySearch = await searchProfessorSchools(profName);
        if (primarySearch.schoolResults.length === 0) {
            throw primarySearch.firstFailure ?? new Error("All professor searches failed");
        }

        const professorsByID = new Map();
        collectMatchingProfessors(professorsByID, primarySearch.schoolResults, profName);

        let allSchoolsSucceeded = primarySearch.allSucceeded;
        for (const fallbackSearchName of getFallbackProfessorSearchNames(profName)) {
            if (hasEligibleProfessor(professorsByID, subjectName, profName)) {
                break;
            }
            const fallbackSearch = await searchProfessorSchools(fallbackSearchName);
            allSchoolsSucceeded = allSchoolsSucceeded && fallbackSearch.allSucceeded;
            collectMatchingProfessors(professorsByID, fallbackSearch.schoolResults, profName);
        }

        const selectedProfessor = selectMostLikelyProfessor(
            Array.from(professorsByID.values()),
            matchText,
            profName,
            subjectName
        );

        if (selectedProfessor && allSchoolsSucceeded && generation === cacheGeneration) {
            filteredProfStats.set(cacheKey, selectedProfessor);
            if (selectedProfessor.department) {
                try {
                    await chrome.storage.local.set({
                        [`${CACHE_KEY_PREFIX}${cacheKey}`]: selectedProfessor
                    });
                } catch (error) {
                    console.warn("Could not persist professor cache entry:", error);
                }
            }
        }

        return selectedProfessor;
    })();

    fetchPromises.mostLikelyProfessor.set(cacheKey, promise);
    const removePendingPromise = () => {
        if (fetchPromises.mostLikelyProfessor.get(cacheKey) === promise) {
            fetchPromises.mostLikelyProfessor.delete(cacheKey);
        }
    };
    promise.then(removePendingPromise, removePendingPromise);
    return promise;
}


async function searchProfessorSchools(profName) {
    const settledResults = await Promise.allSettled(
        SCHOOLS.slice(0, SEARCH_SCHOOL_LIMIT).map(([schoolID]) =>
            fetchProfessorCandidates(profName, schoolID, SEARCH_RESULTS_PER_SCHOOL)
        )
    );
    return {
        schoolResults: settledResults
            .filter(result => result.status === "fulfilled")
            .map(result => result.value),
        allSucceeded: settledResults.every(result => result.status === "fulfilled"),
        firstFailure: settledResults.find(result => result.status === "rejected")?.reason
    };
}


function collectMatchingProfessors(professorsByID, schoolResults, profName) {
    for (const professors of schoolResults) {
        for (const professor of professors) {
            if (professorNameMatches(profName, professor)) {
                professorsByID.set(professor.id, professor);
            }
        }
    }
}


function hasEligibleProfessor(professorsByID, subjectName, searchName) {
    return Array.from(professorsByID.values()).some(professor =>
        !hasObviousDepartmentConflict(subjectName, professor.department, searchName, professor)
    );
}


function getFallbackProfessorSearchNames(profName) {
    if (typeof profName !== "string") {
        return [];
    }

    const tokens = tokenizeName(profName);
    const normalizedName = tokens.join(" ");
    const comparableInput = profName.toLowerCase().trim().replace(/\s+/g, " ");
    const fallbackNames = new Set();
    if (normalizedName && normalizedName !== comparableInput) {
        fallbackNames.add(normalizedName);
    }

    const correctedTokens = tokens.map(token => {
        return professorSearchCorrections[token] ?? token;
    });
    const correctedName = correctedTokens.join(" ");
    if (correctedName && correctedName !== normalizedName) {
        fallbackNames.add(correctedName);
    }

    // RMP sometimes indexes a hyphenated surname only by a prefix of its first component.
    // Use this solely for compound names and verify the complete surname before accepting a result.
    if (/[-‐‑‒–—―]/u.test(profName) && tokens[0]?.length >= MIN_COMPOUND_PREFIX_LENGTH) {
        fallbackNames.add(tokens[0].slice(0, -1));
    }

    return Array.from(fallbackNames);
}


/**
 * Searches one RMP school and returns complete professor records directly from the search query.
 * This avoids the previous extra request for every returned professor ID.
 */
async function fetchProfessorCandidates(profName, schoolID, first) {
    const cacheKey = JSON.stringify([normalizeProfessorSearchQuery(profName), schoolID, first]);
    if (professorSearchCache.has(cacheKey)) {
        return professorSearchCache.get(cacheKey);
    }

    const existingPromise = fetchPromises.professorSearch.get(cacheKey);
    if (existingPromise) {
        return existingPromise;
    }

    const generation = cacheGeneration;
    const promise = apiFetch(ProfessorSearchQuery, {text: profName, schoolID, first})
        .then(data => {
            const returnedEdges = data.data?.newSearch?.teachers?.edges;
            const edges = Array.isArray(returnedEdges) ? returnedEdges : [];
            const professors = edges
                .map(edge => normalizeProfessorStats(edge?.node))
                .filter(Boolean);

            if (generation === cacheGeneration) {
                professorSearchCache.set(cacheKey, professors);
            }
            return professors;
        });

    fetchPromises.professorSearch.set(cacheKey, promise);
    const removePendingPromise = () => {
        if (fetchPromises.professorSearch.get(cacheKey) === promise) {
            fetchPromises.professorSearch.delete(cacheKey);
        }
    };
    promise.then(removePendingPromise, removePendingPromise);
    return promise;
}


function normalizeProfessorStats(professor) {
    if (!professor || typeof professor.id !== "string") {
        return null;
    }

    const avgRating = toFiniteNumber(professor.avgRating);
    const numRatings = toFiniteNumber(professor.numRatings);
    const avgDifficulty = toFiniteNumber(professor.avgDifficulty);
    const wouldTakeAgainPercent = toFiniteNumber(professor.wouldTakeAgainPercent);

    return {
        ...professor,
        firstName: typeof professor.firstName === "string" ? professor.firstName.trim() : "",
        lastName: typeof professor.lastName === "string" ? professor.lastName.trim() : "",
        department: typeof professor.department === "string" ? professor.department.trim() : "",
        avgRating: avgRating === null ? null : Math.min(5, Math.max(0, avgRating)),
        numRatings: numRatings === null ? 0 : Math.max(0, numRatings),
        avgDifficulty,
        wouldTakeAgainPercent: wouldTakeAgainPercent ?? -1
    };
}


function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}


function professorNameMatches(searchName, professor) {
    return professorNameMatchScore(searchName, professor) >= MIN_NAME_MATCH_SCORE;
}


function professorNameMatchScore(searchName, professor) {
    const searchTokens = tokenizeName(searchName);
    const firstNameTokens = tokenizeName(professor.firstName);
    const lastNameTokens = tokenizeName(professor.lastName);
    const foundNameTokens = [...firstNameTokens, ...lastNameTokens];

    if (searchTokens.length === 0 || foundNameTokens.length === 0) {
        return 0;
    }

    if (searchTokens.length === 1) {
        return Math.max(...foundNameTokens.map(token => nameTokenMatchScore(searchTokens[0], token)));
    }

    let bestScore = compoundSurnameMatchScore(searchTokens, lastNameTokens);
    for (let firstIndex = 0; firstIndex < searchTokens.length; firstIndex += 1) {
        const firstScore = Math.max(
            0,
            ...firstNameTokens.map(token => nameTokenMatchScore(searchTokens[firstIndex], token))
        );
        if (firstScore === 0) {
            continue;
        }

        for (let lastIndex = 0; lastIndex < searchTokens.length; lastIndex += 1) {
            if (lastIndex === firstIndex) {
                continue;
            }
            const lastScore = Math.max(
                0,
                ...lastNameTokens.map(token => nameTokenMatchScore(searchTokens[lastIndex], token))
            );
            bestScore = Math.max(bestScore, (firstScore + lastScore) / 2);
        }
    }

    return bestScore;
}


function compoundSurnameMatchScore(searchTokens, lastNameTokens) {
    if (searchTokens.length < 2 || searchTokens.length !== lastNameTokens.length) {
        return 0;
    }

    let totalScore = 0;
    let exactMatches = 0;
    let approximateMatches = 0;
    for (let index = 0; index < searchTokens.length; index += 1) {
        const searchToken = searchTokens[index];
        const lastNameToken = lastNameTokens[index];
        if (searchToken === lastNameToken) {
            totalScore += 1;
            exactMatches += 1;
            continue;
        }

        if (
            approximateMatches === 0
            && Math.min(searchToken.length, lastNameToken.length) >= MIN_APPROXIMATE_SURNAME_TOKEN_LENGTH
            && isSingleInsertionOrDeletionApart(searchToken, lastNameToken)
        ) {
            totalScore += 0.9;
            approximateMatches += 1;
            continue;
        }

        return 0;
    }

    return exactMatches > 0 ? totalScore / searchTokens.length : 0;
}


function isSingleInsertionOrDeletionApart(left, right) {
    if (Math.abs(left.length - right.length) !== 1) {
        return false;
    }

    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    let shorterIndex = 0;
    let longerIndex = 0;
    let skipped = false;
    while (shorterIndex < shorter.length && longerIndex < longer.length) {
        if (shorter[shorterIndex] === longer[longerIndex]) {
            shorterIndex += 1;
            longerIndex += 1;
            continue;
        }
        if (skipped) {
            return false;
        }
        skipped = true;
        longerIndex += 1;
    }
    return true;
}


function nameTokenMatchScore(left, right) {
    if (!left || !right) {
        return 0;
    }
    if (left === right) {
        return 1;
    }

    const canonicalLeft = nameTokenAliases[left];
    const canonicalRight = nameTokenAliases[right];
    if (canonicalLeft && canonicalLeft === canonicalRight) {
        return 0.95;
    }

    // A Rutgers initial may match a full RMP name, but the reverse is too ambiguous:
    // a complete Rutgers first name must not match every RMP professor with that initial.
    if (left.length === 1 && right.startsWith(left)) {
        return 0.8;
    }

    const shorterLength = Math.min(left.length, right.length);
    const longerLength = Math.max(left.length, right.length);
    if (shorterLength >= 3 && (left.startsWith(right) || right.startsWith(left))) {
        return 0.7 + (0.15 * shorterLength / longerLength);
    }

    return 0;
}


function tokenizeName(name) {
    const normalizedName = normalizeName(name);
    return normalizedName ? normalizedName.split(" ") : [];
}


function normalizeProfessorSearchQuery(name) {
    if (typeof name !== "string") {
        return "";
    }
    return name.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}


function normalizeName(name) {
    if (typeof name !== "string") {
        return "";
    }

    return name
        .normalize("NFKD")
        .replace(/\p{Mark}+/gu, "")
        .toLowerCase()
        .replace(/[^\p{Letter}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}


function selectMostLikelyProfessor(professors, matchText, searchName = "", subjectName = "") {
    const eligibleProfessors = professors.filter(professor =>
        !hasObviousDepartmentConflict(subjectName, professor.department, searchName, professor)
    );
    if (eligibleProfessors.length === 0) {
        return null;
    }
    if (eligibleProfessors.length === 1) {
        return eligibleProfessors[0];
    }

    return eligibleProfessors.reduce((best, professor) => {
        const comparison = compareProfessorCandidates(professor, best, searchName, matchText);
        return comparison > 0 ? professor : best;
    });
}


function hasObviousDepartmentConflict(subjectName, department, searchName, professor) {
    if (!subjectName || !department || hasCompleteExactNameMatch(searchName, professor)) {
        return false;
    }

    const subjectDiscipline = classifyDiscipline(subjectName);
    const departmentDiscipline = classifyDiscipline(department);
    if (!subjectDiscipline || !departmentDiscipline || subjectDiscipline === departmentDiscipline) {
        return false;
    }

    return OBVIOUS_DISCIPLINE_CONFLICTS.has(
        [subjectDiscipline, departmentDiscipline].sort().join("|")
    );
}


function hasCompleteExactNameMatch(searchName, professor) {
    const searchTokens = tokenizeName(searchName);
    const firstNameTokens = tokenizeName(professor.firstName);
    const lastNameTokens = tokenizeName(professor.lastName);
    if (searchTokens.length < 2 || firstNameTokens.length === 0 || lastNameTokens.length === 0) {
        return false;
    }

    return searchTokens.some((searchToken, firstIndex) =>
        firstNameTokens.includes(searchToken)
        && searchTokens.some((lastToken, lastIndex) =>
            lastIndex !== firstIndex && lastNameTokens.includes(lastToken)
        )
    );
}


function classifyDiscipline(value) {
    const normalizedValue = normalizeName(value);
    if (!normalizedValue) {
        return "";
    }
    const paddedValue = ` ${normalizedValue} `;
    for (const [discipline, phrases] of Object.entries(DISCIPLINE_PHRASES)) {
        if (phrases.some(phrase => paddedValue.includes(` ${phrase} `))) {
            return discipline;
        }
    }
    return "";
}


function compareProfessorCandidates(left, right, searchName, matchText) {
    const leftNameScore = searchName ? professorNameMatchScore(searchName, left) : 1;
    const rightNameScore = searchName ? professorNameMatchScore(searchName, right) : 1;
    if (leftNameScore !== rightNameScore) {
        return leftNameScore - rightNameScore;
    }

    const leftDepartmentScore = departmentMatchScore(left.department, matchText);
    const rightDepartmentScore = departmentMatchScore(right.department, matchText);
    if (leftDepartmentScore !== rightDepartmentScore) {
        return leftDepartmentScore - rightDepartmentScore;
    }

    return left.numRatings - right.numRatings;
}


function departmentMatchScore(department, matchText) {
    const matchTokens = preprocessSearchText(matchText).split(" ").filter(Boolean);
    const departmentTokens = preprocessSearchText(department).split(" ").filter(Boolean);
    if (matchTokens.length === 0 || departmentTokens.length === 0) {
        return 0;
    }

    const originalScore = departmentTokens.reduce((total, departmentToken) =>
        total + Math.max(...matchTokens.map(matchToken => departmentTokenMatchScore(departmentToken, matchToken))), 0
    ) / departmentTokens.length;

    const alias = fetchAlias(department);
    if (alias === department) {
        return originalScore;
    }
    const aliasTokens = preprocessSearchText(alias).split(" ").filter(Boolean);
    const aliasScore = Math.max(
        0,
        ...aliasTokens.flatMap(aliasToken =>
            matchTokens.map(matchToken => departmentTokenMatchScore(aliasToken, matchToken))
        )
    ) * 0.9;
    return Math.max(originalScore, aliasScore);
}


function departmentTokenMatchScore(left, right) {
    if (left === right) {
        return 1;
    }
    const shorterLength = Math.min(left.length, right.length);
    const longerLength = Math.max(left.length, right.length);
    if (shorterLength >= 4 && (left.startsWith(right) || right.startsWith(left))) {
        return 0.75 + (0.2 * shorterLength / longerLength);
    }
    return 0;
}


/**
 * Performs a JSON GraphQL request without sending the browser's RMP cookies.
 * Retryable failures use bounded exponential backoff and respect Retry-After.
 */
async function apiFetch(query, variables) {
    let lastNetworkError = null;

    for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt += 1) {
        let response;
        try {
            response = await fetchWithTimeout(query, variables);
        } catch (error) {
            lastNetworkError = error;
            if (attempt < MAX_FETCH_RETRIES) {
                await delay(getRetryDelay(null, attempt));
                continue;
            }
            const detail = error?.name === "AbortError"
                ? `request timed out after ${FETCH_TIMEOUT_MS}ms`
                : getErrorMessage(error);
            throw new Error(`API fetch failed: could not reach RateMyProfessors (${detail})`);
        }

        if (!response.ok && RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_FETCH_RETRIES) {
            const retryDelay = getRetryDelay(response, attempt);
            await cancelResponseBody(response);
            await delay(retryDelay);
            continue;
        }

        if (!response.ok) {
            const reason = await readErrorReason(response);
            throw new Error(`API fetch failed: code ${response.status}${reason ? `, ${reason}` : ""}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            throw new Error(`API fetch failed: invalid JSON response (${getErrorMessage(error)})`);
        }

        const graphqlErrors = Array.isArray(data?.errors)
            ? data.errors.map(error => error?.message).filter(Boolean)
            : [];
        if (graphqlErrors.length > 0) {
            throw new Error(`API fetch failed: ${graphqlErrors.join("; ")}`);
        }
        if (!data || !Object.prototype.hasOwnProperty.call(data, "data")) {
            throw new Error("API fetch failed: no data returned");
        }

        return data;
    }

    throw lastNetworkError ?? new Error("API fetch failed");
}


function fetchWithTimeout(query, variables) {
    return runWithApiSlot(async () => {
        const controller = new AbortController();
        const timeoutID = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            return await fetch(API_URL, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                credentials: "omit",
                signal: controller.signal,
                body: JSON.stringify({query, variables})
            });
        } finally {
            clearTimeout(timeoutID);
        }
    });
}


function runWithApiSlot(operation) {
    return new Promise((resolve, reject) => {
        const execute = () => {
            activeApiRequests += 1;
            Promise.resolve()
                .then(operation)
                .then(resolve, reject)
                .finally(() => {
                    activeApiRequests -= 1;
                    queuedApiRequests.shift()?.();
                });
        };

        if (activeApiRequests < MAX_CONCURRENT_API_REQUESTS) {
            execute();
        } else {
            queuedApiRequests.push(execute);
        }
    });
}


function getRetryDelay(response, attempt) {
    const retryAfter = response?.headers?.get("Retry-After");
    if (retryAfter) {
        const seconds = Number(retryAfter);
        const retryAt = Date.parse(retryAfter);
        const milliseconds = Number.isFinite(seconds)
            ? seconds * 1_000
            : retryAt - Date.now();
        if (Number.isFinite(milliseconds) && milliseconds >= 0) {
            return Math.min(milliseconds, FETCH_RETRY_MAX_DELAY_MS);
        }
    }

    const exponentialDelay = FETCH_RETRY_BASE_DELAY_MS * (2 ** attempt);
    const jitter = 0.75 + (Math.random() * 0.5);
    return Math.min(Math.round(exponentialDelay * jitter), FETCH_RETRY_MAX_DELAY_MS);
}


async function cancelResponseBody(response) {
    try {
        await response.body?.cancel();
    } catch (_error) {
        // The connection is already closed; there is nothing else to release.
    }
}


async function readErrorReason(response) {
    try {
        const text = await readResponsePrefix(response, ERROR_RESPONSE_MAX_BYTES);
        const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
        return sanitizeErrorReason(title || text).slice(0, ERROR_REASON_MAX_LENGTH);
    } catch (_error) {
        return "";
    }
}


async function readResponsePrefix(response, maxBytes) {
    if (!response.body?.getReader) {
        return (await response.text()).slice(0, maxBytes);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let byteCount = 0;
    let text = "";

    try {
        while (byteCount < maxBytes) {
            const {done, value} = await reader.read();
            if (done) {
                break;
            }
            const remaining = maxBytes - byteCount;
            const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
            byteCount += chunk.byteLength;
            text += decoder.decode(chunk, {stream: byteCount < maxBytes});
        }
    } finally {
        await reader.cancel().catch(() => {});
    }

    return text + decoder.decode();
}


function sanitizeErrorReason(reason) {
    const decoded = reason
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&amp;/gi, "&");

    return decoded
        .replace(/<[^>]*>/g, " ")
        .replace(/[<>\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function delay(milliseconds) {
    if (milliseconds <= 0) {
        return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}


function preprocessSearchText(text) {
    if (typeof text !== "string" || !text.trim()) {
        return "";
    }

    let processed = normalizeName(text);
    for (const [abbreviation, expansion] of Object.entries(ABBREVIATIONS)) {
        processed = processed.replace(new RegExp(`\\b${abbreviation}\\b`, "g"), expansion);
    }

    const seen = new Set();
    return processed
        .split(/\s+/)
        .filter(token => token && !STOP_WORDS.has(token))
        .filter(token => {
            if (seen.has(token)) {
                return false;
            }
            seen.add(token);
            return true;
        })
        .join(" ");
}


function fetchAlias(departmentName, backToOriginal = false) {
    if (typeof departmentName !== "string") {
        return "";
    }
    if (backToOriginal) {
        return originalDepartmentByAlias.get(departmentName) ?? departmentName;
    }
    return Object.prototype.hasOwnProperty.call(departmentAliases, departmentName)
        ? departmentAliases[departmentName]
        : departmentName;
}


function makeProfessorCacheKey(profName, matchText, subjectName = "") {
    return JSON.stringify([
        normalizeName(profName),
        preprocessSearchText(matchText),
        normalizeName(subjectName)
    ]);
}


function createCacheMetadata() {
    return {
        [CACHE_TIMESTAMP_KEY]: Date.now(),
        [CACHE_SCHEMA_KEY]: CACHE_SCHEMA_VERSION
    };
}


async function initializeCache() {
    try {
        const items = await chrome.storage.local.get(null);
        const cacheIsCurrent = items?.[CACHE_SCHEMA_KEY] === CACHE_SCHEMA_VERSION;
        const cacheIsFresh = Number.isFinite(items?.[CACHE_TIMESTAMP_KEY])
            && Date.now() - items[CACHE_TIMESTAMP_KEY] <= CACHE_MAX_AGE_MS;

        if (!cacheIsCurrent || !cacheIsFresh) {
            await chrome.storage.local.clear();
            await chrome.storage.local.set(createCacheMetadata());
            return;
        }

        for (const [key, value] of Object.entries(items)) {
            if (key.startsWith(CACHE_KEY_PREFIX)) {
                filteredProfStats.set(key.slice(CACHE_KEY_PREFIX.length), value);
            }
        }
    } catch (error) {
        console.warn("Could not initialize professor cache:", error);
    }
}


function serializeError(error) {
    return {
        message: getErrorMessage(error),
        stack: typeof error?.stack === "string" ? error.stack : getErrorMessage(error)
    };
}


function getErrorMessage(error) {
    return typeof error?.message === "string" ? error.message : String(error);
}
