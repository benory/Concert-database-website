(function () {
  "use strict";

  const DB = window.ConcertDB;
  const detail = document.getElementById("program-detail");
  if (!DB || !detail) return;

  const params = new URLSearchParams(window.location.search);
  const concertId = DB.programId(params.get("id") || decodeURIComponent(window.location.hash.replace(/^#/, "")));

  function fillField(name, value) {
    document.querySelectorAll(`[data-program-field="${name}"]`).forEach((node) => {
      node.textContent = value || "—";
      if (node.tagName === "TIME" && value) node.setAttribute("datetime", value);
    });
  }

  function splitReferences(value, authorityPattern) {
    const text = String(value || "").trim();
    if (!text) return [];
    return authorityPattern.test(text)
      ? text.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean)
      : [text];
  }

  function terminate(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  function editionLabel(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\d+$/.test(text)) {
      const number = Number(text);
      const lastTwo = number % 100;
      const suffix = lastTwo >= 11 && lastTwo <= 13
        ? "th"
        : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
      return `${number}${suffix} ed.`;
    }
    if (/^\d+(?:st|nd|rd|th)$/i.test(text)) return `${text} ed.`;
    return text;
  }

  function joinAuthorityNote(label, note) {
    if (!note) return label;
    return `${label}${/^[,.;:!?\])]/.test(note) ? "" : " "}${note}`;
  }

  function editionBibliography(edition) {
    const sentences = [];
    if (edition.author) sentences.push(terminate(edition.author));
    if (edition.article_title) sentences.push(`“${edition.article_title.replace(/[.]$/, "")}.”`);

    if (edition.article_title) {
      const publication = [];
      if (edition.container_title) {
        publication.push(edition.editor
          ? `In ${edition.container_title}`
          : [edition.container_title, edition.volume].filter(Boolean).join(" "));
      }
      if (edition.editor) publication.push(`edited by ${edition.editor}`);
      if (edition.volume && edition.editor) publication.push(`vol. ${edition.volume}`);
      if (edition.series) publication.push(edition.series);

      let articlePublication = publication.join(", ");
      let imprint = "";
      if (edition.location && edition.publisher) imprint = `${edition.location}: ${edition.publisher}`;
      else imprint = edition.location || edition.publisher || "";
      if (edition.publication_year) imprint = [imprint, edition.publication_year].filter(Boolean).join(", ");
      if (imprint) articlePublication = articlePublication ? `${articlePublication} (${imprint})` : imprint;
      if (edition.pages) articlePublication = [articlePublication, edition.pages].filter(Boolean).join(", ");
      if (articlePublication) sentences.push(terminate(articlePublication));
      return sentences.join(" ");
    }

    if (edition.container_title) sentences.push(terminate(edition.container_title));
    if (edition.editor) sentences.push(terminate(`Edited by ${edition.editor}`));
    const editionDetails = [edition.series, edition.volume ? `vol. ${edition.volume}` : "", editionLabel(edition.edition)].filter(Boolean);
    if (editionDetails.length) sentences.push(terminate(editionDetails.join(", ")));

    let imprint = "";
    if (edition.location && edition.publisher) imprint = `${edition.location}: ${edition.publisher}`;
    else imprint = edition.location || edition.publisher || "";
    if (edition.publication_year) imprint = [imprint, edition.publication_year].filter(Boolean).join(", ");
    if (imprint) sentences.push(terminate(imprint));
    if (edition.pages) sentences.push(terminate(edition.pages));
    return sentences.join(" ");
  }

  function sourceDescription(statement, database) {
    const match = statement.match(/\bSRC:[\p{L}\p{N}_.-]+/u);
    if (!match) return statement;
    const source = database.sourcesById.get(match[0]);
    if (!source) return DB.displayIdentifier(statement) || statement;
    const note = statement.replace(match[0], "").trim();
    let label;
    if (source.sigla && source.alias && DB.normalize(source.sigla) !== DB.normalize(source.alias)) {
      label = `${source.sigla} (${source.alias})`;
    } else {
      label = source.sigla || source.alias || DB.displayIdentifier(match[0]) || match[0];
    }
    return joinAuthorityNote(label, note);
  }

  function editionDescription(statement, database, specificPages) {
    const match = statement.match(/\b(?:EDN|BIB):[\p{L}\p{N}_.-]+/u);
    if (!match) return statement;
    const edition = database.editionsById.get(match[0]);
    const note = statement.replace(match[0], "").trim();
    const label = edition ? (match[0].startsWith("BIB:")
      ? window.ConcertBibliography.note(edition, specificPages)
      : editionBibliography(edition)) : (DB.displayIdentifier(match[0]) || match[0]);
    return joinAuthorityNote(label, note);
  }

  function descriptionsWithLocations(references, locations, describe, authorityPattern, separator = " — ", consumesLocation = () => false) {
    const referenceParts = splitReferences(references, authorityPattern);
    const locationParts = referenceParts.length > 1
      ? String(locations || "").split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean)
      : [String(locations || "").trim()].filter(Boolean);
    const descriptions = referenceParts.map((reference, index) => {
      const location = locationParts.length === referenceParts.length ? locationParts[index] : "";
      const consumed = location && consumesLocation(reference);
      return `${describe(reference, consumed ? location : undefined)}${location && !consumed ? `${separator}${location}` : ""}`;
    });
    if (descriptions.length && locations && locationParts.length !== referenceParts.length) {
      descriptions[descriptions.length - 1] += `${separator}${locations}`;
    }
    return descriptions;
  }

  function appendWithCitations(container, text, titles = []) {
    const candidates = [...new Set(titles.filter(Boolean))].sort((a, b) => b.length - a.length);
    let remainder = text;
    while (remainder) {
      const matches = candidates
        .map((title) => ({ title, index: remainder.indexOf(title) }))
        .filter(({ index }) => index >= 0)
        .sort((a, b) => a.index - b.index || b.title.length - a.title.length);
      const match = matches[0];
      if (!match) {
        container.append(document.createTextNode(remainder));
        return;
      }
      if (match.index) container.append(document.createTextNode(remainder.slice(0, match.index)));
      const citation = document.createElement("cite");
      citation.textContent = match.title;
      container.append(citation);
      remainder = remainder.slice(match.index + match.title.length);
    }
  }

  function editionTitles(references, database) {
    return String(references || "")
      .match(/\b(?:EDN|BIB):[\p{L}\p{N}_.-]+/gu)
      ?.map((identifier) => database.editionsById.get(identifier)?.container_title)
      .filter(Boolean) || [];
  }

  function sourceLinks(references, database) {
    return splitReferences(references, /\bSRC:/u).map((statement) => {
      const identifier = statement.match(/\bSRC:[\p{L}\p{N}_.-]+/u)?.[0];
      const source = identifier && database.sourcesById.get(identifier);
      return source ? DB.sourceConcertsUrl(source) : "";
    });
  }

  function appendReference(container, label, descriptions, options = {}) {
    const { scanUrl = "", citeTitles = [], links = [], linkLabels = [] } = options;
    if (!descriptions.length && !scanUrl) return;
    const line = document.createElement("span");
    line.className = "program-item-reference";
    const heading = document.createElement("strong");
    heading.textContent = label;
    line.append(heading);
    descriptions.forEach((description, index) => {
      line.append(document.createTextNode(index ? "; " : " "));
      if (links[index]) {
        const link = document.createElement("a");
        link.className = "program-item-source-link";
        link.href = links[index];
        const linkedText = linkLabels[index] || description;
        appendWithCitations(link, linkedText, citeTitles);
        line.append(link);
        if (linkLabels[index]) appendWithCitations(line, description.slice(linkedText.length), citeTitles);
      } else {
        appendWithCitations(line, description, citeTitles);
      }
    });
    if (scanUrl) {
      const scan = document.createElement("a");
      scan.className = "program-item-scan-link";
      scan.href = scanUrl;
      scan.target = "_blank";
      scan.rel = "noopener";
      scan.textContent = descriptions.length ? " View edition scan ↗" : "View edition scan ↗";
      line.append(scan);
    }
    container.append(line);
  }

  function displayProgramReferences(container, program, database) {
    if (!container) return;
    appendReference(
      container,
      "Source:",
      descriptionsWithLocations(program.source_id, program.folios, (identifier) => sourceDescription(identifier, database), /\bSRC:/u, ", "),
      {
        links: sourceLinks(program.source_id, database),
        linkLabels: splitReferences(program.source_id, /\bSRC:/u).map((reference) => sourceDescription(reference, database)),
      },
    );
    appendReference(
      container,
      "Edition:",
      descriptionsWithLocations(program.edition, program.edition_pages, (identifier, pages) => editionDescription(identifier, database, pages), /\b(?:EDN|BIB):/u,
        " — ", (identifier) => /\bBIB:/.test(identifier)),
      {
        scanUrl: program.work_edition_scan,
        citeTitles: editionTitles(program.edition, database),
      },
    );
    container.hidden = container.children.length === 0;
  }

  function displayComposerCredits(container, program, database) {
    if (!container) return;
    const credits = program.composer_credits || [];
    if (!credits.length) {
      container.textContent = "Composer unknown";
      return;
    }

    const fragment = document.createDocumentFragment();
    credits.forEach((credit) => {
      if (credit.separatorBefore) fragment.append(document.createTextNode(credit.separatorBefore));
      if (!credit.id) {
        fragment.append(document.createTextNode(credit.name));
        return;
      }
      const authority = database.composersById.get(credit.id);
      const canonicalName = authority?.name || credit.canonicalName || DB.displayIdentifier(credit.id);
      const link = document.createElement("a");
      link.href = DB.composerUrl({ id: credit.id, name: canonicalName });
      link.textContent = credit.name || canonicalName;
      link.dataset.personPreview = "";
      link.dataset.personId = credit.id;
      link.dataset.personName = canonicalName;
      link.dataset.personRole = "Composer";
      fragment.append(link);
    });
    container.replaceChildren(fragment);
  }

  function displayProgramItems(concert, database) {
    const body = document.getElementById("program-order");
    const template = document.getElementById("program-order-row-template");
    if (!body) return;
    const fragment = document.createDocumentFragment();

    concert.programs.forEach((program, index) => {
      let row;
      if (template && template.content) {
        const cloned = template.content.cloneNode(true);
        row = cloned.querySelector("tr");
      } else {
        row = document.createElement("tr");
        row.innerHTML = '<td class="item-number" data-item-number></td><td><a data-piece-link data-item-title></a><div class="program-item-references" data-item-references hidden></div></td><td><span data-composer-credit></span></td>';
      }

      row.querySelector("[data-item-number]").textContent = program.order || index + 1;
      const piece = row.querySelector("[data-piece-link]");
      piece.textContent = program.work_name || program.standardized_work_name || "Untitled work";
      piece.href = DB.pieceUrl(program);
      displayProgramReferences(row.querySelector("[data-item-references]"), program, database);

      displayComposerCredits(row.querySelector("[data-composer-credit]"), program, database);
      fragment.append(row);
    });

    if (!concert.programs.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td colspan="3" class="table-empty">The program order has not yet been entered.</td>';
      fragment.append(row);
    }
    body.replaceChildren(fragment);
  }

  function displayPeople(concert, database) {
    const container = document.getElementById("program-people");
    if (!container) return;
    const groups = [
      ["Introduction", concert.introduction || []],
      ["Direction", concert.direction || []],
      ["Performers", concert.performers || []],
    ].filter(([, people]) => people.length);

    if (!groups.length) {
      container.innerHTML = "<div><dt>People</dt><dd>Not yet recorded</dd></div>";
      return;
    }

    container.innerHTML = groups.map(([heading, people]) => `<div><dt>${DB.escapeHtml(heading)}</dt><dd>${people.map((person) => {
      const role = person.role || heading.replace(/s$/, "");
      const resolved = database.peopleByReference.get(person.id) || database.peopleByReference.get(DB.normalize(person.name)) || person;
      return `${DB.personLink(resolved, role)}${person.role ? ` <span class="person-role">${DB.escapeHtml(person.role)}</span>` : ""}`;
    }).join('<span class="people-separator" aria-hidden="true">; </span>')}</dd></div>`).join("");
  }

  function displayArchiveSources(concert) {
    const container = document.getElementById("program-source");
    if (!container) return;
    const references = concert.archive_references || [];
    if (!references.length) {
      container.textContent = "Source information not yet recorded.";
      return;
    }

    const fragment = document.createDocumentFragment();
    references.forEach((reference) => {
      const row = document.createElement("div");
      row.className = "archive-source-entry";
      let label = "";
      let citeTitles = [];
      if (reference.id.startsWith("ARC:")) {
        label = reference.authority?.name || DB.displayIdentifier(reference.id);
      } else if (reference.id.startsWith("BIB:")) {
        label = reference.authority ? window.ConcertBibliography.note(reference.authority, reference.signature) : DB.displayIdentifier(reference.id);
        citeTitles = [reference.authority?.container_title].filter(Boolean);
      }

      if (label) {
        const bibliography = reference.id.startsWith("BIB:");
        const name = document.createElement(bibliography ? "span" : "strong");
        name.className = bibliography ? "archive-source-bibliography" : "archive-source-name";
        appendWithCitations(name, label, citeTitles);
        row.append(name);
      }
      if (reference.signature && !(reference.id.startsWith("BIB:") && reference.authority)) {
        if (label) row.append(document.createTextNode(", "));
        const signature = document.createElement("span");
        signature.className = "archive-source-signature";
        signature.textContent = reference.signature;
        row.append(signature);
      }
      fragment.append(row);
    });
    container.replaceChildren(fragment);
  }

  function displayImageSource(concert, database) {
    const section = document.getElementById("program-image-source-section");
    const container = document.getElementById("program-image-source");
    if (!section || !container) return;

    const reference = String(concert.image_source || "").trim();
    if (String(concert.image_permissions || "").toLowerCase() !== "yes" || !reference) {
      container.textContent = "";
      section.hidden = true;
      return;
    }

    let label = reference;
    if (reference.startsWith("ARC:")) {
      const archive = database.archivesById.get(reference);
      label = String(archive?.short_name || "").trim() || archive?.name || DB.displayIdentifier(reference) || reference;
    } else if (/^(?:BIB|EDN):/.test(reference)) {
      const edition = database.editionsById.get(reference);
      label = edition ? (reference.startsWith("BIB:") ? window.ConcertBibliography.note(edition) : editionBibliography(edition))
        : (DB.displayIdentifier(reference) || reference);
    }

    const credit = String(label || "").trim().replace(/[.]+$/, "");
    const creditName = document.createElement(reference.startsWith("ARC:") ? "strong" : "span");
    appendWithCitations(creditName, credit, reference.startsWith("BIB:")
      ? [database.editionsById.get(reference)?.container_title].filter(Boolean) : []);
    container.replaceChildren(
      document.createTextNode(reference.startsWith("ARC:") ? "Image reproduced by permission of " : "Image reproduced from "),
      creditName,
      document.createTextNode("."),
    );
    section.hidden = false;
  }

  function displayScan(concert, database) {
    const panel = document.getElementById("program-scan");
    const stage = panel && panel.querySelector(".scan-stage");
    const image = document.getElementById("program-scan-image");
    const empty = document.getElementById("scan-empty");
    const label = document.getElementById("scan-page-label");
    const openPdf = panel?.querySelector("[data-open-pdf]");
    const zoomControls = panel?.querySelector(".scan-zoom-controls");
    if (!panel || !stage || !image || !empty) return;

    const source = concert.image_permissions === "yes"
      ? (concert.scan_url || concert.image_url || concert.externally_hosted_image)
      : null;
    if (!source) {
      empty.innerHTML = "<p>A program scan is not available for this record.</p>";
      return;
    }

    let scale = 1;
    let rotation = 0;
    let imageShell;
    let layoutFrame;
    let resizeObserver;
    let pan;
    let offsetX = 0;
    let offsetY = 0;
    let imageBounds;
    let pageImages = [];
    let pageList;
    let activePage = 1;
    let pageLabelFrame;

    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const paged = stage.classList.contains("is-multipage-viewer");
      if (paged) {
        // Touch scrolling remains native; mouse dragging pans the page stack.
        if (event.pointerType === "touch" || !event.target.classList.contains("scan-page-image")) return;
      } else if (image.hidden || event.target !== image) return;
      pan = {
        paged,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: paged ? stage.scrollLeft : offsetX,
        top: paged ? stage.scrollTop : offsetY,
      };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("is-panning");
      stage.focus({ preventScroll: true });
      event.preventDefault();
    });

    stage.addEventListener("pointermove", (event) => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      if (pan.paged) {
        stage.scrollLeft = pan.left - (event.clientX - pan.x);
        stage.scrollTop = pan.top - (event.clientY - pan.y);
        return;
      }
      offsetX = pan.left + (event.clientX - pan.x);
      offsetY = pan.top + (event.clientY - pan.y);
      positionImage();
    });

    function finishPan(event) {
      if (!pan || event.pointerId !== pan.pointerId) return;
      pan = null;
      stage.classList.remove("is-panning");
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    }

    stage.addEventListener("pointerup", finishPan);
    stage.addEventListener("pointercancel", finishPan);
    stage.addEventListener("lostpointercapture", finishPan);

    // Pan the image itself, not scrollbar overflow, so fit-size images move too.
    function positionImage() {
      if (!imageBounds || !imageShell) return;
      const { width, height, availableWidth, availableHeight, baseX, baseY, paddingX, paddingY } = imageBounds;
      const visibleWidth = Math.min(80, width, availableWidth);
      const visibleHeight = Math.min(80, height, availableHeight);
      // Keep a small part of the image reachable if it is dragged towards an edge.
      offsetX = Math.max(visibleWidth - width - baseX, Math.min(availableWidth - visibleWidth - baseX, offsetX));
      offsetY = Math.max(visibleHeight - height - baseY, Math.min(availableHeight - visibleHeight - baseY, offsetY));
      imageShell.style.left = `${paddingX + baseX + offsetX}px`;
      imageShell.style.top = `${paddingY + baseY + offsetY}px`;
    }

    stage.addEventListener("wheel", (event) => {
      if (!stage.classList.contains("is-image-viewer") || !imageBounds || event.ctrlKey) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? imageBounds.availableHeight : 1;
      offsetX -= event.deltaX * unit;
      offsetY -= event.deltaY * unit;
      positionImage();
      event.preventDefault();
    }, { passive: false });

    stage.addEventListener("keydown", (event) => {
      if (event.target !== stage || !stage.classList.contains("is-image-viewer") || !imageBounds) return;
      const movement = {
        ArrowLeft: [40, 0], ArrowRight: [-40, 0],
        ArrowUp: [0, 40], ArrowDown: [0, -40],
        PageUp: [0, imageBounds.availableHeight * 0.8],
        PageDown: [0, -imageBounds.availableHeight * 0.8],
      }[event.key];
      if (event.key === "Home") offsetX = offsetY = 0;
      else if (movement) { offsetX += movement[0]; offsetY += movement[1]; }
      else return;
      positionImage();
      event.preventDefault();
    });

    function stageContentWidth() {
      const style = window.getComputedStyle(stage);
      return stage.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    }

    function stageContentHeight() {
      const style = window.getComputedStyle(stage);
      return stage.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
    }

    function renderImageLayout() {
      layoutFrame = null;
      const availableWidth = stageContentWidth();
      const availableHeight = stageContentHeight();
      if (!imageShell || image.hidden || !image.naturalWidth || availableWidth <= 0 || availableHeight <= 0) return;
      const sideways = rotation === 90 || rotation === 270;
      const fitScale = Math.min(
        availableWidth / (sideways ? image.naturalHeight : image.naturalWidth),
        availableHeight / (sideways ? image.naturalWidth : image.naturalHeight)
      );
      const targetWidth = Math.max(1, image.naturalWidth * fitScale * scale);
      const targetHeight = Math.max(1, image.naturalHeight * fitScale * scale);
      const shellWidth = sideways ? targetHeight : targetWidth;
      const shellHeight = sideways ? targetWidth : targetHeight;
      image.style.width = `${targetWidth}px`;
      image.style.height = `${targetHeight}px`;
      image.style.transform = ({
        0: "none",
        90: `translateX(${targetHeight}px) rotate(90deg)`,
        180: `translate(${targetWidth}px, ${targetHeight}px) rotate(180deg)`,
        270: `translateY(${targetWidth}px) rotate(270deg)`,
      })[rotation];
      imageShell.style.width = `${shellWidth}px`;
      imageShell.style.height = `${shellHeight}px`;
      const style = window.getComputedStyle(stage);
      imageBounds = {
        width: shellWidth, height: shellHeight, availableWidth, availableHeight,
        baseX: Math.max(0, (availableWidth - shellWidth) / 2),
        baseY: Math.max(0, (availableHeight - shellHeight) / 2),
        paddingX: parseFloat(style.paddingLeft) || 0,
        paddingY: parseFloat(style.paddingTop) || 0,
      };
      positionImage();
    }

    function scheduleImageLayout() {
      window.cancelAnimationFrame(layoutFrame);
      layoutFrame = window.requestAnimationFrame(pageList ? renderPageLayouts : renderImageLayout);
    }

    function updatePageLabel() {
      pageLabelFrame = null;
      const stageTop = stage.getBoundingClientRect().top;
      const readingLine = stageTop + Math.min(120, stage.clientHeight / 3);
      const atEnd = stage.scrollHeight > stage.clientHeight + 2
        && stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
      const current = atEnd ? pageImages[pageImages.length - 1]
        : pageImages.find(({ shell }) => shell.getBoundingClientRect().bottom > readingLine)
          || pageImages[pageImages.length - 1];
      if (!current) return;
      activePage = current.page;
      if (label) label.textContent = `Page ${activePage} of ${pageImages.length}`;
    }

    function renderPageLayouts() {
      layoutFrame = null;
      const availableWidth = stageContentWidth();
      const availableHeight = stageContentHeight();
      if (!pageList || availableWidth <= 0 || availableHeight <= 0) return;
      const anchor = pageImages[activePage - 1];
      const previousHeight = anchor.shell.getBoundingClientRect().height;
      const fraction = previousHeight
        ? (stage.getBoundingClientRect().top - anchor.shell.getBoundingClientRect().top) / previousHeight : 0;
      const sideways = rotation === 90 || rotation === 270;
      let widest = availableWidth;
      pageImages.forEach(({ shell, node, pixelWidth, pixelHeight }) => {
        const fitScale = Math.min(
          availableWidth / (sideways ? pixelHeight : pixelWidth),
          availableHeight / (sideways ? pixelWidth : pixelHeight),
        );
        const width = pixelWidth * fitScale * scale;
        const height = pixelHeight * fitScale * scale;
        const shellWidth = sideways ? height : width;
        const shellHeight = sideways ? width : height;
        node.style.width = `${width}px`;
        node.style.height = `${height}px`;
        node.style.transform = ({
          0: "none",
          90: `translateX(${height}px) rotate(90deg)`,
          180: `translate(${width}px, ${height}px) rotate(180deg)`,
          270: `translateY(${width}px) rotate(270deg)`,
        })[rotation];
        shell.style.width = `${shellWidth}px`;
        shell.style.height = `${shellHeight}px`;
        widest = Math.max(widest, shellWidth);
      });
      pageList.style.width = `${widest}px`;
      if (previousHeight) {
        stage.scrollTop += anchor.shell.getBoundingClientRect().top - stage.getBoundingClientRect().top
          + fraction * anchor.shell.getBoundingClientRect().height;
      }
      updatePageLabel();
    }

    function showProgramPages(pages) {
      pageList = document.createElement("div");
      pageList.className = "scan-pages";
      pageImages = pages.map((page, index) => {
        const shell = document.createElement("figure");
        shell.className = "scan-page-shell";
        shell.dataset.scanPage = index + 1;
        shell.setAttribute("aria-label", `Page ${index + 1} of ${pages.length}`);
        const node = index === 0 ? image : document.createElement("img");
        node.className = "scan-page-image";
        node.hidden = false;
        node.alt = `Page ${index + 1} of the program for ${concert.title || concert.id}`;
        node.loading = index === 0 ? "eager" : "lazy";
        node.decoding = "async";
        node.draggable = false;
        node.addEventListener("error", () => {
          node.hidden = true;
          const message = document.createElement("p");
          message.className = "scan-page-error";
          message.textContent = `Page ${index + 1} could not be loaded. `;
          const link = document.createElement("a");
          link.textContent = "Open full PDF";
          link.href = source;
          link.target = "_blank";
          link.rel = "noopener";
          message.append(link);
          shell.append(message);
        }, { once: true });
        node.src = DB.path(page.url);
        shell.append(node);
        pageList.append(shell);
        return { shell, node, page: index + 1, pixelWidth: page.pixel_width, pixelHeight: page.pixel_height };
      });
      stage.classList.add("is-multipage-viewer");
      stage.setAttribute("aria-label", "Program pages; scroll to read further pages or drag an image to move");
      stage.replaceChildren(pageList);
      if (zoomControls) zoomControls.hidden = false;
      resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleImageLayout) : null;
      resizeObserver?.observe(stage);
      stage.addEventListener("scroll", () => {
        window.cancelAnimationFrame(pageLabelFrame);
        pageLabelFrame = window.requestAnimationFrame(updatePageLabel);
      }, { passive: true });
      scheduleImageLayout();
    }

    function configurePdfLink() {
      if (!openPdf) return;
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      openPdf.replaceChildren(document.createTextNode("Open full PDF "), arrow);
      openPdf.href = source;
      openPdf.hidden = false;
    }

    function showPdfFallback() {
      stage.classList.remove("is-image-viewer");
      imageBounds = null;
      if (zoomControls) zoomControls.hidden = true;
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(layoutFrame);
      const frame = document.createElement("iframe");
      frame.className = "program-scan-frame";
      frame.src = source;
      frame.title = `Program scan for ${concert.title || concert.id}`;
      frame.setAttribute("allowfullscreen", "");
      stage.replaceChildren(frame);
      panel.querySelectorAll('[data-scan-action]:not([data-scan-action="fullscreen"])')
        .forEach((button) => { button.hidden = true; });
      if (label) label.textContent = "Program scan";
    }

    function showResponsiveImage(imageSource, pageCount, pdfPreview) {
      imageShell = document.createElement("div");
      imageShell.className = "scan-image-shell";
      imageShell.hidden = true;
      imageShell.append(image);
      stage.replaceChildren(imageShell, empty);
      image.alt = pdfPreview
        ? `First-page preview of the program scan for ${concert.title || concert.id}`
        : `Program scan for ${concert.title || concert.id}`;
      image.decoding = "async";
      image.draggable = false;
      image.addEventListener("load", () => {
        stage.classList.add("is-image-viewer");
        image.hidden = false;
        imageShell.hidden = false;
        empty.hidden = true;
        if (zoomControls) zoomControls.hidden = false;
        if (label) label.textContent = pdfPreview
          ? `Page 1${pageCount ? ` of ${pageCount.toLocaleString()}` : ""}`
          : "Program scan";
        scheduleImageLayout();
      }, { once: true });
      image.addEventListener("error", () => {
        if (zoomControls) zoomControls.hidden = true;
        if (pdfPreview) {
          showPdfFallback();
          return;
        }
        imageShell.hidden = true;
        empty.hidden = false;
        empty.innerHTML = `<p>The scan cannot be displayed inline.</p><a class="button-link" href="${DB.escapeHtml(source)}" target="_blank" rel="noopener">Open the digitized source <span aria-hidden="true">↗</span></a>`;
      }, { once: true });
      resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleImageLayout) : null;
      resizeObserver?.observe(stage);
      image.src = imageSource;
    }

    if (/\.pdf(?:$|[?#])/i.test(source)) {
      const preview = database.programPreviewsById.get(concert.id);
      configurePdfLink(preview?.page_count);
      if (preview?.page_count > 1 && preview.pages?.length === preview.page_count) showProgramPages(preview.pages);
      else if (preview?.page_count > 1) showPdfFallback();
      else if (preview?.preview_url) showResponsiveImage(DB.path(preview.preview_url), preview.page_count, true);
      else showPdfFallback();
    } else {
      showResponsiveImage(source, null, false);
    }

    panel.querySelectorAll("[data-scan-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.scanAction;
      if (action === "zoom-in") scale = Math.min(3, scale + 0.2);
      if (action === "zoom-out") scale = Math.max(0.4, scale - 0.2);
      if (action === "rotate") rotation = (rotation + 90) % 360;
      if (action === "zoom-in" || action === "zoom-out" || action === "rotate") {
        offsetX = offsetY = 0;
        if (!pageList) {
          stage.scrollTop = 0;
          stage.scrollLeft = 0;
        }
      }
      panel.querySelector('[data-scan-action="zoom-in"]').disabled = scale >= 3 - 1e-6;
      panel.querySelector('[data-scan-action="zoom-out"]').disabled = scale <= 0.4 + 1e-6;
      if (action === "fullscreen" && panel.requestFullscreen) panel.requestFullscreen();
      scheduleImageLayout();
    }));
  }

  function setupRecordActions(concert) {
    // Reuse the displayed, authority-resolved sources (including bibliography
    // entries) so citations have the same archive names and paired signatures.
    const archivalSources = Array.from(document.querySelectorAll("#program-source .archive-source-entry"),
      (row, index) => ({ id: concert.archive_references[index]?.id || "", label: row.textContent.trim() }));
    window.ConcertRecordActions.setup(concert, { archivalSources });
    document.querySelectorAll("[data-record-view]").forEach((button) => button.addEventListener("click", () => {
      const view = button.dataset.recordView;
      detail.dataset.mobileView = view;
      document.querySelectorAll("[data-record-view]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
    }));
  }

  DB.loadData().then((database) => {
    const concert = database.concertsById.get(concertId);
    if (!concert) throw new Error(concertId ? `No concert record matches “${concertId}”.` : "This page needs a concert ID in its URL.");

    // Normalize old shared links without changing the underlying record IDs.
    const canonicalParams = new URLSearchParams(params);
    canonicalParams.set("id", DB.programSlug(concert.id));
    const canonicalUrl = `${window.location.pathname}?${canonicalParams}${params.has("id") ? window.location.hash : ""}`;
    history.replaceState(history.state, "", canonicalUrl);

    const place = DB.locationLabel(concert);
    fillField("title", concert.title || "Untitled concert");
    fillField("date", concert.date || concert.year);
    fillField("place", place);
    fillField("series", concert.ensemble);
    const hasSeries = Boolean(String(concert.ensemble || "").trim());
    const seriesRow = document.getElementById("program-series")?.closest("div");
    if (seriesRow) seriesRow.hidden = !hasSeries;
    document.querySelector(".event-strip")?.classList.toggle("is-location-only", !hasSeries);
    displayArchiveSources(concert);
    displayImageSource(concert, database);
    DB.setText("#program-id", concert.id);
    const headingDate = document.getElementById("program-heading-date");
    if (headingDate && DB.isoDate(concert)) headingDate.dateTime = DB.isoDate(concert);
    displayProgramItems(concert, database);
    displayPeople(concert, database);
    displayScan(concert, database);
    setupRecordActions(concert);
    DB.setupPersonPreviews(database);
    detail.setAttribute("aria-busy", "false");
    document.title = `${concert.title || concert.id} · Early Music Concerts`;
  }).catch((error) => DB.showError(detail, error, "This concert program could not be displayed."));
}());
