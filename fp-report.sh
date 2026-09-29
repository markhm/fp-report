#!/bin/bash
#
# fp-report.sh — generate a self-contained HTML roadmap/prioritisation report
# from live fp state. Read-only (never mutates fp). One shared engine, many projects.
#
#   fp-report                  # generate for the project you're in + open it
#   fp-report --init [--theme graphite]  # scaffold scripts/ in the current project
#   fp-report --no-open        # generate only, don't open (for scripted/CI reuse)
#   fp-report -c PATH/conf     # use an explicit project config
#   fp-report -o PATH.html     # write to a custom output path
#   fp-report --issues-file J  # render JSON J instead of calling fp (offline/CI)
#   fp-report --no-labels      # skip the per-issue label fetch (faster, no themes from labels)
#   fp-report --refresh-labels # ignore the label cache and re-fetch every issue
#   fp-report --no-history     # skip the 'fp log' replay (drops Trends + Flow)
#   fp-report --history-file L # replay this saved 'fp log' output (offline/CI)
#
# The engine + HTML template live once (this folder). Each project supplies its own
# fp-report.conf + fp-report.status.json + logos. The config is located, in order:
#   1. -c/--config PATH   2. $FP_REPORT_CONF
#   3. next to the invoking symlink (e.g. <project>/scripts/fp-report -> its fp-report.conf)
#   4. ./scripts/fp-report.conf or ./fp-report.conf, walking up from $PWD
#   5. this tool's defaults/fp-report.conf
# Everything a conf references (status file, logos, output dir) is resolved relative
# to the conf's own directory, so the report lands in the right project.

# Strict mode only when executed — so the test suite can `source` this file to
# unit-test the pure helpers without inheriting errexit or running main.
[ "${BASH_SOURCE[0]}" = "${0}" ] && set -euo pipefail

