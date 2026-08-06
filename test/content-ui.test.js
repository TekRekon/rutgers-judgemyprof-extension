import assert from "node:assert/strict";
import test from "node:test";

import {createContentRuntime, flushTasks} from "./helpers/dom-runtime.js";


function professor(overrides = {}) {
    return {
        id: "teacher-1",
        firstName: "Ada",
        lastName: "Lovelace",
        department: "Computer Science",
        legacyId: 123,
        avgRating: 4.8,
        numRatings: 42,
        avgDifficulty: 3.2,
        wouldTakeAgainPercent: 92.856,
        ...overrides
    };
}


test("season conversion covers every Rutgers term and rejects unknown casing", async t => {
    const runtime = await createContentRuntime();
    t.after(() => runtime.close());
    const convert = runtime.evaluate("getNumericSeason");

    assert.equal(convert("Spring"), 1);
    assert.equal(convert("Summer"), 7);
    assert.equal(convert("Fall"), 9);
    assert.equal(convert("Winter"), 12);
    assert.equal(convert("spring"), undefined);
    assert.equal(convert(""), undefined);
});


test("WebReg bubbles validate term data, avoid duplicates, animate, and open a secure encoded URL", async t => {
    const runtime = await createContentRuntime({
        url: "https://sims.rutgers.edu/csp/SelectCourseTab",
        html: `<!doctype html><body>
            <span name="YearTerm">Fall 2026</span>
            <table><tr><td title="Index Number"> 12 345&amp;x </td></tr></table>
        </body>`
    });
    t.after(() => runtime.close());
    const add = runtime.evaluate("addWebregLinkToIndexElements");

    add(null);
    add(null);
    const bubble = runtime.document.querySelector(".jmp-webreg-bubble");
    assert.ok(bubble);
    assert.equal(runtime.document.querySelectorAll(".jmp-webreg-bubble").length, 1);
    assert.match(bubble.textContent, /Click to register for index 12 345&x/);

    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseover", {bubbles: true}));
    assert.equal(runtime.document.querySelector(".jmp-click-to-register-popup").style.display, "block");
    bubble.dispatchEvent(new runtime.window.MouseEvent("mousedown", {bubbles: true}));
    assert.equal(bubble.style.transform, "translateY(2px)");
    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseup", {bubbles: true}));
    assert.equal(bubble.style.transform, "translateY(-2px)");
    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseleave", {bubbles: true}));
    assert.equal(runtime.document.querySelector(".jmp-click-to-register-popup").style.display, "none");
    bubble.click();

    assert.equal(runtime.openedWindows.length, 1);
    const openedURL = new URL(runtime.openedWindows[0].url);
    assert.equal(openedURL.protocol, "https:");
    assert.equal(openedURL.hostname, "sims.rutgers.edu");
    assert.equal(openedURL.searchParams.get("semesterSelection"), "92026");
    assert.equal(openedURL.searchParams.get("indexList"), "12 345&x");
    assert.equal(runtime.openedWindows[0].target, "_blank");
    assert.equal(runtime.openedWindows[0].features, "noopener,noreferrer");
    assert.equal(runtime.openedWindows[0].opener, null);
});


test("WebReg bubble creation is a no-op when term or index data is incomplete", async t => {
    for (const html of [
        "<table><tr><td title='Index Number'>12345</td></tr></table>",
        "<span name='YearTerm'>Unknown 2026</span><table><tr><td title='Index Number'>12345</td></tr></table>",
        "<span name='YearTerm'>Fall 2026</span><table><tr><td title='Index Number'> </td></tr></table>"
    ]) {
        const runtime = await createContentRuntime({
            url: "https://sims.rutgers.edu/csp/",
            html
        });
        t.after(() => runtime.close());
        runtime.evaluate("addWebregLinkToIndexElements")(null);
        assert.equal(runtime.document.querySelector(".jmp-webreg-bubble"), null);
    }
});


