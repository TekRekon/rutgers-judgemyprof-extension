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
            const ratingElement = document.createElement('div');
            ratingElement.className = 'ratingText';
            ratingElement.id = 'rating';
            ratingElement.textContent = 'Loading...';
            ratingElement.style.fontSize = '17px';
            ratingElement.style.display = 'inline-block';
            ratingElement.style.padding = '8px';
            ratingElement.style.position = 'relative';
            ratingElement.style.backgroundColor = 'lightgray';
            ratingElement.style.borderRadius = '10px';
            ratingElement.style.marginLeft = "30px";
            ratingElement.style.marginRight = "1px";
            ratingElement.style.fontWeight = "bold";
            const profName = document.createElement("div");
            const dept = document.createElement("div");
            const rating = document.createElement("div");
            const reviews = document.createElement("div");
            const reviewsLink = document.createElement("a");
            const difficulty = document.createElement("div");
            const wta = document.createElement("div");
            const warningBubble = document.createElement("div");
            const warning = document.createElement("div");

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
                        rating.style.padding = "8px";
                        rating.style.fontWeight = "bold";
                        rating.style.marginRight = "10px";
                        const numReviews = response.data.numRatings;
                        // reviews.textContent = numReviews + " review(s)";
                        reviews.style.fontSize = "14px";
                        reviews.style.color = "#555";
                        reviewsLink.textContent = numReviews + " review(s)";
                        reviewsLink.href = getRMPLink(response.data.legacyId);
                        reviewsLink.target = "_blank";
                        const diff = response.data.avgDifficulty;
                        difficulty.textContent = "Level Of Difficulty: " + diff;
                        difficulty.style.marginBottom = "5px";
                        var takeAgain = "";
                        var tap = response.data.wouldTakeAgainPercent;
                        if (tap == -1) {
                            takeAgain = "N/A";
                            wta.textContent = "Would Take Again: " + takeAgain;
                        } else {
                            takeAgain = String(Math.round((tap + Number.EPSILON) * 100) / 100);
                            wta.textContent = "Would Take Again: " + takeAgain + "%";
                        }
                        const link = getRMPLink(response.data.legacyId);
                        ratingElement.onclick = function () {
                            window.open(link, '_blank');
                        };
                        ratingElement.style.transition = "box-shadow 0.3s ease, transform 0.1s ease";
                        ratingElement.style.cursor = "pointer";
                        const ratingContent = ratingElement.textContent;
                        ratingElement.addEventListener("mouseover", () => {
                            ratingCard.style.display = "inline-block";
                            ratingElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
                            ratingElement.style.padding = "10px";
                        });
                        ratingElement.addEventListener("mouseleave", () => {
                            ratingCard.style.display = "none";
                            ratingElement.textContent = ratingContent;
                            ratingElement.style.boxShadow = "none";
                            ratingElement.style.padding = "8px";
                        });
                        ratingElement.addEventListener("mousedown", () => {
                            ratingElement.style.transform = "translateY(2px)";
                        });
                        ratingElement.addEventListener("mouseup", () => {
                            ratingElement.style.transform = "translateY(-2px)";
                        });
                        ratingCard.addEventListener("mouseover", () => {
                            ratingCard.style.display = "inline-block";
                            ratingElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
                            ratingElement.style.padding = "10px";
                        });
                        ratingCard.addEventListener("mouseleave", () => {
                            ratingCard.style.display = "none";
                        });
                        if (!prof.includes(",")) {
                            ratingElement.appendChild(warningBubble);
                            ratingElement.appendChild(warning);
                            warningBubble.textContent = "?";
                            warningBubble.style.position = "absolute";
                            warningBubble.style.top = "-8px";
                            warningBubble.style.right = "-8px";
                            warningBubble.style.backgroundColor = "lightgray";
                            warningBubble.style.borderRadius = "50%";
                            warningBubble.style.width = "15px";
                            warningBubble.style.height = "15px";
                            warningBubble.style.display = "flex";
                            warningBubble.style.fontSize = "12px";
                            warningBubble.style.justifyContent = "center";
                            warningBubble.style.alignItems = "center";
                            warningBubble.style.cursor = "pointer";
                            warning.textContent = "Professor may be inaccurate as only last name is available";
                            warning.style.display = "none";
                            warning.style.position = "absolute";
                            warning.style.backgroundColor = "lightgray";
                            warning.style.fontSize = "10px";
                            warning.style.padding = "10px";
                            warning.style.borderRadius = "5px";
                            warning.style.top = "-30px";
                            warning.style.right = "30px";
                            warning.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.1)";
                            warningBubble.addEventListener("mouseover", () => {
                                warning.style.display = "block";
                            });
                            warningBubble.addEventListener("mouseleave", () => {
                                warning.style.display = "none";
                            });
                        }
                    }
                    if (ratingElement.textContent == "N/A") {
                        if (prof == "") {
                            const link = "https://www.google.com/search?q=+bro+really+thought+there+was+a+professor+named+__+🗿💀";
                            ratingElement.onclick = function () {
                                window.open(link, '_blank');
                            };
                        } else {
                            const link = "https://www.google.com/search?q=" + prof + "+rutgers+rate+my+professor";
                            ratingElement.onclick = function () {
                                window.open(link, '_blank');
                            };
                        }
                        ratingElement.style.transition = "box-shadow 0.3s ease, transform 0.1s ease";
                        ratingElement.style.cursor = "pointer";
                        ratingElement.addEventListener("mouseover", () => {
                            ratingElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
                            ratingElement.style.padding = "10px";
                        });
                        ratingElement.addEventListener("mouseleave", () => {
                            ratingElement.style.boxShadow = "none";
                            ratingElement.style.padding = "8px";
                        });
                        ratingElement.addEventListener("mousedown", () => {
                            ratingElement.style.transform = "translateY(2px)";
                        });
                        ratingElement.addEventListener("mouseup", () => {
                            ratingElement.style.transform = "translateY(-2px)";
                        });

                    }
                })
                .catch(error => {
                    console.error("Error occurred while fetching professor stats: ", error);
                    ratingElement.textContent = 'N/A';
                });
            // Append the new rating text element next to the instructor's name
            elem.appendChild(ratingElement);
            const ratingCard = document.createElement('div');
            ratingCard.style.display = "none";
            ratingCard.style.backgroundColor = "white";
            ratingCard.style.padding = "10px";
            ratingCard.style.borderRadius = "10px";
            ratingCard.style.zIndex = "1";
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
            reviews.appendChild(reviewsLink);
            const details = document.createElement("div");
            details.style.marginTop = "10px";
            details.style.fontSize = "14px";
            details.style.color = "#555";
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
