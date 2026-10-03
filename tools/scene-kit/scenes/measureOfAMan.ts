// ---------- The Measure of a Man: "Does Data have a soul?" ----------
// The hearing room on Starbase 173. Captain Louvois (JAG) at the raised bench under
// the Federation emblem, Data seated in the witness chair, Picard (Clawd) at the defence chair.
// One 17.17 s story, played once:
//  0.0 - 2.0  calm: everyone seated, Louvois looks out over the room
//  2.0 - 4.4  Picard rises and walks out to the middle of the floor
//  4.4 - 8.6  he makes his case: points a claw at Data, paces, looks up at the
//             bench, then both claws up ("there it sits!")
//  8.6 - 10.8 the ruling: Louvois raises her gavel and taps it twice
// 10.8 - 14.8 Data stands, free, walks over; he and Picard shake claws
// 14.8 - 17.17 each goes back and sits down again: the opening shot

const MM_T = SCENE_SECONDS

const MM_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f6a77c',
}

// Data: pale gold skin, operations gold uniform
const MM_DATA: CrabHD = {
  skin: '#e9dfbf',
  light: '#f7f0d8',
  shade: '#bfb38c',
  upper: '#1c1424',
  lower: '#c99a22',
  lowerShade: '#9a7414',
  legs: '#1c1424',
  rim: '#fff6dc',
}

// Captain Phillipa Louvois
const MM_LOU: CrabHD = {
  skin: '#dc9a7a',
  light: '#eeb496',
  shade: '#b0765a',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f4c0a2',
}

type MmGaze = 'l' | 'r' | 'c' | 'ul' | 'ur' | 'd' | 'dl'
// an arm move: held between t0 and t1, reached through its in-between sprites
type MmArm = 'point' | 'up' | 'reach'

const MM_EASE = '0.4 0 0.2 1'
const MM_STEP = 0.09 // one in-between frame of an arm move

const mmKt = (ts: number[]) => ts.map(t => +(t / MM_T).toFixed(5)).join(';')

// a smooth eased move on the story timeline: [t, x, y] in art px; held flat between keys
function mmTrack(pts: [number, number, number][], spline = MM_EASE) {
  const list = [...pts]
  if (list[0][0] > 0) list.unshift([0, list[0][1], list[0][2]])
  const last = list[list.length - 1]
  if (last[0] < MM_T) list.push([MM_T, last[1], last[2]])
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${MM_T}s" repeatCount="indefinite" values="${list.map(p => `${+(p[1] * Q).toFixed(2)} ${+(p[2] * Q).toFixed(2)}`).join(';')}" keyTimes="${mmKt(list.map(p => p[0]))}" keySplines="${list.slice(1).map(() => spline).join(';')}"/>`
}

// a gentle up-and-down on every step of a walk (amp in art px, phase 0 or 0.5 of a step)
function mmBob(walks: [number, number, number][], amp: number, phase: number) {
  const pts: [number, number, number][] = [[0, 0, 0]]
  for (const [a, b, step] of walks) {
    for (let t = a + phase * step; t + step <= b + 0.001; t += step) {
      pts.push([+t.toFixed(3), 0, 0], [+(t + step / 2).toFixed(3), 0, -amp], [+(t + step).toFixed(3), 0, 0])
    }
  }
  return mmTrack(pts, '0.45 0 0.55 1')
}

function mmInter(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = []
  for (const [a0, a1] of a) for (const [b0, b1] of b) {
    const lo = Math.max(a0, b0)
    const hi = Math.min(a1, b1)
    if (hi > lo) out.push([lo, hi])
  }
  return out
}

// claw a little way out and up: the first in-between from rest
function mmArmLow(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const r = side === 'right'
  const sx = r ? x + 18 : x - 3
  p.rect(sx, y + 4, 3, 2, k.skin).rect(sx, y + 6, 3, 1, k.shade)
  const ax = r ? x + 21 : x - 5
  p.rect(ax, y + 2, 2, 3, k.skin)
  const cx = r ? x + 21 : x - 6
  p.rect(cx, y, 1, 2, k.skin).rect(cx + 3, y, 1, 2, k.skin).rect(cx, y + 1, 4, 1, k.skin)
  p.set(cx, y, k.light).set(cx + 3, y, k.light)
  return p.svg()
}

