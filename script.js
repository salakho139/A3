
const DATA_URL = "data/player_journeys_map_ready.csv";
const FEATURED_URL = "data/featured_players.json";
const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const LEAGUE_LABELS = {
  GB1: "Premier League",
  ES1: "La Liga",
  IT1: "Serie A",
  L1: "Bundesliga",
  FR1: "Ligue 1",
  NL1: "Eredivisie",
  PO1: "Primeira Liga"
};

const MOVE_TYPE_LABELS = {
  transfer: "Transfer",
  loan: "Loan",
  free: "Free",
  loan_end: "Loan end"
};

const MOVE_COLORS = {
  transfer: "#52f4ff",
  loan: "#ff7e6b",
  free: "#d7ff72",
  loan_end: "#b890ff"
};

const CLUB_COORD_OVERRIDES = {
  "real madrid": { longitude: -3.68835, latitude: 40.45306 },
  "real madrid cf": { longitude: -3.68835, latitude: 40.45306 }
};

const state = {
  season: 2021,
  leagues: new Set(["GB1", "ES1", "L1", "FR1"]),
  windows: new Set(["s", "w"]),
  moveTypes: new Set(["transfer", "loan", "free", "loan_end"]),
  showMap: true,
  showHotspots: true,
  showLines: true,
  animateOverview: true,
  selectedPlayerId: null,
  playing: false,
  playingMode: null,
  playbackPaused: false,
  playbackIndex: null,
  playToken: 0,
  overviewTimer: null,
  spendingLeagueFocus: null,
  selectedClubName: null
};

