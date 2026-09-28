#!/usr/bin/env node
/* assert_signals.js — assert on the Focus list and the Signals tab of a rendered fp-report.
 *
 *   node test/assert_signals.js <html> <check> [args…]
 *     focus  <sid,sid,…>           the Focus list, in rank order
 *     flag   <sid> <flag> <yes|no> a derived flag (_urgentIdle, _staleClaim, _epicReady, …)
 *     count  <signalKey> <n>       issues listed in one Signals section
 *     order  <signalKey> <sid,…>   issues in one Signals section, in listed order
 *     key    <nodeId> <key> <sig> <yes|no>  pressing <key> on #nodeId opens signal <sig>
 *     over   <yes|no>              is the critical budget exceeded?
 *     html   <nodeId> <substring>  the rendered markup of #nodeId contains this
 *
 * Evaluates the report's REAL injected script against the shared DOM stub, so the
 * assertions exercise the shipped rules rather than a copy of them.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app, nodes } = require("./dom-stub")(html_path);

global.__r = null;
eval(app + `
  const find = sid => ISSUES.find(i => i.shortId === sid);
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  if (CHECK === "focus") {
    const got = focusIssues.map(i => i.shortId).join(",");
    __r = { ok: got === A[0], msg: "focus order: expected " + A[0] + ", got " + got };
  } else if (CHECK === "flag") {
    const i = find(A[0]);
    if (!i) { __r = { ok: false, msg: "no such issue: " + A[0] }; }
    else { const got = i[A[1]] ? "yes" : "no";
      __r = { ok: got === A[2], msg: A[0] + " " + A[1] + ": expected " + A[2] + ", got " + got }; }
  } else if (CHECK === "count") {
    const s = SIGNALS.find(x => x.key === A[0]);
    const got = s ? s.items.length : -1;
    __r = { ok: got === Number(A[1]), msg: "signal " + A[0] + ": expected " + A[1] + ", got " + got };
  } else if (CHECK === "order") {
    const s = SIGNALS.find(x => x.key === A[0]);
    const got = s ? s.items.map(i => i.shortId).join(",") : "(no such signal)";
    __r = { ok: got === A[1], msg: "signal " + A[0] + " order: expected " + A[1] + ", got " + got };
  } else if (CHECK === "key") {
    // press a key on #A[0] as if focus sat on a link to signal A[2]; pass = that section was
    // scrolled to (A[3]==="yes") or not (A[3]==="no"). Dispatches at the REAL handler.
    const host = document.getElementById(A[0]);
    const section = document.getElementById("sig-" + A[2]);
    let hit = false; section.scrollIntoView = () => { hit = true; };
    const link = { dataset: { sigGo: A[2] } }; link.closest = () => link;
    const h = host.__l && host.__l.keydown;
    if (!h) { __r = { ok: false, msg: "#" + A[0] + " has no keydown handler" }; }
    else { h({ key: A[1], preventDefault() {}, target: link });
      const got = hit ? "yes" : "no";
      __r = { ok: got === A[3], msg: "key " + JSON.stringify(A[1]) + " on #" + A[0] + ": expected " + A[3] + ", got " + got }; }
  } else if (CHECK === "over") {
    const got = overBudget ? "yes" : "no";
    __r = { ok: got === A[0], msg: "over budget: expected " + A[0] + ", got " + got };
  } else if (CHECK !== "html") {
    __r = { ok: false, msg: "unknown check: " + CHECK };
  }
`);
if (check === "html") {
  const got = nodes[args[0]] ? nodes[args[0]].innerHTML : "";
  global.__r = { ok: got.includes(args[1]), msg: "#" + args[0] + " does not contain: " + args[1] };
}
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
