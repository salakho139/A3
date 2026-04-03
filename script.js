
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
  season: 2016,
  league: "ALL",
  position: "ALL",
  window: "ALL",
  moveType: "ALL",
  selectedPlayerId: null,
  playing: false,
  playbackIndex: null,
  playToken: 0,
  overviewTimer: null
};

const els = {
  playerSearch: document.getElementById("player-search"),
  playerSuggestionBox: document.getElementById("player-suggestion-box"),
  featuredPlayers: document.getElementById("featured-players"),
  seasonSlider: document.getElementById("season-slider"),
  seasonValue: document.getElementById("season-value"),
  playToggle: document.getElementById("play-toggle"),
  leagueSelect: document.getElementById("league-select"),
  positionSelect: document.getElementById("position-select"),
  windowButtons: document.getElementById("window-buttons"),
  moveTypeButtons: document.getElementById("move-type-buttons"),
  statsGrid: document.getElementById("stats-grid"),
  filterSummary: document.getElementById("filter-summary"),
  listContainer: document.getElementById("list-container"),
  listTitle: document.getElementById("list-title"),
  mapTitle: document.getElementById("map-title"),
  mapInsight: document.getElementById("map-insight"),
  storyline: document.getElementById("storyline"),
  focusModeLabel: document.getElementById("focus-mode-label"),
  resetPlayer: document.getElementById("reset-player"),
  tooltip: document.getElementById("tooltip"),
  mapWrap: document.getElementById("map-wrap"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomReset: document.getElementById("zoom-reset"),
  playbackTimelineOverlay: document.getElementById("playback-timeline-overlay"),
  timelineDock: document.getElementById("timeline-dock")
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
  state.season = 2016 >= seasons[0] && 2016 <= seasons[1] ? 2016 : seasons[0];
  els.seasonSlider.min = seasons[0];
  els.seasonSlider.max = seasons[1];
  els.seasonSlider.value = state.season;
  els.seasonValue.textContent = state.season;

  const leagueOptions = ["ALL", ...Array.from(new Set(data.map(d => d.league))).sort((a, b) => (LEAGUE_LABELS[a] || a).localeCompare(LEAGUE_LABELS[b] || b))];
  els.leagueSelect.innerHTML = leagueOptions
    .map(value => `<option value="${value}">${value === "ALL" ? "All leagues" : LEAGUE_LABELS[value] || value}</option>`)
    .join("");

  const topPositions = Array.from(
    d3.rollups(data, values => values.length, d => d.player_pos)
      .sort((a, b) => d3.descending(a[1], b[1]))
      .slice(0, 10),
    d => d[0]
  );

  els.positionSelect.innerHTML = ["ALL", ...topPositions]
    .map(value => `<option value="${value}">${value === "ALL" ? "All positions" : value}</option>`)
    .join("");

  buildSegmentedButtons(els.windowButtons, [
    {key: "ALL", label: "All"},
    {key: "s", label: "Summer"},
    {key: "w", label: "Winter"}
  ], "window");

  buildSegmentedButtons(els.moveTypeButtons, [
    {key: "ALL", label: "All"},
    {key: "transfer", label: "Transfer"},
    {key: "loan", label: "Loan"},
    {key: "free", label: "Free"},
    {key: "loan_end", label: "Loan end"}
  ], "moveType");

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

    if (state.selectedPlayerId) {
      await startPlayerPlayback();
    } else {
      startOverviewPlayback();
    }
  });

  els.leagueSelect.addEventListener("change", event => {
    stopPlayback();
    state.league = event.target.value;
    update();
  });

  els.positionSelect.addEventListener("change", event => {
    stopPlayback();
    state.position = event.target.value;
    update();
  });

  els.resetPlayer.addEventListener("click", () => {
    stopPlayback();
    state.selectedPlayerId = null;
    state.playbackIndex = null;
    els.playerSearch.value = "";
    update();
  });

  els.playerSearch.value = "";
}

