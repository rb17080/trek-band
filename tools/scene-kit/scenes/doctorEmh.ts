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
const EMH_INOUT = '0.45 0 0.55 1' // gentle ease in and out
const EMH_LOOP = (n: number) => +(EMH_D / n).toFixed(4) // ambient periods that divide the scene exactly

// one animation over the scene; pts are [seconds, value]; first time 0, last time = scene end
function emhAnim(attr: string, pts: [number, string | number][], mode: 'discrete' | 'linear' | 'spline' = 'discrete', type = '', spline = EMH_INOUT) {
  const p = [...pts]
  if (p[0][0] > 0) p.unshift([0, p[0][1]])
  if (p[p.length - 1][0] < EMH_D) p.push([EMH_D, p[p.length - 1][1]])
  const tag = type ? 'animateTransform' : 'animate'
  const ks = mode === 'spline' ? ` keySplines="${p.slice(1).map(() => spline).join(';')}"` : ''
  return `<${tag} attributeName="${attr}"${type ? ` type="${type}"` : ''} calcMode="${mode}"${ks} dur="${EMH_D}s" repeatCount="indefinite" values="${p.map(v => v[1]).join(';')}" keyTimes="${p.map(v => emhKt(v[0])).join(';')}"/>`
}

// Pix written as one <path> per colour: far smaller than one <rect> per run
function emhPath(p: Pix) {
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
      if (c !== 'none') by.set(c, (by.get(c) || '') + `M${xs[i] * Q} ${y * Q}h${w}v${Q}h-${w}z`)
      i = j + 1
    }
  }
  let out = ''
  for (const [c, d] of by) out += `<path fill="${c}" d="${d}"/>`
  return out
}

// visible inside the windows, hidden outside (discrete; for single drawing steps)
function emhOn(svg: string, wins: [number, number][]) {
  const w = merge(wins)
  const pts: [number, number][] = [[0, w.length && w[0][0] <= 0 ? 1 : 0]]
  for (const [a, b] of w) {
    if (a > 0) pts.push([a, 1])
    if (b < EMH_D) pts.push([b, 0])
  }
  return `<g>${svg}${emhAnim('opacity', pts)}</g>`
}

// a flip-book: each drawing shows from its start until the next one starts ('' = nothing)
function emhTrack(segs: [string, number][]) {
  const m = new Map<string, [number, number][]>()
  segs.forEach(([svg, t], i) => {
    if (!svg) return
    const end = i + 1 < segs.length ? segs[i + 1][1] : EMH_D
    m.set(svg, [...(m.get(svg) || []), [t, end]])
  })
  let s = ''
  for (const [svg, w] of m) s += emhOn(svg, w)
  return s
}

// lifted by `amp` px inside each window, easing up and back down over `r` seconds
function emhLift(wins: [number, number][], amp: number, r: number) {
  const pts: [number, string][] = [[0, '0 0']]
  for (const [a, b] of merge(wins)) pts.push([a, '0 0'], [a + r, `0 ${-amp}`], [b - r, `0 ${-amp}`], [b, '0 0'])
  return emhAnim('transform', pts, 'spline', 'translate')
}

// fades in over `r` seconds from a, out over `r` seconds until b
function emhFade(svg: string, a: number, b: number, r = 0.3, peak = 1) {
  return `<g opacity="0">${svg}${emhAnim('opacity', [[0, 0], [a, 0], [a + r, peak], [b - r, peak], [b, 0]], 'linear')}</g>`
}

// ---------- the Doctor's parts ----------

// an arm drawn from rows: column 0 is the outermost; s skin, h shade, l light
const EMH_ARM = {
  rest: ['sss', 'sss', 'hhh'],
  m1: ['sss.', 'sss.', 'hsh.', 'h...'], // the claw starts to swing down
  m2: ['sss.', 'sss.', 'hs..', 'ss..', '.hh.'], // ... and in
  hips: ['sss.', 'sss.', 'hs..', 'ss..', '.ssl', '.hh.'], // claw on the hip
}
function emhArmRows(k: CrabHD, x: number, y: number, side: Side, rows: string[]) {
  const p = new Pix()
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const c = r[i] === 's' ? k.skin : r[i] === 'h' ? k.shade : r[i] === 'l' ? k.light : ''
      if (c) p.set(side === 'left' ? x - 3 + i : x + 20 - i, y + 4 + j, c)
    }
  })
  return emhPath(p)
}

