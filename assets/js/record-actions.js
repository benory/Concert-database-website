(function () {
  "use strict";

  // Brand glyphs: Font Awesome Free 6.7.2, Copyright 2024 Fonticons, Inc.
  // Unmodified icon paths, CC BY 4.0: https://fontawesome.com/license/free
  // Source: https://github.com/FortAwesome/Font-Awesome/tree/6.x/svgs/brands
  const SHARE_ICONS = {
    x: { viewBox: "0 0 512 512", path: "M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z" },
    facebook: { viewBox: "0 0 320 512", path: "M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z" },
    linkedin: { viewBox: "0 0 448 512", path: "M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" },
    whatsapp: { viewBox: "0 0 448 512", path: "M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" },
    email: { viewBox: "0 0 24 24", path: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 1 9 7 9-7", outline: true },
  };

  function permalink(concert, siteRoot) {
    const query = new URLSearchParams({ id: window.ConcertDB.programSlug(concert.id) });
    return new URL(`program/?${query}`, `${siteRoot.replace(/\/+$/, "")}/`).href;
  }

  function citationSource(concert, archivalSources = []) {
    const sources = archivalSources.map((source) => typeof source === "string"
      ? { id: "", label: source }
      : source).filter((source) => source?.label?.trim());
    const imageSource = String(concert.image_source || "").trim();
    const preferred = imageSource && sources.find((source) => source.id === imageSource);
    return (preferred || sources[0])?.label.trim() || "";
  }

  function citationParts(concert, format, link, accessed, archivalSources = []) {
    const note = format === "note";
    const title = concert.title || "Untitled concert";
    const date = concert.date || concert.year;
    const description = ["concert program", date, citationSource(concert, archivalSources).replace(/\.$/, "")].filter(Boolean).join(", ");
    const quotedTitle = `“${title.replace(/[.,;:]$/, "")}${note ? ",”" : /[!?]$/.test(title) ? "”" : ".”"}`;
    return [
      { text: `${quotedTitle} ${note ? description : description.charAt(0).toUpperCase() + description.slice(1)}${note ? ", " : ". "}` },
      { text: "Early Music Concerts" },
      { text: note ? `, ${concert.id}, ` : `. ${concert.id}. ` },
      { text: link, href: link },
      { text: ` (accessed ${accessed}).` },
    ];
  }

  function shareTargets(concert, link) {
    const text = [concert.title || "Untitled concert", concert.date || concert.year, window.ConcertDB.locationLabel(concert)].filter(Boolean).join(" · ");
    const query = (params) => new URLSearchParams(params).toString();
    return [
      { label: "X", icon: "x", href: `https://twitter.com/intent/tweet?${query({ text, url: link })}` },
      { label: "Facebook", icon: "facebook", href: `https://www.facebook.com/sharer/sharer.php?${query({ u: link })}` },
      { label: "LinkedIn", icon: "linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?${query({ url: link })}` },
      { label: "WhatsApp", icon: "whatsapp", href: `https://wa.me/?${query({ text: `${text}\n${link}` })}` },
      { label: "Email", icon: "email", href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n${link}`)}` },
    ];
  }

  function setup(concert, { archivalSources = [] } = {}) {
    const citeOpener = document.querySelector("[data-copy-citation]");
    const shareOpener = document.querySelector("[data-share-record]");
    const citeDialog = document.getElementById("citation-dialog");
    const shareDialog = document.getElementById("share-dialog");
    const citation = document.getElementById("citation-text");
    const format = document.getElementById("citation-format");
    const citationStatus = document.getElementById("citation-status");
    const shareStatus = document.getElementById("share-status");
    const input = document.getElementById("share-permalink");
    const link = permalink(concert, citeDialog.dataset.siteRoot);

    function bindDialog(dialog, opener, render) {
      opener.addEventListener("click", () => {
        render();
        dialog.showModal();
        document.getElementById("person-preview")?.setAttribute("hidden", "");
      });
      dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (event) => {
        const bounds = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
      });
      dialog.addEventListener("close", () => opener.focus({ preventScroll: true }));
    }

    function renderCitation() {
      const accessed = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
      citation.replaceChildren(...citationParts(concert, format.value, link, accessed, archivalSources).map((part) => {
        if (!part.italic && !part.href) return document.createTextNode(part.text);
        const node = document.createElement(part.href ? "a" : "i");
        node.textContent = part.text;
        if (part.href) node.href = part.href;
        return node;
      }));
      citationStatus.textContent = "";
    }

    async function copy(text, status, selectionTarget, success) {
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = `✓ ${success}`;
        status.classList.remove("is-error");
      } catch (error) {
        if (selectionTarget === input) {
          input.focus();
          input.select();
        } else {
          const range = document.createRange();
          range.selectNodeContents(selectionTarget);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        status.classList.add("is-error");
        status.textContent = "Could not copy automatically. The text is selected; use your browser’s Copy command.";
      }
    }

    format.addEventListener("change", renderCitation);
    bindDialog(citeDialog, citeOpener, renderCitation);
    document.getElementById("citation-copy").addEventListener("click", () => copy(citation.textContent, citationStatus, citation, "Citation copied."));

    input.value = link;
    const links = document.getElementById("share-links");
    links.replaceChildren(...shareTargets(concert, link).map((target) => {
      const anchor = document.createElement("a");
      anchor.className = "record-dialog-button record-share-logo";
      anchor.dataset.shareNetwork = target.icon;
      anchor.title = target.label === "Email" ? "Share by email" : `Share on ${target.label}`;
      anchor.setAttribute("aria-label", anchor.title);
      const icon = SHARE_ICONS[target.icon];
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", icon.viewBox);
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      if (icon.outline) svg.classList.add("is-outline");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", icon.path);
      svg.append(path);
      anchor.append(svg);
      anchor.href = target.href;
      if (!target.href.startsWith("mailto:")) {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.setAttribute("aria-label", `Share on ${target.label} (opens in a new tab)`);
      }
      return anchor;
    }));
    bindDialog(shareDialog, shareOpener, () => { shareStatus.textContent = ""; });
    input.addEventListener("click", () => input.select());
    document.getElementById("share-copy").addEventListener("click", () => copy(link, shareStatus, input, "Copied."));
  }

  window.ConcertRecordActions = { setup, permalink, citationSource, citationParts, shareTargets };
}());
