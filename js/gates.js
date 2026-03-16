// gates.js
// skyline look: glass towers + windows, refusal overlay in warm tone, optional night theme

const CHART_DIV = d3.select("#chart");

const selState = d3.select("#state");
const selYear  = d3.select("#year");
const selSort  = d3.select("#sort");
const selTopN  = d3.select("#topn");

const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

const incomeOrder = [
  "Low income",
  "Lower middle income",
  "Upper middle income",
  "High income",
  "Not classified"
];

function fmtInt(x) { return d3.format(",")(Math.round(x)); }
function fmtPct(x) { return d3.format(".1%")(x); }

function cleanGroup(s) {
  if (s == null) return "Not classified";
  const t = String(s).trim();
  if (!t) return "Not classified";
  const low = t.toLowerCase();
  if (low === "nan" || low === "na" || low === "null" || low === "undefined") return "Not classified";
  return t;
}

function incomeRank(name) {
  const i = incomeOrder.indexOf(name);
  return i === -1 ? 999 : i;
}

function safeCode(code, countryName) {
  const c = (code == null) ? "" : String(code).trim();
  if (c && c.toLowerCase() !== "nan") return c.toUpperCase();
  return String(countryName || "").slice(0, 3).toUpperCase();
}

function getContainerWidth() {
  return CHART_DIV.node().clientWidth;
}

// low -> light blue, high -> orange
function refusalScale(maxRef) {
  const interp = d3.interpolateRgbBasis([
    "#d7ecff",
    "#9fd0ff",
    "#ffd7a8",
    "#f28e2b"
  ]);
  return d3.scaleSequential(interp).domain([0, maxRef || 0.8]);
}

function showTip(event, d) {
  tooltip
    .style("opacity", 1)
    .html(`
      <div style="font-weight:800;margin-bottom:6px">${d.consulate_country}</div>
      <div>Country code: <b>${d.code}</b></div>
      <div>Year: <b>${d.year}</b></div>
      <div>Reporting state: <b>${d.reporting_state}</b></div>
      <div>Income group: <b>${d.income_group}</b></div>
      <div>Region: <b>${d.region}</b></div>
      <hr style="border:0;border-top:1px solid #c9d9f0;margin:8px 0">
      <div>Applications: <b>${fmtInt(d.apps)}</b></div>
      <div>Issued: <b>${fmtInt(d.issued)}</b></div>
      <div>Not issued: <b>${fmtInt(d.not_issued)}</b></div>
      <div>Refusal rate: <b>${fmtPct(d.refusal_rate)}</b></div>
    `);

  const pad = 14;
  tooltip
    .style("left", (event.clientX + pad) + "px")
    .style("top",  (event.clientY + pad) + "px");
}

function moveTip(event) {
  const pad = 14;
  tooltip
    .style("left", (event.clientX + pad) + "px")
    .style("top",  (event.clientY + pad) + "px");
}

function hideTip() { tooltip.style("opacity", 0); }