// medical tricorder, held out flat with the screen towards us
function emhTricorder(p: Pix, x: number, y: number, screen = '#6fe8ff') {
  p.rect(x, y, 4, 4, '#4b5064').rect(x, y, 4, 1, '#7d849c').rect(x + 1, y + 1, 2, 1, screen)
  p.set(x, y + 3, '#33374a').set(x + 3, y + 3, '#33374a')
}

// left claw gripping the tricorder at (tx, ty): the forearm reaches out from the shoulder.
// At tx = x - 13, ty = y + 3 this is the full scanning reach.
function emhArmGrip(k: CrabHD, x: number, y: number, tx: number, ty: number, screen = '#6fe8ff') {
  const p = new Pix()
  const len = x - tx - 5
  if (len > 0) p.rect(x - len, y + 4, len, 2, k.skin).rect(x - len, y + 6, len, 1, k.shade).set(x - len, y + 4, k.light)
  emhTricorder(p, tx, ty, screen)
  p.rect(tx + 3, ty - 1, 2, 1, k.skin).set(tx + 3, ty - 1, k.light)
  p.rect(tx + 3, ty + 4, 2, 1, k.shade)
  p.rect(tx + 4, ty, 1, 4, k.skin)
  return emhPath(p)
}

// tricorder raised in front of him to read the result: a green screen
function emhArmRead(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin).rect(x - 3, y + 6, 3, 1, k.shade)
  p.rect(x - 5, y + 2, 2, 4, k.skin).set(x - 5, y + 2, k.light)
  emhTricorder(p, x - 9, y + 1, '#7dff9a')
  p.set(x - 8, y + 3, '#7dff9a').set(x - 7, y + 3, '#4b5064') // a tick mark on the screen
  return emhPath(p)
}