# ---- locate this tool's own dir (file scope: must see the invoking symlink chain) ----
# INVOKE_DIRS collects the dir of every symlink hop, so a project-local symlink
# (<project>/scripts/fp-report) lets us find that project's conf from any cwd.
SOURCE="${BASH_SOURCE[0]}"
INVOKE_DIRS=()
while [ -h "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
    INVOKE_DIRS+=("$DIR")
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SELF="$SOURCE"
TOOL_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
TEMPLATE="$TOOL_DIR/template/fp-report.template.html"   # a directory of parts, assembled at render time
DEFAULTS_DIR="$TOOL_DIR/defaults"

# ---- pure helpers (safe to source and unit-test) ----

# absolute if already absolute, else joined onto $2
resolve_under() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$2" "$1" ;; esac; }

# a conf next to an invoking symlink — lets <project>/scripts/fp-report work from any cwd
find_beside_symlink() {
    local d
    for d in ${INVOKE_DIRS[@]+"${INVOKE_DIRS[@]}"}; do
        [ -f "$d/fp-report.conf" ]         && { printf '%s' "$d/fp-report.conf"; return 0; }
        [ -f "$d/scripts/fp-report.conf" ] && { printf '%s' "$d/scripts/fp-report.conf"; return 0; }
    done
    return 1
}
# a conf found by walking up from the current dir
find_conf() {
    local dir="$PWD"
    while [ "$dir" != "/" ]; do
        [ -f "$dir/scripts/fp-report.conf" ] && { printf '%s' "$dir/scripts/fp-report.conf"; return 0; }
        [ -f "$dir/fp-report.conf" ]         && { printf '%s' "$dir/fp-report.conf"; return 0; }
        dir="$(dirname "$dir")"
    done
    return 1
}

# ---- 'fp-report --init' : scaffold scripts/ in the current project (reads $THEME_ARG) ----
cmd_init() {
    local scripts_dir="$PWD/scripts" conf prefix pname theme_src theme_name
    conf="$scripts_dir/fp-report.conf"
    if [ -e "$conf" ]; then echo "Already initialised: $conf (leaving it untouched)" >&2; return 0; fi
    mkdir -p "$scripts_dir"
    # prefix: from .fp/config.toml, else from fp's displayed IDs, else FP.
    # (|| true guards keep pipefail/set -e from aborting when a grep finds nothing.)
    prefix=""
    if [ -f "$PWD/.fp/config.toml" ]; then
        prefix="$(grep -E '^[[:space:]]*prefix' "$PWD/.fp/config.toml" 2>/dev/null | head -1 | sed -E 's/.*=[[:space:]]*"?([A-Za-z0-9_]+)"?.*/\1/' || true)"
    fi
    if [ -z "$prefix" ] && command -v fp >/dev/null 2>&1; then
        prefix="$(fp issue list 2>/dev/null | grep -oE '[A-Z][A-Z0-9]+-[a-z0-9]{6,}' | head -1 | sed -E 's/-.*//' || true)"
    fi
    [ -n "$prefix" ] || prefix="FP"
    pname="$(basename "$PWD")"
    # theme: --theme <name> picks defaults/fp-report.theme.<name>.css; default is fp-report.theme.css
    if [ -n "$THEME_ARG" ] && [ -f "$DEFAULTS_DIR/fp-report.theme.$THEME_ARG.css" ]; then
        theme_src="$DEFAULTS_DIR/fp-report.theme.$THEME_ARG.css"; theme_name="fp-report-$THEME_ARG.css"
    else
        theme_src="$DEFAULTS_DIR/fp-report.theme.css"; theme_name="fp-report.theme.css"
    fi
    cp "$DEFAULTS_DIR/fp-report.status.json" "$scripts_dir/fp-report.status.json"
    cp "$DEFAULTS_DIR/fp-report.themes.json" "$scripts_dir/fp-report.themes.json"
    cp "$theme_src" "$scripts_dir/$theme_name"
    cat > "$conf" <<EOF
# fp-report.conf — generated by 'fp-report --init'. Sourced as bash; relative paths
# resolve against this file's dir. See the fp-report README for all options.
FP_PREFIX="$prefix"
PROJECT_NAME="$pname"
APP_NAME="$pname"
REPORT_TITLE="Roadmap & prioritisation"
STATUS_FILE="fp-report.status.json"
THEMES_FILE="fp-report.themes.json"
THEME_FILE="$theme_name"
OUTPUT_FILE="fp-report.html"
EOF
    # convenience symlink → the PATH entry if present, else this engine
    local on_path; on_path="$(command -v fp-report || true)"
    if [ -n "$on_path" ] && [ "$on_path" != "$scripts_dir/fp-report" ]; then ln -sf "$on_path" "$scripts_dir/fp-report"
    else ln -sf "$SELF" "$scripts_dir/fp-report"; fi
    echo "✓ Initialised fp-report in $scripts_dir  (prefix $prefix, theme $theme_name)"
    echo "  review scripts/fp-report.conf, then run:  fp-report"
    return 0
}

# ---- render pipeline ----
main() {
    # ---- args ----
    DO_OPEN=true; CONF_ARG=""; OUT_OVERRIDE=""; ISSUES_FILE=""; INIT=false; THEME_ARG=""
    LABELS_ARG=""; REFRESH_LABELS=false; HISTORY_ARG=""; HISTORY_FILE=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --no-open)     DO_OPEN=false ;;
            --open)        DO_OPEN=true ;;          # default; kept for back-compat
            --init)        INIT=true ;;
            --theme)       shift; THEME_ARG="$1" ;;
            --no-labels)   LABELS_ARG=false ;;      # skip the per-issue property fetch
            --labels)      LABELS_ARG=true ;;
            --refresh-labels) REFRESH_LABELS=true ;;   # ignore the cache, re-fetch everything
            --no-history)  HISTORY_ARG=false ;;     # skip the 'fp log' replay
            --history)     HISTORY_ARG=true ;;
            --history-file) shift; HISTORY_FILE="$1" ;; # replay saved 'fp log' text (offline/CI)
            -c|--config)   shift; CONF_ARG="$1" ;;
            -o|--out)      shift; OUT_OVERRIDE="$1" ;;
            --issues-file) shift; ISSUES_FILE="$1" ;;   # render this JSON instead of calling fp (offline/CI)
            -h|--help)     sed -n '2,24p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;;
            *) echo "Unknown arg: $1" >&2; exit 2 ;;
        esac
        shift
    done

    if [ "$INIT" = true ]; then cmd_init; exit 0; fi

    # ---- locate the project config ----
    if   [ -n "$CONF_ARG" ];              then CONF="$CONF_ARG"
    elif [ -n "${FP_REPORT_CONF:-}" ];    then CONF="$FP_REPORT_CONF"
    elif CONF="$(find_beside_symlink)";   then :
    elif CONF="$(find_conf)";             then :
    else CONF="$DEFAULTS_DIR/fp-report.conf"; fi
    [ -f "$CONF" ] || { echo "Error: config not found: $CONF" >&2; exit 1; }
    CONF_DIR="$(cd -P "$(dirname "$CONF")" && pwd)"

    # ---- settings (defaults; the conf overrides) ----
    FP_PREFIX="FP"
    PROJECT_NAME="project"
    APP_NAME=""                                    # application name in the browser <title>; empty → PROJECT_NAME
    REPORT_TITLE="Roadmap & prioritisation"
    STATUS_FILE="fp-report.status.json"
    THEMES_FILE="fp-report.themes.json"            # theme taxonomy for the Themes tiles page
    THEME_FILE="fp-report.theme.css"
    LOGO_LIGHT="fp-report.logo-light.svg"
    LOGO_DARK="fp-report.logo-dark.svg"
    OUTPUT_FILE="fp-report.html"
    OUTPUT_DIR=""                                  # empty → CONF_DIR/../reports
    ASSETS_DIR=""                                  # empty → OUTPUT_DIR (logos live with the report)
    FETCH_LABELS=true                              # enrich the backlog with each issue's labels
    LABEL_CACHE=""                                 # empty → OUTPUT_DIR/.fp-report.labels.json
    LABEL_JOBS=12                                  # parallel 'fp issue show' calls
    FETCH_HISTORY=true                             # replay 'fp log' for the Trends tab
    HISTORY_LIMIT=200000                           # 'fp log --limit' — big enough to mean "everything"
    # Which tabs to build. Empty = all of them. Space- or comma-separated, case-insensitive.
    REPORTS_INCLUDED=""
    # Signal thresholds for the Focus/Signals tabs and the KPI strip.
    CRITICAL_BUDGET=5                              # more open critical issues than this = "critical" has lost its meaning
    URGENT_IDLE_DAYS=30                            # a critical/high issue untouched this long is flagged
    CLAIM_IDLE_DAYS=7                              # an in-progress claim untouched this long is flagged stale
    # Children whose title matches this (case-insensitive) are reviews OF their parent, not
    # scope: they do not make the parent an epic, and a finished review does not finish it.
    REVIEW_TITLE_RE='^code review\b'
    # shellcheck source=/dev/null
    . "$CONF"
    [ -n "$APP_NAME" ] || APP_NAME="$PROJECT_NAME"   # default the app name to the project name

    # ---- resolve paths against the conf's directory (so output lands in that project) ----
    [ -n "$OUTPUT_DIR" ] || OUTPUT_DIR="$CONF_DIR/../reports"
    OUTPUT_DIR="$(resolve_under "$OUTPUT_DIR" "$CONF_DIR")"
    [ -n "$ASSETS_DIR" ] || ASSETS_DIR="$OUTPUT_DIR"
    ASSETS_DIR="$(resolve_under "$ASSETS_DIR" "$CONF_DIR")"

    STATUS_PATH="$(resolve_under "$STATUS_FILE" "$CONF_DIR")"
    [ -f "$STATUS_PATH" ] || STATUS_PATH="$DEFAULTS_DIR/fp-report.status.json"   # fall back to defaults
    THEMES_PATH="$(resolve_under "$THEMES_FILE" "$CONF_DIR")"
    [ -f "$THEMES_PATH" ] || THEMES_PATH="$DEFAULTS_DIR/fp-report.themes.json"   # fall back to defaults
    THEME_PATH="$(resolve_under "$THEME_FILE" "$CONF_DIR")"
    [ -f "$THEME_PATH" ] || THEME_PATH="$DEFAULTS_DIR/fp-report.theme.css"       # fall back to defaults
    LOGO_LIGHT_PATH="$(resolve_under "$LOGO_LIGHT" "$ASSETS_DIR")"
    [ -f "$LOGO_LIGHT_PATH" ] || LOGO_LIGHT_PATH="$DEFAULTS_DIR/fp-report.logo-light.svg"
    LOGO_DARK_PATH="$(resolve_under "$LOGO_DARK" "$ASSETS_DIR")"
    [ -f "$LOGO_DARK_PATH" ] || LOGO_DARK_PATH="$DEFAULTS_DIR/fp-report.logo-dark.svg"

    OUT="${OUT_OVERRIDE:-$OUTPUT_DIR/$OUTPUT_FILE}"

    [ -n "$ISSUES_FILE" ] || command -v fp >/dev/null 2>&1 || { echo "Error: fp CLI not found on PATH" >&2; exit 1; }
    [ -f "$TEMPLATE" ]    || { echo "Error: template missing: $TEMPLATE" >&2; exit 1; }
    [ -f "$STATUS_PATH" ] || { echo "Error: status registry missing: $STATUS_PATH" >&2; exit 1; }
    [ -f "$THEMES_PATH" ] || { echo "Error: theme taxonomy missing: $THEMES_PATH" >&2; exit 1; }
    [ -f "$THEME_PATH" ]  || { echo "Error: theme missing: $THEME_PATH" >&2; exit 1; }

    mkdir -p "$(dirname "$OUT")"

    # Pull the full backlog as JSON. Run fp from the conf's dir so it walks up to the
    # project's .fp/ (each project's config anchors us in the right repo).
    TMP_JSON="$(mktemp)"; TMP_LOG="$(mktemp)"; TMP_HIST="$(mktemp)"
    trap 'rm -f "$TMP_JSON" "$TMP_LOG" "$TMP_HIST"' EXIT
    if [ -n "$ISSUES_FILE" ]; then
        cp "$ISSUES_FILE" "$TMP_JSON"                                   # offline/CI: skip fp
    else
        ( cd "$CONF_DIR" && fp issue list --limit 5000 --format json ) > "$TMP_JSON"
    fi

    # ---- enrich with per-issue properties (labels) ----
    # 'fp issue list' omits `properties` entirely; only 'fp issue show' returns it. So the
    # labels the Themes page prefers over inference need one call per issue (~0.2s each).
    # We cache them keyed on the issue's updatedAt, so only issues that actually changed
    # since the last report are re-fetched: first run costs ~1s/15 issues, later runs ~0.
    [ -z "$LABELS_ARG" ] || FETCH_LABELS="$LABELS_ARG"
    [ -n "$LABEL_CACHE" ] || LABEL_CACHE="$OUTPUT_DIR/.fp-report.labels.json"
    LABEL_CACHE="$(resolve_under "$LABEL_CACHE" "$CONF_DIR")"
    if [ -z "$ISSUES_FILE" ] && [ "$FETCH_LABELS" = true ]; then
        JSON="$TMP_JSON" CACHE="$LABEL_CACHE" JOBS="$LABEL_JOBS" CWD="$CONF_DIR" \
        REFRESH="$REFRESH_LABELS" python3 - <<'PY'
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

