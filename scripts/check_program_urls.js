"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/js/core.js"), "utf8");

function database(basePath) {
  const context = {
    URL, URLSearchParams,
    window: { location: { href: `https://example.org${basePath}/` } },
    document: { currentScript: { src: `https://example.org${basePath}/assets/js/core.js` } },
  };
  vm.runInNewContext(source, context);
  return context.window.ConcertDB;
}

const concerts = JSON.parse(fs.readFileSync(path.join(root, "assets/data/concerts.json"), "utf8"));
for (const basePath of ["", "/preview"]) {
  const db = database(basePath);
  for (const concert of concerts) {
    const slug = concert.id.replace(/^CON:/, "");
    const oldSlug = concert.id.replace(/^CON:/, "CON-");
    const expected = `${basePath}/program/?id=${encodeURIComponent(slug)}`;
    assert.equal(db.programUrl(concert.id), expected);
    assert.equal(db.programUrl(slug), expected);
    assert.equal(db.programUrl(oldSlug), expected);
    assert.equal(db.programId(slug), concert.id);
    for (const query of [`id=${slug}`, `id=${oldSlug}`, `id=${concert.id}`, `id=${encodeURIComponent(concert.id)}`]) {
      assert.equal(db.programId(new URLSearchParams(query).get("id")), concert.id);
    }
    const previewQuery = new URLSearchParams({ program: db.programSlug(concert.id) });
    assert.equal(db.programId(previewQuery.get("program")), concert.id);
    assert.ok(!expected.includes("CON"));
  }
  assert.equal(db.programId("COM:Josquin"), "COM:Josquin");
  assert.equal(db.programId("CON-1925_12_05a-extra"), "CON:1925_12_05a-extra");
  assert.equal(db.programId(""), "");
  assert.equal(db.programId("192a"), "CON:192a");
  assert.equal(db.programId("1925a"), "CON:1925a");
  assert.equal(db.programId("1925_12_05a-extra"), "CON:1925_12_05a-extra");
  assert.equal(db.programUrl("CON:1925_12_05a&other=value"), `${basePath}/program/?id=1925_12_05a%26other%3Dvalue`);
}
for (const file of ["index.html", "poster/index.html"]) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  assert.ok(!/\/program\/\?id=CON(?::|-|%3A)/i.test(html), `Old program URL in ${file}`);
}
console.log(`Program URLs: ${concerts.length} records, short/legacy forms and base paths passed`);
