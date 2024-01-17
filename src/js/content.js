if (window.location.href.includes("/csp/")) {
    let observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (!mutation.addedNodes) return;
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                if (mutation.addedNodes[i].id === "SectionSelectID") {
                    addRatingToInstructorElements(null);
                    observer.disconnect();
                }
            }
        });
    });

    let config = { childList: true, subtree: true };
    let targetNode = document.body;
    observer.observe(targetNode, config);


    document.addEventListener('click', function(event) {
        let dropdownElem = event.target.closest('.dijitTitlePane');
        if (dropdownElem) {
            addRatingToInstructorElements(dropdownElem);
        }
    });
}
else if (window.location.href.includes("/soc/")) {
    document.addEventListener('click', function(event) {
        let dropdownElem = event.target.closest('.subject');
        if (dropdownElem) {
            addRatingToInstructorElements(dropdownElem);
        }
    });
}

else if (window.location.href.includes("/oldsoc/")) {
    document.addEventListener('click', function(event) {
        let dropdownElem = event.target.closest('.subject');
        if (dropdownElem) {
            addRatingToInstructorElements(dropdownElem);
        }
    });
}
else if (window.location.href.includes("/webreg/")) {
    document.addEventListener('click', function(event) {
        let dropdownElem = event.target.closest('.subject');
        if (dropdownElem) {
            addRatingToInstructorElements(dropdownElem);
        }
    });
}


function addRatingToInstructorElements(subjectElement) {
    //get subject and instructor elements
    let instructorElements = [];
    let searchSubjectText;
    if (window.location.href.includes("/soc/")) {
        instructorElements = subjectElement.querySelectorAll('.instructors');
        searchSubjectText = document.getElementById('subjectTitle2').innerText;
    }
    else if (window.location.href.includes("/oldsoc/")) {
        instructorElements = subjectElement.querySelectorAll('.instructors');
        searchSubjectText = document.getElementById('subjectTitle').innerText;

    }
    else if (window.location.href.includes("/csp/")) {

        if (window.location.href.includes("SelectCourseTab")) {
            let subjectDropdown = document.querySelector('#CourseSearchID select:last-of-type');
            searchSubjectText = subjectDropdown.options[subjectDropdown.selectedIndex].text;
            let instructorElems = document.querySelectorAll('td[title="Instructor"]');
            instructorElements = Array.from(instructorElems).filter(function(element) {
                return subjectElement.contains(element);
            });
        }
        else if (window.location.href.includes("SelectSectionTab")) {
            searchSubjectText = "";
            instructorElements = document.querySelectorAll('td[title="Instructor"]');
        }

    }
    else if (window.location.href.includes("/webreg/")) {
        instructorElements = subjectElement.querySelectorAll('.instructors');
        searchSubjectText = document.getElementById('subjectTitle2').innerText;
    }
    else {
        console.error("Error: site type not found")
        return;
    }

    instructorElements.forEach(function(elem) {
        if (elem && !elem.querySelector('.ratingText')) {
            //get course name
            let courseName = "";
            if (window.location.href.includes("/soc/") || window.location.href.includes("/oldsoc/") || window.location.href.includes("/webreg/")) {
                courseName = findParentDiv(elem, "courseData").innerText;
            } else if (window.location.href.includes("/csp/")) {
                if (window.location.href.includes("SelectCourseTab")) {
                    if (subjectElement.querySelector('.title')) {
                        courseName = subjectElement.querySelector('.title').textContent.trim();
                    }
                    else {
                        return;
                    }
                } else if (window.location.href.includes("SelectSectionTab")) {
                    let courseElement = elem.closest('.dijitTitlePane');
                    if (courseElement) {
                        let titleElement = courseElement.querySelector('.title');
                        if (titleElement) {
                            courseName = titleElement.textContent.trim();
                        }
                    }
                    else {
                        return;
                    }
                }
            }

            //add rating elem to each valid instructor element
            const profs = elem.textContent.trim().split(";");
            for (let i = 0; i < profs.length; i++) {
                addRatingBubble(elem, profs[i], searchSubjectText, courseName, i, profs.length > 1 ? 2 : 1);
            }
        }
    });
}