// arm half out to the side: the in-between of the handshake
function mmArmOut(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const r = side === 'right'
  const base = r ? x + 18 : x - 3
  p.rect(base, y + 4, 3, 2, k.skin).rect(base, y + 6, 3, 1, k.shade)
  const cx = r ? x + 21 : x - 4
  p.set(cx, y + 3, k.light).set(cx, y + 6, k.skin).rect(cx, y + 4, 1, 2, k.skin)
  return p.svg()
}

// arm straight out to the side, claw open: for the handshake
function mmArmReach(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const s = side === 'right' ? 1 : -1
  const base = side === 'right' ? x + 18 : x - 1
  for (let i = 0; i < 4; i++) {
    p.set(base + s * i, y + 4, k.skin).set(base + s * i, y + 5, k.skin).set(base + s * i, y + 6, k.shade)
  }
  const cx = base + s * 4
  p.rect(Math.min(cx, cx + s), y + 3, 2, 1, k.skin).set(cx + s, y + 3, k.light)
  p.set(cx, y + 4, k.skin).set(cx, y + 5, k.skin)
  p.rect(Math.min(cx, cx + s), y + 6, 2, 1, k.skin).set(cx + s, y + 6, k.shade)
  return p.svg()
}

// each move's sprites in order out from rest: [in-betweens..., held pose]
function mmChain(k: CrabHD, x: number, y: number, side: Side, pose: MmArm) {
  if (pose === 'reach') return [mmArmOut(k, x, y, side), mmArmReach(k, x, y, side)]
  if (pose === 'point') return [mmArmLow(k, x, y, side), armMidHD(k, x, y, side)]
  return [mmArmLow(k, x, y, side), armMidHD(k, x, y, side), armUpHD(k, x, y, side)]
}

// show a chain of sprites on the way out of rest, hold the last, and come back the same way
function mmMove(chain: string[], w: [number, number][]) {
  const per: [number, number][][] = chain.map(() => [])
  for (const [a, b] of w) {
    const n = chain.length
    const st = Math.min(MM_STEP, (b - a) / (2 * n))
    for (let i = 0; i < n - 1; i++) {
      per[i].push([a + i * st, a + (i + 1) * st], [b - (i + 1) * st, b - i * st])
    }
    per[n - 1].push([a + (n - 1) * st, b - (n - 1) * st])
  }
  return chain.map((c, i) => shown(c, per[i], MM_T)).join('')
}

// Clawd's body with no eyes and no legs (those go on the timeline)
function mmBody(k: CrabHD, x: number, y: number, rimSide: Side) {
  const p = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = j === 0 ? k.light : k.skin
    if (j >= 6) c = j < 8 ? k.upper! : k.lower!
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, c)
  }
  const far = rimSide === 'right' ? x : x + 17
  const near = rimSide === 'right' ? x + 17 : x
  p.rect(far, y + 1, 1, 5, k.shade)
  p.rect(near, y + 1, 1, 5, k.rim)
  p.set(far, y + 8, k.lowerShade!)
  return p
}

type MmChar = {
  k: CrabHD
  x: number
  y: number
  rim: Side
  slide: [number, number, number][] // [t, x, 0]: across the floor
  lift: [number, number, number][] // [t, 0, y]: seated (2) or standing (0), hops (-1)
  walks: [number, number, number][] // [start, end, step seconds]
  gaze: [number, number, MmGaze][]
  blinks: [number, number][]
  arms: { left: [number, number, MmArm][]; right: [number, number, MmArm][] }
  details: (p: Pix) => void
  eye?: (p: Pix, ex: number, ey: number, g: MmGaze) => void
}

