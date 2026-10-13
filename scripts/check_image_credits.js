"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "assets/js/program.js"), "utf8");
const renderCode = code.slice(code.indexOf("  function displayImageSource("), code.indexOf("  function displayScan("));
assert.ok(renderCode.includes("short_name"), "Image credits must support short archive names");
const archives = JSON.parse(fs.readFileSync(path.join(root, "assets/data/archives.json"), "utf8"));
const section = { hidden: true };
const container = { textContent: "", replaceChildren(...nodes) { this.textContent = nodes.map((node) => node.textContent).join(""); } };
const context = vm.createContext({
  document: {
    getElementById: (id) => id === "program-image-source-section" ? section : container,
    createElement: () => ({ textContent: "" }),
    createTextNode: (textContent) => ({ textContent }),
  },
  DB: { displayIdentifier: (id) => id.replace(/^ARC:/, "").replaceAll("_", " ") },
  appendWithCitations: (node, text) => { node.textContent = text; },
});
vm.runInContext(renderCode, context);
const database = { archivesById: new Map(archives.map((archive) => [archive.id, archive])), editionsById: new Map() };
for (const archive of archives) {
  context.displayImageSource({ image_source: archive.id, image_permissions: "yes" }, database);
  assert.equal(container.textContent, `Image reproduced by permission of ${archive.short_name || archive.name}.`);
  assert.equal(section.hidden, false);
}
const fullName = "Full archive name";
for (const shortName of [undefined, "", "   ", " Short archive name "]) {
  database.archivesById.set("ARC:test", { name: fullName, short_name: shortName });
  context.displayImageSource({ image_source: "ARC:test", image_permissions: "yes" }, database);
  assert.equal(container.textContent, `Image reproduced by permission of ${shortName?.trim() || fullName}.`);
}
context.displayImageSource({ image_source: "ARC:test", image_permissions: "no" }, database);
assert.equal(section.hidden, true);
assert.equal(container.textContent, "");
context.displayImageSource({ image_source: "", image_permissions: "yes" }, database);
assert.equal(section.hidden, true);
console.log(`Image-credit checks passed for ${archives.length} archives, blank-name fallbacks, and permission protection`);
