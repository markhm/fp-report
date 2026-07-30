// ---- prioritisation table ----
function prioBadge(p){const m=PRIO_META[prioKey(p)];
  return `<span class="badge" style="color:${m.color}"><span class="dot" style="background:${m.color}"></span>${m.label}</span>`;}
function statusBadge(s){const m=STATUS_META[s]||{label:s,color:"var(--muted)"};
  return `<span class="badge"><span class="dot" style="background:${m.color}"></span>${m.label}</span>`;}

const COLS = [
  {k:"shortId", t:"ID", get:i=>IDP+i.shortId, cell:i=>`${IDP}${i.shortId}`, num:false},
  {k:"title", t:"Title", get:i=>i.title, cell:i=>`<div class="ttl" title="${esc(i.title)}">${esc(i.title)}</div>`},
  {k:"epic", t:"Epic", get:i=>i.parent?shortOf(i.parent):"~", cell:i=>i.parent?`<span class="eid">${shortOf(i.parent)}</span>`:`<span class="eid">—</span>`},
  {k:"priority", t:"Priority", get:i=>PRIO_ORDER[prioKey(i.priority)], cell:i=>prioBadge(i.priority)},
  {k:"status", t:"Status", get:i=>i.status, cell:i=>statusBadge(i.status)},
  {k:"age", t:"Age d", get:i=>i._age??-1, cell:i=>i._age??"—", num:true},
  {k:"stale", t:"Idle d", get:i=>i._stale??-1, cell:i=>`${i._stale??"—"}${i._isStale?' <span class="flag stale">stale</span>':""}`, num:true},
  {k:"blocked", t:"Blocked", get:i=>i._unmet.length, cell:i=>i._unmet.length?`<span class="flag">✦ ${i._unmet.length}</span>`:"", num:true},
  {k:"blocking", t:"Blocks", get:i=>i._blockingOpen, cell:i=>i._blockingOpen||"", num:true},
];
let sortK="priority", sortAsc=true;
// no parent + no children default ON — the individual-issue review usually wants leaf issues (no epics, no umbrellas)
const F = {q:"",prio:"",status:"",epic:"",theme:"",blocked:false,stale:false,unprio:false,noParent:true,noChildren:true};

// filter option lists
const epicOpts = [...new Set(openIssues.filter(i=>i.parent).map(i=>i.parent))]
  .map(id=>({id,label:shortOf(id)+" · "+((byId.get(id)?.title)||"").slice(0,40)}))
  .sort((a,b)=>a.label.localeCompare(b.label));
document.getElementById("fEpic").insertAdjacentHTML("beforeend",
  epicOpts.map(o=>`<option value="${o.id}">${esc(o.label)}</option>`).join(""));
document.getElementById("fPrio").insertAdjacentHTML("beforeend",
  ["critical","high","medium","low","unset"].map(p=>`<option value="${p}">${PRIO_META[p].label}</option>`).join(""));
document.getElementById("fStatus").insertAdjacentHTML("beforeend",
  OPEN_ORDER.map(s=>`<option value="${s}">${STATUS_META[s].label}</option>`).join(""));

function rows(){
  let r = openIssues.filter(i=>{
    if(F.q){const q=F.q.toLowerCase(); if(!(i.title.toLowerCase().includes(q)||(IDP.toLowerCase()+i.shortId).includes(q))) return false;}
    if(F.prio && prioKey(i.priority)!==F.prio) return false;
    if(F.status && i.status!==F.status) return false;
    if(F.epic && i.parent!==F.epic) return false;
    // themes are resolved per facet; filter against whichever facet the tiles show
    if(F.theme && facetOf(facetKey)._index.get(i.id).key!==F.theme) return false;
    if(F.blocked && !i._blocked) return false;
    if(F.stale && !i._isStale) return false;
    if(F.unprio && !i._unprio) return false;
    if(F.noParent && i.parent) return false;
    if(F.noChildren && kids.has(i.id)) return false;
    return true;
  });
  const col = COLS.find(c=>c.k===sortK);
  r.sort((a,b)=>{const av=col.get(a),bv=col.get(b);
    let c = (av<bv?-1:av>bv?1:0); if(c===0) c = PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)];
    return sortAsc?c:-c;});
  return r;
}
function renderTable(){
  const thead=document.querySelector("#tbl thead"), tbody=document.querySelector("#tbl tbody");
  thead.innerHTML = "<tr>"+COLS.map(c=>`<th data-k="${c.k}" class="${c.num?'num':''} ${c.k===sortK?'sorted '+(sortAsc?'asc':''):''}">${c.t}</th>`).join("")+"</tr>";
  const r=rows();
  tbody.innerHTML = r.map(i=>`<tr class="${i._blocked?'blocked':''}" data-id="${IDP}${i.shortId}">`+
    COLS.map(c=>`<td class="${c.num?'num':''} ${c.k==='title'?'tt':''}" data-label="${c.t}">${c.cell(i)}</td>`).join("")+"</tr>").join("");
  document.getElementById("tCount").innerHTML = `<b>${r.length}</b> of ${openIssues.length} shown`;
  thead.querySelectorAll("th").forEach(th=>th.onclick=()=>{
    const k=th.dataset.k; if(k===sortK) sortAsc=!sortAsc; else {sortK=k; sortAsc=(k==="title"||k==="shortId");}
    renderTable();});
}
document.getElementById("q").oninput=e=>{F.q=e.target.value;renderTable();};
document.getElementById("fPrio").onchange=e=>{F.prio=e.target.value;renderTable();};
document.getElementById("fStatus").onchange=e=>{F.status=e.target.value;renderTable();};
document.getElementById("fEpic").onchange=e=>{F.epic=e.target.value;renderTable();};
document.getElementById("fBlocked").onchange=e=>{F.blocked=e.target.checked;renderTable();};
document.getElementById("fStale").onchange=e=>{F.stale=e.target.checked;renderTable();};
document.getElementById("fUnprio").onchange=e=>{F.unprio=e.target.checked;renderTable();};
document.getElementById("fNoParent").onchange=e=>{F.noParent=e.target.checked;renderTable();};
document.getElementById("fNoChildren").onchange=e=>{F.noChildren=e.target.checked;renderTable();};

