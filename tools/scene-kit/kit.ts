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


// Every scene's story runs exactly this long, once per showing
const SCENE_SECONDS = 17.17
