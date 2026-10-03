// ---------- Threshold: "warp ten, and then salamanders" ----------
// One 17.17 s story. The shuttle Cochrane cruises through calm space with Clawd-Paris
// at the controls. He opens her up: the stars stretch slowly into long streaks and the
// shuttle smears into soft echoes of itself (warp ten: everywhere at once), all motion,
// no light. A slow cross-dissolve lands us on a murky swamp world, the shuttle parked
// in the reeds. Clawd-Paris and Clawd-Janeway stand on a mossy bank by the water and
// slowly turn, one in-between drawing at a time, into two spotted orange salamanders
// with red collars. Three babies wriggle up out of the water; a little heart rises.
// Then the swamp dissolves back into the same calm space the story opened on.

const thT = SCENE_SECONDS
const thK = (t: number) => +(t / thT).toFixed(4)
const thPer = (n: number) => +(thT / n).toFixed(5)
const TH_EASE = '0.45 0 0.55 1'

// Pix written as one <path> per colour
function thPath(p: Pix) {
  const m = (p as any).m as Map<number, Map<number, string>>
  const by = new Map<string, string>()
  for (const [y, row] of m) {
    const xs = [...row.keys()].sort((a, b) => a - b)
    let i = 0
    while (i < xs.length) {
      const c = row.get(xs[i])!
      let j = i
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && row.get(xs[j + 1]) === c) j++
      const w = (xs[j] - xs[i] + 1) * Q
      by.set(c, (by.get(c) || '') + `M${xs[i] * Q} ${y * Q}h${w}v${Q}h-${w}z`)
      i = j + 1
    }
  }
  let out = ''
  for (const [c, d] of by) out += `<path fill="${c}" d="${d}"/>`
  return out
}

// a value track on the story timeline, eased between keys; held flat where values repeat
function thTrack(attr: string, keys: [number, number | string][]) {
  const all = [...keys]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < thT) all.push([thT, all[all.length - 1][1]])
  const sp = all.slice(1).map(([, v], i) => (v === all[i][1] ? '0 0 1 1' : TH_EASE))
  return `<animate attributeName="${attr}" calcMode="spline" dur="${thT}s" repeatCount="indefinite" values="${all.map(k => k[1]).join(';')}" keyTimes="${all.map(k => thK(k[0])).join(';')}" keySplines="${sp.join(';')}"/>`
}

// an eased translate on the story timeline, keys in grid units
function thMove(keys: [number, number, number][], ease = TH_EASE) {
  const all = [...keys]
  if (all[0][0] > 0) all.unshift([0, all[0][1], all[0][2]])
  if (all[all.length - 1][0] < thT) all.push([thT, all[all.length - 1][1], all[all.length - 1][2]])
  const v = all.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`)
  const sp = all.slice(1).map((_, i) => (v[i] === v[i + 1] ? '0 0 1 1' : ease))
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${thT}s" repeatCount="indefinite" values="${v.join(';')}" keyTimes="${all.map(k => thK(k[0])).join(';')}" keySplines="${sp.join(';')}"/>`
}

// a gentle ambient sway: a -> b -> a over one loop period (a whole fraction of the story)
function thSway(dx: number, dy: number, n: number, begin = 0) {
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" values="0 0;${dx * Q} ${dy * Q};0 0" keyTimes="0;0.5;1" keySplines="${TH_EASE};${TH_EASE}" dur="${thPer(n)}s" begin="${begin}s" repeatCount="indefinite"/>`
}

const thOp = (keys: [number, number][]) => thTrack('opacity', keys)

// ---- the Cochrane: a class-2 shuttle in side view, nose to the right, Paris at the window ----
const TH_SHUTTLE = [
  '..........hHHHHHHHHHHHH.......',
  '........hHHHHHHHHHHHHHHHH.....',
  '.......hHHHHHHHHHHHHHwwwwwH...',
  '.....bhhhhhhhhhhhhhhwoLLLowHH.',
  '....bbhhhhhhhhhhhhhhwoEoEowhhH',
  '...ibhhpppppppppppppppppphhhhh',
  '...ibshhhhhhhhhhhhhhhhhhhhhhhs',
  '...ibsssssssssssssssssssssssd.',
  '..DDsnnnnNNNNNNNNnnnnnrdddd...',
  '...DDDDDDDDDDDDDDDDDDDDD......',
]
const TH_SHUTTLE_PAL: Record<string, string> = {
  H: '#e6e2ee', h: '#b8b2c8', s: '#7c7692', d: '#4e4862', D: '#3a3450', b: '#5a5470',
  w: '#24304e', o: '#d97757', L: '#eb9575', E: '#1a1020', p: '#b3262e',
  n: '#3f9fd8', N: '#9fe0ff', r: '#ff6a4a', i: '#ff9a5a',
}

