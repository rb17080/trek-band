import { atom, read, update } from 'claude-code'
import type { EngineInterface as Host, Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'trek-band', key: 'limits' } as const, [])
const scene = atom({ plugin: 'trek-band', key: 'scene' } as const, 0)
const isPaused = atom({ plugin: 'trek-band', key: 'isPaused' } as const, false)
// Bumped every second; only the coloured cache timer in the footer reads it, so only that redraws
const tick = atom({ plugin: 'trek-band', key: 'tick' } as const, 0)
// When the last message (yours or Claude's) landed; kept in session state so a reload of the
// mod doesn't wipe it and hide the cache timer until the next message
const lastMessage = atom({ plugin: 'trek-band', key: 'lastMessage' } as const, 0)

// Lilac palette
const C = {
  bg: '#2a1f3d',
  border: '#352850',
  track: '#3d2d58',
  ring: '#c9a7ff',
  warn: '#f2b866',
  hot: '#ff6b81',
  text: '#f3ecff',
  dim: '#a995c9',
}

// ---------- timing helpers ----------

// One play of a scene's story; every scene is timed to exactly this
const SCENE_SECONDS = 17.17
// How many times a scene plays before the next one
const ROUNDS = 2

// Discrete on/off over a loop: visible inside each [start, end) window (seconds)
function windows(on: [number, number][], dur: number) {
  const times = [0]
  const vals = [on.length && on[0][0] === 0 ? 1 : 0]
  for (const [a, b] of on) {
    if (a > 0) times.push(a / dur), vals.push(1)
    if (b < dur) times.push(b / dur), vals.push(0)
  }
  return `<animate attributeName="opacity" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}"/>`
}

function complement(on: [number, number][], dur: number): [number, number][] {
  const out: [number, number][] = []
  let t = 0
  for (const [a, b] of on) {
    if (a > t) out.push([t, a])
    t = b
  }
  if (t < dur) out.push([t, dur])
  return out
}

// ---------- high-detail art: 2px pixels on a 90 x 48 grid ----------

const Q = 2 // one art pixel, in CSS pixels
const GW = 90 // grid width (180px)
const GH = 48 // grid height (96px)

// A layer of art pixels, written out as one rect per horizontal run of a colour
class Pix {
  private m = new Map<number, Map<number, string>>()
  set(x: number, y: number, c: string) {
    let row = this.m.get(y)
    if (!row) this.m.set(y, (row = new Map()))
    row.set(x, c)
    return this
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
    return this
  }
  rows(list: string[], x: number, y: number, pal: Record<string, string>) {
    list.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (pal[row[i]]) this.set(x + i, y + j, pal[row[i]])
    })
    return this
  }
  svg() {
    let out = ''
    for (const [y, row] of this.m) {
      const xs = [...row.keys()].sort((a, b) => a - b)
      let start = xs[0]
      let prev = xs[0]
      let c = row.get(start)!
      const flush = () => (out += `<rect x="${start * Q}" y="${y * Q}" width="${(prev - start + 1) * Q}" height="${Q}" fill="${c}"/>`)
      for (const x of xs.slice(1)) {
        const cx = row.get(x)!
        if (x === prev + 1 && cx === c) {
          prev = x
          continue
        }
        flush()
        start = prev = x
        c = cx
      }
      if (xs.length) flush()
    }
    return out
  }
}

function merge(list: [number, number][]): [number, number][] {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1])
    else out.push([w[0], w[1]])
  }
  return out
}

const shown = (svg: string, on: [number, number][], dur: number) => `<g>${svg}${windows(merge(on), dur)}</g>`

function hopQ(on: [number, number][], dur: number) {
  const times = [0]
  const vals = ['0 0']
  for (const [a, b] of on) {
    times.push(a / dur), vals.push(`0 ${-2 * Q}`)
    times.push(b / dur), vals.push('0 0')
  }
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}"/>`
}

type Side = 'left' | 'right'

type CrabHD = {
  skin: string
  light: string
  shade: string
  upper?: string // shoulders / top of the outfit
  lower?: string
  lowerShade?: string
  legs: string
  rim: string // firelight on the side facing the fire
}

const EYE_HD = '#1a1020'

// Clawd: an 18 x 10 body with rounded corners, four legs, eyes looking one way
function clawdBody(k: CrabHD, x: number, y: number, look: Side) {
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
  for (const lx of [1, 5, 11, 15]) p.rect(x + lx, y + 10, 2, 4, k.legs)
  const ex = look === 'left' ? [4, 10] : [6, 12]
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, EYE_HD))
  return { p, ex }
}

function armRestHD(k: CrabHD, x: number, y: number, side: Side) {
  const ax = side === 'left' ? x - 3 : x + 18
  return new Pix().rect(ax, y + 4, 3, 2, k.skin).rect(ax, y + 6, 3, 1, k.shade).svg()
}

function armUpHD(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const ax = side === 'left' ? x - 3 : x + 19
  p.rect(side === 'left' ? x - 3 : x + 18, y + 4, 3, 2, k.skin)
  p.rect(ax, y - 4, 2, 8, k.skin)
  p.rect(side === 'left' ? ax : ax + 1, y - 4, 1, 8, k.shade)
  const cx = side === 'left' ? x - 4 : x + 18
  p.rect(cx, y - 8, 1, 3, k.skin).rect(cx + 3, y - 8, 1, 3, k.skin)
  p.rect(cx, y - 6, 4, 1, k.skin).rect(cx + 1, y - 5, 2, 1, k.skin)
  p.set(cx, y - 8, k.light).set(cx + 3, y - 8, k.light)
  return p.svg()
}

type Pose = { left: [number, number][]; right: [number, number][] }

function crabHD(
  k: CrabHD,
  x: number,
  y: number,
  look: Side,
  dur: number,
  pose: Pose,
  hops: [number, number][],
  blinkEvery: number,
  details: (p: Pix) => void,
) {
  const { p, ex } = clawdBody(k, x, y, look)
  details(p)
  let s = p.svg()
  s += shown(armRestHD(k, x, y, 'left'), complement(merge(pose.left), dur), dur)
  s += shown(armRestHD(k, x, y, 'right'), complement(merge(pose.right), dur), dur)
  if (pose.left.length) s += shown(armUpHD(k, x, y, 'left'), pose.left, dur)
  if (pose.right.length) s += shown(armUpHD(k, x, y, 'right'), pose.right, dur)
  const lids = new Pix()
  ex.forEach(e => lids.rect(x + e, y + 2, 2, 3, k.skin))
  s += `<g opacity="0">${lids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${blinkEvery}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.92;0.95"/></g>`
  return `<g>${s}${hops.length ? hopQ(hops, dur) : ''}</g>`
}

const PICARD_HD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f6a77c',
}

const DATHON_HD: CrabHD = {
  skin: '#b5694a',
  light: '#cf8664',
  shade: '#8f4f37',
  upper: '#6a4a2e',
  lower: '#4e3522',
  lowerShade: '#3a2718',
  legs: '#3d2a1c',
  rim: '#e8946a',
}

// ---------- Darmok: "Darmok and Jalad at Tanagra" ----------
// Dathon tells it with his claws: one up for Darmok, the other for Jalad,
// both with a hop at Tanagra. Picard listens, then answers him the same way.

// One timeline for a crab: claws rest / half / up per side, eyes on the fire or up,
// a 1 px rise, and blinks placed by hand.
type DkArms = { half: [number, number][]; up: [number, number][] }

function dkArmHalf(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const ax = side === 'left' ? x - 3 : x + 19
  p.rect(side === 'left' ? x - 3 : x + 18, y + 4, 3, 2, k.skin)
  p.rect(ax, y, 2, 4, k.skin)
  p.rect(side === 'left' ? ax : ax + 1, y, 1, 4, k.shade)
  const cx = side === 'left' ? x - 4 : x + 18
  p.rect(cx, y - 4, 1, 3, k.skin).rect(cx + 3, y - 4, 1, 3, k.skin)
  p.rect(cx, y - 2, 4, 1, k.skin).rect(cx + 1, y - 1, 2, 1, k.skin)
  p.set(cx, y - 4, k.light).set(cx + 3, y - 4, k.light)
  return p.svg()
}

function dkCrab(
  k: CrabHD, x: number, y: number, look: Side,
  arms: { left: DkArms; right: DkArms },
  eyesUp: [number, number][],
  rise: [number, number][],
  blinks: [number, number][],
  details: (p: Pix) => void,
) {
  const T = SCENE_SECONDS
  const { p, ex } = clawdBody(k, x, y, look)
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin)) // eyes are drawn below, on the timeline
  details(p)
  let s = p.svg()
  for (const side of ['left', 'right'] as Side[]) {
    const a = arms[side]
    s += shown(armRestHD(k, x, y, side), complement(merge([...a.half, ...a.up]), T), T)
    if (a.half.length) s += shown(dkArmHalf(k, x, y, side), a.half, T)
    if (a.up.length) s += shown(armUpHD(k, x, y, side), a.up, T)
  }
  const eyes = (dy: number) => {
    const e = new Pix()
    ex.forEach(i => e.rect(x + i, y + 2 + dy, 2, 3, EYE_HD))
    return e.svg()
  }
  const open = complement(merge(blinks), T)
  const inter = (a: [number, number][], b: [number, number][]) => {
    const out: [number, number][] = []
    for (const [a0, a1] of a) for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
      if (hi > lo) out.push([lo, hi])
    }
    return out
  }
  s += shown(eyes(0), inter(merge(eyesUp), open), T)
  s += shown(eyes(1), inter(complement(merge(eyesUp), T), open), T)
  return `<g>${s}${rise.length ? hopQ(rise, T).split(`0 ${-2 * Q}`).join(`0 ${-Q}`) : ''}</g>`
}

function darmok() {
  const T0 = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let s = `<defs>
    <linearGradient id="dkSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120c22"/><stop offset="1" stop-color="#2e1d44"/></linearGradient>
    <linearGradient id="dkFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="dkFade"><rect width="${W}" height="${H}" fill="url(#dkFadeG)"/></mask>
    <radialGradient id="dkGlow"><stop offset="0" stop-color="#ff9a4a" stop-opacity="0.42"/><stop offset="0.6" stop-color="#ff7a3a" stop-opacity="0.12"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="dkNeb"><stop offset="0" stop-color="#9b7bd6" stop-opacity="0.22"/><stop offset="1" stop-color="#9b7bd6" stop-opacity="0"/></radialGradient>
  </defs>`

  // sky, stars, moon, mesas, ground: all of it fading in from the band on the left
  let back = `<rect width="${W}" height="${H}" fill="url(#dkSky)"/>`
  back += `<ellipse cx="${40 * Q}" cy="${10 * Q}" rx="70" ry="18" fill="url(#dkNeb)"/>`
  let seed = 17
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let y = 1; y < 27; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.5) continue
      const o = 0.12 + rnd() * 0.3
      back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#cdbaf0" opacity="${o.toFixed(2)}"/>`
    }
  }
  ;[[30, 4], [46, 2], [58, 11], [20, 14], [86, 18]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${glow.svg()}<animate attributeName="opacity" values="0.15;0.9;0.15" dur="${2.6 + i * 0.7}s" begin="${i * 0.6}s" repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0.6;1;0.6" dur="${2.6 + i * 0.7}s" begin="${i * 0.6}s" repeatCount="indefinite"/></g>`
  })
  // shooting star: crosses once, after the two understand each other
  {
    const k = (t: number) => (t / T0).toFixed(4)
    back += `<rect x="0" y="0" width="${Q}" height="${Q}" fill="#fff" opacity="0"><animateTransform attributeName="transform" type="translate" values="56 6;56 6;132 30;132 30" keyTimes="0;${k(14.6)};${k(15.6)};1" dur="${T0}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.9;0.9;0;0" keyTimes="0;${k(14.6)};${k(14.8)};${k(15.2)};${k(15.6)};1" dur="${T0}s" repeatCount="indefinite"/><animate attributeName="width" values="2;2;10;10;2;2" keyTimes="0;${k(14.6)};${k(14.8)};${k(15.3)};${k(15.6)};1" dur="${T0}s" repeatCount="indefinite"/></rect>`
  }

  // the moon over El-Adrel
  const moon = new Pix()
  const mx = 76
  const my = 9
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = x * x + y * y
      if (d > 38) continue
      let c = '#e6dcf2'
      if (x + y * 0.3 < -2.5) c = '#b9a9d4'
      if (d > 30) c = x < 0 ? '#9d8cbf' : '#cfc2e6'
      moon.set(mx + x, my + y, c)
    }
  }
  ;[[2, -2], [-1, 2], [3, 3], [-3, -3]].forEach(([x, y]) => moon.set(mx + x, my + y, '#cbbde0'))
  moon.set(mx + 3, my - 2, '#cbbde0')
  back += `<circle cx="${(mx + 0.5) * Q}" cy="${(my + 0.5) * Q}" r="20" fill="#d9c9ff" opacity="0.08"/>` + moon.svg()

  // two layers of mesas, then the ground
  const far = new Pix()
  const near = new Pix()
  for (let c = 0; c < GW; c++) {
    const h1 = 25 + Math.round(2.4 * Math.sin(c / 6.5) + 1.6 * Math.sin(c / 2.7 + 1))
    const flat = c > 10 && c < 22 ? 23 : h1
    far.rect(c, flat, 1, 42 - flat, '#2a1f42')
    far.set(c, flat, '#372a55')
    const h2 = 33 + Math.round(1.8 * Math.sin(c / 4.3 + 2) + Math.sin(c / 1.9))
    near.rect(c, h2, 1, 42 - h2, '#1f1733')
    near.set(c, h2, '#2b2145')
  }
  back += far.svg() + near.svg()
  const ground = new Pix().rect(0, 42, GW, 6, '#1a1328').rect(0, 42, GW, 1, '#262039')
  for (let i = 0; i < 26; i++) ground.set(Math.floor(rnd() * GW), 43 + Math.floor(rnd() * 5), rnd() < 0.5 ? '#2a2140' : '#140f20')
  back += ground.svg()
  s += `<g mask="url(#dkFade)">${back}</g>`

  // firelight on the ground and the two of them
  s += `<ellipse cx="${51 * Q}" cy="${40 * Q}" rx="84" ry="30" fill="url(#dkGlow)"><animate attributeName="opacity" values="0.9;0.97;0.92;1;0.9" dur="4.3s" calcMode="spline" keyTimes="0;0.3;0.5;0.8;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/></ellipse>`

  // smoke curling up from the fire
  for (let i = 0; i < 3; i++) {
    const d = 4.5 + i
    s += `<rect x="${50 * Q}" y="${23 * Q}" width="${3 * Q}" height="${2 * Q}" fill="#8a7fa0" opacity="0"><animateMotion path="M0 0 q 6 -12 2 -22 t 8 -22" dur="${d}s" begin="${i * 1.5}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.35;0" dur="${d}s" begin="${i * 1.5}s" repeatCount="indefinite"/></rect>`
  }

  // stones and crossed logs
  const pit = new Pix()
  for (const [x, y] of [[41, 40], [44, 41], [48, 42], [52, 42], [56, 41], [59, 40]] as [number, number][]) {
    pit.rect(x, y, 3, 2, '#4a4458').set(x, y, '#7e6a6a').set(x + 1, y, '#9a7a68')
  }
  for (let i = 0; i < 12; i++) {
    const r = 40 - Math.floor(i / 3)
    pit.rect(45 + i, r, 1, 2, '#5a3a22').set(45 + i, r, '#7a4e2c')
    pit.rect(56 - i, r, 1, 2, '#4e3220').set(56 - i, r, '#6e4628')
  }
  pit.rect(44, 40, 1, 2, '#c9a66b').rect(57, 40, 1, 2, '#c9a66b')
  s += pit.svg()

  // the flames: four frames in turn
  const pal = { R: '#a8321f', r: '#e8552d', o: '#ff8a3d', y: '#ffd36b', w: '#fff2c0' }
  const frames = [
    ['......y.....', '.....yy.....', '.....oy..y..', '....ooy..y..', '....oyyo.o..', '...ooyyoo...', '..o.oywyoo..', '..ooyywwyoo.', '.roooywwyoo.', '.rooyywwyyor', '.rrooywwyoor', '..rrooyyoorr', '..RrrooooorR', '...RRrrrrRR.'],
    ['....y.......', '....yy......', '..y.yo......', '..y.yoo.....', '...oyyoo....', '...ooyyoo.y.', '..ooywyoo.o.', '.ooyywwyoo..', '.ooyywwyyoo.', 'rooyywwwyoor', 'rrooywwyyoor', '.rrooyyyoorr', '.RrroooooorR', '..RRrrrrrRR.'],
    ['.....y......', '.....y......', '.....yy.....', '....oyy.....', '....oyyo.y..', '...ooywo.o..', '...oywwyoo..', '..ooywwyyo..', '.roooywwyoo.', '.rooyywwyyor', 'rrooyywwyoor', '.rroooyyoorr', '.RrrrooooorR', '..RRRrrrrRR.'],
    ['.......y....', '......yy....', '......oy.y..', '.....ooy.y..', '....ooyyo...', '.o..ooyyoo..', '.o.ooywyoo..', '..ooyywwyoo.', '.ooyywwwyyo.', 'rooyywwwyyor', 'roooywwyyoor', 'rrooyyyyoorr', 'RrrooooooorR', '.RRrrrrrrRR.'],
  ]
  frames.forEach((f, i) => {
    s += shown(new Pix().rows(f, 45, 25, pal).svg(), [[i * 0.16, (i + 1) * 0.16]], 0.64)
  })
  // embers
  for (let i = 0; i < 5; i++) {
    const d = 2 + i * 0.45
    s += `<rect x="${51 * Q}" y="${25 * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffd36b' : '#ff9a4a'}" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 8 : -8} -14 ${i % 2 ? -3 : 4} -28 t ${i % 2 ? 6 : -6} -18" dur="${d}s" begin="${i * 0.5}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.8;0" dur="${d}s" begin="${i * 0.5}s" repeatCount="indefinite"/></rect>`
  }

  // Dathon, Tamarian ridges and robe, a dagger at his belt
  // (timeline below: claws as [rest, half, up] windows per side, eyes on the fire or on the other)
  s += dkCrab(
    DATHON_HD, 22, 28, 'right',
    {
      // "Darmok" (left), "Jalad" (right), "at Tanagra" (both), then again with Picard
      left: { half: [[2.9, 3.2], [4.4, 4.65], [5.9, 6.2], [7.3, 7.6], [12.0, 12.3], [13.9, 14.2]], up: [[3.2, 4.4], [6.2, 7.3], [12.3, 13.9]] },
      right: { half: [[4.5, 4.8], [7.3, 7.6], [12.1, 12.4], [13.9, 14.2]], up: [[4.8, 7.3], [12.4, 13.9]] },
    },
    [[2.5, 14.5]], // looks up from the fire at Picard, back down once understood
    [[6.4, 6.9]], // a little rise at Tanagra
    [[1.8, 1.95], [8.9, 9.05], [15.4, 15.55]],
    p => {
      for (const c of [3, 6, 9, 12, 15]) p.set(22 + c, 27, DATHON_HD.shade).set(22 + c, 28, DATHON_HD.shade)
      p.rect(22 + 10, 29, 1, 4, DATHON_HD.shade)
      p.set(22 + 4, 33, DATHON_HD.shade).set(22 + 15, 33, DATHON_HD.shade)
      p.rect(23, 34, 16, 1, '#8a6a44')
      p.rect(22, 36, 18, 1, '#c9a66b')
      p.rect(22 + 5, 36, 1, 3, '#9aa0a8').set(22 + 5, 36, '#d8dde3')
    },
  )

  // Picard, command red, combadge catching the firelight
  s += dkCrab(
    PICARD_HD, 62, 28, 'left',
    {
      // a hesitant half-raise that drops back, then the answer, then together with Dathon
      left: { half: [[8.3, 8.9], [9.3, 9.6], [10.8, 11.05], [12.1, 12.4], [13.9, 14.2]], up: [[9.6, 10.8], [12.4, 13.9]] },
      right: { half: [[10.9, 11.2], [13.9, 14.2]], up: [[11.2, 13.9]] },
    },
    [[2.8, 14.7]], // watches Dathon tell it
    [[12.6, 13.1]],
    [[2.2, 2.35], [7.8, 7.95], [15.0, 15.15]],
    p => {
      p.rect(62 + 12, 34, 2, 2, '#e8c547').set(62 + 12, 34, '#fff3b0')
      p.rect(62 + 4, 34, 1, 1, '#e8c547').rect(62 + 6, 34, 1, 1, '#e8c547')
    },
  )
  return s
}

// ---------- All Good Things: "Five card stud, nothing wild. And the sky's the limit." ----------
// One 17.17 s story: Riker, Data and Worf sit at the poker table, Picard's chair empty,
// stars drifting past the window. Picard walks in, pauses by his chair while the others
// look up, sits, takes the deck, shuffles and deals one card to each in turn. Riker
// picks up and grins, Data tilts his head, Worf scowls and pushes his chips into the
// pot, Picard looks at his own card and smiles. Calm tableau to the end.

const AGT_RIKER: CrabHD = {
  skin: '#d97757', light: '#eb9575', shade: '#b85f43',
  upper: '#1c1424', lower: '#b3262e', lowerShade: '#8e1d24', legs: '#1c1424', rim: '#ffb985',
}
const AGT_PICARD: CrabHD = { ...AGT_RIKER }
const AGT_DATA: CrabHD = {
  skin: '#e6dcc0', light: '#f7f1de', shade: '#bfb28e',
  upper: '#1c1424', lower: '#d4a024', lowerShade: '#a87c18', legs: '#1c1424', rim: '#fff8e0',
}
const AGT_WORF: CrabHD = {
  skin: '#a85c3a', light: '#c27552', shade: '#80432a',
  upper: '#1c1424', lower: '#d4a024', lowerShade: '#a87c18', legs: '#1c1424', rim: '#e8945e',
}

const AGT_Y = 26 // seated body top row
const AGT_RX = 5
const AGT_DX = 26
const AGT_WX = 47
const AGT_PX = 68

const AGT_CARD_W = '#f2ece0'
const AGT_CARD_R = '#b02a36'
const AGT_GOLD = '#e8c547'

// Clawd's body without legs (they are under the table), lit from the lamp side
function agtBody(k: CrabHD, x: number, y: number, look: Side, lit: Side) {
  const p = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = j === 0 ? k.light : k.skin
    if (j >= 6 && k.upper) c = j < 7 ? k.upper : k.lower!
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, c)
  }
  const far = lit === 'right' ? x : x + 17
  const near = lit === 'right' ? x + 17 : x
  p.rect(far, y + 1, 1, 5, k.shade)
  p.rect(near, y + 1, 1, 5, k.rim)
  if (k.lowerShade) p.rect(far, y + 7, 1, 3, k.lowerShade).set(lit === 'right' ? far + 1 : far - 1, y + 9, k.lowerShade)
  const ex = look === 'left' ? [4, 10] : [6, 12]
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, EYE_HD))
  return { p, ex }
}

// Pixel-art head tilt: shear the columns so the right side rises (no blur)
function agtShear(p: Pix, x0: number) {
  const out = new Pix()
  const m = (p as any).m as Map<number, Map<number, string>>
  for (const [y, row] of m) for (const [x, c] of row) out.set(x, y + 1 - Math.floor((x - x0) / 6), c)
  return out
}

// Claws resting on the table edge in front of the body
function agtNub(k: CrabHD, x: number, side: Side) {
  const cx = side === 'left' ? x + 1 : x + 14
  return new Pix().rect(cx, 35, 3, 1, k.light).rect(cx, 36, 3, 1, k.skin).set(side === 'left' ? cx : cx + 2, 36, k.shade).svg()
}

const agtLids = (k: CrabHD, x: number, y: number, ex: number[], period: number, at: number) => {
  const lids = new Pix()
  ex.forEach(e => lids.rect(x + e, y + 2, 2, 3, k.skin))
  return `<g opacity="0">${lids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${period}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;${at};${+(at + 0.035).toFixed(3)}"/></g>`
}

// A fan of three face-up cards, bottom-left at (x, y)
function agtFan(p: Pix, x: number, y: number) {
  const pips = ['#c8303a', '#1c1424', '#c8303a']
  for (let i = 0; i < 3; i++) {
    const cx = x + i * 2
    const cy = y - 3 - (i === 1 ? 1 : 0)
    p.rect(cx, cy, 2, 4, i === 1 ? '#fffaf0' : AGT_CARD_W)
    p.set(cx + 1, cy + 3, '#c9c0b0')
    p.set(cx, cy + 1, pips[i])
  }
  return p
}

// A face-down card lying on the felt
const agtCardFlat = (p: Pix, x: number, y: number) =>
  p.rect(x, y, 4, 1, AGT_CARD_W).set(x, y + 1, AGT_CARD_W).rect(x + 1, y + 1, 2, 1, AGT_CARD_R).set(x + 3, y + 1, AGT_CARD_W)

// A chip stack: colours from the bottom up
function agtChips(p: Pix, x: number, yb: number, cols: string[]) {
  const lite: Record<string, string> = { '#c8333a': '#f07a7a', '#3a62c8': '#86a8f4', '#e0d8cc': '#ffffff', '#2a2a34': '#5a5a6a' }
  cols.forEach((c, i) => {
    p.rect(x, yb - i, 3, 1, c).set(x + 1, yb - i, lite[c])
  })
  p.set(x, yb - cols.length + 1, lite[cols[cols.length - 1]])
  return p
}

// Discrete translate through a list of [time, dx, dy] steps (art pixels)
function agtSteps(steps: [number, number, number][], dur: number) {
  const kt = steps.map(s => +(s[0] / dur).toFixed(4))
  const vals = steps.map(s => `${s[1] * Q} ${s[2] * Q}`)
  if (kt[0] !== 0) kt.unshift(0), vals.unshift(vals[0])
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${kt.join(';')}"/>`
}

// The frame between resting and raised: arm half up, claw open
function agtArmMid(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const sx = side === 'left' ? x - 3 : x + 18
  p.rect(sx, y + 3, 3, 2, k.skin).set(side === 'left' ? sx : sx + 2, y + 5, k.shade)
  const cx = side === 'left' ? x - 4 : x + 20
  p.rect(cx, y, 2, 4, k.skin).rect(side === 'left' ? cx : cx + 1, y, 1, 4, k.shade)
  p.rect(cx - 1, y - 1, 4, 1, k.skin).set(cx - 1, y - 2, k.light).set(cx + 2, y - 2, k.light)
  return p.svg()
}

// Eyes raised a pixel and turned toward the newcomer on the right
function agtLookUp(k: CrabHD, x: number, y: number, ex: number[], eye: (p: Pix, ex: number, ey: number) => void) {
  const p = new Pix()
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin))
  ex.forEach(e => eye(p, x + e + 1, y + 1))
  return p.svg()
}
const agtPlainEye = (p: Pix, ex: number, ey: number) => p.rect(ex, ey, 2, 3, EYE_HD)
const agtDataEye = (p: Pix, ex: number, ey: number) => p.rect(ex, ey, 2, 3, '#e8b818').set(ex + 1, ey + 1, '#5a3a08').set(ex, ey, '#fff07a')

function allGoodThings() {
  const dur = SCENE_SECONDS
  const END = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const Y = AGT_Y
  let s = `<defs>
    <linearGradient id="agtWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1626"/><stop offset="1" stop-color="#3a2a32"/></linearGradient>
    <linearGradient id="agtSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07061a"/><stop offset="1" stop-color="#15102e"/></linearGradient>
    <linearGradient id="agtFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="agtFade"><rect width="${W}" height="${H}" fill="url(#agtFadeG)"/></mask>
    <linearGradient id="agtFadeT" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.09" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="agtFadeTable"><rect width="${W}" height="${H}" fill="url(#agtFadeT)"/></mask>
    <clipPath id="agtWin"><rect x="${23 * Q}" y="${4 * Q}" width="${62 * Q}" height="${15 * Q}"/></clipPath>
    <radialGradient id="agtGlow"><stop offset="0" stop-color="#ffb060" stop-opacity="0.38"/><stop offset="0.6" stop-color="#ff9a4a" stop-opacity="0.1"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <linearGradient id="agtCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd89a" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb060" stop-opacity="0.04"/></linearGradient>
  </defs>`

  // ---- the room: wall, the big window onto the stars, the lamp ----
  let back = `<rect width="${W}" height="${H}" fill="url(#agtWall)"/>`
  const wall = new Pix()
  for (const c of [8, 20, 87]) wall.rect(c, 0, 1, 36, '#2a1f2c').rect(c + 1, 0, 1, 36, '#3e2f3a')
  wall.rect(0, 22, GW, 1, '#4a3842').rect(0, 23, GW, 1, '#2a1f2c') // window ledge line
  back += wall.svg()
  // window: space with stars drifting slowly past, three panes
  back += `<rect x="${23 * Q}" y="${4 * Q}" width="${62 * Q}" height="${15 * Q}" fill="url(#agtSpace)"/>`
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const star = new Pix()
  const starB = new Pix()
  for (let i = 0; i < 46; i++) {
    const x = 23 + Math.floor(rnd() * 62)
    const y = 4 + Math.floor(rnd() * 15)
    const b = rnd()
    ;(b < 0.75 ? star : starB).set(x, y, b < 0.75 ? '#7d70a8' : '#e8e0ff')
    ;(b < 0.75 ? star : starB).set(x + 62, y, b < 0.75 ? '#7d70a8' : '#e8e0ff')
  }
  back += `<g clip-path="url(#agtWin)"><g>${star.svg()}<g>${starB.svg()}<animate attributeName="opacity" values="1;0.6;1" dur="3.1s" repeatCount="indefinite"/></g><animateTransform attributeName="transform" type="translate" values="0 0;${-62 * Q} 0" dur="46s" repeatCount="indefinite"/></g>`
  back += `<ellipse cx="${66 * Q}" cy="${9 * Q}" rx="40" ry="10" fill="#7a5ac0" opacity="0.14"/></g>`
  const frame = new Pix()
  frame.rect(22, 3, 64, 1, '#6a5866').rect(22, 19, 64, 1, '#5a4856').rect(22, 20, 64, 1, '#3a2c38')
  frame.rect(22, 4, 1, 15, '#5a4856').rect(85, 4, 1, 15, '#4a3a46')
  for (const c of [43, 64]) frame.rect(c, 4, 1, 15, '#4a3a46').set(c, 4, '#6a5866')
  back += frame.svg()
  // a shelf with a plant on the left wall
  const deco = new Pix()
  deco.rect(10, 25, 9, 1, '#5a4248').rect(10, 26, 9, 1, '#3a2a30')
  deco.rect(12, 21, 3, 4, '#6a8a5a').set(13, 20, '#86a86e').set(11, 22, '#86a86e').set(15, 21, '#86a86e').rect(12, 24, 3, 1, '#5a3a2a')
  back += deco.svg()
  back += new Pix().rect(0, 44, GW, 4, '#1a1320').svg()
  s += `<g mask="url(#agtFade)">${back}</g>`

  // the lamp over the table and its cone of warm light (a very slow, slight breathing)
  const lamp = new Pix()
  lamp.rect(46, 0, 1, 2, '#5a4a52')
  lamp.rect(43, 2, 7, 1, '#a8703c').rect(42, 3, 9, 1, '#8a5a30').rect(41, 4, 11, 1, '#6a4224')
  lamp.rect(43, 2, 2, 1, '#d89a5a')
  lamp.rect(43, 5, 7, 1, '#ffe2a0').set(46, 5, '#fff6dc')
  s += `<polygon points="${42 * Q},${5 * Q} ${51 * Q},${5 * Q} ${84 * Q},${37 * Q} ${10 * Q},${37 * Q}" fill="url(#agtCone)"><animate attributeName="opacity" values="1;0.9;1" dur="6.2s" repeatCount="indefinite"/></polygon>`
  s += lamp.svg()
  s += `<ellipse cx="${47 * Q}" cy="${33 * Q}" rx="92" ry="30" fill="url(#agtGlow)"/>`

  // Picard's empty chair
  const chair = new Pix()
  chair.rect(71, 25, 12, 1, '#7a4040').rect(70, 26, 14, 10, '#5a2c30').rect(70, 26, 14, 1, '#8a4a48').rect(70, 27, 1, 9, '#7a4040').rect(83, 27, 1, 9, '#3e1c20')
  s += chair.svg()

  // ---- the story, on one 17.17 s timeline ----
  const walk0 = 1.1 // first step in
  const stepT = 0.3 // one step
  const nSteps = 9 // 3 art px each: from off-screen to beside the chair
  const walkEnd = walk0 + nSteps * stepT // 3.8: standing by the chair
  const sitA = 4.8 // lowering
  const sitB = 5.05 // seated
  const deckMid = 5.4 // reaching for the deck
  const deckUp = 5.6 // deck raised
  const shuf = [5.9, 6.2, 6.5, 6.8, 7.1] // split, riffle, split, riffle, squared
  const deal0 = 7.4 // first card leaves the deck
  const dealGap = 0.55
  const flight = 0.4
  const armDownMid = 9.6 // deck goes back on the table
  const armDown = 9.8
  const rikerAt = 9.9
  const dataAt = 11.2
  const worfAt = 12.5
  const picAt = 13.9
  const looks: Record<string, [number, number]> = { r: [3.8, 5.4], d: [4.0, 5.5], w: [4.2, 5.6] }

  // ---- Riker: beard, command red; picks up and grins ----
  {
    const k = AGT_RIKER
    const x = AGT_RX
    const { p, ex } = agtBody(k, x, Y, 'right', 'right')
    const beard = '#4a2a1c'
    p.rect(x + 1, Y, 16, 1, '#3a2016').set(x + 2, Y, '#5a3422').set(x + 3, Y, '#5a3422')
    p.rect(x + 1, Y + 3, 2, 3, beard).rect(x + 15, Y + 3, 2, 3, beard)
    p.rect(x + 2, Y + 5, 14, 1, beard).rect(x + 8, Y + 4, 4, 1, beard)
    p.rect(x + 12, Y + 6, 2, 2, AGT_GOLD).set(x + 12, Y + 6, '#fff3b0')
    p.set(x + 3, Y + 6, AGT_GOLD).set(x + 5, Y + 6, AGT_GOLD).set(x + 7, Y + 6, AGT_GOLD)
    let r = p.svg()
    r += agtLids(k, x, Y, ex, 4.7, 0.3)
    r += shown(agtLookUp(k, x, Y, ex, agtPlainEye), [looks.r], dur)
    const grin = new Pix().rect(x + 8, Y + 5, 5, 1, '#fff4e0').set(x + 7, Y + 4, '#fff4e0').set(x + 13, Y + 4, '#fff4e0')
    r += shown(grin.svg(), [[rikerAt + 0.5, END]], dur)
    r += agtNub(k, x, 'left')
    r += shown(agtNub(k, x, 'right'), complement([[rikerAt, END]], dur), dur)
    r += shown(agtArmMid(k, x, Y, 'right'), [[rikerAt, rikerAt + 0.2]], dur)
    r += shown(armUpHD(k, x, Y, 'right') + agtFan(new Pix(), x + 18, Y - 8).svg(), [[rikerAt + 0.2, END]], dur)
    s += `<g>${r}${hopQ([[rikerAt + 0.8, rikerAt + 1.05]], dur)}</g>`
  }

  // ---- Data: pale gold skin, yellow eyes, operations gold; tilts his head ----
  {
    const k = AGT_DATA
    const x = AGT_DX
    const { p, ex } = agtBody(k, x, Y, 'right', 'right')
    p.rect(x + 1, Y, 16, 1, '#2a2018').set(x, Y + 1, '#2a2018').set(x + 4, Y, '#4a3a2a').set(x + 5, Y, '#4a3a2a')
    ex.forEach(e => p.rect(x + e, Y + 2, 2, 3, '#e8b818').set(x + e + 1, Y + 3, '#5a3a08').set(x + e, Y + 2, '#fff07a'))
    p.rect(x + 12, Y + 6, 2, 2, AGT_GOLD).set(x + 12, Y + 6, '#fff3b0')
    p.set(x + 3, Y + 6, AGT_GOLD).set(x + 5, Y + 6, AGT_GOLD)
    const tilt: [number, number][] = [[dataAt + 0.7, dataAt + 2.0]]
    let d = shown(p.svg() + agtLids(k, x, Y, ex, 6.1, 0.5) + shown(agtLookUp(k, x, Y, ex, agtDataEye), [looks.d], dur), complement(tilt, dur), dur)
    d += shown(agtShear(p, x).svg(), tilt, dur)
    d += agtNub(k, x, 'left')
    d += shown(agtNub(k, x, 'right'), complement([[dataAt, END]], dur), dur)
    // the claw lifts off the felt, then holds the card up in front of him
    const lift = new Pix().rect(x + 14, 34, 3, 1, k.light).rect(x + 14, 35, 3, 1, k.skin).set(x + 16, 35, k.shade)
    d += shown(lift.svg(), [[dataAt, dataAt + 0.2]], dur)
    const hand = agtFan(new Pix(), x + 11, Y + 9).rect(x + 12, 35, 4, 1, k.light).rect(x + 12, 36, 4, 1, k.skin)
    d += shown(hand.svg(), [[dataAt + 0.2, END]], dur)
    s += `<g>${d}</g>`
  }

  // ---- Worf: ridges, long hair, gold with the baldric; scowls and pushes his chips in ----
  {
    const k = AGT_WORF
    const x = AGT_WX
    const { p, ex } = agtBody(k, x, Y, 'right', 'left')
    const hair = '#1c120e'
    p.rect(x + 1, Y, 16, 1, hair).rect(x - 1, Y, 1, 8, hair).rect(x + 18, Y, 1, 8, hair)
    p.rect(x, Y + 1, 1, 4, hair).rect(x + 17, Y + 1, 1, 4, hair).set(x - 1, Y + 8, hair).set(x + 18, Y + 8, '#2a1a14')
    for (const c of [3, 5, 7, 10, 12, 14]) p.set(x + c, Y + 1, k.shade)
    p.rect(x + 8, Y + 1, 2, 1, k.light).set(x + 8, Y, '#3a2418')
    p.rect(x + 6, Y + 1, 1, 1, k.light).set(x + 11, Y + 1, k.light)
    // baldric over the shoulder
    const sil = '#b8bcc6'
    const hi = '#eef0f6'
    ;[[14, 6], [13, 6], [12, 7], [11, 7], [10, 8], [9, 8], [8, 9], [7, 9]].forEach(([i, j], n) => p.set(x + i, Y + j, n % 2 ? sil : hi))
    p.set(x + 15, Y + 6, sil)
    p.rect(x + 3, Y + 6, 2, 2, AGT_GOLD).set(x + 3, Y + 6, '#fff3b0')
    let w = p.svg()
    w += agtLids(k, x, Y, ex, 5.5, 0.62)
    w += shown(agtLookUp(k, x, Y, ex, agtPlainEye), [looks.w], dur)
    const brow = new Pix().set(x + 5, Y + 1, '#3a1a10').rect(x + 6, Y + 2, 2, 1, '#3a1a10').rect(x + 12, Y + 2, 2, 1, '#3a1a10').set(x + 14, Y + 1, '#3a1a10').rect(x + 8, Y + 1, 4, 1, '#5a2a18')
    brow.rect(x + 8, Y + 4, 3, 1, '#3a1a10').set(x + 7, Y + 5, '#3a1a10').set(x + 11, Y + 5, '#3a1a10') // a frown
    w += shown(brow.svg(), [[worfAt + 0.5, END]], dur)
    // left claw: picks up his card and holds it up
    w += shown(agtNub(k, x, 'left'), complement([[worfAt, END]], dur), dur)
    w += shown(agtArmMid(k, x, Y, 'left'), [[worfAt, worfAt + 0.2]], dur)
    w += shown(armUpHD(k, x, Y, 'left') + agtFan(new Pix(), x - 5, Y - 8).svg(), [[worfAt + 0.2, END]], dur)
    // right claw: shoves his chip stack into the pot, then comes back
    const pushA = +((worfAt + 0.9) / dur).toFixed(4)
    const pushB = +((worfAt + 1.7) / dur).toFixed(4)
    const backA = +((worfAt + 2.0) / dur).toFixed(4)
    const backB = +((worfAt + 2.5) / dur).toFixed(4)
    w += `<g>${agtNub(k, x, 'right')}<animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${-8 * Q} 0;${-8 * Q} 0;0 0;0 0" keyTimes="0;${pushA};${pushB};${backA};${backB};1"/></g>`
    s += `<g>${w}</g>`
  }

  // ---- Picard: walks in, pauses by his chair, sits, shuffles, deals, looks, smiles ----
  {
    const k = AGT_PICARD
    const x = AGT_PX
    const { p, ex } = agtBody(k, x, Y, 'left', 'left')
    p.rect(x + 12, Y + 6, 2, 2, AGT_GOLD).set(x + 12, Y + 6, '#fff3b0')
    p.set(x + 3, Y + 6, AGT_GOLD).set(x + 5, Y + 6, AGT_GOLD).set(x + 7, Y + 6, AGT_GOLD).set(x + 9, Y + 6, AGT_GOLD)
    let pc = p.svg()
    // legs while walking, two frames in turn, one per step
    const legA = new Pix()
    const legB = new Pix()
    for (const lx of [1, 5, 11, 15]) legA.rect(x + lx, Y + 10, 2, 3, k.legs)
    for (const [lx, l] of [[0, 3], [5, 2], [10, 3], [15, 2]] as [number, number][]) legB.rect(x + lx, Y + 10, 2, l, k.legs)
    const stepsA: [number, number][] = [[0, walk0], [walkEnd, sitB]]
    const stepsB: [number, number][] = []
    for (let i = 0; i < nSteps; i++) (i % 2 ? stepsA : stepsB).push([walk0 + i * stepT, walk0 + (i + 1) * stepT])
    pc += shown(legA.svg(), stepsA, dur)
    pc += shown(legB.svg(), stepsB, dur)
    pc += agtLids(k, x, Y, ex, 4.3, 0.75)
    // left claw: reaches for the deck, holds it up through the shuffle and the deal
    const hold: [number, number] = [deckMid, armDown]
    pc += shown(agtNub(k, x, 'left'), complement([hold], dur), dur)
    pc += shown(agtArmMid(k, x, Y, 'left'), [[deckMid, deckUp], [armDownMid, armDown]], dur)
    pc += shown(armUpHD(k, x, Y, 'left'), [[deckUp, armDownMid]], dur)
    const deck = new Pix().rect(x - 4, Y - 12, 4, 4, AGT_CARD_R).rect(x - 4, Y - 12, 4, 1, AGT_CARD_W).rect(x - 4, Y - 9, 4, 1, '#d8d0c4').set(x - 3, Y - 10, '#d0505a')
    const split = new Pix()
      .rect(x - 6, Y - 12, 2, 4, AGT_CARD_R).rect(x - 6, Y - 12, 2, 1, AGT_CARD_W).rect(x - 6, Y - 9, 2, 1, '#d8d0c4')
      .rect(x - 1, Y - 13, 2, 4, AGT_CARD_R).rect(x - 1, Y - 13, 2, 1, AGT_CARD_W).rect(x - 1, Y - 10, 2, 1, '#d8d0c4')
    const riffle = new Pix()
    ;['#f2ece0', '#b02a36', '#f2ece0', '#b02a36', '#d8d0c4'].forEach((c, j) => riffle.rect(x - 5, Y - 13 + j, 5, 1, c))
    riffle.set(x - 5, Y - 12, '#d0505a').set(x - 1, Y - 10, '#d0505a')
    pc += shown(deck.svg(), [[deckUp, shuf[0]], [shuf[4], armDownMid]], dur)
    pc += shown(split.svg(), [[shuf[0], shuf[1]], [shuf[2], shuf[3]]], dur)
    pc += shown(riffle.svg(), [[shuf[1], shuf[2]], [shuf[3], shuf[4]]], dur)
    // right claw: picks up his own card at the end
    pc += shown(agtNub(k, x, 'right'), complement([[picAt, END]], dur), dur)
    pc += shown(agtArmMid(k, x, Y, 'right'), [[picAt, picAt + 0.2]], dur)
    pc += shown(armUpHD(k, x, Y, 'right') + agtFan(new Pix(), x + 16, Y - 8).svg(), [[picAt + 0.2, END]], dur)
    const smile = new Pix().rect(x + 6, Y + 5, 4, 1, '#8e3a28').set(x + 5, Y + 4, '#8e3a28').set(x + 10, Y + 4, '#8e3a28')
    pc += shown(smile.svg(), [[picAt + 0.6, END]], dur)
    // the walk: off-screen right, 3 art px a step, standing; then lowering into the chair
    const steps: [number, number, number][] = [[0, 30, -2]]
    for (let i = 0; i < nSteps; i++) steps.push([+(walk0 + i * stepT).toFixed(2), 27 - 3 * i, -2])
    steps.push([sitA, 1, -1], [sitB, 0, 0])
    s += `<g>${pc}${agtSteps(steps, dur)}</g>`
  }

  // ---- the table ----
  const tb = new Pix()
  tb.rect(3, 36, 87, 1, '#9a6438').rect(2, 37, 88, 1, '#6a3e22')
  for (let r = 38; r <= 40; r++) {
    for (let c = 1; c < GW; c++) {
      const d = Math.abs(c - 47)
      tb.set(c, r, d < 18 ? '#3c7a52' : d < 32 ? '#336a47' : '#2a573b')
    }
  }
  tb.rect(1, 38, GW, 1, '#2a573b')
  tb.rect(0, 41, GW, 1, '#7a4a28').rect(0, 42, GW, 1, '#4a2a18').rect(0, 43, GW, 1, '#2e1a12')
  for (const c of [24, 52, 70]) tb.set(c, 39, '#468a5e')
  s += `<g mask="url(#agtFadeTable)">${tb.svg()}</g>`

  // ---- chips, the pot, the deck on the table ----
  const chips = new Pix()
  agtChips(chips, AGT_RX + 13, 40, ['#3a62c8', '#c8333a', '#c8333a', '#e0d8cc'])
  agtChips(chips, AGT_DX + 14, 40, ['#e0d8cc', '#3a62c8', '#e0d8cc'])
  agtChips(chips, AGT_PX + 14, 40, ['#c8333a', '#3a62c8', '#c8333a'])
  agtChips(chips, 44, 40, ['#c8333a', '#e0d8cc', '#c8333a'])
  agtChips(chips, 42, 40, ['#3a62c8'])
  s += chips.svg()
  // Worf's stack, shoved into the pot by his right claw
  {
    const ws = agtChips(new Pix(), AGT_WX + 11, 40, ['#2a2a34', '#c8333a', '#2a2a34', '#c8333a']).svg()
    const a = +((worfAt + 0.9) / dur).toFixed(4)
    const b = +((worfAt + 1.7) / dur).toFixed(4)
    s += `<g>${ws}<animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${-8 * Q} 0;${-8 * Q} 0" keyTimes="0;${a};${b};1"/></g>`
  }
  s += shown(agtCardFlat(new Pix(), AGT_PX + 6, 39).rect(AGT_PX + 6, 38, 4, 1, AGT_CARD_W).svg(), [[0, deckUp]], dur)
  s += shown(agtCardFlat(new Pix(), AGT_PX + 1, 39).rect(AGT_PX + 1, 38, 4, 1, AGT_CARD_W).svg(), [[armDown, END]], dur)

  // ---- the deal: one card at a time from Picard's deck to each player, himself last ----
  const order = [AGT_WX, AGT_DX, AGT_RX, AGT_PX]
  const pickup: Record<number, number> = { [AGT_RX]: rikerAt, [AGT_DX]: dataAt, [AGT_WX]: worfAt, [AGT_PX]: picAt }
  const sx = AGT_PX - 4
  const sy = Y - 11
  order.forEach((px, i) => {
    const t0 = deal0 + i * dealGap
    const t1 = t0 + flight
    const lx = px + 5
    const ly = 39
    const card = agtCardFlat(new Pix(), lx, ly).svg()
    const ddx = (sx - lx) * Q
    const ddy = (sy - ly) * Q
    const path = `M${ddx} ${ddy} Q${ddx / 2} ${ddy - 14} 0 0`
    const a = +(t0 / dur).toFixed(4)
    const b = +(t1 / dur).toFixed(4)
    s += `<g>${card}<animateMotion path="${path}" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1" dur="${dur}s" repeatCount="indefinite"/>${windows([[t0, pickup[px]]], dur)}</g>`
  })

  // a slow, faint glint on the pot
  s += `<rect x="${45 * Q}" y="${40 * Q}" width="${Q}" height="${Q}" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;0.7;0;0" keyTimes="0;0.5;0.68;0.88;1" dur="4.1s" repeatCount="indefinite"/></rect>`
  return s
}

