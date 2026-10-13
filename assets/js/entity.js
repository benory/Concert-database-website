(function () {
  "use strict";

  const DB = window.ConcertDB;
  const MapUI = window.ConcertMapUI;
  if (!DB) return;

  const pieceDetail = document.getElementById("piece-detail");
  const composerDetail = document.getElementById("composer-detail");
  if (!pieceDetail && !composerDetail) return;

  const params = new URLSearchParams(window.location.search);

  function occurrence(program, database) {
    return { program, concert: database.concertsById.get(program.concert_id) };
  }

  function sortOccurrences(items) {
    return items.sort((left, right) => {
      const a = left.concert;
      const b = right.concert;
      return (a?.year || 0) - (b?.year || 0)
        || (a?.month || 0) - (b?.month || 0)
        || (a?.day || 0) - (b?.day || 0)
        || (left.program.order || 0) - (right.program.order || 0);
    });
  }

  function directionLinks(concert) {
    const people = concert?.direction || [];
    return people.length
      ? people.map((person) => DB.personLink(person, person.role || "Direction")).join('<span class="people-separator" aria-hidden="true">; </span>')
      : "—";
  }

  function displayComposerAuthorities(container, program, database) {
    if (!container) return;
    const identifiers = [...new Set(program.composer_ids || [])];
    if (!identifiers.length) {
      container.textContent = program.composer_name || "Composer unknown";
      return;
    }
    const fragment = document.createDocumentFragment();
    identifiers.forEach((identifier, index) => {
      if (index) fragment.append(document.createTextNode("; "));
      const name = database.composersById.get(identifier)?.name || DB.displayIdentifier(identifier);
      const link = document.createElement("a");
      link.href = DB.composerUrl({ id: identifier, name });
      link.textContent = name;
      link.dataset.personPreview = "";
      link.dataset.personId = identifier;
      link.dataset.personName = name;
      link.dataset.personRole = "Composer";
      fragment.append(link);
    });
    container.replaceChildren(fragment);
  }

  function initializePiece(database) {
    const key = params.get("key") || "";
    const requestedTitle = params.get("title") || "";
    const requestedComposer = params.get("composer") || "";
    const matches = sortOccurrences(database.programs.filter((program) => {
      if (key) return program.work_key === key;
      return DB.normalize(program.standardized_work_name || program.work_name) === DB.normalize(requestedTitle)
        && (
          (program.composer_ids || []).includes(requestedComposer)
          || [program.composer_id, program.canonical_composer, program.composer_name]
            .some((value) => DB.normalize(value) === DB.normalize(requestedComposer))
        );
    }).map((program) => occurrence(program, database)).filter((item) => item.concert));
    if (!matches.length) throw new Error("No performed items match this provisional piece grouping.");

    const representative = matches[0].program;
    const title = representative.standardized_work_name || representative.work_name || "Untitled work";
    DB.setText("#piece-title", title);
    DB.setText("#piece-id", "Provisional work grouping");
    displayComposerAuthorities(document.getElementById("piece-composer"), representative, database);
    const count = document.querySelector("#piece-count strong");
    if (count) count.textContent = matches.length.toLocaleString();

    const body = document.getElementById("piece-performances");
    const template = document.getElementById("piece-performance-row-template");
    const search = document.getElementById("piece-performance-search");

    function render(query) {
      const terms = DB.normalize(query).split(/\s+/).filter(Boolean);
      const filtered = matches.filter(({ program, concert }) => terms.every((term) => DB.normalize([
        program.work_name, program.composer_name, concert.title, concert.date,
        DB.locationLabel(concert), ...(concert.direction || []).map((person) => person.name),
      ].join(" ")).includes(term)));
      const fragment = document.createDocumentFragment();
      filtered.forEach(({ program, concert }) => {
        let row;
        if (template?.content) row = template.content.cloneNode(true).querySelector("tr");
        else {
          row = document.createElement("tr");
          row.innerHTML = '<td><time data-performance-date></time></td><td><a data-program-link data-program-title></a><span data-printed-title></span></td><td data-performance-place></td><td data-direction-cell></td>';
        }
        const time = row.querySelector("[data-performance-date]");
        time.textContent = concert.date || concert.year || "Date unknown";
        if (DB.isoDate(concert)) time.dateTime = DB.isoDate(concert);
        const programLink = row.querySelector("[data-program-link]");
        programLink.href = DB.programUrl(concert.id);
        programLink.textContent = concert.title || "Untitled concert";
        row.querySelector("[data-performance-place]").textContent = DB.locationLabel(concert) || "—";
        const printedTitle = row.querySelector("[data-printed-title]");
        if (printedTitle) printedTitle.textContent = program.work_name && DB.normalize(program.work_name) !== DB.normalize(title) ? program.work_name : "";
        const directionCell = row.querySelector("[data-direction-cell]") || row.querySelector("[data-performance-person]")?.parentElement;
        if (directionCell) directionCell.innerHTML = directionLinks(concert);
        fragment.append(row);
      });
      if (!filtered.length) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="4" class="table-empty">No performances match this filter.</td>';
        fragment.append(row);
      }
      body.replaceChildren(fragment);
    }

    render("");
    search?.addEventListener("input", () => render(search.value));
    document.title = `${title} · Early Music Concerts`;
    pieceDetail.setAttribute("aria-busy", "false");
  }

  function initializeComposer(database) {
    const identifier = params.get("id") || "";
    const requestedName = params.get("name") || "";
    const matches = sortOccurrences(database.programs.filter((program) => {
      if (identifier) return (program.composer_ids || []).includes(identifier);
      const requested = DB.normalize(requestedName);
      return (program.composer_ids || []).some((composerId) => (
        DB.normalize(database.composersById.get(composerId)?.name) === requested
        || program.composer_credits?.some((credit) => credit.id === composerId && DB.normalize(credit.name) === requested)
      )) || DB.normalize(program.canonical_composer || program.composer_name) === requested;
    }).map((program) => occurrence(program, database)).filter((item) => item.concert));
    if (!matches.length) throw new Error("No performed items match this composer.");

    const representative = matches[0].program;
    const requested = DB.normalize(requestedName);
    const composerId = identifier || (representative.composer_ids || []).find((candidate) => (
      DB.normalize(database.composersById.get(candidate)?.name) === requested
      || representative.composer_credits?.some((credit) => credit.id === candidate && DB.normalize(credit.name) === requested)
    )) || representative.composer_ids?.[0] || "";
    const name = database.composersById.get(composerId)?.name
      || (composerId && DB.displayIdentifier(composerId))
      || representative.composer_name
      || "Composer unknown";
    const groupsByConcert = new Map();
    matches.forEach(({ program, concert }) => {
      if (!groupsByConcert.has(concert.id)) groupsByConcert.set(concert.id, { concert, programs: [] });
      groupsByConcert.get(concert.id).programs.push(program);
    });
    const groups = [...groupsByConcert.values()]
      .map((group) => ({
        ...group,
        programs: group.programs.sort((left, right) => (left.order || 0) - (right.order || 0)),
      }))
      .sort((left, right) => {
        const a = left.concert;
        const b = right.concert;
        const aYear = Number.isFinite(a.year) ? a.year : Number.POSITIVE_INFINITY;
        const bYear = Number.isFinite(b.year) ? b.year : Number.POSITIVE_INFINITY;
        return aYear - bYear
          || (a.month || 0) - (b.month || 0)
          || (a.day || 0) - (b.day || 0)
          || String(a.title || "").localeCompare(String(b.title || ""));
      });

    DB.setText("#composer-name", name);
    DB.setText("#composer-dates", `${matches.length.toLocaleString()} ${matches.length === 1 ? "performed piece" : "performed pieces"}`);
    const count = document.querySelector("#composer-count strong");
    if (count) count.textContent = groups.length.toLocaleString();
    const body = document.getElementById("composer-performances");
    const template = document.getElementById("composer-performance-row-template");
    const search = document.getElementById("composer-performance-search");
    const filterCount = document.getElementById("composer-filter-count");
    const composerMap = MapUI?.createToggleMap({
      nodeId: "composer-map",
      toggleId: "composer-map-toggle",
      statusId: "composer-map-status",
      attributionControl: true,
      zoomControl: true,
      zoomPosition: "bottomright",
    });
    let mapHasFramed = false;

    function groupSearchText({ concert, programs }) {
      return DB.normalize([
        concert.title,
        concert.date,
        concert.year,
        DB.locationLabel(concert),
        concert.ensemble,
        ...(concert.direction || []).flatMap((person) => [person.name, person.role]),
        ...programs.flatMap((program) => [
          program.work_name,
          program.standardized_work_name,
          program.composer_name,
          program.canonical_composer,
        ]),
      ].filter(Boolean).join(" "));
    }

    function render(query) {
      const terms = DB.normalize(query).split(/\s+/).filter(Boolean);
      const filtered = groups.filter((group) => terms.every((term) => groupSearchText(group).includes(term)));
      const fragment = document.createDocumentFragment();
      filtered.forEach(({ programs, concert }) => {
        let card;
        if (template?.content) card = template.content.cloneNode(true).querySelector("article");
        else {
          card = document.createElement("article");
          card.className = "composer-concert-card";
          card.innerHTML = '<header class="composer-concert-heading"><time data-performance-date></time><div class="composer-concert-title"><h3><a data-program-link></a></h3><p data-performance-place></p><p class="composer-concert-meta" data-performance-meta></p></div><span class="composer-piece-count" data-piece-count></span></header><div class="composer-concert-pieces"><h4>Pieces</h4><ul data-piece-list></ul></div>';
        }
        card.dataset.concertId = concert.id;
        const time = card.querySelector("[data-performance-date]");
        time.textContent = DB.compactDate(concert);
        if (DB.isoDate(concert)) time.dateTime = DB.isoDate(concert);
        const concertLink = card.querySelector("[data-program-link]");
        concertLink.href = DB.programUrl(concert.id);
        concertLink.textContent = concert.title || "Untitled concert";
        card.querySelector("[data-performance-place]").textContent = DB.locationLabel(concert) || "Place not recorded";

        const direction = (concert.direction || []).map((person) => person.name).filter(Boolean);
        const metadata = [
          String(concert.ensemble || "").trim(),
          direction.length ? `Direction: ${direction.join(", ")}` : "",
        ].filter(Boolean);
        const meta = card.querySelector("[data-performance-meta]");
        meta.textContent = metadata.join(" · ");
        meta.hidden = metadata.length === 0;

        const pieceCount = card.querySelector("[data-piece-count]");
        pieceCount.textContent = `${programs.length.toLocaleString()} ${programs.length === 1 ? "piece" : "pieces"}`;
        const pieceList = card.querySelector("[data-piece-list]");
        programs.forEach((program) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = DB.pieceUrl(program);
          link.textContent = program.work_name || program.standardized_work_name || "Untitled work";
          item.append(link);
          pieceList.append(item);
        });
        fragment.append(card);
      });
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "composer-appearance-empty";
        empty.innerHTML = "<strong>No concerts match this filter.</strong><span>Try another place, date, concert, or piece title.</span>";
        fragment.append(empty);
      }
      body.replaceChildren(fragment);
      body.setAttribute("aria-busy", "false");
      if (filterCount) {
        filterCount.textContent = terms.length
          ? `Showing ${filtered.length.toLocaleString()} of ${groups.length.toLocaleString()} ${groups.length === 1 ? "concert" : "concerts"}`
          : "";
      }
      composerMap?.render(filtered.map((group) => group.concert), { preserveView: mapHasFramed });
      mapHasFramed = true;
    }

    render("");
    search?.addEventListener("input", () => render(search.value));
    document.title = `${name} · Early Music Concerts`;
    composerDetail.setAttribute("aria-busy", "false");
  }

  DB.loadData().then((database) => {
    if (pieceDetail) initializePiece(database);
    else initializeComposer(database);
    DB.setupPersonPreviews(database);
  }).catch((error) => DB.showError(pieceDetail || composerDetail, error, "This record could not be displayed."));
}());