// right claw raised h art px (8 = fully up)
function emhArmRaise(k: CrabHD, x: number, y: number, h: number) {
  const p = new Pix()
  const top = y + 4 - h
  const tip = h >= 6 ? 3 : 2
  p.rect(x + 18, y + 4, 3, 2, k.skin)
  p.rect(x + 19, top, 2, h, k.skin).rect(x + 20, top, 1, h, k.shade)
  p.rect(x + 18, top - 1 - tip, 1, tip, k.skin).rect(x + 21, top - 1 - tip, 1, tip, k.skin)
  p.rect(x + 18, top - 2, 4, 1, k.skin).rect(x + 19, top - 1, 2, 1, k.skin)
  p.set(x + 18, top - 1 - tip, k.light).set(x + 21, top - 1 - tip, k.light)
  return emhPath(p)
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
  let s = emhPath(p)

  // eyes: one pair that glides from looking left to looking right when he turns back,
  // a squint step into and out of the pleased ^ ^ look, and blinks
  const EYE = '#1a1020'
  const eyes = new Pix()
  const squint = new Pix()
  const happy = new Pix()
  for (const c of [4, 10]) {
    eyes.rect(x + c, y + 2, 2, 3, EYE)
    squint.rect(x + c, y + 2, 2, 2, EYE)
    happy.rect(x + c, y + 2, 2, 1, EYE).set(x + c - 1, y + 3, EYE).set(x + c + 2, y + 3, EYE)
  }
  const look = emhAnim('transform', [[0, '0 0'], [13.28, '0 0'], [13.52, `${2 * Q} 0`], [EMH_D - 0.05, `${2 * Q} 0`], [EMH_D, '0 0']], 'spline', 'translate')
  s += `<g>${emhOn(emhPath(eyes), [[0, 5.0], [5.15, 8.3], [8.45, 10.9], [11.05, EMH_PLEASED], [13.28, 14.3], [14.45, EMH_D]])}${look}</g>`
  s += emhTrack([['', 0], [emhPath(squint), EMH_PLEASED], [emhPath(happy), EMH_PLEASED + 0.08], [emhPath(squint), EMH_WAIT2[0]], ['', 13.28]])
  // a frown while he waits: brows pulled down, easing in
  s += emhFade(emhPath(new Pix().rect(x + 5, y + 1, 3, 1, hair).rect(x + 11, y + 1, 3, 1, hair)), 13.6, EMH_D, 0.35)

  // legs: pairs lift in turn while he walks, the far right one taps while he waits;
  // every lift eases up one art pixel and back down
  const stepAt = (i: number) => EMH_WALK[0] + (i * (EMH_WALK[1] - EMH_WALK[0])) / EMH_STEPS
  const lifts: [number, number][][] = [[], []]
  for (let i = 0; i < EMH_STEPS; i++) lifts[i % 2].push([stepAt(i), stepAt(i) + 0.2])
  const taps: [number, number][] = [[13.5, 13.8], [14.1, 14.4], [14.7, 15.0]]
  ;[1, 5, 11, 15].forEach(lx => {
    const pair = lx === 1 || lx === 11 ? 0 : 1
    const leg = emhPath(new Pix().rect(x + lx, y + 10, 2, 4, '#1b1924').set(x + lx, y + 13, '#2b2836'))
    s += `<g>${leg}${emhLift(lx === 15 ? [...lifts[pair], ...taps] : lifts[pair], Q, 0.07)}</g>`
  })

  // left claw (holds the tricorder): to the hip, out to scan, up to read, back to the hip
  const L = (rows: string[]) => emhArmRows(k, x, y, 'left', rows)
  const G = (dx: number, dy: number, scr?: string) => emhArmGrip(k, x, y, x - dx, y + dy, scr)
  const GREEN = '#7dff9a'
  const A = EMH_ARM
  s += emhTrack([
    [L(A.rest), 0], [L(A.m1), 5.7], [L(A.m2), 5.79], [L(A.hips), 5.88],
    [L(A.m2), 7.4], [L(A.m1), 7.49], [L(A.rest), 7.58],
    [G(8, 5), 9.4], [G(9, 4), 9.45], [G(10, 4), 9.5], [G(11, 3), 9.55], [G(12, 3), 9.6], [G(13, 3), 9.65],
    [G(12, 3), 11.6], [G(11, 2), 11.66], [G(10, 2, GREEN), 11.72], [emhArmRead(k, x, y), 11.78],
    [G(8, 2, GREEN), 13.2], [G(7, 3), 13.27], [G(6, 5), 13.34], [L(A.rest), 13.41],
    [L(A.m1), 13.5], [L(A.m2), 13.59], [L(A.hips), 13.68],
  ])
  // the tricorder in his resting claw slides in to the belt as the claw goes to the hip ...
  const tri = new Pix()
  emhTricorder(tri, x - 5, y + 6)
  const tIn = `${3 * Q} ${Q}`
  s += `<g>${emhPath(tri)}${emhAnim('opacity', [[0, 1], [5.7, 1], [5.97, 0], [7.4, 0], [7.67, 1], [9.4, 1], [9.4, 0], [13.41, 0], [13.41, 1], [13.5, 1], [13.77, 0]], 'linear')}${emhAnim('transform', [[0, '0 0'], [5.7, '0 0'], [5.97, tIn], [7.4, tIn], [7.67, '0 0'], [13.5, '0 0'], [13.77, tIn], [EMH_D - 0.05, tIn], [EMH_D, '0 0']], 'spline', 'translate')}</g>`
  // ... where it is clipped on
  const bIn = `${-3 * Q} ${-Q}`
  s += `<g opacity="0">${emhPath(new Pix().rect(x + 3, y + 8, 3, 2, '#4b5064').set(x + 4, y + 8, '#6fe8ff'))}${emhAnim('opacity', [[0, 0], [5.7, 0], [5.97, 1], [7.4, 1], [7.67, 0], [13.5, 0], [13.77, 1], [EMH_D - 0.05, 1], [EMH_D, 0]], 'linear')}${emhAnim('transform', [[0, bIn], [5.7, bIn], [5.97, '0 0'], [7.4, '0 0'], [7.67, bIn], [13.5, bIn], [13.77, '0 0'], [EMH_D - 0.05, '0 0'], [EMH_D, bIn]], 'spline', 'translate')}</g>`

  // right claw: raised for the question in four steps and down again, then to the hip
  const R = (rows: string[]) => emhArmRows(k, x, y, 'right', rows)
  const U = (h: number) => emhArmRaise(k, x, y, h)
  s += emhTrack([
    [R(A.rest), 0], [U(2), 4.1], [U(4), 4.19], [U(6), 4.28], [U(8), 4.37],
    [U(6), 5.23], [U(4), 5.32], [U(2), 5.41], [R(A.rest), 5.5],
    [R(A.m1), 5.7], [R(A.m2), 5.79], [R(A.hips), 5.88],
    [R(A.m2), 7.4], [R(A.m1), 7.49], [R(A.rest), 7.58],
    [R(A.m1), 9.6], [R(A.m2), 9.69], [R(A.hips), 9.78],
  ])
  // the tricorder light while scanning: red / green, once a second
  s += emhOn(
    `<rect x="${(x - 12) * Q}" y="${(y + 5) * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="fill" values="#ff5a5a;#7dff9a;#7dff9a" calcMode="discrete" dur="1s" keyTimes="0;0.5;1" repeatCount="indefinite"/></rect>`,
    [[9.65, EMH_SCAN[1]]],
  )

  // a small satisfied nod, eased down and back up
  return `<g>${s}${emhAnim('transform', [[0, '0 0'], [12.55, '0 0'], [12.72, `0 ${Q}`], [12.98, '0 0']], 'spline', 'translate')}</g>`
}

