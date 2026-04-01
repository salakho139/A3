
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

const state = {
  season: 2016,
  league: "ALL",
  position: "ALL",
  window: "ALL",
  moveType: "ALL",
  selectedPlayerId: null,
  playing: false
};

const els = {
  playerSearch: document.getElementById("player-search"),
  playerSuggestions: document.getElementById("player-suggestions"),
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
  tooltip: document.getElementById("tooltip")
};

const svg = d3.select("#map-svg");
const width = 1100;
const height = 720;
const mapRoot = svg.append("g");
const countryLayer = mapRoot.append("g").attr("class", "countries");
const routeLayer = mapRoot.append("g").attr("class", "routes");
const pointLayer = mapRoot.append("g").attr("class", "points");
const sparkLayer = mapRoot.append("g").attr("class", "sparks");
const labelLayer = mapRoot.append("g").attr("class", "labels");

const projection = d3.geoMercator()
  .center([11, 51.5])
  .scale(540)
  .translate([width / 2, height / 2]);

const geoPath = d3.geoPath(projection);
const playerById = new Map();
let data = [];
let featuredPlayers = [];
let countries = [];
let playTimer = null;

Promise.all([
  d3.csv(DATA_URL, rowParser),
  d3.json(FEATURED_URL),
  d3.json(WORLD_URL)
]).then(([rows, featured, world]) => {
  data = rows.filter(d => d.season && d.from_latitude && d.to_latitude);
  featuredPlayers = featured;
  countries = topojson.feature(world, world.objects.countries).features
    .filter(feature => {
      const [lon, lat] = d3.geoCentroid(feature);
      return lon > -30 && lon < 50 && lat > 24 && lat < 73;
    });

  data.forEach(d => {
    if (!playerById.has(d.player_id)) {
      playerById.set(d.player_id, {
        player_id: d.player_id,
        player_name: d.player_name,
        player_nation: d.player_nation,
        player_pos: d.player_pos,
        journey_moves: d.journey_moves,
        journey_distance_km: d.journey_distance_km
      });
    }
  });

  drawCountries();
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
  return {
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
    is_free: d.is_free === "True" || d.is_free === "true" || d.is_free === "1",
    is_loan: d.is_loan === "True" || d.is_loan === "true" || d.is_loan === "1",
    is_loan_end: d.is_loan_end === "True" || d.is_loan_end === "true" || d.is_loan_end === "1",
    is_retired: d.is_retired === "True" || d.is_retired === "true" || d.is_retired === "1",
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
}

function numericOrNull(value) {
  const n = +value;
  return Number.isFinite(n) ? n : null;
}

function drawCountries() {
  countryLayer.selectAll("path.country")
    .data(countries)
    .join("path")
    .attr("class", "country")
    .attr("d", geoPath);

  countryLayer.append("path")
    .datum({type: "Sphere"})
    .attr("class", "country-outline")
    .attr("d", geoPath);
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

  const suggestions = Array.from(playerById.values())
    .sort((a, b) => d3.descending(a.journey_moves, b.journey_moves))
    .slice(0, 1400);

  els.playerSuggestions.innerHTML = suggestions
    .map(player => `<option value="${player.player_name}"></option>`)
    .join("");

  els.featuredPlayers.innerHTML = featuredPlayers.map(player => `
    <button class="feature-chip" type="button" data-player-id="${player.player_id}">
      ${player.player_name}
      <small>${player.journey_moves} mapped moves · ${player.primary_pos}</small>
    </button>
  `).join("");

  els.featuredPlayers.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedPlayerId = +button.dataset.playerId;
      els.playerSearch.value = playerById.get(state.selectedPlayerId)?.player_name || "";
      update();
    });
  });

  els.seasonSlider.addEventListener("input", (event) => {
    state.season = +event.target.value;
    els.seasonValue.textContent = state.season;
    update();
  });

  els.playToggle.addEventListener("click", () => {
    state.playing = !state.playing;
    els.playToggle.classList.toggle("is-active", state.playing);
    els.playToggle.textContent = state.playing ? "Pause" : "Play seasons";
    if (state.playing) {
      startPlayback();
    } else {
      stopPlayback();
    }
  });

  els.leagueSelect.addEventListener("change", event => {
    state.league = event.target.value;
    update();
  });

  els.positionSelect.addEventListener("change", event => {
    state.position = event.target.value;
    update();
  });

  els.playerSearch.addEventListener("change", event => {
    const search = event.target.value.trim().toLowerCase();
    const match = Array.from(playerById.values()).find(player => player.player_name.toLowerCase() === search);
    state.selectedPlayerId = match ? match.player_id : null;
    if (!match && event.target.value.trim()) {
      const fuzzy = Array.from(playerById.values()).find(player => player.player_name.toLowerCase().includes(search));
      state.selectedPlayerId = fuzzy ? fuzzy.player_id : null;
      if (fuzzy) {
        els.playerSearch.value = fuzzy.player_name;
      }
    }
    update();
  });

  els.resetPlayer.addEventListener("click", () => {
    state.selectedPlayerId = null;
    els.playerSearch.value = "";
    update();
  });
}

