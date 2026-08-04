// ---- flow: the derivative of the cumulative flow ----
// Trends answers "how much sat where". Flow answers "how much MOVED, and when" — the
// same replay differentiated: per day/week/month, how many issues arrived and how many
// left. It reads as a diverging column chart because arrivals and departures are opposite
// signs of one quantity, so direction carries the distinction and hue never has to.
//
// Completed and Dropped are deliberately separate bars: a rejected or deferred issue
// leaves the backlog without being delivered, and folding it into "solved" would flatter
// throughput. Keeping them apart also preserves the arithmetic — opened minus closed is
// exactly the backlog's net change, which is what the net line draws.
const FLOW_DONE  = s => DONE.has(s);
const FLOW_DROP  = s => !DONE.has(s) && TERMINAL_ROLE.has(s);
// a status the registry doesn't know (a renamed stage) counts as live, not as departed —
// same call as the Trends bands, and for the same reason
const flowClass = s => FLOW_DONE(s) ? "done" : (FLOW_DROP(s) ? "dropped" : "open");

// ---- bucketing ----
const wkStart = ts => {                       // ISO week: Monday 00:00 UTC
  const d = new Date(ts), dow = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
};
const moStart = ts => { const d = new Date(ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const FLOW_GRAN = {
  day:   {label:"Day",   start: ts => DAY_START(ts),
          next: t => t + DAY,
          fmt: t => new Date(t).toLocaleDateString(undefined, {timeZone:"UTC", month:"short", day:"numeric"})},
  week:  {label:"Week",  start: wkStart,
          next: t => t + 7*DAY,
          fmt: t => "w/c " + new Date(t).toLocaleDateString(undefined, {timeZone:"UTC", month:"short", day:"numeric"})},
  month: {label:"Month", start: moStart,
          next: t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 1); },
          fmt: t => new Date(t).toLocaleDateString(undefined, {timeZone:"UTC", month:"short", year:"numeric"})},
};
let flowGran = "week", flowTable = false, flowHidden = new Set(), flowHover = null;

// ---- events → per-bucket tallies ----
// Everything is NET: a reopen is a negative completion in its bucket, and a deleted issue
// gives back whatever it was counted as. That is what makes the columns sum to today's
// backlog instead of drifting from it.
const FLOW_STATS = {reopened:0, undropped:0, deleted:0};
function flowEvents(timelines){
  const ev = [];                                    // {t, opened, completed, dropped, deleted}
  const add = (t, k, n) => ev.push({t, k, n});
  for(const tl of timelines){
    add(tl.segs[0].a, "opened", 1);
    let prev = null;
    for(const sg of tl.segs){
      const c = flowClass(sg.s);
      if(c !== prev){
        if(c === "done")        add(sg.a, "completed", 1);
        if(prev === "done")   { add(sg.a, "completed", -1); FLOW_STATS.reopened++; }
        if(c === "dropped")     add(sg.a, "dropped", 1);
        if(prev === "dropped"){ add(sg.a, "dropped", -1); FLOW_STATS.undropped++; }
        prev = c;
      }
    }
    const last = tl.segs[tl.segs.length-1];
    if(last.b !== Infinity){                        // deleted: hand back what it was counted as
      if(prev === "done")    add(last.b, "completed", -1);
      if(prev === "dropped") add(last.b, "dropped", -1);
      add(last.b, "deleted", 1);
      FLOW_STATS.deleted++;
    }
  }
  return ev;
}
// bucket list spanning the window, oldest first
function flowBuckets(from, to){
  const g = FLOW_GRAN[flowGran], out = [];
  let t = g.start(from);
  while(t <= to){ out.push(t); t = g.next(t); }
  return out;
}
function flowSeries(timelines, from, to){
  const g = FLOW_GRAN[flowGran], keys = flowBuckets(from, to);
  const idx = new Map(keys.map((t,i)=>[t,i]));
  const z = () => new Array(keys.length).fill(0);
  const out = {keys, opened:z(), completed:z(), dropped:z(), deleted:z()};
  for(const e of flowEvents(timelines)){
    if(e.t < from || e.t > to) continue;
    const i = idx.get(g.start(e.t));
    if(i == null) continue;
    out[e.k][i] += e.n;
  }
  return out;
}

