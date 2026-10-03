// ---------- Relics: "No bloody A, B, C or D." ----------
// Scotty asks the holodeck for the old ship, NCC-1701, and stands alone on the round
// bridge he served on: the viewscreen, the red rail, the jewel-button consoles, the
// captain's chair. He looks round, takes a sip of the green Aldebaran whiskey and
// raises his glass to the empty bridge.
// One 17.17 s story, played once (played seconds = authored x 0.582):
//  0.0 - 2.8   calm: Scotty by the rail, glass at his side, looking up at the viewscreen
//  2.8 - 5.8   he looks round the stations, then strolls over toward the captain's chair
//  5.8 - 9.0   a long, slow sip, eyes closed
//  9.0 - 13.4  he looks up at the screen and raises his glass to the old girl; a small nod
// 13.4 - 17.17 glass down, he strolls back, looking round once more: the opening shot

const RL_T = SCENE_SECONDS
const RL_EASE = '0.45 0 0.55 1'
const RL_X0 = 22 // Scotty's body, at the start and the end
const RL_Y = 28
const RL_WALK = 14 // how far he strolls (art px)

const RL_SC = {
  skin: '#d97757', light: '#eb9575', shade: '#b85f43', rim: '#f6a77c',
  red: '#c8322c', redLight: '#e2564a', redDark: '#8e1f1e',
  black: '#17121e', blackL: '#2e2638',
  gold: '#e8c547', goldL: '#fff3b0',
  hair: '#c3bfca', hairL: '#efedf3', hairD: '#8a8594',
}
const RL_GLASS = { r: '#c4dde2', s: '#9fb6bc', w: '#e6f8f8', L: '#a6f2b4', g: '#3cc860', d: '#22844a' }

const rlKt = (ts: number[]) => ts.map(t => +(t / RL_T).toFixed(5)).join(';')

// a smooth eased move on the story timeline: [t, x, y] in art px, held flat between keys
function rlTrack(pts: [number, number, number][], spline = RL_EASE) {
  const list = [...pts]
  if (list[0][0] > 0) list.unshift([0, list[0][1], list[0][2]])
  const last = list[list.length - 1]
  if (last[0] < RL_T) list.push([RL_T, last[1], last[2]])
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${RL_T}s" repeatCount="indefinite" values="${list.map(p => `${+(p[1] * Q).toFixed(2)} ${+(p[2] * Q).toFixed(2)}`).join(';')}" keyTimes="${rlKt(list.map(p => p[0]))}" keySplines="${list.slice(1).map(() => spline).join(';')}"/>`
}

// a gentle lift on every step of a walk (amp in art px, phase 0 or 0.5 of a step)
function rlBob(walks: [number, number, number][], amp: number, phase: number) {
  const pts: [number, number, number][] = [[0, 0, 0]]
  for (const [a, b, step] of walks) {
    for (let t = a + phase * step; t + step <= b + 0.001; t += step) {
      pts.push([+t.toFixed(3), 0, 0], [+(t + step / 2).toFixed(3), 0, -amp], [+(t + step).toFixed(3), 0, 0])
    }
  }
  return rlTrack(pts, '0.45 0 0.55 1')
}

function rlInter(a: [number, number][], b: [number, number][]) {
  const out: [number, number][] = []
  for (const [a0, a1] of a) for (const [b0, b1] of b) {
    const lo = Math.max(a0, b0)
    const hi = Math.min(a1, b1)
    if (hi > lo) out.push([lo, hi])
  }
  return out
}

function rlLine(x0: number, y0: number, x1: number, y1: number) {
  const pts: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    pts.push([x0, y0])
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) (err += dy), (x0 += sx)
    if (e2 <= dx) (err += dx), (y0 += sy)
  }
  return pts
}