test("loading bubbles use bounded fonts and press animation on SOC and CSP", async t => {
    const soc = await createContentRuntime({html: "<div id='prof'>A very long professor name that must shrink</div>"});
    t.after(() => soc.close());
    const socBubble = soc.evaluate("initializeLoadingBubble")(soc.document.querySelector("#prof"));
    assert.equal(socBubble.classList.contains("jmp-pulsating"), true);
    assert.equal(socBubble.style.fontSize, "10px");
    socBubble.dispatchEvent(new soc.window.MouseEvent("mousedown"));
    assert.equal(socBubble.style.transform, "translateY(2px)");
    socBubble.dispatchEvent(new soc.window.MouseEvent("mouseup"));
    assert.equal(socBubble.style.transform, "translateY(-2px)");

    const csp = await createContentRuntime({
        url: "https://sims.rutgers.edu/csp/",
        html: "<div id='prof'>Name</div>"
    });
    t.after(() => csp.close());
    assert.equal(
        csp.evaluate("initializeLoadingBubble")(csp.document.querySelector("#prof")).style.fontSize,
        "12px"
    );
});


test("dynamic font sizing and rating colors cover all boundaries and invalid values", async t => {
    const runtime = await createContentRuntime();
    t.after(() => runtime.close());
    const fontSize = runtime.evaluate("getDynamicFontSize");
    const color = runtime.evaluate("getRatingColor");

    assert.equal(fontSize("short"), 15);
    assert.equal(fontSize(null), 15);
    assert.equal(fontSize("x".repeat(31)), 10);
    assert.equal(fontSize("x".repeat(13), 17, 2, 12), 17);
    assert.equal(fontSize("x".repeat(25), 17, 2, 12), 15);

    const cases = [
        [-1, "lightcoral"], [1, "lightcoral"], [1.1, "#F8917D"], [2.5, "lightsalmon"],
        [3, "#F7C684"], [3.5, "khaki"], [4, "#baee90"], [4.5, "#98FB98"],
        [5, "#6ad46a"], [5.1, "lightgray"], [Number.NaN, "lightgray"]
    ];
    for (const [rating, expected] of cases) {
        assert.equal(color(rating), expected);
    }
});


test("fetchProfStats handles successful, missing, runtime, background, and thrown messaging outcomes", async t => {
    const cases = [
        {
            name: "success",
            handler(_message, callback) { callback({data: professor()}); },
            verify: response => assert.equal(response.data.id, "teacher-1")
        },
        {
            name: "missing response",
            handler(_message, callback) { callback(undefined); },
            error: /background service did not respond/
        },
        {
            name: "runtime error",
            handler(_message, callback, chromeRuntime) {
                chromeRuntime.lastError = {message: "port closed"};
                callback(undefined);
                chromeRuntime.lastError = null;
            },
            error: /port closed/
        },
        {
            name: "background error",
            handler(_message, callback) {
                callback({error: {message: "lookup failed", stack: "remote stack"}});
            },
            error: error => error.message === "lookup failed" && error.stack === "remote stack"
        },
        {
            name: "send throws",
            handler() { throw new Error("extension invalidated"); },
            error: /extension invalidated/
        }
    ];

    for (const value of cases) {
        await t.test(value.name, async subtest => {
            const runtime = await createContentRuntime({sendMessage: value.handler});
            subtest.after(() => runtime.close());
            const promise = runtime.evaluate("fetchProfStats")(" Ada ", " CS ", " Computer Science ");
            if (value.error) {
                await assert.rejects(promise, value.error);
            } else {
                value.verify(await promise);
                assert.deepEqual(runtime.sentMessages[0], {
                    action: "fetchProfStats",
                    matchText: " CS ",
                    profName: " Ada ",
                    subjectName: " Computer Science "
                });
            }
        });
    }
});


