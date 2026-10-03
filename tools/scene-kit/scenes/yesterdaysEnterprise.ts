// ---------- Yesterday's Enterprise ----------
// A quiet bridge. On the viewscreen a temporal rift slowly opens, and the battered
// Enterprise-C drifts out of it. The timeline shifts: the bridge goes dark and
// wartime-red, and Tasha Yar is standing at tactical again. Picard looks to her,
// she nods; he raises his claw. The Enterprise-C turns, sails back into the rift,
// the rift closes, and the bridge (and history) quietly goes back to normal.
// Everything moves on eased splines; pose swaps go through in-between frames.

const YE_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f2a985',
}

const YE_TASHA: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#1c1424',
  lower: '#d4a22e',
  lowerShade: '#a37a1c',
  legs: '#1c1424',
  rim: '#f2a985',
}

// a plain rect in art pixels
const yeR = (x: number, y: number, w: number, h: number, c: string, extra = '') =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"${extra}/>`

function yeRnd(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

// One smooth animation on the story timeline: keys are [seconds, value]
const YE_EASE = '0.42 0 0.58 1'
function yeAnim(attr: string, keys: [number, string][], tag = 'animate', extra = '') {
  const T = SCENE_SECONDS
  const k = [...keys]
  if (k[0][0] > 0) k.unshift([0, k[0][1]])
  if (k[k.length - 1][0] < T) k.push([T, k[k.length - 1][1]])
  const kt = k.map(([t]) => +(t / T).toFixed(4))
  kt[kt.length - 1] = 1
  const splines = k.slice(1).map(() => YE_EASE).join(';')
  return `<${tag} attributeName="${attr}" ${extra}dur="${T}s" repeatCount="indefinite" calcMode="spline" keySplines="${splines}" values="${k.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"/>`
}
const yeFade = (keys: [number, number][]) => yeAnim('opacity', keys.map(([t, v]) => [t, String(v)] as [number, string]))
// ambient loops divide the story length (and start already running, via a negative begin),
// so they are in the same phase at the restart
const yeAmb = (vals: string, div: number, begin = 0) =>
  `<animate attributeName="opacity" values="${vals}" dur="${(SCENE_SECONDS / div).toFixed(4)}s" begin="${-begin}s" repeatCount="indefinite"/>`

// screen content area, in art pixels
const YE_SX = 28
const YE_SY = 2
const YE_SW = 58
const YE_SH = 24

// the Enterprise-C (Ambassador class), side on, facing right, battle-scarred.
// Drawn with its top-left at 0,0; it is 30 x 9 art pixels.
function yeShipC() {
  const pal: Record<string, string> = {
    s: '#dcdde8', w: '#e2e3ec', W: '#c3c4d1', g: '#85869a', h: '#a9abbb', H: '#c6c8d5', k: '#66677b',
    N: '#cdcedc', n: '#9a9cae', b: '#e8553a', r: '#9a3626', c: '#4f8fc8', p: '#7d7e92', d: '#e0a050',
    o: '#ffe6a0', x: '#4a4554', X: '#2e2a36',
  }
  const rows = [
    '................swws..........',
    '..........wwwWWxxWWWWWWWWww...',
    'NNNNNxNNNb.gWWoWXxoWWoWWoWWWg.',
    'nnnnnnnxnr..gggXgggggxgggggg..',
    '.ccccccc.....kgg.xgggg........',
    '......pp......hk..............',
    '.....hhhhhHHHHhhxhhhhhd.......',
    '....hhhxhhhhhhhXxhhhhhk.......',
    '.....kkkkkkkkkkkkkkkk.........',
  ]
  let s = new Pix().rows(rows, 0, 0, pal).svg()
  // hull breaches: small dim embers that breathe slowly
  const breach = new Pix().set(17, 2, '#ff8a4a').set(15, 3, '#ff7a3a').set(16, 7, '#ff8a4a').set(7, 3, '#ff7a3a')
  s += `<g>${breach.svg()}${yeAmb('0.55;1;0.55', 7)}</g>`
  // a thin wisp of venting plasma trailing behind
  s += `<g opacity="0.35">${new Pix().rect(-3, 7, 3, 1, '#9fb0c8').rect(-6, 7, 2, 1, '#7d8aa6').set(-8, 6, '#6a7590').svg()}</g>`
  return s
}

// the Enterprise-C bow-on, for the middle of her turn (14 x 6, centred on the hull)
function yeShipFront() {
  const pal: Record<string, string> = {
    s: '#dcdde8', w: '#e2e3ec', W: '#c3c4d1', g: '#85869a', h: '#a9abbb', k: '#66677b',
    N: '#cdcedc', n: '#9a9cae', c: '#4f8fc8', p: '#7d7e92', d: '#e0a050', o: '#ffe6a0', x: '#4a4554',
  }
  const rows = [
    '.....swws.....',
    '.wWWWWWWWWWWw.',
    'gWoWWWxWWWoWWg',
    '.gggggkkgxggg.',
    'Nn.p.hddh.p.nN',
    'cc...hhhh...cc',
  ]
  return `<g transform="translate(${-7 * Q} ${-3 * Q})">${new Pix().rows(rows, 0, 0, pal).svg()}</g>`
}

// the temporal rift: a slow, soft violet swirl around a dark eye
function yeRift() {
  const T = SCENE_SECONDS
  let arms = ''
  const seg = (base: number, t0: number, t1: number) => {
    const pts: string[] = []
    for (let t = t0; t <= t1 + 0.001; t += 0.2) {
      const r = 3.5 + t * 2.7
      pts.push(`${(r * Math.cos(base + t)).toFixed(1)},${(r * Math.sin(base + t)).toFixed(1)}`)
    }
    return pts.join(' ')
  }
  const bands: [number, number, number, string, number][] = [
    [0, 1.8, 2.6, '#d9b4ff', 0.7],
    [1.8, 3.6, 2.2, '#bb92f0', 0.6],
    [3.6, 5.4, 1.8, '#9672da', 0.48],
    [5.4, 6.8, 1.3, '#7454b6', 0.34],
  ]
  for (let a = 0; a < 3; a++) {
    const base = (a * 2 * Math.PI) / 3
    for (const [t0, t1, w, c, o] of bands) {
      arms += `<polyline points="${seg(base, t0, t1)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`
    }
    arms += `<polyline points="${seg(base + Math.PI / 3, 1.0, 4.6)}" fill="none" stroke="#ffb27a" stroke-width="1" opacity="0.4"/>`
  }
  let ring = ''
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ring += `<rect x="${(25 * Math.cos(a) - 1).toFixed(1)}" y="${(25 * Math.sin(a) - 1).toFixed(1)}" width="2" height="2" fill="#8a6ad2" opacity="${i % 2 ? 0.3 : 0.45}"/>`
  }
  return (
    `<circle r="32" fill="url(#yeRiftGlow)"/>` +
    `<g>${ring}<animateTransform attributeName="transform" type="rotate" values="360;0" dur="${(T / 2).toFixed(4)}s" repeatCount="indefinite"/></g>` +
    `<g>${arms}<animateTransform attributeName="transform" type="rotate" values="0;360" dur="${(T / 3).toFixed(4)}s" repeatCount="indefinite"/></g>` +
    `<circle r="5.5" fill="#1a0d30" opacity="0.9"/><circle r="5.5" fill="none" stroke="#c49cff" stroke-width="1" opacity="0.45"/><circle r="2.5" fill="#2c1850"/>`
  )
}

