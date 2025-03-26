const currentPage = window.location.href;
const isCSP = currentPage.includes("/csp/");
const isSOC = currentPage.includes("/soc/");
const isOldSOC = currentPage.includes("/oldsoc/");
const isWebReg = currentPage.includes("/webreg/");


if (isCSP) {
    //when user clicks a tab within csp/page loads
    window.addEventListener('popstate', function (event) {
        addRatingToInstructorElements(null);
        addWebregLinkToIndexElements(null);
    });

    document.addEventListener('click', function (event) {
        //when user clicks on a course dropdown
        if (event.target.closest('.dijitTitlePane')) {
            addRatingToInstructorElements(event.target.closest('.dijitTitlePane'));
            addWebregLinkToIndexElements(event.target.closest('.dijitTitlePane'));  
        }
        //if next/prev button is clicked in the build schedule tab
        if (event.target.closest('#dijit_form_Button_3') || event.target.closest('#dijit_form_Button_2')) {
            addRatingToInstructorElements(null);
            addWebregLinkToIndexElements(null);
        }
        //if remove button clicked in saved schedule tab
        if (event.target.closest('tbody[dojoattachpoint="scheduleList"] .remove')) {
            addRatingToInstructorElements(null);
            addWebregLinkToIndexElements(null);
        }
        //if a schedule is clicked in the saved schedule tab
        if (event.target.closest('tbody[dojoattachpoint="scheduleList"] a[dojoattachpoint="scheduleName"]')) {
            addRatingToInstructorElements(null);
            addWebregLinkToIndexElements(null);
        }
        //if the user clicks on the list view link in the saved schedule tab or build schedule tab
        if (event.target.closest('.list-view-link')) {
            addRatingToInstructorElements(null);
            addWebregLinkToIndexElements(null);
        }
    });
} else if (isSOC || isOldSOC || isWebReg) {
    //when user clicks on a course dropdown
    document.addEventListener('click', function (event) {
        let dropdownElem = event.target.closest('.subject');
        if (dropdownElem) {
            addRatingToInstructorElements(dropdownElem);
            addWebregLinkToIndexElements(dropdownElem);
        }
    });
}


/**
 * Asynchronously adds ratings to instructor elements
 *
 * @param {HTMLElement} elementWithCourseName - Optionally null. The element containing the course name.
 */
async function addRatingToInstructorElements(elementWithCourseName) {
    try {
        const instructorElements = extractInstructorElements(elementWithCourseName);
        const subjectName = extractSubjectName();
        //instead of using a for loop, we use Promise.all to rate all instructor elements concurrently
        const promises = instructorElements.map(instructorElement => rateInstructorElement(instructorElement, subjectName, elementWithCourseName));
        await Promise.all(promises);
    }
    catch (error) {
        console.error(error);
    }
}

/**
 * Asynchronously adds a webreg link to index elements
 *
 * @param {HTMLElement} elementWithCourseName - Optionally null. The element containing the course name.
 */
