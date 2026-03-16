// gates.js
// clean layout, correct x positioning, country-code labels, blue->orange refusal palette

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
  // fallback, not perfect but better than blank, lol
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

  moveTip(event);
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

  // compute display code once
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
    const panelH = 240;
    const height = margin.top + margin.bottom + incomeKeys.length * panelH + (incomeKeys.length - 1) * panelGap;

    const containerW = getContainerWidth();
    const innerW = containerW - margin.left - margin.right;

    const cScale = refusalScale(maxRef);

    // log-ish scaling so small volumes arent invisible
    const hScale = d3.scaleLog()
      .domain([1, maxApps + 1])
      .range([20, panelH - 92]);

    const svg = CHART_DIV.append("svg")
      .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const defs = svg.append("defs");

    // compute plot width (so we can scroll)
    let plotW = innerW;
    incomeKeys.forEach(inc => {
      let rows = (byIncome.get(inc) || []).slice();

      if (sort === "refusal") rows.sort((a,b) => d3.descending(a.refusal_rate, b.refusal_rate));
      else rows.sort((a,b) => d3.descending(a.apps, b.apps));

      if (topN !== 9999) rows = rows.slice(0, topN);

      const minGate = 34;
      plotW = Math.max(plotW, rows.length * minGate + 120);
    });

    svg.attr("width", plotW + margin.left + margin.right);

    incomeKeys.forEach((inc, i) => {
      let rows = (byIncome.get(inc) || []).slice();

      if (sort === "refusal") rows.sort((a,b) => d3.descending(a.refusal_rate, b.refusal_rate));
      else rows.sort((a,b) => d3.descending(a.apps, b.apps));

      if (topN !== 9999) rows = rows.slice(0, topN);

      const panelY = i * (panelH + panelGap);
      const panel = g.append("g").attr("transform", `translate(0,${panelY})`);

      panel.append("rect")
        .attr("x", -8)
        .attr("y", 0)
        .attr("width", plotW + 16)
        .attr("height", panelH)
        .attr("rx", 12)
        .attr("fill", "#ffffff")
        .attr("stroke", "#c9d9f0");

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
        .attr("fill", "#13213c")
        .attr("font-size", 13)
        .attr("font-weight", 800)
        .attr("letter-spacing", "0.05em")
        .text(String(inc).toUpperCase());

      panel.append("text")
        .attr("x", 10)
        .attr("y", 42)
        .attr("fill", "#51607a")
        .attr("font-size", 11)
        .text(`Showing ${rows.length} countries, sorted by ${sort === "refusal" ? "refusal rate" : "applications"}.`);

      const baseY = panelH - 36;

      // IMPORTANT: x domain uses consulate_country (always unique), so gates don't stack
      const x = d3.scaleBand()
        .domain(rows.map(d => d.consulate_country))
        .range([12, plotW - 12])
        .paddingInner(0.22)
        .paddingOuter(0.08);

      const gateW = x.bandwidth();
      const innerPad = Math.max(2, gateW * 0.14);

      const gates = panel.append("g")
        .attr("clip-path", `url(#${clipId})`)
        .selectAll(".gate")
        .data(rows, d => d.consulate_country)
        .join("g")
        .attr("class", "gate")
        .attr("transform", d => `translate(${x(d.consulate_country)},0)`);

      gates.append("rect")
        .attr("x", 0)
        .attr("y", d => baseY - hScale(d.apps + 1))
        .attr("width", gateW)
        .attr("height", d => hScale(d.apps + 1))
        .attr("fill", "none")
        .attr("stroke", "#2b5aa6")
        .attr("stroke-opacity", 0.32)
        .attr("stroke-width", 1);

      gates.append("rect")
        .attr("x", innerPad)
        .attr("y", d => {
          const H = hScale(d.apps + 1);
          const blocked = H * d.refusal_rate;
          return (baseY - H) + (H - blocked);
        })
        .attr("width", Math.max(2, gateW - innerPad * 2))
        .attr("height", d => {
          const H = hScale(d.apps + 1);
          return Math.max(0, H * d.refusal_rate);
        })
        .attr("fill", d => cScale(d.refusal_rate))
        .attr("opacity", 0.95);

      // use country code label (short, readable)
      gates.append("text")
        .attr("x", gateW / 2)
        .attr("y", baseY + 16)
        .attr("fill", "#51607a")
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .attr("text-anchor", "middle")
        .text(d => d.code);

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
      .attr("fill", "#51607a")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .text("Refusal rate");

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
      .attr("fill", "#51607a")
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