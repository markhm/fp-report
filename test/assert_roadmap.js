#!/usr/bin/env node
/* assert_roadmap.js — assert on the Roadmap tab inside a rendered fp-report.
 *
 *   node test/assert_roadmap.js <html> <check> [args…]
 *     order    <sid,sid,…>           the roadmap's order, left to right
 *     lanes    <key,key,…>           the lanes, top to bottom
 *     lane     <sid> <key>           the lane an epic sits in
 *     edge     <from> <to> <cls>     a lifted dependency arrow and its class (plain|against|cyc)
 *     edges    <n>                   how many epic-to-epic dependencies were lifted
 *     blocks   <n>                   how many blocks the board draws
 *     progress <sid> <done/total>    the progress a block shows
 *     cyclic   <sid,sid,…>           the epics reported on a dependency cycle
 *     ahead    <sid,sid,…>           not-started epics placed before the Now line
 *     select   <sid> <substring>     click a block; the detail pane contains this
 *     plan     <case>                the rank generator on a fixed case (see CASES below)
 *     replay   <sid,sid,…> [dragged]  drop the board into this order, apply the generated ranks,
 *                                    re-run the order model: it must come back the same
 *     refuse   <sid> <index>         moving this epic to that slot breaks a dependency
 *     reorder  yes|no                the reorder view is built into this page
 *     controls yes|no                the reorder controls were wired up (built in AND a rank to write)
 *     now      <k>                   the Now line sits after the first k columns
 *     key      <sid> <key>           press a key on a block: Enter/Space selects it
 *     move     <sid> <±n> <sid,…|refused>  the keyboard move (Alt+←/→ = ±1) and the order after it
 *     clean    <sid,sid,…>           the commands for this dragged order carry no character of any title
 *     unsafe   <key>                 the command writer refuses this key
 *     html     <node> <substring>    the rendered markup of a node contains this
 *
 * Evaluates the report's REAL injected script against the shared DOM stub, so the
 * assertions exercise the shipped model rather than a copy of it.
 * Exits 0 on pass, 1 on mismatch.
 */
const [html_path, check, ...args] = process.argv.slice(2);
const { app, nodes } = require("./dom-stub")(html_path);