d3.csv("data/gates.csv", d => ({
  year: +d.year,
  reporting_state: d.reporting_state,
  consulate_country: d.consulate_country,
  country_code: d.country_code,
  income_group: cleanGroup(d.income_group),
  region: (d.region && String(d.region).trim()) ? d.region : "Unknown",
  apps: +d.apps,
  issued: +d.issued,
  not_issued: +d.not_issued,
  refusal_rate: +d.refusal_rate
})).then(data => {

  data.forEach(d => { d.code = safeCode(d.country_code, d.consulate_country); });

  const states = Array.from(new Set(data.map(d => d.reporting_state))).sort(d3.ascending);
  const years  = Array.from(new Set(data.map(d => d.year))).sort((a,b) => a - b);

  selState.selectAll("option")
    .data(states)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  selYear.selectAll("option")
    .data(years)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  selState.property("value", states.includes("France") ? "France" : states[0]);
  selYear.property("value", years.includes(2022) ? 2022 : years[years.length - 1]);

  function update() {
    const state = selState.property("value");
    const year  = +selYear.property("value");
    const sort  = selSort.property("value");
    const topN  = +selTopN.property("value");

    const filtered = data.filter(d => d.reporting_state === state && d.year === year && d.apps > 0);

    const maxApps = d3.max(filtered, d => d.apps) || 1;
    const maxRef  = d3.max(filtered, d => d.refusal_rate) || 0.8;

    CHART_DIV.selectAll("*").remove();

    const byIncome = d3.group(filtered, d => d.income_group);
    const incomeKeys = Array.from(byIncome.keys()).sort((a,b) => incomeRank(a) - incomeRank(b));

    const margin = { top: 18, right: 18, bottom: 18, left: 18 };
    const panelGap = 18;
    const panelH = 250;
    const height = margin.top + margin.bottom + incomeKeys.length * panelH + (incomeKeys.length - 1) * panelGap;

    const containerW = getContainerWidth();
    const innerW = containerW - margin.left - margin.right;

    const cScale = refusalScale(maxRef);

    // log-ish scaling so small volumes show up, but still readable
    const hScale = d3.scaleLog()
      .domain([1, maxApps + 1])
      .range([26, panelH - 98]);

    const svg = CHART_DIV.append("svg")
      .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const defs = svg.append("defs");

    // ---- skyline styling defs (gradients + window patterns) ----
    const night = document.body.classList.contains("skyline-night");

    // building glass gradient
    const glass = defs.append("linearGradient")
      .attr("id", "glassGrad")
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    glass.append("stop").attr("offset", "0%").attr("stop-color", night ? "#86b6ff" : "#d8ecff").attr("stop-opacity", 0.85);
    glass.append("stop").attr("offset", "55%").attr("stop-color", night ? "#3f78c9" : "#9fd0ff").attr("stop-opacity", 0.9);
    glass.append("stop").attr("offset", "100%").attr("stop-color", night ? "#1f4a86" : "#6eaeea").attr("stop-opacity", 0.95);

    // refusal gradient (warm)
    const refg = defs.append("linearGradient")
      .attr("id", "refusalGrad")
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    refg.append("stop").attr("offset", "0%").attr("stop-color", "#ffe3b8").attr("stop-opacity", 0.95);
    refg.append("stop").attr("offset", "100%").attr("stop-color", "#f28e2b").attr("stop-opacity", 0.95);

    // windows pattern (cool)
    const winBlue = defs.append("pattern")
      .attr("id", "winBlue")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 10)
      .attr("height", 12);
    winBlue.append("rect").attr("x", 2).attr("y", 2).attr("width", 2.6).attr("height", 3.2).attr("fill", night ? "rgba(235,245,255,0.55)" : "rgba(25,60,120,0.18)");
    winBlue.append("rect").attr("x", 6).attr("y", 2).attr("width", 2.6).attr("height", 3.2).attr("fill", night ? "rgba(235,245,255,0.40)" : "rgba(25,60,120,0.12)");
    winBlue.append("rect").attr("x", 2).attr("y", 7).attr("width", 2.6).attr("height", 3.2).attr("fill", night ? "rgba(235,245,255,0.40)" : "rgba(25,60,120,0.12)");
    winBlue.append("rect").attr("x", 6).attr("y", 7).attr("width", 2.6).attr("height", 3.2).attr("fill", night ? "rgba(235,245,255,0.55)" : "rgba(25,60,120,0.18)");

    // windows pattern (warm overlay)
    const winWarm = defs.append("pattern")
      .attr("id", "winWarm")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 10)
      .attr("height", 12);
    winWarm.append("rect").attr("x", 2).attr("y", 2).attr("width", 2.6).attr("height", 3.2).attr("fill", "rgba(90,35,0,0.18)");
    winWarm.append("rect").attr("x", 6).attr("y", 2).attr("width", 2.6).attr("height", 3.2).attr("fill", "rgba(90,35,0,0.12)");
    winWarm.append("rect").attr("x", 2).attr("y", 7).attr("width", 2.6).attr("height", 3.2).attr("fill", "rgba(90,35,0,0.12)");
    winWarm.append("rect").attr("x", 6).attr("y", 7).attr("width", 2.6).attr("height", 3.2).attr("fill", "rgba(90,35,0,0.18)");

    // ---- compute plot width so it can scroll ----
    let plotW = innerW;
    incomeKeys.forEach(inc => {
      let rows = (byIncome.get(inc) || []).slice();

      if (sort === "refusal") rows.sort((a,b) => d3.descending(a.refusal_rate, b.refusal_rate));
      else rows.sort((a,b) => d3.descending(a.apps, b.apps));

      if (topN !== 9999) rows = rows.slice(0, topN);

      const minGate = 44; // wider so it reads like buildings, not toothpicks
      plotW = Math.max(plotW, rows.length * minGate + 140);
    });

    svg.attr("width", plotW + margin.left + margin.right);

    // ---- draw panels ----
    incomeKeys.forEach((inc, i) => {
      let rows = (byIncome.get(inc) || []).slice();

      if (sort === "refusal") rows.sort((a,b) => d3.descending(a.refusal_rate, b.refusal_rate));
      else rows.sort((a,b) => d3.descending(a.apps, b.apps));

      if (topN !== 9999) rows = rows.slice(0, topN);

      const panelY = i * (panelH + panelGap);
      const panel = g.append("g").attr("transform", `translate(0,${panelY})`);

      // panel background
      panel.append("rect")
        .attr("x", -8)
        .attr("y", 0)
        .attr("width", plotW + 16)
        .attr("height", panelH)
        .attr("rx", 12)
        .attr("fill", night ? "rgba(255,255,255,0.06)" : "#ffffff")
        .attr("stroke", night ? "rgba(201,217,240,0.25)" : "#c9d9f0");

      // clip to prevent leaks
      const clipId = `clip_panel_${i}`;
      defs.append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("x", 6)
        .attr("y", 8)
        .attr("width", plotW - 12)
        .attr("height", panelH - 16);

      panel.append("text")
        .attr("x", 10)
        .attr("y", 22)
        .attr("fill", night ? "rgba(238,244,255,0.92)" : "#13213c")
        .attr("font-size", 13)
        .attr("font-weight", 800)
        .attr("letter-spacing", "0.05em")
        .text(String(inc).toUpperCase()); // caps ok here

      panel.append("text")
        .attr("x", 10)
        .attr("y", 42)
        .attr("fill", night ? "rgba(238,244,255,0.70)" : "#51607a")
        .attr("font-size", 11)
        .text(`Showing ${rows.length} countries, sorted by ${sort === "refusal" ? "refusal rate" : "applications"}.`);

      const baseY = panelH - 44;

      // ground line (makes it feel like skyline)
      panel.append("line")
        .attr("x1", 12).attr("x2", plotW - 12)
        .attr("y1", baseY).attr("y2", baseY)
        .attr("stroke", night ? "rgba(238,244,255,0.18)" : "rgba(43,90,166,0.22)")
        .attr("stroke-width", 1);

      // IMPORTANT: use consulate_country for x domain so no stacking bug
      const x = d3.scaleBand()
        .domain(rows.map(d => d.consulate_country))
        .range([12, plotW - 12])
        .paddingInner(0.24)
        .paddingOuter(0.10);

      const gateW = x.bandwidth();
      const innerPad = Math.max(2, gateW * 0.12);

      const gates = panel.append("g")
        .attr("clip-path", `url(#${clipId})`)
        .selectAll(".gate")
        .data(rows, d => d.consulate_country)
        .join("g")
        .attr("class", "gate")
        .attr("transform", d => `translate(${x(d.consulate_country)},0)`);

      // building height
      gates.each(function(d) {
        const H = hScale(d.apps + 1);
        const yTop = baseY - H;

        const group = d3.select(this);

        // building body (glass)
        group.append("rect")
          .attr("x", 0)
          .attr("y", yTop)
          .attr("width", gateW)
          .attr("height", H)
          .attr("rx", 3)
          .attr("fill", "url(#glassGrad)")
          .attr("stroke", night ? "rgba(238,244,255,0.22)" : "rgba(43,90,166,0.35)")
          .attr("stroke-width", 1);

        // windows on whole building
        group.append("rect")
          .attr("x", innerPad)
          .attr("y", yTop + 6)
          .attr("width", Math.max(2, gateW - innerPad * 2))
          .attr("height", Math.max(0, H - 12))
          .attr("fill", "url(#winBlue)")
          .attr("opacity", night ? 0.65 : 0.55);

        // glossy highlight strip
        group.append("rect")
          .attr("x", gateW * 0.10)
          .attr("y", yTop + 6)
          .attr("width", Math.max(2, gateW * 0.12))
          .attr("height", Math.max(0, H - 12))
          .attr("fill", night ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.22)");

        // refusal overlay (blocked portion from top)
        const blocked = H * d.refusal_rate;
        const yBlocked = yTop + (H - blocked);

        group.append("rect")
          .attr("x", innerPad)
          .attr("y", yBlocked)
          .attr("width", Math.max(2, gateW - innerPad * 2))
          .attr("height", Math.max(0, blocked))
          .attr("rx", 2)
          .attr("fill", "url(#refusalGrad)")
          .attr("opacity", 0.95);

        // refusal overlay windows
        group.append("rect")
          .attr("x", innerPad)
          .attr("y", yBlocked)
          .attr("width", Math.max(2, gateW - innerPad * 2))
          .attr("height", Math.max(0, blocked))
          .attr("fill", "url(#winWarm)")
          .attr("opacity", 0.55);

        // label (code)
        group.append("text")
          .attr("x", gateW / 2)
          .attr("y", baseY + 18)
          .attr("fill", night ? "rgba(238,244,255,0.72)" : "#51607a")
          .attr("font-size", 11)
          .attr("font-weight", 800)
          .attr("text-anchor", "middle")
          .text(d.code);
      });

      gates
        .on("mouseenter", (event, d) => showTip(event, d))
        .on("mousemove", (event) => moveTip(event))
        .on("mouseleave", hideTip);
    });

    // legend
    const leg = g.append("g").attr("transform", `translate(${plotW - 270},0)`);
    leg.append("text")
      .attr("x", 0)
      .attr("y", 14)
      .attr("fill", night ? "rgba(238,244,255,0.78)" : "#51607a")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .text("Refusal rate (low → high)");

    const steps = d3.range(0, 1.0001, 0.1);
    leg.selectAll("rect")
      .data(steps)
      .join("rect")
      .attr("x", (d, i) => i * 20)
      .attr("y", 22)
      .attr("width", 20)
      .attr("height", 10)
      .attr("fill", d => cScale(d * maxRef));

    leg.selectAll("text.pct")
      .data([0, maxRef])
      .join("text")
      .attr("x", (d,i) => i === 0 ? 0 : steps.length * 20 - 2)
      .attr("y", 44)
      .attr("fill", night ? "rgba(238,244,255,0.70)" : "#51607a")
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("text-anchor", (d,i) => i === 0 ? "start" : "end")
      .text(d => fmtPct(d));
  }

  selState.on("change", update);
  selYear.on("change", update);
  selSort.on("change", update);
  selTopN.on("change", update);

  window.addEventListener("resize", update);
  update();
});