path, cache_path = os.environ["JSON"], os.environ["CACHE"]
jobs, cwd = int(os.environ["JOBS"] or 12), os.environ["CWD"]
doc = json.load(open(path, encoding="utf-8"))
issues = doc.get("issues", doc) if isinstance(doc, dict) else doc

cache = {}
if os.environ.get("REFRESH") != "true":
    try:
        cache = json.load(open(cache_path, encoding="utf-8")).get("issues", {})
    except Exception:
        cache = {}                      # missing/corrupt cache is not an error — just refetch

# stale = never seen, or edited since we cached it
stale = [i for i in issues
         if cache.get(i["id"], {}).get("updatedAt") != i.get("updatedAt")]

def fetch(i):
    try:
        r = subprocess.run(["fp", "issue", "show", i["shortId"], "--format", "json"],
                           capture_output=True, text=True, timeout=60, cwd=cwd)
        return i["id"], json.loads(r.stdout).get("properties") or {}
    except Exception:
        return i["id"], None            # leave this issue unlabelled rather than fail the report

if stale:
    print(f"  fetching labels for {len(stale)} issue(s) "
          f"({len(issues)-len(stale)} cached)…", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        for iid, props in ex.map(fetch, stale):
            if props is None: continue
            cache[iid] = {"updatedAt": next(i["updatedAt"] for i in stale if i["id"] == iid),
                          "properties": props}

live = {i["id"] for i in issues}
cache = {k: v for k, v in cache.items() if k in live}     # drop deleted issues
for i in issues:
    i["properties"] = cache.get(i["id"], {}).get("properties", {})

json.dump(doc, open(path, "w", encoding="utf-8"))
try:
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    json.dump({"issues": cache}, open(cache_path, "w", encoding="utf-8"))
except OSError as e:
    print(f"  (label cache not written: {e})", file=sys.stderr)
PY
    fi

    # ---- history: replay every status transition (the Trends tab) ----
    # The issue list is a SNAPSHOT — it can say what is in progress now, never what was in
    # progress in May. 'fp log' is the only record of the past: it carries every
    # "status: A → B", issue_created and issue_deleted since the project began, so the
    # trend line is a replay of what actually happened rather than a guess interpolated
    # from createdAt/updatedAt. We ask for -a (all events) so a future reclassification of
    # "low-signal" can't silently drop status changes; the parser ignores what it doesn't need.
    [ -z "$HISTORY_ARG" ] || FETCH_HISTORY="$HISTORY_ARG"
    # Normalise REPORTS_INCLUDED to a lowercase, space-delimited list. Unset = every tab.
    ALL_REPORTS="focus signals themes epics issues orphans trends flow"
    if [ -n "$REPORTS_INCLUDED" ]; then
        REPORTS="$(printf '%s' "$REPORTS_INCLUDED" | tr 'A-Z,' 'a-z ' | tr -s ' ')"
        for r in $REPORTS; do
            case " $ALL_REPORTS " in *" $r "*) ;; *) echo "  (unknown report in REPORTS_INCLUDED: $r)" >&2 ;; esac
        done
    else
        REPORTS="$ALL_REPORTS"
    fi
    # Only Trends and Flow need the activity log. If neither is being built, don't pay
    # for it — this is the actual saving from excluding a report, since the page weight is
    # dominated by the issue JSON every tab shares.
    case " $REPORTS " in *" trends "*|*" flow "*) ;; *) FETCH_HISTORY=false ;; esac

    printf '{"events":[],"reason":"not collected"}' > "$TMP_HIST"
    HAVE_LOG=false
    if [ "$FETCH_HISTORY" != true ]; then
        :                                                         # --no-history / FETCH_HISTORY="false" wins
    elif [ -n "$HISTORY_FILE" ]; then
        cp "$HISTORY_FILE" "$TMP_LOG" && HAVE_LOG=true            # offline/CI: saved 'fp log' text
    elif [ -n "$ISSUES_FILE" ]; then
        :                                                         # offline render: never call fp
    elif command -v fp >/dev/null 2>&1; then
        if ( cd "$CONF_DIR" && fp log -a --limit "$HISTORY_LIMIT" ) > "$TMP_LOG" 2>/dev/null; then
            HAVE_LOG=true
        else
            echo "  (fp log failed — Trends tab omitted)" >&2
        fi
    fi
    if [ "$HAVE_LOG" = true ]; then
        LOG="$TMP_LOG" OUT_HIST="$TMP_HIST" python3 - <<'PY'
