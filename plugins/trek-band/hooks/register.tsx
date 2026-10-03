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
// How full the context window is
const ctx = atom({ plugin: 'trek-band', key: 'ctx' } as const, { tokens: 0, window: 0 })

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

// A hop rises over ~0.14 s (easing out), holds, and lands over ~0.14 s (easing in)
const EASE_OUT = '0.2 0.7 0.4 1'
const EASE_IN = '0.6 0 0.8 0.3'
const HOLD = '0 0 1 1'
function hopQ(on: [number, number][], dur: number) {
  const pts: [number, number, string][] = [[0, 0, HOLD]] // time, y, spline into this point
  for (const [a, b] of merge(on)) {
    const r = Math.min(0.14, (b - a) / 3)
    const t0 = Math.max(a - r / 2, pts[pts.length - 1][0] + 0.001)
    pts.push([t0, 0, HOLD], [t0 + r, -2 * Q, EASE_OUT], [Math.max(b - r / 2, t0 + r + 0.001), -2 * Q, HOLD])
    pts.push([Math.min(b + r / 2, dur), 0, EASE_IN])
  }
  if (pts[pts.length - 1][0] < dur) pts.push([dur, 0, HOLD])
  const times = pts.map(([t]) => +(t / dur).toFixed(5))
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${dur}s" repeatCount="indefinite" values="${pts.map(([, y]) => `0 ${y}`).join(';')}" keyTimes="${times.join(';')}" keySplines="${pts.slice(1).map(([, , sp]) => sp).join(';')}"/>`
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

// Half-raised: the arm on a diagonal, between rest and up
function armMidHD(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const d = side === 'left' ? -1 : 1
  const sx = side === 'left' ? x - 3 : x + 18
  p.rect(sx, y + 4, 3, 2, k.skin)
  for (let i = 0; i < 4; i++) p.rect(sx + (side === 'left' ? -i : 1 + i), y + 2 - i, 2, 2, k.skin)
  const cx = side === 'left' ? x - 8 : x + 21
  p.rect(cx, y - 3, 1, 2, k.skin).rect(cx + 3, y - 3, 1, 2, k.skin).rect(cx, y - 1, 4, 1, k.skin)
  p.set(cx, y - 3, k.light).set(cx + 3, y - 3, k.light)
  void d
  return p.svg()
}

// Each raised window split into rest -> half (0.09 s) -> up -> half (0.09 s) -> rest
const ARM_STEP = 0.09
function armPhases(on: [number, number][]) {
  const up: [number, number][] = []
  const mid: [number, number][] = []
  for (const [a, b] of merge(on)) {
    const st = Math.min(ARM_STEP, (b - a) / 3)
    mid.push([a, a + st], [b - st, b])
    up.push([a + st, b - st])
  }
  return { up, mid }
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
  for (const side of ['left', 'right'] as const) {
    if (!pose[side].length) continue
    const { up, mid } = armPhases(pose[side])
    s += shown(armMidHD(k, x, y, side), mid, dur)
    s += shown(armUpHD(k, x, y, side), up, dur)
  }
  const lids = new Pix()
  ex.forEach(e => lids.rect(x + e, y + 2, 2, 3, k.skin))
  s += `<g opacity="0">${lids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${(SCENE_SECONDS / Math.max(1, Math.round(SCENE_SECONDS / blinkEvery))).toFixed(4)}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.92;0.95"/></g>`
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

// A raised arm, fully up (the same art as armUpHD), split into the shoulder that stays put
// and the arm + claw that slide: lowered 4 px it is the half-raise.
function dkArmV(k: CrabHD, x: number, y: number, side: Side) {
  const ax = side === 'left' ? x - 3 : x + 19
  const shoulder = new Pix().rect(side === 'left' ? x - 3 : x + 18, y + 4, 3, 2, k.skin).svg()
  const p = new Pix()
  p.rect(ax, y - 4, 2, 8, k.skin)
  p.rect(side === 'left' ? ax : ax + 1, y - 4, 1, 8, k.shade)
  const cx = side === 'left' ? x - 4 : x + 18
  const cy = y - 8
  p.rect(cx, cy, 1, 3, k.skin).rect(cx + 3, cy, 1, 3, k.skin)
  p.rect(cx, cy + 2, 4, 1, k.skin).rect(cx + 1, cy + 3, 2, 1, k.skin)
  p.set(cx, cy, k.light).set(cx + 3, cy, k.light)
  return { shoulder, arm: p.svg(), clip: [cx - 1, y + 4] }
}

// The arm moves toward where the story wants it, one stage every DK_STEP s:
// 0 rest, 1 diagonal, 2 half-raised, 3-6 sliding up one px per stage (6 = fully up).
// Rest, diagonal and raised are drawings; from half to fully up the arm glides.
const DK_STEP = 0.08
function dkArmPlan(a: DkArms, T: number) {
  const inside = (w: [number, number][], t: number) => w.some(([t0, t1]) => t >= t0 && t < t1)
  const target = (t: number) => (inside(a.up, t) ? 6 : inside(a.half, t) ? 2 : 0)
  const times = [...a.half, ...a.up].flat().sort((p, q) => p - q)
  const steps: [number, number, number][] = [] // time, from, to
  let lvl = 0
  let t = 0
  while (t < T) {
    const want = target(t)
    if (want === lvl) {
      const next = times.find(x => x > t + 1e-9)
      if (next === undefined) break
      t = next
      continue
    }
    const to = lvl + (want > lvl ? 1 : -1)
    steps.push([t, lvl, to])
    lvl = to
    t = +(t + DK_STEP).toFixed(4)
  }
  // which drawing is up: 0 rest, 1 diagonal, 2 raised
  const show: [number, number][][] = [[], [], []]
  let from = 0
  let cur = 0
  for (const [t0, , to] of steps) {
    const d = Math.min(to, 2)
    if (d !== cur) {
      show[cur].push([from, t0])
      from = t0
      cur = d
    }
  }
  show[cur].push([from, T])
  // the glide: 4 px down at half, 0 at fully up, eased at the start and end of each run
  const pts: [number, number, string][] = [[0, 4, '']]
  const moves = steps.filter(([, f, to]) => f >= 2 && to >= 2)
  moves.forEach(([t0, f, to], i) => {
    const prev = moves[i - 1]
    const next = moves[i + 1]
    const first = !prev || Math.abs(prev[0] + DK_STEP - t0) > 1e-6 || Math.sign(prev[2] - prev[1]) !== Math.sign(to - f)
    const last = !next || Math.abs(t0 + DK_STEP - next[0]) > 1e-6 || Math.sign(next[2] - next[1]) !== Math.sign(to - f)
    const sp = first && last ? '0.4 0 0.6 1' : first ? '0.5 0 1 1' : last ? '0 0 0.5 1' : '0 0 1 1'
    if (first) pts.push([t0, 6 - f, '0 0 1 1'])
    pts.push([t0 + DK_STEP, 6 - to, sp])
  })
  pts.push([T, 4, '0 0 1 1'])
  const glide = `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${T}s" repeatCount="indefinite" values="${pts.map(p => `0 ${p[1] * Q}`).join(';')}" keyTimes="${pts.map(p => +(p[0] / T).toFixed(5)).join(';')}" keySplines="${pts.slice(1).map(p => p[2]).join(';')}"/>`
  return { show, glide }
}

let dkClipN = 0
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
    const plan = dkArmPlan(arms[side], T)
    s += shown(armRestHD(k, x, y, side), plan.show[0], T)
    if (plan.show[1].length) s += shown(armMidHD(k, x, y, side), plan.show[1], T)
    if (plan.show[2].length) {
      const v = dkArmV(k, x, y, side)
      const id = `dkClip${dkClipN++}`
      s += `<clipPath id="${id}"><rect x="${v.clip[0] * Q}" y="0" width="${6 * Q}" height="${v.clip[1] * Q}"/></clipPath>`
      s += shown(`${v.shoulder}<g clip-path="url(#${id})"><g>${v.arm}${plan.glide}</g></g>`, plan.show[2], T)
    }
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
  dkClipN = 0
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
    const tw = (T0 / [7, 5, 4, 4, 3][i]).toFixed(4)
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${glow.svg()}<animate attributeName="opacity" values="0.15;0.9;0.15" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" dur="${tw}s" begin="${-i * 0.6}s" repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0.6;1;0.6" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" dur="${tw}s" begin="${-i * 0.6}s" repeatCount="indefinite"/></g>`
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
  s += `<ellipse cx="${51 * Q}" cy="${40 * Q}" rx="84" ry="30" fill="url(#dkGlow)"><animate attributeName="opacity" values="0.9;0.97;0.92;1;0.9" dur="${(T0 / 4).toFixed(4)}s" calcMode="spline" keyTimes="0;0.3;0.5;0.8;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/></ellipse>`

  // smoke curling up from the fire
  for (let i = 0; i < 3; i++) {
    const d = (T0 / [4, 3, 3][i]).toFixed(4)
    s += `<rect x="${50 * Q}" y="${23 * Q}" width="${3 * Q}" height="${2 * Q}" fill="#8a7fa0" opacity="0"><animateMotion path="M0 0 q 6 -12 2 -22 t 8 -22" dur="${d}s" begin="${-i * 1.9}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.35;0" dur="${d}s" begin="${-i * 1.9}s" repeatCount="indefinite"/></rect>`
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
  // each drawing melts into the next: the incoming one fades in on top, then the one
  // beneath fades away, so the fire never thins. The first drawing is repeated on top
  // to close the loop, and the loop divides the story so the restart is seamless.
  {
    const FD = T0 / 17 // ~1.01 s for all four drawings
    const S = FD / 4
    const F = 0.11
    const k = (t: number) => +(t / FD).toFixed(4)
    const ease = '0.4 0 0.6 1'
    const op = (vals: number[], ts: number[]) =>
      `<animate attributeName="opacity" calcMode="spline" dur="${FD.toFixed(4)}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${ts.map(k).join(';')}" keySplines="${vals.slice(1).map(() => ease).join(';')}"/>`
    const art = (i: number) => new Pix().rows(frames[i], 45, 25, pal).svg()
    // drawing 0 at the bottom: full at the start, fades once drawing 1 is in
    s += `<g>${`<g id="dkFl0">${art(0)}</g>`}${op([1, 1, 0, 0], [0, S, S + F, FD])}</g>`
    for (let i = 1; i < 4; i++) {
      const a = i * S
      const b = (i + 1) * S
      if (i < 3) s += `<g opacity="0">${art(i)}${op([0, 0, 1, 1, 0, 0], [0, a - F, a, b, b + F, FD])}</g>`
      else s += `<g opacity="0">${art(i)}${op([1, 0, 0, 1, 1], [0, F, a - F, a, FD])}</g>`
    }
    // drawing 0 again on top, fading in at the end of the loop and away just after its start
    s += `<g opacity="0"><use href="#dkFl0"/>${op([1, 0, 0, 1], [0, F, FD - F, FD])}</g>`
  }
  // embers
  for (let i = 0; i < 5; i++) {
    const d = (T0 / [9, 7, 6, 5, 4][i]).toFixed(4)
    s += `<rect x="${51 * Q}" y="${25 * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffd36b' : '#ff9a4a'}" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 8 : -8} -14 ${i % 2 ? -3 : 4} -28 t ${i % 2 ? 6 : -6} -18" dur="${d}s" begin="${-i * 0.5}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0.8;0" keyTimes="0;0.08;0.5;1" dur="${d}s" begin="${-i * 0.5}s" repeatCount="indefinite"/></rect>`
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
// pot, Picard looks at his own card and smiles. A calm tableau; then the cards go down,
// the chips go back and Picard fades from his chair, so the loop starts where it began.
// All motion is eased tweens; pose changes step through in-between drawings.

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

// ---------- smooth tracks on the story timeline ----------
const AGT_T = SCENE_SECONDS
const AGT_EASE = '0.4 0 0.2 1'
const agtKT = (t: number) => +(t / AGT_T).toFixed(5)

// A transform tween through [time, value] keys (values in user units), eased between
// keys that differ and held between keys that match
function agtTf(type: string, pts: [number, string][], ease = AGT_EASE) {
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < AGT_T) all.push([AGT_T, all[all.length - 1][1]])
  const sp = all.slice(1).map(([, v], i) => (v === all[i][1] ? '0 0 1 1' : ease))
  return `<animateTransform attributeName="transform" type="${type}" calcMode="spline" dur="${AGT_T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => agtKT(p[0])).join(';')}" keySplines="${sp.join(';')}"/>`
}
// translate in art pixels
const agtMove = (pts: [number, number, number][], ease = AGT_EASE) => agtTf('translate', pts.map(([t, x, y]) => [t, `${x * Q} ${y * Q}`] as [number, string]), ease)

// An opacity track, linear between [time, value] keys
function agtOp(pts: [number, number][]) {
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < AGT_T) all.push([AGT_T, all[all.length - 1][1]])
  return `<animate attributeName="opacity" dur="${AGT_T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => agtKT(p[0])).join(';')}"/>`
}
// Visible inside each window, fading in and out over f seconds
function agtFadeWin(on: [number, number][], f = 0.12) {
  const pts: [number, number][] = [[0, on[0][0] <= 0 ? 1 : 0]]
  for (const [a, b] of on) {
    if (a > 0) pts.push([a, 0], [a + f, 1])
    if (b < AGT_T) pts.push([b - f, 1], [b, 0])
  }
  return agtOp(pts)
}
const agtFaded = (svg: string, on: [number, number][], f = 0.12) => `<g opacity="0">${svg}${agtFadeWin(on, f)}</g>`

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

// Claws resting on the table edge in front of the body (dy -1: lifting off it)
function agtNub(k: CrabHD, x: number, side: Side, dy = 0) {
  const cx = side === 'left' ? x + 1 : x + 14
  return new Pix().rect(cx, 35 + dy, 3, 1, k.light).rect(cx, 36 + dy, 3, 1, k.skin).set(side === 'left' ? cx : cx + 2, 36 + dy, k.shade).svg()
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

// A claw raised from the felt and (optionally) lowered again: nub, lifted nub, half-raised,
// then the raised arm (with whatever it holds) slides up out of the shoulder, eased.
// Up at a, starts down at b (back on the felt at b + 0.4).
const AGT_SLIDE = 4
function agtArm(k: CrabHD, x: number, side: Side, held: string, a: number, b?: number) {
  const y = AGT_Y
  const e = b ?? AGT_T
  const back: [number, number][] = b === undefined ? [] : [[b + 0.32, b + 0.4]]
  let s = shown(agtNub(k, x, side), complement(merge([[a, b === undefined ? AGT_T : b + 0.4]]), AGT_T), AGT_T)
  s += shown(agtNub(k, x, side, -1), [[a, a + 0.08], ...back], AGT_T)
  s += shown(agtArmMid(k, x, y, side), b === undefined ? [[a + 0.08, a + 0.16]] : [[a + 0.08, a + 0.16], [b + 0.24, b + 0.32]], AGT_T)
  const mv: [number, number, number][] = [[a + 0.16, 0, AGT_SLIDE], [a + 0.4, 0, 0]]
  if (b !== undefined) mv.push([b, 0, 0], [b + 0.24, 0, AGT_SLIDE])
  s += `<g clip-path="url(#agtArmClip)">${shown(`<g>${armUpHD(k, x, y, side)}${held}${agtMove(mv)}</g>`, [[a + 0.16, b === undefined ? e : b + 0.24]], AGT_T)}</g>`
  return s
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
    <clipPath id="agtArmClip"><rect width="${W}" height="${(Y + 6) * Q}"/></clipPath>
    <radialGradient id="agtGlow"><stop offset="0" stop-color="#ffb060" stop-opacity="0.38"/><stop offset="0.6" stop-color="#ff9a4a" stop-opacity="0.1"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <linearGradient id="agtCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd89a" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb060" stop-opacity="0.04"/></linearGradient>
  </defs>`

  // ---- the room: wall, the big window onto the stars, the lamp ----
  let back = `<rect width="${W}" height="${H}" fill="url(#agtWall)"/>`
  const wall = new Pix()
  for (const c of [8, 20, 87]) wall.rect(c, 0, 1, 36, '#2a1f2c').rect(c + 1, 0, 1, 36, '#3e2f3a')
  wall.rect(0, 22, GW, 1, '#4a3842').rect(0, 23, GW, 1, '#2a1f2c') // window ledge line
  back += wall.svg()
  // window: space with stars drifting slowly past, three panes. The star field repeats every
  // 31 art px and drifts exactly one repeat per story, so the loop restarts seamlessly.
  back += `<rect x="${23 * Q}" y="${4 * Q}" width="${62 * Q}" height="${15 * Q}" fill="url(#agtSpace)"/>`
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const star = new Pix()
  const starB = new Pix()
  const TILE = 31
  for (let i = 0; i < 23; i++) {
    const x = 23 + Math.floor(rnd() * TILE)
    const y = 4 + Math.floor(rnd() * 15)
    const b = rnd()
    for (const o of [0, TILE, 2 * TILE]) (b < 0.75 ? star : starB).set(x + o, y, b < 0.75 ? '#7d70a8' : '#e8e0ff')
  }
  back += `<g clip-path="url(#agtWin)"><g>${star.svg()}<g>${starB.svg()}<animate attributeName="opacity" values="1;0.6;1" dur="${dur / 5}s" repeatCount="indefinite"/></g><animateTransform attributeName="transform" type="translate" values="0 0;${-TILE * Q} 0" dur="${dur}s" repeatCount="indefinite"/></g>`
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
  s += `<polygon points="${42 * Q},${5 * Q} ${51 * Q},${5 * Q} ${84 * Q},${37 * Q} ${10 * Q},${37 * Q}" fill="url(#agtCone)"><animate attributeName="opacity" values="1;0.9;1" dur="${dur / 3}s" repeatCount="indefinite"/></polygon>`
  s += lamp.svg()
  s += `<ellipse cx="${47 * Q}" cy="${33 * Q}" rx="92" ry="30" fill="url(#agtGlow)"/>`

  // Picard's empty chair
  const chair = new Pix()
  chair.rect(71, 25, 12, 1, '#7a4040').rect(70, 26, 14, 10, '#5a2c30').rect(70, 26, 14, 1, '#8a4a48').rect(70, 27, 1, 9, '#7a4040').rect(83, 27, 1, 9, '#3e1c20')
  s += chair.svg()

  // ---- the story, on one 17.17 s timeline ----
  const walk0 = 1.1 // starts walking in
  const walkEnd = 3.7 // standing by the chair
  const sitA = 4.75 // lowering
  const sitB = 5.1 // seated
  const deckMid = 5.4 // reaching for the deck
  const deckUp = 5.8 // deck raised
  const shuf = [5.9, 6.2, 6.5, 6.8, 7.1] // split, riffle, split, riffle, squared
  const deal0 = 7.4 // first card leaves the deck
  const dealGap = 0.55
  const flight = 0.4
  const deckDown = 9.4 // the deck goes back on the table (on the felt at 9.8)
  const armDown = 9.8
  const rikerAt = 9.9
  const dataAt = 11.2
  const worfAt = 12.5
  const picAt = 13.9
  const looks: Record<string, [number, number]> = { r: [3.8, 5.4], d: [4.0, 5.5], w: [4.2, 5.6] }
  // the reset back to the opening frame
  const rDown = 15.7 // Riker's cards go down
  const wDown = 15.8 // Worf's
  const dDown = 15.9 // Data's
  const chipsBack: [number, number] = [16.0, 16.6]
  const picFade: [number, number] = [16.1, 16.8]

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
    r += agtLids(k, x, Y, ex, dur / 4, 0.3)
    r += agtFaded(agtLookUp(k, x, Y, ex, agtPlainEye), [looks.r])
    const grin = new Pix().rect(x + 8, Y + 5, 5, 1, '#fff4e0').set(x + 7, Y + 4, '#fff4e0').set(x + 13, Y + 4, '#fff4e0')
    r += agtFaded(grin.svg(), [[rikerAt + 0.5, rDown + 0.3]], 0.3)
    r += agtNub(k, x, 'left')
    r += agtArm(k, x, 'right', agtFan(new Pix(), x + 18, Y - 8).svg(), rikerAt, rDown)
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
    // the head tilt: an eased skew about the body's centre, right side rising two pixels
    const tA = dataAt + 0.7
    const tB = dataAt + 2.0
    const cx = (x + 9) * Q
    const cy = (Y + 5) * Q
    const tilt = agtTf('skewY', [[tA - 0.1, '0'], [tA + 0.3, '-6.3'], [tB - 0.3, '-6.3'], [tB + 0.1, '0']])
    let d = `<g transform="translate(${cx} ${cy})"><g>${tilt}<g transform="translate(${-cx} ${-cy})">${p.svg()}${agtLids(k, x, Y, ex, dur / 3, 0.5)}${agtFaded(agtLookUp(k, x, Y, ex, agtDataEye), [looks.d])}</g></g></g>`
    d += agtNub(k, x, 'left')
    // the claw lifts off the felt, then rises holding the card up in front of him
    d += shown(agtNub(k, x, 'right'), complement([[dataAt, dDown + 0.3]], dur), dur)
    d += shown(agtNub(k, x, 'right', -1), [[dataAt, dataAt + 0.12], [dDown + 0.2, dDown + 0.3]], dur)
    const hand = agtFan(new Pix(), x + 11, Y + 9).rect(x + 12, 35, 4, 1, k.light).rect(x + 12, 36, 4, 1, k.skin)
    d += `<g opacity="0">${hand.svg()}${agtMove([[dataAt + 0.08, 0, 1], [dataAt + 0.32, 0, 0], [dDown, 0, 0], [dDown + 0.24, 0, 1]])}${agtFadeWin([[dataAt + 0.08, dDown + 0.24]], 0.16)}</g>`
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
    w += agtLids(k, x, Y, ex, dur / 3, 0.62)
    w += agtFaded(agtLookUp(k, x, Y, ex, agtPlainEye), [looks.w])
    const brow = new Pix().set(x + 5, Y + 1, '#3a1a10').rect(x + 6, Y + 2, 2, 1, '#3a1a10').rect(x + 12, Y + 2, 2, 1, '#3a1a10').set(x + 14, Y + 1, '#3a1a10').rect(x + 8, Y + 1, 4, 1, '#5a2a18')
    brow.rect(x + 8, Y + 4, 3, 1, '#3a1a10').set(x + 7, Y + 5, '#3a1a10').set(x + 11, Y + 5, '#3a1a10') // a frown
    w += agtFaded(brow.svg(), [[worfAt + 0.5, wDown + 0.3]], 0.3)
    // left claw: picks up his card and holds it up
    w += agtArm(k, x, 'left', agtFan(new Pix(), x - 5, Y - 8).svg(), worfAt, wDown)
    // right claw: shoves his chip stack into the pot, then comes back
    w += `<g>${agtNub(k, x, 'right')}${agtMove([[worfAt + 0.9, 0, 0], [worfAt + 1.7, -8, 0], [worfAt + 2.0, -8, 0], [worfAt + 2.5, 0, 0]])}</g>`
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
    // legs while walking: two frames in turn at ~7.7 Hz while the body glides
    const legA = new Pix()
    const legB = new Pix()
    for (const lx of [1, 5, 11, 15]) legA.rect(x + lx, Y + 10, 2, 3, k.legs)
    for (const [lx, l] of [[0, 3], [5, 2], [10, 3], [15, 2]] as [number, number][]) legB.rect(x + lx, Y + 10, 2, l, k.legs)
    const stepsA: [number, number][] = [[0, walk0]]
    const stepsB: [number, number][] = []
    const nLeg = 20
    const legT = (walkEnd - walk0) / nLeg
    for (let i = 0; i < nLeg; i++) (i % 2 ? stepsA : stepsB).push([walk0 + i * legT, walk0 + (i + 1) * legT])
    stepsA.push([walkEnd, sitB])
    pc += shown(legA.svg(), stepsA, dur)
    pc += shown(legB.svg(), stepsB, dur)
    pc += agtLids(k, x, Y, ex, dur / 4, 0.75)
    // left claw: reaches for the deck, holds it up through the shuffle and the deal.
    // The deck splits and comes back together in eased slides; the riffle fades in between.
    const halfL = new Pix().rect(x - 4, Y - 12, 2, 4, AGT_CARD_R).rect(x - 4, Y - 12, 2, 1, AGT_CARD_W).rect(x - 4, Y - 9, 2, 1, '#d8d0c4').set(x - 3, Y - 10, '#d0505a')
    const halfR = new Pix().rect(x - 2, Y - 12, 2, 4, AGT_CARD_R).rect(x - 2, Y - 12, 2, 1, AGT_CARD_W).rect(x - 2, Y - 9, 2, 1, '#d8d0c4')
    const apart = (dx: number, dy: number) => {
      const k2: [number, number, number][] = []
      for (const t of [shuf[0], shuf[2]]) k2.push([t, 0, 0], [t + 0.16, dx, dy], [t + 0.24, dx, dy], [t + 0.4, 0, 0])
      return agtMove(k2)
    }
    const riffle = new Pix()
    ;['#f2ece0', '#b02a36', '#f2ece0', '#b02a36', '#d8d0c4'].forEach((c, j) => riffle.rect(x - 5, Y - 13 + j, 5, 1, c))
    riffle.set(x - 5, Y - 12, '#d0505a').set(x - 1, Y - 10, '#d0505a')
    let held = `<g>${halfL.svg()}${apart(-2, 0)}</g><g>${halfR.svg()}${apart(1, -1)}</g>`
    held += agtFaded(riffle.svg(), [[shuf[1] + 0.05, shuf[2]], [shuf[3] + 0.05, shuf[4]]], 0.1)
    pc += agtArm(k, x, 'left', held, deckMid, deckDown)
    // right claw: picks up his own card at the end
    pc += agtArm(k, x, 'right', agtFan(new Pix(), x + 16, Y - 8).svg(), picAt)
    const smile = new Pix().rect(x + 6, Y + 5, 4, 1, '#8e3a28').set(x + 5, Y + 4, '#8e3a28').set(x + 10, Y + 4, '#8e3a28')
    pc += agtFaded(smile.svg(), [[picAt + 0.6, END]], 0.3)
    // the walk: an eased glide in from off-screen, standing; then lowering into the chair.
    // At the end he fades from the chair and is put back off-screen, unseen.
    const mv = agtMove([[walk0, 30, -2], [walkEnd, 3, -2], [sitA, 3, -2], [sitB, 0, 0], [picFade[1] + 0.05, 0, 0], [picFade[1] + 0.1, 30, -2]], '0.35 0 0.6 1')
    const fade = agtOp([[picFade[0], 1], [picFade[1], 0], [picFade[1] + 0.12, 0], [picFade[1] + 0.15, 1]])
    s += `<g>${pc}${mv}${fade}</g>`
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
  // Worf's stack, shoved into the pot by his right claw (eased); at the end it eases back
  {
    const ws = agtChips(new Pix(), AGT_WX + 11, 40, ['#2a2a34', '#c8333a', '#2a2a34', '#c8333a']).svg()
    s += `<g>${ws}${agtMove([[worfAt + 0.9, 0, 0], [worfAt + 1.7, -8, 0], [chipsBack[0], -8, 0], [chipsBack[1], 0, 0]])}</g>`
  }
  // the deck on the felt: picked up from in front of the chair, put down a little to the
  // left after the deal, and back in its place by the end
  const flat = (dx: number) => agtCardFlat(new Pix(), AGT_PX + dx, 39).rect(AGT_PX + dx, 38, 4, 1, AGT_CARD_W).svg()
  s += `<g>${flat(6)}${agtOp([[deckMid, 1], [deckMid + 0.3, 0], [picFade[0], 0], [picFade[1], 1]])}</g>`
  s += `<g opacity="0">${flat(1)}${agtOp([[deckDown + 0.2, 0], [armDown, 1], [picFade[0], 1], [picFade[1], 0]])}</g>`

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
    const a = agtKT(t0)
    const b = agtKT(t1)
    const pk = pickup[px]
    s += `<g opacity="0">${card}<animateMotion path="${path}" calcMode="spline" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1" keySplines="0 0 1 1;0.3 0 0.3 1;0 0 1 1" dur="${dur}s" repeatCount="indefinite"/>${agtOp([[t0, 0], [t0 + 0.06, 1], [pk + 0.04, 1], [pk + 0.24, 0]])}</g>`
  })

  // a slow, faint glint on the pot
  s += `<rect x="${45 * Q}" y="${40 * Q}" width="${Q}" height="${Q}" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;0.7;0;0" keyTimes="0;0.5;0.68;0.88;1" dur="${dur / 4}s" repeatCount="indefinite"/></rect>`
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
const FCH_T_OUT = 15.5 // Picard backs out to where he came in (6 steps)
const FCH_T_GONE0 = 15.6 // she dissolves back into the dark...
const FCH_T_GONE1 = 16.9 // ...leaving the empty body, as at the start
const FCH_AMB = (n: number) => +(SCENE_SECONDS / n).toFixed(4) // ambient loops that divide the story

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

// Smooth eased translate through [time, value] points (art pixels) on one axis
const FCH_EASE = '0.42 0 0.58 1'
function fchTrack(pts: [number, number][], axis: 'x' | 'y', dur: number) {
  const vals = pts.map(([, v]) => (axis === 'x' ? `${v * Q} 0` : `0 ${v * Q}`))
  const times = pts.map(([t]) => +(t / dur).toFixed(4))
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.join(';')}" keySplines="${pts.slice(1).map(() => FCH_EASE).join(';')}"/>`
}

// Spline translate through explicit keys [time, x, y, spline into this key] (art pixels)
function fchKeys(keys: [number, number, number, string?][]) {
  const all = keys[keys.length - 1][0] < FCH_DUR ? [...keys, [FCH_DUR, keys[keys.length - 1][1], keys[keys.length - 1][2]] as [number, number, number]] : keys
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${FCH_DUR}s" repeatCount="indefinite" values="${all.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${all.map(([t]) => fchK(t)).join(';')}" keySplines="${all.slice(1).map(k => k[3] || FCH_EASE).join(';')}"/>`
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
    : `<animate attributeName="opacity" dur="${FCH_DUR}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${a};${fchK(t0 + 0.08)};${fchK(t0 + life * 0.6)};${b};1"/>`
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
    back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#5dff8a"><animate attributeName="opacity" values="0.9;0.3;0.9" dur="${FCH_AMB(4 + (i % 3))}s" begin="-${((i * 0.37) % 2.3).toFixed(2)}s" repeatCount="indefinite"/></rect>`
  })
  return back
}