function buildSegmentedButtons(container, buttons, stateKey) {
  container.innerHTML = buttons.map(button => `
    <button type="button" data-key="${button.key}" data-state-key="${stateKey}" ${button.key !== "ALL" ? `data-type="${button.key}"` : ""}>
      ${button.label}
    </button>
  `).join("");

  container.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      state[stateKey] = button.dataset.key;
      update();
    });
  });
}

function startPlayback() {
  stopPlayback();
  playTimer = window.setInterval(() => {
    const max = +els.seasonSlider.max;
    const min = +els.seasonSlider.min;
    state.season = state.season >= max ? min : state.season + 1;
    els.seasonSlider.value = state.season;
    els.seasonValue.textContent = state.season;
    update();
  }, 1400);
}

function stopPlayback() {
  if (playTimer) {
    window.clearInterval(playTimer);
    playTimer = null;
  }
}

function update() {
  syncButtonStates();

  const selectedPlayer = state.selectedPlayerId ? playerById.get(state.selectedPlayerId) : null;
  const seasonRows = filteredSeasonRows();
  const displayRows = selectedPlayer ? playerJourneyRows(selectedPlayer.player_id) : seasonRows;
  const visibleRows = selectedPlayer ? displayRows.filter(d => d.season <= state.season) : displayRows;
  const drawRows = selectedPlayer ? visibleRows : limitForMap(visibleRows);

  updateHeader(selectedPlayer, seasonRows, visibleRows);
  updateStats(selectedPlayer, seasonRows, visibleRows);
  updateList(selectedPlayer, visibleRows, seasonRows);
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
  return data.filter(d => {
    return d.season === state.season &&
      (state.league === "ALL" || d.league === state.league) &&
      (state.position === "ALL" || d.player_pos === state.position) &&
      (state.window === "ALL" || d.window === state.window) &&
      (state.moveType === "ALL" || d.move_type === state.moveType);
  });
}

function playerJourneyRows(playerId) {
  return data
    .filter(d => d.player_id === playerId)
    .sort((a, b) =>
      d3.ascending(a.season, b.season) ||
      d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
      d3.ascending(a.career_move_no, b.career_move_no)
    );
}

function limitForMap(rows) {
  if (rows.length <= 180) return rows;
  return [...rows]
    .sort((a, b) =>
      d3.descending(a.transfer_fee_amnt || 0, b.transfer_fee_amnt || 0) ||
      d3.descending(a.market_val_amnt || 0, b.market_val_amnt || 0)
    )
    .slice(0, 180);
}

