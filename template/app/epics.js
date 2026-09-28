// ---- epic roadmap ----
// An "epic" = any issue with children, OR any issue whose title contains the whole
// word "Epic" (isEpicTitle, model.js — shared with the Focus and Signals rules).
const epicTs = i => Date.parse(i.updatedAt||"") || 0;
const epics = ISSUES.filter(i=>kids.has(i.id) || isEpicTitle(i)).map(e=>{
  const ch = kids.get(e.id) || [];
  const done = ch.filter(c=>DONE.has(c.status)).length;
  const openc = ch.filter(c=>c._open).length;
  const other = ch.length-done-openc;
  const hp = prioKey(e.priority);   // the epic's OWN priority — child priorities are scoped to the epic, not global
  // "Last activity" is rolled up over the epic AND its direct children. An epic issue's own
  // updatedAt only moves when the epic RECORD is edited (title, priority, description), so an
  // epic whose children all moved yesterday can still read as months idle. Direct children
  // only — the same one level the done/open/other counts above are taken over.
  // A childless "Epic"-titled issue falls back to its own updatedAt, which for it IS the signal.
  const lastTs = ch.reduce((m,c)=>Math.max(m, epicTs(c)), epicTs(e));
  return {e, total:ch.length, done, openc, other, hp,
    age: e._age,                                                  // days since createdAt (null if unparseable)
    idle: lastTs ? Math.floor((NOW-lastTs)/DAY) : null,           // days since anything here moved
    pct: ch.length ? done/ch.length : 0};                         // childless = 0% — not broken down is not progress
})                                             // active roadmap: epics with open children,
.filter(x=> x.openc>0 || (isEpicTitle(x.e) && x.e._open));  // plus still-open "Epic"-titled issues (incl. childless)
document.getElementById("tabEpicsN").textContent = epics.length;

// ---- sort ----
// Urgency answers "what is most pressing"; it cannot answer the two questions that actually
// drive an epic to done — how long it has been hanging around, and when anything last moved
// on it. Each key falls back to urgency, so equal values still land in the pressing order.
// Missing values sort last-in-the-default-direction via ??-1, the same idiom as the Issues table.
const byUrgency = (a,b)=> (PRIO_ORDER[a.hp]-PRIO_ORDER[b.hp]) || (b.openc-a.openc) || (b.total-a.total);
const EPIC_SORTS = [
  {k:"urgency",  l:"Urgency",       hint:"most urgent first", rev:"least urgent first",
   cmp:byUrgency},
  {k:"created",  l:"Created",       hint:"oldest first",      rev:"newest first",
   cmp:(a,b)=> (b.age??-1)-(a.age??-1)},
  {k:"activity", l:"Last activity", hint:"most idle first",   rev:"most recently worked first",
   cmp:(a,b)=> (b.idle??-1)-(a.idle??-1)},
  {k:"progress", l:"Progress",      hint:"least complete first", rev:"closest to done first",
   cmp:(a,b)=> a.pct-b.pct},
];
let epicSortK = "urgency", epicSortDir = 1;      // dir: 1 = the key's stated order, -1 = flipped
const epicSort = () => EPIC_SORTS.find(s=>s.k===epicSortK) || EPIC_SORTS[0];
// Expanded rows are tracked by epic id, not by row position, so re-sorting keeps whatever
// the reader had open instead of re-opening whichever epic happens to land in that slot.
const epicOpen = new Set();

function childRow(c){
  return `<div class="echild${DONE.has(c.status)?" is-done":""}" data-id="${IDP}${c.shortId}">
    <span class="eeid">${IDP}${c.shortId}</span>
    <span class="eet" title="${esc(c.title)}">${esc(c.title)}</span>
    ${prioBadge(c.priority)}
    ${statusBadge(c.status)}
    <span class="eeidle">${c._stale!=null?c._stale+"d":"—"}</span>
  </div>`;
}

