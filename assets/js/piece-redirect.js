(function () {
  "use strict";

  const DB = window.ConcertDB;
  const params = new URLSearchParams(window.location.search);

  function redirect(piece) {
    const destination = new URL(DB.url("/concerts/", { piece }), window.location.href);
    ["q", "from", "to", "place", "program"].forEach((key) => {
      if (params.has(key)) destination.searchParams.set(key, params.get(key));
    });
    window.location.replace(destination.href);
  }

  if (params.has("piece")) return redirect(params.get("piece"));
  const key = params.get("key");
  const title = params.get("title");
  const composer = params.get("composer") || "";
  if (!key && !title) return redirect("");

  return DB.loadData().then((database) => {
    const program = database.programs.find((entry) => {
      if (key) return entry.work_key === key;
      const titleMatches = [entry.work_name, entry.standardized_work_name]
        .some((value) => DB.normalize(value) === DB.normalize(title));
      const composerMatches = !composer || (entry.composer_ids || []).includes(composer)
        || [entry.composer_name, ...(entry.canonical_composers || [])]
          .some((value) => DB.normalize(value) === DB.normalize(composer));
      return titleMatches && composerMatches;
    });
    // An unknown saved grouping must show no matches, rather than all concerts.
    redirect(program ? DB.pieceGroupKey(program) : JSON.stringify([title || key, composer]));
  }).catch((error) => DB.showError(document.querySelector(".loading-row"), error, "The matching concerts could not be opened."));
}());
