// ---------- Endgame: Voyager comes home ----------
// One 17.17 s story on the bridge viewscreen. Calm: Earth below, three Starfleet
// ships keeping watch. A transwarp aperture irises open and a Borg sphere slides
// out of it. Thin cracks of green light creep across the sphere, it comes apart
// gently, the pieces drift away, and the armoured Voyager glides out from inside.
// The fleet closes in around her; Janeway allows herself a small satisfied smile.
// Voyager heads on toward Earth, the ships settle back on station, and the
// scene ends where it began.

const EG_JANEWAY: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#b3262e', // command red shoulders
  lower: '#16121c', // black Voyager jacket
  lowerShade: '#0c0a10',
  legs: '#16121c',
  rim: '#f6a77c',
}

const egT = SCENE_SECONDS
const egK = (t: number) => +(t / egT).toFixed(4)
// an ambient period that divides the story exactly
const egPer = (n: number) => +(egT / n).toFixed(5)
const EG_IO = '0.42 0 0.58 1'
const EG_OUT = '0.2 0.6 0.4 1'
const EG_IN = '0.5 0 0.8 0.6'
const EG_LIN = '0 0 1 1'
const EG_GLIDE = '0.3 0 0.4 1'

// Pix written as one <path> per colour
function egPath(p: Pix) {
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

const egR = (x: number, y: number, w: number, h: number, c: string, extra = '') =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"${extra}/>`

// opacity on the story: [t, v] points, padded to 0 and the end (linear between points)
function egRamp(pts: [number, number][]) {
  const all: [number, number][] = [...(pts[0][0] > 0 ? [[0, pts[0][1]] as [number, number]] : []), ...pts]
  if (all[all.length - 1][0] < egT) all.push([egT, all[all.length - 1][1]])
  return `<animate attributeName="opacity" dur="${egT}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => egK(p[0])).join(';')}"/>`
}

// any transform on the story: [t, value, spline into it], padded to 0 and the end
function egTween(type: string, keys: [number, string, string?][]) {
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1], EG_LIN])
  if (k[k.length - 1][0] < egT) k.push([egT, k[k.length - 1][1], EG_LIN])
  const kt = k.map(([t]) => egK(t))
  kt[kt.length - 1] = 1
  return `<animateTransform attributeName="transform" type="${type}" calcMode="spline" dur="${egT}s" repeatCount="indefinite" values="${k.map(x => x[1]).join(';')}" keyTimes="${kt.join(';')}" keySplines="${k.slice(1).map(x => x[2] ?? EG_IO).join(';')}"/>`
}
// translate in art pixels
const egMove = (keys: [number, number, number, string?][]) =>
  egTween('translate', keys.map(([t, x, y, sp]) => [t, `${+(x * Q).toFixed(2)} ${+(y * Q).toFixed(2)}`, sp]))

// Starfleet ships seen nose-on, waiting: saucer on top, nacelles below at the sides
const EG_SHIP_PAL: Record<string, string> = {
  h: '#c9ced8', H: '#8e94a2', d: '#5d6371', D: '#6fc8ff', R: '#ff6a52', N: '#4a5060', w: '#ffe2a0',
}
const EG_SHIPS: string[][] = [
  // a Sovereign, the closest
  ['...hhhhhhh...', '.hhHHHHHHHhh.', 'hHHHwHHHwHHHh', '..ddHHDHHdd..', '.N...dDd...N.', 'RN.........NR'],
  // a Galaxy
  ['..hhhhhhh..', 'hhHHHHHHHhh', '.ddHHDHHdd.', 'N...dDd...N', 'R.........R'],
  // a smaller escort, farther off
  ['.hhhhh.', 'hHHDHHh', 'Nd...dN', 'R.....R'],
]

