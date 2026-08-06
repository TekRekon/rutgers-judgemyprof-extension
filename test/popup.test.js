import assert from "node:assert/strict";
import test from "node:test";

import {createPopupRuntime} from "./helpers/dom-runtime.js";


test("popup loads the persisted books-link state with accessible button text", async t => {
    for (const [hideBooksLinks, text, pressed] of [
        [true, "Show Books Links", "true"],
        [false, "Hide Books Links", "false"],
        [undefined, "Hide Books Links", "false"]
    ]) {
        await t.test(String(hideBooksLinks), async subtest => {
            const runtime = await createPopupRuntime({syncItems: {hideBooksLinks}});
            subtest.after(() => runtime.close());
            const button = runtime.document.querySelector("#toggle-books-links");
            assert.equal(button.textContent, text);
            assert.equal(button.getAttribute("aria-pressed"), pressed);
            assert.equal(button.classList.contains("pressed"), hideBooksLinks === true);
            assert.deepEqual(runtime.calls.syncGet, [["hideBooksLinks"]]);
        });
    }
});


test("popup reports synchronized-storage read failures without breaking controls", async t => {
    const runtime = await createPopupRuntime({
        syncGet: async () => {
            throw new Error("storage unavailable");
        }
    });
    t.after(() => runtime.close());
    const status = runtime.document.querySelector("#status-message");

    assert.equal(status.textContent, "Could not load setting: storage unavailable");
    assert.equal(status.classList.contains("error-message"), true);
    assert.equal(status.style.display, "block");
});


test("books toggle persists state, updates accessibility, notifies tab zero, and reports success", async t => {
    const runtime = await createPopupRuntime({
        syncItems: {hideBooksLinks: false},
        tabsQuery: async () => [{id: 0}]
    });
    t.after(() => runtime.close());

    await runtime.click("#toggle-books-links");
    const button = runtime.document.querySelector("#toggle-books-links");
    assert.equal(button.classList.contains("pressed"), true);
    assert.equal(button.textContent, "Show Books Links");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.deepEqual(runtime.calls.syncSet, [{hideBooksLinks: true}]);
    assert.deepEqual(runtime.calls.tabsQuery, [{active: true, currentWindow: true}]);
    assert.deepEqual(runtime.calls.tabMessages, [{
        tabID: 0,
        message: {action: "toggleBooksLinks", hide: true}
    }]);
    assert.equal(runtime.document.querySelector("#status-message").textContent, "Books links hidden");

    await runtime.click("#toggle-books-links");
    assert.equal(button.classList.contains("pressed"), false);
    assert.equal(runtime.calls.syncSet[1].hideBooksLinks, false);
    assert.equal(runtime.document.querySelector("#status-message").textContent, "Books links shown");
});


test("unsupported or disappearing active tabs do not prevent saving the global setting", async t => {
    const cases = [
        {name: "no active tab", tabsQuery: async () => [], expectedMessages: 0},
        {
            name: "unsupported tab",
            tabsQuery: async () => [{id: 9}],
            tabsSendMessage: async () => { throw new Error("Receiving end does not exist"); },
            expectedMessages: 1
        }
    ];

    for (const value of cases) {
        await t.test(value.name, async subtest => {
            const runtime = await createPopupRuntime(value);
            subtest.after(() => runtime.close());
            await runtime.click("#toggle-books-links");
            assert.deepEqual(runtime.calls.syncSet, [{hideBooksLinks: true}]);
            assert.equal(runtime.calls.tabMessages.length, value.expectedMessages);
            assert.equal(runtime.document.querySelector("#status-message").textContent, "Books links hidden");
        });
    }
});


test("toggle write failures report errors while tab-query failures remain best-effort", async t => {
    await t.test("storage write", async subtest => {
        const runtime = await createPopupRuntime({
            syncSet: async () => { throw new Error("quota exceeded"); }
        });
        subtest.after(() => runtime.close());
        await runtime.click("#toggle-books-links");
        const button = runtime.document.querySelector("#toggle-books-links");
        assert.equal(button.classList.contains("pressed"), false);
        assert.equal(runtime.calls.tabsQuery.length, 0);
        assert.equal(runtime.document.querySelector("#status-message").textContent, "Could not save setting: quota exceeded");
    });

    await t.test("tab query", async subtest => {
        const runtime = await createPopupRuntime({
            tabsQuery: async () => { throw new Error("tabs unavailable"); }
        });
        subtest.after(() => runtime.close());
        await runtime.click("#toggle-books-links");
        assert.equal(runtime.syncItems.hideBooksLinks, true);
        assert.equal(runtime.document.querySelector("#toggle-books-links").classList.contains("pressed"), true);
        assert.equal(runtime.document.querySelector("#status-message").textContent, "Books links hidden");
    });
});


test("cache reset displays success, explicit background failure, missing response, and rejected-message errors", async t => {
    const cases = [
        {
            name: "success",
            response: {status: 1},
            text: "Cache reset successful 🎉",
            className: "success-message"
        },
        {
            name: "background failure",
            response: {status: 0, errorMsg: "storage locked"},
            text: "Cache reset failed 😞: storage locked",
            className: "error-message"
        },
        {
            name: "missing response",
            response: undefined,
            text: "Cache reset failed 😞: Unknown error",
            className: "error-message"
        }
    ];

    for (const value of cases) {
        await t.test(value.name, async subtest => {
            const runtime = await createPopupRuntime({runtimeSendMessage: async () => value.response});
            subtest.after(() => runtime.close());
            await runtime.click("#reset-cache");
            const status = runtime.document.querySelector("#status-message");
            assert.deepEqual(runtime.calls.runtimeMessages, [{action: "resetCache"}]);
            assert.equal(status.textContent, value.text);
            assert.equal(status.classList.contains(value.className), true);
        });
    }

    await t.test("message rejection", async subtest => {
        const runtime = await createPopupRuntime({
            runtimeSendMessage: async () => { throw new Error("worker stopped"); }
        });
        subtest.after(() => runtime.close());
        await runtime.click("#reset-cache");
        assert.equal(
            runtime.document.querySelector("#status-message").textContent,
            "Cache reset failed 😞: worker stopped"
        );
    });
});


test("button animation and status replacement clean up transient classes and timers", async t => {
    const runtime = await createPopupRuntime();
    t.after(() => runtime.close());
    const button = runtime.document.querySelector("#reset-cache");

    runtime.evaluate("animateButton")(button);
    assert.equal(button.classList.contains("clicked"), true);
    button.dispatchEvent(new runtime.window.Event("animationend"));
    assert.equal(button.classList.contains("clicked"), false);

    runtime.evaluate("showStatusMessage")("first", "success-message");
    runtime.evaluate("showStatusMessage")("second", "error-message");
    const status = runtime.document.querySelector("#status-message");
    assert.equal(status.textContent, "second");
    assert.equal(status.classList.contains("success-message"), false);
    assert.equal(status.classList.contains("error-message"), true);
    await new Promise(resolve => setTimeout(resolve, 2_050));
    assert.equal(status.style.display, "none");
});


test("updateToggleButtonState is idempotent", async t => {
    const runtime = await createPopupRuntime();
    t.after(() => runtime.close());
    const button = runtime.document.querySelector("#toggle-books-links");
    const update = runtime.evaluate("updateToggleButtonState");

    update(button, true);
    update(button, true);
    assert.equal(button.classList.contains("pressed"), true);
    assert.equal(button.textContent, "Show Books Links");
    update(button, false);
    assert.equal(button.classList.contains("pressed"), false);
    assert.equal(button.getAttribute("aria-pressed"), "false");
});
