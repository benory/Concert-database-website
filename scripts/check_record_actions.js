"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.resolve(__dirname, "..");
const context = {
  URL, URLSearchParams,
  window: { location: { href: "http://127.0.0.1:4000/program/?id=CON-1925_12_05a&extra=discard" } },
  document: { currentScript: { src: "http://127.0.0.1:4000/assets/js/core.js" } },
};
vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/core.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/record-actions.js"), "utf8"), context);
const actions = context.window.ConcertRecordActions;
const concerts = JSON.parse(fs.readFileSync(path.join(root, "assets/data/concerts.json"), "utf8"));
for (const concert of concerts) {
  const link = actions.permalink(concert, "https://concertsdatabase.org/");
  assert.equal(new URL(link).origin, "https://concertsdatabase.org");
  assert.equal(new URL(link).searchParams.size, 1);
  assert.equal(new URL(link).searchParams.get("id"), concert.id.replace(/^CON:/, ""));
  assert.ok(!link.includes("%3A"));
  for (const format of ["note", "bibliography"]) {
    const parts = actions.citationParts(concert, format, link, "7 October 2026");
    const text = parts.map((part) => part.text).join("");
    assert.ok(text.includes((concert.title || "Untitled concert").replace(/[.,;:]$/, "")));
    assert.ok(text.includes(concert.id));
    assert.ok(text.includes(link));
    assert.ok(text.includes("7 October 2026"));
    assert.ok(!text.includes("undefined"));
    assert.ok(parts.some((part) => !part.italic && part.text === "Early Music Concerts"));
    assert.ok(text.endsWith(`${link} (accessed 7 October 2026).`));
  }
  const targets = actions.shareTargets(concert, link);
  assert.equal(targets.length, 5);
  assert.equal(targets.map((target) => target.label).join(","), "X,Facebook,LinkedIn,WhatsApp,Email");
  assert.ok(targets.every((target) => target.icon));
  const whatsapp = new URL(targets.find((target) => target.label === "WhatsApp").href);
  assert.equal(whatsapp.origin, "https://wa.me");
  assert.ok(whatsapp.searchParams.get("text").includes(link));
  for (const target of targets) assert.ok(decodeURIComponent(target.href.replace(/\+/g, " ")).includes(link));
}
const example = concerts.find((row) => row.id === "CON:1925_12_05a");
const link = actions.permalink(example, "https://concertsdatabase.org/");
const archives = JSON.parse(fs.readFileSync(path.join(root, "assets/data/archives.json"), "utf8"));
const archiveName = archives.find((row) => row.id === example.archive_ids[0]).name;
const archivalSources = [`${archiveName}, ${example.signature}`];
const note = actions.citationParts(example, "note", link, "7 October 2026", archivalSources).map((part) => part.text).join("");
const bibliography = actions.citationParts(example, "bibliography", link, "7 October 2026", archivalSources).map((part) => part.text).join("");
assert.ok(note.startsWith(`“Collegium musicum,” concert program, 5 December 1925, ${archivalSources[0]}, `));
assert.ok(bibliography.startsWith(`“Collegium musicum.” Concert program, 5 December 1925, ${archivalSources[0]}. `));
assert.ok(!note.includes("Innsbruck, Austria"));
assert.ok(!bibliography.includes("Innsbruck, Austria"));
const multipleSources = [
  { id: "ARC:DE_UA_Freiburg", label: "Universitätsarchiv Freiburg, C101, folder 137" },
  { id: "ARC:DE_UA_Leipzig", label: "Universitätsarchiv Leipzig, NA Besseler 19, Bd 1/02" },
];
const multipleConcert = { ...example, image_source: "ARC:DE_UA_Leipzig" };
const otherDate = actions.citationParts(multipleConcert, "note", link, "8 November 2027", multipleSources).map((part) => part.text).join("");
assert.ok(otherDate.includes(multipleSources[1].label));
assert.ok(!otherDate.includes(multipleSources[0].label));
assert.ok(otherDate.endsWith(`${link} (accessed 8 November 2027).`));
assert.ok(!otherDate.includes("7 October 2026"));
for (const format of ["note", "bibliography"]) {
  const text = actions.citationParts(multipleConcert, format, link, "7 October 2026", multipleSources).map((part) => part.text).join("");
  assert.ok(text.includes(multipleSources[1].label));
  assert.ok(!text.includes(multipleSources[0].label));
}
assert.equal(actions.citationSource({ image_source: "ARC:DE_UA_Leipzig" }, multipleSources), multipleSources[1].label);
assert.equal(actions.citationSource({ image_source: " ARC:DE_UA_Leipzig " }, multipleSources), multipleSources[1].label);
assert.equal(actions.citationSource({ image_source: "ARC:other" }, multipleSources), multipleSources[0].label);
assert.equal(actions.citationSource({}, multipleSources), multipleSources[0].label);
assert.equal(actions.citationSource({}, []), "");
assert.equal(actions.citationSource({}, [{ id: "ARC:empty", label: " " }, multipleSources[1]]), multipleSources[1].label);
assert.equal(actions.citationSource({ image_source: "BIB:source" }, [{ id: "BIB:source", label: "Published source, p. 12" }, ...multipleSources]), "Published source, p. 12");
assert.notEqual(note, bibliography);
assert.equal(actions.permalink(example, "https://concertsdatabase.org/preview"), "https://concertsdatabase.org/preview/program/?id=1925_12_05a");
const sparse = { id: "CON:example", title: "<script>& ?" };
assert.ok(actions.citationParts(sparse, "note", actions.permalink(sparse, "https://concertsdatabase.org/"), "7 October 2026").every((part) => !part.text.includes("undefined")));
console.log(`Citation/share checks passed for ${concerts.length} concert records`);