// ---------- First Contact: the Borg Queen's entrance ----------
// One 17.17 s story. Picard walks into the dark Borg chamber and stands watching
// the headless body on its dais. Her head, shoulders and dangling spine are lowered
// on cables from the hatch, slowly, and lock onto the body with a small spark burst
// and soft steam. Her red eyepiece kindles; she opens her eyes, turns them to
// Picard and raises a beckoning claw. He steps back. The cables withdraw.

const FCH_DUR = SCENE_SECONDS

// the beats (seconds)
const FCH_T_WALK = 1.0 // Picard starts walking in (7 steps)
const FCH_T_DESC = 3.4 // the crane starts lowering her
const FCH_T_LOCK = 8.2 // her spine seats in the body
const FCH_T_ARMS = 9.2 // her arms come alive
const FCH_T_EYE0 = 8.7 // the eyepiece starts to light...
const FCH_T_EYE1 = 10.2 // ...fully lit
const FCH_T_OPEN = 10.4 // eyes open, straight ahead
const FCH_T_TURN = 11.1 // eyes turn to Picard
const FCH_T_BECK = 11.8 // the claw comes up
const FCH_T_BDOWN = 13.6 // and goes down again
const FCH_T_BACK = 12.6 // Picard steps back (2 steps)
const FCH_T_UP0 = 13.7 // cables start to withdraw...
const FCH_T_UP1 = 15.5 // ...gone into the hatch

const FCH_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#a9573e',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#c9c47a', // the chamber's green light on the side facing her
}

const FCH_QUEEN: CrabHD = {
  skin: '#b7bcb4',
  light: '#dde3da',
  shade: '#80867f',
  legs: '#1b1f22',
  rim: '#c6efc0',
}

const FCH_SUIT = { top: '#56636a', mid: '#171b1e', low: '#101315', shade: '#0a0c0d', rim: '#3d6e49', tube: '#050607', tubeHi: '#4a555c' }

const fchK = (t: number) => +(t / FCH_DUR).toFixed(4)

// Piecewise-eased track of whole art pixels, written as a discrete translate
function fchTrack(pts: [number, number][], axis: 'x' | 'y', dur: number) {
  const times: number[] = []
  const vals: string[] = []
  let last: number | null = null
  for (let i = 0; i <= dur * 50; i++) {
    const t = i / 50
    let v = pts[pts.length - 1][1]
    for (let k = 0; k < pts.length - 1; k++) {
      const [t0, v0] = pts[k]
      const [t1, v1] = pts[k + 1]
      if (t >= t0 && t < t1) {
        const u = (t - t0) / (t1 - t0)
        const e = u * u * (3 - 2 * u)
        v = v0 + (v1 - v0) * e
        break
      }
    }
    const r = Math.round(v)
    if (r !== last && t < dur) {
      times.push(t / dur)
      vals.push(axis === 'x' ? `${r * Q} 0` : `0 ${r * Q}`)
      last = r
    }
  }
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}"/>`
}

// Discrete translate through explicit keys [time, x, y] (art pixels)
function fchKeys(keys: [number, number, number][]) {
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${FCH_DUR}s" repeatCount="indefinite" values="${keys.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${keys.map(([t]) => fchK(t)).join(';')}"/>`
}

// Smooth opacity ramp on the story timeline: [time, opacity] points
function fchFade(pts: [number, number][]) {
  const all = pts[0][0] > 0 ? [[0, pts[0][1]] as [number, number], ...pts] : pts
  const end = all[all.length - 1]
  if (end[0] < FCH_DUR) all.push([FCH_DUR, end[1]])
  return `<animate attributeName="opacity" dur="${FCH_DUR}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => fchK(p[0])).join(';')}"/>`
}

// The crane: a slight sway while she comes down, then the descent itself
const FCH_SWAY: [number, number][] = [[0, 0], [FCH_T_DESC + 0.6, 0], [FCH_T_DESC + 1.9, -1], [FCH_T_DESC + 3.3, 1], [FCH_T_LOCK - 0.3, 0], [FCH_DUR, 0]]
const FCH_DOWN: [number, number][] = [[0, -46], [FCH_T_DESC, -46], [FCH_T_LOCK, 0], [FCH_DUR, 0]]

function fchHang(svg: string, down: [number, number][]) {
  return `<g>${fchTrack(FCH_SWAY, 'x', FCH_DUR)}<g>${svg}${fchTrack(down, 'y', FCH_DUR)}</g></g>`
}

// One particle that flies along a path once, inside [t0, t0 + life]
function fchFly(shape: string, x: number, y: number, path: string, t0: number, life: number, fade: boolean) {
  const a = fchK(t0)
  const b = fchK(t0 + life)
  const op = fade
    ? `<animate attributeName="opacity" dur="${FCH_DUR}s" repeatCount="indefinite" values="0;0;0.42;0;0" keyTimes="0;${a};${fchK(t0 + 0.35)};${b};1"/>`
    : `<animate attributeName="opacity" calcMode="discrete" dur="${FCH_DUR}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;${a};${b}"/>`
  return `<g transform="translate(${x * Q} ${y * Q})"><g opacity="0">${shape}<animateMotion path="${path}" dur="${FCH_DUR}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1"/>${op}</g></g>`
}

function fchPuff(c: string, big: boolean) {
  const p = new Pix()
  if (big) p.rect(1, 0, 3, 1, c).rect(0, 1, 5, 2, c).rect(1, 3, 3, 1, c)
  else p.rect(1, 0, 2, 1, c).rect(0, 1, 4, 1, c).rect(1, 2, 2, 1, c)
  return p.svg()
}

const fchR = (x: number, y: number, w: number, h: number, c: string) =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`

function fchBackground(W: number, H: number) {
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let back = `<rect width="${W}" height="${H}" fill="url(#fchWallG)"/>`

  // far wall: the Borg grid of plates, ribs and rivets (one tile, repeated)
  back += `<rect x="0" y="${4 * Q}" width="${W}" height="${38 * Q}" fill="url(#fchGrid)"/>`
  const far = new Pix()
  const lights: [number, number][] = []
  for (let cy = 4; cy < 40; cy += 6) {
    for (let cx = 5; cx < GW; cx += 7) {
      const g = rnd()
      if (g < 0.22) far.rect(cx + 2, cy + 3, 3, 1, '#18402a').set(cx + 2, cy + 3, '#2b6a40')
      else if (g < 0.36) far.rect(cx + 1, cy + 2, 5, 3, '#06100a').rect(cx + 2, cy + 3, 3, 1, '#12301a')
      else if (g < 0.5) lights.push([cx + 2 + Math.floor(rnd() * 3), cy + 2 + Math.floor(rnd() * 3)])
    }
  }
  back += far.svg()

  // near layer: thick conduits, couplings and sagging tubes
  const near = new Pix()
  const pipe = (x: number, w: number, y0: number, y1: number) => {
    back += fchR(x, y0, w, y1 - y0, '#13261a') + fchR(x, y0, 1, y1 - y0, '#2e5238') + fchR(x + w - 1, y0, 1, y1 - y0, '#07100a')
    if (w > 2) back += fchR(x + 1, y0, 1, y1 - y0, '#1f3a28')
    for (let y = y0 + 3; y < y1 - 1; y += 7) near.rect(x - 1, y, w + 2, 2, '#1a3322').set(x - 1, y, '#3d6a4a').set(x + w, y, '#0a140d').set(x - 1, y + 1, '#2a4a34')
  }
  near.rect(0, 13, 38, 2, '#10221a').rect(0, 13, 38, 1, '#2a4a34')
  near.rect(48, 20, 42, 2, '#10221a').rect(48, 20, 42, 1, '#2a4a34')
  back += near.svg()
  pipe(3, 3, 5, 42)
  pipe(9, 2, 5, 42)
  pipe(40, 3, 5, 42)
  pipe(45, 2, 5, 42)
  pipe(86, 3, 5, 42)
  const top = new Pix()
  const sag = (a: number, b: number, y: number, d: number) => {
    for (let x = a; x <= b; x++) {
      const yy = y + Math.round(d * Math.sin((Math.PI * (x - a)) / (b - a)))
      top.set(x, yy, '#050a07').set(x, yy - 1, '#1d3626')
    }
  }
  sag(12, 39, 6, 6)
  sag(20, 33, 6, 10)
  sag(47, 60, 6, 7)
  sag(78, 89, 6, 9)
  // ceiling machinery and the hatch she comes down from
  top.rect(0, 0, GW, 5, '#040906').rect(0, 4, GW, 1, '#163420')
  for (let x = 2; x < GW; x += 5) top.set(x, 2, '#1c3d27')
  top.rect(60, 0, 18, 4, '#010201').rect(59, 0, 1, 5, '#2a4a34').rect(78, 0, 1, 5, '#2a4a34').rect(60, 3, 18, 1, '#1d6b34')
  // floor grating
  top.rect(0, 42, GW, 6, '#050b07').rect(0, 42, GW, 1, '#16301e').rect(0, 45, GW, 1, '#08120a')
  back += top.svg()
  for (let x = 3; x < GW; x += 5) back += fchR(x, 43, 1, 5, '#0a160d')

  // indicator lights in the wall plates, breathing slowly (single art pixels)
  lights.forEach(([x, y], i) => {
    back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#5dff8a"><animate attributeName="opacity" values="0.9;0.3;0.9" dur="${2.6 + (i % 5) * 0.45}s" begin="${(i * 0.37) % 2.3}s" repeatCount="indefinite"/></rect>`
  })
  return back
}

// Her left arm (toward Picard), raised: 'mid' is half way, 'curl' bends the claw tips in
function fchArmLeft(x: number, y: number, pose: 'mid' | 'up' | 'curl') {
  const k = FCH_QUEEN
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin)
  if (pose === 'mid') {
    p.rect(x - 5, y + 1, 2, 4, k.skin).rect(x - 5, y + 1, 1, 4, k.shade)
    p.rect(x - 7, y - 2, 1, 2, k.skin).rect(x - 4, y - 2, 1, 2, k.skin)
    p.rect(x - 7, y, 4, 1, k.skin).set(x - 7, y - 2, k.light).set(x - 4, y - 2, k.light)
    return p.svg()
  }
  const ax = x - 3
  const cx = x - 4
  p.rect(ax, y - 4, 2, 8, k.skin).rect(ax, y - 4, 1, 8, k.shade)
  p.rect(cx, y - 6, 4, 1, k.skin).rect(cx + 1, y - 5, 2, 1, k.skin)
  if (pose === 'up') {
    p.rect(cx, y - 8, 1, 3, k.skin).rect(cx + 3, y - 8, 1, 3, k.skin)
    p.set(cx, y - 8, k.light).set(cx + 3, y - 8, k.light)
  } else {
    // tips folded toward her: a come-here curl
    p.rect(cx, y - 7, 1, 2, k.skin).rect(cx + 3, y - 7, 1, 2, k.skin)
    p.set(cx + 1, y - 7, k.light).set(cx + 4, y - 7, k.light)
  }
  return p.svg()
}

function fchQueenBody(x: number, y: number) {
  const k = FCH_QUEEN
  const S = FCH_SUIT
  const p = new Pix()
  // black bodysuit, rows 5..9, with ribbing and tubes
  p.rect(x, y + 5, 18, 1, S.top)
  p.rect(x, y + 6, 18, 2, S.mid)
  p.rect(x, y + 8, 18, 1, S.low)
  p.rect(x + 1, y + 9, 16, 1, S.low)
  p.rect(x, y + 6, 1, 3, S.shade).rect(x + 17, y + 6, 1, 3, S.rim)
  for (let i = 5; i < 13; i += 2) p.set(x + i, y + 7, '#23292d')
  for (const tx of [3, 14]) p.rect(x + tx, y + 5, 1, 5, S.tube).set(x + tx, y + 6, S.tubeHi)
  p.set(x + 2, y + 8, S.tubeHi).set(x + 15, y + 8, S.tubeHi)
  for (const lx of [1, 5, 11, 15]) p.rect(x + lx, y + 10, 2, 4, k.legs).set(x + lx, y + 10, '#2b3135')
  let s = p.svg()
  // the open socket waiting for her spine; its glow dies away once she is seated
  const sock = new Pix().rect(x + 6, y + 5, 6, 1, '#020403').rect(x + 7, y + 6, 4, 1, '#020403').rect(x + 8, y + 5, 2, 1, '#3cff7a')
  s += `<g>${sock.svg()}${fchFade([[FCH_T_LOCK, 1], [FCH_T_LOCK + 0.8, 0]])}</g>`
  // arms: limp until she is whole, then at rest; the left one beckons Picard
  const B = FCH_T_BECK
  const D = FCH_T_BDOWN
  const limp = new Pix().rect(x - 3, y + 6, 3, 2, k.skin).rect(x - 3, y + 8, 3, 1, k.shade).rect(x + 18, y + 6, 3, 2, k.skin).rect(x + 18, y + 8, 3, 1, k.shade)
  s += shown(limp.svg(), [[0, FCH_T_ARMS]], FCH_DUR)
  s += shown(armRestHD(k, x, y, 'right'), [[FCH_T_ARMS, FCH_DUR]], FCH_DUR)
  s += shown(armRestHD(k, x, y, 'left'), [[FCH_T_ARMS, B], [D + 0.3, FCH_DUR]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'mid'), [[B, B + 0.3], [D, D + 0.3]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'up'), [[B + 0.3, B + 0.75], [B + 1.15, B + 1.4], [B + 1.75, D]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'curl'), [[B + 0.75, B + 1.15], [B + 1.4, B + 1.75]], FCH_DUR)
  return s
}

// What hangs behind the body: the spine and her tubes
function fchQueenBack(x: number, y: number) {
  const p = new Pix()
  // spine: vertebrae with dark discs, a stray wire
  for (let j = 0; j < 11; j++) {
    const yy = y + 5 + j
    if (j % 2 === 0) {
      const w = j > 7 ? 2 : 4
      const ox = j > 7 ? 8 : 7
      p.rect(x + ox, yy, w, 1, '#8b969c').set(x + ox, yy, '#c9d3d8').set(x + ox + w - 1, yy, '#5a656b')
    } else p.rect(x + 8, yy, 2, 1, '#3a4348')
  }
  p.set(x + 8, y + 16, '#5a656b')
  p.set(x + 10, y + 7, '#2a2f33').set(x + 11, y + 8, '#2a2f33').set(x + 11, y + 9, '#ff3b3b')
  p.set(x + 6, y + 9, '#2a2f33').set(x + 6, y + 10, '#2a2f33').set(x + 5, y + 11, '#2a2f33')
  // black tubes hanging from the back of her crown
  for (const [tx, len, dir] of [[-1, 8, -1], [18, 8, 1], [2, 10, -1], [15, 10, 1]] as [number, number, number][]) {
    for (let j = 0; j < len; j++) {
      const xx = x + tx + (j > 4 ? dir : 0)
      p.set(xx, y + j, FCH_SUIT.tube)
      if (j % 3 === 1) p.set(xx, y + j, FCH_SUIT.tubeHi)
    }
  }
  return p.svg()
}

function fchCables(x: number, y: number) {
  const p = new Pix()
  for (let yy = y - 60; yy < y - 3; yy++) {
    const hi = (yy - y) % 4 === 0
    p.set(x + 4, yy, hi ? '#4b6a55' : '#1b2a20').set(x + 13, yy, hi ? '#4b6a55' : '#1b2a20')
    p.rect(x + 8, yy, 2, 1, '#0f1712').set(x + 8, yy, hi ? '#3a5a44' : '#1e3326')
  }
  // the clamp that holds her crown
  p.rect(x + 3, y - 4, 12, 1, '#2f3e35').set(x + 3, y - 4, '#6f8a78').rect(x + 6, y - 5, 6, 1, '#4a5d51')
  p.rect(x + 3, y - 3, 1, 1, '#2f3e35').rect(x + 14, y - 3, 1, 1, '#2f3e35')
  return p.svg()
}

// Her head: pale Clawd block, glossy black skullcap, implant with a red eye light
function fchQueenHead(x: number, y: number) {
  const k = FCH_QUEEN
  const p = new Pix()
  p.rect(x + 1, y, 16, 1, k.light)
  p.rect(x, y + 1, 18, 4, k.skin)
  p.rect(x, y + 1, 1, 4, k.shade).rect(x + 17, y + 1, 1, 4, k.rim)
  p.rect(x + 1, y + 4, 16, 1, '#a9aea6') // jaw shadow above the collar
  // skullcap / crown
  p.rect(x + 5, y - 3, 8, 1, '#121618')
  p.rect(x + 3, y - 2, 12, 1, '#121618')
  p.rect(x + 1, y - 1, 16, 1, '#0d1012')
  p.rect(x, y, 18, 1, '#0d1012')
  p.rect(x, y + 1, 2, 1, '#0d1012').rect(x + 16, y + 1, 2, 1, '#0d1012')
  p.rect(x, y + 2, 1, 1, '#0d1012').rect(x + 17, y + 2, 1, 1, '#0d1012')
  p.rect(x + 6, y - 3, 2, 1, '#a7bac2').rect(x + 4, y - 2, 4, 1, '#5f7480').set(x + 5, y - 2, '#9fb3bc')
  p.rect(x + 2, y - 1, 3, 1, '#2f3b42').set(x + 9, y - 2, '#24303a').set(x + 12, y - 2, '#24303a')
  p.set(x + 1, y, '#3a4850').set(x + 16, y - 1, '#2a3238')
  // cybernetic plate around her right eye, and a tube at her temple
  p.rect(x + 14, y + 1, 3, 3, '#3b4246').set(x + 14, y + 1, '#6c767c').rect(x + 16, y + 1, 1, 3, '#23292d')
  p.set(x + 1, y + 2, '#262c30').set(x + 1, y + 3, '#262c30')
  // the dormant eyepiece
  p.set(x + 15, y + 2, '#5a1414')
  let s = p.svg()
  // eyes: closed while she is carried, open ahead, then turned to Picard (one slow blink)
  const O = FCH_T_OPEN
  const T = FCH_T_TURN
  s += shown(new Pix().rect(x + 5, y + 3, 2, 1, '#4b514b').rect(x + 11, y + 3, 2, 1, '#4b514b').svg(), [[0, O]], FCH_DUR)
  s += shown(new Pix().rect(x + 5, y + 2, 2, 3, EYE_HD).rect(x + 11, y + 2, 2, 3, EYE_HD).svg(), [[O, T]], FCH_DUR)
  s += shown(new Pix().rect(x + 3, y + 2, 2, 3, EYE_HD).rect(x + 9, y + 2, 2, 3, EYE_HD).svg(), [[T, 14.9], [15.05, FCH_DUR]], FCH_DUR)
  s += shown(new Pix().rect(x + 3, y + 3, 2, 1, '#4b514b').rect(x + 9, y + 3, 2, 1, '#4b514b').svg(), [[14.9, 15.05]], FCH_DUR)
  // red eyepiece: kindles slowly after the lock, then breathes gently
  const lit = new Pix().set(x + 15, y + 2, '#ff3b3b').set(x + 15, y + 3, '#b01c1c').svg()
  const glow = `<circle cx="${(x + 15.5) * Q}" cy="${(y + 2.5) * Q}" r="5" fill="#ff3030" opacity="0.3"><animate attributeName="opacity" values="0.22;0.4;0.22" dur="3.2s" repeatCount="indefinite"/></circle>`
  s += `<g opacity="0">${glow}${lit}${fchFade([[FCH_T_EYE0, 0], [FCH_T_EYE1, 1]])}</g>`
  return s
}

function firstContactHD() {
  const dur = FCH_DUR
  const W = GW * Q
  const H = GH * Q
  const qx = 60
  const qy = 28
  let s = `<defs>
    <linearGradient id="fchWallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05100a"/><stop offset="0.6" stop-color="#0b1f12"/><stop offset="1" stop-color="#0f2a17"/></linearGradient>
    <linearGradient id="fchFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="fchFade"><rect width="${W}" height="${H}" fill="url(#fchFadeG)"/></mask>
    <linearGradient id="fchBeamG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8dffb0" stop-opacity="0.26"/><stop offset="1" stop-color="#3cff7a" stop-opacity="0.04"/></linearGradient>
    <radialGradient id="fchHaze"><stop offset="0" stop-color="#3cff7a" stop-opacity="0.3"/><stop offset="0.6" stop-color="#2bd35e" stop-opacity="0.08"/><stop offset="1" stop-color="#2bd35e" stop-opacity="0"/></radialGradient>
    <pattern id="fchGrid" x="${-2 * Q}" y="${4 * Q}" width="${7 * Q}" height="${6 * Q}" patternUnits="userSpaceOnUse">${new Pix().rect(0, 0, 7, 6, '#10281a').rect(1, 1, 6, 1, '#1a4226').rect(6, 2, 1, 4, '#081509').rect(1, 5, 5, 1, '#0c1f12').rect(0, 0, 1, 6, '#163c22').rect(0, 0, 7, 1, '#163c22').set(0, 0, '#3f8a52').svg()}</pattern>
    <mask id="fchSpineM" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${(qx + 4) * Q}" y="${(qy + 5) * Q}" width="${10 * Q}" height="${12 * Q}" fill="#000"/></mask>
    <radialGradient id="fchSpark"><stop offset="0" stop-color="#e6ffd8" stop-opacity="0.75"/><stop offset="0.45" stop-color="#9dffb8" stop-opacity="0.3"/><stop offset="1" stop-color="#3cff7a" stop-opacity="0"/></radialGradient>
  </defs>`

  let back = fchBackground(W, H)
  // green haze drifting slowly through the chamber
  back += `<ellipse cx="${30 * Q}" cy="${26 * Q}" rx="70" ry="26" fill="url(#fchHaze)" opacity="0.6"><animate attributeName="cx" values="${26 * Q};${36 * Q};${26 * Q}" dur="12s" repeatCount="indefinite"/></ellipse>`
  back += `<rect x="0" y="${37 * Q}" width="${W}" height="${8 * Q}" fill="#3cff7a" opacity="0.05"/>`
  s += `<g mask="url(#fchFade)">${back}</g>`

  // the light pouring down from the hatch onto her body: steady, a very slow breath
  s += `<polygon points="${60 * Q},${4 * Q} ${78 * Q},${4 * Q} ${88 * Q},${42 * Q} ${50 * Q},${42 * Q}" fill="url(#fchBeamG)" opacity="0.9"><animate attributeName="opacity" values="0.86;0.96;0.86" dur="7s" repeatCount="indefinite"/></polygon>`
  s += `<ellipse cx="${69 * Q}" cy="${34 * Q}" rx="44" ry="30" fill="url(#fchHaze)" opacity="0.65"/>`

  // the dais she stands on
  const dais = new Pix().rect(55, 42, 28, 1, '#2c5238').rect(57, 43, 24, 1, '#13241a').set(55, 42, '#4f8a5f')
  for (const lx of [59, 66, 72, 78]) dais.set(lx, 43, '#3cff7a')
  s += dais.svg()

  // floor vent breathing steam between them
  for (let i = 0; i < 3; i++) {
    const d = 4.2 + i * 0.8
    s += `<g transform="translate(${46 * Q} ${40 * Q})"><g opacity="0">${fchPuff('#9fc7aa', i === 1)}<animateMotion path="M0 0 q ${i % 2 ? 6 : -4} -10 ${i % 2 ? 2 : 5} -24" dur="${d}s" begin="${i * 1.4}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.28;0" dur="${d}s" begin="${i * 1.4}s" repeatCount="indefinite"/></g></g>`
  }
  s += new Pix().rect(44, 41, 5, 1, '#1d3a26').set(45, 41, '#0a140d').set(47, 41, '#0a140d').svg()

  // Picard, command red, combadge. He walks in (7 steps), stands, later backs off 2 steps
  const px0 = 16
  const pic = crabHD(
    FCH_PICARD, px0, 28, 'right', dur,
    { left: [], right: [] },
    [],
    4.3,
    p => {
      p.rect(px0 + 12, 34, 2, 2, '#e8c547').set(px0 + 12, 34, '#fff3b0')
      p.set(px0 + 4, 34, '#e8c547').set(px0 + 6, 34, '#e8c547')
      p.set(px0 + 1, 28, '#cf8a6a').set(px0 + 16, 28, '#e6b08a')
    },
  )
  const walk: [number, number, number][] = [[0, -21, 0]]
  for (let i = 0; i < 7; i++) {
    const t = FCH_T_WALK + i * 0.32
    const x = -21 + 3 * (i + 1)
    walk.push([t, x, -1], [t + 0.16, x, 0])
  }
  const bk = FCH_T_BACK
  walk.push([bk, -1, -1], [bk + 0.16, -1, 0], [bk + 0.42, -3, -1], [bk + 0.58, -3, 0])
  s += `<g>${pic}${fchKeys(walk)}</g>`

  // the Queen: cables, spine and tubes, body, then head, with a 1px settle on the lock
  let queen = fchHang(fchCables(qx, qy), [[0, -46], [FCH_T_DESC, -46], [FCH_T_LOCK, 0], [FCH_T_UP0, 0], [FCH_T_UP1, -46], [dur, -46]])
  queen += `<g mask="url(#fchSpineM)">${fchHang(fchQueenBack(qx, qy), FCH_DOWN)}</g>`
  queen += fchQueenBody(qx, qy)
  queen += fchHang(fchQueenHead(qx, qy), FCH_DOWN)
  s += `<g>${queen}${fchKeys([[0, 0, 0], [FCH_T_LOCK, 0, 1], [FCH_T_LOCK + 0.35, 0, 0]])}</g>`

  // the lock: a small local glow at the neck, a few sparks, soft steam both sides
  s += `<ellipse cx="${69 * Q}" cy="${33 * Q}" rx="12" ry="5" fill="url(#fchSpark)" opacity="0">${fchFade([[FCH_T_LOCK - 0.1, 0], [FCH_T_LOCK + 0.4, 0.8], [FCH_T_LOCK + 1.5, 0]])}</ellipse>`
  const sparks: [number, number, number, string][] = [
    [-16, -8, 0.7, '#fff6c8'], [-22, -5, 0.8, '#ff9a4a'], [-9, -12, 0.55, '#ffd36b'],
    [16, -8, 0.7, '#fff6c8'], [22, -5, 0.85, '#ff9a4a'], [9, -12, 0.55, '#ffd36b'],
    [-5, -9, 0.6, '#ffd36b'], [5, -9, 0.6, '#fff6c8'],
  ]
  sparks.forEach(([dx, h, life, c], i) => {
    const t0 = FCH_T_LOCK + 0.1 + (i % 3) * 0.08 + (i > 5 ? 0.35 : 0)
    const ox = dx < 0 ? 66 : 71
    s += fchFly(`<rect width="${Q}" height="${Q}" fill="${c}"/>`, ox, 33, `M0 0 q ${dx * 0.6} ${h * 2} ${dx * 2} ${24 - 2 * h}`, t0, life, false)
  })
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1
    const t0 = FCH_T_LOCK + 0.15 + Math.floor(i / 2) * 0.3
    const ox = side < 0 ? 62 : 74
    s += fchFly(fchPuff('#cfe6d6', i < 2), ox, 31, `M0 0 q ${side * 12} -2 ${side * 20} -${16 + i * 3}`, t0, 2.2 + i * 0.15, true)
  }
  // a second, smaller hiss as the cables let go
  for (let i = 0; i < 2; i++) {
    s += fchFly(fchPuff('#b7d8c1', false), i ? 75 : 61, 24, `M0 0 q ${i ? 6 : -6} -4 ${i ? 8 : -8} -14`, FCH_T_UP0 + i * 0.2, 2.0, true)
  }

  // a faint scan line drifting down the chamber
  s += `<rect x="0" y="0" width="${W}" height="${Q}" fill="#7dffa0" opacity="0.06"><animateTransform attributeName="transform" type="translate" values="0 0;0 ${H}" dur="6.5s" repeatCount="indefinite"/></rect>`
  return s
}