// Her left arm (toward Picard). Raising: 'low' -> 'mid' -> 'high' -> 'up';
// beckoning: 'up' -> 'half' (tips bending) -> 'curl' (tips folded toward her)
type FchArm = 'low' | 'mid' | 'high' | 'up' | 'half' | 'curl'
function fchArmLeft(x: number, y: number, pose: FchArm) {
  const k = FCH_QUEEN
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin)
  if (pose === 'low') {
    p.rect(x - 4, y + 2, 2, 3, k.skin).rect(x - 4, y + 2, 1, 3, k.shade)
    p.rect(x - 6, y + 1, 4, 1, k.skin).rect(x - 6, y - 1, 1, 2, k.skin).rect(x - 3, y - 1, 1, 2, k.skin)
    p.set(x - 6, y - 1, k.light).set(x - 3, y - 1, k.light)
    return p.svg()
  }
  if (pose === 'mid') {
    p.rect(x - 5, y + 1, 2, 4, k.skin).rect(x - 5, y + 1, 1, 4, k.shade)
    p.rect(x - 7, y - 2, 1, 2, k.skin).rect(x - 4, y - 2, 1, 2, k.skin)
    p.rect(x - 7, y, 4, 1, k.skin).set(x - 7, y - 2, k.light).set(x - 4, y - 2, k.light)
    return p.svg()
  }
  if (pose === 'high') {
    p.rect(x - 4, y - 2, 2, 7, k.skin).rect(x - 4, y - 2, 1, 7, k.shade)
    p.rect(x - 6, y - 3, 4, 1, k.skin).rect(x - 5, y - 2, 2, 1, k.skin)
    p.rect(x - 6, y - 5, 1, 2, k.skin).rect(x - 3, y - 5, 1, 2, k.skin)
    p.set(x - 6, y - 5, k.light).set(x - 3, y - 5, k.light)
    return p.svg()
  }
  const ax = x - 3
  const cx = x - 4
  p.rect(ax, y - 4, 2, 8, k.skin).rect(ax, y - 4, 1, 8, k.shade)
  p.rect(cx, y - 6, 4, 1, k.skin).rect(cx + 1, y - 5, 2, 1, k.skin)
  if (pose === 'up') {
    p.rect(cx, y - 8, 1, 3, k.skin).rect(cx + 3, y - 8, 1, 3, k.skin)
    p.set(cx, y - 8, k.light).set(cx + 3, y - 8, k.light)
  } else if (pose === 'half') {
    // tips starting to bend: shorter, lit tip still on top
    p.rect(cx, y - 7, 1, 2, k.skin).rect(cx + 3, y - 7, 1, 2, k.skin)
    p.set(cx, y - 7, k.light).set(cx + 3, y - 7, k.light)
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
  s += `<g>${sock.svg()}${fchFade([[FCH_T_LOCK, 1], [FCH_T_LOCK + 0.8, 0], [FCH_T_GONE0 + 0.7, 0], [FCH_T_GONE1 + 0.1, 1]])}</g>`
  // arms: limp until she is whole, then at rest; the left one beckons Picard
  const B = FCH_T_BECK
  const D = FCH_T_BDOWN
  // limp (2 px low) until she is whole, then both arms lift smoothly to rest
  const A = FCH_T_ARMS
  const lift = fchKeys([[0, 0, 2], [A - 0.15, 0, 2], [A + 0.25, 0, 0], [FCH_T_GONE0 + 0.5, 0, 0], [FCH_T_GONE1, 0, 2]])
  s += `<g>${armRestHD(k, x, y, 'right')}${lift}</g>`
  s += `<g>${shown(armRestHD(k, x, y, 'left'), [[0, B], [D + 0.3, FCH_DUR]], FCH_DUR)}${lift}</g>`
  const st = 0.1
  s += shown(fchArmLeft(x, y, 'low'), [[B, B + st], [D + 2 * st, D + 3 * st]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'mid'), [[B + st, B + 2 * st], [D + st, D + 2 * st]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'high'), [[B + 2 * st, B + 3 * st], [D, D + st]], FCH_DUR)
  const h = 0.09
  const curls: [number, number][] = [[B + 0.75, B + 1.15], [B + 1.4, B + 1.75]]
  const up: [number, number][] = [[B + 0.3, curls[0][0] - h / 2], [curls[0][1] + h / 2, curls[1][0] - h / 2], [curls[1][1] + h / 2, D]]
  s += shown(fchArmLeft(x, y, 'up'), up, FCH_DUR)
  s += shown(fchArmLeft(x, y, 'half'), curls.flatMap(([a, b]) => [[a - h / 2, a + h / 2], [b - h / 2, b + h / 2]] as [number, number][]), FCH_DUR)
  s += shown(fchArmLeft(x, y, 'curl'), curls.map(([a, b]) => [a + h / 2, b - h / 2] as [number, number]), FCH_DUR)
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
  // eyes hgt (1..3) tall, bottom row at y + 4, left eye at offset ox; a lid line when closed
  const eye = (ox: number, hgt: number) => new Pix().rect(x + ox, y + 5 - hgt, 2, hgt, EYE_HD).rect(x + ox + 6, y + 5 - hgt, 2, hgt, EYE_HD).svg()
  const lid = (ox: number) => new Pix().rect(x + ox, y + 3, 2, 1, '#4b514b').rect(x + ox + 6, y + 3, 2, 1, '#4b514b').svg()
  const e = 0.09
  const K0 = 14.9 // the slow blink
  s += shown(lid(5), [[0, O]], FCH_DUR)
  s += shown(eye(5, 1), [[O, O + e]], FCH_DUR)
  s += shown(eye(5, 2), [[O + e, O + 2 * e]], FCH_DUR)
  s += shown(eye(5, 3), [[O + 2 * e, T]], FCH_DUR)
  s += shown(eye(4, 3), [[T, T + e]], FCH_DUR)
  s += shown(eye(3, 3), [[T + e, K0], [K0 + 0.27, FCH_DUR]], FCH_DUR)
  s += shown(eye(3, 2), [[K0, K0 + 0.06], [K0 + 0.21, K0 + 0.27]], FCH_DUR)
  s += shown(lid(3), [[K0 + 0.06, K0 + 0.21]], FCH_DUR)
  // red eyepiece: kindles slowly after the lock, then breathes gently
  const lit = new Pix().set(x + 15, y + 2, '#ff3b3b').set(x + 15, y + 3, '#b01c1c').svg()
  const glow = `<circle cx="${(x + 15.5) * Q}" cy="${(y + 2.5) * Q}" r="5" fill="#ff3030" opacity="0.3"><animate attributeName="opacity" values="0.22;0.4;0.22" dur="${FCH_AMB(5)}s" repeatCount="indefinite"/></circle>`
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
  back += `<ellipse cx="${30 * Q}" cy="${26 * Q}" rx="70" ry="26" fill="url(#fchHaze)" opacity="0.6"><animate attributeName="cx" values="${26 * Q};${36 * Q};${26 * Q}" dur="${FCH_AMB(1)}s" repeatCount="indefinite"/></ellipse>`
  back += `<rect x="0" y="${37 * Q}" width="${W}" height="${8 * Q}" fill="#3cff7a" opacity="0.05"/>`
  s += `<g mask="url(#fchFade)">${back}</g>`

  // the light pouring down from the hatch onto her body: steady, a very slow breath
  s += `<polygon points="${60 * Q},${4 * Q} ${78 * Q},${4 * Q} ${88 * Q},${42 * Q} ${50 * Q},${42 * Q}" fill="url(#fchBeamG)" opacity="0.9"><animate attributeName="opacity" values="0.86;0.96;0.86" dur="${FCH_AMB(2)}s" repeatCount="indefinite"/></polygon>`
  s += `<ellipse cx="${69 * Q}" cy="${34 * Q}" rx="44" ry="30" fill="url(#fchHaze)" opacity="0.65"/>`

  // the dais she stands on
  const dais = new Pix().rect(55, 42, 28, 1, '#2c5238').rect(57, 43, 24, 1, '#13241a').set(55, 42, '#4f8a5f')
  for (const lx of [59, 66, 72, 78]) dais.set(lx, 43, '#3cff7a')
  s += dais.svg()

  // floor vent breathing steam between them
  for (let i = 0; i < 3; i++) {
    const d = FCH_AMB(i ? 3 : 4)
    s += `<g transform="translate(${46 * Q} ${40 * Q})"><g opacity="0">${fchPuff('#9fc7aa', i === 1)}<animateMotion path="M0 0 q ${i % 2 ? 6 : -4} -10 ${i % 2 ? 2 : 5} -24" dur="${d}s" begin="-${i * 1.4 + 0.9}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.28;0" dur="${d}s" begin="-${i * 1.4 + 0.9}s" repeatCount="indefinite"/></g></g>`
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
  // forward glide (7 steps), then two steps back; each step bobs him up 1 px and down
  const bk = FCH_T_BACK
  const glide = fchKeys([[0, -21, 0], [FCH_T_WALK - 0.05, -21, 0], [FCH_T_WALK + 2.2, 0, 0, '0.3 0 0.6 1'], [bk - 0.05, 0, 0], [bk + 0.6, -3, 0, '0.3 0 0.5 1'], [FCH_T_OUT, -3, 0], [FCH_T_OUT + 1.6, -21, 0, '0.35 0 0.6 1']])
  const bob: [number, number, number, string?][] = [[0, 0, 0]]
  const steps = [...Array.from({ length: 7 }, (_, i) => FCH_T_WALK + i * 0.32), bk, bk + 0.42, ...Array.from({ length: 6 }, (_, i) => FCH_T_OUT + 0.05 + i * 0.26)]
  const UP = '0.2 0.6 0.4 1'
  const DN = '0.6 0 0.8 0.4'
  for (const t of steps) bob.push([t - 0.04, 0, 0], [t + 0.08, 0, -1, UP], [t + 0.26, 0, 0, DN])
  s += `<g>${glide}<g>${pic}${fchKeys(bob)}</g></g>`

  // the Queen: cables, spine and tubes, body, then head, with a 1px settle on the lock
  let queen = fchHang(fchCables(qx, qy), [[0, -46], [FCH_T_DESC, -46], [FCH_T_LOCK, 0], [FCH_T_UP0, 0], [FCH_T_UP1, -46], [dur, -46]])
  const gone = fchFade([[FCH_T_GONE0, 1], [FCH_T_GONE1, 0]])
  queen += `<g mask="url(#fchSpineM)"><g>${fchHang(fchQueenBack(qx, qy), FCH_DOWN)}${gone}</g></g>`
  queen += fchQueenBody(qx, qy)
  queen += `<g>${fchHang(fchQueenHead(qx, qy), FCH_DOWN)}${gone}</g>`
  s += `<g>${queen}${fchKeys([[0, 0, 0], [FCH_T_LOCK - 0.05, 0, 0], [FCH_T_LOCK + 0.1, 0, 1, '0.3 0 0.5 1'], [FCH_T_LOCK + 0.5, 0, 0]])}</g>`

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
  s += `<rect x="0" y="0" width="${W}" height="${Q}" fill="#7dffa0" opacity="0.06"><animateTransform attributeName="transform" type="translate" values="0 ${-Q};0 ${H}" dur="${FCH_AMB(3)}s" repeatCount="indefinite"/></rect>`
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
  // ambient loops run on whole fractions of the story, so the frame at D matches t=0
  const per = (n: number) => +(D / n).toFixed(5)

  // ---------- the story (seconds) ----------
  // 0.0-1.8   calm: the bridge, the nebula turning, her mug steaming at her side
  // 1.8-2.3   the mug comes up            2.3-5.2  a long slow sip, eyes closed
  // 5.2-5.6   the mug comes down          5.8-8.0  she gazes up at the nebula
  // 8.0-9.6   it dawns on her: eyes go wide, a small sparkle by her head
  // 9.4-9.8   her claw comes up           9.8-13.0 pointing at it, holding
  // 11.5-12.5 a determined hop and a little nod
  // 13.0-13.4 the claw comes down         13.6-15.8 one last satisfied sip
  // 15.8-17.17 calm again, mug at her side, the nebula still turning
  // the mug travels through five drawings, one art pixel apart, ~0.1 s each:
  // side -> P1 -> P2 -> P3 (halfway) -> P4 -> at her lips, and back down
  const lift = (a: number): [number, number][][] => [[[a, a + 0.1]], [[a + 0.1, a + 0.2]], [[a + 0.2, a + 0.35]], [[a + 0.35, a + 0.5]]]
  const lower = (a: number): [number, number][][] => [[[a + 0.3, a + 0.4]], [[a + 0.2, a + 0.3]], [[a + 0.1, a + 0.2]], [[a, a + 0.1]]]
  const tMugStep: [number, number][][] = [0, 1, 2, 3].map(i => [lift(1.8)[i], lower(5.2)[i], lift(13.6)[i], lower(15.4)[i]].flat())
  const tMugUp: [number, number][] = [[2.3, 5.2], [14.1, 15.4]]
  const tMugSide = complement(merge([...tMugStep.flat(), ...tMugUp]), dur)
  const tClosed: [number, number][] = [[2.5, 5.0], [14.3, 15.3]]
  const tHalf: [number, number][] = [[2.4, 2.5], [5.0, 5.1], [14.2, 14.3], [15.3, 15.4]]
  const tGaze: [number, number][] = [[5.8, 8.0]]
  const tLit: [number, number][] = [[8.0, 13.2]]
  const tArmMid: [number, number][] = [[9.4, 9.8], [13.0, 13.4]]
  // the claw reaches out in three growing drawings on the way up, and back
  const tReach: [number, number][][] = [
    [[9.4, 9.5], [13.27, 13.4]],
    [[9.5, 9.65], [13.13, 13.27]],
    [[9.65, 9.8], [13.0, 13.13]],
  ]
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
  scr += `<g transform="translate(${(ncx + 0.5) * Q} ${(ncy + 0.5) * Q})"><g><ellipse cx="14" cy="0" rx="30" ry="12" fill="url(#jcTeal)"/><ellipse cx="-18" cy="3" rx="22" ry="9" fill="url(#jcSpill)"/><animateTransform attributeName="transform" type="rotate" values="0;110;0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${D}s" repeatCount="indefinite"/></g></g>`
  scr += `<ellipse cx="${(ncx + 0.5) * Q}" cy="${(ncy + 0.5) * Q}" rx="34" ry="18" fill="url(#jcCore)" opacity="0.8"><animate attributeName="opacity" values="0.8;0.95;0.8" dur="${D / 2}s" repeatCount="indefinite"/></ellipse>`
  // slow, soft twinkles in the cloud
  const sparks = [[60, 7], [72, 15], [48, 10], [80, 6], [55, 18], [70, 5], [36, 14], [24, 8], [84, 19], [64, 16]]
  sparks.forEach(([x, y], i) => {
    const g = new Pix().set(x - 1, y, '#e8c8ff').set(x + 1, y, '#e8c8ff').set(x, y - 1, '#e8c8ff').set(x, y + 1, '#e8c8ff')
    const d = per([5, 4, 4, 3][i % 4])
    scr += `<g opacity="0">${g.svg()}${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0;0.8;0;0" keyTimes="0;0.35;0.7;1" dur="${d}s" begin="${(-i * 0.53).toFixed(2)}s" repeatCount="indefinite"/></g>`
  })
  // faint distant stars
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 26; i++) {
    const x = sx + Math.floor(rnd() * sw)
    const y = sy + Math.floor(rnd() * sh)
    scr += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#e6dcff" opacity="${(0.25 + rnd() * 0.4).toFixed(2)}"/>`
  }
  // a faint scanline drifting down the screen, from just above it to just below (both ends hidden by the clip)
  scr += `<rect x="${sx * Q}" y="0" width="${sw * Q}" height="${Q}" fill="#ffffff" opacity="0.05"><animate attributeName="y" values="${(sy - 1) * Q};${(sy + sh) * Q}" dur="${per(3)}s" repeatCount="indefinite"/></rect>`
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
    s += `<rect x="${(x as number) * Q}" y="${(y as number) * Q}" width="${Q * 2}" height="${Q}" fill="${c}"><animate attributeName="opacity" values="1;0.35;1" dur="${per([8, 7, 6, 5, 4][i])}s" repeatCount="indefinite"/></rect>`
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

  const half = eyeSkin([])
  for (const e of [6, 12]) half.rect(X + e, Y + 2, 2, 2, k.skin)
  jan += shown(half.svg(), tHalf, dur)
  jan += shown(closed.svg(), tClosed, dur)
  jan += shown(gaze.svg(), tGaze, dur)
  jan += shown(lit.svg(), tLit, dur)
  jan += shown(lids.svg(), tBlink, dur)

  // left claw: the mug at her side, halfway up, or at her lips
  const mugAt = (mx: number, my: number) => new Pix().rows(jcMugRows, mx, my, jcMugPal)
  const steam = (mx: number, my: number, n: number) => {
    let o = ''
    for (let i = 0; i < n; i++) {
      const d = per([7, 6, 5][i])
      o += `<rect x="${(mx + 3 + (i % 2)) * Q}" y="${(my - 1) * Q}" width="${Q}" height="${Q * 2}" fill="#e9e2f2" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 4 : -4} -6 0 -11 t ${i % 2 ? 3 : -3} -10" dur="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.6;0" dur="${d}s" repeatCount="indefinite"/></rect>`
    }
    return o
  }
  // at her side
  const side = new Pix().rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  const m1x = X - 9, m1y = Y + 2
  const side2 = mugAt(m1x, m1y)
  side2.rect(X - 4, Y + 4, 1, 2, k.skin).set(X - 4, Y + 6, k.shade).rect(X - 6, Y + 7, 3, 1, k.skin).set(X - 6, Y + 7, k.light)
  // in between: the mug at (mx, my), the claw under it, a forearm back to the shoulder
  const between = (mx: number, my: number) => {
    const q = new Pix()
    q.rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
    const fx = mx + 3, fy = my + 5
    const n = Math.max(Math.abs(X - 4 - fx), Math.abs(Y + 4 - fy))
    for (let i = 0; i <= n; i++) {
      const xx = Math.round(fx + ((X - 4 - fx) * i) / Math.max(1, n))
      const yy = Math.round(fy + ((Y + 4 - fy) * i) / Math.max(1, n))
      q.rect(xx, yy, 2, 2, k.skin).set(xx, yy + 1, k.shade)
    }
    const m = mugAt(mx, my)
    m.rect(mx + 2, my + 5, 3, 1, k.skin).set(mx + 2, my + 5, k.light)
    return q.svg() + m.svg()
  }
  const steps: [number, number][] = [[m1x, m1y - 1], [m1x + 1, m1y - 2], [m1x + 1, m1y - 3], [m1x + 2, m1y - 4]]
  // raised to her face
  const up = new Pix()
  up.rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  up.rect(X - 4, Y + 1, 2, 5, k.skin).rect(X - 4, Y + 1, 1, 5, k.shade)
  const m2x = X - 6, m2y = Y - 3
  const upSvg = up.svg() + mugAt(m2x, m2y).rect(m2x + 2, m2y + 5, 3, 1, k.skin).set(m2x + 2, m2y + 5, k.light).svg()
  jan += shown(side.svg() + side2.svg(), tMugSide, dur)
  steps.forEach(([mx, my], i) => (jan += shown(between(mx, my), tMugStep[i], dur)))
  jan += shown(upSvg, tMugUp, dur)
  // one set of steam wisps, gliding along with the mug
  const off = (dx: number, dy: number) => `${dx * Q} ${dy * Q}`
  const sKeys: [number, string][] = [[0, off(0, 0)]]
  for (const [a, dir] of [[1.8, 1], [5.2, -1], [13.6, 1], [15.4, -1]] as [number, number][]) {
    const path = dir > 0 ? [off(0, 0), off(m2x - m1x, m2y - m1y)] : [off(m2x - m1x, m2y - m1y), off(0, 0)]
    const len = dir > 0 ? 0.5 : 0.4
    sKeys.push([a, path[0]], [a + len, path[1]])
  }
  sKeys.push([D, off(0, 0)])
  jan += `<g>${steam(m1x, m1y, 3)}<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${D}s" repeatCount="indefinite" values="${sKeys.map(([, v]) => v).join(';')}" keyTimes="${kt(sKeys.map(([t]) => t))}" keySplines="${sKeys.slice(1).map(() => '0.4 0 0.2 1').join(';')}"/></g>`

  // right claw: at rest, half raised, or pointing at the nebula
  jan += shown(armRestHD(k, X, Y, 'right'), complement(merge([...tPoint, ...tArmMid]), dur), dur)
  const ax = X + 18
  const am = new Pix()
  for (let i = 0; i < 3; i++) {
    const yy = Y + 4 - i
    am.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade).set(ax + i * 2 + 2, yy, k.rim)
  }
  am.rect(ax + 6, Y + 1, 2, 2, k.skin).set(ax + 7, Y + 1, k.light).set(ax + 6, Y + 3, k.shade)
  void am
  const reach = (n: number) => {
    const r = new Pix()
    for (let i = 0; i < n; i++) {
      const yy = Y + 4 - i * 2
      r.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade).set(ax + i * 2 + 2, yy, k.rim)
    }
    const ex = ax + n * 2, ey = Y + 4 - n * 2
    r.rect(ex, ey, 2, 2, k.skin).set(ex + 1, ey, k.light).set(ex, ey + 2, k.shade).set(ex + 2, ey - 1, k.skin)
    return r.svg()
  }
  ;[2, 3, 4].forEach((n, i) => (jan += shown(reach(n), tReach[i], dur)))
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
  const hopV = ['0 0', '0 0', `0 ${-2 * Q}`, `0 ${-2 * Q}`, '0 0', '0 0', `0 ${-Q}`, `0 ${-Q}`, '0 0', '0 0']
  const hopT = [0, 11.45, 11.65, 11.82, 12.0, 12.25, 12.38, 12.45, 12.6, D]
  const hopS = ['0 0 1 1', '0.2 0.7 0.4 1', '0 0 1 1', '0.6 0 0.8 0.3', '0 0 1 1', '0.2 0.7 0.4 1', '0 0 1 1', '0.6 0 0.8 0.3', '0 0 1 1']
  const hop = `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${D}s" repeatCount="indefinite" values="${hopV.join(';')}" keyTimes="${kt(hopT)}" keySplines="${hopS.join(';')}"/>`
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

