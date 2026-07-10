#!/bin/bash
#
# install.sh — put fp-report on your PATH. Idempotent; safe to re-run.
#
#   ./install.sh            # symlinks ~/bin/fp-report -> ./_fp-report.sh
#   ./install.sh DIR        # install into DIR instead of ~/bin

set -euo pipefail

DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINDIR="${1:-$HOME/bin}"

mkdir -p "$BINDIR"
ln -sf "$DIR/_fp-report.sh" "$BINDIR/fp-report"
echo "✓ linked $BINDIR/fp-report -> $DIR/_fp-report.sh"

command -v fp       >/dev/null 2>&1 || echo "  note: 'fp' CLI not found on PATH — fp-report needs it to read issues."
command -v python3  >/dev/null 2>&1 || echo "  note: 'python3' not found — required."
case ":$PATH:" in
    *":$BINDIR:"*) : ;;
    *) echo "  note: $BINDIR is not on your PATH — add it, e.g.  export PATH=\"$BINDIR:\$PATH\"" ;;
esac

echo "Next: cd into an fp project and run  'fp-report --init'  (or  '--init --theme graphite')."
