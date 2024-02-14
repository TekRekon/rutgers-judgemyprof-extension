if (window.location.href.includes("/csp/")) {
    window.addEventListener('popstate', function (event) {
        addRatingToInstructorElements(null);
    });

    let observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (!mutation.addedNodes) return;
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                if (mutation.addedNodes[i].id === "SectionSelectID") {
                    addRatingToInstructorElements(null);
                    observer.disconnect();
                }
            }
        });
    });

    let config = {childList: true, subtree: true};
    observer.observe(document.body, config);

    document.addEventListener('click', function (event) {
        let dropdownElem = event.target.closest('.dijitTitlePane');
        if (dropdownElem) {
            addRatingToInstructorElements(dropdownElem);
        }
    });
} else if (window.location.href.includes("/soc/") || window.location.href.includes("/oldsoc/") || window.location.href.includes("/webreg/")) {
    document.addEventListener('click', function (event) {
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
    if (window.location.href.includes("/soc/") || window.location.href.includes("/webreg/")) {
        instructorElements = subjectElement.querySelectorAll('.instructors');
        searchSubjectText = document.getElementById('subjectTitle2').innerText;
    } else if (window.location.href.includes("/oldsoc/")) {
        instructorElements = subjectElement.querySelectorAll('.instructors');
        searchSubjectText = document.getElementById('subjectTitle').innerText;

    } else if (window.location.href.includes("/csp/")) {

        if (window.location.href.includes("SelectCourseTab")) {
            let subjectDropdown = document.querySelector('#CourseSearchID select:last-of-type');
            searchSubjectText = subjectDropdown.options[subjectDropdown.selectedIndex].text;
            let instructorElems = document.querySelectorAll('td[title="Instructor"]');
            if (subjectElement) {
                let instructorElems = document.querySelectorAll('td[title="Instructor"]');
                instructorElements = Array.from(instructorElems).filter(function (element) {
                    return subjectElement.contains(element);
                });
            } else {
                return;
            }
        } else if (window.location.href.includes("SelectSectionTab")) {
            searchSubjectText = "";
            instructorElements = document.querySelectorAll('td[title="Instructor"]');
        }
    }

    instructorElements.forEach(function (elem) {
        if (elem && !elem.querySelector('.ratingText')) {
            //get course name
            let courseName = "";
            if (window.location.href.includes("/soc/") || window.location.href.includes("/oldsoc/") || window.location.href.includes("/webreg/")) {
                courseName = findParentDiv(elem, "courseData").innerText;
            } else if (window.location.href.includes("/csp/")) {
                if (window.location.href.includes("SelectCourseTab")) {
                    if (subjectElement.querySelector('.title')) {
                        courseName = subjectElement.querySelector('.title').textContent.trim();
                    } else {
                        return;
                    }
                } else if (window.location.href.includes("SelectSectionTab")) {
                    let courseElement = elem.closest('.dijitTitlePane');
                    if (courseElement) {
                        let titleElement = courseElement.querySelector('.title');
                        if (titleElement) {
                            courseName = titleElement.textContent.trim();
                        }
                    } else {
                        return;
                    }
                }
            }

            //add rating elem to each valid instructor element
            let profNames = elem.textContent.trim().split(";");
            if (window.location.href.includes("/csp/")) {
                profNames = elem.textContent.trim().split(",");
                if (profNames.length === 4) {
                    profNames = [profNames[0] + "," + profNames[1], profNames[2] + "," + profNames[3]];
                } else if (profNames.length === 2) {
                    profNames = [profNames[0] + "," + profNames[1]];
                }
            }

            for (let i = 0; i < profNames.length; i++) {
                addRatingBubble(elem, profNames[i], searchSubjectText, courseName, profNames.length);
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


function findParentDiv(element, className) {
    className = className.toLowerCase();
    while (element && element.parentNode) {
        element = element.parentNode;
        if (element.className && element.className.toLowerCase() === className) {
            while (element && element.previousSibling) {
                element = element.previousSibling;
                if (element.className && element.className.toLowerCase() === "metadata hidden") {
                    return element;
                }
            }
        }
    }
    return null;
}


function getRatingColor(rating) {
    let color = "";
    if (rating < 1.0) {
        color = "lightcoral";
    } else if (rating < 2.0) {
        color = "#F8917D"
    } else if (rating < 2.5) {
        color = "lightsalmon";
    } else if (rating < 3.0) {
        color = "#F7C684";
    } else if (rating < 3.5) {
        color = "khaki";
    } else if (rating < 4.0) {
        color = "#baee90";
    } else if (rating < 4.5) {
        color = "#98FB98";
    } else if (rating <= 5.0) {
        color = "#6ad46a";
    }
    return color;
}

function sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
        currentDate = Date.now();
    } while (currentDate - date < milliseconds);
}

function addRatingBubble(instructorElem, profText, searchSubText, course, totalNumProfs) {
    instructorElem.style.marginRight = "13px";
    const ratingElement = document.createElement('div');

    ratingElement.className = 'ratingText';
    ratingElement.id = 'rating';
    ratingElement.textContent = '';
    ratingElement.style.fontSize = '17px';
    ratingElement.style.display = 'inline-block';
    ratingElement.style.padding = '8px';
    ratingElement.style.position = 'relative';
    ratingElement.style.backgroundColor = 'lightgray';
    ratingElement.style.borderRadius = '10px';
    ratingElement.style.marginLeft = "15px";
    ratingElement.style.marginRight = "1px";
    ratingElement.style.fontWeight = "bold";
    ratingElement.style.transition = "box-shadow 0.3s ease, transform 0.1s ease";
    ratingElement.style.cursor = "pointer";

    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulsate {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.8; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pulsating {
          animation: pulsate 2s infinite ease-in-out;
        }
        `;
    document.head.appendChild(style);
    ratingElement.classList.add('pulsating');
    instructorElem.appendChild(ratingElement);

    ratingElement.addEventListener("mousedown", () => {
        ratingElement.style.transform = "translateY(2px)";
    });
    ratingElement.addEventListener("mouseup", () => {
        ratingElement.style.transform = "translateY(-2px)";
    });
    if (window.location.href.includes("/csp/")) {
        ratingElement.style.marginTop = "15px";
        ratingElement.style.marginRight = "7px";
    }

    if (totalNumProfs === 1) {
        ratingElement.style.marginLeft = "6px";
    } else {
        ratingElement.style.marginLeft = "8px";
        ratingElement.style.fontSize = "14px";
    }
    if (instructorElem.textContent.trim().length > 25) {
        ratingElement.style.fontSize = "12px";
    }
    if (instructorElem.textContent.trim().length >= 29) {
        ratingElement.style.fontSize = "10px";
    }
    if (window.location.href.includes("/csp/")) {
        ratingElement.style.marginLeft = "1px";
    }

    const cardProfName = document.createElement("div");
    const cardProfDept = document.createElement("div");
    const cardRatingElem = document.createElement("div");
    const cardReviewsElem = document.createElement("div");
    const reviewsLink = document.createElement("a");
    const cardDifficultyElem = document.createElement("div");
    const cardWTAelem = document.createElement("div");
    const cardInaccuracyWarningBubble = document.createElement("div");
    const warningMessageElem = document.createElement("div");
    const ratingElemWarningBubble = document.createElement("div");
    const searchPopupElem = document.createElement("div");
    const box = document.createElement("div");
    const details = document.createElement("div");
    const popupCard = document.createElement('div');

    popupCard.style.display = "none";
    popupCard.style.backgroundColor = "white";
    popupCard.style.padding = "10px";
    popupCard.style.borderRadius = "10px";
    popupCard.style.whiteSpace = "pre-wrap";
    popupCard.style.zIndex = "100000000";
    popupCard.style.border = "2px solid #d30f32";
    popupCard.style.width = '200px';
    popupCard.style.boxSizing = "border-box";
    popupCard.style.position = 'absolute';

    cardProfName.style.fontSize = "18px";
    cardProfName.style.fontWeight = "bold";
    cardProfName.style.marginBottom = "5px";

    cardProfDept.style.fontSize = "14px";
    cardProfDept.style.color = "#555";
    cardProfDept.style.marginBottom = "10px";

    cardRatingElem.style.borderRadius = "8px";
    cardRatingElem.style.color = "black";
    cardRatingElem.style.fontSize = "14px";
    cardRatingElem.style.padding = "8px";
    cardRatingElem.style.fontWeight = "bold";
    cardRatingElem.style.marginRight = "10px";

    cardReviewsElem.style.fontSize = "14px";
    cardReviewsElem.style.color = "#555";

    cardDifficultyElem.style.marginBottom = "5px";

    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.marginBottom = "10px";

    details.style.marginTop = "10px";
    details.style.fontSize = "14px";
    details.style.color = "#555";

    fetchProfStats(profText, searchSubText + " " + course)
        .then(response => {

            if (!response.data || profText === "") {
                ratingElement.textContent = 'N/A';
            } else if (response.data.numRatings === 0) {
                ratingElement.textContent = 'X.X';
            } else {
                ratingElement.textContent = response.data.avgRating;
            }
            cardRatingElem.textContent = ratingElement.textContent;

            if (ratingElement.textContent.trim() !== "N/A") {
                let ratingNum = parseFloat(ratingElement.textContent);
                let ratingColor = ratingElement.textContent === "X.X" ? "lightgray" : getRatingColor(ratingNum);
                ratingElement.style.backgroundColor = ratingColor;
                cardRatingElem.style.backgroundColor = ratingColor;

                cardProfName.textContent = response.data.firstName + " " + response.data.lastName;
                cardProfDept.textContent = response.data.department;
                reviewsLink.textContent = response.data.numRatings + " review(s)";
                reviewsLink.href = "https://www.ratemyprofessors.com/professor/" + response.data.legacyId;
                reviewsLink.target = "_blank";
                cardDifficultyElem.textContent = "Level Of Difficulty: " + (response.data.numRatings > 0 ? response.data.avgDifficulty : "N/A");
                cardWTAelem.textContent = "Would Take Again: " + (response.data.wouldTakeAgainPercent !== -1 ? String(Math.round((response.data.wouldTakeAgainPercent + Number.EPSILON) * 100) / 100) + "%" : "N/A");

                ratingElement.onclick = function () {
                    window.open(reviewsLink.href, '_blank');
                };

                ratingElement.addEventListener("mouseover", function (event) {
                    if (event.currentTarget === event.target) {
                        if (window.location.href.includes("/csp/")) {
                            document.body.appendChild(popupCard);
                            popupCard.style.display = 'block';
                            let rect = ratingElement.getBoundingClientRect();
                            popupCard.style.left = (rect.left - popupCard.offsetWidth) + 'px';
                            popupCard.style.top = rect.top + 'px';
                        } else {
                            popupCard.style.display = "inline-block";
                            popupCard.style.left = (ratingElement.offsetLeft - popupCard.offsetWidth) + 'px';
                        }
                        ratingElemWarningBubble.style.display = "none";
                        ratingElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
                    }
                });
                ratingElement.addEventListener("mouseleave", () => {
                    popupCard.style.display = "none";
                    ratingElement.style.boxShadow = "none";
                    ratingElemWarningBubble.style.display = "flex";
                });

                popupCard.addEventListener("mouseover", () => {
                    popupCard.style.display = "inline-block";
                    ratingElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
                    ratingElemWarningBubble.style.display = "none";
                });
                popupCard.addEventListener("mouseleave", () => {
                    popupCard.style.display = "none";
                    ratingElement.style.boxShadow = "none";
                    ratingElemWarningBubble.style.display = "flex";
                });


                if (!profText.includes(",")) {         //add warnings if prof first name is unavailable
                    popupCard.appendChild(cardInaccuracyWarningBubble);
                    popupCard.appendChild(warningMessageElem);
                    cardInaccuracyWarningBubble.textContent = "?";
                    warningMessageElem.textContent = "Professor may be inaccurate: only last name provided";

                    cardInaccuracyWarningBubble.addEventListener("mouseover", () => {
                        warningMessageElem.style.display = "block";
                    });
                    cardInaccuracyWarningBubble.addEventListener("mouseleave", () => {
                        warningMessageElem.style.display = "none";
                    });

                    cardInaccuracyWarningBubble.style.position = "absolute";
                    cardInaccuracyWarningBubble.style.top = "-8px";
                    cardInaccuracyWarningBubble.style.right = "-8px";
                    cardInaccuracyWarningBubble.style.right = "185px";
                    cardInaccuracyWarningBubble.style.backgroundColor = "lightgray";
                    cardInaccuracyWarningBubble.style.borderRadius = "50%";
                    cardInaccuracyWarningBubble.style.width = "25px";
                    cardInaccuracyWarningBubble.style.height = "25px";
                    cardInaccuracyWarningBubble.style.display = "flex";
                    cardInaccuracyWarningBubble.style.fontSize = "14px";
                    cardInaccuracyWarningBubble.style.justifyContent = "center";
                    cardInaccuracyWarningBubble.style.alignItems = "center";
                    cardInaccuracyWarningBubble.style.cursor = "pointer";

                    warningMessageElem.style.display = "none";
                    warningMessageElem.style.position = "absolute";
                    warningMessageElem.style.backgroundColor = "lightgray";
                    warningMessageElem.style.fontSize = "12px";
                    warningMessageElem.style.fontWeight = "bold";
                    warningMessageElem.style.padding = "5px";
                    warningMessageElem.style.borderRadius = "5px";
                    warningMessageElem.style.top = "-40px";
                    warningMessageElem.style.right = "7px";
                    warningMessageElem.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.1)";

                    ratingElement.appendChild(ratingElemWarningBubble);
                    ratingElemWarningBubble.textContent = "?";

                    ratingElement.style.position = "relative";
                    ratingElemWarningBubble.style.position = "absolute";
                    ratingElemWarningBubble.style.top = "-11px";
                    ratingElemWarningBubble.style.right = "-10px";
                    ratingElemWarningBubble.style.backgroundColor = "lightgray";
                    ratingElemWarningBubble.style.borderRadius = "50%";
                    ratingElemWarningBubble.style.width = "20px";
                    ratingElemWarningBubble.style.height = "20px";
                    ratingElemWarningBubble.style.display = "flex";
                    ratingElemWarningBubble.style.fontSize = "10px";
                    ratingElemWarningBubble.style.justifyContent = "center";
                    ratingElemWarningBubble.style.alignItems = "center";
                }
            } else if (ratingElement.textContent === "N/A") {
                ratingElement.appendChild(searchPopupElem);
                searchPopupElem.textContent = "Click to search";
                searchPopupElem.style.display = "none";
                searchPopupElem.style.position = "absolute";
                searchPopupElem.style.backgroundColor = "lightgray";
                searchPopupElem.style.fontSize = "12px";
                searchPopupElem.style.padding = "5px";
                searchPopupElem.style.borderRadius = "5px";
                searchPopupElem.style.top = "-25px";
                searchPopupElem.style.right = "30px";
                searchPopupElem.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.1)";

                if (profText === "") {
                    ratingElement.onclick = function () {
                        window.open("https://www.google.com/search?q=🗿", '_blank');
                    };
                } else {
                    ratingElement.onclick = function () {
                        window.open("https://www.google.com/search?q=" + profText + "+rutgers+rate+my+professor", '_blank');
                    };
                }
                ratingElement.addEventListener("mouseover", () => {
                    ratingElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
                    searchPopupElem.style.display = "block";
                });
                ratingElement.addEventListener("mouseleave", () => {
                    ratingElement.style.boxShadow = "none";
                    searchPopupElem.style.display = "none";
                });
            }
        })
        .catch(error => {
            console.error("Error occurred while fetching professor stats: ", error);
            ratingElement.textContent = 'Error';
        })
        .finally(() => {
            ratingElement.classList.remove('pulsating');
        });

    instructorElem.appendChild(popupCard);
    popupCard.appendChild(cardProfName);
    popupCard.appendChild(cardProfDept);
    popupCard.appendChild(box);
    box.appendChild(cardRatingElem);
    box.appendChild(cardReviewsElem);
    cardReviewsElem.appendChild(reviewsLink);
    popupCard.appendChild(details);
    details.appendChild(cardDifficultyElem);
    details.appendChild(cardWTAelem);
}
