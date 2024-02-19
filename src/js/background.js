importScripts("./constants.js", "./fuse.js");


let filteredProfStats = new Map();
let profStatsCache = new Map();
let profIDCache = new Map();
let fetchPromises = {
    profID: {},
    profStats: {},
    mostLikelyProf: {}
};


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchProfStats') {
        fetchMostLikelyProfessorID(request.profName, request.matchText)
            .then(profStats => {
                chrome.storage.local.set({[`${request.profName}_${request.matchText}`]: profStats});
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
    }
    else if (request.action === 'resetCache') {
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
        }
        catch (error) {
            sendResponse({status: 0, errorMsg: error.message});
        }

    }
    return true;
});


async function fetchMostLikelyProfessorID(profName, matchText = "") {
    const cacheKey = `${profName}_${matchText}`;
    if (filteredProfStats.has(cacheKey)) {
        return filteredProfStats.get(cacheKey);
    }

    return fetchPromises.mostLikelyProf[cacheKey] ||= (async () => {
        let profMap = new Map();

        for (let i = 0; i < 4; i++) { // Only search the 5 most popular schools for now
            let profIDs = await fetchProfessorID(profName, SCHOOLS[i][0], 4);
            let limit = profIDs ? profIDs.length : 0;
            for (let j = 0; j < limit; j++) {
                let profID = profIDs[j].node.id;
                let profStats = await fetchProfessorStats(profID);
                profMap.set(profID, profStats);
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
        //2) Select professors that are tied in terms of their department which matches most closely to subject/class
        const profDepartments = [];
        profMap.forEach((value, key) => {
            value.department = fetchAlias(value.department, false);
            profDepartments.push(value.department);

        });
        const fuse = new Fuse(profDepartments, FUSE_OPTIONS);
        const result = fuse.search(matchText);

        //Remove professors that are not from departments that tie for lowest (best) score from the result
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

        //3) Select professor with  most ratings
        let maxProfID = null;
        let maxRatings = -1;
        for (const [key, value] of profMap) {
            if (value.numRatings > maxRatings) {
                maxRatings = value.numRatings;
                maxProfID = key;
            }
        }
        profMap.get(maxProfID).department = fetchAlias(profMap.get(maxProfID).department, true);
        filteredProfStats.set(cacheKey, profMap.get(maxProfID));
        return profMap.get(maxProfID);

    })().finally(() => delete fetchPromises.mostLikelyProf[cacheKey]);
}


async function fetchProfessorID(profName, schoolID, first = 1) {
    const cacheKey = `${profName}${schoolID}`;
    if (profIDCache.has(cacheKey)) {
        console.log("cache hit profID");
        return profIDCache.get(cacheKey);
    }
    if (!fetchPromises.profID[cacheKey]) {
        fetchPromises.profID[cacheKey] = apiFetch(ProfessorIDQuery, {text: profName, schoolID, first}).then(data => {
            if (!(data.data.newSearch.teachers.edges.length === 0)) {
                profIDCache.set(cacheKey, data.data.newSearch.teachers.edges);
            }
            return data.data.newSearch.teachers.edges;
        }).finally(() => delete fetchPromises.profID[cacheKey]);
    }
    return fetchPromises.profID[cacheKey];
}


async function fetchProfessorStats(profID) {
    if (profStatsCache.has(profID)) {
        console.log("cache hit stats");
        return profStatsCache.get(profID);
    }
    if (!fetchPromises.profStats[profID]) {
        fetchPromises.profStats[profID] = apiFetch(ProfessorStatsQuery, {id: profID}).then(data => {
            if (data.data.node) {
                profStatsCache.set(profID, data.data.node);
            }
            return data.data.node;
        }).finally(() => delete fetchPromises.profStats[profID]);
    }
    return fetchPromises.profStats[profID];
}


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
        //check for error if there is no internet connection
        if (error instanceof TypeError) {
            let err = new Error(`API fetch failed. Check your internet connection.`);
            err.stack = error.stack;
            throw err;
        }
        throw error;
    }
}


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


async function initializeCache() {
    try {
        await chrome.storage.local.get(null, function (items) {
            const threeWeeks = 3 * 7 * 24 * 60 * 60 * 1000; // milliseconds
            if (!items.cacheTimestamp || (Date.now() - items.cacheTimestamp > threeWeeks)) {
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