const els = {
  playerSearch: document.getElementById("player-search"),
  playerSuggestionBox: document.getElementById("player-suggestion-box"),
  featuredPlayers: document.getElementById("featured-players"),
  seasonSlider: document.getElementById("season-slider"),
  seasonValue: document.getElementById("season-value"),
  playToggle: document.getElementById("play-toggle"),
  playCareer: document.getElementById("play-career"),
  careerScrubber: document.getElementById("career-scrubber"),
  careerScrubberValue: document.getElementById("career-scrubber-value"),
  leaguePills: document.getElementById("league-pills"),
  windowButtons: document.getElementById("window-buttons"),
  moveTypeButtons: document.getElementById("move-type-buttons"),
  toggleMap: document.getElementById("toggle-map"),
  toggleHotspots: document.getElementById("toggle-hotspots"),
  toggleLines: document.getElementById("toggle-lines"),
  toggleAnimation: document.getElementById("toggle-animation"),
  statsGrid: document.getElementById("stats-grid"),
  filterSummary: document.getElementById("filter-summary"),
  mapTitle: document.getElementById("map-title"),
  mapInsight: document.getElementById("map-insight"),
  storyline: document.getElementById("storyline"),
  focusModeLabel: document.getElementById("focus-mode-label"),
  resetPlayer: document.getElementById("reset-player"),
  tooltip: document.getElementById("tooltip"),
  mapWrap: document.getElementById("map-wrap"),
  playbackCaption: document.getElementById("playback-caption"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomReset: document.getElementById("zoom-reset"),
  playbackTimelineOverlay: document.getElementById("playback-timeline-overlay"),
  timelineDock: document.getElementById("timeline-dock"),
  leagueSpendingChart: document.getElementById("league-spending-chart"),
  leagueSpendingTop10: document.getElementById("league-spending-top10"),
  leagueSpendingFocus: document.getElementById("league-spending-focus"),
  leagueSpendNote: document.getElementById("league-spend-note")
};

const svg = d3.select("#map-svg");
const width = 1100;
const height = 720;
const defs = svg.append("defs");
const mapRoot = svg.append("g");
const countryLayer = mapRoot.append("g").attr("class", "countries");
const routeLayer = mapRoot.append("g").attr("class", "routes");
const pointLayer = mapRoot.append("g").attr("class", "points");
const labelLayer = mapRoot.append("g").attr("class", "labels");

const projection = d3.geoNaturalEarth1()
  .fitExtent([[18, 18], [width - 18, height - 18]], {type: "Sphere"});

const geoPath = d3.geoPath(projection);
const zoom = d3.zoom()
  .scaleExtent([1, 28])
  .on("zoom", (event) => {
    currentZoomK = event.transform.k;
    mapRoot.attr("transform", event.transform);
    applyZoomResponsiveSizing(currentZoomK);
  });

let data = [];
let featuredPlayers = [];
let countries = [];
let searchablePlayers = [];
let suggestionResults = [];
let currentZoomK = 1;
let captionHideTimer = null;


function ensureDomScaffold() {
  if (!els.playerSearch) return;

  if (!els.playerSuggestionBox) {
    const box = document.createElement("div");
    box.id = "player-suggestion-box";
    box.className = "player-suggestion-box";
    box.hidden = true;
    const wrap = document.getElementById("player-search-wrap") || els.playerSearch.parentElement;
    wrap?.appendChild(box);
    els.playerSuggestionBox = box;
  }

  if (!els.featuredPlayers) {
    const host = document.createElement("div");
    host.id = "featured-players";
    host.className = "chip-grid";
    const searchWrap = els.playerSearch.closest('.control-card') || els.playerSearch.parentElement;
    searchWrap?.appendChild(host);
    els.featuredPlayers = host;
  }

  if (!els.playbackTimelineOverlay && els.mapWrap) {
    const overlay = document.createElement("div");
    overlay.id = "playback-timeline-overlay";
    overlay.className = "playback-timeline-overlay";
    overlay.hidden = true;
    els.mapWrap.appendChild(overlay);
    els.playbackTimelineOverlay = overlay;
  }

  if (!els.timelineDock && els.mapWrap) {
    const dock = document.createElement("div");
    dock.id = "timeline-dock";
    dock.className = "timeline-dock";
    dock.hidden = true;
    els.mapWrap.insertAdjacentElement("afterend", dock);
    els.timelineDock = dock;
  }
}

ensureDomScaffold();

Promise.all([
  d3.csv(DATA_URL, rowParser),
  d3.json(FEATURED_URL).catch(() => []),
  d3.json(WORLD_URL).catch(() => null)
]).then(([rows, featured, world]) => {
  data = rows.filter(d => d.season && d.from_latitude != null && d.to_latitude != null);
  featuredPlayers = Array.isArray(featured) ? featured : [];
  countries = world ? topojson.feature(world, world.objects.countries).features : [];

  searchablePlayers = Array.from(
    d3.rollups(
      data,
      values => ({
        player_id: values[0].player_id,
        player_name: values[0].player_name,
        player_nation: values[0].player_nation,
        player_pos: values[0].player_pos,
        journey_moves: d3.max(values, d => d.journey_moves) || values.length,
        journey_distance_km: d3.max(values, d => d.journey_distance_km) || 0,
        first_season: d3.min(values, d => d.first_season || d.season),
        last_season: d3.max(values, d => d.last_season || d.season)
      }),
      d => d.player_id
    ),
    ([, value]) => value
  ).sort((a, b) => (
    famousBoost(b.player_name) - famousBoost(a.player_name) ||
    d3.descending(a.journey_moves, b.journey_moves) ||
    a.player_name.localeCompare(b.player_name)
  ));

  drawCountries();
  initZoom();
  initControls();
  update();
}).catch(error => {
  console.error(error);
  svg.append("text")
    .attr("class", "empty-state")
    .attr("x", width / 2)
    .attr("y", height / 2)
    .text("Could not load the data files. Check the folder paths and run the project through a local server.");
});

function rowParser(d) {
  const row = {
    transfer_id: +d.transfer_id,
    player_id: +d.player_id,
    player_name: d.player_name,
    player_age: numericOrNull(d.player_age),
    player_nation: d.player_nation || "Unknown",
    player_nation2: d.player_nation2 || "",
    player_pos: d.player_pos || "Unknown",
    season: numericOrNull(d.season),
    window: d.window,
    window_label: d.window_label || (d.window === "s" ? "Summer" : "Winter"),
    league: d.league,
    league_label: d.league_label || LEAGUE_LABELS[d.league] || d.league,
    team_name: d.team_name,
    team_country: d.team_country,
    counter_team_name: d.counter_team_name,
    counter_team_country: d.counter_team_country,
    transfer_fee_amnt: numericOrNull(d.transfer_fee_amnt),
    market_val_amnt: numericOrNull(d.market_val_amnt),
    is_free: truthy(d.is_free),
    is_loan: truthy(d.is_loan),
    is_loan_end: truthy(d.is_loan_end),
    is_retired: truthy(d.is_retired),
    move_type: d.move_type,
    from_team_name: d.from_team_name,
    from_team_country: d.from_team_country,
    from_longitude: numericOrNull(d.from_longitude),
    from_latitude: numericOrNull(d.from_latitude),
    to_team_name: d.to_team_name,
    to_team_country: d.to_team_country,
    to_longitude: numericOrNull(d.to_longitude),
    to_latitude: numericOrNull(d.to_latitude),
    career_move_no: numericOrNull(d.career_move_no),
    journey_moves: numericOrNull(d.journey_moves),
    journey_distance_km: numericOrNull(d.journey_distance_km),
    first_season: numericOrNull(d.first_season),
    last_season: numericOrNull(d.last_season)
  };
  applyCoordinateOverrides(row);
  return row;
}

function applyCoordinateOverrides(row) {
  [
    ["from_team_name", "from_longitude", "from_latitude"],
    ["to_team_name", "to_longitude", "to_latitude"]
  ].forEach(([nameKey, lonKey, latKey]) => {
    const override = CLUB_COORD_OVERRIDES[normalizeSearchText(row[nameKey])];
    if (override) {
      row[lonKey] = override.longitude;
      row[latKey] = override.latitude;
    }
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numericOrNull(value) {
  const n = +value;
  return Number.isFinite(n) ? n : null;
}

function truthy(value) {
  return value === true || value === "True" || value === "true" || value === "1" || value === 1;
}

function drawCountries() {
  if (countries.length) {
    countryLayer.selectAll("path.country")
      .data(countries)
      .join("path")
      .attr("class", "country")
      .attr("d", geoPath);
  }

  countryLayer.selectAll("path.country-outline")
    .data([{type: "Sphere"}])
    .join("path")
    .attr("class", "country-outline")
    .attr("d", geoPath);
}

function initZoom() {
  svg.call(zoom).on("dblclick.zoom", null);

  els.zoomIn?.addEventListener("click", () => {
    svg.transition().duration(240).call(zoom.scaleBy, 1.25);
  });
  els.zoomOut?.addEventListener("click", () => {
    svg.transition().duration(240).call(zoom.scaleBy, 0.8);
  });
  els.zoomReset?.addEventListener("click", () => {
    zoomToEurope(500);
  });

  applyZoomResponsiveSizing(1);
  zoomToEurope(0);
}

function transformForBounds(lonMin, latMin, lonMax, latMax, padding = 60) {
  const corners = [
    projection([lonMin, latMin]),
    projection([lonMax, latMin]),
    projection([lonMax, latMax]),
    projection([lonMin, latMax])
  ].filter(Boolean);

  const xs = corners.map(d => d[0]);
  const ys = corners.map(d => d[1]);
  const minX = d3.min(xs);
  const maxX = d3.max(xs);
  const minY = d3.min(ys);
  const maxY = d3.max(ys);
  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);
  const scale = Math.max(1, Math.min(22, 0.9 / Math.max(dx / (width - padding * 2), dy / (height - padding * 2))));
  const tx = width / 2 - scale * ((minX + maxX) / 2);
  const ty = height / 2 - scale * ((minY + maxY) / 2);
  return d3.zoomIdentity.translate(tx, ty).scale(scale);
}

function zoomToEurope(duration = 700) {
  const t = transformForBounds(-16, 33, 43, 66, 54);
  return svg.transition().duration(duration).ease(d3.easeCubicOut).call(zoom.transform, t).end().catch(() => {});
}

function zoomToLocation(lon, lat, scale = 10.2, duration = 700) {
  const [x, y] = projection([lon, lat]);
  const t = d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-x, -y);
  return svg.transition().duration(duration).ease(d3.easeCubicOut).call(zoom.transform, t).end().catch(() => {});
}

function zoomToSegment(startLon, startLat, endLon, endLat, duration = 900) {
  const [x1, y1] = projection([startLon, startLat]);
  const [x2, y2] = projection([endLon, endLat]);
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const dx = Math.max(60, maxX - minX);
  const dy = Math.max(60, maxY - minY);
  const scale = Math.max(2.1, Math.min(22, 0.92 / Math.max(dx / (width - 220), dy / (height - 220))));
  const tx = width / 2 - scale * ((minX + maxX) / 2);
  const ty = height / 2 - scale * ((minY + maxY) / 2);
  const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
  return svg.transition().duration(duration).ease(d3.easeCubicInOut).call(zoom.transform, t).end().catch(() => {});
}

function initControls() {
  const seasons = d3.extent(data, d => d.season);
  state.season = 2021 >= seasons[0] && 2021 <= seasons[1] ? 2021 : seasons[0];
  els.seasonSlider.min = seasons[0];
  els.seasonSlider.max = seasons[1];
  els.seasonSlider.value = state.season;
  els.seasonValue.textContent = state.season;

  renderLeaguePills();

  buildSegmentedButtons(els.windowButtons, [
    {key: "s", label: "Summer"},
    {key: "w", label: "Winter"}
  ], "windows");

  buildSegmentedButtons(els.moveTypeButtons, [
    {key: "transfer", label: "Transfer"},
    {key: "loan", label: "Loan"},
    {key: "free", label: "Free"},
    {key: "loan_end", label: "Loan end"}
  ], "moveTypes");

  renderFeaturedPlayers();
  initSearch();

  els.seasonSlider.addEventListener("input", (event) => {
    stopPlayback();
    state.season = +event.target.value;
    els.seasonValue.textContent = state.season;
    update();
  });

  els.playToggle.addEventListener("click", async () => {
    if (state.playing) {
      stopPlayback();
      update();
      return;
    }

    startOverviewPlayback();
  });

  els.playCareer?.addEventListener("click", async () => {
    if (!state.selectedPlayerId) return;
    if (state.playing && state.playingMode === "career") {
      stopPlayback({preserveCareerProgress: true, pausedCareer: true});
      update();
      return;
    }
    if (els.mapTitle) {
      const y = window.scrollY + els.mapTitle.getBoundingClientRect().top - 72;
      window.scrollTo({top: Math.max(0, y), behavior: "smooth"});
    }
    // Resume from current playback index when paused or scrubbed; restart only when no position exists.
    const shouldRestart = state.playbackIndex == null;
    await startPlayerPlayback({restart: shouldRestart});
  });

  if (els.toggleMap) {
    els.toggleMap.checked = state.showMap;
    els.toggleMap.addEventListener("change", () => {
      state.showMap = !!els.toggleMap.checked;
      update();
    });
  }
  if (els.toggleHotspots) {
    els.toggleHotspots.checked = state.showHotspots;
    els.toggleHotspots.addEventListener("change", () => {
      state.showHotspots = !!els.toggleHotspots.checked;
      update();
    });
  }
  if (els.toggleLines) {
    els.toggleLines.checked = state.showLines;
    els.toggleLines.addEventListener("change", () => {
      state.showLines = !!els.toggleLines.checked;
      update();
    });
  }
  if (els.toggleAnimation) {
    els.toggleAnimation.checked = state.animateOverview;
    els.toggleAnimation.addEventListener("change", () => {
      state.animateOverview = !!els.toggleAnimation.checked;
      update();
    });
  }

  els.careerScrubber?.addEventListener("input", () => {
    if (!state.selectedPlayerId) return;
    const rows = playerJourneyRows(state.selectedPlayerId);
    if (!rows.length) return;
    stopPlayback({preserveCareerProgress: true});
    const raw = +els.careerScrubber.value;
    const idx = clamp(raw - 1, 0, rows.length - 1);
    state.playbackIndex = idx;
    state.season = rows[idx].season;
    els.seasonSlider.value = state.season;
    els.seasonValue.textContent = state.season;
    update();
  });

  els.resetPlayer.addEventListener("click", () => {
    stopPlayback();
    state.selectedPlayerId = null;
    state.selectedClubName = null;
    state.leagues = new Set(["GB1", "ES1", "L1", "FR1"]);
    state.showMap = true;
    state.showHotspots = true;
    state.showLines = true;
    state.animateOverview = false;
    if (els.toggleMap) els.toggleMap.checked = true;
    if (els.toggleHotspots) els.toggleHotspots.checked = true;
    if (els.toggleLines) els.toggleLines.checked = true;
    if (els.toggleAnimation) els.toggleAnimation.checked = false;
    state.playbackIndex = null;
    els.playerSearch.value = "";
    update();
  });

  els.playerSearch.value = "";
}

function initSearch() {
  if (!els.playerSearch) return;

  els.playerSearch.addEventListener("input", () => {
    const query = els.playerSearch.value.trim();
    if (!query) {
      suggestionResults = [];
      renderFeaturedPlayers();
      hideSuggestions();
      return;
    }
    suggestionResults = searchPlayers(query).slice(0, 10);
    renderSearchResultChips(query, suggestionResults);
    hideSuggestions();
  });

  els.playerSearch.addEventListener("focus", () => {
    const query = els.playerSearch.value.trim();
    if (query) {
      suggestionResults = searchPlayers(query).slice(0, 10);
      renderSearchResultChips(query, suggestionResults);
      hideSuggestions();
    }
  });

  els.playerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const query = els.playerSearch.value.trim();
      const exact = findExactPlayerMatch(query);
      if (exact) {
        selectPlayer(exact.player_id);
        return;
      }

      // Only auto-pick when we have a strong visible candidate.
      const choice = suggestionResults[0];
      if (choice && normalizeSearchText(query).length >= 2) {
        selectPlayer(choice.player_id);
      } else {
        hideSuggestions();
      }
    } else if (event.key === "Escape") {
      hideSuggestions();
    }
  });

}

