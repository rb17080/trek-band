// ---------- Déjà Q: Picard's facepalm ----------
// One 17.17 s story. Q, smug, snaps his claw (a small sparkle, a puff of smoke):
// sombrero, moustache, maracas. He dances to a slow, steady beat while Picard's
// eyes narrow. Picard slowly brings a claw to his face and holds it there while
// Q keeps going. Q snaps again, the costume goes up in smoke; Picard lowers his
// claw, sighs, and glares at a very pleased Q.

const FP_Q: CrabHD = {
  skin: '#de7d5b',
  light: '#f09a78',
  shade: '#b8603f',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f6ad86',
}

const FP_HAIR = '#3a2418'
const FP_OUT = '#4e1c10'

// big flat blocks, painted in order, one rect each
class fpBlocks {
  private out = ''
  rect(x: number, y: number, w: number, h: number, c: string) {
    this.out += `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`
    return this
  }
  set(x: number, y: number, c: string) {
    return this.rect(x, y, 1, 1, c)
  }
  svg() {
    return this.out
  }
}

// Clawd's body without legs, so the body can sag while the legs stay planted
function fpBody(k: CrabHD, x: number, y: number, look: Side) {
  const p = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = j === 0 ? k.light : k.skin
    if (j >= 6 && k.upper) c = j < 8 ? k.upper : k.lower!
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, c)
  }
  const far = look === 'right' ? x : x + 17
  const near = look === 'right' ? x + 17 : x
  p.rect(far, y + 1, 1, 5, k.shade)
  p.rect(near, y + 1, 1, 5, k.rim)
  if (k.lowerShade) p.rect(far, y + 8, 1, 1, k.lowerShade)
  return p
}

function fpLegs(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  for (const lx of [1, 5, 11, 15]) p.rect(x + lx, y + 10, 2, 4, k.legs)
  return p.svg()
}

// windows a minus windows b
function fpMinus(a: [number, number][], b: [number, number][]): [number, number][] {
  let out = merge(a)
  for (const [c, d] of merge(b)) {
    const next: [number, number][] = []
    for (const [s, e] of out) {
      if (d <= s || c >= e) next.push([s, e])
      else {
        if (c > s) next.push([s, c])
        if (d < e) next.push([d, e])
      }
    }
    out = next
  }
  return out
}

const fpKT = (ts: number[]) => ts.map(t => +(t / SCENE_SECONDS).toFixed(4)).join(';')

// eased positions on the story timeline: [time, dx, dy] in art pixels; between two keys
// the move eases in and out, equal keys hold
const FP_EASE = '0.4 0 0.2 1'
function fpTween(keys: [number, number, number][]) {
  const T = SCENE_SECONDS
  const ks = [...keys]
  if (ks[0][0] > 0) ks.unshift([0, ks[0][1], ks[0][2]])
  if (ks[ks.length - 1][0] < T) ks.push([T, ks[ks.length - 1][1], ks[ks.length - 1][2]])
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${T}s" repeatCount="indefinite" values="${ks.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${ks.map(k => +(k[0] / T).toFixed(5)).join(';')}" keySplines="${ks.slice(1).map(() => FP_EASE).join(';')}"/>`
}

// smooth opacity over the story: [time, opacity] keys, linear between them
function fpFade(keys: [number, number][]) {
  const ks = [...keys]
  if (ks[0][0] > 0) ks.unshift([0, ks[0][1]])
  if (ks[ks.length - 1][0] < SCENE_SECONDS) ks.push([SCENE_SECONDS, ks[ks.length - 1][1]])
  return `<animate attributeName="opacity" dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${ks.map(k => k[1]).join(';')}" keyTimes="${fpKT(ks.map(k => k[0]))}"/>`
}

// smooth drift over the story: [time, dx, dy] in CSS pixels, linear between keys
function fpDrift(keys: [number, number, number][]) {
  const ks = [...keys]
  if (ks[0][0] > 0) ks.unshift([0, ks[0][1], ks[0][2]])
  if (ks[ks.length - 1][0] < SCENE_SECONDS) ks.push([SCENE_SECONDS, ks[ks.length - 1][1], ks[ks.length - 1][2]])
  return `<animateTransform attributeName="transform" type="translate" dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${ks.map(([, x, y]) => `${x} ${y}`).join(';')}" keyTimes="${fpKT(ks.map(k => k[0]))}"/>`
}

// a 4-point sparkle
function fpSpark(x: number, y: number, c: string, big: boolean) {
  const p = new Pix().set(x, y, '#fff6dc')
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, c)
  if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) p.set(x + dx, y + dy, c)
  return p.svg()
}

