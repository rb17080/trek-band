// ---------- Timeless: Voyager in the ice ----------
// One 17.17 s story, played once, starting and ending on the same quiet shot:
//  0.0 - 2.6   a pale overcast sky, snow falling. Voyager lies tilted and half buried
//              in the ice. Old Chakotay and old Harry Kim stand in their parkas, looking.
//  2.6 - 6.2   they walk slowly across the ice to the ship.
//  6.2 - 8.8   they stop and look up at her.
//  8.8 - 12.0  Kim reaches out and lays his claw on the frozen hull, eyes closed; a little
//              frost glints where he touches it and loose snow slides off.
// 12.0 - 17.17 he lowers his claw; they turn and walk back to where they stood, and look
//              at her once more.
// Snow, breath and drifting cloud run on loops that divide the story exactly.

const TL_T = SCENE_SECONDS

const TL_KIM: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  legs: '#2b2733',
  rim: '#f3a582',
}
const TL_CHAK: CrabHD = { ...TL_KIM, skin: '#cf7052', light: '#e08b6c', shade: '#ad583e', rim: '#eb9a78' }

const tlK = (t: number) => +(t / TL_T).toFixed(5)
const tlPer = (n: number) => +(TL_T / n).toFixed(5) // a loop that divides the story exactly

// Pix written as one <path> per colour (smaller than one rect per run)
function tlPath(p: Pix) {
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

// an eased translate on the story timeline: [time, x, y] in art px; holds where it doesn't move
function tlMove(keys: [number, number, number][], ease = '0.42 0 0.58 1') {
  const all = [...keys]
  if (all[0][0] > 0) all.unshift([0, all[0][1], all[0][2]])
  if (all[all.length - 1][0] < TL_T) all.push([TL_T, all[all.length - 1][1], all[all.length - 1][2]])
  const sp = all.slice(1).map((k, i) => (k[1] === all[i][1] && k[2] === all[i][2] ? '0 0 1 1' : ease))
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${TL_T}s" repeatCount="indefinite" values="${all.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`).join(';')}" keyTimes="${all.map(k => tlK(k[0])).join(';')}" keySplines="${sp.join(';')}"/>`
}

// a smooth opacity curve on the story timeline: [time, value]
function tlFade(pts: [number, number][]) {
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < TL_T) all.push([TL_T, all[all.length - 1][1]])
  const sp = all.slice(1).map(() => '0.4 0 0.6 1')
  return `<animate attributeName="opacity" calcMode="spline" dur="${TL_T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => tlK(p[0])).join(';')}" keySplines="${sp.join(';')}"/>`
}

// ---- the two of them: Clawd, older, grey at the temples, in parkas ----
type TlCoat = { hair: string; hairL: string; collar: string; collarL: string; coat: string; coatD: string; coatL: string; trim: string }

function tlBody(k: CrabHD, o: TlCoat, x: number, y: number) {
  const p = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = k.skin
    if (j === 6) c = o.collar
    if (j >= 7) c = o.coat
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, c)
  }
  // light and shade on the face (light from the sky, upper right)
  p.rect(x + 1, y + 1, 16, 1, k.light)
  p.rect(x, y + 1, 1, 5, k.shade)
  p.rect(x + 17, y + 1, 1, 5, k.rim)
  // grey hair, receding, grey at the temples
  p.rect(x + 1, y, 16, 1, o.hair)
  for (const c of [3, 6, 10, 13]) p.set(x + c, y, o.hairL)
  p.set(x, y + 1, o.hair).set(x + 17, y + 1, o.hair).set(x + 1, y + 1, o.hairL).set(x + 16, y + 1, o.hairL)
  // collar with a soft highlight, coat with a zip, pockets, shade on the far side
  for (const c of [2, 5, 8, 11, 14]) p.set(x + c, y + 6, o.collarL)
  p.rect(x, y + 7, 1, 2, o.coatD).set(x + 1, y + 9, o.coatD)
  p.rect(x + 1, y + 7, 16, 1, o.coatL)
  p.rect(x + 9, y + 7, 1, 3, o.trim)
  p.rect(x + 3, y + 8, 3, 1, o.coatD).rect(x + 13, y + 8, 3, 1, o.coatD)
  return p
}