// ---------- The Cloud: "There's coffee in that nebula." ----------
// Janeway sips her coffee on the bridge, gazes at the nebula turning on the
// viewscreen, slowly realises, points at it, hops once: we're going in. Last sip.

const JC_HD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#a3242c',
  lower: '#18131f',
  lowerShade: '#0e0b13',
  legs: '#18131f',
  rim: '#f2a3b4',
}

const JC_HAIR = { h: '#7a2e1a', l: '#a8452a', d: '#4f1c10', g: '#c25a36' }

const jcMugPal = { w: '#ffffff', k: '#4a2a18', m: '#ece8e0', s: '#aaa398', h: '#c4bdb2', r: '#b3262e' }
const jcMugRows = ['..wkkw', '.hmmms', 'h.rrrs', '.hmmms', '..ssss']

function jcNebula(x0: number, y0: number, w: number, h: number, cx: number, cy: number) {
  const p = new Pix()
  const cols = ['#0c0a1c', '#1a1236', '#2c1a52', '#47206e', '#6e2a86', '#a43d92', '#d86aa8', '#f7b7d2', '#fff1f6']
  const teal = ['#0f2a3a', '#145266', '#1f8494', '#4cc4c0', '#a6f0e4']
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = (x - cx) * 0.48
      const dy = (y - cy) * 1.15
      const r = Math.sqrt(dx * dx + dy * dy)
      const a = Math.atan2(dy, dx)
      const arm = Math.sin(a * 2 - r * 0.42) // two swirling arms
      const n = 0.5 * Math.sin(x * 0.37 + y * 0.9) + 0.35 * Math.sin(x * 0.11 - y * 0.53 + 1.3)
      let v = 1.2 - r / 14 + 0.38 * arm + 0.3 * n
      // a teal outer arm on the far side
      const tv = 0.7 - Math.abs(r - 10) / 6 + 0.45 * Math.sin(a * 2 - r * 0.42 + 2.4) + 0.45 * n
      let c: string
      if (v > 0.25) {
        const i = Math.min(cols.length - 1, Math.floor(1 + (v - 0.25) * 4.2))
        c = cols[i]
      } else if (tv > 0.35) {
        c = teal[Math.min(teal.length - 1, Math.floor((tv - 0.35) * 5))]
      } else {
        c = v > 0 ? cols[1] : cols[0]
      }
      p.set(x, y, c)
    }
  }
  return p
}

function janewayCoffee() {
  const dur = SCENE_SECONDS
  const D = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const X = 24 // Janeway's body
  const Y = 28
  // viewscreen interior
  const sx = 6, sy = 3, sw = 80, sh = 20
  const ncx = 66, ncy = 12 // nebula core
  const kt = (list: number[]) => list.map(t => +(t / D).toFixed(4)).join(';')

  // ---------- the story (seconds) ----------
  // 0.0-1.8   calm: the bridge, the nebula turning, her mug steaming at her side
  // 1.8-2.3   the mug comes up            2.3-5.2  a long slow sip, eyes closed
  // 5.2-5.6   the mug comes down          5.8-8.0  she gazes up at the nebula
  // 8.0-9.6   it dawns on her: eyes go wide, a small sparkle by her head
  // 9.4-9.8   her claw comes up           9.8-13.0 pointing at it, holding
  // 11.5-12.5 a determined hop and a little nod
  // 13.0-13.4 the claw comes down         13.6-15.8 one last satisfied sip
  // 15.8-17.17 calm again, mug at her side, the nebula still turning
  const tMugMid: [number, number][] = [[1.8, 2.3], [5.2, 5.6], [13.6, 14.1], [15.4, 15.8]]
  const tMugUp: [number, number][] = [[2.3, 5.2], [14.1, 15.4]]
  const tMugSide = complement(merge([...tMugMid, ...tMugUp]), dur)
  const tClosed: [number, number][] = [[2.5, 5.0], [14.3, 15.3]]
  const tGaze: [number, number][] = [[5.8, 8.0]]
  const tLit: [number, number][] = [[8.0, 13.2]]
  const tArmMid: [number, number][] = [[9.4, 9.8], [13.0, 13.4]]
  const tPoint: [number, number][] = [[9.8, 13.0]]
  const tBlink: [number, number][] = [[1.2, 1.35], [7.3, 7.45], [16.0, 16.15]]

  let s = `<defs>
    <linearGradient id="jcFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="jcFade"><rect width="${W}" height="${H}" fill="url(#jcFadeG)"/></mask>
    <clipPath id="jcScr"><rect x="${sx * Q}" y="${sy * Q}" width="${sw * Q}" height="${sh * Q}"/></clipPath>
    <radialGradient id="jcCore"><stop offset="0" stop-color="#ffe6f2" stop-opacity="0.75"/><stop offset="0.35" stop-color="#e070b8" stop-opacity="0.3"/><stop offset="1" stop-color="#7a3cc0" stop-opacity="0"/></radialGradient>
    <radialGradient id="jcTeal"><stop offset="0" stop-color="#5fe0d0" stop-opacity="0.35"/><stop offset="1" stop-color="#5fe0d0" stop-opacity="0"/></radialGradient>
    <radialGradient id="jcSpill"><stop offset="0" stop-color="#b06ad8" stop-opacity="0.22"/><stop offset="1" stop-color="#b06ad8" stop-opacity="0"/></radialGradient>
    <radialGradient id="jcGleam"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.5"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
  </defs>`

  let back = `<rect width="${W}" height="${H}" fill="#1b1729"/>`

  // the bridge wall around the screen
  const wall = new Pix()
  wall.rect(0, 0, GW, 42, '#221d33')
  wall.rect(sx - 3, sy - 2, sw + 6, sh + 4, '#14111f') // outer frame
  wall.rect(sx - 2, sy - 1, sw + 4, sh + 2, '#3a3552') // bezel
  wall.rect(sx - 2, sy - 1, sw + 4, 1, '#58517a')
  wall.rect(sx - 2, sy + sh, sw + 4, 1, '#2a2640')
  // wall panels under the screen
  wall.rect(0, 26, GW, 1, '#2e2844')
  wall.rect(0, 27, GW, 7, '#262036')
  for (let c = 4; c < GW; c += 12) wall.rect(c, 27, 1, 7, '#1c1729')
  wall.rect(0, 34, GW, 1, '#3a3352')
  wall.rect(0, 35, GW, 7, '#1e1a2c')
  // LCARS strips
  const lc = [['#e89a4a', 10], ['#b48ad8', 6], ['#6f8fd8', 4], ['#e8b06a', 8], ['#c26a8a', 5], ['#b48ad8', 9], ['#e89a4a', 6]] as [string, number][]
  let lx = 2
  for (const [c, w] of lc) {
    if (lx + w < 16 || lx > 50) wall.rect(lx, 29, w, 2, c).rect(lx, 29, 1, 2, '#3a3352')
    lx += w + 3
    if (lx > GW - 4) break
  }
  wall.rect(52, 32, 30, 1, '#4a3f66')
  back += wall.svg()

  // the nebula on the screen: the glows turn slowly and the core breathes, never flares
  let scr = jcNebula(sx, sy, sw, sh, ncx, ncy).svg()
  scr += `<g transform="translate(${(ncx + 0.5) * Q} ${(ncy + 0.5) * Q})"><g><ellipse cx="14" cy="0" rx="30" ry="12" fill="url(#jcTeal)"/><ellipse cx="-18" cy="3" rx="22" ry="9" fill="url(#jcSpill)"/><animateTransform attributeName="transform" type="rotate" values="0;110" dur="${D}s" repeatCount="indefinite"/></g></g>`
  scr += `<ellipse cx="${(ncx + 0.5) * Q}" cy="${(ncy + 0.5) * Q}" rx="34" ry="18" fill="url(#jcCore)" opacity="0.8"><animate attributeName="opacity" values="0.8;0.95;0.8" dur="${D / 2}s" repeatCount="indefinite"/></ellipse>`
  // slow, soft twinkles in the cloud
  const sparks = [[60, 7], [72, 15], [48, 10], [80, 6], [55, 18], [70, 5], [36, 14], [24, 8], [84, 19], [64, 16]]
  sparks.forEach(([x, y], i) => {
    const g = new Pix().set(x - 1, y, '#e8c8ff').set(x + 1, y, '#e8c8ff').set(x, y - 1, '#e8c8ff').set(x, y + 1, '#e8c8ff')
    const d = 3.2 + (i % 4) * 0.7
    scr += `<g opacity="0">${g.svg()}${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0;0.8;0;0" keyTimes="0;0.35;0.7;1" dur="${d}s" begin="${(i * 0.53).toFixed(2)}s" repeatCount="indefinite"/></g>`
  })
  // faint distant stars
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 26; i++) {
    const x = sx + Math.floor(rnd() * sw)
    const y = sy + Math.floor(rnd() * sh)
    scr += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#e6dcff" opacity="${(0.25 + rnd() * 0.4).toFixed(2)}"/>`
  }
  // a faint scanline drifting down the screen
  scr += `<rect x="${sx * Q}" y="0" width="${sw * Q}" height="${Q}" fill="#ffffff" opacity="0.05"><animate attributeName="y" values="${sy * Q};${(sy + sh) * Q}" dur="5.4s" repeatCount="indefinite"/></rect>`
  back += `<g clip-path="url(#jcScr)">${scr}</g>`
  // screen glass glint
  back += new Pix().rect(sx, sy, sw, 1, '#ffffff').svg().replace('<rect', '<rect opacity="0.08"')

  const floor = new Pix().rect(0, 42, GW, 6, '#15111f').rect(0, 42, GW, 1, '#2a2440')
  for (let c = 0; c < GW; c += 6) floor.set(c, 44, '#1d1829')
  back += floor.svg()
  s += `<g mask="url(#jcFade)">${back}</g>`
  // light spilling from the screen, breathing with the core
  s += `<ellipse cx="${60 * Q}" cy="${30 * Q}" rx="90" ry="30" fill="url(#jcSpill)" opacity="0.9"><animate attributeName="opacity" values="0.9;1;0.9" dur="${D / 2}s" repeatCount="indefinite"/></ellipse>`

  // console lights, slowly dimming and brightening
  ;[[8, 32, '#e89a4a'], [52, 29, '#6f8fd8'], [84, 32, '#c26a8a'], [60, 36, '#e8b06a'], [76, 36, '#6f8fd8']].forEach(([x, y, c], i) => {
    s += `<rect x="${(x as number) * Q}" y="${(y as number) * Q}" width="${Q * 2}" height="${Q}" fill="${c}"><animate attributeName="opacity" values="1;0.35;1" dur="${(2.1 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></rect>`
  })

  // the conn console on the right, in front of the screen
  const con = new Pix()
  con.rect(56, 36, 32, 1, '#5a5378').rect(55, 37, 34, 1, '#3b3554').rect(56, 38, 32, 4, '#2a2540')
  con.rect(60, 36, 8, 1, '#e89a4a').rect(70, 36, 4, 1, '#b48ad8').rect(76, 36, 8, 1, '#6f8fd8')
  con.rect(56, 38, 1, 4, '#3b3554')
  s += con.svg()

  // ---------- Janeway ----------
  const k = JC_HD
  const { p } = clawdBody(k, X, Y, 'right')
  // Voyager uniform: grey collar, red yoke, black jacket, combadge, pips
  p.rect(X + 7, Y + 6, 5, 1, '#8a8e99').set(X + 7, Y + 6, '#6c707b')
  p.rect(X + 1, Y + 8, 16, 1, k.lower!)
  p.rect(X + 12, Y + 7, 2, 2, '#e8c547').set(X + 12, Y + 7, '#fff3b0')
  p.set(X + 9, Y + 6, '#e8c547').set(X + 10, Y + 6, '#e8c547')
  // auburn hair with the bun on top
  const hr = new Pix()
  hr.rows(
    [
      '.....dhhd.........',
      '....dhllhd........',
      '....dhhhhd........',
      '..dhhhhhhhhhhhlll.',
      '.dhhhhhhhhhhhhhhgl',
      'dhhh..............',
      'dd................',
    ],
    X, Y - 4, JC_HAIR,
  )
  let jan = p.svg() + hr.svg()

  // eyes: closed (sipping), looking up (gazing), wide and bright (it dawns on her), blinks
  const eyeSkin = (cols: number[]) => {
    const e = new Pix()
    cols.forEach(c => e.rect(X + c, Y + 2, 2, 3, k.skin))
    return e
  }
  const closed = eyeSkin([6, 12])
  closed.rect(X + 4, Y + 3, 2, 1, EYE_HD).set(X + 3, Y + 2, EYE_HD)
  closed.rect(X + 10, Y + 3, 2, 1, EYE_HD).set(X + 9, Y + 2, EYE_HD)
  const gaze = new Pix()
  for (const e of [6, 12]) gaze.rect(X + e, Y + 4, 2, 1, k.skin).rect(X + e, Y + 1, 2, 1, EYE_HD)
  const lit = new Pix()
  for (const e of [6, 12]) lit.set(X + e, Y + 2, '#ffffff').set(X + e + 1, Y + 3, '#3a2a5a').rect(X + e, Y + 1, 2, 1, EYE_HD)
  const lids = eyeSkin([6, 12])
  for (const e of [6, 12]) lids.rect(X + e, Y + 1, 2, 1, k.skin)

  jan += shown(closed.svg(), tClosed, dur)
  jan += shown(gaze.svg(), tGaze, dur)
  jan += shown(lit.svg(), tLit, dur)
  jan += shown(lids.svg(), tBlink, dur)

  // left claw: the mug at her side, halfway up, or at her lips
  const mugAt = (mx: number, my: number) => new Pix().rows(jcMugRows, mx, my, jcMugPal)
  const steam = (mx: number, my: number, n: number) => {
    let o = ''
    for (let i = 0; i < n; i++) {
      const d = 2.4 + i * 0.5
      o += `<rect x="${(mx + 3 + (i % 2)) * Q}" y="${(my - 1) * Q}" width="${Q}" height="${Q * 2}" fill="#e9e2f2" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 4 : -4} -6 0 -11 t ${i % 2 ? 3 : -3} -10" dur="${d}s" begin="${i * 0.8}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.6;0" dur="${d}s" begin="${i * 0.8}s" repeatCount="indefinite"/></rect>`
    }
    return o
  }
  // at her side
  const side = new Pix().rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  const m1x = X - 9, m1y = Y + 2
  const side2 = mugAt(m1x, m1y)
  side2.rect(X - 4, Y + 4, 1, 2, k.skin).set(X - 4, Y + 6, k.shade).rect(X - 6, Y + 7, 3, 1, k.skin).set(X - 6, Y + 7, k.light)
  const sideSvg = side.svg() + side2.svg() + steam(m1x, m1y, 3)
  // halfway up
  const mid = new Pix()
  mid.rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  mid.rect(X - 5, Y + 3, 2, 3, k.skin).rect(X - 5, Y + 5, 2, 1, k.shade)
  const m3x = X - 8, m3y = Y - 1
  const midSvg = mid.svg() + mugAt(m3x, m3y).rect(m3x + 2, m3y + 5, 3, 1, k.skin).set(m3x + 2, m3y + 5, k.light).svg() + steam(m3x, m3y, 2)
  // raised to her face
  const up = new Pix()
  up.rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  up.rect(X - 4, Y + 1, 2, 5, k.skin).rect(X - 4, Y + 1, 1, 5, k.shade)
  const m2x = X - 6, m2y = Y - 3
  const upSvg = up.svg() + mugAt(m2x, m2y).rect(m2x + 2, m2y + 5, 3, 1, k.skin).set(m2x + 2, m2y + 5, k.light).svg() + steam(m2x, m2y, 3)
  jan += shown(sideSvg, tMugSide, dur)
  jan += shown(midSvg, tMugMid, dur)
  jan += shown(upSvg, tMugUp, dur)

  // right claw: at rest, half raised, or pointing at the nebula
  jan += shown(armRestHD(k, X, Y, 'right'), complement(merge([...tPoint, ...tArmMid]), dur), dur)
  const ax = X + 18
  const am = new Pix()
  for (let i = 0; i < 3; i++) {
    const yy = Y + 4 - i
    am.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade).set(ax + i * 2 + 2, yy, k.rim)
  }
  am.rect(ax + 6, Y + 1, 2, 2, k.skin).set(ax + 7, Y + 1, k.light).set(ax + 6, Y + 3, k.shade)
  jan += shown(am.svg(), tArmMid, dur)
  const pt = new Pix()
  // a long diagonal arm reaching up toward the nebula
  for (let i = 0; i < 5; i++) {
    const yy = Y + 4 - i * 2
    pt.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade)
    pt.set(ax + i * 2 + 2, yy, k.rim)
  }
  // open pincer at the end, jaws toward the screen
  const cx = ax + 10, cy = Y - 6
  pt.rect(cx, cy, 3, 3, k.skin).set(cx, cy + 2, k.shade).set(cx + 2, cy, k.light)
  pt.rect(cx, cy - 3, 1, 3, k.skin).set(cx, cy - 3, k.light) // upper jaw
  pt.rect(cx + 3, cy + 1, 3, 1, k.skin).set(cx + 5, cy + 1, k.light).rect(cx + 3, cy + 2, 3, 1, k.shade) // lower jaw
  jan += shown(pt.svg(), tPoint, dur)

  // the idea dawning: a small, soft local sparkle by her head (rises 0.5 s, fades 1.1 s)
  const burst = new Pix()
  for (const [bx, by] of [[X + 20, Y - 6], [X + 15, Y - 9]] as [number, number][]) {
    burst.set(bx, by, '#fff6dc').set(bx - 1, by, '#ffe9a8').set(bx + 1, by, '#ffe9a8').set(bx, by - 1, '#ffe9a8').set(bx, by + 1, '#ffe9a8')
  }
  const gl = `<circle cx="${(X + 18) * Q}" cy="${(Y - 7) * Q}" r="10" fill="url(#jcGleam)"/>`
  s += `<g opacity="0">${gl}${burst.svg()}<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt([0, 8.0, 8.5, 9.0, 10.1, D])}" dur="${D}s" repeatCount="indefinite"/></g>`
  // a tiny second glint, a beat later
  const g2 = new Pix().set(X + 23, Y - 10, '#fff6dc').set(X + 22, Y - 10, '#ffe9a8').set(X + 24, Y - 10, '#ffe9a8').set(X + 23, Y - 11, '#ffe9a8').set(X + 23, Y - 9, '#ffe9a8')
  s += `<g opacity="0">${g2.svg()}<animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="${kt([0, 8.4, 8.9, 9.9, D])}" dur="${D}s" repeatCount="indefinite"/></g>`

  // the determined hop, then a small nod of a hop
  const hop = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${D}s" repeatCount="indefinite" values="0 0;0 ${-Q};0 ${-2 * Q};0 ${-Q};0 0;0 ${-Q};0 0" keyTimes="${kt([0, 11.5, 11.6, 11.85, 11.95, 12.3, 12.55])}"/>`
  s += `<g>${jan}${hop}</g>`
  return s
}

// ---------- Chain of Command: "There are four lights!" ----------
// A Cardassian interrogation room. Picard hangs by his wrists under four steady
// lights. Gul Madred turns, walks to him and points up at them; a faint fifth
// light fades in at the end of the row. Picard looks, hesitates, then strains
// against the chains and shouts; the fifth light fades away. There are four lights.

const COC_MADRED: CrabHD = {
  skin: '#86837a',
  light: '#a3a094',
  shade: '#615e57',
  upper: '#4a4935',
  lower: '#3a392a',
  lowerShade: '#2a291f',
  legs: '#22211b',
  rim: '#bdb9a8',
}

const COC_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#f0a483',
  shade: '#b05a40',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f3b08f',
}

const COC_LIGHTS = [37, 48, 59, 70] // left column of each lamp
const COC_FIFTH = 81

// one ceiling lamp: stem, housing, a blazing face
function cocLamp(lx: number) {
  const p = new Pix()
  p.rect(lx + 1, 0, 4, 1, '#2a231d')
  p.rect(lx - 1, 1, 8, 1, '#5a4d40').set(lx - 1, 1, '#3a3129').set(lx + 6, 1, '#3a3129')
  p.rect(lx - 1, 2, 1, 3, '#3a3129').rect(lx + 6, 2, 1, 3, '#2a231d')
  p.rect(lx, 2, 6, 1, '#fff1bf')
  p.rect(lx, 3, 6, 1, '#ffffff')
  p.rect(lx, 4, 6, 1, '#ffe7a0')
  p.set(lx, 2, '#ffe08a').set(lx + 5, 4, '#f5c96a')
  p.rect(lx, 5, 6, 1, '#2e2620').set(lx - 1, 5, '#1f1914').set(lx + 6, 5, '#1f1914')
  return p.svg()
}

// glow + downward cone of harsh light under a lamp
function cocGlow(lx: number, op = 1) {
  const cx = (lx + 3) * Q
  return (
    `<polygon points="${lx * Q},${5 * Q} ${(lx + 6) * Q},${5 * Q} ${(lx + 13) * Q},${42 * Q} ${(lx - 7) * Q},${42 * Q}" fill="url(#cocBeam)" opacity="${op}"/>` +
    `<ellipse cx="${cx}" cy="${3.5 * Q}" rx="22" ry="13" fill="url(#cocHalo)" opacity="${op}"/>`
  )
}

// a hanging chain: alternating face-on and edge-on links
function cocChain(x: number, y0: number, y1: number) {
  const p = new Pix()
  for (let y = y0; y <= y1; y++) {
    const k = (y - y0) % 3
    if (k === 0) p.set(x, y, '#8d8578').set(x + 1, y, '#5b554b')
    else if (k === 1) p.set(x, y, '#5b554b').set(x + 1, y, '#3a352f')
    else p.set(x, y, '#a49b8b').set(x + 1, y, '#6c655a')
  }
  return p.svg()
}

function chainOfCommandHD() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let s = `<defs>
    <linearGradient id="cocWallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14100d"/><stop offset="0.25" stop-color="#231c17"/><stop offset="1" stop-color="#2c241d"/></linearGradient>
    <linearGradient id="cocFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="cocFade"><rect width="${W}" height="${H}" fill="url(#cocFadeG)"/></mask>
    <linearGradient id="cocBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d0" stop-opacity="0.22"/><stop offset="1" stop-color="#fff4d0" stop-opacity="0.03"/></linearGradient>
    <radialGradient id="cocHalo"><stop offset="0" stop-color="#fff8dc" stop-opacity="0.75"/><stop offset="0.45" stop-color="#ffe9a8" stop-opacity="0.22"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
    <radialGradient id="cocFlare"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.4" stop-color="#fff4c8" stop-opacity="0.4"/><stop offset="1" stop-color="#fff4c8" stop-opacity="0"/></radialGradient>
    <radialGradient id="cocPool"><stop offset="0" stop-color="#ffefc0" stop-opacity="0.22"/><stop offset="1" stop-color="#ffefc0" stop-opacity="0"/></radialGradient>
    <radialGradient id="cocAmber"><stop offset="0" stop-color="#e0902e" stop-opacity="0.35"/><stop offset="1" stop-color="#e0902e" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- the room: angular Cardassian walls, faded in from the left ----
  let back = `<rect width="${W}" height="${H}" fill="url(#cocWallG)"/>`
  const wall = new Pix()
  // ceiling soffit, stepped down in angular tiers
  wall.rect(0, 0, GW, 6, '#110d0b')
  for (let c = 0; c < GW; c++) {
    const step = (c % 22) < 11 ? 0 : 1
    wall.set(c, 6 + step, '#3b3128').set(c, 7 + step, '#1a1411')
  }
  // piers: tapered heads, then straight ribbed columns (vertical rects keep it small)
  let cols = ''
  const vr = (x: number, y: number, w: number, h: number, c: string) =>
    (cols += `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`)
  for (const px0 of [6, 28, 50, 72]) {
    for (let r = 8; r < 14; r++) {
      const w = 7 - Math.floor((r - 8) / 1.5)
      const x0 = px0 - Math.floor(w / 2)
      wall.rect(x0, r, w, 1, '#3a3027').set(x0, r, '#4d4033').set(x0 + w - 1, r, '#241d18')
    }
    vr(px0 - 1, 14, 3, 28, '#3a3027')
    vr(px0 - 1, 14, 1, 28, '#4d4033')
    vr(px0 + 1, 14, 1, 28, '#241d18')
    for (let r = 16; r < 42; r += 5) wall.rect(px0 - 2, r, 5, 1, '#4f4236').set(px0 + 2, r, '#2a221c')
  }
  // recessed panels between the piers: pointed trapezoid frames with ribs
  for (const cx of [17, 39, 61, 83]) {
    for (let r = 12; r < 20; r++) {
      const inset = 19 - r
      wall.rect(cx - 7 + inset, r, 15 - 2 * inset, 1, '#1d1713').set(cx - 7 + inset, r, '#3d3229').set(cx + 7 - inset, r, '#16110e')
    }
    vr(cx - 7, 20, 15, 18, '#211a16')
    vr(cx - 7, 20, 1, 18, '#3d3229')
    vr(cx + 7, 20, 1, 18, '#16110e')
    for (let r = 22; r < 37; r += 3) vr(cx - 6, r, 13, 1, '#2b231d')
    wall.rect(cx - 7, 38, 15, 1, '#3d3229')
    // dim amber slit near the bottom of each panel
    wall.rect(cx - 4, 22, 9, 1, '#7a5326').rect(cx - 3, 22, 7, 1, '#b07a34')
  }
  // floor: dark metal deck with grating
  wall.rect(0, 42, GW, 6, '#17120f').rect(0, 42, GW, 1, '#3a3027').rect(0, 43, GW, 1, '#221b16')
  for (let c = 2; c < GW; c += 6) wall.rect(c, 44, 1, 4, '#100c0a')
  back += cols + wall.svg()
  // amber slit glows, slowly breathing
  for (const cx of [17, 39, 61, 83]) {
    back += `<ellipse cx="${(cx + 0.5) * Q}" cy="${22.5 * Q}" rx="16" ry="6" fill="url(#cocAmber)"><animate attributeName="opacity" values="0.6;1;0.6" dur="${3.2 + cx / 40}s" repeatCount="indefinite"/></ellipse>`
  }
  s += `<g mask="url(#cocFade)">${back}</g>`

  // ---- the four lights: steady, breathing very slowly ----
  let glow = ''
  for (const lx of COC_LIGHTS) glow += cocGlow(lx)
  s += `<g>${glow}<animate attributeName="opacity" values="1;0.92;1" dur="${dur / 2}s" repeatCount="indefinite"/></g>`
  s += `<ellipse cx="${59 * Q}" cy="${43 * Q}" rx="60" ry="6" fill="url(#cocPool)"/>`
  for (const lx of COC_LIGHTS) s += cocLamp(lx)

  // the fifth light: fades in faintly at the end of the row, then fades away
  const kt = (ts: number[]) => ts.map(t => +(t / dur).toFixed(4)).join(';')
  const fifth = cocGlow(COC_FIFTH, 0.9) +
    new Pix().rect(COC_FIFTH, 2, 6, 3, '#fff6d8').rect(COC_FIFTH + 1, 3, 4, 1, '#ffffff').set(COC_FIFTH, 2, '#ffe9a8').set(COC_FIFTH + 5, 4, '#ffe9a8').svg()
  s += `<g opacity="0">${fifth}<animate attributeName="opacity" dur="${dur}s" repeatCount="indefinite" values="0;0;0.62;0.62;0;0" keyTimes="${kt([0, 7.0, 9.0, 10.8, 12.8, dur])}"/></g>`

  // dust motes drifting through the beams
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 7
    const d = 6 + (i % 3) * 1.7
    s += `<rect x="${x * Q}" y="${8 * Q}" width="${Q / 2}" height="${Q / 2}" fill="#fff6d8" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 6 : -6} 20 ${i % 2 ? -2 : 3} 52" dur="${d}s" begin="${i * 1.1}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0.5;0" dur="${d}s" begin="${i * 1.1}s" repeatCount="indefinite"/></rect>`
  }

  // ---- the chain rail and chains ----
  const px = 58
  const py = 26
  const rail = new Pix()
  rail.rect(51, 8, 34, 1, '#6b6152').rect(51, 9, 34, 1, '#3a332b')
  for (const bx of [51, 66, 84]) rail.rect(bx, 7, 1, 3, '#8a7f6c').set(bx, 7, '#a89c86')
  for (const cx of [55, 77]) rail.rect(cx - 1, 10, 4, 1, '#4a433a').set(cx, 10, '#8d8578')
  s += rail.svg()
  // three slow jolts against the chains; the chains swing and settle
  const jolts: [number, number][] = [[10.5, 10.95], [11.3, 11.75], [12.1, 12.55]]
  const swayK = [0, 10.5, 10.95, 11.3, 11.75, 12.1, 12.55, 13.1, 13.7, 14.3, dur]
  const swayV = ['0 0', '0 0', `${Q / 2} 0`, `${-Q / 2} 0`, `${Q / 2} 0`, `${-Q / 2} 0`, `${Q / 2} 0`, `${-Q / 2} 0`, `${Q / 2} 0`, '0 0', '0 0']
  const sway = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${swayV.join(';')}" keyTimes="${kt(swayK)}"/>`
  s += `<g>${cocChain(px - 3, 11, py - 3)}${cocChain(px + 19, 11, py - 3)}${sway}</g>`

  // shadow under the suspended prisoner
  s += `<ellipse cx="${(px + 9) * Q}" cy="${43 * Q}" rx="18" ry="2.5" fill="#0b0807" opacity="0.7"/>`

  s += `<ellipse cx="${31 * Q}" cy="${31 * Q}" rx="34" ry="22" fill="url(#cocPool)"/>`
  // ---- Gul Madred: grey ridged skin, black hair, segmented armour ----
  const mx = 20
  const my = 28
  const M = COC_MADRED
  const madredDetails = (look: Side) => (p: Pix) => {
    // slicked black hair
    p.rect(mx + 2, my - 1, 14, 1, '#1a1513').rect(mx + 1, my, 16, 1, '#100d0c')
    p.rect(mx + 6, my - 1, 7, 1, '#4a433d').rect(mx + 8, my - 1, 3, 1, '#7a7068')
    // the forehead spoon
    p.rect(mx + 8, my + 1, 4, 1, '#4e4b45').rect(mx + 9, my + 1, 2, 1, M.rim)
    p.set(mx + 8, my + 2, '#4e4b45').set(mx + 11, my + 2, '#4e4b45').rect(mx + 9, my + 2, 2, 1, M.light)
    p.rect(mx + 9, my + 3, 2, 1, '#4e4b45').rect(mx + 9, my, 2, 1, '#4e4b45')
    // stern brow ridges
    p.rect(mx + 5, my + 1, 3, 1, '#615d55').rect(mx + 12, my + 1, 3, 1, '#615d55')
    // neck ridges sweeping down to the shoulders (lit on the side facing the lights)
    const lit = look === 'right' ? [M.light, M.rim] : [M.rim, M.light]
    for (let i = 0; i < 3; i++) {
      p.set(mx + 1 + i, my + 2 + i, '#4e4b45').set(mx + 2 + i, my + 2 + i, lit[0]).set(mx + 1 + i, my + 3 + i, '#4e4b45')
      p.set(mx + 16 - i, my + 2 + i, '#4e4b45').set(mx + 15 - i, my + 2 + i, lit[1]).set(mx + 16 - i, my + 3 + i, '#4e4b45')
    }
    // armour: ribbed collar, banded segments, chest plate, rank insignia
    p.rect(mx + 3, my + 5, 12, 1, '#2c2b21')
    for (let c = 4; c < 14; c += 2) p.set(mx + c, my + 5, '#55543f')
    p.rect(mx + 1, my + 6, 16, 1, '#646249')
    p.rect(mx + 1, my + 8, 16, 1, '#55543f')
    for (const c of [3, 14]) p.rect(mx + c, my + 7, 1, 3, '#22211a')
    p.rect(mx + 7, my + 6, 4, 4, '#3a392b').rect(mx + 7, my + 6, 4, 1, '#77755a').rect(mx + 8, my + 7, 2, 1, '#2a291f')
    p.set(mx + 8, my + 8, '#c9a94e').set(mx + 9, my + 8, '#8a7434')
    const edge = look === 'right' ? mx + 17 : mx
    p.set(edge, my + 6, '#8a8868').set(edge, my + 8, '#6a6850')
  }
  // facing away (left) at the start and the end, toward Picard (right) in between
  const awayOn: [number, number][] = [[0, 2.4], [13.6, dur]]
  const towardOn: [number, number][] = [[2.4, 13.6]]
  const raised: [number, number][] = [[5.1, 12.8]]
  const madAway = crabHD(M, mx, my, 'left', dur, { left: [], right: [] }, [], 6.2, madredDetails('left'))
  const madToward = crabHD(M, mx, my, 'right', dur, { left: [], right: raised }, [], 6.2, madredDetails('right'))
  // the claw on its way up and on its way down: reaching out toward the lights
  const mid = new Pix()
  for (let i = 0; i < 4; i++) mid.rect(mx + 20 + i, my + 3 - i, 2, 1, M.skin).set(mx + 20 + i, my + 4 - i, M.shade)
  mid.rect(mx + 23, my - 3, 1, 2, M.skin).rect(mx + 26, my - 3, 1, 2, M.skin).rect(mx + 23, my - 1, 4, 1, M.skin).set(mx + 23, my - 3, M.light).set(mx + 26, my - 3, M.light)
  let mad = shown(madAway, awayOn, dur) + shown(madToward, towardOn, dur)
  mad += shown(mid.svg(), [[4.75, 5.1], [12.8, 13.25]], dur)
  // the walk: a few unhurried steps in, later the same steps back out
  const walk: [number, number, number][] = [[0, -6, 0]]
  for (let k = 0; k < 6; k++) {
    const t = 2.8 + k * 0.3
    walk.push([t, -5 + k, -1], [t + 0.15, -5 + k, 0])
  }
  for (let k = 0; k < 6; k++) {
    const t = 14.0 + k * 0.3
    walk.push([t, -1 - k, -1], [t + 0.15, -1 - k, 0])
  }
  const walkAnim = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${walk.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${kt(walk.map(w => w[0]))}"/>`
  s += `<g>${mad}${walkAnim}</g>`

  // ---- Picard: hung by the wrists ----
  const P = COC_PICARD
  let pic = crabHD(
    P, px, py, 'left', dur,
    { left: [[0, dur]], right: [[0, dur]] },
    [],
    4.3,
    p => {
      // rumpled uniform: a torn seam and a crease
      p.set(px + 13, py + 8, '#7a161c').set(px + 14, py + 9, '#7a161c').set(px + 5, py + 8, '#c94048')
      // grey fringe of hair at the temples
      p.rect(px, py + 2, 1, 2, '#8e8a86').rect(px + 17, py + 2, 1, 2, '#b4b0aa')
      // furrowed brow
      p.rect(px + 3, py + 1, 4, 1, P.shade).rect(px + 9, py + 1, 4, 1, P.shade)
    },
  )
  // exhausted: heavy, half-closed eyelids (again while he hesitates)
  const lids = new Pix()
  for (const e of [4, 10]) lids.rect(px + e, py + 2, 2, 2, P.shade).rect(px + e, py + 2, 2, 1, P.skin)
  pic += shown(lids.svg(), [[0, 4.9], [9.7, 10.3]], dur)
  // he looks up and right at the fifth light
  const glance = new Pix()
  for (const e of [4, 10]) glance.rect(px + e, py + 2, 2, 3, P.skin)
  for (const e of [6, 12]) glance.rect(px + e, py + 1, 2, 3, EYE_HD)
  pic += shown(glance.svg(), [[8.0, 9.7]], dur)
  // defiance: brows drawn down hard
  const brows = new Pix()
  brows.set(px + 3, py + 1, P.shade).rect(px + 5, py + 1, 2, 1, '#6e2f20').set(px + 7, py + 2, '#6e2f20')
  brows.set(px + 9, py + 2, '#6e2f20').rect(px + 10, py + 1, 2, 1, '#6e2f20').set(px + 13, py + 1, P.shade)
  pic += shown(brows.svg(), [[10.3, dur]], dur)
  // iron manacles at both wrists
  const cuffs = new Pix()
  for (const ax of [px - 3, px + 19]) {
    cuffs.rect(ax - 1, py - 4, 4, 2, '#4f4940').rect(ax - 1, py - 4, 4, 1, '#8d8578').set(ax + 2, py - 3, '#2e2a25')
  }
  pic += cuffs.svg()
  // sweat running down his head
  pic += `<rect x="${(px + 15) * Q}" y="${(py + 1) * Q}" width="${Q}" height="${Q}" fill="#cfe4ff" opacity="0"><animate attributeName="y" values="${(py + 1) * Q};${(py + 5) * Q}" dur="2.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.8;1" dur="2.5s" repeatCount="indefinite"/></rect>`
  // the shout: mouth wide open, a few strokes of sound
  const shout = new Pix().rect(px + 6, py + 4, 4, 2, '#3a0f16').rect(px + 7, py + 5, 2, 1, '#8e2a32')
  for (const [sx, sy] of [[px - 7, py + 1], [px - 8, py + 4], [px - 7, py + 7]] as [number, number][]) shout.rect(sx, sy, 2, 1, '#e8d8b8')
  pic += shown(shout.svg(), [[10.5, 12.7]], dur)
  // body: sagging until he gathers himself, then three jolts upward
  const bodyK = [0, 10.3]
  const bodyV = [`0 ${Q}`, '0 0']
  for (const [a, b] of jolts) bodyK.push(a, b), bodyV.push(`0 ${-Q}`, '0 0')
  const bodyAnim = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${bodyV.join(';')}" keyTimes="${kt(bodyK)}"/>`
  s += `<g>${pic}${bodyAnim}</g>`

  return s
}

