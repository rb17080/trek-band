// ---------- Blink of an Eye: the planet where time runs fast ----------
// One 17.17 s story, one long night on a fast world. Voyager hangs in orbit over
// a daylit planet. Night sweeps slowly across it, and in that one night a whole
// civilisation grows: camp fires, then towns, then roads and glowing cities. A
// little rocket climbs from the biggest city toward the ship; a tiny astronaut Clawd
// floats out and waves, a bay door in Voyager's belly slides open, and he drifts
// under the hull and floats up through it; the door slides shut, the rocket goes home.
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

// USS Voyager, Intrepid class, seen three-quarter from above with her bow to the right:
// a long flat teardrop saucer (blunt rounded stern, pointed bow) panelled in darker
// grey-blue, flowing aft into a slim secondary hull that hangs beneath it with the
// blue deflector at its front, and two slim nacelles on short pylons that leave the
// hull low down and fold up and outward. Plan coordinates: u along the keel (bow +),
// w across the beam (toward us +), h up. Returns the art and the underside hatch.
const BE_SLOPE = 0.05
const BE_SQ = 0.62 // how much of the beam we see: three-quarter, from well above
function beShip(x0: number, cy: number) {
  const p = new Pix()
  const Y = (u: number, w: number, h: number) => cy + w * BE_SQ - h + BE_SLOPE * u
  const col = (u: number, y0: number, y1: number, f: (y: number) => string) => {
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      const c = f(y)
      if (c) p.set(x0 + u, y, c)
    }
  }
  const hash = (a: number, b: number) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 7
  // a slim nacelle from u0 (aft) to u1 (bow end), centred at (w, h)
  const nacelle = (u0: number, u1: number, w: number, h: number, far: boolean) => {
    for (let u = u0; u <= u1; u++) {
      const yc = Math.round(Y((u0 + u1) / 2, w, h)) // kept straight: a slope would put a step in it
      const front = u >= u1
      const aft = u === u0
      p.set(x0 + u, yc - 1, aft ? (far ? '#4e5462' : '#5d6472') : far ? '#8e96a4' : '#bcc3cf')
      p.set(x0 + u, yc, front ? (far ? '#c84a38' : '#ff5a44') : aft ? '#3a404c' : u % 4 === 0 ? (far ? '#3f86b8' : '#5cc4f4') : far ? '#4f9fd0' : '#9ae4ff')
      p.set(x0 + u, yc + 1, front ? (far ? '#7e2e24' : '#b8402e') : far ? '#454b58' : '#5a6170')
    }
    p.set(x0 + u1 + 1, Math.round(Y((u0 + u1) / 2, w, h)), far ? '#9a3a2c' : '#e0503c')
  }
  // a pylon: a short diagonal of pixels between the hull and a nacelle
  const pylon = (a: [number, number, number], b: [number, number, number], c1: string, c2: string) => {
    const [ua, wa, ha] = a
    const [ub, wb, hb] = b
    const ya = Y(ua, wa, ha)
    const yb = Y(ub, wb, hb)
    const n = Math.ceil(Math.max(Math.abs(ub - ua), Math.abs(yb - ya)) * 2)
    for (let k = 0; k <= n; k++) {
      const u = Math.round(ua + ((ub - ua) * k) / n)
      const y = Math.round(ya + ((yb - ya) * k) / n)
      p.set(x0 + u, y, c1).set(x0 + u + 1, y, c2)
    }
  }
  const NW = 10 // nacelles stand this far out from the keel...
  const NH = 2 // ...and this far up, pylons folded to warp
  // far nacelle and its pylon, behind everything
  nacelle(-19, -3, -NW, NH, true)
  pylon([-4, -2.4, -3.5], [-10, -NW + 1, NH - 1], '#6a7282', '#555c6a')
  // the secondary hull, hanging beneath the saucer's back half and running aft of it
  const HU0 = -14
  const HU1 = 17
  const hullBottom = new Map<number, number>()
  for (let u = HU0; u <= HU1; u++) {
    const hw = u > 14 ? 3.2 - (u - 14) * 0.5 : 2.4 + (0.8 * (u - HU0)) / (14 - HU0)
    const top = u >= 0 ? 0 : u * 0.15
    const bot = u > 12 ? -8 + (u - 12) * 1.1 : u >= 2 ? -8 : -8 + (2 - u) * 0.34
    const yt = Y(u, -hw, top)
    const ys = Y(u, hw, top)
    const yb = Y(u, hw, bot)
    hullBottom.set(u, Math.round(yb))
    col(u, yt, yb, y => {
      if (u === HU0) return y === Math.round(yb) ? '#2e333d' : '#454b58'
      if (y === Math.round(yt)) return '#99a1ae'
      if (y < Math.round(ys)) return hash(u >> 1, y) < 2 ? '#6c7484' : '#7c8494'
      if (y === Math.round(yb)) return '#3d434f'
      if (y === Math.round(yb) - 1) return '#555c69'
      if (y === Math.round(ys) + 2 && u % 3 === 0 && u > HU0 + 1) return '#ffd98a'
      return hash(u >> 1, y) < 2 ? '#525967' : '#5f6675'
    })
  }
  // the navigational deflector at the front of the secondary hull, under the saucer
  const dy = Math.round(Y(15, 3, -6))
  p.set(x0 + 14, dy, '#2f6f9f').set(x0 + 15, dy, '#6fd8ff').set(x0 + 16, dy, '#3a86bc')
  p.set(x0 + 14, dy + 1, '#3a86bc').set(x0 + 15, dy + 1, '#d8f6ff').set(x0 + 16, dy + 1, '#6fd8ff')
  // the saucer: a flat teardrop, widest toward the stern, drawn to a point at the bow
  const L = 36
  const WM = 11
  const UMAX = 10
  const sHW = (u: number) => (u < 0 || u > L ? 0 : u < 9 ? WM * Math.sqrt(1 - Math.pow((9 - u) / 9.6, 2)) : u <= UMAX ? WM : WM * Math.pow((L - u) / (L - UMAX), 0.85))
  for (let u = 0; u <= L; u++) {
    const hw = Math.min(WM, sHW(u))
    if (hw < 0.6) {
      p.set(x0 + u, Math.round(Y(u, 0, 0)), '#c9d0db')
      continue
    }
    const yt = Y(u, -hw, 0)
    const yn = Y(u, hw, 0)
    col(u, yt, yn, y => {
      const w = (y - cy - BE_SLOPE * u) / BE_SQ
      const n = w / hw
      if (y === Math.round(yt)) return '#d4dae3'
      if (n < -0.6) return '#b7bfcb'
      // the spine running from the bridge to the bow
      if (Math.abs(w) < 1 && u > 12 && u < L - 3) return '#c3cad5'
      // the aztec panelling: staggered plates in two darker tones
      const k = hash(Math.floor((u + (Math.floor(w / 2.4) & 1) * 1.5) / 3), Math.floor(w / 2.4))
      if (k === 0) return '#6e7788'
      if (k < 3) return '#808999'
      return n > 0.6 ? '#8f98a7' : '#a0a8b6'
    })
    // the rim beneath the near edge, with its row of lit windows
    const yr = Math.round(yn) + 1
    if (hw > 1.5) {
      p.set(x0 + u, yr, u % 3 === 1 && u > 2 && u < L - 4 ? '#ffd98a' : '#5b6271')
      if (hw > 3) p.set(x0 + u, yr + 1, '#3d434f')
    }
  }
  // a shadowed step along the saucer's stern edge, where it overhangs the lower hull
  for (let u = 0; u < 9; u++) {
    const hw = Math.min(WM, sHW(u))
    const hn = Math.min(WM, sHW(u + 1))
    for (let y = Math.round(Y(u, -hn, 0)); y <= Math.round(Y(u, hn, 0)); y++) {
      const w = (y - cy - BE_SLOPE * u) / BE_SQ
      if (Math.abs(w) > hw - 0.3 && Math.abs(w) < hn) p.set(x0 + u, y, '#4a5160')
    }
  }
  // the bridge dome at the heart of the saucer, impulse engines glowing at the stern
  const by = Math.round(Y(11, 0, 0))
  p.rect(x0 + 10, by, 3, 1, '#e4e8ee').set(x0 + 11, by - 1, '#f4f6f9').rect(x0 + 10, by + 1, 3, 1, '#6e7788')
  for (const w of [-4, 3]) {
    const iy = Math.round(Y(1, w, 0))
    p.set(x0 + 1, iy, '#ff6a4a').set(x0 + 2, iy, '#c8503a')
  }
  // the near pylon leaves the hull low and rises up and out to the near nacelle
  pylon([-4, 2.4, -7], [-10, NW - 1, NH - 1], '#9aa2b0', '#6a7282')
  nacelle(-19, -3, NW, NH, false)
  // the underside hatch: a small bay door in the hull's belly, aft of the deflector
  const hatchU = 4
  const hatchW = 5
  const hatchY = Math.max(...[0, 1, 2, 3, 4].map(i => hullBottom.get(hatchU + i)!))
  return { svg: bePath(p), hatchX: x0 + hatchU, hatchW, hatchY }
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
  const LAUNCH = 9.4 // the rocket lights up on its pad
  const ARRIVE = 11.4 // and hovers below Voyager; Clawd floats out
  const WAVE = 12.4 // Clawd waves up at the ship
  const DOOR = 13.0 // a bay door in Voyager's belly slides open
  const ABOARD = 13.7 // Clawd drifts up under the hull, the rocket heads home
  const ENTER = 15.4 // he is right below the open door...
  const INSIDE = 16.1 // ...and floats up into the bay
  const CLOSE = 16.2 // the door slides shut
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
    <radialGradient id="beBayG"><stop offset="0" stop-color="#ffd98a" stop-opacity="0.4"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
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

  // ---- Voyager in orbit, and the little bay door in her belly ----
  const vx = 38
  const vcy = 13
  const V = beShip(vx, vcy)
  const hx = V.hatchX
  const hw = V.hatchW
  const hy = V.hatchY // the hull's bottom row at the hatch

  // ---- the launch: a soft glow on the pad, then a rocket climbing up toward the ship ----
  const [lx, ly] = cities[0]
  s += `<ellipse cx="${(lx + 0.5) * Q}" cy="${(ly - 0.5) * Q}" rx="${5 * Q}" ry="${3 * Q}" fill="url(#bePadG)" opacity="0">${beFade([[0, 0], [LAUNCH + 0.3, 0], [LAUNCH + 1.0, 1], [LAUNCH + 1.6, 0.8], [LAUNCH + 3.2, 0], [beT, 0]])}</ellipse>`
  // rocket base point over time (grid): up to a hover below the ship, then home again
  const RISE = LAUNCH + 0.6
  const rocketPath: [number, number, number][] = [
    [0, lx, ly - 1], [RISE, lx, ly - 1], [RISE + 0.6, lx - 1, ly - 5], [RISE + 1.1, lx - 3, ly - 8.5], [ARRIVE, lx - 4, ly - 9],
    [ABOARD, lx - 4, ly - 9], [ABOARD + 1.8, lx - 1, ly - 2], [beT, lx - 1, ly - 2],
  ]
  // smoke puffs left along the climb
  for (let i = 0; i < 7; i++) {
    const t0 = RISE + 0.05 + i * 0.2
    const f = Math.min(1, (t0 - RISE) / 1.3)
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
  const flameG = `<g opacity="0">${bePath(flame)}${beFade([[0, 0], [RISE - 0.3, 0], [RISE, 1], [RISE + 1.0, 1], [ARRIVE + 0.1, 0], [beT, 0]])}</g>`
  const rocketG =
    `<g opacity="0">${beFade([[0, 0], [LAUNCH, 0], [LAUNCH + 0.6, 1], [ABOARD + 0.8, 1], [ABOARD + 1.7, 0], [beT, 0]])}` +
    `<g>${beMove(rocketPath, ['0 0 1 1', '0.5 0 0.9 0.6', '0.1 0.3 0.9 0.7', '0.1 0.3 0.3 1', '0 0 1 1', '0.45 0 0.55 1', '0 0 1 1'])}<g transform="translate(0 ${-4 * Q})"><g>${beScale(ABOARD, ABOARD + 1.8, 0.55)}<g transform="translate(0 ${4 * Q})">${bePath(rocket)}${flameG}</g></g></g></g></g>`
  s += rocketG

  // Voyager, with her running lights and a soft blue glow off the nacelles
  const halo = `<ellipse cx="${(vx - 7) * Q}" cy="${(vcy - 8) * Q}" rx="20" ry="4" fill="url(#beNacG)"/><ellipse cx="${(vx - 7) * Q}" cy="${(vcy + 2) * Q}" rx="22" ry="5" fill="url(#beNacG)"/>`
  let ship = `<g>${halo}<animate attributeName="opacity" values="0.7;1;0.7" dur="${(beT / 4).toFixed(4)}s" repeatCount="indefinite"/></g>`
  ship += V.svg
  ship += `<g>${bePath(new Pix().set(vx + 7, vcy - 5, '#ff5a5a'))}<animate attributeName="opacity" values="0.35;1;0.35" dur="${(beT / 6).toFixed(4)}s" repeatCount="indefinite"/></g>`
  ship += `<g>${bePath(new Pix().set(vx + 8, vcy + 7, '#5aff8a'))}<animate attributeName="opacity" values="0.35;1;0.35" dur="${(beT / 6).toFixed(4)}s" begin="${(-beT / 12).toFixed(3)}s" repeatCount="indefinite"/></g>`
  s += `<g mask="url(#beFade)">${ship}</g>`

  // the bay door slides open into a warm lit slot, light spilling below it, and later slides shut
  const doorKeys = (v: number): [number, number][] => [[0, 0], [DOOR, 0], [DOOR + 0.7, v], [CLOSE, v], [CLOSE + 0.7, 0], [beT, 0]]
  const lin = (k: [number, number][]) => `values="${k.map(x => x[1]).join(';')}" keyTimes="${k.map(x => beK(x[0])).join(';')}"`
  s += `<ellipse cx="${(hx + hw / 2) * Q}" cy="${(hy + 1) * Q}" rx="${6 * Q}" ry="${3 * Q}" fill="url(#beBayG)" opacity="0">${beFade(doorKeys(1))}</ellipse>`
  s += `<rect x="${hx * Q}" y="${(hy - 1) * Q}" height="${2 * Q}" width="0" fill="#ffe3a4"><animate attributeName="width" dur="${beT}s" repeatCount="indefinite" ${lin(doorKeys(hw * Q))}/></rect>`
  s += `<rect x="${hx * Q}" y="${(hy - 1) * Q}" height="${Q}" width="0" fill="#e8b062"><animate attributeName="width" dur="${beT}s" repeatCount="indefinite" ${lin(doorKeys(hw * Q))}/></rect>`

  // ---- Clawd the astronaut: steps out from behind the rocket, waves, floats up into the bay ----
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
  // positions are the sprite's top-left; it scales about its middle (7, 5.5)
  const mid = (cx: number, cy: number): [number, number] => [cx - 7, cy - 5.5]
  const cStart: [number, number] = [lx - 11, ly - 13]
  const cHover: [number, number] = [lx - 22, ly - 13]
  const cUnder = mid(hx + hw / 2 + 4, hy + 6.5) // swings in low, under the hull...
  const cBelow = mid(hx + hw / 2, hy + 3) // ...to just below the door
  const cInside = mid(hx + hw / 2, hy - 3.4)
  const clawdG =
    `<g clip-path="url(#beBayClip)"><g opacity="0">${beFade([[0, 0], [ARRIVE, 0], [ARRIVE + 0.7, 1], [INSIDE + 0.1, 1], [INSIDE + 0.4, 0], [beT, 0]])}` +
    `<g>${beMove([[0, ...cStart], [ARRIVE, ...cStart], [ARRIVE + 1.0, ...cHover], [ABOARD, ...cHover], [ABOARD + 1.0, ...cUnder], [ENTER, ...cBelow], [INSIDE, ...cInside], [beT, ...cInside]], ['0 0 1 1', '0.45 0 0.55 1', '0 0 1 1', '0.45 0 0.7 0.7', '0.3 0.3 0.55 1', '0.45 0 0.6 1', '0 0 1 1'])}` +
    `<g transform="translate(${7 * Q} ${5.5 * Q})"><g>${beScale(ABOARD, ENTER, 0.3)}<g transform="translate(${-7 * Q} ${-5.5 * Q})"><g>${clawd}<animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" values="0 0;0 ${Q};0 0" keyTimes="0;0.5;1" dur="${(beT / 7).toFixed(4)}s" repeatCount="indefinite"/></g></g></g></g></g></g></g>`
  // Clawd is hidden by the hull everywhere except through the open bay door
  s += `<defs><clipPath id="beBayClip"><rect x="0" y="${(hy + 1) * Q}" width="${W}" height="${H}"/><rect x="${hx * Q}" y="${(hy - 1) * Q}" width="${hw * Q}" height="${2 * Q}"/><rect x="${(vx + 20) * Q}" y="${(hy - 1) * Q}" width="${W}" height="${H}"/></clipPath></defs>`
  s += clawdG
  return s
}
