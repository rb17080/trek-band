// ---------- The Doctor: "Please state the nature of the medical emergency." ----------
// One 17.17 s story in Voyager's sickbay. A patient sleeps under the vitals monitor.
// The EMH materialises calmly (a slow top-to-bottom reveal in a soft glow), raises a
// claw to ask his question, waits with his claws on his hips, walks over to the bed,
// scans the patient with his tricorder, reads the result and looks pleased, turns
// back and taps his foot waiting for an answer that never comes, then fades out.

const EMH_HD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#2e9bb0', // medical teal shoulders
  lower: '#1b1924', // black jacket
  lowerShade: '#0f0d14',
  legs: 'none', // drawn separately so they can walk and tap
  rim: '#f2b49a',
}

const EMH_D = SCENE_SECONDS
const EMH_X = 68 // where he materialises (art px)
const EMH_STEP = 2 // art px per step
const EMH_STEPS = 6 // he ends at EMH_X - 12 = 56, beside the bed
const EMH_X2 = EMH_X - EMH_STEP * EMH_STEPS
const EMH_Y = 28
const EMH_TOP = 19 // reveal band, art rows (the raised claw reaches row 20)
const EMH_BOT = 43

// the beats
const EMH_MAT: [number, number] = [2.2, 3.7] // materialise, 1.5 s
const EMH_ASK: [number, number] = [4.0, 5.7] // "?" bubble, claw raised
const EMH_WAIT1: [number, number] = [5.7, 7.4] // claws on hips
const EMH_WALK: [number, number] = [7.4, 9.4] // six steps to the bed
const EMH_REACH: [number, number] = [9.4, 9.6] // arm half out
const EMH_SCAN: [number, number] = [9.6, 11.6] // scanning
const EMH_READ: [number, number] = [11.6, 13.2] // reads, then looks pleased
const EMH_PLEASED = 12.4
const EMH_WAIT2: [number, number] = [13.2, 14.8] // turned back, foot taps, "..."
const EMH_DEMAT: [number, number] = [14.8, 16.2] // fades out, 1.4 s

// ---------- timing: every story animation spans the whole scene, keyTimes 0 .. 1 ----------

const emhKt = (t: number) => +Math.min(1, Math.max(0, t / EMH_D)).toFixed(4)

// one animation over the scene; pts are [seconds, value]; first time 0, last time = scene end
function emhAnim(attr: string, pts: [number, string | number][], mode: 'discrete' | 'linear' = 'discrete', type = '') {
  const p = [...pts]
  if (p[0][0] > 0) p.unshift([0, p[0][1]])
  if (p[p.length - 1][0] < EMH_D) p.push([EMH_D, p[p.length - 1][1]])
  const tag = type ? 'animateTransform' : 'animate'
  return `<${tag} attributeName="${attr}"${type ? ` type="${type}"` : ''} calcMode="${mode}" dur="${EMH_D}s" repeatCount="indefinite" values="${p.map(v => v[1]).join(';')}" keyTimes="${p.map(v => emhKt(v[0])).join(';')}"/>`
}

// visible inside the windows, hidden outside (discrete; for small pose swaps)
function emhOn(svg: string, wins: [number, number][]) {
  const w = merge(wins)
  const pts: [number, number][] = [[0, w.length && w[0][0] <= 0 ? 1 : 0]]
  for (const [a, b] of w) {
    if (a > 0) pts.push([a, 1])
    if (b < EMH_D) pts.push([b, 0])
  }
  return `<g>${svg}${emhAnim('opacity', pts)}</g>`
}

// fades in over `r` seconds from a, out over `r` seconds until b
function emhFade(svg: string, a: number, b: number, r = 0.3, peak = 1) {
  return `<g opacity="0">${svg}${emhAnim('opacity', [[0, 0], [a, 0], [a + r, peak], [b - r, peak], [b, 0]], 'linear')}</g>`
}

// ---------- the Doctor's parts ----------

