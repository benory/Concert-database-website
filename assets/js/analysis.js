(function () {
  "use strict";

  const DB = window.ConcertDB;
  const Analysis = window.ConcertAnalysisData;
  const page = document.getElementById("analysis-page");
  if (!DB || !Analysis || !page) return;

  const yearChart = document.getElementById("analysis-year-chart");
  const rankingChart = document.getElementById("analysis-ranking-chart");
  const placeTable = document.getElementById("analysis-place-table");
  const summary = document.getElementById("analysis-summary");
  const groupSelect = document.getElementById("analysis-group");
  const placeSelect = document.getElementById("analysis-place-filter");
  const rankingMore = document.getElementById("analysis-ranking-more");
  const placeMore = document.getElementById("analysis-place-more");
  const rankingVisibleCount = document.getElementById("analysis-ranking-visible-count");
  const startInput = document.getElementById("analysis-start");
  const endInput = document.getElementById("analysis-end");
  const rangeOutput = document.getElementById("analysis-date-output");
  const rangeTrack = document.getElementById("analysis-date-track");
  const dateReset = document.getElementById("analysis-date-reset");
  const placeVisibleCount = document.getElementById("analysis-place-visible-count");
  const INITIAL_RANKING_LIMIT = 20;
  const INITIAL_PLACE_LIMIT = 15;
  let database;
  const expandedRankings = new Set();
  let showAllPlaces = false;

  function chronologyLabel(state) {
    const first = state.start === Analysis.EARLY_YEAR ? "≤1915" : state.start;
    return state.end === Analysis.EARLY_YEAR ? "1915 and earlier" : `${first}–${state.end}`;
  }

  function initialState() {
    const params = new URLSearchParams(window.location.search);
    return {
      metric: params.get("metric") === "performances" ? "performances" : "programs",
      group: params.get("group") === "decade" ? "decade" : "year",
      place: params.get("place") || "",
      ranking: Object.hasOwn(Analysis.types, params.get("ranking")) ? params.get("ranking") : "composers",
      ...Analysis.range(database, params.get("start"), params.get("end")),
    };
  }

  function currentState() {
    return {
      metric: document.querySelector("[data-analysis-metric][aria-pressed=true]")?.dataset.analysisMetric || "programs",
      group: groupSelect?.value || "year",
      place: placeSelect?.value || "",
      ranking: document.querySelector("[data-analysis-ranking][aria-pressed=true]")?.dataset.analysisRanking || "composers",
      ...Analysis.range(database, startInput.value, endInput.value),
    };
  }

  function persist(state) {
    const params = new URLSearchParams();
    if (state.metric !== "programs") params.set("metric", state.metric);
    if (state.group !== "year") params.set("group", state.group);
    if (state.place) params.set("place", state.place);
    if (state.ranking !== "composers") params.set("ranking", state.ranking);
    const { min, max } = Analysis.bounds(database);
    if (state.start !== min) params.set("start", state.start);
    if (state.end !== max) params.set("end", state.end);
    history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }

  function inProjectRange(concert) {
    return !concert.year || (concert.year >= database.minYear && concert.year <= database.maxYear);
  }

  function selectedConcerts(state) {
    return Analysis.selectedConcerts(database, state);
  }

  function groupedActivity(concerts, state) {
    return Analysis.activity(database, concerts, state);
  }

  function renderYearChart(concerts, state) {
    if (!yearChart) return;
    const points = groupedActivity(concerts, state);
    if (!points.length) {
      yearChart.innerHTML = '<p class="chart-empty">No dated records match this selection.</p>';
      return;
    }

    const width = Math.max(320, yearChart.clientWidth || 820);
    const height = 230;
    const margin = { top: 16, right: 12, bottom: 40, left: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maximum = Math.max(1, ...points.map(([, value]) => value));
    const slot = plotWidth / points.length;
    const barWidth = Math.max(2, Math.min(22, slot * 0.7));
    const labelEvery = state.group === "decade" ? 1 : Math.max(1, Math.ceil(points.length / Math.max(2, Math.min(10, Math.floor(plotWidth / 55)))));
    const bars = points.map(([key, value], index) => {
      const barHeight = (value / maximum) * plotHeight;
      const x = margin.left + index * slot + (slot - barWidth) / 2;
      const y = margin.top + plotHeight - barHeight;
      const early = key === Analysis.EARLY_YEAR;
      const label = early ? "1915 and earlier" : state.group === "decade" ? (key === 1916 ? "1916–1919" : `${key}s`) : key;
      const lastYear = early ? Analysis.EARLY_YEAR : state.group === "decade" ? (key === 1916 ? 1919 : key + 9) : key;
      const outside = key > state.end || lastYear < state.start;
      const labelX = (x + barWidth / 2).toFixed(2);
      const tick = early ? `<tspan x="${labelX}">1915</tspan><tspan x="${labelX}" dy="11">and earlier</tspan>` : DB.escapeHtml(label);
      return `<g><rect class="chart-bar-mark${outside ? " is-outside-range" : ""}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"><title>${DB.escapeHtml(label)}: ${value}</title></rect>${index % labelEvery === 0 || index === points.length - 1 ? `<text class="chart-axis-label" x="${labelX}" y="${height - 15}" text-anchor="middle">${tick}</text>` : ""}</g>`;
    }).join("");
    const guideValues = [0, Math.ceil(maximum / 2), maximum];
    const guides = guideValues.map((value) => {
      const y = margin.top + plotHeight - (value / maximum) * plotHeight;
      return `<g><line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}"></line><text class="chart-axis-label" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${value}</text></g>`;
    }).join("");
    const metricLabel = state.metric === "performances" ? "performed items" : "concert programs";
    yearChart.setAttribute("aria-label", `${metricLabel} over time, starting with one combined 1915-and-earlier bin. Selected chronology: ${chronologyLabel(state)}. Years outside the selection are dimmed. Highest count: ${maximum}.`);
    yearChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${guides}${bars}</svg>`;
  }

  function updateExpansionControl(button, status, shown, total, label, initialLimit, expanded) {
    if (status) {
      status.textContent = total
        ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} ${label}.`
        : `No ${label} to show.`;
    }
    if (!button) return;
    button.hidden = total <= initialLimit;
    button.setAttribute("aria-expanded", String(expanded && total > initialLimit));
    button.textContent = expanded
      ? `Show top ${initialLimit.toLocaleString()}`
      : `Show all ${total.toLocaleString()} ${label}`;
  }

  function resultUrl(url, state) {
    const parsed = new URL(url, window.location.href);
    const { min, max } = Analysis.bounds(database);
    if (state.start !== min) parsed.searchParams.set("from", state.start);
    if (state.end !== max) parsed.searchParams.set("to", state.end);
    return `${parsed.pathname}${parsed.search}`;
  }

  function rankLabel(row, state) {
    const escape = DB.escapeHtml;
    const link = (url, label) => `<a href="${escape(resultUrl(url, state))}">${label}</a>`;
    let label = escape(row.name);
    let detail = row.detail || "";
    if (state.ranking === "composers") {
      label = DB.personLink(row, "Composer").replace(/href="[^"]*"/, `href="${escape(resultUrl(DB.composerUrl(row), state))}"`);
    } else if (state.ranking === "pieces") {
      label = `<a href="${escape(DB.pieceUrl(row.program))}">${escape(row.composer)}, <i>${escape(row.title)}</i></a>`;
      detail = row.items !== row.count ? `${row.items.toLocaleString()} program entries` : "";
    } else if (state.ranking === "sources") {
      const url = row.id ? DB.sourceConcertsUrl(row.source || { id: row.id, sigla: row.name })
        : DB.url("/concerts/", { source_text: row.sourceText });
      label = link(url, label);
    } else if (state.ranking === "editions") {
      if (row.edition) label = `<span title="${escape(window.ConcertBibliography.note(row.edition))}">${label}</span>`;
    } else if (state.ranking === "performers") {
      const person = database.people.get(row.id || DB.normalize(row.name));
      label = DB.personLink({ ...person, ...row.person, id: row.id, name: row.name }, [...row.roles].join("; "));
      label = label.replace(/href="[^"]*"/, `href="${escape(resultUrl(DB.personConcertsUrl(row), state))}"`);
      detail = [...row.roles].join(" · ");
    }
    return `${label}${detail ? `<small class="rank-detail">${escape(detail)}</small>` : ""}`;
  }

  function renderRanking(concerts, state) {
    if (!rankingChart) return;
    const type = Analysis.types[state.ranking];
    const allRanked = Analysis.ranking(database, concerts, state.ranking);
    const expanded = expandedRankings.has(state.ranking);
    const ranked = expanded ? allRanked : allRanked.slice(0, INITIAL_RANKING_LIMIT);
    const maximum = ranked[0]?.count || 1;
    DB.setText("#analysis-ranking-title", type.title);
    DB.setText("#analysis-ranking-unit", type.unit === "concerts" ? "Concerts" : "Performed items");
    DB.setText("#analysis-ranking-note", type.note);
    rankingChart.setAttribute("role", ranked.length ? "list" : "status");
    rankingChart.setAttribute("aria-label", `${ranked.length} of ${allRanked.length} ${type.label} ranked by ${type.unit}.`);
    rankingChart.innerHTML = ranked.length ? ranked.map((row, index) => `<div class="ranked-bar" role="listitem"><span class="rank-number">${index + 1}</span><span class="rank-label">${rankLabel(row, state)}</span><span class="rank-track" aria-hidden="true"><span style="width:${(row.count / maximum * 100).toFixed(2)}%"></span></span><strong title="${row.count} ${type.unit}">${row.count.toLocaleString()}</strong></div>`).join("") : `<p class="chart-empty">No ${type.label} recorded for this selection.</p>`;
    updateExpansionControl(
      rankingMore,
      rankingVisibleCount,
      ranked.length,
      allRanked.length,
      type.label,
      INITIAL_RANKING_LIMIT,
      expanded,
    );
  }

  function placeKey(concert) {
    return Analysis.placeKey(concert);
  }

  function placeTotals(concerts) {
    const totals = new Map();
    concerts.forEach((concert) => {
      const key = placeKey(concert);
      if (!totals.has(key)) totals.set(key, { place: key, programs: 0, performances: 0 });
      const total = totals.get(key);
      total.programs += 1;
      total.performances += concert.programs.length;
    });
    return [...totals.values()].sort((a, b) => b.programs - a.programs || b.performances - a.performances || a.place.localeCompare(b.place));
  }

  function renderPlaceTable(concerts) {
    if (!placeTable) return;
    const allTotals = placeTotals(concerts);
    const totals = showAllPlaces ? allTotals : allTotals.slice(0, INITIAL_PLACE_LIMIT);
    placeTable.innerHTML = totals.length ? totals.map((row) => `<tr><th scope="row">${DB.escapeHtml(row.place)}</th><td>${row.programs.toLocaleString()}</td><td>${row.performances.toLocaleString()}</td></tr>`).join("") : '<tr><td colspan="3" class="table-empty">No places match this selection.</td></tr>';
    updateExpansionControl(
      placeMore,
      placeVisibleCount,
      totals.length,
      allTotals.length,
      "places",
      INITIAL_PLACE_LIMIT,
      showAllPlaces,
    );
  }

  function render() {
    const state = currentState();
    persist(state);
    const activityTitle = `${state.metric === "performances" ? "Performed items" : "Programs"} by ${state.group === "decade" ? "Decade" : "Year"}`;
    DB.setText("#analysis-activity-title", activityTitle);
    const concerts = selectedConcerts(state);
    const itemCount = concerts.reduce((total, concert) => total + concert.programs.length, 0);
    if (summary) summary.innerHTML = `<strong>${concerts.length.toLocaleString()} concert programs · ${itemCount.toLocaleString()} performed items</strong>${state.place ? `<span>${DB.escapeHtml(state.place)}</span>` : ""}`;
    rangeOutput.textContent = chronologyLabel(state);
    const { min, max } = Analysis.bounds(database);
    const span = Math.max(1, max - min);
    rangeTrack.style.setProperty("--range-start", `${(state.start - min) / span * 100}%`);
    rangeTrack.style.setProperty("--range-end", `${(state.end - min) / span * 100}%`);
    startInput.setAttribute("aria-valuetext", state.start === min ? "1915 and earlier" : `${state.start}`);
    endInput.setAttribute("aria-valuetext", state.end === min ? "1915 and earlier" : `${state.end}`);
    startInput.style.zIndex = state.start === max ? "3" : "2";
    dateReset.hidden = state.start === min && state.end === max;
    // Keep the overview stationary while the slider filters all downstream totals.
    renderYearChart(Analysis.selectedConcerts(database, state, true), state);
    renderRanking(concerts, state);
    renderPlaceTable(concerts);
    page.setAttribute("aria-busy", "false");
  }

  DB.loadData().then((loaded) => {
    database = loaded;
    const state = initialState();
    const { min, max } = Analysis.bounds(database);
    [startInput, endInput].forEach((input) => {
      input.min = min;
      input.max = max;
      input.addEventListener("input", () => {
        if (Number(startInput.value) > Number(endInput.value)) {
          if (input === startInput) startInput.value = endInput.value;
          else endInput.value = startInput.value;
        }
        render();
      });
    });
    startInput.value = state.start;
    endInput.value = state.end;
    DB.setText("#analysis-first-year", "1915 and earlier");
    DB.setText("#analysis-last-year", max);
    dateReset.addEventListener("click", () => {
      startInput.value = min;
      endInput.value = max;
      render();
    });
    document.querySelectorAll("[data-analysis-ranking]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.analysisRanking === state.ranking));
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-analysis-ranking]").forEach((candidate) => {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        });
        render();
      });
    });
    document.querySelectorAll("[data-analysis-metric]").forEach((button) => {
      const active = button.dataset.analysisMetric === state.metric;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-analysis-metric]").forEach((candidate) => {
          const selected = candidate === button;
          candidate.setAttribute("aria-pressed", String(selected));
          candidate.classList.toggle("is-active", selected);
        });
        render();
      });
    });
    if (groupSelect) {
      groupSelect.value = state.group;
      groupSelect.addEventListener("change", render);
    }
    if (placeSelect) {
      const places = [...new Set(database.concerts.filter(inProjectRange).map(placeKey))].filter((place) => place !== "Place not recorded").sort();
      places.forEach((place) => placeSelect.add(new Option(place, place)));
      placeSelect.value = places.includes(state.place) ? state.place : "";
      placeSelect.addEventListener("change", render);
    }
    rankingMore?.addEventListener("click", () => {
      const type = currentState().ranking;
      if (expandedRankings.has(type)) expandedRankings.delete(type);
      else expandedRankings.add(type);
      render();
    });
    placeMore?.addEventListener("click", () => {
      showAllPlaces = !showAllPlaces;
      render();
    });
    render();
    window.addEventListener?.("resize", () => {
      const current = currentState();
      renderYearChart(Analysis.selectedConcerts(database, current, true), current);
    });
    DB.setupPersonPreviews(database);
  }).catch((error) => DB.showError(page, error, "The data analysis could not be prepared."));
}());
