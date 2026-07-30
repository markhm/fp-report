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
const PRIO_ORDER = {critical:0, high:1, medium:2, low:3, "":4, null:4, undefined:4};
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
  const d = (i.description||"").trim();
  i._badDesc = /^\/\S+\.(md|txt|json)$/.test(d) || d==="";
}
const shortOf = id => (byId.get(id)?.shortId) ? IDP+byId.get(id).shortId : (id||"").slice(0,8);
const openIssues = ISSUES.filter(i=>i._open);