// ---- palette ----
// Only two pairs ever touch: completed/dropped (stacked) and opened/completed (across the
// axis). Both clear the colour gates. Opened vs Dropped is never resolved by hue — they sit
// on opposite sides of the zero line and the legend marks them ▲/▼ — which is what lets this
// work at all: no triple of this theme's tokens separates cleanly alongside green, because
// the dark greys are lavender and every warm alternative collides with green under CVD.
const FLOW_META = {
  opened:    {label:"Opened",    color:"var(--aqua)",  dir:"▲"},
  completed: {label:"Completed", color:"var(--good)",  dir:"▼"},
  dropped:   {label:"Dropped",   color:"var(--muted)", dir:"▼"},
  net:       {label:"Net change", color:"var(--head)", dir:"—"},
};
const FLOW_KEYS = ["opened","completed","dropped","net"];
const FR = {};

function renderFlow(){
  const host = document.getElementById("flowChart");
  const W = Math.max(320, Math.round(host.clientWidth || 960));
  const H = W < 560 ? 260 : 340;
  const padL = 42, padR = 12, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const to = NOW;
  const from = trendRange ? Math.max(T0, NOW - trendRange*DAY) : T0;
  const S = flowSeries(visibleTimelines(), from, to);
  const n = S.keys.length;
  const show = k => !flowHidden.has(k);

  const up   = i => show("opened") ? S.opened[i] : 0;
  const down = i => (show("completed") ? S.completed[i] : 0) + (show("dropped") ? S.dropped[i] : 0);
  const net  = i => S.opened[i] - S.completed[i] - S.dropped[i];

  let hi = 0;
  for(let i=0;i<n;i++){
    hi = Math.max(hi, Math.abs(up(i)), Math.abs(down(i)));
    if(show("net")) hi = Math.max(hi, Math.abs(net(i)));
  }
  // symmetric around zero: the same step above and below, so a bar of 8 up and a bar of 8
  // down are the same length — the whole point of a diverging chart
  const half = niceAxis(hi), yMax = half*2;
  const Y = v => padT + plotH/2 - (v/half)*(plotH/2);
  const slot = plotW/Math.max(1,n);
  const BW = Math.min(24, Math.max(2, slot - 2));   // ≤24px, 2px gap between neighbours
  const X = i => padL + slot*i + slot/2;

  // a bar grows from the baseline with a rounded outer end and a square foot
  const bar = (i, from_, to_, color) => {
    const y0 = Y(from_), y1 = Y(to_), top = Math.min(y0,y1), h = Math.abs(y1-y0);
    if(h < 0.4) return "";
    const r = Math.min(4, h, BW/2), x = X(i)-BW/2;
    const down_ = y1 > y0;
    return `<path d="${down_
      ? `M${x} ${top}h${BW}v${h-r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(BW-2*r)}a${r} ${r} 0 0 1 ${-r} ${-r}z`
      : `M${x} ${top+r}a${r} ${r} 0 0 1 ${r} ${-r}h${BW-2*r}a${r} ${r} 0 0 1 ${r} ${r}v${h-r}h${-BW}z`}"
      fill="${color}" fill-opacity="0.85"/>`;
  };

  let marks = "";
  for(let i=0;i<n;i++){
    if(show("opened")) marks += bar(i, 0, S.opened[i], FLOW_META.opened.color);
    let base = 0;
    if(show("completed")){ marks += bar(i, base, base - S.completed[i], FLOW_META.completed.color); base -= S.completed[i]; }
    if(show("dropped"))  { marks += bar(i, base, base - S.dropped[i],   FLOW_META.dropped.color); }
  }
  const netPath = show("net") && n > 1
    ? `<path class="flownet" d="${S.keys.map((_,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(net(i)).toFixed(1)).join("")}"/>`
    : "";

  const grid = Array.from({length:Y_STEPS+1}, (_,i)=>{
    const v = half - (yMax*i/Y_STEPS), y = Y(v).toFixed(1);
    return `<line class="${Math.abs(v)<0.001?"axisline":"gridline"}" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>`
         + `<text x="${padL-7}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10.5">${Math.round(Math.abs(v))}</text>`;
  }).join("");
  const every = Math.max(1, Math.ceil(n/6));
  const xLabels = S.keys.map((t,i)=> i%every ? "" :
    `<text x="${X(i).toFixed(1)}" y="${H-9}" text-anchor="middle" font-size="10.5">${esc(FLOW_GRAN[flowGran].fmt(t))}</text>`).join("");
  // one full-height hit band per bucket — the bars are far thinner than a reliable target
  const hits = S.keys.map((_,i)=>
    `<rect class="flowhit" data-i="${i}" x="${(padL+slot*i).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent"/>`).join("");

  host.innerHTML =
    `<svg id="flowSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0"
       aria-label="Issues opened, completed and dropped per ${esc(flowGran)} over ${esc(String(n))} periods. Use the table view below for exact values.">
      ${grid}${marks}${netPath}${xLabels}
      <line class="crosshair" id="flowCross" x1="0" y1="${padT}" x2="0" y2="${padT+plotH}" style="display:none"/>
      ${hits}
    </svg>`;

  Object.assign(FR, {W,H,padL,padT,plotH,slot,n,S,X,Y,net,from,to});
  bindFlow();
  renderFlowLegend(S);
  renderFlowTable(S);
  renderFlowNote(S);
}