// smooth eased translate over the story: [time, x, y] in CSS px; each move eases in and out
const COC_EASE = '0.4 0 0.2 1'
const COC_SWING = '0.45 0 0.55 1'
function cocTween(keys: [number, number, number][], spline = COC_EASE) {
  const T = SCENE_SECONDS
  const ks = [...keys]
  if (ks[0][0] > 0) ks.unshift([0, ks[0][1], ks[0][2]])
  if (ks[ks.length - 1][0] < T) ks.push([T, ks[ks.length - 1][1], ks[ks.length - 1][2]])
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${T}s" repeatCount="indefinite" values="${ks.map(([, x, y]) => `${x} ${y}`).join(';')}" keyTimes="${ks.map(k => +(k[0] / T).toFixed(5)).join(';')}" keySplines="${ks.slice(1).map(() => spline).join(';')}"/>`
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
  // (periods divide the story length, so the loop restart lands on the same glow)
  ;[17, 39, 61, 83].forEach((cx, i) => {
    const per = +(dur / [5, 4, 3, 4][i]).toFixed(4)
    back += `<ellipse cx="${(cx + 0.5) * Q}" cy="${22.5 * Q}" rx="16" ry="6" fill="url(#cocAmber)"><animate attributeName="opacity" values="0.6;1;0.6" calcMode="spline" keyTimes="0;0.5;1" keySplines="${COC_SWING};${COC_SWING}" dur="${per}s" begin="${-i * 1.3}s" repeatCount="indefinite"/></ellipse>`
  })
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
    const d = +(dur / (i % 2 ? 2 : 3)).toFixed(4)
    const b = (-i * 1.1).toFixed(1)
    s += `<rect x="${x * Q}" y="${8 * Q}" width="${Q / 2}" height="${Q / 2}" fill="#fff6d8" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 6 : -6} 20 ${i % 2 ? -2 : 3} 52" dur="${d}s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0.5;0" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></rect>`
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
  // the chains swing smoothly from side to side with each jolt, then settle
  const swayK = [10.5, 10.95, 11.3, 11.75, 12.1, 12.55, 13.1, 13.7, 14.3]
  const swayX = [0, 1, -1, 1, -1, 1, -1, 1, 0]
  const sway = cocTween(swayK.map((t, i) => [t, (swayX[i] * Q) / 2, 0] as [number, number, number]), COC_SWING)
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
  // the turn passes through a front-facing in-between (eyes centred) for 0.1 s each way
  const awayOn: [number, number][] = [[0, 2.35], [13.65, dur]]
  const turnOn: [number, number][] = [[2.35, 2.45], [13.55, 13.65]]
  const towardOn: [number, number][] = [[2.45, 13.55]]
  const raised: [number, number][] = [[5.1, 12.8]]
  const blink = +(dur / 3).toFixed(4)
  const madAway = crabHD(M, mx, my, 'left', dur, { left: [], right: [] }, [], blink, madredDetails('left'))
  const madToward = crabHD(M, mx, my, 'right', dur, { left: [], right: raised }, [], blink, madredDetails('right'))
  const front = clawdBody(M, mx, my, 'left').p
  for (const e of [4, 10]) front.rect(mx + e, my + 2, 2, 3, M.skin)
  for (const e of [5, 11]) front.rect(mx + e, my + 2, 2, 3, EYE_HD)
  madredDetails('left')(front)
  front.rect(mx + 17, my + 1, 1, 5, M.skin)
  const madFront = front.svg() + armRestHD(M, mx, my, 'left') + armRestHD(M, mx, my, 'right')
  // the claw on its way up and on its way down: reaching out toward the lights
  const mid = new Pix()
  for (let i = 0; i < 4; i++) mid.rect(mx + 20 + i, my + 3 - i, 2, 1, M.skin).set(mx + 20 + i, my + 4 - i, M.shade)
  mid.rect(mx + 23, my - 3, 1, 2, M.skin).rect(mx + 26, my - 3, 1, 2, M.skin).rect(mx + 23, my - 1, 4, 1, M.skin).set(mx + 23, my - 3, M.light).set(mx + 26, my - 3, M.light)
  let mad = shown(madAway, awayOn, dur) + shown(madFront, turnOn, dur) + shown(madToward, towardOn, dur)
  mad += shown(mid.svg(), [[4.75, 5.1], [12.8, 13.25]], dur)
  // the walk: an unhurried glide in, later the same glide back out, with a soft
  // bob on each of the six steps (the bob rides inside the glide)
  const glide = cocTween([[0, -6 * Q, 0], [2.7, -6 * Q, 0], [4.45, 0, 0], [13.9, 0, 0], [15.65, -6 * Q, 0]], '0.42 0 0.58 1')
  const bobK: [number, number, number][] = [[0, 0, 0]]
  for (const t0 of [2.8, 14.0]) {
    for (let k = 0; k < 6; k++) {
      const t = t0 + k * 0.3
      bobK.push([t, 0, 0], [t + 0.08, 0, -Q], [t + 0.2, 0, 0])
    }
  }
  s += `<g>${glide}<g>${mad}${cocTween(bobK)}</g></g>`

  // ---- Picard: hung by the wrists (both claws up for the whole story) ----
  const P = COC_PICARD
  const pb = clawdBody(P, px, py, 'left')
  // rumpled uniform: a torn seam and a crease
  pb.p.set(px + 13, py + 8, '#7a161c').set(px + 14, py + 9, '#7a161c').set(px + 5, py + 8, '#c94048')
  // grey fringe of hair at the temples
  pb.p.rect(px, py + 2, 1, 2, '#8e8a86').rect(px + 17, py + 2, 1, 2, '#b4b0aa')
  // furrowed brow
  pb.p.rect(px + 3, py + 1, 4, 1, P.shade).rect(px + 9, py + 1, 4, 1, P.shade)
  let pic = pb.p.svg() + armUpHD(P, px, py, 'left') + armUpHD(P, px, py, 'right')
  const blinkLids = new Pix()
  for (const e of pb.ex) blinkLids.rect(px + e, py + 2, 2, 3, P.skin)
  pic += `<g opacity="0">${blinkLids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${+(dur / 4).toFixed(4)}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.92;0.95"/></g>`
  // exhausted: heavy, half-closed eyelids; they lift and drop through a lighter lid.
  // He sinks back into them after the shouting, so the end matches the start.
  const lids = new Pix()
  for (const e of [4, 10]) lids.rect(px + e, py + 2, 2, 2, P.shade).rect(px + e, py + 2, 2, 1, P.skin)
  const lidsLight = new Pix()
  for (const e of [4, 10]) lidsLight.rect(px + e, py + 2, 2, 1, P.shade)
  pic += shown(lids.svg(), [[0, 4.75], [9.8, 10.2], [16.45, dur]], dur)
  pic += shown(lidsLight.svg(), [[4.75, 4.9], [9.7, 9.8], [10.2, 10.3], [16.3, 16.45]], dur)
  // he looks up and right at the fifth light, his eyes travelling there and back
  const glance = new Pix()
  for (const e of [4, 10]) glance.rect(px + e, py + 2, 2, 3, P.skin)
  for (const e of [6, 12]) glance.rect(px + e, py + 1, 2, 3, EYE_HD)
  const glanceMid = new Pix()
  for (const e of [4, 10]) glanceMid.rect(px + e, py + 2, 2, 3, P.skin)
  for (const e of [5, 11]) glanceMid.rect(px + e, py + 2, 2, 3, EYE_HD)
  pic += shown(glanceMid.svg(), [[7.9, 8.0], [9.6, 9.7]], dur)
  pic += shown(glance.svg(), [[8.0, 9.6]], dur)
  // defiance: brows drawn down hard (through a half-drawn brow each way)
  const brows = new Pix()
  brows.set(px + 3, py + 1, P.shade).rect(px + 5, py + 1, 2, 1, '#6e2f20').set(px + 7, py + 2, '#6e2f20')
  brows.set(px + 9, py + 2, '#6e2f20').rect(px + 10, py + 1, 2, 1, '#6e2f20').set(px + 13, py + 1, P.shade)
  const browsMid = new Pix().rect(px + 5, py + 1, 2, 1, '#6e2f20').rect(px + 10, py + 1, 2, 1, '#6e2f20')
  pic += shown(browsMid.svg(), [[10.3, 10.4], [16.0, 16.15]], dur)
  pic += shown(brows.svg(), [[10.4, 16.0]], dur)
  // iron manacles at both wrists
  const cuffs = new Pix()
  for (const ax of [px - 3, px + 19]) {
    cuffs.rect(ax - 1, py - 4, 4, 2, '#4f4940').rect(ax - 1, py - 4, 4, 1, '#8d8578').set(ax + 2, py - 3, '#2e2a25')
  }
  pic += cuffs.svg()
  // sweat running down his head
  const sw = +(dur / 7).toFixed(4)
  pic += `<rect x="${(px + 15) * Q}" y="${(py + 1) * Q}" width="${Q}" height="${Q}" fill="#cfe4ff" opacity="0"><animate attributeName="y" values="${(py + 1) * Q};${(py + 5) * Q}" calcMode="spline" keyTimes="0;1" keySplines="0.5 0 0.9 0.6" dur="${sw}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.8;1" dur="${sw}s" repeatCount="indefinite"/></rect>`
  // the shout: the mouth opens through a small 'o', a few strokes of sound fade in and out
  const mouthMid = new Pix().rect(px + 7, py + 5, 2, 1, '#3a0f16')
  const mouth = new Pix().rect(px + 6, py + 4, 4, 2, '#3a0f16').rect(px + 7, py + 5, 2, 1, '#8e2a32')
  pic += shown(mouthMid.svg(), [[10.5, 10.6], [12.6, 12.7]], dur)
  pic += shown(mouth.svg(), [[10.6, 12.6]], dur)
  const strokes = new Pix()
  for (const [sx, sy] of [[px - 7, py + 1], [px - 8, py + 4], [px - 7, py + 7]] as [number, number][]) strokes.rect(sx, sy, 2, 1, '#e8d8b8')
  pic += `<g opacity="0">${strokes.svg()}<animate attributeName="opacity" dur="${dur}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="${kt([0, 10.5, 10.75, 12.5, 12.8, dur])}"/>${cocTween([[10.5, 0, 0], [12.8, -Q, 0]], '0.3 0.3 0.7 0.7')}</g>`
  // body: sagging until he gathers himself, three jolts upward against the
  // chains (each one rising and dropping over ~0.15 s), then slowly sagging again
  const bodyK: [number, number, number][] = [[0, 0, Q], [10.0, 0, Q], [10.3, 0, 0]]
  for (const [a, b] of jolts) bodyK.push([a, 0, 0], [a + 0.14, 0, -Q], [b - 0.06, 0, -Q], [b + 0.1, 0, 0])
  bodyK.push([15.9, 0, 0], [16.7, 0, Q])
  s += `<g>${pic}${cocTween(bodyK)}</g>`

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
  s += `<g>${lights.svg()}<animate attributeName="opacity" values="0.5;1;0.5" dur="${(SCENE_SECONDS / 7).toFixed(3)}s" repeatCount="indefinite"/></g>`
  const lights2 = new Pix()
  ;[[62, 16], [77, 19], [66, 34], [80, 30], [59, 24]].forEach(([x, y]) => lights2.set(x, y, '#9dffb5'))
  s += `<g>${lights2.svg()}<animate attributeName="opacity" values="1;0.45;1" dur="${(SCENE_SECONDS / 6).toFixed(3)}s" repeatCount="indefinite"/></g>`
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
function qwAnim(attr: string, keys: [number, string, string?][], tag = 'animate', extra = '') {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(4))
  kt[kt.length - 1] = 1
  const splines = k.slice(1).map(x => x[2] ?? QW_EASE).join(';')
  return `<${tag} attributeName="${attr}" ${extra}dur="${T}s" repeatCount="indefinite" calcMode="spline" keySplines="${splines}" values="${k.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"/>`
}
const qwFade = (keys: [number, number][]) => qwAnim('opacity', keys.map(([t, v]) => [t, String(v)] as [number, string]))
const qwMove = (keys: [number, number, number, string?][]) =>
  qwAnim('transform', keys.map(([t, x, y, sp]) => [t, `${x} ${y}`, sp] as [number, string, string?]), 'animateTransform', 'type="translate" ')

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
    const tw = `dur="${(SCENE_SECONDS / [7, 6, 5, 4, 3][i]).toFixed(3)}s" begin="-${i * 0.6}s"`
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${glow.svg()}<animate attributeName="opacity" values="0.15;0.8;0.15" ${tw} repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0.6;1;0.6" ${tw} repeatCount="indefinite"/></g>`
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
  const shipKeys: [number, number, number, string?][] = [
    [0, 36, -6], [beamOut[0], ...hold], [drag[0], ...hold], [drag[1], ...pulled], [beamBack[1] + 0.3, ...pulled],
    // released: it flies on off the left edge, then glides back in from the right to its opening spot
    [15.7, -112, 0, '0.5 0 0.85 0.6'], [15.71, 126, -6, '0 0 1 1'], [T, 36, -6, '0.2 0.55 0.45 1'],
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
  const jig: [number, number, number][] = [[drag[0], 0, 0]]
  let n = 0
  for (let t = drag[0] + 0.4; t < beamBack[0] - 0.2; t += 0.4) jig.push([t, n % 2 ? 0 : 1, n++ % 2 ? 0 : 1])
  jig.push([beamBack[0], 0, 0])
  const shudder = qwMove(jig)
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
  const k = QW_Q
  const turnBack = 15.3 // after the cube is gone he turns back to face us
  const TS = 0.35 // a turn takes this long
  // the face: 0 = looking out at us (left), 1 = at the ship (right)
  const face: [number, number][] = [[turn1, 0], [turn1 + TS, 1], [look[0], 1], [look[0] + TS, 0], [look[1], 0], [look[1] + TS, 1], [turnBack, 1], [turnBack + TS, 0]]
  const { p: qb } = clawdBody(k, qx, qy, 'left')
  qb.rect(qx + 4, qy + 2, 2, 3, k.skin).rect(qx + 10, qy + 2, 2, 3, k.skin)
  insignia(qb)
  let qs = qb.svg() + armRestHD(k, qx, qy, 'left') + armRestHD(k, qx, qy, 'right')
  // light and shade on the body edges cross-fade as he turns
  const edgeR = new Pix().rect(qx, qy + 1, 1, 5, k.shade).rect(qx + 17, qy + 1, 1, 5, k.rim).set(qx, qy + 8, k.lowerShade!).set(qx + 17, qy + 8, k.lower!)
  qs += `<g opacity="0">${edgeR.svg()}${qwFade(face)}</g>`
  // eyes (one half-lidded), the arched brow and the blinking lids glide together
  const fp = new Pix().rect(qx + 4, qy + 2, 2, 3, EYE_HD).rect(qx + 10, qy + 2, 2, 3, EYE_HD).rect(qx + 4, qy + 2, 2, 1, k.shade)
  fp.set(qx + 9, qy + 1, brow).rect(qx + 10, qy, 2, 1, brow).set(qx + 12, qy + 1, brow)
  const lids = new Pix().rect(qx + 4, qy + 2, 2, 3, k.skin).rect(qx + 10, qy + 2, 2, 3, k.skin)
  qs += `<g>${fp.svg()}<g opacity="0">${lids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${(T / 4).toFixed(4)}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.92;0.95"/></g>${qwMove(face.map(([t, v]) => [t, v * 2 * Q, 0]))}</g>`
  // the right claw rises smoothly out of the shoulder (clipped there), snaps shut, sinks back
  const cx = qx + 18
  const cy = qy - 8
  const UP = '0.25 0.6 0.4 1'
  const arm: [number, number, number, string?][] = [[3.7, 0, 12 * Q], [4.15, 0, 0, UP], [6.0, 0, 0], [6.4, 0, 12 * Q], [12.4, 0, 12 * Q], [12.8, 0, 0, UP], [14.25, 0, 0], [14.65, 0, 12 * Q]]
  const half = new Pix().rect(cx + 1, cy + 1, 2, 1, k.skin)
  const closed = new Pix().rect(cx + 1, cy, 2, 1, k.light)
  qs += `<clipPath id="qwArmClip"><rect x="${(qx + 17) * Q}" y="${(qy - 9) * Q}" width="${7 * Q}" height="${13 * Q}"/></clipPath><g clip-path="url(#qwArmClip)"><g transform="translate(0 ${12 * Q})">${armUpHD(k, qx, qy, 'right')}${shown(half.svg(), [[snap1 - 0.09, 6.4], [snap2 - 0.09, 14.65]], T)}${shown(closed.svg(), [[snap1, 6.4], [snap2, 14.65]], T)}${qwMove(arm)}</g></g>`
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

// translate jitter between t0 and t1 (seconds), amp in CSS px: an eased sway
// from one offset to the next, starting and ending at rest
function ctJitter(t0: number, t1: number, step: number, amp: number, dur: number, seed: number) {
  const r = ctRnd(seed)
  const times = [0, t0 / dur]
  const vals = ['0 0', '0 0']
  for (let t = t0 + step; t < t1 - step / 2; t += step) {
    times.push(t / dur)
    const dx = Math.round((r() * 2 - 1) * amp)
    const dy = Math.round((r() * 2 - 1) * amp * 0.6)
    vals.push(`${dx} ${dy}`)
  }
  times.push(t1 / dur, 1), vals.push('0 0', '0 0')
  const splines = Array(vals.length - 1).fill('0.45 0 0.55 1').join(';')
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}" keySplines="${splines}"/>`
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

// the very first lift: the claw just leaving the armrest
function ctArmLow(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 4, 3, 2, k.skin).rect(x + 20, y + 3, 2, 2, k.skin).rect(x + 18, y + 6, 2, 1, k.shade).set(x + 21, y + 5, k.shade)
  p.rect(x + 21, y + 1, 1, 2, k.skin).rect(x + 23, y + 1, 1, 2, k.skin).rect(x + 21, y + 2, 3, 1, k.skin)
  p.set(x + 21, y + 1, k.light).set(x + 23, y + 1, k.light)
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
  const BACK0 = 15.6 // the replay has no veil: from here everything eases back to its t=0 spot
  const RET0 = 13.4 // the plasma starts gathering again, slowly (3.8 s), for the next showing
  // ambient loops run on whole fractions of the story so t=T matches t=0
  const per = (n: number) => +(T / n).toFixed(5)

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
    calm += `<g>${glow.svg()}<animate attributeName="opacity" values="0.2;0.8;0.2" dur="${per([7, 6, 5, 4, 8][i])}s" begin="${-i * 0.5}s" repeatCount="indefinite"/></g>`
    calm += new Pix().set(x, y, '#ffffff').svg()
  })
  const ax = 77
  const ay = 11
  calm += `<circle cx="${(ax + 0.5) * Q}" cy="${(ay + 0.5) * Q}" r="30" fill="url(#ctArrG)"><animate attributeName="opacity" values="0.75;1;0.75" dur="${per(4)}s" repeatCount="indefinite"/></circle>`
  calm += ctArray(ax, ay)
  ;[[ax - 9, ay - 7], [ax + 10, ay + 3], [ax - 6, ay + 9], [ax + 4, ay - 9]].forEach(([x, y], i) => {
    calm += `<g>${new Pix().set(x, y, '#9fe4ff').svg()}<animate attributeName="opacity" values="1;0.3;1" dur="${per([8, 7, 6, 5][i])}s" repeatCount="indefinite"/></g>`
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
  const drift = (12 * Q) / T // px per second, as before
  const hid = FADE1 + 0.2
  storm += `<g>${clouds.svg()}<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="0 0;${(drift * T).toFixed(2)} 0" keyTimes="0;${k(hid)}" dur="${T}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;${(-drift * T).toFixed(2)} 0" dur="${T}s" repeatCount="indefinite"/></g>`
  // the plasma dissolves, and gathers again slowly for the next showing
  const stormG = `<g>${storm}<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="1;1;0;0;1" keyTimes="0;${kt([FADE0, FADE1, RET0])};1" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.7 1;0 0 1 1;0.3 0 0.7 1"/></g>`

  // ---- the bridge floor: dark, console lights glowing softly on the right ----
  const floor = new Pix().rect(0, 42, GW, 6, '#150f22').rect(0, 42, GW, 1, '#2a2140')
  floor.rect(40, 43, 48, 3, '#1f1832').rect(40, 43, 48, 1, '#3a2f55')
  let floorSvg = floor.svg()
  const pads: [number, string][] = [[43, '#f2b866'], [47, '#c9a7ff'], [51, '#ff8a5a'], [57, '#8fb8ff'], [61, '#f2b866'], [67, '#c9a7ff'], [73, '#ff8a5a'], [79, '#8fb8ff'], [83, '#f2b866']]
  pads.forEach(([x, c], i) => {
    floorSvg += `<g>${new Pix().rect(x, 44, 2, 1, c).svg()}<animate attributeName="opacity" values="1;0.4;1" dur="${per([9, 7, 6, 5][i % 4])}s" begin="${-i * 0.3}s" repeatCount="indefinite"/></g>`
  })

  // ---- Voyager ----
  const ship = ctShip()
  const halo = `<ellipse cx="${7 * Q}" cy="${1.5 * Q}" rx="16" ry="5" fill="url(#ctNacG)"/><ellipse cx="${7 * Q}" cy="${11.5 * Q}" rx="16" ry="5" fill="url(#ctNacG)"/>`
  // centre of the ship in CSS px over the story: cruise, caught, pulled away, arrives
  const PT = [0, CAUGHT, 7.4, 10.2, 12.4, BACK0 - 0.3, T]
  const pos = ['132 33', '132 33', '138 34', '158 46', '114 58', '111 58', '132 33']
  const rot = ['0', '0', '-10', '-16', '0', '0', '0']
  const scl = ['1', '1', '0.95', '0.55', '0.85', '0.85', '1']
  const anim = (type: string, vals: string[]) =>
    `<animateTransform attributeName="transform" type="${type}" dur="${T}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="0;${kt(PT.slice(1, -1))};1" calcMode="spline" keySplines="${Array(vals.length - 1).fill('0.4 0 0.6 1').join(';')}"/>`
  const bob = `<animateTransform attributeName="transform" type="translate" calcMode="spline" values="0 0;0 ${Q};0 0" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${per(5)}s" repeatCount="indefinite"/>`
  const shipG =
    `<g>${anim('translate', pos)}<g>${anim('rotate', rot)}<g>${anim('scale', scl)}` +
    `<g transform="translate(${-16 * Q} ${-6.5 * Q})"><g>${bob}<g>${ctJitter(CAUGHT, 7.6, 0.3, 2, T, 5)}` +
    `<g>${halo}<animate attributeName="opacity" values="0.75;1;0.75" dur="${per(7)}s" repeatCount="indefinite"/></g>${ship}` +
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
    `<g opacity="0.35"><g>${shimmer.svg()}</g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-GH * Q}" dur="${per(3)}s" repeatCount="indefinite"/></g>` +
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
    { left: [], right: [[ARM, BACK0 + 0.3]] },
    [],
    per(4),
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
  // rest -> low (0.1 s) -> diagonal (0.2 s) -> kit half-raised (0.09 s) -> up
  // and the same way down before the replay
  jane += shown(ctArmLow(CT_JANEWAY, jx, jy), [[ARM - 0.3, ARM - 0.2], [BACK0 + 0.5, BACK0 + 0.6]], T)
  jane += shown(ctArmMid(CT_JANEWAY, jx, jy), [[ARM - 0.2, ARM], [BACK0 + 0.3, BACK0 + 0.5]], T)
  // looking up and to the right, at the array
  // in two one-pixel steps: first across to the right, then up
  const across = new Pix().rect(jx + 6, jy + 2, 9, 3, CT_JANEWAY.skin).rect(jx + 7, jy + 2, 2, 3, EYE_HD).rect(jx + 13, jy + 2, 2, 3, EYE_HD)
  jane += shown(across.svg(), [[LOOK, LOOK + 0.12], [BACK0, BACK0 + 0.12]], T)
  const up = new Pix().rect(jx + 6, jy + 1, 9, 4, CT_JANEWAY.skin).rect(jx + 7, jy + 1, 2, 3, EYE_HD).rect(jx + 13, jy + 1, 2, 3, EYE_HD)
  jane += shown(up.svg(), [[LOOK + 0.12, BACK0]], T)
  // the chair rocks gently while the wave has the ship, then settles
  const rock = [0, 0, 2.5, -2, 2, -1.5, 1, 0, 0]
  const rockT = [0, CAUGHT, 6.6, 7.3, 8.0, 8.7, 9.4, 10.0, T]
  scene += `<g>${jane}<animateTransform attributeName="transform" type="rotate" dur="${T}s" repeatCount="indefinite" values="${rock.map(a => `${a} ${(jx + 9) * Q} ${(jy + 14) * Q}`).join(';')}" keyTimes="0;${kt(rockT.slice(1, -1))};1" calcMode="spline" keySplines="${Array(rock.length - 1).fill('0.45 0 0.55 1').join(';')}"/></g>`

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
const INL_PLAY: [number, number][] = [[0, 6.05], [13.75, SCENE_SECONDS]]
const INL_REST: [number, number][] = [[6.55, 13.25]]
// lowering (6.05 - 6.55) and raising (13.25 - 13.75) the flute: five drawings, 0.1 s each
const INL_TILT = (k: number): [number, number][] => [[6.05 + (k - 1) * 0.1, 6.05 + k * 0.1], [13.75 - k * 0.1, 13.75 - (k - 1) * 0.1]]

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
// a smooth move on the story timeline (art px), eased between points; points may lie
// outside 0..dur, the curve is cut at both ends. Each point: [t, x, y, spline into it]
function inlGlide(pts: [number, number, number, string?][], dur: number) {
  const at = (t: number): [number, number] => {
    if (t <= pts[0][0]) return [pts[0][1], pts[0][2]]
    for (let i = 1; i < pts.length; i++) {
      const [b, bx, by] = pts[i]
      if (t <= b) {
        const [a, ax, ay] = pts[i - 1]
        const f = (t - a) / (b - a)
        return [ax + (bx - ax) * f, ay + (by - ay) * f]
      }
    }
    const l = pts[pts.length - 1]
    return [l[1], l[2]]
  }
  const list: [number, number, number, string][] = [[0, ...at(0), '']]
  for (const p of pts) if (p[0] > 0 && p[0] < dur) list.push([p[0], p[1], p[2], p[3] || '0 0 1 1'])
  list.push([dur, ...at(dur), '0 0 1 1'])
  const v = (n: number) => +(n * Q).toFixed(2)
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${dur}s" repeatCount="indefinite" values="${list.map(l => `${v(l[1])} ${v(l[2])}`).join(';')}" keyTimes="${list.map(l => +(l[0] / dur).toFixed(4)).join(';')}" keySplines="${list.slice(1).map(l => l[3]).join(';')}"/>`
}
const INL_EASE = '0.4 0 0.6 1'

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
    const tw = (dur / [5, 4, 4, 3, 3][i]).toFixed(4)
    const g = new Pix().set(x - 1, y, '#bba6ee').set(x + 1, y, '#bba6ee').set(x, y - 1, '#bba6ee').set(x, y + 1, '#bba6ee')
    back += `<g>${g.svg()}<animate attributeName="opacity" values="0.15;0.6;0.15" dur="${tw}s" begin="${-i * 0.7}s" repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#fff8ee').svg()}<animate attributeName="opacity" values="0.6;1;0.6" dur="${tw}s" begin="${-i * 0.7}s" repeatCount="indefinite"/></g>`
  })

  // the sun, low and large, sinking a little over the whole scene
  let sunG = `<circle cx="${(SUNX + 0.5) * Q}" cy="${(SUNY + 0.5) * Q}" r="62" fill="url(#inlHalo)"><animate attributeName="r" values="61;64;61" dur="${(dur / 2).toFixed(4)}s" repeatCount="indefinite"/></circle>`
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
  back += `<g>${sunG}${inlGlide([[0, 0, 0], [13.2, 0, 3, INL_EASE], [dur, 0, 0, INL_EASE]], dur)}</g>`
  // the evening deepening, very slowly
  back += `<rect width="${W}" height="${34 * Q}" fill="#1d1636" opacity="0"><animate attributeName="opacity" values="0;0.14;0" keyTimes="0;${(13.2 / dur).toFixed(4)};1" calcMode="spline" keySplines="${INL_EASE};${INL_EASE}" dur="${dur}s" repeatCount="indefinite"/></rect>`

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
  back += `<g>${clouds.svg()}${inlGlide([[0, 0, 0], [dur / 2, 1.5, 0, INL_EASE], [dur, 0, 0, INL_EASE]], dur)}</g>`

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
  back += hills.svg() + far.svg() + `<g>${farLights.svg()}<animate attributeName="opacity" values="1;0.8;1" dur="${(dur / 3).toFixed(4)}s" repeatCount="indefinite"/></g>`
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
  back += `<g>${glow.svg()}<animate attributeName="opacity" values="1;0.9;1" dur="${(dur / 3).toFixed(4)}s" repeatCount="indefinite"/></g>`
  back += `<g>${glow2.svg()}<animate attributeName="opacity" values="0.92;1;0.92" dur="${(dur / 2).toFixed(4)}s" repeatCount="indefinite"/></g>`
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
    const d = (dur / 2).toFixed(4)
    back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#ffd89a" opacity="0"><animateMotion path="M0 0 q 10 -4 18 2 t 16 -4" dur="${d}s" begin="${-i * 1.43}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.55;0" dur="${d}s" begin="${-i * 1.43}s" repeatCount="indefinite"/></rect>`
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
    // a straight climb that eases out as it nears its place (quadratic ease-out)
    const path = (lag: number) =>
      inlGlide([[t0 + lag, 0, 0], [t1 + lag, fx - X0, fy - Y0, '0.33 0.67 0.67 1']], dur)
    const head = new Pix().set(X0, Y0, '#ffffff')
    const halo = new Pix().set(X0 - 1, Y0, '#cfe6ff').set(X0 + 1, Y0, '#cfe6ff').set(X0, Y0 - 1, '#cfe6ff').set(X0, Y0 + 1, '#cfe6ff')
    const trail = (lag: number, c: string, o: number) =>
      `<g opacity="0">${inlFade([[t0 + lag, 0], [t0 + lag + 0.6, o], [t1 - 0.3, o], [t1 + 0.6, 0]], dur)}<g>${new Pix().set(X0, Y0, c).svg()}${path(lag)}</g></g>`
    back += trail(0.5, '#ffd2a0', 0.3) + trail(0.25, '#ffe8c8', 0.55)
    // the rising light fades in over the hills
    back += `<g opacity="0">${inlFade([[t0, 0], [t0 + 0.8, 1], [t1 + 0.4, 1], [t1 + 1.2, 0]], dur)}<g>${halo.svg()}${head.svg()}${path(0)}</g></g>`
    // where it settles: a small soft glow that rises and ebbs, then a star that stays
    back += `<circle cx="${(fx + 0.5) * Q}" cy="${(fy + 0.5) * Q}" r="5" fill="#dfeaff" opacity="0">${inlFade([[t1 - 0.3, 0], [t1 + 0.5, 0.22], [t1 + 1.8, 0.07], [dur - 1.6, 0.06], [dur, 0]], dur)}</circle>`
    const star = new Pix().set(fx, fy, '#ffffff').set(fx - 1, fy, '#cfe6ff').set(fx + 1, fy, '#cfe6ff').set(fx, fy - 1, '#cfe6ff').set(fx, fy + 1, '#cfe6ff')
    back += `<g opacity="0">${inlFade([[t1 - 0.2, 0], [t1 + 0.6, 1], [dur - 1.6, 1], [dur, 0]], dur)}<g>${star.svg()}<animate attributeName="opacity" values="1;0.75;1" dur="${(dur / 5).toFixed(4)}s" repeatCount="indefinite"/></g></g>`
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
  const eyesHalf = new Pix().rect(KX + 6, KY + 3, 2, 2, EYE_HD).rect(KX + 12, KY + 3, 2, 2, EYE_HD)

  // in-betweens: the flute swings from his mouth (f = 0) down to hanging (f = 1),
  // through the half-way drawing at f = 0.5
  const tilt = (f: number) => {
    const p = new Pix()
    p.rect(KX + 18, KY + 5, 3, 2, k.skin).set(KX + 20, KY + 5, k.light).rect(KX + 18, KY + 7, 3, 1, k.shade)
    const g = f < 0.5 ? f / 0.5 : (f - 0.5) / 0.5
    const L = (u: number, v: number) => Math.round(u + (v - u) * g)
    const [ax, ay, bx, by] = (f < 0.5 ? [L(9, 10), 5, L(26, 25), L(5, 10)] : [L(10, 21), 5, L(25, 21), L(10, 14)]).map((v, i) => (i % 2 ? v : KX + v))
    const steep = Math.abs(by - ay) > Math.abs(bx - ax)
    if (!steep) inlLine(p, ax, KY + ay + 1, bx, KY + by + 1, fl.mid)
    inlLine(p, ax, KY + ay, bx, KY + by, steep ? fl.mid : fl.hi)
    p.set(ax, KY + ay, fl.dark).set(bx, KY + by, fl.dark)
    const m = (u: number, v: number, w: number) => Math.round(u + (v - u) * w)
    p.set(m(ax, bx, 0.55), KY + m(ay, by, 0.55), fl.band)
    p.rect(m(ax, bx, 0.85) + (steep ? 1 : 0), KY + m(ay, by, 0.85) + (steep ? 0 : 1), 1, 2, fl.tassel)
    return p.svg()
  }
  kamin += shown(play.svg(), INL_PLAY, dur)
  kamin += shown(tilt(1 / 6), INL_TILT(1), dur)
  kamin += shown(tilt(2 / 6), INL_TILT(2), dur)
  kamin += shown(half.svg(), INL_TILT(3), dur)
  kamin += shown(tilt(4 / 6), INL_TILT(4), dur)
  kamin += shown(tilt(5 / 6), INL_TILT(5), dur)
  kamin += shown(eyesShut.svg(), [[6.05, 6.55], [13.35, 13.75]], dur)
  kamin += shown(eyesHalf.svg(), [[6.55, 6.7], [13.2, 13.35]], dur)
  kamin += shown(rest.svg(), INL_REST, dur)
  // eyes open ahead, then turn up to the light as it climbs
  kamin += shown(eyesFwd.svg(), [[6.7, 8.2], [12.9, 13.2]], dur)
  kamin += shown(eyesUp.svg(), [[8.2, 12.9]], dur)
  kamin += shown(glint.svg(), [[10.9, 11.6], [11.75, 12.9]], dur)
  kamin += shown(lids.svg(), [[11.6, 11.75]], dur)

  // sway: a slow, eased one-pixel lean with the phrase while he plays, still while he watches
  const sway: [number, number, number, string?][] = [[0, 0, 0]]
  for (const [t, x] of [[1.2, 1], [2.4, 0], [3.6, 1], [4.8, 0], [5.9, 0], [13.9, 0], [15.3, 1], [dur, 0]] as [number, number][]) sway.push([t, x, 0, INL_EASE])
  s += `<g>${kamin}${inlGlide(sway, dur)}</g>`

  // notes drifting slowly up from the flute and fading
  const noteA = ['.#.', '.##', '.#.', '##.', '##.']
  const noteB = ['.####', '.#..#', '.#..#', '##.##', '##.##']
  const noteC = ['..#', '..#', '..#', '###', '##.']
  // first melody (one already afloat when the scene opens), then a soft reprise
  const notes: [number, number][] = [[0.1, 1], [1.2, 1], [2.3, 1], [3.4, 1], [4.6, 1], [14.1, 0.75], [15.4, 0.7]]
  const runs: [number, number, number][] = []
  notes.forEach(([t0, peak], i) => {
    runs.push([t0, peak, i + 1]) // numbered as before, so each note keeps its shape and colour
    if (t0 + 4.6 > dur) runs.push([t0 - dur, peak, i + 1])
  })
  runs.forEach(([t0, peak, i]) => {
    const len = 4.6
    const shape = [noteA, noteC, noteB][i % 3]
    const ox = KX + 23 + (i % 2)
    const oy = KY + 1
    const c = i % 2 ? '#ffe6b0' : '#fff4d6'
    const n = new Pix().rows(shape, ox, oy - shape.length, { '#': c }).svg()
    const steps: [number, number, number, string?][] = []
    const N = 8
    const drift = i % 2 ? 1 : -1
    for (let j = 0; j <= N; j++) {
      const f = j / N
      steps.push([+(t0 + f * len).toFixed(3), +(drift * 2 * Math.sin(f * 4 + i) - f * (3 + (i % 3) * 2)).toFixed(2), +(-f * 20).toFixed(2)])
    }
    const op = inlFade([[t0, 0], [t0 + 0.6, peak], [t0 + len * 0.5, peak], [t0 + len, 0]], dur)
    s += `<g opacity="0">${op}<g>${n}${inlGlide(steps, dur)}</g></g>`
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
  eline += `<g>${upper}${inlGlide([[0, 0, 0], [10.9, 0, 0], [12.1, -2, 0, INL_EASE], [dur - 1.5, -2, 0], [dur, 0, 0, INL_EASE]], dur)}</g>`
  s += eline

  // warm rim of evening light on the two of them
  s += `<ellipse cx="${(SUNX - 2) * Q}" cy="${34 * Q}" rx="70" ry="16" fill="url(#inlWarm)"><animate attributeName="opacity" values="0.88;1;0.88" dur="${(dur / 2).toFixed(4)}s" repeatCount="indefinite"/></ellipse>`
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

// ---------- Scorpion: Species 8472 against the Borg ----------
// One 17.17 s story. Calm space: Janeway and an 8472 in the foreground, a Borg
// cube ahead. The bioship's veins light up one by one and its orb charges; a
// steady beam reaches the cube; cracks creep across it; it splits and drifts
// apart in soft orange and green blooms. The 8472 turns to Janeway, and she
// raises a claw: her decision. The debris fades, she lowers her claw and the
// Collective pulls the cube back together, so the scene ends where it began.

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
// ease: 'inout' glides (slow-fast-slow), 'out' starts quick and settles; a key may carry its own spline
const SC8_INOUT = '0.45 0 0.55 1'
const SC8_OUT = '0.25 0.6 0.45 1'
const sc8Loop = (n: number) => +(SCENE_SECONDS / n).toFixed(4) // ambient periods that divide the scene
function sc8Move(keys: ([number, number, number] | [number, number, number, string])[], ease: 'inout' | 'out' = 'inout') {
  const t = keys.map(k => sc8K(k[0])).join(';')
  const v = keys.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`).join(';')
  const mode = ` calcMode="spline" keySplines="${keys.slice(1).map(k => k[3] || (ease === 'out' ? SC8_OUT : SC8_INOUT)).join(';')}"`
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
  const tBack = 15.4 // the quiet ending: everything eases back to how the scene began...
  const tHome = 16.9 // ...and is home before the replay starts again

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
    <clipPath id="sc8BeamClip"><rect x="${47 * Q}" y="0" width="0" height="${H}"><animate attributeName="width" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;${SC8_OUT};0 0 1 1" values="0;0;${14 * Q};${14 * Q}" keyTimes="0;${sc8K(tFire)};${sc8K(tHit)};1"/></rect></clipPath>
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
    back += `<g>${sc8Path(glow)}<animate attributeName="opacity" values="0.15;0.8;0.15" dur="${sc8Loop(7 - i)}s" begin="-${i * 0.5}s" repeatCount="indefinite"/></g>`
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
    `<g opacity="0">${sc8Path(cracks[n])}${sc8Fade([[0, 0], [crackT[n], 0], [crackT[n] + 0.8, 1], [tSplit + 0.6, 1], [tSplit + 3.5, 0.35], [tBack, 0.25], [tHome, 0], [dur, 0]])}</g>`
  const lightsDie = (p: Pix) =>
    `<g>${`<g>${sc8Path(p)}<animate attributeName="opacity" values="0.2;0.9;0.2" dur="${sc8Loop(7)}s" repeatCount="indefinite"/></g>`}${sc8Fade([[0, 1], [tSplit, 1], [tSplit + 1.5, 0], [tBack, 0], [tHome, 1], [dur, 1]])}</g>`
  // the halves drift apart, quickly at first, then slower and slower; at the end the
  // Collective pulls them gently back together (the cube regenerates for the replay)
  const halfMove = (dx: number, dy: number) =>
    sc8Move([[0, 0, 0], [tSplit, 0, 0], [tBack, dx, dy, SC8_OUT], [tHome, 0, 0, SC8_INOUT], [dur, 0, 0]])
  let cube = ''
  cube += `<g>${sc8Path(leftHalf)}${lightsDie(pulseL)}${crackSvg(0)}${crackSvg(1)}${crackSvg(2)}${halfMove(-3, -1)}</g>`
  cube += `<g>${sc8Path(rightHalf)}${lightsDie(pulseR)}${halfMove(7, -2)}</g>`
  // while the beam holds it, the cube trembles: a smooth sway of half an art pixel
  const shake: [number, number, number][] = [[0, 0, 0], [tHit, 0, 0]]
  for (let t = tHit + 0.4, n = 0; t < tSplit - 0.2; t += 0.4, n++) shake.push([t, n % 2 ? 0 : 0.5, n % 2 ? 0.5 : 0])
  shake.push([tSplit - 0.2, 0, 0], [dur, 0, 0])
  s += `<g>${cube}${sc8Move(shake)}</g>`

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
    s += `<g opacity="0">${sc8Path(g)}${sc8Fade([[0, 0], [a, 0], [a + 1.8, 1], [tSplit, 1], [tSplit + 2.5, 0.25], [tBack, 0.2], [tHome, 0], [dur, 0]])}</g>`
  })

  // the orb gathers at the focal point: it swells smoothly from a spark to full size
  const orbRings = ['#ffe9a0', '#ffc35a', '#e8892e']
  const orbFade = sc8Fade([[0, 0], [tOrb, 0], [tOrb + 0.6, 1], [tSplit, 1], [tSplit + 1.2, 0], [dur, 0]])
  const orbGrow = `<animateTransform attributeName="transform" type="scale" calcMode="spline" keySplines="0 0 1 1;${SC8_INOUT};0 0 1 1" dur="${dur}s" repeatCount="indefinite" values="0.2;0.2;1;1" keyTimes="0;${sc8K(tOrb)};${sc8K(tOrb + 2.6)};1"/>`
  const orb = `<g transform="translate(${(nx + 0.5) * Q} ${(ny + 0.5) * Q})"><g>${orbGrow}<g transform="translate(${-Q / 2} ${-Q / 2})">${sc8Burst(0, 0, 2, orbRings, 13, '#fff2c0')}</g></g></g>`
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
    s += `<rect x="${(59 + Math.round((rnd() - 0.5) * 6)) * Q}" y="${(11 + Math.round((rnd() - 0.5) * 6)) * Q}" width="${sz * Q}" height="${sz * Q}" fill="${c}" opacity="0"><animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="0 0 1 1;0.2 0.6 0.4 1" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${dx.toFixed(1)} ${dy.toFixed(1)}" keyTimes="0;${sc8K(t0)};1"/>${sc8Fade([[0, 0], [t0, 0], [t0 + 0.5, 1], [Math.min(t0 + 3, tBack - 0.1), end], [tBack, end], [tHome - 0.3, 0], [dur, 0]])}</rect>`
  }

  // ---- Voyager's hull as the foreground deck ----
  const hull = new Pix()
  hull.rect(0, 42, GW, 6, '#1b1626').rect(18, 42, GW - 18, 1, '#3a3350')
  for (let x = 24; x < GW; x += 9) hull.rect(x, 43, 1, 2, '#120e1a')
  for (let i = 0; i < 8; i++) hull.set(20 + Math.floor(rnd() * 70), 44 + Math.floor(rnd() * 4), rnd() < 0.5 ? '#251f33' : '#140f1e')
  s += `<g mask="url(#sc8Fade)">${sc8Path(hull)}</g>`
  ;[44, 62, 80].forEach((x, i) => {
    s += `<g>${new Pix().set(x, 43, '#ffb347').svg()}<animate attributeName="opacity" values="1;0.35;1" dur="${sc8Loop(6)}s" begin="-${i * 0.8}s" repeatCount="indefinite"/></g>`
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
  // one pair of eyes that glides: onto the cube, then down at Janeway, and home at the end
  const tWatch = tHit + 0.4
  const eyes = eyePair([[6, 3], [9, 3]])
  const eyeMove = sc8Move([[0, 0, 0], [tWatch, 0, 0], [tWatch + 0.35, -1, 0], [tTurn, -1, 0], [tTurn + 0.35, -1, 1], [tBack + 0.4, -1, 1], [tBack + 1.0, 0, 0], [dur, 0, 0]])
  const eyeGlow = `<animate attributeName="opacity" values="0.75;1;0.75" dur="${sc8Loop(5)}s" repeatCount="indefinite"/>`
  // the head turns in two steps: eyes drop first, then the head leans toward her (and back at the end)
  const headTurn = sc8Move([[0, 0, 0], [tTurn + 0.3, 0, 0], [tTurn + 0.8, -1, 0], [tBack + 0.3, -1, 0], [tBack + 0.9, 0, 0], [dur, 0, 0]])
  s += `<g>${sc8Path(body)}<g>${sc8Path(head)}<g>${eyes}${eyeGlow}${eyeMove}</g>${headTurn}</g></g>`

  // ---- Janeway: auburn bun, black jacket, red shoulders, four pips ----
  const jx = 26
  const jy = 28
  const k = SC8_JANEWAY
  const jw = clawdBody(k, jx, jy, 'right')
  {
    const p = jw.p
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
  }
  s += sc8Path(jw.p) + armRestHD(k, jx, jy, 'left')
  // blinks, on a period that divides the scene
  const lids = new Pix()
  jw.ex.forEach(e => lids.rect(jx + e, jy + 2, 2, 3, k.skin))
  s += `<g opacity="0">${sc8Path(lids)}<animate attributeName="opacity" calcMode="discrete" dur="${sc8Loop(4)}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.92;0.95"/></g>`
  // her claw comes up through four in-between drawings, holds, and comes back down for the ending
  const arm1 = new Pix()
  arm1.rect(jx + 20, jy + 2, 2, 3, k.skin).rect(jx + 22, jy + 1, 2, 2, k.skin).set(jx + 21, jy + 4, k.shade).set(jx + 23, jy + 2, k.shade)
  arm1.set(jx + 24, jy - 1, k.light).set(jx + 24, jy + 0, k.skin).set(jx + 22, jy - 1, k.light).set(jx + 22, jy, k.skin)
  const arm2 = new Pix()
  arm2.rect(jx + 19, jy, 2, 4, k.skin).set(jx + 20, jy + 3, k.shade).rect(jx + 20, jy - 2, 2, 2, k.skin).set(jx + 21, jy - 1, k.shade)
  arm2.rect(jx + 19, jy - 4, 1, 2, k.skin).rect(jx + 22, jy - 4, 1, 2, k.skin).rect(jx + 19, jy - 3, 4, 1, k.skin).set(jx + 19, jy - 4, k.light).set(jx + 22, jy - 4, k.light)
  const arm3 = new Pix() // three quarters up
  arm3.rect(jx + 18, jy + 4, 3, 2, k.skin).rect(jx + 19, jy - 2, 2, 6, k.skin).rect(jx + 20, jy - 2, 1, 6, k.shade)
  arm3.rect(jx + 18, jy - 6, 1, 3, k.skin).rect(jx + 21, jy - 6, 1, 3, k.skin).rect(jx + 18, jy - 4, 4, 1, k.skin).rect(jx + 19, jy - 3, 2, 1, k.skin)
  arm3.set(jx + 18, jy - 6, k.light).set(jx + 21, jy - 6, k.light)
  const ST = 0.11
  const up = tClaw + 4 * ST
  const down = tBack // she lowers it as the ending settles
  const step = (n: number): [number, number][] => [[tClaw + n * ST, tClaw + (n + 1) * ST], [down + (3 - n) * ST, down + (4 - n) * ST]]
  s += shown(armRestHD(k, jx, jy, 'right'), [[0, tClaw + ST], [tClaw + 2 * ST, tClaw + 3 * ST], [down + ST, down + 2 * ST], [down + 3 * ST, dur]], dur)
  s += shown(sc8Path(arm1), step(0), dur)
  s += shown(armMidHD(k, jx, jy, 'right'), step(1), dur)
  s += shown(sc8Path(arm2), step(2), dur)
  s += shown(sc8Path(arm3), step(3), dur)
  s += shown(armUpHD(k, jx, jy, 'right'), [[up, down]], dur)
  return s
}

// ---------- Tapestry: "Welcome to the afterlife, Jean-Luc" ----------
// Picard wakes in a bright, still void and looks around. He walks slowly to a
// soft pillar of light; the light gently opens and Q is there in white robes,
// arms spread in welcome. Picard startles back a step; Q hops with delight and
// throws both claws up; Picard raises a claw in protest; Q spreads his arms
// again, smug. A calm tableau while the rays drift; then Q and his light recede and
// Picard fades back to where he lay, so the loop starts where it began.
// All motion is eased tweens; pose changes step through in-between drawings.

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

// an eased transform track on the story timeline: [time, value] keys
function tapTf(type: string, pts: [number, string][], ease = '0.4 0 0.2 1') {
  const T = SCENE_SECONDS
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < T) all.push([T, all[all.length - 1][1]])
  const sp = all.slice(1).map(([, v], i) => (v === all[i][1] ? '0 0 1 1' : ease))
  return `<animateTransform attributeName="transform" type="${type}" calcMode="spline" dur="${T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => +(p[0] / T).toFixed(5)).join(';')}" keySplines="${sp.join(';')}"/>`
}

// Picard's eyes turned part way (1) or all the way (2) to the left: skin over the
// right-looking eyes, new eyes drawn over
function tapEyes(k: CrabHD, x: number, y: number, shift: number) {
  const p = new Pix()
  ;[6, 12].forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin))
  if (shift === 2) p.rect(x + 16, y + 1, 1, 5, k.skin)
  ;[6, 12].forEach(e => p.rect(x + e - shift, y + 2, 2, 3, EYE_HD))
  return p.svg()
}

