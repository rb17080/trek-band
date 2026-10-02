# Scene kit

Everything needed to draw a trek-band scene and prove it is calm.

- `kit.ts`: the shared helpers: `Pix` (pixel layers, written as merged runs), `clawdBody`, `crabHD`, `armUpHD`, the timing helpers (`windows`, `shown`, `hopQ`) and `SCENE_SECONDS` (17.17).
- `scenes/*.ts`: every scene's source. The plugin's `hooks/register.tsx` holds the merged copies; that file is the source of truth.
- `preview.sh`: builds one scene the way the band shows it and writes `out/<scene>/frames.png` (frozen at every second, 2x), `band.png` (real size) and `flicker.png` (the brightness curve).
- `flashcheck.py`: freezes the scene every 0.05 s and measures brightness for the whole frame and eight regions. It fails on any flash (a swing of 0.08 or more and back within 0.5 s) and any jump (0.06 or more between frames).

```bash
bash "$(pwd)/preview.sh" "$(pwd)/scenes/darmok.ts" darmok "DARMOK"
```

Use absolute paths. The tools expect Windows with Microsoft Edge, Node 22+ and Python with Pillow.

## Rules for a scene

- One function returning the inner SVG for a `0 0 180 96` viewBox (90 x 48 art pixels, 2 px each).
- Every top-level name and SVG `id` starts with the scene's own prefix.
- SVG and SMIL only: no `<text>` (the title is added for you), no scripts, no external resources. Keep it under about 80,000 characters.
- One story on `SCENE_SECONDS`, played once per loop: 4–6 beats, each held long enough to read. Short loops only for small ambient things (flames, steam, a console light).
- **No flashing.** No white-outs, screen flashes, strobing or fast flicker. Impacts are small local glows that rise and fade over a second or so. The flash check must print `PASS`.
- The left fifth fades into the band (see Darmok's mask), and the bottom-left corner stays quiet for the title.