// ---- the crabs ----
const TH_PARIS: CrabHD = {
  skin: '#d97757', light: '#eb9575', shade: '#b85f43',
  upper: '#b3262e', lower: '#1c1424', lowerShade: '#120c18',
  legs: '#1c1424', rim: '#f0a07a',
}
const TH_JANE: CrabHD = { ...TH_PARIS }

// Salamander palette (shares Clawd's orange)
const TH_SAL = {
  L: '#eb9575', o: '#d97757', d: '#b85f43', D: '#8f4a34', sp: '#5a2a20', y: '#f2c46a',
  r: '#b3262e', rl: '#d0454a', k: '#1c1424', E: '#1a1020', toe: '#c86848', gold: '#e8c547',
}

// One step of the turn from crab to salamander. m = 1, 2 or 3 (3 = salamander).
// Drawn facing right in local columns (0 = tail tip), mirrored for a left-facing one.
function thSal(m: number, look: Side, cx: number, G: number, who: 'paris' | 'jane') {
  const P = TH_SAL
  const Bl = [18, 19, 19, 20][m]
  const Tl = [0, 3, 7, 11][m]
  const Hb = [10, 9, 7, 6][m]
  const legH = [4, 3, 2, 2][m]
  const L = Tl + Bl
  const x0 = cx - Math.floor(L / 2)
  const yb = G - legH // bottom row of the body
  const yTop = yb - Hb + 1 // top row of the body (before insets)
  const p = new Pix()
  const X = (x: number) => (look === 'right' ? x0 + x : x0 + (L - 1 - x))
  const put = (x: number, y: number, c: string) => p.set(X(x), y, c)
  const tops: number[] = []
  const bots: number[] = []
  const s = m / 3
  const collar = m === 2 ? [0.5, 0.62] : [0.54, 0.62]

  // legs first (they sit under the body)
  if (m === 1) {
    ;[1, 5, 12, 16].forEach((lx, i) => {
      const bx = Tl + lx
      for (let y = yb + 1; y <= G; y++) {
        const out = y === G ? (i === 0 ? -1 : i === 3 ? 1 : 0) : 0
        put(bx + out, y, P.k).set(X(bx + 1 + out), y, P.k)
      }
    })
  } else {
    const legs: [number, number, string][] = m === 2
      ? [[Tl + 4, -1, P.D], [Tl + 13, 1, P.D], [Tl + 1, -1, P.d], [Tl + 15, 1, P.d]]
      : [[Tl + 5, -1, P.D], [Tl + 12, 1, P.D], [Tl + 1, -1, P.o], [Tl + 15, 1, P.o]]
    for (const [lx, dir, c] of legs) {
      put(lx, yb + 1, c)
      put(lx + 1, yb + 1, c)
      // the foot reaches out along the ground, toes splayed
      put(lx + dir, G, c)
      put(lx + 1 + dir, G, c)
      put(lx + (dir > 0 ? 3 : -2), G, c === P.D ? P.D : P.toe)
      if (m === 3) put(lx + (dir > 0 ? 2 : -1), G, c === P.D ? P.D : P.toe)
    }
  }

  // the tail: tapering from the body to the tip, the tip curling up
  for (let j = 0; j < Tl; j++) {
    const f = (j + 1) / Tl
    const th = Math.max(1, Math.round(f * Hb * 0.5))
    const lift = Math.round([0, 0, 1, 3][m] * (1 - f) * (1 - f))
    const b = yb - lift
    for (let y = b - th + 1; y <= b; y++) put(j, y, y === b - th + 1 ? P.L : y === b && th > 1 ? P.d : P.o)
  }
  if (m === 3) put(0, yb - 4, P.L)

  // the body column by column
  for (let i = 0; i < Bl; i++) {
    const u = i / (Bl - 1)
    let t = i === 0 || i === Bl - 1 ? 1 : 0
    let b = i === 0 || i === Bl - 1 ? 1 : 0
    if (m >= 2) {
      if (u < 0.3) t += Math.round(((0.3 - u) / 0.3) * (Hb - 3) * s)
      if (i === 0) b = 0
      if (u > collar[0] - 0.02 && u < collar[1] + 0.02) t += 1 // the neck dips a little
      if (i === Bl - 1) (t += 1), (b += 1)
      if (i === Bl - 2) t += 1
    }
    const top = yTop + t
    const bot = yb - b
    tops.push(top)
    bots.push(bot)
    const inCollar = m >= 2 && u >= collar[0] && u <= collar[1]
    for (let y = top; y <= bot; y++) {
      const r = y - yTop
      let c = P.o
      if (y === top) c = P.L
      if (m === 1 && r >= 5) c = r >= 7 ? P.k : P.r // the uniform, still mostly there
      if (m >= 2 && y === bot) c = u < collar[0] ? P.k : P.d // the black of the suit under the belly
      if (inCollar) c = y === top ? P.rl : P.r
      if (i === 0 && y > top && c === P.o) c = P.d
      if (i === Bl - 1 && y > top && c === P.o) c = '#f0a07a'
      put(Tl + i, y, c)
    }
    if (inCollar && i === Math.round(collar[0] * (Bl - 1)) + 1) put(Tl + i, top + 2, P.gold) // combadge
  }

  // spots: dark, and a few yellow on the last two drawings
  const spots: [number, number, string][] = [
    [0.35, 0.3, P.sp], [0.12, 0.5, P.sp], [0.47, 0.55, P.sp],
    [0.25, 0.25, P.sp], [0.4, 0.75, P.y], [0.7, 0.3, P.sp], [0.2, 0.7, P.y],
    [0.3, 0.55, P.sp], [0.5, 0.2, P.sp], [0.8, 0.6, P.y], [0.45, 0.35, P.y],
  ]
  spots.slice(0, [0, 3, 7, 11][m]).forEach(([u, v, c]) => {
    const i = Math.round(u * (Bl - 1))
    const y = Math.round(tops[i] + 1 + v * Math.max(0, bots[i] - tops[i] - 2))
    if (y > tops[i] && y < bots[i]) {
      put(Tl + i, y, c)
      if (c === P.sp && m === 3 && u < 0.5) put(Tl + i + 1, y, c)
    }
  })
  // tail spots
  if (m === 3) [2, 5, 8].forEach((j, n) => put(j, yb - Math.round(3 * (1 - (j + 1) / Tl) ** 2) - (n === 1 ? 1 : 0), P.sp))

  // eyes: Clawd's two tall eyes, sliding forward and up onto the head as bumps
  if (m === 1) [7, 13].forEach(e => [0, 1].forEach(dx => [2, 3, 4].forEach(dy => put(Tl + e + dx, yTop + dy, P.E))))
  if (m === 2) [12, 16].forEach(e => [0, 1].forEach(dx => [1, 2].forEach(dy => put(Tl + e + dx, tops[e] + dy, P.E))))
  if (m === 3) {
    ;[13, 16].forEach((e, n) => {
      const ht = Math.min(tops[e], tops[e + 1])
      put(Tl + e, ht - 1, n ? P.L : P.d).set(X(Tl + e + 1), ht - 1, n ? P.L : P.d)
      ;[0, 1].forEach(dx => [0, 1].forEach(dy => put(Tl + e + dx, ht + dy, P.E)))
    })
    // a contented smile along the jaw
    ;[Bl - 5, Bl - 4, Bl - 3].forEach(i => put(Tl + i, bots[i] - 1, P.D))
    put(Tl + Bl - 6, bots[Bl - 6] - 2, P.D)
  }
  // little stub arms on the first in-between
  if (m === 1) {
    put(-1 + Tl, yTop + 4, P.o).set(X(Tl - 2), yTop + 4, P.o).set(X(Tl - 2), yTop + 5, P.d)
    put(Tl + Bl, yTop + 4, P.o).set(X(Tl + Bl + 1), yTop + 4, P.o).set(X(Tl + Bl + 1), yTop + 5, P.d)
  }
  // hair: Janeway keeps a little auburn bun to the end; Paris loses his sandy fringe
  const A = '#8a4226'
  const AL = '#b8643a'
  if (who === 'jane') {
    const bi = m === 1 ? 6 : m === 2 ? 8 : 9
    const ht = tops[bi]
    put(Tl + bi, ht - 1, A).set(X(Tl + bi + 1), ht - 1, AL).set(X(Tl + bi + 2), ht - 1, A)
    put(Tl + bi + 1, ht - 2, A)
    if (m < 3) put(Tl + bi - 1, ht, A).set(X(Tl + bi + 3), ht, A)
    if (m === 1) for (let i = 2; i < Bl - 2; i++) if (i !== bi + 1) put(Tl + i, tops[i], i % 3 ? A : AL)
  } else if (m === 1) {
    for (let i = 9; i < Bl - 1; i++) put(Tl + i, tops[i], i % 2 ? '#d8b26a' : '#c49a52')
  }
  return p
}

