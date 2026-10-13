(function () {
  "use strict";

  // Full Chicago notes, not bibliography entries. Preserve supplied names and
  // publishing evidence; concert/item page references override general ranges.
  // https://www.chicagomanualofstyle.org/tools_citationguide/citation-guide-1.html
  function note(edition, specificPages) {
    const clean = (value) => String(value || "").trim();
    const author = clean(edition.author);
    const editor = clean(edition.editor);
    const title = clean(edition.container_title).replace(/\.$/, "");
    const article = clean(edition.article_title).replace(/\.$/, "");
    const pages = clean(specificPages || edition.pages).replace(/^pp?\.\s*/i, "").replace(/\.$/, "");
    const editors = /\s(?:and|und|&)\s|;/.test(editor) ? "eds." : "ed.";
    const imprint = [
      [clean(edition.location), clean(edition.publisher)].filter(Boolean).join(": ").replace(/^\((.*)\)$/, "$1"),
      clean(edition.publication_year),
    ].filter(Boolean).join(", ");
    const editionNumber = clean(edition.edition);
    const ordinal = (number) => {
      const lastTwo = number % 100;
      return `${number}${lastTwo >= 11 && lastTwo <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th")}`;
    };
    const editionLabel = /^\d+$/.test(editionNumber) ? `${ordinal(Number(editionNumber))} ed.`
      : /^\d+(?:st|nd|rd|th)$/i.test(editionNumber) ? `${editionNumber} ed.` : editionNumber;
    const journal = article && title && !editor && !edition.publisher && !edition.location;
    let citation;

    if (article) {
      const quoted = `“${article}${title && !/[?!]$/.test(article) ? "," : ""}”`;
      const heading = [author, quoted].filter(Boolean).join(", ");
      const container = [editor ? `in ${title}` : title, journal ? clean(edition.volume) : ""].filter(Boolean).join(" ");
      citation = `${heading}${container ? ` ${container}` : ""}`;
      if (editor) citation += `, ed. ${editor}`;
      if (!journal && edition.volume) citation += `, vol. ${clean(edition.volume)}`;
      if (edition.series) citation += `, ${clean(edition.series)}`;
      const publication = journal ? clean(edition.publication_year) : imprint;
      if (publication) citation += ` (${publication})`;
      if (pages) citation += `${journal ? ": " : ", "}${pages}`;
    } else {
      const credit = author || (editor ? `${editor}, ${editors}` : "");
      const details = [credit, title, author && editor ? `ed. ${editor}` : "", editionLabel,
        edition.volume ? `vol. ${clean(edition.volume)}` : "", clean(edition.series)].filter(Boolean);
      citation = details.join(", ");
      if (imprint) citation += `${citation ? " " : ""}(${imprint})`;
      if (pages) citation += `${citation ? ", " : ""}${pages}`;
    }
    // An article without publication data still needs a clean final stop.
    citation = citation.replace(/,”$/, ".”");
    citation = citation.replace(/([^.!?])”$/, "$1.”");
    return !citation || /[.!?][”"]?$/.test(citation) ? citation : `${citation}.`;
  }

  window.ConcertBibliography = { note };
}());
