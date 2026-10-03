// ---------- Data and Spot: "Ode to Spot" ----------
// Data's quarters on the Enterprise-D, evening light. Data (Clawd) stands reading his
// "Ode to Spot" from a PADD, a speech bubble filling with verse. Spot, his orange tabby,
// sleeps on her cushion right beside him with her back to him.
// One 17.17 s story, played once (authored seconds; the band plays it 10/17.17 as fast):
//  0.0 - 2.9  calm: Data reads, Spot asleep on her cushion, the first verse appears
//  2.9 - 6.2  Spot wakes, looks up, gets up and has a long, blissful stretch
//  6.2 - 9.1  she strolls off to her bowl of Feline Supplement 74 while Data, undeterred,
//             raises a claw for the big second verse
//  9.1 - 11.7 she eats, tail swaying; Data reads on
// 11.7 - 17.17 she turns, strolls back, circles once on the cushion and curls up again
//             beside him; the verse ends and the bubble goes: the opening shot

const DS_T = SCENE_SECONDS
const DS_EASE = '0.4 0 0.2 1'
const dsKt = (ts: number[]) => ts.map(t => +(t / DS_T).toFixed(5)).join(';')

// eased translate on the story timeline: [t, x, y] in art px, held flat between keys
function dsTrack(pts: [number, number, number][], spline = DS_EASE) {
  const list = [...pts]
  if (list[0][0] > 0) list.unshift([0, list[0][1], list[0][2]])
  const last = list[list.length - 1]
  if (last[0] < DS_T) list.push([DS_T, last[1], last[2]])
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${DS_T}s" repeatCount="indefinite" values="${list.map(p => `${+(p[1] * Q).toFixed(2)} ${+(p[2] * Q).toFixed(2)}`).join(';')}" keyTimes="${dsKt(list.map(p => p[0]))}" keySplines="${list.slice(1).map(() => spline).join(';')}"/>`
}

// smooth opacity on the story timeline: [t, value]
function dsFade(pts: [number, number][]) {
  const list = [...pts]
  if (list[0][0] > 0) list.unshift([0, list[0][1]])
  if (list[list.length - 1][0] < DS_T) list.push([DS_T, list[list.length - 1][1]])
  return `<animate attributeName="opacity" dur="${DS_T}s" repeatCount="indefinite" values="${list.map(p => p[1]).join(';')}" keyTimes="${dsKt(list.map(p => p[0]))}"/>`
}

function dsInter(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = []
  for (const [a0, a1] of a) for (const [b0, b1] of b) {
    const lo = Math.max(a0, b0)
    const hi = Math.min(a1, b1)
    if (hi > lo) out.push([lo, hi])
  }
  return out
}

// ---------- Spot ----------
const DS_CAT: Record<string, string> = {
  o: '#e0873a', // orange
  l: '#f6ae5e', // light top
  d: '#a4501c', // tabby stripe
  s: '#bd6a2c', // underside shade
  w: '#f6dcae', // cream muzzle / chest
  i: '#e8968a', // inner ear
  n: '#e8848a', // nose
  e: '#cfe25a', // eye
  c: '#5e2c12', // closed eye
  f: '#9a4818', // far legs
  p: '#f2cc96', // paws
}
const DS_CAT_LINE = '#36190c'

type DsFace = 'side' | '3q' | 'front'
type DsCat = {
  len: number // body length in art px
  fl: number // front leg height
  rl: number // rear leg height
  hx: number
  hy: number
  face: DsFace
  dir: 1 | -1
  eyes: 'o' | 'c'
  tail: number[][]
  tailFront: boolean
  paws: number // front paws stretched forward along the ground
  walk: number // walk-cycle frame, -1 standing still
}

// heads facing right; '.' empty
const DS_HEAD: Record<DsFace, string[]> = {
  side: [
    '.o..o..',
    '.oi.oi.',
    'llldll.',
    'odooeo.',
    'ooooooon',
    '.swwww.',
  ],
  '3q': [
    '.o...o.',
    '.oi.oi.',
    'lldllll',
    'oeoodeo',
    'oooonoo',
    '.wwwww.',
  ],
  front: [
    'o.....o',
    'oi...io',
    'llldlll',
    'oeodoeo',
    'ooonooo',
    '.wwwww.',
  ],
}