// Clawd as himself, before the turn
function thCrab(k: CrabHD, x: number, y: number, look: Side, who: 'paris' | 'jane') {
  const { p } = clawdBody(k, x, y, look)
  if (who === 'paris') {
    p.rect(x + 1, y, 16, 1, '#d8b26a').rect(x + 2, y - 1, 5, 1, '#d8b26a').rect(x + 3, y - 1, 2, 1, '#eccb86')
    p.set(x + 1, y + 1, '#c49a52').set(x + 16, y + 1, '#c49a52')
    p.rect(x + 12, y + 7, 2, 2, '#e8c547').set(x + 12, y + 7, '#fff3b0') // combadge
    p.set(x + 4, y + 6, '#e8c547') // one pip
  } else {
    const A = '#8a4226'
    const AL = '#b8643a'
    p.rect(x + 1, y, 16, 1, A).rect(x, y + 1, 2, 2, A).rect(x + 16, y + 1, 2, 2, A).rect(x + 4, y, 7, 1, AL)
    p.rect(x + 11, y - 3, 5, 3, A).rect(x + 12, y - 4, 3, 1, A).rect(x + 12, y - 3, 2, 1, AL)
    p.rect(x + 4, y + 7, 2, 2, '#e8c547').set(x + 4, y + 7, '#fff3b0')
    for (const c of [11, 12, 13, 14]) p.set(x + c, y + 6, c % 2 ? '#e8c547' : '#b3262e')
    p.set(x + 12, y + 6, '#e8c547').set(x + 14, y + 6, '#e8c547')
  }
  let s = thPath(p)
  s += armRestHD(k, x, y, 'left') + armRestHD(k, x, y, 'right')
  return s
}

