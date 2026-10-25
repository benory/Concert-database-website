"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Optional second directory lets this test run against staged browser scripts.
const root = process.argv[2] || path.resolve(__dirname, "..");
const scriptsRoot = process.argv[3] || path.join(root, "assets/js");
const context = {
  URL, URLSearchParams,
  window: { location: { href: "https://example.org/" } },
  document: { currentScript: { src: "https://example.org/assets/js/core.js" } },
  fetch: async (resource) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(root, resource.replace(/^\//, "")), "utf8")),
  }),
};

vm.runInNewContext(fs.readFileSync(path.join(scriptsRoot, "core.js"), "utf8"), context);
vm.runInNewContext(fs.readFileSync(path.join(scriptsRoot, "concert-results.js"), "utf8"), context);

function identifiers(concerts) {
  return Array.from(concerts, (concert) => concert.id).sort();
}

function rowIdentifiers(programs) {
  return Array.from(programs, (program) => program.piece_id).sort();
}

async function main() {
  const DB = context.window.ConcertDB;
  const results = context.window.ConcertResults;
  vm.runInNewContext(fs.readFileSync(path.join(scriptsRoot, "analysis-data.js"), "utf8"), context);
  const analysis = context.window.ConcertAnalysisData;
  assert.ok(results, "ConcertResults helper must be exported");
  for (const method of ["composerMatches", "authorityConcerts", "chronologyConcerts", "searchQuery", "hits"]) {
    assert.equal(typeof results[method], "function", `Missing ${method}`);
  }
  const database = await DB.loadData();
  const josquin = "COM:Josquin_des_Prez";
  const gurlitt = "PER:Wilibald_Gurlitt";
  const source = "SRC:Bamberg_115";
  const selectedComposer = { composer: josquin };
  const expectedComposer = database.concerts.filter((concert) => concert.programs.some((program) => program.composer_ids.includes(josquin)));
  const expectedPerson = database.concerts.filter((concert) => ["introduction", "direction", "performers"].some((group) => (concert[group] || []).some((person) => person.id === gurlitt)));
  const expectedSource = database.concerts.filter((concert) => concert.programs.some((program) => program.source_ids.includes(source)));

  assert.equal(database.composersById.get(josquin).name, "Josquin des Prez", "Use the authority-sheet name, not a program transcription");
  assert.deepEqual(identifiers(results.authorityConcerts(database, selectedComposer)), identifiers(expectedComposer));
  assert.deepEqual(identifiers(results.authorityConcerts(database, { person: gurlitt })), identifiers(expectedPerson));
  assert.deepEqual(identifiers(results.authorityConcerts(database, { source })), identifiers(expectedSource));
  assert.deepEqual(identifiers(results.authorityConcerts(database, {})), identifiers(database.concerts));
  assert.deepEqual(identifiers(results.chronologyConcerts(database, {})), identifiers(database.concerts));
  assert.equal(new Set(results.authorityConcerts(database, selectedComposer).map((concert) => concert.id)).size, expectedComposer.length, "List each concert once, not once per piece");
  assert.equal(results.authorityConcerts(database, { composer: "COM:Does_not_exist" }).length, 0);

  // Exact authority ID membership includes the second attribution, not just the
  // first ID or a raw semicolon-separated composer_id value.
  const multipleAttribution = database.programs.find((program) => program.composer_ids.length > 1);
  assert.ok(multipleAttribution, "Fixture needs a multiply attributed piece");
  for (const composer of multipleAttribution.composer_ids) {
    assert.ok(results.composerMatches(multipleAttribution, { composer }, database));
    const concert = database.concertsById.get(multipleAttribution.concert_id);
    assert.ok(rowIdentifiers(results.hits(concert, { composer }, database).programs).includes(multipleAttribution.piece_id));
  }
  assert.ok(!results.composerMatches(multipleAttribution, { composer: "COM:Does_not_exist" }, database));

  // An authority selection may be represented by a printed-name alias which is
  // absent from the concert's generic search text. It must not lose concerts.
  const aliasFilters = { composer: josquin, query: "De Pres" };
  assert.ok(database.composersById.get(josquin).aliases.includes(aliasFilters.query));
  assert.deepEqual(identifiers(results.chronologyConcerts(database, aliasFilters)), identifiers(expectedComposer));
  assert.deepEqual(identifiers(results.authorityConcerts(database, { composerName: "De Pres" })), identifiers(expectedComposer));
  const fixtureProgram = {
    composer_ids: [josquin],
    composer_id: josquin,
    canonical_composer: "Josquin des Prez",
    canonical_composers: ["Josquin des Prez"],
    composer_name: "Josquin des Prés",
    composer_credits: [{ id: josquin, name: "Josquin des Prés", canonicalName: "Josquin des Prez" }],
  };
  assert.ok(results.composerMatches(fixtureProgram, { composerName: "Josquin des Prez" }, database));
  assert.ok(results.composerMatches(fixtureProgram, { composerName: "Josquin des Prés" }, database));
  assert.ok(!results.composerMatches(fixtureProgram, { composerName: "Josquin" }, database), "A selected name must match exactly; use free-text query for partial names");

  // Selected labels live on the removable button, leaving the search field free
  // for a second query. Older URLs put that same label in q; remove only this
  // redundancy, never an independent refinement or an unselected text search.
  assert.equal(results.searchQuery({}, database), "");
  assert.equal(results.searchQuery({ query: "" }, database), "");
  assert.equal(results.searchQuery({ query: "  ---  " }, database), "");
  assert.equal(results.searchQuery({ query: "Josquin des Prez" }, database), "Josquin des Prez");
  assert.equal(results.searchQuery({ composer: josquin }, database), "");
  assert.equal(results.searchQuery({ composer: josquin, query: "Josquin des Prez" }, database), "");
  assert.equal(results.searchQuery(aliasFilters, database), "", "A redundant legacy composer alias should leave the field blank");
  assert.equal(results.searchQuery({ composerName: "De Pres", query: "De Pres" }, database), "");
  assert.equal(results.searchQuery({ composer: josquin, query: " Innsbruck " }, database), " Innsbruck ", "Preserve the original additional query, including its spelling");
  assert.equal(results.searchQuery({ person: gurlitt }, database), "");
  assert.equal(results.searchQuery({ person: gurlitt, query: "Wilibald Gurlitt" }, database), "");
  assert.equal(results.searchQuery({ person: gurlitt, query: "Freiburg" }, database), "Freiburg");
  const musicalSource = database.sourcesById.get(source);
  for (const query of [musicalSource.sigla, musicalSource.alias, source, results.selectionLabel({ source }, database)].filter(Boolean)) {
    assert.equal(results.searchQuery({ source, query }, database), "", "Source names, sigla, aliases and IDs are redundant legacy q values");
  }
  assert.equal(results.searchQuery({ source, query: "Josquin" }, database), "Josquin");
  for (const filters of [{ city: "Innsbruck" }, { country: "Austria" }, { sourceText: "Source not yet matched" }]) {
    const label = results.selectionLabel(filters, database);
    assert.equal(results.searchQuery(filters, database), "");
    assert.equal(results.searchQuery({ ...filters, query: label }, database), "");
    assert.equal(results.searchQuery({ ...filters, query: "Josquin" }, database), "Josquin");
    assert.equal(results.selectionLabel({ ...filters, query: "Josquin" }, database), label, "Refining a selection must keep the original label on its button");
  }
  for (const filters of [{ composer: josquin }, { person: gurlitt }, { source }]) {
    const label = results.selectionLabel(filters, database);
    assert.equal(results.selectionLabel({ ...filters, query: "Innsbruck" }, database), label, "Additional typing must not replace the selected-authority label");
    assert.equal(results.searchQuery({ ...filters, query: "Innsbruck" }, database), "Innsbruck");
  }

  // Additional free text still intersects a selected authority.
  const locationFilters = { composer: josquin, query: "Innsbruck" };
  const expectedLocation = expectedComposer.filter((concert) => concert.searchText.includes(DB.normalize(locationFilters.query)));
  assert.deepEqual(identifiers(results.chronologyConcerts(database, locationFilters)), identifiers(expectedLocation));
  const coComposerFilters = { composer: "COM:Michael_Praetorius", query: "Balthasar Resinarius" };
  const coComposerAuthorityConcerts = results.authorityConcerts(database, coComposerFilters);
  const coComposerTerms = DB.normalize(coComposerFilters.query).split(/\s+/);
  const expectedCoComposerQuery = coComposerAuthorityConcerts.filter((concert) => coComposerTerms.every((term) => concert.searchText.includes(term)));
  assert.ok(expectedCoComposerQuery.length < coComposerAuthorityConcerts.length, "Fixture must distinguish additional co-composer text from the selected authority");
  assert.deepEqual(identifiers(results.chronologyConcerts(database, coComposerFilters)), identifiers(expectedCoComposerQuery), "A co-composer's name is not a redundant label for the selected composer");
  assert.equal(results.searchQuery(coComposerFilters, database), coComposerFilters.query, "Do not erase a distinct co-composer refinement on reload");
  assert.deepEqual(identifiers(results.authorityConcerts(database, { composer: josquin, person: gurlitt })), identifiers(expectedComposer.filter((concert) => expectedPerson.includes(concert))));
  for (const [kind, field] of [["city", "city"], ["country", "country"]]) {
    const representative = database.concerts.find((concert) => concert[field]);
    const expected = database.concerts.filter((concert) => DB.normalize(concert[field]) === DB.normalize(representative[field]));
    assert.deepEqual(identifiers(results.authorityConcerts(database, { [kind]: representative[field] })), identifiers(expected));
  }
  const unlinked = database.programs.find((program) => program.source_id && !program.source_ids.length);
  if (unlinked) {
    const expected = database.concerts.filter((concert) => concert.programs.some((program) => DB.normalize(program.source_id) === DB.normalize(unlinked.source_id)));
    assert.deepEqual(identifiers(results.authorityConcerts(database, { sourceText: unlinked.source_id })), identifiers(expected));
  }

  // Date filtering belongs to the timeline; these helpers establish the complete
  // searched population used by the histogram, regardless of slider bounds.
  assert.deepEqual(identifiers(results.chronologyConcerts(database, { ...selectedComposer, from: 2000, to: 2000 })), identifiers(expectedComposer));

  for (const concert of database.concerts) {
    const unfiltered = results.hits(concert, {}, database);
    assert.equal(unfiltered.programs.length, 0, "Unfiltered entries must not expand to show every program item");
    assert.equal(unfiltered.people.length, 0, "Unfiltered entries must not repeat all participants");

    const composerHits = results.hits(concert, selectedComposer, database);
    assert.deepEqual(rowIdentifiers(composerHits.programs), rowIdentifiers(concert.programs.filter((program) => program.composer_ids.includes(josquin))));
    assert.equal(composerHits.people.length, 0);

    const sourceHits = results.hits(concert, { source }, database);
    assert.deepEqual(rowIdentifiers(sourceHits.programs), rowIdentifiers(concert.programs.filter((program) => program.source_ids.includes(source))));
  }

  const multiplePieces = expectedComposer.find((concert) => concert.programs.filter((program) => program.composer_ids.includes(josquin)).length > 1);
  assert.ok(multiplePieces);
  const pieces = results.hits(multiplePieces, selectedComposer, database).programs;
  assert.ok(pieces.length > 1, "Expanded concert entries must include every matching piece on its own line");
  assert.deepEqual(Array.from(pieces, (program) => program.order), Array.from(pieces, (program) => program.order).sort((a, b) => a - b));

  const twoRoles = expectedPerson.find((concert) => (concert.introduction || []).some((person) => person.id === gurlitt) && (concert.direction || []).some((person) => person.id === gurlitt));
  assert.ok(twoRoles);
  const personHits = results.hits(twoRoles, { person: gurlitt }, database);
  assert.equal(personHits.programs.length, 0);
  assert.ok(personHits.people.every((person) => person.id === gurlitt && person.name === "Wilibald Gurlitt"));
  const roles = personHits.people.map((person) => person.role).join(" / ");
  assert.match(roles, /introduc/i, "Keep the introduction role");
  assert.match(roles, /direct/i, "Keep the direction role");

  const textConcert = expectedComposer.find((concert) => concert.programs.some((program) => program.composer_ids.includes("COM:Anonymous")));
  assert.ok(textConcert);
  const textHits = results.hits(textConcert, { query: "Josquin" }, database);
  assert.ok(textHits.programs.length > 0);
  assert.ok(textHits.programs.every((program) => DB.normalize([program.work_name, program.standardized_work_name, program.composer_name, program.canonical_composer].join(" ")).includes("josquin")), "Text search expands matching pieces, not the entire program");
  const personTextHits = results.hits(twoRoles, { query: "Wilibald Gurlitt" }, database);
  assert.ok(personTextHits.people.length > 0);
  assert.ok(personTextHits.people.every((person) => person.id === gurlitt));

  // Central routing covers homepage autocomplete, piece/program links, person
  // popups and analysis without hard-coding a second composer results page.
  for (const basePath of ["", "/preview"]) {
    const routingContext = {
      URL, URLSearchParams,
      window: { location: { href: `https://example.org${basePath}/` } },
      document: { currentScript: { src: `https://example.org${basePath}/assets/js/core.js` } },
    };
    vm.runInNewContext(fs.readFileSync(path.join(scriptsRoot, "core.js"), "utf8"), routingContext);
    const routingDB = routingContext.window.ConcertDB;
    const destination = new URL(routingDB.composerUrl({ id: josquin, name: "Josquin des Prez" }), "https://example.org");
    assert.equal(destination.pathname, `${basePath}/concerts/`);
    assert.equal(destination.searchParams.get("composer"), josquin);
    assert.equal(destination.searchParams.size, 1);
    const nameDestination = new URL(routingDB.composerUrl({ name: "Josquin des Prés" }), "https://example.org");
    assert.equal(nameDestination.searchParams.get("composer_name"), "Josquin des Prés");
    assert.ok(!nameDestination.searchParams.has("q"), "A selected composer name is not just a loose text query");

    const oldParameters = new URLSearchParams({ id: josquin, q: "Innsbruck", from: "1920", to: "1950", program: "1925_12_05a" });
    let redirected = "";
    routingContext.window.location = {
      href: `https://example.org${basePath}/composer/?${oldParameters}`,
      search: `?${oldParameters}`,
      replace: (value) => { redirected = value; },
    };
    vm.runInNewContext(fs.readFileSync(path.join(scriptsRoot, "composer-redirect.js"), "utf8"), routingContext);
    const redirectedUrl = new URL(redirected);
    assert.equal(redirectedUrl.pathname, `${basePath}/concerts/`);
    assert.equal(redirectedUrl.searchParams.get("composer"), josquin);
    for (const key of ["q", "from", "to", "program"]) {
      assert.equal(redirectedUrl.searchParams.get(key), oldParameters.get(key));
    }
  }

  // Analysis title groups must show the same concerts and matching entries in
  // the shared browser, without confusing identically named compositions.
  for (const row of analysis.ranking(database, database.concerts, "pieces").slice(0, 20)) {
    const filters = { piece: row.key };
    const found = results.chronologyConcerts(database, filters);
    assert.equal(found.length, row.count);
    assert.deepEqual(identifiers(found), Array.from(row.concertIds).sort());
    assert.equal(results.selectionLabel(filters, database), row.name);
    assert.equal(results.searchQuery({ ...filters, query: row.name }, database), "");
    assert.equal(results.searchQuery({ ...filters, query: "Innsbruck" }, database), "Innsbruck");
    for (const concert of found) {
      assert.deepEqual(rowIdentifiers(results.hits(concert, filters, database).programs),
        rowIdentifiers(concert.programs.filter((program) => DB.pieceGroupKey(program) === row.key)));
    }
    const place = analysis.placeKey(found[0]);
    assert.deepEqual(identifiers(results.chronologyConcerts(database, { ...filters, place })),
      identifiers(found.filter((concert) => analysis.placeKey(concert) === place)));
  }
  assert.equal(results.chronologyConcerts(database, { piece: "missing piece" }).length, 0);
  assert.equal(results.selectionLabel({ piece: "missing piece" }, database), "Selected piece");
  const firstPiece = { piece_id: "one", work_name: "Ave Maria", standardized_work_name: "Ave Maria", composer_ids: ["COM:A"] };
  const samePiece = { ...firstPiece, piece_id: "two" };
  const otherComposer = { ...firstPiece, piece_id: "three", composer_ids: ["COM:B"] };
  const otherWording = { ...firstPiece, piece_id: "four", work_name: "Ave Maria Virgo" };
  assert.notEqual(DB.pieceGroupKey(firstPiece), DB.pieceGroupKey(otherComposer));
  assert.notEqual(DB.pieceGroupKey(firstPiece), DB.pieceGroupKey(otherWording));
  assert.equal(DB.pieceGroupKey({ ...firstPiece, composer_ids: ["COM:B", "COM:A", "COM:A"] }),
    DB.pieceGroupKey({ ...firstPiece, composer_ids: ["COM:A", "COM:B"] }));
  const pieceFixture = { programs: [firstPiece, samePiece, otherComposer, otherWording],
    concerts: [{ id: "first", programs: [firstPiece, samePiece] }, { id: "second", programs: [otherComposer, otherWording] }] };
  const fixtureSelection = { piece: DB.pieceGroupKey(firstPiece) };
  assert.deepEqual(identifiers(results.authorityConcerts(pieceFixture, fixtureSelection)), ["first"]);
  assert.equal(results.hits(pieceFixture.concerts[0], fixtureSelection, { ...pieceFixture,
    composersById: new Map([["COM:A", { name: "Composer A" }]]) }).programs.length, 2);
  assert.equal(results.hits(pieceFixture.concerts[1], fixtureSelection, { ...pieceFixture,
    composersById: new Map([["COM:A", { name: "Composer A" }]]) }).programs.length, 0);

  console.log(`Unified concert results: ${database.concerts.length} records; composer/person/source/piece hits, authority aliases, grouping and free text passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