// ---------- Q Who: "Welcome to the Borg" ----------
// The Enterprise cruises. Q turns, smug, raises a claw and snaps: a Borg cube
// slowly looms out of the dark, the sky goes sickly green, and a tractor beam
// drags the little ship in. Q glances back, pleased, hops; snaps again; it all goes away.

const QW_Q: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f6a77c',
}

function qwSparkle(cx: number, cy: number, r: number, core: string, ray: string) {
  const p = new Pix()
  for (let i = 1; i <= r; i++) {
    const c = i === r ? ray : core
    p.set(cx - i, cy, c).set(cx + i, cy, c).set(cx, cy - i, c).set(cx, cy + i, c)
  }
  if (r >= 3) p.set(cx - 1, cy - 1, ray).set(cx + 1, cy - 1, ray).set(cx - 1, cy + 1, ray).set(cx + 1, cy + 1, ray)
  p.set(cx, cy, '#ffffff')
  return p.svg()
}

function qwCube() {
  let seed = 71
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const p = new Pix()
  const fx = 55
  const fy = 7
  const fw = 30
  const fh = 30
  const d = 6
  // front face: dark plating, seams every 6, pipes and boxes
  p.rect(fx, fy, fw, fh, '#2f3b32')
  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++) {
      if (j % 6 === 0 || i % 6 === 0) p.set(fx + i, fy + j, '#1f2922')
      else if (rnd() < 0.07) p.set(fx + i, fy + j, '#3a473d')
    }
  }
  for (let cj = 0; cj < fh; cj += 6) {
    for (let ci = 0; ci < fw; ci += 6) {
      const k = rnd()
      const x0 = fx + ci + 1
      const y0 = fy + cj + 1
      if (k < 0.3) {
        const r = y0 + 1 + Math.floor(rnd() * 3)
        p.rect(x0, r, 5, 1, '#55685a')
        p.rect(x0 + 1 + Math.floor(rnd() * 3), r + 1, 1, 2, '#4a5b4e')
      } else if (k < 0.55) {
        const c = x0 + 1 + Math.floor(rnd() * 3)
        p.rect(c, y0, 1, 5, '#4f6153')
        p.rect(c - 2, y0 + 2, 2, 1, '#4f6153')
      } else if (k < 0.8) {
        p.rect(x0 + 1, y0 + 1, 3, 3, '#3d4c40').rect(x0 + 1, y0 + 1, 3, 1, '#55685a').set(x0 + 2, y0 + 2, '#18201a')
      } else {
        p.rect(x0, y0 + 1, 5, 3, '#232c25').rect(x0 + 1, y0 + 2, 3, 1, '#2f8a4a')
      }
    }
  }
  // top face, lit
  for (let r = 1; r <= d; r++) {
    const y = fy - r
    const x = fx + r
    p.rect(x, y, fw, 1, r === d ? '#7a8e7c' : '#56695a')
    for (let i = 0; i < fw; i++) {
      if ((i + r) % 6 === 0) p.set(x + i, y, '#435346')
      else if (rnd() < 0.15) p.set(x + i, y, '#66796a')
    }
  }
  // side face, in shadow
  for (let k = 1; k <= d; k++) {
    const x = fx + fw - 1 + k
    p.rect(x, fy - k, 1, fh, '#1b231d')
    for (let j = 0; j < fh; j++) {
      if ((j + k) % 6 === 0) p.set(x, fy - k + j, '#141a15')
      else if (rnd() < 0.15) p.set(x, fy - k + j, '#28332b')
    }
  }
  // edges: lit top-front edge, front-left rim
  p.rect(fx, fy, fw, 1, '#8aa08c')
  p.rect(fx, fy, 1, fh, '#4a5c4d')
  for (let r = 1; r <= d; r++) p.set(fx + r, fy - r, '#8aa08c')
  let s = p.svg()
  // green lights deep in the hull, pulsing
  const lights = new Pix()
  ;[[58, 12], [64, 20], [71, 15], [78, 26], [61, 31], [74, 33], [82, 10], [68, 27]].forEach(([x, y]) => lights.set(x, y, '#5dff8a'))
  s += `<g>${lights.svg()}<animate attributeName="opacity" values="0.5;1;0.5" dur="2.4s" repeatCount="indefinite"/></g>`
  const lights2 = new Pix()
  ;[[62, 16], [77, 19], [66, 34], [80, 30], [59, 24]].forEach(([x, y]) => lights2.set(x, y, '#9dffb5'))
  s += `<g>${lights2.svg()}<animate attributeName="opacity" values="1;0.45;1" dur="3.1s" repeatCount="indefinite"/></g>`
  return s
}

// Enterprise-D seen from the side, facing left: saucer, neck, engineering hull,
// nacelles on pylons with red bussards at the front
function qwShip(x: number, y: number) {
  const pal = {
    w: '#f2f2fa', W: '#cfd0dc', g: '#8f90a2', h: '#b9bac8', k: '#7a7b8e',
    n: '#a9aabb', p: '#8f90a2', N: '#d8d9e6', b: '#ff4a3a', c: '#6ac8ff', d: '#5ad8ff', o: '#ffe9a0',
  }
  return new Pix()
    .rows(
      [
        '...wwwwww.............',
        '.wWWWWWWWWw..bNNNNNNN.',
        'gWoWWoWWWWWg.bnnnnnnnn',
        '.gggggggggg...ccccccc.',
        '.....kh.......p.......',
        '......dhhhhhhhhk......',
        '......hhhhhhhhhk......',
        '.......kkkkkkkk.......',
      ],
      x,
      y,
      pal,
    )
    .svg()
}


// One smooth animation on the story timeline: keys are [seconds, value]
const QW_EASE = '0.42 0 0.58 1'
function qwAnim(attr: string, keys: [number, string][], tag = 'animate', extra = '') {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(4))
  kt[kt.length - 1] = 1
  const splines = k.slice(1).map(() => QW_EASE).join(';')
  return `<${tag} attributeName="${attr}" ${extra}dur="${T}s" repeatCount="indefinite" calcMode="spline" keySplines="${splines}" values="${k.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"/>`
}
const qwFade = (keys: [number, number][]) => qwAnim('opacity', keys.map(([t, v]) => [t, String(v)] as [number, string]))
const qwMove = (keys: [number, number, number][]) =>
  qwAnim('transform', keys.map(([t, x, y]) => [t, `${x} ${y}`] as [number, string]), 'animateTransform', 'type="translate" ')

// the right claw half raised, on its way up or down
function qwArmMid(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 4, 3, 2, k.skin)
  p.rect(x + 20, y + 1, 2, 3, k.skin).rect(x + 21, y + 1, 1, 3, k.shade)
  p.rect(x + 20, y, 4, 1, k.skin).rect(x + 20, y - 2, 1, 2, k.skin).rect(x + 23, y - 2, 1, 2, k.skin)
  p.set(x + 20, y - 2, k.light).set(x + 23, y - 2, k.light)
  return p.svg()
}

// the snap: a small sparkle at the claw that swells, drifts upward and fades
function qwSnap(x: number, y: number, t: number) {
  const art =
    `<circle cx="${x * Q + 1}" cy="${y * Q + 1}" r="9" fill="url(#qwSnapG)"/>` +
    qwSparkle(x, y, 2, '#fff3c0', '#ffd36b')
  return `<g opacity="0">${art}${qwFade([[t, 0], [t + 0.45, 1], [t + 0.8, 0.85], [t + 1.8, 0]])}${qwMove([[t, 0, 0], [t + 1.8, 0, -10]])}</g>`
}

function qWho() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  // story beats (seconds)
  const turn1 = 2.8 // Q turns to the ship, smug
  const snap1 = 4.9 // first snap
  const cubeIn: [number, number] = [5.1, 7.5]
  const beamOut: [number, number] = [7.6, 9.0]
  const drag: [number, number] = [9.0, 12.4]
  const look: [number, number] = [9.7, 12.2] // glances back over his shoulder
  const snap2 = 13.3
  const beamBack: [number, number] = [13.5, 14.3]
  const cubeOut: [number, number] = [14.2, 16.2]

  let s = `<defs>
    <linearGradient id="qwSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e0a1c"/><stop offset="1" stop-color="#22183a"/></linearGradient>
    <linearGradient id="qwFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="qwFade"><rect width="${W}" height="${H}" fill="url(#qwFadeG)"/></mask>
    <radialGradient id="qwNeb"><stop offset="0" stop-color="#9b7bd6" stop-opacity="0.2"/><stop offset="1" stop-color="#9b7bd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="qwBorgGlow"><stop offset="0" stop-color="#3dff7a" stop-opacity="0.2"/><stop offset="0.6" stop-color="#2bd060" stop-opacity="0.06"/><stop offset="1" stop-color="#2bd060" stop-opacity="0"/></radialGradient>
    <radialGradient id="qwLock"><stop offset="0" stop-color="#5dff8a" stop-opacity="0.25"/><stop offset="1" stop-color="#5dff8a" stop-opacity="0"/></radialGradient>
    <radialGradient id="qwSnapG"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.75"/><stop offset="0.5" stop-color="#ffe7a0" stop-opacity="0.25"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- deep space, fading in from the band on the left
  let back = `<rect width="${W}" height="${H}" fill="url(#qwSky)"/>`
  back += `<ellipse cx="${30 * Q}" cy="${14 * Q}" rx="70" ry="22" fill="url(#qwNeb)"/>`
  let seed = 29
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let y = 1; y < 46; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.66) continue
      const o = 0.1 + rnd() * 0.3
      const jx = x + Math.floor(rnd() * 2)
      if (jx < 35 && y > 41) continue
      back += `<rect x="${jx * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#cdbaf0" opacity="${o.toFixed(2)}"/>`
    }
  }
  ;[[26, 3], [44, 26], [40, 40], [16, 12], [88, 42]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${glow.svg()}<animate attributeName="opacity" values="0.15;0.8;0.15" dur="${2.6 + i * 0.7}s" begin="${i * 0.6}s" repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0.6;1;0.6" dur="${2.6 + i * 0.7}s" begin="${i * 0.6}s" repeatCount="indefinite"/></g>`
  })
  // System J-25: the sky slowly turns sickly green while the Borg are here
  back += `<rect width="${W}" height="${H}" fill="#0f3a22" opacity="0">${qwFade([[cubeIn[0], 0], [cubeIn[1] + 0.4, 0.42], [cubeOut[0], 0.42], [cubeOut[1], 0]])}</rect>`
  s += `<g mask="url(#qwFade)">${back}</g>`

  // ---- the cube: fades in and grows out of the dark around its centre, holds, then fades away
  const ccx = 70 * Q
  const ccy = 21 * Q
  const grow = qwAnim('transform', [[cubeIn[0], '0.55'], [cubeIn[1], '1'], [cubeOut[0], '1'], [cubeOut[1], '0.8']], 'animateTransform', 'type="scale" ')
  s += `<g opacity="0">${qwFade([[cubeIn[0], 0], [cubeIn[1], 1], [cubeOut[0], 1], [cubeOut[1], 0]])}<g transform="translate(${ccx} ${ccy})"><g>${grow}<g transform="translate(${-ccx} ${-ccy})"><ellipse cx="${ccx}" cy="${ccy}" rx="80" ry="54" fill="url(#qwBorgGlow)"/>${qwCube()}</g></g></g></g>`

  // ---- Enterprise-D: cruises in from the right, is held and dragged, then drifts free
  const sx = 30
  const sy = 7
  const hold: [number, number] = [-4, -1]
  const pulled: [number, number] = [6, 4]
  const shipKeys: [number, number, number][] = [
    [0, 36, -6], [beamOut[0], ...hold], [drag[0], ...hold], [drag[1], ...pulled], [beamBack[1], ...pulled], [T, -16, -2],
  ]

  // tractor beam: narrow at the cube's emitter, spreading over the ship; it reaches out
  // steadily, follows the ship as it is dragged, and pulls back in on the second snap
  const tip = (dx: number, dy: number, a: [number, number], b: [number, number]) =>
    `${a[0] * Q + dx},${a[1] * Q + dy} ${b[0] * Q + dx},${b[1] * Q + dy}`
  const poly = (cube: [number, number][], a: [number, number], b: [number, number], fill: string, op: number) => {
    const base = cube.map(([x, y]) => `${x * Q},${y * Q}`).join(' ')
    const shut = `${base} ${54 * Q},${21 * Q} ${54 * Q},${19 * Q}`
    const at = (p: [number, number]) => `${base} ${tip(p[0], p[1], a, b)}`
    const keys: [number, string][] = [
      [beamOut[0], shut], [beamOut[1], at(hold)], [drag[1], at(pulled)], [beamBack[0], at(pulled)], [beamBack[1], shut],
    ]
    return `<polygon points="${shut}" fill="${fill}" opacity="${op}">${qwAnim('points', keys)}</polygon>`
  }
  const beam =
    poly([[55, 17], [55, 23]], [sx + 5, sy + 8], [sx + 21, sy + 1], '#3dff7a', 0.26) +
    poly([[55, 19], [55, 21]], [sx + 11, sy + 6], [sx + 16, sy + 3], '#b5ffc8', 0.45)
  const emit = new Pix().rect(55, 18, 2, 4, '#9dffb5').set(55, 19, '#ffffff').set(55, 20, '#ffffff').rect(54, 19, 1, 2, '#5dff8a')
  s += `<g opacity="0">${beam}${emit.svg()}${qwFade([[beamOut[0] - 0.5, 0], [beamOut[0], 1], [beamBack[1], 1], [beamBack[1] + 0.6, 0]])}</g>`

  // the ship, with a soft green lock halo and a slow 1 px shudder while it is held
  const halo = `<ellipse cx="${(sx + 11) * Q}" cy="${(sy + 4) * Q}" rx="30" ry="14" fill="url(#qwLock)" opacity="0">${qwFade([[beamOut[1] - 0.3, 0], [beamOut[1] + 0.7, 1], [beamBack[0], 1], [beamBack[1] + 0.4, 0]])}</ellipse>`
  const jig = ['0 0', '1 0', '1 1', '0 1']
  const jv = ['0 0']
  const jt = [0]
  let n = 0
  for (let t = drag[0]; t < beamBack[0]; t += 0.35) jt.push(+(t / T).toFixed(4)), jv.push(jig[n++ % jig.length])
  jt.push(+(beamBack[0] / T).toFixed(4)), jv.push('0 0')
  const shudder = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${T}s" repeatCount="indefinite" values="${jv.join(';')}" keyTimes="${jt.join(';')}"/>`
  s += `<g>${qwMove(shipKeys)}${halo}<g>${qwShip(sx, sy)}${shudder}</g></g>`

  // ---- Q: Starfleet captain's red, four pips, one eyebrow up
  const qx = 12
  const qy = 28
  const insignia = (p: Pix) => {
    for (const c of [11, 13, 15]) p.set(qx + c, qy + 6, '#e8c547')
    p.set(qx + 9, qy + 6, '#e8c547')
    p.rect(qx + 4, qy + 7, 2, 2, '#e8c547').set(qx + 4, qy + 7, '#fff3b0')
  }
  const brow = '#5a2a1c'
  const lookingLeft: [number, number][] = [[0, turn1], look]
  const lookingRight: [number, number][] = [[turn1, look[0]], [look[1], T]]
  const raised: [number, number][] = [[4.1, 6.0], [12.75, 14.25]]
  const midArm: [number, number][] = [[3.7, 4.1], [6.0, 6.4], [12.4, 12.75], [14.25, 14.65]]
  // facing out at us (left): one eye half-lidded, the other brow arched
  const qLeft = crabHD(QW_Q, qx, qy, 'left', T, { left: [], right: [] }, [], 4.7, p => {
    p.rect(qx + 4, qy + 2, 2, 1, QW_Q.shade)
    p.set(qx + 9, qy + 1, brow).rect(qx + 10, qy, 2, 1, brow).set(qx + 12, qy + 1, brow)
    insignia(p)
  })
  // facing the ship (right)
  const qRight = crabHD(QW_Q, qx, qy, 'right', T, { left: [], right: raised }, [], 4.3, p => {
    p.rect(qx + 6, qy + 2, 2, 1, QW_Q.shade)
    p.set(qx + 11, qy + 1, brow).rect(qx + 12, qy, 2, 1, brow).set(qx + 14, qy + 1, brow)
    insignia(p)
  })
  // the open claw closes on each snap
  const cx = qx + 18
  const cy = qy - 8
  const closed = new Pix().rect(cx + 1, cy + 1, 2, 2, QW_Q.skin).set(cx + 1, cy, QW_Q.light).set(cx + 2, cy, QW_Q.light)
  let qs = shown(qLeft, lookingLeft, T) + shown(qRight, lookingRight, T)
  qs += shown(qwArmMid(QW_Q, qx, qy), midArm, T)
  qs += shown(closed.svg(), [[snap1, 6.0], [snap2, 14.25]], T)
  // green rim light from the cube on his right side, coming and going with it
  const rim = new Pix().rect(qx + 17, qy + 1, 1, 5, '#8fe0a0').rect(qx + 18, qy + 4, 3, 1, '#8fe0a0')
  qs += `<g opacity="0">${rim.svg()}${qwFade([[cubeIn[0], 0], [cubeIn[1], 0.8], [cubeOut[0], 0.8], [cubeOut[1], 0]])}</g>`
  // pleased with himself: three small hops while he watches over his shoulder
  s += `<g>${qs}${hopQ([[10.3, 10.55], [10.95, 11.2], [11.6, 11.85]], T)}</g>`

  // the snaps: small sparkles at the claw
  s += qwSnap(cx + 1, cy - 2, snap1) + qwSnap(cx + 1, cy - 2, snap2)
  return s
}

// ---------- Caretaker: "the displacement wave" ----------
// One 17.17 s story: Voyager cruises through the Badlands plasma. A soft,
// shimmering wave crosses slowly from the left, catches the ship, tilts it and
// pulls it away while the plasma dissolves into calm Delta Quadrant space with
// the Caretaker's array. Janeway's chair rocks, settles; she looks up at the
// array and raises her claw. No flashes: every change is slow and local.

const CT_JANEWAY: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#b3262e',
  lower: '#1c1424',
  lowerShade: '#120c18',
  legs: '#1c1424',
  rim: '#f6a77c',
}

function ctRnd(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

// translate jitter, discrete steps between t0 and t1 (seconds), amp in CSS px
function ctJitter(t0: number, t1: number, step: number, amp: number, dur: number, seed: number) {
  const r = ctRnd(seed)
  const times = [0]
  const vals = ['0 0']
  for (let t = t0; t < t1 - 1e-6; t += step) {
    times.push(t / dur)
    const dx = Math.round((r() * 2 - 1) * amp)
    const dy = Math.round((r() * 2 - 1) * amp * 0.6)
    vals.push(`${dx} ${dy}`)
  }
  times.push(t1 / dur), vals.push('0 0')
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}"/>`
}

// Voyager seen from above, bow to the right: 32 x 13 art pixels
function ctShip() {
  const p = new Pix()
  const L = '#e8e4f0'
  const M = '#bab4ca'
  const S = '#837c98'
  const D = '#4e4862'
  const cy = 6
  const tone = (y: number) => (y < cy ? L : y === cy ? M : S)
  // engineering hull
  for (let c = 3; c <= 15; c++) {
    const h = c === 3 ? 1 : 2
    for (let y = cy - h; y <= cy + h; y++) p.set(c, y, tone(y))
    p.set(c, cy + h, D)
  }
  p.set(3, cy, '#7fd4ff').set(2, cy, '#3f7fb8') // shuttlebay glow aft
  // pylons sweeping out to the nacelles
  p.rect(8, 3, 2, 1, M).rect(9, 2, 2, 1, L)
  p.rect(8, 9, 2, 1, S).rect(9, 10, 2, 1, D)
  // nacelles: grey casing, blue warp glow, red bussard at the front
  const nacelle = (y: number) => {
    p.rect(1, y, 12, 1, y < cy ? L : M)
    p.rect(1, y + 1, 12, 1, '#4fb8f0').rect(3, y + 1, 8, 1, '#a8e6ff')
    p.rect(1, y + 2, 12, 1, y < cy ? S : D)
    p.set(0, y + 1, S)
    p.set(13, y, '#a83a2a').set(13, y + 1, '#ff6a4a').set(13, y + 2, '#a83a2a')
  }
  nacelle(0)
  nacelle(10)
  // the arrowhead saucer
  for (let c = 12; c <= 31; c++) {
    const h = c === 12 ? 2 : c === 13 ? 3 : c <= 21 ? 4 : Math.max(0, Math.round((31.5 - c) * 0.42))
    for (let y = cy - h; y <= cy + h; y++) p.set(c, y, tone(y))
    p.set(c, cy - h, c > 13 ? '#f8f6ff' : L)
    p.set(c, cy + h, D)
  }
  // windows, bridge dome, impulse glow
  for (let c = 15; c <= 25; c += 2) p.set(c, cy - 2, '#ffe9a0').set(c + 1, cy + 2, '#d9b860')
  p.set(22, cy, '#ffffff').set(21, cy, L)
  p.set(12, cy - 1, '#ff8a5a').set(12, cy + 1, '#ff8a5a')
  return p.svg()
}

// The Caretaker's array: a hub bristling with long spines, lights on the tips
function ctArray(cx: number, cy: number) {
  const p = new Pix()
  const spines: [number, number, number][] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2
    spines.push([Math.cos(a), Math.sin(a), i % 2 ? 9 : 13])
  }
  for (const [dx, dy, len] of spines) {
    for (let r = 4; r <= len; r++) {
      const x = Math.round(cx + dx * r)
      const y = Math.round(cy + dy * r * 0.85)
      const lit = dx + -dy > 0.3
      p.set(x, y, r === len ? '#e8e2f4' : lit ? '#a8a0b8' : '#6a6478')
      if (r < len - 3 && r > 5) p.set(x + (Math.abs(dx) > Math.abs(dy) ? 0 : 1), y + (Math.abs(dx) > Math.abs(dy) ? 1 : 0), lit ? '#7a7290' : '#4e4862')
    }
  }
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y
      if (d > 26) continue
      let c = '#7a7290'
      if (x - y > 2) c = '#a8a0bc'
      if (x - y > 5) c = '#cfc8de'
      if (x - y < -3) c = '#4e4862'
      if (d > 19) c = x - y > 0 ? '#9a92ae' : '#3e3852'
      p.set(cx + x, cy + y, c)
    }
  }
  // ring of ports around the hub
  for (const [x, y] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [2, -2], [-2, 2]]) p.set(cx + x, cy + y, '#3a344a')
  p.rect(cx - 1, cy - 1, 3, 3, '#c9f0ff').set(cx, cy, '#ffffff')
  return p.svg()
}

// one extra arm frame for Janeway: the right claw on its way up
function ctArmMid(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 3, 3, 2, k.skin).rect(x + 20, y + 1, 2, 2, k.skin).rect(x + 21, y - 1, 2, 2, k.skin)
  p.rect(x + 18, y + 5, 2, 1, k.shade).set(x + 22, y + 1, k.shade)
  p.rect(x + 20, y - 3, 1, 2, k.skin).rect(x + 23, y - 3, 1, 2, k.skin).rect(x + 20, y - 2, 4, 1, k.skin)
  p.set(x + 20, y - 3, k.light).set(x + 23, y - 3, k.light)
  return p.svg()
}

function caretaker() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const k = (t: number) => +(t / T).toFixed(4)
  const kt = (ts: number[]) => ts.map(k).join(';')
  // the story, in seconds
  const WAVE0 = 3.6 // the wave appears at the left edge
  const WAVE1 = 8.8 // and has left on the right
  const CAUGHT = 5.9 // its front reaches Voyager
  const FADE0 = 8.4 // the plasma starts to dissolve
  const FADE1 = 11.0 // the Delta Quadrant is all that is left
  const LOOK = 11.6 // Janeway looks up at the array
  const ARM = 12.5 // and raises her claw

  let s = `<defs>
    <linearGradient id="ctFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="ctFade"><rect width="${W}" height="${H}" fill="url(#ctFadeG)"/></mask>
    <linearGradient id="ctStormSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e0f2c"/><stop offset="1" stop-color="#2e1530"/></linearGradient>
    <linearGradient id="ctCalmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0d22"/><stop offset="1" stop-color="#1a1838"/></linearGradient>
    <linearGradient id="ctWaveG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fc8ff" stop-opacity="0"/><stop offset="0.3" stop-color="#a8d4ff" stop-opacity="0.22"/><stop offset="0.55" stop-color="#cfe4ff" stop-opacity="0.38"/><stop offset="0.75" stop-color="#c9b4ff" stop-opacity="0.2"/><stop offset="1" stop-color="#c9a7ff" stop-opacity="0"/></linearGradient>
    <radialGradient id="ctNacG"><stop offset="0" stop-color="#6fd0ff" stop-opacity="0.5"/><stop offset="1" stop-color="#6fd0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ctArrG"><stop offset="0" stop-color="#bfe6ff" stop-opacity="0.3"/><stop offset="1" stop-color="#bfe6ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ctNebG"><stop offset="0" stop-color="#3fa8a0" stop-opacity="0.22"/><stop offset="1" stop-color="#3fa8a0" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- the Delta Quadrant underneath: calm stars, a teal nebula, the array ----
  let calm = `<rect width="${W}" height="${H}" fill="url(#ctCalmSky)"/>`
  calm += `<ellipse cx="${36 * Q}" cy="${12 * Q}" rx="70" ry="20" fill="url(#ctNebG)"/>`
  const rs = ctRnd(23)
  const starD = ['', '', '']
  for (let y = 1; y < 41; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rs() < 0.5) continue
      starD[Math.floor(rs() * 3)] += `M${(x + Math.floor(rs() * 2)) * Q} ${y * Q}h2v2h-2z`
    }
  }
  starD.forEach((d, i) => (calm += `<path d="${d}" fill="#d4e2ff" opacity="${[0.15, 0.3, 0.48][i]}"/>`))
  ;[[28, 5], [52, 3], [60, 14], [40, 9], [88, 30]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#a8c4ff').set(x + 1, y, '#a8c4ff').set(x, y - 1, '#a8c4ff').set(x, y + 1, '#a8c4ff')
    calm += `<g>${glow.svg()}<animate attributeName="opacity" values="0.2;0.8;0.2" dur="${2.6 + i * 0.6}s" begin="${i * 0.5}s" repeatCount="indefinite"/></g>`
    calm += new Pix().set(x, y, '#ffffff').svg()
  })
  const ax = 77
  const ay = 11
  calm += `<circle cx="${(ax + 0.5) * Q}" cy="${(ay + 0.5) * Q}" r="30" fill="url(#ctArrG)"><animate attributeName="opacity" values="0.75;1;0.75" dur="4s" repeatCount="indefinite"/></circle>`
  calm += ctArray(ax, ay)
  ;[[ax - 9, ay - 7], [ax + 10, ay + 3], [ax - 6, ay + 9], [ax + 4, ay - 9]].forEach(([x, y], i) => {
    calm += `<g>${new Pix().set(x, y, '#9fe4ff').svg()}<animate attributeName="opacity" values="1;0.3;1" dur="${2 + i * 0.4}s" repeatCount="indefinite"/></g>`
  })

  // ---- the Badlands on top: plasma currents drifting slowly, then dissolving ----
  let storm = `<rect width="${W}" height="${H}" fill="url(#ctStormSky)"/>`
  const clouds = new Pix()
  for (let y = 0; y < 42; y++) {
    for (let x = 0; x < GW + 12; x++) {
      const band = Math.sin(y * 0.52 + 2.4 * Math.sin(x / 10 + y / 14) + x * 0.06)
      const swell = 0.5 + 0.5 * Math.sin(x / 13 - y / 9 + 1) - (y > 30 ? (y - 30) * 0.05 : 0)
      const v = band * 0.6 + swell * 0.9
      let c = ''
      if (v > 1.32) c = '#ffb46a'
      else if (v > 1.12) c = '#e8683e'
      else if (v > 0.85) c = '#a83a5e'
      else if (v > 0.5) c = '#5e2458'
      else if (v > 0.2) c = '#3a1a44'
      if (c) clouds.set(x, y, c)
    }
  }
  storm += `<g>${clouds.svg()}<animateTransform attributeName="transform" type="translate" values="0 0;${-12 * Q} 0" dur="${T}s" repeatCount="indefinite"/></g>`
  const stormG = `<g>${storm}<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="1;1;0;0" keyTimes="0;${kt([FADE0, FADE1])};1"/></g>`

  // ---- the bridge floor: dark, console lights glowing softly on the right ----
  const floor = new Pix().rect(0, 42, GW, 6, '#150f22').rect(0, 42, GW, 1, '#2a2140')
  floor.rect(40, 43, 48, 3, '#1f1832').rect(40, 43, 48, 1, '#3a2f55')
  let floorSvg = floor.svg()
  const pads: [number, string][] = [[43, '#f2b866'], [47, '#c9a7ff'], [51, '#ff8a5a'], [57, '#8fb8ff'], [61, '#f2b866'], [67, '#c9a7ff'], [73, '#ff8a5a'], [79, '#8fb8ff'], [83, '#f2b866']]
  pads.forEach(([x, c], i) => {
    floorSvg += `<g>${new Pix().rect(x, 44, 2, 1, c).svg()}<animate attributeName="opacity" values="1;0.4;1" dur="${1.8 + (i % 4) * 0.5}s" begin="${i * 0.3}s" repeatCount="indefinite"/></g>`
  })

  // ---- Voyager ----
  const ship = ctShip()
  const halo = `<ellipse cx="${7 * Q}" cy="${1.5 * Q}" rx="16" ry="5" fill="url(#ctNacG)"/><ellipse cx="${7 * Q}" cy="${11.5 * Q}" rx="16" ry="5" fill="url(#ctNacG)"/>`
  // centre of the ship in CSS px over the story: cruise, caught, pulled away, arrives
  const PT = [0, CAUGHT, 7.4, 10.2, 12.4, T]
  const pos = ['132 33', '132 33', '138 34', '158 46', '114 58', '110 58']
  const rot = ['0', '0', '-10', '-16', '0', '0']
  const scl = ['1', '1', '0.95', '0.55', '0.85', '0.85']
  const anim = (type: string, vals: string[]) =>
    `<animateTransform attributeName="transform" type="${type}" dur="${T}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="0;${kt(PT.slice(1, -1))};1" calcMode="spline" keySplines="${Array(vals.length - 1).fill('0.4 0 0.6 1').join(';')}"/>`
  const bob = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="0 0;0 ${Q};0 0" keyTimes="0;0.5;1" dur="3.2s" repeatCount="indefinite"/>`
  const shipG =
    `<g>${anim('translate', pos)}<g>${anim('rotate', rot)}<g>${anim('scale', scl)}` +
    `<g transform="translate(${-16 * Q} ${-6.5 * Q})"><g>${bob}<g>${ctJitter(CAUGHT, 7.6, 0.3, 2, T, 5)}` +
    `<g>${halo}<animate attributeName="opacity" values="0.75;1;0.75" dur="2.4s" repeatCount="indefinite"/></g>${ship}` +
    `</g></g></g></g></g></g>`

  // ---- the displacement wave: a soft shimmering band, crossing slowly ----
  const shimmer = new Pix()
  const rw = ctRnd(77)
  for (let y = 0; y < GH * 2; y += 3) {
    const off = Math.floor(rw() * 10)
    shimmer.rect(10 + off, y, 3 + Math.floor(rw() * 6), 1, rw() < 0.5 ? '#e6f4ff' : '#efe2ff')
  }
  const wave =
    `<g opacity="0"><g>` +
    `<rect x="0" y="0" width="${36 * Q}" height="${H}" fill="url(#ctWaveG)"/>` +
    `<g opacity="0.35"><g>${shimmer.svg()}</g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-GH * Q}" dur="6s" repeatCount="indefinite"/></g>` +
    `<animateTransform attributeName="transform" type="translate" dur="${T}s" repeatCount="indefinite" values="${-40 * Q} 0;${-40 * Q} 0;${W + 4} 0;${W + 4} 0" keyTimes="0;${kt([WAVE0, WAVE1])};1"/>` +
    `</g><animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${kt([WAVE0 - 0.6, WAVE0 + 0.8, WAVE1 - 0.6, WAVE1])};1"/></g>`

  let scene = `<g mask="url(#ctFade)">${calm}${stormG}${floorSvg}${shipG}${wave}</g>`

  // ---- Janeway in the command chair ----
  const jx = 14
  const jy = 28
  const chair = new Pix()
  chair.rect(jx - 2, jy - 3, 22, 13, '#3a3450').rect(jx - 2, jy - 3, 22, 1, '#5e5478')
  chair.rect(jx - 2, jy - 2, 1, 12, '#4a4262').rect(jx + 19, jy - 2, 1, 12, '#2a2440')
  chair.rect(jx + 1, jy - 2, 16, 1, '#4a4262')
  chair.rect(jx - 5, jy + 7, 5, 2, '#4a4262').rect(jx - 5, jy + 7, 5, 1, '#6e6488').set(jx - 5, jy + 8, '#2a2440')
  chair.rect(jx + 18, jy + 7, 5, 2, '#4a4262').rect(jx + 18, jy + 7, 5, 1, '#6e6488').set(jx + 22, jy + 8, '#2a2440')
  chair.rect(jx - 4, jy + 9, 1, 4, '#2a2440').rect(jx + 21, jy + 9, 1, 4, '#2a2440')
  chair.rect(jx + 7, jy + 10, 4, 4, '#2a2440')
  chair.set(jx + 20, jy + 7, '#f2b866').set(jx - 3, jy + 7, '#8fb8ff')
  let jane = chair.svg()
  jane += crabHD(
    CT_JANEWAY, jx, jy, 'right', T,
    { left: [], right: [[ARM, T]] },
    [],
    4.7,
    p => {
      const A = '#a8452a'
      const AL = '#c96a3e'
      const AD = '#7a2e1c'
      p.rect(jx + 2, jy - 1, 14, 1, A).rect(jx, jy, 18, 1, A).rect(jx, jy + 1, 4, 1, A).rect(jx, jy + 2, 2, 2, AD)
      p.rect(jx + 6, jy - 1, 8, 1, AL).rect(jx + 10, jy, 5, 1, AL)
      p.set(jx + 16, jy + 1, A).set(jx + 17, jy + 1, A)
      p.rect(jx - 2, jy - 3, 5, 3, A).rect(jx - 1, jy - 4, 3, 1, A)
      p.rect(jx, jy - 3, 2, 1, AL).set(jx - 2, jy - 1, AD).set(jx - 2, jy - 3, AD)
      p.rect(jx + 6, jy + 6, 6, 1, '#6e6878')
      for (const c of [13, 14, 15, 16]) p.set(jx + c, jy + 6, '#e8c547')
      p.rect(jx + 3, jy + 7, 2, 2, '#e8c547').set(jx + 3, jy + 7, '#fff3b0')
    },
  )
  // the claw on its way up, between resting and raised
  jane += shown(ctArmMid(CT_JANEWAY, jx, jy), [[ARM - 0.35, ARM]], T)
  // looking up and to the right, at the array
  const up = new Pix().rect(jx + 6, jy + 1, 9, 4, CT_JANEWAY.skin).rect(jx + 7, jy + 1, 2, 3, EYE_HD).rect(jx + 13, jy + 1, 2, 3, EYE_HD)
  jane += shown(up.svg(), [[LOOK, T]], T)
  // the chair rocks gently while the wave has the ship, then settles
  const rock = [0, 0, 2.5, -2, 2, -1.5, 1, 0, 0]
  const rockT = [0, CAUGHT, 6.6, 7.3, 8.0, 8.7, 9.4, 10.0, T]
  scene += `<g>${jane}<animateTransform attributeName="transform" type="rotate" dur="${T}s" repeatCount="indefinite" values="${rock.map(a => `${a} ${(jx + 9) * Q} ${(jy + 14) * Q}`).join(';')}" keyTimes="0;${kt(rockT.slice(1, -1))};1"/></g>`

  s += scene
  return s
}

// ---------- The Inner Light: Kamin plays the Ressikan flute at dusk ----------
// One 17.17 s story, played once:
//  0.0 - 6.0  dusk over Ressik. Kamin plays with his eyes shut, Eline listens,
//             notes drift slowly up. The sun sinks a little across the whole scene.
//  6.0 - 7.4  the melody ends; he lowers the flute and opens his eyes.
//  7.4 - 10.6 a point of light rises slowly from beyond the hills (the probe)
//             and settles high in the sky as a new star; they both look up.
// 10.6 - 13.2 they watch it together; Eline leans toward him.
// 13.2 - 17.17 he raises the flute and plays again, softly.

const INL_DUR = SCENE_SECONDS
const INL_PLAY: [number, number][] = [[0, 6.0], [13.8, SCENE_SECONDS]]
const INL_MOVE: [number, number][] = [[6.0, 6.6], [13.2, 13.8]] // flute half-way
const INL_REST: [number, number][] = [[6.6, 13.2]]

