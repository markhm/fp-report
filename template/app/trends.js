// ---- trends: a cumulative flow diagram, replayed from the activity log ----
// The issue list is a SNAPSHOT: it knows what is in progress now and nothing about what
// was in progress in May. So this tab is built from `fp log` instead — every
// "status: A → B", issue_created and issue_deleted the project has recorded. Replaying
// those gives the real count in each status on every past day, rather than the usual
// approximation (assume an issue sat in its current status since createdAt), which
// invents a flat line for exactly the period you wanted to look at.
//
// Reading a CFD: each band's THICKNESS is how much work sat in that status that day.
// A widening band is a queue building up; the top edge is total scope; the base is
// delivery. Bands are stacked most-complete-first, so the finished work forms the floor.
const HISTORY = __FP_HISTORY__;
const HIST = (HISTORY && HISTORY.events) || [];

// Band order, bottom → top. A registry may declare `stack` per status (the shipped one
// does, with the ordering validated for colour separation — see fp-report.status.json).
// Without it: terminal states form the base in registry order, then open work
// most-advanced-first, which is the canonical cumulative-flow reading.
const STACK_ORDER = (()=>{
  const declared = STATUS_LIST.filter(s=>typeof s.stack === "number");
  if(declared.length === STATUS_LIST.length && STATUS_LIST.length)
    return [...STATUS_LIST].sort((a,b)=>a.stack-b.stack).map(s=>s.key);
  return [...STATUS_LIST.filter(s=>s.role!=="open").map(s=>s.key),
          ...STATUS_LIST.filter(s=>s.role==="open").map(s=>s.key).reverse()];
})();
// a status that appears only in history (renamed or retired since) still has to be drawn
const HIST_STATUSES = [...new Set(HIST.filter(e=>e[0]==="s").flatMap(e=>[e[3],e[4]]))]
  .filter(s=>!STACK_ORDER.includes(s));
const TREND_KEYS = [...STACK_ORDER, ...HIST_STATUSES];
const trendMeta = s => STATUS_META[s] || {label:s, color:"var(--muted)"};

const DAY_START = ts => Date.UTC(new Date(ts).getUTCFullYear(), new Date(ts).getUTCMonth(),
                                new Date(ts).getUTCDate());

// ---- per-issue status timelines ----
// Each issue becomes a list of [a,b) → status segments. The rules, in order of trust:
//   born    = its issue_created event, else createdAt from the issue list
//   initial = the `from` of its FIRST transition (exact — the log records what it left),
//             else its current status if it never moved
//   final   = the LIVE status for an issue still in the backlog. This deliberately
//             outranks the last transition's `to`: if a log row is missing, the chart
//             must still land on the same numbers the dashboard shows today.
//   end     = its issue_deleted event, else open-ended
const evBySid = new Map();
for(const e of HIST){ const sid=e[2]; (evBySid.get(sid)||evBySid.set(sid,[]).get(sid)).push(e); }
const bySid = new Map(ISSUES.map(i=>[i.shortId, i]));
const TREND_STATS = {mismatched:0, noCreateEvent:0, deleted:0, guessedInitial:0};

