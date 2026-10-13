(function () {
  "use strict";

  const DB = window.ConcertDB;
  if (!DB) return;

  function leadingYear(value) {
    const match = String(value || "").match(/(?:^|\D)(\d{3,4})(?=\D|$)/);
    return match ? match[1] : "";
  }

  function composerDating(composer) {
    const birth = leadingYear(composer?.birth_date);
    const death = leadingYear(composer?.death_date);
    if (birth && death) return { prefix: "", years: `${birth}–${death}` };
    if (birth) return { prefix: "b.", years: birth };
    if (death) return { prefix: "d.", years: death };

    const start = leadingYear(composer?.cya_start);
    const end = leadingYear(composer?.cya_end);
    if (!start && !end) return null;
    return {
      prefix: "fl.",
      years: start && end && start !== end ? `${start}–${end}` : (start || end),
    };
  }

  function personDating(person) {
    const birth = leadingYear(person?.birth_year);
    const death = leadingYear(person?.death_year);
    if (birth && death) return { prefix: "", years: `${birth}–${death}` };
    if (birth) return { prefix: "b.", years: birth };
    if (death) return { prefix: "d.", years: death };
    return null;
  }

  function composerSuggestionLabel(composer) {
    const dating = composerDating(composer.authority);
    const dates = dating ? `, ${dating.prefix ? `${dating.prefix} ` : ""}${dating.years}` : "";
    return `${composer.name} (composer${dates})`;
  }

  function personSuggestionLabel(person) {
    const dating = personDating(person.authority);
    const identity = [
      person.authority?.position,
      dating ? `${dating.prefix ? `${dating.prefix} ` : ""}${dating.years}` : "",
    ].filter(Boolean).join(", ");
    return `${person.name}${identity ? ` (${identity})` : ""}`;
  }

  function suggestionConcertCountLabel(suggestion) {
    const concertCount = suggestion.concertIds?.size || 0;
    return `${concertCount.toLocaleString()} ${concertCount === 1 ? "concert" : "concerts"}`;
  }

  function suggestionLabel(suggestion) {
    let identity = suggestion.name;
    if (suggestion.kind === "person") identity = personSuggestionLabel(suggestion);
    if (suggestion.kind === "composer") identity = composerSuggestionLabel(suggestion);
    return `${identity}, ${suggestionConcertCountLabel(suggestion)}`;
  }

  function buildComposerSuggestions(programs, composersById) {
    const grouped = new Map();
    programs.forEach((program) => {
      const printedName = String(program.composer_name || "").trim();
      const identifiers = [...new Set(program.composer_ids || [])];
      if (!identifiers.length && !printedName) return;
      const entries = identifiers.length
        ? identifiers.map((identifier) => ({
          identifier,
          printedName: program.composer_credits?.find((credit) => credit.id === identifier)?.name || "",
        }))
        : [{ identifier: "", printedName }];

      entries.forEach(({ identifier, printedName: componentName }) => {
        const canonical = composersById.get(identifier);
        const key = identifier || DB.normalize(componentName);
        if (!grouped.has(key)) {
          grouped.set(key, {
            kind: "composer",
            id: identifier,
            name: canonical?.name || (identifier && DB.displayIdentifier(identifier)) || componentName,
            authority: canonical || null,
            aliases: new Set(),
            concertIds: new Set(),
          });
        }
        const composer = grouped.get(key);
        [composer.name, ...(canonical?.aliases || []), componentName]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .forEach((value) => composer.aliases.add(value));
        composer.concertIds.add(program.concert_id);
      });
    });

    return [...grouped.values()].map((composer) => ({
      ...composer,
      normalizedName: DB.normalize(composer.name),
      normalizedAliases: [...composer.aliases].map((alias) => DB.normalize(alias)),
      sortCount: composer.concertIds.size,
    }));
  }

  function buildPersonSuggestions(people) {
    return [...people.values()]
      .filter((person) => person.id?.startsWith("PER:") && person.narrative_description && person.concertIds?.size)
      .map((person) => ({
        kind: "person",
        id: person.id,
        name: person.name,
        authority: person,
        aliases: new Set([person.name, ...(person.aliases || [])].filter(Boolean)),
        concertIds: person.concertIds,
        normalizedName: DB.normalize(person.name),
        normalizedAliases: [person.name, ...(person.aliases || [])].filter(Boolean).map((alias) => DB.normalize(alias)),
        sortCount: person.concertIds.size,
      }));
  }

  function buildPlaceSuggestions(concerts) {
    const grouped = new Map();
    concerts.forEach((concert) => {
      [["city", concert.city], ["country", concert.country]].forEach(([kind, rawName]) => {
        const name = String(rawName || "").trim();
        if (!name) return;
        const key = `${kind}:${DB.normalize(name)}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            kind,
            name,
            aliases: new Set(),
            concertIds: new Set(),
          });
        }
        const place = grouped.get(key);
        place.aliases.add(name);
        place.concertIds.add(concert.id);
      });
    });

    return [...grouped.values()].map((place) => ({
      ...place,
      normalizedName: DB.normalize(place.name),
      normalizedAliases: [...place.aliases].map((alias) => DB.normalize(alias)),
      sortCount: place.concertIds.size,
    }));
  }

  function sourceName(source) {
    if (source.sigla && source.alias && DB.normalize(source.sigla) !== DB.normalize(source.alias)) {
      return `${source.sigla} (${source.alias})`;
    }
    return source.sigla || source.alias || DB.displayIdentifier(source.id) || source.id;
  }

  function buildSourceSuggestions(programs, sourcesById) {
    const grouped = new Map();
    const unlinked = new Map();
    programs.forEach((program) => {
      const identifiers = program.source_ids || [];
      if (!identifiers.length) {
        const rawSource = String(program.source_id || "").trim();
        const key = DB.normalize(rawSource);
        if (key && !unlinked.has(key)) {
          unlinked.set(key, {
            kind: "source-text",
            name: rawSource,
            aliases: new Set([rawSource]),
            concertIds: new Set(),
          });
        }
        if (key) unlinked.get(key).concertIds.add(program.concert_id);
      }
      identifiers.forEach((identifier) => {
        const source = sourcesById.get(identifier);
        if (!source) return;
        if (!grouped.has(identifier)) {
          grouped.set(identifier, {
            kind: "source",
            id: identifier,
            name: sourceName(source),
            authority: source,
            aliases: new Set(),
            concertIds: new Set(),
          });
        }
        const suggestion = grouped.get(identifier);
        [source.sigla, source.alias, source.id].filter(Boolean).forEach((alias) => suggestion.aliases.add(alias));
        suggestion.concertIds.add(program.concert_id);
      });
    });

    return [...grouped.values(), ...unlinked.values()].map((source) => ({
      ...source,
      normalizedName: DB.normalize(source.name),
      normalizedAliases: [...source.aliases].map((alias) => DB.normalize(alias)),
      sortCount: source.concertIds.size,
    }));
  }

  function suggestionDestination(suggestion) {
    if (suggestion.kind === "person") return DB.personConcertsUrl(suggestion);
    if (suggestion.kind === "composer") return DB.composerUrl({ id: suggestion.id, name: suggestion.name });
    if (suggestion.kind === "source") return DB.sourceConcertsUrl(suggestion.authority || suggestion);
    const params = new URLSearchParams({ q: suggestion.name });
    if (suggestion.kind === "city") params.set("city", suggestion.name);
    if (suggestion.kind === "country") params.set("country", suggestion.name);
    if (suggestion.kind === "source-text") params.set("source_text", suggestion.name);
    return `${DB.path("/concerts/")}?${params}`;
  }

  function suggestionMatchRank(suggestion, query) {
    if (suggestion.normalizedName.startsWith(query)) return 0;
    if (suggestion.normalizedAliases.some((alias) => alias.startsWith(query))) return 1;
    if (suggestion.normalizedName.split(" ").some((word) => word.startsWith(query))) return 2;
    if (suggestion.normalizedAliases.some((alias) => alias.split(" ").some((word) => word.startsWith(query)))) return 3;
    if (suggestion.normalizedName.includes(query)) return 4;
    if (suggestion.normalizedAliases.some((alias) => alias.includes(query))) return 5;
    return Number.POSITIVE_INFINITY;
  }

  function appendDating(qualifier, dating, separator) {
    if (!dating) return;
    qualifier.append(document.createTextNode(separator === undefined ? ", " : separator));
    if (dating.prefix === "fl.") {
      const flourish = document.createElement("i");
      flourish.textContent = "fl.";
      qualifier.append(flourish, document.createTextNode(` ${dating.years}`));
    } else {
      qualifier.append(document.createTextNode(`${dating.prefix ? `${dating.prefix} ` : ""}${dating.years}`));
    }
  }

  function setup(input, database, options) {
    const settings = options || {};
    const container = input?.closest(".search-autocomplete");
    const list = container?.querySelector(".search-suggestions");
    const status = container?.querySelector("[role='status']");
    if (!input || !database || !container || !list || input.dataset.autocompleteReady) return null;
    input.dataset.autocompleteReady = "true";

    const suggestions = [
      ...buildComposerSuggestions(database.programs, database.composersById),
      ...buildPersonSuggestions(database.people),
      ...buildPlaceSuggestions(database.concerts),
      ...buildSourceSuggestions(database.programs, database.sourcesById),
    ];
    let visible = [];
    let active = -1;

    function matches(query) {
      const normalized = DB.normalize(query);
      if (normalized.length < 2) return [];
      return suggestions
        .map((suggestion) => ({ suggestion, rank: suggestionMatchRank(suggestion, normalized) }))
        .filter((match) => Number.isFinite(match.rank))
        .sort((left, right) => (
          left.rank - right.rank
          || right.suggestion.sortCount - left.suggestion.sortCount
          || left.suggestion.name.localeCompare(right.suggestion.name)
        ))
        .slice(0, 8)
        .map((match) => match.suggestion);
    }

    function close() {
      list.hidden = true;
      list.replaceChildren();
      visible = [];
      active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function setActive(index) {
      const items = [...list.querySelectorAll("[role='option']")];
      if (!items.length) return;
      active = (index + items.length) % items.length;
      items.forEach((item, itemIndex) => item.setAttribute("aria-selected", String(itemIndex === active)));
      const activeItem = items[active];
      input.setAttribute("aria-activedescendant", activeItem.id);
      activeItem.scrollIntoView({ block: "nearest" });
      if (status) status.textContent = `${suggestionLabel(visible[active])}, ${active + 1} of ${items.length}.`;
    }

    function choose(index) {
      const suggestion = visible[index];
      if (!suggestion) return;
      close();
      if (typeof settings.onChoose === "function") {
        const handled = settings.onChoose(suggestion);
        if (handled !== false) return;
      }
      window.location.assign(suggestionDestination(suggestion));
    }

    function render() {
      visible = matches(input.value);
      active = -1;
      input.removeAttribute("aria-activedescendant");
      if (!visible.length) {
        close();
        if (status) status.textContent = DB.normalize(input.value).length >= 2
          ? "No composer, person, place, or source suggestions."
          : "";
        return;
      }

      const fragment = document.createDocumentFragment();
      visible.forEach((suggestion, index) => {
        const option = document.createElement("li");
        option.id = `${input.id || "search"}-suggestion-${index}`;
        option.className = "search-suggestion";
        option.dataset.searchSuggestion = String(index);
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");

        const name = document.createElement("strong");
        const nameText = document.createElement("span");
        nameText.textContent = suggestion.name;
        name.append(nameText);
        const qualifier = document.createElement("span");
        qualifier.className = "search-suggestion-qualifier";
        if (suggestion.kind === "person") {
          const dating = personDating(suggestion.authority);
          const position = suggestion.authority?.position;
          if (position || dating) {
            qualifier.append(document.createTextNode(" ("));
            if (position) qualifier.append(document.createTextNode(position));
            appendDating(qualifier, dating, position ? ", " : "");
            qualifier.append(document.createTextNode(")"));
          }
        } else if (suggestion.kind === "composer") {
          const dating = composerDating(suggestion.authority);
          qualifier.append(document.createTextNode(" (composer"));
          appendDating(qualifier, dating);
          qualifier.append(document.createTextNode(")"));
        }
        const concertCount = document.createElement("span");
        concertCount.className = "search-suggestion-count";
        concertCount.textContent = `, ${suggestionConcertCountLabel(suggestion)}`;
        name.append(qualifier, concertCount);
        option.setAttribute("aria-label", suggestionLabel(suggestion));
        option.append(name);
        fragment.append(option);
      });
      list.replaceChildren(fragment);
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      if (status) status.textContent = `${visible.length} ${visible.length === 1 ? "suggestion" : "suggestions"} available.`;
    }

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (list.hidden) render();
        if (list.hidden) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(active < 0 ? (step > 0 ? 0 : visible.length - 1) : active + step);
      } else if (event.key === "Home" && !list.hidden) {
        event.preventDefault();
        setActive(0);
      } else if (event.key === "End" && !list.hidden) {
        event.preventDefault();
        setActive(visible.length - 1);
      } else if (event.key === "Enter" && active >= 0 && !list.hidden) {
        event.preventDefault();
        choose(active);
      } else if (event.key === "Escape" && !list.hidden) {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        close();
      }
    });
    list.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-search-suggestion]")) event.preventDefault();
    });
    list.addEventListener("click", (event) => {
      const option = event.target.closest("[data-search-suggestion]");
      if (option) choose(Number(option.dataset.searchSuggestion));
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!container.contains(document.activeElement)) close();
      }, 0);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!container.contains(event.target)) close();
    });
    return { close, render };
  }

  window.ConcertSearchAutocomplete = { setup };
}());
