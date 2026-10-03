// ---------- Cause and Effect: "the number three" ----------
// A quiet bridge; the Enterprise on the viewscreen. A temporal distortion opens and the
// USS Bozeman slides out of it, on a collision course. At ops, Data (Clawd) watches his
// readout resolve into three dots and a "3", looks round, and sees Riker's three pips
// catch the light. Riker raises a claw: decompress the main shuttlebay. Data presses it,
// a puff of air lifts the Enterprise, the Bozeman slips by underneath with only a soft
// glow where the shields brush, the distortion closes and space is calm again.
// The last frame is the first: the loop, broken, starts over.

const CE_DATA: CrabHD = {
  skin: '#e9dfbf',
  light: '#f7f0d8',
  shade: '#bfb38c',
  upper: '#1c1424',
  lower: '#c99a22',
  lowerShade: '#9a7414',
  legs: '#1c1424',
  rim: '#fff6dc',
}

const CE_RIKER: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f2a985',
}

// a plain rect in art pixels
const ceR = (x: number, y: number, w: number, h: number, c: string, extra = '') =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"${extra}/>`

function ceRnd(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

// one eased animation on the story timeline: keys are [seconds, value, spline into it]
const CE_EASE = '0.42 0 0.58 1'
function ceAnim(attr: string, keys: [number, string, string?][], tag = 'animate', extra = '') {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(5))
  kt[kt.length - 1] = 1
  return `<${tag} attributeName="${attr}" ${extra}dur="${T}s" repeatCount="indefinite" calcMode="spline" keySplines="${k.slice(1).map(x => x[2] ?? CE_EASE).join(';')}" values="${k.map(x => x[1]).join(';')}" keyTimes="${kt.join(';')}"/>`
}
const ceFade = (keys: [number, number, string?][]) => ceAnim('opacity', keys.map(([t, v, sp]) => [t, String(v), sp] as [number, string, string?]))
const ceMove = (keys: [number, number, number, string?][]) =>
  ceAnim('transform', keys.map(([t, x, y, sp]) => [t, `${+(x * Q).toFixed(2)} ${+(y * Q).toFixed(2)}`, sp] as [number, string, string?]), 'animateTransform', 'type="translate" ')
// a soft local glow: rises over `up` s, holds, fades over `down` s
const ceGlow = (t: number, up: number, hold: number, down: number, peak = 1) =>
  ceFade([[t, 0], [t + up, peak], [t + up + hold, peak], [t + up + hold + down, 0]])
// ambient loops divide the story, with a negative begin for phase, so the restart is seamless
const ceAmb = (vals: string, div: number, begin = 0) =>
  `<animate attributeName="opacity" values="${vals}" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" dur="${(SCENE_SECONDS / div).toFixed(4)}s" begin="${(-begin).toFixed(3)}s" repeatCount="indefinite"/>`

// eyes that glance one pixel at a time: keys [t, dx, dy] -> windows per position
type CeGaze = [number, number, number][]
function ceGazePlan(keys: CeGaze) {
  const T = SCENE_SECONDS
  const out: [number, number, number, number][] = []
  let pos: [number, number] = [keys[0][1], keys[0][2]]
  let start = 0
  for (const [tk, gx, gy] of keys.slice(1)) {
    out.push([start, tk, pos[0], pos[1]])
    start = tk
    while (pos[0] !== gx || pos[1] !== gy) {
      pos = [pos[0] + Math.sign(gx - pos[0]), pos[1] + Math.sign(gy - pos[1])]
      if (pos[0] === gx && pos[1] === gy) break
      out.push([start, start + 0.08, pos[0], pos[1]])
      start = +(start + 0.08).toFixed(3)
    }
  }
  out.push([start, T, pos[0], pos[1]])
  return out
}

function ceInter(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = []
  for (const [a0, a1] of a) for (const [b0, b1] of b) {
    const lo = Math.max(a0, b0)
    const hi = Math.min(a1, b1)
    if (hi > lo) out.push([lo, hi])
  }
  return out
}