const TIMELINES = (()=>{
  const out = [];
  for(const sid of new Set([...bySid.keys(), ...evBySid.keys()])){
    const evs = evBySid.get(sid) || [];
    const issue = bySid.get(sid) || null;
    const trans = evs.filter(e=>e[0]==="s");
    const created = evs.find(e=>e[0]==="c");
    const deleted = evs.find(e=>e[0]==="d");
    const firstEv = evs.length ? evs[0][1]*1000 : null;

    let born = created ? created[1]*1000
             : (issue ? Date.parse(issue.createdAt) : null);
    if(born==null || isNaN(born)) born = firstEv;
    if(born==null) continue;                       // nothing to place it on the axis with
    if(!created && issue) TREND_STATS.noCreateEvent++;
    // a transition can't predate the issue; trust the log over a later createdAt
    if(trans.length) born = Math.min(born, trans[0][1]*1000);

    let initial;
    if(trans.length)      initial = trans[0][3];
    else if(issue)        initial = issue.status;
    else { initial = TREND_KEYS[0]; TREND_STATS.guessedInitial++; }   // deleted, never moved

    // an issue that is neither live nor explicitly deleted left the backlog silently;
    // stop counting it at its last known event rather than carrying it to today
    const lastEv = evs.length ? evs[evs.length-1][1]*1000 : born;
    const end = deleted ? deleted[1]*1000 : (issue ? Infinity : lastEv);
    if(deleted) TREND_STATS.deleted++;

    const segs = [];
    let t = born, st = initial;
    for(const tr of trans){
      const at = tr[1]*1000;
      if(at > t) segs.push({a:t, b:at, s:st});
      st = tr[4];
      t = Math.max(t, at);
    }
    if(issue && trans.length && st !== issue.status) TREND_STATS.mismatched++;
    if(end > t) segs.push({a:t, b:end, s:issue ? issue.status : st});
    if(segs.length) out.push({sid, issue, segs});
  }
  return out;
})();

// ---- daily series ----
const T0 = TIMELINES.length ? DAY_START(Math.min(...TIMELINES.map(t=>t.segs[0].a))) : DAY_START(NOW);
const dayIdx = ts => Math.floor((ts - T0)/DAY);
const NDAYS = Math.max(1, dayIdx(NOW) + 1);
const dayDate = k => new Date(T0 + k*DAY);

// Segments → ±1 deltas → prefix sum. Sampling is END OF DAY: an issue that moves at
// 10:00 on day k is already in its new status when day k is counted, so a same-day
// round trip nets out instead of showing a phantom day in the middle status.
function seriesFor(timelines){
  const delta = {};
  for(const s of TREND_KEYS) delta[s] = new Array(NDAYS+1).fill(0);
  for(const tl of timelines) for(const sg of tl.segs){
    const d = delta[sg.s] || (delta[sg.s] = new Array(NDAYS+1).fill(0));
    let k = dayIdx(sg.a); if(k < 0) k = 0;            // clip to the window, don't drop
    if(k > NDAYS) continue;
    const m = sg.b === Infinity ? NDAYS+1 : dayIdx(sg.b);
    if(m <= k) continue;                              // opened and left the same day
    d[k] += 1;
    if(m < NDAYS) d[m] -= 1;
  }
  const out = {};
  for(const s in delta){
    const d = delta[s], arr = new Array(NDAYS);
    let run = 0;
    for(let k=0;k<NDAYS;k++){ run += d[k]; arr[k] = run; }
    out[s] = arr;
  }
  return out;
}

// ---- view state ----
const RANGES = [{k:30,l:"30d"},{k:90,l:"90d"},{k:0,l:"All"}];
let trendRange = 0;                                   // 0 = all
const trendHidden = new Set();                        // de-selected status bands
let trendFacet = (FACETS[0]||{}).key || "";
let trendThemes = null;                               // null = every theme (no filter)
let trendTable = false;
let hoverIdx = null;

const trendThemeKeys = f => [...(f.themes||[]).map(t=>t.key), UNTHEMED.key];
const trendFacetOf = k => FACETS.find(f=>f.key===k) || FACETS[0];
const themeFilterActive = () => !!(trendThemes && FACETS.length &&
  trendThemes.size < trendThemeKeys(trendFacetOf(trendFacet)).length);

function visibleTimelines(){
  if(!themeFilterActive()) return TIMELINES;
  const f = trendFacetOf(trendFacet);
  // a deleted issue has no row left to classify, so it can only be counted unfiltered
  return TIMELINES.filter(tl => tl.issue && trendThemes.has(f._index.get(tl.issue.id).key));
}