async function addWebregLinkToIndexElements(elementWithCourseName) {
    try {
        const indexElements = extractIndexElements(elementWithCourseName);
        //instead of using a for loop, we use Promise.all to and all webreg links to index elements concurrently
        const promises = indexElements.map((indexElement) =>
            addWebregLinkToIndexElement(indexElement)
        );
        await Promise.all(promises);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Rates an instructor element, adding rating bubbles for each possible professor.
 *
 * @param {Element} instructorElement - The DOM element associated with the instructor.
 * @param {string} subjectName - The name of the subject.
 * @param {Element} elementWithCourseName - Optionally null. The DOM element containing the course name.
 */
async function rateInstructorElement(instructorElement, subjectName, elementWithCourseName) {
    const courseName = extractCourseName(instructorElement, elementWithCourseName);
    const instructorNames = extractInstructorNames(instructorElement);
    let matchText = courseName + " " + subjectName;
    //replace all non-alphabetic characters with a space
    matchText = matchText.replace(/[+0-9()]/g, "").replace(/[^a-zA-Z ]/g, "");
    //replace all multiple spaces with a single space
    matchText = matchText.replace(/\s+/g, ' ').trim();
    instructorElement.style.marginRight = "13px";

    if (isCSP && !instructorElement.querySelector('.jmp-rating-bubble')) {
        //on CSP, any name can be either a first or last name. Attempt combination, otherwise use the name as is
        let initializedBubbles = new Set();

        for (let i = 0; i < instructorNames.length; i++) {
            let currProfSearch = instructorNames[i];
            if (((i + 1) < instructorNames.length) && (instructorNames[i] !== instructorNames[i + 1])) {
                currProfSearch = instructorNames[i] + " " + instructorNames[i + 1];
            }
            if (initializedBubbles.has(currProfSearch)) {
                continue;
            }
            if ((i + 1) < instructorNames.length) {
                initializedBubbles.add(instructorNames[i] + " " + instructorNames[i + 1]);
                initializedBubbles.add(instructorNames[i + 1] + " " + instructorNames[i]);
            }
            initializedBubbles.add(instructorNames[i]);
            let ratingBubbleElem = initializeLoadingBubble(instructorElement);
            let response = null;
            try {
                response = await fetchProfStats(currProfSearch, matchText);
            } catch (error) {
                convertToErrorBubble(ratingBubbleElem, error);
                continue;
            }

            //if both names given and data is available or only last name given with data available or unavailable
            if ((response && response.data) || !currProfSearch.includes(" ") || instructorNames.length % 2 === 0) {
                if (currProfSearch.includes(" ")) {
                    initializedBubbles.add(instructorNames[i + 1]);
                }
                populateRatingBubble(instructorElement, ratingBubbleElem, response, currProfSearch);
                ratingBubbleElem.classList.remove('pulsating');
                i += 1;
            }
            //if both names given and data is unavailable
            else {
                try {
                    response = await fetchProfStats(instructorNames[i], matchText);
                    populateRatingBubble(instructorElement, ratingBubbleElem, response, currProfSearch);
                    ratingBubbleElem.classList.remove('pulsating');
                } catch (error) {
                    convertToErrorBubble(ratingBubbleElem, error);
                }
            }
        }
    } else if (isSOC || isOldSOC || isWebReg) {
        let initializedBubbles = new Set();
        for (const instructorName of instructorNames) {
            if (initializedBubbles.has(instructorName)) {
                continue;
            }
            initializedBubbles.add(instructorName);
            let ratingBubbleElem = initializeLoadingBubble(instructorElement);
            fetchProfStats(instructorName, matchText)
                .then(response => {
                    populateRatingBubble(instructorElement, ratingBubbleElem, response, instructorName);
                    ratingBubbleElem.classList.remove('pulsating');
                })
                .catch(error => {
                    convertToErrorBubble(ratingBubbleElem, error);
                });
        }
    }
}

/**
 * Adds a webreg link to an index element
 *
 * @param {Element} indexElement - The DOM element associated with the index.
 */
async function addWebregLinkToIndexElement(indexElement) {
    //get the year and season from the yearTermElement
    const yearTermElement = document.querySelector('span[name="YearTerm"]').textContent;
    const season = yearTermElement.split(' ')[0];
    const numericSeason = getNumericSeason(season);
    const year = yearTermElement.split(' ')[1];
    const index = indexElement.textContent;
    //display the index element as a flex container
    indexElement.style.display = 'flex';
    indexElement.style.flexDirection = 'column';
    indexElement.style.justifyContent = 'center';
    indexElement.style.alignItems = 'center';
    indexElement.style.flex = '1';
    indexElement.style.height = '100%';
    // Create a bubble-style webreg link
    const webregBubble = document.createElement('div');
    webregBubble.classList.add('jmp-webreg-bubble');
    webregBubble.textContent = 'WebReg';
    // Create the popup that appears on hover
    const clickToRegisterPopup = document.createElement('div');
    clickToRegisterPopup.className = 'jmp-click-to-register-popup';
    clickToRegisterPopup.textContent = 'Click to register for index ' + index;
    clickToRegisterPopup.style.display = 'none';
    clickToRegisterPopup.style.maxWidth = `${window.innerWidth * 0.65}px`;
    // Add the popup to the bubble
    webregBubble.appendChild(clickToRegisterPopup);
    // Add hover effects
    webregBubble.addEventListener('mouseover', () => {
        webregBubble.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        clickToRegisterPopup.style.display = 'block';
    });    
    webregBubble.addEventListener('mouseleave', () => {
        webregBubble.style.boxShadow = 'none';
        clickToRegisterPopup.style.display = 'none';
    });    
    // Add press effects
    webregBubble.addEventListener('mousedown', () => {
        webregBubble.style.transform = 'translateY(2px)';
    });
    webregBubble.addEventListener('mouseup', () => {
        webregBubble.style.transform = 'translateY(-2px)';
    });    
    // Add click handler to open WebReg
    webregBubble.onclick = function() {
        window.open(`http://sims.rutgers.edu/webreg/editSchedule.htm?login=cas&semesterSelection=${numericSeason}${year}&indexList=${index}`, '_blank',
          'noopener,noreferrer');
    };    
    // Add the bubble to the index element
    indexElement.appendChild(webregBubble);
}
  
  /**
   * Converts a season string to a numeric value
   *
   * @param {string} season - The season to convert
   * @returns {number} The numeric value of the season
   */
function getNumericSeason(season) {
    const seasonMap = {
        Spring: 1,
        Summer: 7,
        Fall: 9,
        Winter: 12,
    };
    return seasonMap[season];
}

/**
 * Extracts and filters instructor-related DOM elements based on the website.
 * Uses the elementWithCourseName parameter to filter out instructor elements not associated with the current selected
 * course. If null, attempts to extract all instructor elements on the page, then filter them.
 *
 * @param {Element} elementWithCourseName - Optionally null. DOM element containing course information.
 * @returns {Element[]} Array of DOM elements representing instructors, post-filtering.
 */
function extractInstructorElements(elementWithCourseName) {
    let unfilteredInstructorElements = [];
    if (isSOC || isWebReg || isOldSOC) {
        unfilteredInstructorElements = elementWithCourseName.querySelectorAll('.instructors');
    } else if (isCSP) {
        unfilteredInstructorElements = document.querySelectorAll('td[title="Instructor"]');
        //filter out selected instructor elements not from the current dropdown if a dropdown was clicked
        if (elementWithCourseName) {
            unfilteredInstructorElements = Array.from(unfilteredInstructorElements).filter(function (instructorElement) {
                return elementWithCourseName.contains(instructorElement);
            });
        }
    }
    //filter out instructor elements that are empty or already have a rating bubble
    let filteredInstructorElements = Array.from(unfilteredInstructorElements).filter(function (instructorElement) {
        return instructorElement && !instructorElement.querySelector('.jmp-rating-bubble');
    });
    return filteredInstructorElements;
}

/**
 * Extracts and filters index-related DOM elements in CSP.
 * Uses the elementWithCourseName parameter to filter out index elements not associated with the current selected
 * course. If null, attempts to extract all index elements on the page, then filter them.
 *
 * @param {Element} elementWithCourseName - Optionally null. DOM element containing course information.
 * @returns {Element[]} Array of DOM elements representing indexes, post-filtering.
 */
function extractIndexElements(elementWithCourseName) {
    let unfilteredIndexElements = [];
    if (isCSP) {
        //unfiltered index elements
        unfilteredIndexElements = document.querySelectorAll(
            'td[title="Index Number"]'
        );
        //filter out selected index elements not from the current dropdown if a dropdown was clicked
        if (elementWithCourseName) {
            unfilteredIndexElements = Array.from(unfilteredIndexElements).filter(
            function (indexElement) {
                return elementWithCourseName.contains(indexElement);
            }
        );
      }
    }
    //filter out index elements that are empty or already have a webreg bubble
    let filteredIndexElements = Array.from(unfilteredIndexElements).filter(
        function (indexElement) {
            return indexElement && !indexElement.querySelector('.jmp-webreg-bubble');
        }
    );
    return filteredIndexElements;
}
  

/**
 * Extracts the subject name from the current page based on the context (SOC, WebReg, old SOC, or CSP).
 */
function extractSubjectName() {
    let subjectName = "";
    if (isSOC || isWebReg) {
        subjectName = document.getElementById('subjectTitle2').innerText;
    } else if (isOldSOC) {
        subjectName = document.getElementById('subjectTitle').innerText;
    } else if (isCSP) {
        //only the select course tab can give us the subject through the subject dropdown
        if (window.location.href.includes("SelectCourseTab")) {
            let subjectDropdown = document.querySelector('#CourseSearchID select:last-of-type');
            subjectName = subjectDropdown.options[subjectDropdown.selectedIndex].text;
            //if the user has not selected a subject yet
            if (subjectName.includes("Select a Subject")) {
                subjectName = "";
            }
        }
    }
    return subjectName.trim();
}


/**
 * Extracts and returns the course name from a given instructor element, accounting for different page structures.
 *
 * @param {HTMLElement} instructorElement - The element associated with the course instructor.
 * @param {HTMLElement} elementWithCourseName - Optionally null. The element containing the course's name.
 * @return {string} The extracted course name, or an empty string if not found.
 */
function extractCourseName(instructorElement, elementWithCourseName) {
    if (isSOC || isOldSOC || isWebReg) {
        let parentDiv = findParentDiv(instructorElement, "courseData")
        if (parentDiv) {
            return parentDiv.textContent.trim();
        }
    } else if (isCSP) {
        //caution: CSP loads instructor elements across all in-site tabs on page load under the SelectCourseTab url,
        //so avoid logic that assumes the current tab is anything other than SelectCourseTab
        if (window.location.href.includes("SelectCourseTab")) {
            if (elementWithCourseName && elementWithCourseName.querySelector('.title')) {
                return elementWithCourseName.querySelector('.title').textContent.trim();
            }
        }

        //select course tab logic
        let courseElement = instructorElement.closest('.dijitTitlePane');
        if (courseElement) {
            let titleElement = courseElement.querySelector('.title');
            if (titleElement) {
                return titleElement.textContent.trim();
            }
        }

        //build schedule/saved schedule tab logic
        let parentRow = instructorElement.parentElement;
        if (parentRow) {
            let courseTitleElement = parentRow.querySelector('.course-title');
            if (courseTitleElement) {
                return courseTitleElement.textContent.trim();
            }
        }
    }
    return "";
}


/**
 * Extracts instructor names from the instructor element
 * If the current page is CSP, the instructor names are formatted as "last, first, last, etc" (they are random).
 * If the current page is not CSP, the instructor names are formatted as "fullProfName; fullProfName".
 *
 * @param {HTMLElement} instructorElement - The instructor element to extract names from.
 */
function extractInstructorNames(instructorElement) {
    let instructorNames = [];
    if (isSOC || isOldSOC || isWebReg) {
        instructorNames = instructorElement.textContent.trim().split(";").map(name => name.trim());
        for (let i = 0; i < instructorNames.length; i++) {
            let currLastFirst = instructorNames[i].split(",").map(name => name.trim());
            for (let j = 0; j < currLastFirst.length; j++) {
                if (currLastFirst[j].includes(" ")) { //has middle initial
                    currLastFirst[j] = currLastFirst[j].split(" ")[1].trim();
                }
            }
            instructorNames[i] = currLastFirst.join(" ");
        }
    } else if (isCSP) {
        instructorNames = instructorElement.textContent.trim().split(",").map(name => name.trim());
        for (let i = 0; i < instructorNames.length; i++) {
            if (instructorNames[i].includes(" ")) { //has middle initial
                instructorNames[i] = instructorNames[i].split(" ")[1].trim();
            }
        }
    }
    return instructorNames;
}


/**
 * Initializes and appends a pulsating loading bubble to a specified element.
 *
 * @param {HTMLElement} instructorElement - The element to append the loading bubble to.
 * @returns {HTMLElement} The created loading bubble element.
 */
function initializeLoadingBubble(instructorElement) {
    let ratingBubble = document.createElement('div');
    ratingBubble.className = 'jmp-rating-bubble';
    ratingBubble.textContent = '';
    if (isCSP) {
        ratingBubble.style.fontSize = "12px";
    }
    else {
        ratingBubble.style.fontSize = `${getDynamicFontSize(instructorElement.textContent)}px`;
    }

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
    ratingBubble.classList.add('pulsating');

    ratingBubble.addEventListener("mousedown", () => {
        ratingBubble.style.transform = "translateY(2px)";
    });
    ratingBubble.addEventListener("mouseup", () => {
        ratingBubble.style.transform = "translateY(-2px)";
    });

    instructorElement.appendChild(ratingBubble);
    return ratingBubble;
}


/**
 * Converts a rating bubble element to display an error message and details on interaction.
 *
 * @param {HTMLElement} ratingBubbleElem - The element to convert into an error display.
 * @param {Error} error - The error to display details for.
 */
function convertToErrorBubble(ratingBubbleElem, error) {
    const errorMsgPopupElem = document.createElement("div");
    errorMsgPopupElem.className = "jmp-error-msg-popup";
    errorMsgPopupElem.textContent = error.message;
    errorMsgPopupElem.style.maxWidth = `${window.innerWidth * 0.65}px`;
    ratingBubbleElem.textContent = "Error";
    ratingBubbleElem.style.backgroundColor = "lightgray";
    ratingBubbleElem.appendChild(errorMsgPopupElem);

    ratingBubbleElem.addEventListener("mouseover", () => {
        ratingBubbleElem.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        errorMsgPopupElem.style.display = "block";
    });
    ratingBubbleElem.addEventListener("mouseleave", () => {
        ratingBubbleElem.style.boxShadow = "none";
        errorMsgPopupElem.style.display = "none";
    });

    ratingBubbleElem.onclick = function () {
        let htmlContent = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Error Stack</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        pre {
                            background-color: #f4f4f4;
                            padding: 10px;
                            border-radius: 5px;
                            white-space: pre-wrap; 
                            word-wrap: break-word;
                            overflow-wrap: break-word; 
                        }
                    </style>
                </head>
                <body>
                    <h2>Error Stack: </h2>
                    <h4> (Try clearing extension cache to resolve any problems by clicking on the extension's icon) </h4>
                    <h4> (Please email persistent errors to techideas4me@gmail.com or raise an issue on GitHub) </h4>
                    <pre>${error.stack}</pre>
               
                </body>
                </html>
            `;
        let blob = new Blob([htmlContent], {type: 'text/html'});
        let url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };
    ratingBubbleElem.classList.remove('pulsating');
}


/**
 * Populates a rating bubble element with instructor rating information.
 *
 * @param {HTMLElement} instructorElem - The parent instructor element of the given rating bubble.
 * @param {HTMLElement} ratingBubbleElem - The rating bubble element to populate.
 * @param {Object} response - The response object containing instructor rating data.
 * @param {string} profText - The text used to identify the professor.
 */
function populateRatingBubble(instructorElem, ratingBubbleElem, response, profText) {
    const cardProfName = document.createElement("div");
    const cardProfDept = document.createElement("div");
    const cardRatingElem = document.createElement("div");
    const cardReviewsElem = document.createElement("div");
    const reviewsLink = document.createElement("a");
    const cardDifficultyElem = document.createElement("div");
    const cardWouldTakeAgainElem = document.createElement("div");
    const cardWarningBubbleElem = document.createElement("div");
    const cardWarningMessagePopupElem = document.createElement("div");
    const ratingBubbleWarningBubbleElem = document.createElement("div");
    const clickToSearchPopupElem = document.createElement("div");
    const box = document.createElement("div");
    const details = document.createElement("div");
    const popupCard = document.createElement('div');

    popupCard.className = "jmp-popup-card";
    cardProfName.className = "jmp-card-prof-name";
    cardProfDept.className = "jmp-card-prof-dept";
    cardRatingElem.className = "jmp-card-rating-elem";
    cardReviewsElem.className = "jmp-card-reviews-elem";
    cardDifficultyElem.className = "jmp-card-difficulty-elem";
    cardWouldTakeAgainElem.className = "jmp-card-would-take-again-elem";
    cardWarningBubbleElem.className = "jmp-card-warning-bubble";
    cardWarningMessagePopupElem.className = "jmp-card-warning-message-popup";
    ratingBubbleWarningBubbleElem.className = "jmp-rating-bubble-warning-bubble";
    clickToSearchPopupElem.className = "jmp-click-to-search-popup";
    box.className = "jmp-box";
    details.className = "jmp-details";

    if (!response || !response.data || profText === "") {
        ratingBubbleElem.textContent = 'N/A';
    } else if (response.data.numRatings === 0) {
        ratingBubbleElem.textContent = 'X.X';
    } else {
        ratingBubbleElem.textContent = response.data.avgRating.toFixed(1);
    }
    cardRatingElem.textContent = ratingBubbleElem.textContent;

    if (ratingBubbleElem.textContent.trim() !== "N/A") {
        let ratingNum = parseFloat(ratingBubbleElem.textContent);
        let ratingColor = ratingBubbleElem.textContent === "X.X" ? "lightgray" : getRatingColor(ratingNum);
        ratingBubbleElem.style.backgroundColor = ratingColor;
        cardRatingElem.style.backgroundColor = ratingColor;

        cardProfName.textContent = response.data.firstName + " " + response.data.lastName;
        cardProfDept.textContent = response.data.department;
        reviewsLink.textContent = response.data.numRatings + " review(s)";
        reviewsLink.href = "https://www.ratemyprofessors.com/professor/" + response.data.legacyId;
        reviewsLink.target = "_blank";
        cardDifficultyElem.textContent = "Level Of Difficulty: " + (response.data.numRatings > 0 ? response.data.avgDifficulty : "N/A");
        cardWouldTakeAgainElem.textContent = "Would Take Again: " + (response.data.wouldTakeAgainPercent !== -1 ? String(Math.round((response.data.wouldTakeAgainPercent + Number.EPSILON) * 100) / 100) + "%" : "N/A");

        ratingBubbleElem.onclick = function () {
            window.open(reviewsLink.href, '_blank');
        };

        //rating bubble onHover listeners to display popup card
        ratingBubbleElem.addEventListener("mouseover", function (event) {
            if (event.currentTarget === event.target) {
                if (window.location.href.includes("/csp/")) {
                    document.body.appendChild(popupCard);
                    popupCard.style.display = 'block';
                    let rect = ratingBubbleElem.getBoundingClientRect();
                    popupCard.style.left = (rect.left - popupCard.offsetWidth) + 'px';
                    popupCard.style.top = rect.top + 'px';
                } else {
                    popupCard.style.display = "inline-block";
                    popupCard.style.left = (ratingBubbleElem.offsetLeft - popupCard.offsetWidth) + 'px';
                }
                ratingBubbleWarningBubbleElem.style.display = "none";
                ratingBubbleElem.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
            }
        });
        ratingBubbleElem.addEventListener("mouseleave", () => {
            popupCard.style.display = "none";
            ratingBubbleElem.style.boxShadow = "none";
            ratingBubbleWarningBubbleElem.style.display = "flex";
        });

        //popup card onHover listeners
        popupCard.addEventListener("mouseover", () => {
            popupCard.style.display = "inline-block";
            ratingBubbleElem.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
            ratingBubbleWarningBubbleElem.style.display = "none";
        });
        popupCard.addEventListener("mouseleave", () => {
            popupCard.style.display = "none";
            ratingBubbleElem.style.boxShadow = "none";
            ratingBubbleWarningBubbleElem.style.display = "flex";
        });

        if (!profText.includes(" ")) {  //add bubble/card warnings if prof first name is unavailable
            popupCard.appendChild(cardWarningBubbleElem);
            popupCard.appendChild(cardWarningMessagePopupElem);
            cardWarningBubbleElem.textContent = "?";
            cardWarningMessagePopupElem.textContent = "Professor may be inaccurate: only last name provided";

            cardWarningBubbleElem.addEventListener("mouseover", () => {
                cardWarningMessagePopupElem.style.display = "block";
            });
            cardWarningBubbleElem.addEventListener("mouseleave", () => {
                cardWarningMessagePopupElem.style.display = "none";
            });

            ratingBubbleElem.appendChild(ratingBubbleWarningBubbleElem);
            ratingBubbleWarningBubbleElem.textContent = "?";
            ratingBubbleElem.style.position = "relative";
        }
    } else if (ratingBubbleElem.textContent === "N/A") {
        //if no data available, add a click to search popup
        ratingBubbleElem.appendChild(clickToSearchPopupElem);
        //remove whitespace around proftext
        profText = profText.trim();
        clickToSearchPopupElem.textContent = "Search for " + profText;
        if (profText.length === 0) {
            clickToSearchPopupElem.textContent = "Click to search";
        }
        clickToSearchPopupElem.style.maxWidth = `${window.innerWidth * 0.65}px`;

        if (profText === "") {
            ratingBubbleElem.onclick = function () {
                window.open("https://www.google.com/search?q=🗿", '_blank');
            };
        } else {
            ratingBubbleElem.onclick = function () {
                window.open("https://www.google.com/search?q=" + profText + "+rutgers+rate+my+professor", '_blank');
            };
        }
        ratingBubbleElem.addEventListener("mouseover", () => {
            ratingBubbleElem.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
            clickToSearchPopupElem.style.display = "block";
        });
        ratingBubbleElem.addEventListener("mouseleave", () => {
            ratingBubbleElem.style.boxShadow = "none";
            clickToSearchPopupElem.style.display = "none";
        });
    }
    instructorElem.appendChild(popupCard);
    popupCard.appendChild(cardProfName);
    popupCard.appendChild(cardProfDept);
    popupCard.appendChild(box);
    box.appendChild(cardRatingElem);
    box.appendChild(cardReviewsElem);
    cardReviewsElem.appendChild(reviewsLink);
    popupCard.appendChild(details);
    details.appendChild(cardDifficultyElem);
    details.appendChild(cardWouldTakeAgainElem);
}


/**
 * Asynchronously fetches data for a specified professor with filtered results based on a match text.
 *
 * @param {string} profName The name of the professor.
 * @param {string} matchText The text to match to the professor's department for filtering results.
 * @returns {Promise<Object>} A promise that resolves with the fetched data or rejects with an error.
 */
async function fetchProfStats(profName, matchText) {
    return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'fetchProfStats',
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


/**
 * Finds the first parent div of a given element with a specific class name and then searches for a preceding sibling
 * with the class name "metadata hidden". Returns the found sibling or null if not found.
 * Used to find the element with the course name in SOC, WebReg, and OldSOC
 *
 * @param {HTMLElement} element - The starting element to search from.
 * @param {string} className - The class name to match for the parent div.
 * @returns {HTMLElement|null} The preceding sibling with class "metadata hidden" or null if not found.
 */
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


/**
 * Calculates a dynamic font size based on the length of the given text.
 * The font size decreases with longer text lengths to accommodate more content.
 *
 * @param {string} text - The text for which to calculate the font size.
 * @param {number} [baseSize=17] - The base font size to start from.
 * @param {number} [stepSize=6] - The amount by which to decrease the font size for each step over the threshold.
 * @param {number} [stepThreshold=12] - The text length threshold at which to start decreasing the font size.
 * @returns {number} The calculated font size, with a minimum value of 10.
 */
function getDynamicFontSize(text, baseSize = 17, stepSize = 6, stepThreshold = 12) {
    const length = text.length;
    let fontSize = baseSize;
    if (length > stepThreshold) {
        const stepsOverThreshold = Math.floor((length - stepThreshold) / stepThreshold);
        fontSize -= stepsOverThreshold * stepSize;
    }
    fontSize = Math.max(fontSize, 10);
    return fontSize;
}


/**
 * Returns the color code associated with a specific rating.
 *
 * @param {number} rating - The rating value to evaluate.
 * @returns {string} The hex code or name of the color corresponding to the rating, defaults to "lightgray" if no match found.
 */
function getRatingColor(rating) {
    const ratingColors = [
        {max: 1.0, color: "lightcoral"},
        {max: 2.0, color: "#F8917D"},
        {max: 2.5, color: "lightsalmon"},
        {max: 3.0, color: "#F7C684"},
        {max: 3.5, color: "khaki"},
        {max: 4.0, color: "#baee90"},
        {max: 4.5, color: "#98FB98"},
        {max: 5.0, color: "#6ad46a"}
    ];
    return ratingColors.find(rc => rating <= rc.max)?.color || "lightgray"; //Default to lightgray if no match
}