// tails: 8 points relative to the rear top corner of the body (x back is negative)
const DS_TAIL_WRAP = [[0, 2], [-1, 3], [-1, 4], [0, 5], [2, 5], [4, 5], [6, 5], [7, 4]]
const DS_TAIL_RELAX = [[0, 1], [-1, 1], [-2, 1], [-3, 0], [-4, -1], [-4, -2], [-4, -3], [-3, -4]]
const DS_TAIL_SWAY = [[0, 1], [-1, 1], [-2, 0], [-2, -1], [-3, -2], [-3, -3], [-2, -4], [-1, -4]]
const DS_TAIL_UP = [[0, 1], [-1, 0], [-2, -1], [-2, -2], [-2, -3], [-2, -4], [-1, -5], [0, -5]]
const DS_TAIL_STRETCH = [[0, 1], [-1, 0], [-1, -1], [-1, -2], [0, -3], [0, -4], [1, -5], [2, -5]]

const DS_WALK = [
  [1, -1, -1, 1],
  [0, 0, 0, 0],
  [-1, 1, 1, -1],
  [0, 0, 0, 0],
]

function dsLine(put: (x: number, y: number, i: number) => void, x0: number, y0: number, x1: number, y1: number, i: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let k = 0; k <= n; k++) put(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), i)
}

// draw Spot (local: x around 0, ground row y = 0, facing right), outline it, place it
function dsCatSvg(P: DsCat, ox: number, oy: number) {
  const m = new Map<string, string>()
  const put = (x: number, y: number, c: string) => m.set(x + ',' + y, c)
  const L = Math.max(5, Math.round(P.len))
  const xr = -Math.floor(L / 2)
  const xf = xr + L - 1
  const legAt = (x: number) => Math.round(P.rl + (P.fl - P.rl) * ((x - xr) / (L - 1)))
  const topAt = (x: number) => -legAt(x) - 4
  // far legs
  const off = P.walk >= 0 ? DS_WALK[P.walk] : [0, 0, 0, 0]
  const leg = (x: number, o: number, near: boolean) => {
    const h = legAt(x)
    for (let i = 0; i < h; i++) {
      const xx = x + Math.round((o * (i + 1)) / h)
      put(xx, -h + 1 + i, near ? (i === h - 1 ? DS_CAT.p : i === 0 ? DS_CAT.o : DS_CAT.o) : DS_CAT.f)
    }
  }
  if (P.paws < 0.5) leg(xf - 3, off[1], false)
  leg(xr + 1, off[3], false)
  // tail behind the body
  const tx = xr
  const ty = topAt(xr)
  const tail = (front: boolean) => {
    if (P.tailFront !== front) return
    const pts = P.tail.map(([x, y]) => [Math.round(x), Math.round(y)])
    let k = 0
    for (let i = 1; i < pts.length; i++) {
      dsLine((x, y) => {
        k++
        const tip = i === pts.length - 1
        put(tx + x, ty + y, tip ? DS_CAT.d : k % 3 === 0 ? DS_CAT.d : DS_CAT.o)
      }, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], i)
    }
  }
  tail(false)
  // body
  const stripes = L >= 10 ? [2, 5, 8] : L >= 7 ? [2, 5] : [2]
  for (let x = xr; x <= xf; x++) {
    const top = topAt(x)
    const end = x === xr || x === xf
    for (let r = end ? 1 : 0; r <= (end ? 3 : 4); r++) {
      let c = r === 0 ? DS_CAT.l : r === 4 ? DS_CAT.s : DS_CAT.o
      if (stripes.includes(x - xr) && r <= 2) c = DS_CAT.d
      if (x >= xf - 2 && r >= 2) c = DS_CAT.w
      if (x <= xr + 2 && r === 3) c = DS_CAT.s
      put(x, top + r, c)
    }
  }
  // near legs
  if (P.paws < 0.5) leg(xf - 2, off[0], true)
  leg(xr + 2, off[2], true)
  // stretched-out forepaws, or tucked paws when lying down
  if (P.paws >= 0.5) {
    const n = Math.round(P.paws)
    for (let x = xf - 2; x <= xf + n; x++) put(x, 0, x >= xf + n - 1 ? DS_CAT.p : DS_CAT.o)
    for (let x = xf - 1; x < xf + n - 1; x++) put(x, -1, DS_CAT.f)
  } else if (P.fl < 0.5) {
    put(xf + 1, 0, DS_CAT.p)
    put(xf + 2, 0, DS_CAT.p)
  }
  tail(true)
  // head
  const rows = DS_HEAD[P.face].map(r => (P.eyes === 'c' ? r.replace(/e/g, 'c') : r))
  const hx0 = P.face === 'front' ? Math.round((xr + xf) / 2) - 3 + Math.round(P.hx) : P.face === '3q' ? xf - 4 + Math.round(P.hx) : xf - 3 + Math.round(P.hx)
  const hy0 = topAt(xf) - 3 + Math.round(P.hy)
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (DS_CAT[row[i]]) put(hx0 + i, hy0 + j, DS_CAT[row[i]])
  })
  // outline around the whole cat
  const out = new Map<string, string>()
  for (const k of m.keys()) {
    const [x, y] = k.split(',').map(Number)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const kk = x + dx + ',' + (y + dy)
      if (!m.has(kk) && y + dy <= 0) out.set(kk, DS_CAT_LINE)
    }
  }
  for (const [k, c] of m) out.set(k, c)
  return dsPaths(out, ox, oy, P.dir)
}

