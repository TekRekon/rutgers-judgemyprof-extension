importScripts("./constants.js", "./fuse.js");


let filteredProfStats = new Map();
let profStatsCache = new Map();
let profIDCache = new Map();
let fetchPromises = {
    profID: {},
    profStats: {},
    mostLikelyProf: {}
};


/**
 * Adds a listener to handle messages for fetching professor stats or resetting caches.
 * Always returns true to indicate asynchronous response handling via sendResponse.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchProfStats') {
        fetchMostLikelyProfessorID(request.profName, request.matchText)
            .then(profStats => {
                sendResponse({data: profStats});
            })
            .catch(error => {
                sendResponse({
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
            });
    } else if (request.action === 'resetCache') {
        try {
            filteredProfStats.clear();
            profStatsCache.clear();
            profIDCache.clear();
            fetchPromises = {
                profID: {},
                profStats: {},
                mostLikelyProf: {}
            };
            chrome.storage.local.clear();
            sendResponse({status: 1});
        } catch (error) {
            sendResponse({status: 0, errorMsg: error.message});
        }
    }
    return true;
});


/**
 * Identifies and caches the most likely professor ID based on name and optional match text.
 * Professors spread out across multiple schools in RateMyProfessors, so search 5 most popular schools for now.
 * Returns cached results if found and caches results in Chrome local storage if not null and a department exists.
 * If a similar request is pending, returns the existing promise instead of duplicating requests.
 *
 * @param {string} profName - The name of the professor to search for.
 * @param {string} [matchText=""] - Optional text (usually consisting of course+subject name) to match against professor's department for finer filtering.
 * @returns {Promise<Object|null>} - A promise that resolves to the most likely professor's stats object, or null if not found.
 */
async function fetchMostLikelyProfessorID(profName, matchText = "") {
    if (profName === "") {
        return null;
    }
    const cacheKey = `${profName}_${matchText}`;
    if (filteredProfStats.has(cacheKey)) {
        return filteredProfStats.get(cacheKey);
    }

    return fetchPromises.mostLikelyProf[cacheKey] ||= (async () => {
        let profMap = new Map();

        // 1) Fetch professor stats from the 5 most popular schools
        for (let i = 0; i < 5; i++) {
            let profIDs = await fetchProfessorID(profName, SCHOOLS[i][0], 20);
            if (!profIDs) continue;

            for (let prof of profIDs) {
                let profID = prof.node.id;
                let profStats = await fetchProfessorStats(profID);
                if (!profStats) continue;

                let searchNames = profName.replace(/[^a-zA-Z\s]+/g, '').trim().toLowerCase().split(/\s+/);
                let foundFirstName = profStats.firstName.replace(/[^a-zA-Z]/g, '').trim().toLowerCase() || "+++"; //default to "+++" if no first name to avoid matching with empty string
                let foundLastName = profStats.lastName.replace(/[^a-zA-Z]/g, '').trim().toLowerCase() || "+++";

                if (searchNames.length === 1) {
                    let name = searchNames[0];
                    if (name.includes(foundFirstName) || name.includes(foundLastName) ||
                        foundFirstName.includes(name) || foundLastName.includes(name)) {
                        profMap.set(profID, profStats);
                    }
                } else if (searchNames.length > 1) {
                    let [firstName, lastName] = searchNames;
                    if ((foundFirstName.includes(firstName) && foundLastName.includes(lastName)) ||
                        (foundFirstName.includes(lastName) && foundLastName.includes(firstName)) ||
                        (firstName.includes(foundFirstName) && lastName.includes(foundLastName)) ||
                        (firstName.includes(foundLastName) && lastName.includes(foundFirstName))) {
                        profMap.set(profID, profStats);
                    }
                }
            }
        }

        if (profMap.size === 0) {
            return null;
        }

        if (profMap.size === 1) {
            let firstValue = profMap.values().next().value;
            filteredProfStats.set(cacheKey, firstValue);
            return firstValue;
        }

        //2) Select professors that are tied in terms of whose department matches most closely to the matchText
        const profDepartments = [];
        profMap.forEach((value, key) => {
            value.department = fetchAlias(value.department, false);
            profDepartments.push(value.department);

        });
        const fuse = new Fuse(profDepartments, FUSE_OPTIONS);
        // Preprocess the matchText for better fuzzy search results
        const preprocessedMatchText = preprocessSearchText(matchText);
        const result = fuse.search(preprocessedMatchText);

        if (result.length !== 0) {
            const lowestScore = result[0].score;
            const departmentsWithLowestScore = new Set();

            result.forEach(item => {
                if (item.score === lowestScore) {
                    departmentsWithLowestScore.add(item.item);
                }
            });

            profMap.forEach((value, key) => {
                if (!departmentsWithLowestScore.has(value.department)) {
                    profMap.delete(key);
                }
            });
        }

        //3) Select professor with  most ratings
        let maxProfID = null;
        let maxRatings = -1;
        for (const [key, value] of profMap) {
            if (value.numRatings > maxRatings) {
                maxRatings = value.numRatings;
                maxProfID = key;
            }
        }
        let maxProf = profMap.get(maxProfID);
        maxProf.department = fetchAlias(maxProf.department, true);
        //only save if all departments are known
        if (Array.from(profMap.values()).every((value) => value.department !== "")) {
            filteredProfStats.set(cacheKey, maxProf);
            await chrome.storage.local.set({[`${profName}_${matchText}`]: maxProf});
        }
        return profMap.get(maxProfID);
    })().finally(() => delete fetchPromises.mostLikelyProf[cacheKey]);
}