function initSearch() {
  const suggestionBox = els.playerSuggestionBox;
  if (!els.playerSearch || !suggestionBox) return;

  els.playerSearch.addEventListener("input", () => {
    const query = els.playerSearch.value.trim();
    if (!query) {
      hideSuggestions();
      return;
    }
    suggestionResults = searchPlayers(query).slice(0, 8);
    renderSuggestions(query, suggestionResults);
  });

  els.playerSearch.addEventListener("focus", () => {
    const query = els.playerSearch.value.trim();
    if (query) {
      suggestionResults = searchPlayers(query).slice(0, 8);
      renderSuggestions(query, suggestionResults);
    }
  });

  els.playerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const query = els.playerSearch.value.trim();
      const choice = suggestionResults[0] || searchPlayers(query)[0];
      if (choice) {
        selectPlayer(choice.player_id);
      } else {
        hideSuggestions();
      }
    } else if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  els.playerSearch.addEventListener("blur", () => {
    window.setTimeout(hideSuggestions, 120);
  });

  suggestionBox.addEventListener("mousedown", (event) => {
    const item = event.target.closest("button[data-player-id]");
    if (!item) return;
    event.preventDefault();
    selectPlayer(+item.dataset.playerId);
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

  els.featuredPlayers.innerHTML = picks.map(player => `
    <button class="feature-chip" type="button" data-player-id="${player.player_id}">
      <span>${player.player_name}</span>
      <small>${player.player_nation} · ${player.player_pos}</small>
    </button>
  `).join("");

  els.featuredPlayers.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => selectPlayer(+button.dataset.playerId));
  });
}


function searchPlayers(query) {
  const q = normalizeSearchText(query);
  if (!q) return [];

  return searchablePlayers
    .map(player => {
      const name = normalizeSearchText(player.player_name);
      const starts = name.startsWith(q);
      const includes = name.includes(q);
      const lastWordStarts = name.split(" ").some(part => part.startsWith(q));
      const score =
        (starts ? 100 : 0) +
        (lastWordStarts ? 70 : 0) +
        (includes ? 40 : 0) +
        famousBoost(player.player_name) * 8 +
        Math.min(player.journey_moves, 10);
      return {player, score};
    })
    .filter(d => d.score > 0)
    .sort((a, b) => d3.descending(a.score, b.score) || a.player.player_name.localeCompare(b.player.player_name))
    .map(d => d.player);
}

function renderSuggestions(query, matches) {
  if (!els.playerSuggestionBox) return;
  const q = normalizeSearchText(query);
  if (!q) {
    hideSuggestions();
    return;
  }

  if (!matches.length) {
    els.playerSuggestionBox.innerHTML = `<div class="suggestion-empty">No player found in this dataset for “${escapeHtml(query)}”.</div>`;
    els.playerSuggestionBox.hidden = false;
    return;
  }

  els.playerSuggestionBox.innerHTML = matches.map(player => `
    <button class="suggestion-item" type="button" data-player-id="${player.player_id}">
      <strong>${player.player_name}</strong>
      <span>${player.player_nation} · ${player.player_pos} · ${player.journey_moves} mapped move${player.journey_moves === 1 ? "" : "s"}</span>
    </button>
  `).join("");
  els.playerSuggestionBox.hidden = false;
}

function hideSuggestions() {
  if (!els.playerSuggestionBox) return;
  els.playerSuggestionBox.hidden = true;
}

function selectPlayer(playerId) {
  stopPlayback();
  state.selectedPlayerId = playerId;
  state.playbackIndex = null;
  const player = searchablePlayers.find(d => d.player_id === playerId);
  els.playerSearch.value = player?.player_name || "";
  hideSuggestions();
  update();
}

function buildSegmentedButtons(container, buttons, stateKey) {
  container.innerHTML = buttons.map(button => `
    <button type="button" data-key="${button.key}" data-state-key="${stateKey}" ${button.key !== "ALL" ? `data-type="${button.key}"` : ""}>
      ${button.label}
    </button>
  `).join("");

  container.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      stopPlayback();
      state[stateKey] = button.dataset.key;
      update();
    });
  });
}

function stopPlayback() {
  state.playToken += 1;
  state.playing = false;
  state.playbackIndex = null;
  els.playToggle.classList.remove("is-active");
  els.playToggle.textContent = "Play seasons";
  if (state.overviewTimer) {
    window.clearInterval(state.overviewTimer);
    state.overviewTimer = null;
  }
}