// speech bubble with a pixel glyph
function emhBubble(glyph: string[], x: number, y: number) {
  const body = ['.wwwwwwwww.', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wwwwwwwwwww', '.wwwwwwwww.', '.ww........', 'ww.........']
  const p = new Pix().rows(body, x, y, { w: '#e2eef8' })
  p.rect(x + 1, y + 8, 9, 1, '#b9cde6')
  p.rows(glyph, x + 3, y + 1, { k: '#1d2a4a', r: '#d8342f' })
  return emhPath(p)
}

// the holographic glow, the light line riding the reveal edge, slow sparkles
function emhShimmer(X: number, win: [number, number], closing: boolean) {
  const [a, b] = win
  let s = ''
  s += `<g opacity="0"><ellipse cx="${(X + 9) * Q}" cy="${33 * Q}" rx="${15 * Q}" ry="${13 * Q}" fill="url(#emhHolo)"/>${emhAnim('opacity', [[0, 0], [a - 0.5, 0], [a, 1], [b, 1], [b + 0.9, 0]], 'linear')}</g>`
  // the edge line: down the figure over the reveal, eased exactly like the reveal clip
  const yA = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<rect x="${(X - 5) * Q}" y="${yA}" width="${29 * Q}" height="${Q}" fill="#cdf3ff" opacity="0">${emhAnim('y', [[0, yA], [a, yA], [b, yB], [EMH_D - 0.05, yB], [EMH_D, yA]], 'spline')}${emhAnim('opacity', [[0, 0], [a, 0], [a + 0.2, 0.45], [b - 0.3, 0.45], [b, 0]], 'linear')}</rect>`
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
  back += emhPath(wall)
  // glow under the ceiling lights
  back += `<ellipse cx="${28 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/><ellipse cx="${64 * Q}" cy="${5 * Q}" rx="30" ry="9" fill="#bfe0ff" opacity="0.1"/>`

  // vitals monitor over the bed
  const mon = new Pix()
  mon.rect(17, 6, 25, 16, '#3a4566').rect(17, 6, 25, 1, '#56648e').rect(18, 7, 23, 14, '#0b1c33')
  mon.rect(19, 8, 7, 1, '#f2b866').rect(27, 8, 3, 1, '#e08a3c').rect(31, 8, 9, 1, '#4f8fd6')
  mon.rect(19, 8, 1, 3, '#f2b866')
  mon.rect(19, 17, 4, 2, '#4f8fd6').rect(24, 17, 6, 2, '#f2b866').rect(31, 17, 3, 2, '#c66a5a').rect(35, 17, 5, 2, '#4f8fd6')
  mon.rect(24, 19, 4, 1, '#7a5a3a').rect(35, 19, 3, 1, '#2d4f80')
  back += emhPath(mon)
  // the heartbeat trace: drawn smoothly left to right, then wiped away left to right
  const ekg = new Pix()
  const shape = [0, 0, 0, -1, 0, 0, 1, -3, 2, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 1, -3, 2, 0]
  shape.forEach((d, i) => {
    ekg.set(18 + i, 14 + d, '#6fffc0')
    if (d < -1) ekg.rect(18 + i, 14 + d, 1, -d, '#6fffc0')
    if (d > 1) ekg.rect(18 + i, 14, 1, d + 1, '#6fffc0')
  })
  const SW = EMH_LOOP(5)
  const ekgA = (attr: string, v: string) => `<animate attributeName="${attr}" dur="${SW}s" repeatCount="indefinite" values="${v}" keyTimes="0;0.72;1"/>`
  back += `<clipPath id="emhEkgClip"><rect x="${18 * Q}" y="0" width="0" height="${H}">${ekgA('width', `0;${23 * Q};0`)}${ekgA('x', `${18 * Q};${18 * Q};${41 * Q}`)}</rect></clipPath>`
  back += `<g clip-path="url(#emhEkgClip)">${emhPath(ekg)}</g>`
  // heart light: a slow soft pulse
  back += `<rect x="${39 * Q}" y="${10 * Q}" width="${Q}" height="${Q}" fill="#ff5a5a"><animate attributeName="opacity" values="1;0.3;1" dur="${EMH_LOOP(10)}s" repeatCount="indefinite"/></rect>`

  // status display on the right wall: amber elbow and blue bars
  const pan = new Pix()
  pan.rect(54, 6, 20, 10, '#121625')
  pan.rect(55, 7, 3, 8, '#e8a24a').rect(55, 7, 7, 2, '#e8a24a').set(55, 7, '#121625').set(55, 14, '#121625')
  pan.rect(63, 7, 4, 2, '#c97ad0').rect(68, 7, 5, 2, '#4f8fd6')
  pan.rect(59, 10, 8, 1, '#4f8fd6').rect(68, 10, 4, 1, '#f2b866')
  pan.rect(59, 12, 5, 1, '#f2b866').rect(65, 12, 7, 1, '#4f8fd6')
  pan.rect(59, 14, 10, 1, '#2f5f9c').rect(70, 14, 2, 1, '#e08a3c')
  back += emhPath(pan)
  back += `<rect x="${70 * Q}" y="${14 * Q}" width="${2 * Q}" height="${Q}" fill="#ffd36b"><animate attributeName="opacity" values="1;0.3;1" dur="${EMH_LOOP(7)}s" repeatCount="indefinite"/></rect>`
  back += `<rect x="${59 * Q}" y="${10 * Q}" width="${8 * Q}" height="${Q}" fill="#9fd0ff"><animate attributeName="opacity" values="0;0.6;0" dur="${EMH_LOOP(5)}s" repeatCount="indefinite"/></rect>`
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
  s += emhPath(b)
  // slow breathing: the sheet over the chest rises and settles
  s += `<g opacity="0">${emhPath(new Pix().rect(24, 29, 5, 1, sheetHi))}<animate attributeName="opacity" values="0;1;0" dur="${EMH_LOOP(4)}s" repeatCount="indefinite"/></g>`
  return s
}

function doctorEmh() {
  const W = GW * Q
  const H = GH * Q
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

  // reveal: a clip that opens top to bottom, and later closes top to bottom (eased)
  const full = (EMH_BOT - EMH_TOP) * Q
  const yT = EMH_TOP * Q
  const yB = EMH_BOT * Q
  s += `<clipPath id="emhReveal"><rect x="${-W}" y="${yT}" width="${3 * W}" height="0">${emhAnim('y', [[0, yT], [EMH_DEMAT[0], yT], [EMH_DEMAT[1], yB], [EMH_D - 0.05, yB], [EMH_D, yT]], 'spline')}${emhAnim('height', [[0, 0], [EMH_MAT[0], 0], [EMH_MAT[1], full], [EMH_DEMAT[0], full], [EMH_DEMAT[1], 0]], 'spline')}</rect></clipPath>`

  // the walk: one smooth glide of six steps' length while the legs lift in turn
  const walkTo = `${-EMH_STEP * EMH_STEPS * Q} 0`
  const walk = emhAnim('transform', [[0, '0 0'], [EMH_WALK[0], '0 0'], [EMH_WALK[1], walkTo], [EMH_D - 0.05, walkTo], [EMH_D, '0 0']], 'spline', 'translate', '0.35 0 0.65 1')
  // his shadow, fading in and out with him
  const shadow = `<ellipse cx="${(EMH_X + 9) * Q}" cy="${42.5 * Q}" rx="${12 * Q}" ry="3" fill="#06070d" opacity="0">${emhAnim('opacity', [[0, 0], [EMH_MAT[0] + 0.4, 0], [EMH_MAT[1] + 0.2, 0.6], [EMH_DEMAT[0] + 0.2, 0.6], [EMH_DEMAT[1], 0]], 'linear')}</ellipse>`
  // a little translucent while forming and fading
  const holo = emhAnim('opacity', [[0, 0.75], [EMH_MAT[0], 0.75], [EMH_MAT[1] + 0.4, 1], [EMH_DEMAT[0], 1], [EMH_DEMAT[1], 0.75]], 'linear')
  s += `<g>${shadow}<g clip-path="url(#emhReveal)"><g>${emhDoctor()}${holo}</g></g>${walk}</g>`

  // the scan: a soft beam from the tricorder over the patient, with a line sweeping smoothly to and fro
  const tipX = EMH_X2 - 14
  const beam = new Pix()
  for (let c = 28; c <= tipX; c++) {
    const spread = Math.round((tipX - c) * 0.3)
    for (let r = 32 - spread; r <= 33 + spread; r++) if (r >= 27 && r <= 33) beam.set(c, r, '#8fe3ff')
  }
  const sweepLine = `<rect x="${tipX * Q}" y="${27 * Q}" width="${Q}" height="${7 * Q}" fill="#d8f6ff" opacity="0.6"><animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="${EMH_INOUT};${EMH_INOUT}" dur="2.4s" repeatCount="indefinite" values="0 0;${-11 * Q} 0;0 0" keyTimes="0;0.5;1"/></rect>`
  s += emhFade(`<g opacity="0.2">${emhPath(beam)}</g>${sweepLine}`, EMH_SCAN[0] + 0.1, EMH_SCAN[1], 0.5)

  // "Please state the nature of the medical emergency?" ... and the long wait
  const q = ['.kkk.', 'k...k', '....k', '..kk.', '..k..', '.....', '..k..']
  const dots = ['.....', '.....', '.....', 'k.k.k', '.....', '.....', '.....']
  s += emhFade(emhBubble(q, EMH_X + 3, 16), EMH_ASK[0], EMH_ASK[1] + 0.2)
  s += emhFade(emhBubble(dots, EMH_X2 + 10, 16), EMH_WAIT2[0] + 0.2, EMH_DEMAT[0] + 0.3)
  return s
}