// legs (boots): 0 standing, 1 / 2 the two steps of a walk
function tlLegs(k: CrabHD, x: number, y: number, frame: number) {
  const p = new Pix()
  ;[1, 5, 11, 15].forEach((lx, i) => {
    const up = (frame === 1 && i % 2 === 0) || (frame === 2 && i % 2 === 1)
    p.rect(x + lx + (up ? 1 : 0), y + 10, 2, up ? 3 : 4, k.legs)
    p.set(x + lx + (up ? 1 : 0), y + 10, '#3d3846')
  })
  return tlPath(p)
}

// eyes: R looking right, U right and up, H half-way to the left, L left; X closed
function tlEyes(x: number, y: number, st: string) {
  if (st === 'X') return ''
  const p = new Pix()
  const ex = st === 'L' ? [4, 10] : st === 'H' ? [5, 11] : [6, 12]
  const dy = st === 'U' ? 1 : 2
  ex.forEach(e => p.rect(x + e, y + dy, 2, 3, EYE_HD))
  return tlPath(p)
}
function tlEyeTrack(x: number, y: number, segs: [number, number, string][]) {
  const by = new Map<string, [number, number][]>()
  for (const [a, b, st] of segs) {
    if (!by.has(st)) by.set(st, [])
    by.get(st)!.push([a, b])
  }
  let s = ''
  for (const [st, w] of by) if (st !== 'X') s += shown(tlEyes(x, y, st), w, TL_T)
  // closed: a lash line where the eyes were
  if (by.has('X')) {
    const p = new Pix()
    ;[6, 12].forEach(e => p.rect(x + e, y + 4, 2, 1, '#8a4630'))
    s += shown(tlPath(p), by.get('X')!, TL_T)
  }
  return s
}

// Kim's right arm reaching out to the hull: three drawings between rest and the touch
function tlReach(k: CrabHD, x: number, y: number, stage: number) {
  const p = new Pix()
  if (stage === 1) {
    // the forearm swings out and down a little
    p.rect(x + 18, y + 4, 3, 2, k.skin).rect(x + 18, y + 6, 3, 1, k.shade)
    p.rect(x + 21, y + 5, 1, 3, k.skin).set(x + 22, y + 5, k.light).set(x + 22, y + 7, k.skin)
  } else if (stage === 2) {
    // half out, claw opening
    p.rect(x + 18, y + 4, 4, 1, k.skin).rect(x + 18, y + 5, 4, 1, k.shade)
    p.rect(x + 22, y + 3, 1, 4, k.skin)
    p.set(x + 23, y + 3, k.light).set(x + 23, y + 6, k.skin)
  } else {
    // all the way out, the open claw flat against the hull
    p.rect(x + 18, y + 4, 5, 1, k.skin).rect(x + 18, y + 5, 5, 1, k.shade)
    p.rect(x + 23, y + 3, 1, 4, k.skin)
    p.set(x + 24, y + 3, k.skin).set(x + 25, y + 3, k.light)
    p.set(x + 24, y + 6, k.skin).set(x + 25, y + 6, k.skin)
  }
  return tlPath(p)
}

// a breath in the cold: a small pale puff drifting up from the face, on a loop
function tlBreath(x: number, y: number, n: number, off: number) {
  const d = tlPer(n)
  return `<rect x="${x * Q}" y="${y * Q}" width="${2 * Q}" height="${Q}" fill="#f7f9fc" opacity="0"><animateMotion path="M0 0 q 4 -3 5 -9" dur="${d}s" begin="${-off}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.75;0;0" keyTimes="0;0.05;0.15;0.5;1" dur="${d}s" begin="${-off}s" repeatCount="indefinite"/></rect>`
}

// leg frames over the walking windows, one drawing every LEG s
function tlLegPlan(walks: [number, number][]) {
  const LEG = 0.24
  const on: [number, number][][] = [[], [], []]
  let last = 0
  for (const [a, b] of walks) {
    on[0].push([last, a])
    const n = Math.max(4, Math.round((b - a) / LEG))
    for (let i = 0; i < n; i++) on[[1, 0, 2, 0][i % 4]].push([a + (i * (b - a)) / n, a + ((i + 1) * (b - a)) / n])
    last = b
  }
  on[0].push([last, TL_T])
  return on
}