function startOverviewPlayback() {
  stopPlayback();
  state.playing = true;
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

async function startPlayerPlayback() {
  const player = searchablePlayers.find(d => d.player_id === state.selectedPlayerId);
  if (!player) return;

  stopPlayback();
  state.playing = true;
  els.playToggle.classList.add("is-active");
  els.playToggle.textContent = "Pause";
  const token = ++state.playToken;

  const rows = playerJourneyRows(player.player_id);
  if (!rows.length) {
    stopPlayback();
    update();
    return;
  }

  for (let i = 0; i < rows.length; i += 1) {
    if (token !== state.playToken) return;

    state.playbackIndex = i;
    state.season = rows[i].season;
    els.seasonSlider.value = state.season;
    els.seasonValue.textContent = state.season;
    update();
    await sleep(80);
    if (token !== state.playToken) return;
    await animateCurrentTransfer(rows[i], token, {
      isFirstMove: i === 0,
      isLastMove: i === rows.length - 1
    });
    if (token !== state.playToken) return;
    await sleep(220);
  }

  if (token !== state.playToken) return;
  state.playing = false;
  state.playbackIndex = null;
  els.playToggle.classList.remove("is-active");
  els.playToggle.textContent = "Play seasons";
  update();
  await sleep(180);
  if (token !== state.playToken) return;
  await zoomToEurope(1050);
}

async function animateCurrentTransfer(move, token, options = {}) {
  const {isFirstMove = false, isLastMove = false} = options;

  if (isFirstMove) {
    await zoomToLocation(move.from_longitude, move.from_latitude, 10.7, 640);
  } else {
    await zoomToLocation(move.from_longitude, move.from_latitude, 11.0, 280);
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

    const zoomPromise = zoomToLocation(move.to_longitude, move.to_latitude, isLastMove ? 10.9 : 11.25, 1150);
    await Promise.all([linePromise, zoomPromise, pulsePromise]);
  }

  if (token !== state.playToken) return;
  await sleep(90);
  if (token !== state.playToken) return;
  await zoomToLocation(move.to_longitude, move.to_latitude, isLastMove ? 10.9 : 11.35, 320);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function update() {
  syncButtonStates();

  const selectedPlayer = state.selectedPlayerId ? searchablePlayers.find(d => d.player_id === state.selectedPlayerId) : null;
  const seasonRows = filteredSeasonRows();
  const displayRows = selectedPlayer ? playerJourneyRows(selectedPlayer.player_id) : seasonRows;
  const visibleRows = selectedPlayer
    ? (state.playbackIndex != null ? displayRows.slice(0, state.playbackIndex + 1) : displayRows.filter(d => d.season <= state.season))
    : displayRows;
  const drawRows = selectedPlayer ? visibleRows : limitForMap(visibleRows);

  updateHeader(selectedPlayer, seasonRows, visibleRows);
  updateStats(selectedPlayer, seasonRows, visibleRows);
  updateList(selectedPlayer, visibleRows, seasonRows);
  updatePlaybackTimeline(selectedPlayer, visibleRows, displayRows);
  drawMap(drawRows, selectedPlayer, visibleRows.length);
}

function syncButtonStates() {
  els.windowButtons.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", button.dataset.key === state.window);
  });
  els.moveTypeButtons.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", button.dataset.key === state.moveType);
  });
  els.featuredPlayers.querySelectorAll("button").forEach(button => {
    button.classList.toggle("is-active", +button.dataset.playerId === state.selectedPlayerId);
  });
  els.resetPlayer.hidden = !state.selectedPlayerId;
}

function filteredSeasonRows() {
  return data.filter(d => (
    d.season === state.season &&
    (state.league === "ALL" || d.league === state.league) &&
    (state.position === "ALL" || d.player_pos === state.position) &&
    (state.window === "ALL" || d.window === state.window) &&
    (state.moveType === "ALL" || d.move_type === state.moveType)
  ));
}

function playerJourneyRows(playerId) {
  return data
    .filter(d => (
      d.player_id === playerId &&
      (state.league === "ALL" || d.league === state.league) &&
      (state.position === "ALL" || d.player_pos === state.position) &&
      (state.window === "ALL" || d.window === state.window) &&
      (state.moveType === "ALL" || d.move_type === state.moveType)
    ))
    .sort((a, b) =>
      d3.ascending(a.season, b.season) ||
      d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
      d3.ascending(a.career_move_no || 0, b.career_move_no || 0)
    );
}

