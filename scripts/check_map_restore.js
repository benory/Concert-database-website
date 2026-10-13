"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = process.argv[2] || path.resolve(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));
let assertions = 0;
function check(message, test) {
  test();
  assertions += 1;
  console.log(`PASS ${message}`);
}

function node() {
  const listeners = new Map();
  return {
    clientWidth: 800,
    clientHeight: 500,
    hidden: false,
    value: "",
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    removeAttribute() {},
    append() {},
    replaceChildren() {},
    focus() {},
    scrollIntoView() {},
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    click() { listeners.get("click")?.(); },
  };
}

function frames() {
  let nextId = 0;
  const pending = new Map();
  return {
    requestAnimationFrame(callback) { const id = ++nextId; pending.set(id, callback); return id; },
    cancelAnimationFrame(id) { pending.delete(id); },
    flush() {
      while (pending.size) {
        const current = [...pending.entries()];
        pending.clear();
        current.forEach(([, callback]) => callback());
      }
    },
  };
}

function loadMaps() {
  const frame = frames();
  const nodes = new Map([["map", node()], ["toggle", node()]]);
  const buttons = ["europe", "us"].map((region) => {
    const button = node();
    button.dataset.mapToggleRegion = region;
    return button;
  });
  nodes.get("toggle").querySelectorAll = () => buttons;
  const instances = [];
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
  }
  const leaflet = {
    map() {
      const calls = [];
      const map = {
        calls,
        center: { lat: 49, lng: 8 },
        zoom: 5,
        on() { return this; },
        getCenter() { return this.center; },
        getZoom() { return this.zoom; },
        getMaxZoom() { return 18; },
        fitBounds(bounds, options) { calls.push(["fitBounds", plain(bounds), plain(options)]); return this; },
        stop() { calls.push(["stop"]); this.onStop?.(); return this; },
        invalidateSize(options) { calls.push(["invalidateSize", plain(options)]); return this; },
        setView(center, zoom, options) {
          calls.push(["setView", plain(center), zoom, plain(options)]);
          this.center = { lat: center[0], lng: center[1] };
          this.zoom = zoom;
          return this;
        },
        remove() {},
      };
      instances.push(map);
      return map;
    },
    tileLayer() { return { addTo() {} }; },
    layerGroup() { return { addTo() {}, clearLayers() {}, addLayer() {} }; },
    circleMarker() { return { bindPopup() {}, on() {}, openPopup() {} }; },
  };
  const window = { L: leaflet, ResizeObserver, ConcertDB: { normalize: (value) => String(value || "").toLowerCase() }, ...frame };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/maps.js"), "utf8"), {
    window,
    ResizeObserver,
    document: { getElementById: (id) => nodes.get(id) || null },
  }, { filename: "maps.js" });
  return { api: window.ConcertMapUI, instances, nodes, buttons, observers, frame };
}

const maps = loadMaps();
const regional = maps.api.createRegionMap({ nodeId: "map", region: "europe" });
const raw = maps.instances[0];
let captured;
check("capture stops motion before saving an independent center and exact fractional zoom", () => {
  raw.onStop = () => { raw.center = { lat: 47.234, lng: 7.456 }; raw.zoom = 6.75; };
  raw.calls.length = 0;
  captured = regional.captureView();
  assert.deepEqual(plain(captured), { center: [47.234, 7.456], zoom: 6.75 });
  assert.deepEqual(raw.calls, [["stop"]]);
  raw.onStop = null;
  raw.center.lat = 0;
  assert.deepEqual(plain(captured.center), [47.234, 7.456]);
});
check("restoration resizes without panning and restores the saved view without animation", () => {
  raw.calls.length = 0;
  regional.restoreView(captured);
  assert.deepEqual(raw.calls, [
    ["stop"],
    ["invalidateSize", { animate: false, pan: false }],
    ["setView", [47.234, 7.456], 6.75, { animate: false }],
  ]);
});
check("hidden map dimensions suppress both invalidation and restoration", () => {
  const mapNode = maps.nodes.get("map");
  mapNode.clientWidth = 0;
  raw.calls.length = 0;
  regional.invalidate();
  regional.restoreView(captured);
  maps.observers[0].callback();
  maps.frame.flush();
  assert.deepEqual(raw.calls, []);
  mapNode.clientWidth = 800;
});
check("restoration cancels a pending resize that could shift the restored view", () => {
  raw.calls.length = 0;
  maps.observers[0].callback();
  regional.restoreView(captured);
  maps.frame.flush();
  assert.deepEqual(raw.calls, [
    ["stop"],
    ["invalidateSize", { animate: false, pan: false }],
    ["setView", [47.234, 7.456], 6.75, { animate: false }],
  ]);
});

const toggle = maps.api.createToggleMap({ nodeId: "map", toggleId: "toggle" });
const toggleRaw = maps.instances[1];
let toggleCaptured;
check("toggle snapshots identify the current region and restore the same region", () => {
  toggleRaw.center = { lat: 50.125, lng: 12.25 };
  toggleRaw.zoom = 8.25;
  toggleCaptured = toggle.captureView();
  assert.deepEqual(plain(toggleCaptured), { center: [50.125, 12.25], zoom: 8.25, region: "europe" });
  toggleRaw.calls.length = 0;
  toggle.restoreView(toggleCaptured);
  assert.deepEqual(toggleRaw.calls.at(-1), ["setView", [50.125, 12.25], 8.25, { animate: false }]);
});
check("a snapshot cannot move a map after its region changes", () => {
  maps.buttons[1].click();
  toggleRaw.calls.length = 0;
  toggle.restoreView(toggleCaptured);
  assert.deepEqual(toggleRaw.calls, []);
});

