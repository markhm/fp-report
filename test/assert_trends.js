#!/usr/bin/env node
/* assert_trends.js — assert on the cumulative-flow replay inside a rendered fp-report.
 *
 *   node test/assert_trends.js <html> <check> [args…]
 *     count   <YYYY-MM-DD> <status> <n>  issues in <status> at the END of that UTC day
 *     total   <YYYY-MM-DD> <n>           issues tracked at all on that day
 *     today   <status> <n>               the last day of the replay — must equal the
 *                                        live snapshot, or the chart contradicts the dashboard
 *     initial <shortId> <status>         the status the replay starts it in
 *     segs    <shortId> <n>              how many status segments it went through
 *     ends    <shortId> <open|closed>    does its timeline run to today, or stop?
 *     events  <n>                        activity-log events parsed out of `fp log`
 *     stack   <a,b,c…>                   band order, bottom → top
 *     stat    <key> <n>                  a TREND_STATS reconciliation counter
 *     base    <hidedone|showdone> <a,b…> bands in play for that "hide done" setting
 *     axis    <peak> <yMax>              gridline ceiling chosen for a given peak
 *
 * Evaluates the report's REAL injected script against the shared DOM stub, so the
 * assertions exercise the shipped replay rather than a copy of it.
 * Exits 0 on pass, 1 on mismatch.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app, nodes } = require("./dom-stub")(html_path);

global.__r = null;
eval(app + `
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  const S = seriesFor(TIMELINES);
  // index of the end of a given UTC day within the replay
  const idxOf = d => dayIdx(Date.parse(d + "T23:59:59Z"));
  const at = (d, s) => (S[s] || [])[idxOf(d)] || 0;
  const tl = sid => TIMELINES.find(t => t.sid === sid);
  const eq = (got, want, what) =>
    ({ ok: String(got) === String(want), msg: what + ": expected " + want + ", got " + got });

  if (CHECK === "count") {
    const k = idxOf(A[0]);
    if (k < 0 || k >= NDAYS) __r = { ok: false, msg: A[0] + " is outside the replay window" };
    else __r = eq(at(A[0], A[1]), A[2], A[0] + " " + A[1]);
  } else if (CHECK === "total") {
    const k = idxOf(A[0]);
    const tot = TREND_KEYS.reduce((a, s) => a + ((S[s] || [])[k] || 0), 0);
    __r = eq(tot, A[1], A[0] + " total tracked");
  } else if (CHECK === "today") {
    __r = eq((S[A[0]] || [])[NDAYS - 1] || 0, A[1], "today " + A[0]);
  } else if (CHECK === "initial") {
    const t = tl(A[0]);
    __r = t ? eq(t.segs[0].s, A[1], A[0] + " initial status")
            : { ok: false, msg: "no timeline for " + A[0] };
  } else if (CHECK === "segs") {
    const t = tl(A[0]);
    __r = t ? eq(t.segs.length, A[1], A[0] + " segments")
            : { ok: false, msg: "no timeline for " + A[0] };
  } else if (CHECK === "ends") {
    const t = tl(A[0]);
    const got = t && t.segs[t.segs.length - 1].b === Infinity ? "open" : "closed";
    __r = t ? eq(got, A[1], A[0] + " timeline end")
            : { ok: false, msg: "no timeline for " + A[0] };
  } else if (CHECK === "events") {
    __r = eq(HIST.length, A[0], "parsed log events");
  } else if (CHECK === "stack") {
    __r = eq(STACK_ORDER.join(","), A[0], "stack order");
  } else if (CHECK === "stat") {
    __r = eq(TREND_STATS[A[0]], A[1], "TREND_STATS." + A[0]);
  } else if (CHECK === "base") {
    setHideDone(A[0] === "hidedone");
    __r = eq(visibleBands().join(","), A[1], "bands with " + A[0]);
  } else if (CHECK === "legend") {
    // every status stays listed whatever is hidden — a chip that vanishes reads as
    // missing data rather than as a switched-off band
    setHideDone(A[0] === "hidedone");
    renderTrends();
    const chips = (nodes.trendLegend.innerHTML.match(/data-status="([^"]+)"/g) || [])
      .map(m => m.replace(/.*="|"$/g, ""));
    __r = eq(chips.join(","), A[1], "legend chips with " + A[0]);
  } else if (CHECK === "axis") {
    __r = eq(niceAxis(Number(A[0])), A[1], "axis ceiling for peak " + A[0]);
  } else {
    __r = { ok: false, msg: "unknown check: " + CHECK };
  }
`);
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