function renderFeaturedPlayers() {
  if (!els.featuredPlayers) return;

  const available = new Map(searchablePlayers.map(d => [d.player_id, d]));
  let picks = featuredPlayers
    .map(d => available.get(+d.player_id))
    .filter(Boolean);

  if (!picks.length) {
    picks = searchablePlayers
      .filter(player => famousBoost(player.player_name) > 0)
      .slice(0, 8);
  }

  if (!picks.length) {
    picks = searchablePlayers.slice(0, 8);
  }

  renderPlayerChips(picks);
}

function renderSearchResultChips(query, matches) {
  if (!els.featuredPlayers) return;
  if (!matches.length) {
    els.featuredPlayers.innerHTML = `
      <div class="suggestion-empty">No players found for "${escapeHtml(query)}".</div>
    `;
    return;
  }
  renderPlayerChips(matches.slice(0, 10));
}

function renderPlayerChips(players) {
  if (!els.featuredPlayers) return;
  els.featuredPlayers.innerHTML = players.map(player => `
    <button class="feature-chip" type="button" data-player-id="${player.player_id}">
      <span>${player.player_name}</span>
      <small>${player.player_nation} · ${player.player_pos}</small>
    </button>
  `).join("");

  els.featuredPlayers.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => selectPlayer(+button.dataset.playerId));
  });
}

function renderLeaguePills() {
  if (!els.leaguePills) return;

  const picks = ["GB1", ...Object.keys(LEAGUE_LABELS).filter(code => code !== "GB1")];
  els.leaguePills.innerHTML = picks.map(code => `
    <button class="feature-chip league-chip" type="button" data-league="${code}">
      <span>${LEAGUE_LABELS[code] || code}</span>
    </button>
  `).join("");

  els.leaguePills.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      stopPlayback();
      toggleLeague(button.dataset.league);
      update();
    });
  });
}

function toggleLeague(leagueCode) {
  if (state.leagues.has(leagueCode)) {
    if (state.leagues.size > 1) {
      state.leagues.delete(leagueCode);
    }
  } else {
    state.leagues.add(leagueCode);
  }
}


function searchPlayers(query) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);

  return searchablePlayers
    .map(player => {
      const name = normalizeSearchText(player.player_name);
      const starts = name.startsWith(q);
      const includes = name.includes(q);
      const lastWordStarts = name.split(" ").some(part => part.startsWith(q));
      const tokenMatches = tokens.filter(token => name.includes(token)).length;
      const allTokensMatch = tokens.length > 1 && tokenMatches === tokens.length;
      const score =
        (starts ? 100 : 0) +
        (lastWordStarts ? 70 : 0) +
        (includes ? 40 : 0) +
        (allTokensMatch ? 65 : 0) +
        tokenMatches * 18 +
        famousBoost(player.player_name) * 8 +
        Math.min(player.journey_moves, 10);
      return {player, score};
    })
    .filter(d => d.score > 0)
    .sort((a, b) => d3.descending(a.score, b.score) || a.player.player_name.localeCompare(b.player.player_name))
    .map(d => d.player);
}

function findExactPlayerMatch(query) {
  const q = normalizeSearchText(query);
  if (!q) return null;
  return searchablePlayers.find(player => normalizeSearchText(player.player_name) === q) || null;
}

function hideSuggestions() {
  if (!els.playerSuggestionBox) return;
  els.playerSuggestionBox.hidden = true;
}

function selectPlayer(playerId) {
  stopPlayback();
  state.selectedPlayerId = playerId;
  state.selectedClubName = null;
  state.leagues = new Set(Object.keys(LEAGUE_LABELS));
  state.playbackIndex = null;
  state.season = +els.seasonSlider.max;
  const player = searchablePlayers.find(d => d.player_id === playerId);
  els.playerSearch.value = player?.player_name || "";
  els.seasonSlider.value = state.season;
  els.seasonValue.textContent = state.season;
  hideSuggestions();
  update();
}

function buildSegmentedButtons(container, buttons, stateKey) {
  container.innerHTML = buttons.map(button => `
    <button type="button" data-key="${button.key}" data-state-key="${stateKey}" data-type="${button.key}">
      ${button.label}
    </button>
  `).join("");

  container.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      stopPlayback();
      toggleSetValue(state[stateKey], button.dataset.key);
      update();
    });
  });
}

function toggleSetValue(set, value) {
  if (!(set instanceof Set)) return;
  if (set.has(value)) {
    if (set.size > 1) {
      set.delete(value);
    }
  } else {
    set.add(value);
  }
}

function stopPlayback(options = {}) {
  const {preserveCareerProgress = false, pausedCareer = false} = options;
  state.playToken += 1;
  state.playing = false;
  state.playingMode = null;
  if (preserveCareerProgress) {
    state.playbackPaused = pausedCareer;
  } else {
    state.playbackPaused = false;
    state.playbackIndex = null;
  }
  els.playToggle.classList.remove("is-active");
  els.playToggle.textContent = "Play seasons";
  els.playCareer?.classList.remove("is-active");
  if (els.playCareer) els.playCareer.textContent = pausedCareer ? "Resume Career" : "Play Career";
  if (state.overviewTimer) {
    window.clearInterval(state.overviewTimer);
    state.overviewTimer = null;
  }
  hidePlaybackCaption();
}

function startOverviewPlayback() {
  stopPlayback();
  state.selectedPlayerId = null;
  state.selectedClubName = null;
  state.playing = true;
  state.playingMode = "overview";
  els.playToggle.classList.add("is-active");
  els.playToggle.textContent = "Pause";
  state.overviewTimer = window.setInterval(() => {
    const max = +els.seasonSlider.max;
    const min = +els.seasonSlider.min;
    state.season = state.season >= max ? min : state.season + 1;
    els.seasonSlider.value = state.season;
    els.seasonValue.textContent = state.season;
    update();
  }, 1300);
}