function renderFlowLegend(S){
  const sum = k => S[k].reduce((a,b)=>a+b, 0);
  document.getElementById("flowLegend").innerHTML = FLOW_KEYS.map(k=>{
    const m = FLOW_META[k], on = !flowHidden.has(k);
    const total = k==="net" ? sum("opened")-sum("completed")-sum("dropped") : sum(k);
    // the ▲/▼ glyph is not decoration: opened and dropped are told apart by DIRECTION,
    // never by hue, so the legend has to carry that channel too
    const sw = k==="net"
      ? `background:linear-gradient(${m.color},${m.color}) center/100% 2.5px no-repeat`
      : `background:${m.color}`;
    return `<button class="tchip" type="button" data-flow="${esc(k)}" aria-pressed="${on}">
      <span class="sw" style="${sw}"></span>${esc(m.dir)} ${esc(m.label)}
      <span class="tn">${total>0&&k==="net"?"+":""}${total}</span></button>`;
  }).join("");
}

function renderFlowTable(S){
  const el = document.getElementById("flowTable");
  el.hidden = !flowTable;
  if(!flowTable) return;
  const rows = S.keys.map((t,i)=>{
    const nt = S.opened[i]-S.completed[i]-S.dropped[i];
    return `<tr><td>${esc(FLOW_GRAN[flowGran].fmt(t))}</td>`
      + `<td class="num">${S.opened[i]}</td><td class="num">${S.completed[i]}</td>`
      + `<td class="num">${S.dropped[i]}</td><td class="num"><b>${nt>0?"+":""}${nt}</b></td></tr>`;
  }).reverse().join("");
  el.innerHTML = `<section class="card twrap"><table><thead><tr><th>${esc(FLOW_GRAN[flowGran].label)}</th>`
    + ["opened","completed","dropped"].map(k=>
        `<th class="num"><span class="sw" style="background:${FLOW_META[k].color}"></span>${esc(FLOW_META[k].label)}</th>`).join("")
    + `<th class="num">Net</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderFlowNote(S){
  const sum = k => S[k].reduce((a,b)=>a+b, 0);
  const o = sum("opened"), c = sum("completed"), d = sum("dropped"), nt = o-c-d;
  const per = FLOW_GRAN[flowGran].label.toLowerCase();
  const live = S.keys.length || 1;
  const caveats = [];
  if(FLOW_STATS.reopened)  caveats.push(`${FLOW_STATS.reopened} reopening(s) count as a negative completion in their ${per}, so the columns still sum to today's backlog`);
  if(FLOW_STATS.undropped) caveats.push(`${FLOW_STATS.undropped} issue(s) came back out of a terminal status`);
  // finite-ended timelines: an explicit issue_deleted, or an issue that is simply no longer
  // in the backlog with no event to say why. Both hand back what they were last counted as.
  if(FLOW_STATS.deleted)   caveats.push(`${FLOW_STATS.deleted} issue(s) left the backlog (deleted, or removed with no logged event) and hand back whatever they were last counted as`);
  document.getElementById("flowNote").textContent =
    `${S.keys.length} ${per}s · ${o} opened · ${c} completed · ${d} dropped · `
    + `net ${nt>=0?"+":""}${nt} (${(o/live).toFixed(1)} in / ${((c+d)/live).toFixed(1)} out per ${per}). `
    + `Completed and Dropped are counted separately so work that was rejected or deferred is `
    + `never reported as solved. `
    + (caveats.length ? `Caveats: ${caveats.join("; ")}.` : "");
}

