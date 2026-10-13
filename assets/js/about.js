(function () {
  "use strict";

  const DB = window.ConcertDB;
  const list = document.getElementById("archive-acknowledgments");
  const status = document.getElementById("archive-acknowledgments-status");
  if (!DB || !list || !status) return;

  function archiveReferences(concert) {
    const values = [
      ...(Array.isArray(concert.archive_ids) ? concert.archive_ids : []),
      concert.image_source,
    ];
    return values.flatMap((value) => String(value || "").match(/\bARC:[\p{L}\p{N}_.-]+/gu) || []);
  }

  async function fetchJson(relativePath) {
    const response = await fetch(DB.path(relativePath), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Could not load ${relativePath} (${response.status})`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error(`${relativePath} is not a JSON array`);
    return value;
  }

  Promise.all([
    fetchJson("/assets/data/concerts.json"),
    fetchJson("/assets/data/archives.json"),
  ]).then(([concerts, archives]) => {
    const referenced = new Set(concerts.flatMap(archiveReferences));
    const contributing = archives
      .filter((archive) => referenced.has(archive.id))
      .sort((first, second) => String(first.name || "").localeCompare(String(second.name || "")));

    const fragment = document.createDocumentFragment();
    contributing.forEach((archive) => {
      const item = document.createElement("li");
      const name = archive.name || DB.displayIdentifier(archive.id);
      if (archive.url) {
        const link = document.createElement("a");
        link.href = archive.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = name;
        item.append(link);
      } else {
        item.textContent = name;
      }
      fragment.append(item);
    });

    if (!contributing.length) return;
    list.replaceChildren(fragment);
    list.hidden = false;
    status.hidden = true;
  }).catch((error) => {
    console.warn("Archive acknowledgments could not be loaded.", error);
  });
}());