/**
 * Fetches and caches professor ID(s) based on name and school ID, with optional limit on results.
 * Caches non-null results. Returns cached ID(s) if available.
 * If a similar request is pending, returns the existing promise instead of duplicating requests.
 *
 * @param {string} profName - Name of the professor.
 * @param {string} schoolID - Identifier for the school.
 * @param {number} [first=1] - Optional limit on the number of results returned (default is 1).
 * @returns {Promise<Array|null>} - A promise resolving to an array of professor IDs or null if none found.
 */
async function fetchProfessorID(profName, schoolID, first = 1) {
    const cacheKey = `${profName}${schoolID}`;
    if (profIDCache.has(cacheKey)) {
        return profIDCache.get(cacheKey);
    }
    if (!fetchPromises.profID[cacheKey]) {
        fetchPromises.profID[cacheKey] = apiFetch(ProfessorIDQuery, {text: profName, schoolID, first}).then(data => {
            if (!(data.data.newSearch.teachers.edges.length === 0)) {
                profIDCache.set(cacheKey, data.data.newSearch.teachers.edges);
                return data.data.newSearch.teachers.edges;
            }
            return null;
        }).finally(() => delete fetchPromises.profID[cacheKey]);
    }
    return fetchPromises.profID[cacheKey];
}


/**
 * Fetches and caches professor statistics by ID (retrieved from the fetchProfessorID function).
 * Returns cached data if available. Only caches non-null results.
 * If a similar request is pending, returns the existing promise instead of duplicating requests.
 * Occasionally, no department attribute is returned, in which case an empty department is assigned.
 *
 * @param {string} profID - The unique identifier for the professor.
 * @returns {Promise<Object|null>} - A promise that resolves to the professor stats object, or null if not found.
 */
async function fetchProfessorStats(profID) {
    if (profStatsCache.has(profID)) {
        return profStatsCache.get(profID);
    }
    if (!fetchPromises.profStats[profID]) {
        fetchPromises.profStats[profID] = apiFetch(ProfessorStatsQuery, {id: profID}).then(data => {
            if (data.data.node) {
                //capitalize first letter of first and possible last name, lowercase the rest
                data.data.node.firstName = data.data.node.firstName.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
                data.data.node.lastName = data.data.node.lastName.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
                if (data.data.node.hasOwnProperty('avgRating') && data.data.node.avgRating > 5) {
                    data.data.node.avgRating = 5;
                }
                if (!data.data.node.hasOwnProperty('department')) {
                    data.data.node.department = "";
                }
                else {
                    profStatsCache.set(profID, data.data.node);
                }
                return data.data.node;
            }
            return null;
        }).finally(() => delete fetchPromises.profStats[profID]);
    }
    return fetchPromises.profStats[profID];
}


/**
 * Asynchronously fetches data from an API using a POST request.
 *
 * @param {string} query - The GraphQL query string.
 * @param {object} variables - The variables for the GraphQL query.
 * @returns {Promise<object>} The JSON response from the API.
 * @throws {Error} When the fetch operation fails
 */
