//TODO OnHover popup for professor rating
//TODO style rating text element/add padding to left of text element
//TODO handle other rutgers websites:
    // var onCSP = window.location.href.includes("/csp/");
    // var onSOC = window.location.href.includes("/soc/");
    // var onWR = window.location.href.includes("/webreg/");

function addRatingToInstructorElements(subjectElement) {
    // Find all instructor elements within a dropdown
    const instructorElements = subjectElement.querySelectorAll('.instructors');
    let searchSubject = document.getElementById('subjectTitle2');
    let searchSubjectText = searchSubject.innerText;

    instructorElements.forEach(function(elem) {
        let courseName = findParentDiv(elem, "courseData").innerText;
        if (!elem.querySelector('.ratingText')) {

            if (elem.textContent.trim().includes(";")) {
                elem.style.marginRight = "13px";
                const ratingElement = document.createElement('div');
                styleRatingElement(ratingElement);

                const profName = document.createElement("div");
                const dept = document.createElement("div");
                const rating = document.createElement("div");
                const reviews = document.createElement("div");
                const reviewsLink = document.createElement("a");
                const difficulty = document.createElement("div");
                const wta = document.createElement("div");
                const warningBubble = document.createElement("div");
                const warning = document.createElement("div");
                const searchPopup = document.createElement("div");
                const box = document.createElement("div");
                const details = document.createElement("div");
                const ratingCard = document.createElement('div');

                stylePopupData(ratingCard, profName, dept, rating, reviews, difficulty, box, details);

                const profs = elem.textContent.trim().split(";");
                for (let i = 0; i < profs.length; i++) {
                    fetchProfStats(profs[i], searchSubjectText+ " " + courseName)
                    .then(response => {
                        var prof = profs[i];
                        ratingElement.textContent = response.data ? response.data.avgRating : 'N/A';
                        rating.textContent = ratingElement.textContent.trim();
                        if (prof == "") {
                            ratingElement.textContent = "N/A";
                        }
                        if (ratingElement.textContent.trim() != "N/A" && ratingElement.textContent.trim() != "Error") {
                            
                            inputProfData (ratingElement, rating, response.data.department, dept, response.data.firstName, response.data.lastName, profName, response.data.numRatings, response.data.avgDifficulty, difficulty, response.data.legacyId, reviewsLink, response.data.wouldTakeAgainPercent, wta)


                            addEventListeners(ratingElement, ratingCard);

                            if (!prof.includes(",")) { // check if professor Last Name is unavailable
                                noFirstNameListed(ratingCard, warningBubble, warning);
                            }
                        }
                        if (ratingElement.textContent == "N/A") { // check if rating is N/A
                            noRating(ratingElement, searchPopup, prof);
                        }
                    })
                    .catch(error => {
                        console.error("Error occurred while fetching professor stats: ", error);
                        ratingElement.textContent = 'N/A';
                    });
                    elem.appendChild(ratingElement);
                    elem.appendChild(ratingCard);
                    ratingCard.appendChild(profName);
                    ratingCard.appendChild(dept);
                    ratingCard.appendChild(box);
                    box.appendChild(rating);
                    box.appendChild(reviews);
                    reviews.appendChild(reviewsLink);
                    ratingCard.appendChild(details);
                    details.appendChild(difficulty);
                    details.appendChild(wta);
                }
            }

            elem.style.marginRight = "13px";
            const ratingElement = document.createElement('div');
            styleRatingElement(ratingElement);

            // initialize elements
            const profName = document.createElement("div");
            const dept = document.createElement("div");
            const rating = document.createElement("div");
            const reviews = document.createElement("div");
            const reviewsLink = document.createElement("a");
            const difficulty = document.createElement("div");
            const wta = document.createElement("div");
            const warningBubble = document.createElement("div");
            const warning = document.createElement("div");
            const searchPopup = document.createElement("div");
            const box = document.createElement("div");
            const details = document.createElement("div");
            const ratingCard = document.createElement('div');

            stylePopupData(ratingCard, profName, dept, rating, reviews, difficulty, box, details); // style popup elements

            // Fetch the professor's rating and update the text content
            fetchProfStats(elem.textContent.trim(), searchSubjectText+ " " + courseName)
                .then(response => {
                    var prof = elem.textContent.trim().substring(0, elem.textContent.trim().length - 10);
                    ratingElement.textContent = response.data ? response.data.avgRating : 'N/A';
                    rating.textContent = ratingElement.textContent.trim();
                    if (prof == "") {
                        ratingElement.textContent = "N/A";
                    }
                    if (ratingElement.textContent.trim() != "N/A" && ratingElement.textContent.trim() != "Error") {
                        
                        inputProfData (ratingElement, rating, response.data.department, dept, response.data.firstName, response.data.lastName, profName, response.data.numRatings, response.data.avgDifficulty, difficulty, response.data.legacyId, reviewsLink, response.data.wouldTakeAgainPercent, wta);


                        addEventListeners(ratingElement, ratingCard);

                        if (!prof.includes(",")) { // check if professor Last Name is unavailable
                            noFirstNameListed(ratingCard, warningBubble, warning);
                        }
                    }
                    if (ratingElement.textContent == "N/A") { // check if rating is N/A
                        noRating(ratingElement, searchPopup, prof);
                    }
                })
                .catch(error => {
                    console.error("Error occurred while fetching professor stats: ", error);
                    ratingElement.textContent = 'N/A';
                });
            // Append elements
            elem.appendChild(ratingElement);
            elem.appendChild(ratingCard);
            ratingCard.appendChild(profName);
            ratingCard.appendChild(dept);
            ratingCard.appendChild(box);
            box.appendChild(rating);
            box.appendChild(reviews);
            reviews.appendChild(reviewsLink);
            ratingCard.appendChild(details);
            details.appendChild(difficulty);
            details.appendChild(wta);
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

async function fetchProfStats(profName, matchText) {
    try {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                contentScriptQuery: 'fetchProfStats',
                matchText: matchText,
                profName: profName
            }, response => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (response.error) {
                    reject(response.error);
                } else {
                    resolve(response);
                }
            });
        });
    }
    catch (error) {
        return null;
    }
}

