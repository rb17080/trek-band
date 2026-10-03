#!/usr/bin/env bash
# Usage: bash <kit>/preview.sh <scene-file.ts> <functionName> "<TITLE IN CAPS>"
# Always call it with absolute paths.
# Builds the scene exactly as the band shows it (with the scene-change veil and title),
# writes frozen frames of the whole 17.17 s story, and runs the flash check.
set -euo pipefail
K="$(cygpath -m "$(dirname "$0")")"
SCENE="$(cygpath -m "$1")"
FN="$2"
TITLE="${3:-$FN}"
OUT="$K/out/$FN"
mkdir -p "$OUT"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

{
  echo "type Limit = { kind: string; percentUsed: number; resetsAt?: string }"
  cat "$K/kit.ts"
  echo
  cat "$SCENE"
  cat <<EOF

const __body = playAt(${FN}())
const __W = GW * Q
const __H = GH * Q
const __ease = 0.8 / SCENE_SECONDS
const __veil = \`<rect width="\${__W}" height="\${__H}" fill="\${C.bg}"><animate attributeName="opacity" values="1;0;0;1" keyTimes="0;\${__ease.toFixed(4)};\${(1 - __ease).toFixed(4)};1" dur="\${SCENE_SECONDS}s" repeatCount="indefinite"/></rect>\`
const __title = \`<text x="5" y="\${__H - 4}" font-family="system-ui,Segoe UI,sans-serif" font-size="6.5" font-weight="700" letter-spacing="1" fill="\${C.dim}" stroke="#16101f" stroke-width="2" stroke-linejoin="round" paint-order="stroke">${TITLE}</text>\`
const __svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${__W}" height="\${__H}" viewBox="0 0 \${__W} \${__H}" shape-rendering="crispEdges">\${__body}\${__title}</svg>\`
const fs = require('fs')
const problems: string[] = []
if (__svg.length > 90000) problems.push('SVG is ' + __svg.length + ' chars; keep it under 80000')
if (/<text/.test(__body)) problems.push('the scene must not contain <text>; the title is added outside')
if (/<script|on[a-z]+=/i.test(__body)) problems.push('no scripts or event handlers')
const durs = [...__body.matchAll(/dur="([0-9.]+)s"/g)].map(m => +m[1])
const story = durs.filter(d => d >= 4)
const offBeat = [...new Set(story.filter(d => Math.abs(d - SCENE_SECONDS) > 0.001))]
if (offBeat.length) console.log('NOTE: animations of 4s or more not on SCENE_SECONDS: ' + offBeat.map(d => +d.toFixed(2)).join(', ') + ' (fine for ambient blinks, smoke and twinkles; the story itself must run on SCENE_SECONDS)')
console.log('svg chars:', __svg.length, '| story anims at 17.17s:', story.length)
if (problems.length) console.log('PROBLEMS:\n- ' + problems.join('\n- '))
fs.writeFileSync(process.argv[2] + '/scene.svg', __svg)
let n = 0
const copy = () => { n++; return __svg.replace(/id="/g, 'id="c' + n + '_').replace(/url\(#/g, 'url(#c' + n + '_').replace(/href="#/g, 'href="#c' + n + '_') }
const cell = (t: number, z: number) => \`<div style="display:inline-block;margin:3px;vertical-align:top"><div style="color:#a995c9;font:11px system-ui">\${t}s</div><div class="f" data-t="\${t}" style="width:\${__W * z}px;height:\${__H * z}px;background:\${C.bg};overflow:hidden;line-height:0"><div style="transform:scale(\${z});transform-origin:0 0">\${copy()}</div></div></div>\`
const freeze = "<script>document.querySelectorAll('.f').forEach(f=>{const s=f.querySelector('svg');s.pauseAnimations();s.setCurrentTime(+f.dataset.t)})</script>"
const times = Array.from({ length: 18 }, (_, i) => +(i * PLAY_SECONDS / 17).toFixed(2))
fs.writeFileSync(process.argv[2] + '/frames.html', '<html><body style="margin:4px;background:#1c1c1c;width:1130px">' + times.map(t => cell(t, 2)).join('') + freeze + '</body></html>')
fs.writeFileSync(process.argv[2] + '/band.html', \`<html><body style="margin:0;background:#1c1c1c;font-family:system-ui;font-size:14px"><div style="margin:12px;width:545px;display:flex;align-items:center;justify-content:space-between;background:\${C.bg};border-radius:12px;overflow:hidden;padding-left:16px;box-sizing:border-box"><span style="color:\${C.text}"><b>4%</b> <span style="color:\${C.dim}">4:39:12</span> &nbsp; <b>49%</b> <span style="color:\${C.dim}">1d 18:03:12</span></span><div class="f" data-t="5" style="line-height:0">\${copy()}</div></div>\${freeze}</body></html>\`)
EOF
} > "$OUT/build.ts"

node --experimental-strip-types --no-warnings "$OUT/build.ts" "$OUT"
WOUT="$(cygpath -w "$OUT")"
rm -f "$OUT"/zoom-*.png
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=600,130 --screenshot="$WOUT\\band.png" "file:///$OUT/band.html" >/dev/null 2>&1
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=1140,1270 --screenshot="$WOUT\\frames.png" "file:///$OUT/frames.html" >/dev/null 2>&1
FLASH_SECONDS=10 python -W ignore "$K/flashcheck.py" "$OUT"
echo "frames (0..17 s, frozen, 2x): $OUT/frames.png"
echo "band at 1x (t=8 s):           $OUT/band.png"
echo "luminance curve:              $OUT/flicker.png"
