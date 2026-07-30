// ---- tabs ----
document.getElementById("tabIssuesN").textContent = openIssues.length;
function showPanel(id){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active", t.dataset.panel===id));
  document.querySelectorAll(".panel").forEach(p=>p.toggleAttribute("hidden", p.id!==id));
}
document.getElementById("tabs").addEventListener("click", e=>{
  const b = e.target.closest(".tab"); if(!b) return;
  showPanel(b.dataset.panel);
});
document.getElementById("hideDone").addEventListener("change", e=>{
  document.body.classList.toggle("hide-done", e.target.checked);
  // the tiles recompute rather than CSS-hide: dropping done changes every bar's scale
  showDone = !e.target.checked;
  if(FACETS.length) renderThemes();
});

// ---- footer + theme ----
document.getElementById("foot").textContent = `Generated from live fp state · ${new Date(NOW).toISOString()}`;
const root=document.documentElement, tb=document.getElementById("themeBtn");
tb.onclick=()=>{const cur=root.getAttribute("data-theme")|| (matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");
  root.setAttribute("data-theme", cur==="dark"?"light":"dark");};

// ---- right-click an issue row to copy its id ----
let toastT=null;
function toast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"), 1400);
}
function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  // fallback if the Clipboard API is unavailable (non-secure context)
  const ta=document.createElement("textarea");
  ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  let ok=false; try{ ok=document.execCommand("copy"); }catch(e){}
  ta.remove(); return ok?Promise.resolve():Promise.reject();
}
document.addEventListener("contextmenu", ev=>{
  const el=ev.target.closest("[data-id]"); if(!el) return;   // native menu elsewhere
  ev.preventDefault();
  const id=el.getAttribute("data-id");
  copyText(id).then(()=>toast(`Copied ${id}`), ()=>toast(`Couldn't copy — ${id}`));
});
function copyId(el){
  const holder=el.closest("[data-id]")||el;
  const id=holder.getAttribute("data-id")||el.textContent.trim();
  copyText(id).then(()=>toast(`Copied ${id}`), ()=>toast(`Couldn't copy — ${id}`));
}

// ---- global search: every issue, matched on id / title / spec (description) ----
// Space-separated terms are ANDed; id hits rank above title hits above spec hits.
// Serves the on-the-go use case: find a specced task fast, tap to read its spec.
const gq=document.getElementById("gq"), gqResults=document.getElementById("gqResults"),
      gqMeta=document.getElementById("gqMeta"), gqClear=document.getElementById("gqClear");
const SEARCH_LIMIT=60;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function mark(text, terms){                      // highlight terms in already-escaped text
  let out=esc(text);
  for(const t of terms){ if(!t) continue;
    out=out.replace(new RegExp("("+reEsc(t)+")","ig"), "<mark>$1</mark>"); }
  return out;
}
function runSearch(){
  const raw=gq.value.trim();
  const terms=raw.toLowerCase().split(/\s+/).filter(Boolean);
  gqClear.hidden = raw==="";
  document.body.classList.toggle("searching", terms.length>0);
  if(!terms.length){ gqResults.hidden=gqMeta.hidden=true; gqResults.innerHTML=""; return; }
  const hits=[];
  for(const i of ISSUES){
    const id=(IDP+i.shortId).toLowerCase(), title=(i.title||"").toLowerCase(), desc=(i.description||"").toLowerCase();
    let ok=true, score=0;
    for(const t of terms){
      const a=id.includes(t), b=title.includes(t), c=desc.includes(t);
      if(!(a||b||c)){ ok=false; break; }
      score += (a?6:0)+(b?4:0)+(c?1:0)+(title.startsWith(t)?2:0);
    }
    if(ok) hits.push({i, score: score+(i._open?2:0)});
  }
  hits.sort((x,y)=> y.score-x.score
    || (PRIO_ORDER[prioKey(x.i.priority)]-PRIO_ORDER[prioKey(y.i.priority)]));
  const total=hits.length, shown=hits.slice(0,SEARCH_LIMIT);
  gqMeta.hidden=false;
  gqMeta.textContent=`${total} match${total===1?"":"es"}`+(total>SEARCH_LIMIT?` · showing first ${SEARCH_LIMIT}`:"");
  gqResults.hidden=false;
  gqResults.innerHTML = total ? shown.map(({i})=>{
    const d=(i.description||"").trim();
    const hasDesc = d && !/^\/\S+\.(md|txt|json)$/.test(d);   // skip "spec is just a file path" stubs
    return `<article class="hit" data-id="${IDP}${i.shortId}">
      <div class="hit-top">
        <span class="cid hit-id">${IDP}${i.shortId}</span>
        ${prioBadge(i.priority)}${statusBadge(i.status)}
        ${i.parent?`<span class="eid">in ${esc(shortOf(i.parent))}</span>`:""}
      </div>
      <div class="hit-title">${mark(i.title||"(untitled)", terms)}</div>
      ${hasDesc?`<div class="hit-desc">${mark(d, terms)}</div>`:""}
    </article>`;
  }).join("") : `<div class="hit-empty">No issues match &ldquo;${esc(raw)}&rdquo;.</div>`;
}
gq.addEventListener("input", runSearch);
gqClear.addEventListener("click", ()=>{ gq.value=""; runSearch(); gq.focus(); });
gq.addEventListener("keydown", e=>{ if(e.key==="Escape"){ gq.value=""; runSearch(); } });

// ---- unified tap handling: copy-chip (any device) · expand a search hit · touch row-copy ----
const COARSE = matchMedia("(hover:none)").matches;
document.addEventListener("click", ev=>{
  const chip=ev.target.closest(".cid");
  if(chip){ ev.preventDefault(); ev.stopPropagation(); copyId(chip); return; }
  const hit=ev.target.closest(".hit");
  if(hit){ hit.classList.toggle("open"); return; }           // tap a result → read the full spec
  if(COARSE){ const row=ev.target.closest("[data-id]"); if(row) copyId(row); }  // touch: tap a row to copy its id
});
