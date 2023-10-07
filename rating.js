const puppeteer = require('puppeteer');

(async () => {

    async function scrapeRating () {
        const browser = await puppeteer.launch({headless: true});
        const page = await browser.newPage();
        const url = 'https://www.ratemyprofessors.com/search/professors/825?q=' + arguments[0] + '%20' + arguments[1];
        await page.goto(url);

        const noProfs = 'No professors with';

        const noneFound = await page.evaluate((noProfs) => {
            const pageText = document.body.innerText;
            return pageText.includes(noProfs);
          }, noProfs);

          if (noneFound) {
            console.log('N/A');
          } else {
            const quality = 'QUALITY';

            const numProfs = await page.evaluate((quality) => {
                const pageText = document.body.innerText;
                const regex = new RegExp(quality, 'g');
                const matches = pageText.match(regex);
                return matches ? matches.length : 0;
              }, quality);
            if (numProfs == 1) {
                const hasNoRatings = await page.evaluate(() => {
                    const numRatings = document.querySelector('.CardNumRating__CardNumRatingCount-sc-17t4b9u-3');
                    if (numRatings.innerHTML === '0 ratings') {
                        console.log('N/A');
                    }
                  });
            }

            const highestRating = await page.evaluate(() => {
                // Get all elements with the specified class name
                const elements = document.querySelectorAll('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2');
    
                let highest = 0.0;
    
                // Loop through the elements and find the highest rating
                elements.forEach(element => {
                    const text = element.textContent.trim();
                    const rating = parseFloat(text);
                    if (!isNaN(rating) && rating > highest) {
                        highest = rating;
                    }
                });
    
                return highest;
            });
            console.log(highestRating);
          }



        // const grabRating = await page.evaluate(() => {
        //     const ratingTag = document.querySelector('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2');
        //     return ratingTag.innerHTML;
        // })

        // console.log(grabRating);
        await browser.close();
    }
    scrapeRating('ana', 'centeno'); 

})();