function tapestry() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const SX = 69 // where the light comes from
  const B0 = 7.9 // the light starts to open
  const B1 = 9.4 // ... and Q is fully there
  const R0 = 15.85 // at the end the light closes again ...
  const R1 = 16.9 // ... back to the opening pillar
  let s = `<defs>
    <linearGradient id="tapSky" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#b9add6"/><stop offset="0.45" stop-color="#e3dcf2"/><stop offset="1" stop-color="#f7f3ea"/></linearGradient>
    <linearGradient id="tapFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2f4"/><stop offset="1" stop-color="#cbc0e0"/></linearGradient>
    <linearGradient id="tapFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.24" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="tapFade"><rect width="${W}" height="${H}" fill="url(#tapFadeG)"/></mask>
    <radialGradient id="tapGlow"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.35" stop-color="#fff6dc" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient>
    <radialGradient id="tapHalo"><stop offset="0" stop-color="#ffe7a8" stop-opacity="0.9"/><stop offset="0.6" stop-color="#ffd98a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
    <clipPath id="tapFloorClip"><rect x="${-W}" width="${3 * W}" height="${42 * Q}"/></clipPath>
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
    back += `<g>${cloud(cx, cy, w, c, top)}${tapTf('translate', [[0, `${a} 0`], [dur / 2, `${b} 0`], [dur, `${a} 0`]], '0.45 0 0.55 1')}</g>`
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
  back += `<g>${rays}${tapTf('rotate', [[0, rot(-5)], [dur / 2, rot(5)], [dur, rot(-5)]], '0.45 0 0.55 1')}</g>`

  // floor: a pale plane with a bright line where it meets the void
  const floor = new Pix().rect(0, 42, GW, 1, '#fbf9ff').rect(0, 43, GW, 1, '#e2daf0')
  back += `<rect x="0" y="${43 * Q}" width="${W}" height="${5 * Q}" fill="url(#tapFloor)"/>` + floor.svg()
  s += `<g mask="url(#tapFade)">${back}</g>`

  // the light at the source: steady, and it opens slowly as Q arrives
  s += `<ellipse cx="${SX * Q}" cy="${30 * Q}" rx="18" ry="44" fill="url(#tapGlow)" opacity="0.55">${tapTrack('rx', [[B0, 18], [B1, 44], [R0, 44], [R1, 18]])}${tapTrack('ry', [[B0, 44], [B1, 52], [R0, 52], [R1, 44]])}${tapTrack('opacity', [[B0, 0.55], [B1, 0.9], [R0, 0.9], [R1, 0.55]])}</ellipse>`
  s += `<ellipse cx="${SX * Q}" cy="${43 * Q}" rx="34" ry="6" fill="url(#tapHalo)" opacity="0.6">${tapTrack('opacity', [[B0, 0.6], [B1, 1], [R0, 1], [R1, 0.6]])}</ellipse>`

  // keep the title corner dark and quiet
  s += `<rect x="0" y="${30 * Q}" width="${80 * Q}" height="${18 * Q}" fill="url(#tapCorner)"/>`

  // rising motes of light (single pixels, slow)
  for (let i = 0; i < 7; i++) {
    const d = dur / (5 - (i % 3)) // periods that divide the story, so the loop is seamless
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
  s += `<g opacity="0.85">${pillar.svg()}${tapTrack('opacity', [[B0 + 0.3, 0.85], [B1, 0], [R0 + 0.1, 0], [R1, 0.85]])}</g>`

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
  // every change steps through the half-raised arm (~0.1 s)
  const spread: [number, number][] = [[0, 11.2], [14.3, dur]]
  const armsSpread = tapArmSpread(QD, qx, qy, 'left', '#ffffff', '#d9cfeb') + tapArmSpread(QD, qx, qy, 'right', '#ffffff', '#d9cfeb')
  qs += shown(armsSpread, spread, dur)
  qs += shown(armRestHD(QD, qx, qy, 'left'), [[11.3, 11.42], [13.0, 14.2]], dur)
  qs += shown(armRestHD(QD, qx, qy, 'right'), [[11.3, 11.67], [13.0, 14.2]], dur)
  qs += shown(armMidHD(QD, qx, qy, 'left'), [[11.2, 11.3], [11.42, 11.5], [12.9, 13.0], [14.2, 14.3]], dur)
  qs += shown(armMidHD(QD, qx, qy, 'right'), [[11.2, 11.3], [11.67, 11.75], [12.9, 13.0], [14.2, 14.3]], dur)
  qs += shown(armUpHD(QD, qx, qy, 'left'), [[11.5, 12.9]], dur)
  qs += shown(armUpHD(QD, qx, qy, 'right'), [[11.75, 12.9]], dur)
  qs += tapLidsAt(QD, qx, qy, qex, [[13.5, 13.62]])
  qs += tapLidsAt(QD, qx, qy, qex, [[14.5, dur]], 1) // smug, half-lidded
  const qhops = hopQ([[10.5, 10.75], [10.95, 11.2], [11.8, 12.05]], dur)
  // the radiant aura behind him, steady once he is there
  const aura = `<ellipse cx="${(qx + 9) * Q}" cy="${(qy + 6) * Q}" rx="32" ry="26" fill="url(#tapHalo)" opacity="0.85"/>`
  s += `<g opacity="0">${aura}<g>${qs}${qhops}</g>${tapTrack('opacity', [[B0 + 0.3, 0], [B1, 1], [R0 - 0.05, 1], [R1 - 0.3, 0]])}</g>`

  // ---- Picard: wakes, stands, looks around, walks slowly in, startles back ----
  const PD = TAP_PICARD
  const px0 = 12
  const py = 28
  // the walk: an eased glide in (and the startled step back), legs stepping at ~7 Hz
  // (one pair lifted, all down, the other pair, all down); at the end he fades out and
  // fades back in, asleep, where he lay at the start
  const W0 = 4.3
  const W1 = 7.4
  const S0 = 9.75
  const S1 = 10.45
  const F = [15.8, 16.35, 16.5, 17.1] // fade out, (moved back unseen), fade in asleep
  const at = (x: number) => `${(x - px0) * Q} 0`
  const walk = tapTf('translate', [[W0, at(12)], [W1, at(28)], [S0 - 0.05, at(28)], [S1, at(24)], [F[1] + 0.03, at(24)], [F[1] + 0.08, at(12)]], '0.3 0 0.6 1')
  const fade = tapTrack('opacity', [[F[0], 1], [F[1], 0], [F[2], 0], [F[3], 1]])
  const legOn: [number, number][][] = [[], [], []]
  let lastEnd = 0
  for (const [a, b] of [[W0, W1], [S0, S1]]) {
    legOn[0].push([lastEnd, a])
    const n = Math.round((b - a) / 0.14)
    for (let i = 0; i < n; i++) legOn[[1, 0, 2, 0][i % 4]].push([a + (i * (b - a)) / n, a + ((i + 1) * (b - a)) / n])
    lastEnd = b
  }
  legOn[0].push([lastEnd, dur])
  // getting up: an eased rise out of the crouch; the legs below are cut off at the floor
  const rise = tapTf('translate', [[2.0, `0 ${3 * Q}`], [2.6, '0 0'], [F[1] + 0.03, '0 0'], [F[1] + 0.08, `0 ${3 * Q}`]])

  const details = (p: Pix) => {
    p.rect(px0 + 12, 34, 2, 2, '#e8c547').set(px0 + 12, 34, '#fff3b0')
    p.rect(px0 + 4, 34, 1, 1, '#e8c547').rect(px0 + 6, 34, 1, 1, '#e8c547')
  }
  const { p: pbR, ex: pexR } = tapBody(PD, px0, py, 'right')
  details(pbR)
  pbR.rect(px0 + 16, py + 1, 1, 5, '#f09a76') // the light washing over his right side
  let ps = pbR.svg()
  // looking around: the eyes slide left through a halfway frame, and back
  ps += shown(tapEyes(PD, px0, py, 1), [[2.9, 3.0], [3.95, 4.05]], dur)
  ps += shown(tapEyes(PD, px0, py, 2), [[3.0, 3.95]], dur)
  // asleep, then the lids lift in steps; blinks
  ps += tapLidsAt(PD, px0, py, pexR, [[0, 1.6], [1.85, 1.97], [5.6, 5.72], [15.3, 15.42], [F[1], dur]])
  ps += tapLidsAt(PD, px0, py, pexR, [[1.6, 1.7]], 2)
  ps += tapLidsAt(PD, px0, py, pexR, [[1.7, 1.8]], 1)
  ps += tapLidsAt(PD, px0, py, [4, 10], [[3.35, 3.47]])
  for (const f of [0, 1, 2]) ps += shown(tapLegs(PD, px0, py, f), legOn[f], dur)
  // the protest: the claw comes up through two in-between frames, holds, comes down the same way
  const half: [number, number][] = [[12.9, 13.02], [14.27, 14.4]]
  const mid: [number, number][] = [[13.02, 13.15], [14.15, 14.27]]
  const up: [number, number][] = [[13.15, 14.15]]
  ps += shown(armRestHD(PD, px0, py, 'left'), [[0, dur]], dur)
  ps += shown(armRestHD(PD, px0, py, 'right'), complement(merge([...half, ...mid, ...up]), dur), dur)
  ps += shown(tapArmHalfRight(PD, px0, py), half, dur)
  ps += shown(armMidHD(PD, px0, py, 'right'), mid, dur)
  ps += shown(armUpHD(PD, px0, py, 'right'), up, dur)
  s += `<g>${walk}${fade}<g clip-path="url(#tapFloorClip)"><g>${rise}<g>${ps}${hopQ([[9.6, 9.82]], dur)}</g></g></g></g>`

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
const EMH_INOUT = '0.45 0 0.55 1' // gentle ease in and out
const EMH_LOOP = (n: number) => +(EMH_D / n).toFixed(4) // ambient periods that divide the scene exactly

// one animation over the scene; pts are [seconds, value]; first time 0, last time = scene end
function emhAnim(attr: string, pts: [number, string | number][], mode: 'discrete' | 'linear' | 'spline' = 'discrete', type = '', spline = EMH_INOUT) {
  const p = [...pts]
  if (p[0][0] > 0) p.unshift([0, p[0][1]])
  if (p[p.length - 1][0] < EMH_D) p.push([EMH_D, p[p.length - 1][1]])
  const tag = type ? 'animateTransform' : 'animate'
  const ks = mode === 'spline' ? ` keySplines="${p.slice(1).map(() => spline).join(';')}"` : ''
  return `<${tag} attributeName="${attr}"${type ? ` type="${type}"` : ''} calcMode="${mode}"${ks} dur="${EMH_D}s" repeatCount="indefinite" values="${p.map(v => v[1]).join(';')}" keyTimes="${p.map(v => emhKt(v[0])).join(';')}"/>`
}

// Pix written as one <path> per colour: far smaller than one <rect> per run
function emhPath(p: Pix) {
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
      if (c !== 'none') by.set(c, (by.get(c) || '') + `M${xs[i] * Q} ${y * Q}h${w}v${Q}h-${w}z`)
      i = j + 1
    }
  }
  let out = ''
  for (const [c, d] of by) out += `<path fill="${c}" d="${d}"/>`
  return out
}

// visible inside the windows, hidden outside (discrete; for single drawing steps)
function emhOn(svg: string, wins: [number, number][]) {
  const w = merge(wins)
  const pts: [number, number][] = [[0, w.length && w[0][0] <= 0 ? 1 : 0]]
  for (const [a, b] of w) {
    if (a > 0) pts.push([a, 1])
    if (b < EMH_D) pts.push([b, 0])
  }
  return `<g>${svg}${emhAnim('opacity', pts)}</g>`
}

// a flip-book: each drawing shows from its start until the next one starts ('' = nothing)
function emhTrack(segs: [string, number][]) {
  const m = new Map<string, [number, number][]>()
  segs.forEach(([svg, t], i) => {
    if (!svg) return
    const end = i + 1 < segs.length ? segs[i + 1][1] : EMH_D
    m.set(svg, [...(m.get(svg) || []), [t, end]])
  })
  let s = ''
  for (const [svg, w] of m) s += emhOn(svg, w)
  return s
}

// lifted by `amp` px inside each window, easing up and back down over `r` seconds
function emhLift(wins: [number, number][], amp: number, r: number) {
  const pts: [number, string][] = [[0, '0 0']]
  for (const [a, b] of merge(wins)) pts.push([a, '0 0'], [a + r, `0 ${-amp}`], [b - r, `0 ${-amp}`], [b, '0 0'])
  return emhAnim('transform', pts, 'spline', 'translate')
}

// fades in over `r` seconds from a, out over `r` seconds until b
function emhFade(svg: string, a: number, b: number, r = 0.3, peak = 1) {
  return `<g opacity="0">${svg}${emhAnim('opacity', [[0, 0], [a, 0], [a + r, peak], [b - r, peak], [b, 0]], 'linear')}</g>`
}

// ---------- the Doctor's parts ----------

// an arm drawn from rows: column 0 is the outermost; s skin, h shade, l light
const EMH_ARM = {
  rest: ['sss', 'sss', 'hhh'],
  m1: ['sss.', 'sss.', 'hsh.', 'h...'], // the claw starts to swing down
  m2: ['sss.', 'sss.', 'hs..', 'ss..', '.hh.'], // ... and in
  hips: ['sss.', 'sss.', 'hs..', 'ss..', '.ssl', '.hh.'], // claw on the hip
}
function emhArmRows(k: CrabHD, x: number, y: number, side: Side, rows: string[]) {
  const p = new Pix()
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const c = r[i] === 's' ? k.skin : r[i] === 'h' ? k.shade : r[i] === 'l' ? k.light : ''
      if (c) p.set(side === 'left' ? x - 3 + i : x + 20 - i, y + 4 + j, c)
    }
  })
  return emhPath(p)
}

// medical tricorder, held out flat with the screen towards us
function emhTricorder(p: Pix, x: number, y: number, screen = '#6fe8ff') {
  p.rect(x, y, 4, 4, '#4b5064').rect(x, y, 4, 1, '#7d849c').rect(x + 1, y + 1, 2, 1, screen)
  p.set(x, y + 3, '#33374a').set(x + 3, y + 3, '#33374a')
}

// left claw gripping the tricorder at (tx, ty): the forearm reaches out from the shoulder.
// At tx = x - 13, ty = y + 3 this is the full scanning reach.
function emhArmGrip(k: CrabHD, x: number, y: number, tx: number, ty: number, screen = '#6fe8ff') {
  const p = new Pix()
  const len = x - tx - 5
  if (len > 0) p.rect(x - len, y + 4, len, 2, k.skin).rect(x - len, y + 6, len, 1, k.shade).set(x - len, y + 4, k.light)
  emhTricorder(p, tx, ty, screen)
  p.rect(tx + 3, ty - 1, 2, 1, k.skin).set(tx + 3, ty - 1, k.light)
  p.rect(tx + 3, ty + 4, 2, 1, k.shade)
  p.rect(tx + 4, ty, 1, 4, k.skin)
  return emhPath(p)
}

// tricorder raised in front of him to read the result: a green screen
function emhArmRead(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin).rect(x - 3, y + 6, 3, 1, k.shade)
  p.rect(x - 5, y + 2, 2, 4, k.skin).set(x - 5, y + 2, k.light)
  emhTricorder(p, x - 9, y + 1, '#7dff9a')
  p.set(x - 8, y + 3, '#7dff9a').set(x - 7, y + 3, '#4b5064') // a tick mark on the screen
  return emhPath(p)
}

// right claw raised h art px (8 = fully up)
function emhArmRaise(k: CrabHD, x: number, y: number, h: number) {
  const p = new Pix()
  const top = y + 4 - h
  const tip = h >= 6 ? 3 : 2
  p.rect(x + 18, y + 4, 3, 2, k.skin)
  p.rect(x + 19, top, 2, h, k.skin).rect(x + 20, top, 1, h, k.shade)
  p.rect(x + 18, top - 1 - tip, 1, tip, k.skin).rect(x + 21, top - 1 - tip, 1, tip, k.skin)
  p.rect(x + 18, top - 2, 4, 1, k.skin).rect(x + 19, top - 1, 2, 1, k.skin)
  p.set(x + 18, top - 1 - tip, k.light).set(x + 21, top - 1 - tip, k.light)
  return emhPath(p)
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
  let s = emhPath(p)

  // eyes: one pair that glides from looking left to looking right when he turns back,
  // a squint step into and out of the pleased ^ ^ look, and blinks
  const EYE = '#1a1020'
  const eyes = new Pix()
  const squint = new Pix()
  const happy = new Pix()
  for (const c of [4, 10]) {
    eyes.rect(x + c, y + 2, 2, 3, EYE)
    squint.rect(x + c, y + 2, 2, 2, EYE)
    happy.rect(x + c, y + 2, 2, 1, EYE).set(x + c - 1, y + 3, EYE).set(x + c + 2, y + 3, EYE)
  }
  const look = emhAnim('transform', [[0, '0 0'], [13.28, '0 0'], [13.52, `${2 * Q} 0`], [EMH_D - 0.05, `${2 * Q} 0`], [EMH_D, '0 0']], 'spline', 'translate')
  s += `<g>${emhOn(emhPath(eyes), [[0, 5.0], [5.15, 8.3], [8.45, 10.9], [11.05, EMH_PLEASED], [13.28, 14.3], [14.45, EMH_D]])}${look}</g>`
  s += emhTrack([['', 0], [emhPath(squint), EMH_PLEASED], [emhPath(happy), EMH_PLEASED + 0.08], [emhPath(squint), EMH_WAIT2[0]], ['', 13.28]])
  // a frown while he waits: brows pulled down, easing in
  s += emhFade(emhPath(new Pix().rect(x + 5, y + 1, 3, 1, hair).rect(x + 11, y + 1, 3, 1, hair)), 13.6, EMH_D, 0.35)

  // legs: pairs lift in turn while he walks, the far right one taps while he waits;
  // every lift eases up one art pixel and back down
  const stepAt = (i: number) => EMH_WALK[0] + (i * (EMH_WALK[1] - EMH_WALK[0])) / EMH_STEPS
  const lifts: [number, number][][] = [[], []]
  for (let i = 0; i < EMH_STEPS; i++) lifts[i % 2].push([stepAt(i), stepAt(i) + 0.2])
  const taps: [number, number][] = [[13.5, 13.8], [14.1, 14.4], [14.7, 15.0]]
  ;[1, 5, 11, 15].forEach(lx => {
    const pair = lx === 1 || lx === 11 ? 0 : 1
    const leg = emhPath(new Pix().rect(x + lx, y + 10, 2, 4, '#1b1924').set(x + lx, y + 13, '#2b2836'))
    s += `<g>${leg}${emhLift(lx === 15 ? [...lifts[pair], ...taps] : lifts[pair], Q, 0.07)}</g>`
  })

  // left claw (holds the tricorder): to the hip, out to scan, up to read, back to the hip
  const L = (rows: string[]) => emhArmRows(k, x, y, 'left', rows)
  const G = (dx: number, dy: number, scr?: string) => emhArmGrip(k, x, y, x - dx, y + dy, scr)
  const GREEN = '#7dff9a'
  const A = EMH_ARM
  s += emhTrack([
    [L(A.rest), 0], [L(A.m1), 5.7], [L(A.m2), 5.79], [L(A.hips), 5.88],
    [L(A.m2), 7.4], [L(A.m1), 7.49], [L(A.rest), 7.58],
    [G(8, 5), 9.4], [G(9, 4), 9.45], [G(10, 4), 9.5], [G(11, 3), 9.55], [G(12, 3), 9.6], [G(13, 3), 9.65],
    [G(12, 3), 11.6], [G(11, 2), 11.66], [G(10, 2, GREEN), 11.72], [emhArmRead(k, x, y), 11.78],
    [G(8, 2, GREEN), 13.2], [G(7, 3), 13.27], [G(6, 5), 13.34], [L(A.rest), 13.41],
    [L(A.m1), 13.5], [L(A.m2), 13.59], [L(A.hips), 13.68],
  ])
  // the tricorder in his resting claw slides in to the belt as the claw goes to the hip ...
  const tri = new Pix()
  emhTricorder(tri, x - 5, y + 6)
  const tIn = `${3 * Q} ${Q}`
  s += `<g>${emhPath(tri)}${emhAnim('opacity', [[0, 1], [5.7, 1], [5.97, 0], [7.4, 0], [7.67, 1], [9.4, 1], [9.4, 0], [13.41, 0], [13.41, 1], [13.5, 1], [13.77, 0]], 'linear')}${emhAnim('transform', [[0, '0 0'], [5.7, '0 0'], [5.97, tIn], [7.4, tIn], [7.67, '0 0'], [13.5, '0 0'], [13.77, tIn], [EMH_D - 0.05, tIn], [EMH_D, '0 0']], 'spline', 'translate')}</g>`
  // ... where it is clipped on
  const bIn = `${-3 * Q} ${-Q}`
  s += `<g opacity="0">${emhPath(new Pix().rect(x + 3, y + 8, 3, 2, '#4b5064').set(x + 4, y + 8, '#6fe8ff'))}${emhAnim('opacity', [[0, 0], [5.7, 0], [5.97, 1], [7.4, 1], [7.67, 0], [13.5, 0], [13.77, 1], [EMH_D - 0.05, 1], [EMH_D, 0]], 'linear')}${emhAnim('transform', [[0, bIn], [5.7, bIn], [5.97, '0 0'], [7.4, '0 0'], [7.67, bIn], [13.5, bIn], [13.77, '0 0'], [EMH_D - 0.05, '0 0'], [EMH_D, bIn]], 'spline', 'translate')}</g>`

  // right claw: raised for the question in four steps and down again, then to the hip
  const R = (rows: string[]) => emhArmRows(k, x, y, 'right', rows)
  const U = (h: number) => emhArmRaise(k, x, y, h)
  s += emhTrack([
    [R(A.rest), 0], [U(2), 4.1], [U(4), 4.19], [U(6), 4.28], [U(8), 4.37],
    [U(6), 5.23], [U(4), 5.32], [U(2), 5.41], [R(A.rest), 5.5],
    [R(A.m1), 5.7], [R(A.m2), 5.79], [R(A.hips), 5.88],
    [R(A.m2), 7.4], [R(A.m1), 7.49], [R(A.rest), 7.58],
    [R(A.m1), 9.6], [R(A.m2), 9.69], [R(A.hips), 9.78],
  ])
  // the tricorder light while scanning: red / green, once a second
  s += emhOn(
    `<rect x="${(x - 12) * Q}" y="${(y + 5) * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="fill" values="#ff5a5a;#7dff9a;#7dff9a" calcMode="discrete" dur="1s" keyTimes="0;0.5;1" repeatCount="indefinite"/></rect>`,
    [[9.65, EMH_SCAN[1]]],
  )

  // a small satisfied nod, eased down and back up
  return `<g>${s}${emhAnim('transform', [[0, '0 0'], [12.55, '0 0'], [12.72, `0 ${Q}`], [12.98, '0 0']], 'spline', 'translate')}</g>`
}