// a baby salamander, 9 x 3, facing right
const TH_BABY = [
  '.......d.L.',
  'L....LLEoEL',
  '.oLLoosoooo',
  '..dooooood.',
  '...t.t..t.t',
]

// The finished salamander, facing right: eye bumps on a broad head, a smile, a red
// collar with the combadge, the black of the uniform under the belly, spots, splayed
// feet and a long tail curling up at the tip. 30 x 10, feet on the last row.
const TH_SAL3 = [
  '......................dd..LL..',
  '.....................dEEdLEEL.',
  '..............LLLLRRooEEooEEoL',
  'LL.........LLLosoorroooooooooh',
  'oo......LLLoosooyorgoooooooooh',
  '.oo..LLLooosoooyoorroooDoooooo',
  '..oooooosoooooosoorrooooDDDDDd',
  '...dkkkkkkkkkkkkkkrrddddddddd.',
  '.....oo..DD......DD...oo......',
  '..totoo..DDD.....DDD..ootot...',
]

// the finished salamander, with slow blinks (skin over the eyes)
function thSal3(look: Side, cx: number, G: number, who: 'paris' | 'jane', blinks: [number, number][]) {
  const P = TH_SAL
  const pal: Record<string, string> = {
    L: P.L, o: P.o, d: P.d, D: P.D, s: P.sp, y: P.y, r: P.r, R: P.rl, k: P.k, E: P.E, g: P.gold, t: P.toe, h: '#f0a07a',
    A: '#8a4226', a: '#b8643a',
  }
  const rows = TH_SAL3.map(r => r.split(''))
  if (who === 'jane') {
    // her auburn bun, kept to the end
    rows[0][19] = 'A'
    rows[1][18] = 'A'
    rows[1][19] = 'a'
    rows[1][20] = 'A'
  }
  const flip = (r: string[]) => (look === 'right' ? r : [...r].reverse())
  const x0 = cx - 15
  const y0 = G - 9
  let out = thPath(new Pix().rows(rows.map(r => flip(r).join('')), x0, y0, pal))
  const lid = rows.map((r, j) => r.map(c => (c === 'E' ? (j === 1 ? 'd' : 'o') : '.')))
  out += shown(thPath(new Pix().rows(lid.map(r => flip(r).join('')), x0, y0, pal)), blinks, thT)
  return out
}

