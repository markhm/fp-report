// ---- meta ----
document.getElementById("meta").textContent =
  `${ISSUES.length} issues · ${openIssues.length} open · generated ${new Date(NOW).toLocaleString()}`;

// ---- KPIs ----
const wip = ISSUES.filter(i=>i.status==="in-progress");
const kpi = [
  {v:openIssues.length, l:"Open (active)", panel:"panel-issues"},
  {v:wip.length, l:"WIP — in progress", accent:wip.length>8?"var(--serious)":"var(--good)",
     note:wip.length>8?"above a healthy WIP limit":"within WIP limit", sig:"staleClaim"},
  {v:openCritical.length, l:"Critical open", accent:"var(--critical)", icon:"⏫", panel:"panel-focus",
     note:overBudget?`over the budget of ${CRITICAL_BUDGET}`:`budget ${CRITICAL_BUDGET}`},
  {v:openIssues.filter(i=>i.priority==="high").length, l:"High open", accent:"var(--serious)", panel:"panel-focus"},
  {v:ISSUES.filter(i=>i._urgentIdle).length, l:`Urgent, idle >${URGENT_IDLE_DAYS}d`, accent:"var(--serious)", sig:"urgentIdle"},
  {v:ISSUES.filter(i=>i._staleClaim).length, l:`Stale claims >${CLAIM_IDLE_DAYS}d`, accent:"var(--warning)", sig:"staleClaim"},
  {v:ISSUES.filter(i=>i._epicReady||i._epicBehind).length, l:"Epic status drift", accent:"var(--warning)", sig:"epicReady"},
  {v:ISSUES.filter(i=>i._blocked).length, l:"Blocked (unmet deps)", accent:"var(--warning)", sig:"blocked"},
  {v:ISSUES.filter(i=>i._isStale).length, l:"Stale >14d", accent:"var(--warning)", panel:"panel-issues"},
  {v:openIssues.filter(i=>i._unprio).length, l:"Unprioritised open", accent:"var(--baseline)", sig:"unprio"},
  {v:ISSUES.filter(i=>i._orphan).length, l:"Orphaned — under a closed epic", accent:"var(--serious)", panel:"panel-orphans"},
  {v:ISSUES.filter(i=>i._open&&i._badDesc).length, l:"Hygiene: bad descriptions", accent:"var(--serious)", sig:"badDesc"},
];
// every card is a way in: a signal opens its section on the Signals tab, the rest their tab.
// A card whose target tab is not built (REPORTS_INCLUDED) is rendered as plain text rather
// than as a link that silently does nothing.
const kpiTarget = k => k.sig ? "panel-signals" : (k.panel||"");
const kpiLinks = k => !!kpiTarget(k) && reportOn(kpiTarget(k));
document.getElementById("kpis").innerHTML = kpi.map(k=>`
  <div class="card kpi${kpiLinks(k)?" go":""} ${k.accent?'sig':''}" ${k.accent?`style="--accent:${k.accent}"`:''}
       ${kpiLinks(k)?`${k.sig?`data-sig-go="${k.sig}"`:`data-panel-go="${kpiTarget(k)}"`} role="button" tabindex="0"`:""}>
    <div class="v">${k.v}</div><div class="l">${k.icon?k.icon+" ":""}${esc(k.l)}</div>
    ${k.note?`<div class="note">${esc(k.note)}</div>`:""}</div>`).join("");
function kpiGo(ev){
  const c = ev.target.closest(".kpi.go"); if(!c) return;
  if(c.dataset.sigGo) goSignal(c.dataset.sigGo);
  else if(c.dataset.panelGo) showPanel(c.dataset.panelGo);
}
document.getElementById("kpis").addEventListener("click", kpiGo);
// role="button" promises the keyboard: Enter and Space activate, as on a real button
document.getElementById("kpis").addEventListener("keydown", ev=>{
  if(ev.key==="Enter" || ev.key===" "){ ev.preventDefault(); kpiGo(ev); }
});

// ---- distributions (open) ----
function distBars(el, groups, colorFn){
  const max = Math.max(1, ...groups.map(g=>g.n));
  el.innerHTML = groups.map(g=>`
    <div class="brow">
      <span class="bl"><span class="dot" style="background:${g.color}"></span>${esc(g.label)}</span>
      <span class="track"><span class="fill" style="width:${(g.n/max*100).toFixed(1)}%;background:${g.color}"></span></span>
      <span class="bn">${g.n}</span>
    </div>`).join("");
}
distBars(document.getElementById("distPrio"),
  ["critical","high","medium","low","unset"].map(p=>({label:PRIO_META[p].label,
     color:PRIO_META[p].color, n:openIssues.filter(i=>prioKey(i.priority)===p).length})));
distBars(document.getElementById("distStatus"),
  OPEN_ORDER.map(s=>({label:STATUS_META[s].label,
     color:STATUS_META[s].color, n:openIssues.filter(i=>i.status===s).length})));