async function startPlayerPlayback(options = {}) {
  const {restart = true} = options;
  const player = searchablePlayers.find(d => d.player_id === state.selectedPlayerId);
  if (!player) return;
  const startIndex = restart ? 0 : (state.playbackIndex != null ? clamp(state.playbackIndex, 0, Number.MAX_SAFE_INTEGER) : 0);
  stopPlayback({preserveCareerProgress: true});
  state.playing = true;
  state.playingMode = "career";
  state.playbackPaused = false;
  els.playCareer?.classList.add("is-active");
  if (els.playCareer) els.playCareer.textContent = "Pause";
  const token = ++state.playToken;

  const rows = playerJourneyRows(player.player_id);
  if (!rows.length) {
    stopPlayback();
    update();
    return;
  }

  const boundedStart = clamp(startIndex, 0, Math.max(0, rows.length - 1));
  for (let i = boundedStart; i < rows.length; i += 1) {
    if (token !== state.playToken) return;

    state.playbackIndex = i;
    state.season = rows[i].season;
    els.seasonSlider.value = state.season;
    els.seasonValue.textContent = state.season;
    update();
    await sleep(80);
    if (token !== state.playToken) return;
    await animateCurrentTransfer(rows[i], token, {
      isPlaybackStart: i === boundedStart,
      isCareerFirst: i === 0,
      isLastMove: i === rows.length - 1
    });
    if (token !== state.playToken) return;
    await sleep(220);
  }

  if (token !== state.playToken) return;
  state.playing = false;
  state.playingMode = null;
  state.playbackPaused = false;
  state.playbackIndex = null;
  els.playCareer?.classList.remove("is-active");
  if (els.playCareer) els.playCareer.textContent = "Play Career";
  update();
  await sleep(180);
  if (token !== state.playToken) return;
  await zoomToEurope(1050);
}

async function animateCurrentTransfer(move, token, options = {}) {
  const {isPlaybackStart = false, isCareerFirst = false, isLastMove = false} = options;

  if (isPlaybackStart) {
    await zoomToLocation(move.from_longitude, move.from_latitude, 19.2, 560);
  }
  if (token !== state.playToken) return;

  if (isCareerFirst) {
    showPlaybackCaption(move, "origin");
    await sleep(2300);
    hidePlaybackCaption();
    await sleep(760);
  }
  if (token !== state.playToken) return;

  const routeId = routeKey(move);
  const progress = routeLayer.select(`g.route-group[data-key="${cssEscape(routeId)}"] path.route-progress`);
  const pulse = pointLayer.select(`g.stop-group[data-key="${cssEscape(routeId)}"] circle.stop-badge`);

  if (!progress.empty()) {
    const node = progress.node();
    const length = node.getTotalLength();
    progress
      .attr("stroke-dasharray", `${length} ${length}`)
      .attr("stroke-dashoffset", length)
      .attr("opacity", 1);

    const linePromise = progress.transition()
      .duration(1150)
      .ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0)
      .end()
      .catch(() => {});

    const pulsePromise = !pulse.empty()
      ? pulse.transition().duration(220).attr("r", 8.2 / currentZoomK).transition().duration(450).attr("r", 5.6 / currentZoomK).end().catch(() => {})
      : Promise.resolve();

    const zoomPromise = zoomToLocation(move.to_longitude, move.to_latitude, isLastMove ? 18.6 : 20.4, 1150);
    await Promise.all([linePromise, zoomPromise, pulsePromise]);
  }

  if (token !== state.playToken) return;
  showPlaybackCaption(move, "arrival");
  await sleep(isLastMove ? 2800 : 2200);
  hidePlaybackCaption();
  await sleep(620);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function update() {
  syncButtonStates();

  const selectedPlayer = state.selectedPlayerId ? searchablePlayers.find(d => d.player_id === state.selectedPlayerId) : null;
  const selectedClub = selectedPlayer ? null : state.selectedClubName;
  const seasonRows = filteredSeasonRows();
  const clubRows = selectedClub ? clubAllTimeRows(selectedClub) : [];
  const displayRows = selectedPlayer
    ? playerJourneyRows(selectedPlayer.player_id)
    : selectedClub
      ? clubRows
      : seasonRows;
  const visibleRows = selectedPlayer
    ? (state.playbackIndex != null ? displayRows.slice(0, state.playbackIndex + 1) : displayRows.filter(d => d.season <= state.season))
    : displayRows;
  const drawRows = selectedPlayer || selectedClub ? visibleRows : limitForMap(visibleRows);
  const showCareerUI = !!selectedPlayer && (state.playingMode === "career" || state.playbackPaused);
  if (!showCareerUI) {
    hardHidePlaybackCaption();
  }

  updateHeader(selectedPlayer, selectedClub, seasonRows, visibleRows);
  updateStats(selectedPlayer, selectedClub, seasonRows, visibleRows);
  updateLeagueSpendingViz();
  updateCareerScrubber(selectedPlayer, displayRows, visibleRows);
  updatePlaybackTimeline(selectedPlayer, visibleRows, displayRows);
  drawMap(drawRows, selectedPlayer, visibleRows.length);
}

function updateLeagueSpendingViz() {
  if (!els.leagueSpendingChart || !els.leagueSpendingTop10) return;

  const feeRows = data.filter(d => (
    d.season === state.season &&
    state.windows.has(d.window) &&
    state.moveTypes.has(d.move_type) &&
    Number.isFinite(d.transfer_fee_amnt) &&
    d.transfer_fee_amnt > 0
  ));

  const grouped = new Map(d3.rollups(
    feeRows,
    values => ({
      totalSpend: d3.sum(values, d => d.transfer_fee_amnt || 0),
      paidMoves: values.length
    }),
    d => d.league
  ));

  const leagueRows = Object.keys(LEAGUE_LABELS).map(code => {
    const summary = grouped.get(code) || {totalSpend: 0, paidMoves: 0};
    return {
      league: code,
      leagueLabel: LEAGUE_LABELS[code] || code,
      totalSpend: summary.totalSpend,
      paidMoves: summary.paidMoves
    };
  }).sort((a, b) => d3.descending(a.totalSpend, b.totalSpend));

  if (!leagueRows.length) {
    els.leagueSpendingChart.innerHTML = `<div class="empty-state-inline">No league spending rows available.</div>`;
    els.leagueSpendingTop10.innerHTML = "";
    return;
  }

  const hasFocus = leagueRows.some(d => d.league === state.spendingLeagueFocus);
  if (!hasFocus) {
    const firstWithSpend = leagueRows.find(d => d.totalSpend > 0);
    state.spendingLeagueFocus = (firstWithSpend || leagueRows[0]).league;
  }

  const maxSpend = d3.max(leagueRows, d => d.totalSpend) || 1;
  els.leagueSpendingChart.innerHTML = leagueRows.map(d => {
    const pct = Math.max(4, (d.totalSpend / maxSpend) * 100);
    const active = d.league === state.spendingLeagueFocus;
    return `
      <button class="league-spend-row ${active ? "is-active" : ""}" type="button" data-league="${d.league}">
        <span class="league-spend-name">${d.leagueLabel}</span>
        <span class="league-spend-bar-wrap">
          <span class="league-spend-bar" style="width:${pct}%"></span>
        </span>
        <span class="league-spend-value">${formatMoneyCompact(d.totalSpend)}</span>
      </button>
    `;
  }).join("");

  els.leagueSpendingChart.querySelectorAll(".league-spend-row").forEach(button => {
    button.addEventListener("click", () => {
      state.spendingLeagueFocus = button.dataset.league;
      updateLeagueSpendingViz();
    });
  });

  const focusLeague = state.spendingLeagueFocus;
  const focusLabel = LEAGUE_LABELS[focusLeague] || focusLeague;
  const topClubs = d3.rollups(
    feeRows.filter(d => d.league === focusLeague),
    values => ({
      spend: d3.sum(values, d => d.transfer_fee_amnt || 0),
      moves: values.length
    }),
    d => d.to_team_name || "Unknown club"
  )
    .map(([club, summary]) => ({club, ...summary}))
    .sort((a, b) => d3.descending(a.spend, b.spend))
    .slice(0, 10);

  if (els.leagueSpendNote) {
    const disclosedTotal = d3.sum(leagueRows, d => d.totalSpend);
    els.leagueSpendNote.textContent = `${state.season} · Disclosed fees ${formatMoneyCompact(disclosedTotal)}`;
  }
  if (els.leagueSpendingFocus) {
    els.leagueSpendingFocus.textContent = `Top 10 spenders · ${focusLabel} (${state.season})`;
  }

  if (!topClubs.length) {
    els.leagueSpendingTop10.innerHTML = `<div class="empty-state-inline">No disclosed transfer fees for ${focusLabel} in ${state.season} with current filters.</div>`;
    return;
  }

  els.leagueSpendingTop10.innerHTML = topClubs.map((d, i) => `
    <div class="spend-club-row">
      <span class="spend-rank">${i + 1}</span>
      <span class="spend-club-name">${escapeHtml(d.club)}</span>
      <span class="spend-club-meta">${formatNumber(d.moves)} move${d.moves === 1 ? "" : "s"}</span>
      <span class="spend-club-value">${formatMoneyCompact(d.spend)}</span>
      <button class="spend-club-action" type="button" data-club-index="${i}">View all-time transfers</button>
    </div>
  `).join("");

  els.leagueSpendingTop10.querySelectorAll(".spend-club-action").forEach(button => {
    button.addEventListener("click", () => {
      const idx = +button.dataset.clubIndex;
      const club = topClubs[idx]?.club;
      if (!club) return;
      focusClubAllTime(club);
    });
  });
}

