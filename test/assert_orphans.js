#!/usr/bin/env node
/* assert_orphans.js — assert on the orphan detection inside a rendered fp-report.
 *
 *   node test/assert_orphans.js <html> <check> [args…]
 *     count  <n>                   orphaned issues found
 *     groups <n>                   distinct closed epics holding them
 *     is     <shortId> <yes|no>    is this specific issue an orphan?
 *     group  <shortId> <parentSid> the closed epic an orphan is filed under
 *     html   <substring>           the rendered #orphans markup contains this
 *
 * Evaluates the report's REAL injected script against the shared DOM stub, so the
 * assertions exercise the shipped rule rather than a copy of it.
 * Exits 0 on pass, 1 on mismatch.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app, nodes } = require("./dom-stub")(html_path);

global.__r = null;
eval(app + `
  const find = sid => ISSUES.find(i => i.shortId === sid);
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  if (CHECK === "count") {
    __r = { ok: orphanIssues.length === Number(A[0]),
            msg: "orphans: expected " + A[0] + ", got " + orphanIssues.length };
  } else if (CHECK === "groups") {
    __r = { ok: orphanGroups.length === Number(A[0]),
            msg: "orphan groups: expected " + A[0] + ", got " + orphanGroups.length };
  } else if (CHECK === "is") {
    const i = find(A[0]);
    if (!i) { __r = { ok: false, msg: "no such issue: " + A[0] }; }
    else {
      const got = i._orphan ? "yes" : "no";
      __r = { ok: got === A[1], msg: A[0] + " orphan: expected " + A[1] + ", got " + got };
    }
  } else if (CHECK === "group") {
    const i = find(A[0]);
    const g = orphanGroups.find(x => x.items.includes(i));
    const got = g ? g.p.shortId : "(none)";
    __r = { ok: got === A[1], msg: A[0] + " filed under: expected " + A[1] + ", got " + got };
  } else if (CHECK !== "html") {
    __r = { ok: false, msg: "unknown check: " + CHECK };
  }
`);
if (check === "html") {
  const got = nodes.orphans ? nodes.orphans.innerHTML : "";
  global.__r = { ok: got.includes(args[0]),
                 msg: "rendered orphans markup does not contain: " + args[0] };
}
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
