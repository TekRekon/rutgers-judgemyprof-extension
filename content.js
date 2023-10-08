
function runCode() {
    instructors = document.getElementsByClassName("instructors");
    for (let i = 0; i < instructors.length; i++) {
        const textElement = document.createElement("span");
        textElement.id = "professorRatingElement";
        textElement.textContent = "SampleText";
        instructors[i].style.marginRight = "-80px";

        // Insert the new text element after the current instructor element
        instructors[i].insertAdjacentElement("afterend", textElement);
    }
}

if (window.location.href.includes('/soc')) {
    //check if professor ratings are propagated, otherwise propagate the values
    function checkForElement() {
        const element = document.getElementById("professorRatingElement");

        if (element) {
            //pass
        } else {
            runCode();
        }
    }
    const interval = setInterval(checkForElement, 5000); // Check every 5 second
}
