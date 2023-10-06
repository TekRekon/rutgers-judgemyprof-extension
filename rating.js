const puppeteer = require('puppeteer');

(async () => {

    async function scrapeRating () {
        const browser = await puppeteer.launch({headless: true});
        const page = await browser.newPage();
        const url = 'https://www.ratemyprofessors.com/search/teachers?query=' + arguments[0] + '%20' + arguments[1] + '&sid=U2Nob29sLTgyNQ==';
        await page.goto(url);

        const grabRating = await page.evaluate(() => {
            const ratingTag = document.querySelector('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2');
            return ratingTag.innerHTML;
        })

        console.log(grabRating);
        await browser.close();
    }
    scrapeRating('neil', 'sheflin');

})();
