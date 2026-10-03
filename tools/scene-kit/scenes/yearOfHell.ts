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