global.__r = null;
eval(app + `
  const CHECK = ${JSON.stringify(check)}, A = ${JSON.stringify(args)};
  const idOf = sid => (ISSUES.find(i => i.shortId === sid) || {}).id;
  const sids = ids => ids.map(id => byId.get(id).shortId).join(",");
  const res = (ok, msg) => { __r = { ok, msg }; };
  // fixed generator cases: [items in target order, tailFrom, dragged, expected "key=rank,…"]
  const CASES = {
    // a gap is free: only the dragged epic is rewritten
    gap:      [[["A",10],["C",30],["B",20]], 3, "C", "C=15"],
    front:    [[["C",30],["A",10],["B",20]], 3, "C", "C=5"],
    end:      [[["B",20],["C",30],["A",10]], 3, "A", "A=40"],
    // no gap between consecutive ranks: the fewest neighbours are renumbered
    nogap:    [[["B",2],["A",1],["C",3],["D",4]], 4, "A", "B=1,A=2"],
    // nothing ranked yet: everything ahead of the tail gets a first rank, spaced by 10
    seed:     [[["A",null],["B",null],["C",null]], 3, "B", "A=10,B=20,C=30"],
    // the unranked tail may stay unranked
    tail:     [[["A",10],["B",null],["C",null]], 1, "C", ""],
  };
  if (CHECK === "order") {
    const got = sids(rmShown()); res(got === A[0], "order: expected " + A[0] + ", got " + got);
  } else if (CHECK === "lanes") {
    const got = rmLanes().lanes.map(t => t.key).join(",");
    res(got === A[0], "lanes: expected " + A[0] + ", got " + got);
  } else if (CHECK === "lane") {
    const got = rmLanes().laneOf(byId.get(idOf(A[0])));
    res(got === A[1], A[0] + " lane: expected " + A[1] + ", got " + got);
  } else if (CHECK === "edge") {
    const x = rmEdges.find(e => e.a === idOf(A[0]) && e.b === idOf(A[1]));
    const cls = !x ? "none" : rmInCycle(x) ? "cyc" : rmAgainst(x) ? "against" : "plain";
    const drawn = x && document.getElementById("roadmap").innerHTML.includes('data-dep="' + x.a + ">" + x.b + '"');
    res(cls === A[2] && (cls === "none" || drawn), A[0] + " → " + A[1] + ": expected " + A[2] + ", got " + cls + (drawn ? "" : " (not drawn)"));
  } else if (CHECK === "blocks") {
    const got = (document.getElementById("roadmap").innerHTML.match(/class="rm-block[ "]/g) || []).length;
    res(got === Number(A[0]), "blocks: expected " + A[0] + ", got " + got);
  } else if (CHECK === "progress") {
    const m = document.getElementById("roadmap").innerHTML.match(
      new RegExp('data-id="' + IDP + A[0] + '"[^]*?class="rm-pn"[^>]*>([^<]+)<'));
    res(!!m && m[1] === A[1], A[0] + " progress: expected " + A[1] + ", got " + (m && m[1]));
  } else if (CHECK === "edges") {
    res(rmEdges.length === Number(A[0]), "edges: expected " + A[0] + ", got " + rmEdges.length);
  } else if (CHECK === "cyclic") {
    const got = rmEpics.filter(e => RM.cyclic.has(e.id)).map(e => e.shortId).sort().join(",");
    res(got === A[0], "cyclic: expected " + A[0] + ", got " + got);
  } else if (CHECK === "ahead") {
    const got = [...document.getElementById("roadmap").innerHTML.matchAll(/class="rm-block[^"]* ahead[^"]*"\\s+data-rid="([^"]+)"/g)]
      .map(m => byId.get(m[1]).shortId).join(",");
    res(got === A[0], "ahead of the Now line: expected " + A[0] + ", got " + got);
  } else if (CHECK === "select") {
    rmSel = idOf(A[0]); renderRoadmap();
    const got = document.getElementById("rmDetail").innerHTML;
    res(got.includes(A[1]), "detail pane for " + A[0] + " does not contain: " + A[1]);
  } else if (CHECK === "plan") {
    const [items, tail, dragged, want] = CASES[A[0]];
    const plan = rankPlan(items.map(([key, rank]) => ({ key, rank })), tail, new Set([dragged]));
    const got = plan.map(p => p.key + "=" + p.rank).join(",");
    // and whatever it changed, the ranked prefix must now be strictly increasing
    const after = items.slice(0, tail).map(([k, r]) => (plan.find(p => p.key === k) || { rank: r }).rank);
    const inc = after.every((r, k) => r != null && (k === 0 || r > after[k-1]));
    res(got === want && inc, "plan " + A[0] + ": expected " + want + ", got " + got + (inc ? "" : " (not increasing)"));
  } else if (CHECK === "replay") {
    // the acceptance criterion, headless: the commands for a dragged order, once applied,
    // must reproduce that order when the report is regenerated
    const target = A[0].split(",").map(idOf);
    rmView = target;
    const plan = rmPlanFor(target, A[1] ? A[1].split(",").map(idOf) : []);
    const text = rankCommands(plan, GENERATED_AT);
    const lines = text.split("\\n");
    const shape = lines.slice(1).every(l => /^fp issue update [A-Za-z0-9_]+-[A-Za-z0-9]+ --property rank=\\d+$/.test(l))
      && lines[0].startsWith("# ");
    const ranks = new Map(plan.map(p => [p.key, p.rank]));
    const nodes2 = rmNodes.map(n => ({ ...n, rank: ranks.has(IDP + n.sid) ? ranks.get(IDP + n.sid) : n.rank }));
    const again = rmOrder(nodes2, rmEdges.map(x => [x.a, x.b])).order;
    res(sids(again) === A[0] && shape, "replay: dragged " + A[0] + ", regenerated " + sids(again)
        + (shape ? "" : " — commands not IDs-and-integers only:\\n" + text));
  } else if (CHECK === "refuse") {
    const cur = RM.order.slice(), id = idOf(A[0]);
    cur.splice(cur.indexOf(id), 1); cur.splice(Number(A[1]), 0, id);
    res(!!rmBlocks(cur), "moving " + A[0] + " to slot " + A[1] + " should break a dependency");
  } else if (CHECK === "reorder") {
    const got = typeof rmDecorate === "function" && typeof rankPlan === "function";
    res(got === (A[0] === "yes"), "reorder built in: expected " + A[0] + ", got " + got);
  } else if (CHECK === "controls") {
    res((rmWired === true) === (A[0] === "yes"), "reorder controls wired: expected " + A[0] + ", got " + (rmWired === true));
  } else if (CHECK === "now") {
    const m = document.getElementById("roadmap").innerHTML.match(/class="rm-now" style="left:([\\d.-]+)px/);
    const want = RM_GEO.label + Number(A[0]) * rmPitch - RM_GEO.gap / 2;
    res(!!m && Number(m[1]) === want, "Now line: expected left " + want + "px (after " + A[0] + " columns), got " + (m && m[1]));
  } else if (CHECK === "key") {
    const h = document.getElementById("roadmap").__l.keydown, id = idOf(A[0]);
    rmSel = null;
    h({ key: A[1], preventDefault() {}, target: { closest: () => ({ dataset: { rid: id } }) } });
    res(rmSel === id, "pressing " + JSON.stringify(A[1]) + " on " + A[0] + " should select it; selected: " + rmSel);
  } else if (CHECK === "move") {
    const id = idOf(A[0]), ok = rmMove(id, rmShown().indexOf(id) + Number(A[1]));
    const got = ok ? sids(rmShown()) : "refused";
    res(got === A[2], "move " + A[0] + " by " + A[1] + ": expected " + A[2] + ", got " + got);
  } else if (CHECK === "clean") {
    const target = A[0].split(",").map(idOf);
    const text = rankCommands(rmPlanFor(target, target), GENERATED_AT);
    const named = target.map(id => byId.get(id).title).filter(t => t && text.includes(t));
    // every command line is exactly an fp update of an id to an integer: no room for anything else
    const lines = text.split("\\n").slice(1);
    const odd = lines.filter(l => !/^fp issue update [A-Za-z0-9_]+-[A-Za-z0-9]+ --property rank=\\d+$/.test(l));
    const shell = ["\\x60", "$", ";", "(", "|"].filter(ch => lines.join("").includes(ch));
    res(!named.length && !odd.length && !shell.length && lines.length > 0,
        "commands leak tracker text: " + (named.join(" | ") || odd[0] || shell.join("") || "(no commands written)") + "\\n" + text);
  } else if (CHECK === "unsafe") {
    let threw = false;
    try { rankCommands([{ key: A[0], rank: 10 }], GENERATED_AT); } catch (e) { threw = true; }
    res(threw, "a command was written for " + A[0]);
  } else if (CHECK !== "html") {
    res(false, "unknown check: " + CHECK);
  }
`);
if (check === "html") {
  const got = nodes[args[0]] ? nodes[args[0]].innerHTML : "";
  global.__r = { ok: got.includes(args[1]), msg: "rendered " + args[0] + " markup does not contain: " + args[1] };
}
if (!global.__r.ok) console.log(global.__r.msg);
process.exit(global.__r.ok ? 0 : 1);
