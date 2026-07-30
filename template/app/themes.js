// ---- themes ----
// Every issue lands in exactly ONE theme per facet, so tile counts sum to the backlog.
// The theme is resolved in descending order of trust:
//   1. label    — an fp label matching a theme key (ties broken by taxonomy order)
//   2. inherited— an epic's children belong to their epic's theme. This outranks the
//                 issue's own keywords ON PURPOSE: an initiative that fragments across
//                 five tiles because each sub-issue matched a different word is exactly
//                 what stops a "where to focus" page from helping you focus. A child
//                 leaves its epic's theme only by carrying its own label (rule 1).
//   3. inferred — weighted keyword match on title (×3) + description. This is how epics
//                 and standalone issues get classified — and how a child of an
//                 *unthemed* parent still finds a home.
//   4. unthemed — no signal at all; the tile that says "these need labelling"
const FACETS = (THEMES_CONFIG.facets||[]).filter(f=>(f.themes||[]).length);
const TH_MIN = THEMES_CONFIG.threshold ?? 5;
const TH_DESC = THEMES_CONFIG.descriptionChars ?? 1500;
const UNTHEMED = {key:"__unthemed", label:"Unthemed", color:"neutral"};
for(const f of FACETS){
  for(const t of f.themes){
    // one alternation per bucket, compiled once — the classifier runs over every issue
    t._strong = (t.strong||[]).length ? new RegExp((t.strong||[]).join("|"), "gi") : null;
    t._weak   = (t.weak  ||[]).length ? new RegExp((t.weak  ||[]).join("|"), "gi") : null;
    t._color  = statusColor(t.color);
  }
}
UNTHEMED._color = statusColor(UNTHEMED.color);
const hits = (re, s) => { if(!re) return 0; const m = s.match(re); return m ? m.length : 0; };

const labelTheme = (i, f) => {
  const labels = (i.properties && i.properties.labels) || [];
  for(const t of f.themes) if(labels.includes(t.key)) return {key:t.key, src:"label"};
  return null;
};
function ownTheme(i, f){
  const byLabel = labelTheme(i, f); if(byLabel) return byLabel;
  const title = (i.title||"").toLowerCase();
  const desc  = (i.description||"").slice(0, TH_DESC).toLowerCase();
  let best=null, bestScore=0;
  for(const t of f.themes){
    const s = 6*hits(t._strong,title) + 3*hits(t._weak,title)
            + 2*hits(t._strong,desc)  + 1*hits(t._weak,desc);
    if(s > bestScore){ bestScore=s; best=t.key; }
  }
  return bestScore >= (f.threshold ?? TH_MIN) ? {key:best, src:"inferred"} : null;
}
// issueId -> {key, src} for one facet. `busy` guards a malformed parent cycle.
function themeIndex(f){
  const out = new Map(), busy = new Set();
  const resolve = i => {
    if(out.has(i.id)) return out.get(i.id);
    if(busy.has(i.id)) return {key:UNTHEMED.key, src:"none"};
    busy.add(i.id);
    // an own label wins outright; otherwise a child follows its epic before its own words
    let r = labelTheme(i, f);
    if(!r && i.parent && byId.has(i.parent)){
      const p = resolve(byId.get(i.parent));
      if(p.key !== UNTHEMED.key) r = {key:p.key, src:"inherited"};
    }
    if(!r) r = ownTheme(i, f);
    if(!r) r = {key:UNTHEMED.key, src:"none"};
    busy.delete(i.id); out.set(i.id, r);
    return r;
  };
  for(const i of ISSUES) resolve(i);
  return out;
}
for(const f of FACETS) f._index = themeIndex(f);
let facetKey = (FACETS[0]||{}).key || "";
const PRIO_ROWS = ["critical","high","medium","low","unset"];
// "hide done" (the tab-bar toggle) drops the done + terminal segments from every tile, so
// the bars show live work only. Default ON: on a backlog that is 3/4 complete, done fills
// every bar and all themes collapse to the same shape — a theme whose only "critical" work
// shipped months ago should not open looking like it has critical work.
let showDone = false;
const facetOf = k => FACETS.find(f=>f.key===k) || FACETS[0];

