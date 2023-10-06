const puppeteer = require('puppeteer');

var professorName = "";
var professorSearchPage = "";
var professorRating = "";

var professorIndex = 0;
    var currentProfessor = "";

    var professorsOnPage = document.getElementsByClassName("instructors");

    while (professorIndex < professorsOnPage.length) {

        getProfessorName(professorIndex);
        currentProfessor = professorName;

        if (currentProfessor != undefined) 
        {
            getProfessorSearchPage(currentProfessor);
        }

        professorIndex++;
    }

function getProfessorName (indexOfProfessor) 
{
    try
	{
        var profsOnPage = document.getElementsByClassName("instructors");

		professorName = profsOnPage[indexOfProfessor].innerHTML;
	}
	catch (err)
	{
		professorName = "undefined"
	}
}

async function getProfessorSearchPage (CurrentProfessor)
{
    var comma = CurrentProfessor.indexOf(',');
    var lastName = CurrentProfessor.substring(0, comma);
    var firstName = CurrentProfessor.substring(comma + 2);

    professorSearchPage = 'https://www.ratemyprofessors.com/search/teachers?query=' + firstName + '%20' + lastName + '&sid=U2Nob29sLTgyNQ==';

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(professorSearchPage);
    const data = await page.evaluate(() => {
        var professorID = document.querySelector('.TeacherCard__StyledTeacherCard-syjs0d-0.dLJIlx').getAttribute('href');
    });

    professorSearchPage = "https://www.ratemyprofessors.com" + professorID;

    getProfessorRating(professorSearchPage);
}

async function getProfessorRating(ProfessorSearchPage) 
{

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(professorSearchPage);
    const data = await page.evaluate(() => {
        professorRating = (document.querySelector('.RatingValue__Numerator-qw8sqy-2.liyUjw')).innerHTML;
    });
    
    addRatingToPage(professorRating);
}

function addRatingToPage (ProfessorRating)
{
    var profOnPage = document.getElementsByClassName("instructors");

    (profOnPage[professorIndex]).innerHTML = (profOnPage[professorIndex]).innerHTML + ProfessorRating;

    resetValues();
}
function resetValues()
{
    professorName = "";
	currentProfessor = "";
	professorSearchPage = "";
	professorRating = "";
}