const mmEyeX = (g: MmGaze) => (g === 'l' || g === 'ul' || g === 'dl' ? [4, 10] : g === 'r' || g === 'ur' ? [6, 12] : [5, 11])
const mmEyeY = (g: MmGaze) => (g === 'ul' || g === 'ur' ? 1 : g === 'd' || g === 'dl' ? 3 : 2)

function mmChar(o: MmChar) {
  const { k, x, y } = o
  // shadow and legs stay on the floor; the body slides down over the legs to sit
  let floor = `<ellipse cx="${(x + 9) * Q}" cy="${42 * Q}" rx="18" ry="2" fill="#0c0e16" opacity="0.6"/>`
  for (const [pair, phase] of [[[1, 11], 0], [[5, 15], 0.5]] as [number[], number][]) {
    const lp = new Pix()
    for (const lx of pair) lp.rect(x + lx, y + 10, 2, 4, k.legs).set(x + lx + 1, y + 10, '#2c2236')
    floor += `<g>${lp.svg()}${mmBob(o.walks, 0.75, phase)}</g>`
  }
  const body = mmBody(k, x, y, o.rim)
  o.details(body)
  let s = body.svg()
  // arms
  for (const side of ['left', 'right'] as Side[]) {
    const list = o.arms[side]
    const busy = merge(list.map(a => [a[0], a[1]] as [number, number]))
    s += shown(armRestHD(k, x, y, side), complement(busy, MM_T), MM_T)
    for (const pose of ['point', 'up', 'reach'] as MmArm[]) {
      const w = list.filter(a => a[2] === pose).map(a => [a[0], a[1]] as [number, number])
      if (w.length) s += mmMove(mmChain(k, x, y, side, pose), w)
    }
  }
  // eyes: one sprite per gaze, closed during blinks
  const open = complement(merge(o.blinks), MM_T)
  const byGaze = new Map<MmGaze, [number, number][]>()
  for (const [a, b, g] of o.gaze) {
    if (!byGaze.has(g)) byGaze.set(g, [])
    byGaze.get(g)!.push([a, b])
  }
  for (const [g, w] of byGaze) {
    const e = new Pix()
    for (const ex of mmEyeX(g)) {
      if (o.eye) o.eye(e, x + ex, y + mmEyeY(g), g)
      else e.rect(x + ex, y + mmEyeY(g), 2, 3, EYE_HD)
    }
    s += shown(e.svg(), mmInter(merge(w), open), MM_T)
    const shut = new Pix()
    for (const ex of mmEyeX(g)) shut.rect(x + ex, y + 4, 2, 1, o.eye ? '#6a5a2a' : EYE_HD)
    const bw = mmInter(merge(w), merge(o.blinks))
    if (bw.length) s += shown(shut.svg(), bw, MM_T)
  }
  const bodyG = `<g><g>${s}${mmBob(o.walks, 0.5, 0.25)}</g>${mmTrack(o.lift)}</g>`
  return `<g>${floor}${bodyG}${mmTrack(o.slide)}</g>`
}