// compact sprite: one stroked path per colour, one horizontal run per segment (art px)
function dsPaths(m: Map<string, string>, ox: number, oy: number, dir: number) {
  const rows = new Map<number, Map<number, string>>()
  for (const [k, c] of m) {
    const [x, y] = k.split(',').map(Number)
    const X = ox + dir * x
    const Y = oy + y
    if (!rows.has(Y)) rows.set(Y, new Map())
    rows.get(Y)!.set(X, c)
  }
  const byC = new Map<string, string>()
  for (const [y, row] of rows) {
    const xs = [...row.keys()].sort((a, b) => a - b)
    let i = 0
    while (i < xs.length) {
      const c = row.get(xs[i])!
      let j = i
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && row.get(xs[j + 1]) === c) j++
      byC.set(c, (byC.get(c) || '') + `M${xs[i]} ${y}.5h${xs[j] - xs[i] + 1}`)
      i = j + 1
    }
  }
  let s = ''
  for (const [c, d] of byC) s += `<path stroke="${c}" d="${d}"/>`
  return `<g transform="scale(${Q})" fill="none">${s}</g>`
}

// a pixel layer like Pix, written as compact stroked paths
class DsPix {
  m = new Map<string, string>()
  set(x: number, y: number, c: string) {
    this.m.set(x + ',' + y, c)
    return this
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
    return this
  }
  svg() {
    return dsPaths(this.m, 0, 0, 1)
  }
}

function dsLerp(A: DsCat, B: DsCat, f: number): DsCat {
  const n = (a: number, b: number) => a + (b - a) * f
  const h = f < 0.5
  return {
    len: n(A.len, B.len),
    fl: n(A.fl, B.fl),
    rl: n(A.rl, B.rl),
    hx: n(A.hx, B.hx),
    hy: n(A.hy, B.hy),
    paws: n(A.paws, B.paws),
    face: h ? A.face : B.face,
    dir: h ? A.dir : B.dir,
    eyes: h ? A.eyes : B.eyes,
    tailFront: h ? A.tailFront : B.tailFront,
    tail: A.tail.map((p, i) => [n(p[0], B.tail[i][0]), n(p[1], B.tail[i][1])]),
    walk: -1,
  }
}

// ---------- Data ----------
const DS_DATA: CrabHD = {
  skin: '#e9dfbf',
  light: '#f7f0d8',
  shade: '#bfb38c',
  upper: '#1c1424',
  lower: '#c99a22',
  lowerShade: '#9a7414',
  legs: '#1c1424',
  rim: '#ffe6b0',
}
type DsGaze = 'ur' | 'dr' | 'ul' | 'c'