// speech bubble with a pixel glyph
function emhBubble(glyph: string[], x: number, y: number) {
  const body = ['.wwwwwwwww.', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', '.wwwwwwwww.', '.ww........', 'ww.........']
  const p = new Pix().rows(body, x, y, { w: '#e2eef8' })
  p.rect(x + 1, y + 8, 9, 1, '#b9cde6')
  p.rows(glyph, x + 3, y + 1, { k: '#1d2a4a', r: '#d8342f' })
  return emhPath(p)
}

// the holographic glow, the light line riding the reveal edge, slow sparkles
function emhShimmer(X: number, win: [number, number], closing: boolean) {
  const [a, b] = win
  let s = ''
  s += `<g opacity="0"><ellipse cx="${(X + 9) * Q}" cy="${33 * Q}" rx="${15 * Q}" ry="${13 * Q}" fill="url(#emhHolo)"/>${emhAnim('opacity', [[0, 0], [a - 0.5, 0], [a, 1], [b, 1], [b + 0.9, 0]], 'linear')}</g>`
  // the edge line: down the figure over the reveal, eased exactly like the reveal clip
  const yA = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<rect x="${(X - 5) * Q}" y="${yA}" width="${29 * Q}" height="${Q}" fill="#cdf3ff" opacity="0">${emhAnim('y', [[0, yA], [a, yA], [b, yB], [EMH_D - 0.05, yB], [EMH_D, yA]], 'spline')}${emhAnim('opacity', [[0, 0], [a, 0], [a + 0.2, 0.45], [b - 0.3, 0.45], [b, 0]], 'linear')}</rect>`
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
  back += emhPath(wall)
  // glow under the ceiling lights
  back += `<ellipse cx="${28 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/><ellipse cx="${64 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/>`

  // vitals monitor over the bed
  const mon = new Pix()
  mon.rect(17, 6, 25, 16, '#3a4566').rect(17, 6, 25, 1, '#56648e').rect(18, 7, 23, 14, '#0b1c33')
  mon.rect(19, 8, 7, 1, '#f2b866').rect(27, 8, 3, 1, '#e08a3c').rect(31, 8, 9, 1, '#4f8fd6')
  mon.rect(19, 8, 1, 3, '#f2b866')
  mon.rect(19, 17, 4, 2, '#4f8fd6').rect(24, 17, 6, 2, '#f2b866').rect(31, 17, 3, 2, '#c66a5a').rect(35, 17, 5, 2, '#4f8fd6')
  mon.rect(24, 19, 4, 1, '#7a5a3a').rect(35, 19, 3, 1, '#2d4f80')
  back += emhPath(mon)
  // the heartbeat trace: drawn smoothly left to right, then wiped away left to right
  const ekg = new Pix()
  const shape = [0, 0, 0, -1, 0, 0, 1, -3, 2, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 1, -3, 2, 0]
  shape.forEach((d, i) => {
    ekg.set(18 + i, 14 + d, '#6fffc0')
    if (d < -1) ekg.rect(18 + i, 14 + d, 1, -d, '#6fffc0')
    if (d > 1) ekg.rect(18 + i, 14, 1, d + 1, '#6fffc0')
  })
  const SW = EMH_LOOP(5)
  const ekgA = (attr: string, v: string) => `<animate attributeName="${attr}" dur="${SW}s" repeatCount="indefinite" values="${v}" keyTimes="0;0.72;1"/>`
  back += `<clipPath id="emhEkgClip"><rect x="${18 * Q}" y="0" width="0" height="${H}">${ekgA('width', `0;${23 * Q};0`)}${ekgA('x', `${18 * Q};${18 * Q};${41 * Q}`)}</rect></clipPath>`
  back += `<g clip-path="url(#emhEkgClip)">${emhPath(ekg)}</g>`
  // heart light: a slow soft pulse
  back += `<rect x="${39 * Q}" y="${10 * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="opacity" values="1;0.3;1" dur="${EMH_LOOP(10)}s" repeatCount="indefinite"/></rect>`

  // status display on the right wall: amber elbow and blue bars
  const pan = new Pix()
  pan.rect(54, 6, 20, 10, '#121625')
  pan.rect(55, 7, 3, 8, '#e8a24a').rect(55, 7, 7, 2, '#e8a24a').set(55, 7, '#121625').set(55, 14, '#121625')
  pan.rect(63, 7, 4, 2, '#c97ad0').rect(68, 7, 5, 2, '#4f8fd6')
  pan.rect(59, 10, 8, 1, '#4f8fd6').rect(68, 10, 4, 1, '#f2b866')
  pan.rect(59, 12, 5, 1, '#f2b866').rect(65, 12, 7, 1, '#4f8fd6')
  pan.rect(59, 14, 10, 1, '#2f5f9c').rect(70, 14, 2, 1, '#e08a3c')
  back += emhPath(pan)
  back += `<rect x="${70 * Q}" y="${14 * Q}" width="${2 * Q}" height="${Q}" fill="#ffd36b"><animate attributeName="opacity" values="1;0.3;1" dur="${EMH_LOOP(7)}s" repeatCount="indefinite"/></rect>`
  back += `<rect x="${59 * Q}" y="${10 * Q}" width="${8 * Q}" height="${Q}" fill="#9fd0ff"><animate attributeName="opacity" values="0;0.6;0" dur="${EMH_LOOP(5)}s" repeatCount="indefinite"/></rect>`
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
  s += emhPath(b)
  // slow breathing: the sheet over the chest rises and settles
  s += `<g opacity="0">${emhPath(new Pix().rect(24, 29, 5, 1, sheetHi))}<animate attributeName="opacity" values="0;1;0" dur="${EMH_LOOP(4)}s" repeatCount="indefinite"/></g>`
  return s
}

function doctorEmh() {
  const W = GW * Q
  const H = GH * Q
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

  // reveal: a clip that opens top to bottom, and later closes top to bottom (eased)
  const full = (EMH_BOT - EMH_TOP) * Q
  const yT = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<clipPath id="emhReveal"><rect x="${-W}" y="${yT}" width="${3 * W}" height="0">${emhAnim('y', [[0, yT], [EMH_DEMAT[0], yT], [EMH_DEMAT[1], yB], [EMH_D - 0.05, yB], [EMH_D, yT]], 'spline')}${emhAnim('height', [[0, 0], [EMH_MAT[0], 0], [EMH_MAT[1], full], [EMH_DEMAT[0], full], [EMH_DEMAT[1], 0]], 'spline')}</rect></clipPath>`

  // the walk: one smooth glide of six steps' length while the legs lift in turn
  const walkTo = `${-EMH_STEP * EMH_STEPS * Q} 0`
  const walk = emhAnim('transform', [[0, '0 0'], [EMH_WALK[0], '0 0'], [EMH_WALK[1], walkTo], [EMH_D - 0.05, walkTo], [EMH_D, '0 0']], 'spline', 'translate', '0.35 0 0.65 1')
  // his shadow, fading in and out with him
  const shadow = `<ellipse cx="${(EMH_X + 9) * Q}" cy="${42.5 * Q}" rx="${12 * Q}" ry="3" fill="#06070d" opacity="0">${emhAnim('opacity', [[0, 0], [EMH_MAT[0] + 0.4, 0], [EMH_MAT[1] + 0.2, 0.6], [EMH_DEMAT[0] + 0.2, 0.6], [EMH_DEMAT[1], 0]], 'linear')}</ellipse>`
  // a little translucent while forming and fading
  const holo = emhAnim('opacity', [[0, 0.75], [EMH_MAT[0], 0.75], [EMH_MAT[1] + 0.4, 1], [EMH_DEMAT[0], 1], [EMH_DEMAT[1], 0.75]], 'linear')
  s += `<g>${shadow}<g clip-path="url(#emhReveal)"><g>${emhDoctor()}${holo}</g></g>${walk}</g>`

  // the scan: a soft beam from the tricorder over the patient, with a line sweeping smoothly to and fro
  const tipX = EMH_X2 - 14
  const beam = new Pix()
  for (let c = 28; c <= tipX; c++) {
    const spread = Math.round((tipX - c) * 0.3)
    for (let r = 32 - spread; r <= 33 + spread; r++) if (r >= 27 && r <= 33) beam.set(c, r, '#8fe3ff')
  }
  const sweepLine = `<rect x="${tipX * Q}" y="${27 * Q}" width="${Q}" height="${7 * Q}" fill="#d8f6ff" opacity="0.6"><animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="${EMH_INOUT};${EMH_INOUT}" dur="2.4s" repeatCount="indefinite" values="0 0;${-11 * Q} 0;0 0" keyTimes="0;0.5;1"/></rect>`
  s += emhFade(`<g opacity="0.2">${emhPath(beam)}</g>${sweepLine}`, EMH_SCAN[0] + 0.1, EMH_SCAN[1], 0.5)

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

// one smooth transform on the story timeline: keys are [seconds, value, spline into it]
const BOB_EASE = '0.42 0 0.58 1'
function bobTween(type: string, keys: [number, string, string?][]) {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(4))
  kt[kt.length - 1] = 1
  return `<animateTransform attributeName="transform" type="${type}" calcMode="spline" dur="${T}s" repeatCount="indefinite" values="${k.map(x => x[1]).join(';')}" keyTimes="${kt.join(';')}" keySplines="${k.slice(1).map(x => x[2] ?? BOB_EASE).join(';')}"/>`
}

// a raised claw that rises smoothly out of the shoulder (clipped at the shoulder line)
// keys: [seconds, rows still hidden (0 = fully up, 12 = fully down), spline]
function bobArmRise(id: string, k: CrabHD, x: number, y: number, keys: [number, number, string?][]) {
  return `<clipPath id="${id}"><rect x="${(x + 17) * Q}" y="${(y - 9) * Q}" width="${7 * Q}" height="${13 * Q}"/></clipPath><g clip-path="url(#${id})"><g transform="translate(0 ${12 * Q})">${armUpHD(k, x, y, 'right')}${bobTween('translate', keys.map(([t, r, sp]) => [t, `0 ${r * Q}`, sp]))}</g></g>`
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
  s += `<g><rect x="${66 * Q}" y="${10 * Q - 0.5}" width="60" height="1" fill="#ff4040"/><circle cx="${65 * Q}" cy="${10 * Q}" r="4" fill="#ff3030" opacity="0.35"/><animateTransform attributeName="transform" type="rotate" values="-10 ${65 * Q} ${10 * Q};6 ${65 * Q} ${10 * Q};-10 ${65 * Q} ${10 * Q}" calcMode="spline" keyTimes="0;0.5;1" keySplines="${BOB_EASE};${BOB_EASE}" dur="${(SCENE_SECONDS / 5).toFixed(3)}s" repeatCount="indefinite"/></g>`
  // blinking alcove lights
  ;[[31, 9], [36, 15], [80, 8], [84, 20], [31, 21]].forEach(([x, y], i) => {
    s += `<g>${bobR(x, y, 1, 1, '#5dff95')}<animate attributeName="opacity" values="1;0.2;1" dur="${(SCENE_SECONDS / (9 - i)).toFixed(3)}s" repeatCount="indefinite"/></g>`
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
    back += `<g>${bobR(x, y, 2, 1, i === 1 ? '#ff6b5a' : '#f7c487')}<animate attributeName="opacity" values="1;0.35;1" dur="${(SCENE_SECONDS / [9, 7, 6][i]).toFixed(3)}s" repeatCount="indefinite"/></g>`
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
  const sway: [number, number][] = [[11.8, 0], [12.25, 1], [13.05, -1], [13.85, 1], [14.35, 0]]
  let scr = `<g>${bobLocutus()}${bobRamp([[10.0, 1], [tFull, 0.45], [12.6, 0.45], [14.0, 1]])}${bobTween('translate', sway.map(([t, v]) => [t, `${v * Q} 0`]))}</g>`
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
  scr += `<rect x="${BOB_SX * Q}" y="0" width="${BOB_SW * Q}" height="6" fill="#c8ffd8" opacity="0.04"><animate attributeName="y" values="${BOB_SY * Q - 6};${(BOB_SY + BOB_SH) * Q}" dur="${(SCENE_SECONDS / 3).toFixed(3)}s" repeatCount="indefinite"/></rect>`
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
  s += crabHD(BOB_WORF, wx, wy, 'right', T, { left: [], right: [] }, [], T / 4, worfDetails)
  const IN = '0.55 0 0.85 0.4'
  s += bobArmRise('bobWorfArm', BOB_WORF, wx, wy, [[tWorfReady, 12], [tWorfReady + 0.27, 0, '0.25 0.6 0.4 1'], [tPress - 0.17, 0], [tPress - 0.03, 12, IN]])
  const prPal = { S: BOB_WORF.skin, s: BOB_WORF.shade, L: BOB_WORF.light }
  const prTop = new Pix().rows(['SSS....', 'sSSS...'], wx + 18, wy + 4, prPal)
  const pr = new Pix().rows(['..sSS..', '...SS..', '..LSSL.', '..S..S.'], wx + 18, wy + 6, prPal)
  // the reach down to the console slides out from under the shoulder (clipped)
  const prSlide = `<clipPath id="bobPressClip"><rect x="${(wx + 18) * Q}" y="${(wy + 6) * Q}" width="${7 * Q}" height="${4 * Q}"/></clipPath><g clip-path="url(#bobPressClip)"><g transform="translate(0 ${-4 * Q})">${pr.svg()}${bobTween('translate', [[tPress - 0.07, `0 ${-4 * Q}`], [tPress + 0.05, '0 0', IN], [tPressEnd, '0 0'], [tPressEnd + 0.22, `0 ${-4 * Q}`]])}</g></g>`

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
  s += shown(prTop.svg(), [[tPress - 0.07, tPressEnd + 0.12]], T) + prSlide
  void press

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
  s += crabHD(BOB_RIKER, rx, ry, 'right', T, { left: [], right: [] }, [], T / 5, rikerDetails)
  // while he turns: the eyes are lifted off the face and glide 2 px to Worf and back
  const glide = new Pix()
  for (const c of [6, 7, 12, 13]) glide.rect(rx + c, ry + 2, 1, 3, EYE_HD)
  const eyesMove = `<g>${eyesAt([])}<g>${glide.svg()}${bobTween('translate', [[tTurn, '0 0'], [tAtWorf, `${-2 * Q} 0`], [tBackTurn, `${-2 * Q} 0`], [tAtScreen, '0 0']])}</g></g>`
  s += shown(eyesMove, [[tTurn, tAtScreen]], T)
  s += bobArmRise('bobRikerArm', BOB_RIKER, rx, ry, [[tHalf, 12], [tUp + 0.1, 0, '0.25 0.6 0.4 1'], [tLower, 0], [tDown, 12]])
  void raise

  return s
}

// ---------- Yesterday's Enterprise ----------
// A quiet bridge. On the viewscreen a temporal rift slowly opens, and the battered
// Enterprise-C drifts out of it. The timeline shifts: the bridge goes dark and
// wartime-red, and Tasha Yar is standing at tactical again. Picard looks to her,
// she nods; he raises his claw. The Enterprise-C turns, sails back into the rift,
// the rift closes, and the bridge (and history) quietly goes back to normal.
// Everything moves on eased splines; pose swaps go through in-between frames.

const YE_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f2a985',
}

const YE_TASHA: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#d4a22e',
  lowerShade: '#a37a1c',
  legs: '#1c1424',
  rim: '#f2a985',
}

// a plain rect in art pixels
const yeR = (x: number, y: number, w: number, h: number, c: string, extra = '') =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"${extra}/>`

function yeRnd(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

// One smooth animation on the story timeline: keys are [seconds, value]
const YE_EASE = '0.42 0 0.58 1'
function yeAnim(attr: string, keys: [number, string][], tag = 'animate', extra = '') {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(4))
  kt[kt.length - 1] = 1
  const splines = k.slice(1).map(() => YE_EASE).join(';')
  return `<${tag} attributeName="${attr}" ${extra}dur="${T}s" repeatCount="indefinite" calcMode="spline" keySplines="${splines}" values="${k.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"/>`
}
const yeFade = (keys: [number, number][]) => yeAnim('opacity', keys.map(([t, v]) => [t, String(v)] as [number, string]))
// ambient loops divide the story length (and start already running, via a negative begin),
// so they are in the same phase at the restart
const yeAmb = (vals: string, div: number, begin = 0) =>
  `<animate attributeName="opacity" values="${vals}" dur="${(SCENE_SECONDS / div).toFixed(4)}s" begin="${-begin}s" repeatCount="indefinite"/>`

// screen content area, in art pixels
const YE_SX = 28
const YE_SY = 2
const YE_SW = 58
const YE_SH = 24

// the Enterprise-C (Ambassador class), side on, facing right, battle-scarred.
// Drawn with its top-left at 0,0; it is 30 x 9 art pixels.
function yeShipC() {
  const pal: Record<string, string> = {
    s: '#dcdde8', w: '#e2e3ec', W: '#c3c4d1', g: '#85869a', h: '#a9abbb', H: '#c6c8d5', k: '#66677b',
    N: '#cdcedc', n: '#9a9cae', b: '#e8553a', r: '#9a3626', c: '#4f8fc8', p: '#7d7e92', d: '#e0a050',
    o: '#ffe6a0', x: '#4a4554', X: '#2e2a36',
  }
  const rows = [
    '................swws..........',
    '..........wwwWWxxWWWWWWWWww...',
    'NNNNNxNNNb.gWWoWXxoWWoWWoWWWg.',
    'nnnnnnnxnr..gggXgggggxgggggg..',
    '.ccccccc.....kgg.xgggg........',
    '......pp......hk..............',
    '.....hhhhhHHHHhhxhhhhhd.......',
    '....hhhxhhhhhhhXxhhhhhk.......',
    '.....kkkkkkkkkkkkkkkk.........',
  ]
  let s = new Pix().rows(rows, 0, 0, pal).svg()
  // hull breaches: small dim embers that breathe slowly
  const breach = new Pix().set(17, 2, '#ff8a4a').set(15, 3, '#ff7a3a').set(16, 7, '#ff8a4a').set(7, 3, '#ff7a3a')
  s += `<g>${breach.svg()}${yeAmb('0.55;1;0.55', 7)}</g>`
  // a thin wisp of venting plasma trailing behind
  s += `<g opacity="0.35">${new Pix().rect(-3, 7, 3, 1, '#9fb0c8').rect(-6, 7, 2, 1, '#7d8aa6').set(-8, 6, '#6a7590').svg()}</g>`
  return s
}

// the Enterprise-C bow-on, for the middle of her turn (14 x 6, centred on the hull)
function yeShipFront() {
  const pal: Record<string, string> = {
    s: '#dcdde8', w: '#e2e3ec', W: '#c3c4d1', g: '#85869a', h: '#a9abbb', k: '#66677b',
    N: '#cdcedc', n: '#9a9cae', c: '#4f8fc8', p: '#7d7e92', d: '#e0a050', o: '#ffe6a0', x: '#4a4554',
  }
  const rows = [
    '.....swws.....',
    '.wWWWWWWWWWWw.',
    'gWoWWWxWWWoWWg',
    '.gggggkkgxggg.',
    'Nn.p.hddh.p.nN',
    'cc...hhhh...cc',
  ]
  return `<g transform="translate(${-7 * Q} ${-3 * Q})">${new Pix().rows(rows, 0, 0, pal).svg()}</g>`
}

// the temporal rift: a slow, soft violet swirl around a dark eye
function yeRift() {
  const T = SCENE_SECONDS
  let arms = ''
  const seg = (base: number, t0: number, t1: number) => {
    const pts: string[] = []
    for (let t = t0; t <= t1 + 0.001; t += 0.2) {
      const r = 3.5 + t * 2.7
      pts.push(`${(r * Math.cos(base + t)).toFixed(1)},${(r * Math.sin(base + t)).toFixed(1)}`)
    }
    return pts.join(' ')
  }
  const bands: [number, number, number, string, number][] = [
    [0, 1.8, 2.6, '#d9b4ff', 0.7],
    [1.8, 3.6, 2.2, '#bb92f0', 0.6],
    [3.6, 5.4, 1.8, '#9672da', 0.48],
    [5.4, 6.8, 1.3, '#7454b6', 0.34],
  ]
  for (let a = 0; a < 3; a++) {
    const base = (a * 2 * Math.PI) / 3
    for (const [t0, t1, w, c, o] of bands) {
      arms += `<polyline points="${seg(base, t0, t1)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`
    }
    arms += `<polyline points="${seg(base + Math.PI / 3, 1.0, 4.6)}" fill="none" stroke="#ffb27a" stroke-width="1" opacity="0.4"/>`
  }
  let ring = ''
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ring += `<rect x="${(25 * Math.cos(a) - 1).toFixed(1)}" y="${(25 * Math.sin(a) - 1).toFixed(1)}" width="2" height="2" fill="#8a6ad2" opacity="${i % 2 ? 0.3 : 0.45}"/>`
  }
  return (
    `<circle r="32" fill="url(#yeRiftGlow)"/>` +
    `<g>${ring}<animateTransform attributeName="transform" type="rotate" values="360;0" dur="${(T / 2).toFixed(4)}s" repeatCount="indefinite"/></g>` +
    `<g>${arms}<animateTransform attributeName="transform" type="rotate" values="0;360" dur="${(T / 3).toFixed(4)}s" repeatCount="indefinite"/></g>` +
    `<circle r="5.5" fill="#1a0d30" opacity="0.9"/><circle r="5.5" fill="none" stroke="#c49cff" stroke-width="1" opacity="0.45"/><circle r="2.5" fill="#2c1850"/>`
  )
}

function yesterdaysEnterprise() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q

  // ---- the beat sheet
  const riftOpen: [number, number] = [1.8, 4.4]
  const shipOut: [number, number] = [4.4, 7.2]
  const grimIn: [number, number] = [6.2, 8.6]
  const tashaIn: [number, number] = [6.6, 8.6]
  const lookAtTasha: [number, number] = [8.8, 10.0]
  const nod: [number, number] = [9.3, 9.8]
  const clawRaise: [number, number] = [10.3, 14.7] // rest -> half -> up and back, in-betweens from the kit
  const turn: [number, number] = [11.0, 12.4]
  const goBack: [number, number] = [12.4, 14.2]
  const riftClose: [number, number] = [14.0, 15.9]
  const grimOut: [number, number] = [14.4, 16.2]

  let s = `<defs>
    <linearGradient id="yeFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="yeFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#yeFadeG)"/></mask>
    <linearGradient id="yeFadeCG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.1" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="yeFadeC"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#yeFadeCG)"/></mask>
    <linearGradient id="yeWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1420"/><stop offset="1" stop-color="#33273a"/></linearGradient>
    <linearGradient id="yeSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05040c"/><stop offset="1" stop-color="#0d0a1c"/></linearGradient>
    <radialGradient id="yeNeb"><stop offset="0" stop-color="#7b5bc6" stop-opacity="0.16"/><stop offset="1" stop-color="#7b5bc6" stop-opacity="0"/></radialGradient>
    <radialGradient id="yeRiftGlow"><stop offset="0" stop-color="#b58cff" stop-opacity="0.5"/><stop offset="0.45" stop-color="#8656d0" stop-opacity="0.26"/><stop offset="1" stop-color="#5a3a9a" stop-opacity="0"/></radialGradient>
    <radialGradient id="yeSpill"><stop offset="0" stop-color="#a27cff" stop-opacity="0.22"/><stop offset="1" stop-color="#a27cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="yeWarm"><stop offset="0" stop-color="#ffcf9a" stop-opacity="0.12"/><stop offset="1" stop-color="#ffcf9a" stop-opacity="0"/></radialGradient>
    <pattern id="yeScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="2" fill="#000" opacity="0.08"/></pattern>
    <clipPath id="yeScreen"><rect x="${YE_SX * Q}" y="${YE_SY * Q}" width="${YE_SW * Q}" height="${YE_SH * Q}"/></clipPath>
  </defs>`

  // ---- the bridge in peacetime, fading in from the band on the left
  let back = `<rect x="-6" y="-6" width="${W + 12}" height="${H + 12}" fill="url(#yeWall)"/>`
  back += yeR(0, 0, GW, 2, '#120d17') + yeR(0, 1, GW, 1, '#ffd9a0', ' opacity="0.3"')
  // a soft warm wash: the normal, lived-in Enterprise-D
  back += `<ellipse cx="${20 * Q}" cy="${16 * Q}" rx="60" ry="40" fill="url(#yeWarm)"/>`
  // LCARS wall panel
  const lc = new Pix()
  lc.rect(9, 5, 15, 17, '#0b0910')
  lc.rect(10, 6, 13, 2, '#f29a3a').rect(10, 8, 3, 12, '#f29a3a').set(10, 6, '#0b0910').set(22, 6, '#c9a7ff')
  lc.rect(14, 9, 4, 2, '#c39be0').rect(19, 9, 4, 2, '#8aa7e8')
  lc.rect(14, 12, 9, 1, '#f7c487')
  lc.rect(14, 14, 3, 2, '#8aa7e8').rect(18, 14, 5, 2, '#c39be0')
  lc.rect(14, 17, 5, 1, '#8aa7e8').rect(20, 17, 3, 1, '#f29a3a')
  lc.rect(10, 20, 13, 1, '#b48fd6')
  back += `<g opacity="0.6">${lc.svg()}</g>`
  ;[[15, 19, 5], [18, 19, 6], [21, 19, 7]].forEach(([x, y, d], i) => {
    back += `<g>${yeR(x, y, 2, 1, i === 1 ? '#c9a7ff' : '#f7c487')}${yeAmb('1;0.4;1', d)}</g>`
  })
  // wood trim, baseboard, carpet
  const wall = new Pix()
  wall.rect(0, 29, GW, 2, '#5e3f2c').rect(0, 29, GW, 1, '#8a6040')
  wall.rect(0, 33, GW, 1, '#0f0b13')
  wall.rect(0, 34, GW, 14, '#1d1724').rect(0, 34, GW, 1, '#2c2236')
  wall.rect(0, 38, GW, 1, '#221b2a').rect(58, 43, GW - 58, 1, '#19141f')
  for (let x = 2; x < GW; x += 9) wall.rect(x, 31, 1, 2, '#2a2030')
  back += wall.svg()
  // the rift's violet light on the wall and the floor
  back += `<g opacity="0"><ellipse cx="${46 * Q}" cy="${31 * Q}" rx="90" ry="20" fill="url(#yeSpill)"/>${yeFade([[riftOpen[0], 0], [riftOpen[1], 1], [riftClose[0], 1], [riftClose[1], 0]])}</g>`

  // ---- the alternate timeline: dark, cold, a steady red battle light
  let grim = yeR(-3, -3, GW + 6, GH + 6, '#05060c', ' opacity="0.42"')
  grim += yeR(0, 1, GW, 1, '#ff3a2a', ' opacity="0.5"')
  grim += yeR(0, 32, GW, 1, '#c0302a', ' opacity="0.32"')
  grim += yeR(88, 3, 2, 24, '#ff2e3a', ' opacity="0.35"')
  // the LCARS panel shows a tactical plot instead
  const tac = new Pix()
  tac.rect(10, 6, 13, 15, '#140608')
  tac.rect(10, 6, 13, 1, '#b8322a').rect(10, 7, 1, 14, '#b8322a').rect(10, 20, 13, 1, '#7a2420')
  for (let y = 9; y < 20; y += 3) tac.rect(12, y, 10, 1, '#3a1012')
  for (let x = 13; x < 22; x += 3) tac.rect(x, 8, 1, 12, '#3a1012')
  tac.set(14, 11, '#ff6a4a').set(19, 13, '#ff6a4a').set(16, 16, '#ffb070').set(20, 17, '#ff6a4a')
  grim += `<g opacity="0.75">${tac.svg()}</g>`
  // a faint haze hanging in the air
  grim += yeR(0, 22, GW, 7, '#3a3346', ' opacity="0.14"')
  back += `<g opacity="0">${grim}${yeFade([[grimIn[0], 0], [grimIn[1], 1], [grimOut[0], 1], [grimOut[1], 0]])}</g>`
  s += `<g mask="url(#yeFade)">${back}</g>`

  // ---- the viewscreen
  const bez = new Pix()
  bez.rect(27, 0, 61, 27, '#0e0b12').rect(28, 0, 59, 1, '#4a4152').rect(27, 1, 1, 25, '#2a2330').rect(87, 1, 1, 25, '#2a2330')
  bez.rect(28, 26, 59, 1, '#3a3142')
  s += bez.svg()

  let scr = `<rect x="${YE_SX * Q}" y="${YE_SY * Q}" width="${YE_SW * Q}" height="${YE_SH * Q}" fill="url(#yeSpace)"/>`
  scr += `<ellipse cx="${70 * Q}" cy="${8 * Q}" rx="60" ry="20" fill="url(#yeNeb)"/>`
  const rnd = yeRnd(41)
  for (let y = YE_SY; y < YE_SY + YE_SH; y += 2) {
    for (let x = YE_SX; x < YE_SX + YE_SW; x += 3) {
      if (rnd() < 0.72) continue
      const jx = x + Math.floor(rnd() * 3)
      scr += yeR(jx, y, 1, 1, '#cdbaf0', ` opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"`)
    }
  }
  ;[[33, 5], [80, 20], [62, 4], [36, 22], [83, 6]].forEach(([x, y], i) => {
    const glow = new Pix().set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    scr += `<g>${glow.svg()}${yeAmb('0.15;0.7;0.15', 6 - (i % 3), i * 0.6)}</g>`
    scr += `<g>${new Pix().set(x, y, '#f4eeff').svg()}${yeAmb('0.6;1;0.6', 6 - (i % 3), i * 0.6)}</g>`
  })

  // the rift: opens out of nothing, swirls, closes calmly
  const rx = 45 * Q
  const ry = 14 * Q
  const riftScale = yeAnim('transform', [[riftOpen[0], '0.05'], [riftOpen[1], '1'], [riftClose[0], '1'], [riftClose[1], '0.05']], 'animateTransform', 'type="scale" ')
  scr += `<g transform="translate(${rx} ${ry})"><g>${riftScale}<g opacity="0">${yeFade([[riftOpen[0], 0], [riftOpen[0] + 1.8, 1], [riftClose[0] + 0.4, 1], [riftClose[1], 0]])}<g transform="scale(1 0.82)">${yeRift()}</g></g></g></g>`

  // the Enterprise-C: out of the rift, holds, turns about, and back in
  const hold = `${66 * Q} ${13 * Q}`
  const shipMove = yeAnim('transform', [[shipOut[0], `${rx} ${ry}`], [shipOut[1], hold], [turn[0], hold], [turn[1], `${65 * Q} ${13 * Q}`], [goBack[1], `${rx} ${ry}`]], 'animateTransform', 'type="translate" ')
  const shipScale = yeAnim('transform', [[shipOut[0], '0.15'], [shipOut[1], '1'], [goBack[0], '1'], [goBack[1], '0.15']], 'animateTransform', 'type="scale" ')
  // turning about: the hull narrows to edge-on and opens out facing the other way
  const shipFlip = yeAnim('transform', [[turn[0], '1 1'], [turn[1], '-1 1'], [14.6, '-1 1'], [15.0, '1 1']], 'animateTransform', 'type="scale" ')
  // mid-turn she shows her bow: the side view hands over to a bow-on sprite and back
  const tm = (turn[0] + turn[1]) / 2
  const sideFade = yeFade([[tm - 0.38, 1], [tm - 0.12, 0], [tm + 0.12, 0], [tm + 0.38, 1]])
  const frontFade = yeFade([[tm - 0.4, 0], [tm - 0.14, 1], [tm + 0.14, 1], [tm + 0.4, 0]])
  // a slow drift up and down while she holds station
  const bob = yeAnim('transform', [[shipOut[1], '0 0'], [8.6, '0 -1'], [10.0, '0 1'], [turn[0], '0 0']], 'animateTransform', 'type="translate" ')
  scr += `<g opacity="0">${yeFade([[shipOut[0], 0], [shipOut[0] + 0.9, 1], [goBack[1] - 0.8, 1], [goBack[1], 0]])}<g>${shipMove}<g>${bob}<g>${shipScale}<g>${sideFade}<g>${shipFlip}<g transform="translate(${-15 * Q} ${-4.5 * Q})">${yeShipC()}</g></g></g><g opacity="0">${frontFade}${yeShipFront()}</g></g></g></g></g>`

  scr += `<rect x="${YE_SX * Q}" y="${YE_SY * Q}" width="${YE_SW * Q}" height="${YE_SH * Q}" fill="url(#yeScan)"/>`
  scr += `<polygon points="${30 * Q},${2 * Q} ${36 * Q},${2 * Q} ${30 * Q},${8 * Q}" fill="#ffffff" opacity="0.05"/>`
  s += `<g clip-path="url(#yeScreen)">${scr}</g>`

  // ---- Tasha Yar at tactical: only there while history is wrong
  const tx = 8
  const ty = 25
  const hair = '#d9c07a'
  const hairHi = '#f2e2a8'
  const hairSh = '#ad8f45'
  const tashaDetails = (p: Pix) => {
    // short, cropped blonde hair: a low cap with a ragged fringe
    p.rect(tx + 3, ty - 2, 12, 1, hair).rect(tx + 1, ty - 1, 16, 1, hair).rect(tx, ty, 18, 1, hair)
    ;[5, 9, 12].forEach(c => p.set(tx + c, ty - 2, hairHi))
    p.set(tx + 3, ty - 1, hairHi).set(tx + 7, ty - 1, hairHi).set(tx + 14, ty - 1, hairHi)
    ;[2, 5, 8, 11, 14].forEach(c => p.set(tx + c, ty, hairSh))
    p.rect(tx, ty + 1, 2, 1, hair).set(tx + 3, ty + 1, hair).set(tx + 15, ty + 1, hair).rect(tx + 16, ty + 1, 2, 1, hair)
    p.set(tx, ty + 2, hairSh).set(tx + 17, ty + 2, hairSh)
    // security gold, combadge, two pips
    p.rect(tx, ty + 7, 18, 1, YE_TASHA.lower!).set(tx, ty + 7, YE_TASHA.lowerShade!)
    p.rect(tx + 12, ty + 7, 2, 2, '#e8c547').set(tx + 12, ty + 7, '#fff3b0')
    p.set(tx + 2, ty + 6, '#e8c547').set(tx + 4, ty + 6, '#e8c547')
  }
  let tasha = crabHD(YE_TASHA, tx, ty, 'right', T, { left: [], right: [] }, [], T / 4, tashaDetails)
  // her nod: eyes dip down one pixel and come back
  const nodEyes = new Pix()
  for (let c = 6; c <= 13; c++) nodEyes.rect(tx + c, ty + 2, 1, 4, YE_TASHA.skin)
  nodEyes.rect(tx + 6, ty + 3, 2, 3, EYE_HD).rect(tx + 12, ty + 3, 2, 3, EYE_HD)
  tasha += shown(nodEyes.svg(), [nod], T)
  s += `<g opacity="0">${tasha}${yeFade([[tashaIn[0], 0], [tashaIn[1], 1], [grimOut[0], 1], [grimOut[1] - 0.3, 0]])}</g>`

  // the tactical console in front of her
  const con = new Pix()
  con.rect(4, 35, 29, 1, '#9a8fa6').rect(3, 36, 31, 1, '#0b0910').rect(4, 35, 1, 1, '#5b5266')
  con.rect(5, 36, 4, 1, '#f29a3a').rect(10, 36, 3, 1, '#8aa7e8').rect(14, 36, 5, 1, '#c39be0').rect(20, 36, 3, 1, '#f7c487').rect(28, 36, 2, 1, '#c0201c')
  // kept short (ends at row 40) so the floor under the title stays plain
  con.rect(3, 37, 31, 4, '#4a3020').rect(3, 37, 31, 1, '#7a5236').rect(3, 40, 31, 1, '#2e1e14')
  for (const x of [10, 18, 26]) con.rect(x, 38, 1, 2, '#33221a')
  s += `<g mask="url(#yeFadeC)">${con.svg()}</g>`

  // ---- Picard before the screen
  const px = 56
  const py = 28
  const fringe = '#9b928c'
  const picardDetails = (p: Pix) => {
    p.rect(px, py + 2, 1, 3, fringe).rect(px + 1, py + 3, 1, 2, fringe).rect(px + 17, py + 2, 1, 3, fringe).rect(px + 16, py + 3, 1, 2, fringe)
    p.set(px, py + 2, '#bdb5ae').set(px + 17, py + 2, '#bdb5ae')
    p.rect(px + 12, py + 7, 2, 2, '#e8c547').set(px + 12, py + 7, '#fff3b0')
    for (const c of [1, 3, 5, 7]) p.set(px + c, py + 6, '#e8c547')
  }
  s += crabHD(YE_PICARD, px, py, 'right', T, { left: [], right: [clawRaise] }, [], T / 4, picardDetails)
  // his eyes on Tasha: a glance across with an in-between step each way
  const eyesAt = (e: number[]) => {
    const p = new Pix()
    for (let c = 4; c <= 13; c++) p.rect(px + c, py + 2, 1, 3, YE_PICARD.skin)
    e.forEach(c => p.rect(px + c, py + 2, 2, 3, EYE_HD))
    return p.svg()
  }
  const [g0, g1] = lookAtTasha
  s += shown(eyesAt([5, 11]), [[g0, g0 + 0.09], [g1 - 0.09, g1]], T)
  s += shown(eyesAt([4, 10]), [[g0 + 0.09, g1 - 0.09]], T)

  return s
}

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

// ---------- Blink of an Eye: the planet where time runs fast ----------
// One 17.17 s story, one long night on a fast world. Voyager hangs in orbit over
// a daylit planet. Night sweeps slowly across it, and in that one night a whole
// civilisation grows: camp fires, then towns, then roads and glowing cities. A
// little rocket climbs from the biggest city to the ship; a tiny astronaut Clawd
// floats out, waves at Voyager and drifts in behind the hull to come aboard.
// Dawn sweeps back across, the lights fade into the day, and the planet looks
// exactly as it did at the start. Every light fades in over a second or more.

const beT = SCENE_SECONDS
const beK = (t: number) => +(t / beT).toFixed(4)

// Pix written as one <path> per colour
function bePath(p: Pix) {
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

// opacity along the story, keyed in seconds (starts at 0, ends at beT)
function beFade(keys: [number, number][]) {
  return `<animate attributeName="opacity" dur="${beT}s" repeatCount="indefinite" values="${keys.map(k => k[1]).join(';')}" keyTimes="${keys.map(k => beK(k[0])).join(';')}"/>`
}

// translate in grid units along the story, eased per segment
function beMove(keys: [number, number, number][], splines?: string[]) {
  const t = keys.map(k => beK(k[0])).join(';')
  const v = keys.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`).join(';')
  const sp = (splines || keys.slice(1).map(() => '0.45 0 0.55 1')).join(';')
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="${sp}" dur="${beT}s" repeatCount="indefinite" values="${v}" keyTimes="${t}"/>`
}

// shrink smoothly between a and b (seconds), as something moves away from us
const beScale = (a: number, b: number, to: number) =>
  `<animateTransform attributeName="transform" type="scale" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.55 1;0 0 1 1" dur="${beT}s" repeatCount="indefinite" values="1;1;${to};${to}" keyTimes="0;${beK(a)};${beK(b)};1"/>`

// a light that fades in at a, over f seconds, then stays (dawn hides it via the night mask)
const beLight = (svg: string, a: number, f: number) => `<g opacity="0">${svg}${beFade([[0, 0], [a, 0], [a + f, 1], [beT, 1]])}</g>`

// the planet: a big sphere below, its top limb across the lower half
const BE_PX = 81
const BE_PY = 70
const BE_PR = 37

type BeCell = { x: number; y: number; land: boolean; cloud: boolean; d: number }

function beSurface() {
  const cells: BeCell[] = []
  for (let y = 24; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const dx = x + 0.5 - BE_PX
      const dy = y + 0.5 - BE_PY
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > BE_PR + 1) continue
      const nx = Math.max(-1, Math.min(1, dx / BE_PR))
      const ny = Math.max(-1, Math.min(1, dy / BE_PR))
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const lon = Math.atan2(nx, nz)
      const lat = Math.asin(ny)
      const v = Math.sin(lon * 3.3 + 1.3 * Math.sin(lat * 5.2)) + 0.8 * Math.sin(lat * 4.1 + lon * 1.9 + 1.1) + 0.35 * Math.sin(lon * 8.3 + lat * 6.1)
      const cv = Math.sin(lon * 4.7 + lat * 11 + 2) + 0.6 * Math.sin(lon * 9.1 - lat * 3.3)
      cells.push({ x, y, land: v > 0.45, cloud: cv > 1.25, d })
    }
  }
  return cells
}