// per-theme roll-up for one facet.
// Counts are over LEAF issues only. An epic's status is a roll-up of its children, not
// separate work: 8 of MC's 14 "in progress" were epics in progress *because a child was*,
// which double-counted the same work and made WIP look sprayed across every theme. Epics
// are still surfaced — as their own "N epics" figure, which is what they actually measure.
function themeStats(f){
  const bucket = new Map([...f.themes, UNTHEMED].map(t=>[t.key, {t, all:[], open:[], epics:[]}]));
  for(const i of ISSUES){
    const b = bucket.get(f._index.get(i.id).key); if(!b) continue;
    if(kids.has(i.id)){ b.epics.push(i); continue; }
    b.all.push(i); if(i._open) b.open.push(i);
  }
  return [...bucket.values()].map(b=>({
    t: b.t,
    total: b.all.length,
    open: b.open.length,
    done: b.all.filter(i=>DONE.has(i.status)).length,
    other: b.all.filter(i=>!DONE.has(i.status) && !i._open).length,
    // One row per priority, each segmented by status. `topLevel` is carried per row
    // because only TOP-LEVEL priority is globally comparable — inside an epic "critical"
    // ranks a sub-issue against its siblings (sequencing, not urgency), which is why it
    // is reported in the row's tooltip rather than silently pooled with the rest.
    prio: PRIO_ROWS.map(p=>{
      const items = b.all.filter(i=>prioKey(i.priority)===p);
      const live = items.filter(i=>i._open);
      return {
        p, meta: PRIO_META[p], total: items.length,
        topLevel: items.filter(i=>!i.parent).length,
        openTotal: live.length, openTopLevel: live.filter(i=>!i.parent).length,
        byStatus: OPEN_ORDER.map(s=>({s, n:items.filter(i=>i.status===s).length})),
        done: items.filter(i=>DONE.has(i.status)).length,
        other: items.filter(i=>!DONE.has(i.status) && !i._open).length,
      };
    }),
    epics: b.epics.length,
    openEpics: b.epics.filter(i=>i._open).length,
    labelled: b.all.concat(b.epics).filter(i=>f._index.get(i.id).src==="label").length,
    byStatus: OPEN_ORDER.map(s=>({s, n:b.open.filter(i=>i.status===s).length})),
  })).sort((a,b)=>
    (a.t.key===UNTHEMED.key) - (b.t.key===UNTHEMED.key) ||   // "Unthemed" always last
    (b.open-a.open) || (b.total-a.total));
}