function updateHeader(selectedPlayer, seasonRows, visibleRows) {
  const focus = selectedPlayer ? "Player spotlight" : "League pulse";
  const title = selectedPlayer
    ? `${selectedPlayer.player_name} · career through ${state.season}`
    : `${focus} · ${state.season}`;
  els.mapTitle.textContent = title;
  els.focusModeLabel.textContent = focus;

  if (selectedPlayer) {
    const clubs = new Set(visibleRows.flatMap(d => [d.from_team_name, d.to_team_name]));
    els.storyline.textContent =
      `${selectedPlayer.player_name} has ${selectedPlayer.journey_moves} mapped moves in the dataset. The slider now reveals that career one season at a time, showing ${clubs.size} club stops so far.`;
  } else {
    const countries = new Set(seasonRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean));
    els.storyline.textContent =
      `${formatNumber(seasonRows.length)} matched moves are active under the current filter, connecting ${countries.size} countries into Europe's seven-league transfer market.`;
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

    els.filterSummary.textContent =
      `${selectedPlayer.player_name} is primarily listed as ${selectedPlayer.player_pos} and represented as ${selectedPlayer.player_nation}. Use the season slider to reveal how a career expands, loops, or settles over time.`;
  } else {
    const countries = Array.from(new Set(seasonRows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean)));
    const clubs = Array.from(new Set(seasonRows.flatMap(d => [d.from_team_name, d.to_team_name]).filter(Boolean)));
    const avgAge = d3.mean(seasonRows, d => d.player_age);
    const disclosedFees = seasonRows.filter(d => d.transfer_fee_amnt).length;
    const totalFees = d3.sum(seasonRows, d => d.transfer_fee_amnt || 0);

    stats = [
      {label: "Mapped moves", value: formatNumber(seasonRows.length), sub: seasonRows.length > 180 ? "Top 180 routes drawn for clarity" : "Every matched route is shown"},
      {label: "Clubs touched", value: formatNumber(clubs.length), sub: `${countries.length} countries connected in this slice`},
      {label: "Average age", value: avgAge ? `${avgAge.toFixed(1)} yrs` : "—", sub: state.position === "ALL" ? "Across all visible positions" : `Filtered to ${state.position}`},
      {label: "Disclosed fees", value: disclosedFees ? formatMoneyCompact(totalFees) : "Mostly undisclosed", sub: `${formatNumber(disclosedFees)} routes list a fee amount`}
    ];

    const windowLabel = state.window === "ALL" ? "both windows" : state.window === "s" ? "the summer window" : "the winter window";
    els.filterSummary.textContent =
      `Right now you are looking at ${windowLabel} in ${state.season}${state.league === "ALL" ? "" : `, filtered to ${LEAGUE_LABELS[state.league]}`}. Pick a player to switch from market-wide movement to a single career narrative.`;
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
      d3.ascending(a.career_move_no, b.career_move_no)
    );

    els.listContainer.innerHTML = rows.length
      ? rows.map(d => `
        <div class="list-row">
          <div>
            <h3>${d.season} · ${d.window_label}</h3>
            <p>${d.from_team_name} → ${d.to_team_name}</p>
          </div>
          <span class="list-pill">${MOVE_TYPE_LABELS[d.move_type] || d.move_type}</span>
        </div>
      `).join("")
      : `<div class="list-row"><div><h3>No moves yet</h3><p>Move the season slider forward to reveal this player's route.</p></div></div>`;
  } else {
    els.listTitle.textContent = "Most mobile players";
    const leaders = d3.rollups(
      seasonRows,
      values => ({
        count: values.length,
        lastNation: values[0].player_nation,
        pos: values[0].player_pos,
        player_id: values[0].player_id
      }),
      d => d.player_name
    )
      .map(([player_name, info]) => ({player_name, ...info}))
      .sort((a, b) => d3.descending(a.count, b.count))
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
      button.addEventListener("click", () => {
        state.selectedPlayerId = +button.dataset.playerId;
        els.playerSearch.value = playerById.get(state.selectedPlayerId)?.player_name || "";
        update();
      });
    });
  }
}