import calendar, json, os, re

# 'fp log' prints an event as a header line plus one indented detail line:
#     2026-08-03 05:19:38  someone@example.com  MC-oehcfgmr
#       status: in-progress → done
# Timestamps are UTC despite carrying no zone marker (verified against updatedAt, which
# is ISO-Z). Anything that doesn't match is skipped rather than guessed at, so a comment
# body or a future event type can never be mistaken for a transition.
HEAD = re.compile(r'^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\s+\S+\s+(\S+)\s*$')
DETAIL = re.compile(r'^\s\s+([a-z_]+):\s*(.*)$')
ARROW = re.compile(r'\s*(?:→|->)\s*')

events, cur = [], None
with open(os.environ["LOG"], encoding="utf-8", errors="replace") as fh:
    for line in fh:
        line = line.rstrip("\n")
        m = HEAD.match(line)
        if m:
            y, mo, d, H, M, S, ref = m.groups()
            ts = calendar.timegm((int(y), int(mo), int(d), int(H), int(M), int(S), 0, 0, 0))
            # the log shows PREFIX-shortId; the report keys on shortId alone
            cur = (ts, ref.split("-", 1)[1] if "-" in ref else ref)
            continue
        if cur is None:
            continue
        m = DETAIL.match(line)
        if not m:
            continue
        field, rest = m.groups()
        ts, sid = cur
        if field == "status":
            parts = ARROW.split(rest.strip(), maxsplit=1)
            if len(parts) == 2 and parts[0] and parts[1]:
                events.append(["s", ts, sid, parts[0], parts[1]])
        elif field == "issue_created":
            events.append(["c", ts, sid])
        elif field == "issue_deleted":
            events.append(["d", ts, sid])

