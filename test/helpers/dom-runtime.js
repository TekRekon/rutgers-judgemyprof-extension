import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

import {JSDOM, VirtualConsole} from "jsdom";

import {instrumentSource} from "./instrument-source.js";


const contentURL = new URL("../../src/js/content.js", import.meta.url);
const popupURL = new URL("../../src/js/popup.js", import.meta.url);
const contentSource = instrumentSource(await readFile(contentURL, "utf8"), fileURLToPath(contentURL));
const popupSource = instrumentSource(await readFile(popupURL, "utf8"), fileURLToPath(popupURL));
const popupHTML = await readFile(new URL("../../src/html/popup.html", import.meta.url), "utf8");


export async function flushTasks(turns = 2) {
    for (let index = 0; index < turns; index += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}


async function waitForDOMContentLoaded(window) {
    if (window.document.readyState === "loading") {
        await new Promise(resolve => {
            window.document.addEventListener("DOMContentLoaded", resolve, {once: true});
        });
    } else {
        window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    }
    await flushTasks();
}


export async function createContentRuntime({
    url = "https://sis.rutgers.edu/soc/",
    html = "<!doctype html><html><body></body></html>",
    syncItems = {},
    syncGet,
    sendMessage,
    autoInitialize = true,
    injectAfterDOMContentLoaded = false
} = {}) {
    const virtualConsole = new VirtualConsole();
    const consoleErrors = [];
    const consoleLogs = [];
    virtualConsole.on("error", (...args) => consoleErrors.push(args));
    virtualConsole.on("log", (...args) => consoleLogs.push(args));

    const dom = new JSDOM(html, {
        url,
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole
    });
    const {window} = dom;
    window.__coverage__ = globalThis.__coverage__ ?? {};
    let runtimeListener = null;
    const sentMessages = [];
    const openedWindows = [];
    const createdBlobs = new Map();
    const revokedURLs = [];
    let blobSequence = 0;

    window.chrome = {
        runtime: {
            lastError: null,
            onMessage: {
                addListener(listener) {
                    runtimeListener = listener;
                }
            },
            sendMessage(message, callback) {
                sentMessages.push(structuredClone(message));
                if (sendMessage) {
                    return sendMessage(message, callback, window.chrome.runtime);
                }
                callback({data: null});
            }
        },
        storage: {
            sync: {
                async get(keys) {
                    if (syncGet) {
                        return syncGet(keys);
                    }
                    return structuredClone(syncItems);
                }
            }
        }
    };
    window.open = (targetURL, target, features) => {
        const opened = {url: String(targetURL), target, features, opener: "original"};
        openedWindows.push(opened);
        return opened;
    };
    window.Blob = Blob;
    window.URL.createObjectURL = blob => {
        const objectURL = `blob:test-${++blobSequence}`;
        createdBlobs.set(objectURL, blob);
        return objectURL;
    };
    window.URL.revokeObjectURL = objectURL => revokedURLs.push(objectURL);
    if (injectAfterDOMContentLoaded) {
        await waitForDOMContentLoaded(window);
    }
    window.eval(`${contentSource}\n//# sourceURL=src/js/content.js`);

    if (autoInitialize && !injectAfterDOMContentLoaded) {
        await waitForDOMContentLoaded(window);
    }

    return {
        dom,
        window,
        document: window.document,
        sentMessages,
        openedWindows,
        createdBlobs,
        revokedURLs,
        consoleErrors,
        consoleLogs,
        evaluate(expression) {
            return window.eval(expression);
        },
        dispatchRuntimeMessage(message, sender = {}) {
            if (!runtimeListener) {
                throw new Error("Content-script message listener was not registered");
            }
            let response;
            const result = runtimeListener(message, sender, value => {
                response = value;
            });
            return {result, response};
        },
        close() {
            dom.window.close();
        }
    };
}


export async function createPopupRuntime({
    syncItems = {},
    syncGet,
    syncSet,
    runtimeSendMessage,
    tabsQuery,
    tabsSendMessage,
    autoInitialize = true
} = {}) {
    const dom = new JSDOM(popupHTML, {
        url: "chrome-extension://test/src/html/popup.html",
        runScripts: "outside-only",
        pretendToBeVisual: true
    });
    const {window} = dom;
    window.__coverage__ = globalThis.__coverage__ ?? {};
    const calls = {
        syncGet: [],
        syncSet: [],
        runtimeMessages: [],
        tabsQuery: [],
        tabMessages: []
    };
    const mutableSyncItems = structuredClone(syncItems);

    window.chrome = {
        runtime: {
            async sendMessage(message) {
                calls.runtimeMessages.push(structuredClone(message));
                return runtimeSendMessage ? runtimeSendMessage(message) : {status: 1};
            }
        },
        storage: {
            sync: {
                async get(keys) {
                    calls.syncGet.push(structuredClone(keys));
                    return syncGet ? syncGet(keys) : structuredClone(mutableSyncItems);
                },
                async set(items) {
                    calls.syncSet.push(structuredClone(items));
                    if (syncSet) {
                        return syncSet(items);
                    }
                    Object.assign(mutableSyncItems, structuredClone(items));
                }
            }
        },
        tabs: {
            async query(query) {
                calls.tabsQuery.push(structuredClone(query));
                return tabsQuery ? tabsQuery(query) : [{id: 7}];
            },
            async sendMessage(tabID, message) {
                calls.tabMessages.push({tabID, message: structuredClone(message)});
                return tabsSendMessage ? tabsSendMessage(tabID, message) : {success: true};
            }
        }
    };
    window.requestAnimationFrame = callback => {
        callback(0);
        return 1;
    };
    window.eval(`${popupSource}\n//# sourceURL=src/js/popup.js`);

    if (autoInitialize) {
        await waitForDOMContentLoaded(window);
    }

    return {
        dom,
        window,
        document: window.document,
        calls,
        syncItems: mutableSyncItems,
        evaluate(expression) {
            return window.eval(expression);
        },
        async click(selector) {
            window.document.querySelector(selector).click();
            await flushTasks(3);
        },
        close() {
            dom.window.close();
        }
    };
}