// the segments of one priority row, in registry order; done/terminal only when shown
function segmentsOf(r){
  const segs = OPEN_ORDER.map(s=>({
    label: STATUS_META[s].label, color: STATUS_META[s].color,
    n: (r.byStatus.find(x=>x.s===s)||{n:0}).n }));
  if(showDone){
    segs.push({label:"Done", color:"var(--good)", n:r.done});
    segs.push({label:"Other", color:"var(--baseline)", n:r.other});
  }
  return segs.filter(x=>x.n);
}
function renderThemes(){
  const f = facetOf(facetKey), stats = themeStats(f);
  document.getElementById("facetPicker").innerHTML =
    FACETS.map(x=>`<button class="facet${x.key===f.key?" active":""}" data-facet="${esc(x.key)}" type="button">${esc(x.label||x.key)}</button>`).join("")
    + (f.hint?`<span class="facet-hint">${esc(f.hint)}</span>`:"")
    + `<span class="legend">` + OPEN_ORDER.map(s=>
        `<span><span class="dot" style="background:${STATUS_META[s].color}"></span>${esc(STATUS_META[s].label)}</span>`).join("")
      + (showDone?`<span><span class="dot" style="background:var(--good)"></span>Done</span>`:"")
      + `</span>`;
  // Scale every bar against the biggest row ACROSS ALL TILES, not per tile. Per-tile
  // scaling made a 1-issue row fill its track exactly like a 14-issue row next to it,
  // so the eye — which compares tiles side by side — read them as equal.
  const scale = Math.max(1, ...stats.flatMap(s=>s.prio.map(r=>
    segmentsOf(r).reduce((a,g)=>a+g.n, 0))));
  document.getElementById("tiles").innerHTML = stats.map(s=>{
    const rows = s.prio.map(r=>({r, segs:segmentsOf(r)}))
                       .map(x=>({...x, n:x.segs.reduce((a,g)=>a+g.n,0)}));
    const max = scale;
    const prows = rows.map(({r,segs,n})=>{
      const detail = segs.map(g=>`${g.label} ${g.n}`).join(" · ") || "none";
      // describe the same set the bar draws, so the tooltip can't contradict the row
      const tot = showDone ? r.total : r.openTotal;
      const top = showDone ? r.topLevel : r.openTopLevel;
      const scope = top < tot
        ? ` — ${top} top-level, ${tot-top} scoped to an epic (ranked against siblings, not the backlog)`
        : "";
      return `<div class="prow${n?"":" zero"}" title="${esc(r.meta.label)}: ${detail}${esc(scope)}">
        <span class="pl" style="color:${r.meta.color}"><span class="t">${esc(r.meta.label)}</span></span>
        <span class="ptrack">${segs.map(g=>
          `<i style="width:${(g.n/max*100).toFixed(2)}%;background:${g.color}"></i>`).join("")}</span>
        <span class="pn">${n||""}</span>
      </div>`;
    }).join("");
    return `<button class="tile${s.open?"":" is-empty"}" type="button" style="--tc:${s.t._color}" data-theme="${esc(s.t.key)}">
      <div class="tile-top"><span class="tile-name">${esc(s.t.label||s.t.key)}</span></div>
      <div class="tile-v"><b>${s.open}</b><span>open${showDone?` of ${s.total}`:""}</span></div>
      <div class="prows">${prows}</div>
      <div class="tile-foot">${showDone?`<span>${s.done} done</span>`:""}${s.epics?`<span>${showDone?"· ":""}${s.epics} epics${s.openEpics?` (${s.openEpics} open)`:""}</span>`:""}
        ${s.labelled?`<span>· ${s.labelled} labelled</span>`:""}</div>
    </button>`;
  }).join("");
  const srcs = ISSUES.map(i=>f._index.get(i.id).src);
  const n = k => srcs.filter(x=>x===k).length;
  const sum = k => stats.reduce((a,s)=>a+s[k], 0);
  document.getElementById("themeProvenance").textContent =
    `${sum("open")} open work items across ${stats.filter(s=>s.open).length} themes, plus `
    + `${sum("openEpics")} open epics counted separately (an epic is in progress because a `
    + `sub-issue is — counting both would double-count the same work). `
    + `Themed by: ${n("label")} fp label · ${n("inferred")} keyword match · `
    + `${n("inherited")} inherited from their epic · ${n("none")} unthemed. `
    + `Labels always win — label an issue to correct its tile.`;
  // theme filter on the Issues tab follows the selected facet
  const sel = document.getElementById("fTheme");
  sel.innerHTML = `<option value="">any ${esc((f.label||"theme").toLowerCase())}</option>`
    + stats.map(s=>`<option value="${esc(s.t.key)}">${esc(s.t.label||s.t.key)} (${s.open})</option>`).join("");
  sel.value = F.theme;
}
document.getElementById("tabThemesN").textContent =
  FACETS.length ? themeStats(facetOf(facetKey)).filter(s=>s.open).length : 0;
document.getElementById("facetPicker").addEventListener("click", e=>{
  const b=e.target.closest(".facet"); if(!b) return;
  facetKey=b.dataset.facet; F.theme=""; renderThemes(); renderTable();
});
// tap a tile → jump to the Issues tab, filtered to that theme
document.getElementById("tiles").addEventListener("click", e=>{
  const b=e.target.closest(".tile"); if(!b) return;
  F.theme=b.dataset.theme;
  document.getElementById("fTheme").value=F.theme;
  showPanel("panel-issues");
  renderTable();
  document.getElementById("filters").scrollIntoView({behavior:"smooth", block:"start"});
});
document.getElementById("fTheme").onchange=e=>{F.theme=e.target.value;renderTable();};
// "hide done" ships ticked, so apply its body class at load too — otherwise the Epics
// tab would still list done children while the box reads as checked.
document.body.classList.toggle("hide-done", document.getElementById("hideDone").checked);
if(FACETS.length) renderThemes(); else document.getElementById("panel-themes").hidden = true;
renderTable();   // first paint — after the theme index exists, so F.theme can be honoured

