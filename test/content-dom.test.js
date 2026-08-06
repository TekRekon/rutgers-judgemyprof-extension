import assert from "node:assert/strict";
import test from "node:test";

import {createContentRuntime, flushTasks} from "./helpers/dom-runtime.js";


test("books-link setting hides existing and dynamically inserted links, then disconnects cleanly", async t => {
    const runtime = await createContentRuntime({
        html: "<!doctype html><body><a class='books' id='existing'>Books</a></body>",
        syncItems: {hideBooksLinks: true}
    });
    t.after(() => runtime.close());

    assert.equal(runtime.document.querySelector("#existing").classList.contains("jmp-books-link-hidden"), true);

    const wrapper = runtime.document.createElement("div");
    wrapper.innerHTML = "<a class='books' id='nested'>Nested</a>";
    runtime.document.body.appendChild(wrapper);
    const direct = runtime.document.createElement("a");
    direct.id = "direct";
    direct.className = "books";
    runtime.document.body.appendChild(direct);
    await flushTasks();

    assert.equal(runtime.document.querySelector("#nested").classList.contains("jmp-books-link-hidden"), true);
    assert.equal(direct.classList.contains("jmp-books-link-hidden"), true);

    assert.deepEqual(
        JSON.parse(JSON.stringify(runtime.dispatchRuntimeMessage({action: "toggleBooksLinks", hide: false}).response)),
        {success: true}
    );
    assert.equal(runtime.document.querySelector("#existing").classList.contains("jmp-books-link-hidden"), false);
    assert.equal(runtime.document.querySelector("#nested").classList.contains("jmp-books-link-hidden"), false);

    const later = runtime.document.createElement("a");
    later.className = "books";
    runtime.document.body.appendChild(later);
    await flushTasks();
    assert.equal(later.classList.contains("jmp-books-link-hidden"), false);

    assert.doesNotThrow(() => runtime.dispatchRuntimeMessage(null));
});


test("books-link initialization tolerates unavailable synchronized storage", async t => {
    const failure = new Error("storage locked");
    const runtime = await createContentRuntime({
        html: "<!doctype html><body><a class='books'>Books</a></body>",
        syncGet: async () => {
            throw failure;
        }
    });
    t.after(() => runtime.close());

    assert.equal(runtime.document.querySelector(".books").classList.contains("jmp-books-link-hidden"), false);
    assert.equal(runtime.consoleLogs.length, 1);
    assert.equal(runtime.consoleLogs[0][0], "Could not load books links setting:");
});


test("content script injected after DOM readiness initializes immediately", async t => {
    const runtime = await createContentRuntime({
        html: "<!doctype html><body><a class='books'>Books</a></body>",
        syncItems: {hideBooksLinks: true},
        injectAfterDOMContentLoaded: true
    });
    t.after(() => runtime.close());
    await flushTasks();
    assert.equal(runtime.document.querySelector(".books").classList.contains("jmp-books-link-hidden"), true);
});


test("SOC instructor extraction handles initials, middle names, multi-word surnames, fallback names, and duplicates", async t => {
    const runtime = await createContentRuntime({
        html: `<!doctype html><body>
            <div id="root">
                <span class="instructors">Smith, John M.; Doe, J. Jane; Van Dyke, A.; Raw Name; Jones, A. B.; Brown, Mary Anne</span>
                <span class="instructors" id="rated">Already Rated<div class="jmp-rating-bubble"></div></span>
            </div>
        </body>`
    });
    t.after(() => runtime.close());

    const root = runtime.document.querySelector("#root");
    const elements = runtime.evaluate("extractInstructorElements")(root);
    assert.equal(elements.length, 1);
    assert.equal(runtime.evaluate("extractInstructorElements")(null).length, 1);
    assert.deepEqual(Array.from(runtime.evaluate("extractInstructorNames")(elements[0])), [
        "John Smith",
        "Jane Doe",
        "A Van Dyke",
        "Raw Name",
        "B Jones",
        "Mary Brown"
    ]);
});


test("CSP extraction scopes instructors and indexes to the selected course and ignores initialized elements", async t => {
    const runtime = await createContentRuntime({
        url: "https://sims.rutgers.edu/csp/SelectCourseTab",
        html: `<!doctype html><body>
            <div class="dijitTitlePane" id="first">
                <div class="title">Algorithms</div>
                <table><tr>
                    <td title="Instructor">Smith, John, Doe, Jane</td>
                    <td title="Index Number">12345</td>
                </tr></table>
            </div>
            <div class="dijitTitlePane" id="second">
                <table><tr>
                    <td title="Instructor"><div class="jmp-rating-bubble"></div>Rated</td>
                    <td title="Index Number"><div class="jmp-webreg-bubble"></div>67890</td>
                </tr></table>
            </div>
        </body>`
    });
    t.after(() => runtime.close());

    const first = runtime.document.querySelector("#first");
    const instructor = runtime.evaluate("extractInstructorElements")(first)[0];
    assert.equal(runtime.evaluate("extractInstructorElements")(null).length, 1);
    assert.equal(runtime.evaluate("extractIndexElements")(first).length, 1);
    assert.equal(runtime.evaluate("extractIndexElements")(null).length, 1);
    assert.deepEqual(Array.from(runtime.evaluate("extractInstructorNames")(instructor)), [
        "Smith", "John", "Doe", "Jane"
    ]);
    instructor.textContent = "Smith J, John";
    assert.deepEqual(Array.from(runtime.evaluate("extractInstructorNames")(instructor)), ["J", "John"]);
    assert.equal(runtime.evaluate("extractCourseName")(instructor, first), "Algorithms");
});