// value of a piecewise-linear curve at time t (held flat beyond its ends)
function inlAt(pts: [number, number][], t: number) {
  if (t <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [a, va] = pts[i - 1]
      const [b, vb] = pts[i]
      return b === a ? vb : va + ((vb - va) * (t - a)) / (b - a)
    }
  }
  return pts[pts.length - 1][1]
}
// a smooth opacity curve on the story timeline; points may start before 0
function inlFade(pts: [number, number][], dur: number) {
  const ts = [0, ...pts.map(p => p[0]).filter(t => t > 0 && t < dur), dur]
  const vals = ts.map(t => +inlAt(pts, t).toFixed(3))
  return `<animate attributeName="opacity" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${ts.map(t => +(t / dur).toFixed(4)).join(';')}"/>`
}
// a stepped move (whole art px) on the story timeline; points may start before 0
function inlPath(pts: [number, number, number][], dur: number) {
  let first = pts[0]
  for (const p of pts) if (p[0] <= 0) first = p
  const keep = pts.filter(p => p[0] > 0 && p[0] < dur)
  const list: [number, number, number][] = [[0, first[1], first[2]], ...keep]
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${list.map(l => `${l[1] * Q} ${l[2] * Q}`).join(';')}" keyTimes="${list.map(l => +(l[0] / dur).toFixed(4)).join(';')}"/>`
}

function inlHex(h: string) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function inlMix(a: string, b: string, t: number) {
  const A = inlHex(a)
  const B = inlHex(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
// colour at position t along a list of [pos, colour] stops
function inlRamp(stops: [number, string][], t: number) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1]
      const [b, cb] = stops[i]
      return inlMix(ca, cb, (t - a) / (b - a))
    }
  }
  return stops[stops.length - 1][1]
}

function inlLine(p: Pix, x0: number, y0: number, x1: number, y1: number, c: string) {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    p.set(x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) (err += dy), (x0 += sx)
    if (e2 <= dx) (err += dx), (y0 += sy)
  }
}

const INL_KAMIN = {
  skin: '#d27353', light: '#e8916c', shade: '#a65a40', rim: '#ffc27e',
  grey: '#b9b1bb', greyLight: '#e6dfe2', greyDark: '#857c8c',
  scarf: '#a8452a', scarfLight: '#cf6a3c', scarfDark: '#7a2e1e',
  tunic: '#b08a58', tunicLight: '#d0aa74', tunicDark: '#7e603c',
  trousers: '#4e3628', feet: '#2a1c16',
}
const INL_ELINE = {
  skin: '#d27353', light: '#e8916c', shade: '#a65a40', rim: '#ffc27e',
  hair: '#5a2e22', hairLight: '#8a4a32', hairDark: '#3e1e18',
  robe: '#6a4a6e', robeLight: '#8c6a88', robeDark: '#4a3252', trim: '#d0a868',
}
const INL_FLUTE = { hi: '#f0cf8a', mid: '#b98a4c', dark: '#6e4626', hole: '#3a2216', band: '#e8c547', tassel: '#c0402a' }

// Clawd's head and shoulders (no legs, no eyes): 18 x 10
function inlTorso(p: Pix, x: number, y: number, k: { skin: string; light: string; shade: string; rim: string }, rimSide: Side) {
  for (let j = 0; j < 6; j++) {
    const inset = j === 0 ? 1 : 0
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, j === 0 ? k.light : k.skin)
  }
  const far = rimSide === 'right' ? x : x + 17
  const near = rimSide === 'right' ? x + 17 : x
  p.rect(far, y + 1, 1, 5, k.shade)
  p.rect(near, y + 1, 1, 5, k.rim)
  p.set(rimSide === 'right' ? x + 16 : x + 1, y, k.rim)
}

function innerLightHD() {
  const dur = INL_DUR
  const W = GW * Q
  const H = GH * Q
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const SUNX = 58
  const SUNY = 29

  let s = `<defs>
    <linearGradient id="inlFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="inlFade"><rect width="${W}" height="${H}" fill="url(#inlFadeG)"/></mask>
    <radialGradient id="inlHalo"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.55"/><stop offset="0.35" stop-color="#ff9a52" stop-opacity="0.22"/><stop offset="1" stop-color="#ff7a4a" stop-opacity="0"/></radialGradient>
    <radialGradient id="inlWarm"><stop offset="0" stop-color="#ffb070" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
    <linearGradient id="inlShadeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1028" stop-opacity="0"/><stop offset="1" stop-color="#1a1028" stop-opacity="0.55"/></linearGradient>
  </defs>`

  // ---- sky: violet overhead down to amber at the horizon, one art row at a time
  const sky = new Pix()
  const skyStops: [number, string][] = [[0, '#1d1636'], [0.22, '#33224f'], [0.45, '#5e3062'], [0.62, '#93405e'], [0.78, '#cc6248'], [0.9, '#ec9150'], [1, '#f6bd6c']]
  for (let y = 0; y < 34; y++) sky.rect(0, y, GW, 1, inlRamp(skyStops, y / 33))
  // dithered seams so the bands do not read as stripes
  let back = sky.svg()

  // early stars in the violet
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rnd() * GW)
    const y = Math.floor(rnd() * 13)
    back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#e9dcff" opacity="${(0.15 + rnd() * 0.3 * (1 - y / 14)).toFixed(2)}"/>`
  }
  ;[[24, 3], [41, 6], [70, 2], [84, 7], [33, 10]].forEach(([x, y], i) => {
    const g = new Pix().set(x - 1, y, '#bba6ee').set(x + 1, y, '#bba6ee').set(x, y - 1, '#bba6ee').set(x, y + 1, '#bba6ee')
    back += `<g>${g.svg()}<animate attributeName="opacity" values="0.15;0.6;0.15" dur="${3.6 + i * 0.7}s" begin="${i * 0.7}s" repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#fff8ee').svg()}<animate attributeName="opacity" values="0.6;1;0.6" dur="${3.6 + i * 0.7}s" begin="${i * 0.7}s" repeatCount="indefinite"/></g>`
  })

  // the sun, low and large, sinking a little over the whole scene
  let sunG = `<circle cx="${(SUNX + 0.5) * Q}" cy="${(SUNY + 0.5) * Q}" r="62" fill="url(#inlHalo)"><animate attributeName="r" values="61;64;61" dur="11s" repeatCount="indefinite"/></circle>`
  const sun = new Pix()
  const R = 10
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = x * x + y * y
      if (d > R * R + 2) continue
      let c = inlRamp([[0, '#fff3c8'], [0.5, '#ffd88a'], [1, '#ff9e52']], (y + R) / (2 * R))
      if (d > (R - 1) * (R - 1) + 1) c = inlMix(c, '#ff8a4a', 0.45)
      sun.set(SUNX + x, SUNY + y, c)
    }
  }
  // haze bands across the lower disc
  for (const [yy, a] of [[3, 0.5], [6, 0.65]] as [number, number][]) {
    for (let x = -R; x <= R; x++) if (x * x + yy * yy <= R * R) sun.set(SUNX + x, SUNY + yy, inlMix('#ffb460', '#d86a4a', a))
  }
  sunG += sun.svg()
  back += `<g>${sunG}<animateTransform attributeName="transform" type="translate" values="0 0;0 ${4 * Q}" dur="${dur}s" repeatCount="indefinite"/></g>`
  // the evening deepening, very slowly
  back += `<rect width="${W}" height="${34 * Q}" fill="#1d1636" opacity="0"><animate attributeName="opacity" values="0;0.14" dur="${dur}s" repeatCount="indefinite"/></rect>`

  // thin lit clouds
  const clouds = new Pix()
  const cloud = (x: number, y: number, w: number, top: string, bot: string) => {
    clouds.rect(x + 2, y, w - 4, 1, top).rect(x, y + 1, w, 1, bot)
    clouds.rect(x + 3, y + 1, 3, 1, top)
  }
  cloud(36, 16, 18, '#a85068', '#e88a5c')
  cloud(60, 12, 22, '#8a4466', '#d2745a')
  cloud(50, 22, 22, '#c8605a', '#ffb468')
  cloud(14, 9, 14, '#5a3062', '#8a4466')
  back += `<g>${clouds.svg()}<animateTransform attributeName="transform" type="translate" values="0 0;${2 * Q} 0" dur="${dur}s" repeatCount="indefinite"/></g>`

  // far hills, a line of distant houses, near ridge
  const hills = new Pix()
  const fh: number[] = []
  for (let c = 0; c < GW; c++) {
    const h = 30 + Math.round(1.4 * Math.sin(c / 7 + 1) + 0.8 * Math.sin(c / 3.1))
    fh.push(h)
    const lit = Math.abs(c - SUNX) < 16
    hills.rect(c, h, 1, 36 - h, '#7a3e5c')
    hills.set(c, h, lit ? '#f0965e' : '#a6566a')
  }
  // distant village: little blocks and domes against the glow
  const far = new Pix()
  for (const [x, w, h] of [[69, 4, 3], [74, 3, 2]] as [number, number, number][]) {
    const base = fh[x] + 1
    far.rect(x, base - h, w, h, '#5e2e50')
    far.rect(x + 1, base - h - 1, w - 2, 1, '#5e2e50')
    far.set(x + w - 1, base - h, '#9a4a5e')
  }
  const farLights = new Pix().set(70, fh[70] - 1, '#ffcf6a')
  back += hills.svg() + far.svg() + `<g>${farLights.svg()}<animate attributeName="opacity" values="1;0.8;1" dur="5.5s" repeatCount="indefinite"/></g>`
  const ridge = new Pix()
  for (let c = 0; c < GW; c++) {
    const h = 34 + Math.round(1.1 * Math.sin(c / 5 + 2) + 0.6 * Math.sin(c / 2.3))
    ridge.rect(c, h, 1, 38 - h, '#5a2c4a')
    ridge.set(c, h, Math.abs(c - SUNX) < 12 ? '#b85a5a' : '#7a3a52')
  }
  back += ridge.svg()

  // dry, cracked ground: warm near the horizon, dark toward the viewer
  const ground = new Pix()
  const gStops: [number, string][] = [[0, '#8a4a40'], [0.2, '#5e3240'], [0.55, '#3a2236'], [1, '#221830']]
  for (let y = 36; y < GH; y++) ground.rect(0, y, GW, 1, inlRamp(gStops, (y - 36) / 11))
  // light path from the sun
  for (let x = SUNX - 10; x <= SUNX + 10; x++) ground.set(x, 36, Math.abs(x - SUNX) < 6 ? '#e09060' : '#b86c4c')
  // cracks in the dry earth
  const crack = (x: number, y: number, n: number, c: string) => {
    for (let i = 0; i < n; i++) {
      ground.set(x, y, c)
      x += rnd() < 0.5 ? 1 : 2
      if (rnd() < 0.45) y += rnd() < 0.5 ? 1 : -1
      if (rnd() < 0.2) ground.set(x, y + 1, c)
    }
  }
  crack(44, 43, 9, '#2c1c2c')
  crack(60, 44, 10, '#24172a')
  crack(72, 42, 7, '#3a2232')
  crack(48, 39, 6, '#5a3236')
  crack(80, 45, 8, '#22162a')
  // dead grass and pebbles
  for (const [x, y] of [[50, 40], [63, 38], [86, 41], [40, 44], [56, 46]] as [number, number][]) {
    ground.set(x, y, '#6a4634').set(x + 1, y - 1, '#8a5e40').set(x + 2, y, '#5e3e32')
  }
  for (const [x, y] of [[54, 42], [69, 46], [83, 38], [46, 37]] as [number, number][]) ground.set(x, y, '#5e4a52').set(x + 1, y, '#8a6a64')
  back += ground.svg()

  // ---- Ressik: stone houses with lit windows
  const house = new Pix()
  const glow = new Pix()
  const glow2 = new Pix()
  const stone = (x0: number, w: number, top: string, mid: string, dark: string, lit: Side, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x < x0 + w; x++) {
        let c = mid
        const edge = lit === 'right' ? x0 + w - 1 : x0
        const shadeE = lit === 'right' ? x0 : x0 + w - 1
        if (x === edge) c = top
        if (x === shadeE) c = dark
        // stone courses
        if (c === mid && (y - y0) % 4 === 3) c = inlMix(c, dark, 0.35)
        else if (c === mid && (y - y0) % 4 === 1 && (x * 5 + Math.floor((y - y0) / 4) * 3) % 9 === 0) c = inlMix(c, dark, 0.5)
        house.set(x, y, c)
      }
    }
  }
  const archWin = (p: Pix, x: number, y: number, c: string, hi: string) => {
    p.rect(x + 1, y, 1, 1, c).rect(x, y + 1, 3, 2, c).set(x + 1, y + 1, hi)
  }
  // left house (behind Kamin): two storeys, a shallow dome
  stone(6, 19, '#d08660', '#5e3a4c', '#3c2438', 'right', 18, 38)
  house.rect(5, 17, 21, 1, '#4a2c40').set(25, 17, '#e09468').set(24, 17, '#a8604e')
  for (let i = 0; i < 9; i++) {
    const half = Math.round(Math.sqrt(Math.max(0, 1 - (i / 8.5) ** 2)) * 5.5)
    const y = 16 - Math.floor(i / 2.2)
    if (i < 5) house.rect(15 - half, y, half * 2, 1, i === 0 ? '#4a2c40' : '#56344a').set(15 + half - 1, y, '#d88a62')
  }
  house.rect(13, 12, 4, 1, '#56344a').set(16, 12, '#d88a62').set(14, 11, '#4a2c40')
  archWin(glow, 9, 21, '#ffc35a', '#fff0b4')
  archWin(glow2, 19, 21, '#ffb24e', '#ffe6a0')
  house.rect(8, 21, 1, 3, '#2e1a2c').rect(18, 21, 1, 3, '#2e1a2c')
  // door with warm light spilling
  house.rect(11, 31, 5, 7, '#24142a').rect(12, 30, 3, 1, '#24142a')
  glow.rect(12, 32, 3, 6, '#e8944a').set(13, 31, '#e8944a').rect(13, 33, 1, 5, '#ffc06a')
  // a low wall and a pot by the house
  house.rect(0, 35, 6, 3, '#4a2c40').rect(0, 35, 6, 1, '#6a3e4a')
  house.rect(2, 33, 3, 2, '#8a4a34').set(4, 33, '#b8683e').rect(2, 32, 3, 1, '#5a3024')

  // right house (behind Eline)
  stone(70, 20, '#d08660', '#583648', '#3a2236', 'left', 22, 38)
  house.rect(69, 21, 21, 1, '#46283c').set(69, 21, '#e09468').set(70, 21, '#a8604e')
  house.rect(73, 19, 7, 2, '#4a2c40').set(73, 19, '#c88062').set(73, 20, '#a8604e')
  archWin(glow2, 76, 24, '#ffc35a', '#fff0b4')
  archWin(glow, 84, 24, '#ffb24e', '#ffe6a0')
  house.rect(79, 24, 1, 3, '#2e1a2c')

  back += house.svg()
  back += `<g>${glow.svg()}<animate attributeName="opacity" values="1;0.9;1" dur="6s" repeatCount="indefinite"/></g>`
  back += `<g>${glow2.svg()}<animate attributeName="opacity" values="0.92;1;0.92" dur="7.5s" repeatCount="indefinite"/></g>`
  back += `<ellipse cx="${13.5 * Q}" cy="${38 * Q}" rx="16" ry="5" fill="url(#inlWarm)"/>`

  // the dry tree, bare branches against the glow
  const tree = new Pix()
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x1 = Math.round(x + Math.cos(ang) * len)
    const y1 = Math.round(y - Math.sin(ang) * len)
    inlLine(tree, Math.round(x), Math.round(y), x1, y1, depth > 2 ? '#3a2030' : '#4a2838')
    if (depth === 0) return
    branch(x1, y1, ang + 0.45 + rnd() * 0.25, len * 0.68, depth - 1)
    branch(x1, y1, ang - 0.4 - rnd() * 0.25, len * 0.62, depth - 1)
  }
  tree.rect(86, 12, 2, 10, '#3a2030').set(87, 12, '#6a3a40').rect(85, 20, 1, 2, '#3a2030')
  branch(86, 12, 1.95, 7, 3)
  branch(87, 13, 1.25, 5, 2)
  branch(86, 16, 2.6, 6, 2)
  back += tree.svg()

  // golden dust in the still air
  for (let i = 0; i < 6; i++) {
    const x = 26 + i * 11
    const y = 14 + (i % 3) * 6
    const d = 7 + i
    back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#ffd89a" opacity="0"><animateMotion path="M0 0 q 10 -4 18 2 t 16 -4" dur="${d}s" begin="${i * 1.3}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.55;0" dur="${d}s" begin="${i * 1.3}s" repeatCount="indefinite"/></rect>`
  }

  // the probe: a point of light climbing out of the hills while he looks up
  // it climbs slowly (easing out as it nears its place) and settles as a new star
  {
    const t0 = 7.4
    const t1 = 10.6
    const X0 = 44
    const Y0 = 30
    const fx = 50
    const fy = 5
    // whole-pixel path: one step for every art px it moves
    const at = (t: number): [number, number] => {
      const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
      const e = 1 - (1 - f) * (1 - f)
      return [Math.round((fx - X0) * e), Math.round((fy - Y0) * e)]
    }
    const path = (lag: number) => {
      const out: [number, number, number][] = []
      let last = ''
      for (let t = t0 + lag; t <= t1 + lag + 0.001; t += 0.05) {
        const [x, y] = at(t - lag)
        if (`${x},${y}` === last) continue
        last = `${x},${y}`
        out.push([+t.toFixed(3), x, y])
      }
      return out
    }
    const head = new Pix().set(X0, Y0, '#ffffff')
    const halo = new Pix().set(X0 - 1, Y0, '#cfe6ff').set(X0 + 1, Y0, '#cfe6ff').set(X0, Y0 - 1, '#cfe6ff').set(X0, Y0 + 1, '#cfe6ff')
    const trail = (lag: number, c: string, o: number) =>
      `<g opacity="0">${inlFade([[t0 + lag, 0], [t0 + lag + 0.6, o], [t1 - 0.3, o], [t1 + 0.6, 0]], dur)}<g>${new Pix().set(X0, Y0, c).svg()}${inlPath(path(lag), dur)}</g></g>`
    back += trail(0.5, '#ffd2a0', 0.3) + trail(0.25, '#ffe8c8', 0.55)
    // the rising light fades in over the hills
    back += `<g opacity="0">${inlFade([[t0, 0], [t0 + 0.8, 1], [t1 + 0.4, 1], [t1 + 1.2, 0]], dur)}<g>${halo.svg()}${head.svg()}${inlPath(path(0), dur)}</g></g>`
    // where it settles: a small soft glow that rises and ebbs, then a star that stays
    back += `<circle cx="${(fx + 0.5) * Q}" cy="${(fy + 0.5) * Q}" r="5" fill="#dfeaff" opacity="0">${inlFade([[t1 - 0.3, 0], [t1 + 0.5, 0.22], [t1 + 1.8, 0.07], [dur, 0.06]], dur)}</circle>`
    const star = new Pix().set(fx, fy, '#ffffff').set(fx - 1, fy, '#cfe6ff').set(fx + 1, fy, '#cfe6ff').set(fx, fy - 1, '#cfe6ff').set(fx, fy + 1, '#cfe6ff')
    back += `<g opacity="0">${inlFade([[t1 - 0.2, 0], [t1 + 0.6, 1]], dur)}<g>${star.svg()}<animate attributeName="opacity" values="1;0.75;1" dur="3.4s" repeatCount="indefinite"/></g></g>`
  }

  s += `<g mask="url(#inlFade)">${back}</g>`

  // long shadows from the low sun, falling toward us and to the left
  const KX = 21
  const KY = 28
  const EX = 67
  const EY = 28
  const sh = new Pix()
  sh.rect(KX - 7, 41, 24, 1, '#1e1228').rect(KX - 12, 42, 22, 1, '#1e1228').rect(KX - 16, 43, 14, 1, '#1e1228')
  sh.rect(EX - 4, 41, 22, 1, '#1e1228').rect(EX - 8, 42, 20, 1, '#1e1228').rect(EX - 11, 43, 12, 1, '#1e1228')
  s += `<g opacity="0.5">${sh.svg()}</g>`

  // ---------- Kamin ----------
  const k = INL_KAMIN
  // legs stay planted; the body sways over them while he plays
  const legs = new Pix()
  for (const lx of [1, 5, 11, 15]) {
    legs.rect(KX + lx, KY + 10, 2, 3, k.trousers).set(KX + lx + 1, KY + 10, inlMix(k.trousers, k.rim, 0.25))
    legs.rect(KX + lx, KY + 13, 2, 1, k.feet)
  }
  s += legs.svg()

  const body = new Pix()
  inlTorso(body, KX, KY, k, 'right')
  // grey at the temples, a touch over the crown (Picard's horseshoe)
  body.rect(KX, KY + 1, 1, 4, k.grey).set(KX, KY + 1, k.greyLight).set(KX + 1, KY + 1, k.grey).set(KX + 1, KY + 2, k.greyDark).set(KX, KY + 4, k.greyDark)
  body.rect(KX + 17, KY + 1, 1, 4, k.greyLight).set(KX + 16, KY + 1, k.greyLight).set(KX + 16, KY + 2, k.grey).set(KX + 17, KY + 4, k.grey)
  // scarf wound at the neck, knotted, one tail hanging
  body.rect(KX, KY + 6, 18, 1, k.scarf)
  for (let i = 0; i < 18; i += 3) body.set(KX + i + 1, KY + 6, k.scarfLight)
  body.set(KX, KY + 6, k.scarfDark).set(KX + 17, KY + 6, k.scarfLight)
  // tunic, rough cloth
  body.rect(KX, KY + 7, 18, 3, k.tunic).rect(KX + 1, KY + 9, 16, 1, k.tunic)
  body.set(KX, KY + 9, k.tunicDark).rect(KX, KY + 7, 1, 2, k.tunicDark).rect(KX + 17, KY + 7, 1, 2, k.tunicLight)
  for (const [i, j] of [[3, 8], [8, 7], [13, 8], [10, 9], [15, 9]]) body.set(KX + i, KY + j, k.tunicDark)
  body.rect(KX + 1, KY + 9, 16, 1, k.tunicDark).set(KX + 16, KY + 9, k.tunicLight)
  body.set(KX, KY + 9, '#00000000').set(KX + 17, KY + 9, '#00000000')
  body.rect(KX + 5, KY + 7, 3, 1, k.scarf).set(KX + 6, KY + 7, k.scarfLight)
  body.rect(KX + 6, KY + 8, 2, 2, k.scarf).set(KX + 7, KY + 8, k.scarfDark).set(KX + 6, KY + 10, k.scarfDark).set(KX + 7, KY + 10, k.scarf)
  // left arm, resting
  body.rect(KX - 3, KY + 4, 3, 2, k.skin).rect(KX - 3, KY + 6, 3, 1, k.shade).set(KX - 3, KY + 4, k.light)

  let kamin = body.svg()

  // playing: eyes closed, flute at his mouth held out to the right
  const play = new Pix()
  play.rect(KX + 6, KY + 4, 2, 1, EYE_HD).rect(KX + 12, KY + 4, 2, 1, EYE_HD)
  play.set(KX + 5, KY + 3, k.shade).set(KX + 14, KY + 3, k.shade)
  // right arm out, claw around the flute
  play.rect(KX + 18, KY + 4, 3, 1, k.skin).set(KX + 20, KY + 4, k.light).rect(KX + 21, KY + 3, 1, 2, k.skin)
  play.rect(KX + 19, KY + 7, 2, 1, k.shade).set(KX + 21, KY + 7, k.skin)
  const fl = INL_FLUTE
  play.rect(KX + 9, KY + 5, 17, 1, fl.hi).rect(KX + 9, KY + 6, 17, 1, fl.mid)
  play.set(KX + 9, KY + 5, fl.dark).set(KX + 9, KY + 6, fl.dark)
  for (const hx of [12, 14, 16, 23]) play.set(KX + hx, KY + 5, fl.hole)
  play.rect(KX + 18, KY + 5, 1, 2, fl.band).rect(KX + 10, KY + 5, 1, 2, fl.band)
  play.rect(KX + 26, KY + 4, 1, 4, fl.mid).set(KX + 26, KY + 4, fl.hi).set(KX + 27, KY + 5, fl.dark).set(KX + 27, KY + 6, fl.dark)
  play.rect(KX + 24, KY + 7, 1, 2, fl.tassel).set(KX + 24, KY + 9, '#e8704a')
  // left claw lifted to steady it
  play.rect(KX - 3, KY + 3, 2, 1, k.skin).set(KX - 3, KY + 3, k.light)

  // resting: flute hanging from his right claw, eyes open
  const rest = new Pix()
  rest.rect(KX + 18, KY + 5, 3, 2, k.skin).rect(KX + 18, KY + 7, 3, 1, k.shade).set(KX + 20, KY + 5, k.light)
  rest.rect(KX + 21, KY + 5, 1, 10, fl.mid).set(KX + 21, KY + 5, fl.hi).set(KX + 21, KY + 14, fl.dark)
  rest.set(KX + 21, KY + 8, fl.band).set(KX + 21, KY + 11, fl.hole).set(KX + 21, KY + 12, fl.hole)
  rest.rect(KX + 22, KY + 6, 1, 2, fl.tassel)
  const eyesFwd = new Pix().rect(KX + 6, KY + 2, 2, 3, EYE_HD).rect(KX + 12, KY + 2, 2, 3, EYE_HD)
  const eyesUp = new Pix().rect(KX + 7, KY + 1, 2, 3, EYE_HD).rect(KX + 13, KY + 1, 2, 3, EYE_HD)
  // a glint of the new star in his eyes
  const glint = new Pix().set(KX + 8, KY + 1, '#fff2d8').set(KX + 14, KY + 1, '#fff2d8')
  const lids = new Pix().rect(KX + 7, KY + 1, 2, 3, k.skin).rect(KX + 13, KY + 1, 2, 3, k.skin).rect(KX + 7, KY + 3, 2, 1, EYE_HD).rect(KX + 13, KY + 3, 2, 1, EYE_HD)

  // half-way: flute angled down from his mouth, claw at his side (lowering / raising)
  const half = new Pix()
  half.rect(KX + 18, KY + 5, 3, 2, k.skin).set(KX + 20, KY + 5, k.light).rect(KX + 18, KY + 7, 3, 1, k.shade)
  inlLine(half, KX + 10, KY + 6, KX + 25, KY + 11, fl.mid)
  inlLine(half, KX + 10, KY + 5, KX + 25, KY + 10, fl.hi)
  half.set(KX + 10, KY + 5, fl.dark).set(KX + 10, KY + 6, fl.dark).set(KX + 25, KY + 10, fl.dark).set(KX + 25, KY + 11, fl.dark)
  half.set(KX + 13, KY + 6, fl.hole).set(KX + 16, KY + 7, fl.hole).set(KX + 19, KY + 7, fl.band).set(KX + 19, KY + 8, fl.band)
  half.rect(KX + 23, KY + 11, 1, 2, fl.tassel)
  const eyesShut = new Pix().rect(KX + 6, KY + 4, 2, 1, EYE_HD).rect(KX + 12, KY + 4, 2, 1, EYE_HD)

  kamin += shown(play.svg(), INL_PLAY, dur)
  kamin += shown(half.svg(), INL_MOVE, dur)
  kamin += shown(eyesShut.svg(), INL_MOVE, dur)
  kamin += shown(rest.svg(), INL_REST, dur)
  // eyes open ahead, then turn up to the light as it climbs
  kamin += shown(eyesFwd.svg(), [[6.6, 8.2], [12.9, 13.2]], dur)
  kamin += shown(eyesUp.svg(), [[8.2, 12.9]], dur)
  kamin += shown(glint.svg(), [[10.9, 11.6], [11.75, 12.9]], dur)
  kamin += shown(lids.svg(), [[11.6, 11.75]], dur)

  // sway: lean one pixel with the phrase while he plays, still while he watches
  const sway: [number, number, number][] = [[0, 0, 0]]
  let lean = 0
  for (let t = 1.2; t < 5.9; t += 1.2) sway.push([t, (lean ^= 1), 0])
  sway.push([5.9, 0, 0])
  lean = 0
  for (let t = 14.6; t < dur - 0.6; t += 1.4) sway.push([t, (lean ^= 1), 0])
  s += `<g>${kamin}${inlPath(sway, dur)}</g>`

  // notes drifting slowly up from the flute and fading
  const noteA = ['.#.', '.##', '.#.', '##.', '##.']
  const noteB = ['.####', '.#..#', '.#..#', '##.##', '##.##']
  const noteC = ['..#', '..#', '..#', '###', '##.']
  // first melody (one already afloat when the scene opens), then a soft reprise
  const notes: [number, number][] = [[-1.4, 1], [0.1, 1], [1.2, 1], [2.3, 1], [3.4, 1], [4.6, 1], [14.1, 0.75], [15.4, 0.7]]
  notes.forEach(([t0, peak], i) => {
    const len = 4.6
    const shape = [noteA, noteC, noteB][i % 3]
    const ox = KX + 23 + (i % 2)
    const oy = KY + 1
    const c = i % 2 ? '#ffe6b0' : '#fff4d6'
    const n = new Pix().rows(shape, ox, oy - shape.length, { '#': c }).svg()
    const steps: [number, number, number][] = []
    const N = 22
    const drift = i % 2 ? 1 : -1
    let last = ''
    for (let j = 0; j <= N; j++) {
      const f = j / N
      const dx = Math.round(drift * 2 * Math.sin(f * 4 + i) - f * (3 + (i % 3) * 2))
      const dy = -Math.round(f * 20)
      if (`${dx},${dy}` === last) continue
      last = `${dx},${dy}`
      steps.push([+(t0 + f * len).toFixed(3), dx, dy])
    }
    const op = inlFade([[t0, 0], [t0 + 0.6, peak], [t0 + len * 0.5, peak], [t0 + len, 0]], dur)
    s += `<g opacity="0">${op}<g>${n}${inlPath(steps, dur)}</g></g>`
  })

  // ---------- Eline ----------
  const e = INL_ELINE
  const el = new Pix()
  // long robe down to the ground instead of legs
  for (let j = 6; j < 14; j++) {
    const flare = j >= 12 ? 1 : 0
    el.rect(EX - flare, EY + j, 18 + 2 * flare, 1, j < 10 ? e.robe : e.robeDark)
    el.set(EX - flare, EY + j, j < 10 ? e.robeLight : e.robe)
    el.set(EX + 17 + flare, EY + j, e.robeDark)
  }
  for (const fx of [5, 9, 13]) el.rect(EX + fx, EY + 10, 1, 4, e.robe)
  el.rect(EX - 1, EY + 13, 20, 1, '#38243e')
  el.rect(EX, EY + 6, 18, 1, e.trim).set(EX + 17, EY + 6, '#9a7a4a')
  el.rect(EX + 4, EY + 7, 10, 1, e.robeLight).rect(EX + 8, EY + 7, 2, 2, e.trim)
  el.rect(EX + 1, EY + 9, 16, 1, e.robeDark)
  const head = new Pix()
  inlTorso(head, EX, EY, e, 'left')
  // hair: a dark auburn crown falling to the shoulders, a braid down the back
  head.rect(EX + 3, EY - 1, 12, 1, e.hair).rect(EX + 5, EY - 1, 4, 1, e.hairLight)
  head.rect(EX + 1, EY, 16, 1, e.hair).rect(EX + 2, EY, 5, 1, e.hairLight).set(EX + 1, EY, e.rim)
  head.rect(EX, EY + 1, 2, 7, e.hair).set(EX, EY + 1, e.hairLight).set(EX, EY + 2, e.rim).set(EX, EY + 3, e.hairLight)
  head.rect(EX + 16, EY + 1, 2, 9, e.hairDark).set(EX + 16, EY + 1, e.hair)
  head.set(EX + 2, EY + 1, e.hair).set(EX + 15, EY + 1, e.hair)
  // arms folded in front, claws together
  head.rect(EX - 3, EY + 5, 3, 2, e.skin).set(EX - 3, EY + 5, e.rim).rect(EX - 3, EY + 7, 3, 1, e.shade)
  head.rect(EX + 18, EY + 5, 3, 2, e.skin).rect(EX + 18, EY + 7, 3, 1, e.shade)
  let eline = el.svg()
  let upper = head.svg()
  const eLeft = new Pix().rect(EX + 4, EY + 2, 2, 3, EYE_HD).rect(EX + 10, EY + 2, 2, 3, EYE_HD)
  const eUp = new Pix().rect(EX + 3, EY + 1, 2, 3, EYE_HD).rect(EX + 9, EY + 1, 2, 3, EYE_HD)
  const eSoft = new Pix().rect(EX + 4, EY + 3, 2, 2, EYE_HD).rect(EX + 10, EY + 3, 2, 2, EYE_HD)
  const eBlink = new Pix().rect(EX + 4, EY + 4, 2, 1, EYE_HD).rect(EX + 10, EY + 4, 2, 1, EYE_HD)
  // listening half-lidded; looks at him when the music stops; follows the light up;
  // half-lidded again, leaning on him, when he plays once more
  upper += shown(eSoft.svg(), [[0, 3.0], [3.15, 7.0], [14.2, dur]], dur)
  upper += shown(eBlink.svg(), [[3.0, 3.15], [12.0, 12.15], [14.05, 14.2]], dur)
  upper += shown(eLeft.svg(), [[7.0, 8.6], [13.4, 14.05]], dur)
  upper += shown(eUp.svg(), [[8.6, 12.0], [12.15, 13.4]], dur)
  // she leans toward him as they watch the new star, and stays there
  eline += `<g>${upper}${inlPath([[0, 0, 0], [11.2, -1, 0], [11.9, -2, 0]], dur)}</g>`
  s += eline

  // warm rim of evening light on the two of them
  s += `<ellipse cx="${(SUNX - 2) * Q}" cy="${34 * Q}" rx="70" ry="16" fill="url(#inlWarm)"><animate attributeName="opacity" values="0.88;1;0.88" dur="10s" repeatCount="indefinite"/></ellipse>`
  // keep the title corner quiet
  s += `<rect x="0" y="${40 * Q}" width="${36 * Q}" height="${8 * Q}" fill="url(#inlShadeG)"/>`
  return s
}

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

// discrete positions on the story timeline: [time, dx, dy] in art pixels, held until the next key
function fpMove(keys: [number, number, number][]) {
  const ks = keys[0][0] === 0 ? keys : [[0, 0, 0] as [number, number, number], ...keys]
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${ks.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${fpKT(ks.map(k => k[0]))}"/>`
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
function fpArmHalf(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 4, 2, 2, k.skin)
  p.rect(x + 19, y + 1, 2, 5, k.skin).rect(x + 20, y + 1, 1, 5, k.shade)
  p.rect(x + 18, y - 2, 1, 2, k.skin).rect(x + 21, y - 2, 1, 2, k.skin)
  p.rect(x + 18, y, 4, 1, k.skin)
  p.set(x + 18, y - 2, k.light).set(x + 21, y - 2, k.light)
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
  const layer = (n: number, c: string, period: number, op: number) => {
    const p = new Pix()
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) pts.push([Math.floor(rnd() * 49), Math.floor(rnd() * 15)])
    for (const [x, y] of pts) p.set(31 + x, 4 + y, c).set(31 + x + 49, 4 + y, c)
    return `<g opacity="${op}">${p.svg()}<animateTransform attributeName="transform" type="translate" values="0 0;${-49 * Q} 0" dur="${period}s" repeatCount="indefinite"/></g>`
  }
  back += `<g clip-path="url(#fpScr)">${layer(22, '#8d8fc0', 40, 0.7)}${layer(9, '#e8ecff', 22, 1)}`
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
    back += i % 3 === 0 ? `<g>${r}<animate attributeName="opacity" values="1;0.4;1" dur="${2.2 + (i % 4) * 0.7}s" repeatCount="indefinite"/></g>` : r
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
  kit += shown(lowMaraca(qx - 3, qy + 6, '#e2452e', '#f2d04a'), complement(merge(leftUp), T), T)
  kit += shown(lowMaraca(qx + 20, qy + 6, '#3fa35a', '#f2d04a'), complement(merge([...rightShake, snapArm2]), T), T)
  q += `<g opacity="0">${kit}${fpFade([[costumeIn, 0], [costumeIn + 0.5, 1], [costumeOut, 1], [costumeOut + 0.6, 0]])}</g>`
  q += fpLegs(FP_Q, qx, qy)

  // arms: one up for each snap, then left and right in turn on the beat
  const qRightUp = merge([snapArm1, snapArm2, ...rightShake])
  q += shown(armRestHD(FP_Q, qx, qy, 'left'), complement(merge(leftUp), T), T)
  q += shown(armRestHD(FP_Q, qx, qy, 'right'), complement(qRightUp, T), T)
  q += shown(armUpHD(FP_Q, qx, qy, 'left'), leftUp, T)
  q += shown(armUpHD(FP_Q, qx, qy, 'right'), qRightUp, T)
  q += shown(maraca(qx - 4, qy - 13, '#e2452e', '#f2d04a'), leftUp, T)
  q += shown(maraca(qx + 19, qy - 13, '#3fa35a', '#f2d04a'), rightShake, T)
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
  pc += shown(half, [[4.5, 5.5], [11.6, 13.0]], T)
  pc += shown(narrow, [[5.5, 7.7], [14.2, T]], T)
  // eyes shut for the sigh, and a blink
  const shut = new Pix().rect(px0 + 4, py0 + 2, 2, 3, PICARD_HD.skin).rect(px0 + 10, py0 + 2, 2, 3, PICARD_HD.skin)
    .rect(px0 + 4, py0 + 4, 2, 1, PICARD_HD.shade).rect(px0 + 10, py0 + 4, 2, 1, PICARD_HD.shade).svg()
  pc += shown(shut, [sigh, [1.8, 1.95], [3.6, 3.75]], T)
  // the facepalm: the far eye squeezed shut, the claw over the near one
  const squeeze = new Pix().rect(px0 + 4, py0 + 2, 2, 3, PICARD_HD.skin).rect(px0 + 3, py0 + 3, 4, 1, PICARD_HD.shade).set(px0 + 3, py0 + 2, PICARD_HD.shade).svg()
  pc += shown(squeeze, [hold], T)
  // the claw comes up in steps, presses in, rubs the brow twice, and goes back down
  const palmKeys: [number, number, number][] = [
    [0, 6, 1], [6.9, 4, 1], [7.3, 2, 0], [7.7, 0, 0],
    [8.9, -1, 0], [9.5, 0, 0], [10.1, -1, 0], [10.7, 0, 0],
    [11.6, 2, 0], [11.9, 4, 1], [12.2, 6, 1],
  ]
  pc += shown(`<g>${fpPalm(px0, py0)}${fpMove(palmKeys)}</g>`, [palmOn], T)
  pc += shown(fpArmHalf(PICARD_HD, px0, py0), [raiseHalf, lowerHalf], T)
  pc += shown(armRestHD(PICARD_HD, px0, py0, 'left'), [[0, T]], T)
  pc += shown(armRestHD(PICARD_HD, px0, py0, 'right'), complement(merge([raiseHalf, palmOn, lowerHalf]), T), T)
  // he sinks a pixel into the facepalm and again into the sigh
  s += `<g>${pc}${fpMove([[0, 0, 0], [8.0, 0, 1], [11.6, 0, 0], [13.1, 0, 1], [14.1, 0, 0]])}</g>`
  s += fpLegs(PICARD_HD, px0, py0)
  // the sigh: a soft puff drifting off toward Q and thinning out
  const puff = new Pix().rect(px0 - 4, py0 + 4, 4, 3, '#cfc6dc').rect(px0 - 3, py0 + 3, 2, 1, '#ece6f4').set(px0 - 5, py0 + 5, '#a99fbb').set(px0, py0 + 6, '#a99fbb').svg()
  s += `<g opacity="0">${puff}${fpFade([[13.2, 0], [13.6, 0.8], [14.6, 0]])}${fpDrift([[13.2, 0, 0], [14.6, -14, -6]])}</g>`

  // the snap effects go on top
  s += snapFx(snap1, smokePts)
  s += snapFx(snap2, smokePts)
  return s
}

