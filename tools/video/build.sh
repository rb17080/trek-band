#!/usr/bin/env bash
# Builds the README video: composition.html -> frames/ -> media/demo.webp (+ poster)
set -euo pipefail
V="$(cygpath -m "$(cd "$(dirname "$0")" && pwd)")"
R="$V/../.."
{
  echo "type Limit = { kind: string; percentUsed: number; resetsAt?: string }"
  sed -n '/^\/\/ Lilac palette/,/^export const register/p' "$R/plugins/trek-band/hooks/register.tsx" | sed '$d'
  cat "$V/composition.ts"
} > "$V/composition.build.ts"
node --experimental-strip-types --no-warnings "$V/composition.build.ts" "$V/composition.html"
node "$V/render.mjs" "$V/composition.html" "$V/frames" "${FPS:-24}" "${ONLY:-}"
python "$V/encode.py" "$V/frames" "$R/media" "${FPS:-24}"
