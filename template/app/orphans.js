// ---- orphans ----
// Work stranded under a CLOSED epic (see _orphan in model.js): the epic was marked done
// (or rejected) without its leftovers being finished, re-homed under another epic, or
// made standalone. Nobody opens a closed epic, so this work is invisible everywhere else
// in the report — the Epics tab only lists epics with open children, and on the Issues
// tab these rows are filtered out by "no parent".
// Grouped by the closed epic, because the fix is per-epic: re-home this list, or close it.
const orphanIssues = ISSUES.filter(i=>i._orphan);
const orphanGroups = [...orphanIssues.reduce((m,i)=>{
    (m.get(i.parent)||m.set(i.parent,[]).get(i.parent)).push(i); return m; }, new Map())]
  .map(([pid, items])=>({
    p: byId.get(pid),
    items: items.sort((a,b)=>
      (PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]) ||
      ((b._stale??0)-(a._stale??0))),
  }))
  // biggest stranded set first, then the epic that has been closed longest
  .sort((a,b)=> (b.items.length-a.items.length) || ((b.p._stale??0)-(a.p._stale??0)));
document.getElementById("tabOrphansN").textContent = orphanIssues.length;

document.getElementById("orphans").innerHTML = orphanGroups.length
  ? orphanGroups.map((g,idx)=>{
      const sLabel = (STATUS_META[g.p.status]||{label:g.p.status}).label;
      // idle, not "closed Nd ago": updatedAt is the last edit, which is only usually the close
      const since = g.p._stale!=null ? ` · idle ${g.p._stale}d` : "";
      const n = g.items.length;
      return `<div class="epic ogroup open" data-oidx="${idx}" data-id="${IDP}${g.p.shortId}">
        <div><div class="et" title="${esc(g.p.title)}"><span class="caret">▸</span> ${esc(g.p.title)}</div>
          <div class="ec"><span class="cid">${IDP}${g.p.shortId}</span> · ${esc(sLabel)}${since} · ${n} stranded</div></div>
        <div class="er">${statusBadge(g.p.status)}<span class="flag">✦ ${n} orphaned</span></div>
      </div>
      <div class="epic-children" data-oidx="${idx}">${g.items.map(childRow).join("")}</div>`;
    }).join("")
  : `<div class="empty">No orphans — nothing is stranded under a closed epic.</div>`;
document.getElementById("orphans").addEventListener("click", ev=>{
  if(ev.target.closest(".cid")) return;                 // the id chip copies; it doesn't expand
  const row = ev.target.closest(".epic"); if(!row) return;
  const kidsEl = row.nextElementSibling;
  if(!kidsEl || !kidsEl.classList.contains("epic-children")) return;
  const willOpen = kidsEl.hasAttribute("hidden");
  kidsEl.toggleAttribute("hidden", !willOpen);
  row.classList.toggle("open", willOpen);
});
const orphanPlural = (n, w) => `${n} ${w}${n===1?"":"s"}`;
document.getElementById("orphanRule").textContent = orphanGroups.length
  ? `${orphanPlural(orphanIssues.length,"issue")} under `
    + `${orphanPlural(orphanGroups.length,"closed epic")}. `
    + `An issue counts as orphaned when its parent is terminal (done or rejected) and it is not — `
    + `a rejected epic strands its children exactly like a done one, and a deferred child is `
    + `stranded exactly like an open one. Only the direct parent is tested: a still-open sub-epic `
    + `under a closed epic is itself the orphan, and re-homing it moves everything beneath it.`
  : `An issue counts as orphaned when its parent is terminal (done or rejected) and it is not. `
    + `Nothing here means every epic was emptied before it was closed.`;

