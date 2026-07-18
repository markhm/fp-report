#!/bin/bash
#
# fp-report-deploy.sh — generate the fp-report and publish it to a static site repo.
# Regenerates the report into a publishing repo's served directory, then commits and
# pushes so CloudFlare Pages (or any git-triggered host) redeploys. No build step —
# the report is a single self-contained HTML file.
#
#   fp-report-deploy               # generate + commit + push, using the located conf
#   fp-report-deploy -c PATH/conf  # use an explicit project config
#   fp-report-deploy -m "message"  # custom commit message
#   fp-report-deploy --dry-run     # generate only; show git status, don't commit/push
#
# Deployment target comes from the same fp-report.conf the report engine uses:
#   DEPLOY_REPO    local checkout of the publishing repo (absolute, or rel. to the conf)
#   DEPLOY_SUBDIR  served directory inside it (default: src) — the report lands here
#   DEPLOY_BRANCH  branch to push (default: master)
#   DEPLOY_REMOTE  origin to add/create on first run; blank → skip remote setup
# On first run the repo is bootstrapped: git init (on DEPLOY_BRANCH), origin added, and
# — if the GitHub repo is missing and `gh` is available — created before pushing.

set -euo pipefail

SELF_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$SELF_DIR/fp-report.sh"
[ -f "$ENGINE" ] || { echo "Error: engine not found: $ENGINE" >&2; exit 1; }

# Source the engine (source-guarded — this does NOT run it) to reuse its conf-location
# helpers: find_beside_symlink, find_conf, resolve_under. Its final `... && main` line
# returns 1 when sourced (not executed), so `|| true` keeps that from tripping set -e.
# shellcheck source=/dev/null
. "$ENGINE" || true

# ---- args ----
CONF_ARG=""; MSG=""; DRY_RUN=false
while [ $# -gt 0 ]; do
    case "$1" in
        -c|--config)  shift; CONF_ARG="$1" ;;
        -m|--message) shift; MSG="$1" ;;
        -n|--dry-run) DRY_RUN=true ;;
        -h|--help)    sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done

# ---- locate the project config (same precedence as the engine) ----
if   [ -n "$CONF_ARG" ];               then CONF="$CONF_ARG"
elif [ -n "${FP_REPORT_CONF:-}" ];     then CONF="$FP_REPORT_CONF"
elif CONF="$(find_beside_symlink)";    then :
elif CONF="$(find_conf)";              then :
else echo "Error: no fp-report.conf found (pass -c PATH or set \$FP_REPORT_CONF)" >&2; exit 1; fi
[ -f "$CONF" ] || { echo "Error: config not found: $CONF" >&2; exit 1; }
CONF_DIR="$(cd -P "$(dirname "$CONF")" && pwd)"

# ---- deploy settings (defaults; the conf overrides) ----
OUTPUT_FILE="fp-report.html"
DEPLOY_REPO=""
DEPLOY_SUBDIR="src"
DEPLOY_BRANCH="master"
DEPLOY_REMOTE=""
# shellcheck source=/dev/null
. "$CONF"

[ -n "$DEPLOY_REPO" ] || { echo "Error: DEPLOY_REPO not set in $CONF" >&2; exit 1; }
DEPLOY_REPO="$(resolve_under "$DEPLOY_REPO" "$CONF_DIR")"
DEST_DIR="$DEPLOY_REPO/$DEPLOY_SUBDIR"
DEST="$DEST_DIR/$OUTPUT_FILE"

# ---- 1. generate the report straight into the served directory ----
mkdir -p "$DEST_DIR"
echo "→ Generating report into $DEST"
"$ENGINE" -c "$CONF" -o "$DEST" --no-open

# ---- 2. bootstrap the publishing repo on first run ----
if [ ! -e "$DEPLOY_REPO/.git" ]; then
    echo "→ Initialising git repo in $DEPLOY_REPO (branch $DEPLOY_BRANCH)"
    git -C "$DEPLOY_REPO" init -b "$DEPLOY_BRANCH" >/dev/null
fi
if [ -n "$DEPLOY_REMOTE" ] && ! git -C "$DEPLOY_REPO" remote get-url origin >/dev/null 2>&1; then
    echo "→ Adding origin $DEPLOY_REMOTE"
    git -C "$DEPLOY_REPO" remote add origin "$DEPLOY_REMOTE"
fi

# ---- 3. commit ----
git -C "$DEPLOY_REPO" add -A
if git -C "$DEPLOY_REPO" diff --cached --quiet; then
    echo "✓ No changes to publish — report is already up to date."
    exit 0
fi

if [ "$DRY_RUN" = true ]; then
    echo "— dry run — staged changes:"
    git -C "$DEPLOY_REPO" status --short
    exit 0
fi

[ -n "$MSG" ] || MSG="Update fp-report ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
git -C "$DEPLOY_REPO" commit -q -m "$MSG"
echo "✓ Committed: $MSG"

# ---- 4. push (creating the GitHub repo on first run if it's missing) ----
if [ -n "$DEPLOY_REMOTE" ]; then
    if ! git -C "$DEPLOY_REPO" ls-remote origin >/dev/null 2>&1; then
        slug="$(printf '%s' "$DEPLOY_REMOTE" | sed -E 's#^git@github\.com:##; s#^https://github\.com/##; s#\.git$##')"
        if command -v gh >/dev/null 2>&1; then
            echo "→ Remote missing; creating GitHub repo $slug (private)"
            # Create the empty remote only — origin is already wired up above, so we
            # push it ourselves below (avoids gh's --remote clashing with our origin).
            gh repo create "$slug" --private
        else
            echo "Error: remote $DEPLOY_REMOTE is unreachable and 'gh' is not available to create it." >&2
            exit 1
        fi
    fi
    git -C "$DEPLOY_REPO" push -u origin "$DEPLOY_BRANCH"
    echo "✓ Pushed to origin/$DEPLOY_BRANCH"
else
    echo "  (DEPLOY_REMOTE blank — committed locally, not pushed.)"
fi