// claw on the hip: out from the shoulder, down, and back in onto the belt
function emhArmHips(k: CrabHD, x: number, y: number, side: Side) {
  const rows = ['sss.', 'sss.', 'hs..', 'ss..', '.ssl', '.hh.']
  const p = new Pix()
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const c = r[i] === 's' ? k.skin : r[i] === 'h' ? k.shade : r[i] === 'l' ? k.light : ''
      if (!c) continue
      const ax = side === 'left' ? x - 3 + i : x + 20 - i
      p.set(ax, y + 4 + j, c)
    }
  })
  return p.svg()
}

// medical tricorder, held out flat with the screen towards us
function emhTricorder(p: Pix, x: number, y: number, screen = '#6fe8ff') {
  p.rect(x, y, 4, 4, '#4b5064').rect(x, y, 4, 1, '#7d849c').rect(x + 1, y + 1, 2, 1, screen)
  p.set(x, y + 3, '#33374a').set(x + 3, y + 3, '#33374a')
}

function emhArmScan(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 8, y + 4, 8, 2, k.skin).rect(x - 8, y + 6, 8, 1, k.shade).set(x - 8, y + 4, k.light)
  emhTricorder(p, x - 13, y + 3)
  // pincers gripping it
  p.rect(x - 10, y + 2, 2, 1, k.skin).set(x - 10, y + 2, k.light)
  p.rect(x - 10, y + 7, 2, 1, k.shade)
  p.rect(x - 9, y + 3, 1, 4, k.skin)
  return p.svg()
}

// halfway out: the forearm swinging forward with the tricorder
function emhArmReach(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 5, y + 4, 5, 2, k.skin).rect(x - 5, y + 6, 5, 1, k.shade)
  emhTricorder(p, x - 9, y + 4)
  p.rect(x - 6, y + 4, 1, 3, k.skin)
  return p.svg()
}

// tricorder raised in front of him to read the result: a green screen
function emhArmRead(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin).rect(x - 3, y + 6, 3, 1, k.shade)
  p.rect(x - 5, y + 2, 2, 4, k.skin).set(x - 5, y + 2, k.light)
  emhTricorder(p, x - 9, y + 1, '#7dff9a')
  p.set(x - 8, y + 3, '#7dff9a').set(x - 7, y + 3, '#4b5064') // a tick mark on the screen
  return p.svg()
}

// right claw halfway up (between rest and raised)
function emhArmHalfUp(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 4, 3, 2, k.skin)
  p.rect(x + 19, y, 2, 4, k.skin).rect(x + 20, y, 1, 4, k.shade)
  p.rect(x + 18, y - 3, 1, 2, k.skin).rect(x + 21, y - 3, 1, 2, k.skin)
  p.rect(x + 18, y - 2, 4, 1, k.skin).rect(x + 19, y - 1, 2, 1, k.skin)
  p.set(x + 18, y - 3, k.light).set(x + 21, y - 3, k.light)
  return p.svg()
}