function yesterdaysEnterprise() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q

  // ---- the beat sheet
  const riftOpen: [number, number] = [1.8, 4.4]
  const shipOut: [number, number] = [4.4, 7.2]
  const grimIn: [number, number] = [6.2, 8.6]
  const tashaIn: [number, number] = [6.6, 8.6]
  const lookAtTasha: [number, number] = [8.8, 10.0]
  const nod: [number, number] = [9.3, 9.8]
  const clawRaise: [number, number] = [10.3, 14.7] // rest -> half -> up and back, in-betweens from the kit
  const turn: [number, number] = [11.0, 12.4]
  const goBack: [number, number] = [12.4, 14.2]
  const riftClose: [number, number] = [14.0, 15.9]
  const grimOut: [number, number] = [14.4, 16.2]

  let s = `<defs>
    <linearGradient id="yeFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="yeFade"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#yeFadeG)"/></mask>
    <linearGradient id="yeFadeCG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.1" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="yeFadeC"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#yeFadeCG)"/></mask>
    <linearGradient id="yeWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1420"/><stop offset="1" stop-color="#33273a"/></linearGradient>
    <linearGradient id="yeSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05040c"/><stop offset="1" stop-color="#0d0a1c"/></linearGradient>
    <radialGradient id="yeNeb"><stop offset="0" stop-color="#7b5bc6" stop-opacity="0.16"/><stop offset="1" stop-color="#7b5bc6" stop-opacity="0"/></radialGradient>
    <radialGradient id="yeRiftGlow"><stop offset="0" stop-color="#b58cff" stop-opacity="0.5"/><stop offset="0.45" stop-color="#8656d0" stop-opacity="0.26"/><stop offset="1" stop-color="#5a3a9a" stop-opacity="0"/></radialGradient>
    <radialGradient id="yeSpill"><stop offset="0" stop-color="#a27cff" stop-opacity="0.22"/><stop offset="1" stop-color="#a27cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="yeWarm"><stop offset="0" stop-color="#ffcf9a" stop-opacity="0.12"/><stop offset="1" stop-color="#ffcf9a" stop-opacity="0"/></radialGradient>
    <pattern id="yeScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="2" fill="#000" opacity="0.08"/></pattern>
    <clipPath id="yeScreen"><rect x="${YE_SX * Q}" y="${YE_SY * Q}" width="${YE_SW * Q}" height="${YE_SH * Q}"/></clipPath>
  </defs>`

  // ---- the bridge in peacetime, fading in from the band on the left
  let back = `<rect x="-6" y="-6" width="${W + 12}" height="${H + 12}" fill="url(#yeWall)"/>`
  back += yeR(0, 0, GW, 2, '#120d17') + yeR(0, 1, GW, 1, '#ffd9a0', ' opacity="0.3"')
  // a soft warm wash: the normal, lived-in Enterprise-D
  back += `<ellipse cx="${20 * Q}" cy="${16 * Q}" rx="60" ry="40" fill="url(#yeWarm)"/>`
  // LCARS wall panel
  const lc = new Pix()
  lc.rect(9, 5, 15, 17, '#0b0910')
  lc.rect(10, 6, 13, 2, '#f29a3a').rect(10, 8, 3, 12, '#f29a3a').set(10, 6, '#0b0910').set(22, 6, '#c9a7ff')
  lc.rect(14, 9, 4, 2, '#c39be0').rect(19, 9, 4, 2, '#8aa7e8')
  lc.rect(14, 12, 9, 1, '#f7c487')
  lc.rect(14, 14, 3, 2, '#8aa7e8').rect(18, 14, 5, 2, '#c39be0')
  lc.rect(14, 17, 5, 1, '#8aa7e8').rect(20, 17, 3, 1, '#f29a3a')
  lc.rect(10, 20, 13, 1, '#b48fd6')
  back += `<g opacity="0.6">${lc.svg()}</g>`
  ;[[15, 19, 5], [18, 19, 6], [21, 19, 7]].forEach(([x, y, d], i) => {
    back += `<g>${yeR(x, y, 2, 1, i === 1 ? '#c9a7ff' : '#f7c487')}${yeAmb('1;0.4;1', d)}</g>`
  })
  // wood trim, baseboard, carpet
  const wall = new Pix()
  wall.rect(0, 29, GW, 2, '#5e3f2c').rect(0, 29, GW, 1, '#8a6040')
  wall.rect(0, 33, GW, 1, '#0f0b13')
  wall.rect(0, 34, GW, 14, '#1d1724').rect(0, 34, GW, 1, '#2c2236')
  wall.rect(0, 38, GW, 1, '#221b2a').rect(58, 43, GW - 58, 1, '#19141f')
  for (let x = 2; x < GW; x += 9) wall.rect(x, 31, 1, 2, '#2a2030')
  back += wall.svg()
  // the rift's violet light on the wall and the floor
  back += `<g opacity="0"><ellipse cx="${46 * Q}" cy="${31 * Q}" rx="90" ry="20" fill="url(#yeSpill)"/>${yeFade([[riftOpen[0], 0], [riftOpen[1], 1], [riftClose[0], 1], [riftClose[1], 0]])}</g>`

  // ---- the alternate timeline: dark, cold, a steady red battle light
  let grim = yeR(-3, -3, GW + 6, GH + 6, '#05060c', ' opacity="0.42"')
  grim += yeR(0, 1, GW, 1, '#ff3a2a', ' opacity="0.5"')
  grim += yeR(0, 32, GW, 1, '#c0302a', ' opacity="0.32"')
  grim += yeR(88, 3, 2, 24, '#ff2e3a', ' opacity="0.35"')
  // the LCARS panel shows a tactical plot instead
  const tac = new Pix()
  tac.rect(10, 6, 13, 15, '#140608')
  tac.rect(10, 6, 13, 1, '#b8322a').rect(10, 7, 1, 14, '#b8322a').rect(10, 20, 13, 1, '#7a2420')
  for (let y = 9; y < 20; y += 3) tac.rect(12, y, 10, 1, '#3a1012')
  for (let x = 13; x < 22; x += 3) tac.rect(x, 8, 1, 12, '#3a1012')
  tac.set(14, 11, '#ff6a4a').set(19, 13, '#ff6a4a').set(16, 16, '#ffb070').set(20, 17, '#ff6a4a')
  grim += `<g opacity="0.75">${tac.svg()}</g>`
  // a faint haze hanging in the air
  grim += yeR(0, 22, GW, 7, '#3a3346', ' opacity="0.14"')
  back += `<g opacity="0">${grim}${yeFade([[grimIn[0], 0], [grimIn[1], 1], [grimOut[0], 1], [grimOut[1], 0]])}</g>`
  s += `<g mask="url(#yeFade)">${back}</g>`

  // ---- the viewscreen
  const bez = new Pix()
  bez.rect(27, 0, 61, 27, '#0e0b12').rect(28, 0, 59, 1, '#4a4152').rect(27, 1, 1, 25, '#2a2330').rect(87, 1, 1, 25, '#2a2330')
  bez.rect(28, 26, 59, 1, '#3a3142')
  s += bez.svg()

  let scr = `<rect x="${YE_SX * Q}" y="${YE_SY * Q}" width="${YE_SW * Q}" height="${YE_SH * Q}" fill="url(#yeSpace)"/>`
  scr += `<ellipse cx="${70 * Q}" cy="${8 * Q}" rx="60" ry="20" fill="url(#yeNeb)"/>`
  const rnd = yeRnd(41)
  for (let y = YE_SY; y < YE_SY + YE_SH; y += 2) {
    for (let x = YE_SX; x < YE_SX + YE_SW; x += 3) {
      if (rnd() < 0.72) continue
      const jx = x + Math.floor(rnd() * 3)
      scr += yeR(jx, y, 1, 1, '#cdbaf0', ` opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"`)
    }
  }
  ;[[33, 5], [80, 20], [62, 4], [36, 22], [83, 6]].forEach(([x, y], i) => {
    const glow = new Pix().set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    scr += `<g>${glow.svg()}${yeAmb('0.15;0.7;0.15', 6 - (i % 3), i * 0.6)}</g>`
    scr += `<g>${new Pix().set(x, y, '#f4eeff').svg()}${yeAmb('0.6;1;0.6', 6 - (i % 3), i * 0.6)}</g>`
  })

  // the rift: opens out of nothing, swirls, closes calmly
  const rx = 45 * Q
  const ry = 14 * Q
  const riftScale = yeAnim('transform', [[riftOpen[0], '0.05'], [riftOpen[1], '1'], [riftClose[0], '1'], [riftClose[1], '0.05']], 'animateTransform', 'type="scale" ')
  scr += `<g transform="translate(${rx} ${ry})"><g>${riftScale}<g opacity="0">${yeFade([[riftOpen[0], 0], [riftOpen[0] + 1.8, 1], [riftClose[0] + 0.4, 1], [riftClose[1], 0]])}<g transform="scale(1 0.82)">${yeRift()}</g></g></g></g>`

  // the Enterprise-C: out of the rift, holds, turns about, and back in
  const hold = `${66 * Q} ${13 * Q}`
  const shipMove = yeAnim('transform', [[shipOut[0], `${rx} ${ry}`], [shipOut[1], hold], [turn[0], hold], [turn[1], `${65 * Q} ${13 * Q}`], [goBack[1], `${rx} ${ry}`]], 'animateTransform', 'type="translate" ')
  const shipScale = yeAnim('transform', [[shipOut[0], '0.15'], [shipOut[1], '1'], [goBack[0], '1'], [goBack[1], '0.15']], 'animateTransform', 'type="scale" ')
  // turning about: the hull narrows to edge-on and opens out facing the other way
  const shipFlip = yeAnim('transform', [[turn[0], '1 1'], [turn[1], '-1 1'], [14.6, '-1 1'], [15.0, '1 1']], 'animateTransform', 'type="scale" ')
  // mid-turn she shows her bow: the side view hands over to a bow-on sprite and back
  const tm = (turn[0] + turn[1]) / 2
  const sideFade = yeFade([[tm - 0.38, 1], [tm - 0.12, 0], [tm + 0.12, 0], [tm + 0.38, 1]])
  const frontFade = yeFade([[tm - 0.4, 0], [tm - 0.14, 1], [tm + 0.14, 1], [tm + 0.4, 0]])
  // a slow drift up and down while she holds station
  const bob = yeAnim('transform', [[shipOut[1], '0 0'], [8.6, '0 -1'], [10.0, '0 1'], [turn[0], '0 0']], 'animateTransform', 'type="translate" ')
  scr += `<g opacity="0">${yeFade([[shipOut[0], 0], [shipOut[0] + 0.9, 1], [goBack[1] - 0.8, 1], [goBack[1], 0]])}<g>${shipMove}<g>${bob}<g>${shipScale}<g>${sideFade}<g>${shipFlip}<g transform="translate(${-15 * Q} ${-4.5 * Q})">${yeShipC()}</g></g></g><g opacity="0">${frontFade}${yeShipFront()}</g></g></g></g></g>`

  scr += `<rect x="${YE_SX * Q}" y="${YE_SY * Q}" width="${YE_SW * Q}" height="${YE_SH * Q}" fill="url(#yeScan)"/>`
  scr += `<polygon points="${30 * Q},${2 * Q} ${36 * Q},${2 * Q} ${30 * Q},${8 * Q}" fill="#ffffff" opacity="0.05"/>`
  s += `<g clip-path="url(#yeScreen)">${scr}</g>`

  // ---- Tasha Yar at tactical: only there while history is wrong
  const tx = 8
  const ty = 25
  const hair = '#d9c07a'
  const hairHi = '#f2e2a8'
  const hairSh = '#ad8f45'
  const tashaDetails = (p: Pix) => {
    // short, cropped blonde hair: a low cap with a ragged fringe
    p.rect(tx + 3, ty - 2, 12, 1, hair).rect(tx + 1, ty - 1, 16, 1, hair).rect(tx, ty, 18, 1, hair)
    ;[5, 9, 12].forEach(c => p.set(tx + c, ty - 2, hairHi))
    p.set(tx + 3, ty - 1, hairHi).set(tx + 7, ty - 1, hairHi).set(tx + 14, ty - 1, hairHi)
    ;[2, 5, 8, 11, 14].forEach(c => p.set(tx + c, ty, hairSh))
    p.rect(tx, ty + 1, 2, 1, hair).set(tx + 3, ty + 1, hair).set(tx + 15, ty + 1, hair).rect(tx + 16, ty + 1, 2, 1, hair)
    p.set(tx, ty + 2, hairSh).set(tx + 17, ty + 2, hairSh)
    // security gold, combadge, two pips
    p.rect(tx, ty + 7, 18, 1, YE_TASHA.lower!).set(tx, ty + 7, YE_TASHA.lowerShade!)
    p.rect(tx + 12, ty + 7, 2, 2, '#e8c547').set(tx + 12, ty + 7, '#fff3b0')
    p.set(tx + 2, ty + 6, '#e8c547').set(tx + 4, ty + 6, '#e8c547')
  }
  let tasha = crabHD(YE_TASHA, tx, ty, 'right', T, { left: [], right: [] }, [], T / 4, tashaDetails)
  // her nod: eyes dip down one pixel and come back
  const nodEyes = new Pix()
  for (let c = 6; c <= 13; c++) nodEyes.rect(tx + c, ty + 2, 1, 4, YE_TASHA.skin)
  nodEyes.rect(tx + 6, ty + 3, 2, 3, EYE_HD).rect(tx + 12, ty + 3, 2, 3, EYE_HD)
  tasha += shown(nodEyes.svg(), [nod], T)
  s += `<g opacity="0">${tasha}${yeFade([[tashaIn[0], 0], [tashaIn[1], 1], [grimOut[0], 1], [grimOut[1] - 0.3, 0]])}</g>`

  // the tactical console in front of her
  const con = new Pix()
  con.rect(4, 35, 29, 1, '#9a8fa6').rect(3, 36, 31, 1, '#0b0910').rect(4, 35, 1, 1, '#5b5266')
  con.rect(5, 36, 4, 1, '#f29a3a').rect(10, 36, 3, 1, '#8aa7e8').rect(14, 36, 5, 1, '#c39be0').rect(20, 36, 3, 1, '#f7c487').rect(28, 36, 2, 1, '#c0201c')
  // kept short (ends at row 40) so the floor under the title stays plain
  con.rect(3, 37, 31, 4, '#4a3020').rect(3, 37, 31, 1, '#7a5236').rect(3, 40, 31, 1, '#2e1e14')
  for (const x of [10, 18, 26]) con.rect(x, 38, 1, 2, '#33221a')
  s += `<g mask="url(#yeFadeC)">${con.svg()}</g>`

  // ---- Picard before the screen
  const px = 56
  const py = 28
  const fringe = '#9b928c'
  const picardDetails = (p: Pix) => {
    p.rect(px, py + 2, 1, 3, fringe).rect(px + 1, py + 3, 1, 2, fringe).rect(px + 17, py + 2, 1, 3, fringe).rect(px + 16, py + 3, 1, 2, fringe)
    p.set(px, py + 2, '#bdb5ae').set(px + 17, py + 2, '#bdb5ae')
    p.rect(px + 12, py + 7, 2, 2, '#e8c547').set(px + 12, py + 7, '#fff3b0')
    for (const c of [1, 3, 5, 7]) p.set(px + c, py + 6, '#e8c547')
  }
  s += crabHD(YE_PICARD, px, py, 'right', T, { left: [], right: [clawRaise] }, [], T / 4, picardDetails)
  // his eyes on Tasha: a glance across with an in-between step each way
  const eyesAt = (e: number[]) => {
    const p = new Pix()
    for (let c = 4; c <= 13; c++) p.rect(px + c, py + 2, 1, 3, YE_PICARD.skin)
    e.forEach(c => p.rect(px + c, py + 2, 2, 3, EYE_HD))
    return p.svg()
  }
  const [g0, g1] = lookAtTasha
  s += shown(eyesAt([5, 11]), [[g0, g0 + 0.09], [g1 - 0.09, g1]], T)
  s += shown(eyesAt([4, 10]), [[g0 + 0.09, g1 - 0.09]], T)

  return s
}
