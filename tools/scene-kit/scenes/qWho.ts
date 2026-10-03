// ---------- Q Who: "Welcome to the Borg" ----------
// The Enterprise cruises. Q turns, smug, raises a claw and snaps: a Borg cube
// slowly looms out of the dark, the sky goes sickly green, and a tractor beam
// drags the little ship in. Q glances back, pleased, hops; snaps again; it all goes away.

const QW_Q: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f6a77c',
}

function qwSparkle(cx: number, cy: number, r: number, core: string, ray: string) {
  const p = new Pix()
  for (let i = 1; i <= r; i++) {
    const c = i === r ? ray : core
    p.set(cx - i, cy, c).set(cx + i, cy, c).set(cx, cy - i, c).set(cx, cy + i, c)
  }
  if (r >= 3) p.set(cx - 1, cy - 1, ray).set(cx + 1, cy - 1, ray).set(cx - 1, cy + 1, ray).set(cx + 1, cy + 1, ray)
  p.set(cx, cy, '#ffffff')
  return p.svg()
}

function qwCube() {
  let seed = 71
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const p = new Pix()
  const fx = 55
  const fy = 7
  const fw = 30
  const fh = 30
  const d = 6
  // front face: dark plating, seams every 6, pipes and boxes
  p.rect(fx, fy, fw, fh, '#2f3b32')
  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++) {
      if (j % 6 === 0 || i % 6 === 0) p.set(fx + i, fy + j, '#1f2922')
      else if (rnd() < 0.07) p.set(fx + i, fy + j, '#3a473d')
    }
  }
  for (let cj = 0; cj < fh; cj += 6) {
    for (let ci = 0; ci < fw; ci += 6) {
      const k = rnd()
      const x0 = fx + ci + 1
      const y0 = fy + cj + 1
      if (k < 0.3) {
        const r = y0 + 1 + Math.floor(rnd() * 3)
        p.rect(x0, r, 5, 1, '#55685a')
        p.rect(x0 + 1 + Math.floor(rnd() * 3), r + 1, 1, 2, '#4a5b4e')
      } else if (k < 0.55) {
        const c = x0 + 1 + Math.floor(rnd() * 3)
        p.rect(c, y0, 1, 5, '#4f6153')
        p.rect(c - 2, y0 + 2, 2, 1, '#4f6153')
      } else if (k < 0.8) {
        p.rect(x0 + 1, y0 + 1, 3, 3, '#3d4c40').rect(x0 + 1, y0 + 1, 3, 1, '#55685a').set(x0 + 2, y0 + 2, '#18201a')
      } else {
        p.rect(x0, y0 + 1, 5, 3, '#232c25').rect(x0 + 1, y0 + 2, 3, 1, '#2f8a4a')
      }
    }
  }
  // top face, lit
  for (let r = 1; r <= d; r++) {
    const y = fy - r
    const x = fx + r
    p.rect(x, y, fw, 1, r === d ? '#7a8e7c' : '#56695a')
    for (let i = 0; i < fw; i++) {
      if ((i + r) % 6 === 0) p.set(x + i, y, '#435346')
      else if (rnd() < 0.15) p.set(x + i, y, '#66796a')
    }
  }
  // side face, in shadow
  for (let k = 1; k <= d; k++) {
    const x = fx + fw - 1 + k
    p.rect(x, fy - k, 1, fh, '#1b231d')
    for (let j = 0; j < fh; j++) {
      if ((j + k) % 6 === 0) p.set(x, fy - k + j, '#141a15')
      else if (rnd() < 0.15) p.set(x, fy - k + j, '#28332b')
    }
  }
  // edges: lit top-front edge, front-left rim
  p.rect(fx, fy, fw, 1, '#8aa08c')
  p.rect(fx, fy, 1, fh, '#4a5c4d')
  for (let r = 1; r <= d; r++) p.set(fx + r, fy - r, '#8aa08c')
  let s = p.svg()
  // green lights deep in the hull, pulsing
  const lights = new Pix()
  ;[[58, 12], [64, 20], [71, 15], [78, 26], [61, 31], [74, 33], [82, 10], [68, 27]].forEach(([x, y]) => lights.set(x, y, '#5dff8a'))
  s += `<g>${lights.svg()}<animate attributeName="opacity" values="0.5;1;0.5" dur="${(SCENE_SECONDS / 7).toFixed(3)}s" repeatCount="indefinite"/></g>`
  const lights2 = new Pix()
  ;[[62, 16], [77, 19], [66, 34], [80, 30], [59, 24]].forEach(([x, y]) => lights2.set(x, y, '#9dffb5'))
  s += `<g>${lights2.svg()}<animate attributeName="opacity" values="1;0.45;1" dur="${(SCENE_SECONDS / 6).toFixed(3)}s" repeatCount="indefinite"/></g>`
  return s
}

