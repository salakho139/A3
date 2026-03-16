// gates.js
// ok, load the csv, then draw “gate” shapes, not too deep, just enough to look good

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

function fmtInt(x) {
  return d3.format(",")(Math.round(x));
}

function fmtPct(x) {
  return d3.format(".1%")(x);
}

function incomeRank(name) {
  const i = incomeOrder.indexOf(name);
  return i === -1 ? 999 : i;
}

// resize helper
function getSize() {
  const w = CHART_DIV.node().clientWidth;
  return { width: w, height: 820 }; // a bit tall, so panels breathe
}

function colorScale(maxRefusal) {
  return d3.scaleSequential(d3.interpolateReds).domain([0, maxRefusal || 0.8]);
}

function showTip(event, d) {
  tooltip
    .style("opacity", 1)
    .html(`
      <div style="font-weight:700;margin-bottom:6px">${d.consulate_country}</div>
      <div>year: <b>${d.year}</b></div>
      <div>reporting state: <b>${d.reporting_state}</b></div>
      <div>income group: <b>${d.income_group}</b></div>
      <div>region: <b>${d.region}</b></div>
      <hr style="border:0;border-top:1px solid #2b2f3a;margin:8px 0">
      <div>applications: <b>${fmtInt(d.apps)}</b></div>
      <div>issued: <b>${fmtInt(d.issued)}</b></div>
      <div>not issued: <b>${fmtInt(d.not_issued)}</b></div>
      <div>refusal rate: <b>${fmtPct(d.refusal_rate)}</b></div>
    `);

  moveTip(event);
}

function moveTip(event) {
  const pad = 14;
  tooltip
    .style("left", (event.clientX + pad) + "px")
    .style("top",  (event.clientY + pad) + "px");
}

function hideTip() {
  tooltip.style("opacity", 0);
}

d3.csv("data/gates.csv", d => ({
  year: +d.year,
  reporting_state: d.reporting_state,
  consulate_country: d.consulate_country,
  income_group: d.income_group || "Not classified",
  region: d.region || "Unknown",
  apps: +d.apps,
  issued: +d.issued,
  not_issued: +d.not_issued,
  refusal_rate: +d.refusal_rate
})).then(data => {

  // fill dropdowns
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

  // defaults, pick something that exists
  selState.property("value", states.includes("France") ? "France" : states[0]);
  selYear.property("value", years.includes(2022) ? 2022 : years[years.length - 1]);

  // draw once, then update on change
  function update() {
    const state = selState.property("value");
    const year  = +selYear.property("value");
    const sort  = selSort.property("value");
    const topN  = +selTopN.property("value");

    const filtered = data.filter(d => d.reporting_state === state && d.year === year);

    // global scales for this view
    const maxApps = d3.max(filtered, d => d.apps) || 1;
    const maxRef  = d3.max(filtered, d => d.refusal_rate) || 0.8;

    const { width, height } = getSize();
    CHART_DIV.selectAll("*").remove();

    const svg = CHART_DIV.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "auto");

    const margin = { top: 20, right: 18, bottom: 18, left: 18 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // group into income panels
    const byIncome = d3.group(filtered, d => d.income_group);
    const incomeKeys = Array.from(byIncome.keys()).sort((a,b) => incomeRank(a) - incomeRank(b));

    const panelGap = 18;
    const panelH = (innerH - panelGap * (incomeKeys.length - 1)) / Math.max(1, incomeKeys.length);

    // height mapping, sqrt keeps small countries visible, without the log drama
    const hScale = d3.scaleSqrt().domain([0, maxApps]).range([0, panelH - 55]);

    const cScale = colorScale(maxRef);

    incomeKeys.forEach((inc, i) => {
      let rows = byIncome.get(inc) || [];

      rows = rows.filter(d => d.apps > 0);

      if (sort === "refusal") {
        rows.sort((a,b) => d3.descending(a.refusal_rate, b.refusal_rate));
      } else {
        rows.sort((a,b) => d3.descending(a.apps, b.apps));
      }

      if (topN !== 9999) rows = rows.slice(0, topN);

      const panelY = i * (panelH + panelGap);
      const panel = g.append("g").attr("transform", `translate(0,${panelY})`);

      panel.append("text")
        .attr("x", 0)
        .attr("y", 14)
        .attr("fill", "#e8e8e8")
        .attr("font-size", 13)
        .attr("font-weight", 700)
        .text(inc);

      panel.append("text")
        .attr("x", 0)
        .attr("y", 32)
        .attr("fill", "#bdbdbd")
        .attr("font-size", 11)
        .text(`showing ${rows.length} countries, sorted by ${sort === "refusal" ? "refusal rate" : "applications"}`);

      const baseY = panelH - 10;

      const x = d3.scaleBand()
        .domain(rows.map(d => d.consulate_country))
        .range([0, innerW])
        .paddingInner(0.18)
        .paddingOuter(0.05);

      const gateW = x.bandwidth();
      const innerPad = Math.max(1, gateW * 0.12);

      const gates = panel.selectAll(".gate")
        .data(rows, d => d.consulate_country)
        .join("g")
        .attr("class", "gate")
        .attr("transform", d => `translate(${x(d.consulate_country)},0)`);

      // frame
      gates.append("rect")
        .attr("x", 0)
        .attr("y", d => baseY - hScale(d.apps))
        .attr("width", gateW)
        .attr("height", d => hScale(d.apps))
        .attr("fill", "none")
        .attr("stroke", "#3a4052")
        .attr("stroke-width", 1);

      // blocked part (not issued), from top, so it looks like the gate is “closed”
      gates.append("rect")
        .attr("x", innerPad)
        .attr("y", d => {
          const H = hScale(d.apps);
          const blocked = H * d.refusal_rate;
          return (baseY - H) + (H - blocked);
        })
        .attr("width", Math.max(1, gateW - innerPad * 2))
        .attr("height", d => {
          const H = hScale(d.apps);
          return Math.max(0, H * d.refusal_rate);
        })
        .attr("fill", d => cScale(d.refusal_rate))
        .attr("opacity", 0.95);

      // tiny country label, rotated, readable-ish for top 30
      gates.append("text")
        .attr("x", gateW / 2)
        .attr("y", baseY + 8)
        .attr("fill", "#9aa0b2")
        .attr("font-size", 9)
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-60)`)
        .text(d => d.consulate_country);

      // hover
      gates
        .on("mouseenter", (event, d) => showTip(event, d))
        .on("mousemove", (event) => moveTip(event))
        .on("mouseleave", hideTip);
    });

    // small legend, not fancy
    const leg = g.append("g").attr("transform", `translate(${innerW - 230},0)`);
    leg.append("text")
      .attr("x", 0)
      .attr("y", 14)
      .attr("fill", "#bdbdbd")
      .attr("font-size", 11)
      .text("refusal rate");

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
      .attr("class", "pct")
      .attr("x", (d,i) => i === 0 ? 0 : steps.length * 20 - 2)
      .attr("y", 44)
      .attr("fill", "#9aa0b2")
      .attr("font-size", 10)
      .attr("text-anchor", (d,i) => i === 0 ? "start" : "end")
      .text(d => fmtPct(d));
  }

  // hook up events
  selState.on("change", update);
  selYear.on("change", update);
  selSort.on("change", update);
  selTopN.on("change", update);

  // redraw on resize, so it doesnt look busted
  window.addEventListener("resize", update);

  update();
});