function getRMPLink (id) {
    return "https://www.ratemyprofessors.com/professor/" + id;
}

function findParentDiv (el, className) {
    className = className.toLowerCase();
    while (el && el.parentNode) {
        el = el.parentNode;
        if (el.className && el.className.toLowerCase() == className) {
            while (el && el.previousSibling) {
                el = el.previousSibling;
                if (el.className && el.className.toLowerCase() == "metadata hidden") {
                    return el;
                }
            }
        }
    }
    return null;
}

function styleRatingElement(el) {
    el.className = 'ratingText';
    el.id = 'rating';
    el.textContent = 'Loading...';
    el.style.fontSize = '17px';
    el.style.display = 'inline-block';
    el.style.padding = '8px';
    el.style.position = 'relative';
    el.style.backgroundColor = 'lightgray';
    el.style.borderRadius = '10px';
    el.style.marginLeft = "30px";
    el.style.marginRight = "1px";
    el.style.fontWeight = "bold";
    el.style.transition = "box-shadow 0.3s ease, transform 0.1s ease";
    el.style.cursor = "pointer";

    el.addEventListener("mousedown", () => {
        el.style.transform = "translateY(2px)";
    });
    el.addEventListener("mouseup", () => {
        el.style.transform = "translateY(-2px)";
    });
}

function getRatingColor(rating) {
    var color = "";
    if (rating < 2.0) {
        color = "lightcoral"
    }
    else if (rating < 3.0) {
        color = "lightsalmon";
    }
    else if (rating < 4.0) {
        color = "khaki";
    }
    else if (rating <= 5.0) {
        color = "lightgreen";
    }
    return color;
}

function stylePopupData (card, name, department, ratingNum, rev, diff, ratingBox, det) {
    card.style.display = "none";
    card.style.backgroundColor = "white";
    card.style.padding = "10px";
    card.style.borderRadius = "10px";
    card.style.whiteSpace = "pre-wrap";
    card.style.zIndex = "1";
    card.style.border = "2px solid #d30f32";
    card.style.width = '200px';
    card.style.boxSizing = "border-box";
    card.style.position = 'absolute';

    name.style.fontSize = "18px";
    name.style.fontWeight = "bold";
    name.style.marginBottom = "5px";

    department.style.fontSize = "14px";
    department.style.color = "#555";
    department.style.marginBottom = "10px";

    ratingNum.style.borderRadius = "8px";
    ratingNum.style.color = "black";
    ratingNum.style.fontSize = "14px";
    ratingNum.style.padding = "8px";
    ratingNum.style.fontWeight = "bold";
    ratingNum.style.marginRight = "10px";

    rev.style.fontSize = "14px";
    rev.style.color = "#555";

    diff.style.marginBottom = "5px";

    ratingBox.style.display = "flex";
    ratingBox.style.alignItems = "center";
    ratingBox.style.marginBottom = "10px";

    det.style.marginTop = "10px";
    det.style.fontSize = "14px";
    det.style.color = "#555";
}