// ---------- Scorpion: Species 8472 against the Borg ----------
// One 17.17 s story. Calm space: Janeway and an 8472 in the foreground, a Borg
// cube ahead. The bioship's veins light up one by one and its orb charges; a
// steady beam reaches the cube; cracks creep across it; it splits and drifts
// apart in soft orange and green blooms. The 8472 turns to Janeway, and she
// raises a claw: her decision. Debris drifts on into a quiet ending.

const SC8_JANEWAY: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#b3262e', // command red shoulders
  lower: '#16121c', // black Voyager jacket
  lowerShade: '#0c0a10',
  legs: '#16121c',
  rim: '#ffd27a', // beam light from the right
}

const sc8K = (t: number) => +(t / SCENE_SECONDS).toFixed(4)

// translate in grid units along the story, keyed in seconds (must start at 0, end at SCENE_SECONDS)
function sc8Move(keys: [number, number, number][], discrete = false, easeOut = false) {
  const t = keys.map(k => sc8K(k[0])).join(';')
  const v = keys.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`).join(';')
  const mode = discrete ? ' calcMode="discrete"' : easeOut ? ` calcMode="spline" keySplines="${keys.slice(1).map(() => '0.25 0.6 0.45 1').join(';')}"` : ''
  return `<animateTransform attributeName="transform" type="translate"${mode} dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${v}" keyTimes="${t}"/>`
}

// opacity along the story, keyed in seconds (must start at 0, end at SCENE_SECONDS)
function sc8Fade(keys: [number, number][]) {
  const t = keys.map(k => sc8K(k[0])).join(';')
  const v = keys.map(k => k[1]).join(';')
  return `<animate attributeName="opacity" dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${v}" keyTimes="${t}"/>`
}

// a ragged disc: core, then three rings
function sc8Burst(cx: number, cy: number, r: number, ring: string[], seed: number, core = '#fffbe0') {
  let s = seed
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const p = new Pix()
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.sqrt(x * x + y * y) + (rnd() - 0.5) * 1.2
      if (d > r + 0.3) continue
      const f = d / (r + 0.3)
      const c = f < 0.3 ? core : f < 0.55 ? ring[0] : f < 0.8 ? ring[1] : ring[2]
      p.set(cx + x, cy + y, c)
    }
  }
  return sc8Path(p)
}

// Pix written as one <path> per colour: far smaller than one <rect> per run
function sc8Path(p: Pix) {
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

function scorpion() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let seed = 8472
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // ---- the story, in seconds ----
  const tVeins = 2.2 // the bioship's veins begin to glow, back to front
  const tOrb = 3.0 // the orb at the prongs starts to gather
  const tFire = 6.2 // the beam leaves the prongs...
  const tHit = 7.0 // ...and reaches the cube
  const tSplit = 9.6 // the cube gives way
  const tTurn = 12.2 // the 8472 turns to Janeway
  const tClaw = 13.8 // Janeway raises her claw

  let s = `<defs>
    <linearGradient id="sc8Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0a1c"/><stop offset="1" stop-color="#241a3a"/></linearGradient>
    <linearGradient id="sc8FadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="sc8Fade"><rect width="${W}" height="${H}" fill="url(#sc8FadeG)"/></mask>
    <radialGradient id="sc8NebG"><stop offset="0" stop-color="#46d17a" stop-opacity="0.22"/><stop offset="1" stop-color="#46d17a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8NebV"><stop offset="0" stop-color="#a67bd6" stop-opacity="0.26"/><stop offset="1" stop-color="#a67bd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8Hit"><stop offset="0" stop-color="#ffcf6a" stop-opacity="0.5"/><stop offset="0.5" stop-color="#ff7a3a" stop-opacity="0.16"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8Charge"><stop offset="0" stop-color="#ffe9a0" stop-opacity="0.6"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8GlowO"><stop offset="0" stop-color="#ff9a3d" stop-opacity="0.45"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8GlowG"><stop offset="0" stop-color="#6ef07a" stop-opacity="0.4"/><stop offset="1" stop-color="#2a9a48" stop-opacity="0"/></radialGradient>
    <clipPath id="sc8BeamClip"><rect x="${47 * Q}" y="0" width="0" height="${H}"><animate attributeName="width" dur="${dur}s" repeatCount="indefinite" values="0;0;${14 * Q};${14 * Q}" keyTimes="0;${sc8K(tFire)};${sc8K(tHit)};1"/></rect></clipPath>
  </defs>`

  // ---- background: space, nebulae, stars, distant cube ----
  let back = `<rect width="${W}" height="${H}" fill="url(#sc8Sky)"/>`
  back += `<ellipse cx="${62 * Q}" cy="${12 * Q}" rx="62" ry="30" fill="url(#sc8NebG)"/>`
  back += `<ellipse cx="${26 * Q}" cy="${8 * Q}" rx="60" ry="22" fill="url(#sc8NebV)"/>`
  const dots = [new Pix(), new Pix(), new Pix()]
  for (let y = 1; y < 40; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.6) continue
      dots[Math.floor(rnd() * 3)].set(x, y, '#cdbaf0')
    }
  }
  dots.forEach((d, i) => (back += `<g opacity="${0.14 + i * 0.12}">${sc8Path(d)}</g>`))
  // a few stars that breathe slowly
  ;[[12, 20], [48, 2], [86, 30], [58, 26], [30, 22]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${sc8Path(glow)}<animate attributeName="opacity" values="0.15;0.8;0.15" dur="${2.6 + i * 0.7}s" begin="${i * 0.5}s" repeatCount="indefinite"/></g>`
    back += new Pix().set(x, y, '#ffffff').svg()
  })
  // a second, distant cube: the Collective is everywhere
  const far = new Pix()
  far.rect(85, 6, 4, 4, '#2a3038').rect(86, 5, 4, 1, '#3a414b').rect(89, 6, 1, 4, '#1c2026')
  far.set(86, 7, '#3fae5c').set(88, 8, '#3fae5c')
  back += `<g opacity="0.8">${sc8Path(far)}</g>`
  s += `<g mask="url(#sc8Fade)">${back}</g>`

  // ---- the Borg cube: two halves along a jagged crack ----
  const cx0 = 52 // front face left
  const cy0 = 8 // front face top
  const F = 14 // front face size
  const D = 4 // depth
  const crack = (y: number) => cx0 + 7 + ((y * 3) % 5 === 0 ? 1 : 0) - (y % 4 === 1 ? 1 : 0) + Math.round((y - cy0) * 0.15)
  const leftHalf = new Pix()
  const rightHalf = new Pix()
  const put = (x: number, y: number, c: string) => (x <= crack(y) ? leftHalf : rightHalf).set(x, y, c)
  // top face (slanted back and right)
  for (let j = 0; j < D; j++) {
    const y = cy0 - D + j
    for (let i = 0; i < F; i++) {
      const x = cx0 + (D - j) + i
      put(x, y, j === 0 ? '#7a828c' : (i + j) % 4 === 0 ? '#4c535c' : '#5d656f')
    }
  }
  // right face
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < F; j++) {
      const x = cx0 + F + i
      const y = cy0 + j - i
      put(x, y, (j + i) % 3 === 0 ? '#1a1e23' : '#23282e')
    }
  }
  // front face: machinery grid
  for (let j = 0; j < F; j++) {
    for (let i = 0; i < F; i++) {
      const x = cx0 + i
      const y = cy0 + j
      let c = (i % 4 === 0 || j % 5 === 0) ? '#2c3138' : '#3b4149'
      if ((i * 7 + j * 3) % 11 === 0) c = '#4a515a'
      if (i === 0) c = '#59616b'
      put(x, y, c)
    }
  }
  // green Borg lights; half of them pulse slowly while the cube is whole
  const lights: [number, number][] = [[2, 2], [9, 1], [5, 6], [12, 4], [3, 10], [10, 9], [7, 12], [12, 12]]
  const pulseL = new Pix()
  const pulseR = new Pix()
  lights.forEach(([i, j], n) => {
    put(cx0 + i, cy0 + j, '#2f8f4a')
    if (n % 2 === 0) (cx0 + i <= crack(cy0 + j) ? pulseL : pulseR).set(cx0 + i, cy0 + j, '#8dffa8')
  })
  put(cx0 + F + 1, cy0 + 5, '#2f8f4a')
  put(cx0 + F + 2, cy0 + 9, '#2f8f4a')
  // the slice creeps out from where the beam strikes, then spiders sideways
  const cracks = [new Pix(), new Pix(), new Pix()]
  for (let y = cy0 - D; y < cy0 + F; y++) {
    const d = Math.abs(y - (cy0 + 2))
    cracks[d < 4 ? 0 : d < 8 ? 1 : 2].set(crack(y), y, y % 2 ? '#ffb347' : '#ffe08a')
  }
  ;[[3, 4], [4, 4], [5, 5], [10, 7], [11, 8], [11, 9], [2, 11], [3, 12], [4, 13]].forEach(([i, j], n) => cracks[n < 3 ? 1 : 2].set(cx0 + i, cy0 + j, '#ff8a3d'))

  // each crack layer glows in over 0.8 s, then cools to embers after the split
  const crackT = [tHit + 0.3, tHit + 1.0, tHit + 1.7]
  const crackSvg = (n: number) =>
    `<g opacity="0">${sc8Path(cracks[n])}${sc8Fade([[0, 0], [crackT[n], 0], [crackT[n] + 0.8, 1], [tSplit + 0.6, 1], [tSplit + 3.5, 0.35], [dur, 0.25]])}</g>`
  const lightsDie = (p: Pix) =>
    `<g>${`<g>${sc8Path(p)}<animate attributeName="opacity" values="0.2;0.9;0.2" dur="2.4s" repeatCount="indefinite"/></g>`}${sc8Fade([[0, 1], [tSplit, 1], [tSplit + 1.5, 0], [dur, 0]])}</g>`
  // the halves drift apart, quickly at first, then slower and slower
  const halfMove = (dx: number, dy: number) => sc8Move([[0, 0, 0], [tSplit, 0, 0], [dur, dx, dy]], false, true)
  let cube = ''
  cube += `<g>${sc8Path(leftHalf)}${lightsDie(pulseL)}${crackSvg(0)}${crackSvg(1)}${crackSvg(2)}${halfMove(-3, -1)}</g>`
  cube += `<g>${sc8Path(rightHalf)}${lightsDie(pulseR)}${halfMove(7, -2)}</g>`
  // while the beam holds it, the cube trembles: one art pixel, slowly
  const shake: [number, number, number][] = [[0, 0, 0]]
  for (let t = tHit + 0.4, n = 0; t < tSplit - 0.2; t += 0.4, n++) shake.push([t, n % 2 ? 0 : 0.5, n % 2 ? 0.5 : 0])
  shake.push([tSplit - 0.2, 0, 0], [dur, 0, 0])
  s += `<g>${cube}${sc8Move(shake, true)}</g>`

  // ---- the bioship: a spiny organic bulb with three prongs curving forward ----
  const ship = new Pix()
  const by = 10 // centre line
  const tan = (v: number) => (v < 0.16 ? '#8b6c96' : v < 0.3 ? '#b99a7e' : '#a8876c')
  const bcx = 27
  for (let y = -5; y <= 5; y++) {
    for (let x = -7; x <= 7; x++) {
      const e = (x * x) / 49 + (y * y) / 27
      if (e > 1) continue
      let c = tan(rnd())
      if (y < -2 && e > 0.55) c = '#dcc09c'
      else if (y < -1 && e > 0.4 && rnd() < 0.5) c = '#c8aa88'
      if (y > 1 && e > 0.5) c = rnd() < 0.5 ? '#6e5770' : '#7c6276'
      if (y > 2 && e > 0.75) c = '#4a3956'
      if (x > 4 && y > -3 && e > 0.7) c = '#e8c9a0'
      ship.set(bcx + x, by + y, c)
    }
  }
  const nx = 45
  const ny = by
  const prong = (p0: number[], p1: number[], p2: number[], thick: number) => {
    for (let k = 0; k <= 24; k++) {
      const t = k / 24
      const x = Math.round((1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0])
      const y = Math.round((1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
      const w = t < 0.6 ? thick : 1
      for (let j = 0; j < w; j++) ship.set(x, y + j, j === 0 ? (t > 0.8 ? '#f0d8b0' : '#c9ab8a') : tan(rnd()) === '#8b6c96' ? '#8b6c96' : '#7c6276')
    }
  }
  prong([31, by - 3], [36, by - 9], [43, by - 3], 2)
  prong([33, by], [38, by - 1], [42, by], 2)
  prong([31, by + 2], [36, by + 8], [43, by + 2], 2)
  ;[[21, -4, -1], [24, -5, -1], [27, -5, -1], [22, 4, 1], [25, 5, 1]].forEach(([x, y, d]) => {
    ship.set(x, by + y + d, '#c9ab8a').set(x - 1, by + y + 2 * d, '#9c7f9e').set(x - 2, by + y + 3 * d, '#6e5770')
  })
  ship.rect(18, by - 1, 2, 1, '#8b6c96').set(17, by - 2, '#6e5770').rect(18, by + 1, 2, 1, '#6e5770').set(17, by + 2, '#4a3956')
  s += sc8Path(ship)

  // organic veins: they wake one stretch at a time, from the back of the bulb to the prongs
  const veinPts = [[20, 0], [22, -1], [24, 0], [26, 1], [28, 0], [30, 0], [33, -3], [35, -4], [33, 3], [35, 4], [34, -1], [37, 0]]
  const veinGroups = [new Pix(), new Pix(), new Pix()]
  veinPts.forEach(([x, y]) => veinGroups[x < 25 ? 0 : x < 31 ? 1 : 2].set(x + 2, by + y, '#ffcf6a'))
  veinGroups.forEach((g, i) => {
    const a = tVeins + i * 1.1
    s += `<g opacity="0">${sc8Path(g)}${sc8Fade([[0, 0], [a, 0], [a + 1.8, 1], [tSplit, 1], [tSplit + 2.5, 0.25], [dur, 0.2]])}</g>`
  })

  // the orb gathers at the focal point in three sizes, each held over a second
  const orbRings = ['#ffe9a0', '#ffc35a', '#e8892e']
  const orbFade = sc8Fade([[0, 0], [tOrb, 0], [tOrb + 0.6, 1], [tSplit, 1], [tSplit + 1.2, 0], [dur, 0]])
  let orb = ''
  orb += shown(sc8Burst(nx, ny, 0, orbRings, 11, '#fff2c0'), [[tOrb, tOrb + 1.4]], dur)
  orb += shown(sc8Burst(nx, ny, 1, orbRings, 12, '#fff2c0'), [[tOrb + 1.4, tOrb + 2.6]], dur)
  orb += shown(sc8Burst(nx, ny, 2, orbRings, 13, '#fff2c0'), [[tOrb + 2.6, dur]], dur)
  s += `<g opacity="0">${orb}${orbFade}</g>`
  s += `<circle cx="${(nx + 0.5) * Q}" cy="${(ny + 0.5) * Q}" r="12" fill="url(#sc8Charge)" opacity="0">${sc8Fade([[0, 0], [tOrb, 0], [tFire, 0.9], [tSplit, 0.9], [tSplit + 1.4, 0], [dur, 0]])}</circle>`

  // the beam: a steady line that extends from the orb to the cube's face, then fades
  const bx1 = nx + 2
  const bx2 = crack(ny)
  const beam = new Pix()
  for (let x = bx1; x <= bx2; x++) {
    beam.set(x, ny, '#fff0b8')
    beam.set(x, ny - 1, '#ffd36b').set(x, ny + 1, '#ffa94a')
  }
  const halo = `<rect x="${bx1 * Q}" y="${(ny - 2) * Q}" width="${(bx2 - bx1 + 1) * Q}" height="${5 * Q}" fill="#ffb347" opacity="0.22"/>`
  s += `<g clip-path="url(#sc8BeamClip)" opacity="0">${halo}${sc8Path(beam)}${sc8Fade([[0, 0], [tFire, 0], [tFire + 0.3, 1], [tSplit, 1], [tSplit + 1.0, 0], [dur, 0]])}</g>`

  // where it strikes: a small local glow that rises, holds, and cools
  s += `<circle cx="${(bx2 + 0.5) * Q}" cy="${(ny + 0.5) * Q}" r="16" fill="url(#sc8Hit)" opacity="0">${sc8Fade([[0, 0], [tHit, 0], [tHit + 0.8, 0.85], [tSplit + 1.2, 0.85], [tSplit + 4, 0], [dur, 0]])}</circle>`
  // sparks peeling away from the strike point
  for (let i = 0; i < 6; i++) {
    const t0 = tHit + 0.3 + i * 0.4
    const dx = (2 + rnd() * 3) * Q
    const dy = (rnd() - 0.5) * 8 * Q
    s += `<rect x="${bx2 * Q}" y="${ny * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffd36b' : '#ff9a3d'}" opacity="0"><animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${dx.toFixed(1)} ${dy.toFixed(1)};${dx.toFixed(1)} ${dy.toFixed(1)}" keyTimes="0;${sc8K(t0)};${sc8K(t0 + 1.2)};1"/>${sc8Fade([[0, 0], [t0, 0], [t0 + 0.2, 1], [t0 + 1.2, 0], [dur, 0]])}</rect>`
  }

  // ---- the split: soft local blooms, orange and green, one after another ----
  const orange = ['#ffd27a', '#ff9a3d', '#d8452a']
  const green = ['#c8f7a8', '#6ef07a', '#2a9a48']
  const booms: [number, number, number, number, boolean][] = [
    [59, 9, tSplit, 4, false],
    [64, 15, tSplit + 0.7, 3, true],
    [55, 16, tSplit + 1.4, 3, false],
    [67, 5, tSplit + 2.1, 3, true],
    [60, 13, tSplit + 2.8, 3, true],
    [56, 6, tSplit + 3.5, 2, false],
  ]
  booms.forEach(([x, y, t, r, isGreen], i) => {
    const ring = isGreen ? green : orange
    const disc = sc8Burst(0, 0, r, ring, 100 + i * 7, ring[0])
    const px = (x + 0.5) * Q
    const py = (y + 0.5) * Q
    // the disc swells from half size while it brightens, then keeps growing a little as it fades
    const grow = `<animateTransform attributeName="transform" type="scale" dur="${dur}s" repeatCount="indefinite" values="0.5;0.5;1;1.2;1.2" keyTimes="0;${sc8K(t)};${sc8K(t + 0.7)};${sc8K(t + 2.2)};1"/>`
    const fade = sc8Fade([[0, 0], [t, 0], [t + 0.6, 0.85], [t + 0.9, 0.85], [t + 2.2, 0], [dur, 0]])
    s += `<g opacity="0"><circle cx="${px}" cy="${py}" r="${(r + 4) * Q}" fill="url(#${isGreen ? 'sc8GlowG' : 'sc8GlowO'})"/><g transform="translate(${px - Q / 2} ${py - Q / 2})"><g>${disc}${grow}</g></g>${fade}</g>`
  })

  // debris: shards of cube and hot fragments, drifting out slowly and staying adrift
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2
    const dist = 9 + rnd() * 18
    const dx = Math.cos(a) * dist * Q
    const dy = Math.sin(a) * dist * Q * 0.7
    const t0 = tSplit + 0.2 + rnd() * 3.2
    const hot = i % 3 !== 2
    const c = !hot ? (i % 2 ? '#59616b' : '#4a515a') : i % 2 ? '#ffb347' : '#5fe36a'
    const sz = i % 5 === 0 ? 2 : 1
    const end = hot ? 0.35 : 0.9
    s += `<rect x="${(59 + Math.round((rnd() - 0.5) * 6)) * Q}" y="${(11 + Math.round((rnd() - 0.5) * 6)) * Q}" width="${sz * Q}" height="${sz * Q}" fill="${c}" opacity="0"><animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="0 0 1 1;0.2 0.6 0.4 1" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${dx.toFixed(1)} ${dy.toFixed(1)}" keyTimes="0;${sc8K(t0)};1"/>${sc8Fade([[0, 0], [t0, 0], [t0 + 0.5, 1], [t0 + 3, end], [dur, end]])}</rect>`
  }

  // ---- Voyager's hull as the foreground deck ----
  const hull = new Pix()
  hull.rect(0, 42, GW, 6, '#1b1626').rect(18, 42, GW - 18, 1, '#3a3350')
  for (let x = 24; x < GW; x += 9) hull.rect(x, 43, 1, 2, '#120e1a')
  for (let i = 0; i < 8; i++) hull.set(20 + Math.floor(rnd() * 70), 44 + Math.floor(rnd() * 4), rnd() < 0.5 ? '#251f33' : '#140f1e')
  s += `<g mask="url(#sc8Fade)">${sc8Path(hull)}</g>`
  ;[44, 62, 80].forEach((x, i) => {
    s += `<g>${new Pix().set(x, 43, '#ffb347').svg()}<animate attributeName="opacity" values="1;0.35;1" dur="2.6s" begin="${i * 0.8}s" repeatCount="indefinite"/></g>`
  })

  // ---- Species 8472: tall, tripod-legged, mottled cream-green ----
  const alien = [
    '.......lll........',
    '......llaal.......',
    '.....laaaaac......',
    '.....aaaaaac......',
    '.....aaaaaac......',
    '......abaac.......',
    '.......dad........',
    '........ac........',
    '.......aac........',
    '....llaaaaac......',
    '...laabaabaac.....',
    '..lab.aaaac.bac...',
    '..ac..abac...ac...',
    '..ac..aabc...bc...',
    '..bc..aaac...ac...',
    '..ac..abac...ac...',
    '..ac..aaac...bc...',
    '.lac.laaaac..ac...',
    '.a.a.aabaac.a.a...',
    '.a.a.aac.aac.a.a..',
    '.....ac..ac.ac....',
    '....ac...bc..ac...',
    '....ac...ac..ac...',
    '...ac....ac...ac..',
    '...bc....ac...ac..',
    '..ac.....bc....ac.',
    '..ac.....ac....ac.',
    '.ac......ac.....ac',
    '.ac.....ldd.....ac',
    'ldd.............ldd',
  ]
  const ax = 70
  const ay = 12
  const HEAD = 7 // rows 0..6 turn with the head
  const alienPal = { l: '#ecebc6', a: '#cfcf9c', b: '#93ad6c', c: '#7d8a58', d: '#4a5636', e: '#2a2a1a' }
  const head = new Pix().rows(alien.slice(0, HEAD), ax, ay, alienPal)
  const body = new Pix().rows(alien.slice(HEAD), ax, ay + HEAD, alienPal)
  alien.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 'a') continue
      const v = rnd()
      const p = j < HEAD ? head : body
      if (v < 0.17) p.set(ax + i, ay + j, '#a6bc7a')
      else if (v < 0.23) p.set(ax + i, ay + j, '#a68fa6')
    }
  })
  // eyes: dark sockets with a yellow glint; straight ahead, then on the cube, then down at Janeway
  const eyePair = (pts: [number, number][]) => {
    const p = new Pix()
    pts.forEach(([i, j]) => p.set(ax + i, ay + j, '#ffe066'))
    return sc8Path(p)
  }
  const tWatch = tHit + 0.4
  let eyes = ''
  eyes += shown(eyePair([[6, 3], [9, 3]]), [[0, tWatch]], dur)
  eyes += shown(eyePair([[5, 3], [8, 3]]), [[tWatch, tTurn]], dur)
  eyes += shown(eyePair([[5, 4], [8, 4]]), [[tTurn, dur]], dur)
  const eyeGlow = `<animate attributeName="opacity" values="0.75;1;0.75" dur="3.2s" repeatCount="indefinite"/>`
  // the head turns in two steps: eyes drop first, then the head leans toward her
  const headTurn = sc8Move([[0, 0, 0], [tTurn + 0.5, -1, 0], [dur, -1, 0]], true)
  s += `<g>${sc8Path(body)}<g>${sc8Path(head)}<g>${eyes}${eyeGlow}</g>${headTurn}</g></g>`

  // ---- Janeway: auburn bun, black jacket, red shoulders, four pips ----
  const jx = 26
  const jy = 28
  s += crabHD(
    SC8_JANEWAY, jx, jy, 'right', dur,
    { left: [], right: [[tClaw + 0.7, dur]] },
    [],
    4.7,
    p => {
      const hair = '#8a3a1e'
      const hairL = '#b2522a'
      const dark = '#5e2412'
      p.rect(jx + 1, jy, 15, 1, hair).rect(jx + 4, jy, 9, 1, hairL)
      p.rect(jx, jy + 1, 2, 3, hair).set(jx + 2, jy + 1, hair).set(jx, jy + 3, dark)
      p.rect(jx + 2, jy - 1, 11, 1, hair).rect(jx + 5, jy - 1, 6, 1, hairL)
      p.rows(['.bbb.', 'bLLbb', 'bLbbd', '.bbd.'], jx, jy - 4, { b: hair, L: hairL, d: dark })
      p.rect(jx + 8, jy + 6, 2, 1, '#8a8a96')
      for (const c of [12, 13, 14, 15]) p.set(jx + c, jy + 7, '#e8c547')
      p.rect(jx + 4, jy + 6, 2, 2, '#e8c547').set(jx + 4, jy + 6, '#fff3b0')
    },
  )
  // her claw comes up in two in-between frames before it is raised high
  const k = SC8_JANEWAY
  const arm1 = new Pix()
  arm1.rect(jx + 20, jy + 2, 2, 3, k.skin).rect(jx + 22, jy + 1, 2, 2, k.skin).set(jx + 21, jy + 4, k.shade).set(jx + 23, jy + 2, k.shade)
  arm1.set(jx + 24, jy - 1, k.light).set(jx + 24, jy + 0, k.skin).set(jx + 22, jy - 1, k.light).set(jx + 22, jy, k.skin)
  const arm2 = new Pix()
  arm2.rect(jx + 19, jy, 2, 4, k.skin).set(jx + 20, jy + 3, k.shade).rect(jx + 20, jy - 2, 2, 2, k.skin).set(jx + 21, jy - 1, k.shade)
  arm2.rect(jx + 19, jy - 4, 1, 2, k.skin).rect(jx + 22, jy - 4, 1, 2, k.skin).rect(jx + 19, jy - 3, 4, 1, k.skin).set(jx + 19, jy - 4, k.light).set(jx + 22, jy - 4, k.light)
  s += shown(sc8Path(arm1), [[tClaw, tClaw + 0.35]], dur)
  s += shown(sc8Path(arm2), [[tClaw + 0.35, tClaw + 0.7]], dur)
  return s
}

// ---------- Tapestry: "Welcome to the afterlife, Jean-Luc" ----------
// Picard wakes in a bright, still void and looks around. He walks slowly to a
// soft pillar of light; the light gently opens and Q is there in white robes,
// arms spread in welcome. Picard startles back a step; Q hops with delight and
// throws both claws up; Picard raises a claw in protest; Q spreads his arms
// again, smug. A calm tableau while the rays drift.

const TAP_PICARD: CrabHD = { ...PICARD_HD, rim: '#ffe0c8' }

const TAP_Q: CrabHD = {
  skin: '#de7a58',
  light: '#f6a383',
  shade: '#b65d3e',
  upper: '#ffffff',
  lower: '#f4effb',
  lowerShade: '#cfc3e3',
  legs: '#ffffff',
  rim: '#ffd9b8',
}

// Clawd's body without legs, so legs can step, tuck or hide under a robe
function tapBody(k: CrabHD, x: number, y: number, look: Side) {
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
  const ex = look === 'left' ? [4, 10] : [6, 12]
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, EYE_HD))
  return { p, ex }
}

// legs: frame 0 standing, 1 and 2 are the two walking steps (one pair lifted)
function tapLegs(k: CrabHD, x: number, y: number, frame: number) {
  const p = new Pix()
  ;[1, 5, 11, 15].forEach((lx, i) => {
    const up = (frame === 1 && i % 2 === 0) || (frame === 2 && i % 2 === 1)
    p.rect(x + lx + (up ? 1 : 0), y + 10, 2, up ? 3 : 4, k.legs)
  })
  return p.svg()
}

// legs folded under a crouching body: only h rows show
function tapTucked(k: CrabHD, x: number, y: number, h: number) {
  const p = new Pix()
  ;[1, 5, 11, 15].forEach(lx => p.rect(x + lx, y + 10, 2, h, k.legs))
  return p.svg()
}

// arm flung out wide and up: a sleeve of robe, then the claw
function tapArmSpread(k: CrabHD, x: number, y: number, side: Side, sleeve: string, sleeveShade: string) {
  const rows = [
    'l..l.......',
    's..s.......',
    'ssss.......',
    '.sd........',
    '.ssd.......',
    '..sswW.....',
    '...wwwwwww.',
    '....wwwwwww',
    '......WWWWW',
  ]
  const pal = { l: k.light, s: k.skin, d: k.shade, w: sleeve, W: sleeveShade }
  const flip = side === 'right'
  const list = flip ? rows.map(r => [...r].reverse().join('')) : rows
  return new Pix().rows(list, flip ? x + 18 : x - 11, y - 3, pal).svg()
}

// right arm on its way up: forearm angled out, claw at shoulder height
function tapArmHalfRight(k: CrabHD, x: number, y: number) {
  const rows = [
    '..l..l',
    '..s..s',
    '..ssss',
    '..sss.',
    'sssd..',
    'sdd...',
  ]
  return new Pix().rows(rows, x + 18, y - 1, { l: k.light, s: k.skin, d: k.shade }).svg()
}

// eyelids shown inside the given windows: full (blink / asleep) or half (smug)
function tapLidsAt(k: CrabHD, x: number, y: number, ex: number[], on: [number, number][], rows = 3) {
  const lids = new Pix()
  ex.forEach(e => lids.rect(x + e, y + 2, 2, rows, k.skin))
  return shown(lids.svg(), on, SCENE_SECONDS)
}

// a smooth value track on the story timeline: [time, value] points
function tapTrack(attr: string, pts: [number, number][]) {
  const T = SCENE_SECONDS
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < T) all.push([T, all[all.length - 1][1]])
  return `<animate attributeName="${attr}" dur="${T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => +(p[0] / T).toFixed(4)).join(';')}"/>`
}