function loadConcerts() {
  const frame = frames();
  const nodes = new Map([
    ["program-search", node()],
    ["program-list", node()],
    ["date-start", node()],
    ["date-end", node()],
    ["concert-map-view", node()],
    ["concert-program-preview", node()],
  ]);
  nodes.get("date-start").value = "1915";
  nodes.get("date-end").value = "1960";
  nodes.get("concert-program-preview").hidden = true;
  const calls = [];
  let snapshot = { center: [46.75, 7.25], zoom: 9.25, region: "europe" };
  const fakeMap = {
    captureView() { calls.push(["captureView"]); return plain(snapshot); },
    restoreView(view) { calls.push(["restoreView", plain(view)]); },
    invalidate() { calls.push(["invalidate"]); },
    render() { calls.push(["render"]); },
  };
  const database = {
    concerts: [],
    programPreviewsById: new Map(),
    composersById: new Map(),
    peopleByReference: new Map(),
    sourcesById: new Map(),
  };
  const DB = {
    loadData() { return { then() { return { catch() {} }; } }; },
    programSlug: (id) => id,
    programId: (id) => id || "",
    locationLabel: () => "",
    compactDate: () => "",
  };
  const window = {
    ConcertDB: DB,
    ConcertMapUI: { TIMELINE_MIN: 1915, TIMELINE_MAX: 1960, clamp: maps.api.clamp, setTimelineConcerts() {}, dateMatches: () => true },
    ConcertResults: { chronologyConcerts: () => [], selectionLabel: () => "", searchQuery: (stored) => stored.query },
    location: { search: "", pathname: "/concerts/" },
    matchMedia: () => ({ matches: false }),
    ...frame,
  };
  const source = fs.readFileSync(path.join(root, "assets/js/concerts.js"), "utf8");
  const insertion = `
  window.__previewTest = {
    showProgramPreview, hideProgramPreview, renderMaps, currentFilters, update, applyUrlState,
    initialize(loaded, map) { database = loaded; maps = map; matchingConcerts = []; }
  };
`;
  assert.equal(source.includes("  DB.loadData().then"), true, "Expected concerts initialization hook");
  vm.runInNewContext(source.replace("  DB.loadData().then", `${insertion}  DB.loadData().then`), {
    window,
    document: {
      getElementById: (id) => nodes.get(id) || null,
      querySelector: () => null,
      body: node(),
      createDocumentFragment: node,
    },
    history: { replaceState() {}, pushState() {} },
    CSS: { escape: (value) => value },
    URLSearchParams,
  }, { filename: "concerts.js" });
  const api = window.__previewTest;
  api.initialize(database, fakeMap);
  return { api, calls, nodes, frame, setSnapshot(value) { snapshot = value; } };
}

const concerts = loadConcerts();
const a = { id: "a", programs: [] };
const b = { id: "b", programs: [] };
check("preview switching retains the first visible map snapshot", () => {
  concerts.api.showProgramPreview(a);
  concerts.setSnapshot({ center: [0, 0], zoom: 1, region: "europe" });
  concerts.api.showProgramPreview(b);
  assert.equal(concerts.calls.filter(([name]) => name === "captureView").length, 1);
  concerts.api.hideProgramPreview({ restoreFocus: false });
  assert.equal(concerts.nodes.get("concert-map-view").hidden, false);
  assert.equal(concerts.calls.some(([name]) => name === "restoreView"), false);
  concerts.frame.flush();
  assert.deepEqual(concerts.calls.filter(([name]) => name === "restoreView"), [
    ["restoreView", { center: [46.75, 7.25], zoom: 9.25, region: "europe" }],
  ]);
});
check("reopening a preview cancels a pending restoration", () => {
  concerts.calls.length = 0;
  concerts.api.showProgramPreview(a);
  concerts.api.hideProgramPreview({ restoreFocus: false });
  concerts.api.showProgramPreview(b);
  concerts.frame.flush();
  assert.equal(concerts.calls.some(([name]) => name === "restoreView"), false);
  concerts.api.hideProgramPreview({ restoreFocus: false });
  concerts.frame.flush();
});
check("map rerender cancels an old pending preview restoration", () => {
  concerts.calls.length = 0;
  concerts.api.showProgramPreview(a);
  concerts.api.hideProgramPreview({ restoreFocus: false });
  concerts.api.renderMaps(concerts.api.currentFilters());
  concerts.frame.flush();
  assert.equal(concerts.calls.some(([name]) => name === "restoreView"), false);
});
check("filter updates dismiss previews without restoring obsolete framing", () => {
  concerts.calls.length = 0;
  concerts.api.showProgramPreview(a);
  concerts.api.update({ clearSelected: true });
  concerts.frame.flush();
  assert.equal(concerts.nodes.get("concert-program-preview").hidden, true);
  assert.equal(concerts.calls.some(([name]) => name === "restoreView"), false);
});
check("URL changes dismiss previews without restoring obsolete framing", () => {
  concerts.calls.length = 0;
  concerts.api.showProgramPreview(a);
  concerts.api.applyUrlState();
  concerts.frame.flush();
  assert.equal(concerts.calls.some(([name]) => name === "restoreView"), false);
});

console.log(`Validated ${assertions} map view regression checks.`);
