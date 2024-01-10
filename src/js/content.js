import * as ratings from './rating.js';

//fetch ana centeno
ratings.getProfessorRatings('ana centeno').then((result) => {
    console.log(result);
});


//Inserts professor ratings into WebReg
async function runCode() {

    const instructorColumnHeaders = document.getElementsByClassName("instructorColumnHeader");
    if (instructorColumnHeaders.length > 0) {
        for (let i = 0; i < instructorColumnHeaders.length; i++) {
            if (instructorColumnHeaders[i] != null) {
                instructorColumnHeaders[i].style.marginRight = "120px";
            }
        }
    }

    //TODO - use uniqueClassProfs array and corresponding ratings to cache values
    //TODO - cache values by querying a database through the server
    //TODO - ensure correct professor is scraped using their department name
    //TODO - scrape other metrics about each professor
    //TODO - scrape Rutgers SIRS data
    //TODO - OnHover popup for professor rating
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

    function addUniqueList(list, uniqueList) {
        for (let i = 0; i < list.length; i++) {
            if (arraysAreEqual(list[i], uniqueList)) {
                return; // Already exists, do not add
            }
        }
        list.push(uniqueList);
    }

    const uniqueClassProfs = [];


    let instructors;
    instructors = document.getElementsByClassName("instructors");
    for (let i = 0; i < instructors.length; i++) {
        const textElement = document.createElement("span");
        textElement.id = "professorRatingElement";
        textElement.textContent = "Loading...";

        // Insert the new text element after the current instructor element
        instructors[i].insertAdjacentElement("afterend", textElement);

        const textContent = instructors[i].textContent;
        const professors = textContent.split('; ');

        let prof_stats = null;
        //retrieve first prof rating from ratings
        for (let j = 0; j < professors.length; j++) {
            prof_stats = await ratings.getProfessorRatings(professors[0]);
            if (prof_stats != null) {
                break;
            }
        }
        let rating = 'N/A'



        textElement.textContent = rating;
        function numberToHexColor(number) {
            // Ensure the input is within the valid range
            if (number < 0.0 || number > 5.0) {
              throw new Error('Input number must be between 0.0 and 5.0');
            }
          
            // Define the color stops
            const colorStops = [
              { value: 0.0, color: '#8B0000' },   // Dark Red
              { value: 2.0, color: '#d98e00' },   // Orange
              { value: 3.0, color: '#FFFF00' },   // Yellow
              { value: 4.0, color: '#6eda6e' },   // Light Green
              { value: 5.0, color: '#008000' },   // Dark Green
            ];
          
            // Find the two closest color stops
            let startIndex = 0;
            let endIndex = 1;
            for (let i = 1; i < colorStops.length; i++) {
              if (number < colorStops[i].value) {
                endIndex = i;
                break;
              }
              startIndex = i;
            }
          
            // Interpolate between the two color stops
            const startColor = colorStops[startIndex].color;
            const endColor = colorStops[endIndex].color;
            const startValue = colorStops[startIndex].value;
            const endValue = colorStops[endIndex].value;
          
            const gradient = (number - startValue) / (endValue - startValue);
            const interpolatedColor = interpolateColors(startColor, endColor, gradient);
          
            return interpolatedColor;
          }
          
          // Helper function to interpolate between two colors
          function interpolateColors(startColor, endColor, factor) {
            const startHex = parseInt(startColor.slice(1), 16);
            const endHex = parseInt(endColor.slice(1), 16);
          
            const r1 = (startHex >> 16) & 255;
            const g1 = (startHex >> 8) & 255;
            const b1 = startHex & 255;
          
            const r2 = (endHex >> 16) & 255;
            const g2 = (endHex >> 8) & 255;
            const b2 = endHex & 255;
          
            const r = Math.round(r1 + factor * (r2 - r1));
            const g = Math.round(g1 + factor * (g2 - g1));
            const b = Math.round(b1 + factor * (b2 - b1));
          
            return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
          }
          //TODO colors might break rating might be string or NA
          if (rating !== 'N/A') {
              const hexColor = numberToHexColor(rating);
              textElement.style.color = hexColor;
          }
          textElement.style.fontWeight = 'bold';
          textElement.style.fontSize = '15px';

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
