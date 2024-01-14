self.AUTHORIZATION_TOKEN = "Basic dGVzdDp0ZXN0";
self.API_URL = "https://www.ratemyprofessors.com/graphql";

self.ProfessorIDQuery = `
query ($query: TeacherSearchQuery!, $first: Int!) {
    newSearch {
        teachers(query: $query, first: $first) {
            edges {
                node {
                    id
                }
            }
        }
    }
}`;

self.ProfessorStatsQuery = `
query ($id: ID!) {
    node(id: $id) {
        ... on Teacher {
            id
            department
            legacyId
            firstName
            lastName
            avgRating
            numRatings
            avgDifficulty
            wouldTakeAgainPercent
        }
    }
}`;

//tweak fuse search to increase accuracy for specific departments
self.departmentAliases = {
    "Genetics": "BioGenetics",
    "Mathematics": "calculusMathematics"
}

self.CAMPUS_CODES = {
    NEWARK: 'NK',
    CAMDEN: 'CM',
    NEW_BRUNSWICK: 'NB',
    ONLINE_NEWARK: 'ONLINE_NK',
    ONLINE_CAMDEN: 'ONLINE_CM',
    ONLINE_NEW_BRUNSWICK: 'ONLINE_NB',
};

const FUSE_OPTIONS = {
    includeScore: true,
    threshold: 1, // Lower threshold for more "fuzzy" matches
    ignoreLocation: true, // Since we're not interested in where the term is in the string
    minMatchCharLength: 0, // Minimum number of characters that must be matched for a result to be returned
    findAllMatches: true, // Find all matches, regardless of score
    isCaseSensitive: false, // Turn off case sensitivity
};

//sorted by number of professors rated in each school
self.SCHOOLS = [
    // Rutgers - State University of New Jersey - New Brunswick - 6407 profs
    [ 'U2Nob29sLTgyNQ==', 'Rutgers - State University of New Jersey - New Brunswick', 'NB' ],

    // Rutgers - State University of New Jersey - Newark - 1889
    [ 'U2Nob29sLTgyNg==', 'Rutgers - State University of New Jersey - Newark', 'NK' ],

    // Rutgers - State University of New Jersey - Campus Not Given, Maybe Camden - 1008 profs
    [ 'U2Nob29sLTgyNA==', 'Rutgers - State University of New Jersey - Camden', ['NK', 'NB', 'CM'] ],

    // Rutgers Law School - Newark - 141 profs
    [ 'U2Nob29sLTQ5Mzk=', 'Rutgers Law School - Newark', 'NK' ],

    // Rutgers Business School - Newark and New Brunswick - 128 profs
    [ 'U2Nob29sLTE2ODYy', 'Rutgers Business School - Newark and New Brunswick', ['NK', 'NB'] ],

    // Rutgers - Camden School of Business - 96 profs
    [ 'U2Nob29sLTExOTY2', 'Rutgers - Camden School of Business', 'CM' ],

    // Rutgers Law School - Camden - 91 profs
    [ 'U2Nob29sLTQ5OTY=', 'Rutgers Law School - Camden', 'CM' ],

    // Rutgers School of Arts and Sciences - Newark - 38 profs
    [ 'U2Nob29sLTE4MjE0', 'Rutgers School of Arts and Sciences - Newark', 'NK' ],

    // Rutgers School of Health Related Professions - Likely Newark and New Brunswick - 28 profs
    [ 'U2Nob29sLTU4MDA=', 'Rutgers School of Health Related Professions', ['NK', 'NB'] ],

    // Rutgers School of Social Work - New Brunswick and Camden? - 20 profs
    [ 'U2Nob29sLTE3OTk4', 'Rutgers School of Social Work', ['NB', 'CM'] ],

    // Rutgers - Camden - 18 profs
    [ 'U2Nob29sLTE5MTAw', 'Rutgers- Camden', 'CM' ],

    // Rutgers School of Nursing - New Brunswick and Newark - 17 profs
    [ 'U2Nob29sLTE3Mjgy', 'Rutgers School of Nursing', ['NB', 'NK'] ],

    // Rutgers Graduate School of Education - New Brunswick - 12 profs
    [ 'U2Nob29sLTE3MDE3', 'Rutgers Graduate School of Education', 'NB' ],

    // Rutgers School of Dental Medicine - Newark - 9 profs
    [ 'U2Nob29sLTU5NDc=', 'Rutgers School of Dental Medicine', 'NK' ],

    // Rutgers New Jersey Medical School - Newark - 7 profs
    [ 'U2Nob29sLTE3Mjc0', 'Rutgers New Jersey Medical School', 'NK' ],

    // Rutgers School of Criminal Justice - Newark - 2 profs
    [ 'U2Nob29sLTE5MDAw', 'Rutgers School of Criminal Justice', 'NK' ],

    // Rutgers School of Public Affairs and Administration - Newark - 1 prof
    [ 'U2Nob29sLTE3Mzgz', 'Rutgers School of Public Affairs and Administration', 'NK' ],

    // Rutgers School of Management and Labor Relations - New Brunswick - 0 profs
    [ 'U2Nob29sLTE3MDg0', 'Rutgers School of Management and Labor Relations', 'NB' ],
];
