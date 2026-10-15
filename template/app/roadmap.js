// ---- roadmap ----
// Open epics as blocks in theme lanes, left to right in the order to take them. It answers
// the question the Epics tab cannot: which epic next, and after that. Four priority levels
// cannot order fifteen "high" epics, so the order is built from, in precedence:
//   1. hard dependencies — epic-to-epic, plus child dependencies that cross into another
//      epic, lifted to the epics that own the two ends. "Cannot start before".
//   2. rank (RANK_PROPERTY) ascending — "we prefer". Unranked epics come after ranked ones.
//   3. priority, 4. status (furthest along first: the open statuses in reverse registry order).
// Rank is ONE global sequence, so a block's column is its place in that order in every lane
// and "what's next" reads as one column down the board. Lanes only group by theme.
const ROADMAP_CONFIG = __ROADMAP_CONFIG__;
const RANK_PROP = ROADMAP_CONFIG.rankProperty || "";
const RM_EXCLUDE = new Set(ROADMAP_CONFIG.exclude || []);   // short ids (the engine strips the prefix)

// An fp text property holds any string, so a rank is read, never trusted: whole numbers
// only. Anything else is reported by name rather than silently treated as unranked.
const rankRaw = i => RANK_PROP ? String(((i.properties||{})[RANK_PROP]) ?? "").trim() : "";
const rankOf = i => /^\d+$/.test(rankRaw(i)) ? parseInt(rankRaw(i), 10) : null;
// furthest along first: in-progress before selected before todo in the default registry
const statusPref = s => { const k = OPEN_ORDER.indexOf(s); return k < 0 ? OPEN_ORDER.length : OPEN_ORDER.length-1-k; };
// An epic is "active" once it has left the backlog status (the first open one).
const isActive = i => i._open && i.status !== BACKLOG;

// The preference order, i.e. everything except dependencies. Ties end on the short id so
// the board never reshuffles between two reports of the same backlog.
function rmPref(a, b){
  const ra = a.rank, rb = b.rank;
  if(ra != null && rb != null && ra !== rb) return ra - rb;
  if((ra == null) !== (rb == null)) return ra == null ? 1 : -1;
  return (PRIO_ORDER[prioKey(a.priority)] - PRIO_ORDER[prioKey(b.priority)])
      || (statusPref(a.status) - statusPref(b.status))
      || (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0);
}

