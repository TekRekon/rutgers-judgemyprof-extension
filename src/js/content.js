//TODO OnHover popup for professor rating
//TODO style rating text element/add padding to left of text element
//TODO handle other rutgers websites:
    // var onCSP = window.location.href.includes("/csp/");
    // var onSOC = window.location.href.includes("/soc/");
    // var onWR = window.location.href.includes("/webreg/");

function addRatingToInstructorElements(subjectElement) {
    // Find all instructor elements within a dropdown
    const instructorElements = subjectElement.querySelectorAll('.instructors');

    instructorElements.forEach(function(elem) {
        if (!elem.querySelector('.ratingText')) {
            const ratingElement = document.createElement('span');
            ratingElement.className = 'ratingText';
            ratingElement.textContent = 'Loading...';

            // Fetch the professor's rating and update the text content
            fetchProfStats(elem.textContent.trim())
                .then(response => {
                    ratingElement.textContent = response.data ? response.data.avgRating : 'N/A';
                })
                .catch(error => {
                    console.error("Error occurred while fetching professor stats: ", error);
                    ratingElement.textContent = 'Error';
                });
            // Append the new rating text element next to the instructor's name
            elem.appendChild(ratingElement);
        }
    });
}

document.addEventListener('click', function(event) {
    // Check if a dropdown was clicked
    let subjectElement = event.target.closest('.subject');
    if (subjectElement) {
        addRatingToInstructorElements(subjectElement);
    }
});

async function fetchProfStats(profName) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({
                contentScriptQuery: 'fetchProfStats',
                profName: profName
            }, response => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        } catch (error) {
            console.error("Error fetching professor stats from content.js: ", error);
            reject(error);
        }
    });
}



// ----------------OLD CODE----------------
// async function runCode() {
//
//     const instructorColumnHeaders = document.getElementsByClassName("instructorColumnHeader");
//     if (instructorColumnHeaders.length > 0) {
//         for (let i = 0; i < instructorColumnHeaders.length; i++) {
//             if (instructorColumnHeaders[i] != null) {
//                 instructorColumnHeaders[i].style.marginRight = "120px";
//             }
//         }
//     }
//
//     let instructors = document.getElementsByClassName("instructors");
//     for (let i = 0; i < instructors.length; i++) {
//         const textElement = document.createElement("span");
//         textElement.id = "professorRatingElement";
//         textElement.textContent = "Loading...";
//
//         // Insert the new text element after the current instructor element
//         instructors[i].insertAdjacentElement("afterend", textElement);
//
//         const textContent = instructors[i].textContent;
//         const professors = textContent.split('; ');
//
//         let rating = 'N/A'
//         rating = retrieveRating();
//
//         textElement.textContent = rating;
//
// }
//
// if (window.location.href.includes('/soc')) {
//     //check if professor ratings are propagated, otherwise propagate the values
//     function checkForElement() {
//         const element = document.getElementById("professorRatingElement");
//         const instructorsElement = document.getElementsByClassName("instructors")
//
//         if (element || instructorsElement.length === 0) {
//             //pass
//         } else {
//             runCode();
//         }
//     }
//     const interval = setInterval(checkForElement, 5000); // Check every 5 second
// }