events.sort(key=lambda e: e[1])
with open(os.environ["OUT_HIST"], "w", encoding="utf-8") as fh:
    json.dump({"events": events}, fh, separators=(",", ":"))
PY
    fi

    GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Inject data + settings + logos into the template. Python for robust replacement and
    # to neutralise any '</script>' inside descriptions (escape '<' → <; still valid
    # JSON since every '<' sits inside a string).
    TEMPLATE="$TEMPLATE" OUT="$OUT" JSON="$TMP_JSON" GENERATED_AT="$GENERATED_AT" \
    FP_PREFIX="$FP_PREFIX" PROJECT_NAME="$PROJECT_NAME" APP_NAME="$APP_NAME" REPORT_TITLE="$REPORT_TITLE" \
    LOGO_LIGHT="$LOGO_LIGHT_PATH" LOGO_DARK="$LOGO_DARK_PATH" STATUS_PATH="$STATUS_PATH" \
    THEMES_PATH="$THEMES_PATH" THEME_PATH="$THEME_PATH" HIST_PATH="$TMP_HIST" \
    REPORTS="$REPORTS" CRITICAL_BUDGET="$CRITICAL_BUDGET" URGENT_IDLE_DAYS="$URGENT_IDLE_DAYS" \
    CLAIM_IDLE_DAYS="$CLAIM_IDLE_DAYS" REVIEW_TITLE_RE="$REVIEW_TITLE_RE" python3 - <<'PY'
