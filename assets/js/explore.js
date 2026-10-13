(function () {
  "use strict";

  const DB = window.ConcertDB;
  const MapUI = window.ConcertMapUI;
  const Autocomplete = window.ConcertSearchAutocomplete;
  const search = document.getElementById("program-search");
  const searchForm = document.getElementById("program-search-form");
  const allConcertsLink = document.getElementById("all-concerts-link");
  const searchFrom = document.getElementById("search-from");
  const searchTo = document.getElementById("search-to");
  const startInput = document.getElementById("date-start");
  const endInput = document.getElementById("date-end");
  const rangeOutput = document.getElementById("date-range-output");
  const rangeTrack = document.querySelector(".dual-range");
  const histogram = document.getElementById("date-histogram");
  const mapFeature = document.querySelector("[data-map-feature]");
  const mapFrame = mapFeature?.querySelector(".map-frame");
  const mapNode = document.getElementById("home-map");
  const mapHeading = document.getElementById("home-map-heading");
  const mapRegionButtons = [...document.querySelectorAll("[data-home-map-region]")];
  const timeline = { startInput, endInput, output: rangeOutput, track: rangeTrack, histogram };

  if (!DB || !MapUI || !search || !startInput || !endInput || !allConcertsLink || !searchFrom || !searchTo) return;

  let database;
  let map;
  let expansionFrame;
  let expansionProgress = 1;
  let latestMatches = [];

  function stateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const from = Number(params.get("from"));
    const to = Number(params.get("to"));
    return {
      query: params.get("q") || "",
      from: Number.isFinite(from) && from ? MapUI.clamp(from, MapUI.TIMELINE_MIN, MapUI.TIMELINE_MAX) : MapUI.TIMELINE_MIN,
      to: Number.isFinite(to) && to ? MapUI.clamp(to, MapUI.TIMELINE_MIN, MapUI.TIMELINE_MAX) : MapUI.TIMELINE_MAX,
    };
  }

  function currentFilters() {
    return {
      query: search.value.trim(),
      from: Number(startInput.value),
      to: Number(endInput.value),
    };
  }

  function filteredConcerts(filters) {
    const terms = DB.normalize(filters.query).split(/\s+/).filter(Boolean);
    return database.concerts.filter((concert) => (
      MapUI.dateMatches(concert, filters.from, filters.to)
      && terms.every((term) => concert.searchText.includes(term))
    ));
  }

  function concertsUrl(filters) {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.from > MapUI.TIMELINE_MIN) params.set("from", filters.from);
    if (filters.to < MapUI.TIMELINE_MAX) params.set("to", filters.to);
    return `${DB.path("/concerts/")}${params.toString() ? `?${params}` : ""}`;
  }

  function update() {
    const filters = currentFilters();
    MapUI.updateTimeline(timeline);
    latestMatches = filteredConcerts(filters);
    map?.render(latestMatches, {
      preserveView: true,
      useContext: !filters.query && filters.from === MapUI.TIMELINE_MIN && filters.to === MapUI.TIMELINE_MAX,
    });

    allConcertsLink.href = concertsUrl(filters);
    searchFrom.value = String(filters.from);
    searchTo.value = String(filters.to);
  }

  function setMapRegion(region) {
    if (!map || !["europe", "us"].includes(region)) return;
    const isEurope = region === "europe";
    mapRegionButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.homeMapRegion === region));
    });
    if (mapHeading) mapHeading.textContent = isEurope ? "European concert locations" : "United States concert locations";
    if (mapNode) mapNode.setAttribute("aria-label", isEurope
      ? "Interactive map of European concert locations"
      : "Interactive map of United States concert locations");
    if (map.setRegion(region)) {
      map.render(latestMatches, { preserveView: true });
      map.setClarity(expansionProgress);
      window.requestAnimationFrame(() => map.invalidate());
    }
  }

  function setupMapToggle() {
    mapRegionButtons.forEach((button) => button.addEventListener("click", () => {
      setMapRegion(button.dataset.homeMapRegion);
    }));
  }

  function setupMapExpansion() {
    if (!mapFeature || !mapFrame) return;
    const desktop = window.matchMedia("(min-width: 901px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function renderExpansion() {
      expansionFrame = null;
      const enhanced = desktop.matches && !reducedMotion.matches;
      mapFeature.classList.toggle("is-scroll-enhanced", enhanced);

      if (!enhanced) {
        expansionProgress = 1;
        mapFeature.style.removeProperty("--map-frame-gutter");
        mapFeature.style.removeProperty("--map-frame-height");
        mapFeature.style.removeProperty("--map-frame-radius");
        map?.setClarity(expansionProgress);
        map?.invalidate();
        return;
      }

      const mapTop = mapFeature.getBoundingClientRect().top;
      const startLine = window.innerHeight * 0.36;
      const endLine = window.innerHeight * 0.06;
      const rawProgress = MapUI.clamp((startLine - mapTop) / Math.max(1, startLine - endLine), 0, 1);
      const progress = rawProgress * rawProgress * (3 - (2 * rawProgress));
      expansionProgress = progress;
      const featureWidth = mapFeature.clientWidth || window.innerWidth;
      const previousStartGutter = Math.min(150, Math.max(72, featureWidth * 0.1));
      const startGutter = featureWidth - (0.8 * (featureWidth - previousStartGutter));
      const startHeight = MapUI.clamp(window.innerHeight * 0.34, 300, 350);
      const endHeight = MapUI.clamp(window.innerHeight * 0.56, 470, 560);

      mapFeature.style.setProperty("--map-frame-gutter", `${startGutter * (1 - progress)}px`);
      mapFeature.style.setProperty("--map-frame-height", `${startHeight + ((endHeight - startHeight) * progress)}px`);
      mapFeature.style.setProperty("--map-frame-radius", `${14 * (1 - progress)}px`);
      map?.setClarity(expansionProgress);
      if (!("ResizeObserver" in window)) map?.invalidate();
    }

    function scheduleExpansion() {
      if (!expansionFrame) expansionFrame = window.requestAnimationFrame(renderExpansion);
    }

    window.addEventListener("scroll", scheduleExpansion, { passive: true });
    window.addEventListener("resize", scheduleExpansion, { passive: true });
    desktop.addEventListener?.("change", scheduleExpansion);
    reducedMotion.addEventListener?.("change", scheduleExpansion);
    renderExpansion();
  }

  DB.loadData().then((loaded) => {
    database = loaded;
    const stored = stateFromUrl();
    search.value = stored.query;
    startInput.value = stored.from;
    endInput.value = Math.max(stored.from, stored.to);

    setupMapExpansion();
    map = MapUI.createRegionMap({
      region: "europe",
      nodeId: "home-map",
      statusId: "home-map-status",
      attributionControl: true,
      zoomControl: true,
      zoomPosition: "bottomright",
      viewBoundsByRegion: {
        europe: [[49.58966424, 6.825], [54.07937578, 14.075]],
      },
    });
    map?.setClarity(expansionProgress);
    MapUI.initializeTimeline(timeline, database.concerts);
    update();

    setupMapToggle();
    const autocomplete = Autocomplete?.setup(search, database, {
      onChoose(suggestion) {
        if (!["city", "country", "source", "source-text"].includes(suggestion.kind)) return false;
        const filters = currentFilters();
        filters.query = suggestion.name;
        const params = new URLSearchParams({ q: filters.query });
        if (suggestion.kind === "source") params.set("source", suggestion.id);
        if (suggestion.kind === "city") params.set("city", suggestion.name);
        if (suggestion.kind === "country") params.set("country", suggestion.name);
        if (suggestion.kind === "source-text") params.set("source_text", suggestion.name);
        if (filters.from > MapUI.TIMELINE_MIN) params.set("from", filters.from);
        if (filters.to < MapUI.TIMELINE_MAX) params.set("to", filters.to);
        window.location.assign(`${DB.path("/concerts/")}?${params}`);
        return true;
      },
    });
    search.addEventListener("input", update);
    startInput.addEventListener("input", () => {
      if (Number(startInput.value) > Number(endInput.value)) endInput.value = startInput.value;
      update();
    });
    endInput.addEventListener("input", () => {
      if (Number(endInput.value) < Number(startInput.value)) startInput.value = endInput.value;
      update();
    });
    searchForm?.addEventListener("submit", () => {
      autocomplete?.close();
      const filters = currentFilters();
      searchFrom.value = String(filters.from);
      searchTo.value = String(filters.to);
    });
  }).catch((error) => DB.showError(mapFrame, error, "Concert locations could not be loaded."));
}());