function dataAndSpot() {
  const T = DS_T
  const W = GW * Q
  const H = GH * Q
  let seed = 74
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const per = (n: number) => +(T / n).toFixed(5)

  let s = `<defs>
    <linearGradient id="dsFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="dsFade"><rect width="${W}" height="${H}" fill="url(#dsFadeG)"/></mask>
    <radialGradient id="dsLamp"><stop offset="0" stop-color="#ffc47a" stop-opacity="0.26"/><stop offset="1" stop-color="#ffc47a" stop-opacity="0"/></radialGradient>
    <radialGradient id="dsSconce"><stop offset="0" stop-color="#ffd890" stop-opacity="0.5"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>
    <radialGradient id="dsNeb"><stop offset="0" stop-color="#7a5ac8" stop-opacity="0.45"/><stop offset="1" stop-color="#7a5ac8" stop-opacity="0"/></radialGradient>
    <radialGradient id="dsWin"><stop offset="0" stop-color="#8aa0e8" stop-opacity="0.14"/><stop offset="1" stop-color="#8aa0e8" stop-opacity="0"/></radialGradient>
    <radialGradient id="dsCorner"><stop offset="0" stop-color="#140e1a" stop-opacity="0.55"/><stop offset="0.6" stop-color="#140e1a" stop-opacity="0.35"/><stop offset="1" stop-color="#140e1a" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---------- the quarters ----------
  let base = ''
  const vr = (x: number, y: number, w: number, h: number, c: string) =>
    (base += `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`)
  const room = new DsPix()
  // ceiling with a warm cove light
  vr(0, 0, GW, 2, '#1e1620')
  vr(0, 2, GW, 1, '#6a4a3a')
  // the wall: warm taupe with a darker lower band and a rail
  vr(0, 3, GW, 22, '#3c2e38')
  for (let r = 7; r < 25; r += 6) vr(0, r, GW, 1, '#402f3c')
  vr(0, 25, GW, 1, '#6a5246')
  vr(0, 26, GW, 6, '#30242e')
  for (let c = 2; c < GW; c += 7) vr(c, 27, 1, 5, '#2a1f28')
  // the long window onto space, slanted at the top left like the Enterprise's
  const WX0 = 58
  const WX1 = 88
  const WY0 = 4
  const WY1 = 20
  vr(WX0 - 1, WY0 - 1, WX1 - WX0 + 3, WY1 - WY0 + 3, '#5c4a52')
  vr(WX0 - 1, WY1 + 1, WX1 - WX0 + 3, 1, '#7a6266')
  vr(WX0, WY0, WX1 - WX0 + 1, WY1 - WY0 + 1, '#080716')
  for (let y = WY0; y <= WY1; y++) {
    const cut = Math.max(0, 4 - (y - WY0))
    for (let x = WX0; x < WX0 + cut; x++) room.set(x, y, '#5c4a52')
  }
  // mullions
  for (const mx of [68, 78]) room.rect(mx, WY0, 1, WY1 - WY0 + 1, '#4a3a44')
  // faint stars
  for (let i = 0; i < 34; i++) {
    const x = WX0 + 1 + Math.floor(rnd() * (WX1 - WX0))
    const y = WY0 + Math.floor(rnd() * (WY1 - WY0 + 1))
    if (x === 68 || x === 78 || x < WX0 + Math.max(0, 4 - (y - WY0))) continue
    room.set(x, y, rnd() < 0.6 ? '#3a3a62' : '#6a6c9a')
  }
  // the sill
  vr(WX0 - 2, WY1 + 2, WX1 - WX0 + 5, 1, '#8a6e62')
  vr(WX0 - 2, WY1 + 3, WX1 - WX0 + 5, 1, '#4a3842')
  // a wall sconce between the bubble and the window
  room.rect(52, 7, 3, 1, '#c89a5a').rect(52, 8, 3, 3, '#ffe0a0').rect(53, 11, 1, 1, '#8a6a4a').set(52, 8, '#f2c070')
  // a shelf on the far left (in the faded edge): books and Data's violin case
  room.rect(3, 14, 15, 1, '#7a5a44').rect(3, 15, 15, 1, '#4a3430')
  room.rect(4, 10, 1, 4, '#8a3a3a').rect(5, 11, 1, 3, '#3a5a7a').rect(6, 10, 1, 4, '#c08a4a').rect(7, 11, 1, 3, '#5a7a4a')
  room.rect(10, 11, 7, 3, '#5a2e1e').rect(11, 11, 5, 1, '#7a4428').set(16, 12, '#3a1c12')
  // the floor: warm dark carpet
  vr(0, 32, GW, 16, '#2a2028')
  vr(0, 32, GW, 1, '#1a1418')
  for (let r = 35; r < 48; r += 3) vr(0, r, GW, 1, '#2e2330')
  for (let i = 0; i < 20; i++) room.set(Math.floor(rnd() * GW), 33 + Math.floor(rnd() * 15), rnd() < 0.5 ? '#33283a' : '#221a20')
  s += `<g mask="url(#dsFade)">${base}${room.svg()}`
  // a soft nebula and a few slow twinkles in the window
  s += `<ellipse cx="${82 * Q}" cy="${9 * Q}" rx="20" ry="11" fill="url(#dsNeb)"/>`
  ;[[63, 9], [72, 6], [75, 15], [84, 13], [86, 6], [62, 17]].forEach(([x, y], i) => {
    s += `<g>${new DsPix().set(x, y, '#eef0ff').svg()}<animate attributeName="opacity" values="0.3;0.9;0.3" dur="${per([5, 4, 3, 4, 5, 3][i])}s" begin="-${(i * 0.9).toFixed(1)}s" repeatCount="indefinite"/></g>`
  })
  s += `</g>`
  s += `<ellipse cx="${73 * Q}" cy="${24 * Q}" rx="40" ry="22" fill="url(#dsWin)"/>`
  s += `<ellipse cx="${53 * Q}" cy="${9 * Q}" rx="16" ry="14" fill="url(#dsSconce)"/>`
  s += `<ellipse cx="${50 * Q}" cy="${32 * Q}" rx="80" ry="30" fill="url(#dsLamp)"/>`

  // ---------- Spot's cushion and her bowl ----------
  const cush = new DsPix()
  cush.rect(51, 36, 17, 1, '#8a74a8').rect(50, 37, 19, 1, '#7a6498').rect(49, 38, 21, 3, '#5e4a80').rect(50, 41, 19, 1, '#3e3058')
  cush.rect(49, 38, 21, 1, '#6c5690').set(49, 40, '#4a3a6a').set(69, 40, '#4a3a6a')
  for (const tx of [53, 59, 65]) cush.set(tx, 39, '#4a3a6a')
  s += `<ellipse cx="${59.5 * Q}" cy="${42 * Q}" rx="23" ry="2.5" fill="#0e0a12" opacity="0.6"/>`
  s += cush.svg()
  // the bowl, with a heap of Feline Supplement 74
  const bowlBack = new DsPix().rect(78, 37, 7, 1, '#5a4a3a').rect(79, 36, 5, 1, '#b07a48').set(80, 35, '#c88a52').set(82, 35, '#9a6438')
  const bowl = new DsPix()
  bowl.rect(77, 38, 9, 1, '#d8dce8').rect(77, 39, 9, 1, '#9aa4c0').rect(78, 40, 7, 1, '#6a7494').set(77, 38, '#f0f2f8')
  bowl.rect(80, 39, 3, 1, '#c84a3a')
  s += `<ellipse cx="${81.5 * Q}" cy="${41 * Q}" rx="10" ry="1.5" fill="#0e0a12" opacity="0.6"/>`
  s += bowlBack.svg()

  // ---------- Spot's story ----------
  const BX = 59
  const BY = 38
  const SLEEP: DsCat = { len: 12, fl: 0, rl: 0, hx: 0, hy: 2, face: 'side', dir: 1, eyes: 'c', tail: DS_TAIL_WRAP, tailFront: true, paws: 0, walk: -1 }
  const LIE: DsCat = { ...SLEEP, hy: 0, eyes: 'o' }
  const STAND: DsCat = { ...SLEEP, fl: 3, rl: 3, hy: 0, eyes: 'o', tail: DS_TAIL_RELAX, tailFront: false }
  const STRETCH: DsCat = { ...STAND, fl: 0, rl: 4, hx: 2, hy: 3, paws: 3, eyes: 'c', tail: DS_TAIL_STRETCH }
  const WALKR: DsCat = { ...STAND, tail: DS_TAIL_UP }
  const EAT: DsCat = { ...STAND, hx: 1, hy: 4 }
  const EAT2: DsCat = { ...EAT, tail: DS_TAIL_SWAY }
  const Q3R: DsCat = { ...WALKR, len: 9, face: '3q' }
  const FRONT: DsCat = { ...WALKR, len: 7, face: 'front' }
  const Q3L: DsCat = { ...Q3R, dir: -1 }
  const WALKL: DsCat = { ...WALKR, dir: -1 }
  const LIE_R: DsCat = { ...LIE }
  const seg: [number, number, DsCat][] = []
  const hold = (a: number, b: number, P: DsCat) => seg.push([a, b, P])
  const tr = (a: number, b: number, A: DsCat, B: DsCat, n = 3) => {
    for (let i = 0; i < n; i++) seg.push([a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n, dsLerp(A, B, (i + 1) / (n + 1))])
  }
  const seq = (a: number, b: number, list: DsCat[]) => list.forEach((P, i) => seg.push([a + ((b - a) * i) / list.length, a + ((b - a) * (i + 1)) / list.length, P]))
  const walk = (a: number, b: number, P: DsCat) => {
    const n = Math.round((b - a) / 0.18)
    for (let i = 0; i < n; i++) seg.push([a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n, { ...P, walk: i % 4 }])
  }
  hold(0, 2.9, SLEEP)
  tr(2.9, 3.35, SLEEP, LIE) // head comes up, eyes open
  hold(3.35, 3.7, LIE)
  hold(3.7, 3.82, { ...LIE, eyes: 'c' }) // a slow blink at Data
  hold(3.82, 4.0, LIE)
  tr(4.0, 4.5, LIE, STAND) // gets up
  tr(4.5, 4.95, STAND, STRETCH) // into the stretch
  hold(4.95, 5.7, STRETCH)
  tr(5.7, 6.2, STRETCH, WALKR) // out of it, tail up
  walk(6.2, 9.08, WALKR) // off to the bowl
  tr(9.08, 9.5, WALKR, EAT) // head down into the bowl
  // eating, tail swaying slowly
  {
    const sway = [0, 1, 2, 3, 2, 1].map(k => dsLerp(EAT, EAT2, k / 3))
    const step = (11.3 - 9.5) / 12
    for (let i = 0; i < 12; i++) seg.push([9.5 + i * step, 9.5 + (i + 1) * step, sway[i % 6]])
  }
  tr(11.3, 11.7, EAT, WALKR) // head up
  seq(11.7, 12.2, [Q3R, FRONT, Q3L]) // turns around
  walk(12.2, 14.36, WALKL) // back to the cushion
  seq(14.36, 14.9, [Q3L, FRONT, Q3R]) // circles once
  tr(14.9, 15.4, WALKR, LIE_R) // lies down
  hold(15.4, 15.75, LIE_R)
  tr(15.75, 16.25, LIE_R, SLEEP) // head down, eyes shut
  hold(16.25, T, SLEEP)
  // one sprite per distinct drawing, shown in all its windows
  const sprites = new Map<string, [number, number][]>()
  for (const [a, b, P] of seg) {
    const svg = dsCatSvg(P, BX, BY)
    if (!sprites.has(svg)) sprites.set(svg, [])
    sprites.get(svg)!.push([a, b])
  }
  let cat = ''
  for (const [svg, w] of sprites) cat += shown(svg, w, T)
  // across the floor, and down off / back up onto the cushion
  const slide = dsTrack([[6.2, 0, 0], [9.08, 17, 0], [12.2, 17, 0], [14.36, 0, 0]], '0.3 0 0.7 1')
  const step = dsTrack([[7.15, 0, 0], [7.6, 0, 2], [13.45, 0, 2], [13.9, 0, 0]])
  s += `<g><g>${cat}${step}</g>${slide}</g>`
  s += bowl.svg()

  // ---------- Data ----------
  const DX = 26
  const DY = 26
  const k = DS_DATA
  s += `<ellipse cx="${(DX + 9) * Q}" cy="${40 * Q}" rx="20" ry="2" fill="#0e0a12" opacity="0.6"/>`
  const d = new DsPix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = j === 0 ? k.light : k.skin
    if (j >= 6) c = j < 8 ? k.upper! : k.lower!
    d.rect(DX + inset, DY + j, 18 - 2 * inset, 1, c)
  }
  d.rect(DX, DY + 1, 1, 5, k.shade).rect(DX + 17, DY + 1, 1, 5, k.rim).set(DX, DY + 8, k.lowerShade!)
  for (const lx of [1, 5, 11, 15]) d.rect(DX + lx, DY + 10, 2, 4, k.legs).set(DX + lx + 1, DY + 10, '#2c2236')
  // slicked-back dark hair with a widow's peak
  d.rect(DX + 1, DY - 1, 16, 1, '#141018').rect(DX + 5, DY - 1, 6, 1, '#2e2a3a')
  d.rect(DX, DY, 18, 1, '#141018').rect(DX + 3, DY, 4, 1, '#3a3448').rect(DX + 8, DY + 1, 2, 1, '#141018')
  d.set(DX, DY + 1, '#141018').set(DX + 17, DY + 1, '#141018')
  // combadge, two pips and a hollow one
  d.rect(DX + 4, DY + 6, 2, 2, '#e8c547').set(DX + 4, DY + 6, '#fff3b0')
  d.set(DX + 10, DY + 6, '#e8c547').set(DX + 12, DY + 6, '#e8c547').set(DX + 14, DY + 6, '#7a6a2a')
  s += d.svg()

  // right claw up, holding the PADD where he can read it
  const padd = new DsPix()
  padd.rect(DX + 18, DY + 4, 2, 2, k.skin).rect(DX + 18, DY + 6, 2, 1, k.shade)
  padd.rect(DX + 19, DY + 2, 2, 2, k.skin).set(DX + 20, DY + 3, k.shade)
  padd.rect(DX + 20, DY, 2, 2, k.skin).set(DX + 21, DY + 1, k.shade)
  padd.rect(DX + 20, DY - 9, 6, 8, '#2a2632').rect(DX + 20, DY - 9, 6, 1, '#4a4656').rect(DX + 25, DY - 9, 1, 8, '#1a1820')
  padd.rect(DX + 21, DY - 8, 4, 6, '#141220')
  padd.rect(DX + 21, DY - 8, 2, 1, '#e8a04a').rect(DX + 23, DY - 8, 2, 1, '#9a8ad0')
  for (const [ly, lw] of [[DY - 6, 4], [DY - 5, 3], [DY - 4, 4], [DY - 3, 2]] as [number, number][]) padd.rect(DX + 21, ly, lw, 1, '#5a6a9a')
  // the claw gripping the bottom edge
  padd.rect(DX + 19, DY - 2, 1, 2, k.skin).rect(DX + 22, DY - 2, 1, 2, k.skin).rect(DX + 19, DY - 1, 4, 1, k.skin).set(DX + 19, DY - 2, k.light)
  s += padd.svg()
  // the line he is reading glows a little brighter, moving down the screen
  ;[[DY - 6, 4], [DY - 5, 3], [DY - 4, 4], [DY - 3, 2]].forEach(([ly, lw], i) => {
    s += `<g opacity="0">${new DsPix().rect(DX + 21, ly, lw, 1, '#a8c0f0').svg()}<animate attributeName="opacity" calcMode="discrete" values="0;1;0;0" keyTimes="0;${(0.1 + 0.2 * i).toFixed(2)};${(0.3 + 0.2 * i).toFixed(2)};1" dur="${per(4)}s" repeatCount="indefinite"/></g>`
  })

  // left claw: rests, then rises for the big second verse
  const armLow = (() => {
    const p = new DsPix()
    p.rect(DX - 3, DY + 4, 3, 2, k.skin).rect(DX - 3, DY + 6, 3, 1, k.shade)
    p.rect(DX - 5, DY + 2, 2, 3, k.skin)
    p.rect(DX - 6, DY, 1, 2, k.skin).rect(DX - 3, DY, 1, 2, k.skin).rect(DX - 6, DY + 1, 4, 1, k.skin)
    p.set(DX - 6, DY, k.light).set(DX - 3, DY, k.light)
    return p.svg()
  })()
  // a step further: the forearm on a diagonal, the claw out at shoulder height
  const armLow2 = (() => {
    const p = new DsPix()
    p.rect(DX - 3, DY + 4, 3, 2, k.skin).rect(DX - 3, DY + 6, 3, 1, k.shade)
    p.rect(DX - 5, DY + 3, 2, 2, k.skin).rect(DX - 6, DY + 1, 2, 2, k.skin)
    p.rect(DX - 7, DY - 1, 1, 2, k.skin).rect(DX - 4, DY - 1, 1, 2, k.skin).rect(DX - 7, DY, 4, 1, k.skin)
    p.set(DX - 7, DY - 1, k.light).set(DX - 4, DY - 1, k.light)
    return p.svg()
  })()
  const chain = [armLow, armLow2, armMidHD(k, DX, DY, 'left')]
  const lift: [number, number] = [7.0, 9.2]
  const st = 0.13
  const win: [number, number][][] = [
    [[lift[0], lift[0] + st], [lift[1] - st, lift[1]]],
    [[lift[0] + st, lift[0] + 2 * st], [lift[1] - 2 * st, lift[1] - st]],
    [[lift[0] + 2 * st, lift[1] - 2 * st]],
  ]
  s += shown(armRestHD(k, DX, DY, 'left'), complement([lift], T), T)
  chain.forEach((c, i) => (s += shown(c, win[i], T)))

  // eyes: Data's yellow eyes, one sprite per gaze, shut for blinks
  const gaze: [number, number, DsGaze][] = [
    [0, 3.0, 'ur'], [3.0, 4.6, 'dr'], [4.6, 6.2, 'ur'], [6.2, 7.1, 'dr'], [7.1, 9.1, 'ul'],
    [9.1, 11.6, 'ur'], [11.6, 15.9, 'dr'], [15.9, T, 'ur'],
  ]
  const blinks: [number, number][] = [[1.8, 1.92], [5.3, 5.42], [10.4, 10.52], [16.5, 16.62]]
  const ex = (g: DsGaze) => (g === 'ul' ? [4, 10] : g === 'c' ? [5, 11] : [6, 12])
  const ey = (g: DsGaze) => (g === 'ur' || g === 'ul' ? 1 : 2)
  const open = complement(blinks, T)
  for (const g of ['ur', 'dr', 'ul'] as DsGaze[]) {
    const w = merge(gaze.filter(z => z[2] === g).map(z => [z[0], z[1]] as [number, number]))
    const e = new DsPix()
    const shut = new DsPix()
    for (const x of ex(g)) {
      const X = DX + x
      const Y = DY + ey(g)
      e.rect(X, Y, 2, 3, '#e8b818').set(X, Y, '#f6d84a').set(X + 1, Y, '#f6d84a')
      const px = g === 'ul' ? X : X + 1
      e.rect(px, g === 'dr' ? Y + 1 : Y, 1, 2, '#3a2a08')
      shut.rect(X, Y + 2, 2, 1, '#6a5a2a')
    }
    s += shown(e.svg(), dsInter(w, open), T)
    const bw = dsInter(w, blinks)
    if (bw.length) s += shown(shut.svg(), bw, T)
  }

  // ---------- the ode: a speech bubble filling with verse ----------
  const BXL = 27
  const BYT = 5
  const bub = new DsPix()
  bub.rect(BXL + 1, BYT, 17, 1, '#8a7658').rect(BXL, BYT + 1, 1, 9, '#8a7658').rect(BXL + 18, BYT + 1, 1, 9, '#8a7658').rect(BXL + 1, BYT + 10, 17, 1, '#8a7658')
  bub.rect(BXL + 1, BYT + 1, 17, 9, '#ddcca8').rect(BXL + 1, BYT + 1, 17, 1, '#ebdcbc')
  // its tail, pointing down at Data
  bub.rect(BXL + 4, BYT + 10, 3, 1, '#ddcca8').rect(BXL + 4, BYT + 11, 2, 1, '#ddcca8').set(BXL + 4, BYT + 12, '#ddcca8')
  bub.set(BXL + 3, BYT + 11, '#8a7658').set(BXL + 3, BYT + 12, '#8a7658').set(BXL + 4, BYT + 13, '#8a7658').set(BXL + 5, BYT + 12, '#8a7658').set(BXL + 6, BYT + 11, '#8a7658').set(BXL + 7, BYT + 10, '#8a7658')
  let ode = bub.svg()
  const INK = '#5a4632'
  // a verse: an icon, then lines that write themselves in three strokes each
  const verse = (icon: Pix, lines: [number, number, number][], t0: number, t1: number) => {
    let v = shown(icon.svg(), [[t0, t1]], T)
    let t = t0 + 0.3
    for (const [x, y, w] of lines) {
      const parts = [Math.ceil(w / 3), Math.ceil((2 * w) / 3), w]
      parts.forEach((pw, i) => {
        const a = t + i * 0.22
        const b = i < 2 ? t + (i + 1) * 0.22 : t1
        v += shown(new DsPix().rect(x, y, pw, 1, INK).svg(), [[a, b]], T)
      })
      t += 0.95
    }
    return v
  }
  // verse one: a little orange cat face
  const catIcon = new DsPix()
  catIcon.set(BXL + 2, BYT + 2, '#c86a2a').set(BXL + 5, BYT + 2, '#c86a2a').rect(BXL + 2, BYT + 3, 4, 3, '#e0873a').rect(BXL + 2, BYT + 3, 4, 1, '#f6ae5e')
  catIcon.set(BXL + 3, BYT + 4, '#3a2a08').set(BXL + 5, BYT + 4, '#3a2a08').set(BXL + 3, BYT + 4, '#3a2a08')
  ode += verse(catIcon, [[BXL + 8, BYT + 3, 9], [BXL + 8, BYT + 5, 7], [BXL + 2, BYT + 7, 13]], 1.5, 7.0)
  // verse two: a small heart, the climax
  const heart = new DsPix()
  heart.set(BXL + 2, BYT + 3, '#d8566a').set(BXL + 4, BYT + 3, '#d8566a').rect(BXL + 2, BYT + 4, 3, 1, '#d8566a').set(BXL + 3, BYT + 5, '#d8566a').set(BXL + 2, BYT + 3, '#f08a9a')
  ode += verse(heart, [[BXL + 7, BYT + 3, 10], [BXL + 7, BYT + 5, 8], [BXL + 2, BYT + 7, 14]], 7.2, 14.9)
  s += `<g opacity="0">${ode}${dsFade([[0, 0], [0.9, 0], [1.4, 1], [14.9, 1], [15.5, 0]])}</g>`

  // keep the title corner quiet
  s += `<ellipse cx="${14 * Q}" cy="${48 * Q}" rx="${30 * Q}" ry="${8 * Q}" fill="url(#dsCorner)"/>`
  return s
}
