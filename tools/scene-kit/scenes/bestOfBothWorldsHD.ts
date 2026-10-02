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

