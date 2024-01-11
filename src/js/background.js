import * as constants from './constants.js';

//TODO implement caching
//TODO add other Rutgers schools
//TODO select professor with more ratings
//TODO auto check boxes on webreg
//TODO ensure correct professor is scraped using their department name
//TODO check for length 0 responses from fetchProfessorID and fetchProfessorStats
//TODO organize error handling:
    // throw ... raises an exception in the current code block and causes it to exit, or to flow to next catch statement if raised in a try block.
    //
    //     console.error just prints out a red message to the browser developer tools javascript console and does not cause any changes of the execution flow.



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.contentScriptQuery === 'fetchProfStats') {
        new Promise(async (resolve, reject) => {
            try {
                const profID = await fetchProfessorID(request.profName);
                const profStats = await fetchProfessorStats(profID.data.newSearch.teachers.edges[0].node.id);
                resolve(profStats.data.node);
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


async function fetchProfessorID(profName) {
    const response = await fetch(constants.API_URL, {
        method: "POST",
        headers: {
            Authorization: constants.AUTHORIZATION_TOKEN,
        },
        body: JSON.stringify({
            query: constants.ProfessorIDQuery,
            variables: {
                first: 1,    //Number of relevant professors to fetch
                query: { text: profName, schoolID: constants.SCHOOLS[0][0] },
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Fetch failed for profID ${profName}`);
    }
    return response.json()
}

async function fetchProfessorStats(profID) {
    const response = await fetch(constants.API_URL, {
        method: "POST",
        headers: {
            Authorization: constants.AUTHORIZATION_TOKEN,
        },
        body: JSON.stringify({
            query: constants.ProfessorStatsQuery,
            variables: {
                id: profID,
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`Fetch failed for profStats with ID ${profID}`);
    }
    return response.json();
}