test("rated bubbles render normalized profile data, interactions, warnings, and safe external links", async t => {
    const runtime = await createContentRuntime({html: "<div id='prof'></div>"});
    t.after(() => runtime.close());
    const instructor = runtime.document.querySelector("#prof");
    const bubble = runtime.evaluate("initializeLoadingBubble")(instructor);
    runtime.evaluate("populateRatingBubble")(instructor, bubble, {data: professor()}, "Ada Lovelace");

    assert.equal(bubble.firstChild?.nodeType, runtime.window.Node.TEXT_NODE);
    assert.equal(bubble.firstChild?.textContent, "4.8");
    assert.equal(bubble.style.backgroundColor, "rgb(106, 212, 106)");
    assert.equal(instructor.querySelector(".jmp-card-prof-name").textContent, "Ada Lovelace");
    assert.equal(instructor.querySelector(".jmp-card-prof-dept").textContent, "Computer Science");
    assert.equal(instructor.querySelector(".jmp-card-difficulty-elem").textContent, "Level Of Difficulty: 3.2");
    assert.equal(instructor.querySelector(".jmp-card-would-take-again-elem").textContent, "Would Take Again: 92.86%");
    const reviews = instructor.querySelector(".jmp-card-reviews-elem a");
    assert.equal(reviews.href, "https://www.ratemyprofessors.com/professor/123");
    assert.equal(reviews.rel, "noopener noreferrer");

    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseover", {bubbles: true}));
    assert.equal(instructor.querySelector(".jmp-popup-card").style.display, "inline-block");
    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseleave", {bubbles: true}));
    assert.equal(instructor.querySelector(".jmp-popup-card").style.display, "none");
    const popupCard = instructor.querySelector(".jmp-popup-card");
    popupCard.dispatchEvent(new runtime.window.MouseEvent("mouseover"));
    assert.equal(popupCard.style.display, "inline-block");
    popupCard.dispatchEvent(new runtime.window.MouseEvent("mouseleave"));
    assert.equal(popupCard.style.display, "none");
    bubble.click();
    instructor.querySelector(".jmp-card-search-button").click();
    assert.equal(runtime.openedWindows[0].url, reviews.href);
    assert.match(runtime.openedWindows[1].url, /^https:\/\/www\.google\.com\/search\?q=Ada%20Lovelace/);
});


test("unrated, invalid, absent, and last-name-only results render distinct fallbacks", async t => {
    const cases = [
        {response: {data: professor({numRatings: 0})}, name: "Ada Lovelace", text: "X.X", color: "lightgray"},
        {response: {data: professor({avgRating: null})}, name: "Ada Lovelace", text: "N/A"},
        {response: {data: null}, name: "Nobody", text: "N/A"},
        {response: {data: null}, name: "", text: "N/A"},
        {response: {data: professor()}, name: "Lovelace", text: "4.8", warning: true}
    ];

    for (const [index, value] of cases.entries()) {
        await t.test(String(index), async subtest => {
            const runtime = await createContentRuntime({html: "<div id='prof'></div>"});
            subtest.after(() => runtime.close());
            const instructor = runtime.document.querySelector("#prof");
            const bubble = runtime.evaluate("initializeLoadingBubble")(instructor);
            runtime.evaluate("populateRatingBubble")(instructor, bubble, value.response, value.name);
            assert.equal(bubble.firstChild?.textContent, value.text);
            if (value.color) {
                assert.equal(bubble.style.backgroundColor, value.color);
            }
            if (value.warning) {
                assert.equal(bubble.querySelector(".jmp-rating-bubble-warning-bubble").textContent, "?");
                const warningPopup = instructor.querySelector(".jmp-card-warning-message-popup");
                const warningBubble = instructor.querySelector(".jmp-card-warning-bubble");
                assert.match(warningPopup.textContent, /inaccurate/);
                warningBubble.dispatchEvent(new runtime.window.MouseEvent("mouseover"));
                assert.equal(warningPopup.style.display, "block");
                warningBubble.dispatchEvent(new runtime.window.MouseEvent("mouseleave"));
                assert.equal(warningPopup.style.display, "none");
            }
            if (value.text === "N/A") {
                const searchPopup = bubble.querySelector(".jmp-click-to-search-popup");
                bubble.dispatchEvent(new runtime.window.MouseEvent("mouseover"));
                assert.equal(searchPopup.style.display, "block");
                bubble.dispatchEvent(new runtime.window.MouseEvent("mouseleave"));
                assert.equal(searchPopup.style.display, "none");
                bubble.click();
                assert.match(runtime.openedWindows[0].url, /^https:\/\/www\.google\.com\/search\?/);
            }
        });
    }
});


