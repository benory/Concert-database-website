(function () {
  "use strict";
  const params = new URLSearchParams(window.location.search);
  const destination = new URL(window.ConcertDB.composerUrl({ id: params.get("id"), name: params.get("name") }), window.location.href);
  // Keep compatible bookmarked filters without introducing a second results page.
  ["q", "from", "to", "program"].forEach((key) => {
    if (params.has(key)) destination.searchParams.set(key, params.get(key));
  });
  window.location.replace(destination.href);
}());