// a crab whose eyes follow a gaze plan and blink on cue
function ceCrab(
  k: CrabHD, x: number, y: number, look: Side,
  gaze: CeGaze, blinks: [number, number][],
  eye: (p: Pix, ex: number, ey: number, dx: number) => void,
  shut: string,
  details: (p: Pix) => void,
  shutRow = 4,
) {
  const T = SCENE_SECONDS
  const { p } = clawdBody(k, x, y, look)
  p.rect(x + 3, y + 1, 12, 4, k.skin)
  details(p)
  let s = p.svg()
  s += armRestHD(k, x, y, 'left') + armRestHD(k, x, y, 'right')
  const open = complement(merge(blinks), T)
  const by = new Map<string, [number, number][]>()
  for (const [a, b, dx, dy] of ceGazePlan(gaze)) {
    const key = `${dx},${dy}`
    if (!by.has(key)) by.set(key, [])
    by.get(key)!.push([a, b])
  }
  for (const [key, w] of by) {
    const [dx, dy] = key.split(',').map(Number)
    const e = new Pix()
    for (const ex of [5, 11]) eye(e, x + ex + dx, y + 2 + dy, dx)
    s += shown(e.svg(), ceInter(merge(w), open), T)
    const c = new Pix()
    for (const ex of [5, 11]) c.rect(x + ex + dx, y + shutRow + dy, 2, 1, shut)
    const bw = ceInter(merge(w), merge(blinks))
    if (bw.length) s += shown(c.svg(), bw, T)
  }
  return s
}

// a raised claw that rises smoothly out of the shoulder (clipped at the shoulder line)
// keys: [seconds, rows still hidden (0 = fully up, 12 = down), spline]
function ceArmRise(id: string, k: CrabHD, x: number, y: number, side: Side, keys: [number, number, string?][]) {
  const cx = side === 'left' ? x - 5 : x + 17
  return `<clipPath id="${id}"><rect x="${cx * Q}" y="${(y - 9) * Q}" width="${7 * Q}" height="${13 * Q}"/></clipPath><g clip-path="url(#${id})"><g transform="translate(0 ${12 * Q})">${armUpHD(k, x, y, side)}${ceAnim('transform', keys.map(([t, r, sp]) => [t, `0 ${r * Q}`, sp] as [number, string, string?]), 'animateTransform', 'type="translate" ')}</g></g>`
}

// screen content area, in art pixels
const CE_SX = 34
const CE_SY = 2
const CE_SW = 53
const CE_SH = 23

// the Enterprise-D, side on, facing left (24 x 9; top-left at 0,0)
function ceEnterprise() {
  const pal: Record<string, string> = {
    b: '#f0f2f8', w: '#e2e4ee', W: '#c5c8d6', o: '#ffe6a0', g: '#8d90a3', h: '#aeb1c1', H: '#9598aa',
    k: '#5d6074', d: '#ffb45a', D: '#e0803a', r: '#e0503a', n: '#d0d3df', N: '#7cc4ff', p: '#8d90a3',
  }
  const rows = [
    '....bw..................',
    '.wwwwwwwwwww............',
    'WWoWWoWWoWWoWW..........',
    '.ggggggggggggg...rnnnnnn',
    '......kHHHk.....hNNNNNNk',
    '.......hhh.....pp.......',
    '.....dhhhhhhhhhhhhhh....',
    '.....DHHHHHHHoHHHHHHh...',
    '......kkkkkkkkkkkkkk....',
  ]
  let s = new Pix().rows(rows, 0, 0, pal).svg()
  // the nacelle glow breathes very slightly
  s += `<g>${new Pix().rect(17, 4, 6, 1, '#b4e0ff').svg()}${ceAmb('0.25;0.7;0.25', 6, 0.7)}</g>`
  return s
}

