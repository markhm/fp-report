// ---- epic roadmap ----
// An "epic" = any issue with children, OR any issue whose title contains the whole
// word "Epic" (e.g. "Epic: …" containers not yet broken into sub-issues).
const isEpicTitle = i => /\bepic\b/i.test(i.title||"");
const epics = ISSUES.filter(i=>kids.has(i.id) || isEpicTitle(i)).map(e=>{
  const ch = kids.get(e.id) || [];
  const done = ch.filter(c=>DONE.has(c.status)).length;
  const openc = ch.filter(c=>c._open).length;
  const other = ch.length-done-openc;
  const hp = prioKey(e.priority);   // the epic's OWN priority — child priorities are scoped to the epic, not global
  return {e, total:ch.length, done, openc, other, hp};
})                                             // active roadmap: epics with open children,
.filter(x=> x.openc>0 || (isEpicTitle(x.e) && x.e._open))  // plus still-open "Epic"-titled issues (incl. childless)
.sort((a,b)=> (PRIO_ORDER[a.hp]-PRIO_ORDER[b.hp]) || (b.openc-a.openc) || (b.total-a.total));
document.getElementById("tabEpicsN").textContent = epics.length;
function childRow(c){
  return `<div class="echild${DONE.has(c.status)?" is-done":""}" data-id="${IDP}${c.shortId}">
    <span class="eeid">${IDP}${c.shortId}</span>
    <span class="eet" title="${esc(c.title)}">${esc(c.title)}</span>
    ${prioBadge(c.priority)}
    ${statusBadge(c.status)}
    <span class="eeidle">${c._stale!=null?c._stale+"d":"—"}</span>
  </div>`;
}
document.getElementById("epics").innerHTML = epics.length ? epics.map((x,idx)=>{
  const t=x.total, dpct=t?x.done/t*100:0, opct=t?x.openc/t*100:0, rpct=t?x.other/t*100:0;
  const pm = PRIO_META[x.hp];
  const ch = (kids.get(x.e.id)||[]).slice().sort((a,b)=>
    ((a._open?0:1)-(b._open?0:1)) ||
    (PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]) ||
    (a.status<b.status?-1:a.status>b.status?1:0));
  const sLabel = (STATUS_META[x.e.status]||{label:x.e.status}).label;
  const ecLine = t
    ? `${IDP}${x.e.shortId} · ${x.done}/${x.total} done · ${x.openc} open${x.other?` · ${x.other} other`:""}`
    : `${IDP}${x.e.shortId} · ${sLabel} · no sub-issues yet`;
  return `<div class="epic${t?"":" childless"}" data-eidx="${idx}">
    <div><div class="et" title="${esc(x.e.title)}"><span class="caret">▸</span> ${esc(x.e.title)}</div>
      <div class="ec">${ecLine}</div></div>
    <div><div class="pbar">
      <i style="width:${dpct}%;background:var(--good)"></i>
      <i style="width:${opct}%;background:var(--blue)"></i>
      <i style="width:${rpct}%;background:var(--baseline)"></i></div></div>
    <div class="er"><span class="badge" style="color:${pm.color}">${pm.icon} ${pm.label}</span></div>
  </div>
  <div class="epic-children" data-eidx="${idx}" hidden>${ch.length?ch.map(childRow).join(""):`<div class="empty">No sub-issues yet — this epic hasn't been broken down.</div>`}</div>`;
}).join("") : `<div class="empty">No epics to show.</div>`;
document.getElementById("epics").addEventListener("click", ev=>{
  const row = ev.target.closest(".epic"); if(!row) return;
  const kidsEl = row.nextElementSibling;
  if(!kidsEl || !kidsEl.classList.contains("epic-children")) return;
  const willOpen = kidsEl.hasAttribute("hidden");
  kidsEl.toggleAttribute("hidden", !willOpen);
  row.classList.toggle("open", willOpen);
});

