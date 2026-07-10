#!/bin/bash
#
# smoke.sh — render the fixture through the engine (no live fp needed) and assert the
# output is well-formed. Run locally or in CI.

set -euo pipefail

ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/out.html"

fail(){ echo "SMOKE FAIL: $1" >&2; exit 1; }

"$ROOT/_fp-report.sh" --issues-file "$ROOT/test/fixture.issues.json" -o "$OUT" --no-open

[ -s "$OUT" ] || fail "no output written"

# every injection placeholder must be gone
if grep -oE '__(FP_DATA|STATUS_CONFIG|THEME_CSS|LOGO_LIGHT|LOGO_DARK|ID_PREFIX|PROJECT_NAME|APP_NAME|REPORT_TITLE|GENERATED_AT)__' "$OUT" | head -1 | grep -q .; then
    fail "unreplaced placeholder in output"
fi

# fixture data made it in, and the theme + status registry were injected
grep -q "Smoke fixture epic" "$OUT"      || fail "fixture issue missing from output"
grep -q "const STATUS_CONFIG = {"  "$OUT" || fail "status registry not injected"
grep -q ":root{"                   "$OUT" || fail "theme CSS not injected"

# the app JS must parse
if command -v node >/dev/null 2>&1; then
    python3 - "$OUT" > "$TMP/app.js" <<'PY'
import sys, re
sys.stdout.write(re.findall(r'<script>(.*?)</script>', open(sys.argv[1], encoding='utf-8').read(), re.S)[-1])
PY
    node --check "$TMP/app.js" || fail "injected JS does not parse"
fi

echo "SMOKE PASS ($(wc -c <"$OUT" | tr -d ' ') bytes)"