function renderEpicSort(){
  const s = epicSort();
  document.getElementById("epicSort").innerHTML =
    `<span class="lbl">Sort</span>`
    + EPIC_SORTS.map(x=>`<button class="facet${x.k===epicSortK?" active":""}" type="button"
        data-esort="${x.k}" aria-pressed="${x.k===epicSortK}">${x.l}${x.k===epicSortK?" ⇅":""}</button>`).join("")
    + `<span class="facet-hint">${epicSortDir===1?s.hint:s.rev} · click the active key to flip</span>`;
}

// the ordering, separated from the rendering: the sort is the feature, and it is asserted
// on directly in the test suite rather than through the produced markup
const epicsOrdered = () => {
  const s = epicSort();
  return epics.slice().sort((a,b)=> (epicSortDir * s.cmp(a,b)) || byUrgency(a,b));
};
function renderEpics(){
  const ordered = epicsOrdered();
  document.getElementById("epics").innerHTML = ordered.length ? ordered.map(x=>{
    const t=x.total, dpct=t?x.done/t*100:0, opct=t?x.openc/t*100:0, rpct=t?x.other/t*100:0;
    const pm = PRIO_META[x.hp];
    const ch = (kids.get(x.e.id)||[]).slice().sort((a,b)=>
      ((a._open?0:1)-(b._open?0:1)) ||
      (PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]) ||
      (a.status<b.status?-1:a.status>b.status?1:0));
    const sLabel = (STATUS_META[x.e.status]||{label:x.e.status}).label;
    // the two sort metrics ride on the row, so an unfamiliar ordering explains itself
    const ageLine = `${x.age!=null?` · ${x.age}d old`:""}`
      + `${x.idle!=null?` · idle ${x.idle}d${x.idle>14?' <span class="flag stale">stale</span>':""}`:""}`;
    const eid = `<span class="cid">${IDP}${x.e.shortId}</span>`;   // click/tap to copy, as on a search hit
    const ecLine = (t
      ? `${eid} · ${x.done}/${x.total} done · ${x.openc} open${x.other?` · ${x.other} other`:""}`
      : `${eid} · ${sLabel} · no sub-issues yet`) + ageLine;
    const open = epicOpen.has(x.e.id);
    return `<div class="epic${t?"":" childless"}${open?" open":""}" data-eid="${x.e.id}" data-id="${IDP}${x.e.shortId}">
      <div><div class="et" title="${esc(x.e.title)}"><span class="caret">▸</span> ${esc(x.e.title)}</div>
        <div class="ec">${ecLine}</div></div>
      <div><div class="pbar">
        <i style="width:${dpct}%;background:var(--good)"></i>
        <i style="width:${opct}%;background:var(--blue)"></i>
        <i style="width:${rpct}%;background:var(--baseline)"></i></div></div>
      <div class="er"><span class="badge" style="color:${pm.color}">${pm.icon} ${pm.label}</span></div>
    </div>
    <div class="epic-children" data-eid="${x.e.id}"${open?"":" hidden"}>${ch.length?ch.map(childRow).join(""):`<div class="empty">No sub-issues yet — this epic hasn't been broken down.</div>`}</div>`;
  }).join("") : `<div class="empty">No epics to show.</div>`;
}

renderEpicSort();
renderEpics();
document.getElementById("epicSort").addEventListener("click", ev=>{
  const b = ev.target.closest("button[data-esort]"); if(!b) return;
  const k = b.dataset.esort;
  if(k===epicSortK) epicSortDir = -epicSortDir;      // clicking the active key flips it
  else { epicSortK = k; epicSortDir = 1; }
  renderEpicSort(); renderEpics();
});
document.getElementById("epics").addEventListener("click", ev=>{
  if(ev.target.closest(".cid")) return;                 // the id chip copies; it doesn't expand
  const row = ev.target.closest(".epic"); if(!row) return;
  const kidsEl = row.nextElementSibling;
  if(!kidsEl || !kidsEl.classList.contains("epic-children")) return;
  const willOpen = kidsEl.hasAttribute("hidden");
  kidsEl.toggleAttribute("hidden", !willOpen);
  row.classList.toggle("open", willOpen);
  if(willOpen) epicOpen.add(row.dataset.eid); else epicOpen.delete(row.dataset.eid);
});