function emhDoctor() {
  const k = EMH_HD
  const x = EMH_X
  const y = EMH_Y
  const { p, ex } = clawdBody(k, x, y, 'left')
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin)) // eyes drawn separately below
  // receding dark hairline: bald crown, hair at the sides and back
  const hair = '#2c1d19'
  const hairHi = '#4a332b'
  p.rect(x + 1, y, 4, 1, hair).rect(x + 13, y, 4, 1, hair)
  p.rect(x, y + 1, 3, 1, hair).rect(x + 15, y + 1, 3, 1, hair)
  p.set(x, y + 2, hair).set(x + 17, y + 2, hair).set(x, y + 3, hair).set(x + 17, y + 3, hair)
  p.set(x + 3, y, hairHi).set(x + 14, y, hairHi)
  p.rect(x + 6, y, 6, 1, '#f4ad8c') // shine on the bald crown
  // Voyager uniform: teal shoulders, grey collar, black jacket, combadge
  p.rect(x + 1, y + 6, 16, 1, '#4cc0d2')
  p.rect(x + 7, y + 6, 4, 1, '#8a8f9e').rect(x + 8, y + 7, 2, 1, '#6c7080')
  p.rect(x + 1, y + 7, 16, 1, '#2e9bb0').rect(x + 8, y + 7, 2, 1, '#6c7080')
  p.set(x + 17, y + 6, '#1f6f80').set(x + 17, y + 7, '#1f6f80')
  p.rect(x + 12, y + 7, 2, 1, '#e8c547').set(x + 13, y + 7, '#fff3b0')
  p.rect(x + 1, y + 8, 16, 1, '#26232f')
  let s = p.svg()

  // eyes: looking left, pleased (^ ^), looking right (turned back), with blinks
  const EYE = '#1a1020'
  const eyes = (xs: number[]) => {
    const e = new Pix()
    xs.forEach(c => e.rect(x + c, y + 2, 2, 3, EYE))
    return e.svg()
  }
  const happy = new Pix()
  for (const c of [4, 10]) happy.rect(x + c, y + 2, 2, 1, EYE).set(x + c - 1, y + 3, EYE).set(x + c + 2, y + 3, EYE)
  s += emhOn(eyes([4, 10]), [[0, 5.0], [5.15, 8.3], [8.45, 10.9], [11.05, EMH_PLEASED]])
  s += emhOn(happy.svg(), [[EMH_PLEASED, EMH_WAIT2[0]]])
  s += emhOn(eyes([6, 12]), [[EMH_WAIT2[0], 14.3], [14.45, EMH_D]])
  // a frown while he waits: brows pulled down
  s += emhOn(new Pix().rect(x + 5, y + 1, 3, 1, hair).rect(x + 11, y + 1, 3, 1, hair).svg(), [[13.6, EMH_D]])

  // legs: pairs lift in turn while he walks, the far right one taps while he waits
  const stepAt = (i: number) => EMH_WALK[0] + (i * (EMH_WALK[1] - EMH_WALK[0])) / EMH_STEPS
  const lifts: [number, number][][] = [[], []]
  for (let i = 0; i < EMH_STEPS; i++) lifts[i % 2].push([stepAt(i), stepAt(i) + 0.2])
  const taps: [number, number][] = [[13.5, 13.8], [14.1, 14.4], [14.7, 15.0]]
  const legCol = '#1b1924'
  const footCol = '#2b2836'
  ;[1, 5, 11, 15].forEach((lx, n) => {
    const pair = lx === 1 || lx === 11 ? 0 : 1
    const down = new Pix().rect(x + lx, y + 10, 2, 4, legCol).set(x + lx, y + 13, footCol).svg()
    const lifted = new Pix().rect(x + lx, y + 10, 2, 3, legCol).set(x + lx, y + 12, footCol).svg()
    const busy = lx === 15 ? [...lifts[pair], ...taps] : lifts[pair]
    s += emhOn(down, complement(merge(busy), EMH_D))
    s += emhOn(lifted, lifts[pair])
    if (lx === 15) s += emhOn(new Pix().rect(x + 15, y + 10, 2, 2, legCol).rect(x + 16, y + 12, 2, 1, footCol).svg(), taps)
    void n
  })

  // arms
  const tri = new Pix()
  emhTricorder(tri, x - 5, y + 6)
  const restL = armRestHD(k, x, y, 'left') + tri.svg()
  const hipsOn: [number, number][] = [EMH_WAIT1, [EMH_WAIT2[0], EMH_D]]
  s += emhOn(restL, [[0, EMH_WAIT1[0]], EMH_WALK])
  s += emhOn(armRestHD(k, x, y, 'right'), [[0, 4.1], [5.5, EMH_WAIT1[0]], EMH_WALK, EMH_REACH])
  s += emhOn(emhArmHalfUp(k, x, y), [[4.1, 4.25], [5.35, 5.5]])
  s += emhOn(armUpHD(k, x, y, 'right'), [[4.25, 5.35]])
  s += emhOn(emhArmHips(k, x, y, 'left'), hipsOn)
  s += emhOn(emhArmHips(k, x, y, 'right'), [EMH_WAIT1, [EMH_SCAN[0], EMH_D]])
  s += emhOn(emhArmReach(k, x, y), [EMH_REACH])
  s += emhOn(emhArmScan(k, x, y), [EMH_SCAN])
  s += emhOn(emhArmRead(k, x, y), [EMH_READ])
  // tricorder clipped to the belt when both claws are on his hips
  s += emhOn(new Pix().rect(x + 3, y + 8, 3, 2, '#4b5064').set(x + 4, y + 8, '#6fe8ff').svg(), hipsOn)
  // the tricorder light while scanning: red / green, once a second
  s += emhOn(
    `<rect x="${(x - 12) * Q}" y="${(y + 5) * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="fill" values="#ff5a5a;#7dff9a;#7dff9a" calcMode="discrete" dur="1s" keyTimes="0;0.5;1" repeatCount="indefinite"/></rect>`,
    [EMH_SCAN],
  )

  // a small satisfied nod
  return `<g>${s}${emhAnim('transform', [[0, '0 0'], [12.55, `0 ${Q}`], [12.85, '0 0']], 'discrete', 'translate')}</g>`
}