// rmOrder(nodes, edges) — the order model, a pure function. nodes: [{id, sid, rank,
// priority, status}]; edges: [[before, after]] by id. Returns {order: ids, cyclic: Map}.
// Kahn's algorithm, always taking the most preferred epic whose dependencies are placed, so
// the dependency order wins wherever it and the preference disagree. A cycle leaves no epic
// free; the most preferred epic in it is then placed anyway, so the order stays total and
// the loop always ends. The epics on a cycle are returned (id → cycle number) for the page to name.
function rmOrder(nodes, edges){
  const byKey = new Map(nodes.map(n=>[n.id, n]));
  const indeg = new Map(nodes.map(n=>[n.id, 0])), out = new Map(nodes.map(n=>[n.id, []]));
  for(const [a, b] of edges){
    if(!byKey.has(a) || !byKey.has(b) || a === b) continue;
    out.get(a).push(b); indeg.set(b, indeg.get(b)+1);
  }
  const placed = new Set(), order = [];
  const best = xs => xs.reduce((m, x)=> !m || rmPref(byKey.get(x), byKey.get(m)) < 0 ? x : m, null);
  while(order.length < nodes.length){
    const left = nodes.map(n=>n.id).filter(id=>!placed.has(id));
    const free = left.filter(id=>indeg.get(id) === 0);
    const next = best(free.length ? free : left);
    placed.add(next); order.push(next);
    indeg.set(next, -1);
    for(const b of out.get(next)) if(!placed.has(b)) indeg.set(b, indeg.get(b)-1);
  }
  return {order, cyclic: rmCycles(nodes.map(n=>n.id), out)};
}
// the epics that sit on a dependency cycle, mapped to their cycle: the strongly connected
// components of more than one epic
// (Tarjan, iterative over an explicit stack so a deep chain cannot overflow the call stack)
function rmCycles(ids, out){
  let n = 0, c = 0; const idx = new Map(), low = new Map(), on = new Set(), st = [], res = new Map();
  for(const root of ids){
    if(idx.has(root)) continue;
    const work = [[root, 0]];
    idx.set(root, n); low.set(root, n); n++; st.push(root); on.add(root);
    while(work.length){
      const top = work[work.length-1], v = top[0], succ = out.get(v) || [];
      if(top[1] < succ.length){
        const w = succ[top[1]++];
        if(!idx.has(w)){ idx.set(w, n); low.set(w, n); n++; st.push(w); on.add(w); work.push([w, 0]); }
        else if(on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        continue;
      }
      work.pop();
      if(work.length){ const u = work[work.length-1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
      if(low.get(v) === idx.get(v)){
        const comp = []; let w;
        do { w = st.pop(); on.delete(w); comp.push(w); } while(w !== v);
        if(comp.length > 1){ comp.forEach(x=>res.set(x, c)); c++; }
      }
    }
  }
  return res;
}

// ---- the epics on the roadmap, and the dependencies lifted onto them ----
// An epic here is an OPEN issue with children (stricter than the Epics tab, which also lists
// childless "Epic"-titled issues: a block with nothing inside has nothing to sequence).
// ROADMAP_EXCLUDE keeps catch-all parents, such as a "Bugs" bucket, off the lanes.
const rmEpics = ISSUES.filter(i=>i._open && kids.has(i.id) && !RM_EXCLUDE.has(i.shortId));
const rmSet = new Set(rmEpics.map(e=>e.id));
// the roadmap epic that owns an issue: itself, else its nearest ancestor on the roadmap
const rmOwnerCache = new Map();
function rmOwner(id){
  if(rmOwnerCache.has(id)) return rmOwnerCache.get(id);
  let cur = byId.get(id), hops = 0, found = null;
  while(cur && hops++ < 64){                          // the hop cap guards a malformed parent loop
    if(rmSet.has(cur.id)){ found = cur.id; break; }
    cur = cur.parent ? byId.get(cur.parent) : null;
  }
  rmOwnerCache.set(id, found);
  return found;
}
const rmAncestor = (a, b) => {                        // is epic a an ancestor of issue b?
  let cur = byId.get(b), hops = 0;
  while(cur && cur.parent && hops++ < 64){ if(cur.parent === a) return true; cur = byId.get(cur.parent); }
  return false;
};
// Only UNMET dependencies of OPEN issues are lifted: a dependency on finished work no longer
// holds anything back. A dependency between an epic and its own sub-epic is containment,
// not order, so it is dropped. Each edge keeps the issue pairs behind it, for the pane.
const rmEdges = (()=>{
  const m = new Map();
  for(const x of ISSUES){
    if(!x._open) continue;
    for(const d of x._unmet){
      const a = rmOwner(d.id), b = rmOwner(x.id);
      if(!a || !b || a === b || rmAncestor(a, b) || rmAncestor(b, a)) continue;
      const k = a + ">" + b;
      (m.get(k) || m.set(k, {a, b, via: []}).get(k)).via.push([x, d]);
    }
  }
  return [...m.values()];
})();
const rmBad = RANK_PROP ? rmEpics.filter(e=>rankRaw(e) !== "" && rankOf(e) == null) : [];
const rmNodes = rmEpics.map(e=>({id:e.id, sid:e.shortId, rank:rankOf(e), priority:e.priority, status:e.status}));
const RM = rmOrder(rmNodes, rmEdges.map(x=>[x.a, x.b]));
const rmNode = new Map(rmNodes.map(n=>[n.id, n]));
// An arrow is red where the preference alone would have put the dependent epic first: the
// rank (or, without one, the priority) says "this one next" and a dependency says it can't.
// An edge inside a cycle is drawn dashed instead: no order can satisfy it.
const rmInCycle = x => RM.cyclic.has(x.a) && RM.cyclic.get(x.a) === RM.cyclic.get(x.b);
const rmAgainst = x => !rmInCycle(x) && rmPref(rmNode.get(x.b), rmNode.get(x.a)) < 0;
document.getElementById("tabRoadmapN").textContent = rmEpics.length;

// ---- board ----
// Fixed geometry: every block is the same size, so each block's place, each arrow and the
// Now line follow from (column, lane) alone. Nothing is measured from the live layout.
const RM_GEO = {label:132, col:196, gap:28, lane:118, head:26, block:94, pad:12};
const rmPitch = RM_GEO.col + RM_GEO.gap;
let rmFacetKey = (FACETS[0]||{}).key || "";
let rmSel = null;                                     // the epic whose issues the pane shows
let rmView = null;                                    // a local preview order (ids); only the reorder view sets it
const rmShown = () => rmView || RM.order;

// the lanes: themes of the chosen facet in taxonomy order, Unthemed last, empty lanes left out
function rmLanes(){
  const f = FACETS.length ? facetOf(rmFacetKey) : null;
  const laneOf = e => f ? f._index.get(e.id).key : "__all";
  const defs = f ? [...f.themes, UNTHEMED] : [{key:"__all", label:"All epics", _color:"var(--muted)"}];
  const used = new Set(rmEpics.map(laneOf));
  return {laneOf, lanes: defs.filter(t=>used.has(t.key))};
}

function rmBlock(e, slot, lane, ahead){
  const ch = kids.get(e.id) || [];
  const done = ch.filter(c=>DONE.has(c.status)).length;
  const sm = STATUS_META[e.status] || {label:e.status, color:"var(--muted)"};
  const pm = PRIO_META[prioKey(e.priority)];
  const r = rankOf(e);
  const x = RM_GEO.label + slot*rmPitch, y = RM_GEO.head + lane*RM_GEO.lane + RM_GEO.pad;
  return `<div class="rm-block${isActive(e)?" active":""}${ahead?" ahead":""}${rmSel===e.id?" sel":""}${RM.cyclic.has(e.id)?" cyc":""}"
    data-rid="${e.id}" data-id="${IDP}${e.shortId}" style="left:${x}px;top:${y}px;width:${RM_GEO.col}px;height:${RM_GEO.block}px;--sc:${sm.color}"
    title="${esc(e.title)}">
    <div class="rm-t">${esc(e.title)}</div>
    <div class="rm-m"><span class="rm-s"><span class="dot" style="background:${sm.color}"></span>${esc(sm.label)}</span>
      <span style="color:${pm.color}" title="${pm.label} priority">${pm.icon}</span>
      ${ahead?`<span class="rm-ahead" title="not started, yet ordered ahead of work already under way">ahead</span>`:""}
      ${r!=null?`<span class="rm-r" title="${esc(RANK_PROP)} ${r}">#${r}</span>`:""}</div>
    <div class="rm-p"><span class="cid">${IDP}${e.shortId}</span><span class="pbar"><i style="width:${ch.length?done/ch.length*100:0}%;background:var(--good)"></i></span>
      <span class="rm-pn">${done}/${ch.length}</span></div>
  </div>`;
}

function rmArrow(x, pos, laneRow){
  const pa = pos.get(x.a), pb = pos.get(x.b);
  const x1 = RM_GEO.label + pa*rmPitch + RM_GEO.col, x2 = RM_GEO.label + pb*rmPitch;
  const mid = lane => RM_GEO.head + lane*RM_GEO.lane + RM_GEO.pad + RM_GEO.block/2;
  const y1 = mid(laneRow.get(x.a)), y2 = mid(laneRow.get(x.b));
  const bend = Math.max(36, Math.abs(x2-x1)/2);
  const cls = rmInCycle(x) ? "cyc" : rmAgainst(x) ? "against" : "";
  const why = x.via.map(([dep, on])=>`${IDP}${dep.shortId} waits on ${IDP}${on.shortId}`).join("; ");
  return `<path class="rm-dep ${cls}" data-dep="${x.a}>${x.b}" d="M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}"
    marker-end="url(#rmHead${cls==="against"?"Red":""})"><title>${esc(why)}</title></path>`;
}

function renderRoadmap(){
  const {laneOf, lanes} = rmLanes();
  const order = rmShown();
  const pos = new Map(order.map((id, k)=>[id, k]));
  const laneIdx = new Map(lanes.map((t, k)=>[t.key, k]));
  const laneRow = new Map(rmEpics.map(e=>[e.id, laneIdx.get(laneOf(e))]));
  // the Now line sits after the last active epic; a not-started epic left of it has been
  // ordered ahead of work already under way, which is itself worth seeing
  const lastActive = order.reduce((m, id, k)=> isActive(byId.get(id)) ? k : m, -1);
  const W = RM_GEO.label + Math.max(order.length, 1)*rmPitch;
  const H = RM_GEO.head + Math.max(lanes.length, 1)*RM_GEO.lane;
  const nowX = RM_GEO.label + (lastActive+1)*rmPitch - RM_GEO.gap/2;

  document.getElementById("rmFacets").innerHTML = FACETS.length > 1
    ? `<span class="lbl">Lanes</span>` + FACETS.map(x=>`<button class="facet${x.key===rmFacetKey?" active":""}" type="button"
        data-rmfacet="${esc(x.key)}">${esc(x.label||x.key)}</button>`).join("")
    : "";
  const board = document.getElementById("roadmap");
  if(!rmEpics.length){
    board.style.width = board.style.height = "";
    board.innerHTML = `<div class="empty">No open epics with sub-issues to lay out.</div>`;
    renderRoadmapDetail(); renderRoadmapNote(); return;
  }
  board.style.width = W + "px"; board.style.height = H + "px";
  board.innerHTML =
    lanes.map((t, k)=>`<div class="rm-lane" style="top:${RM_GEO.head + k*RM_GEO.lane}px;height:${RM_GEO.lane}px;width:${W}px">
      <span class="rm-ll" style="--tc:${t._color||statusColor(t.color)}">${esc(t.label||t.key)}</span></div>`).join("")
    + order.map((id, k)=>`<span class="rm-col" style="left:${RM_GEO.label + k*rmPitch}px;width:${RM_GEO.col}px">${k+1}</span>`).join("")
    + `<div class="rm-now" style="left:${nowX}px;height:${H}px"><span>${lastActive<0?"Now · nothing active":"Now"}</span></div>`
    + `<svg class="rm-arrows" width="${W}" height="${H}" aria-hidden="true"><defs>
        <marker id="rmHead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="rm-head"/></marker>
        <marker id="rmHeadRed" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="rm-head against"/></marker>
      </defs>${rmEdges.map(x=>rmArrow(x, pos, laneRow)).join("")}</svg>`
    + order.map((id, k)=>{ const e = byId.get(id);
        return rmBlock(e, k, laneRow.get(id), k < lastActive && !isActive(e)); }).join("");
  renderRoadmapDetail();
  renderRoadmapNote();
  if(typeof rmDecorate === "function") rmDecorate();      // the local build's reorder view, if built in
}

// the selected epic's issues, grouped by status in registry order, plus what it waits on
function renderRoadmapDetail(){
  const pane = document.getElementById("rmDetail");
  const e = rmSel && byId.get(rmSel);
  if(!e || !rmSet.has(e.id)){ pane.hidden = true; pane.innerHTML = ""; return; }
  const ch = kids.get(e.id) || [];
  const groups = STATUS_LIST.map(s=>({s, items: ch.filter(c=>c.status===s.key)}))
    .concat([{s:{key:"?", label:"Other"}, items: ch.filter(c=>!STATUS_META[c.status])}])
    .filter(g=>g.items.length);
  const link = (x, side) => {
    const o = byId.get(side);
    return `<li><span class="cid">${IDP}${o.shortId}</span> ${esc(o.title)}
      <span class="eid">via ${x.via.map(([dep, on])=>`${IDP}${dep.shortId} → ${IDP}${on.shortId}`).join(", ")}</span>
      ${rmAgainst(x)?`<span class="flag">rank or priority says otherwise — the dependency wins</span>`:""}</li>`;
  };
  const waits = rmEdges.filter(x=>x.b===e.id), holds = rmEdges.filter(x=>x.a===e.id);
  pane.hidden = false;
  pane.innerHTML = `<div class="rm-dh" data-id="${IDP}${e.shortId}"><b>${esc(e.title)}</b>
      <span class="cid">${IDP}${e.shortId}</span> ${statusBadge(e.status)} ${prioBadge(e.priority)}
      <button class="facet" type="button" data-rmclose>close</button></div>`
    + (waits.length?`<div class="rm-dl">Waits on</div><ul class="rm-links">${waits.map(x=>link(x, x.a)).join("")}</ul>`:"")
    + (holds.length?`<div class="rm-dl">Holds back</div><ul class="rm-links">${holds.map(x=>link(x, x.b)).join("")}</ul>`:"")
    + groups.map(g=>`<div class="rm-dl${DONE.has(g.s.key)?" is-done":""}">${esc(g.s.label||g.s.key)} · ${g.items.length}</div>`
        + g.items.slice().sort((a,b)=>PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]).map(childRow).join("")).join("");
}

// how this order was made, and anything in the data that bent it
function renderRoadmapNote(){
  const against = rmEdges.filter(rmAgainst).length;
  const cyc = rmEpics.filter(e=>RM.cyclic.has(e.id));
  const ids = xs => xs.map(e=>IDP+e.shortId).join(", ");
  const parts = [
    RANK_PROP
      ? `Ordered by hard dependencies, then the “${esc(RANK_PROP)}” property, then priority, then status. `
        + `${rmEpics.filter(e=>rankOf(e)!=null).length} of ${rmEpics.length} epics are ranked; unranked ones follow the ranked.`
      : `No RANK_PROPERTY is configured, so the order is hard dependencies, then priority, then status, and reordering is off.`,
    `${rmEdges.length} dependenc${rmEdges.length===1?"y":"ies"} between epics`
      + (against ? `, ${against} drawn red: rank or priority prefers the other order, and the dependency wins.` : "."),
  ];
  if(cyc.length) parts.push(`Dependency cycle: ${ids(cyc)} wait on each other, so they cannot all be honoured. Break the cycle in fp.`);
  if(rmBad.length) parts.push(`Not a whole number in “${esc(RANK_PROP)}”, read as unranked: ${ids(rmBad)}.`);
  if(RM_EXCLUDE.size) parts.push(`Left off by ROADMAP_EXCLUDE: ${[...RM_EXCLUDE].map(s=>IDP+s).map(esc).join(", ")}.`);
  document.getElementById("rmNote").innerHTML = parts.map(p=>`<div>${p}</div>`).join("");
}

renderRoadmap();
document.getElementById("rmFacets").addEventListener("click", ev=>{
  const b = ev.target.closest("button[data-rmfacet]"); if(!b) return;
  rmFacetKey = b.dataset.rmfacet; renderRoadmap();
});
document.getElementById("roadmap").addEventListener("click", ev=>{
  if(ev.target.closest(".cid")) return;               // the id chip copies; it doesn't select
  const b = ev.target.closest(".rm-block"); if(!b) return;
  rmSel = rmSel === b.dataset.rid ? null : b.dataset.rid;
  renderRoadmap();
});
document.getElementById("rmDetail").addEventListener("click", ev=>{
  if(!ev.target.closest("[data-rmclose]")) return;
  rmSel = null; renderRoadmap();
});