function focusClubAllTime(clubName) {
  stopPlayback();
  state.selectedPlayerId = null;
  state.leagues = new Set(Object.keys(LEAGUE_LABELS));
  state.windows = new Set(["s", "w"]);
  state.moveTypes = new Set(["transfer", "loan", "free", "loan_end"]);
  state.animateOverview = true;
  if (els.toggleAnimation) els.toggleAnimation.checked = true;
  state.playbackIndex = null;
  state.playbackPaused = false;
  state.selectedClubName = clubName;
  els.seasonSlider.value = state.season;
  els.seasonValue.textContent = state.season;
  update();
  if (els.mapTitle) {
    const y = window.scrollY + els.mapTitle.getBoundingClientRect().top - 96;
    window.scrollTo({top: Math.max(0, y), behavior: "smooth"});
  }
}

function syncButtonStates() {
  els.windowButtons.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", state.windows.has(button.dataset.key));
  });
  els.moveTypeButtons.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", state.moveTypes.has(button.dataset.key));
  });
  els.featuredPlayers.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", +button.dataset.playerId === state.selectedPlayerId);
  });
  els.leaguePills?.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", state.leagues.has(button.dataset.league));
  });
  if (els.playCareer) {
    els.playCareer.disabled = !state.selectedPlayerId;
  }
  if (els.careerScrubber) {
    els.careerScrubber.disabled = !state.selectedPlayerId;
  }
  els.resetPlayer.hidden = !(state.selectedPlayerId || state.selectedClubName);
}

function updateCareerScrubber(selectedPlayer, allRows, visibleRows) {
  if (!els.careerScrubber || !els.careerScrubberValue) return;
  if (!selectedPlayer || !allRows.length) {
    els.careerScrubber.min = "1";
    els.careerScrubber.max = "1";
    els.careerScrubber.value = "1";
    els.careerScrubberValue.textContent = "Move 0 / 0";
    return;
  }

  const total = allRows.length;
  const current = state.playbackIndex != null ? state.playbackIndex + 1 : Math.max(1, Math.min(total, visibleRows.length));
  els.careerScrubber.min = "1";
  els.careerScrubber.max = String(total);
  els.careerScrubber.value = String(clamp(current, 1, total));
  els.careerScrubberValue.textContent = `Move ${clamp(current, 1, total)} / ${total}`;
}

function filteredSeasonRows() {
  return data.filter(d => (
    d.season === state.season &&
    state.leagues.has(d.league) &&
    state.windows.has(d.window) &&
    state.moveTypes.has(d.move_type)
  ));
}

function playerJourneyRows(playerId) {
  return data
    .filter(d => (
      d.player_id === playerId &&
      state.leagues.has(d.league) &&
      state.windows.has(d.window) &&
      state.moveTypes.has(d.move_type)
    ))
    .sort((a, b) =>
      d3.ascending(a.season, b.season) ||
      d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
      d3.ascending(a.career_move_no || 0, b.career_move_no || 0)
    );
}

function clubAllTimeRows(clubName) {
  return data
    .filter(d => (
      (d.from_team_name === clubName || d.to_team_name === clubName) &&
      state.leagues.has(d.league) &&
      state.windows.has(d.window) &&
      state.moveTypes.has(d.move_type)
    ))
    .sort((a, b) =>
      d3.ascending(a.season, b.season) ||
      d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
      d3.ascending(a.transfer_id || 0, b.transfer_id || 0)
    );
}

function limitForMap(rows) {
  const lineCap = 210;
  let limited = rows;

  if (limited.length > lineCap) {
    limited = [...limited]
      .sort((a, b) =>
        d3.descending(a.transfer_fee_amnt || 0, b.transfer_fee_amnt || 0) ||
        d3.descending(a.market_val_amnt || 0, b.market_val_amnt || 0)
      )
      .slice(0, lineCap);
  }

  return limited;
}

function updateHeader(selectedPlayer, selectedClub, seasonRows, visibleRows) {
  const focus = selectedPlayer ? "Player spotlight" : (selectedClub ? "Club all-time" : "League pulse");
  const title = selectedPlayer
    ? `${selectedPlayer.player_name} · career through ${state.season}`
    : selectedClub
      ? `${selectedClub} · all-time transfers (2009–2021)`
    : `${focus} · ${state.season}`;
  els.mapTitle.textContent = title;
  els.focusModeLabel.textContent = focus;

  if (selectedPlayer) {
    const currentMove = visibleRows.at(-1);
    const reaches = currentMove ? `${currentMove.to_team_name} in ${currentMove.season}` : "no revealed destination yet";
    els.storyline.textContent = `${selectedPlayer.player_name}'s route is revealed one move at a time. Press play to follow the journey club by club: the map stays with the player, each move draws outward, and the timeline appears beside the animation.`;
    els.mapInsight.textContent = visibleRows.length
      ? `${selectedPlayer.player_name} has ${visibleRows.length} visible move${visibleRows.length === 1 ? "" : "s"} so far, currently reaching ${reaches}.`
      : `Move the slider or press play to reveal ${selectedPlayer.player_name}'s path.`;
  } else if (selectedClub) {
    const countriesTouched = new Set(visibleRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)).size;
    const playersTouched = new Set(visibleRows.map(d => d.player_id)).size;
    els.storyline.textContent = `${selectedClub} is now in all-time view. This map shows every mapped transfer involving the club from 2009 to 2021, including both arrivals and departures.`;
    els.mapInsight.textContent = `${formatNumber(visibleRows.length)} mapped transfers involving ${selectedClub}, across ${formatNumber(playersTouched)} players and ${countriesTouched} countries.`;
  } else {
    const countriesTouched = new Set(seasonRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)).size;
    const leagueCount = state.leagues.size;
    els.storyline.textContent = `This Football Transfers Tracker focuses on Europe's seven major leagues and maps transfer records from 2009 to 2021. Use Transfer Filters and League Quick Picks for league pulse, Career Explorer for player journeys, and the spending view for club all-time transfer maps.`;
    els.mapInsight.textContent = `${formatNumber(seasonRows.length)} matched moves satisfy the current filters across ${leagueCount} selected league${leagueCount === 1 ? "" : "s"}, connecting ${countriesTouched} countries in this season.`;
  }
}

