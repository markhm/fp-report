#!/usr/bin/env node
/* assert_themes.js — assert on the theme classifier inside a rendered fp-report.
 *
 *   node test/assert_themes.js <html> <check> [args…]
 *     source  <shortId> <expected>   theme provenance: label|inferred|inherited|none
 *     theme   <shortId> <expected>   resolved theme key ("__unthemed" when none)
 *     sums                           every facet's tiles must sum to the whole backlog
 *
 * It evaluates the report's REAL injected script against a minimal DOM stub, so the
 * assertions exercise the shipped classifier rather than a copy of its rules.
 * Exits 0 on pass, 1 on mismatch.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app } = require("./dom-stub")(html_path);

// The app script is strict-mode, so its consts stay inside eval's scope — append the
// assertion there too, and report back through a global.
global.__r = null;
eval(app + `
  const q = FACETS.find(f => f.key === "quality") || FACETS[0];
  const find = sid => ISSUES.find(i => i.shortId === sid);
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  if (CHECK === "source" || CHECK === "theme") {
    const i = find(A[0]);
    if (!i) { __r = { ok: false, msg: "no such issue: " + A[0] }; }
    else {
      const r = q._index.get(i.id);
      const got = CHECK === "source" ? r.src : r.key;
      __r = { ok: got === A[1], msg: A[0] + " " + CHECK + ": expected " + A[1] + ", got " + got };
    }
  } else if (CHECK === "tally") {
    // tally <field> <expected> — sum a tile field across the quality facet's tiles
    const got = themeStats(q).reduce((a, s) => a + s[A[0]], 0);
    __r = { ok: got === Number(A[1]), msg: "tile " + A[0] + " sum: expected " + A[1] + ", got " + got };
  } else if (CHECK === "prio") {
    // prio <priority> <field> <expected> — sum a priority row's field across all tiles
    const got = themeStats(q).reduce((a, s) =>
      a + s.prio.find(r => r.p === A[0])[A[1]], 0);
    __r = { ok: got === Number(A[2]),
            msg: "prio " + A[0] + "." + A[1] + ": expected " + A[2] + ", got " + got };
  } else if (CHECK === "sums") {
    // Tiles count LEAF work items (an epic's status is a roll-up of its children, not
    // separate work), and report epics as their own figure. Both must partition exactly.
    const leaves = ISSUES.filter(i => !kids.has(i.id));
    const epics = ISSUES.filter(i => kids.has(i.id));
    const bad = [];
    for (const f of FACETS) {
      const st = themeStats(f);
      const sum = k => st.reduce((a, s) => a + s[k], 0);
      if (sum("total") !== leaves.length) bad.push(f.key + " total " + sum("total") + " != " + leaves.length);
      if (sum("open") !== leaves.filter(i => i._open).length) bad.push(f.key + " open " + sum("open") + " mismatch");
      if (sum("epics") !== epics.length) bad.push(f.key + " epics " + sum("epics") + " != " + epics.length);
      // the priority rows must themselves partition the leaf work, with no issue
      // counted twice and none dropped by an unrecognised priority value
      const prioTotal = st.reduce((a, s) => a + s.prio.reduce((x, r) => x + r.total, 0), 0);
      if (prioTotal !== leaves.length) bad.push(f.key + " priority rows " + prioTotal + " != " + leaves.length);
    }
    __r = { ok: !bad.length, msg: bad.join("; ") || "all facets partition the backlog" };
  } else {
    __r = { ok: false, msg: "unknown check: " + CHECK };
  }
`);
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
