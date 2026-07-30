// ---- dependency signals ----
const blockers = ISSUES.filter(i=>i._open && i._blockingOpen>0).sort((a,b)=>b._blockingOpen-a._blockingOpen).slice(0,12);
document.getElementById("blocking").innerHTML = blockers.length ? blockers.map(i=>`
  <li data-id="${IDP}${i.shortId}"><span class="n">${i._blockingOpen}</span><span>${prioBadge(i.priority)} <b>${IDP}${i.shortId}</b> ${esc(i.title)}</span></li>`).join("")
  : `<li class="empty">Nothing is blocking open work.</li>`;
const blocked = ISSUES.filter(i=>i._blocked).sort((a,b)=>PRIO_ORDER[prioKey(a.priority)]-PRIO_ORDER[prioKey(b.priority)]).slice(0,12);
document.getElementById("blockedList").innerHTML = blocked.length ? blocked.map(i=>`
  <li data-id="${IDP}${i.shortId}"><span class="n">${i._unmet.length}</span><span>${prioBadge(i.priority)} <b>${IDP}${i.shortId}</b> ${esc(i.title)}
    <span class="eid">waits on ${i._unmet.map(d=>IDP+d.shortId).join(", ")}</span></span></li>`).join("")
  : `<li class="empty">No open issue is blocked.</li>`;