// the USS Bozeman (Soyuz class), side on, facing right (18 x 7; top-left at 0,0)
function ceBozeman() {
  const pal: Record<string, string> = {
    x: '#a49e92', s: '#ddd7cc', S: '#c3bdb1', o: '#ffe6a0', g: '#8e897f', k: '#69655d', m: '#b2ac9f',
    M: '#8f897d', p: '#7c776d', n: '#c8c2b6', N: '#8ab8ff', r: '#d9563f', R: '#b8402e',
  }
  const rows = [
    '.mm.....xxxx......',
    'mmmm...x....x.....',
    'MMMMm.sssssssss...',
    'mMMMMSSoSSoSSoSSS.',
    '..kkkgggggggggggk.',
    '..p.......p.......',
    'nnnnnnnnnnnr......',
    'NNNNNNNNNNR.......',
  ]
  return new Pix().rows(rows, 0, 0, pal).svg()
}

// the temporal distortion: a pale blue vertical swirl with slow ripples
function ceDistortion() {
  const T = SCENE_SECONDS
  let arms = ''
  const seg = (base: number, t0: number, t1: number) => {
    const pts: string[] = []
    for (let t = t0; t <= t1 + 0.001; t += 0.2) {
      const r = 3 + t * 2.4
      pts.push(`${(r * Math.cos(base + t)).toFixed(1)},${(r * Math.sin(base + t)).toFixed(1)}`)
    }
    return pts.join(' ')
  }
  const bands: [number, number, number, string, number][] = [
    [0, 1.8, 2.2, '#e4f6ff', 0.7],
    [1.8, 3.6, 1.8, '#a8dcff', 0.55],
    [3.6, 5.4, 1.4, '#6fb0f0', 0.42],
    [5.4, 6.6, 1.0, '#4c86d0', 0.3],
  ]
  for (let a = 0; a < 3; a++) {
    const base = (a * 2 * Math.PI) / 3
    for (const [t0, t1, w, c, o] of bands) arms += `<polyline points="${seg(base, t0, t1)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`
  }
  // ripples: three thin rings widening and fading, one after another
  let rings = ''
  const RD = T / 6
  for (let i = 0; i < 3; i++) {
    const b = (-i * RD / 3).toFixed(3)
    rings += `<ellipse rx="4" ry="6" fill="none" stroke="#bfe8ff" stroke-width="1" opacity="0"><animate attributeName="rx" values="4;20" dur="${RD.toFixed(4)}s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="ry" values="6;26" dur="${RD.toFixed(4)}s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.45;0" keyTimes="0;0.25;1" dur="${RD.toFixed(4)}s" begin="${b}s" repeatCount="indefinite"/></ellipse>`
  }
  return (
    `<ellipse rx="30" ry="38" fill="url(#ceDistGlow)"/>` +
    rings +
    `<g transform="scale(0.62 1)"><g>${arms}<animateTransform attributeName="transform" type="rotate" values="0;360" dur="${(T / 3).toFixed(4)}s" repeatCount="indefinite"/></g></g>` +
    `<ellipse rx="3" ry="8" fill="#d8f2ff" opacity="0.55"/><ellipse rx="1.5" ry="5" fill="#f2fbff" opacity="0.7"/>`
  )
}

