"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.resolve(__dirname, "..");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/bibliography.js"), "utf8"), context);
const note = context.window.ConcertBibliography.note;
const entries = JSON.parse(fs.readFileSync(path.join(root, "assets/data/editions.json"), "utf8"))
  .filter((entry) => entry.id.startsWith("BIB:"));
const byId = new Map(entries.map((entry) => [entry.id, entry]));
assert.equal(note(byId.get("BIB:Bruxelles_1927"), "p. 142"), "Les Concerts populaires de Bruxelles (Brussels: Veuve Monnom, 1927), 142.");
assert.equal(note(byId.get("BIB:Smijers_1927"), "p. 111"), "Albert Smijers, “Josquin des Prez,” Proceedings of the Musical Association 53 (1927): 111.");
assert.equal(note(byId.get("BIB:Leech_Wilkinson_2002"), "pp. 58–59"), "Daniel Leech-Wilkinson, The Modern Invention of Medieval Music: Scholarship, Ideology, Performance (Cambridge: Cambridge University Press, 2002), 58–59.");
assert.equal(note(byId.get("BIB:Reidemeister_Gutmann_1983"), "p. 12"), "Peter Reidemeister and Veronika Gutmann, eds., Alte Musik: Praxis und Reflexion (Winterthur: Amadeus, 1983), 12.");
assert.equal(note(byId.get("BIB:Blume_1976"), "p. 18"), "Friedrich Blume, “Josquin des Prez: The Man and the Music,” in Josquin des Prez: Proceedings of the International Josquin Festival-Conference held at The Juilliard School at Lincoln Center in New York City, 21–25 June 1971, ed. Edward E. Lowinsky and Bonnie J. Blackburn (London: Oxford University Press, 1976), 18.");
assert.equal(note(byId.get("BIB:Hiam_2005"), "p. 53"), "Jonathan Hiam, “Music at Black Mountain College: The European Years, 1939–46” (PhD diss., University of North Carolina at Chapel Hill, 2005), 53.");
assert.equal(note({}), "");
for (const entry of entries) {
  for (const pages of [undefined, "p. 42", "pp. 43–44"]) {
    const formatted = note(entry, pages);
    assert.ok(!/undefined|null|\(\)|\.\.,|,\s*,/.test(formatted), entry.id);
    if (pages) assert.ok(formatted.endsWith(pages.replace(/^pp?\.\s*/, "") + "."), entry.id);
    if (entry.author) assert.ok(formatted.startsWith(entry.author), entry.id);
    if (entry.container_title) assert.ok(formatted.includes(entry.container_title), entry.id);
  }
}
console.log(`Chicago notes: ${entries.length} Bibliography records and specific page overrides passed`);