// a small cloud of smoke, soft lavender grey
function fpSmoke(pts: [number, number][]) {
  const p = new Pix()
  for (const [x, y] of pts) {
    p.rect(x, y, 3, 2, '#c7bdd6').rect(x + 1, y - 1, 2, 1, '#ddd5e8').set(x + 3, y + 1, '#9e93b2').set(x - 1, y + 1, '#ab9fbf')
  }
  return p.svg()
}

// Picard's facepalm: a claw clamped over the brow and eyes, the pincer gap
// a dark line across them, forearm running diagonally down the uniform
const FP_PALM = [
  '..OOOOOOOOOOOO........',
  '.OLLLLLLLLLLLLO.......',
  '.OFFFFFFFFFFFFFO......',
  '..OOOOOOOOFFFFFO......',
  '...OFFFFFFFFFFFO......',
  '....OSSSSSSFFFFFO.....',
  '.....OOOOOOOLFFFFO....',
  '...........OSLFFFFO...',
  '............OSLFFFFO..',
  '.............OSLFFFFO.',
  '..............OSSSSSO.',
  '...............OOOOO..',
]

function fpPalm(x: number, y: number) {
  return new Pix().rows(FP_PALM, x, y - 1, { O: FP_OUT, L: '#ffcfa8', F: '#f7a985', S: '#d27a55' }).svg()
}

// a claw half raised, bent at the elbow, on the right side of the body
function fpArmHalf(k: CrabHD, x: number, y: number, h = 5) {
  const p = new Pix()
  const top = y + 6 - h
  p.rect(x + 18, y + 4, 2, 2, k.skin)
  p.rect(x + 19, top, 2, h, k.skin).rect(x + 20, top, 1, h, k.shade)
  p.rect(x + 18, top - 3, 1, 2, k.skin).rect(x + 21, top - 3, 1, 2, k.skin)
  p.rect(x + 18, top - 1, 4, 1, k.skin)
  p.set(x + 18, top - 3, k.light).set(x + 21, top - 3, k.light)
  return p.svg()
}

const FP_NOTE = ['..XX', '..X.X', '..X..', 'XXX..', 'XX...']