function updateStats(selectedPlayer, selectedClub, seasonRows, visibleRows) {
  let stats = [];
  if (selectedPlayer) {
    const clubs = Array.from(new Set(visibleRows.flatMap(d => [d.from_team_name, d.to_team_name]).filter(Boolean)));
    const countries = Array.from(new Set(visibleRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)));
    const peakValue = d3.max(visibleRows, d => d.market_val_amnt) || 0;
    const totalFees = d3.sum(visibleRows, d => d.transfer_fee_amnt || 0);
    stats = [
      {label: "Moves revealed", value: formatNumber(visibleRows.length), sub: `${selectedPlayer.journey_moves} mapped across the full dataset`},
      {label: "Club stops", value: formatNumber(clubs.length), sub: `${countries.length} countries touched so far`},
      {label: "Journey distance", value: formatDistance(selectedPlayer.journey_distance_km || 0), sub: "Approximate route distance from matched club locations"},
      {label: "Peak market value", value: formatMoneyCompact(peakValue), sub: totalFees > 0 ? `${formatMoneyCompact(totalFees)} in disclosed fees along shown moves` : "Fees are often undisclosed in this slice"}
    ];

    els.filterSummary.textContent = `${selectedPlayer.player_name} is listed as ${selectedPlayer.player_pos} for ${selectedPlayer.player_nation}. Hover a route to see its season, move type, and fee/value context.`;
  } else if (selectedClub) {
    const players = new Set(visibleRows.map(d => d.player_id)).size;
    const countries = Array.from(new Set(visibleRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)));
    const clubs = Array.from(new Set(visibleRows.flatMap(d => [d.from_team_name, d.to_team_name]).filter(Boolean)));
    const incoming = visibleRows.filter(d => d.to_team_name === selectedClub).length;
    const outgoing = visibleRows.filter(d => d.from_team_name === selectedClub).length;
    const disclosedFees = visibleRows.filter(d => d.transfer_fee_amnt).length;
    const totalFees = d3.sum(visibleRows, d => d.transfer_fee_amnt || 0);

    stats = [
      {label: "All-time moves", value: formatNumber(visibleRows.length), sub: "Mapped transfers involving this club from 2009–2021"},
      {label: "Incoming vs outgoing", value: `${formatNumber(incoming)} / ${formatNumber(outgoing)}`, sub: "Arrivals at club / departures from club"},
      {label: "Players involved", value: formatNumber(players), sub: `${clubs.length} connected clubs across ${countries.length} countries`},
      {label: "Disclosed fees", value: disclosedFees ? formatMoneyCompact(totalFees) : "Mostly undisclosed", sub: `${formatNumber(disclosedFees)} moves include a fee amount`}
    ];

    els.filterSummary.textContent = `${selectedClub} is in all-time spotlight mode. Press “Reset Spotlight to League Transfers” to return to season-based league pulse mode.`;
  } else {
    const countries = Array.from(new Set(seasonRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)));
    const clubs = Array.from(new Set(seasonRows.flatMap(d => [d.from_team_name, d.to_team_name]).filter(Boolean)));
    const avgAge = d3.mean(seasonRows, d => d.player_age);
    const disclosedFees = seasonRows.filter(d => d.transfer_fee_amnt).length;
    const totalFees = d3.sum(seasonRows, d => d.transfer_fee_amnt || 0);
    const lineCap = 210;
    const mappedSub = seasonRows.length > lineCap
        ? `Top ${lineCap} routes drawn for readability`
        : "Every matched route is shown";

    stats = [
      {label: "Mapped moves", value: formatNumber(seasonRows.length), sub: mappedSub},
      {label: "Clubs touched", value: formatNumber(clubs.length), sub: `${countries.length} countries connected in this slice`},
      {label: "Average age", value: avgAge ? `${avgAge.toFixed(1)} yrs` : "—", sub: "Across all visible positions"},
      {label: "Disclosed fees", value: disclosedFees ? formatMoneyCompact(totalFees) : "Mostly undisclosed", sub: `${formatNumber(disclosedFees)} routes list a fee amount`}
    ];

    const windowLabel = state.windows.size === 2
      ? "both windows"
      : state.windows.has("s")
        ? "the summer window"
        : "the winter window";
    const selectedLeagues = Array.from(state.leagues).map(code => LEAGUE_LABELS[code] || code);
    const leagueSummary = selectedLeagues.length === Object.keys(LEAGUE_LABELS).length
      ? "all tracked leagues"
      : selectedLeagues.join(", ");
    const moveSummary = state.moveTypes.size === 4
      ? "all move types"
      : Array.from(state.moveTypes).map(type => MOVE_TYPE_LABELS[type] || type).join(", ");
    els.filterSummary.textContent = `Right now you are looking at ${windowLabel} in ${state.season}, filtered to ${leagueSummary} and ${moveSummary}. Use pan and zoom to inspect where long-distance routes leave the core seven-league market.`;
  }

  els.statsGrid.innerHTML = stats.map(stat => `
    <div class="stat-card">
      <div class="label">${stat.label}</div>
      <div class="value">${stat.value}</div>
      <div class="sub">${stat.sub}</div>
    </div>
  `).join("");
}

function updatePlaybackTimeline(selectedPlayer, visibleRows, allRows) {
  if (!els.playbackTimelineOverlay || !els.timelineDock) return;
  const showCareerTimeline = !!selectedPlayer;

  if (!showCareerTimeline || !allRows.length) {
    els.playbackTimelineOverlay.hidden = true;
    els.playbackTimelineOverlay.style.display = "none";
    els.playbackTimelineOverlay.classList.remove("is-active");
    els.timelineDock.hidden = true;
    els.timelineDock.style.display = "none";
    els.playbackTimelineOverlay.innerHTML = "";
    els.timelineDock.innerHTML = "";
    return;
  }

  const rows = allRows.slice().sort((a, b) =>
    d3.ascending(a.season, b.season) ||
    d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
    d3.ascending(a.career_move_no || 0, b.career_move_no || 0)
  );

  const visibleKeys = new Set(visibleRows.map(routeKey));
  const currentKey = state.playbackIndex != null && rows[state.playbackIndex] ? routeKey(rows[state.playbackIndex]) : null;
  const isProgressiveTimeline = state.playingMode === "career" || state.playbackPaused || state.playbackIndex != null;
  const overlayRows = (isProgressiveTimeline ? rows.filter(d => visibleKeys.has(routeKey(d))) : rows).slice().reverse();

  const itemHtml = d => `
    <div class="timeline-item ${visibleKeys.has(routeKey(d)) ? 'is-revealed' : ''} ${routeKey(d) === currentKey ? 'is-current' : ''} ${d.move_type}">
      <div class="timeline-pill ${d.move_type}">${MOVE_TYPE_LABELS[d.move_type] || d.move_type}</div>
      <div class="timeline-main">
        <strong>Move ${d.career_move_no || 0} · ${d.season}${d.window_label ? ` · ${d.window_label}` : ""}</strong>
        <span>${d.from_team_name} → ${d.to_team_name}</span>
        ${timelineFeeText(d) ? `<span class="timeline-fee">${timelineFeeText(d)}</span>` : ""}
      </div>
    </div>
  `;

  els.playbackTimelineOverlay.hidden = false;
  els.playbackTimelineOverlay.style.display = "grid";
  els.playbackTimelineOverlay.classList.add("is-active");
  els.playbackTimelineOverlay.innerHTML = `
    <div class="timeline-overlay-header">
      <span class="mini-label">Career timeline</span>
      <strong>${selectedPlayer.player_name}</strong>
    </div>
    <div class="timeline-overlay-list">
      ${overlayRows.map(itemHtml).join("")}
    </div>
  `;
  if (state.playing) {
    const listEl = els.playbackTimelineOverlay.querySelector(".timeline-overlay-list");
    if (listEl) listEl.scrollTop = 0;
  }
  els.timelineDock.hidden = true;
  els.timelineDock.style.display = "none";
  els.timelineDock.innerHTML = "";
}

