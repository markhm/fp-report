#!/usr/bin/env node
/* assert_epics.js — assert on the epic roadmap's sort inside a rendered fp-report.
 *
 *   node test/assert_epics.js <html> <check> [args…]
 *     order  <key> <dir> <sid,sid,…>  the roadmap's order under a sort key (dir: fwd|rev)
 *     keys   <k,k,…>                  the sort keys offered, in bar order
 *     idle   <sid> <n>                an epic's rolled-up idle days
 *     sameas <sid> <childSid>         the epic's last activity IS that child's updatedAt
 *     age    <sid> <n>                an epic's age in days (from its own createdAt)
 *     listed <sid,sid,…>              exactly these epics are on the roadmap
 *     html   <substring>              the rendered #epics markup contains this
 *
 * Evaluates the report's REAL injected script against the shared DOM stub, so the
 * assertions exercise the shipped comparators rather than a copy of them.
 * Exits 0 on pass, 1 on mismatch.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app, nodes } = require("./dom-stub")(html_path);

global.__r = null;
eval(app + `
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  const sids = xs => xs.map(x => x.e.shortId).join(",");
  const epicOf = sid => epics.find(x => x.e.shortId === sid);
  if (CHECK === "order") {
    epicSortK = A[0]; epicSortDir = A[1] === "rev" ? -1 : 1;
    const got = sids(epicsOrdered());
    __r = { ok: got === A[2], msg: "order by " + A[0] + " " + A[1] + ": expected " + A[2] + ", got " + got };
  } else if (CHECK === "keys") {
    const got = EPIC_SORTS.map(s => s.k).join(",");
    __r = { ok: got === A[0], msg: "sort keys: expected " + A[0] + ", got " + got };
  } else if (CHECK === "idle" || CHECK === "age") {
    const x = epicOf(A[0]);
    if (!x) { __r = { ok: false, msg: "no such epic on the roadmap: " + A[0] }; }
    else { const got = x[CHECK];
      __r = { ok: got === Number(A[1]), msg: A[0] + " " + CHECK + ": expected " + A[1] + ", got " + got }; }
  } else if (CHECK === "sameas") {
    // the roll-up must follow the CHILD's clock, not the epic record's own updatedAt
    const x = epicOf(A[0]), c = ISSUES.find(i => i.shortId === A[1]);
    const own = days(x.e.updatedAt);
    __r = { ok: x.idle === c._stale && x.idle !== own,
            msg: A[0] + " last activity: expected child " + A[1] + " (" + c._stale + "d), got "
                 + x.idle + "d (own record: " + own + "d)" };
  } else if (CHECK === "keepsopen") {
    // expand one epic, re-sort under a different key, and check the SAME epic is still the
    // one rendered open — the row/children pairing must follow the id, not the slot index
    const x = epicOf(A[0]);
    epicSortK = "urgency"; epicSortDir = 1; epicOpen.add(x.e.id); renderEpics();
    epicSortK = A[1]; epicSortDir = 1; renderEpics();
    const rows = [...document.getElementById("epics").innerHTML.matchAll(
      /<div class="epic([^"]*)" data-eid="([^"]+)">/g)];
    const openRows = rows.filter(m => / open/.test(m[1])).map(m => m[2]);
    const kidsOpen = new RegExp('<div class="epic-children" data-eid="' + x.e.id + '">').test(
      document.getElementById("epics").innerHTML);
    __r = { ok: openRows.length === 1 && openRows[0] === x.e.id && kidsOpen,
            msg: A[0] + " should still be the one open row after re-sorting by " + A[1]
                 + " — open rows: [" + openRows.join(",") + "], its children shown: " + kidsOpen };
  } else if (CHECK === "listed") {
    const got = sids(epics.slice().sort((a,b) => a.e.shortId < b.e.shortId ? -1 : 1));
    __r = { ok: got === A[0], msg: "roadmap: expected " + A[0] + ", got " + got };
  } else if (CHECK !== "html") {
    __r = { ok: false, msg: "unknown check: " + CHECK };
  }
`);
if (check === "html") {
  const got = nodes.epics ? nodes.epics.innerHTML : "";
  global.__r = { ok: got.includes(args[0]),
                 msg: "rendered epics markup does not contain: " + args[0] };
}
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