test("error bubbles render untrusted details as text inside a self-contained blob document", async t => {
    const runtime = await createContentRuntime({html: "<div id='prof'></div>"});
    t.after(() => runtime.close());
    const bubble = runtime.evaluate("initializeLoadingBubble")(runtime.document.querySelector("#prof"));
    const hostile = new Error("<img src=x onerror=alert(1)>");
    hostile.stack = "<script>steal()</script>\n& dangerous";

    runtime.evaluate("convertToErrorBubble")(bubble, hostile);
    assert.equal(bubble.firstChild.textContent, "Error");
    assert.equal(bubble.querySelector(".jmp-error-msg-popup").textContent, hostile.message);
    assert.equal(bubble.classList.contains("jmp-pulsating"), false);
    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseover"));
    assert.equal(bubble.querySelector(".jmp-error-msg-popup").style.display, "block");
    bubble.dispatchEvent(new runtime.window.MouseEvent("mouseleave"));
    assert.equal(bubble.querySelector(".jmp-error-msg-popup").style.display, "none");
    bubble.click();

    const objectURL = runtime.openedWindows[0].url;
    assert.match(objectURL, /^blob:test-/);
    const blobText = await runtime.createdBlobs.get(objectURL).text();
    assert.match(blobText, /&lt;script&gt;steal\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(blobText, /<script>steal\(\)<\/script>/);
    assert.match(blobText, /Try resetting the extension cache/);
});


test("Google search and new-tab helpers encode input and tolerate blocked popups", async t => {
    const runtime = await createContentRuntime();
    t.after(() => runtime.close());
    runtime.evaluate("openGoogleSearch")("Ada & Bob / Rutgers");
    const url = new URL(runtime.openedWindows[0].url);
    assert.equal(url.searchParams.get("q"), "Ada & Bob / Rutgers");
    assert.equal(runtime.openedWindows[0].opener, null);

    runtime.window.open = () => null;
    assert.doesNotThrow(() => runtime.evaluate("openInNewTab")("https://example.com"));
});


test("SOC rating integration deduplicates names and converts background failures to error bubbles", async t => {
    let messageCount = 0;
    const runtime = await createContentRuntime({
        html: `<!doctype html><body>
            <div id="subjectTitle2">Computer Science</div>
            <div class="metadata hidden">Data Structures 01:198:112</div>
            <div class="courseData" id="course"><span class="instructors">Smith, Ada; Smith, Ada</span></div>
        </body>`,
        sendMessage(_message, callback) {
            messageCount += 1;
            callback({error: {message: "API unavailable"}});
        }
    });
    t.after(() => runtime.close());

    runtime.document.querySelector("#course").classList.add("subject");
    runtime.document.querySelector(".instructors").click();
    await flushTasks(4);
    assert.equal(messageCount, 1);
    const bubble = runtime.document.querySelector(".jmp-rating-bubble");
    assert.equal(bubble.firstChild.textContent, "Error");
    assert.equal(bubble.classList.contains("jmp-pulsating"), false);
    assert.match(runtime.sentMessages[0].matchText, /Data Structures Computer Science/);
    assert.equal(runtime.sentMessages[0].subjectName, "Computer Science");
});


test("SOC rating integration populates successful asynchronous lookups", async t => {
    const runtime = await createContentRuntime({
        html: `<!doctype html><body>
            <div id="subjectTitle2">Mathematics</div>
            <div class="metadata hidden">Calculus I</div>
            <div class="courseData"><span class="instructors" id="prof">Lovelace, Ada</span></div>
        </body>`,
        sendMessage(_message, callback) {
            callback({data: professor()});
        }
    });
    t.after(() => runtime.close());
    await runtime.evaluate("rateInstructorElement")(
        runtime.document.querySelector("#prof"),
        "Mathematics",
        null
    );
    await flushTasks(3);
    assert.equal(runtime.sentMessages[0].subjectName, "Mathematics");
    assert.equal(runtime.document.querySelector(".jmp-rating-bubble").firstChild.textContent, "4.8");
    assert.equal(runtime.document.querySelector(".jmp-rating-bubble").classList.contains("jmp-pulsating"), false);
});


test("CSP rating flow handles paired names, duplicate pairs, lookup errors, and odd-name fallback", async t => {
    await t.test("successful duplicate pair", async subtest => {
        let count = 0;
        const runtime = await createContentRuntime({
            url: "https://sims.rutgers.edu/csp/BuildScheduleTab",
            html: "<table><tr><td title='Instructor' id='prof'>Smith, Ada, Smith, Ada</td><td class='course-title'>CS 101</td></tr></table>",
            sendMessage(_message, callback) {
                count += 1;
                callback({data: professor()});
            }
        });
        subtest.after(() => runtime.close());
        const element = runtime.document.querySelector("#prof");
        await runtime.evaluate("rateInstructorElement")(element, "Computer Science", null);
        assert.equal(count, 1);
        assert.equal(element.querySelectorAll(".jmp-rating-bubble").length, 1);
        const bubble = element.querySelector(".jmp-rating-bubble");
        bubble.dispatchEvent(new runtime.window.MouseEvent("mouseover"));
        const card = runtime.document.body.querySelector(".jmp-popup-card");
        assert.equal(card.style.display, "block");
        assert.match(card.style.left, /px$/);
        assert.match(card.style.top, /px$/);
    });

    await t.test("lookup error", async subtest => {
        const runtime = await createContentRuntime({
            url: "https://sims.rutgers.edu/csp/",
            html: "<table><tr><td title='Instructor' id='prof'>Smith, Ada</td></tr></table>",
            sendMessage(_message, callback) {
                callback({error: {message: "offline"}});
            }
        });
        subtest.after(() => runtime.close());
        const element = runtime.document.querySelector("#prof");
        await runtime.evaluate("rateInstructorElement")(element, "CS", null);
        assert.ok(element.querySelectorAll(".jmp-rating-bubble").length >= 1);
        assert.equal(element.querySelector(".jmp-rating-bubble").firstChild.textContent, "Error");
    });

    await t.test("odd-name fallback succeeds and then fails", async subtest => {
        let count = 0;
        const runtime = await createContentRuntime({
            url: "https://sims.rutgers.edu/csp/",
            html: "<table><tr><td title='Instructor' id='prof'>Smith, Ada, Jones</td></tr></table>",
            sendMessage(_message, callback) {
                count += 1;
                if (count === 1) {
                    callback({data: null});
                } else if (count === 2) {
                    callback({data: professor()});
                } else if (count === 3) {
                    callback({data: null});
                } else {
                    callback({error: {message: "fallback failed"}});
                }
            }
        });
        subtest.after(() => runtime.close());
        const element = runtime.document.querySelector("#prof");
        await runtime.evaluate("rateInstructorElement")(element, "CS", null);
        assert.ok(count >= 4);
        assert.ok(element.querySelectorAll(".jmp-rating-bubble").length >= 2);
        assert.ok(Array.from(element.querySelectorAll(".jmp-rating-bubble")).some(bubble =>
            bubble.firstChild?.textContent === "Error"
        ));
    });
});
