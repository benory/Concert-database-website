(function () {
  "use strict";

  const DB = window.ConcertDB;
  const TIMELINE_MIN = 1915;
  const TIMELINE_MAX = 1960;
  const EUROPE_COUNTRIES = new Set([
    "austria",
    "belgium",
    "czech republic",
    "denmark",
    "france",
    "germany",
    "netherlands",
    "poland",
    "spain",
    "switzerland",
    "united kingdom",
  ]);
  const US_COUNTRIES = new Set(["united states", "united states of america", "usa"]);
  const REGION_DEFINITIONS = {
    europe: {
      label: "Europe",
      contextBounds: [[39.5, -5.5], [56.5, 20]],
      viewBounds: [[46.0, 2.0], [55.0, 16.5]],
    },
    us: {
      label: "United States",
      viewBounds: [[32.5, -125.25], [45.5, -65.9]],
    },
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function hasCoordinates(concert) {
    return Number.isFinite(concert.latitude) && Number.isFinite(concert.longitude);
  }

  function regionFor(concert) {
    const country = DB.normalize(concert.country);
    if (US_COUNTRIES.has(country)) return "us";
    if (EUROPE_COUNTRIES.has(country)) return "europe";
    if (!country && hasCoordinates(concert)) {
      const [southWest, northEast] = REGION_DEFINITIONS.europe.contextBounds;
      if (
        concert.latitude >= southWest[0]
        && concert.latitude <= northEast[0]
        && concert.longitude >= southWest[1]
        && concert.longitude <= northEast[1]
      ) return "europe";
    }
    return "other";
  }

  function regionalCounts(concerts) {
    return (concerts || []).reduce((counts, concert) => {
      const region = regionFor(concert);
      counts[region] += 1;
      return counts;
    }, { europe: 0, us: 0, other: 0 });
  }

  function concertMarker(point) {
    return window.L.circleMarker(point, {
      radius: 5,
      fillColor: "#076bbd",
      color: "#064f8d",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.82,
    });
  }

  function concertClusterIcon(cluster) {
    return window.L.divIcon({
      html: `<span class="concert-cluster-core">${cluster.getChildCount()}</span>`,
      className: "concert-cluster",
      iconSize: window.L.point(40, 40),
    });
  }

  function markerCollection(map) {
    if (!window.L.markerClusterGroup) return window.L.layerGroup();

    const layer = window.L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      zoomToBoundsOnClick: false,
      maxClusterRadius: 40,
      iconCreateFunction: concertClusterIcon,
    });
    let armedChildren = null;

    layer.on("clusterclick", (event) => {
      const childIds = event.layer.getAllChildMarkers().map((marker) => window.L.stamp(marker));
      const isSecondClick = armedChildren
        && childIds.length
        && childIds.every((identifier) => armedChildren.has(identifier));
      const currentZoom = map.getZoom();
      const maxZoom = map.getMaxZoom();

      if (isSecondClick || currentZoom >= maxZoom) {
        armedChildren = null;
        event.layer.spiderfy();
        return;
      }

      armedChildren = new Set(childIds);
      map.setView(
        event.layer.getLatLng(),
        Math.min(currentZoom + 0.5, maxZoom),
        { animate: true },
      );
    });
    layer.on("spiderfied", () => { armedChildren = null; });
    return layer;
  }

  function dateMatches(concert, from, to) {
    if (Number.isFinite(concert.year)) {
      const startsInFirstBucket = from === TIMELINE_MIN && concert.year <= TIMELINE_MIN;
      return (startsInFirstBucket || concert.year >= from) && concert.year <= to;
    }
    return from === TIMELINE_MIN && to === TIMELINE_MAX;
  }

  function popupFor(concert) {
    const title = concert.title || "Untitled concert";
    const preview = concert.program_preview;
    const programUrl = DB.programUrl(concert.id);
    const thumbnailUrl = preview?.thumbnail_url ? DB.path(preview.thumbnail_url) : "";
    const thumbnail = thumbnailUrl ? `
      <a class="concert-map-popup-thumbnail" href="${DB.escapeHtml(programUrl)}">
        <img src="${DB.escapeHtml(thumbnailUrl)}" alt="${DB.escapeHtml(`First page of the program for ${title}`)}" width="${Number(preview.thumbnail_pixel_width) || 320}" height="${Number(preview.thumbnail_pixel_height) || 400}" loading="lazy" decoding="async">
      </a>` : "";
    return `<div class="concert-map-popup${thumbnail ? " has-thumbnail" : ""}">
      <span class="concert-map-popup-copy">
        <strong>${DB.escapeHtml(title)}</strong>
        <span>${DB.escapeHtml(concert.date || "Date unknown")}</span>
        <span>${DB.escapeHtml(DB.locationLabel(concert) || "Place not recorded")}</span>
        <a href="${DB.escapeHtml(programUrl)}">View concert <span aria-hidden="true">→</span></a>
      </span>
      ${thumbnail}
    </div>`;
  }

  function bindConcertPopup(marker, concert) {
    marker.bindPopup(() => popupFor(concert), {
      className: "concert-popup-shell",
      maxWidth: 340,
    });
  }

  function createRegionMap(configuration, onSelect) {
    let definition = REGION_DEFINITIONS[configuration.region];
    const node = document.getElementById(configuration.nodeId);
    const status = configuration.statusId ? document.getElementById(configuration.statusId) : null;
    if (!node || !definition || !window.L) return null;

    const map = window.L.map(node, {
      attributionControl: configuration.attributionControl !== false,
      zoomControl: configuration.zoomControl === true,
      scrollWheelZoom: false,
      preferCanvas: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
    });
    if (configuration.zoomControl === true && map.zoomControl) {
      map.zoomControl.setPosition(configuration.zoomPosition || "topleft");
    }
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markerLayer = markerCollection(map);
    markerLayer.addTo(map);

    function viewBounds() {
      return configuration.viewBoundsByRegion?.[configuration.region] || definition.viewBounds;
    }

    map.fitBounds(viewBounds(), { padding: [8, 8] });

    const visualNode = node.closest(".regional-map-card") || node;
    let baseZoom = map.getZoom();
    const markers = new Map();
    let signature = "";
    let expansionClarity = 0;
    let resizeFrame;
    let resizeObserver;

    function updateClarity() {
      const zoomClarity = clamp((map.getZoom() - baseZoom) / 3, 0, 1);
      const clarity = 1 - ((1 - expansionClarity) * (1 - zoomClarity));
      visualNode.style.setProperty("--map-edge-opacity", String(0.82 - (0.55 * clarity)));
    }

    map.on("zoomend", updateClarity);
    updateClarity();

    function invalidate() {
      if (node.clientWidth > 0 && node.clientHeight > 0) {
        map.invalidateSize({ animate: false });
      }
    }

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(invalidate);
      });
      resizeObserver.observe(node);
    }

    function setStatus(count) {
      if (!status) return;
      status.textContent = count
        ? `${definition.label} concert locations shown. Select a marker to open a record.`
        : `No ${definition.label.toLocaleLowerCase()} concert locations match these filters.`;
    }

    function fit(coordinates, useContext) {
      if (useContext || coordinates.length === 0) {
        map.fitBounds(viewBounds(), { padding: [8, 8], animate: false });
      } else if (coordinates.length === 1) {
        map.setView(coordinates[0], 7, { animate: false });
      } else {
        map.fitBounds(coordinates, { padding: [22, 22], maxZoom: 7, animate: false });
      }
    }

    function render(concerts, options) {
      const settings = options || {};
      const regionalConcerts = concerts.filter((concert) => regionFor(concert) === configuration.region);
      const mappedConcerts = regionalConcerts.filter(hasCoordinates);
      const framing = settings.preserveView ? "preserve" : (settings.useContext ? "context" : "fit");
      const nextSignature = `${framing}:${mappedConcerts.map((concert) => concert.id).join("|")}`;

      markerLayer.clearLayers();
      markers.clear();
      const coordinates = [];
      mappedConcerts.forEach((concert) => {
        const point = [concert.latitude, concert.longitude];
        const marker = concertMarker(point);
        bindConcertPopup(marker, concert);
        marker.on("click", () => onSelect && onSelect(concert));
        markerLayer.addLayer(marker);
        markers.set(concert.id, marker);
        coordinates.push(point);
      });

      if (nextSignature !== signature) {
        if (!settings.preserveView) fit(coordinates, settings.useContext);
        signature = nextSignature;
      }
      setStatus(mappedConcerts.length);

      const selectedMarker = markers.get(settings.selectedId);
      if (selectedMarker) {
        if (markerLayer.zoomToShowLayer) markerLayer.zoomToShowLayer(selectedMarker, () => selectedMarker.openPopup());
        else selectedMarker.openPopup();
      }
    }

    function setRegion(region) {
      const nextDefinition = REGION_DEFINITIONS[region];
      if (!nextDefinition || region === configuration.region) return false;
      configuration.region = region;
      definition = nextDefinition;
      signature = "";
      markerLayer.clearLayers();
      markers.clear();
      map.fitBounds(viewBounds(), { padding: [8, 8], animate: false });
      baseZoom = map.getZoom();
      updateClarity();
      return true;
    }

    return {
      render,
      setRegion,
      setClarity(progress) {
        expansionClarity = clamp(progress, 0, 1);
        updateClarity();
      },
      captureView() {
        map.stop();
        const center = map.getCenter();
        return { center: [center.lat, center.lng], zoom: map.getZoom() };
      },
      restoreView(view) {
        if (!view || node.clientWidth <= 0 || node.clientHeight <= 0) return;
        window.cancelAnimationFrame(resizeFrame);
        map.stop();
        map.invalidateSize({ animate: false, pan: false });
        map.setView(view.center, view.zoom, { animate: false });
      },
      invalidate,
      destroy() {
        window.cancelAnimationFrame(resizeFrame);
        resizeObserver?.disconnect();
        map.remove();
      },
    };
  }

  function createToggleMap(configuration) {
    const toggle = document.getElementById(configuration.toggleId);
    const node = document.getElementById(configuration.nodeId);
    const buttons = [...(toggle?.querySelectorAll("[data-map-toggle-region]") || [])];
    let region = "europe";
    let concerts = [];
    let options = {};
    const regionalMap = createRegionMap({ ...configuration, region }, configuration.onSelect);
    if (!regionalMap) return null;

    function updateControls() {
      const totals = regionalCounts(options.availabilityConcerts || concerts);
      const singleRegion = (totals.europe === 0 && totals.us > 0)
        || (totals.us === 0 && totals.europe > 0);
      if (toggle) toggle.hidden = singleRegion;
      buttons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.mapToggleRegion === region));
      });
      node.setAttribute("aria-label", region === "europe"
        ? "Interactive map of European concert locations"
        : "Interactive map of United States concert locations");
    }

    function selectRegion(nextRegion) {
      if (!["us", "europe"].includes(nextRegion) || nextRegion === region) return;
      region = nextRegion;
      regionalMap.setRegion(region);
      updateControls();
      regionalMap.render(concerts, { ...options, preserveView: false });
      regionalMap.invalidate();
    }

    const handlers = buttons.map((button) => {
      const handler = () => selectRegion(button.dataset.mapToggleRegion);
      button.addEventListener("click", handler);
      return { button, handler };
    });
    updateControls();

    return {
      render(nextConcerts, nextOptions = {}) {
        concerts = nextConcerts;
        options = nextOptions;
        const totals = regionalCounts(options.availabilityConcerts || concerts);
        const nextRegion = totals.europe === 0 && totals.us > 0 ? "us"
          : totals.us === 0 && totals.europe > 0 ? "europe" : region;
        const changedRegion = nextRegion !== region;
        if (changedRegion) {
          region = nextRegion;
          regionalMap.setRegion(region);
        }
        updateControls();
        regionalMap.render(concerts, changedRegion ? { ...options, preserveView: false } : options);
      },
      captureView: () => ({ ...regionalMap.captureView(), region }),
      restoreView(view) {
        if (view?.region === region) regionalMap.restoreView(view);
      },
      invalidate: () => regionalMap.invalidate(),
      destroy() {
        handlers.forEach(({ button, handler }) => button.removeEventListener("click", handler));
        regionalMap.destroy();
      },
    };
  }

  function createDualMaps(configuration) {
    const europe = createRegionMap({
      region: "europe",
      nodeId: configuration.europeNodeId,
      statusId: configuration.europeStatusId,
      attributionControl: configuration.europeAttribution !== false,
      zoomControl: configuration.zoomControl === true,
      zoomPosition: configuration.zoomPosition,
    }, configuration.onSelect);
    const us = createRegionMap({
      region: "us",
      nodeId: configuration.usNodeId,
      statusId: configuration.usStatusId,
      attributionControl: configuration.usAttribution !== false,
      zoomControl: configuration.zoomControl === true,
      zoomPosition: configuration.zoomPosition,
    }, configuration.onSelect);

    return {
      render(concerts, options) {
        europe?.render(concerts, options);
        us?.render(concerts, options);
      },
      invalidate() {
        europe?.invalidate();
        us?.invalidate();
      },
      setClarity(progress) {
        europe?.setClarity(progress);
        us?.setClarity(progress);
      },
      destroy() {
        europe?.destroy();
        us?.destroy();
      },
    };
  }

  function createOverviewMap(configuration) {
    const node = document.getElementById(configuration.nodeId);
    const status = configuration.statusId ? document.getElementById(configuration.statusId) : null;
    if (!node || !window.L) return null;

    const map = window.L.map(node, {
      attributionControl: configuration.attributionControl !== false,
      zoomControl: configuration.zoomControl === true,
      scrollWheelZoom: false,
      preferCanvas: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
    });
    if (configuration.zoomControl === true && map.zoomControl) {
      map.zoomControl.setPosition(configuration.zoomPosition || "topleft");
    }
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markerLayer = markerCollection(map);
    markerLayer.addTo(map);
    const markers = new Map();
    const defaultBounds = configuration.defaultBounds || [[25, -130], [58, 25]];
    let signature = "";
    let resizeFrame;
    let resizeObserver;

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
      });
      resizeObserver.observe(node);
    }

    function setStatus(mappedCount, totalCount) {
      if (!status) return;
      if (!totalCount) {
        status.textContent = "No concert appearances match this filter.";
      } else if (!mappedCount) {
        status.textContent = `${totalCount.toLocaleString()} ${totalCount === 1 ? "concert" : "concerts"}; locations have not yet been mapped.`;
      } else if (mappedCount === totalCount) {
        status.textContent = `${mappedCount.toLocaleString()} ${mappedCount === 1 ? "concert location" : "concert locations"} shown.`;
      } else {
        status.textContent = `${mappedCount.toLocaleString()} of ${totalCount.toLocaleString()} concert locations shown.`;
      }
    }

    function fit(coordinates) {
      if (coordinates.length === 0) {
        map.fitBounds(defaultBounds, { padding: [12, 12], animate: false });
      } else if (coordinates.length === 1) {
        map.setView(coordinates[0], configuration.singleZoom || 7, { animate: false });
      } else {
        map.fitBounds(coordinates, {
          padding: configuration.padding || [28, 28],
          maxZoom: configuration.maxZoom || 7,
          animate: false,
        });
      }
    }

    function render(concerts, options) {
      const settings = options || {};
      const uniqueConcerts = [...new Map((concerts || []).filter(Boolean).map((concert) => [concert.id, concert])).values()];
      const mappedConcerts = uniqueConcerts.filter(hasCoordinates);
      const framing = settings.preserveView ? "preserve" : "fit";
      const nextSignature = `${framing}:${mappedConcerts.map((concert) => concert.id).join("|")}`;

      markerLayer.clearLayers();
      markers.clear();
      const coordinates = [];
      mappedConcerts.forEach((concert) => {
        const point = [concert.latitude, concert.longitude];
        const marker = concertMarker(point);
        bindConcertPopup(marker, concert);
        markerLayer.addLayer(marker);
        markers.set(concert.id, marker);
        coordinates.push(point);
      });

      if (nextSignature !== signature) {
        if (!settings.preserveView) fit(coordinates);
        signature = nextSignature;
      }
      setStatus(mappedConcerts.length, uniqueConcerts.length);

      const selectedMarker = markers.get(settings.selectedId);
      if (selectedMarker) {
        if (markerLayer.zoomToShowLayer) markerLayer.zoomToShowLayer(selectedMarker, () => selectedMarker.openPopup());
        else selectedMarker.openPopup();
      }
    }

    return {
      render,
      invalidate() {
        map.invalidateSize({ animate: false });
      },
      destroy() {
        resizeObserver?.disconnect();
        map.remove();
      },
    };
  }

  function renderHistogram(node, concerts) {
    if (!node) return;
    const counts = new Map();
    concerts.forEach((concert) => {
      if (Number.isFinite(concert.year) && concert.year <= TIMELINE_MAX) {
        const bucket = Math.max(TIMELINE_MIN, concert.year);
        counts.set(bucket, (counts.get(bucket) || 0) + 1);
      }
    });
    const maximum = Math.max(1, ...counts.values());
    const fragment = document.createDocumentFragment();
    for (let year = TIMELINE_MIN; year <= TIMELINE_MAX; year += 1) {
      const bar = document.createElement("span");
      bar.dataset.year = String(year);
      bar.style.setProperty("--count", (counts.get(year) || 0) / maximum);
      bar.title = year === TIMELINE_MIN
        ? `${TIMELINE_MIN} and before: ${counts.get(year) || 0} concerts`
        : `${year}: ${counts.get(year) || 0} concerts`;
      fragment.append(bar);
    }
    node.replaceChildren(fragment);
  }

  function updateTimeline(configuration) {
    const from = clamp(Number(configuration.startInput.value), TIMELINE_MIN, TIMELINE_MAX);
    const to = clamp(Number(configuration.endInput.value), TIMELINE_MIN, TIMELINE_MAX);
    configuration.output.textContent = from === TIMELINE_MIN
      ? (to === TIMELINE_MIN ? `${TIMELINE_MIN} and before` : `${TIMELINE_MIN} and before–${to}`)
      : `${from}–${to}`;
    configuration.startInput.setAttribute("aria-valuetext", from === TIMELINE_MIN ? `${TIMELINE_MIN} and before` : String(from));
    configuration.endInput.setAttribute("aria-valuetext", String(to));
    const span = TIMELINE_MAX - TIMELINE_MIN;
    configuration.track?.style.setProperty("--range-start", `${((from - TIMELINE_MIN) / span) * 100}%`);
    configuration.track?.style.setProperty("--range-end", `${((to - TIMELINE_MIN) / span) * 100}%`);
    configuration.histogram?.querySelectorAll("[data-year]").forEach((bar) => {
      const year = Number(bar.dataset.year);
      bar.classList.toggle("is-outside-range", year < from || year > to);
    });
  }

  function setTimelineConcerts(configuration, concerts) {
    const records = concerts || [];
    const signature = records.map((concert) => `${concert.id}:${concert.year || ""}`).join("|");
    if (configuration.histogramSignature !== signature) {
      renderHistogram(configuration.histogram, records);
      configuration.histogramSignature = signature;
    }
    updateTimeline(configuration);
  }

  function initializeTimeline(configuration, concerts) {
    [configuration.startInput, configuration.endInput].forEach((input) => {
      input.min = TIMELINE_MIN;
      input.max = TIMELINE_MAX;
    });
    setTimelineConcerts(configuration, concerts);
  }

  window.ConcertMapUI = {
    TIMELINE_MIN,
    TIMELINE_MAX,
    clamp,
    dateMatches,
    regionFor,
    regionalCounts,
    createRegionMap,
    createToggleMap,
    createDualMaps,
    createOverviewMap,
    initializeTimeline,
    setTimelineConcerts,
    updateTimeline,
  };
}());
