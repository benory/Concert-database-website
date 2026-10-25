(function () {
  "use strict";

  const DB = window.ConcertDB;
  const EARLY_YEAR = 1915;
  const types = {
    composers: { label: "composers", title: "Most frequently programmed composers", unit: "performed items", note: "Each catalogued program entry counts once for each attributed composer." },
    pieces: { label: "pieces", title: "Most frequently programmed pieces", unit: "concerts", note: "Grouped provisionally by composer and transcribed title—not confirmed work identity. Two Ave Marias attributed to Josquin may be different compositions; source and edition details can help distinguish them." },
    sources: { label: "sources", title: "Most frequently cited musical sources", unit: "concerts", note: "Musical sources cited in program entries, not the archives holding the concert programs. Each source counts once per concert." },
    editions: { label: "editions", title: "Most frequently used editions", unit: "concerts", note: "Editions explicitly cited in program entries. Each edition counts once per concert, even when used for several pieces." },
    performers: { label: "performers", title: "Most frequent performers and directors", unit: "concerts", note: "Named performers and directors, counted once per concert across roles. Introductions alone and ensemble names are not included." },
  };

  function bounds(database) {
    return { min: EARLY_YEAR, max: Math.max(EARLY_YEAR, database.maxYear) };
  }

  function range(database, start, end) {
    const { min, max } = bounds(database);
    const year = (value, fallback) => value !== "" && value != null && Number.isFinite(Number(value))
      ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
    const a = year(start, min);
    const b = year(end, max);
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }

  function placeKey(concert) {
    return [concert.city, concert.country].filter(Boolean).join(", ") || "Place not recorded";
  }

  function selectedConcerts(database, state, ignoreDates = false) {
    const dates = range(database, state.start, state.end);
    const { min, max } = bounds(database);
    const fullRange = dates.start === min && dates.end === max;
    return database.concerts.filter((concert) => {
      if (state.place && placeKey(concert) !== state.place) return false;
      const dated = Number.isFinite(concert.year) && concert.year > 0;
      if (ignoreDates) return true;
      return dated ? (dates.start === min || concert.year >= dates.start) && concert.year <= dates.end : fullRange;
    });
  }

  function activity(database, concerts, state) {
    const counts = new Map();
    const bucket = (year) => {
      if (year <= EARLY_YEAR) return EARLY_YEAR;
      if (state.group !== "decade") return year;
      return year < 1920 ? 1916 : Math.floor(year / 10) * 10;
    };
    const { min, max } = bounds(database);
    for (let year = min; year <= max; year += 1) counts.set(bucket(year), 0);
    concerts.forEach((concert) => {
      if (!Number.isFinite(concert.year) || concert.year <= 0) return;
      const key = bucket(concert.year);
      const value = state.metric === "performances" ? concert.programs.length : 1;
      counts.set(key, (counts.get(key) || 0) + value);
    });
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }

  function ranking(database, concerts, type) {
    const rows = new Map();
    function add(key, fields, concert, role) {
      if (!key) return;
      if (!rows.has(key)) rows.set(key, { ...fields, key, items: 0, concertIds: new Set(), roles: new Set() });
      const row = rows.get(key);
      row.items += 1;
      row.concertIds.add(concert.id);
      if (role) row.roles.add(role);
    }
    concerts.forEach((concert) => {
      if (type === "performers") {
        ["direction", "performers"].forEach((group) => (concert[group] || []).forEach((entry) => {
          const authority = database.peopleById.get(entry.id);
          const name = authority?.name || entry.name || DB.displayIdentifier(entry.id);
          add(entry.id || DB.normalize(name), { id: entry.id || "", name, person: authority }, concert,
            entry.role || (group === "direction" ? "Director" : "Performer"));
        }));
        return;
      }
      concert.programs.forEach((program) => {
        if (type === "composers") {
          const ids = [...new Set(program.composer_ids || [])];
          const credits = ids.length ? ids.map((id) => ({ id, name: database.composersById.get(id)?.name || DB.displayIdentifier(id) }))
            : [{ id: "", name: program.composer_name || "Composer unknown" }];
          credits.forEach((credit) => add(credit.id || DB.normalize(credit.name), credit, concert));
        } else if (type === "pieces") {
          const title = program.work_name || program.standardized_work_name;
          if (!title) return;
          const ids = [...new Set(program.composer_ids || [])].sort();
          const composer = ids.length ? ids.map((id) => database.composersById.get(id)?.name || DB.displayIdentifier(id)).join("; ")
            : program.composer_name || "Composer unknown";
          // This is a title grouping, never a claim that the rows identify one composition.
          const key = DB.pieceGroupKey(program);
          add(key, { name: `${composer}, ${title}`, title, composer, program }, concert);
        } else if (type === "sources") {
          const ids = [...new Set(program.source_ids || [])];
          if (!ids.length && program.source_id?.trim()) {
            add(`text:${DB.normalize(program.source_id)}`, { name: program.source_id.trim(), sourceText: program.source_id.trim(), detail: "Unmatched source wording" }, concert);
          }
          ids.forEach((id) => {
            const source = database.sourcesById.get(id);
            const name = source?.sigla && source?.alias && DB.normalize(source.sigla) !== DB.normalize(source.alias)
              ? `${source.sigla} (${source.alias})` : source?.sigla || source?.alias || DB.displayIdentifier(id);
            add(id, { id, name, source }, concert);
          });
        } else if (type === "editions") {
          const statement = String(program.edition || "").trim();
          const ids = [...new Set(statement.match(/\b(?:EDN|BIB):[\p{L}\p{N}_.-]+/gu) || [])];
          if (!ids.length && statement) add(`text:${DB.normalize(statement)}`, { name: statement, detail: "Unmatched edition wording" }, concert);
          ids.forEach((id) => {
            const edition = database.editionsById.get(id);
            const name = [edition?.article_title, edition?.container_title].filter(Boolean).join(" — ") || DB.displayIdentifier(id);
            const detail = [edition?.author || (edition?.editor ? `Ed. ${edition.editor}` : ""), edition?.publication_year].filter(Boolean).join(", ");
            add(id, { id, name, detail, edition }, concert);
          });
        }
      });
    });
    return [...rows.values()].map((row) => ({ ...row, count: type === "composers" ? row.items : row.concertIds.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  }

  window.ConcertAnalysisData = { EARLY_YEAR, types, bounds, range, placeKey, selectedConcerts, activity, ranking };
}());