import os, re, base64, mimetypes, json
def datauri(path):
    mime = mimetypes.guess_type(path)[0] or "image/png"
    b = open(path, "rb").read()
    return f"data:{mime};base64," + base64.b64encode(b).decode("ascii")

# The template is authored as a directory of small files (styles/*.css, app/*.js) and
# assembled here into the single self-contained page. `<!--#include path -->` inlines a
# file relative to the template's own dir. The app parts are concatenated into ONE
# <script>, deliberately: they share a top-level scope and rely on hoisting across
# sections, so separate <script> tags would change behaviour.
INCLUDE = re.compile(r'^[ \t]*<!--#include\s+(\S+)\s*-->[ \t]*$', re.M)
def assemble(path, depth=0, seen=None):
    if depth > 8:
        raise SystemExit(f"fp-report: include nesting too deep at {path}")
    seen = seen or []
    base = os.path.dirname(os.path.abspath(path))
    def sub(m):
        inc = os.path.join(base, m.group(1))
        if inc in seen:
            raise SystemExit("fp-report: circular include: " + " -> ".join(seen + [inc]))
        if not os.path.isfile(inc):
            raise SystemExit(f"fp-report: missing include {m.group(1)} (from {path})")
        body = assemble(inc, depth + 1, seen + [inc])
        return body[:-1] if body.endswith("\n") else body
    return INCLUDE.sub(sub, open(path, encoding="utf-8").read())

tpl = assemble(os.environ["TEMPLATE"])
# A directive only matches on its own line. Anything left saying "#include" is therefore
# malformed (indented oddly, inline, misspelled) and would otherwise ship as a literal
# HTML comment with its content silently missing — fail instead of publishing a hole.
leftover = [ln.strip() for ln in tpl.split("\n") if "#include" in ln]
if leftover:
    raise SystemExit("fp-report: unresolved include directive (must be alone on its line): "
                     + leftover[0])
data = open(os.environ["JSON"], encoding="utf-8").read().strip().replace("<", "\\u003c")
# Re-serialise the status registry (validates it's JSON) and inline it as a JS literal.
status = json.dumps(json.load(open(os.environ["STATUS_PATH"], encoding="utf-8"))).replace("<", "\\u003c")
# Same for the theme taxonomy (keyword regexes + colours for the Themes tiles page).
themes = json.dumps(json.load(open(os.environ["THEMES_PATH"], encoding="utf-8"))).replace("<", "\\u003c")
# Parsed 'fp log' replay (status transitions over time) for the Trends tab. Always valid
# JSON — an empty events list is the documented "no history" state, not an error.
history = json.dumps(json.load(open(os.environ["HIST_PATH"], encoding="utf-8")),
                     separators=(",", ":")).replace("<", "\\u003c")
# Which tabs the page should show (REPORTS_INCLUDED, already normalised by the shell).
reports = json.dumps(os.environ.get("REPORTS", "").split(), separators=(",", ":"))
# Signal thresholds (fp-report.conf). A non-integer is a config error, not a silent default:
# a threshold that quietly fell back would make a signal look calmer than the backlog is.
def whole(key):
    v = os.environ.get(key, "").strip()
    if not re.fullmatch(r"\d+", v):
        raise SystemExit(f"fp-report: {key} must be a whole number, got {v!r}")
    return int(v)