function drawMap(rows, selectedPlayer, totalVisibleRows) {
  countryLayer.style("display", state.showMap ? null : "none");
  routeLayer.selectAll("*").remove();
  pointLayer.selectAll("*").remove();
  labelLayer.selectAll("*").remove();

  if (!rows.length) {
    labelLayer.append("text")
      .attr("class", "empty-state")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .text("No mapped routes for this filter. Try another season, move type, or player.");
    return;
  }

  const latestVisible = selectedPlayer && rows.length ? rows[rows.length - 1] : null;

  const routeData = rows.map(d => ({
    ...d,
    key: routeKey(d),
    projectedFrom: projection([d.from_longitude, d.from_latitude]),
    projectedTo: projection([d.to_longitude, d.to_latitude]),
    isLatest: latestVisible ? routeKey(d) === routeKey(latestVisible) : false
  })).filter(d => d.projectedFrom && d.projectedTo);

  const feeExtent = d3.extent(routeData, d => d.transfer_fee_amnt || d.market_val_amnt || 0);
  const widthScale = d3.scaleSqrt().domain([feeExtent[0] || 0, feeExtent[1] || 1]).range([0.55, selectedPlayer ? 0.95 : 0.78]);

  const groups = routeLayer.selectAll("g.route-group")
    .data(routeData, d => d.key)
    .join(enter => {
      const g = enter.append("g").attr("class", "route-group");
      g.append("path").attr("class", "route-base");
      g.append("path").attr("class", "route-flow");
      g.append("path").attr("class", "route-hover");
      g.append("path").attr("class", "route-progress");
      g.append("path").attr("class", "route-hit");
      return g;
    })
    .attr("data-key", d => d.key)
    .each(function(d) {
      const g = d3.select(this);
      const pathD = curveBetween(d.projectedFrom, d.projectedTo);
      const widthValue = widthScale(d.transfer_fee_amnt || d.market_val_amnt || 0);
      const moveColor = MOVE_COLORS[d.move_type] || "#52f4ff";
      g.select("path.route-base")
        .attr("d", pathD)
        .attr("stroke-width", widthValue)
        .attr("opacity", selectedPlayer ? 0.55 : 0.42);
      g.select("path.route-flow")
        .attr("d", pathD)
        .attr("stroke-width", Math.max(0.9, widthValue * 1.08))
        .attr("class", `route-flow ${selectedPlayer ? 'is-spotlight-flow' : ''}`)
        .style("stroke", moveColor)
        .style("filter", selectedPlayer ? `drop-shadow(0 0 8px ${hexToRgba(moveColor, 0.24)})` : "none")
        .attr("opacity", d.isLatest && state.playing && selectedPlayer ? 0 : 0.75);
      g.select("path.route-hover")
        .attr("d", pathD)
        .attr("stroke", moveColor)
        .attr("stroke-width", Math.max(1.35, widthValue + 0.7));
      g.select("path.route-progress")
        .attr("d", pathD)
        .style("stroke", moveColor)
        .style("filter", `drop-shadow(0 0 8px ${hexToRgba(moveColor, 0.26)})`)
        .attr("stroke-width", Math.max(1.55, widthValue + 0.85))
        .attr("opacity", 0);
      g.select("path.route-hit")
        .attr("d", pathD)
        .attr("stroke-width", selectedPlayer ? 13 : 11);
    })
    .on("mouseenter", function(event, d) {
      d3.select(this).classed("is-hovered", true);
      showTooltip(event, routeTooltipHtml(d));
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", function() {
      d3.select(this).classed("is-hovered", false);
      hideTooltip();
    });

  routeLayer.style("display", state.showLines ? null : "none");

  groups.each(function(d) {
    const flow = d3.select(this).select("path.route-flow");
    const length = flow.node().getTotalLength();
    if (selectedPlayer || state.animateOverview) {
      flow
        .attr("stroke-dasharray", `18 ${Math.max(90, length)}`)
        .style("animation-name", "subtleFlow")
        .style("animation-duration", `${Math.max(4.2, Math.min(8, length / 70))}s`);
    } else {
      flow
        .attr("stroke-dasharray", null)
        .style("animation-name", "none")
        .style("animation-duration", null)
        .style("stroke-dashoffset", null);
    }
  });

  if (state.showHotspots) {
    if (selectedPlayer) {
      drawSpotlightStops(routeData);
    } else {
      drawOverviewHotspots(routeData);
    }
  }

  applyZoomResponsiveSizing(currentZoomK);
}

function drawOverviewHotspots(routeData) {
  const grouped = d3.rollups(
    routeData,
    values => ({
      team: values[0].to_team_name,
      country: values[0].to_team_country,
      coords: values[0].projectedTo,
      count: values.length,
      types: d3.rollups(values, v => v.length, d => d.move_type).sort((a, b) => d3.descending(a[1], b[1]))
    }),
    d => `${d.to_team_name}|${d.to_longitude}|${d.to_latitude}`
  ).map(([, value]) => value);

  const radius = d3.scaleSqrt().domain([1, d3.max(grouped, d => d.count) || 1]).range([5.2, 13.2]);
  grouped.forEach(d => { d.baseScreenRadius = radius(d.count); });

  pointLayer.selectAll("circle.club-dot")
    .data(grouped)
    .join("circle")
    .attr("class", "club-dot hotspot")
    .attr("cx", d => d.coords[0])
    .attr("cy", d => d.coords[1])
    .attr("r", d => (d.baseScreenRadius || radius(d.count)))
    .on("mouseenter", (event, d) => showTooltip(event, hotspotTooltipHtml(d)))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);
}

function drawSpotlightStops(routeData) {
  const ordered = routeData.slice().sort((a, b) =>
    d3.ascending(a.season, b.season) ||
    d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
    d3.ascending(a.career_move_no || 0, b.career_move_no || 0)
  );

  const stops = [];
  if (ordered.length) {
    stops.push({
      key: `start-${ordered[0].player_id}`,
      team: ordered[0].from_team_name,
      country: ordered[0].from_team_country,
      coords: ordered[0].projectedFrom,
      moveNo: 0,
      season: ordered[0].season,
      isStart: true
    });
  }

  ordered.forEach(d => {
    stops.push({
      key: routeKey(d),
      team: d.to_team_name,
      country: d.to_team_country,
      coords: d.projectedTo,
      moveNo: d.career_move_no || 0,
      season: d.season,
      isStart: false,
      moveType: d.move_type,
      transferFeeAmnt: d.transfer_fee_amnt,
      isLatest: d.isLatest
    });
  });

  const adjustedStops = nudgeStops(stops).map(d => ({
    ...d,
    baseScreenDotR: d.isStart ? 5.8 : 7.2,
    baseScreenBadgeR: d.isStart ? 15.8 : 17.2,
    baseScreenFontSize: 15.2
  }));

  const stopGroups = pointLayer.selectAll("g.stop-group")
    .data(adjustedStops)
    .join("g")
    .attr("class", "stop-group")
    .attr("data-key", d => d.key)
    .attr("transform", d => `translate(${d.coords[0] + (d.offsetX || 0) / currentZoomK},${d.coords[1] + (d.offsetY || 0) / currentZoomK})`)
    .on("mouseenter", (event, d) => showTooltip(event, spotlightStopTooltipHtml(d)))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);

  stopGroups.append("circle")
    .attr("class", d => `club-dot ${d.isStart ? 'is-start' : 'is-end'}`)
    .attr("r", d => d.baseScreenDotR);

  stopGroups.append("circle")
    .attr("class", "stop-badge")
    .attr("r", d => d.baseScreenBadgeR);

  stopGroups.append("text")
    .attr("class", "route-order")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("dy", "0.03em")
    .style("font-size", d => `${d.baseScreenFontSize}px`)
    .text(d => d.moveNo);
}

function nudgeStops(stops) {
  const byCell = d3.groups(stops, d => `${Math.round(d.coords[0] / 8)}|${Math.round(d.coords[1] / 8)}`);
  const adjusted = [];
  byCell.forEach(([, items]) => {
    items.forEach((item, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(items.length, 1);
      const radius = items.length > 1 ? 6 + (i % 2) * 3 : 0;
      adjusted.push({
        ...item,
        offsetX: Math.cos(angle) * radius,
        offsetY: Math.sin(angle) * radius
      });
    });
  });
  return adjusted;
}

function screenSize(base, k, exponent, min, max = base) {
  return clamp(base / Math.pow(Math.max(k, 1), exponent), min, max);
}


