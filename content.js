
//Inserts professor ratings into WebReg
function runCode() {

    const instructorColumnHeaders = document.getElementsByClassName("instructorColumnHeader");
    if (instructorColumnHeaders.length > 0) {
        for (let i = 0; i < instructorColumnHeaders.length; i++) {
            if (instructorColumnHeaders[i] != null) {
                instructorColumnHeaders[i].style.marginRight = "120px";
            }
        }
    }

    // Function to check if two arrays are equal
    function arraysAreEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) {
            return false;
        }
        for (let i = 0; i < arr1.length; i++) {
            if (Array.isArray(arr1[i]) && Array.isArray(arr2[i])) {
                if (!arraysAreEqual(arr1[i], arr2[i])) {
                    return false;
                }
            } else if (arr1[i] !== arr2[i]) {
                return false;
            }
        }
        return true;
    }

// Function to add unique lists and lists of lists to a list
    function addUniqueList(list, uniqueList) {
        for (let i = 0; i < list.length; i++) {
            if (arraysAreEqual(list[i], uniqueList)) {
                return; // Already exists, do not add
            }
        }
        list.push(uniqueList);
    }

    const uniqueClassProfs = [];


    instructors = document.getElementsByClassName("instructors");
    for (let i = 0; i < instructors.length; i++) {
        const textElement = document.createElement("span");
        textElement.id = "professorRatingElement";
        textElement.textContent = "SampleText";

        // Insert the new text element after the current instructor element
        instructors[i].insertAdjacentElement("afterend", textElement);

        const textContent = instructors[i].textContent;
        const professors = textContent.split('; ');

        const firstName1 = professors[0].split(', ')[0]
        const lastName1 = professors[0].split(', ')[1]
        let profs = [ [firstName1, lastName1] ];

        if (professors[1]) {
            const firstName2 = professors[1].split(', ')[0]
            const lastName2 = professors[1].split(', ')[1]
            profs = [ [firstName1, lastName1], [firstName2, lastName2] ];
        }

        addUniqueList(uniqueClassProfs, profs);

    }
}

if (window.location.href.includes('/soc')) {
    //check if professor ratings are propagated, otherwise propagate the values
    function checkForElement() {
        const element = document.getElementById("professorRatingElement");
        const instructorsElement = document.getElementsByClassName("instructors")

        if (element || instructorsElement.length === 0) {
            //pass
        } else {
            runCode();
        }
    }
    const interval = setInterval(checkForElement, 5000); // Check every 5 second
}
