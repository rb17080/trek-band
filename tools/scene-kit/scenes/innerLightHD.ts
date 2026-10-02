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
