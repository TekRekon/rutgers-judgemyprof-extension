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
            ratingElement.id = 'rating';
            ratingElement.textContent = 'Loading...';
            ratingElement.style.fontSize = '14px';
            ratingElement.style.display = 'inline-block';
            ratingElement.style.padding = '8px';
            ratingElement.style.backgroundColor = 'gray';
            ratingElement.style.borderRadius = '10px';
            ratingElement.style.marginLeft = "30px";
            ratingElement.style.marginRight = "10px";
            const profName = document.createElement("div");
            const dept = document.createElement("div");
            const rating = document.createElement("div");
            const reviews = document.createElement("div");
            const difficulty = document.createElement("div");
            const wta = document.createElement("div");

            // Fetch the professor's rating and update the text content
            fetchProfStats(elem.textContent.trim())
                .then(response => {
                    ratingElement.textContent = response.data ? response.data.avgRating : 'N/A';
                    rating.textContent = ratingElement.textContent.trim();
                    if (ratingElement.textContent.trim() != "N/A" && ratingElement.textContent.trim() != "Error") {
                        let ratingNum = parseFloat(ratingElement.textContent.trim());
                        if (ratingNum < 2.0) {
                            ratingElement.style.backgroundColor = 'lightcoral';
                            rating.style.backgroundColor = "lightcoral";
                        }
                        else if (ratingNum < 3.0) {
                            ratingElement.style.backgroundColor = 'lightsalmon';
                            rating.style.backgroundColor = "lightsalmon";
                        }
                        else if (ratingNum < 4.0) {
                            ratingElement.style.backgroundColor = 'khaki';
                            rating.style.backgroundColor = "khaki";
                        }
                        else if (ratingNum <= 5.0) {
                            ratingElement.style.backgroundColor = 'lightgreen';
                            rating.style.backgroundColor = "lightgreen";
                        }
                        const profFirstName = response.data.firstName;
                        const profLastName = response.data.lastName;
                        profName.textContent = profFirstName + " " + profLastName;
                        profName.style.fontSize = "18px";
                        profName.style.fontWeight = "bold";
                        profName.style.marginBottom = "5px";
                        const deptName = response.data.department;
                        dept.textContent = deptName;
                        dept.style.fontSize = "14px";
                        dept.style.color = "#555";
                        dept.style.marginBottom = "10px";
                        rating.style.borderRadius = "8px";
                        rating.style.color = "black";
                        rating.style.fontSize = "14px";
                        rating.style.padding = "5px";
                        rating.style.marginRight = "10px";
                        const numReviews = response.data.numRatings;
                        reviews.textContent = numReviews + " review(s)";
                        reviews.style.fontSize = "14px";
                        reviews.style.color = "#555";
                        const diff = response.data.avgDifficulty;
                        difficulty.textContent = "Level Of Difficulty: " + diff;
                        difficulty.style.marginBottom = "5px";
                        const takeAgain = response.data.wouldTakeAgainPercent;
                        wta.textContent = "Would Take Again: " + takeAgain + "%";
                    }
                })
                .catch(error => {
                    console.error("Error occurred while fetching professor stats: ", error);
                    ratingElement.textContent = 'Error';
                });
            // Append the new rating text element next to the instructor's name
            elem.appendChild(ratingElement);
            const ratingCard = document.createElement('div');
            ratingCard.style.display = "none";
            ratingCard.style.backgroundColor = "white";
            ratingCard.style.padding = "10px";
            ratingCard.style.borderRadius = "10px";
            elem.appendChild(ratingCard);
            ratingCard.style.border = "2px solid #d30f32";
            ratingCard.style.width = '200px';
            ratingCard.style.boxSizing = "border-box";
            ratingCard.style.position = 'absolute';
            ratingCard.appendChild(profName);
            ratingCard.appendChild(dept);
            const box = document.createElement("div");
            box.style.display = "flex";
            box.style.alignItems = "center";
            box.style.marginBottom = "10px";
            ratingCard.appendChild(box);
            box.appendChild(rating);
            box.appendChild(reviews);
            const details = document.createElement("div");
            details.style.marginTop = "10px";
            details.style.fontSize = "14px";
            details.style.color = "#555";
            ratingCard.appendChild(details);
            details.appendChild(difficulty);
            details.appendChild(wta);
            ratingElement.addEventListener("mouseover", () => {
                ratingCard.style.display = "inline-block";
            });
            ratingElement.addEventListener("mouseleave", () => {
                ratingCard.style.display = "none";
            });
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
