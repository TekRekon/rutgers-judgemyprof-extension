import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

import {instrumentSource} from "./instrument-source.js";


const constantsURL = new URL("../../src/js/constants.js", import.meta.url);
const backgroundURL = new URL("../../src/js/background.js", import.meta.url);
const constantsSource = instrumentSource(await readFile(constantsURL, "utf8"), fileURLToPath(constantsURL));
const backgroundSource = instrumentSource(await readFile(backgroundURL, "utf8"), fileURLToPath(backgroundURL));


export function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {"Content-Type": "application/json"},
        ...init
    });
}


export function emptySearchResponse() {
    return jsonResponse({data: {newSearch: {teachers: {edges: []}}}});
}


export function currentCacheMetadata(overrides = {}) {
    return {
        cacheTimestamp: Date.now(),
        cacheSchemaVersion: 3,
        ...overrides
    };
}


export async function createBackgroundRuntime({
    fetchImpl = async () => emptySearchResponse(),
    storedItems = {},
    storageOverrides = {},
    consoleOverrides = {},
    mathRandom = 0.5,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
} = {}) {
    const storageItems = structuredClone(storedItems);
    const storageCalls = {get: [], set: [], clear: 0};
    const warnings = [];
    let messageListener = null;

    const defaultStorage = {
        async get(keys) {
            storageCalls.get.push(keys);
            return structuredClone(storageItems);
        },
        async set(items) {
            storageCalls.set.push(structuredClone(items));
            Object.assign(storageItems, structuredClone(items));
        },
        async clear() {
            storageCalls.clear += 1;
            for (const key of Object.keys(storageItems)) {
                delete storageItems[key];
            }
        }
    };
    const storage = {
        get: storageOverrides.get ?? defaultStorage.get,
        set: storageOverrides.set ?? defaultStorage.set,
        clear: storageOverrides.clear ?? defaultStorage.clear
    };
    const runtimeMath = {};
    Object.defineProperties(runtimeMath, Object.getOwnPropertyDescriptors(Math));
    Object.defineProperty(runtimeMath, "random", {
        configurable: true,
        value: () => mathRandom
    });
    const runtimeConsole = {
        ...console,
        warn(...args) {
            warnings.push(args);
        },
        ...consoleOverrides
    };

    const context = vm.createContext({
        AbortController,
        __coverage__: globalThis.__coverage__ ?? {},
        DOMException,
        Date,
        Error,
        Headers,
        JSON,
        Map,
        Math: runtimeMath,
        Number,
        Object,
        Promise,
        Reflect,
        Response,
        Set,
        String,
        TextDecoder,
        URL,
        URLSearchParams,
        Uint8Array,
        clearTimeout: clearTimeoutImpl,
        console: runtimeConsole,
        fetch: fetchImpl,
        importScripts() {},
        setTimeout: setTimeoutImpl,
        structuredClone,
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    }
                }
            },
            storage: {local: storage}
        }
    });
    context.self = context;

    vm.runInContext(constantsSource, context, {filename: "src/js/constants.js"});
    vm.runInContext(backgroundSource, context, {filename: "src/js/background.js"});
    await vm.runInContext("cacheReady", context);

    return {
        context,
        storageCalls,
        storageItems,
        warnings,
        evaluate(expression) {
            return vm.runInContext(expression, context);
        },
        async dispatchMessage(request, sender = {}) {
            if (!messageListener) {
                throw new Error("Background message listener was not registered");
            }
            return new Promise((resolve, reject) => {
                let responded = false;
                const sendResponse = response => {
                    responded = true;
                    resolve(response);
                };
                const keepChannelOpen = messageListener(request, sender, sendResponse);
                if (!keepChannelOpen && !responded) {
                    resolve(undefined);
                }
                setTimeout(() => {
                    if (!responded && keepChannelOpen) {
                        reject(new Error("Background message did not respond"));
                    }
                }, 2_000).unref?.();
            });
        }
    };
}