function bePlanet(cells: BeCell[], night: boolean) {
  const p = new Pix()
  const L = [-0.45, -0.6, 0.66]
  const day = {
    sea: ['#1f4472', '#285689', '#30659c'],
    land: ['#3b6340', '#4f7a4b', '#66905a'],
    sand: ['#7a7050', '#958760', '#ad9e6c'],
    cloud: ['#7d8ea8', '#9eaec4', '#bcc8d8'],
    rim: '#8fd0ff',
    halo: '#3d64b0',
  }
  const dark = {
    sea: ['#0c1228', '#0f162f', '#121a36'],
    land: ['#141829', '#171c2f', '#1b2135'],
    sand: ['#181b2a', '#1c1f30', '#202435'],
    cloud: ['#1c2139', '#21273f', '#272e48'],
    rim: '#2c3a72',
    halo: '#191c3c',
  }
  const pal = night ? dark : day
  for (const c of cells) {
    if (c.d > BE_PR) {
      p.set(c.x, c.y, pal.halo)
      continue
    }
    if (c.d > BE_PR - 1) {
      p.set(c.x, c.y, pal.rim)
      continue
    }
    const nx = (c.x + 0.5 - BE_PX) / BE_PR
    const ny = (c.y + 0.5 - BE_PY) / BE_PR
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const b = 0.5 + 0.5 * (nx * L[0] + ny * L[1] + nz * L[2])
    const i = b < 0.62 ? 0 : b < 0.8 ? 1 : 2
    const sandy = c.land && Math.sin(c.x * 0.31 + c.y * 0.9) > 0.55
    const set = c.cloud ? pal.cloud : sandy ? pal.sand : c.land ? pal.land : pal.sea
    p.set(c.x, c.y, set[c.d > BE_PR - 3 ? Math.max(0, i - 1) : i])
  }
  return bePath(p)
}

// Voyager in a three-quarter side view, bow to the right: a sleek arrowhead saucer
// flowing back into a narrow secondary hull, the deflector glowing under the saucer,
// and slim nacelles aft on short pylons that rise from low on the hull.
function beShip(x0: number, cy: number) {
  const p = new Pix()
  const X = (u: number) => x0 + u
  const nacelle = (u0: number, y: number, far: boolean) => {
    const top = far ? '#a49eb8' : '#eeebf4'
    const mid = far ? '#7d7794' : '#bdb7cb'
    const bot = far ? '#4a4462' : '#6e6888'
    p.rect(X(u0 + 2), y, 14, 1, top).set(X(u0 + 1), y, mid)
    p.rect(X(u0), y + 1, 17, 1, far ? '#3a86bc' : '#4fb8f0').rect(X(u0 + 3), y + 1, 11, 1, far ? '#6cb4dc' : '#b4ecff')
    p.rect(X(u0 + 1), y + 2, 15, 1, bot)
    p.set(X(u0 + 17), y + 1, far ? '#c04a34' : '#ff6a4a').set(X(u0 + 16), y, far ? '#8a3a2a' : '#c8503a').set(X(u0 + 16), y + 2, '#7a2e22')
    p.set(X(u0 + 17), y, mid).set(X(u0 + 17), y + 2, bot)
  }
  const pylon = (pts: [number, number][], c1: string, c2: string) => pts.forEach(([u, y]) => p.set(X(u), y, c1).set(X(u + 1), y, c2))
  // the far nacelle and its pylon, behind everything
  nacelle(-1, cy - 4, true)
  pylon([[8, cy - 1], [9, cy], [10, cy + 1], [11, cy + 2]], '#6e6888', '#5a5470')
  // secondary hull: narrow, flowing aft from under the saucer, shuttlebay at the stern
  for (let u = 3; u <= 33; u++) {
    const top = u < 17 ? cy + 2 - Math.round(Math.min(2, (u - 3) * 0.18)) : cy + 1
    const bot = u < 10 ? cy + 3 + Math.round((u - 3) * 0.6) : u <= 26 ? cy + 7 : cy + 7 - Math.round((u - 26) * 0.8)
    for (let y = top; y <= bot; y++) {
      let c = y === top ? '#e6e2ee' : y <= top + 1 ? '#c8c2d6' : '#9c96b0'
      if (y === bot) c = '#5a5470'
      if (y === bot - 1 && bot - top > 2) c = '#7a7490'
      p.set(X(u), y, c)
    }
  }
  p.rect(X(3), cy + 2, 1, 2, '#2a2440').set(X(4), cy + 3, '#7fd4ff') // shuttlebay
  for (let u = 7; u <= 25; u += 3) p.set(X(u), cy + 5, '#ffe9a0')
  // navigational deflector, under the saucer's leading part
  p.set(X(29), cy + 4, '#2f6f9f').set(X(30), cy + 4, '#6fd8ff').set(X(31), cy + 4, '#2f6f9f')
  p.set(X(29), cy + 5, '#6fd8ff').set(X(30), cy + 5, '#e2f8ff').set(X(31), cy + 5, '#6fd8ff').set(X(30), cy + 6, '#2f6f9f')
  // the saucer: top surface seen from a little above, plus its thin rim
  for (let u = 15; u <= 47; u++) {
    const t = (u - 15) / 32
    const h = 5.2 * Math.sin(Math.PI * Math.pow(t, 0.58))
    const hi = Math.round(h)
    if (h < 0.35) {
      p.set(X(u), cy, '#dcd7e6').set(X(u), cy + 1, '#8a839e')
      continue
    }
    for (let y = cy - hi; y <= cy + Math.round(h * 0.45); y++) {
      const c = y === cy - hi ? '#ffffff' : y < cy - hi * 0.3 ? '#f0edf6' : y <= cy ? '#dcd7e6' : '#c4bed2'
      p.set(X(u), y, c)
    }
    const rim = cy + Math.round(h * 0.45) + 1
    p.set(X(u), rim, u % 2 && u > 19 && u < 43 ? '#ffe9a0' : '#8a839e')
    if (h > 1.6) p.set(X(u), rim + 1, '#5a5470')
  }
  // bridge dome toward the rear, plating line, impulse engines, red pinstripe at the bow
  p.rect(X(24), cy - 2, 3, 1, '#ffffff').rect(X(23), cy - 1, 5, 1, '#e2deec').rect(X(24), cy - 3, 3, 1, '#c8c2d6').set(X(25), cy - 3, '#ffffff')
  for (let u = 28; u <= 40; u += 4) p.set(X(u), cy - 3, '#d2cce0').set(X(u - 2), cy + 1, '#b0aac0')
  p.rect(X(29), cy - 1, 12, 1, '#e8e5f0')
  p.set(X(16), cy, '#ff8a5a').set(X(16), cy + 1, '#ff8a5a').set(X(15), cy + 1, '#c8583a')
  p.rect(X(37), cy + 2, 6, 1, '#b0503e')
  // the near pylon rises from low on the hull to the near nacelle
  pylon([[12, cy + 6], [11, cy + 5], [10, cy + 4]], '#bdb7cb', '#8a839e')
  nacelle(-4, cy + 1, false)
  return bePath(p)
}

