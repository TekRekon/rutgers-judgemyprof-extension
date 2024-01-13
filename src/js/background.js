importScripts("./constants.js");
importScripts("./fuse.js");


const profStatsCache = new Map();
const profIDCache = new Map();
const filteredProfCache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.contentScriptQuery === 'fetchProfStats') {
        new Promise(async (resolve, reject) => {
            try {
                const profStats = await fetchMostLikelyProfessorID(request.profName, request.matchText);
                resolve(profStats);
            } catch (error) {
                reject(error.message);
            }
        }).then(response => {
            sendResponse({ data: response });
        }).catch(error => {
            sendResponse({ error: error });
        });
        return true; // Indicate that we will send response asynchronously
    }
});

//attempt to filter most relevant professor
async function fetchMostLikelyProfessorID(profName, matchText = "") {
    if (!profName) {
        return null;
    }
    let filteredCacheKey = `${profName}_${matchText}`;
    if (filteredProfCache.has(filteredCacheKey)) {
        return filteredProfCache.get(filteredCacheKey);
    }
    //1) search for first 9 most relevant professors from top 3 schools
    let profMap = new Map();

    for (let i = 0; i < 3; i++) {
        let school = SCHOOLS[i];
        let profIDs = await fetchProfessorID(profName, school[0], 3);
        let limit = profIDs ? profIDs.length : 0;
        for (let j = 0; j < limit; j++) {
            let profID = profIDs[j].node.id;
            let profStats = await fetchProfessorStats(profID);
            profMap.set(profID, profStats);
        }
    }
    if (profMap.size === 0) {
        filteredProfCache.set(filteredCacheKey, null);
        return null;
    }
    if (profMap.size === 1) {
        filteredProfCache.set(filteredCacheKey, profMap.values().next().value);
        return profMap.values().next().value;
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
    for (let i = 1; i < result.length; i++) {
        if (result[i].score !== lowestScore) {
            profMap.forEach((value, key) => {
                if (value.department === result[i].item) {
                    profMap.delete(key);
                }
            });
        }
    }

    //3) Select professor with  most ratings
    let maxRatings = -1;
    let maxProfID = null;
    profMap.forEach((value, key) => {
        if (value.numRatings > maxRatings) {
            maxRatings = value.numRatings;
            maxProfID = key;
        }
    });
    profMap.get(maxProfID).department = fetchAlias(profMap.get(maxProfID).department, true);
    filteredProfCache.set(filteredCacheKey, profMap.get(maxProfID));
    return profMap.get(maxProfID);
}


async function fetchProfessorID(profName, schoolID, first = 1) {
    const cacheKey = `${profName}_${schoolID}`;
    if (!profName) {
        return null;
    }
    if (profIDCache.has(cacheKey)) {
        return profIDCache.get(cacheKey);
    }
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            Authorization: AUTHORIZATION_TOKEN,
        },
        body: JSON.stringify({
            query: ProfessorIDQuery,
            variables: {
                first: first,    //Number of relevant professors to fetch
                query: { text: profName, schoolID: schoolID },
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Fetch failed for profID ${profName}`);
    }
    const profIDjson = await response.json();
    let idEdges = profIDjson.data.newSearch.teachers.edges;
    if (idEdges.length === 0) {
        profIDCache.set(cacheKey, null);
        return null;
    }
    profIDCache.set(cacheKey, idEdges);
    return idEdges;
}

async function fetchProfessorStats(profID) {
    if (profStatsCache.has(profID)) {
        return profStatsCache.get(profID);
    }
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            Authorization: AUTHORIZATION_TOKEN,
        },
        body: JSON.stringify({
            query: ProfessorStatsQuery,
            variables: {
                id: profID,
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`Fetch failed for profStats with ID ${profID}`);
    }
    const profStatsjson = await response.json();
    let statsNode = profStatsjson.data.node;
    if (!statsNode || Object.keys(statsNode).length === 0) {
        profStatsCache.set(profID, null);
        return null;
    }
    profStatsCache.set(profID, statsNode);
    return statsNode;
}

function fetchAlias(departmentName, reverse) {
    if (departmentAliases[departmentName]) {
        if (reverse) {
            for (let [key, value] of Object.entries(departmentAliases)) {
                if (value === departmentName) {
                    return key;
                }
            }
        }
        return departmentAliases[departmentName];
    }
    return departmentName;
}
