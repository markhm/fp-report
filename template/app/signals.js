// ---- signals ----
// One section per thing that is wrong with the backlog AS A PLAN. Each section says the
// rule, lists the issues it caught, and names the fix, so a count on the KPI strip is never
// a dead end. The flags themselves are derived in model.js; this file only presents them.
// Sections with nothing in them still render, collapsed to one line: an empty signal is
// information ("no stale claims"), and a section that vanished would read as "not checked".
const byPrioThenIdle = (a,b) =>
  (PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]) || ((b._stale??-1)-(a._stale??-1));
const childSummary = e => {
  const ch = kids.get(e.id)||[];
  const done = ch.filter(c=>DONE.has(c.status)).length;
  const moving = ch.filter(c=>OPEN.has(c.status) && c.status!==BACKLOG).length;
  return `${done}/${ch.length} children done${moving?` · ${moving} in motion`:""}`;
};
const SIGNALS = [
  { key:"budget", title:"Critical over budget",
    rule:`more than ${CRITICAL_BUDGET} open critical issues (CRITICAL_BUDGET)`,
    fix:"re-rank: when everything is critical, nothing is — keep critical for live harm or a blocked commitment",
    items: overBudget ? openCritical : [], meta: focusMeta,
    note: overBudget ? "" : `${openCritical.length} critical open, within the budget of ${CRITICAL_BUDGET}` },
  { key:"urgentIdle", title:"Urgent but idle",
    rule:`critical or high, untouched for more than ${URGENT_IDLE_DAYS} days (URGENT_IDLE_DAYS); epics with children excluded`,
    fix:"start it, or lower its priority — an urgent item nobody touches is a mislabelled one",
    items: ISSUES.filter(i=>i._urgentIdle), meta: focusMeta },
  { key:"staleClaim", title:"Stale claims",
    rule:`in progress, idle for more than ${CLAIM_IDLE_DAYS} days (CLAIM_IDLE_DAYS)`,
    fix:"finish it or release it — a quiet claim looks owned, so nobody else picks it up",
    items: ISSUES.filter(i=>i._staleClaim), meta: focusMeta },
  { key:"epicReady", title:"Epics ready to close",
    rule:"open epic whose children are all done or rejected",
    fix:"close the epic (or add the work it is still waiting for as a child)",
    items: ISSUES.filter(i=>i._epicReady), meta: childSummary },
  { key:"epicBehind", title:"Epic status behind its children",
    rule:`epic still in ${(STATUS_META[BACKLOG]||{label:BACKLOG}).label} while children are done or in motion`,
    fix:"move the epic forward so the roadmap shows it is underway",
    items: ISSUES.filter(i=>i._epicBehind), meta: childSummary },
  { key:"unprio", title:"Unprioritised",
    rule:"open, with no priority",
    fix:"give it a priority — an unranked item cannot be compared with anything",
    items: openIssues.filter(i=>i._unprio), meta: focusMeta },
  { key:"blocked", title:"Blocked",
    rule:"open, with at least one dependency not yet done or rejected",
    fix:"unblock the dependency first, or re-plan without it",
    items: ISSUES.filter(i=>i._blocked), meta: focusMeta },
  { key:"orphan", title:"Orphaned",
    rule:"open under a closed epic — see the Orphans tab for them grouped by epic",
    fix:"re-home under a live epic, make standalone, or close",
    items: ISSUES.filter(i=>i._orphan), meta: i=>{ const p=byId.get(i.parent);
      return p?`under closed <span class="cid">${IDP}${p.shortId}</span> ${esc(p.title)}`:""; } },
  { key:"badDesc", title:"Bad descriptions",
    rule:"open, with an empty description or only a file path",
    fix:"write what the issue is for — a path is not a spec",
    items: openIssues.filter(i=>i._badDesc), meta: focusMeta },
];
for(const s of SIGNALS) s.items.sort(byPrioThenIdle);
const signalCount = SIGNALS.filter(s=>s.items.length).length;

document.getElementById("tabSignalsN").textContent = signalCount;
document.getElementById("signals").innerHTML = SIGNALS.map(s=>`
  <section class="card sigsec${s.items.length?"":" quiet"}" id="sig-${s.key}" data-sig="${s.key}">
    <div class="sig-head">
      <span class="sig-t">${esc(s.title)}</span>
      <span class="sig-n">${s.items.length}</span>
      <span class="sig-rule">${esc(s.rule)}</span>
      ${s.items.length?`<span class="sig-fix">→ ${esc(s.fix)}</span>`:""}
    </div>
    ${s.items.length
      ? s.items.map(i=>signalRow(i, s.meta(i))).join("")
      : `<div class="empty">${esc(s.note || "Nothing here.")}</div>`}
  </section>`).join("");

// a KPI card (or anything carrying data-sig-go) opens the Signals tab at its section
function goSignal(key){
  showPanel("panel-signals");
  const el = document.getElementById("sig-"+key);
  if(el && el.scrollIntoView) el.scrollIntoView({behavior:"smooth", block:"start"});
}