function addEventListeners (el, card) {
    el.addEventListener("mouseover", () => {
        card.style.display = "inline-block";
        el.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        el.style.padding = "10px";
    });
    el.addEventListener("mouseleave", () => {
        card.style.display = "none";
        el.style.boxShadow = "none";
        el.style.padding = "8px";
    });
    card.addEventListener("mouseover", () => {
        card.style.display = "inline-block";
        el.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        el.style.padding = "10px";
    });
    card.addEventListener("mouseleave", () => {
        card.style.display = "none";
        el.style.boxShadow = "none";
        el.style.padding = "8px";
    });
}

function styleWarning(bubble, message) {
    bubble.style.position = "absolute";
    bubble.style.top = "-8px";
    bubble.style.right = "-8px";
    bubble.style.backgroundColor = "lightgray";
    bubble.style.borderRadius = "50%";
    bubble.style.width = "25px";
    bubble.style.height = "25px";
    bubble.style.display = "flex";
    bubble.style.fontSize = "14px";
    bubble.style.justifyContent = "center";
    bubble.style.alignItems = "center";
    bubble.style.cursor = "pointer";

    message.style.display = "none";
    message.style.position = "absolute";
    message.style.backgroundColor = "lightgray";
    message.style.fontSize = "12px";
    message.style.padding = "5px";
    message.style.borderRadius = "5px";
    message.style.top = "-30px";
    message.style.right = "7px";
    message.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.1)";
}

function styleSearchPopup (popup) {
    popup.style.display = "none";
    popup.style.position = "absolute";
    popup.style.backgroundColor = "lightgray";
    popup.style.fontSize = "12px";
    popup.style.padding = "5px";
    popup.style.borderRadius = "5px";
    popup.style.top = "-30px";
    popup.style.right = "-80px";
    popup.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.1)";
}

function addNAEventListeners(el, popup) {
    el.addEventListener("mouseover", () => {
        el.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        el.style.padding = "10px";
        popup.style.display = "block";
    });
    el.addEventListener("mouseleave", () => {
        el.style.boxShadow = "none";
        el.style.padding = "8px";
        popup.style.display = "none";
    });
}

function getWouldTakeAgain (percent) {
    var again = "";
    if (percent == -1) {
        again = "Would Take Again: N/A";
    } else {
        again = "Would Take Again: " + String(Math.round((percent + Number.EPSILON) * 100) / 100) + "%";
    }

    return again;
}

function noFirstNameListed (card, bubble, message) {
    card.appendChild(bubble);
    card.appendChild(message);
    bubble.textContent = "?";
    message.textContent = "Professor may be inaccurate: only last name provided";

    styleWarning(bubble, message);

    bubble.addEventListener("mouseover", () => {
        message.style.display = "block";
    });
    bubble.addEventListener("mouseleave", () => {
        message.style.display = "none";
    });
}

function noRating (el, popup, professor) {
    el.appendChild(popup);
    popup.textContent = "Click to search";

    styleSearchPopup(popup);

    if (professor == "") { // check is professor name is empty
        const link = "https://www.google.com/search?q=+bro+really+thought+there+was+a+professor+named+__+🗿💀";
        el.onclick = function () {
            window.open(link, '_blank');
        };
    } else {
        const link = "https://www.google.com/search?q=" + professor + "+rutgers+rate+my+professor";
        el.onclick = function () {
            window.open(link, '_blank');
        };
    }

    addNAEventListeners(el, popup);
}

function inputProfData (ratingEl, rat, department, dep, firstName, lastName, prof, numRatings, avgDifficulty, diff, legacyId, rev, wouldTakeAgainPercent, takeAgain) {
    let ratingNum = parseFloat(ratingEl.textContent.trim());
    const ratingColor = getRatingColor(ratingNum);
    ratingEl.style.backgroundColor = ratingColor;
    rat.style.backgroundColor = ratingColor;

    prof.textContent = firstName + " " + lastName;
    dep.textContent = department;
    const link = getRMPLink(legacyId);
    rev.textContent = numRatings + " review(s)";
    rev.href = link
    rev.target = "_blank";
    diff.textContent = "Level Of Difficulty: " + avgDifficulty;
    var tap = wouldTakeAgainPercent;
    takeAgain.textContent = getWouldTakeAgain(tap);

    ratingEl.onclick = function () {
        window.open(link, '_blank');
    };

}