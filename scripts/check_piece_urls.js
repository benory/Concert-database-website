"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, "assets/js", name), "utf8");

function browser(basePath) {
  const context = {
    URL, URLSearchParams,
    window: { location: { href: `https://example.org${basePath}/` } },
    document: { currentScript: { src: `https://example.org${basePath}/assets/js/core.js` } },
    fetch: async (resource) => ({
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(path.join(root, resource.replace(/^\//, "")), "utf8")),
    }),
  };
  vm.runInNewContext(source("core.js"), context);
  return context;
}

async function main() {
  const database = await browser("").window.ConcertDB.loadData();
  const legacyKeys = new Map();
  for (const program of database.programs) legacyKeys.set(program.work_key, program);
  const redirectSource = source("piece-redirect.js");

  for (const basePath of ["", "/preview"]) {
    const context = browser(basePath);
    const DB = context.window.ConcertDB;
    DB.loadData = async () => database;
    vm.runInNewContext(source("concert-results.js"), context);

    for (const program of database.programs) {
      const destination = new URL(DB.pieceUrl(program), "https://example.org");
      assert.equal(destination.pathname, `${basePath}/concerts/`);
      assert.equal(destination.searchParams.get("piece"), DB.pieceGroupKey(program));
      assert.equal(destination.searchParams.size, 1);
    }

    async function follow(parameters) {
      const query = new URLSearchParams(parameters);
      let redirected = "";
      context.window.location = {
        href: `https://example.org${basePath}/piece/?${query}`,
        search: `?${query}`,
        replace: (value) => { redirected = value; },
      };
      await vm.runInNewContext(redirectSource, context);
      assert.ok(redirected, "Saved piece links must redirect");
      const destination = new URL(redirected);
      assert.equal(destination.pathname, `${basePath}/concerts/`);
      return destination;
    }

    for (const [key, program] of legacyKeys) {
      const destination = await follow({ key });
      assert.equal(destination.searchParams.get("piece"), DB.pieceGroupKey(program));
    }

    const program = database.programs.find((entry) => entry.composer_ids.length > 1);
    assert.ok(program);
    for (const composer of [program.composer_ids[1], program.canonical_composers[1]]) {
      const destination = await follow({ title: program.work_name, composer });
      const candidates = database.programs.filter((entry) => DB.normalize(entry.work_name) === DB.normalize(program.work_name)
        && ((entry.composer_ids || []).includes(composer) || (entry.canonical_composers || []).includes(composer)));
      assert.ok(candidates.some((entry) => DB.pieceGroupKey(entry) === destination.searchParams.get("piece")),
        "Old title/name links must resolve to a grouping with that title and composer");
    }

    const saved = {
      key: program.work_key, q: "Innsbruck", from: "1924", to: "1930",
      place: "Innsbruck, Austria", program: "1925_12_05a",
    };
    const filtered = await follow(saved);
    for (const key of ["q", "from", "to", "place", "program"]) {
      assert.equal(filtered.searchParams.get(key), saved[key]);
    }
    const direct = await follow({ piece: DB.pieceGroupKey(program) });
    assert.equal(direct.searchParams.get("piece"), DB.pieceGroupKey(program));
    const unknown = await follow({ key: "missing-piece" });
    assert.equal(context.window.ConcertResults.authorityConcerts(database, { piece: unknown.searchParams.get("piece") }).length, 0);
    assert.equal((await follow({})).searchParams.size, 0);
  }

  const html = fs.readFileSync(path.join(root, "piece/index.html"), "utf8");
  assert.ok(!html.includes('id="piece-detail"'), "The separate piece detail view is retired");
  assert.ok(!fs.existsSync(path.join(root, "assets/js/entity.js")), "Remove the unused detail renderer");
  console.log(`Piece links: ${database.programs.length} items and ${legacyKeys.size} saved groupings route to concert results; base paths, legacy names, unknown pieces and saved filters passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