function tlCrab(
  k: CrabHD, o: TlCoat, x: number, y: number,
  walks: [number, number][], move: [number, number, number][],
  eyes: [number, number, string][],
  rightArm: string, extra: (p: Pix) => void, breathOff: number,
) {
  const p = tlBody(k, o, x, y)
  extra(p)
  let s = `<rect x="${(x + 1) * Q}" y="${(y + 14) * Q}" width="${16 * Q}" height="${Q}" fill="#c3cddd"/>`
  s += `<rect x="${(x + 3) * Q}" y="${(y + 14) * Q}" width="${12 * Q}" height="${Q}" fill="#b4bfd2"/>`
  s += tlPath(p)
  const legs = tlLegPlan(walks)
  for (const f of [0, 1, 2]) s += shown(tlLegs(k, x, y, f), legs[f], TL_T)
  s += tlPath(new Pix().rect(x - 3, y + 4, 3, 2, k.skin).rect(x - 3, y + 6, 3, 1, k.shade))
  s += rightArm
  s += tlEyeTrack(x, y, eyes)
  s += tlBreath(x + 18, y + 3, 6, breathOff)
  return `<g>${s}${tlMove(move)}</g>`
}

// ---- Voyager: side on, nose to the left, tilted nose-down into the ice ----
// Drawn flat on her own grid (u along the hull, v down), then sheared so the tilt stays
// pixel-crisp, then outlined. Saucer, engineering hull with the dark deflector, and the
// nacelles swept up and back on their pylons, the far one just showing behind the near one.
function tlShip(X0: number, Y0: number, slope: number) {
  const flat = new Map<string, string>()
  const put = (u: number, v: number, c: string) => flat.set(`${u},${v}`, c)
  const SNOW = '#f5f8fb'
  const SNOW2 = '#dfe6ef'
  const HULL = '#9099aa'
  const HULL_L = '#b2bac7'
  const HULL_D = '#737d90'
  const UNDER = '#596274'
  const WIN = '#353c4b'
  const ICE = '#cfe2f1'

  // far nacelle, a little higher and further back
  for (let u = 34; u <= 52; u++) {
    put(u, -14, u === 34 ? '#5e2c31' : SNOW2)
    put(u, -13, u <= 35 ? '#6e3438' : '#6c768a')
  }
  // pylon, swept up and back from the engineering hull to the nacelle
  for (let v = -9; v <= 2; v++) {
    const u = 45 - Math.round((v + 9) * 0.4)
    put(u - 1, v, v < -6 ? SNOW : HULL_L)
    put(u, v, HULL)
    put(u + 1, v, HULL_D)
    put(u + 2, v, UNDER)
  }
  // near nacelle: snow on top, blue grille dark, bussard collector cold
  for (let u = 30; u <= 51; u++) {
    const rear = u > 48
    put(u, -12, rear ? HULL_L : SNOW)
    put(u, -11, HULL_L)
    put(u, -10, u >= 35 && u <= 47 ? (u % 3 === 0 ? '#2e3850' : '#4f6288') : HULL)
    if (!rear || u === 49) put(u, -9, HULL_D)
  }
  for (let v = -12; v <= -9; v++) {
    put(30, v, v === -12 || v === -9 ? '#5e2c31' : '#7e3c3f')
    put(31, v, v === -11 ? '#a2585a' : '#8a4648')
    put(32, v, v === -12 ? '#c8b8bc' : '#7e3c3f')
  }
  put(29, -11, '#5e2c31'), put(29, -10, '#5e2c31')
  ;[36, 41, 46].forEach(u => put(u, -8, ICE))

  // engineering hull under the back of the saucer
  for (let u = 15; u <= 46; u++) {
    const h = u < 23 ? Math.round((u - 15) * 1.0) : u < 39 ? 8 : Math.round(8 - (u - 38) * 0.65)
    for (let v = 2; v <= 2 + h; v++) {
      let c = HULL
      if (v === 2 + h) c = UNDER
      else if (v === 1 + h) c = HULL_D
      else if (v === 3) c = HULL_L
      else if (v === 5 && u % 3 === 0 && u > 24 && u < 44) c = WIN
      else if (u % 7 === 0) c = '#868fa0'
      put(u, v, c)
    }
    if (u > 34) put(u, 2, u % 4 === 0 ? SNOW2 : SNOW)
  }
  // the navigational deflector, dark and cold
  for (let v = 4; v <= 8; v++) {
    put(17, v, v === 4 || v === 8 ? '#6a80a6' : '#26304a')
    put(18, v, v === 4 || v === 8 ? '#6a80a6' : v === 6 ? '#40507a' : '#2c3754')
    put(19, v, v === 4 || v === 8 ? HULL_D : '#4a5a7c')
  }

  // the saucer: a long wedge, thin at the nose, deep under the bridge
  const top = (u: number) => (u === 0 ? -1 : -Math.round(1.6 + 4.6 * Math.sqrt(Math.min(u, 30) / 30)))
  const bot = (u: number) => (u === 0 ? 1 : Math.round(1.2 + 2.2 * Math.min(u, 30) / 30))
  for (let u = 0; u <= 34; u++) {
    let t = top(u)
    let b = bot(u)
    if (u >= 31) (t += [1, 2, 3, 5][u - 31]), (b -= [0, 0, 1, 1][u - 31])
    const mid = Math.round((t + b) / 2)
    for (let v = t; v <= b; v++) {
      let c = HULL
      if (v === t) c = SNOW
      else if (v === t + 1) c = (u >= 4 && u <= 10) || (u >= 23 && u <= 28) ? SNOW2 : HULL_L
      else if (v === t + 2 && u > 6) c = '#a3abb9'
      else if (v === b) c = UNDER
      else if (v === b - 1) c = '#a7afbc' // the bright rim of the saucer edge
      else if (v === mid && u % 2 && u > 2 && u < 31) c = WIN
      else if (v > mid) c = HULL_D
      put(u, v, c)
    }
    if ((u >= 5 && u <= 9) || (u >= 24 && u <= 27)) put(u, t - 1, SNOW)
  }
  // the bridge module, snow on it
  for (let u = 18; u <= 24; u++) {
    const t = top(u)
    const edge = u === 18 || u === 24
    put(u, t - 1, edge ? HULL_L : SNOW2)
    if (!edge) put(u, t - 2, SNOW)
  }

  // shear into the scene, then outline the whole silhouette
  const ship = new Pix()
  const at = new Set<string>()
  for (const [key, c] of flat) {
    const [u, v] = key.split(',').map(Number)
    const x = X0 + u
    const y = Y0 + v - Math.round(u * slope)
    ship.set(x, y, c)
    at.add(`${x},${y}`)
  }
  const OUT = '#4a5263'
  for (const key of at) {
    const [x, y] = key.split(',').map(Number)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`
      if (!at.has(k)) ship.set(x + dx, y + dy, OUT)
    }
  }
  // icicles under the saucer rim
  ;[[4, 1], [8, 2], [13, 1], [27, 2], [30, 1]].forEach(([u, n]) => {
    for (let i = 1; i <= n; i++) ship.set(X0 + u, Y0 + bot(u) + 1 + i - Math.round(u * slope), i === n ? '#e9f3fa' : ICE)
  })
  return ship
}

function timeless() {
  const T = TL_T
  const W = GW * Q
  const H = GH * Q
  let seed = 2374
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  let s = `<defs>
    <linearGradient id="tlSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7b3c6"/><stop offset="0.55" stop-color="#d0d7e2"/><stop offset="0.7" stop-color="#e3e7ee"/></linearGradient>
    <linearGradient id="tlFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <radialGradient id="tlHoleG" cx="0" cy="1" r="1"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset="0.6" stop-color="#000" stop-opacity="0.85"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <mask id="tlFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#tlFadeG)"/></mask>
    <mask id="tlSnowM"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#tlFadeG)"/><rect x="0" y="${30 * Q}" width="${44 * Q}" height="${18 * Q}" fill="url(#tlHoleG)"/></mask>
    <radialGradient id="tlSun"><stop offset="0" stop-color="#fbf8ef" stop-opacity="0.9"/><stop offset="0.25" stop-color="#f4f1ea" stop-opacity="0.5"/><stop offset="1" stop-color="#eef0f2" stop-opacity="0"/></radialGradient>
    <radialGradient id="tlCloud"><stop offset="0" stop-color="#eef1f5" stop-opacity="0.55"/><stop offset="1" stop-color="#eef1f5" stop-opacity="0"/></radialGradient>
    <radialGradient id="tlCloudD"><stop offset="0" stop-color="#97a3b8" stop-opacity="0.35"/><stop offset="1" stop-color="#97a3b8" stop-opacity="0"/></radialGradient>
    <radialGradient id="tlFrost"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.4" stop-color="#cfe9ff" stop-opacity="0.5"/><stop offset="1" stop-color="#cfe9ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="tlGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe5ee"/><stop offset="1" stop-color="#f0f3f8"/></linearGradient>
  </defs>`

  // ======== sky, pale sun, cloud, mountains, the ice plain ========
  let back = `<rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#tlSky)"/>`
  back += `<circle cx="${33 * Q}" cy="${9 * Q}" r="34" fill="url(#tlSun)"/>`
  back += `<circle cx="${33 * Q}" cy="${9 * Q}" r="7" fill="#f6f4ee" opacity="0.7"/>`
  // slow overcast: soft banks drifting a little and back over the story
  const clouds: [number, number, number, number, string, number][] = [
    [20, 5, 60, 9, 'tlCloudD', 10], [70, 3, 70, 10, 'tlCloudD', -8], [50, 13, 80, 8, 'tlCloud', 9], [12, 16, 50, 6, 'tlCloud', -7], [82, 15, 50, 7, 'tlCloud', 6],
  ]
  clouds.forEach(([cx, cy, rx, ry, g, dx]) => {
    back += `<g><ellipse cx="${cx * Q}" cy="${cy * Q}" rx="${rx}" ry="${ry * 2}" fill="url(#${g})"/>${tlMove([[0, 0, 0], [T / 2, dx / Q, 0], [T, 0, 0]], '0.45 0 0.55 1')}</g>`
  })
  // far range, then a nearer ice ridge, each with snow on the crests
  const far = new Pix()
  const near = new Pix()
  for (let c = 0; c < GW; c++) {
    const h1 = 21 + Math.round(2.6 * Math.sin(c / 6.3 + 0.7) + 1.7 * Math.sin(c / 2.6 + 2) + (c > 50 ? -1 : 0))
    for (let y = h1; y < 32; y++) {
      const fromTop = y - h1
      let col = '#c7cfdc'
      if (fromTop === 0) col = '#eef2f7'
      else if (fromTop === 1) col = (c * 7) % 3 ? '#dfe5ee' : '#ccd4e0'
      else if ((c + y) % 7 === 0 && fromTop < 5) col = '#d0d8e4'
      else if (Math.sin(c / 2.6 + 2) > 0.6 && fromTop < 6) col = '#b9c3d2'
      far.set(c, y, col)
    }
    const h2 = 27 + Math.round(1.4 * Math.sin(c / 4.1 + 1.3) + 0.8 * Math.sin(c / 1.7))
    for (let y = h2; y < 33; y++) near.set(c, y, y === h2 ? '#f3f6fa' : y === h2 + 1 ? '#d6dde8' : '#cfd7e3')
  }
  back += tlPath(far) + `<rect x="0" y="${25 * Q}" width="${W}" height="${8 * Q}" fill="#e3e8ef" opacity="0.35"/>` + tlPath(near)
  // the ice plain
  back += `<rect x="-10" y="${32 * Q}" width="${W + 20}" height="${16 * Q + 10}" fill="url(#tlGround)"/>`
  const plain = new Pix()
  plain.rect(0, 32, GW, 1, '#eef2f7')
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * GW)
    const y = 33 + Math.floor(rnd() * 15)
    const w = 2 + Math.floor(rnd() * 5)
    plain.rect(x, y, w, 1, rnd() < 0.5 ? '#f7f9fc' : '#d6dde8')
  }
  // a long low drift across the front
  for (let x = 0; x < GW; x++) {
    const y = 44 + Math.round(1.2 * Math.sin(x / 9 + 1))
    plain.set(x, y, '#f9fbfd').set(x, y + 1, '#dde3ec')
  }
  // their old footprints, out to the ship and back
  for (let x = 2; x < 56; x += 3) {
    plain.set(x, 40 + ((x / 3) % 2), '#c8d1df')
    if (x > 6) plain.set(x + 1, 42 - ((x / 3) % 2), '#d2dae6')
  }
  back += tlPath(plain)

  // ======== Voyager in the ice ========
  const X0 = 41
  const Y0 = 34
  const SL = 0.24
  const ship = tlShip(X0, Y0, SL)
  // ice around her: a drift bank burying the nose and the belly, with jagged blue shards
  const bank = new Pix()
  const shipM = (ship as any).m as Map<number, Map<number, string>>
  for (let x = 36; x < GW; x++) {
    const sy = x < 42 ? 38 - Math.round((x - 36) * 0.8) : x < 49 ? 33 + Math.round((x - 42) * 0.7) : x < 64 ? 38 : 37 + Math.round(0.6 * Math.sin(x / 3.1)) - (x > 78 ? 1 : 0)
    // ice glazing the hull just above the bank
    for (let y = sy - 2; y < sy; y++) {
      const row = shipM.get(y)
      if (row && row.has(x)) row.set(x, (x + y) % 3 ? '#bcd2e3' : '#d7e7f3')
    }
    for (let y = sy; y < 40; y++) {
      let c = y === sy ? '#fbfcfe' : y === sy + 1 ? '#e9eef5' : '#dce3ed'
      if (y > sy + 2 && (x * 3 + y) % 11 === 0) c = '#c7d8e8'
      bank.set(x, y, c)
    }
    bank.set(x, 40, '#e4e9f0')
  }
  // ice shards jutting up around the hull
  const shard = (x: number, y: number, h: number, lean: number) => {
    for (let i = 0; i < h; i++) {
      const xx = x + Math.round(i * lean)
      bank.set(xx, y - i, i === h - 1 ? '#eef7fc' : '#b6d0e6').set(xx + 1, y - i, '#8fb2d1')
      if (i < h - 2) bank.set(xx - 1, y - i, '#d4e6f3')
    }
  }
  shard(39, 36, 4, 0.3)
  shard(50, 37, 3, -0.3)
  shard(66, 37, 4, 0.25)
  shard(76, 37, 3, 0)
  shard(87, 36, 4, -0.3)
  s += `<g mask="url(#tlFade)">${back}`
  s += tlPath(ship) + tlPath(bank)
  s += `</g>`

  // falling snow: a tile of flakes sliding down one screen height per loop, swaying gently
  const snowLayer = (n: number, per: number, sway: number, swayPer: number, col: string, op: number, big: boolean) => {
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) pts.push([Math.floor(rnd() * GW), Math.floor(rnd() * GH)])
    let flakes = ''
    for (const [x, y] of pts) {
      for (const yy of [y, y - GH]) {
        if (big) flakes += `<rect x="${x * Q}" y="${yy * Q}" width="${Q}" height="${Q}" fill="${col}"/>`
        else flakes += `<rect x="${x * Q + 0.5}" y="${yy * Q + 0.5}" width="1" height="1" fill="${col}"/>`
      }
    }
    const fall = `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${H}" dur="${per}s" repeatCount="indefinite"/>`
    const sw = `<animateTransform attributeName="transform" type="translate" calcMode="spline" values="0 0;${sway} 0;0 0" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${swayPer}s" repeatCount="indefinite"/>`
    return `<g opacity="${op}"><g>${sw}<g>${flakes}${fall}</g></g></g>`
  }
  s += `<g mask="url(#tlSnowM)">${snowLayer(70, tlPer(1), 6, tlPer(3), '#ffffff', 0.85, false)}${snowLayer(36, tlPer(1), -5, tlPer(2), '#f8faff', 0.8, true)}</g>`

  // ======== the beat sheet ========
  const ky = 26
  const kx0 = 23
  const kx1 = 29
  const cx0 = 1
  const cx1 = 7
  const rA = 8.8 // Kim's claw starts to reach
  const st = 0.15 // one in-between drawing
  const rB = 11.4 // ... and comes back

  // the touch: frost glints where the claw rests, loose snow slides off
  const tx = kx1 + 25.5
  const ty = ky + 4.5
  s += `<circle cx="${tx * Q}" cy="${ty * Q}" r="9" fill="url(#tlFrost)" opacity="0">${tlFade([[rA + 3 * st + 0.2, 0], [rA + 1.4, 0.8], [rB - 0.6, 0.8], [rB + 0.6, 0]])}</circle>`
  ;[[-1, 0, 6], [1, 0.35, 7], [2, 0.7, 5]].forEach(([dx, dt, fall], i) => {
    const t0 = rA + 0.9 + dt
    s += `<rect x="${(tx + dx) * Q}" y="${(ky + 2) * Q}" width="${Q}" height="${Q}" fill="${i === 1 ? '#ffffff' : '#e9f1f8'}" opacity="0"><animateTransform attributeName="transform" type="translate" calcMode="spline" values="0 0;0 0;${i - 1} ${fall * Q};${i - 1} ${fall * Q}" keyTimes="0;${tlK(t0)};${tlK(t0 + 1.3)};1" keySplines="0 0 1 1;0.5 0 0.9 0.6;0 0 1 1" dur="${T}s" repeatCount="indefinite"/>${tlFade([[t0, 0], [t0 + 0.25, 0.95], [t0 + 1.0, 0.9], [t0 + 1.3, 0]])}</rect>`
  })

  // Chakotay: white hair, the tattoo over his brow, a heavy brown coat with a fur collar
  const chakCoat: TlCoat = { hair: '#d9dadd', hairL: '#f2f2f2', collar: '#e2d9c8', collarL: '#f3ede2', coat: '#6c5638', coatD: '#4e3d27', coatL: '#80694a', trim: '#3c2f1f' }
  s += tlCrab(
    TL_CHAK, chakCoat, cx0, ky - 1,
    [[2.8, 6.0], [12.9, 16.2]],
    [[0, 0, 0], [2.8, 0, 0], [6.0, cx1 - cx0, 0], [12.9, cx1 - cx0, 0], [16.2, 0, 0]],
    [
      [0, 1.6, 'R'], [1.6, 1.75, 'X'], [1.75, 6.4, 'R'], [6.4, 9.6, 'U'], [9.6, 10.8, 'R'], [10.8, 10.95, 'X'], [10.95, 12.2, 'R'],
      [12.2, 12.35, 'H'], [12.35, 14.9, 'L'], [14.9, 15.05, 'X'], [15.05, 16.5, 'L'], [16.5, 16.65, 'H'], [16.65, T, 'R'],
    ],
    '', // his near claw is tucked into his coat pocket
    p => {
      p.set(cx0 + 14, ky, '#5b3b44').set(cx0 + 15, ky, '#5b3b44').set(cx0 + 16, ky + 1, '#5b3b44')
      p.rect(cx0 + 13, ky + 7, 3, 1, chakCoat.coatD).set(cx0 + 14, ky + 7, TL_CHAK.shade)
    },
    0.9,
  )

  // Harry Kim: salt-and-pepper hair, a blue parka and a dark red scarf
  const kimCoat: TlCoat = { hair: '#6f6f78', hairL: '#b9bac2', collar: '#8e2f3a', collarL: '#a8434e', coat: '#3f6987', coatD: '#2b4b63', coatL: '#527e9c', trim: '#24384a' }
  const reach = [
    shown(tlPath(new Pix().rect(kx0 + 18, ky + 4, 3, 2, TL_KIM.skin).rect(kx0 + 18, ky + 6, 3, 1, TL_KIM.shade)), [[0, rA], [rB + 3 * st, T]], T),
    shown(tlReach(TL_KIM, kx0, ky, 1), [[rA, rA + st], [rB + 2 * st, rB + 3 * st]], T),
    shown(tlReach(TL_KIM, kx0, ky, 2), [[rA + st, rA + 2 * st], [rB + st, rB + 2 * st]], T),
    shown(tlReach(TL_KIM, kx0, ky, 3), [[rA + 2 * st, rB + st]], T),
  ].join('')
  s += tlCrab(
    TL_KIM, kimCoat, kx0, ky,
    [[2.6, 6.2], [12.7, 16.3]],
    [[0, 0, 0], [2.6, 0, 0], [6.2, kx1 - kx0, 0], [12.7, kx1 - kx0, 0], [16.3, 0, 0]],
    [
      [0, 1.1, 'R'], [1.1, 1.25, 'X'], [1.25, 6.6, 'R'], [6.6, 8.6, 'U'], [8.6, 9.4, 'R'], [9.4, 10.9, 'X'], [10.9, 12.0, 'R'],
      [12.0, 12.15, 'H'], [12.15, 16.6, 'L'], [16.6, 16.75, 'H'], [16.75, T, 'R'],
    ],
    reach,
    p => {
      p.rect(kx0 + 3, ky + 7, 1, 2, kimCoat.collar).set(kx0 + 3, ky + 9, kimCoat.collarL)
    },
    2.2,
  )

  // near snow, in front of everything: a few brighter flakes, a little faster
  s += `<g mask="url(#tlSnowM)">${snowLayer(22, tlPer(2), 7, tlPer(4), '#ffffff', 0.95, true)}</g>`
  return s
}