# An empty pattern switches the review exclusion off; an invalid one is a config error.
# The pattern RUNS in the browser (JavaScript RegExp, flag i), so it is validated in that
# dialect: by node when node is on PATH, which settles it exactly. Without node, a Python
# compile plus an escape-aware refusal of the constructs JavaScript rejects or reads
# differently ('(?i)', '(?P<n>…)': a page-killing SyntaxError; '\A' '\Z' '\z': silently
# the LETTERS A, Z, z). Either way '\A'-style anchors are refused: JavaScript accepts them,
# so node alone would pass a pattern that never matches what was meant. The page also
# catches a pattern that still fails and says so (model.js).
ODD = r"(?:^|[^\\])(?:\\\\)*"          # an unescaped position: even run of backslashes before
def review_re():
    v = os.environ.get("REVIEW_TITLE_RE", "")
    if not v:
        return v
    anchor = re.search(ODD + r"\\[AZz]", v)
    if anchor:
        raise SystemExit(f"fp-report: REVIEW_TITLE_RE uses {anchor.group(0)[-2:]!r}, a Python anchor that "
                         "JavaScript reads as a plain letter (the pattern runs in the browser): use ^ or $")
    import shutil, subprocess
    if shutil.which("node"):
        r = subprocess.run(["node", "-e", "try{new RegExp(process.argv[1],'i')}catch(e){console.error(e.message);process.exit(1)}", v],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit("fp-report: REVIEW_TITLE_RE is not a valid JavaScript regex (the pattern runs "
                             f"in the browser): {r.stderr.strip()}")
        return v
    try: re.compile(v)
    except re.error as e: raise SystemExit(f"fp-report: REVIEW_TITLE_RE is not a valid regex: {e}")
    group = re.search(ODD + r"\(\?(?![:=!]|<[=!])", v)
    if group:
        raise SystemExit("fp-report: REVIEW_TITLE_RE uses '(?' syntax that JavaScript reads differently or "
                         "not at all (the pattern runs in the browser, case-insensitive already)")
    return v
signals = json.dumps({"criticalBudget": whole("CRITICAL_BUDGET"),
                      "urgentIdleDays": whole("URGENT_IDLE_DAYS"),
                      "claimIdleDays":  whole("CLAIM_IDLE_DAYS"),
                      "reviewTitleRe":  review_re()}, separators=(",", ":"))
theme = open(os.environ["THEME_PATH"], encoding="utf-8").read().rstrip("\n")   # raw CSS custom properties
html = (tpl.replace("__FP_DATA__", data)
           .replace("__STATUS_CONFIG__", status)
           .replace("__THEMES_CONFIG__", themes)
           .replace("__FP_HISTORY__", history)
           .replace("__REPORTS_INCLUDED__", reports)
           .replace("__SIGNAL_CONFIG__", signals)
           .replace("__THEME_CSS__", theme)
           .replace("__GENERATED_AT__", os.environ["GENERATED_AT"])
           .replace("__ID_PREFIX__", os.environ["FP_PREFIX"])
           .replace("__PROJECT_NAME__", os.environ["PROJECT_NAME"])
           .replace("__APP_NAME__", os.environ["APP_NAME"])
           .replace("__REPORT_TITLE__", os.environ["REPORT_TITLE"])
           .replace("__LOGO_LIGHT__", datauri(os.environ["LOGO_LIGHT"]))
           .replace("__LOGO_DARK__", datauri(os.environ["LOGO_DARK"])))
open(os.environ["OUT"], "w", encoding="utf-8").write(html)
PY

    COUNT="$(TMP_JSON="$TMP_JSON" python3 -c 'import json,os;print(len(json.load(open(os.environ["TMP_JSON"])).get("issues",[])))')"
    echo "✓ Wrote $OUT ($(wc -c <"$OUT" | tr -d ' ') bytes, $COUNT issues) — $PROJECT_NAME [$FP_PREFIX]"

    if [ "$DO_OPEN" = true ]; then
        if command -v open >/dev/null 2>&1; then open "$OUT"; else echo "(cannot open: 'open' not available; pass --no-open to silence)"; fi
    fi
}

# Run only when executed, not when sourced (tests source us for the helpers above).
[ "${BASH_SOURCE[0]}" = "${0}" ] && main "$@"