// ---- chart ----
const fmtDay = (d, withYear) => d.toLocaleDateString(undefined,
  Object.assign({timeZone:"UTC", month:"short", day:"numeric"}, withYear?{year:"numeric"}:{}));
function niceMax(v){
  if(v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for(const m of [1,1.5,2,2.5,5,10]) if(m*p >= v) return m*p;
  return 10*p;
}
const TR = {};                                        // last render, for the hover layer

function renderTrends(){
  const host = document.getElementById("trendChart");
  const W = Math.max(320, Math.round(host.clientWidth || 960));
  const H = W < 560 ? 250 : 330;
  const padL = 42, padR = 12, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const series = seriesFor(visibleTimelines());
  const k1 = NDAYS - 1;
  const k0 = trendRange ? Math.max(0, NDAYS - trendRange) : 0;
  const n = k1 - k0 + 1;
  const stack = TREND_KEYS.filter(s => !trendHidden.has(s));

  let maxTotal = 0;
  for(let k=k0;k<=k1;k++){
    let t = 0; for(const s of stack) t += (series[s]||[])[k] || 0;
    if(t > maxTotal) maxTotal = t;
  }
  const yMax = niceMax(maxTotal);
  const X = j => padL + (n===1 ? plotW/2 : j/(n-1)*plotW);
  const Y = v => padT + plotH - (v/yMax)*plotH;

  // stacked bands, bottom-first
  let prev = new Array(n).fill(0);
  const bands = [];
  for(const s of stack){
    const vals = series[s] || [];
    const tops = new Array(n);
    for(let j=0;j<n;j++) tops[j] = prev[j] + (vals[k0+j] || 0);
    let d = "";
    for(let j=0;j<n;j++)      d += (j?"L":"M") + X(j).toFixed(1) + " " + Y(tops[j]).toFixed(1);
    for(let j=n-1;j>=0;j--)   d += "L" + X(j).toFixed(1) + " " + Y(prev[j]).toFixed(1);
    bands.push({s, d: d+"Z", tops, base: prev});
    prev = tops;
  }
  // the 2px separator between touching fills is drawn in the SURFACE colour — a gap,
  // not a border, so it separates without adding data-weight ink
  const gaps = bands.slice(0, -1).map(b => {
    let d = "";
    for(let j=0;j<n;j++) d += (j?"L":"M") + X(j).toFixed(1) + " " + Y(b.tops[j]).toFixed(1);
    return `<path class="bandgap" d="${d}"/>`;
  }).join("");

  // ticks: ~6 evenly spaced days; years shown only when the span crosses one
  const spanYear = dayDate(k0).getUTCFullYear() !== dayDate(k1).getUTCFullYear();
  const tickN = Math.max(2, Math.min(6, n));
  const tickIdx = [...new Set(Array.from({length:tickN}, (_,i)=>
    Math.round(i*(n-1)/(tickN-1))))];
  const ySteps = 4;
  const grid = Array.from({length:ySteps+1}, (_,i)=>{
    const v = yMax*i/ySteps, y = Y(v).toFixed(1);
    return `<line class="gridline" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>`
         + `<text x="${padL-7}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10.5">${Math.round(v)}</text>`;
  }).join("");
  const xLabels = tickIdx.map(j=>
    `<text x="${X(j).toFixed(1)}" y="${H-8}" text-anchor="${j===0?"start":j===n-1?"end":"middle"}" font-size="10.5">${esc(fmtDay(dayDate(k0+j), spanYear))}</text>`
  ).join("");

  const total = stack.reduce((a,s)=>a + ((series[s]||[])[k1] || 0), 0);
  host.innerHTML =
    `<svg id="trendSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0"
       aria-label="Cumulative flow of ${esc(String(total))} issues across ${esc(String(stack.length))} statuses over ${esc(String(n))} days. Use the table view below for exact values.">
      ${grid}
      ${bands.map(b=>`<path class="band" d="${b.d}" fill="${trendMeta(b.s).color}" fill-opacity="0.8"/>`).join("")}
      ${gaps}
      <line class="axisline" x1="${padL}" y1="${Y(0).toFixed(1)}" x2="${W-padR}" y2="${Y(0).toFixed(1)}"/>
      ${xLabels}
      <line class="crosshair" id="trendCross" x1="0" y1="${padT}" x2="0" y2="${padT+plotH}" style="display:none"/>
    </svg>`;

  Object.assign(TR, {W,H,padL,padT,padB,plotW,plotH,n,k0,k1,X,Y,series,stack,tickIdx,yMax});
  bindChart();
  renderTrendLegend(series, k1);
  renderTrendTable(series);
  renderTrendNote(series, k0, k1);
}

function renderTrendLegend(series, k1){
  // Always present, and it doubles as the control: each chip toggles its band. The
  // de-selected state hollows the swatch and strikes the label, so "off" is never
  // carried by colour alone.
  document.getElementById("trendLegend").innerHTML = TREND_KEYS.map(s=>{
    const on = !trendHidden.has(s), m = trendMeta(s);
    return `<button class="tchip" type="button" data-status="${esc(s)}" aria-pressed="${on}">
      <span class="sw" style="background:${m.color}"></span>${esc(m.label)}
      <span class="tn">${(series[s]||[])[k1] || 0}</span></button>`;
  }).join("");
}

function renderTrendTable(series){
  const el = document.getElementById("trendTable");
  el.hidden = !trendTable;
  if(!trendTable) return;
  const {k0, tickIdx, stack} = TR;
  const rows = tickIdx.map(j=>{
    const k = k0 + j;
    const cells = stack.map(s=>`<td class="num">${(series[s]||[])[k] || 0}</td>`).join("");
    const tot = stack.reduce((a,s)=>a + ((series[s]||[])[k] || 0), 0);
    return `<tr><td>${esc(fmtDay(dayDate(k), true))}</td>${cells}<td class="num"><b>${tot}</b></td></tr>`;
  }).join("");
  el.innerHTML = `<section class="card twrap"><table><thead><tr><th>Date</th>`
    + stack.map(s=>`<th class="num"><span class="sw" style="background:${trendMeta(s).color}"></span>${esc(trendMeta(s).label)}</th>`).join("")
    + `<th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderTrendNote(series, k0, k1){
  const {stack} = TR;
  const at = k => stack.reduce((a,s)=>a + ((series[s]||[])[k] || 0), 0);
  const doneKeys = STATUS_LIST.filter(s=>s.role==="done").map(s=>s.key).filter(s=>stack.includes(s));
  const shipped = doneKeys.reduce((a,s)=>a + (((series[s]||[])[k1]||0) - ((series[s]||[])[k0]||0)), 0);
  const grew = at(k1) - at(k0);
  const span = k1 - k0 + 1;
  const caveats = [];
  if(TREND_STATS.noCreateEvent)
    caveats.push(`${TREND_STATS.noCreateEvent} issue(s) predate the activity log — they enter the chart at their createdAt in their current status, so their early history is flat rather than replayed`);
  if(TREND_STATS.mismatched)
    caveats.push(`${TREND_STATS.mismatched} issue(s) have a live status the log never recorded a move to; the live status wins, so today's totals match the dashboard`);
  if(TREND_STATS.deleted)
    caveats.push(`${TREND_STATS.deleted} deleted issue(s) are counted only for the span they existed`);
  if(themeFilterActive())
    caveats.push(`deleted issues are excluded while a theme filter is on — they have no row left to classify`);
  document.getElementById("trendNote").textContent =
    `${span} days · scope ${grew>=0?"+":""}${grew} to ${at(k1)} tracked items · `
    + `${shipped>=0?"+":""}${shipped} completed over the window. `
    + `Replayed from ${HIST.length} activity-log events — every status change the project recorded. `
    + (caveats.length ? `Caveats: ${caveats.join("; ")}.` : "");
}

// ---- hover / keyboard readout ----
function trendShow(j){
  const {n,k0,X,Y,series,stack,padT,plotH} = TR;
  if(j==null || j<0 || j>=n){ trendHide(); return; }
  hoverIdx = j;
  const svg = document.getElementById("trendSvg"), cross = document.getElementById("trendCross");
  const tip = document.getElementById("trendTip");
  if(!svg || !cross || !tip) return;
  const x = X(j);
  cross.setAttribute("x1", x); cross.setAttribute("x2", x);
  cross.style.display = "";
  // rebuild with textContent: series labels are project data, never markup
  tip.innerHTML = "";
  const head = document.createElement("div");
  head.className = "td";
  head.textContent = fmtDay(dayDate(k0+j), true);
  tip.appendChild(head);
  let total = 0;
  for(const s of [...stack].reverse()){            // top band first, as drawn
    const v = (series[s]||[])[k0+j] || 0; total += v;
    const row = document.createElement("div"); row.className = "tr";
    const key = document.createElement("span"); key.className = "tk";
    key.style.background = trendMeta(s).color;
    const val = document.createElement("span"); val.className = "tv"; val.textContent = String(v);
    const lab = document.createElement("span"); lab.className = "tl";
    lab.textContent = trendMeta(s).label;
    row.appendChild(key); row.appendChild(val); row.appendChild(lab);
    tip.appendChild(row);
  }
  const trow = document.createElement("div"); trow.className = "tr tt-total";
  const tk = document.createElement("span"); tk.className = "tk"; tk.style.background = "transparent";
  const tv = document.createElement("span"); tv.className = "tv"; tv.textContent = String(total);
  const tl = document.createElement("span"); tl.className = "tl"; tl.textContent = "Total";
  trow.appendChild(tk); trow.appendChild(tv); trow.appendChild(tl);
  tip.appendChild(trow);

  const host = document.getElementById("trendChart");
  const scale = (host.clientWidth || TR.W) / TR.W;
  const px = x*scale, flip = px > (host.clientWidth||TR.W)*0.6;
  tip.style.left = flip ? "auto" : (px + 14) + "px";
  tip.style.right = flip ? ((host.clientWidth||TR.W) - px + 14) + "px" : "auto";
  tip.style.top = (padT*scale + 4) + "px";
  tip.classList.add("show");
}
function trendHide(){
  hoverIdx = null;
  const cross = document.getElementById("trendCross"), tip = document.getElementById("trendTip");
  if(cross) cross.style.display = "none";
  if(tip) tip.classList.remove("show");
}
function bindChart(){
  const svg = document.getElementById("trendSvg");
  if(!svg || !svg.addEventListener) return;
  // the pointer only has to be CLOSEST to a day, never land on a 1px line
  const idxAt = ev => {
    const r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
    if(!r || !r.width) return null;
    const xv = (ev.clientX - r.left)/r.width*TR.W;
    const {padL, plotW, n} = TR;
    return Math.max(0, Math.min(n-1, Math.round((xv - padL)/plotW*(n-1))));
  };
  svg.addEventListener("pointermove", ev=>trendShow(idxAt(ev)));
  svg.addEventListener("pointerleave", trendHide);
  svg.addEventListener("focus", ()=>trendShow(hoverIdx==null ? TR.n-1 : hoverIdx));
  svg.addEventListener("blur", trendHide);
  svg.addEventListener("keydown", ev=>{
    if(ev.key!=="ArrowLeft" && ev.key!=="ArrowRight") return;
    ev.preventDefault();
    trendShow(Math.max(0, Math.min(TR.n-1, (hoverIdx==null?TR.n-1:hoverIdx) + (ev.key==="ArrowRight"?1:-1))));
  });
}

// ---- controls ----
function renderTrendControls(){
  const f = FACETS.length ? trendFacetOf(trendFacet) : null;
  const keys = f ? trendThemeKeys(f) : [];
  if(f && !trendThemes) trendThemes = new Set(keys);
  const allOn = !themeFilterActive();
  const el = document.getElementById("trendControls");
  let html = `<span class="lbl">Range</span>`
    + RANGES.map(r=>`<button class="facet${trendRange===r.k?" active":""}" type="button" data-range="${r.k}">${r.l}</button>`).join("");
  if(f){
    html += `<span class="sep"></span>`;
    if(FACETS.length > 1)
      html += FACETS.map(x=>`<button class="facet${x.key===f.key?" active":""}" type="button" data-tfacet="${esc(x.key)}">${esc(x.label||x.key)}</button>`).join("")
            + `<span class="sep"></span>`;
    html += `<span class="lbl">${esc(f.label||"Theme")}</span>`
      + `<button class="facet${allOn?" active":""}" type="button" data-theme-all="1">All</button>`
      + keys.map(k=>{
          const t = (f.themes||[]).find(x=>x.key===k) || UNTHEMED;
          const on = trendThemes.has(k);
          return `<button class="facet${on&&!allOn?" active":""}" type="button" data-ttheme="${esc(k)}" aria-pressed="${on}">${esc(t.label||k)}</button>`;
        }).join("");
  }
  html += `<span class="sep"></span>`
    + `<button class="facet${trendTable?" active":""}" type="button" data-ttable="1" aria-pressed="${trendTable}">Table view</button>`;
  el.innerHTML = html;
}

if(!HIST.length || !TIMELINES.length){
  // No activity log (FETCH_HISTORY=false, an offline render, or an fp without `fp log`)
  // — there is nothing to replay, so drop the tab rather than ship an empty chart.
  const tab = document.querySelector('.tab[data-panel="panel-trends"]');
  if(tab) tab.hidden = true;
  const panel = document.getElementById("panel-trends");
  if(panel) panel.hidden = true;
} else {
  document.getElementById("tabTrendsN").textContent = NDAYS + "d";
  renderTrendControls();
  renderTrends();
  document.getElementById("trendControls").addEventListener("click", ev=>{
    const b = ev.target.closest("button"); if(!b) return;
    const d = b.dataset;
    if(d.range != null)       trendRange = +d.range;
    else if(d.tfacet)       { trendFacet = d.tfacet; trendThemes = null; }
    else if(d.themeAll)       trendThemes = new Set(trendThemeKeys(trendFacetOf(trendFacet)));
    else if(d.ttheme){
      // first pick from "all" narrows to just that theme; after that it's a plain toggle
      if(!themeFilterActive()) trendThemes = new Set([d.ttheme]);
      else if(trendThemes.has(d.ttheme)) trendThemes.delete(d.ttheme);
      else trendThemes.add(d.ttheme);
      if(!trendThemes.size) trendThemes = new Set(trendThemeKeys(trendFacetOf(trendFacet)));
    }
    else if(d.ttable)         trendTable = !trendTable;
    else return;
    renderTrendControls(); renderTrends();
  });
  document.getElementById("trendLegend").addEventListener("click", ev=>{
    const b = ev.target.closest(".tchip"); if(!b) return;
    const s = b.dataset.status;
    if(trendHidden.has(s)) trendHidden.delete(s);
    else if(trendHidden.size < TREND_KEYS.length-1) trendHidden.add(s);   // never hide them all
    renderTrends();
  });
  // the panel is hidden at load, so its width is only real once the tab is opened
  document.getElementById("tabs").addEventListener("click", ev=>{
    const b = ev.target.closest(".tab");
    if(b && b.dataset.panel === "panel-trends") renderTrends();
  });
  let rzT = null;
  if(typeof addEventListener === "function") addEventListener("resize", ()=>{
    clearTimeout(rzT);
    rzT = setTimeout(()=>{
      const p = document.getElementById("panel-trends");
      if(p && !p.hidden) renderTrends();
    }, 150);
  });
}