function drawMap(rows, selectedPlayer, totalVisibleRows) {
  routeLayer.selectAll("*").remove();
  pointLayer.selectAll("*").remove();
  sparkLayer.selectAll("*").remove();
  labelLayer.selectAll("*").remove();

  if (!rows.length) {
    labelLayer.append("text")
      .attr("class", "empty-state")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .text("No mapped routes for this filter. Try another season, move type, or player.");
    els.mapInsight.textContent = "The current filter produced no mapped routes.";
    return;
  }

  const routeData = rows.map((d, index) => ({
    ...d,
    id: `${d.transfer_id}-${index}`,
    projectedFrom: projection([d.from_longitude, d.from_latitude]),
    projectedTo: projection([d.to_longitude, d.to_latitude])
  })).filter(d => d.projectedFrom && d.projectedTo);

  const feeExtent = d3.extent(routeData, d => d.transfer_fee_amnt || d.market_val_amnt || 0);
  const widthScale = d3.scaleSqrt().domain([feeExtent[0] || 0, feeExtent[1] || 1]).range([1.2, selectedPlayer ? 3.8 : 3.0]);

  const routes = routeLayer.selectAll("path.route")
    .data(routeData, d => d.id)
    .join("path")
    .attr("class", d => `route ${d.move_type} ${selectedPlayer ? "is-spotlight" : ""} route-flow`)
    .attr("d", d => curveBetween(d.projectedFrom, d.projectedTo))
    .attr("stroke-width", d => widthScale(d.transfer_fee_amnt || d.market_val_amnt || 0))
    .attr("stroke-dasharray", selectedPlayer ? "10 12" : "8 11")
    .attr("stroke-dashoffset", 0)
    .attr("opacity", 0)
    .call(path => path.transition().duration(800).ease(d3.easeCubicOut).attr("opacity", 1));

  routes
    .on("mouseenter", (event, d) => showTooltip(event, routeTooltipHtml(d)))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);

  if (selectedPlayer) {
    drawSpotlightStops(routeData);
  } else {
    drawPulseEndpoints(routeData.slice(0, 80));
  }

  els.mapInsight.textContent = selectedPlayer
    ? buildSpotlightInsight(selectedPlayer, rows)
    : buildLeagueInsight(rows, totalVisibleRows);
}

function drawPulseEndpoints(routeData) {
  const endpoints = routeData.flatMap(d => [
    {team: d.from_team_name, country: d.from_team_country, coords: d.projectedFrom, type: "from", raw: d},
    {team: d.to_team_name, country: d.to_team_country, coords: d.projectedTo, type: "to", raw: d}
  ]);

  pointLayer.selectAll("circle.club-dot")
    .data(endpoints)
    .join("circle")
    .attr("class", d => `club-dot ${d.type === "from" ? "is-start" : "is-end"}`)
    .attr("cx", d => d.coords[0])
    .attr("cy", d => d.coords[1])
    .attr("r", 0)
    .attr("opacity", 0.88)
    .on("mouseenter", (event, d) => showTooltip(event, endpointTooltipHtml(d)))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .transition()
    .delay((_, i) => Math.min(i * 9, 420))
    .duration(500)
    .attr("r", d => d.type === "from" ? 2.1 : 2.8);

  const sparks = routeData.slice(0, 24).map(d => {
    const t = 0.18 + Math.random() * 0.64;
    const [x, y] = pointOnCurve(d.projectedFrom, d.projectedTo, t);
    return {x, y};
  });

  sparkLayer.selectAll("circle.spark")
    .data(sparks)
    .join("circle")
    .attr("class", "spark")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 0)
    .transition()
    .duration(600)
    .attr("r", 2.8)
    .transition()
    .duration(2200)
    .attr("opacity", 0.1)
    .remove();
}

