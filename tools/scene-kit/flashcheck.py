"""Measure a scene for flashes and harsh flicker, frame by frame.

Usage: python flashcheck.py <out/<fn> folder>   (expects scene.svg there, from preview.sh)

Freezes the SVG at every 0.05 s of its SCENE_SECONDS loop, screenshots all frames in one
page with headless Edge, and measures the mean luminance of the whole scene and of eight
regions (4 x 2). It reports:
  - FAIL  flash: a region's luminance swings by >= 0.08 (on a 0..1 scale) and back within
          0.5 s, or any 1 s window has more than 2 such swings (strobe / flicker);
  - FAIL  jump: the whole scene's luminance changes by >= 0.06 between two frames 0.05 s
          apart (a white-out, a screen flash, a hard cut);
  - the brightest and darkest moments, so you can see how much the scene breathes.
It also writes flicker.png, a strip of the luminance curve, next to the frames.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

out = sys.argv[1].rstrip('/\\')
svg = open(os.path.join(out, 'scene.svg'), encoding='utf-8').read()
SECONDS = 17.17
STEP = 0.05
frames = [round(i * STEP, 3) for i in range(int(SECONDS / STEP) + 1)]
COLS = 8
W, H = 180, 96
GAP = 4

cells = []
for n, t in enumerate(frames):
    s = svg.replace('id="', f'id="f{n}_').replace('url(#', f'url(#f{n}_').replace('href="#', f'href="#f{n}_')
    x = (n % COLS) * (W + GAP)
    y = (n // COLS) * (H + GAP)
    cells.append(f'<div class="f" data-t="{t}" style="position:absolute;left:{x}px;top:{y}px;width:{W}px;height:{H}px;background:#2a1f3d;overflow:hidden;line-height:0">{s}</div>')
rows = (len(frames) + COLS - 1) // COLS
page_w, page_h = COLS * (W + GAP), rows * (H + GAP)
html = (f'<html><body style="margin:0;background:#000;width:{page_w}px;height:{page_h}px;position:relative">' + ''.join(cells) +
        "<script>document.querySelectorAll('.f').forEach(f=>{const s=f.querySelector('svg');s.pauseAnimations();s.setCurrentTime(+f.dataset.t)})</script></body></html>")
page = os.path.join(out, 'flash.html')
open(page, 'w', encoding='utf-8').write(html)
shot = os.path.join(out, 'flash-frames.png')
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
subprocess.run([edge, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                f'--window-size={page_w},{page_h}', f'--screenshot={shot}', 'file:///' + page.replace('\\', '/')],
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
img = Image.open(shot).convert('RGB')


def lum(region):
    px = list(region.getdata())
    total = 0.0
    for r, g, b in px:
        def lin(c):
            c /= 255
            return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        total += 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return total / len(px)


whole, regions = [], []
for n in range(len(frames)):
    x = (n % COLS) * (W + GAP)
    y = (n // COLS) * (H + GAP)
    cell = img.crop((x, y, x + W, y + H)).resize((W // 2, H // 2))
    whole.append(lum(cell))
    rs = []
    for ry in range(2):
        for rx in range(4):
            rs.append(lum(cell.crop((rx * 22, ry * 24, rx * 22 + 22, ry * 24 + 24))))
    regions.append(rs)

fails = []
for i in range(1, len(frames)):
    d = whole[i] - whole[i - 1]
    if abs(d) >= 0.06:
        fails.append(f'jump at {frames[i]:.2f}s: whole-scene luminance {whole[i-1]:.3f} -> {whole[i]:.3f}')

window = int(0.5 / STEP)
swings_at = []
for r in range(8):
    series = [rs[r] for rs in regions]
    for i in range(len(series)):
        seg = series[i:i + window + 1]
        if len(seg) < 3:
            continue
        lo, hi = min(seg), max(seg)
        if hi - lo >= 0.08 and abs(seg[0] - seg[-1]) < 0.04 and min(seg[0], seg[-1]) < 0.8:
            swings_at.append((frames[i], r))
seen = set()
for t, r in swings_at:
    key = (round(t), r)
    if key in seen:
        continue
    seen.add(key)
    fails.append(f'flash in region {r} ({"top" if r < 4 else "bottom"} row, column {r % 4 + 1}) around {t:.2f}s: brightens/darkens by >= 0.08 and back within 0.5 s')

print(f'frames: {len(frames)} | luminance min {min(whole):.3f} at {frames[whole.index(min(whole))]:.2f}s, max {max(whole):.3f} at {frames[whole.index(max(whole))]:.2f}s')
if fails:
    print(f'FAIL ({len(fails)}):')
    for f in fails[:40]:
        print('  - ' + f)
else:
    print('PASS: no flashes, no jumps')

# the curve, for a quick look
g = Image.new('RGB', (len(frames) * 2, 120), (28, 28, 28))
d = ImageDraw.Draw(g)
for i in range(1, len(frames)):
    d.line([((i - 1) * 2, 118 - whole[i - 1] * 400), (i * 2, 118 - whole[i] * 400)], fill=(201, 167, 255))
g.save(os.path.join(out, 'flicker.png'))
json.dump({'t': frames, 'whole': whole}, open(os.path.join(out, 'luminance.json'), 'w'))
