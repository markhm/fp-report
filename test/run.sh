#!/bin/bash
#
# run.sh — fp-report test suite. Renders fixtures through the engine with --issues-file
# (no live fp needed) and asserts on the produced HTML. Run locally or in CI.
#
#   bash test/run.sh          # run all tests
#
# Exit status is non-zero if any test fails.

set -uo pipefail   # NOT -e: tests report their own pass/fail

ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/fp-report.sh"
FIX="$ROOT/test/fixture.issues.json"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok(){ pass=$((pass+1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
no(){ fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
# t <desc> <cmd...> — runs cmd; ok if it exits 0, else FAIL
t(){ local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else no "$d"; fi; }

# render <out> <issues> [conf] — invoke the engine offline
render(){ local out="$1" iss="$2" conf="${3:-}"
  if [ -n "$conf" ]; then "$ENGINE" -c "$conf" --issues-file "$iss" -o "$out" --no-open >/dev/null 2>&1
  else "$ENGINE" --issues-file "$iss" -o "$out" --no-open >/dev/null 2>&1; fi
}
# render_h <out> <issues> <log> <conf> — same, plus a saved 'fp log' transcript to replay
render_h(){ "$ENGINE" -c "$4" --issues-file "$2" --history-file "$3" -o "$1" --no-open >/dev/null 2>&1; }
# mkconf <file> <lines...> — write a conf; STATUS/THEME default to the repo defaults
mkconf(){ local f="$1"; shift; : >"$f"; printf '%s\n' "$@" >>"$f"
  grep -q '^STATUS_FILE=' "$f" || echo "STATUS_FILE=\"$ROOT/defaults/fp-report.status.json\"" >>"$f"
  grep -q '^THEME_FILE='  "$f" || echo "THEME_FILE=\"$ROOT/defaults/fp-report.theme.css\"" >>"$f"
  # the tiny test taxonomy, so theme assertions test the classifier not the defaults' wordlists
  grep -q '^THEMES_FILE=' "$f" || echo "THEMES_FILE=\"$ROOT/test/fixture.themes.json\"" >>"$f"
}
jsparse(){ command -v node >/dev/null 2>&1 || return 0   # skip where node absent
  python3 - "$1" > "$TMP/app.js" <<'PY'
import sys,re;sys.stdout.write(re.findall(r'<script>(.*?)</script>',open(sys.argv[1],encoding='utf-8').read(),re.S)[-1])
PY
  node --check "$TMP/app.js"; }
# bad_include — a template referencing a file that isn't there must abort with a clear
# message, not silently emit a page with the directive still in it
bad_include(){
  local d out; d="$TMP/badinc"; mkdir -p "$d/template"
  cp "$ROOT/fp-report.sh" "$d/"; cp -R "$ROOT/defaults" "$d/"
  printf '<html>\n<!--#include nope.css -->\n</html>\n' > "$d/template/fp-report.template.html"
  mkconf "$d/c.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"'
  out="$("$d/fp-report.sh" -c "$d/c.conf" --issues-file "$FIX" -o "$d/o.html" --no-open 2>&1)" && return 1
  printf '%s' "$out" | grep -q "missing include"
}
# a directive that is NOT alone on its line can't be substituted — it must abort rather
# than ship a page with a literal '<!--#include …-->' comment where content should be
inline_include(){
  local d out; d="$TMP/inlineinc"; mkdir -p "$d/template"
  cp "$ROOT/fp-report.sh" "$d/"; cp -R "$ROOT/defaults" "$d/"
  printf '<html><!--#include base.css --></html>\n' > "$d/template/fp-report.template.html"
  : > "$d/template/base.css"
  mkconf "$d/c.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"'
  out="$("$d/fp-report.sh" -c "$d/c.conf" --issues-file "$FIX" -o "$d/o.html" --no-open 2>&1)" && return 1
  printf '%s' "$out" | grep -q "unresolved include"
}
# th <html> <check> [args…] — assert on the classifier in the rendered report (skips where node absent)
th(){ command -v node >/dev/null 2>&1 || return 0; node "$ROOT/test/assert_themes.js" "$@"; }
# orph <html> <check> [args…] — assert on orphan detection in the rendered report (same skip)
orph(){ command -v node >/dev/null 2>&1 || return 0; node "$ROOT/test/assert_orphans.js" "$@"; }
# ep <html> <check> [args…] — assert on the epic roadmap's sort (same skip)
ep(){ command -v node >/dev/null 2>&1 || return 0; node "$ROOT/test/assert_epics.js" "$@"; }
# tr <html> <check> [args…] — assert on the cumulative-flow replay (same skip)
tr(){ command -v node >/dev/null 2>&1 || return 0; node "$ROOT/test/assert_trends.js" "$@"; }
# flow <html> <check> [args…] — assert on the flow derivative (same skip)
flow(){ command -v node >/dev/null 2>&1 || return 0; node "$ROOT/test/assert_flow.js" "$@"; }

echo "fp-report test suite"

# ---- baseline render (default conf) ----
BASE="$TMP/base.html"
mkconf "$TMP/base.conf" 'FP_PREFIX="FP"' 'PROJECT_NAME="proj"' 'APP_NAME="proj"'
render "$BASE" "$FIX" "$TMP/base.conf"
t "renders output"                         test -s "$BASE"
t "no unreplaced __PLACEHOLDER__"          bash -c '! grep -oE "__(FP_DATA|STATUS_CONFIG|THEMES_CONFIG|FP_HISTORY|THEME_CSS|LOGO_LIGHT|LOGO_DARK|ID_PREFIX|PROJECT_NAME|APP_NAME|REPORT_TITLE|GENERATED_AT)__" "'"$BASE"'" | grep -q .'
t "injected app JS parses"                 jsparse "$BASE"
t "exactly two </script> (no data breakout)" bash -c '[ "$(grep -c "</script>" "'"$BASE"'")" -eq 2 ]'

# ---- embedded data + status model (parsed, not grepped) ----
t "embedded fp-data has all 7 issues"      python3 "$ROOT/test/assert_model.py" "$BASE" issues 7
t "open count == 4 (todo+selected+in-progress)" python3 "$ROOT/test/assert_model.py" "$BASE" open 4
t "one blocked issue (unmet dep)"          python3 "$ROOT/test/assert_model.py" "$BASE" blocked 1

# ---- template assembly: parts on disk, one self-contained file out ----
t "output is still ONE html file"          test -f "$BASE"
t "no include directive survives"          bash -c '! grep -q "#include" "'"$BASE"'"'
t "still exactly one <script> block"       bash -c '[ "$(grep -c "^<script>$" "'"$BASE"'")" -eq 1 ]'
t "CSS from every style part is present"   bash -c 'for sel in "box-sizing:border-box" ".tiles{" ".brow{" ".bandgap{" "max-width:480px"; do grep -q "$sel" "'"$BASE"'" || exit 1; done'
t "JS from every app part is present"      bash -c 'for fn in "renderTable" "renderThemes" "runSearch" "distBars" "childRow" "orphanGroups" "renderTrends" "showPanel"; do grep -q "$fn" "'"$BASE"'" || exit 1; done'
t "a missing include fails loudly"         bad_include
t "an inline include never ships silently"  inline_include

# ---- themes: the tiles page + how each issue gets its theme ----
t "Themes is the first, default-active tab"  grep -q '<button class="tab active" data-panel="panel-themes"' "$BASE"
t "themes panel + tile grid rendered"        grep -q 'id="tiles"' "$BASE"
t "facet label from THEMES_FILE injected"    grep -q '"label": "Quality"' "$BASE"
t "theme filter added to the issues tab"     grep -q 'id="fTheme"' "$BASE"
# a focus page opens on live work: done is hidden by default, in the box and in the model
t "hide-done ships ticked"                   grep -q 'id="hideDone" checked' "$BASE"
t "…and the tile model agrees"               grep -q 'let showDone = false' "$BASE"
# resolution order: label > keyword > inherited from parent > unthemed
t "label beats everything (child002)"        th "$BASE" source child002 label
t "…and lands in the labelled theme"         th "$BASE" theme  child002 security
t "keywords classify the epic (epic0001)"    th "$BASE" source epic0001 inferred
t "…as reliability"                          th "$BASE" theme  epic0001 reliability
t "child with no signal inherits (child001)" th "$BASE" source child001 inherited
t "…the parent's theme"                      th "$BASE" theme  child001 reliability
t "no signal anywhere → unthemed (defr0001)" th "$BASE" source defr0001 none
t "…lands in the Unthemed tile"              th "$BASE" theme  defr0001 __unthemed
t "every facet's tiles partition the backlog" th "$BASE" sums
# an epic's status is a roll-up of its children, not separate work — the fixture's one
# epic (epic0001, todo+high) must not show up as open work or as crit/high pressure
t "epics excluded from tile work counts"     th "$BASE" tally open 3
t "…and counted as epics instead"            th "$BASE" tally epics 1
# child003 is critical, but sits inside an epic — its priority ranks it against its
# siblings, not the backlog, so the row must record it as scoped rather than top-level
t "critical row sees the sub-issue"          th "$BASE" prio critical total 1
t "…but counts none of it as top-level"      th "$BASE" prio critical topLevel 0
t "priority rows cover every leaf item"      th "$BASE" prio unset total 0
# taxonomy is configurable, and falls back when the project ships none
TH="$TMP/themes.html"; mkconf "$TMP/th.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' 'THEMES_FILE="does-not-exist.json"'
render "$TH" "$FIX" "$TMP/th.conf"
t "missing themes file falls back to defaults" grep -q '"label": "Work type"' "$TH"
t "fallback taxonomy still parses"             jsparse "$TH"
NL="$TMP/nolabels.html"; mkconf "$TMP/nl.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' 'FETCH_LABELS="false"'
render "$NL" "$FIX" "$TMP/nl.conf"
t "FETCH_LABELS=false still renders"           test -s "$NL"

# ---- epics: the roadmap, and the sort that drives epics to done ----
EPI="$TMP/epics.html"
render "$EPI" "$ROOT/test/fixture.epics.json" "$TMP/base.conf"
t "epic fixture renders"                     test -s "$EPI"
t "epic JS parses"                           jsparse "$EPI"
t "sort bar rendered above the roadmap"      grep -q 'id="epicSort"' "$EPI"
t "four sort keys, urgency first"            ep "$EPI" keys "urgency,created,activity,progress"
# every epic with open children, plus the childless "Epic:"-titled one
t "roadmap lists all four epics"             ep "$EPI" listed "epic0001,epic0002,epic0003,epic0004"
# the default must not move: the tab has always opened on what is most pressing
t "default order is unchanged (urgency)"     ep "$EPI" order urgency fwd "epic0002,epic0004,epic0001,epic0003"
t "created puts the oldest epic first"       ep "$EPI" order created fwd "epic0001,epic0004,epic0002,epic0003"
t "…and flipping gives newest first"         ep "$EPI" order created rev "epic0003,epic0002,epic0004,epic0001"
t "activity puts the most idle first"        ep "$EPI" order activity fwd "epic0002,epic0004,epic0003,epic0001"
t "…and flipping gives freshest first"       ep "$EPI" order activity rev "epic0001,epic0003,epic0004,epic0002"
t "progress puts the least complete first"   ep "$EPI" order progress fwd "epic0002,epic0004,epic0003,epic0001"
# the point of the roll-up: epic0001's own record was last edited in January, but a child
# moved in August — an epic whose work is live must never be reported as 7 months idle
t "last activity rolls up from the children" ep "$EPI" sameas epic0001 chla0001
# a childless epic has no children to roll up — its own updatedAt IS the signal
t "childless epic falls back to its own"     ep "$EPI" html "epic0004"
t "…and reports no sub-issues, not 0/0"      ep "$EPI" html "no sub-issues yet"
# the two sort metrics ride on the row, so an unfamiliar ordering explains itself
t "rows carry the age they sort on"          ep "$EPI" html "d old"
t "…and the idle days"                       ep "$EPI" html "idle "
t "a long-idle epic is flagged stale"        ep "$EPI" html 'class="flag stale"'
# expanded rows are keyed by epic id, not row position, so a re-sort keeps open what the
# reader opened rather than whichever epic lands in that slot afterwards
t "rows are keyed by epic id"                bash -c 'grep -q "data-eid=" "'"$EPI"'" && ! grep -q "data-eidx" "'"$EPI"'"'
t "an expanded epic survives a re-sort"      ep "$EPI" keepsopen epic0003 created
t "…under every key"                         ep "$EPI" keepsopen epic0001 activity
# the epic row carries its display id, so right-click copies it exactly as on an issue row,
# and the id itself is a copy chip for the devices that have no right-click
t "an epic row carries its display id"       ep "$EPI" html 'data-id="FP-epic0001"'
t "…and the id is a copy chip"               ep "$EPI" html '<span class="cid">FP-epic0001</span>'

# ---- orphans: open work left behind in a closed epic ----
t "Orphans tab sits after Issues"            bash -c 'grep -q "data-panel=\"panel-orphans\"" "'"$BASE"'" && [ "$(grep -n "data-panel=\"panel-issues\"" "'"$BASE"'" | head -1 | cut -d: -f1)" -lt "$(grep -n "data-panel=\"panel-orphans\"" "'"$BASE"'" | head -1 | cut -d: -f1)" ]'
t "orphans panel rendered"                   grep -q 'id="orphans"' "$BASE"
# the baseline fixture closes no epic, so it must report a clean backlog
t "clean backlog finds no orphans"           orph "$BASE" count 0
t "…and shows the empty state"               orph "$BASE" html "No orphans"
ORPH="$TMP/orphans.html"
render "$ORPH" "$ROOT/test/fixture.orphans.json" "$TMP/base.conf"
t "orphan fixture renders"                   test -s "$ORPH"
t "3 orphans across 2 closed epics"          orph "$ORPH" count 3
t "…grouped by the epic that closed"         orph "$ORPH" groups 2
t "open child of a done epic is an orphan"   orph "$ORPH" is orph0001 yes
t "deferred is not terminal → also stranded" orph "$ORPH" is orph0002 yes
t "a rejected epic strands its children too" orph "$ORPH" is orph0003 yes
t "…and files it under that epic"            orph "$ORPH" group orph0003 epic0002
t "done child of a done epic is fine"        orph "$ORPH" is kept0001 no
t "child of a live epic is fine"             orph "$ORPH" is kept0002 no
# only the DIRECT parent counts: re-homing the stranded sub-epic moves its subtree, so
# reporting its children as orphans too would just restate the same fix
t "nested under an open orphan isn't one"    orph "$ORPH" is nest0001 no
t "the stranded work is listed by id"        orph "$ORPH" html "orph0001"
t "orphan JS parses"                         jsparse "$ORPH"

# ---- trends: the status-over-time replay, rebuilt from 'fp log' ----
# Without a log there is nothing to replay, so the tab must remove itself rather than
# ship an empty chart (the baseline render passes no --history-file).
t "no history → empty event list injected"   grep -q '"events":\[\]' "$BASE"
t "…and the panel still ships (JS hides it)" grep -q 'id="panel-trends"' "$BASE"
TRD="$TMP/trends.html"
render_h "$TRD" "$FIX" "$ROOT/test/fixture.history.txt" "$TMP/base.conf"
t "history fixture renders"                  test -s "$TRD"
t "trends JS parses"                         jsparse "$TRD"
t "Trends tab sits after Orphans"            bash -c '[ "$(grep -n "data-panel=\"panel-orphans\"" "'"$TRD"'" | head -1 | cut -d: -f1)" -lt "$(grep -n "data-panel=\"panel-trends\"" "'"$TRD"'" | head -1 | cut -d: -f1)" ]'
# the parser reads 'fp log' text: 20 of the fixture's 22 events are ones we model
# (9 status + 9 created + 2 deleted); the comment and dependencies rows are ignored
# rather than guessed at, so a comment body can never be read as a transition
t "parses the fp log transcript"             tr "$TRD" events 20
# bands are stacked in the order the registry declares, which was chosen so no two
# touching bands collide under colour-vision deficiency
t "stack order comes from the registry"      tr "$TRD" stack "done,deferred,rejected,selected,in-progress,todo"
# the whole point: an issue's PAST status, not its current one back-dated. child001 is
# in-progress today but was created as todo — the log's first transition proves it.
t "initial status from the first transition" tr "$TRD" initial child001 todo
t "…and it walks through every segment"      tr "$TRD" segs child001 3
t "never-moved issue keeps its status"       tr "$TRD" initial epic0001 todo
t "backfilled day is todo, not in-progress"  tr "$TRD" count 2026-05-10 todo 4
t "…and by June it had moved to selected"    tr "$TRD" count 2026-06-11 selected 1
t "counts a status mid-replay"               tr "$TRD" count 2026-06-11 in-progress 2
t "…and the backlog behind it"               tr "$TRD" count 2026-06-11 todo 3
t "terminal states persist once reached"     tr "$TRD" count 2026-06-11 rejected 1
t "issue predating the log enters at create" tr "$TRD" count 2026-04-05 todo 2
# a deleted issue existed and was worked on — it counts for its span and then stops
t "deleted issue counts while it existed"    tr "$TRD" total 2026-06-11 8
t "…and drops out after deletion"            tr "$TRD" total 2026-06-20 7
t "…its timeline is closed, not open-ended"  tr "$TRD" ends gone0001 closed
t "a live issue's timeline runs to today"    tr "$TRD" ends child001 open
# the replay must land exactly on the live snapshot, or the chart contradicts the
# dashboard's "By status" bars sitting a few hundred pixels above it
t "today reconciles: todo"                   tr "$TRD" today todo 2
t "today reconciles: in-progress"            tr "$TRD" today in-progress 1
t "today reconciles: selected"               tr "$TRD" today selected 1
t "today reconciles: done"                   tr "$TRD" today done 1
t "today reconciles: deferred"               tr "$TRD" today deferred 1
t "today reconciles: rejected"               tr "$TRD" today rejected 1
t "no unrecorded live status to reconcile"   tr "$TRD" stat mismatched 0
t "deleted issues accounted for"             tr "$TRD" stat deleted 2
# a status the workflow has since renamed away survives: it has no role to check, and
# dropping it would silently delete real work from the default view
t "a retired status still gets a band"       tr "$TRD" count 2026-07-11 triage 1
# "hide done" ships ticked and drops terminal bands here exactly as it does on the tiles:
# with done in the stack it is the majority of the height and the live queue underneath
# collapses into unreadable hairlines
t "hide done leaves only live statuses"      tr "$TRD" base hidedone "selected,in-progress,todo,triage"
t "…and unticking restores the full stack"   tr "$TRD" base showdone "done,deferred,rejected,selected,in-progress,todo,triage"
# a hidden band must still be listed, switched off: a chip that disappears is
# indistinguishable from "this project has no done column"
ALL_CHIPS="done,deferred,rejected,selected,in-progress,todo,triage"
t "hidden statuses stay in the legend"       tr "$TRD" legend hidedone "$ALL_CHIPS"
t "…and the legend is stable either way"     tr "$TRD" legend showdone "$ALL_CHIPS"
# gridlines land on round numbers: the STEP is rounded up, not the ceiling — rounding the
# ceiling is what produces an axis labelled 375 / 750 / 1125
t "axis rounds the step, not the ceiling"    tr "$TRD" axis 1117 1200
t "…and stays tight on small backlogs"       tr "$TRD" axis 8 8
t "…never collapses to a zero-height axis"   tr "$TRD" axis 0 4
# ---- flow: the derivative — what moved, and when ----
t "Flow tab sits after Trends"           bash -c '[ "$(grep -n "data-panel=\"panel-trends\"" "'"$TRD"'" | head -1 | cut -d: -f1)" -lt "$(grep -n "data-panel=\"panel-flow\"" "'"$TRD"'" | head -1 | cut -d: -f1)" ]'
t "flow panel rendered"                  grep -q 'id="flowChart"' "$TRD"
# The reconciliation that makes the chart trustworthy: the columns must sum to the backlog
# that exists today, or the bars are just decoration.
t "flow reconciles with the backlog"     flow "$TRD" inv
t "…9 issues opened across the history"      flow "$TRD" sum opened 9
t "…1 completed (only child002 reached done)" flow "$TRD" sum completed 1
t "…2 dropped (deferred + rejected)"          flow "$TRD" sum dropped 2
t "…2 left the backlog"                       flow "$TRD" sum deleted 2
# a rejected issue must never be counted as solved — that is why the bars are split
t "rejected work counts as dropped, not done" flow "$TRD" at month 2026-04-10 dropped 2
t "…and April completed nothing"              flow "$TRD" at month 2026-04-10 completed 0
t "month buckets tally creations"             flow "$TRD" at month 2026-05-15 opened 5
t "…and completion lands in its own month"    flow "$TRD" at month 2026-06-15 completed 1
# bucket edges are UTC and ISO (weeks start Monday), not locale-dependent
t "a Saturday falls in the Monday week"       flow "$TRD" start week 2026-06-20 2026-06-15
t "…a week can span a month boundary"         flow "$TRD" start week 2026-04-01 2026-03-30
t "months start on the 1st"                   flow "$TRD" start month 2026-06-20 2026-06-01
t "days are their own bucket"                 flow "$TRD" start day 2026-06-20 2026-06-20

# ---- REPORTS_INCLUDED: choose which tabs get built ----
t "unset REPORTS_INCLUDED builds them all"   grep -q 'const REPORTS = \["themes","epics","issues","orphans","trends","flow"\]' "$BASE"
RI="$TMP/subset.html"; mkconf "$TMP/ri.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' 'REPORTS_INCLUDED="Themes, Issues"'
render_h "$RI" "$FIX" "$ROOT/test/fixture.history.txt" "$TMP/ri.conf"
t "a subset renders"                         test -s "$RI"
t "…case and commas are tolerated"           grep -q 'const REPORTS = \["themes","issues"\]' "$RI"
t "…and the JS still parses"                 jsparse "$RI"
# the real saving: no history-backed tab means the engine never pays for 'fp log'
# …even though --history-file supplied one: no history-backed tab means no reason to parse it
t "excluding Trends+Flow skips fp log"   grep -q '"events":\[\]' "$RI"
t "…so neither history tab is listed"        bash -c '! grep -q "\"trends\"" "'"$RI"'" && ! grep -q "\"flow\"" "'"$RI"'"'
# asking only for a history tab must still collect history
RH="$TMP/onlytrends.html"; mkconf "$TMP/rh.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' 'REPORTS_INCLUDED="Trends"'
render_h "$RH" "$FIX" "$ROOT/test/fixture.history.txt" "$TMP/rh.conf"
t "Trends alone still replays the log"       tr "$RH" events 20
t "…and Themes is excluded from that page"   grep -q 'const REPORTS = \["trends"\]' "$RH"

# --no-history must win over a conf that asks for it
NH="$TMP/nohist.html"; mkconf "$TMP/nh.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"'
"$ENGINE" -c "$TMP/nh.conf" --issues-file "$FIX" --history-file "$ROOT/test/fixture.history.txt" \
  --no-history -o "$NH" --no-open >/dev/null 2>&1
t "--no-history still renders"               test -s "$NH"
t "…and collects no history at all"          grep -q '"events":\[\]' "$NH"

# ---- prefix ----
t "default prefix renders IDP=FP"          grep -q 'const IDP = "FP"' "$BASE"
P="$TMP/prefix.html"; mkconf "$TMP/p.conf" 'FP_PREFIX="ZZ"' 'APP_NAME="x"'; render "$P" "$FIX" "$TMP/p.conf"
t "custom prefix renders IDP=ZZ"           grep -q 'const IDP = "ZZ"' "$P"

# ---- title + app-name ----
A="$TMP/app.html"; mkconf "$TMP/a.conf" 'FP_PREFIX="FP"' 'PROJECT_NAME="Repo"' 'APP_NAME="My App"' 'REPORT_TITLE="Delivery plan"'
render "$A" "$FIX" "$TMP/a.conf"
t "title = REPORT_TITLE — APP_NAME"        grep -q '<title>Delivery plan — My App</title>' "$A"
t "header kicker shows APP_NAME"           grep -q '<div class="appname">My App</div>' "$A"

# ---- theme injection / override / fallback ----
t "default theme token injected"           grep -q -- '--surface:#1F1F4A' "$BASE"     # navy dark surface
G="$TMP/graphite.html"; mkconf "$TMP/g.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' "THEME_FILE=\"$ROOT/defaults/fp-report.theme.graphite.css\""
render "$G" "$FIX" "$TMP/g.conf"
t "theme override applies graphite"        grep -q -- '--blue:#2a78d6' "$G"
t "theme override drops default token"     bash -c '! grep -q -- "--surface:#1F1F4A" "'"$G"'"'
F="$TMP/fallback.html"; mkconf "$TMP/f.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' 'THEME_FILE="does-not-exist.css"'
render "$F" "$FIX" "$TMP/f.conf"
t "missing theme falls back to default"    grep -q -- '--surface:#1F1F4A' "$F"

# ---- status registry drives STATUS_CONFIG ----
cat > "$TMP/status.json" <<'JSON'
{"statuses":[{"key":"todo","label":"Icebox","color":"neutral","role":"open"},
{"key":"in-progress","label":"In Progress","color":"blue","role":"open"},
{"key":"done","label":"Done","color":"green","role":"done"}]}
JSON
S="$TMP/status.html"; mkconf "$TMP/s.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"' "STATUS_FILE=\"$TMP/status.json\""
render "$S" "$FIX" "$TMP/s.conf"
t "custom status label injected (Icebox)"  grep -q 'Icebox' "$S"

# ---- injection safety: a hostile title must not break out ----
cat > "$TMP/evil.json" <<'JSON'
{"issues":[{"id":"x1","shortId":"evil0001","title":"pwn </script><img src=x onerror=alert(1)> & <b>","description":"< > & \"","status":"todo","priority":"high","parent":null,"dependencies":[],"createdAt":"2026-06-01T10:00:00Z","updatedAt":"2026-07-01T10:00:00Z"}]}
JSON
E="$TMP/evil.html"; mkconf "$TMP/e.conf" 'FP_PREFIX="FP"' 'APP_NAME="x"'; render "$E" "$TMP/evil.json" "$TMP/e.conf"
t "hostile title: still exactly two </script>" bash -c '[ "$(grep -c "</script>" "'"$E"'")" -eq 2 ]'
t "hostile title: raw < escaped to \\u003c"    grep -q 'u003c/script' "$E"
t "hostile title: JS still parses"              jsparse "$E"

# ---- --init scaffolding ----
IDIR="$TMP/proj"; mkdir -p "$IDIR/.fp"; printf 'prefix = "DEMO"\n' > "$IDIR/.fp/config.toml"
( cd "$IDIR" && "$ENGINE" --init --theme graphite >/dev/null 2>&1 )
t "--init creates scripts/fp-report.conf"  test -f "$IDIR/scripts/fp-report.conf"
t "--init detects prefix from .fp"         grep -q 'FP_PREFIX="DEMO"' "$IDIR/scripts/fp-report.conf"
t "--init copies chosen theme"             test -f "$IDIR/scripts/fp-report-graphite.css"
t "--init copies the theme taxonomy"       test -f "$IDIR/scripts/fp-report.themes.json"
t "--init conf points at the taxonomy"     grep -q 'THEMES_FILE="fp-report.themes.json"' "$IDIR/scripts/fp-report.conf"
t "--init makes the symlink"               test -L "$IDIR/scripts/fp-report"
( cd "$IDIR" && "$ENGINE" --init >/dev/null 2>&1 )
t "--init is idempotent (conf unchanged)"  grep -q 'FP_PREFIX="DEMO"' "$IDIR/scripts/fp-report.conf"

# ---- unit tests: source the engine (main is guarded) and call the pure helpers ----
u(){ if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (got '$2' want '$3')"; fi; }
# shellcheck source=/dev/null
. "$ENGINE"
u "resolve_under: absolute path passes through" "$(resolve_under /a/b /base)"  "/a/b"
u "resolve_under: relative joins the base"      "$(resolve_under rel/x /base)" "/base/rel/x"
mkdir -p "$TMP/pj/scripts" "$TMP/pj/sub"; : > "$TMP/pj/scripts/fp-report.conf"
u "find_conf: walks up to scripts/fp-report.conf" "$(cd "$TMP/pj/sub" && find_conf || true)" "$TMP/pj/scripts/fp-report.conf"
if ( cd "$TMP" && find_conf >/dev/null 2>&1 ); then no "find_conf: no match returns non-zero"; else ok "find_conf: no match returns non-zero"; fi

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