// Enterprise-D seen from the side, facing left: saucer, neck, engineering hull,
// nacelles on pylons with red bussards at the front
function qwShip(x: number, y: number) {
  const pal = {
    w: '#f2f2fa', W: '#cfd0dc', g: '#8f90a2', h: '#b9bac8', k: '#7a7b8e',
    n: '#a9aabb', p: '#8f90a2', N: '#d8d9e6', b: '#ff4a3a', c: '#6ac8ff', d: '#5ad8ff', o: '#ffe9a0',
  }
  return new Pix()
    .rows(
      [
        '...wwwwww.............',
        '.wWWWWWWWWw..bNNNNNNN.',
        'gWoWWoWWWWWg.bnnnnnnnn',
        '.gggggggggg...ccccccc.',
        '.....kh.......p.......',
        '......dhhhhhhhhk......',
        '......hhhhhhhhhk......',
        '.......kkkkkkkk.......',
      ],
      x,
      y,
      pal,
    )
    .svg()
}


// One smooth animation on the story timeline: keys are [seconds, value]
const QW_EASE = '0.42 0 0.58 1'
function qwAnim(attr: string, keys: [number, string, string?][], tag = 'animate', extra = '') {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(4))
  kt[kt.length - 1] = 1
  const splines = k.slice(1).map(x => x[2] ?? QW_EASE).join(';')
  return `<${tag} attributeName="${attr}" ${extra}dur="${T}s" repeatCount="indefinite" calcMode="spline" keySplines="${splines}" values="${k.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"/>`
}
const qwFade = (keys: [number, number][]) => qwAnim('opacity', keys.map(([t, v]) => [t, String(v)] as [number, string]))
const qwMove = (keys: [number, number, number, string?][]) =>
  qwAnim('transform', keys.map(([t, x, y, sp]) => [t, `${x} ${y}`, sp] as [number, string, string?]), 'animateTransform', 'type="translate" ')

// the snap: a small sparkle at the claw that swells, drifts upward and fades
function qwSnap(x: number, y: number, t: number) {
  const art =
    `<circle cx="${x * Q + 1}" cy="${y * Q + 1}" r="9" fill="url(#qwSnapG)"/>` +
    qwSparkle(x, y, 2, '#fff3c0', '#ffd36b')
  return `<g opacity="0">${art}${qwFade([[t, 0], [t + 0.45, 1], [t + 0.8, 0.85], [t + 1.8, 0]])}${qwMove([[t, 0, 0], [t + 1.8, 0, -10]])}</g>`
}