// the tiny astronaut: Clawd in a glass helmet and a white suit
const BE_ASTRO = [
  '....gggggg.....',
  '..ggw.....gg...',
  '.gw..LLLLLL.g..',
  '.g.oooooooo.g..',
  'g..ooEoooEo..g.',
  'g..ooEoooEo..g.',
  'g..oooooooo..g.',
  '.gssSSSSSSssg..',
  '.oSSSSSSSSSSo..',
  '..sSSSSSSSSs...',
  '..U.U....U.U...',
]
const BE_ASTRO_PAL: Record<string, string> = {
  g: '#8fd0f0', w: '#eef9ff', L: '#eb9575', o: '#d97757', E: '#1a1020',
  S: '#ece8f4', s: '#b4aec6', U: '#7e7894',
}

function blinkOfAnEye() {
  const W = GW * Q
  const H = GH * Q
  let seed = 1995
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // ---- the story, in seconds ----
  const NIGHT0 = 2.0 // night starts to sweep in from the right
  const NIGHT1 = 5.4 // the whole visible planet is dark
  const TOWNS = 5.6 // towns grow around the fires
  const CITIES = 7.6 // cities and roads
  const LAUNCH = 10.0 // the rocket lights up on its pad
  const ARRIVE = 12.3 // and hovers beside Voyager
  const WAVE = 13.4 // Clawd waves
  const ABOARD = 14.5 // Clawd drifts up under the saucer
  const DAWN0 = 13.6 // dawn sweeps back from the right
  const DAWN1 = 16.6 // the planet is all daylight again

  // night terminator: left edge of an 80-wide soft band, in grid units
  const NL0 = 92
  const NL1 = 40
  const NL2 = -30
  const nightAt = (x: number) => NIGHT0 + ((NL0 + 10 - x) / (NL0 - NL1)) * (NIGHT1 - NIGHT0)

  let s = `<defs>
    <linearGradient id="beSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0918"/><stop offset="1" stop-color="#1a1633"/></linearGradient>
    <linearGradient id="beFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="beFade"><rect width="${W}" height="${H}" fill="url(#beFadeG)"/></mask>
    <linearGradient id="beTermG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="0.125" stop-color="#fff"/><stop offset="0.875" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="beNight" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="0" width="${80 * Q}" height="${H}" fill="url(#beTermG)"><animateTransform attributeName="transform" type="translate" dur="${beT}s" repeatCount="indefinite" values="${NL0 * Q} 0;${NL0 * Q} 0;${NL1 * Q} 0;${NL1 * Q} 0;${NL2 * Q} 0;${NL2 * Q} 0" keyTimes="0;${beK(NIGHT0)};${beK(NIGHT1)};${beK(DAWN0)};${beK(DAWN1)};1"/></rect></mask>
    <radialGradient id="beNeb"><stop offset="0" stop-color="#7b5bc6" stop-opacity="0.22"/><stop offset="1" stop-color="#7b5bc6" stop-opacity="0"/></radialGradient>
    <radialGradient id="beCityG"><stop offset="0" stop-color="#ffc870" stop-opacity="0.5"/><stop offset="0.6" stop-color="#ff9a4a" stop-opacity="0.14"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <radialGradient id="beNacG"><stop offset="0" stop-color="#6fd0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#6fd0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="bePadG"><stop offset="0" stop-color="#ffd28a" stop-opacity="0.6"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <radialGradient id="beGlassG"><stop offset="0" stop-color="#bfe6ff" stop-opacity="0.05"/><stop offset="1" stop-color="#bfe6ff" stop-opacity="0.22"/></radialGradient>
  </defs>`

  // ---- space: sky, a violet haze, stars, a small moon ----
  let back = `<rect width="${W}" height="${H}" fill="url(#beSky)"/>`
  back += `<ellipse cx="${30 * Q}" cy="${12 * Q}" rx="70" ry="24" fill="url(#beNeb)"/>`
  const dots = [new Pix(), new Pix(), new Pix()]
  for (let y = 1; y < 40; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.55) continue
      dots[Math.floor(rnd() * 3)].set(x + Math.floor(rnd() * 2), y, '#cdbaf0')
    }
  }
  dots.forEach((d, i) => (back += `<g opacity="${(0.14 + i * 0.13).toFixed(2)}">${bePath(d)}</g>`))
  ;[[24, 4], [72, 22], [86, 3], [40, 24], [12, 14]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${bePath(glow)}<animate attributeName="opacity" values="0.15;0.75;0.15" dur="${(beT / [6, 5, 4, 7, 5][i]).toFixed(4)}s" begin="${(-i * 0.53).toFixed(2)}s" repeatCount="indefinite"/></g>`
    back += bePath(new Pix().set(x, y, '#ffffff'))
  })
  const moon = new Pix()
  const mx = 24
  const my = 31
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const d = x * x + y * y
      if (d > 11) continue
      let c = '#9a8fb4'
      if (x + y < -1) c = '#c9bede'
      if (x + y > 2) c = '#6a6084'
      moon.set(mx + x, my + y, c)
    }
  }
  moon.set(mx + 1, my - 1, '#8a7fa4').set(mx - 1, my + 1, '#8a7fa4')
  back += bePath(moon)

  // ---- the planet: daylit underneath, the night side laid over it through the moving terminator ----
  const cells = beSurface()
  back += bePlanet(cells, false)
  back += `<g mask="url(#beNight)">${bePlanet(cells, true)}</g>`
  s += `<g mask="url(#beFade)">${back}</g>`

  // ---- the lights of one fast night ----
  const spots = cells.filter(c => c.land && !c.cloud && c.d < BE_PR - 2.5 && c.y >= 30 && c.x >= 54 && c.x <= 88)
  const pick = () => spots[Math.floor(rnd() * spots.length)]
  const onLand = new Set(spots.map(c => `${c.x},${c.y}`))
  let lights = ''

  // the main cities: where the rocket will launch, and two more
  const cities: [number, number][] = [[76, 38], [84, 42], [65, 44]]
  // camp fires, one by one as the dark reaches them
  const fires: [number, number][] = [[76, 39], [84, 43], [65, 45], [80, 37], [88, 45], [71, 41], [60, 46], [79, 45]]
  for (let i = 0; i < 4; i++) {
    const c = pick()
    fires.push([c.x, c.y])
  }
  fires.forEach(([x, y]) => {
    const a = Math.max(nightAt(x) + 0.3, NIGHT0 + 0.8) + rnd() * 0.6
    lights += beLight(bePath(new Pix().set(x, y, '#ff8a3d')), a, 1.2)
  })

  // towns: small amber clusters growing around the fires
  const near = (x: number, y: number, n: number, col: string[]) => {
    const p = new Pix()
    for (let k = 0; k < n; k++) {
      const px = x + Math.round((rnd() - 0.5) * 4)
      const py = y + Math.round((rnd() - 0.5) * 2)
      if (onLand.has(`${px},${py}`) || (Math.abs(px - x) < 2 && Math.abs(py - y) < 2)) p.set(px, py, col[Math.floor(rnd() * col.length)])
    }
    return p
  }
  fires.forEach(([x, y], i) => {
    const a = TOWNS + (i / fires.length) * 1.8 + rnd() * 0.3
    lights += beLight(bePath(near(x, y, 4, ['#f2b866', '#e89a4a'])), a, 1.0)
  })

  // roads between the cities and the towns, laid one after another
  const road = (a: [number, number], b: [number, number]) => {
    const p = new Pix()
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    for (let k = 1; k < n; k++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * k) / n)
      const y = Math.round(a[1] + ((b[1] - a[1]) * k) / n)
      if (k % 2 === 0 || n < 6) p.set(x, y, '#b9813e')
    }
    return bePath(p)
  }
  const roads: [[number, number], [number, number]][] = [
    [cities[0], cities[1]], [cities[0], cities[2]], [cities[1], [88, 45]], [cities[0], [80, 37]], [cities[2], [60, 46]], [cities[1], [79, 45]], [cities[0], [71, 41]],
  ]
  roads.forEach(([a, b], i) => (lights += beLight(road(a, b), CITIES + 0.2 + i * 0.28, 1.2)))

  // cities: warm-white cores with amber edges, and a soft glow over each
  cities.forEach(([x, y], i) => {
    const r = i === 0 ? 3 : 2.4
    const p = new Pix()
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.sqrt((dx * dx) / 2.2 + dy * dy * 1.2) + (rnd() - 0.5) * 0.9
        if (d > r) continue
        const c = d < r * 0.35 ? '#fff4d6' : d < r * 0.7 ? '#ffd98a' : rnd() < 0.55 ? '#f2a84a' : ''
        if (c) p.set(x + dx, y + dy, c)
      }
    }
    const a = CITIES + 0.4 + i * 0.6
    lights += `<g opacity="0"><ellipse cx="${(x + 0.5) * Q}" cy="${(y + 0.5) * Q}" rx="${(r + 7) * Q}" ry="${(r + 3) * Q}" fill="url(#beCityG)"/>${beFade([[0, 0], [a + 0.6, 0], [a + 2.4, 1], [beT, 1]])}</g>`
    lights += beLight(bePath(p), a, 1.4)
  })
  // the suburbs fill in between
  for (let i = 0; i < 8; i++) {
    const c = pick()
    lights += beLight(bePath(new Pix().set(c.x, c.y, i % 2 ? '#ffd98a' : '#f2b866')), CITIES + 1.2 + i * 0.15, 1.0)
  }
  s += `<g mask="url(#beNight)">${lights}</g>`

  // ---- the launch: a soft glow on the pad, then a rocket climbing to the ship ----
  const [lx, ly] = cities[0]
  s += `<ellipse cx="${(lx + 0.5) * Q}" cy="${(ly - 0.5) * Q}" rx="${5 * Q}" ry="${3 * Q}" fill="url(#bePadG)" opacity="0">${beFade([[0, 0], [LAUNCH + 0.3, 0], [LAUNCH + 1.0, 1], [LAUNCH + 1.6, 0.8], [LAUNCH + 3.2, 0], [beT, 0]])}</ellipse>`
  // rocket base point over time (grid)
  const RISE = LAUNCH + 0.6
  const rocketPath: [number, number, number][] = [
    [0, lx, ly - 1], [RISE, lx, ly - 1], [RISE + 0.7, lx - 1, ly - 5], [RISE + 1.3, lx - 3, ly - 8.5], [ARRIVE, lx - 4, ly - 9],
    [WAVE, lx - 4, ly - 9], [WAVE + 1.0, lx - 20, ly - 21], [beT, lx - 20, ly - 21],
  ]
  // smoke puffs left along the climb
  for (let i = 0; i < 7; i++) {
    const t0 = RISE + 0.05 + i * 0.22
    const f = Math.min(1, (t0 - RISE) / 1.5)
    const px = lx - f * f * 3.4 + (rnd() - 0.5)
    const py = ly - 1 + 1 - f * 7.4
    const sz = i < 2 ? 2 : 1
    s += `<rect x="${(px - sz / 2 + 0.5) * Q}" y="${py * Q}" width="${sz * Q}" height="${Q}" fill="#a9a2bd" opacity="0"><animateTransform attributeName="transform" type="translate" dur="${beT}s" repeatCount="indefinite" values="0 0;0 0;${(rnd() - 0.5) * 4} 3;${(rnd() - 0.5) * 4} 3" keyTimes="0;${beK(t0)};${beK(t0 + 2.6)};1"/>${beFade([[0, 0], [t0, 0], [t0 + 0.3, 0.55], [t0 + 2.6, 0], [beT, 0]])}</rect>`
  }
  const rocket = new Pix().rows(
    ['..R..', '.wWw.', '.wcw.', '.www.', '.RRR.', '.www.', 'swwws', 's.g.s'],
    -2, -8,
    { R: '#d0503a', w: '#d8d4e4', W: '#f4f2fa', c: '#7fd4ff', s: '#8a849e', g: '#4e4862' },
  )
  const flame = new Pix().set(0, 0, '#ffe39a').set(0, 1, '#ff9a4a').set(-1, 1, '#d8602e').set(1, 1, '#d8602e')
  const flameG = `<g opacity="0">${bePath(flame)}${beFade([[0, 0], [RISE - 0.3, 0], [RISE, 1], [RISE + 1.4, 1], [ARRIVE + 0.1, 0], [beT, 0]])}</g>`

  // ---- Clawd the astronaut: steps out from behind the rocket, waves, drifts in behind the hull ----
  const astro = new Pix().rows(BE_ASTRO, 0, 0, BE_ASTRO_PAL)
  const armDown = bePath(new Pix().set(12, 8, '#d97757'))
  const armUp = new Pix()
  armUp.set(12, 8, '#ece8f4').set(13, 7, '#ece8f4').set(13, 6, '#ece8f4').set(13, 5, '#d97757')
  armUp.set(12, 3, '#d97757').set(14, 3, '#d97757').rect(12, 4, 3, 1, '#d97757').set(12, 3, '#eb9575').set(14, 3, '#eb9575')
  const lids = bePath(new Pix().rect(5, 4, 1, 2, '#d97757').rect(9, 4, 1, 2, '#d97757'))
  let clawd = `<ellipse cx="${7 * Q}" cy="${4 * Q}" rx="${6.5 * Q}" ry="${4.6 * Q}" fill="url(#beGlassG)"/>`
  clawd += bePath(astro)
  // the wave goes rest -> out -> half -> up and back, ~90 ms per in-between
  const armMid1 = bePath(new Pix().set(12, 8, '#ece8f4').set(13, 8, '#d97757').set(13, 7, '#d97757').set(14, 7, '#eb9575'))
  const armMid2 = bePath(new Pix().set(12, 8, '#ece8f4').set(13, 7, '#ece8f4').set(13, 6, '#d97757').rect(12, 5, 3, 1, '#d97757').set(12, 4, '#eb9575').set(14, 4, '#eb9575'))
  const st = 0.09
  const W1 = WAVE + 1.1
  clawd += shown(armDown, [[0, WAVE], [W1 + 2 * st, beT]], beT)
  clawd += shown(armMid1, [[WAVE, WAVE + st], [W1 + st, W1 + 2 * st]], beT)
  clawd += shown(armMid2, [[WAVE + st, WAVE + 2 * st], [W1, W1 + st]], beT)
  clawd += shown(bePath(armUp), [[WAVE + 2 * st, W1]], beT)
  clawd += shown(lids, [[ARRIVE + 1.6, ARRIVE + 1.75]], beT)
  const cStart: [number, number] = [lx - 13, ly - 19]
  const cHover: [number, number] = [lx - 22, ly - 18]
  const cAboard: [number, number] = [lx - 33, ly - 31.5]
  const clawdG =
    `<g opacity="0">${beFade([[0, 0], [ARRIVE, 0], [ARRIVE + 0.7, 1], [ABOARD + 1.15, 1], [ABOARD + 1.45, 0], [beT, 0]])}` +
    `<g>${beMove([[0, ...cStart], [ARRIVE, ...cStart], [ARRIVE + 1.0, ...cHover], [ABOARD, ...cHover], [ABOARD + 1.1, ...cAboard], [beT, ...cAboard]])}` +
    `<g transform="translate(${7 * Q} ${5.5 * Q})"><g>${beScale(ABOARD, ABOARD + 1.1, 0.4)}<g transform="translate(${-7 * Q} ${-5.5 * Q})"><g>${clawd}<animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" values="0 0;0 ${Q};0 0" keyTimes="0;0.5;1" dur="${(beT / 7).toFixed(4)}s" repeatCount="indefinite"/></g></g></g></g></g></g>`
  const rocketG =
    `<g opacity="0">${beFade([[0, 0], [LAUNCH, 0], [LAUNCH + 0.6, 1], [WAVE + 1.05, 1], [WAVE + 1.35, 0], [beT, 0]])}` +
    `<g>${beMove(rocketPath, ['0 0 1 1', '0.5 0 0.9 0.6', '0.1 0.3 0.9 0.7', '0.1 0.3 0.3 1', '0 0 1 1', '0.45 0 0.55 1', '0 0 1 1'])}<g transform="translate(0 ${-4 * Q})"><g>${beScale(WAVE, WAVE + 1.0, 0.45)}<g transform="translate(0 ${4 * Q})">${bePath(rocket)}${flameG}</g></g></g></g></g>`
  s += clawdG + rocketG

  // ---- Voyager in orbit: drawn last, so the visitors slip in behind its hull ----
  const vx = 30
  const vcy = 9
  const halo = `<ellipse cx="${(vx + 8) * Q}" cy="${(vcy + 1.5) * Q}" rx="22" ry="5" fill="url(#beNacG)"/><ellipse cx="${(vx + 10) * Q}" cy="${(vcy - 2.5) * Q}" rx="20" ry="4" fill="url(#beNacG)"/>`
  let ship = `<g>${halo}<animate attributeName="opacity" values="0.7;1;0.7" dur="${(beT / 4).toFixed(4)}s" repeatCount="indefinite"/></g>`
  ship += beShip(vx, vcy)
  ship += `<g>${bePath(new Pix().set(vx + 33, vcy - 5, '#ff5a5a'))}<animate attributeName="opacity" values="0.35;1;0.35" dur="${(beT / 6).toFixed(4)}s" repeatCount="indefinite"/></g>`
  ship += `<g>${bePath(new Pix().set(vx + 36, vcy + 3, '#5aff8a'))}<animate attributeName="opacity" values="0.35;1;0.35" dur="${(beT / 6).toFixed(4)}s" begin="${(-beT / 12).toFixed(3)}s" repeatCount="indefinite"/></g>`
  s += `<g mask="url(#beFade)">${ship}</g>`
  return s
}

// ---------- Year of Hell: Janeway rams the Krenim timeship ----------
// One 17.17 s story on the bridge viewscreen. Calm: a pristine Voyager glides.
// The Krenim timeship slides in, its segmented drum turning; a slow amber
// temporal wave sweeps the screen and history changes: Voyager is battered and
// smoking, the bridge scorched, a console sparking (small local sparks only).
// Janeway raises her claw and Voyager moves slowly into the timeship: a small
// local glow. A pale wave runs back the other way: the timeship dissolves,
// Voyager drifts back, every scar fades, and the pristine ship glides on calmly.

const yhJaneway: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#b3262e', // command red shoulders
  lower: '#16121c', // black Voyager jacket
  lowerShade: '#0c0a10',
  legs: '#16121c',
  rim: '#f6a77c',
}

const yhK = (t: number) => +(t / SCENE_SECONDS).toFixed(4)

// an ambient loop period that divides the story exactly, so the hard restart is seamless
const yhPer = (d: number) => +(SCENE_SECONDS / Math.max(1, Math.round(SCENE_SECONDS / d))).toFixed(5)

// Pix written as one <path> per colour
function yhPath(p: Pix) {
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

// opacity along the story: [time, value] points (padded to 0 and SCENE_SECONDS)
function yhRamp(pts: [number, number][]) {
  const T = SCENE_SECONDS
  const all: [number, number][] = [...(pts[0][0] > 0 ? [[0, pts[0][1]] as [number, number]] : []), ...pts]
  if (all[all.length - 1][0] < T) all.push([T, all[all.length - 1][1]])
  return `<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => yhK(p[0])).join(';')}"/>`
}

// translate along the story in art pixels: [time, dx, dy], with an optional spline per segment
function yhMove(keys: [number, number, number][], splines?: string[]) {
  const t = keys.map(k => yhK(k[0])).join(';')
  const v = keys.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`).join(';')
  const mode = splines ? ` calcMode="spline" keySplines="${splines.join(';')}"` : ''
  return `<animateTransform attributeName="transform" type="translate"${mode} dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${v}" keyTimes="${t}"/>`
}

const yhR = (x: number, y: number, w: number, h: number, c: string, extra = '') =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"${extra}/>`

function yhArmHalf(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  const ax = x + 19
  p.rect(x + 18, y + 4, 3, 2, k.skin)
  p.rect(ax, y, 2, 4, k.skin)
  p.rect(ax + 1, y, 1, 4, k.shade)
  const cx = x + 18
  p.rect(cx, y - 4, 1, 3, k.skin).rect(cx + 3, y - 4, 1, 3, k.skin)
  p.rect(cx, y - 2, 4, 1, k.skin).rect(cx + 1, y - 1, 2, 1, k.skin)
  p.set(cx, y - 4, k.light).set(cx + 3, y - 4, k.light)
  return yhPath(p)
}

// a small spark source: a local glow that rises over 0.4 s and fades over 0.9 s, three sparks flying off
function yhSpark(x: number, y: number, period: number, begin: number) {
  period = yhPer(period)
  begin = -begin
  const px = (x + 0.5) * Q
  const py = (y + 0.5) * Q
  const a = (0.4 / period).toFixed(3)
  const b = (1.3 / period).toFixed(3)
  let s = `<circle cx="${px}" cy="${py}" r="6" fill="url(#yhSparkG)" opacity="0"><animate attributeName="opacity" values="0;0.9;0;0" keyTimes="0;${a};${b};1" dur="${period}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
  const paths = ['M0 0 q 3 -6 7 -2', 'M0 0 q -2 -7 -6 -1', 'M0 0 q 1 -5 3 2']
  paths.forEach((d, i) => {
    s += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="${i === 1 ? '#ffe9a0' : '#ffb347'}" opacity="0"><animateMotion path="${d}" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1" calcMode="linear" dur="${period}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.95;0;0" keyTimes="0;${(0.3 / period).toFixed(3)};${a};${b};1" dur="${period}s" begin="${begin}s" repeatCount="indefinite"/></rect>`
  })
  return s
}

