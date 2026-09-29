"use strict";
const GENERATED_AT = "__GENERATED_AT__";
const RAW = JSON.parse(document.getElementById("fp-data").textContent);
const ISSUES = (RAW.issues || RAW || []);
const NOW = new Date(GENERATED_AT).getTime() || Date.now();
const DAY = 86400000;
const IDP = "__ID_PREFIX__" + "-";       // fp short-id prefix, e.g. PMDS- (injected from fp-report.conf)

// ---- theme taxonomy (configurable — injected from fp-report.themes.json) ----
const THEMES_CONFIG = __THEMES_CONFIG__;

// ---- status model (configurable — injected from fp-report.status.json, mirrors workflow.ts) ----
const STATUS_CONFIG = __STATUS_CONFIG__;
const STATUS_LIST = STATUS_CONFIG.statuses || [];
// Semantic colour names → theme CSS vars (light/dark aware). A raw #hex or var(...) passes through.
const COLOR_VARS = {neutral:"--muted", grey:"--ink-2", gray:"--ink-2", blue:"--blue", gold:"--blue",
  teal:"--teal", purple:"--purple", indigo:"--aqua", mint:"--mint", green:"--good", success:"--good",
  orange:"--serious", amber:"--warning", red:"--critical", critical:"--critical"};