function causeAndEffect() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q

  // ---- the beat sheet (authored seconds; played = x 0.5824)
  const distOpen: [number, number] = [2.8, 5.0]
  const bozIn = 3.6 // the Bozeman slides out of the distortion
  const bozOut = 6.0
  const dots = [6.2, 6.8, 7.4] // three dots on Data's readout
  const three = 7.6 // ... and a "3"
  const pips = [7.9, 8.3, 8.7] // Riker's three pips catch the light
  const clawUp = 8.7 // Riker: "decompress the main shuttlebay"
  const press: [number, number] = [9.0, 9.9] // Data presses it
  const puff = 9.2
  const lift: [number, number] = [9.2, 10.5] // the Enterprise rises out of the way
  const pass: [number, number] = [10.4, 14.6] // the Bozeman slips by underneath
  const brush = 10.75 // shields brush: a soft local glow
  const clawDown = 12.2
  const readOff: [number, number] = [12.8, 14.2]
  const distClose: [number, number] = [13.0, 15.0]
  const settle: [number, number] = [13.6, 15.8]

  let s = `<defs>
    <linearGradient id="ceFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="ceFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#ceFadeG)"/></mask>
    <linearGradient id="ceFadeCG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.12" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="ceFadeC"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#ceFadeCG)"/></mask>
    <linearGradient id="ceWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18131f"/><stop offset="1" stop-color="#322639"/></linearGradient>
    <linearGradient id="ceSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04050c"/><stop offset="1" stop-color="#0a0c1c"/></linearGradient>
    <radialGradient id="ceNeb"><stop offset="0" stop-color="#4f78c8" stop-opacity="0.16"/><stop offset="1" stop-color="#4f78c8" stop-opacity="0"/></radialGradient>
    <radialGradient id="ceDistGlow"><stop offset="0" stop-color="#bfe6ff" stop-opacity="0.5"/><stop offset="0.45" stop-color="#6aa8ec" stop-opacity="0.22"/><stop offset="1" stop-color="#3a64b0" stop-opacity="0"/></radialGradient>
    <radialGradient id="ceSpill"><stop offset="0" stop-color="#8cc4ff" stop-opacity="0.2"/><stop offset="1" stop-color="#8cc4ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ceWarm"><stop offset="0" stop-color="#ffcf9a" stop-opacity="0.1"/><stop offset="1" stop-color="#ffcf9a" stop-opacity="0"/></radialGradient>
    <radialGradient id="ceSoft"><stop offset="0" stop-color="#e2f4ff" stop-opacity="0.85"/><stop offset="0.5" stop-color="#a8d8ff" stop-opacity="0.35"/><stop offset="1" stop-color="#a8d8ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="cePip"><stop offset="0" stop-color="#fff3b0" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="ceKey"><stop offset="0" stop-color="#bfe4ff" stop-opacity="0.7"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>
    <pattern id="ceScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="2" fill="#000" opacity="0.08"/></pattern>
    <clipPath id="ceScreen"><rect x="${CE_SX * Q}" y="${CE_SY * Q}" width="${CE_SW * Q}" height="${CE_SH * Q}"/></clipPath>
  </defs>`

  // ---- the bridge, fading in from the band on the left
  let back = `<rect x="-6" y="-6" width="${W + 12}" height="${H + 12}" fill="url(#ceWall)"/>`
  back += ceR(0, 0, GW, 2, '#120d17') + ceR(0, 1, GW, 1, '#ffd9a0', ' opacity="0.28"')
  back += `<ellipse cx="${18 * Q}" cy="${16 * Q}" rx="60" ry="40" fill="url(#ceWarm)"/>`
  // wall ribs on the far left
  const rib = new Pix()
  for (const x of [4, 12]) rib.rect(x, 3, 1, 26, '#251c2e').rect(x + 1, 3, 1, 26, '#3a2e44')
  back += rib.svg()
  // the ops readout panel: LCARS frame and a dark display
  const lc = new Pix()
  lc.rect(19, 3, 14, 20, '#0b0910')
  lc.rect(20, 4, 12, 2, '#f29a3a').rect(20, 6, 2, 14, '#f29a3a').set(20, 4, '#0b0910').set(31, 4, '#c9a7ff')
  lc.rect(20, 20, 12, 1, '#b48fd6').rect(20, 17, 2, 1, '#0b0910').rect(20, 18, 2, 2, '#c39be0')
  lc.rect(23, 7, 9, 12, '#05070d').rect(23, 7, 9, 1, '#141a26')
  // a faint sensor trace along the bottom of the display
  ;[[23, 17], [24, 17], [25, 16], [26, 17], [27, 17], [28, 16], [29, 17], [30, 17], [31, 16]].forEach(([x, y]) => lc.set(x, y, '#20405a'))
  back += lc.svg()
  ;[[23, 21, 5], [26, 21, 7], [29, 21, 6]].forEach(([x, y, d], i) => {
    back += `<g>${ceR(x, y, 2, 1, i === 1 ? '#8aa7e8' : '#f7c487')}${ceAmb('1;0.45;1', d, i * 0.7)}</g>`
  })
  // wood trim, baseboard, carpet
  const wall = new Pix()
  wall.rect(0, 29, GW, 2, '#5e3f2c').rect(0, 29, GW, 1, '#8a6040')
  wall.rect(0, 33, GW, 1, '#0f0b13')
  wall.rect(0, 34, GW, 14, '#1d1724').rect(0, 34, GW, 1, '#2c2236')
  wall.rect(0, 38, GW, 1, '#221b2a').rect(58, 43, GW - 58, 1, '#19141f')
  for (let x = 2; x < GW; x += 9) wall.rect(x, 31, 1, 2, '#2a2030')
  back += wall.svg()
  // the distortion's pale blue light on the wall and floor
  back += `<g opacity="0"><ellipse cx="${48 * Q}" cy="${31 * Q}" rx="86" ry="20" fill="url(#ceSpill)"/>${ceFade([[distOpen[0], 0], [distOpen[1], 1], [distClose[0], 1], [distClose[1], 0]])}</g>`
  s += `<g mask="url(#ceFade)">${back}</g>`

  // ---- the pattern on Data's readout: three dots, then a 3
  const dotArt = (x: number) => new Pix().rect(x, 9, 2, 2, '#e8c547').set(x, 9, '#fff3b0').svg()
  ;[24, 27, 30].forEach((x, i) => {
    s += `<g opacity="0">${dotArt(x)}${ceFade([[dots[i], 0], [dots[i] + 0.45, 1], [readOff[0] + i * 0.15, 1], [readOff[1], 0]])}</g>`
    s += `<g opacity="0"><circle cx="${(x + 1) * Q}" cy="${10 * Q}" r="5" fill="url(#cePip)"/>${ceGlow(dots[i], 0.45, 0.1, 0.9, 0.7)}</g>`
  })
  const glyph = new Pix().rows(['xxxx', '...x', '.xxx', '...x', 'xxxx'], 26, 12, { x: '#8fd0ff' })
  s += `<g opacity="0">${glyph.svg()}${ceFade([[three, 0], [three + 0.5, 1], [readOff[0], 1], [readOff[1], 0]])}</g>`

  // ---- the viewscreen
  const bez = new Pix()
  bez.rect(33, 1, 55, 25, '#0e0b12').rect(34, 1, 53, 1, '#4a4152').rect(33, 2, 1, 23, '#2a2330').rect(87, 2, 1, 23, '#2a2330')
  bez.rect(34, 25, 53, 1, '#3a3142')
  s += bez.svg()

  let scr = `<rect x="${CE_SX * Q}" y="${CE_SY * Q}" width="${CE_SW * Q}" height="${CE_SH * Q}" fill="url(#ceSpace)"/>`
  scr += `<ellipse cx="${74 * Q}" cy="${20 * Q}" rx="56" ry="18" fill="url(#ceNeb)"/>`
  const rnd = ceRnd(87)
  for (let y = CE_SY; y < CE_SY + CE_SH; y += 2) {
    for (let x = CE_SX; x < CE_SX + CE_SW; x += 3) {
      if (rnd() < 0.7) continue
      const jx = x + Math.floor(rnd() * 3)
      scr += ceR(jx, y, 1, 1, '#c8d4f0', ` opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"`)
    }
  }
  ;[[38, 4], [56, 22], [84, 3], [52, 5], [80, 22]].forEach(([x, y], i) => {
    const glow = new Pix().set(x - 1, y, '#a8bce8').set(x + 1, y, '#a8bce8').set(x, y - 1, '#a8bce8').set(x, y + 1, '#a8bce8')
    scr += `<g>${glow.svg()}${ceAmb('0.15;0.7;0.15', [6, 5, 4, 6, 5][i], i * 0.6)}</g>`
    scr += `<g>${new Pix().set(x, y, '#f2f4ff').svg()}${ceAmb('0.6;1;0.6', [6, 5, 4, 6, 5][i], i * 0.6)}</g>`
  })

  // the distortion: opens out of nothing, swirls, closes calmly
  const dx = 45
  const dy = 15
  const distScale = ceAnim('transform', [[distOpen[0], '0.05'], [distOpen[1], '1'], [distClose[0], '1'], [distClose[1], '0.05']], 'animateTransform', 'type="scale" ')
  scr += `<g transform="translate(${dx * Q} ${dy * Q})"><g>${distScale}<g opacity="0">${ceFade([[distOpen[0], 0], [distOpen[0] + 1.6, 1], [distClose[0] + 0.5, 1], [distClose[1], 0]])}${ceDistortion()}</g></g></g>`

  // the Enterprise: holds station, lifts on the decompression, settles back
  const ex = 62
  const ey = 10
  scr += `<g transform="translate(${ex * Q} ${ey * Q})"><g>${ceMove([[lift[0], 0, 0], [lift[1], 0, -6], [settle[0], 0, -6], [settle[1], 0, 0]])}${ceEnterprise()}</g></g>`

  // the decompression: a puff of air from the main shuttlebay, drifting aft and thinning
  const bayX = 74
  const bayY = 11
  const prnd = ceRnd(9)
  for (let i = 0; i < 6; i++) {
    const tx = 3 + prnd() * 7
    const ty = -2 - prnd() * 4
    const t0 = puff + i * 0.08
    const r0 = 1
    const r1 = 2.2 + prnd() * 1.6
    scr += `<g transform="translate(${bayX * Q} ${bayY * Q})"><circle r="${r0}" fill="#e8f0fa" opacity="0">${ceFade([[t0, 0], [t0 + 0.45, 0.7], [t0 + 1.0, 0.55], [t0 + 2.3, 0]])}${ceAnim('r', [[t0, String(r0)], [t0 + 2.3, r1.toFixed(1)], [t0 + 2.4, String(r0)]])}${ceMove([[t0, 0, 0], [t0 + 2.3, tx, ty, '0.2 0.6 0.4 1'], [t0 + 2.4, 0, 0, '0 0 1 1']])}</circle></g>`
  }

  // the Bozeman: out of the distortion, creeping on, then slipping past underneath
  const bz = ceBozeman()
  const bozMove = ceMove([
    [bozIn, 44, 17],
    [bozOut, 46, 17],
    [9.4, 48, 17, '0 0 1 1'],
    [pass[0], 54, 17, '0.5 0 1 1'],
    [pass[1], 104, 17, '0 0 1 1'],
    [pass[1] + 0.1, 44, 17, '0 0 1 1'],
  ])
  const bozScale = ceAnim('transform', [[bozIn, '0.15'], [bozOut, '1'], [pass[1], '1'], [pass[1] + 0.1, '0.15', '0 0 1 1']], 'animateTransform', 'type="scale" ')
  scr += `<g opacity="0">${ceFade([[bozIn, 0], [bozIn + 0.9, 1], [13.4, 1], [14.2, 0]])}<g>${bozMove}<g>${bozScale}<g transform="translate(${-9 * Q} ${-3 * Q})">${bz}</g></g></g></g>`

  // where the shields brush: a small soft glow, no more
  scr += `<g opacity="0"><ellipse cx="${66 * Q}" cy="${13.5 * Q}" rx="9" ry="5" fill="url(#ceSoft)"/>${ceGlow(brush, 0.45, 0.1, 1.1, 0.9)}</g>`
  scr += `<g opacity="0"><path d="M${58 * Q} ${12.5 * Q} Q ${66 * Q} ${14.5 * Q} ${76 * Q} ${12.5 * Q}" fill="none" stroke="#bfe6ff" stroke-width="1"/>${ceGlow(brush - 0.05, 0.45, 0.1, 1.0, 0.45)}</g>`

  scr += `<rect x="${CE_SX * Q}" y="${CE_SY * Q}" width="${CE_SW * Q}" height="${CE_SH * Q}" fill="url(#ceScan)"/>`
  scr += `<polygon points="${36 * Q},${2 * Q} ${42 * Q},${2 * Q} ${36 * Q},${8 * Q}" fill="#ffffff" opacity="0.05"/>`
  s += `<g clip-path="url(#ceScreen)">${scr}</g>`

  // ---- Data at ops
  const dX = 12
  const dY = 25
  const dataEye = (p: Pix, x: number, y: number, ddx: number) => {
    p.rect(x, y, 2, 3, '#e8b818').set(x, y, '#f6d84a').set(x + 1, y, '#f6d84a')
    p.rect(ddx < 0 ? x : x + 1, y + 1, 1, 2, '#3a2a08')
  }
  s += ceCrab(
    CE_DATA, dX, dY, 'right',
    // the screen, the readout above him, Riker, the console, the screen again
    [[0, 1, -1], [6.0, 0, -1], [7.6, 1, 0], [8.95, 1, 1], [10.0, 1, -1]],
    [[4.6, 4.72], [15.2, 15.32]],
    dataEye, '#6a5a2a',
    p => {
      // black hair slicked back, a widow's peak
      p.rect(dX + 1, dY - 1, 16, 1, '#141018').rect(dX + 5, dY - 1, 6, 1, '#2e2a3a')
      p.rect(dX, dY, 18, 1, '#141018').rect(dX + 3, dY, 4, 1, '#3a3448').rect(dX + 8, dY + 1, 2, 1, '#141018')
      p.set(dX, dY + 1, '#141018').set(dX + 17, dY + 1, '#141018')
      // combadge; two full pips and a hollow one
      p.rect(dX + 4, dY + 6, 2, 2, '#e8c547').set(dX + 4, dY + 6, '#fff3b0')
      p.set(dX + 10, dY + 6, '#e8c547').set(dX + 12, dY + 6, '#e8c547').set(dX + 14, dY + 6, '#7a6a2a')
    },
  )
  // the ops console in front of him (kept short so the title corner stays plain)
  const con = new Pix()
  con.rect(5, 35, 32, 1, '#9a8fa6').rect(4, 36, 34, 1, '#0b0910').rect(5, 35, 1, 1, '#5b5266')
  con.rect(6, 36, 4, 1, '#f29a3a').rect(11, 36, 3, 1, '#8aa7e8').rect(15, 36, 5, 1, '#c39be0').rect(21, 36, 3, 1, '#f7c487').rect(26, 36, 3, 1, '#c39be0')
  con.rect(4, 37, 34, 4, '#4a3020').rect(4, 37, 34, 1, '#7a5236').rect(4, 40, 34, 1, '#2e1e14')
  for (const x of [11, 19, 27]) con.rect(x, 38, 1, 2, '#33221a')
  s += `<g mask="url(#ceFadeC)">${con.svg()}</g>`
  // his claw reaches down onto the console and presses (slides down out of the shoulder)
  const prPal = { S: CE_DATA.skin, s: CE_DATA.shade, L: CE_DATA.light }
  const prTop = new Pix().rows(['SSS', 'sSSS'], dX + 18, dY + 4, prPal)
  const pr = new Pix().rows(['.sSS...', '..SS...', '..SSs..', '.LSSSL.', '.S...S.'], dX + 18, dY + 6, prPal)
  const IN = '0.55 0 0.85 0.4'
  s += shown(prTop.svg(), [[press[0] - 0.1, press[1] + 0.4]], T)
  s += `<clipPath id="cePressClip"><rect x="${(dX + 18) * Q}" y="${(dY + 6) * Q}" width="${7 * Q}" height="${5 * Q}"/></clipPath><g clip-path="url(#cePressClip)"><g transform="translate(0 ${-5 * Q})">${pr.svg()}${ceMove([[press[0], 0, -5], [press[0] + 0.4, 0, 0, IN], [press[1], 0, 0], [press[1] + 0.35, 0, -5]])}</g></g>`
  // the shuttlebay key: lights softly when pressed
  s += ceR(32, 36, 3, 1, '#3a6a9a')
  s += `<g opacity="0">${ceR(32, 36, 3, 1, '#9cd4ff')}<ellipse cx="${33.5 * Q}" cy="${36.5 * Q}" rx="7" ry="3" fill="url(#ceKey)"/>${ceFade([[press[0] + 0.3, 0], [press[0] + 0.75, 1], [press[1] + 0.6, 1], [press[1] + 1.6, 0]])}</g>`

  // ---- Riker, standing before the screen, facing Data
  const rX = 66
  const rY = 28
  const hair = '#3b2518'
  const hairHi = '#6a4228'
  const beard = '#2e1a10'
  const beardHi = '#4a2c1a'
  s += ceCrab(
    CE_RIKER, rX, rY, 'left',
    [[0, -1, -1], [7.7, -1, 0], [9.5, -1, -1]],
    [[1.6, 1.75], [12.9, 13.05]],
    (p, x, y) => p.rect(x, y, 2, 2, EYE_HD),
    EYE_HD,
    p => {
      // a full head of dark-brown hair: a cap above the head and a low hairline
      p.rect(rX + 4, rY - 2, 10, 1, hairHi).set(rX + 7, rY - 2, '#8a5a36').set(rX + 11, rY - 2, '#8a5a36')
      p.rect(rX + 2, rY - 1, 14, 1, hair).rect(rX + 3, rY - 1, 3, 1, hairHi).set(rX + 9, rY - 1, hairHi).set(rX + 13, rY - 1, hairHi)
      p.rect(rX + 1, rY, 16, 1, hair).set(rX + 5, rY, hairHi).set(rX + 12, rY, hairHi)
      // sideburns running down into a full beard over the lower face
      p.rect(rX, rY + 1, 2, 2, beard).rect(rX + 16, rY + 1, 2, 2, beard)
      p.rect(rX, rY + 3, 3, 1, beard).rect(rX + 13, rY + 3, 5, 1, beard)
      p.rect(rX, rY + 4, 18, 1, beard).rect(rX + 6, rY + 4, 6, 1, beardHi) // moustache
      p.rect(rX, rY + 5, 18, 1, beard).rect(rX + 7, rY + 5, 3, 1, '#a8503a') // mouth
      p.set(rX + 3, rY + 5, beardHi).set(rX + 14, rY + 5, beardHi)
      // the chin, over the collar
      p.rect(rX + 8, rY + 6, 4, 1, beardHi).rect(rX + 8, rY + 7, 3, 1, beard)
      // combadge and three pips
      p.rect(rX + 12, rY + 7, 2, 2, '#e8c547').set(rX + 12, rY + 7, '#fff3b0')
      p.set(rX + 2, rY + 6, '#e8c547').set(rX + 4, rY + 6, '#e8c547').set(rX + 6, rY + 6, '#e8c547')
    },
    3,
  )
  // the pips catch the light, one, two, three
  ;[2, 4, 6].forEach((c, i) => {
    s += `<g opacity="0"><circle cx="${(rX + c + 0.5) * Q}" cy="${(rY + 6.5) * Q}" r="4" fill="url(#cePip)"/>${ceR(rX + c, rY + 6, 1, 1, '#fffbe0')}${ceGlow(pips[i], 0.4, 0.2, 0.9)}</g>`
  })
  s += ceArmRise('ceRikerArm', CE_RIKER, rX, rY, 'left', [[clawUp, 12], [clawUp + 0.5, 0, '0.25 0.6 0.4 1'], [clawDown, 0], [clawDown + 0.5, 12, '0.5 0 0.75 0.6']])

  return s
}