function drawSpotlightStops(routeData) {
  const ordered = routeData.slice().sort((a, b) =>
    d3.ascending(a.season, b.season) ||
    d3.ascending(windowOrder(a.window), windowOrder(b.window)) ||
    d3.ascending(a.career_move_no, b.career_move_no)
  );

  const stops = [];
  if (ordered.length) {
    stops.push({
      team: ordered[0].from_team_name,
      country: ordered[0].from_team_country,
      coords: ordered[0].projectedFrom,
      moveNo: 0,
      label: ordered[0].from_team_name
    });
  }

  ordered.forEach(d => {
    stops.push({
      team: d.to_team_name,
      country: d.to_team_country,
      coords: d.projectedTo,
      moveNo: d.career_move_no,
      season: d.season,
      label: d.to_team_name
    });
  });

  pointLayer.selectAll("circle.club-dot")
    .data(stops)
    .join("circle")
    .attr("class", (d, i) => `club-dot ${i === 0 ? "is-start" : "is-end"}`)
    .attr("cx", d => d.coords[0])
    .attr("cy", d => d.coords[1])
    .attr("r", 0)
    .on("mouseenter", (event, d) => showTooltip(event, spotlightStopTooltipHtml(d)))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .transition()
    .delay((_, i) => i * 80)
    .duration(400)
    .attr("r", (_, i) => i === 0 ? 4.4 : 4.8);

  const numbered = stops.filter((_, i) => i > 0);
  pointLayer.selectAll("circle.route-order-bg")
    .data(numbered)
    .join("circle")
    .attr("class", "route-order-bg")
    .attr("cx", d => d.coords[0] + 8)
    .attr("cy", d => d.coords[1] - 8)
    .attr("r", 0)
    .transition()
    .delay((_, i) => 100 + i * 85)
    .duration(400)
    .attr("r", 9);

  labelLayer.selectAll("text.route-order")
    .data(numbered)
    .join("text")
    .attr("class", "route-order")
    .attr("x", d => d.coords[0] + 8)
    .attr("y", d => d.coords[1] - 4)
    .attr("text-anchor", "middle")
    .text(d => d.moveNo);

  const keyStops = [stops[0], stops.at(-1)].filter(Boolean);
  labelLayer.selectAll("text.club-label")
    .data(keyStops)
    .join("text")
    .attr("class", "club-label")
    .attr("x", d => d.coords[0] + 10)
    .attr("y", d => d.coords[1] - 12)
    .text(d => d.team);

  const travelSpark = ordered.map((d, i) => {
    const t = 0.5;
    const [x, y] = pointOnCurve(d.projectedFrom, d.projectedTo, t);
    return {x, y, i};
  });

  sparkLayer.selectAll("circle.spark")
    .data(travelSpark)
    .join("circle")
    .attr("class", "spark")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 0)
    .transition()
    .delay(d => d.i * 90)
    .duration(450)
    .attr("r", 3.2)
    .transition()
    .duration(900)
    .attr("opacity", 0.25)
    .remove();
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
  const curve = Math.min(70, 16 + distance * 0.13);
  const cx = mx - (dy / norm) * curve;
  const cy = my + (dx / norm) * curve;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

function pointOnCurve(start, end, t) {
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const norm = Math.max(distance, 1);
  const curve = Math.min(70, 16 + distance * 0.13);
  const cx = mx - (dy / norm) * curve;
  const cy = my + (dx / norm) * curve;

  const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
  return [x, y];
}

function buildLeagueInsight(rows, totalVisibleRows) {
  const countries = new Set(rows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean));
  const loans = rows.filter(d => d.move_type === "loan").length;
  const fees = rows.filter(d => d.transfer_fee_amnt).length;
  const dominantType = d3.greatest(
    d3.rollups(rows, values => values.length, d => d.move_type),
    d => d[1]
  );
  const dominantLabel = MOVE_TYPE_LABELS[dominantType?.[0]] || "transfer";
  const loanSnippet = loans ? `${formatNumber(loans)} of the visible routes are loans, ` : "";
  const feeSnippet = fees ? `${formatNumber(fees)} disclose a fee.` : "most fees are undisclosed in this slice.";
  return `${formatNumber(totalVisibleRows)} matched routes satisfy the current filter; ${formatNumber(rows.length)} are drawn on the map for readability. ${countries.size} countries are involved, ${loanSnippet}and ${feeSnippet} The dominant visible move type is ${dominantLabel}.`;
}

function buildSpotlightInsight(player, rows) {
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const countries = new Set(rows.flatMap(d => [d.from_team_country, d.to_team_country]).filter(Boolean));
  return `${player.player_name}'s visible path starts at ${first.from_team_name} and currently reaches ${latest.to_team_name}. The revealed journey crosses ${countries.size} countries and includes ${formatNumber(rows.length)} mapped moves up to ${state.season}.`;
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

function endpointTooltipHtml(d) {
  return `
    <div class="kicker">${d.type === "from" ? "Origin club" : "Destination club"}</div>
    <strong>${d.team}</strong>
    ${d.country || "Country unavailable"}<br/>
    Linked to ${d.raw.player_name} in ${d.raw.season}
  `;
}

function spotlightStopTooltipHtml(d) {
  return `
    <div class="kicker">${d.moveNo === 0 ? "Starting point" : `Move ${d.moveNo}`}</div>
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
  const bounds = document.getElementById("map-wrap").getBoundingClientRect();
  els.tooltip.style.left = `${event.clientX - bounds.left}px`;
  els.tooltip.style.top = `${event.clientY - bounds.top}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
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
