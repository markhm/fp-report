// ---- focus ----
// The landing view: every open critical and high WORK ITEM in one ranked list, so "what
// matters now" is a single screen rather than a filter recipe on the Issues tab. Epics are
// left out on purpose: they are containers, ranked on the Epics tab, and their own
// updatedAt does not reflect the work inside them.
//
// Ranking, in order: priority; then work that blocks other open work (unblocking it
// releases more than itself); then unblocked before blocked (a blocked item cannot be
// started, so it should not crowd the top); then the longest idle first (the item most at
// risk of being forgotten).
const focusRank = (a,b) =>
  (PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]) ||
  (b._blockingOpen-a._blockingOpen) ||
  ((a._blocked?1:0)-(b._blocked?1:0)) ||
  ((b._stale??-1)-(a._stale??-1));
const focusIssues = openIssues.filter(i=>isUrgent(i) && !i._isEpic).sort(focusRank);
let focusHideBlocked = false;

// one line of context under the title: where it lives, how old, what it holds up
function focusMeta(i){
  const par = i.parent ? byId.get(i.parent) : null;
  const bits = [];
  if(par) bits.push(`in <span class="cid">${IDP}${par.shortId}</span> ${esc(par.title)}`);
  if(i._age!=null) bits.push(`${i._age}d old`);
  if(i._blockingOpen) bits.push(`<span class="blk">blocks ${i._blockingOpen}</span>`);
  if(i._blocked) bits.push(`<span class="blk">⛔ blocked by ${i._unmet.map(d=>`<span class="cid">${IDP}${d.shortId}</span>`).join(", ")}</span>`);
  if(i._claim) bits.push(`claimed ${esc(i._claim)}`);
  if(i._staleClaim) bits.push(`<span class="flag stale">claim idle ${i._stale}d</span>`);
  else if(i._urgentIdle) bits.push(`<span class="flag stale">idle &gt;${URGENT_IDLE_DAYS}d</span>`);
  return bits.join(" · ");
}
// the row shape shared with the Signals tab: id chip, title + context line, badges, idle
function signalRow(i, meta){
  return `<div class="echild frow${DONE.has(i.status)?" is-done":""}" data-id="${IDP}${i.shortId}">
    <span class="eeid cid">${IDP}${i.shortId}</span>
    <span class="eet"><span class="ft" title="${esc(i.title)}">${esc(i.title)}</span>${meta?`<span class="fmeta">${meta}</span>`:""}</span>
    ${prioBadge(i.priority)}
    ${statusBadge(i.status)}
    <span class="eeidle">${i._stale!=null?i._stale+"d":"—"}</span>
  </div>`;
}
function renderFocus(){
  const rows = focusIssues.filter(i=>!(focusHideBlocked && i._blocked));
  const nCrit = focusIssues.filter(i=>i.priority==="critical").length;
  const nBlocked = focusIssues.filter(i=>i._blocked).length;
  document.getElementById("focusBar").innerHTML =
    `<span class="lbl">${focusIssues.length} open</span>`
    + `<span class="facet">⏫ critical ${nCrit}</span>`
    + `<span class="facet">🔼 high ${focusIssues.length-nCrit}</span>`
    // the budget counts every open critical issue, epics included, so it is shown apart from
    // the Focus count (work items only) rather than appended to it, where 4 "over budget of 5"
    // reads as a contradiction
    + (overBudget ? (reportOn("panel-signals")
        ? `<span class="facet over" data-sig-go="budget" role="button" tabindex="0">${openCritical.length} critical open incl. epics · over the budget of ${CRITICAL_BUDGET}</span>`
        : `<span class="facet over">${openCritical.length} critical open incl. epics · over the budget of ${CRITICAL_BUDGET}</span>`) : "")
    + `<label class="chk"><input type="checkbox" id="focusHideBlocked"${focusHideBlocked?" checked":""}> hide blocked (${nBlocked})</label>`;
  document.getElementById("focus").innerHTML = rows.length
    ? rows.map(i=>signalRow(i, focusMeta(i))).join("")
    : `<div class="empty">Nothing critical or high is open.</div>`;
}
document.getElementById("tabFocusN").textContent = focusIssues.length;
renderFocus();
document.getElementById("focusBar").addEventListener("click", ev=>{
  const b = ev.target.closest("[data-sig-go]"); if(b) goSignal(b.dataset.sigGo);
});
document.getElementById("focusBar").addEventListener("keydown", ev=>{
  const b = ev.target.closest("[data-sig-go]");
  if(b && (ev.key==="Enter" || ev.key===" ")){ ev.preventDefault(); goSignal(b.dataset.sigGo); }
});
document.getElementById("focusBar").addEventListener("change", ev=>{
  if(ev.target.id!=="focusHideBlocked") return;
  focusHideBlocked = ev.target.checked; renderFocus();
});