// speech bubble with a pixel glyph
function emhBubble(glyph: string[], x: number, y: number) {
  const body = ['.wwwwwwwww.', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', '.wwwwwwwww.', '.ww........', 'ww.........']
  const p = new Pix().rows(body, x, y, { w: '#e2eef8' })
  p.rect(x + 1, y + 8, 9, 1, '#b9cde6')
  p.rows(glyph, x + 3, y + 1, { k: '#1d2a4a', r: '#d8342f' })
  return p.svg()
}

// the holographic glow, the light line riding the reveal edge, slow sparkles
function emhShimmer(X: number, win: [number, number], closing: boolean) {
  const [a, b] = win
  let s = ''
  s += `<g opacity="0"><ellipse cx="${(X + 9) * Q}" cy="${33 * Q}" rx="${15 * Q}" ry="${13 * Q}" fill="url(#emhHolo)"/>${emhAnim('opacity', [[0, 0], [a - 0.5, 0], [a, 1], [b, 1], [b + 0.9, 0]], 'linear')}</g>`
  // the edge line: down the figure over the reveal
  const yA = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<rect x="${(X - 5) * Q}" y="${yA}" width="${29 * Q}" height="${Q}" fill="#cdf3ff" opacity="0">${emhAnim('y', [[0, yA], [a, yA], [b, yB]], 'linear')}${emhAnim('opacity', [[0, 0], [a, 0], [a + 0.2, 0.45], [b - 0.3, 0.45], [b, 0]], 'linear')}</rect>`
  // sparkles drifting up slowly around his outline
  let seed = closing ? 77 : 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let sp = ''
  for (let i = 0; i < 12; i++) {
    const cx = X - 3 + Math.floor(rnd() * 24)
    const cy = EMH_TOP + 3 + Math.floor(rnd() * (EMH_BOT - EMH_TOP - 5))
    const d = (1.6 + rnd() * 0.9).toFixed(2)
    const bg = (rnd() * 1.6).toFixed(2)
    const col = i % 3 ? '#9fe8ff' : '#e8fbff'
    sp += `<rect x="${cx * Q}" y="${cy * Q}" width="${Q}" height="${Q}" fill="${col}" opacity="0"><animate attributeName="opacity" values="0;0.85;0" dur="${d}s" begin="${bg}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-3 * Q}" dur="${d}s" begin="${bg}s" repeatCount="indefinite"/></rect>`
  }
  s += emhFade(sp, a - 0.3, b + 0.6, 0.4)
  return s
}

function emhSickbay() {
  const W = GW * Q
  const H = GH * Q
  let back = `<rect width="${W}" height="${H}" fill="#1a1e31"/>`
  const wall = new Pix()
  // ceiling with light strips
  wall.rect(0, 0, GW, 4, '#11141f').rect(0, 3, GW, 1, '#232a42')
  wall.rect(20, 2, 16, 1, '#2d3756').rect(21, 3, 14, 1, '#cfe6ff')
  wall.rect(56, 2, 16, 1, '#2d3756').rect(57, 3, 14, 1, '#cfe6ff')
  // upper wall panels with seams
  wall.rect(0, 4, GW, 20, '#1d2236')
  for (const sx of [14, 44, 52, 78]) wall.rect(sx, 4, 1, 20, '#151929').rect(sx + 1, 4, 1, 20, '#252b45')
  // trim band and glowing rail
  wall.rect(0, 24, GW, 1, '#2f3757').rect(0, 25, GW, 1, '#2a5c8c').rect(0, 26, GW, 1, '#151929')
  // lower wall
  wall.rect(0, 27, GW, 15, '#181b2b')
  for (const sx of [12, 30, 48, 66]) wall.rect(sx, 27, 1, 15, '#131624')
  // back lit column between the bed and the Doctor
  wall.rect(48, 4, 2, 20, '#24406a').rect(48, 5, 1, 18, '#3f78b8')
  // the Doctor's office: glass wall at the far right
  wall.rect(80, 27, 10, 15, '#1f3150').rect(80, 27, 1, 15, '#3a5580')
  wall.rect(81, 28, 9, 1, '#2d4a76')
  for (let i = 0; i < 5; i++) wall.set(83 + i, 31 + i, '#35588c')
  // shelves with hyposprays and vials on the left
  wall.rect(2, 29, 9, 1, '#3a4260').rect(2, 34, 9, 1, '#3a4260')
  ;[[3, '#6fe8ff'], [5, '#f2b866'], [7, '#9fe08a'], [9, '#6fe8ff']].forEach(([vx, c]) => wall.rect(vx as number, 27, 1, 2, c as string))
  wall.rect(3, 31, 3, 3, '#5a6280').set(4, 31, '#9aa3c0').rect(7, 32, 3, 2, '#5a6280')
  // floor
  wall.rect(0, 42, GW, 6, '#121522').rect(0, 42, GW, 1, '#262c45')
  back += wall.svg()
  // glow under the ceiling lights
  back += `<ellipse cx="${28 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/><ellipse cx="${64 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/>`

  // vitals monitor over the bed
  const mon = new Pix()
  mon.rect(17, 6, 25, 16, '#3a4566').rect(17, 6, 25, 1, '#56648e').rect(18, 7, 23, 14, '#0b1c33')
  mon.rect(19, 8, 7, 1, '#f2b866').rect(27, 8, 3, 1, '#e08a3c').rect(31, 8, 9, 1, '#4f8fd6')
  mon.rect(19, 8, 1, 3, '#f2b866')
  mon.rect(19, 17, 4, 2, '#4f8fd6').rect(24, 17, 6, 2, '#f2b866').rect(31, 17, 3, 2, '#c66a5a').rect(35, 17, 5, 2, '#4f8fd6')
  mon.rect(24, 19, 4, 1, '#7a5a3a').rect(35, 19, 3, 1, '#2d4f80')
  back += mon.svg()
  // the heartbeat trace, swept slowly left to right (a calm sleeping pulse)
  const ekg = new Pix()
  const shape = [0, 0, 0, -1, 0, 0, 1, -3, 2, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 1, -3, 2, 0]
  shape.forEach((d, i) => {
    ekg.set(18 + i, 14 + d, '#6fffc0')
    if (d < -1) ekg.rect(18 + i, 14 + d, 1, -d, '#6fffc0')
    if (d > 1) ekg.rect(18 + i, 14, 1, d + 1, '#6fffc0')
  })
  const SW = 3.4
  const sweep: [number, number][] = []
  for (let i = 0; i <= 23; i++) sweep.push([i / 24, i * Q])
  sweep.push([1, 23 * Q])
  const sweepAnim = `<animate attributeName="width" calcMode="discrete" dur="${SW}s" repeatCount="indefinite" values="${sweep.map(v => v[1]).join(';')}" keyTimes="${sweep.map(v => +v[0].toFixed(4)).join(';')}"/>`
  back += `<clipPath id="emhEkgClip"><rect x="${18 * Q}" y="0" width="0" height="${H}">${sweepAnim}</rect></clipPath>`
  back += `<g clip-path="url(#emhEkgClip)">${ekg.svg()}</g>`
  // heart light: a slow soft pulse
  back += `<rect x="${39 * Q}" y="${10 * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="opacity" values="1;0.3;1" dur="1.7s" repeatCount="indefinite"/></rect>`

  // status display on the right wall: amber elbow and blue bars
  const pan = new Pix()
  pan.rect(54, 6, 20, 10, '#121625')
  pan.rect(55, 7, 3, 8, '#e8a24a').rect(55, 7, 7, 2, '#e8a24a').set(55, 7, '#121625').set(55, 14, '#121625')
  pan.rect(63, 7, 4, 2, '#c97ad0').rect(68, 7, 5, 2, '#4f8fd6')
  pan.rect(59, 10, 8, 1, '#4f8fd6').rect(68, 10, 4, 1, '#f2b866')
  pan.rect(59, 12, 5, 1, '#f2b866').rect(65, 12, 7, 1, '#4f8fd6')
  pan.rect(59, 14, 10, 1, '#2f5f9c').rect(70, 14, 2, 1, '#e08a3c')
  back += pan.svg()
  back += `<rect x="${70 * Q}" y="${14 * Q}" width="${2 * Q}" height="${Q}" fill="#ffd36b"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite"/></rect>`
  back += `<rect x="${59 * Q}" y="${10 * Q}" width="${8 * Q}" height="${Q}" fill="#9fd0ff"><animate attributeName="opacity" values="0;0.6;0" dur="3.1s" repeatCount="indefinite"/></rect>`
  return back
}

function emhBed() {
  let s = ''
  // overhead surgical light falling on the bed
  s += `<polygon points="${22 * Q},${4 * Q} ${34 * Q},${4 * Q} ${44 * Q},${36 * Q} ${12 * Q},${36 * Q}" fill="#cfe6ff" opacity="0.06"/>`
  const b = new Pix()
  // pedestal
  b.rect(21, 37, 14, 5, '#2c3248').rect(21, 37, 14, 1, '#3c4462').rect(33, 37, 2, 5, '#21263a')
  b.rect(19, 41, 18, 1, '#3a4260')
  // bed top with its lit edge
  b.rect(12, 34, 31, 2, '#8a93ab').rect(12, 34, 31, 1, '#b7bfd3').rect(12, 36, 31, 1, '#3d8fd6').set(12, 36, '#2a5c8c').set(42, 36, '#2a5c8c')
  b.rect(13, 37, 29, 1, '#1f3a5c')
  // pillow at the head end (towards the Doctor)
  b.rect(34, 32, 8, 2, '#e4ecf6').rect(34, 33, 8, 1, '#c3cfe0')
  // patient under the sheet: a sleeping Clawd
  const sheet = '#a9bfdc'
  const sheetHi = '#cfdcee'
  const sheetSh = '#7f97b8'
  b.rect(14, 31, 22, 3, sheet).rect(15, 30, 20, 1, sheetHi).rect(14, 31, 1, 3, sheetSh)
  b.rect(15, 29, 2, 1, sheetHi).rect(19, 29, 2, 1, sheetHi) // feet poking up
  b.rect(14, 33, 22, 1, sheetSh)
  for (const fx of [20, 26, 31]) b.set(fx, 32, sheetSh)
  // head on the pillow, eyes shut
  b.rect(35, 27, 7, 5, '#d97757').rect(35, 27, 7, 1, '#eb9575').rect(41, 28, 1, 4, '#b85f43')
  b.rect(36, 30, 2, 1, '#6a2e1e').rect(39, 30, 2, 1, '#6a2e1e')
  // a limp claw over the sheet
  b.rect(31, 29, 3, 2, '#d97757').set(31, 29, '#eb9575')
  s += b.svg()
  // slow breathing: the sheet over the chest rises and settles
  s += `<g opacity="0">${new Pix().rect(24, 29, 5, 1, sheetHi).svg()}<animate attributeName="opacity" values="0;1;0" dur="4s" repeatCount="indefinite"/></g>`
  return s
}

function doctorEmh() {
  const W = GW * Q
  const H = GH * Q
  const dx = -EMH_STEP * Q // one step, CSS px
  let s = `<defs>
    <linearGradient id="emhFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="emhFade"><rect width="${W}" height="${H}" fill="url(#emhFadeG)"/></mask>
    <radialGradient id="emhHolo"><stop offset="0" stop-color="#8fe3ff" stop-opacity="0.32"/><stop offset="0.6" stop-color="#8fe3ff" stop-opacity="0.1"/><stop offset="1" stop-color="#8fe3ff" stop-opacity="0"/></radialGradient>
  </defs>`
  s += `<g mask="url(#emhFade)">${emhSickbay()}</g>`
  s += emhBed()

  // glow + sparkles where he forms (at EMH_X) and where he fades (at EMH_X2)
  s += emhShimmer(EMH_X, EMH_MAT, false)
  s += emhShimmer(EMH_X2, EMH_DEMAT, true)

  // reveal: a clip that opens top to bottom, and later closes top to bottom
  const full = (EMH_BOT - EMH_TOP) * Q
  const yT = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<clipPath id="emhReveal"><rect x="${-W}" y="${yT}" width="${3 * W}" height="0">${emhAnim('y', [[0, yT], [EMH_DEMAT[0], yT], [EMH_DEMAT[1], yB]], 'linear')}${emhAnim('height', [[0, 0], [EMH_MAT[0], 0], [EMH_MAT[1], full], [EMH_DEMAT[0], full], [EMH_DEMAT[1], 0]], 'linear')}</rect></clipPath>`

  // the walk: six steps of two art pixels, each a third of a second
  const walk: [number, string][] = [[0, '0 0']]
  for (let i = 0; i < EMH_STEPS; i++) {
    const t = EMH_WALK[0] + (i * (EMH_WALK[1] - EMH_WALK[0])) / EMH_STEPS + 0.15
    walk.push([t, `${(i + 1) * dx} 0`])
  }
  // his shadow, fading in and out with him
  const shadow = `<ellipse cx="${(EMH_X + 9) * Q}" cy="${42.5 * Q}" rx="${12 * Q}" ry="3" fill="#06070d" opacity="0">${emhAnim('opacity', [[0, 0], [EMH_MAT[0] + 0.4, 0], [EMH_MAT[1] + 0.2, 0.6], [EMH_DEMAT[0] + 0.2, 0.6], [EMH_DEMAT[1], 0]], 'linear')}</ellipse>`
  // a little translucent while forming and fading
  const holo = emhAnim('opacity', [[0, 0.75], [EMH_MAT[0], 0.75], [EMH_MAT[1] + 0.4, 1], [EMH_DEMAT[0], 1], [EMH_DEMAT[1], 0.75]], 'linear')
  s += `<g>${shadow}<g clip-path="url(#emhReveal)"><g>${emhDoctor()}${holo}</g></g>${emhAnim('transform', walk, 'discrete', 'translate')}</g>`

  // the scan: a soft beam from the tricorder over the patient, with a slow sweeping line
  const tipX = EMH_X2 - 14
  const beam = new Pix()
  for (let c = 28; c <= tipX; c++) {
    const spread = Math.round((tipX - c) * 0.3)
    for (let r = 32 - spread; r <= 33 + spread; r++) if (r >= 27 && r <= 33) beam.set(c, r, '#8fe3ff')
  }
  const steps = 12
  const sweepPts: [number, number][] = []
  for (let i = 0; i < steps * 2; i++) {
    const k = i < steps ? i : steps * 2 - 1 - i
    sweepPts.push([i / (steps * 2), -k * Q])
  }
  sweepPts.push([1, 0])
  const sweepLine = `<rect x="${tipX * Q}" y="${27 * Q}" width="${Q}" height="${7 * Q}" fill="#d8f6ff" opacity="0.6"><animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="2.4s" repeatCount="indefinite" values="${sweepPts.map(v => `${v[1]} 0`).join(';')}" keyTimes="${sweepPts.map(v => +v[0].toFixed(4)).join(';')}"/></rect>`
  s += emhFade(`<g opacity="0.2">${beam.svg()}</g>${sweepLine}`, EMH_SCAN[0] + 0.1, EMH_SCAN[1], 0.5)

  // "Please state the nature of the medical emergency?" ... and the long wait
  const q = ['.kkk.', 'k...k', '....k', '..kk.', '..k..', '.....', '..k..']
  const dots = ['.....', '.....', '.....', 'k.k.k', '.....', '.....', '.....']
  s += emhFade(emhBubble(q, EMH_X + 3, 16), EMH_ASK[0], EMH_ASK[1] + 0.2)
  s += emhFade(emhBubble(dots, EMH_X2 + 10, 16), EMH_WAIT2[0] + 0.2, EMH_DEMAT[0] + 0.3)
  return s
}