function yearOfHell() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q

  // ---- the beat sheet, in seconds ----
  const tShipIn = 2.0 // the timeship slides in from the right...
  const tShipSet = 4.4 // ...and holds
  const tWave = 4.4 // the amber temporal wave sweeps the screen, right to left
  const tWaveEnd = 6.2
  const tScar = 5.2 // Voyager's damage appears as the wave passes her
  const tScarFull = 6.4
  const tBridge = 5.8 // then the bridge: scorch, debris, red alert, sparks
  const tBridgeFull = 7.0
  const tHalf = 8.1 // Janeway's claw comes up: ram it
  const tUp = 8.4
  const tRam = 8.6 // Voyager moves slowly into the timeship
  const tHit = 11.0 // contact: a small local glow
  const tLower = 11.4
  const tDown = 11.7
  const tReset = 11.9 // a pale wave runs back: history resets
  const tGone = 14.0 // timeship erased, damage gone
  const tHome = 14.3 // Voyager is back on her course

  // ---- screen area (art px) ----
  const SX = 18
  const SY = 2
  const SW = 71
  const SH = 24

  let s = `<defs>
    <linearGradient id="yhFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="yhFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#yhFadeG)"/></mask>
    <linearGradient id="yhWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141019"/><stop offset="1" stop-color="#2a2133"/></linearGradient>
    <linearGradient id="yhSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06050d"/><stop offset="1" stop-color="#151026"/></linearGradient>
    <radialGradient id="yhNeb"><stop offset="0" stop-color="#b07ad6" stop-opacity="0.22"/><stop offset="1" stop-color="#b07ad6" stop-opacity="0"/></radialGradient>
    <radialGradient id="yhNebA"><stop offset="0" stop-color="#e0904a" stop-opacity="0.16"/><stop offset="1" stop-color="#e0904a" stop-opacity="0"/></radialGradient>
    <radialGradient id="yhHalo"><stop offset="0" stop-color="#ff9a3d" stop-opacity="0.3"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>
    <radialGradient id="yhHit"><stop offset="0" stop-color="#ffe0a0" stop-opacity="0.75"/><stop offset="0.45" stop-color="#ff9a3d" stop-opacity="0.3"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="yhSparkG"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.7"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
    <radialGradient id="yhBreachG"><stop offset="0" stop-color="#ff9a3d" stop-opacity="0.6"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient>
    <linearGradient id="yhWaveA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb35a" stop-opacity="0"/><stop offset="0.5" stop-color="#ffb35a" stop-opacity="0.22"/><stop offset="1" stop-color="#ffb35a" stop-opacity="0"/></linearGradient>
    <linearGradient id="yhWaveB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfe0ff" stop-opacity="0"/><stop offset="0.5" stop-color="#bfe0ff" stop-opacity="0.2"/><stop offset="1" stop-color="#bfe0ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="yhDrumShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.3" stop-color="#000" stop-opacity="0"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></linearGradient>
    <pattern id="yhScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="2" fill="#000" opacity="0.08"/></pattern>
    <clipPath id="yhScreen"><rect x="${SX * Q}" y="${SY * Q}" width="${SW * Q}" height="${SH * Q}"/></clipPath>
  </defs>`

  let seed = 1997
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // ======== the bridge behind: wall, left LCARS panel, captain's chair (fading in from the band) ========
  let back = `<rect x="-6" y="-6" width="${W + 12}" height="${H + 12}" fill="url(#yhWall)"/>`
  const lc = new Pix()
  lc.rect(4, 5, 11, 16, '#0b0910')
  lc.rect(5, 6, 9, 2, '#c9a7ff').rect(5, 8, 2, 11, '#c9a7ff').set(5, 6, '#0b0910')
  lc.rect(8, 9, 3, 2, '#f29a3a').rect(12, 9, 2, 2, '#8aa7e8').rect(8, 12, 6, 1, '#f7c487')
  lc.rect(8, 14, 2, 2, '#d9584a').rect(11, 14, 3, 2, '#c39be0').rect(5, 19, 9, 1, '#8aa7e8')
  back += `<g opacity="0.6">${yhPath(lc)}</g>`
  // wall panel under the screen, LCARS strip, rail, floor
  const low = new Pix()
  low.rect(0, 27, GW, 4, '#221b2b').rect(0, 27, GW, 1, '#2f2639')
  ;[[20, 6, '#c9a7ff'], [27, 3, '#f29a3a'], [31, 9, '#8aa7e8'], [41, 4, '#c39be0'], [57, 5, '#f7c487'], [63, 8, '#c9a7ff'], [72, 3, '#d9584a'], [76, 10, '#8aa7e8']].forEach(([x, w, c]) =>
    low.rect(x as number, 29, w as number, 1, c as string),
  )
  low.rect(0, 31, GW, 1, '#8a8299').rect(0, 32, GW, 1, '#3a3346')
  for (const x of [22, 46, 70]) low.rect(x, 33, 1, 2, '#3a3346')
  low.rect(0, 33, GW, 15, '#1a1623').rect(0, 34, GW, 1, '#221d2d').rect(0, 39, GW, 1, '#1f1a29').rect(0, 44, GW, 1, '#16121e')
  // captain's chair, half in the band's fade
  low.rect(9, 30, 9, 7, '#3c3346').rect(9, 30, 9, 1, '#5a5068').rect(10, 31, 7, 5, '#4a4056')
  low.rect(7, 36, 13, 2, '#3c3346').rect(7, 36, 13, 1, '#5a5068').rect(12, 38, 3, 3, '#2a2332').rect(10, 41, 7, 1, '#2a2332')
  back += yhPath(low)
  // red alert: low steady strips that appear with the damage and leave with it (never pulsing)
  back += `<g opacity="0">${yhR(0, 0, GW, 1, '#ff2e3a')}${yhR(1, 4, 2, 20, '#ff2e3a')}${yhR(0, 27, GW, 1, '#ff2e3a')}${yhRamp([[tBridge, 0], [tBridgeFull, 0.42], [tReset + 0.3, 0.42], [tGone, 0]])}</g>`
  s += `<g mask="url(#yhFade)">${back}</g>`

  // ======== the viewscreen ========
  const bez = new Pix()
  bez.rect(SX - 1, SY - 1, SW + 2, SH + 2, '#0e0b12').rect(SX, SY - 1, SW, 1, '#4a4152').rect(SX - 1, SY, 1, SH, '#2a2330')
  bez.rect(SX, SY + SH, SW, 1, '#3a3142')
  s += `<g mask="url(#yhFade)">${yhPath(bez)}</g>`

  let scr = yhR(SX, SY, SW, SH, 'url(#yhSpace)')
  scr += `<ellipse cx="${34 * Q}" cy="${8 * Q}" rx="56" ry="20" fill="url(#yhNeb)"/>`
  scr += `<ellipse cx="${72 * Q}" cy="${18 * Q}" rx="60" ry="22" fill="url(#yhNebA)"/>`
  const stars = [new Pix(), new Pix(), new Pix()]
  for (let y = SY + 1; y < SY + SH; y += 2) {
    for (let x = SX + 1; x < SX + SW; x += 3) {
      if (rnd() < 0.72) continue
      stars[Math.floor(rnd() * 3)].set(x + (y % 3), y, '#cdbaf0')
    }
  }
  stars.forEach((d, i) => (scr += `<g opacity="${0.18 + i * 0.14}">${yhPath(d)}</g>`))
  ;[[30, 5], [52, 21], [84, 4], [70, 23]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    scr += `<g>${yhPath(glow)}<animate attributeName="opacity" values="0.15;0.75;0.15" dur="${yhPer(3 + i * 0.7)}s" begin="-${i * 0.6}s" repeatCount="indefinite"/></g>`
    scr += yhPath(new Pix().set(x, y, '#ffffff'))
  })

  // ---- the Krenim timeship: spike, a drum of counter-rotating segments, engine block, fins ----
  const cy = 13
  let ts = `<ellipse cx="${70 * Q}" cy="${(cy + 0.5) * Q}" rx="44" ry="26" fill="url(#yhHalo)"/>`
  const hull = new Pix()
  // forward spike
  for (let x = 45; x <= 57; x++) hull.set(x, cy, x < 48 ? '#c9a070' : '#7a5a3e')
  for (let x = 49; x <= 57; x++) hull.set(x, cy - 1, '#9a7650').set(x, cy + 1, '#4a3424')
  for (let x = 53; x <= 57; x++) hull.set(x, cy - 2, '#86643f').set(x, cy + 2, '#3a2a1c')
  hull.set(44, cy, '#e8c08a').set(51, cy, '#ffb347').set(55, cy, '#ffb347')
  // engine block at the rear
  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = 81; x <= 87; x++) {
      let c = y < cy - 2 ? '#8a6644' : y > cy + 2 ? '#3a2a1c' : '#634631'
      if (x === 81) c = '#2a1c12'
      hull.set(x, y, c)
    }
  }
  hull.set(82, cy - 1, '#ffcf7a').set(84, cy, '#ffcf7a').set(86, cy - 1, '#ffcf7a').set(83, cy + 2, '#d9772e')
  for (let k = 0; k < 6; k++) {
    hull.rect(82 + k, cy - 5 - k, 3, 1, k === 5 ? '#c49060' : '#7a5a3e')
    hull.rect(82 + k, cy + 5 + k, 3, 1, '#45301f')
  }
  hull.rect(88, cy - 2, 1, 5, '#ffb347').set(88, cy, '#ffe9a0')
  ts += yhPath(hull)
  // the drum: six segments, each one a strip of ribs scrolling up or down inside its silhouette
  const segH = [5, 7, 8, 8, 7, 5]
  const bands = [
    ['#c49060', '#a87a50', '#7e5a3a'],
    ['#8a6444', '#74543a', '#58402c'],
    ['#4a3424', '#3e2c1e', '#2e2016'],
  ]
  let clips = ''
  segH.forEach((h, i) => {
    const sx = 57 + i * 4
    const ribs = new Pix()
    for (let y = cy - h - 3; y <= cy + h + 3; y++) {
      const b = bands[((y % 3) + 3) % 3]
      for (let c = 0; c < 4; c++) ribs.set(sx + c, y, b[Math.min(c, 2)])
      if (((y % 3) + 3) % 3 === 0 && (y * 7 + i * 5) % 4 === 0) ribs.set(sx + 1, y, '#ffc070')
    }
    clips += `<clipPath id="yhSeg${i}"><rect x="${sx * Q}" y="${(cy - h) * Q}" width="${4 * Q}" height="${(2 * h + 1) * Q}"/></clipPath>`
    const dir = i % 2 ? 3 : -3
    const spin = `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${dir * Q}" dur="${yhPer(1.6)}s" repeatCount="indefinite"/>`
    ts += `<g clip-path="url(#yhSeg${i})"><g>${yhPath(ribs)}${spin}</g>${yhR(sx, cy - h, 4, 2 * h + 1, 'url(#yhDrumShade)')}</g>`
    // the seam to the next segment glows amber
    if (i < segH.length - 1) {
      const g = Math.min(h, segH[i + 1])
      ts += yhR(sx + 4, cy - g + 1, 0.5, 2 * g - 1, '#ff9a3d', ' opacity="0.8"')
    }
  })
  s = s.replace('</defs>', `${clips}</defs>`)
  // it slides in from the right and holds; when history resets it dissolves, then waits off screen
  scr += `<g opacity="0"><g>${ts}${yhMove(
    [[0, 34, 0], [tShipIn, 34, 0], [tShipSet, 0, 0], [tReset, 0, 0], [tGone, 3, 0], [tGone + 0.2, 34, 0], [T, 34, 0]],
    ['0 0 1 1', '0.2 0.6 0.4 1', '0 0 1 1', '0.4 0 0.6 1', '0 0 1 1', '0 0 1 1'],
  )}</g>${yhRamp([[tShipIn, 0], [tShipIn + 1.4, 1], [tReset, 1], [tGone - 0.3, 0]])}</g>`

  // amber temporal wave, right to left: history changes
  scr += `<g opacity="0"><rect x="0" y="${SY * Q}" width="${16 * Q}" height="${SH * Q}" fill="url(#yhWaveA)">${yhMove([[0, SX + SW, 0], [tWave, SX + SW, 0], [tWaveEnd, SX - 16, 0], [T, SX - 16, 0]])}</rect>${yhRamp([[tWave - 0.1, 0], [tWave, 1], [tWaveEnd, 1], [tWaveEnd + 0.1, 0]])}</g>`

  // ---- Voyager, side on, nose to the right ----
  const vx = 23
  const vy = 10
  const vPal: Record<string, string> = {
    n: '#8d93a0', N: '#5d6370', g: '#5fb6ff', R: '#ff5a4a', p: '#555a66', t: '#c5cad4',
    h: '#d6dbe3', H: '#a3a9b5', d: '#6e7480', w: '#ffe9a8', D: '#7fd0ff', i: '#ff7a5a',
  }
  const voy = new Pix().rows(
    [
      '.nnnnnnnnnR............',
      '.ggggggggNn............',
      '....pp.........tth.....',
      '.....pp....hhhhhhhhhh..',
      '......ihhhhHHHHHHHHHhhh',
      '.....HHHHHHwHHwHHwHHHd.',
      '....dddHHHHHHHHHdddd...',
      '......dddddDDddd.......',
    ],
    vx, vy, vPal,
  )
  let ship = yhPath(voy)
  // nav light at the nose, breathing slowly
  ship += `<g>${yhPath(new Pix().set(vx + 22, vy + 4, '#ffffff'))}<animate attributeName="opacity" values="0.3;1;0.3" dur="${yhPer(2.8)}s" repeatCount="indefinite"/></g>`
  // the year of hell: scorch, a burning breach, a dead nacelle, smoke trailing behind
  const scar = new Pix()
  ;[[12, 4], [13, 4], [12, 5], [13, 5], [7, 6], [8, 6], [9, 6], [10, 5], [17, 3], [18, 3], [16, 6], [17, 6], [10, 3], [11, 3], [20, 4], [21, 4], [8, 7], [9, 7]].forEach(([x, y]) => scar.set(vx + x, vy + y, '#3b3640'))
  ;[[19, 3], [20, 3]].forEach(([x, y]) => scar.set(vx + x, vy + y, '#0b0915'))
  scar.set(vx + 14, vy + 4, '#c0452a').set(vx + 15, vy + 4, '#ff9a3d').set(vx + 15, vy + 5, '#ffd27a').set(vx + 14, vy + 5, '#c0452a')
  ;[2, 3, 4, 5, 6].forEach(x => scar.set(vx + x, vy + 1, '#24384f'))
  scar.set(vx + 5, vy + 5, '#0b0915').set(vx + 6, vy + 5, '#2a2430').set(vx + 4, vy + 2, '#2a2430')
  let dmg = yhPath(scar)
  dmg += `<circle cx="${(vx + 15) * Q}" cy="${(vy + 5) * Q}" r="7" fill="url(#yhBreachG)"><animate attributeName="opacity" values="0.6;1;0.6" dur="${yhPer(2.2)}s" repeatCount="indefinite"/></circle>`
  for (let i = 0; i < 4; i++) {
    const d = yhPer(3.2 + i * 0.4)
    dmg += `<rect x="${(vx + 14) * Q}" y="${(vy + 3) * Q}" width="${2 * Q}" height="${Q}" fill="#b0a8c0" opacity="0"><animateMotion path="M0 0 q -8 -4 -22 -5" dur="${d}s" begin="-${i * 0.8}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.65;0" dur="${d}s" begin="-${i * 0.8}s" repeatCount="indefinite"/></rect>`
  }
  ship += `<g opacity="0">${dmg}${yhRamp([[tScar, 0], [tScarFull, 1], [tReset + 0.3, 1], [tGone - 0.4, 0]])}</g>`
  // glides; limps and sags in the year of hell; moves slowly into the timeship; drifts back as history resets
  scr += `<g>${ship}${yhMove(
    [[0, 0, 0], [tScar, 1.2, 0], [tBridgeFull, 1.6, 1], [tRam, 2, 1], [tHit, 16, 0], [tReset, 16, 0], [tHome, -1, 0], [T, 0, 0]],
    ['0 0 1 1', '0 0 1 1', '0 0 1 1', '0.5 0 0.85 0.7', '0 0 1 1', '0.4 0 0.5 1', '0 0 1 1'],
  )}</g>`

  // contact: a small local glow on the drum, rising, holding briefly and cooling
  const hx = 60
  const hy = cy + 1
  scr += `<circle cx="${(hx + 0.5) * Q}" cy="${(hy + 0.5) * Q}" r="16" fill="url(#yhHit)" opacity="0">${yhRamp([[tHit - 0.2, 0], [tHit + 0.5, 0.9], [tHit + 0.9, 0.9], [tGone - 0.6, 0]])}</circle>`
  for (let i = 0; i < 6; i++) {
    const t0 = tHit + 0.1 + i * 0.15
    const a = -Math.PI / 2 + (i - 2.5) * 0.55
    const dx = Math.cos(a) * (5 + (i % 3) * 2) * Q
    const dy = Math.sin(a) * (4 + (i % 2) * 2) * Q * (i % 2 ? 1 : -1)
    scr += `<rect x="${hx * Q}" y="${hy * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffd36b' : '#ff9a3d'}" opacity="0"><animateTransform attributeName="transform" type="translate" dur="${T}s" repeatCount="indefinite" values="0 0;0 0;${dx.toFixed(1)} ${dy.toFixed(1)};${dx.toFixed(1)} ${dy.toFixed(1)}" keyTimes="0;${yhK(t0)};${yhK(t0 + 1.4)};1"/>${yhRamp([[t0, 0], [t0 + 0.4, 0.9], [t0 + 1.4, 0]])}</rect>`
  }

  // pale wave, left to right: the timeline restored
  scr += `<g opacity="0"><rect x="0" y="${SY * Q}" width="${16 * Q}" height="${SH * Q}" fill="url(#yhWaveB)">${yhMove([[0, SX - 16, 0], [tReset, SX - 16, 0], [tGone - 0.3, SX + SW, 0], [T, SX + SW, 0]])}</rect>${yhRamp([[tReset - 0.1, 0], [tReset, 1], [tGone - 0.3, 1], [tGone - 0.2, 0]])}</g>`

  // the screen glass: scanlines, a crack while the bridge is damaged, a faint glint
  scr += yhR(SX, SY, SW, SH, 'url(#yhScan)')
  const crack = new Pix()
  ;[[20, 3], [21, 4], [22, 4], [23, 5], [24, 6], [24, 7], [25, 8], [22, 6], [21, 7], [26, 5], [27, 5], [28, 4]].forEach(([x, y]) => crack.set(x, y, '#d8d0e6'))
  scr += `<g opacity="0">${yhPath(crack)}${yhRamp([[tBridge, 0], [tBridgeFull, 0.4], [tReset + 0.3, 0.4], [tGone, 0]])}</g>`
  scr += `<polygon points="${80 * Q},${SY * Q} ${88 * Q},${SY * Q} ${88 * Q},${(SY + 7) * Q}" fill="#ffffff" opacity="0.05"/>`
  s += `<g clip-path="url(#yhScreen)">${scr}</g>`

  // ======== ops console on the right ========
  const con = new Pix()
  con.rect(62, 34, 25, 1, '#9a8fa6').rect(61, 35, 27, 1, '#0b0910')
  con.rect(62, 35, 4, 1, '#f29a3a').rect(67, 35, 3, 1, '#8aa7e8').rect(71, 35, 5, 1, '#c39be0').rect(77, 35, 3, 1, '#f7c487').rect(81, 35, 5, 1, '#8aa7e8')
  con.rect(61, 36, 27, 6, '#3a3346').rect(61, 36, 27, 1, '#544a63').rect(61, 41, 27, 1, '#241e2d')
  for (const x of [68, 76, 84]) con.rect(x, 37, 1, 4, '#2a2433')
  s += yhPath(con)
  ;[[63, 38], [71, 39], [79, 38]].forEach(([x, y], i) => {
    s += `<g>${yhR(x, y, 2, 1, i === 1 ? '#ff6b5a' : '#f7c487')}<animate attributeName="opacity" values="1;0.4;1" dur="${yhPer(2.2 + i * 0.6)}s" repeatCount="indefinite"/></g>`
  })

  // ======== bridge damage: scorch, a dead LCARS stretch, a fallen strut, rubble, a hanging cable, smoke ========
  const br = new Pix()
  br.rect(70, 34, 6, 1, '#1a1418').rect(69, 35, 8, 1, '#141016').set(72, 36, '#141016').set(73, 37, '#141016').set(72, 38, '#141016')
  br.set(71, 34, '#3a2a22').set(75, 35, '#3a2a22')
  br.rect(41, 29, 4, 1, '#2a2430').rect(57, 29, 5, 1, '#2a2430')
  br.set(58, 28, '#141016').set(59, 27, '#141016').set(42, 28, '#141016')
  // fallen strut on the floor, and rubble
  for (let i = 0; i < 10; i++) br.set(48 + i, 40 - Math.floor(i / 4), '#9a92ac').set(48 + i, 41 - Math.floor(i / 4), '#4a4258')
  br.set(48, 39, '#8a8299').set(57, 37, '#8a8299')
  ;[[50, 41], [53, 41], [59, 41], [60, 40], [46, 41]].forEach(([x, y], i) => br.set(x, y, i % 2 ? '#4a4256' : '#5a5068'))
  // a cable torn loose from the screen's lower edge
  ;[[80, 27], [80, 28], [81, 29], [81, 30], [81, 31], [80, 32]].forEach(([x, y]) => br.set(x, y, '#2a2332'))
  br.set(80, 33, '#8a8299')
  let bd = yhPath(br)
  for (let i = 0; i < 2; i++) {
    const d = yhPer(4.2 + i * 0.9)
    bd += `<rect x="${72 * Q}" y="${33 * Q}" width="${2 * Q}" height="${Q}" fill="#7a7088" opacity="0"><animateMotion path="M0 0 q -3 -8 2 -16" dur="${d}s" begin="-${i * 1.9}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.35;0" dur="${d}s" begin="-${i * 1.9}s" repeatCount="indefinite"/></rect>`
  }
  s += `<g opacity="0">${bd}${yhRamp([[tBridge, 0], [tBridgeFull, 1], [tReset + 0.3, 1], [tGone, 0]])}</g>`
  // small local sparks from the console and the cable tip, only while the bridge is damaged
  s += `<g opacity="0">${yhSpark(72, 34, 2.6, 0.3)}${yhSpark(80, 33, 3.4, 1.5)}${yhRamp([[tBridgeFull - 0.4, 0], [tBridgeFull, 1], [tReset, 1], [tReset + 0.6, 0]])}</g>`

  // ======== Janeway: auburn bun, black jacket, red shoulders, four pips ========
  const k = yhJaneway
  const jx = 27
  const jy = 28
  const { p: jp, ex } = clawdBody(k, jx, jy, 'right')
  const hair = '#8a3a1e'
  const hairL = '#b2522a'
  const dark = '#5e2412'
  jp.rect(jx + 1, jy, 15, 1, hair).rect(jx + 4, jy, 9, 1, hairL)
  jp.rect(jx, jy + 1, 2, 3, hair).set(jx + 2, jy + 1, hair).set(jx, jy + 3, dark)
  jp.rect(jx + 2, jy - 1, 11, 1, hair).rect(jx + 5, jy - 1, 6, 1, hairL)
  jp.rows(['.bbb.', 'bLLbb', 'bLbbd', '.bbd.'], jx, jy - 4, { b: hair, L: hairL, d: dark })
  for (const c of [12, 13, 14, 15]) jp.set(jx + c, jy + 7, '#e8c547')
  jp.rect(jx + 4, jy + 6, 2, 2, '#e8c547').set(jx + 4, jy + 6, '#fff3b0')
  let jn = yhPath(jp)
  const raise: [number, number][] = [[tHalf, tDown]]
  jn += shown(armRestHD(k, jx, jy, 'left'), [[0, T]], T)
  jn += shown(armRestHD(k, jx, jy, 'right'), complement(raise, T), T)
  // rest -> diagonal -> half -> up, and back the same way: in-between frames of 0.09 s each
  const st = 0.09
  jn += shown(armMidHD(k, jx, jy, 'right'), [[tHalf, tHalf + st], [tDown - st, tDown]], T)
  jn += shown(yhArmHalf(k, jx, jy), [[tHalf + st, tHalf + 2 * st], [tDown - 2 * st, tDown - st]], T)
  jn += shown(armUpHD(k, jx, jy, 'right'), [[tHalf + 2 * st, tDown - 2 * st]], T)
  // soot and a torn sleeve while history is at its worst
  const soot = new Pix()
  soot.set(jx + 14, jy + 4, '#8e4a36').set(jx + 15, jy + 5, '#8e4a36').set(jx + 3, jy + 5, '#9a5440')
  soot.set(jx + 9, jy + 8, '#3a2a30').set(jx + 10, jy + 9, '#3a2a30').set(jx + 2, jy + 7, '#2a1a1a').set(jx + 16, jy + 8, '#3a2a30')
  soot.set(jx + 13, jy, dark).set(jx + 16, jy + 1, hair)
  jn += `<g opacity="0">${yhPath(soot)}${yhRamp([[tBridge, 0], [tBridgeFull, 1], [tReset + 0.3, 1], [tGone, 0]])}</g>`
  // blinks, placed on the story
  const lids = new Pix()
  ex.forEach(e => lids.rect(jx + e, jy + 2, 2, 3, k.skin))
  jn += shown(yhPath(lids), [[1.5, 1.65], [7.2, 7.35], [13.1, 13.25], [16.0, 16.15]], T)
  // a small rise of relief once the timeline is whole again
  s += `<g>${jn}${hopQ([[tHome + 0.3, tHome + 0.8]], T).split(`0 ${-2 * Q}`).join(`0 ${-Q}`)}</g>`

  return s
}

type Scene = { name: string; w: number; h: number; draw: () => string }

// Scenes reworked to one 17.17 s story that passed the flash check and review; the rest wait
const APPROVED = new Set(['Darmok', 'All Good Things', 'The Cloud', 'First Contact', 'Caretaker', 'Chain of Command', 'Scorpion', 'Q Who', 'The Doctor', 'The Inner Light', 'Déjà Q', 'Tapestry', 'The Best of Both Worlds', "Yesterday's Enterprise", 'The Measure of a Man', 'Blink of an Eye', 'Year of Hell'])

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
  { name: "Yesterday's Enterprise", w: GW * Q, h: GH * Q, draw: yesterdaysEnterprise },
  { name: 'The Measure of a Man', w: GW * Q, h: GH * Q, draw: measureOfAMan },
  { name: 'Blink of an Eye', w: GW * Q, h: GH * Q, draw: blinkOfAnEye },
  { name: 'Year of Hell', w: GW * Q, h: GH * Q, draw: yearOfHell },
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

// "Sun 7:00 PM", or just "1:26 PM" today
function resetText(l: Limit, now: number) {
  const at = resetAt(l, now)
  if (!(at > now)) return ''
  const d = new Date(at)
  const h = d.getHours()
  const m = d.getMinutes()
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'AM' : 'PM'}`
  const today = new Date(now).toDateString() === d.toDateString()
  return today ? time : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${time}`
}

const windowName = (kind: string) =>
  kind === 'five_hour' ? 'Session' : kind === 'seven_day' ? 'Weekly' : `Weekly ${kind.replace(/^seven_day_/, '').replace(/^\w/, ch => ch.toUpperCase())}`

const label = (kind: string) =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replace(/_/g, ' ')

const RING = 30
// One meter's slot (ring, percent, countdown), so the two rows line up
const METER_CELLS = 18

// "264k", "1M"; with a decimal, "264.2k"
function tokensText(n: number, decimals = 0) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(decimals || (n % 1e6 ? 1 : 0))}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(decimals)}k`
  return String(n)
}

// How long each window runs
const windowMs = (kind: string) => (kind === 'five_hour' ? 5 * 3600_000 : 7 * 86400_000)

// Red past 90%; amber when the pace so far would reach 100% before the window resets
function ringColor(l: Limit, now: number) {
  if (l.percentUsed >= 90) return C.hot
  const at = l.resetsAt ? Date.parse(l.resetsAt) : 0
  const w = windowMs(l.kind)
  const elapsed = w - (at - now)
  if (!(at > now) || elapsed < w * 0.05) return C.ring
  return (l.percentUsed * w) / elapsed >= 100 ? C.warn : C.ring
}

function ringSvg(limit: { percentUsed: number }, icon: 'clock' | 'cal' | 'book' | 'ctx', color: string) {
  const c = RING / 2
  const R = c - 2.5
  const circ = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, limit.percentUsed))
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${RING}" height="${RING}" viewBox="0 0 ${RING} ${RING}">`
  s += `<circle cx="${c}" cy="${c}" r="${R}" fill="#241a36" stroke="${C.track}" stroke-width="2.5"/>`
  s += `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(circ * pct) / 100} ${circ}" transform="rotate(-90 ${c} ${c})"/>`
  s +=
    icon === 'ctx'
      ? `<path d="M${c - 6} ${c - 4}h12M${c - 6} ${c}h12M${c - 6} ${c + 4}h7" stroke="${C.dim}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
      : icon === 'book'
      ? `<path d="M${c} ${c - 3.5}q-3.5 -2 -7 -0.5v9q3.5 -1.5 7 0.5zM${c} ${c - 3.5}q3.5 -2 7 -0.5v9q-3.5 -1.5 -7 0.5z" fill="none" stroke="${C.dim}" stroke-width="1.4" stroke-linejoin="round"/>`
      : icon === 'clock'
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
    // per-model weekly windows (Fable): rows of the `limits` list with kind "weekly_scoped"
    for (const row of Array.isArray(body.limits) ? body.limits : []) {
      const model = row?.scope?.model?.display_name
      if (row?.kind !== 'weekly_scoped' || typeof model !== 'string' || typeof row.percent !== 'number') continue
      next.push({ kind: `seven_day_${model.toLowerCase()}`, percentUsed: Math.round(row.percent * 10) / 10, resetsAt: iso(row.resets_at) })
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

// Favourite scenes (by name, kept across sessions); when there are any, only they rotate
let favs: string[] = []
function nextScene(n: number) {
  const pool = SCENES.map((_, i) => i).filter(i => favs.length === 0 || favs.includes(SCENE_NAMES[i]))
  if (pool.length === 0) return (n + 1) % SCENES.length
  return pool.find(i => i > n % SCENES.length) ?? pool[0]
}

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

// "darmok", "inner light", "7": the scene a name or number points to
function findScene(q: string) {
  const n = Number(q)
  if (Number.isInteger(n) && n >= 1 && n <= SCENES.length) return n - 1
  const k = norm(q)
  if (!k) return -1
  const names = SCENE_NAMES.map(norm)
  for (const test of [(x: string) => x === k, (x: string) => x.startsWith(k), (x: string) => x.includes(k)]) {
    const i = names.findIndex(test)
    if (i >= 0) return i
  }
  return -1
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
  await update($, scene, n => nextScene(n))
  rotateAfter($)
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'startrek',
      description: 'Next Star Trek scene; a name or number jumps to one; pause, play, list, fav <scene>, favs clear',
      argumentHint: '[scene | pause | play | list | fav <scene> | favs clear]',
    })
    favs = ((await $.store.get('favs')) as string[] | undefined) ?? []
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits.map(toLimit))
    await update($, ctx, () => ({ tokens: usage.context.tokens ?? 0, window: usage.context.window }))
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
    if (e.changed.includes('rateLimits'))
      await update($, limits, old => [...e.rateLimits.map(toLimit), ...old.filter(l => !e.rateLimits.some(r => r.kind === l.kind))])
    // a response just landed: the cache was used, and its hour restarted, now
    if (e.changed.includes('context')) {
      await markMessage($)
      await update($, ctx, () => ({ tokens: e.context.tokens ?? 0, window: e.context.window }))
    }
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

  on('command.run', { command: 'startrek' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()
    if (word === 'pause' || word === 'play' || word === 'resume') {
      await update($, isPaused, () => word === 'pause')
      if (word !== 'pause') rotateAfter($)
      return { text: word === 'pause' ? '⏸ Scene paused' : '▶ Scenes rotating again' }
    }
    if (word === 'list') {
      const now = await read($, scene)
      return {
        text: SCENE_NAMES.map((n, i) => `${i === now % SCENES.length ? '▸' : ' '} ${i + 1}. ${n}${favs.includes(n) ? ' ★' : ''}`).join('\n'),
      }
    }
    if (word === 'favs clear' || word === 'fav clear' || word === 'all') {
      favs = []
      await $.store.set('favs', favs)
      return { text: 'All scenes rotate again' }
    }
    if (word.startsWith('fav ')) {
      const i = findScene(arg.slice(4))
      if (i < 0) return { text: `No scene matches "${arg.slice(4)}". /startrek list shows them all.` }
      const n = SCENE_NAMES[i]
      favs = favs.includes(n) ? favs.filter(f => f !== n) : [...favs, n]
      await $.store.set('favs', favs)
      return { text: favs.length ? `★ Rotating: ${favs.join(', ')}` : 'All scenes rotate again' }
    }
    if (arg) {
      const i = findScene(arg)
      if (i < 0) return { text: `No scene matches "${arg}". /startrek list shows them all.` }
      await update($, scene, () => i)
    } else {
      await update($, scene, v => nextScene(v))
    }
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
      ...list.filter(l => l.kind.startsWith('seven_day_')),
    ]
      .filter(Boolean)
      .map(l => (l!.resetsAt && Date.parse(l!.resetsAt) <= now ? { ...l!, percentUsed: 0, resetsAt: undefined, isReset: true } : l)) as (Limit & { isReset?: boolean })[]

    const context = await read($, ctx)
    const ctxPct = context.window > 0 ? Math.min(100, (context.tokens / context.window) * 100) : 0
    type Meter = { key: string; icon: 'clock' | 'cal' | 'book' | 'ctx'; pct: number; color: string; sub: string; subCells: number; hover: string }
    const meters: Meter[] = shown.map(l => ({
      key: l.kind,
      icon: l.kind === 'five_hour' ? 'clock' : l.kind === 'seven_day' ? 'cal' : 'book',
      pct: l.percentUsed,
      color: ringColor(l, now),
      sub: l.isReset ? '' : countdown(l, now),
      subCells: countdownCells(l),
      hover: [l.kind.startsWith('seven_day_') ? windowName(l.kind).replace(/^Weekly /, '') : '', `${l.percentUsed.toFixed(1)}%`, l.isReset ? '' : resetText(l, now)].filter(Boolean).join(' · '),
    }))
    if (context.window > 0)
      meters.push({
        key: 'context',
        icon: 'ctx',
        pct: ctxPct,
        color: ctxPct >= 90 ? C.hot : ctxPct >= 75 ? C.warn : C.ring,
        sub: tokensText(context.tokens),
        subCells: 7,
        hover: `${tokensText(context.tokens, 1)} / ${tokensText(context.window)}`,
      })
    const rows: Meter[][] = []
    for (let i = 0; i < meters.length; i += 2) rows.push(meters.slice(i, i + 2))

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box gap={3}>
          {meters.map(m => (
            <Box gap={1}>
              <Text bold color={C.text}>{Math.round(m.pct)}%</Text>
              <Text color={C.dim}>{m.sub}</Text>
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
          {meters.length === 0 && <Text color={C.dim} wrap="truncate">Usage limits show up after Claude's first reply.</Text>}
          {rows.map(row => (
            <Box flexDirection="row" alignItems="center" gap={3} flexShrink={1} minWidth={0}>
              {row.map(m => (
                <Box key={`ring-${m.key}`} width={METER_CELLS} flexDirection="row" alignItems="center" gap={1} flexShrink={0} position="relative">
                  <Svg source={ringSvg({ percentUsed: m.pct }, m.icon, m.color)} alt={`${m.key} ${Math.round(m.pct)}%`} width={RING} height={RING} />
                  <Text bold color={C.text} wrap="truncate">{Math.round(m.pct)}%</Text>
                  <Box minWidth={m.subCells} flexShrink={0}>
                    <Text color={C.dim}>{m.sub}</Text>
                  </Box>
                  <Box position="absolute" top={0} bottom={0} left={0} display="none" hover={{ display: 'flex' }} alignItems="center" backgroundColor={C.bg}>
                    <Text color={C.dim} wrap="truncate">{m.hover}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Box flexDirection="row" alignItems="center" flexShrink={0}>
          <Box flexDirection="column" alignItems="center" flexShrink={0} marginRight={1}>
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
                await update($, scene, v => nextScene(v))
                rotateAfter($)
              }}
            />
          </Box>
          <Box key={`scene-${idx}`} flexShrink={0}>
            <Svg source={sceneAt(idx, shownAt ? (now - shownAt) / 1000 : 0)} alt={name} width={SCENE_W} height={SCENE_H} />
          </Box>
        </Box>
      </Box>
    )
  })
}
