importScripts("./constants.js", "./fuse.js");

//TODO use chrome storage to store cache

const cache = {
    profStats: new Map(),
    profID: new Map(),
    filteredProf: new Map()
};
let fetchPromises = {
    profID: {},
    profStats: {},
    mostLikelyProf: {}
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.contentScriptQuery === 'fetchProfStats') {
        fetchMostLikelyProfessorID(request.profName, request.matchText)
            .then(profStats => sendResponse({data: profStats}))
            .catch(error => sendResponse({error: error.message}));
        return true; // Indicate that we will send response asynchronously
    }
});

async function fetchMostLikelyProfessorID(profName, matchText = "") {
    const cacheKey = `${profName}${matchText}`;
    if (cache.filteredProf.has(cacheKey)) {
        console.log("filteredCacheHit");
        return cache.filteredProf.get(cacheKey);
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
            cache.filteredProf.set(cacheKey, firstValue);
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
        cache.filteredProf.set(cacheKey, profMap.get(maxProfID));
        return profMap.get(maxProfID);

    })().finally(() => delete fetchPromises.mostLikelyProf[cacheKey]);
}


async function fetchProfessorID(profName, schoolID, first = 1) {
    const cacheKey = `${profName}${schoolID}`;
    if (cache.profID.has(cacheKey)) {
        return cache.profID.get(cacheKey);
    } else if (!fetchPromises.profID[cacheKey]) {
        fetchPromises.profID[cacheKey] = apiFetch(ProfessorIDQuery, {text: profName, schoolID, first}).then(data => {
            const edges = data.data.newSearch.teachers.edges;
            if (edges.length !== 0) {
                cache.profID.set(cacheKey, edges);
            }
            return edges;
        }).finally(() => delete fetchPromises.profID[cacheKey]);
    }
    return fetchPromises.profID[cacheKey];
}


async function fetchProfessorStats(profID) {
    if (cache.profStats.has(profID)) {
        return cache.profStats.get(profID);
    } else if (!fetchPromises.profStats[profID]) {
        fetchPromises.profStats[profID] = apiFetch(ProfessorStatsQuery, {id: profID}).then(data => {
            const statsNode = data.data.node;
            cache.profStats.set(profID, statsNode);
            return statsNode;
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