function tapestry() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const SX = 69 // where the light comes from
  const B0 = 7.9 // the light starts to open
  const B1 = 9.4 // ... and Q is fully there
  let s = `<defs>
    <linearGradient id="tapSky" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#b9add6"/><stop offset="0.45" stop-color="#e3dcf2"/><stop offset="1" stop-color="#f7f3ea"/></linearGradient>
    <linearGradient id="tapFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2f4"/><stop offset="1" stop-color="#cbc0e0"/></linearGradient>
    <linearGradient id="tapFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.24" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="tapFade"><rect width="${W}" height="${H}" fill="url(#tapFadeG)"/></mask>
    <radialGradient id="tapGlow"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.35" stop-color="#fff6dc" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient>
    <radialGradient id="tapHalo"><stop offset="0" stop-color="#ffe7a8" stop-opacity="0.9"/><stop offset="0.6" stop-color="#ffd98a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
    <radialGradient id="tapCorner" cx="0" cy="1" r="1"><stop offset="0" stop-color="${C.bg}" stop-opacity="1"/><stop offset="0.55" stop-color="${C.bg}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- the void: sky, drifting cloud banks, rays, floor (all steady) ----
  let back = `<rect width="${W}" height="${H}" fill="url(#tapSky)"/>`

  // far cloud banks, pixel blobs drifting slowly
  const cloud = (cx: number, cy: number, w: number, c: string, top: string) => {
    const p = new Pix()
    for (let i = 0; i < w; i++) {
      const h = Math.max(1, Math.round(2.4 * Math.sin((i / w) * Math.PI) + Math.sin(i * 1.7) * 0.7))
      p.rect(cx + i, cy - h, 1, h + 2, c).set(cx + i, cy - h, top)
    }
    return p.svg()
  }
  const banks = [
    [4, 13, 26, '#d2c9e7', '#e2dbf1', 0, -10],
    [46, 9, 22, '#ddd6ee', '#ece7f7', 0, -8],
    [26, 24, 30, '#d5cce9', '#e6e0f4', 0, -6],
    [70, 21, 24, '#e6e0f3', '#f3effa', 0, -12],
  ] as [number, number, number, string, string, number, number][]
  banks.forEach(([cx, cy, w, c, top, a, b]) => {
    back += `<g>${cloud(cx, cy, w, c, top)}<animateTransform attributeName="transform" type="translate" values="${a} 0;${b} 0" dur="${dur}s" repeatCount="indefinite"/></g>`
  })

  // light rays fanning out of the source: steady, swinging slowly once across the story
  let rays = ''
  const fan = [-62, -44, -30, -18, -6, 6, 18, 32, 50]
  fan.forEach((a, i) => {
    const r = (a * Math.PI) / 180
    const len = 150
    const half = 0.07 + (i % 3) * 0.025
    const x1 = SX * Q + Math.sin(r - half) * len
    const y1 = 2 * Q + Math.cos(r - half) * len
    const x2 = SX * Q + Math.sin(r + half) * len
    const y2 = 2 * Q + Math.cos(r + half) * len
    rays += `<polygon points="${SX * Q},${2 * Q} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="#ffffff" opacity="${(0.3 + (i % 3) * 0.06).toFixed(2)}"/>`
  })
  const rot = (d: number) => `${d} ${SX * Q} ${2 * Q}`
  back += `<g>${rays}<animateTransform attributeName="transform" type="rotate" values="${rot(-5)};${rot(5)}" dur="${dur}s" repeatCount="indefinite"/></g>`

  // floor: a pale plane with a bright line where it meets the void
  const floor = new Pix().rect(0, 42, GW, 1, '#fbf9ff').rect(0, 43, GW, 1, '#e2daf0')
  back += `<rect x="0" y="${43 * Q}" width="${W}" height="${5 * Q}" fill="url(#tapFloor)"/>` + floor.svg()
  s += `<g mask="url(#tapFade)">${back}</g>`

  // the light at the source: steady, and it opens slowly as Q arrives
  s += `<ellipse cx="${SX * Q}" cy="${30 * Q}" rx="18" ry="44" fill="url(#tapGlow)" opacity="0.55">${tapTrack('rx', [[B0, 18], [B1, 44]])}${tapTrack('ry', [[B0, 44], [B1, 52]])}${tapTrack('opacity', [[B0, 0.55], [B1, 0.9]])}</ellipse>`
  s += `<ellipse cx="${SX * Q}" cy="${43 * Q}" rx="34" ry="6" fill="url(#tapHalo)" opacity="0.6">${tapTrack('opacity', [[B0, 0.6], [B1, 1]])}</ellipse>`

  // keep the title corner dark and quiet
  s += `<rect x="0" y="${30 * Q}" width="${80 * Q}" height="${18 * Q}" fill="url(#tapCorner)"/>`

  // rising motes of light (single pixels, slow)
  for (let i = 0; i < 7; i++) {
    const d = 3.6 + (i % 3) * 0.9
    const x = 48 + i * 6
    s += `<rect x="${x * Q}" y="${41 * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffffff' : '#ffe9a8'}" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 6 : -6} -16 ${i % 2 ? -2 : 3} -34 t ${i % 2 ? 4 : -4} -30" dur="${d}s" begin="${-i * 0.6}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.7;0" dur="${d}s" begin="${-i * 0.6}s" repeatCount="indefinite"/></rect>`
  }

  // ---- the soft pillar of light Picard walks toward; it fades as the light opens ----
  const pillar = new Pix()
  for (let y = 4; y < 42; y++) {
    const w = y < 10 ? 4 : y > 36 ? 10 : 6
    pillar.rect(SX - Math.floor(w / 2), y, w, 1, '#fffdf2')
    pillar.set(SX - Math.floor(w / 2) - 1, y, '#fff3c4').set(SX + Math.ceil(w / 2), y, '#fff3c4')
  }
  pillar.rect(SX - 1, 6, 2, 34, '#ffffff')
  s += `<g opacity="0.85">${pillar.svg()}${tapTrack('opacity', [[B0 + 0.3, 0.85], [B1, 0]])}</g>`

  // ---- Q: white robes, glowing, arms spread ----
  const qx = 60
  const qy = 28
  const QD = TAP_Q
  const { p: qb, ex: qex } = tapBody(QD, qx, qy, 'left')
  // dark hair across the top of the head, a widow's peak
  qb.rect(qx + 1, qy, 16, 1, '#3a2620').set(qx, qy + 1, '#3a2620').set(qx + 17, qy + 1, '#3a2620')
  qb.rect(qx + 7, qy + 1, 4, 1, '#3a2620').rect(qx + 2, qy + 1, 2, 1, '#5a3c30').rect(qx + 14, qy + 1, 2, 1, '#5a3c30')
  // the robe: collar, a gold sash, and a flowing skirt to the floor
  qb.rect(qx + 6, qy + 6, 6, 1, '#f1eaff').set(qx + 8, qy + 7, '#e5c766').set(qx + 9, qy + 7, '#e5c766')
  qb.rect(qx, qy + 8, 18, 1, '#e8c86a').set(qx + 9, qy + 8, '#fff2b8')
  for (let j = 0; j < 4; j++) {
    const fl = Math.floor(j / 2) + 1
    qb.rect(qx - fl + 1, qy + 10 + j, 16 + 2 * fl, 1, '#ffffff')
    qb.set(qx - fl + 1, qy + 10 + j, '#d6cbe9').set(qx + 16 + fl, qy + 10 + j, '#e4dbf2')
    if (j > 0) qb.set(qx + 5 - (j > 1 ? 1 : 0), qy + 10 + j, '#ebe4f6').set(qx + 12 + (j > 1 ? 1 : 0), qy + 10 + j, '#ebe4f6')
  }
  qb.rect(qx - 1, qy + 9, 1, 1, '#d6cbe9').rect(qx + 18, qy + 9, 1, 1, '#e4dbf2')
  qb.rect(qx - 1, qy + 13, 20, 1, '#ddd3ec')
  let qs = qb.svg()
  // arms: spread in welcome, rest, one claw up then both for the grand gesture, rest, spread again
  const spread: [number, number][] = [[0, 11.3], [14.3, dur]]
  const restQ: [number, number][] = [[11.3, 11.5], [12.9, 14.3]]
  const leftUp: [number, number][] = [[11.5, 12.9]]
  const rightUp: [number, number][] = [[11.75, 12.9]]
  const armsSpread = tapArmSpread(QD, qx, qy, 'left', '#ffffff', '#d9cfeb') + tapArmSpread(QD, qx, qy, 'right', '#ffffff', '#d9cfeb')
  qs += shown(armsSpread, spread, dur)
  qs += shown(armRestHD(QD, qx, qy, 'left'), restQ, dur)
  qs += shown(armRestHD(QD, qx, qy, 'right'), [...restQ, [11.5, 11.75]], dur)
  qs += shown(armUpHD(QD, qx, qy, 'left'), leftUp, dur)
  qs += shown(armUpHD(QD, qx, qy, 'right'), rightUp, dur)
  qs += tapLidsAt(QD, qx, qy, qex, [[13.5, 13.62]])
  qs += tapLidsAt(QD, qx, qy, qex, [[14.5, dur]], 1) // smug, half-lidded
  const qhops = hopQ([[10.5, 10.75], [10.95, 11.2], [11.8, 12.05]], dur)
  // the radiant aura behind him, steady once he is there
  const aura = `<ellipse cx="${(qx + 9) * Q}" cy="${(qy + 6) * Q}" rx="32" ry="26" fill="url(#tapHalo)" opacity="0.85"/>`
  s += `<g opacity="0">${aura}<g>${qs}${qhops}</g>${tapTrack('opacity', [[B0 + 0.3, 0], [B1, 1]])}</g>`

  // ---- Picard: wakes, stands, looks around, walks slowly in, startles back ----
  const PD = TAP_PICARD
  const px0 = 12
  const py = 28
  type Key = { t: number; x: number; leg: number }
  const keys: Key[] = [{ t: 0, x: 12, leg: -1 }, { t: 2.6, x: 12, leg: 0 }]
  const W0 = 4.4
  for (let i = 0; i < 8; i++) keys.push({ t: W0 + i * 0.4, x: 14 + i * 2, leg: i % 2 ? 2 : 1 })
  keys.push({ t: W0 + 8 * 0.4, x: 28, leg: 0 })
  keys.push({ t: 9.85, x: 26, leg: 1 })
  keys.push({ t: 10.15, x: 24, leg: 2 })
  keys.push({ t: 10.45, x: 24, leg: 0 })
  const kt = keys.map(k => +(k.t / dur).toFixed(4)).join(';')
  const walk = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${keys.map(k => `${(k.x - px0) * Q} 0`).join(';')}" keyTimes="${kt}"/>`
  const legWin = (f: number) => {
    const on: [number, number][] = []
    keys.forEach((k, i) => {
      if (k.leg === f) on.push([k.t, i + 1 < keys.length ? keys[i + 1].t : dur])
    })
    return on
  }
  // getting up: crouched low, then two steps up to standing
  const riseT = [0, 2.0, 2.3, 2.6]
  const riseD = [3, 2, 1, 0]
  const rise = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${riseD.map(d => `0 ${d * Q}`).join(';')}" keyTimes="${riseT.map(t => +(t / dur).toFixed(4)).join(';')}"/>`

  const details = (p: Pix) => {
    p.rect(px0 + 12, 34, 2, 2, '#e8c547').set(px0 + 12, 34, '#fff3b0')
    p.rect(px0 + 4, 34, 1, 1, '#e8c547').rect(px0 + 6, 34, 1, 1, '#e8c547')
  }
  const { p: pbR, ex: pexR } = tapBody(PD, px0, py, 'right')
  details(pbR)
  pbR.rect(px0 + 16, py + 1, 1, 5, '#f09a76') // the light washing over his right side
  const { p: pbL, ex: pexL } = tapBody(PD, px0, py, 'left')
  details(pbL)
  pbL.rect(px0 + 17, py + 1, 1, 5, PD.rim).rect(px0, py + 1, 1, 5, PD.shade).set(px0 + 17, py + 8, PD.lower!).set(px0, py + 8, PD.lowerShade!)
  const lookLeft: [number, number][] = [[2.9, 3.95]]
  let ps = shown(pbR.svg(), complement(lookLeft, dur), dur) + shown(pbL.svg(), lookLeft, dur)
  ps += tapLidsAt(PD, px0, py, pexR, [[0, 1.6], [1.85, 1.97], [5.6, 5.72], [15.3, 15.42]])
  ps += tapLidsAt(PD, px0, py, pexL, [[3.35, 3.47]])
  for (const f of [0, 1, 2]) ps += shown(tapLegs(PD, px0, py, f), legWin(f), dur)
  ;[[0, 2.0, 1], [2.0, 2.3, 2], [2.3, 2.6, 3]].forEach(([a, b, h]) => (ps += shown(tapTucked(PD, px0, py, h), [[a, b]], dur)))
  // the protest: claw comes up in two frames, holds, comes down
  const half: [number, number][] = [[12.9, 13.15], [14.15, 14.4]]
  const up: [number, number][] = [[13.15, 14.15]]
  ps += shown(armRestHD(PD, px0, py, 'left'), [[0, dur]], dur)
  ps += shown(armRestHD(PD, px0, py, 'right'), complement(merge([...half, ...up]), dur), dur)
  ps += shown(tapArmHalfRight(PD, px0, py), half, dur)
  ps += shown(armUpHD(PD, px0, py, 'right'), up, dur)
  s += `<g>${walk}<g>${rise}<g>${ps}${hopQ([[9.6, 9.82]], dur)}</g></g></g>`

  return s
}

// ---------- The Doctor: "Please state the nature of the medical emergency." ----------
// One 17.17 s story in Voyager's sickbay. A patient sleeps under the vitals monitor.
// The EMH materialises calmly (a slow top-to-bottom reveal in a soft glow), raises a
// claw to ask his question, waits with his claws on his hips, walks over to the bed,
// scans the patient with his tricorder, reads the result and looks pleased, turns
// back and taps his foot waiting for an answer that never comes, then fades out.

const EMH_HD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#2e9bb0', // medical teal shoulders
  lower: '#1b1924', // black jacket
  lowerShade: '#0f0d14',
  legs: 'none', // drawn separately so they can walk and tap
  rim: '#f2b49a',
}

const EMH_D = SCENE_SECONDS
const EMH_X = 68 // where he materialises (art px)
const EMH_STEP = 2 // art px per step
const EMH_STEPS = 6 // he ends at EMH_X - 12 = 56, beside the bed
const EMH_X2 = EMH_X - EMH_STEP * EMH_STEPS
const EMH_Y = 28
const EMH_TOP = 19 // reveal band, art rows (the raised claw reaches row 20)
const EMH_BOT = 43

// the beats
const EMH_MAT: [number, number] = [2.2, 3.7] // materialise, 1.5 s
const EMH_ASK: [number, number] = [4.0, 5.7] // "?" bubble, claw raised
const EMH_WAIT1: [number, number] = [5.7, 7.4] // claws on hips
const EMH_WALK: [number, number] = [7.4, 9.4] // six steps to the bed
const EMH_REACH: [number, number] = [9.4, 9.6] // arm half out
const EMH_SCAN: [number, number] = [9.6, 11.6] // scanning
const EMH_READ: [number, number] = [11.6, 13.2] // reads, then looks pleased
const EMH_PLEASED = 12.4
const EMH_WAIT2: [number, number] = [13.2, 14.8] // turned back, foot taps, "..."
const EMH_DEMAT: [number, number] = [14.8, 16.2] // fades out, 1.4 s

// ---------- timing: every story animation spans the whole scene, keyTimes 0 .. 1 ----------

const emhKt = (t: number) => +Math.min(1, Math.max(0, t / EMH_D)).toFixed(4)

// one animation over the scene; pts are [seconds, value]; first time 0, last time = scene end
function emhAnim(attr: string, pts: [number, string | number][], mode: 'discrete' | 'linear' = 'discrete', type = '') {
  const p = [...pts]
  if (p[0][0] > 0) p.unshift([0, p[0][1]])
  if (p[p.length - 1][0] < EMH_D) p.push([EMH_D, p[p.length - 1][1]])
  const tag = type ? 'animateTransform' : 'animate'
  return `<${tag} attributeName="${attr}"${type ? ` type="${type}"` : ''} calcMode="${mode}" dur="${EMH_D}s" repeatCount="indefinite" values="${p.map(v => v[1]).join(';')}" keyTimes="${p.map(v => emhKt(v[0])).join(';')}"/>`
}

// visible inside the windows, hidden outside (discrete; for small pose swaps)
function emhOn(svg: string, wins: [number, number][]) {
  const w = merge(wins)
  const pts: [number, number][] = [[0, w.length && w[0][0] <= 0 ? 1 : 0]]
  for (const [a, b] of w) {
    if (a > 0) pts.push([a, 1])
    if (b < EMH_D) pts.push([b, 0])
  }
  return `<g>${svg}${emhAnim('opacity', pts)}</g>`
}

// fades in over `r` seconds from a, out over `r` seconds until b
function emhFade(svg: string, a: number, b: number, r = 0.3, peak = 1) {
  return `<g opacity="0">${svg}${emhAnim('opacity', [[0, 0], [a, 0], [a + r, peak], [b - r, peak], [b, 0]], 'linear')}</g>`
}

// ---------- the Doctor's parts ----------

// claw on the hip: out from the shoulder, down, and back in onto the belt
function emhArmHips(k: CrabHD, x: number, y: number, side: Side) {
  const rows = ['sss.', 'sss.', 'hs..', 'ss..', '.ssl', '.hh.']
  const p = new Pix()
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const c = r[i] === 's' ? k.skin : r[i] === 'h' ? k.shade : r[i] === 'l' ? k.light : ''
      if (!c) continue
      const ax = side === 'left' ? x - 3 + i : x + 20 - i
      p.set(ax, y + 4 + j, c)
    }
  })
  return p.svg()
}

// medical tricorder, held out flat with the screen towards us
function emhTricorder(p: Pix, x: number, y: number, screen = '#6fe8ff') {
  p.rect(x, y, 4, 4, '#4b5064').rect(x, y, 4, 1, '#7d849c').rect(x + 1, y + 1, 2, 1, screen)
  p.set(x, y + 3, '#33374a').set(x + 3, y + 3, '#33374a')
}

function emhArmScan(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 8, y + 4, 8, 2, k.skin).rect(x - 8, y + 6, 8, 1, k.shade).set(x - 8, y + 4, k.light)
  emhTricorder(p, x - 13, y + 3)
  // pincers gripping it
  p.rect(x - 10, y + 2, 2, 1, k.skin).set(x - 10, y + 2, k.light)
  p.rect(x - 10, y + 7, 2, 1, k.shade)
  p.rect(x - 9, y + 3, 1, 4, k.skin)
  return p.svg()
}

// halfway out: the forearm swinging forward with the tricorder
function emhArmReach(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 5, y + 4, 5, 2, k.skin).rect(x - 5, y + 6, 5, 1, k.shade)
  emhTricorder(p, x - 9, y + 4)
  p.rect(x - 6, y + 4, 1, 3, k.skin)
  return p.svg()
}

// tricorder raised in front of him to read the result: a green screen
function emhArmRead(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin).rect(x - 3, y + 6, 3, 1, k.shade)
  p.rect(x - 5, y + 2, 2, 4, k.skin).set(x - 5, y + 2, k.light)
  emhTricorder(p, x - 9, y + 1, '#7dff9a')
  p.set(x - 8, y + 3, '#7dff9a').set(x - 7, y + 3, '#4b5064') // a tick mark on the screen
  return p.svg()
}

// right claw halfway up (between rest and raised)
function emhArmHalfUp(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 4, 3, 2, k.skin)
  p.rect(x + 19, y, 2, 4, k.skin).rect(x + 20, y, 1, 4, k.shade)
  p.rect(x + 18, y - 3, 1, 2, k.skin).rect(x + 21, y - 3, 1, 2, k.skin)
  p.rect(x + 18, y - 2, 4, 1, k.skin).rect(x + 19, y - 1, 2, 1, k.skin)
  p.set(x + 18, y - 3, k.light).set(x + 21, y - 3, k.light)
  return p.svg()
}

function emhDoctor() {
  const k = EMH_HD
  const x = EMH_X
  const y = EMH_Y
  const { p, ex } = clawdBody(k, x, y, 'left')
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin)) // eyes drawn separately below
  // receding dark hairline: bald crown, hair at the sides and back
  const hair = '#2c1d19'
  const hairHi = '#4a332b'
  p.rect(x + 1, y, 4, 1, hair).rect(x + 13, y, 4, 1, hair)
  p.rect(x, y + 1, 3, 1, hair).rect(x + 15, y + 1, 3, 1, hair)
  p.set(x, y + 2, hair).set(x + 17, y + 2, hair).set(x, y + 3, hair).set(x + 17, y + 3, hair)
  p.set(x + 3, y, hairHi).set(x + 14, y, hairHi)
  p.rect(x + 6, y, 6, 1, '#f4ad8c') // shine on the bald crown
  // Voyager uniform: teal shoulders, grey collar, black jacket, combadge
  p.rect(x + 1, y + 6, 16, 1, '#4cc0d2')
  p.rect(x + 7, y + 6, 4, 1, '#8a8f9e').rect(x + 8, y + 7, 2, 1, '#6c7080')
  p.rect(x + 1, y + 7, 16, 1, '#2e9bb0').rect(x + 8, y + 7, 2, 1, '#6c7080')
  p.set(x + 17, y + 6, '#1f6f80').set(x + 17, y + 7, '#1f6f80')
  p.rect(x + 12, y + 7, 2, 1, '#e8c547').set(x + 13, y + 7, '#fff3b0')
  p.rect(x + 1, y + 8, 16, 1, '#26232f')
  let s = p.svg()

  // eyes: looking left, pleased (^ ^), looking right (turned back), with blinks
  const EYE = '#1a1020'
  const eyes = (xs: number[]) => {
    const e = new Pix()
    xs.forEach(c => e.rect(x + c, y + 2, 2, 3, EYE))
    return e.svg()
  }
  const happy = new Pix()
  for (const c of [4, 10]) happy.rect(x + c, y + 2, 2, 1, EYE).set(x + c - 1, y + 3, EYE).set(x + c + 2, y + 3, EYE)
  s += emhOn(eyes([4, 10]), [[0, 5.0], [5.15, 8.3], [8.45, 10.9], [11.05, EMH_PLEASED]])
  s += emhOn(happy.svg(), [[EMH_PLEASED, EMH_WAIT2[0]]])
  s += emhOn(eyes([6, 12]), [[EMH_WAIT2[0], 14.3], [14.45, EMH_D]])
  // a frown while he waits: brows pulled down
  s += emhOn(new Pix().rect(x + 5, y + 1, 3, 1, hair).rect(x + 11, y + 1, 3, 1, hair).svg(), [[13.6, EMH_D]])

  // legs: pairs lift in turn while he walks, the far right one taps while he waits
  const stepAt = (i: number) => EMH_WALK[0] + (i * (EMH_WALK[1] - EMH_WALK[0])) / EMH_STEPS
  const lifts: [number, number][][] = [[], []]
  for (let i = 0; i < EMH_STEPS; i++) lifts[i % 2].push([stepAt(i), stepAt(i) + 0.2])
  const taps: [number, number][] = [[13.5, 13.8], [14.1, 14.4], [14.7, 15.0]]
  const legCol = '#1b1924'
  const footCol = '#2b2836'
  ;[1, 5, 11, 15].forEach((lx, n) => {
    const pair = lx === 1 || lx === 11 ? 0 : 1
    const down = new Pix().rect(x + lx, y + 10, 2, 4, legCol).set(x + lx, y + 13, footCol).svg()
    const lifted = new Pix().rect(x + lx, y + 10, 2, 3, legCol).set(x + lx, y + 12, footCol).svg()
    const busy = lx === 15 ? [...lifts[pair], ...taps] : lifts[pair]
    s += emhOn(down, complement(merge(busy), EMH_D))
    s += emhOn(lifted, lifts[pair])
    if (lx === 15) s += emhOn(new Pix().rect(x + 15, y + 10, 2, 2, legCol).rect(x + 16, y + 12, 2, 1, footCol).svg(), taps)
    void n
  })

  // arms
  const tri = new Pix()
  emhTricorder(tri, x - 5, y + 6)
  const restL = armRestHD(k, x, y, 'left') + tri.svg()
  const hipsOn: [number, number][] = [EMH_WAIT1, [EMH_WAIT2[0], EMH_D]]
  s += emhOn(restL, [[0, EMH_WAIT1[0]], EMH_WALK])
  s += emhOn(armRestHD(k, x, y, 'right'), [[0, 4.1], [5.5, EMH_WAIT1[0]], EMH_WALK, EMH_REACH])
  s += emhOn(emhArmHalfUp(k, x, y), [[4.1, 4.25], [5.35, 5.5]])
  s += emhOn(armUpHD(k, x, y, 'right'), [[4.25, 5.35]])
  s += emhOn(emhArmHips(k, x, y, 'left'), hipsOn)
  s += emhOn(emhArmHips(k, x, y, 'right'), [EMH_WAIT1, [EMH_SCAN[0], EMH_D]])
  s += emhOn(emhArmReach(k, x, y), [EMH_REACH])
  s += emhOn(emhArmScan(k, x, y), [EMH_SCAN])
  s += emhOn(emhArmRead(k, x, y), [EMH_READ])
  // tricorder clipped to the belt when both claws are on his hips
  s += emhOn(new Pix().rect(x + 3, y + 8, 3, 2, '#4b5064').set(x + 4, y + 8, '#6fe8ff').svg(), hipsOn)
  // the tricorder light while scanning: red / green, once a second
  s += emhOn(
    `<rect x="${(x - 12) * Q}" y="${(y + 5) * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="fill" values="#ff5a5a;#7dff9a;#7dff9a" calcMode="discrete" dur="1s" keyTimes="0;0.5;1" repeatCount="indefinite"/></rect>`,
    [EMH_SCAN],
  )

  // a small satisfied nod
  return `<g>${s}${emhAnim('transform', [[0, '0 0'], [12.55, `0 ${Q}`], [12.85, '0 0']], 'discrete', 'translate')}</g>`
}