function measureOfAMan() {
  const T = MM_T
  const W = GW * Q
  const H = GH * Q
  let seed = 173
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let s = `<defs>
    <linearGradient id="mmFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="mmFade"><rect width="${W}" height="${H}" fill="url(#mmFadeG)"/></mask>
    <radialGradient id="mmPool"><stop offset="0" stop-color="#cfd8ff" stop-opacity="0.16"/><stop offset="1" stop-color="#cfd8ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="mmLamp"><stop offset="0" stop-color="#e8eeff" stop-opacity="0.3"/><stop offset="1" stop-color="#e8eeff" stop-opacity="0"/></radialGradient>
    <radialGradient id="mmBlue"><stop offset="0" stop-color="#5a8ae0" stop-opacity="0.3"/><stop offset="1" stop-color="#5a8ae0" stop-opacity="0"/></radialGradient>
    <linearGradient id="mmShadeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10131e" stop-opacity="0"/><stop offset="1" stop-color="#10131e" stop-opacity="0.5"/></linearGradient>
  </defs>`

  // ---- the room: Starfleet grey-blue panelling, faded in from the left ----
  // big plain areas as single rects, details as pixels on top
  let base = ''
  const vr = (x: number, y: number, w: number, h: number, c: string) =>
    (base += `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`)
  const room = new Pix()
  // ceiling and a long light strip
  vr(0, 0, GW, 3, '#12151f')
  vr(0, 1, GW, 1, '#3c4560')
  vr(0, 2, GW, 1, '#1c2130')
  for (let c = 2; c < GW; c += 8) room.rect(c, 1, 5, 1, '#8e9ac0').set(c + 2, 1, '#c8d2f0')
  // wall with faint panel seams
  vr(0, 3, GW, 19, '#262c3e')
  for (let r = 6; r < 22; r += 5) vr(0, r, GW, 1, '#2b3246')
  // wainscot and rail
  vr(0, 22, GW, 7, '#2f3549')
  vr(0, 22, GW, 1, '#58628a')
  vr(0, 23, GW, 1, '#3a4260')
  for (let c = 3; c < GW; c += 6) vr(c, 24, 1, 5, '#283044')
  // pilasters
  for (const px of [18, 37, 64, 88]) {
    vr(px, 3, 2, 26, '#363e58')
    vr(px, 3, 1, 26, '#4a5476')
    vr(px - 1, 3, 4, 1, '#4a5476')
    vr(px - 1, 21, 4, 1, '#4a5476')
  }
  // two tall viewports onto space
  const mull: [number, number, number][] = []
  const win = (x0: number, x1: number, y0: number, y1: number) => {
    vr(x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3, '#4a5476')
    vr(x0 - 1, y1 + 1, x1 - x0 + 3, 1, '#5e6a94')
    vr(x0, y0, x1 - x0 + 1, y1 - y0 + 1, '#080a16')
    vr(x0, y0, x1 - x0 + 1, 1, '#0e1226')
    for (let i = 0; i < (x1 - x0) * (y1 - y0) / 12; i++) {
      const sx = x0 + Math.floor(rnd() * (x1 - x0 + 1))
      const sy = y0 + 1 + Math.floor(rnd() * (y1 - y0))
      room.set(sx, sy, rnd() < 0.5 ? '#3c4468' : '#6a7298')
    }
    mull.push([Math.floor((x0 + x1) / 2), y0, y1 - y0 + 1])
  }
  win(22, 34, 5, 17)
  win(68, 85, 5, 17)
  // a planet's limb in the right viewport
  for (let yy = 5; yy <= 17; yy++) {
    for (let xx = 68; xx <= 85; xx++) {
      const d = Math.hypot(xx - 90, yy - 22)
      if (d < 11) room.set(xx, yy, d > 10 ? '#7aa8e0' : d > 9 ? '#3e6aa8' : '#2a4678')
    }
  }
  for (const [x, y, h] of mull) room.rect(x, y, 1, h, '#3a4262')
  // a small LCARS panel on the left wall
  room.rect(3, 8, 11, 8, '#11141e').rect(4, 9, 3, 2, '#e09a4a').rect(8, 9, 5, 1, '#9a8ad0').rect(8, 11, 4, 1, '#c86a5a')
  room.rect(4, 12, 3, 3, '#9a8ad0').rect(8, 13, 5, 1, '#e0b05a').rect(8, 14, 3, 1, '#6a7ab0')
  // the floor: dark carpet with seams
  vr(0, 29, GW, 19, '#1c2131')
  vr(0, 29, GW, 1, '#141824')
  for (let r = 31; r < 48; r += 3) vr(0, r, GW, 1, '#20263a')
  for (let i = 0; i < 18; i++) room.set(Math.floor(rnd() * GW), 30 + Math.floor(rnd() * 18), rnd() < 0.5 ? '#232a3f' : '#171b28')
  // the defence table (mostly in the faded edge): PADDs and a glass of water
  room.rect(1, 33, 19, 1, '#6a7290').rect(1, 34, 19, 1, '#4a5270').rect(2, 35, 17, 5, '#2a3045')
  room.rect(2, 35, 17, 1, '#363e58').rect(3, 40, 2, 2, '#2a3045').rect(16, 40, 2, 2, '#2a3045')
  room.rect(9, 32, 4, 1, '#8a96b8').set(10, 32, '#c0ccec').rect(14, 31, 1, 2, '#9ab8d8').set(14, 31, '#d8ecff')
  s += `<g mask="url(#mmFade)">${base}${room.svg()}`
  // stars in the viewports, a few twinkling slowly
  ;[[25, 8], [31, 13], [71, 7], [80, 9], [27, 15]].forEach(([x, y], i) => {
    s += `<g>${new Pix().set(x, y, '#e8ecff').svg()}<animate attributeName="opacity" values="0.35;0.9;0.35" dur="${+(T / [5, 4, 3, 5, 4][i]).toFixed(4)}s" begin="-${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></g>`
  })
  // LCARS lights breathing gently
  s += `<g>${new Pix().rect(4, 9, 3, 2, '#ffc070').svg()}<animate attributeName="opacity" values="0.2;0.7;0.2" dur="${+(T / 4).toFixed(4)}s" repeatCount="indefinite"/></g>`
  s += `</g>`
  s += `<ellipse cx="${78 * Q}" cy="${18 * Q}" rx="26" ry="16" fill="url(#mmBlue)"/>`

  // ---- the Federation banner behind the bench ----
  const ban = new Pix()
  ban.rect(45, 3, 11, 9, '#1c2a5a').rect(45, 3, 11, 1, '#2a3a74').rect(45, 3, 1, 9, '#2a3a74').rect(55, 3, 1, 9, '#141e44')
  ban.rect(44, 2, 13, 1, '#8a96b8')
  // the UFP emblem: a blue disc of stars inside a wreath of laurels
  ban.rect(49, 5, 3, 1, '#2f4c9a').rect(48, 6, 5, 3, '#2f4c9a').rect(49, 9, 3, 1, '#2f4c9a')
  ban.set(50, 6, '#f2f4ff').set(49, 8, '#f2f4ff').set(51, 8, '#f2f4ff').set(50, 7, '#9aaee8').set(48, 7, '#3e5cb0')
  const leaf = [[-3, -2], [-4, -1], [-4, 0], [-4, 1], [-3, 2], [-2, 3]]
  leaf.forEach(([dx, dy], i) => {
    const c = i % 2 ? '#9aa4c8' : '#d8def0'
    ban.set(50 + dx, 7 + dy, c).set(50 - dx, 7 + dy, c)
  })
  ban.rect(44, 12, 13, 1, '#8a96b8')
  s += ban.svg()

  // soft light pooled on the bench and the floor
  s += `<ellipse cx="${51 * Q}" cy="${10 * Q}" rx="34" ry="18" fill="url(#mmLamp)"/>`
  s += `<ellipse cx="${50 * Q}" cy="${38 * Q}" rx="70" ry="14" fill="url(#mmPool)"/>`

  // ---- the two chairs ----
  const chair = (cx: number) => {
    const p = new Pix()
    p.rect(cx + 2, 24, 14, 14, '#4a4462').rect(cx + 3, 23, 12, 1, '#7a7098').rect(cx + 2, 24, 14, 1, '#6a6288').rect(cx + 2, 24, 1, 14, '#5e5880').rect(cx + 15, 24, 1, 14, '#2e2a40')
    p.rect(cx + 4, 26, 10, 10, '#55507a')
    p.rect(cx + 1, 37, 16, 2, '#4a4260').rect(cx + 1, 37, 16, 1, '#6a6084')
    p.rect(cx + 8, 39, 2, 2, '#2a2436').rect(cx + 5, 41, 8, 1, '#2a2436')
    return p.svg()
  }
  const PX = 24
  const DX = 67
  s += chair(PX) + chair(DX)

  // ---- Captain Louvois at the bench ----
  const LX = 42
  const LY = 11
  const lou = new Pix()
  for (let j = 0; j < 9; j++) {
    const inset = j === 0 ? 1 : 0
    let c = j === 0 ? MM_LOU.light : MM_LOU.skin
    if (j === 6) c = MM_LOU.upper!
    if (j >= 7) c = MM_LOU.lower!
    lou.rect(LX + inset, LY + j, 18 - 2 * inset, 1, c)
  }
  lou.rect(LX, LY + 1, 1, 5, MM_LOU.shade).rect(LX + 17, LY + 1, 1, 5, MM_LOU.shade)
  // auburn hair: a soft bob framing the face
  lou.rect(LX + 1, LY - 1, 16, 1, '#7a3a22').rect(LX + 4, LY - 1, 6, 1, '#a0522e')
  lou.rect(LX, LY, 18, 1, '#6a321e').rect(LX + 3, LY, 5, 1, '#8e4a2a')
  lou.rect(LX - 1, LY + 1, 3, 5, '#6a321e').rect(LX + 16, LY + 1, 3, 5, '#5a2a1a').set(LX - 1, LY + 1, '#8e4a2a')
  lou.set(LX + 2, LY + 1, '#6a321e').set(LX + 15, LY + 1, '#5a2a1a')
  lou.set(LX + 13, LY + 7, '#e8c547').set(LX + 14, LY + 7, '#e8c547')
  // a slight smile
  lou.rect(LX + 8, LY + 5, 2, 1, MM_LOU.shade)
  s += lou.svg()
  const louEyes = (g: MmGaze) => {
    const e = new Pix()
    for (const ex of mmEyeX(g)) e.rect(LX + ex, LY + mmEyeY(g), 2, 2, EYE_HD).set(LX + ex, LY + mmEyeY(g), '#3a2a2a')
    return e.svg()
  }
  const louShut = new Pix().rect(LX + 5, LY + 3, 2, 1, EYE_HD).rect(LX + 11, LY + 3, 2, 1, EYE_HD).svg()
  const louGaze: [number, number, MmGaze][] = [[0, 4.4, 'c'], [4.4, 8.6, 'dl'], [8.6, 12.8, 'c'], [12.8, 14.8, 'd'], [14.8, T, 'c']]
  const louBlinks: [number, number][] = [[2.6, 2.75], [7.6, 7.75], [11.9, 12.05], [15.8, 15.95]]
  const louOpen = complement(louBlinks, T)
  for (const g of ['c', 'dl', 'd'] as MmGaze[]) {
    const w = louGaze.filter(z => z[2] === g).map(z => [z[0], z[1]] as [number, number])
    s += shown(louEyes(g), mmInter(w, louOpen), T)
  }
  s += shown(louShut, louBlinks, T)

  // the bench
  const bench = new Pix()
  bench.rect(36, 19, 30, 1, '#a8b0cc').rect(36, 20, 30, 1, '#6e7898')
  bench.rect(37, 21, 28, 6, '#363e58').rect(37, 21, 1, 6, '#4a5476').rect(64, 21, 1, 6, '#262c40')
  for (const bx of [44, 57]) bench.rect(bx, 21, 1, 6, '#2a3046')
  bench.rect(38, 22, 5, 1, '#e09a4a').rect(59, 22, 5, 1, '#9a8ad0')
  // the emblem plate on the front
  bench.rect(48, 22, 5, 4, '#1c2a5a').rect(48, 22, 5, 1, '#c9a840').rect(48, 25, 5, 1, '#8a7430')
  bench.set(50, 23, '#f2f4ff').set(49, 24, '#c8d0e8').set(51, 24, '#c8d0e8')
  bench.rect(35, 27, 32, 2, '#262c3e').rect(35, 27, 32, 1, '#4a5476')
  // the sound block and a stack of PADDs
  bench.rect(62, 18, 4, 1, '#6a4a2a').set(62, 18, '#9a6a3a')
  bench.rect(38, 18, 4, 1, '#8a96b8').set(39, 18, '#c0ccec')
  s += bench.svg()

  // her claws on the bench: the left at rest, the right with the gavel
  s += new Pix().rect(LX - 3, LY + 6, 3, 2, MM_LOU.skin).set(LX - 3, LY + 6, MM_LOU.light).svg()
  const gavelRest = new Pix()
  gavelRest.rect(LX + 18, LY + 5, 2, 2, MM_LOU.skin).set(LX + 19, LY + 5, MM_LOU.light)
  gavelRest.rect(LX + 20, LY + 5, 2, 1, '#9a6a3a')
  gavelRest.rect(LX + 21, LY + 4, 2, 3, '#5a3a22').set(LX + 21, LY + 4, '#8a5a32').set(LX + 22, LY + 6, '#3a2414')
  const gavelUp = new Pix()
  gavelUp.rect(LX + 18, LY + 5, 2, 2, MM_LOU.skin)
  gavelUp.rect(LX + 19, LY + 1, 2, 4, MM_LOU.skin).set(LX + 20, LY + 1, MM_LOU.shade).set(LX + 20, LY + 2, MM_LOU.shade)
  gavelUp.rect(LX + 19, LY, 2, 1, MM_LOU.light)
  gavelUp.rect(LX + 21, LY, 2, 1, '#9a6a3a')
  gavelUp.rect(LX + 22, LY - 2, 2, 3, '#5a3a22').set(LX + 22, LY - 2, '#8a5a32').set(LX + 23, LY, '#3a2414')
  // half-way up: the claw lifted, the gavel tilted
  const gavelMid = new Pix()
  gavelMid.rect(LX + 18, LY + 5, 2, 2, MM_LOU.skin)
  gavelMid.rect(LX + 19, LY + 3, 2, 2, MM_LOU.skin).set(LX + 20, LY + 3, MM_LOU.light)
  gavelMid.rect(LX + 21, LY + 3, 1, 1, '#9a6a3a')
  gavelMid.rect(LX + 22, LY + 1, 2, 3, '#5a3a22').set(LX + 22, LY + 1, '#8a5a32').set(LX + 23, LY + 3, '#3a2414')
  const ups: [number, number][] = [[8.9, 9.45], [9.65, 10.2]]
  s += mmMove([gavelMid.svg(), gavelUp.svg()], ups)
  s += shown(gavelRest.svg(), complement(ups, T), T)
  // two small soft marks where the gavel lands
  const tap = new Pix().set(LX + 20, LY + 3, '#b8c0d8').set(LX + 24, LY + 3, '#b8c0d8').set(LX + 19, LY + 4, '#8a92b0').set(LX + 25, LY + 4, '#8a92b0')
  {
    const ts = [0, 9.45, 9.52, 9.85, 10.2, 10.27, 10.6, T]
    const vs = [0, 0, 0.85, 0, 0, 0.85, 0, 0]
    s += `<g opacity="0">${tap.svg()}<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="${vs.join(';')}" keyTimes="${mmKt(ts)}"/></g>`
  }

  // ---- Picard: rises, crosses the floor, argues, shakes Data's claw, goes back ----
  s += mmChar({
    k: MM_PICARD,
    x: PX,
    y: 28,
    rim: 'right',
    slide: [[2.4, 0, 0], [4.4, 10, 0], [6.1, 10, 0], [6.7, 8, 0], [6.9, 8, 0], [7.5, 10, 0], [14.9, 10, 0], [16.4, 0, 0]],
    lift: [[2.0, 0, 2], [2.45, 0, 0], [13.65, 0, 0], [13.85, 0, -1], [14.05, 0, 0], [16.4, 0, 0], [16.85, 0, 2]],
    walks: [[2.4, 4.4, 0.4], [6.1, 6.7, 0.3], [6.9, 7.5, 0.3], [14.9, 16.4, 0.3]],
    gaze: [[0, 4.6, 'r'], [4.6, 6.0, 'ur'], [6.0, 6.1, 'c'], [6.1, 6.9, 'l'], [6.9, 7.0, 'c'], [7.0, 10.8, 'ur'], [10.8, 14.8, 'r'], [14.8, 14.9, 'c'], [14.9, 16.4, 'l'], [16.4, 16.5, 'c'], [16.5, T, 'r']],
    blinks: [[1.2, 1.35], [5.4, 5.55], [10.3, 10.45], [12.4, 12.55]],
    arms: {
      left: [[7.2, 8.6, 'up']],
      right: [[4.6, 6.0, 'point'], [7.2, 8.6, 'up'], [12.8, 14.8, 'reach']],
    },
    details: p => {
      // grey fringe at the temples, a shine on the crown
      p.rect(PX, 30, 1, 3, '#a8a4a0').set(PX + 1, 31, '#8e8a86').rect(PX + 17, 30, 1, 3, '#c4c0ba').set(PX + 16, 31, '#a8a4a0')
      p.rect(PX + 5, 28, 3, 1, '#f6b090')
      // combadge and collar pips
      p.rect(PX + 12, 34, 2, 2, '#e8c547').set(PX + 12, 34, '#fff3b0')
      for (const c of [3, 5, 7]) p.set(PX + c, 34, '#e8c547')
    },
  })

  // ---- Data: waits in the witness chair, stands free, comes to shake Picard's claw ----
  s += mmChar({
    k: MM_DATA,
    x: DX,
    y: 28,
    rim: 'left',
    slide: [[11.4, 0, 0], [12.7, -5, 0], [15.0, -5, 0], [16.1, 0, 0]],
    lift: [[11.0, 0, 2], [11.45, 0, 0], [16.1, 0, 0], [16.55, 0, 2]],
    walks: [[11.4, 12.7, 0.325], [15.0, 16.1, 0.275]],
    gaze: [[0, 2.0, 'c'], [2.0, 8.6, 'l'], [8.6, 10.8, 'ul'], [10.8, 14.8, 'l'], [14.8, 14.9, 'c'], [14.9, 16.3, 'r'], [16.3, T, 'c']],
    blinks: [[3.6, 3.72], [9.9, 10.02], [15.5, 15.62]],
    arms: { left: [[12.8, 14.8, 'reach']], right: [] },
    eye: (p, ex, ey, g) => {
      p.rect(ex, ey, 2, 3, '#e8b818').set(ex, ey, '#f6d84a').set(ex + 1, ey, '#f6d84a')
      const px = g === 'l' || g === 'ul' || g === 'dl' ? ex : g === 'r' || g === 'ur' ? ex + 1 : ex === DX + 5 ? ex + 1 : ex
      p.rect(px, ey + 1, 1, 2, '#3a2a08')
    },
    details: p => {
      // black hair slicked back, a widow's peak
      p.rect(DX + 1, 27, 16, 1, '#141018').rect(DX + 5, 27, 6, 1, '#2e2a3a')
      p.rect(DX, 28, 18, 1, '#141018').rect(DX + 3, 28, 4, 1, '#3a3448').rect(DX + 8, 29, 2, 1, '#141018')
      p.set(DX, 29, '#141018').set(DX + 17, 29, '#141018')
      // combadge, and two full pips and a hollow one on the collar
      p.rect(DX + 4, 34, 2, 2, '#e8c547').set(DX + 4, 34, '#fff3b0')
      p.set(DX + 10, 34, '#e8c547').set(DX + 12, 34, '#e8c547').set(DX + 14, 34, '#7a6a2a')
    },
  })
  // keep the title corner quiet
  s += `<rect x="0" y="${40 * Q}" width="${36 * Q}" height="${8 * Q}" fill="url(#mmShadeG)"/>`
  return s
}