function qWho() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  // story beats (seconds)
  const turn1 = 2.8 // Q turns to the ship, smug
  const snap1 = 4.9 // first snap
  const cubeIn: [number, number] = [5.1, 7.5]
  const beamOut: [number, number] = [7.6, 9.0]
  const drag: [number, number] = [9.0, 12.4]
  const look: [number, number] = [9.7, 12.2] // glances back over his shoulder
  const snap2 = 13.3
  const beamBack: [number, number] = [13.5, 14.3]
  const cubeOut: [number, number] = [14.2, 16.2]

  let s = `<defs>
    <linearGradient id="qwSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e0a1c"/><stop offset="1" stop-color="#22183a"/></linearGradient>
    <linearGradient id="qwFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="qwFade"><rect width="${W}" height="${H}" fill="url(#qwFadeG)"/></mask>
    <radialGradient id="qwNeb"><stop offset="0" stop-color="#9b7bd6" stop-opacity="0.2"/><stop offset="1" stop-color="#9b7bd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="qwBorgGlow"><stop offset="0" stop-color="#3dff7a" stop-opacity="0.2"/><stop offset="0.6" stop-color="#2bd060" stop-opacity="0.06"/><stop offset="1" stop-color="#2bd060" stop-opacity="0"/></radialGradient>
    <radialGradient id="qwLock"><stop offset="0" stop-color="#5dff8a" stop-opacity="0.25"/><stop offset="1" stop-color="#5dff8a" stop-opacity="0"/></radialGradient>
    <radialGradient id="qwSnapG"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.75"/><stop offset="0.5" stop-color="#ffe7a0" stop-opacity="0.25"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- deep space, fading in from the band on the left
  let back = `<rect width="${W}" height="${H}" fill="url(#qwSky)"/>`
  back += `<ellipse cx="${30 * Q}" cy="${14 * Q}" rx="70" ry="22" fill="url(#qwNeb)"/>`
  let seed = 29
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let y = 1; y < 46; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.66) continue
      const o = 0.1 + rnd() * 0.3
      const jx = x + Math.floor(rnd() * 2)
      if (jx < 35 && y > 41) continue
      back += `<rect x="${jx * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#cdbaf0" opacity="${o.toFixed(2)}"/>`
    }
  }
  ;[[26, 3], [44, 26], [40, 40], [16, 12], [88, 42]].forEach(([x, y], i) => {
    const tw = `dur="${(SCENE_SECONDS / [7, 6, 5, 4, 3][i]).toFixed(3)}s" begin="-${i * 0.6}s"`
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${glow.svg()}<animate attributeName="opacity" values="0.15;0.8;0.15" ${tw} repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0.6;1;0.6" ${tw} repeatCount="indefinite"/></g>`
  })
  // System J-25: the sky slowly turns sickly green while the Borg are here
  back += `<rect width="${W}" height="${H}" fill="#0f3a22" opacity="0">${qwFade([[cubeIn[0], 0], [cubeIn[1] + 0.4, 0.42], [cubeOut[0], 0.42], [cubeOut[1], 0]])}</rect>`
  s += `<g mask="url(#qwFade)">${back}</g>`

  // ---- the cube: fades in and grows out of the dark around its centre, holds, then fades away
  const ccx = 70 * Q
  const ccy = 21 * Q
  const grow = qwAnim('transform', [[cubeIn[0], '0.55'], [cubeIn[1], '1'], [cubeOut[0], '1'], [cubeOut[1], '0.8']], 'animateTransform', 'type="scale" ')
  s += `<g opacity="0">${qwFade([[cubeIn[0], 0], [cubeIn[1], 1], [cubeOut[0], 1], [cubeOut[1], 0]])}<g transform="translate(${ccx} ${ccy})"><g>${grow}<g transform="translate(${-ccx} ${-ccy})"><ellipse cx="${ccx}" cy="${ccy}" rx="80" ry="54" fill="url(#qwBorgGlow)"/>${qwCube()}</g></g></g></g>`

  // ---- Enterprise-D: cruises in from the right, is held and dragged, then drifts free
  const sx = 30
  const sy = 7
  const hold: [number, number] = [-4, -1]
  const pulled: [number, number] = [6, 4]
  const shipKeys: [number, number, number, string?][] = [
    [0, 36, -6], [beamOut[0], ...hold], [drag[0], ...hold], [drag[1], ...pulled], [beamBack[1] + 0.3, ...pulled],
    // released: it flies on off the left edge, then glides back in from the right to its opening spot
    [15.7, -112, 0, '0.5 0 0.85 0.6'], [15.71, 126, -6, '0 0 1 1'], [T, 36, -6, '0.2 0.55 0.45 1'],
  ]

  // tractor beam: narrow at the cube's emitter, spreading over the ship; it reaches out
  // steadily, follows the ship as it is dragged, and pulls back in on the second snap
  const tip = (dx: number, dy: number, a: [number, number], b: [number, number]) =>
    `${a[0] * Q + dx},${a[1] * Q + dy} ${b[0] * Q + dx},${b[1] * Q + dy}`
  const poly = (cube: [number, number][], a: [number, number], b: [number, number], fill: string, op: number) => {
    const base = cube.map(([x, y]) => `${x * Q},${y * Q}`).join(' ')
    const shut = `${base} ${54 * Q},${21 * Q} ${54 * Q},${19 * Q}`
    const at = (p: [number, number]) => `${base} ${tip(p[0], p[1], a, b)}`
    const keys: [number, string][] = [
      [beamOut[0], shut], [beamOut[1], at(hold)], [drag[1], at(pulled)], [beamBack[0], at(pulled)], [beamBack[1], shut],
    ]
    return `<polygon points="${shut}" fill="${fill}" opacity="${op}">${qwAnim('points', keys)}</polygon>`
  }
  const beam =
    poly([[55, 17], [55, 23]], [sx + 5, sy + 8], [sx + 21, sy + 1], '#3dff7a', 0.26) +
    poly([[55, 19], [55, 21]], [sx + 11, sy + 6], [sx + 16, sy + 3], '#b5ffc8', 0.45)
  const emit = new Pix().rect(55, 18, 2, 4, '#9dffb5').set(55, 19, '#ffffff').set(55, 20, '#ffffff').rect(54, 19, 1, 2, '#5dff8a')
  s += `<g opacity="0">${beam}${emit.svg()}${qwFade([[beamOut[0] - 0.5, 0], [beamOut[0], 1], [beamBack[1], 1], [beamBack[1] + 0.6, 0]])}</g>`

  // the ship, with a soft green lock halo and a slow 1 px shudder while it is held
  const halo = `<ellipse cx="${(sx + 11) * Q}" cy="${(sy + 4) * Q}" rx="30" ry="14" fill="url(#qwLock)" opacity="0">${qwFade([[beamOut[1] - 0.3, 0], [beamOut[1] + 0.7, 1], [beamBack[0], 1], [beamBack[1] + 0.4, 0]])}</ellipse>`
  const jig: [number, number, number][] = [[drag[0], 0, 0]]
  let n = 0
  for (let t = drag[0] + 0.4; t < beamBack[0] - 0.2; t += 0.4) jig.push([t, n % 2 ? 0 : 1, n++ % 2 ? 0 : 1])
  jig.push([beamBack[0], 0, 0])
  const shudder = qwMove(jig)
  s += `<g>${qwMove(shipKeys)}${halo}<g>${qwShip(sx, sy)}${shudder}</g></g>`

  // ---- Q: Starfleet captain's red, four pips, one eyebrow up
  const qx = 12
  const qy = 28
  const insignia = (p: Pix) => {
    for (const c of [11, 13, 15]) p.set(qx + c, qy + 6, '#e8c547')
    p.set(qx + 9, qy + 6, '#e8c547')
    p.rect(qx + 4, qy + 7, 2, 2, '#e8c547').set(qx + 4, qy + 7, '#fff3b0')
  }
  const brow = '#5a2a1c'
  const k = QW_Q
  const turnBack = 15.3 // after the cube is gone he turns back to face us
  const TS = 0.35 // a turn takes this long
  // the face: 0 = looking out at us (left), 1 = at the ship (right)
  const face: [number, number][] = [[turn1, 0], [turn1 + TS, 1], [look[0], 1], [look[0] + TS, 0], [look[1], 0], [look[1] + TS, 1], [turnBack, 1], [turnBack + TS, 0]]
  const { p: qb } = clawdBody(k, qx, qy, 'left')
  qb.rect(qx + 4, qy + 2, 2, 3, k.skin).rect(qx + 10, qy + 2, 2, 3, k.skin)
  insignia(qb)
  let qs = qb.svg() + armRestHD(k, qx, qy, 'left') + armRestHD(k, qx, qy, 'right')
  // light and shade on the body edges cross-fade as he turns
  const edgeR = new Pix().rect(qx, qy + 1, 1, 5, k.shade).rect(qx + 17, qy + 1, 1, 5, k.rim).set(qx, qy + 8, k.lowerShade!).set(qx + 17, qy + 8, k.lower!)
  qs += `<g opacity="0">${edgeR.svg()}${qwFade(face)}</g>`
  // eyes (one half-lidded), the arched brow and the blinking lids glide together
  const fp = new Pix().rect(qx + 4, qy + 2, 2, 3, EYE_HD).rect(qx + 10, qy + 2, 2, 3, EYE_HD).rect(qx + 4, qy + 2, 2, 1, k.shade)
  fp.set(qx + 9, qy + 1, brow).rect(qx + 10, qy, 2, 1, brow).set(qx + 12, qy + 1, brow)
  const lids = new Pix().rect(qx + 4, qy + 2, 2, 3, k.skin).rect(qx + 10, qy + 2, 2, 3, k.skin)
  qs += `<g>${fp.svg()}<g opacity="0">${lids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${(T / 4).toFixed(4)}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;0.92;0.95"/></g>${qwMove(face.map(([t, v]) => [t, v * 2 * Q, 0]))}</g>`
  // the right claw rises smoothly out of the shoulder (clipped there), snaps shut, sinks back
  const cx = qx + 18
  const cy = qy - 8
  const UP = '0.25 0.6 0.4 1'
  const arm: [number, number, number, string?][] = [[3.7, 0, 12 * Q], [4.15, 0, 0, UP], [6.0, 0, 0], [6.4, 0, 12 * Q], [12.4, 0, 12 * Q], [12.8, 0, 0, UP], [14.25, 0, 0], [14.65, 0, 12 * Q]]
  const half = new Pix().rect(cx + 1, cy + 1, 2, 1, k.skin)
  const closed = new Pix().rect(cx + 1, cy, 2, 1, k.light)
  qs += `<clipPath id="qwArmClip"><rect x="${(qx + 17) * Q}" y="${(qy - 9) * Q}" width="${7 * Q}" height="${13 * Q}"/></clipPath><g clip-path="url(#qwArmClip)"><g transform="translate(0 ${12 * Q})">${armUpHD(k, qx, qy, 'right')}${shown(half.svg(), [[snap1 - 0.09, 6.4], [snap2 - 0.09, 14.65]], T)}${shown(closed.svg(), [[snap1, 6.4], [snap2, 14.65]], T)}${qwMove(arm)}</g></g>`
  // green rim light from the cube on his right side, coming and going with it
  const rim = new Pix().rect(qx + 17, qy + 1, 1, 5, '#8fe0a0').rect(qx + 18, qy + 4, 3, 1, '#8fe0a0')
  qs += `<g opacity="0">${rim.svg()}${qwFade([[cubeIn[0], 0], [cubeIn[1], 0.8], [cubeOut[0], 0.8], [cubeOut[1], 0]])}</g>`
  // pleased with himself: three small hops while he watches over his shoulder
  s += `<g>${qs}${hopQ([[10.3, 10.55], [10.95, 11.2], [11.6, 11.85]], T)}</g>`

  // the snaps: small sparkles at the claw
  s += qwSnap(cx + 1, cy - 2, snap1) + qwSnap(cx + 1, cy - 2, snap2)
  return s
}
