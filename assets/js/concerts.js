(function () {
  "use strict";

  const DB = window.ConcertDB;
  const MapUI = window.ConcertMapUI;
  const Autocomplete = window.ConcertSearchAutocomplete;
  const Results = window.ConcertResults;
  const search = document.getElementById("program-search");
  const searchForm = document.getElementById("program-search-form");
  const count = document.getElementById("program-count");
  const list = document.getElementById("program-list");
  const results = document.getElementById("program-results");
  const empty = document.getElementById("program-empty");
  const startInput = document.getElementById("date-start");
  const endInput = document.getElementById("date-end");
  const rangeOutput = document.getElementById("date-range-output");
  const rangeTrack = document.querySelector(".dual-range");
  const histogram = document.getElementById("date-histogram");
  const timelinePanel = document.getElementById("concert-date-filter");
  const cardTemplate = document.getElementById("program-card-template");
  const heading = document.getElementById("concerts-heading");
  const eyebrow = document.getElementById("concerts-eyebrow");
  const browser = document.querySelector(".concert-browser");
  const mapView = document.getElementById("concert-map-view");
  const personContext = document.getElementById("person-context");
  const personContextIdentity = document.getElementById("person-context-identity");
  const personContextNarrative = document.getElementById("person-context-narrative");
  const personContextAuthorities = document.getElementById("person-context-authorities");
  const sourceDiammLink = document.getElementById("source-diamm-link");
  const clearSearch = document.getElementById("concert-clear-search");
  const contextMeta = document.getElementById("concerts-context-meta");
  const programPreview = document.getElementById("concert-program-preview");
  const programPreviewTitle = document.getElementById("concert-program-preview-title");
  const programPreviewMeta = document.getElementById("concert-program-preview-meta");
  const programPreviewImage = document.getElementById("concert-program-preview-image");
  const programPreviewOrder = document.getElementById("concert-program-preview-order");
  const programPreviewLink = document.getElementById("concert-program-preview-link");
  const timeline = { startInput, endInput, output: rangeOutput, track: rangeTrack, histogram };

  if (!DB || !MapUI || !Results || !search || !list || !startInput || !endInput) return;

  let database;
  let maps;
  let matchingConcerts = [];
  let selectedId = "";
  let previewedId = "";
  let previewMapView = null;
  let previewMapRestoreFrame;
  let personId = "";
  let composerId = "";
  let composerName = "";
  let sourceId = "";
  let cityFilter = "";
  let countryFilter = "";
  let sourceTextFilter = "";
  let pieceFilter = "";
  let placeFilter = "";

  function queryState() {
    const params = new URLSearchParams(window.location.search);
    const from = Number(params.get("from"));
    const to = Number(params.get("to"));
    return {
      query: params.get("q") || "",
      from: Number.isFinite(from) && from ? MapUI.clamp(from, MapUI.TIMELINE_MIN, MapUI.TIMELINE_MAX) : MapUI.TIMELINE_MIN,
      to: Number.isFinite(to) && to ? MapUI.clamp(to, MapUI.TIMELINE_MIN, MapUI.TIMELINE_MAX) : MapUI.TIMELINE_MAX,
      selected: DB.programId(params.get("program")),
      person: params.get("person") || "",
      composer: params.get("composer") || "",
      composerName: params.get("composer_name") || "",
      source: params.get("source") || "",
      city: params.get("city") || "",
      country: params.get("country") || "",
      sourceText: params.get("source_text") || "",
      piece: params.get("piece") || "",
      place: params.get("place") || "",
    };
  }

  function currentFilters() {
    return {
      query: search.value.trim(),
      from: Number(startInput.value),
      to: Number(endInput.value),
      selected: selectedId,
      person: personId,
      composer: composerId,
      composerName,
      source: sourceId,
      city: cityFilter,
      country: countryFilter,
      sourceText: sourceTextFilter,
      piece: pieceFilter,
      place: placeFilter,
    };
  }

  function persist(filters, replace) {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.from > MapUI.TIMELINE_MIN) params.set("from", filters.from);
    if (filters.to < MapUI.TIMELINE_MAX) params.set("to", filters.to);
    if (filters.selected) params.set("program", DB.programSlug(filters.selected));
    if (filters.person) params.set("person", filters.person);
    if (filters.composer) params.set("composer", filters.composer);
    if (filters.composerName) params.set("composer_name", filters.composerName);
    if (filters.source) params.set("source", filters.source);
    if (filters.city) params.set("city", filters.city);
    if (filters.country) params.set("country", filters.country);
    if (filters.sourceText) params.set("source_text", filters.sourceText);
    if (filters.piece) params.set("piece", filters.piece);
    if (filters.place) params.set("place", filters.place);
    const method = replace ? "replaceState" : "pushState";
    history[method](null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }

  function chronologyConcerts(filters) {
    return Results.chronologyConcerts(database, filters);
  }

  function setCardLine(node, value) {
    if (!node) return;
    node.textContent = value;
    node.title = value;
    node.hidden = !value;
  }

  function renderPersonAuthorities(person) {
    if (!personContextAuthorities) return;
    const identifiers = person ? DB.personAuthorityIdentifiers(person) : [];
    const fragment = document.createDocumentFragment();
    identifiers.forEach((identifier) => {
      const node = document.createElement(identifier.url ? "a" : "span");
      node.textContent = `${identifier.label} ${identifier.value}`;
      if (identifier.url) {
        node.href = identifier.url;
        node.target = "_blank";
        node.rel = "noopener";
        node.append(document.createTextNode(" ↗"));
      }
      fragment.append(node);
    });
    personContextAuthorities.replaceChildren(fragment);
    personContextAuthorities.hidden = identifiers.length === 0;
  }

  function renderSourceLink(source) {
    if (!sourceDiammLink) return;
    const url = String(source?.diamm_url || "").trim();
    sourceDiammLink.hidden = !url;
    if (url) sourceDiammLink.href = url;
    else sourceDiammLink.removeAttribute("href");
  }

  function renderCardHits(container, concert, filters) {
    if (!container) return;
    const hits = Results.hits(concert, filters, database);
    container.hidden = !hits.programs.length && !hits.people.length;
    if (container.hidden) return;
    const fragment = document.createDocumentFragment();
    if (hits.programs.length) {
      const label = document.createElement("span");
      label.className = "program-hits-label";
      label.textContent = filters.composer || filters.composerName ? "Pieces" : "Matching pieces";
      const pieces = document.createElement("ul");
      hits.programs.forEach((program) => {
        const item = document.createElement("li");
        const link = document.createElement("a");
        const title = document.createElement("em");
        title.textContent = program.work_name || program.standardized_work_name || "Untitled work";
        link.append(title);
        link.href = DB.pieceUrl(program);
        const composer = program.canonical_composer || program.composer_name || "Composer unknown";
        item.append(document.createTextNode(`${composer}, `), link);
        pieces.append(item);
      });
      fragment.append(label, pieces);
    }
    if (hits.people.length) {
      const people = document.createElement("ul");
      people.className = "program-person-hits";
      hits.people.forEach((person) => {
        const item = document.createElement("li");
        item.textContent = `${person.name || DB.displayIdentifier(person.id)} — ${person.role}`;
        people.append(item);
      });
      fragment.append(people);
    }
    container.replaceChildren(fragment);
  }

  function cardFor(concert, filters) {
    const meta = [concert.city, concert.country].filter(Boolean).join(", ") || DB.locationLabel(concert) || "Location not yet recorded";
    const ensemble = String(concert.ensemble || "").trim();
    const direction = (concert.direction || []).filter((person) => person.id !== filters.person).map((person) => person.name).filter(Boolean);
    const directionLabel = direction.length ? `Directed by ${direction.join(", ")}` : "";
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector("[data-program-card]");
    card.dataset.concertId = concert.id;
    if (concert.id === filters.selected) {
      card.classList.add("is-selected");
    }
    const time = fragment.querySelector("[data-program-date]");
    time.textContent = DB.compactDate(concert);
    if (DB.isoDate(concert)) time.dateTime = DB.isoDate(concert);
    const title = fragment.querySelector("[data-program-title]");
    title.textContent = concert.title || "Untitled concert";
    title.href = DB.programUrl(concert.id);
    const previewButton = fragment.querySelector("[data-program-select]");
    previewButton.setAttribute("aria-label", `Preview program for ${concert.title || "untitled concert"}`);
    previewButton.setAttribute("aria-expanded", String(concert.id === previewedId));
    fragment.querySelector("[data-program-meta]").textContent = meta;
    setCardLine(fragment.querySelector("[data-program-ensemble]"), ensemble);
    setCardLine(fragment.querySelector("[data-program-direction]"), directionLabel);
    renderCardHits(fragment.querySelector("[data-program-hits]"), concert, filters);
    return fragment;
  }

  function permittedScan(concert) {
    if (String(concert.image_permissions || "").toLowerCase() !== "yes") return "";
    return String(concert.scan_url || concert.image_url || concert.externally_hosted_image || "").trim();
  }

  function resetProgramPreviewMedia() {
    if (programPreviewImage) {
      programPreviewImage.hidden = true;
      programPreviewImage.removeAttribute("src");
      programPreviewImage.alt = "";
      programPreviewImage.onerror = null;
    }
    if (programPreviewOrder) {
      programPreviewOrder.hidden = true;
      programPreviewOrder.replaceChildren();
    }
  }

  function renderPreviewProgramOrder(concert) {
    if (!programPreviewOrder) return;
    const heading = document.createElement("h3");
    heading.textContent = "Program order";
    programPreviewOrder.append(heading);

    if (!concert.programs.length) {
      const emptyProgram = document.createElement("p");
      emptyProgram.textContent = "The program order has not yet been entered.";
      programPreviewOrder.append(emptyProgram);
      programPreviewOrder.hidden = false;
      return;
    }

    const items = document.createElement("ol");
    concert.programs.forEach((program) => {
      const item = document.createElement("li");
      const work = document.createElement("strong");
      const composer = document.createElement("span");
      work.textContent = program.work_name || program.standardized_work_name || "Untitled work";
      composer.textContent = program.composer_name || program.canonical_composer || DB.displayIdentifier(program.composer_id) || "Composer unknown";
      if (Number(program.order)) item.value = Number(program.order);
      item.append(work, composer);
      items.append(item);
    });
    programPreviewOrder.append(items);
    programPreviewOrder.hidden = false;
  }

  function showProgramPreview(concert) {
    if (!programPreview || !mapView) return;
    window.cancelAnimationFrame(previewMapRestoreFrame);
    if (programPreview.hidden) previewMapView = maps?.captureView() || null;
    previewedId = concert.id;
    selectedId = concert.id;
    const filters = currentFilters();
    persist(filters, true);
    renderList(matchingConcerts, filters);

    const title = concert.title || "Untitled concert";
    const location = DB.locationLabel(concert);
    if (programPreviewTitle) programPreviewTitle.textContent = title;
    if (programPreviewMeta) programPreviewMeta.textContent = [DB.compactDate(concert), location].filter(Boolean).join(" · ");
    if (programPreviewLink) {
      programPreviewLink.href = DB.programUrl(concert.id);
      programPreviewLink.setAttribute("aria-label", `View concert page for ${title}`);
    }
    resetProgramPreviewMedia();

    const scan = permittedScan(concert);
    const preview = database.programPreviewsById.get(concert.id);
    const firstPage = scan && (preview?.preview_url ? DB.path(preview.preview_url) : /\.pdf(?:$|[?#])/i.test(scan) ? "" : scan);
    if (firstPage && programPreviewImage) {
      programPreviewImage.src = firstPage;
      programPreviewImage.alt = `First page of the program for ${title}`;
      programPreviewImage.hidden = false;
      programPreviewImage.onerror = () => {
        programPreviewImage.hidden = true;
        renderPreviewProgramOrder(concert);
      };
    } else {
      renderPreviewProgramOrder(concert);
    }

    mapView.hidden = true;
    programPreview.hidden = false;
    document.body.classList.add("has-program-preview");
    window.requestAnimationFrame(() => {
      const isCompact = window.matchMedia("(max-width: 1000px)").matches;
      programPreview.focus({ preventScroll: !isCompact });
      if (isCompact) programPreview.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function hideProgramPreview(options) {
    const settings = options || {};
    if (!programPreview || programPreview.hidden) return;
    const restoreId = previewedId;
    const restoreMapView = settings.restoreMapView !== false ? previewMapView : null;
    previewMapView = null;
    previewedId = "";
    resetProgramPreviewMedia();
    programPreview.hidden = true;
    document.body.classList.remove("has-program-preview");
    if (mapView) mapView.hidden = false;
    if (settings.rerender !== false) renderList(matchingConcerts, currentFilters());
    window.cancelAnimationFrame(previewMapRestoreFrame);
    if (maps) {
      previewMapRestoreFrame = window.requestAnimationFrame(() => {
        if (mapView?.hidden) return;
        if (restoreMapView) maps.restoreView(restoreMapView);
        else maps.invalidate();
      });
    }
    if (settings.restoreFocus !== false && restoreId) {
      window.requestAnimationFrame(() => {
        document.querySelector(`[data-concert-id="${CSS.escape(restoreId)}"] [data-program-select]`)?.focus({ preventScroll: true });
      });
    }
  }

  function renderList(concerts, filters) {
    const fragment = document.createDocumentFragment();
    concerts.forEach((concert) => fragment.append(cardFor(concert, filters)));
    list.replaceChildren(fragment);
    results?.setAttribute("aria-busy", "false");
    if (empty) empty.hidden = concerts.length !== 0;
    if (count) count.textContent = `${concerts.length.toLocaleString()} ${concerts.length === 1 ? "concert" : "concerts"}`;
  }

  function renderMaps(filters) {
    window.cancelAnimationFrame(previewMapRestoreFrame);
    maps.render(matchingConcerts, {
      availabilityConcerts: chronologyConcerts(filters),
      selectedId: filters.selected,
      useContext: !filters.query
        && !filters.person
        && !filters.composer
        && !filters.composerName
        && !filters.source
        && !filters.city
        && !filters.country
        && !filters.sourceText
        && !filters.piece
        && !filters.place
        && filters.from === MapUI.TIMELINE_MIN
        && filters.to === MapUI.TIMELINE_MAX,
    });
    window.requestAnimationFrame(() => maps.invalidate());
  }

  function updateAuthorityContext(filters) {
    const composer = filters.composer && database.composersById.get(filters.composer);
    const person = filters.person && database.peopleByReference.get(filters.person);
    const source = filters.source && database.sourcesById.get(filters.source);
    if (timelinePanel) timelinePanel.hidden = !person && !source;
    browser?.classList.toggle("is-person-view", Boolean(person));
    document.body.classList.toggle("has-person-context", Boolean(person));
    browser?.classList.toggle("is-source-view", Boolean(source) && !person);
    if (contextMeta) contextMeta.hidden = true;
    if (filters.piece) {
      renderPersonAuthorities(null);
      renderSourceLink(null);
      if (personContext) personContext.hidden = true;
      const label = Results.selectionLabel(filters, database);
      if (eyebrow) eyebrow.textContent = "Piece";
      if (heading) heading.textContent = label;
      document.title = `${label} · Early Music Concerts`;
      return;
    }
    if (filters.composer || filters.composerName) {
      renderPersonAuthorities(null);
      renderSourceLink(null);
      if (personContext) personContext.hidden = true;
      const name = Results.selectionLabel(filters, database);
      const year = (value) => String(value || "").match(/\d{3,4}/)?.[0] || "";
      const birth = year(composer?.birth_date);
      const death = year(composer?.death_date);
      const start = year(composer?.cya_start);
      const end = year(composer?.cya_end);
      const dates = birth && death ? `${birth}–${death}` : birth ? `b. ${birth}` : death ? `d. ${death}`
        : start || end ? `fl. ${[start, end].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join("–")}` : "";
      if (eyebrow) eyebrow.textContent = "Composer";
      if (heading) heading.textContent = name;
      if (contextMeta) {
        contextMeta.textContent = dates;
        contextMeta.hidden = !dates;
      }
      document.title = `${name} · Early Music Concerts`;
      return;
    }
    if (person) {
      renderSourceLink(null);
      renderPersonAuthorities(person);
      const lifeDates = person.birth_year && person.death_year
        ? `${person.birth_year}–${person.death_year}`
        : (person.birth_year ? `b. ${person.birth_year}` : (person.death_year ? `d. ${person.death_year}` : ""));
      if (eyebrow) eyebrow.textContent = "Person";
      if (heading) heading.textContent = person.name;
      if (personContextIdentity) personContextIdentity.textContent = [lifeDates, person.position].filter(Boolean).join(" · ");
      if (personContextNarrative) personContextNarrative.textContent = person.narrative_description || "Biographical description not yet available.";
      if (personContext) personContext.hidden = false;
      document.title = `${person.name} · Early Music Concerts`;
      return;
    }
    if (source) {
      renderPersonAuthorities(null);
      renderSourceLink(source);
      const sourceName = source.sigla && source.alias && DB.normalize(source.sigla) !== DB.normalize(source.alias)
        ? `${source.sigla} (${source.alias})`
        : (source.sigla || source.alias || DB.displayIdentifier(source.id));
      if (eyebrow) eyebrow.textContent = "Musical source";
      if (heading) heading.textContent = sourceName;
      if (personContext) personContext.hidden = true;
      document.title = `${sourceName} · Early Music Concerts`;
      return;
    }
    renderPersonAuthorities(null);
    renderSourceLink(null);
    if (eyebrow) eyebrow.textContent = "Concert programs";
    if (heading) heading.textContent = "All concerts";
    if (personContext) personContext.hidden = true;
    document.title = "All concerts · Early Music Concerts";
  }

  function update(options) {
    const settings = options || {};
    if (settings.clearSelected) {
      selectedId = "";
      hideProgramPreview({ restoreFocus: false, rerender: false, restoreMapView: false });
    }
    const filters = currentFilters();
    updateAuthorityContext(filters);
    if (clearSearch) {
      const label = Results.selectionLabel(filters, database);
      const hasDates = filters.from !== MapUI.TIMELINE_MIN || filters.to !== MapUI.TIMELINE_MAX;
      clearSearch.hidden = !label && !hasDates;
      clearSearch.querySelector("[data-active-search-label]").textContent = label || `${filters.from}–${filters.to}`;
      clearSearch.title = "Clear search and show all concerts";
    }
    const chronology = chronologyConcerts(filters);
    MapUI.setTimelineConcerts(timeline, chronology);
    matchingConcerts = chronology.filter((concert) => MapUI.dateMatches(concert, filters.from, filters.to));
    persist(filters, settings.replace !== false);
    renderList(matchingConcerts, filters);
    if (settings.resetScroll) {
      const scroller = document.querySelector(".concert-browser-primary");
      if (scroller) scroller.scrollTop = 0;
    }
    renderMaps(filters);
  }

  function selectConcert(concert) {
    selectedId = concert.id;
    const filters = currentFilters();
    persist(filters, false);
    renderList(matchingConcerts, filters);
    document.querySelector(`[data-concert-id="${CSS.escape(concert.id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function applyUrlState() {
    hideProgramPreview({ restoreFocus: false, rerender: false, restoreMapView: false });
    const stored = queryState();
    search.value = Results.searchQuery(stored, database);
    startInput.value = stored.from;
    endInput.value = Math.max(stored.from, stored.to);
    selectedId = stored.selected;
    personId = stored.person;
    composerId = stored.composer;
    composerName = stored.composerName;
    sourceId = stored.source;
    cityFilter = stored.city;
    countryFilter = stored.country;
    sourceTextFilter = stored.sourceText;
    pieceFilter = stored.piece;
    placeFilter = stored.place;
    update({ replace: true });
  }

  DB.loadData().then((loaded) => {
    database = loaded;
    maps = MapUI.createToggleMap({
      nodeId: "concert-map",
      toggleId: "concert-map-toggle",
      statusId: "concert-map-status",
      onSelect: selectConcert,
      zoomControl: true,
      zoomPosition: "bottomright",
    });
    MapUI.initializeTimeline(timeline, database.concerts);
    applyUrlState();

    const autocomplete = Autocomplete?.setup(search, database, {
      onChoose(suggestion) {
        search.value = "";
        personId = suggestion.kind === "person" ? suggestion.id : "";
        composerId = suggestion.kind === "composer" ? suggestion.id : "";
        composerName = suggestion.kind === "composer" && !suggestion.id ? suggestion.name : "";
        sourceId = suggestion.kind === "source" ? suggestion.id : "";
        cityFilter = suggestion.kind === "city" ? suggestion.name : "";
        countryFilter = suggestion.kind === "country" ? suggestion.name : "";
        sourceTextFilter = suggestion.kind === "source-text" ? suggestion.name : "";
        pieceFilter = "";
        placeFilter = "";
        update({ replace: true, resetScroll: true, clearSelected: true });
        results?.focus({ preventScroll: true });
        return true;
      },
    });
    search.addEventListener("input", () => {
      update({ replace: true, resetScroll: true, clearSelected: true });
    });
    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      autocomplete?.close();
      results?.focus({ preventScroll: true });
    });
    startInput.addEventListener("input", () => {
      if (Number(startInput.value) > Number(endInput.value)) endInput.value = startInput.value;
      update({ replace: true, resetScroll: true, clearSelected: true });
    });
    endInput.addEventListener("input", () => {
      if (Number(endInput.value) < Number(startInput.value)) startInput.value = endInput.value;
      update({ replace: true, resetScroll: true, clearSelected: true });
    });
    function clearFilters() {
      autocomplete?.close();
      search.value = "";
      startInput.value = MapUI.TIMELINE_MIN;
      endInput.value = MapUI.TIMELINE_MAX;
      selectedId = "";
      personId = "";
      composerId = "";
      composerName = "";
      sourceId = "";
      cityFilter = "";
      countryFilter = "";
      sourceTextFilter = "";
      pieceFilter = "";
      placeFilter = "";
      hideProgramPreview({ restoreFocus: false, rerender: false, restoreMapView: false });
      update({ replace: false, resetScroll: true });
      search.focus();
    }
    clearSearch?.addEventListener("click", clearFilters);
    document.querySelector("[data-clear-program-filters]")?.addEventListener("click", clearFilters);
    list.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-program-select]");
      if (!trigger) return;
      const card = trigger.closest("[data-concert-id]");
      const concert = database.concertsById.get(card?.dataset.concertId || "");
      if (concert) showProgramPreview(concert);
    });
    document.querySelector("[data-close-program-preview]")?.addEventListener("click", () => hideProgramPreview());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && programPreview && !programPreview.hidden) {
        event.preventDefault();
        hideProgramPreview();
      }
    });
    window.addEventListener("popstate", applyUrlState);
  }).catch((error) => DB.showError(results || list, error, "Concert programs could not be loaded."));
}());