function endgame() {
  const T = egT
  const W = GW * Q
  const H = GH * Q
  let seed = 2001
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // ---- the beat sheet, in seconds (authored; the band plays it 1.72x faster) ----
  const tOpen = 2.8 // the transwarp aperture begins to iris open
  const tSphere = 3.6 // the sphere slides out of it...
  const tSet = 6.0 // ...and settles; the aperture closes behind it
  const tCrack = 6.4 // green cracks creep outward across the sphere
  const tBreak = 9.0 // it comes apart, gently
  const tVoy = 9.4 // Voyager glides out from inside
  const tOut = 12.4 // she is clear; the fleet closes in
  const tSmile = 12.5 // Janeway's small smile
  const tHome = 14.0 // Voyager heads on toward Earth
  const tGone = 16.3 // ...and is home; the fleet back on station
  const tRelax = 15.9 // the smile settles back

  // ---- screen area (art px) ----
  const SX = 17
  const SY = 1
  const SW = 72
  const SH = 26

  let s = `<defs>
    <linearGradient id="egFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="egFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#egFadeG)"/></mask>
    <linearGradient id="egWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141019"/><stop offset="1" stop-color="#2a2133"/></linearGradient>
    <linearGradient id="egSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05050c"/><stop offset="1" stop-color="#121228"/></linearGradient>
    <radialGradient id="egNeb"><stop offset="0" stop-color="#9a7ad6" stop-opacity="0.2"/><stop offset="1" stop-color="#9a7ad6" stop-opacity="0"/></radialGradient>
    <radialGradient id="egAtmo"><stop offset="0.82" stop-color="#7fc4ff" stop-opacity="0"/><stop offset="0.9" stop-color="#7fc4ff" stop-opacity="0.32"/><stop offset="1" stop-color="#7fc4ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="egBorgG"><stop offset="0" stop-color="#5dff8a" stop-opacity="0.5"/><stop offset="0.5" stop-color="#2fbf5a" stop-opacity="0.16"/><stop offset="1" stop-color="#2fbf5a" stop-opacity="0"/></radialGradient>
    <radialGradient id="egHaze"><stop offset="0" stop-color="#3fdc6a" stop-opacity="0.14"/><stop offset="1" stop-color="#3fdc6a" stop-opacity="0"/></radialGradient>
    <radialGradient id="egAper"><stop offset="0" stop-color="#06140c"/><stop offset="0.45" stop-color="#0d2a1a"/><stop offset="0.72" stop-color="#2f8a58" stop-opacity="0.8"/><stop offset="0.86" stop-color="#7fe0a8" stop-opacity="0.55"/><stop offset="1" stop-color="#3fae6c" stop-opacity="0"/></radialGradient>
    <pattern id="egScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="2" fill="#000" opacity="0.07"/></pattern>
    <clipPath id="egScreen"><rect x="${SX * Q}" y="${SY * Q}" width="${SW * Q}" height="${SH * Q}"/></clipPath>
  </defs>`

  // ======== the bridge behind: wall, LCARS panel on the left, rail, floor ========
  let back = `<rect x="-6" y="-6" width="${W + 12}" height="${H + 12}" fill="url(#egWall)"/>`
  const lc = new Pix()
  lc.rect(3, 4, 11, 18, '#0b0910')
  lc.rect(4, 5, 9, 2, '#c9a7ff').rect(4, 7, 2, 13, '#c9a7ff').set(4, 5, '#0b0910')
  lc.rect(7, 8, 3, 2, '#f29a3a').rect(11, 8, 2, 2, '#8aa7e8').rect(7, 11, 6, 1, '#f7c487')
  lc.rect(7, 13, 2, 2, '#d9584a').rect(10, 13, 3, 2, '#c39be0').rect(7, 16, 6, 1, '#8aa7e8').rect(4, 20, 9, 1, '#8aa7e8')
  back += `<g opacity="0.6">${egPath(lc)}</g>`
  const low = new Pix()
  low.rect(0, 28, GW, 4, '#221b2b').rect(0, 28, GW, 1, '#2f2639')
  ;[[19, 6, '#c9a7ff'], [26, 3, '#f29a3a'], [30, 9, '#8aa7e8'], [52, 4, '#c39be0'], [57, 6, '#f7c487'], [64, 8, '#c9a7ff'], [73, 3, '#d9584a'], [77, 10, '#8aa7e8']].forEach(([x, w, c]) =>
    low.rect(x as number, 30, w as number, 1, c as string),
  )
  low.rect(0, 32, GW, 1, '#8a8299').rect(0, 33, GW, 1, '#3a3346')
  for (const x of [24, 50, 74]) low.rect(x, 34, 1, 2, '#3a3346')
  low.rect(0, 34, GW, 14, '#1a1623').rect(0, 35, GW, 1, '#221d2d').rect(0, 40, GW, 1, '#1f1a29').rect(0, 45, GW, 1, '#16121e')
  // the captain's chair, half in the band's fade
  low.rect(8, 31, 9, 6, '#3c3346').rect(8, 31, 9, 1, '#5a5068').rect(9, 32, 7, 4, '#4a4056')
  low.rect(6, 36, 13, 2, '#3c3346').rect(6, 36, 13, 1, '#5a5068').rect(11, 38, 3, 2, '#2a2332')
  back += egPath(low)
  s += `<g mask="url(#egFade)">${back}</g>`

  // ======== the viewscreen ========
  const bez = new Pix()
  bez.rect(SX - 1, SY - 1, SW + 2, SH + 2, '#0e0b12').rect(SX, SY + SH, SW, 1, '#3a3142').rect(SX - 1, SY, 1, SH, '#2a2330')
  s += `<g mask="url(#egFade)">${egPath(bez)}</g>`

  let scr = egR(SX, SY, SW, SH, 'url(#egSpace)')
  scr += `<ellipse cx="${46 * Q}" cy="${7 * Q}" rx="60" ry="20" fill="url(#egNeb)"/>`
  const stars = [new Pix(), new Pix(), new Pix()]
  for (let y = SY + 1; y < SY + SH; y += 2) {
    for (let x = SX + 1; x < SX + SW; x += 3) {
      if (rnd() < 0.7) continue
      stars[Math.floor(rnd() * 3)].set(x + (y % 3), y, '#cdbaf0')
    }
  }
  stars.forEach((d, i) => (scr += `<g opacity="${0.18 + i * 0.14}">${egPath(d)}</g>`))
  ;[[24, 4], [52, 24], [61, 2], [86, 9], [30, 22]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    scr += `<g>${egPath(glow)}<animate attributeName="opacity" values="0.15;0.7;0.15" calcMode="spline" keyTimes="0;0.5;1" keySplines="${EG_IO};${EG_IO}" dur="${egPer(5 - (i % 3))}s" begin="-${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></g>`
    scr += egPath(new Pix().set(x, y, '#ffffff'))
  })

  // ---- Earth, low on the right: oceans, land, cloud, the night side, a thin blue rim ----
  const ex = 81
  const ey = 33
  const er = 13
  const earth = new Pix()
  for (let y = -er; y <= er; y++) {
    for (let x = -er; x <= er; x++) {
      const d = Math.sqrt(x * x + y * y)
      if (d > er + 0.3 || ey + y > SY + SH) continue
      const n = Math.sin(x * 0.55 + Math.sin(y * 0.7) * 1.4) + Math.cos(y * 0.45 - x * 0.2)
      let c = n > 0.9 ? '#4f9a5a' : n > 0.7 ? '#6f9a4a' : '#2f6fc0'
      if (Math.sin(x * 0.3 + y * 1.3) > 0.82) c = '#e8eef6'
      else if (Math.sin(x * 0.3 + y * 1.3) > 0.62 && c === '#2f6fc0') c = '#a9c8ea'
      // night falls on the lower right
      const lit = (-x * 0.5 - y * 0.85) / er
      if (lit < -0.55) c = c === '#2f6fc0' ? '#0e1f3c' : c === '#e8eef6' ? '#3a4a66' : '#14301e'
      else if (lit < -0.3) c = c === '#2f6fc0' ? '#1f4a8a' : c === '#e8eef6' ? '#8a9ab4' : '#2f6a3c'
      if (d > er - 0.8 && lit > -0.3) c = '#9fd0ff'
      earth.set(ex + x, ey + y, c)
    }
  }
  // city lights on the night side
  ;[[86, 26], [89, 24], [84, 27], [88, 27]].forEach(([x, y]) => earth.set(x, y, '#ffd27a'))
  scr += `<circle cx="${(ex + 0.5) * Q}" cy="${(ey + 0.5) * Q}" r="${(er + 3) * Q}" fill="url(#egAtmo)"/>` + egPath(earth)
  // the Moon, small and far
  const moon = new Pix()
  moon.rect(84, 3, 2, 3, '#cfc6dc').rect(83, 4, 1, 1, '#a99fbc').rect(86, 4, 1, 1, '#8e85a2').set(85, 5, '#a99fbc')
  scr += egPath(moon)

  // ---- the transwarp aperture: a ring of green light that irises open, then closed ----
  const acx = (34 + 0.5) * Q
  const acy = (13 + 0.5) * Q
  {
    let ring = `<circle cx="0" cy="0" r="${11 * Q}" fill="url(#egAper)"/>`
    // the vortex: arcs of light turning slowly
    let arcs = ''
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2
      const r = 8.5 * Q
      const x0 = Math.cos(a0) * r
      const y0 = Math.sin(a0) * r
      const x1 = Math.cos(a0 + 0.6) * r * 0.85
      const y1 = Math.sin(a0 + 0.6) * r * 0.85
      arcs += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} Q ${(Math.cos(a0 + 0.3) * r * 1.02).toFixed(1)} ${(Math.sin(a0 + 0.3) * r * 1.02).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${i % 2 ? '#9dffc0' : '#4fd08a'}" stroke-width="1.5" fill="none" opacity="0.7"/>`
    }
    ring += `<g>${arcs}<animateTransform attributeName="transform" type="rotate" values="0;360" dur="${egPer(3)}s" repeatCount="indefinite"/></g>`
    const scale = egTween('scale', [[0, '0.1'], [tOpen, '0.1', EG_LIN], [tOpen + 1.6, '1', EG_OUT], [tSet - 0.4, '1', EG_LIN], [tSet + 1.2, '0.1', EG_IO]])
    scr += `<g opacity="0"><g transform="translate(${acx} ${acy})"><g>${ring}${scale}</g></g>${egRamp([[tOpen, 0], [tOpen + 0.9, 1], [tSet, 1], [tSet + 1.2, 0]])}</g>`
  }

  // ---- the Borg sphere: shaded plating, a machinery grid, green lights; seven pieces ----
  const SCX = 38
  const SCY = 13
  const SR = 8.4
  const NP = 6
  const shades = ['#262b32', '#323840', '#3f464f', '#4d555f', '#5d6670', '#6f7884', '#848e99']
  const L = [0.5, -0.62, 0.6]
  const pieceOf = (x: number, y: number) => {
    const d = Math.sqrt(x * x + y * y)
    const a = Math.atan2(y, x) + 0.16 * Math.sin(d * 1.7 + 1.7) + 0.35
    return ((Math.floor(((a + Math.PI) / (Math.PI * 2)) * NP) % NP) + NP) % NP
  }
  const inside = (x: number, y: number) => Math.sqrt(x * x + y * y) <= SR + 0.2
  const pieces = Array.from({ length: NP }, () => ({ p: new Pix(), cr: [new Pix(), new Pix(), new Pix()], lights: new Pix(), sx: 0, sy: 0, n: 0 }))
  const R = Math.ceil(SR) + 1
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      if (!inside(x, y)) continue
      const d = Math.sqrt(x * x + y * y)
      const nx = x / (SR + 0.6)
      const ny = y / (SR + 0.6)
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const lv = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])
      let idx = Math.round(lv * 5.2)
      if ((x + 30) % 3 === 0 || (y + 30) % 3 === 0) idx -= 1
      const r = rnd()
      if (r < 0.12) idx += 1
      else if (r < 0.2) idx -= 1
      let c = shades[Math.max(0, Math.min(6, idx))]
      if (d > SR - 0.7 && lv > 0.55) c = '#a3acb6'
      if (d > SR - 0.7 && lv < 0.2) c = '#1c2026'
      const k = pieceOf(x, y)
      const pc = pieces[k]
      pc.p.set(SCX + x, SCY + y, c)
      pc.sx += x
      pc.sy += y
      pc.n++
      // a crack runs along every seam between two pieces
      const seam = (inside(x + 1, y) && pieceOf(x + 1, y) !== k) || (inside(x, y + 1) && pieceOf(x, y + 1) !== k)
      if (seam) pc.cr[d < 3.2 ? 0 : d < 6 ? 1 : 2].set(SCX + x, SCY + y, d < 3.2 ? '#c8ffd6' : (x + y) % 2 ? '#7dffa0' : '#4fe07a')
    }
  }
  // green lights in the machinery, a few of which breathe
  const lightPts: [number, number][] = [[-4, -3], [2, -5], [5, -1], [-2, 2], [3, 4], [-5, 3], [0, -1], [6, 3], [-3, -6], [1, 6]]
  lightPts.forEach(([x, y], i) => {
    const pc = pieces[pieceOf(x, y)]
    pc.p.set(SCX + x, SCY + y, '#2f8f4a')
    if (i % 2 === 0) pc.lights.set(SCX + x, SCY + y, '#8dffa8')
  })

  let sphere = `<circle cx="${(SCX + 0.5) * Q}" cy="${(SCY + 0.5) * Q}" r="${(SR + 6) * Q}" fill="url(#egHaze)"/>`
  // the green light from inside, growing as the cracks spread and fading as the pieces part
  sphere += `<circle cx="${(SCX + 0.5) * Q}" cy="${(SCY + 0.5) * Q}" r="${7 * Q}" fill="url(#egBorgG)" opacity="0">${egRamp([[tCrack + 0.4, 0], [tCrack + 1.8, 0.7], [tBreak + 0.4, 0.75], [tBreak + 2.4, 0]])}</circle>`
  const crackT = [tCrack, tCrack + 0.8, tCrack + 1.6]
  pieces.forEach((pc, k) => {
    const len = Math.hypot(pc.sx, pc.sy) || 1
    const dist = 11 + ((k * 37) % 5)
    const dx = (pc.sx / len) * dist
    const dy = (pc.sy / len) * dist * 0.8
    let g = egPath(pc.p)
    g += `<g>${egPath(pc.lights)}<animate attributeName="opacity" values="0.25;0.9;0.25" calcMode="spline" keyTimes="0;0.5;1" keySplines="${EG_IO};${EG_IO}" dur="${egPer(4)}s" begin="-${(k * 0.55).toFixed(2)}s" repeatCount="indefinite"/></g>`
    pc.cr.forEach((cp, n) => {
      const a = crackT[n]
      g += `<g opacity="0">${egPath(cp)}${egRamp([[a, 0], [a + 0.9, 1], [tBreak + 0.6, 1], [tBreak + 3.2, 0.3], [tHome, 0.15], [tHome + 1.2, 0]])}</g>`
    })
    // the pieces part slowly, quick at first and then slower and slower; they fade as they drift
    const mv = egMove([[0, 0, 0], [tBreak, 0, 0, EG_LIN], [tGone - 0.6, dx, dy, EG_OUT], [tGone - 0.5, 0, 0, EG_LIN]])
    sphere += `<g>${g}${mv}</g>`
  })
  // while the cracks spread, the sphere trembles: half an art pixel, smoothly
  const shake: [number, number, number, string?][] = [[0, 0, 0], [tCrack + 0.6, 0, 0, EG_LIN]]
  for (let t = tCrack + 1.1, n = 0; t < tBreak - 0.3; t += 0.5, n++) shake.push([t, n % 2 ? -0.5 : 0.5, n % 2 ? 0 : 0.5])
  shake.push([tBreak, 0, 0])
  sphere = `<g>${sphere}${egMove(shake)}</g>`
  // it slides out of the aperture toward us, growing, and settles
  const cx = (SCX + 0.5) * Q
  const cy = (SCY + 0.5) * Q
  const arrive = egTween('scale', [[0, '0.3'], [tSphere, '0.3', EG_LIN], [tSet, '1', EG_OUT], [tGone - 0.5, '1', EG_LIN], [tGone - 0.4, '0.3', EG_LIN]])
  const slide = egMove([[0, -4, 0], [tSphere, -4, 0, EG_LIN], [tSet, 0, 0, EG_OUT], [tGone - 0.5, 0, 0, EG_LIN], [tGone - 0.4, -4, 0, EG_LIN]])
  scr += `<g opacity="0"><g transform="translate(${cx} ${cy})"><g>${slide}<g>${arrive}<g transform="translate(${-cx} ${-cy})">${sphere}</g></g></g></g>${egRamp([[tSphere, 0], [tSphere + 0.8, 1], [tBreak + 3.4, 1], [tGone - 0.8, 0]])}</g>`

  // ---- Starfleet, nose-on, keeping watch; they close in around Voyager, then settle back ----
  const fleet: { art: string[]; x: number; y: number; to: [number, number] }[] = [
    { art: EG_SHIPS[1], x: 77, y: 3, to: [-3, 5] },
    { art: EG_SHIPS[2], x: 60, y: 3, to: [-9, 0] },
    { art: EG_SHIPS[0], x: 66, y: 20, to: [-6, -1] },
  ]
  fleet.forEach((f, i) => {
    const art = egPath(new Pix().rows(f.art, f.x, f.y, EG_SHIP_PAL))
    const w = f.art[0].length
    const nav = new Pix().set(f.x + Math.floor(w / 2), f.y - 1, '#ff6a52')
    const blink = `<g opacity="0">${egPath(nav)}<animate attributeName="opacity" calcMode="discrete" values="0;1;0" keyTimes="0;0.5;0.62" dur="${egPer(6 - i)}s" begin="-${i * 0.9}s" repeatCount="indefinite"/></g>`
    const mv = egMove([[0, 0, 0], [tOut - 0.6 + i * 0.25, 0, 0, EG_LIN], [tHome + i * 0.2, f.to[0], f.to[1]], [tHome + 0.6 + i * 0.2, f.to[0], f.to[1], EG_LIN], [tGone - 0.2 + i * 0.15, 0, 0]])
    scr += `<g>${art}${blink}${mv}</g>`
  })

  // ---- Voyager, armoured: arrowhead saucer, slim secondary hull, nacelles up on short pylons ----
  const vPal: Record<string, string> = {
    n: '#8a909c', N: '#4e535e', g: '#5fb6ff', R: '#ff5a4a', p: '#5a5f6b',
    L: '#c3c8d0', a: '#a3a8b2', A: '#7a7f8b', B: '#686d79', d: '#454a55', e: '#2e323b', w: '#ffd98a', D: '#7fd0ff', t: '#d6dbe3',
  }
  const vp = new Pix()
  const x0 = 11 // the back of the saucer
  const vy = 6 // its centre line
  // far nacelle, up on its pylon, behind everything
  vp.set(1, 0, 'N').rect(2, 0, 10, 1, 'n').set(12, 0, 'R')
  vp.set(1, 1, 'N')
  for (let i = 2; i < 12; i++) vp.set(i, 1, i % 2 ? 'e' : 'g')
  vp.set(12, 1, 'N')
  ;[[8, 2], [9, 2], [9, 3], [10, 3], [10, 4], [11, 4]].forEach(([x, y]) => vp.set(x, y, 'p'))
  // slim secondary hull under the saucer's back half, deflector glowing at its front
  vp.rect(x0 - 5, vy + 3, 14, 1, 'B').rect(x0 - 7, vy + 4, 15, 1, 'd').rect(x0 - 4, vy + 5, 9, 1, 'e')
  vp.set(x0 - 6, vy + 3, 'e').set(x0 + 8, vy + 4, 'D').set(x0 + 9, vy + 4, 'D').set(x0 + 7, vy + 5, 'D')
  // the arrowhead saucer seen a little from above: broad at the back, drawn to a point
  const SL = 20
  for (let u = 0; u < SL; u++) {
    const hw = u < 6 ? 4.6 - (u === 0 ? 1.4 : 0) : (4.6 * (SL - u)) / (SL - 6)
    const top = Math.round(vy - hw * 0.62)
    const bot = Math.round(vy + hw * 0.38)
    for (let y = top; y <= bot; y++) {
      let c = y === top ? 'L' : y < vy ? 'a' : 'A'
      // the ablative armour: staggered plates with dark seams
      if (y !== top && (u + (y % 2) * 2) % 5 === 0) c = 'd'
      vp.set(x0 + u, y, c)
    }
    // the rim beneath, with a row of lit windows
    if (hw > 0.8) vp.set(x0 + u, bot + 1, u % 3 === 1 && u < SL - 3 ? 'w' : 'B')
  }
  vp.set(x0 + 6, vy - 4, 't').set(x0 + 7, vy - 4, 't') // the bridge dome
  // near nacelle, in front: its pylon rises from the hull side
  ;[[9, 7], [10, 8], [11, 8]].forEach(([x, y]) => vp.set(x, y, 'p'))
  vp.set(0, 5, 'N').rect(1, 5, 10, 1, 'n').set(11, 5, 'R')
  vp.set(0, 6, 'N')
  for (let i = 1; i < 11; i++) vp.set(i, 6, i % 2 ? 'g' : 'e')
  vp.set(11, 6, 'N').rect(1, 7, 9, 1, 'N')
  // colour it in
  const vm = (vp as any).m as Map<number, Map<number, string>>
  for (const row of vm.values()) for (const [x, c] of row) row.set(x, vPal[c] || c)
  const VW = x0 + SL
  const VH = 12
  let voy = egPath(vp)
  // impulse glow at the back of the saucer and the nose light, breathing slowly
  voy += `<g>${egPath(new Pix().set(x0, vy, '#ff8a5a'))}<animate attributeName="opacity" values="0.5;1;0.5" dur="${egPer(6)}s" repeatCount="indefinite"/></g>`
  voy += `<g>${egPath(new Pix().set(VW - 1, vy, '#ffffff'))}<animate attributeName="opacity" values="0.3;1;0.3" dur="${egPer(5)}s" repeatCount="indefinite"/></g>`
  const vc = `translate(${-(VW / 2) * Q} ${-(VH / 2) * Q})`
  // emerges at the sphere's heart, grows as it comes toward us, holds, then heads for Earth
  const vMove = egMove([[0, SCX, SCY], [tVoy, SCX, SCY, EG_LIN], [tOut, 56, 13, EG_GLIDE], [tHome, 57, 13], [tGone - 0.3, ex - 7, ey - 13, EG_IO], [tGone, ex - 7, ey - 13, EG_LIN], [tGone + 0.05, SCX, SCY, EG_LIN]])
  const vScale = egTween('scale', [[0, '0.45'], [tVoy, '0.45', EG_LIN], [tOut, '1', EG_GLIDE], [tHome, '1', EG_LIN], [tGone - 0.3, '0.3', EG_IO], [tGone, '0.3', EG_LIN], [tGone + 0.05, '0.45', EG_LIN]])
  scr += `<g opacity="0"><g transform="translate(${Q / 2} ${Q / 2})"><g>${vMove}<g>${vScale}<g transform="${vc}">${voy}</g></g></g></g>${egRamp([[tVoy, 0], [tVoy + 0.9, 1], [tHome + 1.3, 1], [tGone - 0.3, 0]])}</g>`

  // the screen glass: scanlines and a faint glint
  scr += egR(SX, SY, SW, SH, 'url(#egScan)')
  scr += `<polygon points="${80 * Q},${SY * Q} ${88 * Q},${SY * Q} ${88 * Q},${(SY + 7) * Q}" fill="#ffffff" opacity="0.04"/>`
  s += `<g clip-path="url(#egScreen)">${scr}</g>`

  // ======== ops console on the right ========
  const con = new Pix()
  con.rect(63, 35, 25, 1, '#9a8fa6').rect(62, 36, 27, 1, '#0b0910')
  con.rect(63, 36, 4, 1, '#f29a3a').rect(68, 36, 3, 1, '#8aa7e8').rect(72, 36, 5, 1, '#c39be0').rect(78, 36, 3, 1, '#f7c487').rect(82, 36, 5, 1, '#8aa7e8')
  con.rect(62, 37, 27, 6, '#3a3346').rect(62, 37, 27, 1, '#544a63').rect(62, 42, 27, 1, '#241e2d')
  for (const x of [69, 77, 85]) con.rect(x, 38, 1, 4, '#2a2433')
  s += egPath(con)
  ;[[64, 39], [72, 40], [80, 39]].forEach(([x, y], i) => {
    s += `<g>${egR(x, y, 2, 1, i === 1 ? '#7dffa0' : '#f7c487')}<animate attributeName="opacity" values="1;0.45;1" dur="${egPer(6 + i)}s" repeatCount="indefinite"/></g>`
  })

  // ======== Janeway: auburn bun, black jacket, red shoulders, four pips ========
  const k = EG_JANEWAY
  const jx = 31
  const jy = 31
  const { p: jp, ex: eyes } = clawdBody(k, jx, jy, 'right')
  const hair = '#8a3a1e'
  const hairL = '#b2522a'
  const dark = '#5e2412'
  jp.rect(jx + 1, jy, 15, 1, hair).rect(jx + 4, jy, 9, 1, hairL)
  jp.rect(jx, jy + 1, 2, 3, hair).set(jx + 2, jy + 1, hair).set(jx, jy + 3, dark)
  jp.rect(jx + 2, jy - 1, 11, 1, hair).rect(jx + 5, jy - 1, 6, 1, hairL)
  jp.rows(['.bbb.', 'bLLbb', 'bLbbd', '.bbd.'], jx, jy - 4, { b: hair, L: hairL, d: dark })
  for (const c of [12, 13, 14, 15]) jp.set(jx + c, jy + 7, '#e8c547')
  jp.rect(jx + 4, jy + 6, 2, 2, '#e8c547').set(jx + 4, jy + 6, '#fff3b0')
  let jn = egPath(jp)
  jn += armRestHD(k, jx, jy, 'left') + armRestHD(k, jx, jy, 'right')
  // the smile comes in four drawings, and settles back the same way
  const mouth = '#5a2216'
  const sm = [new Pix(), new Pix(), new Pix(), new Pix()]
  sm[0].rect(jx + 9, jy + 5, 2, 1, k.shade)
  sm[1].rect(jx + 9, jy + 5, 2, 1, mouth)
  sm[2].rect(jx + 9, jy + 5, 2, 1, mouth).set(jx + 8, jy + 4, k.shade).set(jx + 11, jy + 4, k.shade)
  sm[3].rect(jx + 9, jy + 5, 2, 1, mouth).set(jx + 8, jy + 4, mouth).set(jx + 11, jy + 4, mouth)
  // ...the last with the eyes crinkling: cheeks lift into the bottom of each eye
  eyes.forEach(e => sm[3].rect(jx + e, jy + 4, 2, 1, k.light))
  const st = 0.17
  sm.forEach((p, i) => {
    const on: [number, number][] = i < 3
      ? [[tSmile + i * st, tSmile + (i + 1) * st], [tRelax + (2 - i) * st, tRelax + (3 - i) * st]]
      : [[tSmile + 3 * st, tRelax]]
    jn += shown(egPath(p), on, T)
  })
  // blinks, on a period that divides the story
  const lids = new Pix()
  eyes.forEach(e => lids.rect(jx + e, jy + 2, 2, 3, k.skin))
  jn += `<g opacity="0">${egPath(lids)}<animate attributeName="opacity" calcMode="discrete" dur="${egPer(4)}s" begin="-1.2s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.93;0.96"/></g>`
  s += jn

  return s
}