test("subject extraction is null-safe across SOC, old SOC, and CSP variants", async t => {
    const cases = [
        {
            url: "https://sis.rutgers.edu/soc/",
            html: "<div id='subjectTitle2'> Computer Science </div>",
            expected: "Computer Science"
        },
        {
            url: "https://sis.rutgers.edu/oldsoc/",
            html: "<div id='subjectTitle'> Mathematics </div>",
            expected: "Mathematics"
        },
        {
            url: "https://sims.rutgers.edu/csp/SelectCourseTab",
            html: "<div id='CourseSearchID'><select><option>ignored</option></select><select><option>Select a Subject</option><option selected>Physics</option></select></div>",
            expected: "Physics"
        },
        {
            url: "https://sims.rutgers.edu/csp/SelectCourseTab",
            html: "<div id='CourseSearchID'><select><option selected>Select a Subject</option></select></div>",
            expected: ""
        },
        {
            url: "https://sims.rutgers.edu/csp/SelectCourseTab",
            html: "<div></div>",
            expected: ""
        }
    ];

    for (const value of cases) {
        await t.test(value.expected || "missing", async subtest => {
            const runtime = await createContentRuntime(value);
            subtest.after(() => runtime.close());
            assert.equal(runtime.evaluate("extractSubjectName")(), value.expected);
        });
    }
});


test("course extraction supports SOC metadata, CSP title panes, schedule rows, and absent structures", async t => {
    const soc = await createContentRuntime({
        html: `<!doctype html><body>
            <div class="metadata hidden">Introduction to Testing</div>
            <div class="courseData"><span class="instructors" id="soc-prof">Smith, Ada</span></div>
        </body>`
    });
    t.after(() => soc.close());
    assert.equal(
        soc.evaluate("extractCourseName")(soc.document.querySelector("#soc-prof"), null),
        "Introduction to Testing"
    );

    const csp = await createContentRuntime({
        url: "https://sims.rutgers.edu/csp/BuildScheduleTab",
        html: `<!doctype html><body>
            <div class="dijitTitlePane"><div class="title">Pane Course</div><span id="pane-prof"></span></div>
            <table><tr><td id="row-prof"></td><td class="course-title">Row Course</td></tr></table>
            <span id="orphan"></span>
        </body>`
    });
    t.after(() => csp.close());
    const extract = csp.evaluate("extractCourseName");
    assert.equal(extract(csp.document.querySelector("#pane-prof"), null), "Pane Course");
    assert.equal(extract(csp.document.querySelector("#row-prof"), null), "Row Course");
    assert.equal(extract(csp.document.querySelector("#orphan"), null), "");
});


test("findParentDiv handles intervening text nodes and safely returns null", async t => {
    const runtime = await createContentRuntime({
        html: `<!doctype html><body>
            <div class="metadata hidden">Metadata</div>
            text
            <div class="courseData"><div><span id="child"></span></div></div>
            <span id="orphan"></span>
        </body>`
    });
    t.after(() => runtime.close());
    const findParent = runtime.evaluate("findParentDiv");
    assert.equal(findParent(runtime.document.querySelector("#child"), "COURSEDATA").textContent, "Metadata");
    assert.equal(findParent(runtime.document.querySelector("#orphan"), "courseData"), null);
});


test("CSP navigation and click handlers safely rescan each supported control", async t => {
    const runtime = await createContentRuntime({
        url: "https://sims.rutgers.edu/csp/BuildScheduleTab",
        html: `<!doctype html><body>
            <div class="dijitTitlePane"><button id="pane-target">Pane</button></div>
            <button id="dijit_form_Button_3">Next</button>
            <button id="dijit_form_Button_2">Previous</button>
            <table><tbody dojoattachpoint="scheduleList"><tr><td>
                <button class="remove">Remove</button>
                <a dojoattachpoint="scheduleName">Schedule</a>
            </td></tr></tbody></table>
            <button class="list-view-link">List</button>
        </body>`
    });
    t.after(() => runtime.close());

    runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
    for (const selector of [
        "#pane-target", "#dijit_form_Button_3", "#dijit_form_Button_2",
        ".remove", "a[dojoattachpoint='scheduleName']", ".list-view-link"
    ]) {
        runtime.document.querySelector(selector).click();
    }
    await flushTasks(3);
    assert.equal(runtime.consoleErrors.length, 0);
});


test("scan helpers contain malformed roots instead of leaking event-handler exceptions", async t => {
    const soc = await createContentRuntime();
    t.after(() => soc.close());
    await soc.evaluate("addRatingToInstructorElements")({});
    assert.equal(soc.consoleErrors.length, 1);

    const csp = await createContentRuntime({
        url: "https://sims.rutgers.edu/csp/",
        html: "<table><tr><td title='Index Number'>12345</td></tr></table>"
    });
    t.after(() => csp.close());
    csp.evaluate("addWebregLinkToIndexElements")({
        contains() {
            throw new Error("detached root");
        }
    });
    assert.equal(csp.consoleErrors.length, 1);
});
