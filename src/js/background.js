importScripts("./constants.js");
importScripts("./fuse.js");

//TODO use chrome storage to store cache

const profStatsCache = new Map();
const profIDCache = new Map();
const filteredProfCache = new Map();
let profIDFetchPromises = {};
let profStatsFetchPromises = {};


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.contentScriptQuery === 'fetchProfStats') {
        fetchMostLikelyProfessorID(request.profName, request.matchText)
            .then(profStats => {
                sendResponse({ data: profStats });
            })
            .catch(error => {
                console.error(error);
                sendResponse({ error: error.message });
            });
        return true; // Indicate that we will send response asynchronously
    }
});


let mostLikelyProfFetchPromises = {};

async function fetchMostLikelyProfessorID(profName, matchText = "") {
    const filteredCacheKey = `${profName}_${matchText}`;

    if (filteredProfCache.has(filteredCacheKey)) {
        return filteredProfCache.get(filteredCacheKey);
    }

    if (mostLikelyProfFetchPromises[filteredCacheKey]) {
        return await mostLikelyProfFetchPromises[filteredCacheKey];
    }

    mostLikelyProfFetchPromises[filteredCacheKey] = new Promise(async (resolve, reject) => {
        try {
            let profMap = new Map();

            for (let i = 0; i < 5; i++) {
                let school = SCHOOLS[i];
                let profIDs = await fetchProfessorID(profName, school[0], 4);
                let limit = profIDs ? profIDs.length : 0;
                for (let j = 0; j < limit; j++) {
                    let profID = profIDs[j].node.id;
                    let profStats = await fetchProfessorStats(profID);
                    profMap.set(profID, profStats);
                }
            }

            if (profMap.size === 0) {
                filteredProfCache.set(filteredCacheKey, null);
                resolve(null);
                return;
            }
            if (profMap.size === 1) {
                filteredProfCache.set(filteredCacheKey, profMap.values().next().value);
                resolve(profMap.values().next().value);
                return;
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

            filteredProfCache.set(filteredCacheKey, profMap.get(maxProfID));
            resolve(profMap.get(maxProfID));
        } catch (error) {
            reject(error);
        } finally {
            delete mostLikelyProfFetchPromises[filteredCacheKey];
        }
    });

    return mostLikelyProfFetchPromises[filteredCacheKey];
}


async function fetchProfessorID(profName, schoolID, first = 1) {
    if (!profName) {
        return null;
    }
    const cacheKey = `${profName}_${schoolID}`;
    if (profIDCache.has(cacheKey)) {
        return profIDCache.get(cacheKey);
    }
    if (profIDFetchPromises[cacheKey]) {
        return await profIDFetchPromises[cacheKey];
    }
    profIDFetchPromises[cacheKey] = new Promise(async (resolve, reject) => {
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    Authorization: AUTHORIZATION_TOKEN,
                },
                body: JSON.stringify({
                    query: ProfessorIDQuery,
                    variables: {
                        text: profName,
                        schoolID: schoolID,
                        first: first        //number of results to fetch
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`Fetch failed for profID ${profName}`);
            }
            const profIDjson = await response.json();
            let idEdges = profIDjson.data.newSearch.teachers.edges;
            profIDCache.set(cacheKey, idEdges);
            resolve(idEdges);
        } catch (error) {
            reject(error);
        } finally {
            delete profIDFetchPromises[cacheKey];
        }
    });

    return profIDFetchPromises[cacheKey];
}


async function fetchProfessorStats(profID) {
    if (profStatsCache.has(profID)) {
        return profStatsCache.get(profID);
    }
    if (profStatsFetchPromises[profID]) {
        return await profStatsFetchPromises[profID];
    }

    profStatsFetchPromises[profID] = new Promise(async (resolve, reject) => {
        try {
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
            profStatsCache.set(profID, statsNode);
            resolve(statsNode);
        } catch (error) {
            reject(error);
        } finally {
            delete profStatsFetchPromises[profID];
        }
    });

    return profStatsFetchPromises[profID];
}


function fetchAlias(departmentName, backToOriginal = false) {
    if (backToOriginal) {
        for (let key in departmentAliases) {
            if (departmentAliases[key] === departmentName) {
                return key;
            }
        }
        return departmentName;
    }
    else {
        if (!departmentAliases.hasOwnProperty(departmentName)) {
            return departmentName;
        }
        return departmentAliases[departmentName];
    }
}