// ---- hover / keyboard ----
function flowShow(i){
  const {n,S,X,padT,net} = FR;
  if(i==null || i<0 || i>=n){ flowHide(); return; }
  flowHover = i;
  const svg = document.getElementById("flowSvg"), cross = document.getElementById("flowCross");
  const tip = document.getElementById("flowTip");
  if(!svg || !cross || !tip) return;
  cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = "";
  tip.innerHTML = "";
  const head = document.createElement("div");
  head.className = "td"; head.textContent = FLOW_GRAN[flowGran].fmt(S.keys[i]);
  tip.appendChild(head);
  const row = (k, v, cls) => {
    const r = document.createElement("div"); r.className = "tr" + (cls?" "+cls:"");
    const key = document.createElement("span"); key.className = "tk";
    key.style.background = FLOW_META[k].color;
    const val = document.createElement("span"); val.className = "tv";
    val.textContent = (k==="net" && v>0 ? "+" : "") + v;
    const lab = document.createElement("span"); lab.className = "tl";
    lab.textContent = FLOW_META[k].dir + " " + FLOW_META[k].label;
    r.appendChild(key); r.appendChild(val); r.appendChild(lab); tip.appendChild(r);
  };
  row("opened", S.opened[i]); row("completed", S.completed[i]); row("dropped", S.dropped[i]);
  row("net", net(i), "tt-total");
  const host = document.getElementById("flowChart");
  const scale = (host.clientWidth || FR.W)/FR.W, px = X(i)*scale;
  const flip = px > (host.clientWidth||FR.W)*0.6;
  tip.style.left  = flip ? "auto" : (px + 14) + "px";
  tip.style.right = flip ? ((host.clientWidth||FR.W) - px + 14) + "px" : "auto";
  tip.style.top   = (padT*scale + 4) + "px";
  tip.classList.add("show");
}
function flowHide(){
  flowHover = null;
  const c = document.getElementById("flowCross"), t = document.getElementById("flowTip");
  if(c) c.style.display = "none";
  if(t) t.classList.remove("show");
}
function bindFlow(){
  const svg = document.getElementById("flowSvg");
  if(!svg || !svg.addEventListener) return;
  const idxAt = ev => {
    const r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
    if(!r || !r.width) return null;
    const xv = (ev.clientX - r.left)/r.width*FR.W;
    return Math.max(0, Math.min(FR.n-1, Math.floor((xv - FR.padL)/FR.slot)));
  };
  svg.addEventListener("pointermove", ev=>flowShow(idxAt(ev)));
  svg.addEventListener("pointerleave", flowHide);
  svg.addEventListener("focus", ()=>flowShow(flowHover==null ? FR.n-1 : flowHover));
  svg.addEventListener("blur", flowHide);
  svg.addEventListener("keydown", ev=>{
    if(ev.key!=="ArrowLeft" && ev.key!=="ArrowRight") return;
    ev.preventDefault();
    flowShow(Math.max(0, Math.min(FR.n-1, (flowHover==null?FR.n-1:flowHover) + (ev.key==="ArrowRight"?1:-1))));
  });
}

