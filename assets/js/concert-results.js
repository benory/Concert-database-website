(function () {
  "use strict";
  const DB = window.ConcertDB;
  if (!DB) return;

  function composerNames(program, database) {
    return [program.composer_name, program.canonical_composer,
      ...(program.composer_credits || []).map((credit) => credit.name),
      ...(program.composer_ids || []).flatMap((id) => {
        const composer = database.composersById.get(id);
        return [composer?.name, ...(composer?.aliases || [])];
      })].filter(Boolean);
  }

  function composerMatches(program, filters, database) {
    if (filters.composer) return (program.composer_ids || []).includes(filters.composer);
    if (!filters.composerName) return true;
    const name = DB.normalize(filters.composerName);
    return composerNames(program, database).some((value) => DB.normalize(value) === name);
  }

  function personEntries(concert, database) {
    return ["introduction", "direction", "performers"].flatMap((group) => (
      (concert[group] || []).map((person) => ({
        ...person,
        role: person.role || ({ introduction: "Introduction", direction: "Direction", performers: "Performer" }[group]),
        group,
        aliases: database.peopleByReference.get(person.id)?.aliases || [],
      }))
    ));
  }

  function sourceMatches(program, filters) {
    return (!filters.source || (program.source_ids || []).includes(filters.source))
      && (!filters.sourceText || DB.normalize(program.source_id) === DB.normalize(filters.sourceText));
  }

  function authorityConcerts(database, filters) {
    return database.concerts.filter((concert) => (
      (!filters.person || personEntries(concert, database).some((person) => person.id === filters.person))
      && (!filters.composer && !filters.composerName || concert.programs.some((program) => composerMatches(program, filters, database)))
      && (!filters.source && !filters.sourceText || concert.programs.some((program) => sourceMatches(program, filters)))
      && (!filters.piece || concert.programs.some((program) => DB.pieceGroupKey(program) === filters.piece))
      && (!filters.city || DB.normalize(concert.city) === DB.normalize(filters.city))
      && (!filters.country || DB.normalize(concert.country) === DB.normalize(filters.country))
      && (!filters.place || ([concert.city, concert.country].filter(Boolean).join(", ") || "Place not recorded") === filters.place)
    ));
  }

  function sourceLabel(source) {
    return source?.sigla && source?.alias && DB.normalize(source.sigla) !== DB.normalize(source.alias)
      ? `${source.sigla} (${source.alias})` : source?.sigla || source?.alias || DB.displayIdentifier(source?.id);
  }

  function selectionLabel(filters, database) {
    if (filters.piece) {
      const program = database.programs.find((entry) => DB.pieceGroupKey(entry) === filters.piece);
      if (!program) return "Selected piece";
      const ids = [...new Set(program.composer_ids || [])].sort();
      const composer = ids.length ? ids.map((id) => database.composersById.get(id)?.name || DB.displayIdentifier(id)).join("; ")
        : program.composer_name || "Composer unknown";
      return `${composer}, ${program.work_name || program.standardized_work_name}`;
    }
    if (filters.composer) return database.composersById.get(filters.composer)?.name || DB.displayIdentifier(filters.composer);
    if (filters.composerName) return filters.composerName;
    if (filters.person) return database.peopleByReference.get(filters.person)?.name || DB.displayIdentifier(filters.person);
    if (filters.source) return sourceLabel(database.sourcesById.get(filters.source)) || DB.displayIdentifier(filters.source);
    return filters.city || filters.country || filters.sourceText || filters.place || filters.query || "";
  }

  function queryTerms(filters, database) {
    const query = DB.normalize(filters.query);
    const names = [selectionLabel({ ...filters, query: "" }, database)];
    if (!query || names.some((name) => name && DB.normalize(name) === query)) return [];
    if (filters.composer) {
      const composer = database.composersById.get(filters.composer);
      names.push(...(composer?.aliases || []));
      database.programs.filter((program) => composerMatches(program, filters, database)).forEach((program) => {
        names.push(...(program.composer_credits || []).filter((credit) => credit.id === filters.composer).map((credit) => credit.name));
        if (program.composer_ids?.length === 1) names.push(program.composer_name);
      });
    }
    if (filters.person) names.push(...(database.peopleByReference.get(filters.person)?.aliases || []));
    if (filters.source) {
      const source = database.sourcesById.get(filters.source);
      names.push(source?.sigla, source?.alias, source?.id);
    }
    return query && !names.some((name) => name && DB.normalize(name) === query) ? query.split(/\s+/) : [];
  }

  function chronologyConcerts(database, filters) {
    const terms = queryTerms(filters, database);
    return authorityConcerts(database, filters).filter((concert) => terms.every((term) => concert.searchText.includes(term)));
  }

  function searchQuery(filters, database) {
    // Older links repeat the selected name in q; the button now owns that name.
    return queryTerms(filters, database).length ? filters.query || "" : "";
  }

  function hits(concert, filters, database) {
    const terms = queryTerms(filters, database);
    const context = DB.normalize([concert.title, concert.date, concert.year, concert.ensemble,
      concert.location, concert.city, concert.country].filter(Boolean).join(" "));
    const textMatches = (text) => terms.some((term) => text.includes(term))
      && terms.every((term) => text.includes(term) || context.includes(term));
    const programs = concert.programs.filter((program) => {
      if (filters.piece) return DB.pieceGroupKey(program) === filters.piece;
      if (filters.composer || filters.composerName) return composerMatches(program, filters, database);
      if (filters.source || filters.sourceText) return sourceMatches(program, filters);
      if (filters.person || !terms.length) return false;
      const text = DB.normalize([program.work_name, program.standardized_work_name, program.source_id,
        ...composerNames(program, database), ...(program.source_ids || []).map((id) => sourceLabel(database.sourcesById.get(id)))].filter(Boolean).join(" "));
      return textMatches(text);
    });
    const people = personEntries(concert, database).filter((person) => (
      filters.person ? person.id === filters.person : !filters.composer && !filters.composerName && terms.length
        && textMatches(DB.normalize([person.name, person.role, ...person.aliases].join(" ")))
    ));
    return { programs, people };
  }

  window.ConcertResults = { composerMatches, authorityConcerts, chronologyConcerts, selectionLabel, searchQuery, hits };
}());
