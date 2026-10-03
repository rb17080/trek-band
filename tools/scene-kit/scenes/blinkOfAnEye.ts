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
