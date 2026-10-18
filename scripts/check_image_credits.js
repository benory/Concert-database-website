"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = process.argv[2] || path.resolve(__dirname, "..");
const code = fs.readFileSync(process.argv[3] || path.join(root, "assets/js/program.js"), "utf8");
const renderCode = code.slice(code.indexOf("  function displayImageSource("), code.indexOf("  function displayScan("));
assert.ok(renderCode.includes("short_name"), "Image credits must support short archive names");
const archives = JSON.parse(fs.readFileSync(path.join(root, "assets/data/archives.json"), "utf8"));
const editions = JSON.parse(fs.readFileSync(path.join(root, "assets/data/editions.json"), "utf8"));
const section = { hidden: true };
const container = { textContent: "", replaceChildren(...nodes) { this.nodes = nodes; this.textContent = nodes.map((node) => node.textContent).join(""); } };
const context = vm.createContext({
  document: {
    getElementById: (id) => id === "program-image-source-section" ? section : container,
    createElement: (tagName) => ({ textContent: "", tagName }),
    createTextNode: (textContent) => ({ textContent }),
  },
  DB: { displayIdentifier: (id) => id.replace(/^(?:ARC|BIB|EDN):/, "").replaceAll("_", " ") },
  appendWithCitations: (node, text, titles) => { node.textContent = text; node.citationTitles = titles; },
});
vm.runInContext(renderCode, context);
const database = { archivesById: new Map(archives.map((archive) => [archive.id, archive])), editionsById: new Map(editions.map((edition) => [edition.id, edition])) };
for (const archive of archives) {
  context.displayImageSource({ image_source: archive.id, image_permissions: "yes" }, database);
  assert.equal(container.textContent, `Image reproduced by permission of ${archive.short_name || archive.name}.`);
  assert.equal(section.hidden, false);
}
for (const edition of editions) {
  const title = edition.container_title?.trim() || edition.article_title?.trim();
  context.displayImageSource({ image_source: edition.id, image_permissions: "yes" }, database);
  const credit = (title || context.DB.displayIdentifier(edition.id)).replace(/[.]+$/, "");
  assert.equal(container.textContent, `Image reproduced from ${credit}.`, "Publication image credit contains only the title");
  assert.equal(container.nodes[1].tagName, "span", "Publication credits are not bold");
  assert.deepEqual(Array.from(container.nodes[1].citationTitles), [credit]);
  assert.equal(section.hidden, false);
}
context.displayImageSource({ image_source: "BIB:Bruxelles_1927", image_permissions: "yes" }, database);
assert.equal(container.textContent, "Image reproduced from Les Concerts populaires de Bruxelles.");
database.editionsById.set("BIB:blank", { container_title: "  ", article_title: "Article title.", author: "Author", publication_year: "1927" });
context.displayImageSource({ image_source: "BIB:blank", image_permissions: "yes" }, database);
assert.equal(container.textContent, "Image reproduced from Article title.");
context.displayImageSource({ image_source: "BIB:Unknown_publication", image_permissions: "yes" }, database);
assert.equal(container.textContent, "Image reproduced from Unknown publication.");
const fullName = "Full archive name";
for (const shortName of [undefined, "", "   ", " Short archive name "]) {
  database.archivesById.set("ARC:test", { name: fullName, short_name: shortName });
  context.displayImageSource({ image_source: "ARC:test", image_permissions: "yes" }, database);
  assert.equal(container.textContent, `Image reproduced by permission of ${shortName?.trim() || fullName}.`);
}
context.displayImageSource({ image_source: "ARC:test", image_permissions: "no" }, database);
assert.equal(section.hidden, true);
assert.equal(container.textContent, "");
context.displayImageSource({ image_source: "BIB:Bruxelles_1927", image_permissions: "no" }, database);
assert.equal(section.hidden, true);
assert.equal(container.textContent, "");
context.displayImageSource({ image_source: "", image_permissions: "yes" }, database);
assert.equal(section.hidden, true);
console.log(`Image-credit checks passed for ${archives.length} archives, ${editions.length} publication titles, fallbacks, and permission protection`);
