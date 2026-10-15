// ---- roadmap reorder (local builds only) ----
// Inlined only by a local build (the template marks it include-local), so a --publish build
// (fp-report-deploy) carries none of this: no drag handles, no command generator. The page never writes to fp. A drag
// changes the order on screen and writes the `fp issue update` commands that make it real:
// run them in the project, regenerate the report, and the board comes back in that order.

// rankPlan(items, tailFrom, moved) — pure. items: [{key, rank}] in the target order, rank
// null when unset. Items from tailFrom on are unranked AND already in the order the report
// gives unranked epics, so they may stay unranked; every item before tailFrom must end with
// a strictly increasing rank. It keeps the largest set of existing ranks that still leaves
// room between them for the rest (the fewest commands), then fills each gap: evenly inside
// a gap, in steps of 10 past the last rank. `moved` (a Set of keys, optional) names the
// epics that were dragged: between two equally small plans, the one that rewrites a dragged
// epic wins, so a drop into a free gap changes only the epic that was dropped.
// Returns only the items whose rank changes.
function rankPlan(items, tailFrom, moved){
  const n = tailFrom, r = items.slice(0, n).map(x=>x.rank);
  // Keeping a rank scores 2, or 1 for a dragged epic: one more kept rank always wins (fewer
  // commands), and the dragged epics only decide between plans of the same size.
  const w = items.slice(0, n).map(x=>moved && moved.has(x.key) ? 1 : 2);
  // best[i]: the best score in items[0..i] with item i's rank kept; prev[i] walks back.
  // Keeping rank r[i] at position i needs i ranks below it (ranks start at 1), and keeping
  // r[j] and r[i] needs i-j-1 free integers strictly between them.
  const best = new Array(n).fill(0), prev = new Array(n).fill(-1);
  for(let i = 0; i < n; i++){
    if(r[i] == null || r[i] < i+1) continue;
    best[i] = w[i];
    for(let j = 0; j < i; j++)
      if(best[j] && r[j] < r[i] && r[i]-r[j] >= i-j && best[j]+w[i] > best[i]){ best[i] = best[j]+w[i]; prev[i] = j; }
  }
  let end = -1;
  for(let i = 0; i < n; i++) if(best[i] && (end < 0 || best[i] > best[end])) end = i;
  const keep = new Set();
  for(let i = end; i >= 0; i = prev[i]) keep.add(i);
  const out = r.slice();
  let lo = 0, loPos = -1;
  for(let i = 0; i <= n; i++){
    if(i < n && !keep.has(i)) continue;
    const m = i-loPos-1;
    for(let k = 1; k <= m; k++)
      out[loPos+k] = i < n ? lo + Math.floor((r[i]-lo)*k/(m+1))   // inside a gap: spread evenly
                           : lo - lo%10 + 10*k;                     // past the end: the next tens
    if(i < n){ lo = r[i]; loPos = i; }
  }
  return items.slice(0, n).map((x, i)=>({key:x.key, from:x.rank, rank:out[i]})).filter(x=>x.rank !== x.from);
}

// rankCommands(plan, snapshot) — the shell text. It carries IDs and integers only, never a
// title or any other tracker text, so nothing from an issue is ever read by the shell; an
// item that fails the check stops the whole block rather than being skipped.
function rankCommands(plan, snapshot){
  const ID = /^[A-Za-z0-9_]+-[A-Za-z0-9]+$/, PROP = /^[a-z][a-z0-9_-]*$/;
  if(!PROP.test(RANK_PROP)) throw new Error("rank property is not a plain key");
  const lines = [`# fp-report roadmap order, from the snapshot of ${/^[0-9TZ:.-]+$/.test(snapshot) ? snapshot : "unknown time"}`];
  for(const p of plan){
    if(!ID.test(p.key) || !Number.isInteger(p.rank) || p.rank < 1) throw new Error("refusing a command for " + p.key);
    lines.push(`fp issue update ${p.key} --property ${RANK_PROP}=${p.rank}`);
  }
  return lines.join("\n");
}

// Where the unranked tail starts: the longest run of unranked epics at the end that the
// report would already lay out in this order by itself (priority, status, dependencies).
function rmTailFrom(order){
  let t = order.length;
  while(t > 0 && rmNode.get(order[t-1]).rank == null) t--;
  for(; t < order.length; t++){
    const ids = order.slice(t), set = new Set(ids);
    const got = rmOrder(ids.map(id=>rmNode.get(id)),
      rmEdges.filter(x=>set.has(x.a) && set.has(x.b)).map(x=>[x.a, x.b])).order;
    if(got.join() === ids.join()) break;
  }
  return t;
}
// the plan for an order: items keyed by display id, so the commands name what fp accepts
function rmPlanFor(order, moved){
  return rankPlan(order.map(id=>({key: IDP + byId.get(id).shortId, rank: rmNode.get(id).rank})), rmTailFrom(order),
                  new Set([...(moved || [])].map(id=>IDP + byId.get(id).shortId)));
}
// A drop that puts an epic before one it depends on would not survive the regenerate (the
// dependency wins), so it is refused. An edge touching a cycle is not checked: the report
// already had to break one of those to lay the cycle out at all.
function rmBlocks(order){
  const pos = new Map(order.map((id, k)=>[id, k]));
  return rmEdges.find(x=>!RM.cyclic.has(x.a) && !RM.cyclic.has(x.b) && pos.get(x.a) > pos.get(x.b)) || null;
}

