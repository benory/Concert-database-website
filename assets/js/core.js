(function () {
  "use strict";

  const script = document.currentScript;
  const scriptPath = script ? new URL(script.src, window.location.href).pathname : "";
  const basePath = scriptPath.includes("/assets/js/")
    ? scriptPath.slice(0, scriptPath.indexOf("/assets/js/"))
    : "";

  const state = {
    promise: null,
    activePreview: null,
    previewTimer: null,
  };

  function path(relativePath) {
    const suffix = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    return `${basePath}${suffix}`.replace(/\/+/g, "/");
  }

  function url(relativePath, params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).length) query.set(key, value);
    });
    const encoded = query.toString();
    return `${path(relativePath)}${encoded ? `?${encoded}` : ""}`;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }[character]));
  }

  function displayIdentifier(identifier) {
    return String(identifier || "")
      .replace(/^(?:PER|COM|ARC|SRC|EDN|BIB):/, "")
      .replace(/_/g, " ")
      .trim();
  }

  function locationLabel(concert) {
    return [concert.location, concert.city, concert.country].filter(Boolean).join(", ");
  }

  function compactDate(concert) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[Number(concert.month) - 1];
    if (concert.day && month && concert.year) return `${String(concert.day).padStart(2, "0")} ${month} ${concert.year}`;
    return concert.date || concert.year || "Date unknown";
  }

  function isoDate(concert) {
    if (!concert.year) return "";
    if (!concert.month) return String(concert.year);
    if (!concert.day) return `${concert.year}-${String(concert.month).padStart(2, "0")}`;
    return `${concert.year}-${String(concert.month).padStart(2, "0")}-${String(concert.day).padStart(2, "0")}`;
  }

  function pieceUrl(program) {
    return url("/piece/", { key: program.work_key });
  }

  function pieceGroupKey(program) {
    const title = program.work_name || program.standardized_work_name;
    if (!title) return "";
    const ids = [...new Set(program.composer_ids || [])].sort();
    return JSON.stringify([normalize(title), ids.length ? ids : normalize(program.composer_name || "Composer unknown")]);
  }

  function composerUrl(person) {
    const id = typeof person === "string" ? person : person && person.id;
    const name = typeof person === "object" && person ? person.name : "";
    return url("/concerts/", id ? { composer: id } : { composer_name: name });
  }

  // Public URLs omit the CON prefix; spreadsheet IDs retain it. Accept the
  // previous colon and hyphen forms as well as the shortened identifier.
  function programId(value) {
    const identifier = String(value || "").replace(/^CON-/, "CON:");
    return identifier && !identifier.includes(":") ? `CON:${identifier}` : identifier;
  }

  function programSlug(value) {
    return programId(value).replace(/^CON:/, "");
  }

  function programUrl(concertId) {
    return url("/program/", { id: programSlug(concertId) });
  }

  function personConcertsUrl(person) {
    const identifier = person && person.id;
    const name = person && person.name;
    return url("/concerts/", identifier ? { person: identifier } : { q: name });
  }

  function sourceConcertsUrl(source) {
    const identifier = source && source.id;
    const name = source && (source.sigla || source.alias);
    return url("/concerts/", identifier ? { q: name, source: identifier } : { q: name });
  }

  function personAuthorityIdentifiers(person) {
    return [
      { label: "BMLO", value: person?.bmlo_id, url: person?.bmlo_url },
      { label: "GND", value: person?.gnd_id, url: person?.gnd_url },
      { label: "VIAF", value: person?.viaf_id, url: person?.viaf_url },
    ].filter((identifier) => identifier.value);
  }

  async function fetchJson(relativePath) {
    const response = await fetch(path(relativePath), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Could not load ${relativePath} (${response.status})`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error(`${relativePath} is not a JSON array`);
    return value;
  }

  function composerIdentifiers(value) {
    return String(value || "").match(/\bCOM:[\p{L}\p{N}_.-]+/gu) || [];
  }

  function printedComposerParts(value, expectedCount) {
    const text = String(value || "").trim();
    if (!text) return [];
    if (expectedCount <= 1) return [{ name: text, separatorBefore: "" }];

    const parts = [];
    const separators = /\s*;\s*|\s+(?:and|und|et|e)\s+/giu;
    let cursor = 0;
    let separatorBefore = "";
    for (const match of text.matchAll(separators)) {
      const name = text.slice(cursor, match.index);
      if (!name.trim()) return [];
      parts.push({ name, separatorBefore });
      separatorBefore = match[0];
      cursor = match.index + match[0].length;
    }
    const finalName = text.slice(cursor);
    if (!finalName.trim()) return [];
    parts.push({ name: finalName, separatorBefore });
    return parts.length === expectedCount ? parts : [];
  }

  function composerCredits(program, composersById) {
    const identifiers = program.composer_ids || composerIdentifiers(program.composer_id);
    const printed = String(program.composer_name || "").trim();
    if (!identifiers.length) {
      return printed ? [{ id: "", name: printed, canonicalName: "", separatorBefore: "" }] : [];
    }

    const printedParts = printedComposerParts(printed, identifiers.length);
    if (printed && !printedParts.length) {
      // Preserve uncertain program wording intact instead of attaching portions
      // of it to the wrong authority record.
      return [{ id: "", name: printed, canonicalName: "", separatorBefore: "" }];
    }

    return identifiers.map((identifier, index) => {
      const canonicalName = composersById.get(identifier)?.name || displayIdentifier(identifier);
      return {
        id: identifier,
        name: printedParts[index]?.name || canonicalName,
        canonicalName,
        separatorBefore: printedParts[index]?.separatorBefore || (index ? "; " : ""),
      };
    });
  }

  function prepare(concerts, programs, composers, authorityPeople, sources, editions, archives, programPreviews) {
    const concertsById = new Map();
    const programsByConcert = new Map();
    const people = new Map();
    const composersById = new Map((composers || []).map((composer) => [composer.id, composer]));
    const peopleById = new Map((authorityPeople || []).map((person) => [person.id, person]));
    const peopleAuthoritiesByReference = new Map();
    const sourcesById = new Map((sources || []).map((source) => [source.id, source]));
    const editionsById = new Map((editions || []).map((edition) => [edition.id, edition]));
    const archivesById = new Map((archives || []).map((archive) => [archive.id, archive]));
    const programPreviewsById = new Map((programPreviews || []).map((preview) => [preview.id, preview]));

    (authorityPeople || []).forEach((person) => {
      [person.id, person.name, ...(person.aliases || [])].filter(Boolean).forEach((reference) => {
        peopleAuthoritiesByReference.set(reference === person.id ? reference : normalize(reference), person);
      });
    });

    programs.forEach((program, index) => {
      program.order = Number(program.order) || index + 1;
      // This is authority data, not a cleaned version of the wording printed in
      // the program. `composer_name` deliberately remains the transcription.
      program.composer_ids = [...new Set(composerIdentifiers(program.composer_id))];
      program.canonical_composers = program.composer_ids.map((identifier) => (
        composersById.get(identifier)?.name || displayIdentifier(identifier)
      ));
      program.canonical_composer = program.canonical_composers.join("; ");
      program.composer_credits = composerCredits(program, composersById);
      program.source_ids = String(program.source_id || "").match(/\bSRC:[\p{L}\p{N}_.-]+/gu) || [];
      program.work_key = program.work_key || `${normalize(program.standardized_work_name || program.work_name)}::${normalize(program.composer_id || program.canonical_composer || program.composer_name)}`;
      if (!programsByConcert.has(program.concert_id)) programsByConcert.set(program.concert_id, []);
      programsByConcert.get(program.concert_id).push(program);

      const composerAuthorities = program.composer_ids.length
        ? program.composer_ids.map((identifier) => ({
          ...(composersById.get(identifier) || {}),
          id: identifier,
          name: composersById.get(identifier)?.name || displayIdentifier(identifier),
        }))
        : (program.composer_name ? [{ id: "", name: program.composer_name }] : []);
      composerAuthorities.forEach((authority) => {
        const key = authority.id || normalize(authority.name);
        if (!people.has(key)) people.set(key, {
          ...authority,
          id: authority.id,
          name: authority.name,
          roles: new Set(),
          concertIds: new Set(),
          composerPerformances: 0,
        });
        const person = people.get(key);
        person.roles.add("Composer");
        person.concertIds.add(program.concert_id);
        person.composerPerformances += 1;
      });
    });

    programsByConcert.forEach((items) => items.sort((a, b) => a.order - b.order));

    concerts.forEach((concert) => {
      concert.year = Number(concert.year) || null;
      concert.latitude = Number.isFinite(Number(concert.latitude)) ? Number(concert.latitude) : null;
      concert.longitude = Number.isFinite(Number(concert.longitude)) ? Number(concert.longitude) : null;
      concert.programs = programsByConcert.get(concert.id) || [];
      concert.program_preview = programPreviewsById.get(concert.id) || null;
      const archiveIds = concert.archive_ids || [];
      const signatureParts = archiveIds.length > 1
        ? String(concert.signature || "").split(/\s*;\s*/).map((part) => part.trim())
        : [String(concert.signature || "").trim()];
      concert.archive_references = archiveIds.map((identifier, index) => ({
        id: identifier,
        authority: identifier.startsWith("ARC:") ? archivesById.get(identifier) : editionsById.get(identifier),
        signature: signatureParts[index] || "",
      }));
      if (!archiveIds.length && signatureParts[0]) {
        concert.archive_references.push({ id: "", authority: null, signature: signatureParts[0] });
      }
      concertsById.set(concert.id, concert);

      ["introduction", "direction", "performers"].forEach((group) => {
        (concert[group] || []).forEach((entry) => {
          const authority = peopleAuthoritiesByReference.get(entry.id) || peopleAuthoritiesByReference.get(normalize(entry.name));
          if (authority) {
            entry.id = authority.id;
            entry.name = authority.name;
          }
          const key = authority?.id || entry.id || normalize(entry.name);
          if (!key) return;
          if (!people.has(key)) people.set(key, {
            ...(authority || {}),
            id: authority?.id || entry.id || "",
            name: authority?.name || entry.name || displayIdentifier(entry.id),
            roles: new Set(),
            concertIds: new Set(),
            composerPerformances: 0,
          });
          const person = people.get(key);
          person.roles.add(entry.role || ({ introduction: "Introduction", direction: "Direction", performers: "Performer" }[group]));
          person.concertIds.add(concert.id);
        });
      });

      concert.searchText = normalize([
        concert.id, concert.title, concert.date, concert.year, concert.ensemble,
        concert.location, concert.city, concert.country,
        ...[...(concert.introduction || []), ...(concert.direction || []), ...(concert.performers || [])]
          .flatMap((entry) => {
            const person = people.get(entry.id || normalize(entry.name));
            return [entry.id, entry.name, entry.role, ...(person?.aliases || [])];
          }),
        ...concert.programs.flatMap((program) => [
          program.work_name, program.standardized_work_name, program.composer_name,
          program.canonical_composer, ...program.canonical_composers,
          program.composer_id, ...program.composer_ids, program.source_id,
          ...program.source_ids.flatMap((identifier) => {
            const source = sourcesById.get(identifier);
            return [identifier, source?.sigla, source?.alias];
          }),
        ]),
        ...concert.archive_references.flatMap((reference) => [reference.id, reference.authority?.name]),
      ].filter(Boolean).join(" "));
    });

    const peopleByReference = new Map();
    people.forEach((person) => {
      [person.id, person.name, ...(person.aliases || [])].filter(Boolean).forEach((reference) => {
        peopleByReference.set(reference === person.id ? reference : normalize(reference), person);
      });
    });

    const years = concerts.map((concert) => concert.year).filter(Number.isFinite);
    return {
      concerts,
      programs,
      composers: composers || [],
      authorityPeople: authorityPeople || [],
      sources: sources || [],
      editions: editions || [],
      archives: archives || [],
      programPreviews: programPreviews || [],
      concertsById,
      programsByConcert,
      composersById,
      peopleById,
      peopleByReference,
      sourcesById,
      editionsById,
      archivesById,
      programPreviewsById,
      people,
      minYear: years.length ? Math.min(...years) : 1915,
      maxYear: years.length ? Math.max(...years) : 1960,
    };
  }

  function loadData() {
    if (!state.promise) {
      state.promise = Promise.all([
        fetchJson("/assets/data/concerts.json"),
        fetchJson("/assets/data/programs.json"),
        fetchJson("/assets/data/composers.json"),
        fetchJson("/assets/data/people.json"),
        fetchJson("/assets/data/sources.json"),
        fetchJson("/assets/data/editions.json"),
        fetchJson("/assets/data/archives.json"),
        fetchJson("/assets/data/program-previews.json"),
      ]).then(([concerts, programs, composers, people, sources, editions, archives, programPreviews]) => (
        prepare(concerts, programs, composers, people, sources, editions, archives, programPreviews)
      ));
    }
    return state.promise;
  }

  function setText(selectorOrNode, value) {
    const node = typeof selectorOrNode === "string" ? document.querySelector(selectorOrNode) : selectorOrNode;
    if (node) node.textContent = value == null || value === "" ? "—" : String(value);
  }

  function showError(container, error, context) {
    if (!container) return;
    container.removeAttribute("aria-busy");
    container.innerHTML = `<div class="data-error" role="alert"><strong>${escapeHtml(context || "The data could not be loaded.")}</strong><p>${escapeHtml(error.message)}</p></div>`;
  }

  function personLink(person, role, extraClass) {
    const identifier = person.id || "";
    const name = person.name || displayIdentifier(identifier) || "Unknown";
    const resolvedRole = role || person.role || "";
    const className = escapeHtml(extraClass || "person-link");
    const previewAttributes = `class="${className}" data-person-preview data-person-id="${escapeHtml(identifier)}" data-person-name="${escapeHtml(name)}" data-person-role="${escapeHtml(resolvedRole)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="person-preview"`;
    const isComposer = identifier ? identifier.startsWith("COM:") : /composer/i.test(resolvedRole);
    if (isComposer) {
      return `<a ${previewAttributes} href="${escapeHtml(composerUrl({ id: identifier, name }))}">${escapeHtml(name)}</a>`;
    }
    if (person.narrative_description) {
      return `<button type="button" ${previewAttributes}>${escapeHtml(name)}</button>`;
    }
    const concertCount = person.concertIds instanceof Set ? person.concertIds.size : Number(person.concert_count) || 0;
    if (concertCount > 1) {
      return `<a class="${className}" href="${escapeHtml(personConcertsUrl(person))}">${escapeHtml(name)}</a>`;
    }
    return `<span class="person-name">${escapeHtml(name)}</span>`;
  }

  function placePreview(preview, target, data) {
    const rect = target.getBoundingClientRect();
    const gap = 12;
    const inset = 12;
    preview.style.visibility = "hidden";
    preview.hidden = false;
    const previewRect = preview.getBoundingClientRect();
    const fitsRight = rect.right + gap + previewRect.width <= window.innerWidth - inset;
    const fitsLeft = rect.left - gap - previewRect.width >= inset;
    let left;
    let top;
    let placement;

    if (fitsRight || fitsLeft) {
      placement = fitsRight ? "right" : "left";
      left = fitsRight ? rect.right + gap : rect.left - previewRect.width - gap;
      const centeredTop = rect.top + ((rect.height - previewRect.height) / 2);
      top = Math.min(
        Math.max(inset, centeredTop),
        Math.max(inset, window.innerHeight - previewRect.height - inset),
      );
    } else {
      placement = "below";
      left = Math.min(Math.max(inset, rect.left), Math.max(inset, window.innerWidth - previewRect.width - inset));
      top = rect.bottom + gap;
      if (top + previewRect.height > window.innerHeight - inset) {
        top = Math.max(inset, rect.top - previewRect.height - gap);
        placement = "above";
      }
    }

    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    preview.style.visibility = "visible";
    preview.dataset.placement = placement;
    preview.dataset.personKey = data.id || normalize(data.name);
  }

  function setupPersonPreviews(data) {
    const preview = document.getElementById("person-preview");
    if (!preview || preview.dataset.ready) return;
    preview.dataset.ready = "true";
    let activeTarget = null;
    let suppressPreviewFocus = false;

    function resetTarget(target) {
      if (!target) return;
      target.setAttribute("aria-expanded", "false");
      delete target.dataset.previewTouchOpen;
    }

    function hideNow({ restoreFocus = false } = {}) {
      window.clearTimeout(state.previewTimer);
      const target = activeTarget;
      resetTarget(target);
      preview.hidden = true;
      activeTarget = null;
      state.activePreview = null;
      if (restoreFocus && target) {
        suppressPreviewFocus = true;
        target.focus({ preventScroll: true });
        window.queueMicrotask(() => { suppressPreviewFocus = false; });
      }
    }

    function personFor(target) {
      const id = target.dataset.personId || "";
      const name = target.dataset.personName || displayIdentifier(id);
      return data.peopleByReference.get(id) || data.peopleByReference.get(normalize(name)) || {
        id,
        name,
        roles: new Set([target.dataset.personRole].filter(Boolean)),
        concertIds: new Set(),
        composerPerformances: 0,
      };
    }

    function show(target) {
      window.clearTimeout(state.previewTimer);
      if (activeTarget && activeTarget !== target) resetTarget(activeTarget);
      const person = personFor(target);
      const roles = [...person.roles].filter(Boolean);
      const concertCount = person.concertIds.size;
      const lifeDates = [person.birth_year, person.death_year].filter(Boolean).join("–");
      const identity = [lifeDates, person.position].filter(Boolean).join(" · ");
      const isComposer = person.id
        ? person.id.startsWith("COM:")
        : person.composerPerformances > 0 || /composer/i.test(target.dataset.personRole || "");
      const destination = isComposer ? composerUrl(person) : personConcertsUrl(person);
      const destinationLabel = isComposer
        ? "View all performances"
        : `See all ${concertCount} ${concertCount === 1 ? "concert" : "concerts"}`;
      const authorityIdentifiers = personAuthorityIdentifiers(person);
      const authorityLinks = authorityIdentifiers.map((identifier) => {
        const text = `${identifier.label} ${identifier.value}`;
        return identifier.url
          ? `<a href="${escapeHtml(identifier.url)}" target="_blank" rel="noopener">${escapeHtml(text)} <span aria-hidden="true">↗</span></a>`
          : `<span>${escapeHtml(text)}</span>`;
      }).join("");
      preview.innerHTML = `
        <strong id="person-preview-title">${escapeHtml(person.name)}</strong>
        ${identity ? `<span>${escapeHtml(identity)}</span>` : (roles.length ? `<span>${escapeHtml(roles.join(" · "))}</span>` : "")}
        <a class="person-preview-link" href="${escapeHtml(destination)}">${escapeHtml(destinationLabel)} <span aria-hidden="true">→</span></a>
        ${authorityLinks ? `<div class="person-preview-authorities" aria-label="Unique identifiers">${authorityLinks}</div>` : ""}
        ${person.narrative_description ? `
          <div class="person-preview-biography">
            <p id="person-preview-narrative" class="person-preview-narrative">${escapeHtml(person.narrative_description)}</p>
            <button class="person-preview-toggle" type="button" data-person-narrative-toggle aria-expanded="false" aria-controls="person-preview-narrative" hidden>Read more</button>
          </div>` : ""}`;
      placePreview(preview, target, person);
      const narrative = preview.querySelector(".person-preview-narrative");
      const toggle = preview.querySelector("[data-person-narrative-toggle]");
      if (narrative && toggle) {
        toggle.hidden = narrative.scrollHeight <= narrative.clientHeight + 1;
        if (!toggle.hidden) placePreview(preview, target, person);
      }
      activeTarget = target;
      target.setAttribute("aria-expanded", "true");
      state.activePreview = target;
    }

    function hideSoon() {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = window.setTimeout(hideNow, 140);
    }

    document.addEventListener("pointerover", (event) => {
      const target = event.target.closest("[data-person-preview]");
      if (target) show(target);
    });
    document.addEventListener("pointerout", (event) => {
      const target = event.target.closest("[data-person-preview]");
      if (target && !target.contains(event.relatedTarget)) hideSoon();
    });
    document.addEventListener("focusin", (event) => {
      if (suppressPreviewFocus) return;
      const target = event.target.closest("[data-person-preview]");
      if (target) show(target);
    });
    document.addEventListener("focusout", (event) => {
      if (event.target.closest("[data-person-preview]") && !preview.contains(event.relatedTarget)) hideSoon();
    });
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-person-preview]");
      if (!target) {
        if (!preview.contains(event.target)) hideSoon();
        return;
      }
      if (target.tagName === "BUTTON" && !window.matchMedia("(hover: none)").matches) {
        event.preventDefault();
        show(target);
        if (event.detail === 0) preview.querySelector("a")?.focus();
        return;
      }
      // Hover and keyboard focus already expose the preview. On touch, the first
      // tap opens it and its explicit link remains available for navigation.
      if (window.matchMedia("(hover: none)").matches) {
        if (target.tagName === "A" && target.dataset.previewTouchOpen === "true") return;
        event.preventDefault();
        target.dataset.previewTouchOpen = "true";
        show(target);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !preview.hidden) {
        event.preventDefault();
        hideNow({ restoreFocus: true });
        return;
      }
      if (event.key !== "Tab" || preview.hidden || !activeTarget) return;
      const previewControls = [...preview.querySelectorAll("a[href], button:not([hidden]):not([disabled])")];
      const firstControl = previewControls[0];
      const lastControl = previewControls[previewControls.length - 1];
      if (!event.shiftKey && event.target === activeTarget && firstControl) {
        event.preventDefault();
        firstControl.focus();
      } else if (event.shiftKey && event.target === firstControl) {
        event.preventDefault();
        activeTarget.focus({ preventScroll: true });
      } else if (!event.shiftKey && event.target === lastControl) {
        const target = activeTarget;
        const focusable = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter((candidate) => !preview.contains(candidate) && !candidate.hidden);
        const next = focusable[focusable.indexOf(target) + 1];
        if (next) {
          event.preventDefault();
          hideNow();
          next.focus({ preventScroll: true });
        }
      }
    });
    preview.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-person-narrative-toggle]");
      if (!toggle) return;
      const narrative = preview.querySelector(".person-preview-narrative");
      if (!narrative || !activeTarget) return;
      const expanded = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.textContent = expanded ? "Show less" : "Read more";
      narrative.classList.toggle("is-expanded", expanded);
      placePreview(preview, activeTarget, personFor(activeTarget));
    });
    preview.addEventListener("pointerenter", () => window.clearTimeout(state.previewTimer));
    preview.addEventListener("pointerleave", hideSoon);
    preview.addEventListener("focusout", (event) => {
      if (!preview.contains(event.relatedTarget) && event.relatedTarget !== activeTarget) hideSoon();
    });
  }

  window.ConcertDB = {
    basePath,
    path,
    url,
    loadData,
    normalize,
    escapeHtml,
    displayIdentifier,
    locationLabel,
    compactDate,
    isoDate,
    programId,
    programSlug,
    programUrl,
    pieceUrl,
    pieceGroupKey,
    composerUrl,
    personConcertsUrl,
    sourceConcertsUrl,
    personAuthorityIdentifiers,
    personLink,
    setText,
    showError,
    setupPersonPreviews,
  };
}());