function limitForMap(rows) {
  if (rows.length <= 110) return rows;
  return [...rows]
    .sort((a, b) =>
      d3.descending(a.transfer_fee_amnt || 0, b.transfer_fee_amnt || 0) ||
      d3.descending(a.market_val_amnt || 0, b.market_val_amnt || 0)
    )
    .slice(0, 110);
}

function updateHeader(selectedPlayer, seasonRows, visibleRows) {
  const focus = selectedPlayer ? "Player spotlight" : "League pulse";
  const title = selectedPlayer
    ? `${selectedPlayer.player_name} · career through ${state.season}`
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
  } else {
    const countriesTouched = new Set(seasonRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)).size;
    els.storyline.textContent = `Start with the transfer market, then switch to a player story. In overview mode the map shows a thin route cloud; in player mode it becomes a narrated journey with numbered stops.`;
    els.mapInsight.textContent = `${formatNumber(seasonRows.length)} matched moves satisfy the current filters, connecting ${countriesTouched} countries in this season.`;
  }
}

function updateStats(selectedPlayer, seasonRows, visibleRows) {
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
  } else {
    const countries = Array.from(new Set(seasonRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)));
    const clubs = Array.from(new Set(seasonRows.flatMap(d => [d.from_team_name, d.to_team_name]).filter(Boolean)));
    const avgAge = d3.mean(seasonRows, d => d.player_age);
    const disclosedFees = seasonRows.filter(d => d.transfer_fee_amnt).length;
    const totalFees = d3.sum(seasonRows, d => d.transfer_fee_amnt || 0);

    stats = [
      {label: "Mapped moves", value: formatNumber(seasonRows.length), sub: seasonRows.length > 110 ? "Top 110 routes drawn for readability" : "Every matched route is shown"},
      {label: "Clubs touched", value: formatNumber(clubs.length), sub: `${countries.length} countries connected in this slice`},
      {label: "Average age", value: avgAge ? `${avgAge.toFixed(1)} yrs` : "—", sub: state.position === "ALL" ? "Across all visible positions" : `Filtered to ${state.position}`},
      {label: "Disclosed fees", value: disclosedFees ? formatMoneyCompact(totalFees) : "Mostly undisclosed", sub: `${formatNumber(disclosedFees)} routes list a fee amount`}
    ];

    const windowLabel = state.window === "ALL" ? "both windows" : state.window === "s" ? "the summer window" : "the winter window";
    els.filterSummary.textContent = `Right now you are looking at ${windowLabel} in ${state.season}${state.league === "ALL" ? "" : `, filtered to ${LEAGUE_LABELS[state.league]}`}. Use pan and zoom to inspect where long-distance routes leave the core seven-league market.`;
  }

  els.statsGrid.innerHTML = stats.map(stat => `
    <div class="stat-card">
      <div class="label">${stat.label}</div>
      <div class="value">${stat.value}</div>
      <div class="sub">${stat.sub}</div>
    </div>
  `).join("");
}

function updateList(selectedPlayer, visibleRows, seasonRows) {
  if (selectedPlayer) {
    els.listTitle.textContent = "Career timeline";
    const rows = visibleRows.slice().sort((a, b) =>
      d3.ascending(a.season, b.season) ||
      d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
      d3.ascending(a.career_move_no || 0, b.career_move_no || 0)
    );

    els.listContainer.innerHTML = rows.length
      ? rows.map(d => `
        <div class="list-row">
          <div>
            <h3>Move ${d.career_move_no || 0} · ${d.season} · ${d.window_label}</h3>
            <p>${d.from_team_name} → ${d.to_team_name}</p>
          </div>
          <span class="list-pill ${d.move_type}">${MOVE_TYPE_LABELS[d.move_type] || d.move_type}</span>
        </div>
      `).join("")
      : `<div class="list-row"><div><h3>No moves yet</h3><p>Move the season slider forward or press play to reveal this player's route.</p></div></div>`;
  } else {
    els.listTitle.textContent = "Story starters this season";
    const leaders = d3.rollups(
      seasonRows,
      values => ({
        count: values.length,
        pos: values[0].player_pos,
        lastNation: values[0].player_nation
      }),
      d => d.player_id,
      d => d.player_name
    )
      .map(([player_id, [player_name, info]]) => ({player_id, player_name, ...info}))
      .sort((a, b) => d3.descending(a.count, b.count) || famousBoost(b.player_name) - famousBoost(a.player_name))
      .slice(0, 10);

    els.listContainer.innerHTML = leaders.length
      ? leaders.map(player => `
        <button class="list-row" type="button" data-player-id="${player.player_id}">
          <div>
            <h3>${player.player_name}</h3>
            <p>${player.lastNation} · ${player.pos}</p>
          </div>
          <span class="list-pill">${player.count} move${player.count === 1 ? "" : "s"}</span>
        </button>
      `).join("")
      : `<div class="list-row"><div><h3>No routes match</h3><p>Try loosening the filters or choosing a different season.</p></div></div>`;

    els.listContainer.querySelectorAll("button[data-player-id]").forEach(button => {
      button.addEventListener("click", () => selectPlayer(+button.dataset.playerId));
    });
  }
}


