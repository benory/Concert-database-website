"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.resolve(__dirname, "..");
const stage = process.argv[3];
const code = fs.readFileSync(stage ? path.join(stage, "maps.js") : path.join(root, "assets/js/maps.js"), "utf8");
const rendering = code.slice(code.indexOf("  function renderHistogram("), code.indexOf("  function setTimelineConcerts("));
function element() {
  return { children: [], dataset: {}, style: { setProperty() {} }, attributes: {},
    classList: { toggle(name, active) { this[name] = active; } },
    append(child) { this.children.push(child); },
    replaceChildren(fragment) { this.children = fragment.children; },
    querySelectorAll() { return this.children; },
    setAttribute(name, value) { this.attributes[name] = value; } };
}
const context = vm.createContext({ TIMELINE_MIN: 1915, TIMELINE_MAX: 1960,
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  document: { createDocumentFragment: element, createElement: element } });
vm.runInContext(rendering, context);
const histogram = element();
context.renderHistogram(histogram, [{ year: 1892 }, { year: 1915 }, { year: 1916 }]);
assert.equal(histogram.children[0].title, "≤1915: 2 concerts");
assert.equal(histogram.children[1].title, "1916: 1 concerts");
const startInput = element();
const endInput = element();
const output = element();
function setRange(start, end) {
  startInput.value = String(start);
  endInput.value = String(end);
  context.updateTimeline({ startInput, endInput, output, histogram });
}
setRange(1915, 1960);
assert.equal(output.textContent, "≤1915–1960");
assert.equal(startInput.attributes["aria-valuetext"], "≤1915");
setRange(1915, 1915);
assert.equal(output.textContent, "≤1915");
assert.equal(endInput.attributes["aria-valuetext"], "≤1915");
assert.equal(histogram.children[0].classList["is-outside-range"], false);
assert.equal(histogram.children[1].classList["is-outside-range"], true);
setRange(1924, 1930);
assert.equal(output.textContent, "1924–1930");
for (const [file, staged] of [["index.html", "index.html"], ["concerts/index.html", "concerts.html"]]) {
  const html = fs.readFileSync(stage ? path.join(stage, staged) : path.join(root, file), "utf8");
  assert.ok(html.includes("≤1915–1960") && html.includes("<span>≤1915</span>"));
}
console.log("Timeline labels passed: ≤1915 in histogram tooltips, slider text, accessibility labels, and initial HTML; early-year grouping unchanged");