function renderFlowControls(){
  const f = FACETS.length ? trendFacetOf(trendFacet) : null;
  let html = `<span class="lbl">Bucket</span>`
    + Object.keys(FLOW_GRAN).map(g=>
        `<button class="facet${flowGran===g?" active":""}" type="button" data-fgran="${g}">${FLOW_GRAN[g].label}</button>`).join("")
    + `<span class="sep"></span><span class="lbl">Range</span>`
    + RANGES.map(r=>`<button class="facet${trendRange===r.k?" active":""}" type="button" data-frange="${r.k}">${r.l}</button>`).join("");
  if(f){
    const keys = trendThemeKeys(f), allOn = !themeFilterActive();
    html += `<span class="sep"></span><span class="lbl">${esc(f.label||"Theme")}</span>`
      + `<button class="facet${allOn?" active":""}" type="button" data-ftheme-all="1">All</button>`
      + keys.map(k=>{
          const t = (f.themes||[]).find(x=>x.key===k) || UNTHEMED;
          return `<button class="facet${trendThemes.has(k)&&!allOn?" active":""}" type="button" data-ftheme="${esc(k)}" aria-pressed="${trendThemes.has(k)}">${esc(t.label||k)}</button>`;
        }).join("");
  }
  html += `<span class="sep"></span><button class="facet${flowTable?" active":""}" type="button" data-ftable="1" aria-pressed="${flowTable}">Table view</button>`;
  document.getElementById("flowControls").innerHTML = html;
}

if(!HIST.length || !TIMELINES.length){
  const tab = document.querySelector('.tab[data-panel="panel-flow"]');
  if(tab) tab.hidden = true;
  const panel = document.getElementById("panel-flow");
  if(panel) panel.hidden = true;
} else {
  renderFlowControls();
  renderFlow();
  document.getElementById("tabFlowN").textContent =
    flowSeries(TIMELINES, T0, NOW).opened.reduce((a,b)=>a+b,0);
  document.getElementById("flowControls").addEventListener("click", ev=>{
    const b = ev.target.closest("button"); if(!b) return;
    const d = b.dataset;
    if(d.fgran)            flowGran = d.fgran;
    else if(d.frange != null) trendRange = +d.frange;
    else if(d.fthemeAll)   trendThemes = new Set(trendThemeKeys(trendFacetOf(trendFacet)));
    else if(d.ftheme){
      if(!themeFilterActive()) trendThemes = new Set([d.ftheme]);
      else if(trendThemes.has(d.ftheme)) trendThemes.delete(d.ftheme);
      else trendThemes.add(d.ftheme);
      if(!trendThemes.size) trendThemes = new Set(trendThemeKeys(trendFacetOf(trendFacet)));
    }
    else if(d.ftable)      flowTable = !flowTable;
    else return;
    renderFlowControls(); renderFlow();
  });
  document.getElementById("flowLegend").addEventListener("click", ev=>{
    const b = ev.target.closest(".tchip"); if(!b) return;
    const k = b.dataset.flow;
    if(flowHidden.has(k)) flowHidden.delete(k);
    else if(FLOW_KEYS.filter(x=>!flowHidden.has(x)).length > 1) flowHidden.add(k);
    renderFlow();
  });
  document.getElementById("tabs").addEventListener("click", ev=>{
    const b = ev.target.closest(".tab");
    if(b && b.dataset.panel === "panel-flow") renderFlow();
  });
  let vrzT = null;
  if(typeof addEventListener === "function") addEventListener("resize", ()=>{
    clearTimeout(vrzT);
    vrzT = setTimeout(()=>{
      const p = document.getElementById("panel-flow");
      if(p && !p.hidden) renderFlow();
    }, 150);
  });
}
