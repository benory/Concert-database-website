"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2] || path.resolve(__dirname, "..");
const css = fs.readFileSync(process.argv[3] || path.join(root, "assets/css/site.css"), "utf8");
const compactLabels = new Set([
  ".site-brand small",
  ".site-footer",
  ".leaflet-control-attribution",
  ".timeline-endpoints",
  ".record-id",
  ".eyebrow",
  ".data-table th",
  ".record-heading-date-label",
  ".event-strip dt",
  ".source-note h2",
  ".chart-axis-label",
  ".authority-id",
  ".program-hits-label",
  ".scan-toolbar",
  ".scan-button",
  ".quiet-button, .text-button, .scan-button, .record-tab, .workspace-tab",
  ".section-heading span",
  ".person-role",
  ".person-preview-authorities a, .person-preview-authorities > span",
  ".authority-links a, .authority-links > span",
  ".analysis-controls label, .metric-switcher legend",
  ".analysis-card figcaption span, .analysis-card-heading span",
  ".analysis-card-actions > span",
  ".analysis-range-heading",
  ".metric-switcher button",
  ".analysis-activity-heading .analysis-controls select",
  ".analysis-ranking-switcher button",
  ".rank-detail",
  ".documentation-nav strong",
  ".poster-image-box figcaption",
  ".map-status",
  ".date-control-head",
  ".timeline-control .date-control-head",
  ".record-dialog-button",
  ".record-permalink-label",
  "#share-dialog #share-permalink",
  ".search-meta",
  ".hero-poster-link",
  ".analysis-reset-button",
  ".person-preview-toggle"
]);
let readableStyles = 0;
let compactStyles = 0;
let exactSearchSize = false;
for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = rule[1].trim().replace(/\s+/g, " ");
  for (const size of rule[2].matchAll(/font-size:\s*([\d.]+)(rem|px)?\s*;/g)) {
    const pixels = Number(size[1]) * (size[2] === "rem" ? 16 : 1);
    if (pixels === 0) {
      assert.match(selector, /leaflet-control-zoom.*scan-zoom-button/, "Only CSS-drawn zoom icons may suppress their underlying text");
      continue;
    }
    assert.ok(pixels >= 12, `${selector} is below the 12px minimum: ${pixels}px`);
    if (pixels < 14) {
      assert.ok(compactLabels.has(selector), `${selector} is ordinary text and must be at least 14px`);
      compactStyles++;
    } else readableStyles++;
    if (selector === ".hero-search input") {
      assert.equal(pixels, 14, "Search-field text must be exactly 14px");
      exactSearchSize = true;
    }
  }
}
assert.ok(exactSearchSize);
assert.ok(/body\s*\{[^}]*font-size:\s*14px;/.test(css), "Default body text must be 14px");
assert.ok(readableStyles > compactStyles, "Most text styles must be at least 14px");
assert.match(css, /small,\s*sup,\s*sub\s*\{\s*font-size:\s*max\(12px,\s*0\.833333em\)/, "Nested small text must not shrink below 12px");
console.log(`Typography passed: ${readableStyles} text styles at least 14px, ${compactStyles} secondary styles at least 12px, search field exactly 14px`);
