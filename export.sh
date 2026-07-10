#!/bin/bash
#
# export.sh — bundle the fp-report tool into a self-contained, shareable zip.
# Unzip anywhere; run fp-report/_fp-report.sh from inside an fp project. The bundle
# carries its own defaults (config, status registry, logos, both themes), so it runs
# out of the box and is customised by copying defaults/ into a project's scripts/.
#
#   ./export.sh              # writes dist/fp-report.zip
#   ./export.sh -o PATH.zip  # write to a custom path

set -euo pipefail

DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="fp-report"
OUT="$DIR/dist/$NAME.zip"
while [ $# -gt 0 ]; do
    case "$1" in
        -o|--out) shift; OUT="$1" ;;
        -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done

command -v zip >/dev/null 2>&1 || { echo "Error: 'zip' not found on PATH" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/$NAME"
mkdir -p "$STAGE/defaults"

# The portable tool — engine, template, README + all defaults. (export.sh itself is
# left out: a recipient runs the tool, they don't re-export.)
cp "$DIR/_fp-report.sh" "$DIR/fp-report.template.html" "$DIR/README.md" "$STAGE/"
cp "$DIR"/defaults/* "$STAGE/defaults/"
chmod +x "$STAGE/_fp-report.sh"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
( cd "$TMP" && zip -r -q "$OUT" "$NAME" -x '*.DS_Store' )

echo "✓ Wrote $OUT ($(cd "$(dirname "$OUT")" && wc -c <"$(basename "$OUT")" | tr -d ' ') bytes)"
unzip -l "$OUT" | awk 'NR>3 && $4!="" {print "   "$4}' | grep -v '/$' || true
