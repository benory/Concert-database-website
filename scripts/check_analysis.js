"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.resolve(__dirname, "..");
const scriptsRoot = process.argv[3] || path.join(root, "assets/js");

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.attributes = {};
    this.events = {};
    this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    this.classList = { toggle() {} };
    this.value = "";
    this.innerHTML = "";
    this.textContent = "";
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, action) { this.events[key] = action; }
  add() {}
  trigger(key) { this.events[key]?.(); }
}

const ids = ["page", "year-chart", "ranking-chart", "place-table", "summary", "group", "place-filter", "ranking-more", "place-more",
  "ranking-visible-count", "place-visible-count", "start", "end", "date-output", "date-track", "date-reset", "first-year", "last-year",
  "ranking-title", "ranking-unit", "ranking-note", "activity-title"];
const nodes = new Map(ids.map((id) => [`analysis-${id}`, new Element()]));
const metrics = ["programs", "performances"].map((analysisMetric) => new Element({ analysisMetric }));
const categories = ["composers", "pieces", "sources", "editions", "performers"].map((analysisRanking) => new Element({ analysisRanking }));
let persisted = "";
const context = {
  URL, URLSearchParams,
  window: { location: { href: "https://example.org/analysis/", pathname: "/analysis/", search: "" } },
  document: {
    currentScript: { src: "https://example.org/assets/js/core.js" },
    getElementById: (id) => nodes.get(id),
    querySelectorAll: (selector) => selector.includes("data-analysis-ranking") ? categories : metrics,
    querySelector: (selector) => selector.startsWith("#") ? nodes.get(selector.slice(1))
      : (selector.includes("data-analysis-ranking") ? categories : metrics).find((element) => element.attributes["aria-pressed"] === "true"),
  },
  history: { replaceState: (_a, _b, url) => { persisted = url; } },
  Option: function Option() {},
  fetch: async (resource) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, resource.replace(/^\//, "")), "utf8")) }),
};

function load(script) { vm.runInNewContext(fs.readFileSync(path.join(scriptsRoot, script), "utf8"), context); }

async function main() {
  load("core.js");
  load("bibliography.js");
  load("analysis-data.js");
  const DB = context.window.ConcertDB;
  const A = context.window.ConcertAnalysisData;
  const database = await DB.loadData();
  const full = { start: A.bounds(database).min, end: A.bounds(database).max };
  assert.equal(A.selectedConcerts(database, full).length, database.concerts.length);
  assert.equal(A.range(database, "bad", null).start, 1915);
  assert.equal(A.range(database, 1892, 1900).end, 1915, "Old early-year URLs map to the combined bin");
  assert.equal(A.range(database, 9000, -1).end, database.maxYear);
  const early = A.selectedConcerts(database, { start: 1924, end: 1925 });
  assert.ok(early.length > 0 && early.length < database.concerts.length);
  assert.ok(early.every((concert) => concert.year >= 1924 && concert.year <= 1925));
  assert.ok(!early.some((concert) => !concert.year));
  assert.equal(A.selectedConcerts(database, { ...full, place: "Unknown place" }).length, 0);

  for (const type of Object.keys(A.types)) {
    const ranked = A.ranking(database, early, type);
    assert.ok(ranked.every((row, index) => !index || ranked[index - 1].count >= row.count));
    assert.ok(ranked.every((row) => [...row.concertIds].every((id) => early.some((concert) => concert.id === id))));
    assert.equal(A.ranking(database, [], type).length, 0);
  }
  const allComposers = A.ranking(database, database.concerts, "composers");
  for (const row of allComposers.filter((row) => row.id)) {
    assert.equal(row.name, database.composersById.get(row.id)?.name || DB.displayIdentifier(row.id));
    assert.equal(row.count, database.programs.filter((program) => program.composer_ids.includes(row.id)
      && database.concertsById.has(program.concert_id)).length);
  }

  // Deliberately identical titles are only provisional groups. Different composer
  // authorities must remain separate; multiple references/roles never overcount.
  const program = { work_name: "Ave Maria", composer_ids: ["COM:A", "COM:A"], source_ids: ["SRC:A", "SRC:A"], edition: "EDN:A; EDN:B; EDN:A" };
  const fixture = {
    ...database,
    composersById: new Map([["COM:A", { name: "Josquin" }], ["COM:B", { name: "Other composer" }]]),
    sourcesById: new Map([["SRC:A", { sigla: "D-Bas", alias: "Bamberg" }]]),
    editionsById: new Map([["EDN:A", { container_title: "Edition A" }], ["EDN:B", { container_title: "Edition B" }]]),
    peopleById: new Map([["PER:A", { name: "Authority name" }]]),
  };
  const concerts = [
    { id: "one", programs: [program, { ...program }, { ...program, composer_ids: ["COM:B"] }], direction: [{ id: "PER:A", name: "Printed name" }], performers: [{ id: "PER:A", name: "Printed name", role: "Violin" }], introduction: [{ id: "PER:B", name: "Speaker" }] },
    { id: "two", programs: [program], direction: [{ id: "PER:A", name: "Printed name" }], performers: [] },
  ];
  const pieces = A.ranking(fixture, concerts, "pieces");
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].count, 2);
  assert.equal(pieces[0].items, 3);
  assert.equal(A.ranking(fixture, concerts, "composers")[0].count, 3);
  assert.equal(A.ranking(fixture, concerts, "sources")[0].name, "D-Bas (Bamberg)");
  assert.equal(A.ranking(fixture, concerts, "sources")[0].count, 2);
  const editions = A.ranking(fixture, concerts, "editions");
  assert.equal(editions.length, 2);
  assert.ok(editions.every((row) => row.count === 2));
  const performers = A.ranking(fixture, concerts, "performers");
  assert.equal(performers.length, 1);
  assert.equal(performers[0].name, "Authority name");
  assert.equal(performers[0].count, 2);
  assert.deepEqual([...performers[0].roles].sort(), ["Director", "Violin"]);
  const activity = A.activity(database, early, { group: "year", metric: "programs" });
  assert.equal(activity.length, database.maxYear - 1915 + 1, "The time axis begins with one combined early bin");
  const historic = database.concerts.filter((concert) => concert.year && concert.year <= 1915);
  const combined = A.selectedConcerts(database, { start: 1915, end: 1915 });
  assert.equal(combined.length, historic.length);
  assert.ok(!combined.some((concert) => !concert.year));
  assert.equal(A.activity(database, database.concerts, { group: "year", metric: "programs" })[0][1], historic.length);
  assert.equal(A.activity(database, database.concerts, { group: "decade", metric: "programs" })[0][1], historic.length);
  assert.equal(A.activity(database, database.concerts, { group: "year", metric: "performances" })[0][1], historic.reduce((sum, concert) => sum + concert.programs.length, 0));
  assert.equal(activity.reduce((sum, [, n]) => sum + n, 0), early.length);

  // Exercise the real page controller: toggles, live slider, place intersection,
  // reset, independent expansion state, empty results and persisted chronology.
  DB.setupPersonPreviews = () => {};
  DB.showError = (_page, error) => { throw error; };
  load("analysis.js");
  await new Promise(setImmediate);
  const get = (id) => nodes.get(`analysis-${id}`);
  assert.equal(get("page").attributes["aria-busy"], "false");
  assert.equal(get("activity-title").textContent, "Programs by Year");
  metrics[1].trigger("click");
  assert.equal(get("activity-title").textContent, "Performed items by Year");
  get("group").value = "decade";
  get("group").trigger("change");
  assert.equal(get("activity-title").textContent, "Performed items by Decade");
  assert.match(get("year-chart").innerHTML, /1916–1919/);
  metrics[0].trigger("click");
  assert.equal(get("activity-title").textContent, "Programs by Decade");
  get("group").value = "year";
  get("group").trigger("change");
  assert.equal(get("start").min, 1915);
  assert.equal(get("first-year").textContent, "1915 and earlier");
  assert.match(get("year-chart").innerHTML, /1915<\/tspan>.*and earlier/);
  assert.ok(!get("year-chart").innerHTML.includes('>1892<'));
  assert.match(get("ranking-title").textContent, /composers/);
  assert.match(get("ranking-chart").innerHTML, /data-person-preview/);
  assert.match(get("summary").innerHTML, new RegExp(`${database.concerts.length} concert programs`));
  assert.ok(!get("summary").innerHTML.includes("≤1915"), "Summary omits the default chronology");
  get("start").value = "1924";
  get("end").value = "1925";
  get("start").trigger("input");
  assert.equal(get("date-output").textContent, "1924–1925");
  assert.match(get("summary").innerHTML, new RegExp(`${early.length} concert programs`));
  assert.ok(!get("summary").innerHTML.includes("1924–1925"), "Selected dates appear only beside the slider");
  assert.match(persisted, /start=1924/);
  assert.match(persisted, /end=1925/);
  assert.match(get("year-chart").innerHTML, /is-outside-range/);
  assert.match(get("ranking-chart").innerHTML, /from=1924/);
  assert.match(get("ranking-chart").innerHTML, /to=1925/);
  categories[1].trigger("click");
  assert.match(get("ranking-note").textContent, /not confirmed work identity/);
  assert.match(get("ranking-chart").innerHTML, /<i>/);
  assert.match(persisted, /ranking=pieces/);
  for (const category of categories.slice(2)) {
    category.trigger("click");
    assert.equal(get("ranking-unit").textContent, "Concerts");
  }
  get("place-filter").value = "Unknown place";
  get("place-filter").trigger("change");
  assert.match(get("summary").innerHTML, /<span>Unknown place<\/span>/);
  assert.match(get("ranking-chart").innerHTML, /No performers recorded/);
  assert.match(get("place-table").innerHTML, /No places match/);
  get("place-filter").value = "";
  get("start").value = "1915";
  get("end").value = "1915";
  get("start").trigger("input");
  assert.equal(get("date-output").textContent, "1915 and earlier");
  assert.match(get("summary").innerHTML, new RegExp(`${historic.length} concert programs`));
  assert.equal(get("start").attributes["aria-valuetext"], "1915 and earlier");
  get("date-reset").trigger("click");
  assert.equal(get("date-reset").hidden, true);
  assert.match(get("summary").innerHTML, new RegExp(`${database.concerts.length} concert programs`));
  categories[0].trigger("click");
  assert.equal((get("ranking-chart").innerHTML.match(/role="listitem"/g) || []).length, 20);
  get("ranking-more").trigger("click");
  assert.equal((get("ranking-chart").innerHTML.match(/role="listitem"/g) || []).length, allComposers.length);
  get("ranking-more").trigger("click");
  assert.equal((get("ranking-chart").innerHTML.match(/role="listitem"/g) || []).length, 20);
  get("start").value = String(database.maxYear);
  get("end").value = String(database.maxYear - 1);
  get("start").trigger("input");
  assert.equal(get("start").value, get("end").value, "Slider handles cannot cross");
  console.log(`Analysis passed: ${database.concerts.length} concerts; five rankings, authority names, concert deduplication, chronology, toggle, reset, empty results and expansion.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