const statusColor = c => !c ? "var(--muted)" : (/^(var\(|#)/.test(c) ? c : `var(${COLOR_VARS[c]||"--muted"})`);
// role: "open" = active work; "done" = terminal complete; "rejected" = terminal, won't-do.
// A dependency is "satisfied" (MET) once it is done OR rejected.
const OPEN = new Set(STATUS_LIST.filter(s=>s.role==="open").map(s=>s.key));
const DONE = new Set(STATUS_LIST.filter(s=>s.role==="done").map(s=>s.key));
const MET  = new Set(STATUS_LIST.filter(s=>s.role==="done"||s.role==="rejected").map(s=>s.key));
const OPEN_ORDER = STATUS_LIST.filter(s=>s.role==="open").map(s=>s.key);   // registry order, for dist + filter
// "unset" is what prioKey() returns for no priority; without it every comparator that
// indexes PRIO_ORDER[prioKey(p)] gets NaN for an unprioritised issue, which is falsy, so the
// sort silently falls through to its next key and the ordering stops being transitive.
const PRIO_ORDER = {critical:0, high:1, medium:2, low:3, unset:4, "":4, null:4, undefined:4};
const PRIO_META = {
  critical:{label:"Critical", color:"var(--critical)", icon:"⏫"},
  high:    {label:"High",     color:"var(--serious)",  icon:"🔼"},
  medium:  {label:"Medium",   color:"var(--warning)",  icon:"◆"},
  low:     {label:"Low",      color:"var(--muted)",    icon:"▽"},
  unset:   {label:"Unset",    color:"var(--baseline)", icon:"—"},
};
// STATUS_META (label + theme-aware colour) built from the configurable registry above.
const STATUS_META = Object.fromEntries(
  STATUS_LIST.map(s=>[s.key, {label:s.label||s.key, color:statusColor(s.color)}]));
const prioKey = p => (p && PRIO_META[p]) ? p : "unset";
const days = ts => { const t = Date.parse(ts||""); return isNaN(t)?null:Math.floor((NOW-t)/DAY); };
const esc = s => String(s??"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// ---- index + derive ----
const byId = new Map(ISSUES.map(i=>[i.id,i]));
const kids = new Map();                 // parentId -> children[]
const dependents = new Map();           // depId -> [issues depending on it]
for(const i of ISSUES){
  if(i.parent){ (kids.get(i.parent)||kids.set(i.parent,[]).get(i.parent)).push(i); }
  for(const d of (i.dependencies||[])){ (dependents.get(d)||dependents.set(d,[]).get(d)).push(i); }
}
for(const i of ISSUES){
  i._open = OPEN.has(i.status);
  i._age = days(i.createdAt);
  i._stale = days(i.updatedAt);
  i._isStale = i._open && (i._stale!=null && i._stale>14);
  i._unmet = (i.dependencies||[]).map(d=>byId.get(d)).filter(d=>d && !MET.has(d.status));
  i._blocked = i._open && i._unmet.length>0;
  i._blockingOpen = (dependents.get(i.id)||[]).filter(x=>x._open===undefined?OPEN.has(x.status):x._open).length;
  i._unprio = i._open && !PRIO_META[i.priority];
  // orphan: the parent epic is CLOSED (terminal — done or rejected) but this issue is not.
  // The work was neither finished nor re-homed when its epic was closed, so it now sits in
  // a container nobody is looking at. Only the DIRECT parent is tested: a still-open
  // sub-epic under a closed epic is itself the orphan, and re-homing it moves its whole
  // subtree — reporting its children too would just restate the same fix.
  const par = i.parent ? byId.get(i.parent) : null;
  i._orphan = !!(par && MET.has(par.status) && !MET.has(i.status));
  const d = (i.description||"").trim();
  i._badDesc = /^\/\S+\.(md|txt|json)$/.test(d) || d==="";
}
// ---- signals (thresholds injected from fp-report.conf) ----
// Each flag names one thing that is wrong with the backlog AS A PLAN, and the Signals tab
// lists the issues behind it with the fix. They are derived here, once, so the KPI strip,
// the Focus list and the Signals tab count exactly the same thing.
// One definition of "epic", shared by the Epics tab and the Focus/Signals rules: an issue
// with children, OR one whose title contains the whole word "Epic" (a container not yet
// broken into sub-issues).
const isEpicTitle = i => /\bepic\b/i.test(i.title||"");
// Which tabs exist (REPORTS_INCLUDED). Defined here, not in ui.js, because the KPI strip
// and the Focus bar render before ui.js runs and must not offer a link to an unbuilt tab.
const REPORTS = __REPORTS_INCLUDED__;
const reportOf = id => (id||"").replace("panel-","");
const reportOn = id => !REPORTS.length || REPORTS.includes(reportOf(id));
const SIGNAL_CONFIG = __SIGNAL_CONFIG__;
const CRITICAL_BUDGET  = SIGNAL_CONFIG.criticalBudget;
const URGENT_IDLE_DAYS = SIGNAL_CONFIG.urgentIdleDays;
const CLAIM_IDLE_DAYS  = SIGNAL_CONFIG.claimIdleDays;
const BACKLOG = OPEN_ORDER[0];            // the first open status in the registry = "not started"
const isUrgent = i => i.priority==="critical" || i.priority==="high";
// A child that is a REVIEW of its parent (REVIEW_TITLE_RE, e.g. "Code review: …") is not
// part of the parent's scope. Counting it made a work item with one finished review look
// like an epic whose every child is done — "ready to close" while its own work was open —
// and dropped that work item from Focus as if it were a container.
// The engine rejects patterns JavaScript reads differently, but a pattern that still fails to
// compile here must not take the whole page down with it: the exclusion is switched off and
// the Signals tab says so, rather than every tab rendering blank.
let REVIEW_RE = null, REVIEW_RE_ERROR = "";
try { REVIEW_RE = SIGNAL_CONFIG.reviewTitleRe ? new RegExp(SIGNAL_CONFIG.reviewTitleRe, "i") : null; }
catch(e) { REVIEW_RE_ERROR = String(e && e.message || e); }
const isReview = i => !!REVIEW_RE && REVIEW_RE.test(i.title||"");
const scopeOf = i => (kids.get(i.id)||[]).filter(c=>!isReview(c));
for(const i of ISSUES){
  const ch = scopeOf(i);
  i._isEpic = ch.length>0 || isEpicTitle(i);
  // the workstation property is an fp workflow claim ('<machine>:<tree>'); absent on
  // projects without that extension, and only fetched with labels (FETCH_LABELS)
  i._claim = (i.properties||{}).workstation || "";
  // Urgent work nobody has touched. An epic WITH children is left out, because its own
  // updatedAt only moves when the epic RECORD is edited (the Epics tab rolls activity up
  // from the children). A childless "Epic:"-titled issue stays in: for it, its own
  // updatedAt IS the signal, and an idle urgent container must not vanish from every list.
  i._urgentIdle = i._open && ch.length===0 && isUrgent(i) && i._stale!=null && i._stale>URGENT_IDLE_DAYS;
  // A claim that went quiet: in progress, but idle past the claim threshold. This is the
  // issue that looks owned and is not — nobody picks it up because it looks taken.
  i._staleClaim = i._open && i.status==="in-progress" && i._stale!=null && i._stale>CLAIM_IDLE_DAYS;
  // Epic status that contradicts its children (reviews excluded, see scopeOf). Ready: every
  // child is terminal (done or rejected) yet the epic is open. Behind: the epic still sits
  // in the backlog status while a child is MOVING (an open status past the backlog). A done
  // child alone is not drift: a partly-done epic with nothing in motion is paused, and
  // Backlog says so truthfully.
  i._epicReady  = i._open && ch.length>0 && ch.every(c=>MET.has(c.status));
  i._epicBehind = i._open && ch.length>0 && i.status===BACKLOG && !i._epicReady
    && ch.some(c=>OPEN.has(c.status) && c.status!==BACKLOG);
}
const openCritical = ISSUES.filter(i=>i._open && i.priority==="critical");
const overBudget = openCritical.length > CRITICAL_BUDGET;

const shortOf = id => (byId.get(id)?.shortId) ? IDP+byId.get(id).shortId : (id||"").slice(0,8);
const openIssues = ISSUES.filter(i=>i._open);

