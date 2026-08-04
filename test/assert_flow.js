#!/usr/bin/env node
/* assert_flow.js — assert on the Flow derivative inside a rendered fp-report.
 *
 *   node test/assert_flow.js <html> <check> [args…]
 *     inv                            all three reconciliation invariants at once:
 *                                      sum(opened) - sum(left)  == issues tracked today
 *                                      sum(completed)           == issues done today
 *                                      sum(dropped)             == terminal-not-done today
 *     sum   <key> <n>                total of a series over the whole history
 *     at    <gran> <YYYY-MM-DD> <key> <n>   value in the bucket containing that date
 *     start <gran> <YYYY-MM-DD> <YYYY-MM-DD>  the bucket a date falls into begins here
 *     count <gran> <n>               how many buckets span the whole history
 *     stat  <key> <n>                a FLOW_STATS counter
 *
 * Evaluates the report's REAL injected script against the shared DOM stub.
 * Exits 0 on pass, 1 on mismatch.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app } = require("./dom-stub")(html_path);

global.__r = null;
eval(app + `
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  const eq = (got, want, what) =>
    ({ ok: String(got) === String(want), msg: what + ": expected " + want + ", got " + got });
  const whole = () => flowSeries(TIMELINES, T0, NOW);
  const sm = (V, k) => V[k].reduce((a, b) => a + b, 0);

  if (CHECK === "inv") {
    flowGran = "week";
    const V = whole();
    const live = ISSUES.length;
    const done = ISSUES.filter(i => DONE.has(i.status)).length;
    const drop = ISSUES.filter(i => !DONE.has(i.status) && TERMINAL_ROLE.has(i.status)).length;
    const bad = [];
    if (sm(V,"opened") - sm(V,"deleted") !== live)
      bad.push("opened-left " + (sm(V,"opened") - sm(V,"deleted")) + " != tracked " + live);
    if (sm(V,"completed") !== done) bad.push("completed " + sm(V,"completed") + " != done " + done);
    if (sm(V,"dropped") !== drop)   bad.push("dropped " + sm(V,"dropped") + " != terminal " + drop);
    __r = { ok: !bad.length, msg: "flow invariants broken: " + bad.join("; ") };
  } else if (CHECK === "sum") {
    flowGran = "week";
    __r = eq(sm(whole(), A[0]), A[1], "sum(" + A[0] + ")");
  } else if (CHECK === "at") {
    flowGran = A[0];
    const V = whole();
    const want = FLOW_GRAN[flowGran].start(Date.parse(A[1] + "T12:00:00Z"));
    const i = V.keys.indexOf(want);
    __r = i < 0 ? { ok: false, msg: "no " + A[0] + " bucket covering " + A[1] }
                : eq(V[A[2]][i], A[3], A[1] + " (" + A[0] + ") " + A[2]);
  } else if (CHECK === "start") {
    flowGran = A[0];
    const got = new Date(FLOW_GRAN[flowGran].start(Date.parse(A[1] + "T12:00:00Z")))
      .toISOString().slice(0, 10);
    __r = eq(got, A[2], A[1] + " falls in the " + A[0] + " starting");
  } else if (CHECK === "count") {
    flowGran = A[0];
    __r = eq(whole().keys.length, A[1], A[0] + " buckets");
  } else if (CHECK === "stat") {
    __r = eq(FLOW_STATS[A[0]], A[1], "FLOW_STATS." + A[0]);
  } else {
    __r = { ok: false, msg: "unknown check: " + CHECK };
  }
`);
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