function updatePlaybackTimeline(selectedPlayer, visibleRows, allRows) {
  if (!els.playbackTimelineOverlay || !els.timelineDock) return;

  if (!selectedPlayer || !allRows.length) {
    els.playbackTimelineOverlay.hidden = true;
    els.timelineDock.hidden = true;
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
  const revealed = rows.filter(d => visibleKeys.has(routeKey(d)));
  const overlayRows = revealed.slice().reverse();

  const itemHtml = d => `
    <div class="timeline-item ${visibleKeys.has(routeKey(d)) ? 'is-revealed' : ''} ${routeKey(d) === currentKey ? 'is-current' : ''} ${d.move_type}">
      <div class="timeline-pill ${d.move_type}">${MOVE_TYPE_LABELS[d.move_type] || d.move_type}</div>
      <div class="timeline-main">
        <strong>Move ${d.career_move_no || 0} · ${d.season}${d.window_label ? ` · ${d.window_label}` : ""}</strong>
        <span>${d.from_team_name} → ${d.to_team_name}</span>
      </div>
    </div>
  `;

  if (state.playing) {
    els.playbackTimelineOverlay.hidden = false;
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
    els.timelineDock.hidden = true;
    els.timelineDock.innerHTML = "";
  } else {
    els.playbackTimelineOverlay.hidden = true;
    els.playbackTimelineOverlay.classList.remove("is-active");
    els.playbackTimelineOverlay.innerHTML = "";
    els.timelineDock.hidden = false;
    els.timelineDock.innerHTML = `
      <div class="timeline-dock-header">
        <span class="mini-label">Career timeline</span>
        <strong>${selectedPlayer.player_name}</strong>
      </div>
      <div class="timeline-dock-row">
        ${rows.map(itemHtml).join("")}
      </div>
    `;
  }
}

function drawMap(rows, selectedPlayer, totalVisibleRows) {
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
        .style("filter", `drop-shadow(0 0 8px ${hexToRgba(moveColor, 0.24)})`)
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

  groups.each(function(d) {
    const flow = d3.select(this).select("path.route-flow");
    const length = flow.node().getTotalLength();
    flow
      .attr("stroke-dasharray", `18 ${Math.max(90, length)}`)
      .style("animation-duration", `${Math.max(4.2, Math.min(8, length / 70))}s`);
  });

  if (selectedPlayer) {
    drawSpotlightStops(routeData);
  } else {
    drawOverviewHotspots(routeData);
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
      isLatest: d.isLatest
    });
  });

  const adjustedStops = nudgeStops(stops).map(d => ({
    ...d,
    baseScreenDotR: d.isStart ? 5.2 : 7.2,
    baseScreenBadgeR: d.isStart ? 0 : 17.2,
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

  stopGroups.filter(d => !d.isStart).append("circle")
    .attr("class", "stop-badge")
    .attr("r", d => d.baseScreenBadgeR);

  stopGroups.filter(d => !d.isStart).append("text")
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
  return `
    <div class="kicker">${d.isStart ? "Starting point" : `Move ${d.moveNo}`}</div>
    <strong>${d.team}</strong>
    ${d.country || "Country unavailable"}${d.season ? `<br/>Reached in ${d.season}` : ""}
  `;
}

function showTooltip(event, html) {
  els.tooltip.hidden = false;
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