// `var`, not `let`: roadmap.js calls rmDecorate during its first render, before this part of
// the script has run, and a `let` read then would throw instead of reading undefined.
var rmWired, rmDrag, rmMoved = new Set();          // rmMoved: every epic dragged since the last reset
function rmDecorate(){
  if(!RANK_PROP || !rmEpics.length) return;          // no rank property: nothing to write to
  const board = document.getElementById("roadmap");
  board.classList.add("can-drag");
  board.querySelectorAll(".rm-block").forEach(b=>b.setAttribute("draggable", "true"));
  if(!document.getElementById("rmCmds"))
    document.getElementById("rmDetail").insertAdjacentHTML("beforebegin", `<section class="card rm-cmds" id="rmCmds"></section>`);
  rmRenderCmds();
  if(rmWired) return;
  rmWired = true;
  // the insertion point under the pointer: a boundary between columns, 0..n
  const gapAt = ev => {
    const x = ev.clientX - board.getBoundingClientRect().left;
    return Math.max(0, Math.min(rmShown().length, Math.round((x - RM_GEO.label + RM_GEO.gap/2) / rmPitch)));
  };
  const marker = () => board.querySelector(".rm-drop") ||
    (board.insertAdjacentHTML("beforeend", `<div class="rm-drop"></div>`), board.querySelector(".rm-drop"));
  board.addEventListener("dragstart", ev=>{
    const b = ev.target.closest(".rm-block"); if(!b) return;
    rmDrag = b.dataset.rid;
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", b.dataset.id);
    b.classList.add("dragging");
  });
  board.addEventListener("dragover", ev=>{
    if(!rmDrag) return;
    ev.preventDefault();
    const m = marker();
    m.style.left = (RM_GEO.label + gapAt(ev)*rmPitch - RM_GEO.gap/2) + "px";
    m.style.height = board.style.height;
  });
  board.addEventListener("dragend", ()=>{
    rmDrag = null;
    board.querySelectorAll(".rm-drop, .dragging").forEach(x=>x.classList.contains("rm-drop") ? x.remove() : x.classList.remove("dragging"));
  });
  board.addEventListener("drop", ev=>{
    if(!rmDrag) return;
    ev.preventDefault();
    const cur = rmShown().slice(), from = cur.indexOf(rmDrag), gap = gapAt(ev);
    const to = gap > from ? gap-1 : gap;
    const moved = rmDrag; rmDrag = null;
    if(to === from){ renderRoadmap(); return; }
    cur.splice(from, 1); cur.splice(to, 0, moved);
    const clash = rmBlocks(cur);
    if(clash){
      toast(`${IDP}${byId.get(clash.b).shortId} waits on ${IDP}${byId.get(clash.a).shortId}, so it can't go first`);
      renderRoadmap(); return;
    }
    rmMoved.add(moved);
    rmView = cur.join() === RM.order.join() ? null : cur;
    if(!rmView) rmMoved.clear();
    renderRoadmap();
  });
  document.addEventListener("click", ev=>{
    if(ev.target.closest("[data-rmreset]")){ rmView = null; rmMoved.clear(); renderRoadmap(); return; }
    if(ev.target.closest("[data-rmcopy]")){
      const text = document.getElementById("rmCmdText").textContent;
      copyText(text).then(()=>toast("Copied the fp commands"), ()=>toast("Couldn't copy — select the text instead"));
    }
  });
}

function rmRenderCmds(){
  const box = document.getElementById("rmCmds");
  if(!rmView){
    box.innerHTML = `<div class="rm-ch"><b>Reorder</b> <span class="sub">drag a block left or right to change the order.
      The page changes nothing in fp: it writes the commands to run in the project, and the regenerated report shows the new order.</span></div>`;
    return;
  }
  const plan = rmPlanFor(rmView, rmMoved);
  const seeded = plan.filter(p=>p.from == null).length;
  let text;
  try { text = rankCommands(plan, GENERATED_AT); }
  catch(err){ box.innerHTML = `<div class="rm-ch"><b>Reorder</b> <span class="flag">${esc(err.message)}</span></div>`; return; }
  box.innerHTML = `<div class="rm-ch"><b>${plan.length} command${plan.length===1?"":"s"}</b>
      <span class="sub">run them in the project, then regenerate the report${seeded
        ? ` · ${seeded} give${seeded===1?"s":""} a first rank to an epic that had none, because the epics ahead of a moved one need a rank for the order to hold` : ""}</span>
      <button class="facet" type="button" data-rmcopy>Copy</button>
      <button class="facet" type="button" data-rmreset>Reset</button></div>
    <pre class="rm-pre" id="rmCmdText">${esc(text)}</pre>`;
}