// a slow blinking console light: on, then dim, n times per story
function rlBlink(px: string, n: number, off: number) {
  const d = +(RL_T / n).toFixed(5)
  return `<g>${px}<animate attributeName="opacity" calcMode="discrete" values="1;0.2" keyTimes="0;0.5" dur="${d}s" begin="${(-off * d).toFixed(3)}s" repeatCount="indefinite"/></g>`
}

function relics() {
  const T = RL_T
  const W = GW * Q
  const H = GH * Q
  let seed = 1701
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // the viewscreen interior
  const VX = 38, VY = 3, VW = 33, VH = 13

  let s = `<defs>
    <linearGradient id="rlFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="rlFade"><rect width="${W}" height="${H}" fill="url(#rlFadeG)"/></mask>
    <clipPath id="rlFloor"><rect x="0" y="${24 * Q}" width="${W}" height="${24 * Q}"/></clipPath>
    <clipPath id="rlScr"><rect x="${VX * Q}" y="${VY * Q}" width="${VW * Q}" height="${VH * Q}"/></clipPath>
    <radialGradient id="rlScreenGlow"><stop offset="0" stop-color="#7aa8ff" stop-opacity="0.16"/><stop offset="1" stop-color="#7aa8ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="rlWarm"><stop offset="0" stop-color="#ffd6a0" stop-opacity="0.12"/><stop offset="1" stop-color="#ffd6a0" stop-opacity="0"/></radialGradient>
    <radialGradient id="rlSci"><stop offset="0" stop-color="#6aa8ff" stop-opacity="0.5"/><stop offset="1" stop-color="#6aa8ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="rlShadeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120e18" stop-opacity="0"/><stop offset="1" stop-color="#120e18" stop-opacity="0.55"/></linearGradient>
  </defs>`

  // ================= the round bridge, faded in from the band on the left =================
  const room = new Pix()
  // ceiling ring and the top trim
  room.rect(0, 0, GW, 2, '#18141f').rect(0, 1, GW, 1, '#221d2b')
  room.rect(0, 2, GW, 1, '#4a4458')
  // the bulkhead wall around the bridge
  room.rect(0, 3, GW, 6, '#3a3446')
  room.rect(0, 9, GW, 1, '#5a546c')
  // the monitor band: a screen over every station, each with its own little readout
  const mon = (x: number, kind: number) => {
    room.rect(x - 1, 3, 8, 6, '#141118').rect(x - 1, 8, 8, 1, '#4c4658')
    const bg = ['#1f4fa8', '#1a5e36', '#9a5a18', '#5e2462', '#16606e', '#7a1e22'][kind]
    const fg = ['#e8f0ff', '#62e08a', '#ffc860', '#f08ad8', '#8af0f0', '#ff8a6a'][kind]
    room.rect(x, 4, 6, 4, bg)
    if (kind === 0) room.rect(x + 1, 5, 3, 1, fg).rect(x + 1, 6, 4, 1, fg).set(x + 5, 5, '#ffd060')
    if (kind === 1) room.set(x + 2, 4, fg).set(x + 1, 5, fg).set(x + 3, 5, fg).set(x + 2, 6, fg).set(x + 4, 6, fg).set(x + 3, 7, fg).set(x + 5, 5, fg)
    if (kind === 2) for (let i = 0; i < 6; i += 2) room.rect(x + i, 4, 1, 4, fg).rect(x, 5 + (i % 4) / 2, 6, 1, fg)
    if (kind === 3) room.set(x, 6, fg).set(x + 1, 5, fg).set(x + 2, 5, fg).set(x + 3, 6, fg).set(x + 4, 7, fg).set(x + 5, 6, fg)
    if (kind === 4) room.rect(x + 1, 6, 1, 2, fg).rect(x + 2, 5, 1, 3, fg).rect(x + 3, 4, 1, 4, fg).rect(x + 4, 6, 1, 2, fg)
    if (kind === 5) room.rect(x + 1, 5, 4, 2, fg).set(x + 2, 5, '#ffe0c0').rect(x, 4, 6, 1, '#a8302a')
  }
  ;[[2, 4], [10, 2], [18, 0], [27, 3], [75, 1], [83, 5]].forEach(([x, kd]) => mon(x, kd))
  // the station consoles under the screens: jewel buttons on the sloped panel, then the dark front
  const consoleRun = (x0: number, x1: number) => {
    room.rect(x0, 10, x1 - x0, 1, '#6e6884')
    room.rect(x0, 11, x1 - x0, 3, '#28232f')
    room.rect(x0, 14, x1 - x0, 3, '#17131c')
    room.rect(x0, 14, x1 - x0, 1, '#211c28')
    const jewels = ['#e8423a', '#f2c23a', '#4a8ae8', '#56c46a', '#f0f0f6', '#ff8a3a']
    for (let x = x0 + 1; x < x1 - 1; x += 3) {
      room.rect(x, 11, 2, 1, jewels[(x * 7) % 6]).rect(x, 12, 2, 1, jewels[(x * 5 + 2) % 6])
      room.set(x, 13, '#3a3444')
    }
    for (let x = x0; x < x1; x += 8) room.rect(x, 10, 1, 7, '#1a1620')
  }
  consoleRun(0, 36)
  consoleRun(73, GW)
  // empty swivel chairs at the stations
  const stChair = (x: number) => room.rect(x, 13, 4, 3, '#2a2430').rect(x, 13, 4, 1, '#4a4254').rect(x + 1, 16, 2, 1, '#221d28')
  ;[5, 13, 29, 78, 86].forEach(stChair)
  // upper deck carpet, the red rail, the step down into the well
  room.rect(0, 17, 37, 1, '#4a1c26').rect(72, 17, 18, 1, '#4a1c26')
  const rail = (x0: number, x1: number) => {
    room.rect(x0, 18, x1 - x0, 1, '#ec6a58').rect(x0, 19, x1 - x0, 1, '#c22a2c').rect(x0, 20, x1 - x0, 1, '#7a1a1e')
    for (let x = x0 + 2; x < x1; x += 7) room.rect(x, 21, 1, 2, '#9a2226')
  }
  room.rect(0, 21, 37, 2, '#2a2532').rect(72, 21, 18, 2, '#2a2532')
  room.rect(0, 22, 37, 1, '#4a4458').rect(72, 22, 18, 1, '#4a4458')
  rail(0, 35)
  rail(74, GW)
  // rounded rail ends
  room.set(35, 19, '#c22a2c').set(35, 20, '#7a1a1e').rect(35, 21, 1, 2, '#9a2226')
  room.set(73, 19, '#c22a2c').set(73, 20, '#7a1a1e').rect(73, 21, 1, 2, '#9a2226')
  // the forward bulkhead and the viewscreen
  room.rect(37, 2, 35, 21, '#2c2836')
  room.rect(36, 1, 37, 1, '#4c465a').rect(36, 1, 1, 17, '#4c465a').rect(72, 1, 1, 17, '#3a3446')
  room.rect(37, 2, 35, 15, '#0d0b12')
  room.rect(VX, VY, VW, VH, '#06050e')
  room.rect(37, 17, 35, 1, '#5a546c')
  room.rect(38, 19, 33, 1, '#24202c').rect(40, 20, 3, 1, '#e8423a').rect(66, 20, 3, 1, '#4a8ae8')
  // the well floor, with faint rings around the captain's chair
  room.rect(0, 23, GW, 25, '#201b28')
  room.rect(0, 23, GW, 1, '#16121c')
  s += `<g mask="url(#rlFade)">${room.svg()}<g clip-path="url(#rlFloor)" fill="none" stroke="#29232f" stroke-width="${Q}">${[9, 18, 27].map(r => `<ellipse cx="${56 * Q}" cy="${22 * Q}" rx="${r * 2.6 * Q}" ry="${r * Q}"/>`).join('')}</g>`

  // ---- the viewscreen: stars drifting slowly past a planet ----
  let scr = ''
  const tile = new Pix()
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(rnd() * VW)
    const y = VY + Math.floor(rnd() * VH)
    const b = rnd()
    tile.set(VX + x, y, b < 0.3 ? '#f2f4ff' : b < 0.6 ? '#9a9ac8' : '#5a5a86')
  }
  const tsvg = tile.svg()
  scr += `<g>${tsvg}<g transform="translate(${VW * Q} 0)">${tsvg}</g><animateTransform attributeName="transform" type="translate" values="0 0;${-VW * Q} 0" dur="${T}s" repeatCount="indefinite"/></g>`
  // a blue-green world low in the corner, lit from the upper left
  const pl = new Pix()
  const PCX = 61, PCY = 9, PR = 5
  for (let y = VY; y < VY + VH; y++) {
    for (let x = PCX - PR - 1; x <= PCX + PR + 1; x++) {
      const dx = x - PCX
      const dy = y - PCY
      const d = Math.hypot(dx, dy)
      if (d > PR + 0.4) continue
      const lit = (-dx * 0.6 - dy * 0.8) / PR // toward the light
      let c = lit > 0.55 ? '#7ad6d8' : lit > 0.2 ? '#3a9aa8' : lit > -0.2 ? '#22707e' : lit > -0.5 ? '#174a5a' : '#0e2a38'
      // cloud bands and a continent
      const band = Math.sin(dy * 2.1 + dx * 0.5)
      if (band > 0.82 && lit > -0.3) c = lit > 0.3 ? '#e2f6f4' : '#9ac8cc'
      if (Math.hypot(dx + 1, dy - 1.5) < 1.6 && lit > -0.1) c = lit > 0.35 ? '#8ac46a' : '#4a8a4a'
      if (d > PR - 0.7 && lit > 0.1) c = '#b8f2f4'
      pl.set(x, y, c)
    }
  }
  scr += pl.svg()
  s += `<g clip-path="url(#rlScr)">${scr}</g>`
  s += new Pix().rect(VX, VY, VW, 1, '#ffffff').svg().replace('<rect', '<rect opacity="0.07"')

  // ---- slow readouts on two of the monitors ----
  // a scan line crossing the blue screen, a blip walking round the green one
  s += `<rect x="${18 * Q}" y="${4 * Q}" width="${Q}" height="${4 * Q}" fill="#bcd4ff" opacity="0.7"><animateTransform attributeName="transform" type="translate" calcMode="discrete" values="0 0;${Q} 0;${2 * Q} 0;${3 * Q} 0;${4 * Q} 0;${5 * Q} 0;0 0" dur="${+(T / 6).toFixed(5)}s" repeatCount="indefinite"/></rect>`
  s += `<rect x="${75 * Q}" y="${4 * Q}" width="${Q}" height="${Q}" fill="#c8ffd8"><animateTransform attributeName="transform" type="translate" calcMode="discrete" values="0 0;${2 * Q} 0;${4 * Q} ${Q};${5 * Q} ${3 * Q};${3 * Q} ${3 * Q};${Q} ${2 * Q};0 0" dur="${+(T / 5).toFixed(5)}s" begin="-0.4s" repeatCount="indefinite"/></rect>`
  s += `<rect x="${2 * Q}" y="${7 * Q}" width="${6 * Q}" height="${Q}" fill="#2a3a5a"/><rect x="${2 * Q}" y="${7 * Q}" width="${Q}" height="${Q}" fill="#ff8a6a"><animateTransform attributeName="transform" type="translate" calcMode="discrete" values="0 0;${Q} 0;${2 * Q} 0;${3 * Q} 0;${4 * Q} 0;${5 * Q} 0;0 0" dur="${+(T / 4).toFixed(5)}s" begin="-0.3s" repeatCount="indefinite"/></rect>`

  // ---- the console lights: little 1 px lamps blinking slowly, never in step ----
  const lampSets: [number, number, string][][] = [[], [], [], [], [], [], [], []]
  let li = 0
  for (const [x0, x1] of [[0, 36], [73, GW], [38, 71]] as [number, number][]) {
    for (let x = x0 + 2; x < x1 - 1; x += 3) {
      const y = x0 === 38 ? 18 : 15 + (x % 2)
      if (x0 === 38 && (x < 44 || x > 64)) continue
      if (x0 === 38 && x % 2) continue
      lampSets[li % 8].push([x, y, ['#ff5a4a', '#ffd04a', '#6aa8ff', '#6ae08a', '#ffffff', '#ff9a4a'][(li * 5) % 6]])
      li++
    }
  }
  const lampN = [7, 9, 6, 11, 8, 10, 12, 6]
  lampSets.forEach((set, i) => {
    const p = new Pix()
    set.forEach(([x, y, c]) => p.set(x, y, c))
    s += rlBlink(p.svg(), lampN[i], [0.15, 0.7, 0.3, 0.85, 0.2, 0.62, 0.38, 0.8][i])
  })
  s += `</g>`

  // the science station's hooded scanner: a soft blue glow, breathing slowly
  s += `<ellipse cx="${84.5 * Q}" cy="${12 * Q}" rx="9" ry="5" fill="url(#rlSci)"><animate attributeName="opacity" values="0.7;1;0.7" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" dur="${+(T / 3).toFixed(5)}s" repeatCount="indefinite"/></ellipse>`
  s += new Pix().rect(83, 11, 3, 1, '#2a2632').rect(83, 12, 3, 1, '#8ab8ff').set(84, 12, '#d8e8ff').svg()
  // the screen's cool light on the well floor
  s += `<ellipse cx="${54 * Q}" cy="${24 * Q}" rx="70" ry="22" fill="url(#rlScreenGlow)"/>`

  // ---- the helm and navigation console, the astrogator between ----
  const helm = new Pix()
  helm.rect(54, 19, 3, 3, '#3c3648').set(54, 19, '#5a546c').rect(55, 20, 1, 2, '#f0a848').set(55, 20, '#ffd890')
  helm.rect(44, 22, 23, 1, '#6e6884').rect(43, 23, 25, 2, '#2a2632').rect(43, 25, 25, 1, '#4a4458').rect(44, 26, 23, 3, '#141118')
  for (let x = 45; x < 66; x += 2) helm.set(x, 23, ['#e8423a', '#f2c23a', '#4a8ae8', '#56c46a', '#f0f0f6'][(x * 3) % 5])
  for (let x = 46; x < 66; x += 4) helm.rect(x, 24, 2, 1, x % 8 ? '#ff8a3a' : '#7ab0ff')
  helm.rect(54, 23, 3, 2, '#3c3648').set(55, 24, '#ffb860')
  // two empty helm seats
  for (const cx of [47, 60]) {
    helm.rect(cx, 26, 5, 3, '#2c2632').rect(cx, 26, 5, 1, '#4c4458').rect(cx + 2, 29, 1, 2, '#3a3444').rect(cx, 31, 5, 1, '#2a2532')
  }
  s += helm.svg()

  // ---- the captain's chair, seen from behind ----
  const ch = new Pix()
  const CX = 75
  s += `<ellipse cx="${(CX + 0.5) * Q}" cy="${41.5 * Q}" rx="18" ry="3" fill="#0e0b14" opacity="0.6"/>`
  ch.rect(CX - 6, 40, 13, 1, '#4a4458').rect(CX - 7, 41, 15, 1, '#2e2a38').rect(CX - 5, 39, 11, 1, '#6a6478')
  ch.rect(CX - 2, 34, 5, 5, '#4a4458').rect(CX - 2, 34, 1, 5, '#6a6478').rect(CX + 2, 34, 1, 5, '#2e2a38')
  ch.rect(CX - 6, 32, 13, 2, '#1c1822').rect(CX - 6, 32, 13, 1, '#3a3442')
  // the back: rounded, padded, catching the screen light along its top
  ch.rect(CX - 4, 24, 9, 1, '#3e3848').rect(CX - 5, 25, 11, 7, '#17131d')
  ch.set(CX - 5, 25, '#2a2532').set(CX + 5, 25, '#2a2532')
  ch.rect(CX - 5, 26, 1, 6, '#2e2836').rect(CX - 3, 25, 7, 1, '#2a2532')
  ch.rect(CX - 1, 26, 1, 6, '#0f0c14').rect(CX + 2, 26, 1, 6, '#0f0c14')
  // the arms, with their little control panels
  ch.rect(CX - 8, 30, 4, 2, '#2a2532').rect(CX - 8, 30, 4, 1, '#4a4458').rect(CX + 5, 30, 4, 2, '#2a2532').rect(CX + 5, 30, 4, 1, '#4a4458')
  ch.set(CX - 8, 31, '#e8423a').set(CX - 6, 31, '#f2c23a').set(CX + 6, 31, '#4a8ae8').set(CX + 8, 31, '#56c46a')
  s += ch.svg()
  s += rlBlink(new Pix().set(CX - 7, 31, '#ffffff').svg(), 7, 0.3) + rlBlink(new Pix().set(CX + 7, 31, '#ffd04a').svg(), 9, 0.65)

  // keep the title corner quiet
  s += `<rect x="0" y="${39 * Q}" width="${38 * Q}" height="${9 * Q}" fill="url(#rlShadeG)"/>`

  // ================= Scotty =================
  const k = RL_SC
  const X = RL_X0
  const Y = RL_Y

  // ---- his timeline ----
  const walks: [number, number, number][] = [[3.4, 5.8, 0.6], [13.7, 16.2, 0.625]]
  const walk = rlTrack([[0, 0, 0], [3.4, 0, 0], [5.8, RL_WALK, 0], [13.7, RL_WALK, 0], [16.2, 0, 0]])
  const nod = rlTrack([[0, 0, 0], [11.1, 0, 0], [11.5, 0, 1], [11.9, 0, 1], [12.3, 0, 0]])
  type RlGaze = 'ur' | 'ul' | 'l' | 'r' | 'shut' | 'soft'
  const gaze: [number, number, RlGaze][] = [
    [0, 2.8, 'ur'], [2.8, 3.6, 'ul'], [3.6, 4.4, 'l'], [4.4, 6.35, 'r'], [6.35, 8.3, 'shut'], [8.3, 9.0, 'r'],
    [9.0, 10.7, 'ur'], [10.7, 12.6, 'soft'], [12.6, 13.6, 'ur'], [13.6, 14.6, 'l'], [14.6, 15.4, 'ul'], [15.4, T, 'ur'],
  ]
  const blinks: [number, number][] = [[1.7, 1.85], [5.0, 5.15], [9.6, 9.75], [16.5, 16.65]]
  const halfLid: [number, number][] = [[6.2, 6.35], [8.3, 8.45]]

  // ---- the floor: shadow and legs (two pairs, stepping in turn) ----
  let floor = `<ellipse cx="${(X + 9) * Q}" cy="${42 * Q}" rx="20" ry="2" fill="#0e0b14" opacity="0.6"/>`
  for (const [pair, phase] of [[[1, 11], 0], [[5, 15], 0.5]] as [number[], number][]) {
    const lp = new Pix()
    for (const lx of pair) lp.rect(X + lx, Y + 10, 2, 4, k.black).set(X + lx + 1, Y + 10, k.blackL).set(X + lx, Y + 13, '#0c0a10')
    floor += `<g>${lp.svg()}${rlBob(walks, 0.75, phase)}</g>`
  }

  // ---- the body: Clawd in the old red tunic, black collar, gold delta ----
  const body = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    const c = j === 0 ? k.light : j < 6 ? k.skin : j < 9 ? k.red : k.black
    body.rect(X + inset, Y + j, 18 - 2 * inset, 1, c)
  }
  body.rect(X, Y + 1, 1, 5, k.shade).rect(X + 17, Y + 1, 1, 5, k.rim)
  body.rect(X, Y + 6, 1, 3, k.redDark).rect(X + 17, Y + 6, 1, 2, k.redLight)
  body.rect(X, Y + 6, 18, 1, k.black).set(X + 17, Y + 6, k.blackL).set(X + 16, Y + 6, k.blackL)
  body.rect(X + 1, Y + 8, 16, 1, '#ae2a26')
  body.set(X + 13, Y + 7, k.goldL).rect(X + 12, Y + 8, 2, 1, k.gold)
  body.rect(X + 1, Y + 9, 16, 1, k.black).set(X + 16, Y + 9, k.blackL)
  // grey hair, a little tousled, parted on the far side
  body.rows(
    [
      '...dhLhhdhhLhhhd..',
      '.dhhLhhhdhhhLhhhL.',
      'dhd............dhL',
      'dh..............hL',
      'd................h',
    ],
    X, Y - 1, { d: k.hairD, h: k.hair, L: k.hairL },
  )
  let sc = body.svg()
  // left claw resting at his side
  sc += new Pix().rect(X - 3, Y + 4, 3, 2, k.skin).set(X - 3, Y + 4, k.light).rect(X - 3, Y + 6, 3, 1, k.shade).svg()

  // ---- the right claw and the glass of green Aldebaran whiskey ----
  // a drawing for every place the glass passes through (glass top-left, relative to the body)
  const armR = (dx: number, dy: number) => {
    const p = new Pix()
    const gx = X + dx
    const gy = Y + dy
    const line = rlLine(X + 18, Y + 4, gx + 1, gy + 5)
    line.forEach(([lx, ly]) => p.rect(lx, ly + 1, 2, 2, k.shade))
    line.forEach(([lx, ly]) => p.rect(lx, ly, 2, 2, k.skin))
    p.rect(X + 18, Y + 4, 2, 2, k.skin).set(X + 18, Y + 4, k.light)
    // the claw cupping the glass
    p.rect(gx - 1, gy + 2, 1, 3, k.skin).rect(gx + 3, gy + 2, 1, 3, k.skin).rect(gx - 1, gy + 4, 5, 1, k.skin)
    p.set(gx - 1, gy + 2, k.light).set(gx + 3, gy + 2, k.light).rect(gx, gy + 5, 3, 1, k.shade)
    // the tumbler
    p.rows(['rLr', 'wgg', 'ggd', 'sss'], gx, gy, RL_GLASS)
    return p.svg()
  }
  const REST: [number, number] = [20, 3]
  const DRINK: [number, number][] = [REST, [20, 2], [19, 1], [19, 0], [18, -1]]
  const TOAST: [number, number][] = [REST]
  // a plain raised claw (armUpHD proportions): glass held just above his head
  for (let i = 1; i <= 7; i++) {
    const f = i / 7
    TOAST.push([Math.round(20 - f + 1.5 * Math.sin(Math.PI * f)), Math.round(3 - 11 * f)])
  }
  const draws = new Map<string, [number, number][]>()
  const busy: [number, number][] = []
  const add = (pos: [number, number], w: [number, number]) => {
    const key = pos.join(',')
    if (!draws.has(key)) draws.set(key, [])
    draws.get(key)!.push(w)
  }
  // up through the in-betweens, hold, and back down the same way
  const move = (path: [number, number][], a: number, steps: number[], b: number) => {
    let t = a
    for (let i = 1; i < path.length - 1; i++) add(path[i], [t, (t += steps[i - 1])])
    add(path[path.length - 1], [t, b])
    let u = b
    for (let i = path.length - 2; i >= 1; i--) add(path[i], [u, (u += steps[i - 1])])
    busy.push([a, u])
  }
  move(DRINK, 5.95, [0.13, 0.11, 0.13], 8.15)
  move(TOAST, 9.6, [0.15, 0.12, 0.1, 0.1, 0.12, 0.15], 12.6)
  sc += shown(armR(...REST), complement(merge(busy), T), T)
  for (const [key, w] of draws) {
    const [dx, dy] = key.split(',').map(Number)
    sc += shown(armR(dx, dy), w, T)
  }

  // ---- eyes ----
  const eyeAt: Record<RlGaze, [number[], number, number]> = {
    ur: [[7, 13], 1, 3], ul: [[4, 10], 1, 3], l: [[4, 10], 2, 3], r: [[6, 12], 2, 3], shut: [[6, 12], 3, 1], soft: [[7, 13], 2, 2],
  }
  const open = complement(merge(blinks), T)
  for (const g of ['ur', 'ul', 'l', 'r', 'shut', 'soft'] as RlGaze[]) {
    const w = merge(gaze.filter(z => z[2] === g).map(z => [z[0], z[1]] as [number, number]))
    const [xs, ey, eh] = eyeAt[g]
    const e = new Pix()
    xs.forEach(ex => e.rect(X + ex, Y + ey, 2, eh, EYE_HD))
    if (g === 'shut') xs.forEach(ex => e.set(X + ex - 1, Y + 2, EYE_HD)) // a contented squint
    if (g === 'soft') xs.forEach(ex => e.rect(X + ex, Y + 1, 2, 1, k.shade)) // heavy lids
    if (g === 'ur' || g === 'ul') xs.forEach(ex => e.set(X + ex + (g === 'ur' ? 1 : 0), Y + 1, '#3a2a4a'))
    let vis = rlInter(w, open)
    if (g === 'r') vis = rlInter(vis, complement(merge(halfLid), T))
    sc += shown(e.svg(), vis, T)
    const bw = rlInter(w, merge(blinks))
    if (bw.length) {
      const b = new Pix()
      xs.forEach(ex => b.rect(X + ex, Y + 3, 2, 1, EYE_HD))
      sc += shown(b.svg(), bw, T)
    }
  }
  // half-closed on the way into and out of the sip
  const hl = new Pix()
  ;[6, 12].forEach(ex => hl.rect(X + ex, Y + 3, 2, 2, EYE_HD))
  sc += shown(hl.svg(), halfLid, T)
  // a glint of a tear while he toasts the old ship
  const tear = new Pix().set(X + 15, Y + 4, '#dff0ff')
  sc += `<g opacity="0">${tear.svg()}<animate attributeName="opacity" values="0;0;0.9;0.9;0;0" keyTimes="${rlKt([0, 10.9, 11.4, 12.2, 12.7, T])}" dur="${T}s" repeatCount="indefinite"/></g>`

  // the raised glass catches the screen light: one soft glint at the top of the toast
  {
    const [tx, ty] = TOAST[TOAST.length - 1]
    const gl = new Pix().set(X + tx + 2, Y + ty - 1, '#f4fff8').set(X + tx + 1, Y + ty - 1, '#bfeccc').set(X + tx + 3, Y + ty - 1, '#bfeccc').set(X + tx + 2, Y + ty - 2, '#bfeccc')
    sc += `<g opacity="0">${gl.svg()}<animate attributeName="opacity" values="0;0;0.85;0.85;0;0" keyTimes="${rlKt([0, 10.5, 11.0, 11.8, 12.4, T])}" dur="${T}s" repeatCount="indefinite"/></g>`
  }
  // warm light catching him from the screen side
  const crab = `<g>${floor}<g><g>${sc}${rlBob(walks, 0.5, 0.25)}</g>${nod}</g>${walk}</g>`
  s += crab
  s += `<ellipse cx="${60 * Q}" cy="${32 * Q}" rx="60" ry="16" fill="url(#rlWarm)"/>`
  return s
}
