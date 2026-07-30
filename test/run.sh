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

echo "fp-report test suite"

# ---- baseline render (default conf) ----
BASE="$TMP/base.html"
mkconf "$TMP/base.conf" 'FP_PREFIX="FP"' 'PROJECT_NAME="proj"' 'APP_NAME="proj"'
render "$BASE" "$FIX" "$TMP/base.conf"
t "renders output"                         test -s "$BASE"
t "no unreplaced __PLACEHOLDER__"          bash -c '! grep -oE "__(FP_DATA|STATUS_CONFIG|THEMES_CONFIG|THEME_CSS|LOGO_LIGHT|LOGO_DARK|ID_PREFIX|PROJECT_NAME|APP_NAME|REPORT_TITLE|GENERATED_AT)__" "'"$BASE"'" | grep -q .'
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
t "CSS from every style part is present"   bash -c 'for sel in "box-sizing:border-box" ".tiles{" ".brow{" "max-width:480px"; do grep -q "$sel" "'"$BASE"'" || exit 1; done'
t "JS from every app part is present"      bash -c 'for fn in "renderTable" "renderThemes" "runSearch" "distBars" "childRow" "showPanel"; do grep -q "$fn" "'"$BASE"'" || exit 1; done'
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
