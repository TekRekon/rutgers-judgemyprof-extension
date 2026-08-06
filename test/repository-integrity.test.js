import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

import {JSDOM} from "jsdom";


const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));


async function readJSON(relativePath) {
    return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
}


function extensionPath(relativePath) {
    return path.join(repositoryRoot, relativePath.replace(/^\.\//, ""));
}


test("manifest and package metadata agree on extension identity and version", async () => {
    const [manifest, packageJSON, packageLock] = await Promise.all([
        readJSON("manifest.json"),
        readJSON("package.json"),
        readJSON("package-lock.json")
    ]);

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, packageJSON.version);
    assert.equal(packageLock.version, packageJSON.version);
    assert.equal(packageLock.packages[""].version, packageJSON.version);
    assert.equal(packageLock.name, packageJSON.name);
    assert.equal(packageJSON.repository.url, "git+https://github.com/TekRekon/rutgers-judgemyprof-extension.git");
    assert.equal(packageJSON.engines.node, ">=22.12.0");
    assert.deepEqual(packageLock.packages[""].devDependencies, packageJSON.devDependencies);
});


test("manifest uses least-privilege APIs and every referenced local resource exists", async () => {
    const manifest = await readJSON("manifest.json");
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.deepEqual(manifest.host_permissions, ["https://www.ratemyprofessors.com/*"]);
    assert.equal(manifest.background.service_worker, "./src/js/background.js");
    assert.equal(manifest.action.default_popup, "./src/html/popup.html");
    assert.equal(manifest.content_scripts.length, 1);
    assert.equal(new Set(manifest.content_scripts[0].matches).size, manifest.content_scripts[0].matches.length);
    assert.equal(manifest.content_scripts[0].all_frames, true);

    const referencedFiles = new Set([
        manifest.background.service_worker,
        manifest.action.default_popup,
        ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css]),
        ...Object.values(manifest.icons),
        ...Object.values(manifest.action.default_icon)
    ]);
    await Promise.all(Array.from(referencedFiles, file => access(extensionPath(file))));
});


test("all declared icons are valid PNGs with dimensions matching their manifest keys", async () => {
    const manifest = await readJSON("manifest.json");
    for (const [declaredSize, iconPath] of Object.entries(manifest.icons)) {
        const buffer = await readFile(extensionPath(iconPath));
        assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(buffer.readUInt32BE(16), Number(declaredSize));
        assert.equal(buffer.readUInt32BE(20), Number(declaredSize));
        assert.equal(manifest.action.default_icon[declaredSize], iconPath);
    }
});


test("popup markup has unique IDs, accessible controls, and valid local assets", async () => {
    const html = await readFile(extensionPath("src/html/popup.html"), "utf8");
    const dom = new JSDOM(html);
    const {document} = dom.window;

    const ids = Array.from(document.querySelectorAll("[id]"), element => element.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(document.documentElement.lang, "en");
    assert.ok(document.querySelector("meta[name='viewport']"));
    assert.equal(document.querySelector("#reset-cache").type, "button");
    assert.equal(document.querySelector("#toggle-books-links").getAttribute("aria-pressed"), "false");
    assert.equal(document.querySelector("#status-message").getAttribute("aria-live"), "polite");
    assert.ok(document.querySelector("#logo").alt.trim());
    assert.equal(document.querySelectorAll("script[src]").length, 1);
    assert.equal(document.querySelector("script[src]").getAttribute("src"), "../js/popup.js");
    await access(extensionPath("src/assets/icons/logo.png"));
    dom.window.close();
});


test("production sources preserve secure endpoints, safe rendering, and required visibility CSS", async () => {
    const [background, content, popup, styles] = await Promise.all([
        readFile(extensionPath("src/js/background.js"), "utf8"),
        readFile(extensionPath("src/js/content.js"), "utf8"),
        readFile(extensionPath("src/js/popup.js"), "utf8"),
        readFile(extensionPath("src/css/styles.css"), "utf8")
    ]);

    assert.doesNotMatch(background, /Authorization|credentials\s*:\s*["']include/i);
    assert.match(background, /credentials:\s*["']omit["']/);
    assert.doesNotMatch(content, /http:\/\/(?:sims|sis|www\.ratemyprofessors|www\.google)/);
    assert.doesNotMatch(`${content}\n${popup}`, /\.innerHTML\s*=/);
    assert.match(content, /noopener,noreferrer/);
    assert.match(styles, /\.jmp-books-link-hidden\s*{[^}]*visibility:\s*hidden\s*!important/s);
});


test("CI installs the lockfile and enforces syntax plus measured coverage", async () => {
    const [workflow, packageJSON] = await Promise.all([
        readFile(extensionPath(".github/workflows/test.yml"), "utf8"),
        readJSON("package.json")
    ]);

    assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
    assert.match(workflow, /run:\s*npm ci/);
    assert.match(workflow, /run:\s*npm run check/);
    assert.match(packageJSON.scripts.check, /check:syntax/);
    assert.match(packageJSON.scripts.check, /test:coverage/);
    assert.match(packageJSON.scripts["test:coverage"], /COVERAGE=1/);
});