async function fetchProfStats(profName, matchText) {
    try {
        return await new Promise((resolve, reject) => {
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
    } catch (error) {
        throw error;
    }
}



function findParentDiv (el, className) {
    className = className.toLowerCase();
    while (el && el.parentNode) {
        el = el.parentNode;
        if (el.className && el.className.toLowerCase() === className) {
            while (el && el.previousSibling) {
                el = el.previousSibling;
                if (el.className && el.className.toLowerCase() === "metadata hidden") {
                    return el;
                }
            }
        }
    }
    return null;
}

function styleRatingElement(el, prof) {
    el.className = 'ratingText';
    el.id = 'rating';
    el.textContent = '';
    el.style.fontSize = '17px';
    el.style.display = 'inline-block';
    el.style.padding = '8px';
    el.style.position = 'relative';
    el.style.backgroundColor = 'lightgray';
    el.style.borderRadius = '10px';
    el.style.marginLeft = "15px";
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
    let color = "";
    if (rating === "X.X") {
        color = "lightgray";
    } 
    else if (rating < 1.0) {
        color = "lightcoral";
    }
    else if (rating < 2.0) {
        color = "#F8917D"
    }
    else if (rating < 2.5) {
        color = "lightsalmon";
    }
    else if (rating < 3.0) {
        color = "#F7C684";
    }
    else if (rating < 3.5) {
        color = "khaki";
    }
    else if (rating < 4.0) {
        color = "#baee90";
    }
    else if (rating < 4.5) {
        color = "#98FB98";
    }
    else if (rating <= 5.0) {
        color = "#6ad46a";
    }
    return color;
}

function stylePopupData (card, name, department, ratingNum, rev, diff, ratingBox, det, el, prof) {
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
    if (window.location.href.includes("/csp/")) {
        card.style.left = "950px";
        el.style.marginTop = "11px";
        el.style.marginLeft = "1px";
        prof.style.paddingRight = "25px";
        if (prof.textContent.length < 12) {
            prof.style.paddingRight = "60px";
        }
        if (prof.textContent.length < 7) {
            prof.style.paddingRight = "80px";
        }
    }

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
    message.style.fontWeight = "bold";
    message.style.padding = "5px";
    message.style.borderRadius = "5px";
    message.style.top = "-40px";
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


function addInaccuracyWarning(card, bubble, message) {
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

function addRatingWarning(el, bubble) {
    el.appendChild(bubble);
    bubble.textContent = "?";

    el.style.position = "relative";
    bubble.style.position = "absolute";
    bubble.style.top = "-11px";
    bubble.style.right = "-10px";
    bubble.style.backgroundColor = "lightgray";
    bubble.style.borderRadius = "50%";
    bubble.style.width = "20px";
    bubble.style.height = "20px";
    bubble.style.display = "flex";
    bubble.style.fontSize = "10px";
    bubble.style.justifyContent = "center";
    bubble.style.alignItems = "center";
}

function noRating (el, popup, professor) {
    el.appendChild(popup);
    popup.textContent = "Click to search";

    styleSearchPopup(popup);

    if (professor === "") {
        const link = "https://www.google.com/search?q=🗿";
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

function addRatingBubble (el, prof, searchSubText, course, num, numProfs) {
    el.style.marginRight = "13px";
    const ratingElement = document.createElement('div');
    styleRatingElement(ratingElement, el);
    if (num === 1) {
        ratingElement.style.marginLeft = "6px";
    } else {
        ratingElement.style.marginLeft = "8px";
    }
    if (numProfs === 2) {
        ratingElement.style.fontSize = "14px";
    }
    if (el.textContent.trim().length > 25) {
        ratingElement.style.fontSize = "12px";
    }
    if (el.textContent.trim().length >= 29) {
        ratingElement.style.fontSize = "10px";
    }
    if (window.location.href.includes("/csp/")) {
        ratingElement.style.marginLeft = "1px";
    }

    const profName = document.createElement("div");
    const dept = document.createElement("div");
    const rating = document.createElement("div");
    const reviews = document.createElement("div");
    const reviewsLink = document.createElement("a");
    const difficulty = document.createElement("div");
    const wta = document.createElement("div");
    const warningBubble = document.createElement("div");
    const warning = document.createElement("div");
    const ratingWarning = document.createElement("div");
    const searchPopup = document.createElement("div");
    const box = document.createElement("div");
    const details = document.createElement("div");
    const ratingCard = document.createElement('div');

    stylePopupData(ratingCard, profName, dept, rating, reviews, difficulty, box, details, ratingElement, el);

    fetchProfStats(prof, searchSubText+ " " + course)
    .then(response => {
        if (!response.data) {
            ratingElement.textContent = 'N/A';
        }
        else if (response.data.numRatings === 0) {
            ratingElement.textContent = 'X.X';
        }
        else {
            ratingElement.textContent = response.data.avgRating;
        }
        rating.textContent = ratingElement.textContent.trim();
        if (prof === "") {
            ratingElement.textContent = "N/A";
        }
        if (ratingElement.textContent.trim() !== "N/A" && ratingElement.textContent.trim() !== "Error") {

            let ratingNum = parseFloat(ratingElement.textContent.trim());
            let ratingColor = ratingElement.textContent.trim()==="X.X" ? "lightgray" : getRatingColor(ratingNum);
            ratingElement.style.backgroundColor = ratingColor;
            rating.style.backgroundColor = ratingColor;

            profName.textContent = response.data.firstName + " " + response.data.lastName;
            dept.textContent = response.data.department;
            reviewsLink.textContent = response.data.numRatings + " review(s)";
            reviewsLink.href = "https://www.ratemyprofessors.com/professor/" + response.data.legacyId;
            reviewsLink.target = "_blank";
            difficulty.textContent = "Level Of Difficulty: " + (response.data.numRatings>0 ? response.data.avgDifficulty : "N/A");
            wta.textContent = "Would Take Again: " + (response.data.wouldTakeAgainPercent!==-1 ? String(Math.round((response.data.wouldTakeAgainPercent + Number.EPSILON) * 100) / 100) + "%" : "N/A");

            ratingElement.onclick = function () {
                window.open(reviewsLink.href, '_blank');
            };

            addEventListeners(ratingElement, ratingCard);
            if (!prof.includes(",")) { // check if professor Last Name is unavailable
                addInaccuracyWarning(ratingCard, warningBubble, warning);
                addRatingWarning(ratingElement, ratingWarning);
            }
        }
        if (ratingElement.textContent === "N/A") {
            noRating(ratingElement, searchPopup, prof);
        }
    })
    .catch(error => {
        console.error("Error occurred while fetching professor stats: ", error);
        ratingElement.textContent = 'Error';
    });
    el.appendChild(ratingElement);
    el.appendChild(ratingCard);
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