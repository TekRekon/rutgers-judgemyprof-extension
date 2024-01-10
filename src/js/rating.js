import ratings from '@mtucourses/rate-my-professors';
import * as constants from './constants.js';


// @param {string} professorName - The name of the professor to search for
// @returns {Promise<object>} - An object containing the professor's ratings
// Example return value:
// {
//     avgDifficulty: 4.5,
//     avgRating: 3.1,
//     department: 'Computer Science',
//     firstName: 'David',
//     id: 'VGVhY2hlci0yMzM2Mjg5',
//     lastName: 'Menendez',
//     legacyId: 2336289,
//     numRatings: 101,
//     school: {
//         city: 'New Brunswick',
//         id: 'U2Nob29sLTgyNQ==',
//         name: 'Rutgers - State University of New Jersey',
//         state: 'NJ'
//     },
//     wouldTakeAgainPercent: 50
// }
async function getProfessorRatings(professorName) {
    // try {
    let professors = [];
    //search for a professor
    for (let i = 0; i < constants.SCHOOLS.length; i++) {
        const school = constants.SCHOOLS[i];
        const schoolId = school[0];
        professors = await ratings.searchTeacher(professorName, schoolId);
        if (professors.length > 0) {
            break;
        }
    }
    if (professors.length === 0) {
        return null;
    }

    //get stats for each professor
    let professor_stats = [];
    for (let i = 0; i < professors.length; i++) {
        const professorStats = await ratings.getTeacher(professors[i].id);
        professor_stats.push(professorStats);
    }
    //return most rated professor
    let max = 0;
    let maxIndex = 0;
    for (let i = 0; i < professor_stats.length; i++) {
        if (professor_stats[i].numRatings > max) {
            max = professor_stats[i].numRatings;
            maxIndex = i;
        }
    }
    return professor_stats[maxIndex];
    // } catch (error) {
    //     console.error('Failed to retrieve professor ratings:', error);
    //     return null;
    // }
}

export { getProfessorRatings };