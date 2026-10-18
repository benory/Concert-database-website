"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const root = process.argv[2] || path.resolve(__dirname, "..");
const stage = process.argv[3];
const read = (file, staged) => fs.readFileSync(stage ? path.join(stage, staged) : path.join(root, file), "utf8");
const code = read("assets/js/program.js", "program.js");
const renderCode = code.slice(code.indexOf("  function displaySourceUrl("), code.indexOf("  function displayImageSource("));
const section = { hidden: true };
const container = { nodes: [], replaceChildren() { this.nodes = []; }, append(node) { this.nodes.push(node); } };
const context = vm.createContext({ URL, document: {
  getElementById: (id) => id === "program-source-url-section" ? section : container,
  createElement: (tagName) => ({ tagName }),
} });
vm.runInContext(renderCode, context);
const concerts = JSON.parse(read("assets/data/concerts.json", "data/concerts.json"));
const linked = concerts.filter((concert) => concert.externally_hosted_image);
assert.ok(linked.length > 0);
for (const concert of concerts) {
  context.displaySourceUrl(concert);
  assert.equal(section.hidden, !concert.externally_hosted_image);
  assert.equal(container.nodes.length, concert.externally_hosted_image ? 1 : 0);
  if (!concert.externally_hosted_image) continue;
  const link = container.nodes[0];
  assert.equal(link.tagName, "a");
  assert.equal(link.textContent, concert.externally_hosted_image);
  assert.equal(link.href, new URL(concert.externally_hosted_image).href);
  assert.equal(link.target, "_blank");
  assert.equal(link.rel, "noopener noreferrer");
  if (concert.image_permissions !== "yes") assert.ok(!concert.scan_url && !concert.image_url);
}
assert.ok(linked.some((concert) => concert.image_permissions !== "yes"), "Outbound links do not require reproduction permission");
for (const value of ["", "   ", "javascript:alert(1)", "data:text/html,test", "//example.org/image", "not a URL", "https://user:password@example.org/image"]) {
  context.displaySourceUrl({ externally_hosted_image: value });
  assert.equal(section.hidden, true);
  assert.equal(container.nodes.length, 0);
}
context.displaySourceUrl({ externally_hosted_image: " https://example.org/image?a=1&b=2 " });
assert.equal(container.nodes[0].textContent, "https://example.org/image?a=1&b=2");
context.displaySourceUrl({ scan_url: "https://programs.concertsdatabase.org/pdf/CON-test.pdf" });
assert.equal(section.hidden, true, "Our hosted scan is not an external source URL");
const html = read("program/index.html", "index.html");
assert.ok(html.indexOf('id="program-image-source-section"') < html.indexOf('id="program-source-url-section"'));
assert.ok(html.indexOf('id="program-source-url-section"') < html.indexOf('aria-labelledby="program-people-title"'));
assert.match(html, /<h2 id="source-url-title">Source URL<\/h2>/);
assert.match(code, /displayImageSource\(concert, database\);\s*displaySourceUrl\(concert\);/);

// Exercise the normalizer itself, without downloading data or changing files.
const normalizer = stage ? path.join(stage, "normalize_data.rb") : path.join(root, "scripts/normalize_data.rb");
const ruby = 'PROGRAM_SCAN_BASE_URL = "https://programs.concertsdatabase.org/pdf"; code = File.read(ARGV.fetch(0)); eval(code[code.index("def clean")...code.index("# The live Programs")]); puts JSON.generate(JSON.parse(STDIN.read).map { |row| normalize_concert(row) })';
const fixtures = ["yes", "no", ""].map((permission) => ({ "Concert ID": "CON:test", "Image Permissions": permission,
  "Externally Hosted Image": "https://example.org/program", "Image URL": "https://example.org/image.jpg" }));
fixtures.push({ "Concert ID": "CON:invalid", "Externally Hosted Image": "javascript:alert(1)" });
const result = spawnSync("ruby", ["-rjson", "-e", ruby, normalizer], { input: JSON.stringify(fixtures), encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const normalized = JSON.parse(result.stdout);
assert.equal(normalized[0].scan_url, "https://programs.concertsdatabase.org/pdf/CON-test.pdf");
for (const concert of normalized.slice(1, 3)) {
  assert.equal(concert.externally_hosted_image, "https://example.org/program");
  assert.ok(!concert.scan_url && !concert.image_url);
}
assert.ok(!normalized[3].externally_hosted_image && !normalized[3].scan_url);
console.log(`Source URL checks passed: ${linked.length} external links, placement, safe URLs, and reproduction-permission separation`);