// speech bubble with a pixel glyph
function emhBubble(glyph: string[], x: number, y: number) {
  const body = ['.wwwwwwwww.', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', '.wwwwwwwww.', '.ww........', 'ww.........']
  const p = new Pix().rows(body, x, y, { w: '#e2eef8' })
  p.rect(x + 1, y + 8, 9, 1, '#b9cde6')
  p.rows(glyph, x + 3, y + 1, { k: '#1d2a4a', r: '#d8342f' })
  return p.svg()
}

// the holographic glow, the light line riding the reveal edge, slow sparkles
function emhShimmer(X: number, win: [number, number], closing: boolean) {
  const [a, b] = win
  let s = ''
  s += `<g opacity="0"><ellipse cx="${(X + 9) * Q}" cy="${33 * Q}" rx="${15 * Q}" ry="${13 * Q}" fill="url(#emhHolo)"/>${emhAnim('opacity', [[0, 0], [a - 0.5, 0], [a, 1], [b, 1], [b + 0.9, 0]], 'linear')}</g>`
  // the edge line: down the figure over the reveal
  const yA = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<rect x="${(X - 5) * Q}" y="${yA}" width="${29 * Q}" height="${Q}" fill="#cdf3ff" opacity="0">${emhAnim('y', [[0, yA], [a, yA], [b, yB]], 'linear')}${emhAnim('opacity', [[0, 0], [a, 0], [a + 0.2, 0.45], [b - 0.3, 0.45], [b, 0]], 'linear')}</rect>`
  // sparkles drifting up slowly around his outline
  let seed = closing ? 77 : 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let sp = ''
  for (let i = 0; i < 12; i++) {
    const cx = X - 3 + Math.floor(rnd() * 24)
    const cy = EMH_TOP + 3 + Math.floor(rnd() * (EMH_BOT - EMH_TOP - 5))
    const d = (1.6 + rnd() * 0.9).toFixed(2)
    const bg = (rnd() * 1.6).toFixed(2)
    const col = i % 3 ? '#9fe8ff' : '#e8fbff'
    sp += `<rect x="${cx * Q}" y="${cy * Q}" width="${Q}" height="${Q}" fill="${col}" opacity="0"><animate attributeName="opacity" values="0;0.85;0" dur="${d}s" begin="${bg}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-3 * Q}" dur="${d}s" begin="${bg}s" repeatCount="indefinite"/></rect>`
  }
  s += emhFade(sp, a - 0.3, b + 0.6, 0.4)
  return s
}

function emhSickbay() {
  const W = GW * Q
  const H = GH * Q
  let back = `<rect width="${W}" height="${H}" fill="#1a1e31"/>`
  const wall = new Pix()
  // ceiling with light strips
  wall.rect(0, 0, GW, 4, '#11141f').rect(0, 3, GW, 1, '#232a42')
  wall.rect(20, 2, 16, 1, '#2d3756').rect(21, 3, 14, 1, '#cfe6ff')
  wall.rect(56, 2, 16, 1, '#2d3756').rect(57, 3, 14, 1, '#cfe6ff')
  // upper wall panels with seams
  wall.rect(0, 4, GW, 20, '#1d2236')
  for (const sx of [14, 44, 52, 78]) wall.rect(sx, 4, 1, 20, '#151929').rect(sx + 1, 4, 1, 20, '#252b45')
  // trim band and glowing rail
  wall.rect(0, 24, GW, 1, '#2f3757').rect(0, 25, GW, 1, '#2a5c8c').rect(0, 26, GW, 1, '#151929')
  // lower wall
  wall.rect(0, 27, GW, 15, '#181b2b')
  for (const sx of [12, 30, 48, 66]) wall.rect(sx, 27, 1, 15, '#131624')
  // back lit column between the bed and the Doctor
  wall.rect(48, 4, 2, 20, '#24406a').rect(48, 5, 1, 18, '#3f78b8')
  // the Doctor's office: glass wall at the far right
  wall.rect(80, 27, 10, 15, '#1f3150').rect(80, 27, 1, 15, '#3a5580')
  wall.rect(81, 28, 9, 1, '#2d4a76')
  for (let i = 0; i < 5; i++) wall.set(83 + i, 31 + i, '#35588c')
  // shelves with hyposprays and vials on the left
  wall.rect(2, 29, 9, 1, '#3a4260').rect(2, 34, 9, 1, '#3a4260')
  ;[[3, '#6fe8ff'], [5, '#f2b866'], [7, '#9fe08a'], [9, '#6fe8ff']].forEach(([vx, c]) => wall.rect(vx as number, 27, 1, 2, c as string))
  wall.rect(3, 31, 3, 3, '#5a6280').set(4, 31, '#9aa3c0').rect(7, 32, 3, 2, '#5a6280')
  // floor
  wall.rect(0, 42, GW, 6, '#121522').rect(0, 42, GW, 1, '#262c45')
  back += wall.svg()
  // glow under the ceiling lights
  back += `<ellipse cx="${28 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/><ellipse cx="${64 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/>`

  // vitals monitor over the bed
  const mon = new Pix()
  mon.rect(17, 6, 25, 16, '#3a4566').rect(17, 6, 25, 1, '#56648e').rect(18, 7, 23, 14, '#0b1c33')
  mon.rect(19, 8, 7, 1, '#f2b866').rect(27, 8, 3, 1, '#e08a3c').rect(31, 8, 9, 1, '#4f8fd6')
  mon.rect(19, 8, 1, 3, '#f2b866')
  mon.rect(19, 17, 4, 2, '#4f8fd6').rect(24, 17, 6, 2, '#f2b866').rect(31, 17, 3, 2, '#c66a5a').rect(35, 17, 5, 2, '#4f8fd6')
  mon.rect(24, 19, 4, 1, '#7a5a3a').rect(35, 19, 3, 1, '#2d4f80')
  back += mon.svg()
  // the heartbeat trace, swept slowly left to right (a calm sleeping pulse)
  const ekg = new Pix()
  const shape = [0, 0, 0, -1, 0, 0, 1, -3, 2, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 1, -3, 2, 0]
  shape.forEach((d, i) => {
    ekg.set(18 + i, 14 + d, '#6fffc0')
    if (d < -1) ekg.rect(18 + i, 14 + d, 1, -d, '#6fffc0')
    if (d > 1) ekg.rect(18 + i, 14, 1, d + 1, '#6fffc0')
  })
  const SW = 3.4
  const sweep: [number, number][] = []
  for (let i = 0; i <= 23; i++) sweep.push([i / 24, i * Q])
  sweep.push([1, 23 * Q])
  const sweepAnim = `<animate attributeName="width" calcMode="discrete" dur="${SW}s" repeatCount="indefinite" values="${sweep.map(v => v[1]).join(';')}" keyTimes="${sweep.map(v => +v[0].toFixed(4)).join(';')}"/>`
  back += `<clipPath id="emhEkgClip"><rect x="${18 * Q}" y="0" width="0" height="${H}">${sweepAnim}</rect></clipPath>`
  back += `<g clip-path="url(#emhEkgClip)">${ekg.svg()}</g>`
  // heart light: a slow soft pulse
  back += `<rect x="${39 * Q}" y="${10 * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="opacity" values="1;0.3;1" dur="1.7s" repeatCount="indefinite"/></rect>`

  // status display on the right wall: amber elbow and blue bars
  const pan = new Pix()
  pan.rect(54, 6, 20, 10, '#121625')
  pan.rect(55, 7, 3, 8, '#e8a24a').rect(55, 7, 7, 2, '#e8a24a').set(55, 7, '#121625').set(55, 14, '#121625')
  pan.rect(63, 7, 4, 2, '#c97ad0').rect(68, 7, 5, 2, '#4f8fd6')
  pan.rect(59, 10, 8, 1, '#4f8fd6').rect(68, 10, 4, 1, '#f2b866')
  pan.rect(59, 12, 5, 1, '#f2b866').rect(65, 12, 7, 1, '#4f8fd6')
  pan.rect(59, 14, 10, 1, '#2f5f9c').rect(70, 14, 2, 1, '#e08a3c')
  back += pan.svg()
  back += `<rect x="${70 * Q}" y="${14 * Q}" width="${2 * Q}" height="${Q}" fill="#ffd36b"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite"/></rect>`
  back += `<rect x="${59 * Q}" y="${10 * Q}" width="${8 * Q}" height="${Q}" fill="#9fd0ff"><animate attributeName="opacity" values="0;0.6;0" dur="3.1s" repeatCount="indefinite"/></rect>`
  return back
}

function emhBed() {
  let s = ''
  // overhead surgical light falling on the bed
  s += `<polygon points="${22 * Q},${4 * Q} ${34 * Q},${4 * Q} ${44 * Q},${36 * Q} ${12 * Q},${36 * Q}" fill="#cfe6ff" opacity="0.06"/>`
  const b = new Pix()
  // pedestal
  b.rect(21, 37, 14, 5, '#2c3248').rect(21, 37, 14, 1, '#3c4462').rect(33, 37, 2, 5, '#21263a')
  b.rect(19, 41, 18, 1, '#3a4260')
  // bed top with its lit edge
  b.rect(12, 34, 31, 2, '#8a93ab').rect(12, 34, 31, 1, '#b7bfd3').rect(12, 36, 31, 1, '#3d8fd6').set(12, 36, '#2a5c8c').set(42, 36, '#2a5c8c')
  b.rect(13, 37, 29, 1, '#1f3a5c')
  // pillow at the head end (towards the Doctor)
  b.rect(34, 32, 8, 2, '#e4ecf6').rect(34, 33, 8, 1, '#c3cfe0')
  // patient under the sheet: a sleeping Clawd
  const sheet = '#a9bfdc'
  const sheetHi = '#cfdcee'
  const sheetSh = '#7f97b8'
  b.rect(14, 31, 22, 3, sheet).rect(15, 30, 20, 1, sheetHi).rect(14, 31, 1, 3, sheetSh)
  b.rect(15, 29, 2, 1, sheetHi).rect(19, 29, 2, 1, sheetHi) // feet poking up
  b.rect(14, 33, 22, 1, sheetSh)
  for (const fx of [20, 26, 31]) b.set(fx, 32, sheetSh)
  // head on the pillow, eyes shut
  b.rect(35, 27, 7, 5, '#d97757').rect(35, 27, 7, 1, '#eb9575').rect(41, 28, 1, 4, '#b85f43')
  b.rect(36, 30, 2, 1, '#6a2e1e').rect(39, 30, 2, 1, '#6a2e1e')
  // a limp claw over the sheet
  b.rect(31, 29, 3, 2, '#d97757').set(31, 29, '#eb9575')
  s += b.svg()
  // slow breathing: the sheet over the chest rises and settles
  s += `<g opacity="0">${new Pix().rect(24, 29, 5, 1, sheetHi).svg()}<animate attributeName="opacity" values="0;1;0" dur="4s" repeatCount="indefinite"/></g>`
  return s
}

function doctorEmh() {
  const W = GW * Q
  const H = GH * Q
  const dx = -EMH_STEP * Q // one step, CSS px
  let s = `<defs>
    <linearGradient id="emhFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="emhFade"><rect width="${W}" height="${H}" fill="url(#emhFadeG)"/></mask>
    <radialGradient id="emhHolo"><stop offset="0" stop-color="#8fe3ff" stop-opacity="0.32"/><stop offset="0.6" stop-color="#8fe3ff" stop-opacity="0.1"/><stop offset="1" stop-color="#8fe3ff" stop-opacity="0"/></radialGradient>
  </defs>`
  s += `<g mask="url(#emhFade)">${emhSickbay()}</g>`
  s += emhBed()

  // glow + sparkles where he forms (at EMH_X) and where he fades (at EMH_X2)
  s += emhShimmer(EMH_X, EMH_MAT, false)
  s += emhShimmer(EMH_X2, EMH_DEMAT, true)

  // reveal: a clip that opens top to bottom, and later closes top to bottom
  const full = (EMH_BOT - EMH_TOP) * Q
  const yT = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<clipPath id="emhReveal"><rect x="${-W}" y="${yT}" width="${3 * W}" height="0">${emhAnim('y', [[0, yT], [EMH_DEMAT[0], yT], [EMH_DEMAT[1], yB]], 'linear')}${emhAnim('height', [[0, 0], [EMH_MAT[0], 0], [EMH_MAT[1], full], [EMH_DEMAT[0], full], [EMH_DEMAT[1], 0]], 'linear')}</rect></clipPath>`

  // the walk: six steps of two art pixels, each a third of a second
  const walk: [number, string][] = [[0, '0 0']]
  for (let i = 0; i < EMH_STEPS; i++) {
    const t = EMH_WALK[0] + (i * (EMH_WALK[1] - EMH_WALK[0])) / EMH_STEPS + 0.15
    walk.push([t, `${(i + 1) * dx} 0`])
  }
  // his shadow, fading in and out with him
  const shadow = `<ellipse cx="${(EMH_X + 9) * Q}" cy="${42.5 * Q}" rx="${12 * Q}" ry="3" fill="#06070d" opacity="0">${emhAnim('opacity', [[0, 0], [EMH_MAT[0] + 0.4, 0], [EMH_MAT[1] + 0.2, 0.6], [EMH_DEMAT[0] + 0.2, 0.6], [EMH_DEMAT[1], 0]], 'linear')}</ellipse>`
  // a little translucent while forming and fading
  const holo = emhAnim('opacity', [[0, 0.75], [EMH_MAT[0], 0.75], [EMH_MAT[1] + 0.4, 1], [EMH_DEMAT[0], 1], [EMH_DEMAT[1], 0.75]], 'linear')
  s += `<g>${shadow}<g clip-path="url(#emhReveal)"><g>${emhDoctor()}${holo}</g></g>${emhAnim('transform', walk, 'discrete', 'translate')}</g>`

  // the scan: a soft beam from the tricorder over the patient, with a slow sweeping line
  const tipX = EMH_X2 - 14
  const beam = new Pix()
  for (let c = 28; c <= tipX; c++) {
    const spread = Math.round((tipX - c) * 0.3)
    for (let r = 32 - spread; r <= 33 + spread; r++) if (r >= 27 && r <= 33) beam.set(c, r, '#8fe3ff')
  }
  const steps = 12
  const sweepPts: [number, number][] = []
  for (let i = 0; i < steps * 2; i++) {
    const k = i < steps ? i : steps * 2 - 1 - i
    sweepPts.push([i / (steps * 2), -k * Q])
  }
  sweepPts.push([1, 0])
  const sweepLine = `<rect x="${tipX * Q}" y="${27 * Q}" width="${Q}" height="${7 * Q}" fill="#d8f6ff" opacity="0.6"><animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="2.4s" repeatCount="indefinite" values="${sweepPts.map(v => `${v[1]} 0`).join(';')}" keyTimes="${sweepPts.map(v => +v[0].toFixed(4)).join(';')}"/></rect>`
  s += emhFade(`<g opacity="0.2">${beam.svg()}</g>${sweepLine}`, EMH_SCAN[0] + 0.1, EMH_SCAN[1], 0.5)

  // "Please state the nature of the medical emergency?" ... and the long wait
  const q = ['.kkk.', 'k...k', '....k', '..kk.', '..k..', '.....', '..k..']
  const dots = ['.....', '.....', '.....', 'k.k.k', '.....', '.....', '.....']
  s += emhFade(emhBubble(q, EMH_X + 3, 16), EMH_ASK[0], EMH_ASK[1] + 0.2)
  s += emhFade(emhBubble(dots, EMH_X2 + 10, 16), EMH_WAIT2[0] + 0.2, EMH_DEMAT[0] + 0.3)
  return s
}

// ---------- The Best of Both Worlds: "Mr. Worf... fire." ----------
// One take: Locutus on the viewscreen, Riker stares him down, turns to Worf,
// a held pause, the claw goes up. Worf fires; the deflector beam reaches across
// the screen and it fills slowly with soft blue, then rolls back through gentle
// interference... and Locutus is still there. Riker lowers his claw.

const BOB_RIKER: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f2a985',
}

const BOB_WORF: CrabHD = {
  skin: '#b0603f',
  light: '#c97a55',
  shade: '#8a4630',
  upper: '#1c1424',
  lower: '#d4a22e',
  lowerShade: '#a37a1c',
  legs: '#1c1424',
  rim: '#d98a63',
}

// a plain rect in art pixels (for vertical structures Pix cannot merge)
const bobR = (x: number, y: number, w: number, h: number, c: string, extra = '') =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"${extra}/>`

function bobRnd(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

// screen content area, in art pixels
const BOB_SX = 29
const BOB_SY = 3
const BOB_SW = 57
const BOB_SH = 22

// Locutus in close-up inside a Borg alcove
function bobLocutus() {
  let s = bobR(BOB_SX, BOB_SY, BOB_SW, BOB_SH, '#03100a')
  // alcove: conduits and ribs, green-lit
  for (const [x, w] of [[30, 3], [35, 2], [79, 2], [83, 3]] as [number, number][]) {
    s += bobR(x, BOB_SY, w, BOB_SH, '#0b2615') + bobR(x, BOB_SY, 1, BOB_SH, '#1d5a32')
  }
  for (const y of [6, 12, 18]) {
    s += bobR(BOB_SX, y, 12, 1, '#0e301b') + bobR(77, y, 9, 1, '#0e301b')
  }
  s += bobR(38, 3, 1, 22, '#072014') + bobR(76, 3, 1, 22, '#072014')
  // green glow behind his head
  s += `<ellipse cx="${57 * Q}" cy="${13 * Q}" rx="44" ry="26" fill="url(#bobLocGlow)"/>`

  const p = new Pix()
  const x0 = 42
  const skin = '#c4c8ca'
  const light = '#e2e5e6'
  const shade = '#959a9e'
  const rimG = '#9fe6b4'
  // head (pale, Clawd-shaped)
  for (let y = 6; y <= 15; y++) {
    const inset = y === 6 ? 1 : 0
    p.rect(x0 + inset, y, 30 - 2 * inset, 1, y === 6 ? light : skin)
  }
  p.rect(x0, 7, 1, 9, rimG).rect(x0 + 1, 7, 1, 9, shade).rect(x0 + 29, 7, 1, 9, rimG)
  p.rect(x0 + 2, 15, 26, 1, '#aeb2b5')
  // a few grey veins
  ;[[45, 13], [46, 14], [55, 14], [56, 13], [68, 14]].forEach(([x, y]) => p.set(x, y, '#a7acaf'))
  // cheek implant on his right side
  p.rect(43, 8, 4, 4, '#26292c').rect(43, 8, 4, 1, '#4a4f54').set(44, 10, '#3dff7a')
  // eyes
  p.rect(50, 9, 3, 5, EYE_HD)
  // eyepiece over the other eye, wrapping round the side of the head
  p.rect(59, 8, 8, 7, '#2b2e32').rect(59, 8, 8, 1, '#6a7178').rect(59, 9, 1, 6, '#50565c')
  p.rect(67, 10, 4, 2, '#2b2e32').rect(67, 10, 4, 1, '#5d636a').set(71, 10, '#7e868d')
  p.rect(61, 9, 3, 5, '#0d0e10')
  p.rect(64, 9, 2, 2, '#ff2a2a').set(64, 9, '#ffb0b0').set(66, 10, '#8a1010')
  // black suit
  for (let y = 16; y <= 24; y++) p.rect(x0 - 1, y, 32, 1, y === 16 ? '#2e3337' : '#131518')
  for (const y of [18, 20, 22, 24]) {
    p.rect(x0, y, 8, 1, '#262a2e').rect(x0 + 22, y, 8, 1, '#262a2e')
  }
  // chest tubes
  p.rect(48, 17, 2, 8, '#4b5157').rect(48, 17, 1, 8, '#7d858c')
  p.rect(53, 20, 8, 2, '#454b51').rect(53, 20, 8, 1, '#737b82').rect(53, 18, 2, 2, '#454b51').rect(59, 18, 2, 2, '#454b51')
  p.set(66, 18, '#3dff7a').set(67, 18, '#3dff7a').set(66, 19, '#1a8a40')
  // claws: one pale, one Borg prosthetic
  p.rect(38, 11, 4, 2, skin).rect(38, 13, 4, 1, shade).set(38, 11, rimG)
  p.rect(72, 11, 4, 3, '#1c1f22').rect(72, 11, 4, 1, '#59616a').set(75, 12, '#3dff7a')
  // cranial tube arcing from the back of the head into the shoulder
  const tube: [number, number][] = [[68, 6], [68, 5], [69, 4], [70, 3], [71, 3], [72, 3], [73, 3], [74, 4], [75, 5]]
  for (let y = 6; y <= 16; y++) tube.push([75, y])
  tube.forEach(([x, y]) => p.set(x, y, '#5d646b').set(x + 1, y + (y < 5 ? 1 : 0), '#2c3035'))
  ;[[70, 3], [71, 3], [72, 3], [75, 7], [75, 8], [75, 9]].forEach(([x, y]) => p.set(x, y, '#a3abb2'))
  p.rect(74, 16, 3, 2, '#3e4449')
  s += p.svg()
  // the laser from the eyepiece, sweeping
  s += `<g><rect x="${66 * Q}" y="${10 * Q - 0.5}" width="60" height="1" fill="#ff4040"/><circle cx="${65 * Q}" cy="${10 * Q}" r="4" fill="#ff3030" opacity="0.35"/><animateTransform attributeName="transform" type="rotate" values="-10 ${65 * Q} ${10 * Q};6 ${65 * Q} ${10 * Q};-10 ${65 * Q} ${10 * Q}" dur="3.2s" repeatCount="indefinite"/></g>`
  // blinking alcove lights
  ;[[31, 9], [36, 15], [80, 8], [84, 20], [31, 21]].forEach(([x, y], i) => {
    s += `<g>${bobR(x, y, 1, 1, '#5dff95')}<animate attributeName="opacity" values="1;0.2;1" dur="${1.8 + i * 0.45}s" repeatCount="indefinite"/></g>`
  })
  return s
}

// the deflector beam reaching into the distance, as a pixel wedge (no pure white)
function bobBeam(tip: number) {
  const p = new Pix()
  const cx = 57
  for (let y = tip; y <= 24; y++) {
    const half = Math.round(((y - tip) / (25 - tip)) * 9)
    p.rect(cx - half - 1, y, 2 * half + 3, 1, '#4f8cff')
    if (half > 0) p.rect(cx - half, y, 2 * half + 1, 1, '#9cc8ff')
    p.rect(cx - Math.floor(half / 2), y, Math.floor(half / 2) * 2 + 1, 1, '#d6ebff')
  }
  p.rect(cx - 2, tip - 1, 5, 1, '#9cc8ff').rect(cx - 1, tip - 2, 3, 1, '#d6ebff')
  return p.svg()
}

// a smooth opacity curve on the story timeline: [time, value] points
function bobRamp(pts: [number, number][]) {
  const T = SCENE_SECONDS
  const all: [number, number][] = [[0, pts[0][1]], ...pts, [T, pts[pts.length - 1][1]]]
  return `<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => +(p[0] / T).toFixed(4)).join(';')}"/>`
}

// slow rolling interference: soft horizontal bands, evenly spread, drifting down
function bobInterference() {
  const rnd = bobRnd(53)
  let band = ''
  for (let k = 0; k < 2; k++) {
    for (let y = 0; y < BOB_SH; y += 3) {
      const h = 1 + Math.floor(rnd() * 2)
      const light = (y / 3) % 2 === 0
      band += bobR(BOB_SX, BOB_SY - BOB_SH + k * BOB_SH + y, BOB_SW, h, light ? '#5f7896' : '#05070c', ` opacity="${light ? 0.32 : 0.4}"`)
    }
  }
  return `<g>${band}<animateTransform attributeName="transform" type="translate" values="0 0;0 ${BOB_SH * Q}" dur="2.6s" repeatCount="indefinite"/></g>`
}

function bestOfBothWorldsHD() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q

  // ---- the beat sheet
  const tTurn = 4.1 // Riker starts to turn from the screen to Worf
  const tAtWorf = 4.6 // "Mr. Worf..."
  const tHalf = 6.6 // the claw comes up: "fire"
  const tUp = 6.95
  const tWorfReady = 6.9
  const tPress = 7.4 // Worf hits the console
  const tPressEnd = 8.4
  const tBackTurn = 8.0 // Riker turns back to the screen
  const tAtScreen = 8.3
  const tBeam = 8.3 // the beam leaves the ship...
  const tBeamFull = 9.9 // ...and reaches him
  const tFill = 9.0 // the screen fills with blue light
  const tFull = 10.5
  const tFade = 11.6 // and fades back
  const tClear = 13.2
  const tLower = 14.3 // Riker lowers his claw
  const tDown = 14.75

  let s = `<defs>
    <linearGradient id="bobFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="bobFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#bobFadeG)"/></mask>
    <linearGradient id="bobFadeCG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.1" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="bobFadeC"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#bobFadeCG)"/></mask>
    <linearGradient id="bobWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16111c"/><stop offset="1" stop-color="#2e2333"/></linearGradient>
    <radialGradient id="bobLocGlow"><stop offset="0" stop-color="#3dff7a" stop-opacity="0.35"/><stop offset="1" stop-color="#3dff7a" stop-opacity="0"/></radialGradient>
    <radialGradient id="bobSpill"><stop offset="0" stop-color="#4dff8a" stop-opacity="0.28"/><stop offset="1" stop-color="#4dff8a" stop-opacity="0"/></radialGradient>
    <radialGradient id="bobBlueSpill"><stop offset="0" stop-color="#6fa4ff" stop-opacity="0.3"/><stop offset="1" stop-color="#6fa4ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="bobFill" cx="0.5" cy="0.6" r="0.75"><stop offset="0" stop-color="#8fb6ec"/><stop offset="0.5" stop-color="#5a88d6"/><stop offset="1" stop-color="#2f5cb4"/></radialGradient>
    <pattern id="bobScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="2" fill="#000" opacity="0.08"/></pattern>
    <clipPath id="bobScreen"><rect x="${BOB_SX * Q}" y="${BOB_SY * Q}" width="${BOB_SW * Q}" height="${BOB_SH * Q}"/></clipPath>
  </defs>`

  // ---- the bridge, fading in from the band on the left
  let back = `<rect x="-6" y="-6" width="${W + 12}" height="${H + 12}" fill="url(#bobWall)"/>`
  // ceiling with a recessed light strip; red alert, burning steady and low
  back += bobR(0, 0, GW, 2, '#100c15')
  back += bobR(0, 0, GW, 1, '#ff2e3a', ' opacity="0.45"')
  // LCARS wall panel on the left
  const lc = new Pix()
  lc.rect(9, 5, 15, 17, '#0b0910')
  lc.rect(10, 6, 13, 2, '#f29a3a').rect(10, 8, 3, 12, '#f29a3a').set(10, 6, '#0b0910').set(22, 6, '#c9a7ff')
  lc.rect(14, 9, 4, 2, '#c39be0').rect(19, 9, 4, 2, '#8aa7e8')
  lc.rect(14, 12, 9, 1, '#f7c487')
  lc.rect(14, 14, 3, 2, '#d9584a').rect(18, 14, 5, 2, '#c39be0')
  lc.rect(14, 17, 5, 1, '#8aa7e8').rect(20, 17, 3, 1, '#f29a3a')
  lc.rect(10, 20, 13, 1, '#b48fd6')
  back += `<g opacity="0.6">${lc.svg()}</g>`
  ;[[15, 19], [18, 19], [21, 19]].forEach(([x, y], i) => {
    back += `<g>${bobR(x, y, 2, 1, i === 1 ? '#ff6b5a' : '#f7c487')}<animate attributeName="opacity" values="1;0.35;1" dur="${1.9 + i * 0.6}s" repeatCount="indefinite"/></g>`
  })
  // red alert strip by the right wall, steady
  back += bobR(88, 4, 2, 21, '#ff2e3a', ' opacity="0.4"')
  // wood trim and baseboard under the screen, then the carpet
  const wall = new Pix()
  wall.rect(0, 29, GW, 2, '#5e3f2c').rect(0, 29, GW, 1, '#8a6040')
  wall.rect(0, 33, GW, 1, '#0f0b13')
  wall.rect(0, 34, GW, 14, '#1d1724').rect(0, 34, GW, 1, '#2c2236')
  wall.rect(0, 38, GW, 1, '#221b2a').rect(0, 43, GW, 1, '#19141f')
  back += wall.svg()
  // light from the screen on wall and floor: green from Locutus, slowly blue while the beam fills it
  back += `<g><ellipse cx="${57 * Q}" cy="${30 * Q}" rx="100" ry="40" fill="url(#bobSpill)"/>${bobRamp([[tFill, 1], [tFull, 0.25], [tFade, 0.25], [tClear + 0.6, 1]])}</g>`
  back += `<g opacity="0"><ellipse cx="${57 * Q}" cy="${30 * Q}" rx="100" ry="40" fill="url(#bobBlueSpill)"/>${bobRamp([[tFill, 0], [tFull, 1], [tFade, 1], [tClear, 0]])}</g>`
  s += `<g mask="url(#bobFade)">${back}</g>`

  // ---- the viewscreen
  const bez = new Pix()
  bez.rect(27, 1, 61, 26, '#0e0b12').rect(28, 1, 59, 1, '#4a4152').rect(27, 2, 1, 24, '#2a2330').rect(87, 2, 1, 24, '#2a2330')
  bez.rect(28, 26, 59, 1, '#3a3142')
  s += bez.svg()
  // the bezel picks up the blue as the screen fills
  s += `<g opacity="0">${bobR(28, 2, 59, 1, '#7fa6e0') + bobR(28, 25, 59, 1, '#5f88cc') + bobR(28, 2, 1, 24, '#5f88cc') + bobR(86, 2, 1, 24, '#5f88cc')}${bobRamp([[tFill, 0], [tFull, 0.7], [tFade, 0.7], [tClear, 0]])}</g>`

  // Locutus: dims under the blue, then sways gently in the interference and settles
  const k = (t: number) => +(t / T).toFixed(4)
  const sway: [number, number][] = [[0, 0], [12.0, 1], [12.45, 0], [12.9, -1], [13.35, 0], [13.8, 1], [14.25, 0]]
  let scr = `<g>${bobLocutus()}${bobRamp([[10.0, 1], [tFull, 0.45], [12.6, 0.45], [14.0, 1]])}<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${T}s" repeatCount="indefinite" values="${sway.map(p => `${p[1] * Q} 0`).join(';')}" keyTimes="${sway.map(p => k(p[0])).join(';')}"/></g>`
  // the beam leaving the ship and reaching steadily up the screen towards him
  // (the full wedge, uncovered from the bottom up by a rising clip edge)
  const reveal = `<animate attributeName="y" dur="${T}s" repeatCount="indefinite" values="${25 * Q};${25 * Q};${8 * Q};${8 * Q}" keyTimes="0;${k(tBeam)};${k(tBeamFull)};1"/>`
  s = s.replace('</defs>', `<clipPath id="bobBeamClip"><rect x="0" y="${25 * Q}" width="${W}" height="${H}">${reveal}</rect></clipPath></defs>`)
  const beam = `<g clip-path="url(#bobBeamClip)">${bobBeam(11)}</g>`
  scr += `<g>${beam}${bobRamp([[tFade, 1], [12.8, 0]])}</g>`
  // the screen fills with soft blue light, holds, and fades back
  scr += `<g opacity="0"><rect x="${BOB_SX * Q}" y="${BOB_SY * Q}" width="${BOB_SW * Q}" height="${BOB_SH * Q}" fill="url(#bobFill)"/>${bobRamp([[tFill, 0], [tFull, 0.62], [tFade, 0.62], [tClear, 0]])}</g>`
  // gentle rolling interference as the picture comes back
  scr += `<g opacity="0">${bobInterference()}${bobRamp([[11.3, 0], [12.3, 1], [13.2, 1], [14.4, 0]])}</g>`
  // scanlines, slow and faint, and a soft rolling bar
  scr += `<rect x="${BOB_SX * Q}" y="${BOB_SY * Q}" width="${BOB_SW * Q}" height="${BOB_SH * Q}" fill="url(#bobScan)"/>`
  scr += `<rect x="${BOB_SX * Q}" y="0" width="${BOB_SW * Q}" height="6" fill="#c8ffd8" opacity="0.04"><animate attributeName="y" values="${BOB_SY * Q - 6};${(BOB_SY + BOB_SH) * Q}" dur="6.5s" repeatCount="indefinite"/></rect>`
  // glass glint
  scr += `<polygon points="${30 * Q},${3 * Q} ${36 * Q},${3 * Q} ${30 * Q},${9 * Q}" fill="#ffffff" opacity="0.06"/>`
  s += `<g clip-path="url(#bobScreen)">${scr}</g>`

  // ---- Worf at tactical, raised behind the rail
  const wx = 7
  const wy = 25
  const worfDetails = (p: Pix) => {
    // hair: a dark mane over the crown and down behind the shoulders
    p.rect(wx + 3, wy - 2, 12, 1, '#1a1210').rect(wx + 1, wy - 1, 16, 1, '#1a1210').set(wx + 6, wy - 2, '#3a2a24').set(wx + 10, wy - 1, '#3a2a24')
    p.rect(wx - 1, wy - 1, 1, 9, '#1a1210').rect(wx + 18, wy - 1, 1, 9, '#1a1210').rect(wx - 2, wy + 1, 1, 7, '#1a1210').rect(wx + 19, wy + 1, 1, 7, '#1a1210')
    p.rect(wx + 4, wy - 2, 9, 1, '#2a1d18').set(wx + 18, wy, '#4a3a33').set(wx + 18, wy + 1, '#4a3a33').set(wx + 19, wy + 2, '#4a3a33')
    // forehead ridges
    for (const c of [3, 5, 7, 11, 13, 15]) p.set(wx + c, wy, '#7a3c26')
    p.rect(wx + 4, wy + 1, 11, 1, '#7a3c26').rect(wx + 9, wy, 2, 1, '#e09670').set(wx + 9, wy + 1, '#d68a62').set(wx + 10, wy + 1, '#8a4630')
    // uniform: black shoulders, operations gold
    p.rect(wx, wy + 7, 18, 1, BOB_WORF.lower!).set(wx, wy + 7, BOB_WORF.lowerShade!)
    // silver baldric from shoulder to hip: a bright band, dark lower edge, link marks
    for (let r = 0; r < 5; r++) {
      const c0 = 14 - r * 3
      p.rect(wx + c0 - 1, wy + 5 + r, 3, 1, '#d9dee4').set(wx + c0 + 1, wy + 5 + r, '#8d949c').set(wx + c0 - 1, wy + 5 + r, '#f4f7fa')
      if (r < 4) p.set(wx + c0 - 2, wy + 6 + r, '#6d747c')
    }
    p.rect(wx + 3, wy + 6, 1, 1, '#e8c547')
  }
  // he lifts his claw on the order, then brings it down on the console
  const press: [number, number][] = [[tPress, tPressEnd]]
  s += crabHD(BOB_WORF, wx, wy, 'right', T, { left: [], right: [[tWorfReady, tPress]] }, [], 4.7, worfDetails)
  const pr = new Pix().rows(
    ['SSS....', 'sSSS...', '..sSS..', '...SS..', '..LSSL.', '..S..S.'],
    wx + 18, wy + 4,
    { S: BOB_WORF.skin, s: BOB_WORF.shade, L: BOB_WORF.light },
  )

  // the tactical console in front of him
  const con = new Pix()
  con.rect(4, 35, 29, 1, '#9a8fa6').rect(3, 36, 31, 1, '#0b0910').rect(4, 35, 1, 1, '#5b5266')
  con.rect(5, 36, 4, 1, '#f29a3a').rect(10, 36, 3, 1, '#8aa7e8').rect(14, 36, 5, 1, '#c39be0').rect(20, 36, 3, 1, '#f7c487').rect(32, 36, 1, 1, '#8aa7e8')
  con.rect(3, 37, 31, 5, '#4a3020').rect(3, 37, 31, 1, '#7a5236').rect(3, 41, 31, 1, '#2e1e14')
  for (const x of [10, 18, 26]) con.rect(x, 38, 1, 3, '#33221a')
  s += `<g mask="url(#bobFadeC)">${con.svg()}</g>`
  // the fire button: a small warm glow that rises and slowly dies away
  s += bobR(28, 36, 2, 1, '#c0201c')
  s += `<g opacity="0">${bobR(27, 36, 4, 1, '#ffb070') + bobR(28, 36, 2, 1, '#ffe2c4')}<ellipse cx="${29 * Q}" cy="${36.5 * Q}" rx="7" ry="3" fill="#ffd0a0" opacity="0.4"/>${bobRamp([[tPress, 0], [tPress + 0.45, 1], [tPressEnd, 1], [tPressEnd + 1.0, 0]])}</g>`
  s += shown(pr.svg(), press, T)

  // ---- Riker before the screen: stares at Locutus, turns to Worf, raises a claw, turns back
  const rx = 54
  const ry = 28
  const hair = '#3b2518'
  const hairHi = '#5e3a26'
  const rikerDetails = (p: Pix) => {
    p.rect(rx + 1, ry, 16, 1, hair).rect(rx + 3, ry - 1, 12, 1, hair).set(rx + 6, ry - 1, hairHi).set(rx + 11, ry, hairHi)
    p.rect(rx + 1, ry + 1, 2, 1, hair).rect(rx + 15, ry + 1, 2, 1, hair)
    // sideburns into a full beard
    p.rect(rx, ry + 1, 1, 4, hair).rect(rx + 17, ry + 1, 1, 4, hair)
    for (let c = 0; c < 18; c++) if (![6, 7, 12, 13].includes(c)) p.set(rx + c, ry + 4, hair)
    p.rect(rx, ry + 5, 18, 1, hair)
    p.set(rx + 3, ry + 5, hairHi).set(rx + 14, ry + 5, hairHi)
    // combadge and pips
    p.rect(rx + 12, ry + 7, 2, 2, '#e8c547').set(rx + 12, ry + 7, '#fff3b0')
    p.set(rx + 2, ry + 6, '#e8c547').set(rx + 4, ry + 6, '#e8c547')
  }
  // his eyes for the turn: halfway, then on Worf (drawn over the face)
  const eyesAt = (e: number[]) => {
    const p = new Pix()
    for (let c = 4; c <= 13; c++) {
      const eye = e.includes(c)
      p.rect(rx + c, ry + 2, 1, 2, eye ? EYE_HD : BOB_RIKER.skin).set(rx + c, ry + 4, eye ? EYE_HD : hair)
    }
    return p.svg()
  }
  const raise: [number, number][] = [[tUp, tLower]]
  s += crabHD(BOB_RIKER, rx, ry, 'right', T, { left: [], right: raise }, [], 3.7, rikerDetails)
  s += shown(eyesAt([5, 6, 11, 12]), [[tTurn, tAtWorf], [tBackTurn, tAtScreen]], T)
  s += shown(eyesAt([4, 5, 10, 11]), [[tAtWorf, tBackTurn]], T)
  // the claw halfway up (on the way up, and on the way down)
  const sk = BOB_RIKER
  const half = new Pix()
  half.rect(rx + 18, ry + 4, 3, 2, sk.skin).rect(rx + 20, ry + 1, 2, 3, sk.skin).rect(rx + 21, ry + 1, 1, 3, sk.shade)
  half.rect(rx + 19, ry - 2, 1, 3, sk.skin).rect(rx + 22, ry - 2, 1, 3, sk.skin).rect(rx + 19, ry, 4, 1, sk.skin)
  half.set(rx + 19, ry - 2, sk.light).set(rx + 22, ry - 2, sk.light)
  s += shown(half.svg(), [[tHalf, tUp], [tLower, tDown]], T)

  return s
}

type Scene = { name: string; w: number; h: number; draw: () => string }

// Scenes reworked to one 17.17 s story that passed the flash check and review; the rest wait
const APPROVED = new Set(['Darmok', 'All Good Things', 'The Cloud', 'First Contact', 'Caretaker', 'Chain of Command', 'Scorpion', 'Q Who', 'The Doctor', 'The Inner Light', 'Déjà Q', 'Tapestry', 'The Best of Both Worlds'])

const SCENES_ALL: Scene[] = [
  { name: 'Darmok', w: GW * Q, h: GH * Q, draw: darmok },
  { name: 'All Good Things', w: GW * Q, h: GH * Q, draw: allGoodThings },
  { name: 'The Cloud', w: GW * Q, h: GH * Q, draw: janewayCoffee },
  { name: 'First Contact', w: GW * Q, h: GH * Q, draw: firstContactHD },
  { name: 'Caretaker', w: GW * Q, h: GH * Q, draw: caretaker },
  { name: 'Chain of Command', w: GW * Q, h: GH * Q, draw: chainOfCommandHD },
  { name: 'Scorpion', w: GW * Q, h: GH * Q, draw: scorpion },
  { name: 'Q Who', w: GW * Q, h: GH * Q, draw: qWho },
  { name: 'The Doctor', w: GW * Q, h: GH * Q, draw: doctorEmh },
  { name: 'The Inner Light', w: GW * Q, h: GH * Q, draw: innerLightHD },
  { name: 'Déjà Q', w: GW * Q, h: GH * Q, draw: facepalm },
  { name: 'Tapestry', w: GW * Q, h: GH * Q, draw: tapestry },
  { name: 'The Best of Both Worlds', w: GW * Q, h: GH * Q, draw: bestOfBothWorldsHD },
]
const SCENES: Scene[] = SCENES_ALL.filter(one => APPROVED.has(one.name))
const SCENE_NAMES = SCENES.map(one => one.name)


// The scene fills the band's full height, flush to its right edge
const SCENE_W = GW * Q
const SCENE_H = GH * Q

// Each scene is drawn once and reused
const drawn = new Map<number, string>()

// The desktop app rebuilds every mod element whenever anything a mod draws changes (the cache
// timer ticks every second), and a rebuilt scene image starts its animation from zero. So each
// rebuild hands over the scene already advanced to where it was: every animation's start time
// is shifted back by the seconds the scene has been showing.
function sceneAt(index: number, elapsedSec: number) {
  const svg = sceneSvg(index)
  if (!(elapsedSec > 0)) return svg
  const e = elapsedSec
  return svg.replace(/<(animate|animateTransform|animateMotion|set)\b([^>]*?)(\/?)>/g, (whole, tag, attrs, close) => {
    const m = /\sbegin="(-?[0-9.]+)s"/.exec(attrs)
    if (m) return `<${tag}${attrs.replace(m[0], ` begin="${(Number(m[1]) - e).toFixed(3)}s"`)}${close}>`
    if (/\sbegin="/.test(attrs)) return whole
    return `<${tag}${attrs} begin="${(-e).toFixed(3)}s"${close}>`
  })
}

function sceneSvg(index: number) {
  const i = index % SCENES.length
  const hit = drawn.get(i)
  if (hit) return hit
  const svg = drawScene(i)
  drawn.set(i, svg)
  return svg
}

function drawScene(index: number) {
  const sc = SCENES[index]
  const art =
    sc.w === SCENE_W && sc.h === SCENE_H
      ? sc.draw()
      : `<svg width="${SCENE_W}" height="${SCENE_H}" viewBox="0 0 ${sc.w} ${sc.h}" preserveAspectRatio="xMidYMid slice">${sc.draw()}</svg>`
  const title = `<text x="5" y="${SCENE_H - 4}" font-family="system-ui,Segoe UI,sans-serif" font-size="6.5" font-weight="700" letter-spacing="1" fill="${C.dim}" stroke="#16101f" stroke-width="2" stroke-linejoin="round" paint-order="stroke" text-rendering="geometricPrecision">${sc.name.toUpperCase()}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE_W}" height="${SCENE_H}" viewBox="0 0 ${SCENE_W} ${SCENE_H}" shape-rendering="crispEdges">${art}${title}</svg>`
}

// ---------- usage meters ----------

// When the weekly window resets if no reading says: next Sunday, 19:00 local time
function nextSundayEvening(now: number) {
  const d = new Date(now)
  d.setHours(19, 0, 0, 0)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  if (d.getTime() <= now) d.setDate(d.getDate() + 7)
  return d.getTime()
}

// When the window resets, in epoch ms
const resetAt = (l: Limit, now: number) =>
  l.resetsAt ? Date.parse(l.resetsAt) : l.kind === 'seven_day' ? nextSundayEvening(now) : 0

// The widest the countdown can get, in the surface's monospace cells, so ticking
// digits of different widths never push what follows
const countdownCells = (l: Limit) => (l.kind === 'seven_day' ? 7 : 5)

// Marathon style: "4:39" (hours:minutes), or "1:18:03" (days:hours:minutes) past a day.
// No seconds: ticking them would redraw the band every second, and that breaks the scene
function countdown(l: Limit, now: number) {
  const at = resetAt(l, now)
  if (!(at > now)) return '0:00'
  const mins = Math.ceil((at - now) / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = String(mins % 60).padStart(2, '0')
  return d > 0 ? `${d}:${String(h).padStart(2, '0')}:${m}` : `${h}:${m}`
}

const label = (kind: string) =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replace(/_/g, ' ')

const RING = 30

function ringSvg(limit: Limit, icon: 'clock' | 'cal') {
  const c = RING / 2
  const R = c - 2.5
  const circ = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, limit.percentUsed))
  const color = pct >= 90 ? C.hot : pct >= 75 ? C.warn : C.ring
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${RING}" height="${RING}" viewBox="0 0 ${RING} ${RING}">`
  s += `<circle cx="${c}" cy="${c}" r="${R}" fill="#241a36" stroke="${C.track}" stroke-width="2.5"/>`
  s += `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(circ * pct) / 100} ${circ}" transform="rotate(-90 ${c} ${c})"/>`
  s +=
    icon === 'clock'
      ? `<circle cx="${c}" cy="${c}" r="6" fill="none" stroke="${C.dim}" stroke-width="1.6"/><path d="M${c} ${c - 3.5}V${c}l2.5 1.8" stroke="${C.dim}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
      : `<rect x="${c - 6}" y="${c - 5}" width="12" height="11" rx="1.5" fill="none" stroke="${C.dim}" stroke-width="1.6"/><path d="M${c - 6} ${c - 1.5}h12M${c - 3} ${c - 7}v3.5M${c + 3} ${c - 7}v3.5" stroke="${C.dim}" stroke-width="1.6"/>`
  return s + '</svg>'
}

// ---------- hooks ----------

const toLimit = (l: Limit): Limit => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })

// Live plan usage, the same figures as the app's own usage panel: fetched every minute with the
// session's own login (the engine sets the credential; the mod never sees it)
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage?at_wall=1&skip_spend=1'

// Every open session runs this mod, and the usage service refuses callers that ask too often, so
// the sessions share one reading through $.store: whichever is due fetches, the rest reuse it.
// A refusal pushes the next try back (its Retry-After, else doubling up to half an hour).
const USAGE_EVERY_MS = 3 * 60 * 1000

type UsageShared = { at: number; next: number; backoff: number; limits: Limit[] }

async function pollUsage($: Host) {
  try {
    const now = await $.clock.now()
    const shared = ((await $.store.get('usage')) ?? { at: 0, next: 0, backoff: 0, limits: [] }) as UsageShared
    if (now < shared.next) {
      if (shared.limits.length > 0 && shared.at > 0) await update($, limits, () => shared.limits)
      return
    }
    // claim the slot first, so the other sessions wait for this fetch
    await $.store.set('usage', { ...shared, next: now + USAGE_EVERY_MS })
    const auth = await $.session.authorize()
    if (!auth) return
    const res = await $.http.fetch(USAGE_URL, {
      auth: auth.handle,
      headers: { 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json', 'User-Agent': 'claude-cli/2.1.286 (external, claude-desktop)', 'x-app': 'cli' },
    })
    if (!res.ok) {
      const retry = Number(res.headers['retry-after'])
      const backoff = Math.min(30 * 60 * 1000, Math.max(USAGE_EVERY_MS, shared.backoff * 2))
      const wait = retry > 0 ? retry * 1000 : backoff
      await $.store.set('usage', { ...shared, next: now + wait, backoff })
      return
    }
    const body = JSON.parse(res.text) as Record<string, any>
    const iso = (at: unknown) => (typeof at === 'number' ? new Date(at * 1000).toISOString() : typeof at === 'string' ? at : undefined)
    const next: Limit[] = []
    for (const kind of ['five_hour', 'seven_day']) {
      const w = body[kind]
      if (w && typeof w.utilization === 'number') next.push({ kind, percentUsed: Math.round(w.utilization * 10) / 10, resetsAt: iso(w.resets_at) })
    }
    await $.store.set('usage', { at: now, next: now + USAGE_EVERY_MS, backoff: 0, limits: next })
    if (next.length > 0) await update($, limits, () => next)
  } catch {
    // the next poll tries again
  }
}

// The prompt cache lives an hour from the last message, yours or Claude's
const CACHE_MS = 60 * 60 * 1000
// Past this, the session is simply cold: no timer
const STALE_MS = 6 * 60 * 60 * 1000
let lastMessageAt = 0


// The app draws this label in its own proportional font and lets the label's width follow its
// text, so a "1" turning into a "0" would shift it. Mathematical sans-serif digits (U+1D7E2..)
// look like ordinary digits but are all the same width.
const evenDigits = (t: string) => t.replace(/[0-9]/g, d => String.fromCodePoint(0x1d7e2 + Number(d)))

// "59:57", from "60:00" down; past an hour cold, "1:02:03"
function clockText(secs: number) {
  const ss = String(secs % 60).padStart(2, '0')
  if (secs <= 3600) return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${ss}`
  return `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${ss}`
}

// Counting down to the cache's expiry while warm; counting up once cold; null once stale
function cacheTimer(now: number): { text: string; isWarm: boolean } | null {
  if (lastMessageAt === 0) return null
  const since = now - lastMessageAt
  if (since >= STALE_MS) return null
  return since < CACHE_MS
    ? { text: clockText(Math.ceil((CACHE_MS - since) / 1000)), isWarm: true }
    : { text: clockText(Math.floor((since - CACHE_MS) / 1000)), isWarm: false }
}

// A message from either side: the cache's hour starts again
async function markMessage($: Host) {
  lastMessageAt = await $.clock.now()
  await update($, lastMessage, () => lastMessageAt)
}

// Every second while there is a timer to show. The desktop app rebuilds the band on every update,
// so the band reads the tick too: each rebuild then carries the scene advanced to this very second
// (sceneAt). Left out, the app rebuilt it from its last drawing, rewinding the scene every second.
// With no timer showing, once a minute is enough for the band's countdowns; the tick that hides
// the timer still goes out, so its last reading never stays on screen.
let timerShown = false
let lastTick = 0
async function tickCacheStatus($: Host) {
  const now = await $.clock.now()
  const shown = cacheTimer(now) !== null
  const due = shown || timerShown || Math.floor(now / 60000) !== Math.floor(lastTick / 60000)
  timerShown = shown
  if (!due) return
  lastTick = now
  await update($, tick, n => n + 1)
}

// The next scene comes ROUNDS plays after the current one started, however it started
let shownAt = 0
let rotation: { cancel: () => void } | undefined

function rotateAfter($: Host) {
  rotation?.cancel()
  void $.clock.now().then(t => (shownAt = t))
  rotation = $.clock.after(SCENE_SECONDS * ROUNDS * 1000, () => void advanceIfDue($))
}

async function advanceIfDue($: Host) {
  if (await read($, isPaused)) return
  if ((await $.clock.now()) - shownAt < SCENE_SECONDS * ROUNDS * 1000 - 50) return
  await update($, scene, n => (n + 1) % SCENES.length)
  rotateAfter($)
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'trek', description: 'Next Star Trek scene; /trek pause or /trek play to hold or resume the rotation' })
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits.map(toLimit))
    lastMessageAt = await read($, lastMessage)
    void pollUsage($)
    $.clock.every(60_000, () => void pollUsage($))
    // the band only redraws when something changes: each redraw restarts the scene's animation
    $.clock.every(60_000, () => {
      void advanceIfDue($)
    })
    rotateAfter($)
    $.clock.every(1000, () => void tickCacheStatus($))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await update($, limits, () => e.rateLimits.map(toLimit))
    // a response just landed: the cache was used, and its hour restarted, now
    if (e.changed.includes('context')) await markMessage($)
    return next(e)
  })

  // the coloured timer: drawn beside the footer's mode labels, green while warm, red once cold
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    await read($, tick)
    const timer = cacheTimer(await $.clock.now())
    if (!timer) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const own = await next(e)
    return (
      <Box flexDirection="row" gap={1}>
        {own}
        <Text color={timer.isWarm ? '#5fd38a' : '#ff6b81'}>{`Cache: ${evenDigits(timer.text)}`}</Text>
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    await markMessage($)
    return next(e)
  })

  on('command.run', { command: 'trek' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'pause' || arg === 'play' || arg === 'resume') {
      await update($, isPaused, () => arg === 'pause')
      if (arg !== 'pause') rotateAfter($)
      return { text: arg === 'pause' ? '⏸ Scene paused' : '▶ Scenes rotating again' }
    }
    await update($, scene, v => (v + 1) % SCENES.length)
    rotateAfter($)
    const n = await read($, scene)
    return { text: `🖖 ${SCENE_NAMES[n % SCENE_NAMES.length]}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, limits)
    const idx = await read($, scene)
    await read($, tick)
    const now = await $.clock.now()
    const shown = [
      list.find(l => l.kind === 'five_hour'),
      list.find(l => l.kind === 'seven_day'),
    ]
      .filter(Boolean)
      .map(l => (l!.resetsAt && Date.parse(l!.resetsAt) <= now ? { ...l!, percentUsed: 0, resetsAt: undefined, isReset: true } : l)) as (Limit & { isReset?: boolean })[]

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box gap={3}>
          {shown.map(l => (
            <Box gap={1}>
              <Text bold color={C.text}>{Math.round(l.percentUsed)}%</Text>
              <Text color={C.dim}>{l.isReset ? '' : countdown(l, now)}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const { Box, Text, Svg, Button } = $.ui.resolve(e)
    const paused = await read($, isPaused)
    const name = SCENE_NAMES[idx % SCENE_NAMES.length]
    return (
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        backgroundColor={C.bg}
        padding={0}
        paddingLeft={2}
        overflow="hidden"
      >
        <Box flexDirection="column" gap={0} flexShrink={1} minWidth={0} overflow="hidden">
        <Box flexDirection="row" alignItems="center" gap={3} flexShrink={1} minWidth={0} overflow="hidden">
          {shown.length === 0 && <Text color={C.dim} wrap="truncate">Usage limits show up after Claude's first reply.</Text>}
          {shown.map(l => (
            <Box flexDirection="row" alignItems="center" gap={1} flexShrink={1} minWidth={0}>
              <Svg
                source={ringSvg(l, l.kind === 'seven_day' ? 'cal' : 'clock')}
                alt={`${label(l.kind)} ${Math.round(l.percentUsed)}%`}
                width={RING}
                height={RING}
              />
              <Text bold color={C.text} wrap="truncate">{Math.round(l.percentUsed)}%</Text>
              <Box minWidth={countdownCells(l)} flexShrink={0}>
                <Text color={C.dim}>{l.isReset ? '' : countdown(l, now)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
        </Box>
        <Box key={`scene-${idx}`} flexShrink={0} position="relative">
          <Svg source={sceneAt(idx, shownAt ? (now - shownAt) / 1000 : 0)} alt={name} width={SCENE_W} height={SCENE_H} />
          <Box position="absolute" top={0} right={0} flexDirection="row">
            <Button
              key="trek-pause"
              label={paused ? '▶' : '⏸'}
              plain
              dimColor
              onPress={async () => {
                await update($, isPaused, v => !v)
                if (!(await read($, isPaused))) rotateAfter($)
              }}
            />
            <Button
              key="trek-next"
              label="⏭"
              plain
              dimColor
              onPress={async () => {
                await update($, scene, v => (v + 1) % SCENES.length)
                rotateAfter($)
              }}
            />
          </Box>
        </Box>
      </Box>
    )
  })
}
