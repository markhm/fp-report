// ---- meta ----
document.getElementById("meta").textContent =
  `${ISSUES.length} issues · ${openIssues.length} open · generated ${new Date(NOW).toLocaleString()}`;

// ---- KPIs ----
const wip = ISSUES.filter(i=>i.status==="in-progress");
const kpi = [
  {v:openIssues.length, l:"Open (active)"},
  {v:wip.length, l:"WIP — in progress", accent:wip.length>8?"var(--serious)":"var(--good)",
     note:wip.length>8?"above a healthy WIP limit":"within WIP limit"},
  {v:openIssues.filter(i=>i.priority==="critical").length, l:"Critical open", accent:"var(--critical)", icon:"⏫"},
  {v:openIssues.filter(i=>i.priority==="high").length, l:"High open", accent:"var(--serious)"},
  {v:ISSUES.filter(i=>i._blocked).length, l:"Blocked (unmet deps)", accent:"var(--warning)"},
  {v:ISSUES.filter(i=>i._isStale).length, l:"Stale >14d", accent:"var(--warning)"},
  {v:openIssues.filter(i=>i._unprio).length, l:"Unprioritised open", accent:"var(--baseline)"},
  {v:ISSUES.filter(i=>i._open&&i._badDesc).length, l:"Hygiene: bad descriptions", accent:"var(--serious)"},
];
document.getElementById("kpis").innerHTML = kpi.map(k=>`
  <div class="card kpi ${k.accent?'sig':''}" ${k.accent?`style="--accent:${k.accent}"`:''}>
    <div class="v">${k.v}</div><div class="l">${k.icon?k.icon+" ":""}${esc(k.l)}</div>
    ${k.note?`<div class="note">${esc(k.note)}</div>`:""}</div>`).join("");

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

