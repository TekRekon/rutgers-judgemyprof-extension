importScripts("./constants.js", "./fuse.js");


const CACHE_KEY_PREFIX = "professor:";
const CACHE_TIMESTAMP_KEY = "cacheTimestamp";
const CACHE_SCHEMA_KEY = "cacheSchemaVersion";
const SEARCH_SCHOOL_LIMIT = 5;
const SEARCH_RESULTS_PER_SCHOOL = 20;
const ERROR_RESPONSE_MAX_BYTES = 4_096;
const ERROR_REASON_MAX_LENGTH = 160;

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
    return fetchMostLikelyProfessor(profName, matchText);
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
 * @returns {Promise<Object|null>} The selected professor record, or null when no record matches.
 */
async function fetchMostLikelyProfessor(profName, matchText = "") {
    if (!profName) {
        return null;
    }

    const cacheKey = makeProfessorCacheKey(profName, matchText);
    if (filteredProfStats.has(cacheKey)) {
        return filteredProfStats.get(cacheKey);
    }

    const existingPromise = fetchPromises.mostLikelyProfessor.get(cacheKey);
    if (existingPromise) {
        return existingPromise;
    }

    const generation = cacheGeneration;
    const promise = (async () => {
        const settledSchoolResults = await Promise.allSettled(
            SCHOOLS.slice(0, SEARCH_SCHOOL_LIMIT).map(([schoolID]) =>
                fetchProfessorCandidates(profName, schoolID, SEARCH_RESULTS_PER_SCHOOL)
            )
        );
        const schoolResults = settledSchoolResults
            .filter(result => result.status === "fulfilled")
            .map(result => result.value);
        if (schoolResults.length === 0) {
            throw settledSchoolResults[0]?.reason ?? new Error("All professor searches failed");
        }
        const allSchoolsSucceeded = schoolResults.length === settledSchoolResults.length;

        const professorsByID = new Map();
        for (const professors of schoolResults) {
            for (const professor of professors) {
                if (professorNameMatches(profName, professor)) {
                    professorsByID.set(professor.id, professor);
                }
            }
        }

        const selectedProfessor = selectMostLikelyProfessor(
            Array.from(professorsByID.values()),
            matchText
        );

        if (selectedProfessor && allSchoolsSucceeded && generation === cacheGeneration) {
            filteredProfStats.set(cacheKey, selectedProfessor);
            if (selectedProfessor.department) {
                await chrome.storage.local.set({
                    [`${CACHE_KEY_PREFIX}${cacheKey}`]: selectedProfessor
                });
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


/**
 * Searches one RMP school and returns complete professor records directly from the search query.
 * This avoids the previous extra request for every returned professor ID.
 */
async function fetchProfessorCandidates(profName, schoolID, first) {
    const cacheKey = JSON.stringify([normalizeName(profName), schoolID, first]);
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
            const edges = data.data?.newSearch?.teachers?.edges ?? [];
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
    const searchTokens = tokenizeName(searchName);
    const firstNameTokens = tokenizeName(professor.firstName);
    const lastNameTokens = tokenizeName(professor.lastName);
    const foundNameTokens = [...firstNameTokens, ...lastNameTokens];

    if (searchTokens.length === 0 || foundNameTokens.length === 0) {
        return false;
    }

    if (searchTokens.length === 1) {
        return foundNameTokens.some(token => namesOverlap(searchTokens[0], token));
    }

    const searchedFirstName = searchTokens[0];
    const searchedLastName = searchTokens[searchTokens.length - 1];
    const foundFirstName = firstNameTokens[0] ?? "";
    const foundLastName = lastNameTokens[lastNameTokens.length - 1] ?? "";

    return (
        namesOverlap(searchedFirstName, foundFirstName) && namesOverlap(searchedLastName, foundLastName)
    ) || (
        namesOverlap(searchedFirstName, foundLastName) && namesOverlap(searchedLastName, foundFirstName)
    );
}


function namesOverlap(left, right) {
    return Boolean(left && right && (left.includes(right) || right.includes(left)));
}


function tokenizeName(name) {
    const normalizedName = normalizeName(name);
    return normalizedName ? normalizedName.split(" ") : [];
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


function selectMostLikelyProfessor(professors, matchText) {
    if (professors.length === 0) {
        return null;
    }
    if (professors.length === 1) {
        return professors[0];
    }

    let candidates = professors;
    const preprocessedMatchText = preprocessSearchText(matchText);
    const comparableDepartments = professors.map(professor => fetchAlias(professor.department));

    if (preprocessedMatchText && comparableDepartments.some(Boolean)) {
        const results = new Fuse(comparableDepartments, FUSE_OPTIONS).search(preprocessedMatchText);
        if (results.length > 0) {
            const bestScore = results[0].score;
            const bestDepartments = new Set(
                results
                    .filter(result => Math.abs(result.score - bestScore) < Number.EPSILON)
                    .map(result => result.item)
            );
            candidates = professors.filter((_, index) => bestDepartments.has(comparableDepartments[index]));
        }
    }

    return candidates.reduce((best, professor) =>
        professor.numRatings > best.numRatings ? professor : best
    );
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


function makeProfessorCacheKey(profName, matchText) {
    return JSON.stringify([normalizeName(profName), preprocessSearchText(matchText)]);
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