function facepalm() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let s = `<defs>
    <linearGradient id="fpFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="fpFade"><rect width="${W}" height="${H}" fill="url(#fpFadeG)"/></mask>
    <clipPath id="fpScr"><rect x="${31 * Q}" y="${4 * Q}" width="${49 * Q}" height="${15 * Q}"/></clipPath>
    <radialGradient id="fpLamp"><stop offset="0" stop-color="#ffd9a8" stop-opacity="0.22"/><stop offset="1" stop-color="#ffd9a8" stop-opacity="0"/></radialGradient>
    <radialGradient id="fpMagic"><stop offset="0" stop-color="#ffe08a" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb86b" stop-opacity="0"/></radialGradient>
    <radialGradient id="fpSnapG"><stop offset="0" stop-color="#fff0b8" stop-opacity="0.7"/><stop offset="0.5" stop-color="#ffd47a" stop-opacity="0.25"/><stop offset="1" stop-color="#ffb86b" stop-opacity="0"/></radialGradient>
  </defs>`

  // ----- the bridge: back wall, viewscreen, consoles, carpet -----
  let back = ''
  const wall = new fpBlocks()
  wall.rect(0, 0, GW, 22, '#6f6152')
  wall.rect(0, 0, GW, 2, '#3e352f').rect(0, 2, GW, 1, '#54483e')
  // panel seams and lighter panel faces
  for (const sx of [6, 14, 22, 84]) wall.rect(sx, 3, 1, 19, '#56493e').rect(sx + 1, 3, 1, 19, '#85745f')
  wall.rect(0, 20, GW, 2, '#5d5045')
  back += wall.svg()
  // warm ceiling lamps washing the wall
  back += `<ellipse cx="${18 * Q}" cy="${4 * Q}" rx="30" ry="22" fill="url(#fpLamp)"/><ellipse cx="${86 * Q}" cy="${4 * Q}" rx="24" ry="20" fill="url(#fpLamp)"/>`
  // LCARS wall panels
  const lc = new fpBlocks()
  lc.rect(9, 6, 3, 12, '#1c1820')
  lc.rect(9, 6, 3, 2, '#e89a4a').rect(9, 9, 3, 1, '#b48ac8').rect(9, 11, 3, 3, '#7f8fd8').rect(9, 15, 3, 2, '#e8b07a')
  lc.rect(86, 6, 3, 12, '#1c1820')
  lc.rect(86, 6, 3, 1, '#b48ac8').rect(86, 8, 3, 3, '#e89a4a').rect(86, 12, 3, 1, '#7f8fd8').rect(86, 14, 3, 3, '#e8b07a')
  back += lc.svg()

  // the viewscreen: frame, bezel, deep space
  const scr = new fpBlocks()
  scr.rect(29, 2, 53, 19, '#2a2530')
  scr.rect(30, 3, 51, 17, '#4b4450')
  scr.rect(30, 3, 51, 1, '#625a66')
  scr.rect(31, 4, 49, 15, '#05060f')
  back += scr.svg()
  back += `<rect x="${31 * Q}" y="${4 * Q}" width="${49 * Q}" height="${15 * Q}" fill="#141634" opacity="0.6"/>`
  // two layers of stars drifting past, clipped to the screen
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  // each layer is a tile of width L repeated across the screen; it scrolls one tile per
  // period, and the period divides the story length, so the loop restart is seamless
  const layer = (n: number, c: string, L: number, period: number, op: number) => {
    const p = new Pix()
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) pts.push([Math.floor(rnd() * L), Math.floor(rnd() * 15)])
    for (let k = 0; k * L < 49 + L; k++) for (const [x, y] of pts) p.set(31 + x + k * L, 4 + y, c)
    return `<g opacity="${op}">${p.svg()}<animateTransform attributeName="transform" type="translate" values="0 0;${-L * Q} 0" dur="${+period.toFixed(4)}s" repeatCount="indefinite"/></g>`
  }
  back += `<g clip-path="url(#fpScr)">${layer(11, '#8d8fc0', 25, SCENE_SECONDS, 0.7)}${layer(4, '#e8ecff', 19, SCENE_SECONDS / 2, 1)}`
  // a small planet arc in the lower corner of the screen
  const pl = new Pix()
  for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) {
    const d = x * x + y * y
    if (d > 144) continue
    pl.set(70 + x, 26 + y, d > 120 ? '#7aa3c9' : x + y < -6 ? '#4f78a3' : '#2f4e78')
  }
  back += pl.svg() + `</g>`
  // screen glare
  back += `<rect x="${31 * Q}" y="${4 * Q}" width="${49 * Q}" height="${Q}" fill="#9aa6ff" opacity="0.12"/>`

  // ops and conn consoles behind them
  const con = new fpBlocks()
  con.rect(14, 21, 76, 1, '#a2958a')
  con.rect(14, 22, 76, 3, '#1e1a26')
  con.rect(14, 25, 76, 1, '#7b6d5f')
  con.rect(14, 26, 76, 2, '#4d433c')
  con.rect(49, 21, 2, 7, '#2a2428')
  back += con.svg()
  // LCARS bits on the consoles; a few breathe slowly
  const bits: [number, number, number, string][] = [
    [17, 22, 4, '#e89a4a'], [23, 23, 2, '#7f8fd8'], [27, 22, 3, '#b48ac8'], [32, 23, 5, '#e8b07a'], [39, 22, 2, '#e89a4a'], [43, 23, 4, '#7f8fd8'],
    [53, 22, 3, '#b48ac8'], [58, 23, 4, '#e89a4a'], [64, 22, 2, '#e8b07a'], [68, 23, 5, '#7f8fd8'], [76, 22, 3, '#e89a4a'], [81, 23, 4, '#b48ac8'],
  ]
  bits.forEach(([x, y, w, c], i) => {
    const r = new Pix().rect(x, y, w, 1, c).svg()
    back += i % 3 === 0 ? `<g>${r}<animate attributeName="opacity" values="1;0.4;1" dur="${+(SCENE_SECONDS / [8, 6, 5, 4][i % 4]).toFixed(4)}s" repeatCount="indefinite"/></g>` : r
  })

  // carpet with a lit strip at the console foot and a few seams
  const fl = new fpBlocks()
  fl.rect(0, 28, GW, 20, '#2c2536')
  fl.rect(0, 28, GW, 1, '#463c4e').rect(0, 29, GW, 1, '#382f43')
  for (let i = 0; i < 30; i++) fl.set(Math.floor(rnd() * GW), 31 + Math.floor(rnd() * 16), rnd() < 0.5 ? '#342c40' : '#231d2c')
  back += fl.svg()
  s += `<g mask="url(#fpFade)">${back}</g>`
  // shadows under the two of them
  s += new Pix().rect(25, 42, 22, 1, '#1d1726').rect(61, 42, 20, 1, '#1d1726').svg()

  // ----- the story timeline (seconds) -----
  // 0.0-2.2  the bridge; Q smug beside Picard, a raised-brow wiggle
  // 2.2-4.0  Q raises a claw and snaps at 2.8: sparkle, smoke, the costume fades in
  // 3.6-10.0 Q dances, maracas on a 1 s beat, notes drifting; Picard's eyes narrow
  // 5.9-7.7  Picard slowly brings his claw to his face
  // 7.7-11.6 the facepalm, held, while Q keeps going and then snaps at 10.6
  // 10.6-11.4 smoke, the costume fades away
  // 11.6-12.9 Picard lowers his claw; 13.0-14.2 the sigh; 14.2- the glare
  const snap1 = 2.8
  const snap2 = 10.6
  const costumeIn = 3.0
  const costumeOut = 10.75
  const snapArm1: [number, number] = [2.4, 3.6]
  const snapArm2: [number, number] = [10.2, 11.3]
  const leftUp: [number, number][] = []
  const rightShake: [number, number][] = []
  const qHops: [number, number][] = []
  for (let t = 3.8; t < 9.9; t += 1.0) {
    leftUp.push([t, t + 0.5])
    rightShake.push([t + 0.5, t + 1.0])
    qHops.push([t, t + 0.2])
  }
  const danceOn: [number, number] = [3.6, 10.2]

  // a warm glow behind Q while the magic is on, fading in and out over a second
  s += `<g opacity="0"><ellipse cx="${35 * Q}" cy="${30 * Q}" rx="44" ry="30" fill="url(#fpMagic)"/>${fpFade([[costumeIn, 0], [costumeIn + 1.2, 1], [costumeOut, 1], [costumeOut + 1.2, 0]])}</g>`

  // ----- Q: smug, captain's red, then mariachi -----
  const qx = 26
  const qy = 28
  const qb = fpBody(FP_Q, qx, qy, 'right')
  // hair
  qb.rect(qx + 1, qy, 16, 1, FP_HAIR).rect(qx + 2, qy - 1, 13, 1, FP_HAIR).set(qx + 4, qy - 1, '#563626').set(qx + 9, qy - 1, '#563626')
  qb.rect(qx, qy + 1, 1, 2, FP_HAIR)
  // pips and combadge
  for (const c of [3, 5, 7, 9]) qb.set(qx + c, qy + 6, '#e8c547')
  qb.rect(qx + 13, qy + 6, 2, 2, '#e8c547').set(qx + 13, qy + 6, '#fff3b0')
  // eyes: the near one wide under a raised brow, the far one half-lidded
  qb.rect(qx + 6, qy + 3, 2, 2, EYE_HD).rect(qx + 12, qy + 2, 2, 3, EYE_HD)
  qb.rect(qx + 5, qy + 2, 3, 1, FP_HAIR)
  // smirk
  qb.rect(qx + 8, qy + 5, 3, 1, '#7a2e1c').set(qx + 11, qy + 4, '#7a2e1c')
  let q = qb.svg()
  // the raised eyebrow, wiggling at the start and again at the end
  const browUp = new Pix().rect(qx + 12, qy + 0, 2, 1, FP_HAIR).set(qx + 11, qy + 1, FP_HAIR).svg()
  const browWig = new Pix().rect(qx + 12, qy + 1, 2, 1, FP_HAIR).svg()
  const wiggle: [number, number][] = [[1.3, 1.65], [15.0, 15.35], [15.75, 16.1]]
  q += shown(browUp, complement(wiggle, T), T) + shown(browWig, wiggle, T)
  // blinks
  const qLids = new Pix().rect(qx + 6, qy + 3, 2, 2, FP_Q.skin).rect(qx + 12, qy + 2, 2, 3, FP_Q.skin).svg()
  q += shown(qLids, [[6.3, 6.45], [13.4, 13.55]], T)

  // mariachi kit: handlebar moustache, sombrero, the two maracas held low;
  // all of it fades in under the first puff of smoke and out under the second
  let kit = ''
  kit += new Pix().rect(qx + 8, qy + 5, 4, 1, FP_Q.skin).set(qx + 11, qy + 4, FP_Q.skin).svg()
  const ms = new Pix()
  ms.rect(qx + 7, qy + 5, 6, 1, '#2a1810').set(qx + 6, qy + 4, '#2a1810').set(qx + 13, qy + 4, '#2a1810').set(qx + 5, qy + 3, '#2a1810').set(qx + 14, qy + 3, '#2a1810')
  ms.rect(qx + 8, qy + 4, 4, 1, '#3d2418')
  kit += ms.svg()
  const hat = new Pix()
  const straw = '#e0bd62'
  const strawL = '#f3d98a'
  const strawS = '#a8843a'
  hat.rect(qx + 6, qy - 8, 6, 1, strawL)
  hat.rect(qx + 5, qy - 7, 8, 2, straw).set(qx + 5, qy - 7, strawL).rect(qx + 12, qy - 7, 1, 2, strawS)
  hat.rect(qx + 4, qy - 5, 10, 2, '#c23a2a')
  for (const c of [5, 8, 11]) hat.set(qx + c, qy - 5, '#3fa35a').set(qx + c + 1, qy - 4, '#f2d04a')
  hat.rect(qx - 5, qy - 3, 28, 1, straw).rect(qx - 6, qy - 4, 2, 1, strawL).rect(qx + 22, qy - 4, 2, 1, strawL)
  hat.rect(qx - 4, qy - 2, 26, 1, strawS).rect(qx - 5, qy - 3, 1, 1, strawL).rect(qx + 22, qy - 3, 1, 1, strawL)
  for (let c = -3; c < 22; c += 3) hat.set(qx + c, qy - 3, '#c23a2a')
  hat.rect(qx + 1, qy - 1, 16, 1, '#2a1c14')
  kit += hat.svg()
  // maracas: up in the raised claw, or held low by the resting one
  const maraca = (cx: number, cy: number, c1: string, c2: string) => {
    const p = new Pix()
    p.rect(cx + 1, cy + 3, 1, 2, '#7a4e2c')
    p.rect(cx, cy, 3, 3, c1).set(cx + 1, cy - 1, c1).set(cx, cy, c2).set(cx + 2, cy + 2, c2).set(cx + 1, cy + 1, '#fff2c0')
    return p.svg()
  }
  const lowMaraca = (cx: number, cy: number, c1: string, c2: string) => {
    const p = new Pix()
    p.rect(cx, cy, 1, 2, '#7a4e2c')
    p.rect(cx - 1, cy + 2, 3, 3, c1).set(cx, cy + 5, c1).set(cx - 1, cy + 2, c2).set(cx + 1, cy + 4, c2).set(cx, cy + 3, '#fff2c0')
    return p.svg()
  }
  // arms go rest -> half-raised -> up (and back) in ~0.09 s steps; the maracas
  // follow the claw through the same three positions
  const qRightUp = merge([snapArm1, snapArm2, ...rightShake])
  const armL = armPhases(leftUp)
  const armR = armPhases(qRightUp)
  kit += shown(lowMaraca(qx - 3, qy + 6, '#e2452e', '#f2d04a'), complement(merge(leftUp), T), T)
  kit += shown(lowMaraca(qx + 20, qy + 6, '#3fa35a', '#f2d04a'), complement(qRightUp, T), T)
  kit += shown(maraca(qx - 8, qy - 8, '#e2452e', '#f2d04a'), armL.mid, T)
  kit += shown(maraca(qx - 4, qy - 13, '#e2452e', '#f2d04a'), armL.up, T)
  kit += shown(maraca(qx + 22, qy - 8, '#3fa35a', '#f2d04a'), armR.mid, T)
  kit += shown(maraca(qx + 19, qy - 13, '#3fa35a', '#f2d04a'), armR.up, T)
  q += `<g opacity="0">${kit}${fpFade([[costumeIn, 0], [costumeIn + 0.5, 1], [costumeOut, 1], [costumeOut + 0.6, 0]])}</g>`
  q += fpLegs(FP_Q, qx, qy)

  // arms: one up for each snap, then left and right in turn on the beat
  q += shown(armRestHD(FP_Q, qx, qy, 'left'), complement(merge(leftUp), T), T)
  q += shown(armRestHD(FP_Q, qx, qy, 'right'), complement(qRightUp, T), T)
  q += shown(armMidHD(FP_Q, qx, qy, 'left'), armL.mid, T)
  q += shown(armMidHD(FP_Q, qx, qy, 'right'), armR.mid, T)
  q += shown(armUpHD(FP_Q, qx, qy, 'left'), armL.up, T)
  q += shown(armUpHD(FP_Q, qx, qy, 'right'), armR.up, T)
  // shake lines beside the raised maraca
  const shake = new Pix().set(qx - 6, qy - 13, '#fff2c0').set(qx - 6, qy - 11, '#fff2c0').set(qx, qy - 13, '#fff2c0')
  q += shown(shake.svg(), leftUp.map(([a, b]) => [a + 0.1, b - 0.1] as [number, number]), T)
  const shakeR = new Pix().set(qx + 23, qy - 13, '#fff2c0').set(qx + 23, qy - 11, '#fff2c0').set(qx + 17, qy - 13, '#fff2c0')
  q += shown(shakeR.svg(), rightShake.map(([a, b]) => [a + 0.1, b - 0.1] as [number, number]), T)
  s += `<g>${q}${hopQ(qHops, T)}</g>`

  // ----- the snaps: a small sparkle and glow at the claw tip, then a puff of smoke -----
  const snapFx = (t: number, smoke: [number, number][]) => {
    let o = ''
    const sx = qx + 20
    const sy = qy - 9
    o += `<g opacity="0"><circle cx="${(sx + 0.5) * Q}" cy="${(sy + 0.5) * Q}" r="12" fill="url(#fpSnapG)"/>${fpSpark(sx, sy, '#ffe08a', true)}${fpFade([[t - 0.45, 0], [t, 1], [t + 0.15, 1], [t + 1.0, 0]])}</g>`
    // a couple of tiny sparks thrown off, drifting and fading
    const bits = new Pix().set(sx - 3, sy - 2, '#ffe08a').set(sx + 3, sy - 3, '#ffe08a').set(sx + 2, sy + 3, '#ffd0a0')
    o += `<g opacity="0">${bits.svg()}${fpFade([[t, 0], [t + 0.3, 0.9], [t + 1.2, 0]])}${fpDrift([[t, 0, 0], [t + 1.2, 0, -6]])}</g>`
    o += `<g opacity="0">${fpSmoke(smoke)}${fpFade([[t + 0.05, 0], [t + 0.5, 0.75], [t + 0.9, 0.7], [t + 1.9, 0]])}${fpDrift([[t, 0, 0], [t + 1.9, 2, -8]])}</g>`
    return o
  }
  const smokePts: [number, number][] = [[qx - 2, qy - 4], [qx + 4, qy - 7], [qx + 10, qy - 8], [qx + 16, qy - 5], [qx + 1, qy + 1], [qx + 13, qy], [qx + 7, qy - 2]]

  // ----- music: notes drifting up, a few sparkles breathing slowly -----
  let fx = ''
  const sparks: [number, number, string, boolean][] = [
    [20, 17, '#ffe08a', true], [48, 15, '#9fe7ff', false], [16, 26, '#ffb8e6', false], [52, 27, '#ffe08a', false], [36, 12, '#ffb8e6', false],
  ]
  sparks.forEach(([x, y, c, b], i) => {
    const per = 2.4 + (i % 3) * 0.5
    fx += `<g opacity="0">${fpSpark(x, y, c, b)}<animate attributeName="opacity" values="0;0.85;0" dur="${per}s" begin="${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></g>`
  })
  const noteCols = ['#ffe08a', '#c9a7ff', '#9fe7ff', '#ffb8e6']
  for (let i = 0; i < 4; i++) {
    const p = new Pix().rows(FP_NOTE, 0, 0, { X: noteCols[i] }).svg()
    const sx = (44 + (i % 2) * 5) * Q
    const sy = (24 - (i % 2) * 3) * Q
    const d = 3.2
    fx += `<g opacity="0"><g transform="translate(${sx} ${sy})">${p}</g><animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 8 : 4} -12;${i % 2 ? 12 : 10} -24" dur="${d}s" begin="${(i * 0.8).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.2;0.7;1" dur="${d}s" begin="${(i * 0.8).toFixed(1)}s" repeatCount="indefinite"/></g>`
  }
  s += `<g opacity="0">${fx}${fpFade([[danceOn[0] - 0.2, 0], [danceOn[0] + 0.6, 1], [danceOn[1] - 0.3, 1], [danceOn[1] + 0.6, 0]])}</g>`

  // ----- Picard -----
  const px0 = 62
  const py0 = 28
  const raiseHalf: [number, number] = [5.9, 6.5]
  const palmOn: [number, number] = [6.5, 12.5]
  const lowerHalf: [number, number] = [12.5, 12.9]
  const hold: [number, number] = [7.7, 11.6]
  const sigh: [number, number] = [13.0, 14.2]
  const pb = fpBody(PICARD_HD, px0, py0, 'left')
  pb.rect(px0 + 12, py0 + 6, 2, 2, '#e8c547').set(px0 + 12, py0 + 6, '#fff3b0')
  pb.set(px0 + 4, py0 + 6, '#e8c547').set(px0 + 6, py0 + 6, '#e8c547').set(px0 + 8, py0 + 6, '#e8c547').set(px0 + 10, py0 + 6, '#e8c547')
  // a highlight on the dome
  pb.rect(px0 + 5, py0, 4, 1, '#fbb898')
  pb.rect(px0 + 4, py0 + 2, 2, 3, EYE_HD).rect(px0 + 10, py0 + 2, 2, 3, EYE_HD)
  let pc = pb.svg()
  // eyes: half-lidded, then narrowed to slits under a lowered brow
  const half = new Pix().rect(px0 + 4, py0 + 2, 2, 1, PICARD_HD.shade).rect(px0 + 10, py0 + 2, 2, 1, PICARD_HD.shade).svg()
  // narrowed: lids down to a slit, brows angled in toward the nose
  const brow = '#7e3622'
  const narrow = new Pix().rect(px0 + 4, py0 + 2, 2, 2, PICARD_HD.skin).rect(px0 + 10, py0 + 2, 2, 2, PICARD_HD.skin)
    .rect(px0 + 4, py0 + 3, 2, 1, PICARD_HD.shade).rect(px0 + 10, py0 + 3, 2, 1, PICARD_HD.shade)
    .rect(px0 + 3, py0 + 1, 2, 1, brow).rect(px0 + 5, py0 + 2, 2, 1, brow)
    .rect(px0 + 11, py0 + 1, 2, 1, brow).rect(px0 + 9, py0 + 2, 2, 1, brow).svg()
  // (the glare softens back to his opening look in the last second, for a seamless restart)
  pc += shown(half, [[4.5, 5.5], [11.6, 13.0], [16.2, 16.55]], T)
  pc += shown(narrow, [[5.5, 7.7], [14.2, 16.2]], T)
  // eyes shut for the sigh, and a blink
  const shut = new Pix().rect(px0 + 4, py0 + 2, 2, 3, PICARD_HD.skin).rect(px0 + 10, py0 + 2, 2, 3, PICARD_HD.skin)
    .rect(px0 + 4, py0 + 4, 2, 1, PICARD_HD.shade).rect(px0 + 10, py0 + 4, 2, 1, PICARD_HD.shade).svg()
  pc += shown(shut, [sigh, [1.8, 1.95], [3.6, 3.75]], T)
  // the facepalm: the far eye squeezed shut, the claw over the near one
  const squeeze = new Pix().rect(px0 + 4, py0 + 2, 2, 3, PICARD_HD.skin).rect(px0 + 3, py0 + 3, 4, 1, PICARD_HD.shade).set(px0 + 3, py0 + 2, PICARD_HD.shade).svg()
  pc += shown(squeeze, [hold], T)
  // the claw lifts in one-pixel steps, cross-fades into the palm over 0.15 s, glides in
  // to the face, rubs the brow twice, glides back out and lowers the same way
  const palmKeys: [number, number, number][] = [
    [0, 6, 1], [6.5, 6, 1], [7.7, 0, 0],
    [8.7, 0, 0], [8.95, -1, 0], [9.35, -1, 0], [9.6, 0, 0],
    [9.95, 0, 0], [10.2, -1, 0], [10.55, -1, 0], [10.8, 0, 0],
    [11.5, 0, 0], [12.4, 6, 1],
  ]
  pc += `<g opacity="0">${fpPalm(px0, py0)}${fpTween(palmKeys)}${fpFade([[6.45, 0], [6.6, 1], [12.4, 1], [12.55, 0]])}</g>`
  const lift: [number, [number, number][]][] = [
    [2, [[5.9, 6.05], [12.8, 12.9]]],
    [3, [[6.05, 6.2], [12.7, 12.8]]],
    [4, [[6.2, 6.35], [12.6, 12.7]]],
  ]
  for (const [h, on] of lift) pc += shown(fpArmHalf(PICARD_HD, px0, py0, h), on, T)
  pc += shown(`<g>${fpArmHalf(PICARD_HD, px0, py0)}${fpFade([[6.45, 1], [6.6, 0], [12.4, 0], [12.55, 1]])}</g>`, [[6.35, 6.6], [12.4, 12.6]], T)
  pc += armRestHD(PICARD_HD, px0, py0, 'left')
  pc += shown(armRestHD(PICARD_HD, px0, py0, 'right'), complement([[5.9, 12.9]], T), T)
  // he sinks a pixel into the facepalm and again into the sigh, easing down and up
  s += `<g>${pc}${fpTween([[7.8, 0, 0], [8.1, 0, 1], [11.45, 0, 1], [11.75, 0, 0], [12.95, 0, 0], [13.25, 0, 1], [13.95, 0, 1], [14.25, 0, 0]])}</g>`
  s += fpLegs(PICARD_HD, px0, py0)
  // the sigh: a soft puff drifting off toward Q and thinning out
  const puff = new Pix().rect(px0 - 4, py0 + 4, 4, 3, '#cfc6dc').rect(px0 - 3, py0 + 3, 2, 1, '#ece6f4').set(px0 - 5, py0 + 5, '#a99fbb').set(px0, py0 + 6, '#a99fbb').svg()
  s += `<g opacity="0">${puff}${fpFade([[13.2, 0], [13.6, 0.8], [14.6, 0]])}${fpDrift([[13.2, 0, 0], [14.6, -14, -6]])}</g>`

  // the snap effects go on top
  s += snapFx(snap1, smokePts)
  s += snapFx(snap2, smokePts)
  return s
}