function threshold() {
  const W = GW * Q
  const H = GH * Q

  // ---- the story, in seconds ----
  const WARP0 = 2.6 // Paris opens her up: the stars begin to stretch
  const ECHO0 = 3.6 // the shuttle smears into echoes of itself
  const ECHO1 = 5.0
  const D1a = 5.4 // cross-dissolve to the swamp world
  const D1b = 7.3
  const M0 = 9.4 // the turn begins (Paris; Janeway a beat later)
  const MSTEP = 1.1 // one drawing every 1.1 s
  const MFADE = 0.35
  const BABY = 12.9 // the babies wriggle up out of the water
  const HEART = 13.8
  const D2a = 15.1 // back to the calm space of the opening
  const RESET = 11.0 // everything in space slips back to its start while the swamp covers it

  let s = `<defs>
    <linearGradient id="thSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0918"/><stop offset="1" stop-color="#1a1534"/></linearGradient>
    <radialGradient id="thNeb"><stop offset="0" stop-color="#7b5bc6" stop-opacity="0.24"/><stop offset="1" stop-color="#7b5bc6" stop-opacity="0"/></radialGradient>
    <radialGradient id="thNeb2"><stop offset="0" stop-color="#3f8fa8" stop-opacity="0.16"/><stop offset="1" stop-color="#3f8fa8" stop-opacity="0"/></radialGradient>
    <linearGradient id="thFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="thFade"><rect width="${W}" height="${H}" fill="url(#thFadeG)"/></mask>
    <linearGradient id="thSwSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16222a"/><stop offset="0.55" stop-color="#2a3a38"/><stop offset="1" stop-color="#46553e"/></linearGradient>
    <linearGradient id="thWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3d3a"/><stop offset="1" stop-color="#14201f"/></linearGradient>
    <radialGradient id="thSun"><stop offset="0" stop-color="#e2e6b0" stop-opacity="0.5"/><stop offset="0.5" stop-color="#b8c890" stop-opacity="0.16"/><stop offset="1" stop-color="#b8c890" stop-opacity="0"/></radialGradient>
    <linearGradient id="thMist" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fb4a0" stop-opacity="0"/><stop offset="0.5" stop-color="#9fb4a0" stop-opacity="0.16"/><stop offset="1" stop-color="#9fb4a0" stop-opacity="0"/></linearGradient>
    <radialGradient id="thNac"><stop offset="0" stop-color="#6fd0ff" stop-opacity="0.4"/><stop offset="1" stop-color="#6fd0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="thFly"><stop offset="0" stop-color="#e8ff9a" stop-opacity="0.5"/><stop offset="1" stop-color="#e8ff9a" stop-opacity="0"/></radialGradient>
  </defs>`

  let seed = 1996
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // ================= SPACE =================
  let space = `<rect width="${W}" height="${H}" fill="url(#thSpace)"/>`
  space += `<ellipse cx="${28 * Q}" cy="${12 * Q}" rx="70" ry="22" fill="url(#thNeb)"/>`
  space += `<ellipse cx="${66 * Q}" cy="${36 * Q}" rx="60" ry="18" fill="url(#thNeb2)"/>`
  // a slow drifting starfield: a 45-column tile, three copies, sliding one tile per story
  const tile = [new Pix(), new Pix(), new Pix()]
  for (let y = 1; y < GH - 1; y += 3) {
    for (let x = 0; x < 45; x += 3) {
      if (rnd() < 0.5) continue
      const sx = x + Math.floor(rnd() * 2)
      const b = Math.floor(rnd() * 3)
      for (const off of [0, 45, 90]) tile[b].set(sx + off, y, '#cdbaf0')
    }
  }
  space += `<g>${tile.map((t, i) => `<g opacity="${[0.16, 0.3, 0.5][i]}">${thPath(t)}</g>`).join('')}<animateTransform attributeName="transform" type="translate" values="0 0;${-45 * Q} 0" dur="${thT}s" repeatCount="indefinite"/></g>`
  // a few bright twinkling stars
  ;[[22, 5], [70, 4], [84, 30], [48, 40], [12, 26]].forEach(([x, y], i) => {
    const glow = new Pix().set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    space += `<g>${thPath(glow)}<animate attributeName="opacity" values="0.15;0.75;0.15" dur="${thPer([6, 5, 4, 7, 5][i])}s" begin="${(-i * 0.53).toFixed(2)}s" repeatCount="indefinite"/></g>`
    space += thPath(new Pix().set(x, y, '#ffffff'))
  })
  // the swamp planet ahead, small and green, where this is all going
  {
    const pl = new Pix()
    const px = 79
    const py = 10
    for (let y = -5; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        const d = x * x + y * y
        if (d > 28) continue
        const band = Math.sin(y * 1.3 + x * 0.25)
        let c = band > 0.3 ? '#4f7a54' : band > -0.4 ? '#3d6248' : '#5e8a5a'
        if (x + y < -4) c = '#7aa070'
        if (x + y > 3) c = '#26402f'
        if (d > 22) c = x + y < 0 ? '#8fbf88' : '#1e3326'
        pl.set(px + x, py + y, c)
      }
    }
    space += `<circle cx="${(px + 0.5) * Q}" cy="${(py + 0.5) * Q}" r="17" fill="#7fc89a" opacity="0.07"/>` + thPath(pl)
  }

  // warp streaks: stars stretch back into long lines, then (unseen) shrink back
  let streaks = ''
  const SC = ['#9fb8ff', '#c9a7ff', '#e6e0ff', '#8fd0ff']
  for (let i = 0; i < 22; i++) {
    const y = 2 + Math.floor(rnd() * 42)
    const hx = 30 + Math.floor(rnd() * 62)
    if (y > 15 && y < 29 && hx > 30 && hx < 66) continue // not through the shuttle
    const len = 14 + Math.floor(rnd() * 22)
    const st = WARP0 + rnd() * 0.8
    const op = (0.35 + rnd() * 0.35).toFixed(2)
    streaks += `<rect x="${hx * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="${SC[i % 4]}" opacity="0">${thTrack('width', [[st, Q], [st + 1.8, len * Q], [RESET, len * Q], [RESET + 0.5, Q]])}${thTrack('x', [[st, hx * Q], [st + 1.8, (hx - len) * Q], [RESET, (hx - len) * Q], [RESET + 0.5, hx * Q]])}${thOp([[st, 0], [st + 0.6, +op], [RESET, +op], [RESET + 0.5, 0]])}</rect>`
  }
  space += `<g>${streaks}${thMove([[WARP0, 0, 0], [D1b, -22, 0], [RESET, -22, 0], [RESET + 0.5, 0, 0]], '0.5 0 0.8 1')}</g>`

  // the shuttle: idles with a slow bob; at warp ten it surges ahead and leaves echoes
  const shut = thPath(new Pix().rows(TH_SHUTTLE, 0, 0, TH_SHUTTLE_PAL))
  const nac = `<ellipse cx="${14 * Q}" cy="${8.5 * Q}" rx="${12 * Q}" ry="${2.5 * Q}" fill="url(#thNac)"/>`
  const sx = 32
  const sy = 17
  let echoes = ''
  ;[[-8, 0.4], [-16, 0.24], [-24, 0.12]].forEach(([dx, o], i) => {
    echoes += `<g opacity="0"><g transform="translate(${dx * Q} 0)">${shut}</g>${thOp([[ECHO0 + i * 0.3, 0], [ECHO1 + i * 0.2, o], [D1b + 0.4, o], [RESET, 0]])}</g>`
  })
  space += `<g transform="translate(${sx * Q} ${sy * Q})"><g>${thMove([[WARP0, 0, 0], [ECHO1, 10, 0], [RESET, 10, 0], [RESET + 0.6, 0, 0]], '0.5 0 0.3 1')}<g>${thSway(0, 1, 4)}${echoes}${nac}${shut}</g></g></g>`

  // ================= THE SWAMP =================
  let sw = `<rect width="${W}" height="${H}" fill="url(#thSwSky)"/>`
  // a hazy alien sun, low and pale, and a thin ringed moon
  sw += `<circle cx="${70 * Q}" cy="${11 * Q}" r="36" fill="url(#thSun)"/>`
  {
    const sun = new Pix()
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = x * x + y * y
      if (d > 18) continue
      sun.set(70 + x, 11 + y, d > 12 ? '#b9c48e' : x + y < -2 ? '#e8ecc0' : '#d2daa6')
    }
    sw += `<g opacity="0.85">${thPath(sun)}</g>`
    const moon = new Pix()
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x * x + y * y > 10) continue
      if ((x + 1.6) ** 2 + (y - 0.8) ** 2 < 7) continue // the shadowed part
      moon.set(40 + x, 6 + y, x > 1 ? '#c2ccb4' : '#9aa894')
    }
    sw += thPath(moon)
  }
  // far tree line: cypress silhouettes with hanging moss
  {
    const far = new Pix()
    const near = new Pix()
    for (let c = 0; c < GW; c++) {
      const h = 21 + Math.round(1.5 * Math.sin(c / 3.1) + 1.2 * Math.sin(c / 7.3 + 1))
      far.rect(c, h, 1, 31 - h, '#24332f')
      far.set(c, h, '#2e3f39')
    }
    // tall cypresses, flared at the base, with moss strands
    ;[[6, 9], [19, 12], [33, 8], [52, 10], [63, 13], [86, 7]].forEach(([x, top]) => {
      for (let y = top; y < 31; y++) {
        const w = y < top + 3 ? 1 : y > 27 ? 3 + (y - 27) : 2
        near.rect(x - Math.floor(w / 2), y, w, 1, '#1a2622')
      }
      // the canopy: a flat-topped crown
      for (let j = 0; j < 5; j++) {
        const w = [5, 9, 11, 9, 5][j]
        near.rect(x - Math.floor(w / 2), top - 2 + j, w, 1, j === 0 ? '#2c4034' : '#1f2e28')
      }
      ;[-4, -2, 2, 4].forEach((dx, n) => {
        const len = 2 + ((x + n) % 3)
        for (let k = 0; k < len; k++) near.set(x + dx, top + 3 + k, k === len - 1 ? '#5a7a52' : '#46604a')
      })
    })
    sw += thPath(far) + thPath(near)
  }
  // a band of mist drifting slowly back and forth across the tree line
  sw += `<g><rect x="${-20 * Q}" y="${24 * Q}" width="${80 * Q}" height="${6 * Q}" fill="url(#thMist)"/>${thSway(30, 0, 1)}</g>`
  // the water
  sw += `<rect x="0" y="${31 * Q}" width="${W}" height="${17 * Q}" fill="url(#thWater)"/>`
  {
    const w = new Pix()
    w.rect(0, 31, GW, 1, '#3e5450')
    // reflections of the trees and the sun
    for (let c = 0; c < GW; c++) if ((c * 7) % 11 < 4) w.set(c, 32 + (c % 3), '#1c2a28')
    for (let j = 0; j < 4; j++) w.rect(67 - j, 33 + j * 2, 6 + 2 * j, 1, j % 2 ? '#7a8a6a' : '#8f9e74')
    sw += thPath(w)
  }
  // ripples drifting slowly
  {
    const r = new Pix()
    for (let i = 0; i < 9; i++) {
      const y = 33 + Math.floor(rnd() * 14)
      const x = Math.floor(rnd() * 90)
      if (x < 34 && y > 40) continue // keep the title corner calm
      r.rect(x, y, 3 + Math.floor(rnd() * 4), 1, '#3a4e4a')
      r.rect(x + 45, y, 3, 1, '#344744')
    }
    sw += `<g>${thPath(r)}${thSway(-4, 0, 2)}</g>`
  }
  // the Cochrane, landed in the reeds across the water
  {
    const lp = new Pix()
    const lx = 22
    const ly = 26
    lp.rect(lx + 2, ly, 10, 1, '#b8b2c8').rect(lx + 1, ly + 1, 13, 1, '#9c96b0').rect(lx, ly + 2, 15, 1, '#8a849e')
    lp.rect(lx + 10, ly + 1, 3, 1, '#24304e').set(lx + 11, ly + 1, '#4f6a8a')
    lp.rect(lx, ly + 3, 15, 1, '#5a5470').rect(lx + 1, ly + 3, 9, 1, '#3f7fa8').rect(lx + 2, ly + 2, 10, 1, '#a8a2b8')
    lp.rect(lx + 2, ly + 2, 1, 1, '#b3262e')
    sw += thPath(lp)
    sw += thPath(new Pix().rect(lx - 1, ly + 4, 17, 1, '#2a3a38').rect(lx + 1, ly + 5, 13, 1, '#344642'))
  }
  // the mossy bank the two of them sit on
  {
    const bank = new Pix()
    for (let c = 30; c < GW; c++) {
      const top = 37 + (c < 34 ? 34 - c : 0) + Math.round(0.6 * Math.sin(c / 2.3))
      bank.rect(c, top, 1, 42 - top, '#3b3226')
      bank.set(c, top, c % 4 ? '#557a38' : '#6b8f44')
      if (c % 3 === 0) bank.set(c, top + 1, '#46642e')
      bank.set(c, 41, '#2a241c')
    }
    // a reflection of the bank, broken by the ripples
    for (let c = 31; c < GW; c += 2) bank.set(c, 42, '#22302c')
    sw += thPath(bank)
  }
  // reeds and cattails, swaying a little
  const reeds = (xs: number[], base: number, n: number) => {
    const r = new Pix()
    xs.forEach((x, i) => {
      const h = 6 + ((x * 5) % 5)
      for (let y = base - h; y < base; y++) r.set(x, y, i % 2 ? '#5e7a38' : '#4e6a30')
      r.rect(x, base - h - 2, 1, 3, '#6b3d22').set(x, base - h - 2, '#8a5232').set(x, base - h - 3, '#5e7a38')
    })
    return `<g>${thPath(r)}${thSway(1, 0, n, -i0(n))}</g>`
  }
  const i0 = (n: number) => +(n * 0.37).toFixed(2)
  sw += reeds([20, 23, 37, 39], 31, 3)
  sw += reeds([86, 88], 38, 4)
  // lily pads with a pink flower
  {
    const lily = new Pix()
    ;[[44, 44], [52, 46], [80, 44]].forEach(([x, y], i) => {
      lily.rect(x, y, 4, 1, '#3f6b3a').set(x + 1, y, '#2a4a2a').rect(x + 1, y - 1, 2, 1, '#4f7e44')
      if (i === 2) lily.set(x + 1, y - 2, '#ff9ec4').set(x + 2, y - 2, '#ffd0e2').set(x + 2, y - 3, '#ff9ec4')
    })
    sw += `<g>${thPath(lily)}${thSway(0, 0.5, 3)}</g>`
  }
  // fireflies drifting on loops that divide the story
  for (let i = 0; i < 5; i++) {
    const x = 44 + i * 9
    const y = 16 + (i % 3) * 4
    const d = thPer([3, 4, 2, 5, 3][i])
    sw += `<g opacity="0"><circle cx="${x * Q + 1}" cy="${y * Q + 1}" r="4" fill="url(#thFly)"/><rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#e8ff9a"/><animateMotion path="M0 0 q ${i % 2 ? 8 : -8} -6 ${i % 2 ? 2 : -3} -10 t ${i % 2 ? -6 : 6} 4 z" dur="${d}s" begin="${(-i * 0.7).toFixed(2)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.15;0.9;0.15" calcMode="spline" keyTimes="0;0.5;1" keySplines="${TH_EASE};${TH_EASE}" dur="${d}s" begin="${(-i * 0.7).toFixed(2)}s" repeatCount="indefinite"/></g>`
  }

  // ---- the two of them ----
  const G = 37
  const PX = 36
  const JX = 66
  const CY = G - 13
  // Paris: crab, then three steps of the turn; Janeway the same, a beat later
  const who: [CrabHD, number, Side, 'paris' | 'jane', number, number[]][] = [
    [TH_PARIS, PX, 'right', 'paris', 0, [PX + 9, 45, 44, 41]],
    [TH_JANE, JX, 'left', 'jane', 0.35, [JX + 9, 75, 75, 75]],
  ]
  for (const [k, x, look, w, lag, cxs] of who) {
    const blinks: [number, number][] = w === 'paris' ? [[13.0, 13.14], [14.6, 14.74]] : [[13.4, 13.54], [15.0, 15.14]]
    const draw = [thCrab(k, x, CY, look, w), ...[1, 2].map(m => thPath(thSal(m, look, cxs[m], G, w))), thSal3(look, cxs[3], G, w, blinks)]
    let g = ''
    for (let m = 0; m < 4; m++) {
      const tin = M0 + lag + (m - 1) * MSTEP // this drawing fades in on top
      const tout = M0 + lag + m * MSTEP + MFADE // and fades out once the next is in
      const keys: [number, number][] =
        m === 0 ? [[tout, 1], [tout + MFADE, 0]]
          : m === 3 ? [[0, 0], [tin, 0], [tin + MFADE, 1]]
            : [[0, 0], [tin, 0], [tin + MFADE, 1], [tout, 1], [tout + MFADE, 0]]
      let art = draw[m]
      if (m === 0) {
        // blinks and a happy little hop before the turn
        const ex = look === 'left' ? [4, 10] : [6, 12]
        const lids = new Pix()
        ex.forEach(e => lids.rect(x + e, CY + 2, 2, 3, k.skin))
        art = `<g>${art}${shown(thPath(lids), w === 'paris' ? [[7.7, 7.82], [8.3, 8.42]] : [[7.9, 8.02], [8.75, 8.87]], thT)}${hopQ(w === 'paris' ? [[8.7, 9.0]] : [[8.9, 9.2]], thT)}</g>`
      }
      if (m === 3) {
        // slow blinks as salamanders, and a nuzzle toward each other
        art = `<g>${art}${thMove([[0, 0, 0], [HEART - 0.6, 0, 0], [HEART, look === 'right' ? 1 : -1, 0], [D2a + 0.5, look === 'right' ? 1 : -1, 0], [D2a + 1.2, 0, 0]])}</g>`
      }
      g += `<g opacity="${m === 0 ? 1 : 0}">${art}${thOp(keys)}</g>`
    }
    sw += g
  }
  // babies wriggle up out of the water and settle in front of their parents
  {
    const baby = (flip: boolean) => {
      const rows = flip ? TH_BABY.map(r => [...r].reverse().join('')) : TH_BABY
      return thPath(new Pix().rows(rows, 0, 0, { L: '#eb9575', o: '#d97757', E: '#1a1020', d: '#b85f43' }))
    }
    const bs: [number, number, boolean, number, number][] = [
      [36, 39, false, 0, 3], [54, 40, true, 0.5, 4], [70, 39, true, 0.9, 5],
    ]
    bs.forEach(([x, y, flip, lag, n]) => {
      const t0 = BABY + lag
      sw += `<g opacity="0"><g transform="translate(${x * Q} ${y * Q})"><g>${thMove([[t0, 0, 3], [t0 + 1.0, 0, 0], [t0 + 2.0, flip ? -2 : 2, 0]])}<g>${thSway(flip ? -1 : 1, 0, n * 2)}${baby(flip)}</g></g></g>${thOp([[t0, 0], [t0 + 0.6, 1]])}</g>`
    })
    // the water they came up through, drawn over their feet
    sw += thPath(new Pix().rect(40, 43, 40, 1, '#22302c').rect(40, 44, 40, 1, '#1c2a28'))
  }
  // a small heart rising between the two heads
  {
    const h = new Pix().rows(['.pp.pp.', 'pPPpppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...'], 54, 22, { p: '#ff7fa8', P: '#ffc4d8' })
    sw += `<g opacity="0"><g>${thPath(h)}${thMove([[HEART, 0, 2], [D2a + 0.6, 0, -6]], '0.3 0 0.6 1')}</g>${thOp([[HEART, 0], [HEART + 0.7, 1], [D2a, 1], [D2a + 0.8, 0]])}</g>`
  }

  // ---- composite: space underneath, the swamp dissolving in and out on top ----
  const swamp = `<g opacity="0">${sw}${thOp([[D1a, 0], [D1b, 1], [D2a, 1], [thT, 0]])}</g>`
  s += `<g mask="url(#thFade)">${space}${swamp}</g>`
  return s
}