function applyZoomResponsiveSizing(k = 1) {
  pointLayer.selectAll("circle.club-dot.hotspot")
    .attr("r", d => desiredScreenRadius(d.baseScreenRadius || 6.2, k, 4.0, 1.95, 0.24) / k)
    .attr("stroke-width", desiredScreenStroke(0.9, k, 0.35, 0.08) / k);

  pointLayer.selectAll("g.stop-group")
    .attr("transform", d => `translate(${d.coords[0] + (d.offsetX || 0) / Math.pow(k, 0.88)},${d.coords[1] + (d.offsetY || 0) / Math.pow(k, 0.88)})`);

  pointLayer.selectAll("g.stop-group circle.club-dot.is-start")
    .attr("r", d => desiredScreenRadius(d.baseScreenDotR || 5.2, k, 4.4, 1.32, 0.18) / k);

  pointLayer.selectAll("g.stop-group circle.club-dot.is-end")
    .attr("r", d => desiredScreenRadius(d.baseScreenDotR || 7.2, k, 5.8, 1.36, 0.18) / k);

  pointLayer.selectAll("g.stop-group circle.stop-badge")
    .attr("r", d => desiredScreenRadius(d.baseScreenBadgeR || 17.2, k, 13.8, 1.28, 0.11) / k)
    .attr("stroke-width", desiredScreenStroke(1.45, k, 0.88, 0.12) / k);

  pointLayer.selectAll("g.stop-group text.route-order")
    .style("font-size", d => `${desiredScreenFont(d.baseScreenFontSize || 15.2, k, 12.2, 1.16, 0.1) / k}px`)
    .attr("dy", "0.03em");
}

function desiredScreenRadius(base, k, min = 2, outBoost = 1.4, exponent = 0.22) {
  const desired = base * outBoost / Math.pow(Math.max(k, 1), exponent);
  return clamp(desired, min, base * outBoost);
}

function desiredScreenFont(base, k, min = 6, outBoost = 1.1, exponent = 0.14) {
  const desired = base * outBoost / Math.pow(Math.max(k, 1), exponent);
  return clamp(desired, min, base * outBoost);
}

function desiredScreenStroke(base, k, min = 0.5, exponent = 0.16) {
  const desired = base / Math.pow(Math.max(k, 1), exponent);
  return clamp(desired, min, base);
}

function curveBetween(start, end) {
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const norm = Math.max(distance, 1);
  const curve = Math.min(56, 12 + distance * 0.1);
  const cx = mx - (dy / norm) * curve;
  const cy = my + (dx / norm) * curve;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

function routeKey(d) {
  return `${d.player_id}-${d.transfer_id}-${d.career_move_no || 0}-${d.season}-${d.from_team_name}-${d.to_team_name}`;
}

function routeTooltipHtml(d) {
  return `
    <div class="kicker">${d.season} · ${d.window_label}</div>
    <strong>${d.player_name}</strong>
    ${d.from_team_name} → ${d.to_team_name}<br/>
    ${MOVE_TYPE_LABELS[d.move_type] || d.move_type}${d.player_pos ? ` · ${d.player_pos}` : ""}<br/>
    ${d.transfer_fee_amnt ? `Fee: ${formatMoneyCompact(d.transfer_fee_amnt)}` : d.market_val_amnt ? `Market value: ${formatMoneyCompact(d.market_val_amnt)}` : "Fee undisclosed"}
  `;
}

function hotspotTooltipHtml(d) {
  const dominant = d.types[0];
  return `
    <div class="kicker">Destination hotspot</div>
    <strong>${d.team}</strong>
    ${d.country || "Country unavailable"}<br/>
    ${d.count} visible route${d.count === 1 ? "" : "s"} end here in this slice<br/>
    Most common move type: ${MOVE_TYPE_LABELS[dominant?.[0]] || "Transfer"}
  `;
}

function spotlightStopTooltipHtml(d) {
  const feeText = stopFeeText(d);
  return `
    <div class="kicker">${d.isStart ? "Starting point" : `Move ${d.moveNo}`}</div>
    <strong>${d.team}</strong>
    ${d.country || "Country unavailable"}${d.season ? `<br/>Reached in ${d.season}` : ""}${feeText ? `<br/>${feeText}` : ""}
  `;
}

function timelineFeeText(d) {
  if (!d || !Number.isFinite(d.transfer_fee_amnt) || d.transfer_fee_amnt <= 0) return "";
  if (d.move_type === "loan") return `Loan fee: ${formatMoneyCompact(d.transfer_fee_amnt)}`;
  if (d.move_type === "transfer") return `Transfer fee: ${formatMoneyCompact(d.transfer_fee_amnt)}`;
  return "";
}

function stopFeeText(d) {
  if (!d || !Number.isFinite(d.transferFeeAmnt) || d.transferFeeAmnt <= 0) return "";
  if (d.moveType === "loan") return `Loan fee: ${formatMoneyCompact(d.transferFeeAmnt)}`;
  if (d.moveType === "transfer") return `Transfer fee: ${formatMoneyCompact(d.transferFeeAmnt)}`;
  return "";
}

function showTooltip(event, html) {
  els.tooltip.hidden = false;
  els.tooltip.classList.remove("is-playback-focus");
  els.tooltip.innerHTML = html;
  moveTooltip(event);
}

function moveTooltip(event) {
  const bounds = els.mapWrap.getBoundingClientRect();
  els.tooltip.style.left = `${event.clientX - bounds.left}px`;
  els.tooltip.style.top = `${event.clientY - bounds.top}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
  els.tooltip.classList.remove("is-playback-focus");
}

function showPlaybackCaption(move, phase = "arrival") {
  if (!els.playbackCaption) return;
  const text = playbackCaptionText(move, phase);
  if (captionHideTimer) {
    window.clearTimeout(captionHideTimer);
    captionHideTimer = null;
  }
  els.playbackCaption.hidden = false;
  els.playbackCaption.classList.remove("is-visible");
  els.playbackCaption.innerHTML = `<div class="playback-caption-text">${text}</div>`;
  void els.playbackCaption.offsetWidth;
  els.playbackCaption.classList.add("is-visible");
}

function hidePlaybackCaption() {
  if (!els.playbackCaption) return;
  els.playbackCaption.classList.remove("is-visible");
  if (captionHideTimer) {
    window.clearTimeout(captionHideTimer);
  }
  captionHideTimer = window.setTimeout(() => {
    if (!els.playbackCaption) return;
    els.playbackCaption.hidden = true;
    els.playbackCaption.innerHTML = "";
    captionHideTimer = null;
  }, 720);
}

function hardHidePlaybackCaption() {
  if (!els.playbackCaption) return;
  if (captionHideTimer) {
    window.clearTimeout(captionHideTimer);
    captionHideTimer = null;
  }
  els.playbackCaption.classList.remove("is-visible");
  els.playbackCaption.hidden = true;
  els.playbackCaption.innerHTML = "";
}

function playbackCaptionText(move, phase = "arrival") {
  const season = move.season || "";
  const country = move.to_team_country || move.from_team_country || "Unknown country";

  if (phase === "origin") {
    return `Starting at ${move.from_team_name}, ${move.from_team_country || "Unknown country"} in ${season}.`;
  }

  const verb = move.move_type === "loan"
    ? "Loaned to"
    : move.move_type === "free"
      ? "Joined"
      : move.move_type === "loan_end"
        ? "Returned to"
        : "Transferred to";

  return `${verb} ${move.to_team_name}, ${country} in ${season}.`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function famousBoost(name) {
  const famous = new Set([
    "cristiano ronaldo", "zlatan ibrahimovic", "romelu lukaku", "alvaro morata", "gonzalo higuain",
    "alexis sanchez", "wayne rooney", "gareth bale", "edinson cavani", "angel di maria"
  ]);
  return famous.has(normalizeSearchText(name)) ? 10 : 0;
}

function hexToRgba(hex, alpha = 1) {
  const value = String(hex || "").replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map(ch => ch + ch).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(82,244,255,${alpha})`;
  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatNumber(value) {
  return d3.format(",")(value || 0);
}

function formatMoneyCompact(value) {
  if (!value) return "—";
  if (value >= 1e9) return `€${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `€${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `€${(value / 1e3).toFixed(0)}K`;
  return `€${value}`;
}

function formatDistance(value) {
  if (!value) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k km`;
  return `${Math.round(value)} km`;
}

function windowOrder(windowCode) {
  return windowCode === "s" ? 0 : windowCode === "w" ? 1 : 2;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