async function apiFetch(query, variables) {
    try {
        const response = await fetch(API_URL, {
            method: "POST", headers: {Authorization: AUTHORIZATION_TOKEN}, body: JSON.stringify({query, variables})
        });
        if (!response.ok) {
            throw new Error(`API fetch failed: code ${response.status}, ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        throw error;
    }
}


/**
 * Preprocesses text for better fuzzy search matching by:
 * - Removing stop words
 * - Normalizing case and whitespace
 * - Expanding common abbreviations
 * - Removing numbers and special characters
 *
 * @param {string} text - The text to preprocess
 * @returns {string} - The preprocessed text
 */
function preprocessSearchText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // Convert to lowercase and normalize whitespace
    let processed = text.toLowerCase().trim();
    
    // Remove common stop words that don't help with matching
    const stopWords = ['the', 'and', 'or', 'of', 'in', 'for', 'to', 'a', 'an', 'is', 'at', 'by', 'on', 'with'];
    const stopWordsSet = new Set(stopWords);
    
    // Expand common abbreviations before tokenizing
    const abbreviations = {
        'cs': 'computer science',
        'cse': 'computer science engineering',
        'ee': 'electrical engineering',
        'me': 'mechanical engineering',
        'ce': 'civil engineering',
        'bio': 'biology',
        'chem': 'chemistry',
        'phys': 'physics',
        'math': 'mathematics',
        'stats': 'statistics',
        'econ': 'economics',
        'psych': 'psychology',
        'phil': 'philosophy',
        'hist': 'history',
        'lit': 'literature',
        'eng': 'english',
        'mgmt': 'management',
        'bus': 'business',
        'acct': 'accounting',
        'fin': 'finance',
        'mkt': 'marketing',
        'ops': 'operations',
        'sci': 'science',
        'tech': 'technology',
        'info': 'information',
        'sys': 'systems',
        'dev': 'development',
        'prog': 'programming',
        'lang': 'language',
        'comm': 'communications',
        'med': 'medicine',
        'health': 'health',
        'env': 'environmental',
        'soc': 'sociology',
        'anth': 'anthropology',
        'geo': 'geography',
        'poli': 'political',
        'govt': 'government',
        'admin': 'administration',
        'edu': 'education',
        'relig': 'religion',
        'art': 'arts',
        'mus': 'music',
        'thea': 'theater',
        'calc': 'calculus'
    };

    // Apply abbreviation expansions
    for (const [abbrev, expansion] of Object.entries(abbreviations)) {
        // Use word boundaries to avoid partial matches
        const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
        processed = processed.replace(regex, expansion);
    }
    
    // Remove numbers, parentheses, and other non-alphabetic characters
    processed = processed.replace(/[+0-9()]/g, ' ');
    processed = processed.replace(/[^a-zA-Z ]/g, ' ');
    
    // Tokenize and filter stop words
    const tokens = processed.split(/\s+/)
        .filter(token => token.length > 0 && !stopWordsSet.has(token));
    
    // Remove duplicate tokens while preserving order
    const uniqueTokens = [];
    const seen = new Set();
    for (const token of tokens) {
        if (!seen.has(token)) {
            uniqueTokens.push(token);
            seen.add(token);
        }
    }
    
    // Rejoin tokens with single spaces
    return uniqueTokens.join(' ').trim();
}

/**
 * Converts department names to their aliases and vice versa to improve accuracy in Fuse searches.
 * Utilizes a constants file that contains custom mappings between department names and their aliases.
 *
 * @param {string} departmentName - The department name or its alias, depending on the operation direction.
 * @param {boolean} [backToOriginal=false] - Specifies the direction of conversion:
 *                                           true to convert an alias back to the original department name,
 *                                           false to convert a department name to its alias.
 * @returns {string} - The original department or its alias, depending on the operation direction.
 */
function fetchAlias(departmentName, backToOriginal = false) {
    if (backToOriginal) {
        for (let key in departmentAliases) {
            if (departmentAliases[key] === departmentName) {
                return key;
            }
        }
        return departmentName;
    } else {
        if (!departmentAliases.hasOwnProperty(departmentName)) {
            return departmentName;
        }
        return departmentAliases[departmentName];
    }
}


/**
 * Initializes the cache by fetching from Chrome local storage and storing it in the filteredProfStats map.
 * If the cache is older than 3 weeks, it is cleared and the cacheTimestamp is updated.
 */
async function initializeCache() {
    try {
        await chrome.storage.local.get(null, function (items) {
            const threeWeeks = 3 * 7 * 24 * 60 * 60 * 1000; // milliseconds
            if (!items || !items.cacheTimestamp || (Date.now() - items.cacheTimestamp > threeWeeks)) {
                chrome.storage.local.clear();
                chrome.storage.local.set({'cacheTimestamp': Date.now()});
            } else {
                for (let key in items) {
                    if (key !== 'cacheTimestamp') {
                        filteredProfStats.set(key, items[key]);
                    }
                }
            }
        });
    } catch (error) {
        //pass
    }
}

initializeCache();
