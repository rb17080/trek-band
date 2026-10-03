// ---------- Tapestry: "Welcome to the afterlife, Jean-Luc" ----------
// Picard wakes in a bright, still void and looks around. He walks slowly to a
// soft pillar of light; the light gently opens and Q is there in white robes,
// arms spread in welcome. Picard startles back a step; Q hops with delight and
// throws both claws up; Picard raises a claw in protest; Q spreads his arms
// again, smug. A calm tableau while the rays drift; then Q and his light recede and
// Picard fades back to where he lay, so the loop starts where it began.
// All motion is eased tweens; pose changes step through in-between drawings.

const TAP_PICARD: CrabHD = { ...PICARD_HD, rim: '#ffe0c8' }

const TAP_Q: CrabHD = {
  skin: '#de7a58',
  light: '#f6a383',
  shade: '#b65d3e',
  upper: '#ffffff',
  lower: '#f4effb',
  lowerShade: '#cfc3e3',
  legs: '#ffffff',
  rim: '#ffd9b8',
}

// Clawd's body without legs, so legs can step, tuck or hide under a robe
function tapBody(k: CrabHD, x: number, y: number, look: Side) {
  const p = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = j === 0 ? k.light : k.skin
    if (j >= 6 && k.upper) c = j < 8 ? k.upper : k.lower!
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, c)
  }
  const far = look === 'right' ? x : x + 17
  const near = look === 'right' ? x + 17 : x
  p.rect(far, y + 1, 1, 5, k.shade)
  p.rect(near, y + 1, 1, 5, k.rim)
  if (k.lowerShade) p.rect(far, y + 8, 1, 1, k.lowerShade)
  const ex = look === 'left' ? [4, 10] : [6, 12]
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, EYE_HD))
  return { p, ex }
}

// legs: frame 0 standing, 1 and 2 are the two walking steps (one pair lifted)
function tapLegs(k: CrabHD, x: number, y: number, frame: number) {
  const p = new Pix()
  ;[1, 5, 11, 15].forEach((lx, i) => {
    const up = (frame === 1 && i % 2 === 0) || (frame === 2 && i % 2 === 1)
    p.rect(x + lx + (up ? 1 : 0), y + 10, 2, up ? 3 : 4, k.legs)
  })
  return p.svg()
}

// arm flung out wide and up: a sleeve of robe, then the claw
function tapArmSpread(k: CrabHD, x: number, y: number, side: Side, sleeve: string, sleeveShade: string) {
  const rows = [
    'l..l.......',
    's..s.......',
    'ssss.......',
    '.sd........',
    '.ssd.......',
    '..sswW.....',
    '...wwwwwww.',
    '....wwwwwww',
    '......WWWWW',
  ]
  const pal = { l: k.light, s: k.skin, d: k.shade, w: sleeve, W: sleeveShade }
  const flip = side === 'right'
  const list = flip ? rows.map(r => [...r].reverse().join('')) : rows
  return new Pix().rows(list, flip ? x + 18 : x - 11, y - 3, pal).svg()
}

// right arm on its way up: forearm angled out, claw at shoulder height
function tapArmHalfRight(k: CrabHD, x: number, y: number) {
  const rows = [
    '..l..l',
    '..s..s',
    '..ssss',
    '..sss.',
    'sssd..',
    'sdd...',
  ]
  return new Pix().rows(rows, x + 18, y - 1, { l: k.light, s: k.skin, d: k.shade }).svg()
}

// eyelids shown inside the given windows: full (blink / asleep) or half (smug)
function tapLidsAt(k: CrabHD, x: number, y: number, ex: number[], on: [number, number][], rows = 3) {
  const lids = new Pix()
  ex.forEach(e => lids.rect(x + e, y + 2, 2, rows, k.skin))
  return shown(lids.svg(), on, SCENE_SECONDS)
}

// a smooth value track on the story timeline: [time, value] points
function tapTrack(attr: string, pts: [number, number][]) {
  const T = SCENE_SECONDS
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < T) all.push([T, all[all.length - 1][1]])
  return `<animate attributeName="${attr}" dur="${T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => +(p[0] / T).toFixed(4)).join(';')}"/>`
}

// an eased transform track on the story timeline: [time, value] keys
function tapTf(type: string, pts: [number, string][], ease = '0.4 0 0.2 1') {
  const T = SCENE_SECONDS
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < T) all.push([T, all[all.length - 1][1]])
  const sp = all.slice(1).map(([, v], i) => (v === all[i][1] ? '0 0 1 1' : ease))
  return `<animateTransform attributeName="transform" type="${type}" calcMode="spline" dur="${T}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => +(p[0] / T).toFixed(5)).join(';')}" keySplines="${sp.join(';')}"/>`
}

// Picard's eyes turned part way (1) or all the way (2) to the left: skin over the
// right-looking eyes, new eyes drawn over
function tapEyes(k: CrabHD, x: number, y: number, shift: number) {
  const p = new Pix()
  ;[6, 12].forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin))
  if (shift === 2) p.rect(x + 16, y + 1, 1, 5, k.skin)
  ;[6, 12].forEach(e => p.rect(x + e - shift, y + 2, 2, 3, EYE_HD))
  return p.svg()
}

function tapestry() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const SX = 69 // where the light comes from
  const B0 = 7.9 // the light starts to open
  const B1 = 9.4 // ... and Q is fully there
  const R0 = 15.85 // at the end the light closes again ...
  const R1 = 16.9 // ... back to the opening pillar
  let s = `<defs>
    <linearGradient id="tapSky" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#b9add6"/><stop offset="0.45" stop-color="#e3dcf2"/><stop offset="1" stop-color="#f7f3ea"/></linearGradient>
    <linearGradient id="tapFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2f4"/><stop offset="1" stop-color="#cbc0e0"/></linearGradient>
    <linearGradient id="tapFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.24" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="tapFade"><rect width="${W}" height="${H}" fill="url(#tapFadeG)"/></mask>
    <radialGradient id="tapGlow"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.35" stop-color="#fff6dc" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient>
    <radialGradient id="tapHalo"><stop offset="0" stop-color="#ffe7a8" stop-opacity="0.9"/><stop offset="0.6" stop-color="#ffd98a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
    <clipPath id="tapFloorClip"><rect x="${-W}" width="${3 * W}" height="${42 * Q}"/></clipPath>
    <radialGradient id="tapCorner" cx="0" cy="1" r="1"><stop offset="0" stop-color="${C.bg}" stop-opacity="1"/><stop offset="0.55" stop-color="${C.bg}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- the void: sky, drifting cloud banks, rays, floor (all steady) ----
  let back = `<rect width="${W}" height="${H}" fill="url(#tapSky)"/>`

  // far cloud banks, pixel blobs drifting slowly
  const cloud = (cx: number, cy: number, w: number, c: string, top: string) => {
    const p = new Pix()
    for (let i = 0; i < w; i++) {
      const h = Math.max(1, Math.round(2.4 * Math.sin((i / w) * Math.PI) + Math.sin(i * 1.7) * 0.7))
      p.rect(cx + i, cy - h, 1, h + 2, c).set(cx + i, cy - h, top)
    }
    return p.svg()
  }
  const banks = [
    [4, 13, 26, '#d2c9e7', '#e2dbf1', 0, -10],
    [46, 9, 22, '#ddd6ee', '#ece7f7', 0, -8],
    [26, 24, 30, '#d5cce9', '#e6e0f4', 0, -6],
    [70, 21, 24, '#e6e0f3', '#f3effa', 0, -12],
  ] as [number, number, number, string, string, number, number][]
  banks.forEach(([cx, cy, w, c, top, a, b]) => {
    back += `<g>${cloud(cx, cy, w, c, top)}${tapTf('translate', [[0, `${a} 0`], [dur / 2, `${b} 0`], [dur, `${a} 0`]], '0.45 0 0.55 1')}</g>`
  })

  // light rays fanning out of the source: steady, swinging slowly once across the story
  let rays = ''
  const fan = [-62, -44, -30, -18, -6, 6, 18, 32, 50]
  fan.forEach((a, i) => {
    const r = (a * Math.PI) / 180
    const len = 150
    const half = 0.07 + (i % 3) * 0.025
    const x1 = SX * Q + Math.sin(r - half) * len
    const y1 = 2 * Q + Math.cos(r - half) * len
    const x2 = SX * Q + Math.sin(r + half) * len
    const y2 = 2 * Q + Math.cos(r + half) * len
    rays += `<polygon points="${SX * Q},${2 * Q} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="#ffffff" opacity="${(0.3 + (i % 3) * 0.06).toFixed(2)}"/>`
  })
  const rot = (d: number) => `${d} ${SX * Q} ${2 * Q}`
  back += `<g>${rays}${tapTf('rotate', [[0, rot(-5)], [dur / 2, rot(5)], [dur, rot(-5)]], '0.45 0 0.55 1')}</g>`

  // floor: a pale plane with a bright line where it meets the void
  const floor = new Pix().rect(0, 42, GW, 1, '#fbf9ff').rect(0, 43, GW, 1, '#e2daf0')
  back += `<rect x="0" y="${43 * Q}" width="${W}" height="${5 * Q}" fill="url(#tapFloor)"/>` + floor.svg()
  s += `<g mask="url(#tapFade)">${back}</g>`

  // the light at the source: steady, and it opens slowly as Q arrives
  s += `<ellipse cx="${SX * Q}" cy="${30 * Q}" rx="18" ry="44" fill="url(#tapGlow)" opacity="0.55">${tapTrack('rx', [[B0, 18], [B1, 44], [R0, 44], [R1, 18]])}${tapTrack('ry', [[B0, 44], [B1, 52], [R0, 52], [R1, 44]])}${tapTrack('opacity', [[B0, 0.55], [B1, 0.9], [R0, 0.9], [R1, 0.55]])}</ellipse>`
  s += `<ellipse cx="${SX * Q}" cy="${43 * Q}" rx="34" ry="6" fill="url(#tapHalo)" opacity="0.6">${tapTrack('opacity', [[B0, 0.6], [B1, 1], [R0, 1], [R1, 0.6]])}</ellipse>`

  // keep the title corner dark and quiet
  s += `<rect x="0" y="${30 * Q}" width="${80 * Q}" height="${18 * Q}" fill="url(#tapCorner)"/>`

  // rising motes of light (single pixels, slow)
  for (let i = 0; i < 7; i++) {
    const d = dur / (5 - (i % 3)) // periods that divide the story, so the loop is seamless
    const x = 48 + i * 6
    s += `<rect x="${x * Q}" y="${41 * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffffff' : '#ffe9a8'}" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 6 : -6} -16 ${i % 2 ? -2 : 3} -34 t ${i % 2 ? 4 : -4} -30" dur="${d}s" begin="${-i * 0.6}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.7;0" dur="${d}s" begin="${-i * 0.6}s" repeatCount="indefinite"/></rect>`
  }

  // ---- the soft pillar of light Picard walks toward; it fades as the light opens ----
  const pillar = new Pix()
  for (let y = 4; y < 42; y++) {
    const w = y < 10 ? 4 : y > 36 ? 10 : 6
    pillar.rect(SX - Math.floor(w / 2), y, w, 1, '#fffdf2')
    pillar.set(SX - Math.floor(w / 2) - 1, y, '#fff3c4').set(SX + Math.ceil(w / 2), y, '#fff3c4')
  }
  pillar.rect(SX - 1, 6, 2, 34, '#ffffff')
  s += `<g opacity="0.85">${pillar.svg()}${tapTrack('opacity', [[B0 + 0.3, 0.85], [B1, 0], [R0 + 0.1, 0], [R1, 0.85]])}</g>`

  // ---- Q: white robes, glowing, arms spread ----
  const qx = 60
  const qy = 28
  const QD = TAP_Q
  const { p: qb, ex: qex } = tapBody(QD, qx, qy, 'left')
  // dark hair across the top of the head, a widow's peak
  qb.rect(qx + 1, qy, 16, 1, '#3a2620').set(qx, qy + 1, '#3a2620').set(qx + 17, qy + 1, '#3a2620')
  qb.rect(qx + 7, qy + 1, 4, 1, '#3a2620').rect(qx + 2, qy + 1, 2, 1, '#5a3c30').rect(qx + 14, qy + 1, 2, 1, '#5a3c30')
  // the robe: collar, a gold sash, and a flowing skirt to the floor
  qb.rect(qx + 6, qy + 6, 6, 1, '#f1eaff').set(qx + 8, qy + 7, '#e5c766').set(qx + 9, qy + 7, '#e5c766')
  qb.rect(qx, qy + 8, 18, 1, '#e8c86a').set(qx + 9, qy + 8, '#fff2b8')
  for (let j = 0; j < 4; j++) {
    const fl = Math.floor(j / 2) + 1
    qb.rect(qx - fl + 1, qy + 10 + j, 16 + 2 * fl, 1, '#ffffff')
    qb.set(qx - fl + 1, qy + 10 + j, '#d6cbe9').set(qx + 16 + fl, qy + 10 + j, '#e4dbf2')
    if (j > 0) qb.set(qx + 5 - (j > 1 ? 1 : 0), qy + 10 + j, '#ebe4f6').set(qx + 12 + (j > 1 ? 1 : 0), qy + 10 + j, '#ebe4f6')
  }
  qb.rect(qx - 1, qy + 9, 1, 1, '#d6cbe9').rect(qx + 18, qy + 9, 1, 1, '#e4dbf2')
  qb.rect(qx - 1, qy + 13, 20, 1, '#ddd3ec')
  let qs = qb.svg()
  // arms: spread in welcome, rest, one claw up then both for the grand gesture, rest, spread again
  // every change steps through the half-raised arm (~0.1 s)
  const spread: [number, number][] = [[0, 11.2], [14.3, dur]]
  const armsSpread = tapArmSpread(QD, qx, qy, 'left', '#ffffff', '#d9cfeb') + tapArmSpread(QD, qx, qy, 'right', '#ffffff', '#d9cfeb')
  qs += shown(armsSpread, spread, dur)
  qs += shown(armRestHD(QD, qx, qy, 'left'), [[11.3, 11.42], [13.0, 14.2]], dur)
  qs += shown(armRestHD(QD, qx, qy, 'right'), [[11.3, 11.67], [13.0, 14.2]], dur)
  qs += shown(armMidHD(QD, qx, qy, 'left'), [[11.2, 11.3], [11.42, 11.5], [12.9, 13.0], [14.2, 14.3]], dur)
  qs += shown(armMidHD(QD, qx, qy, 'right'), [[11.2, 11.3], [11.67, 11.75], [12.9, 13.0], [14.2, 14.3]], dur)
  qs += shown(armUpHD(QD, qx, qy, 'left'), [[11.5, 12.9]], dur)
  qs += shown(armUpHD(QD, qx, qy, 'right'), [[11.75, 12.9]], dur)
  qs += tapLidsAt(QD, qx, qy, qex, [[13.5, 13.62]])
  qs += tapLidsAt(QD, qx, qy, qex, [[14.5, dur]], 1) // smug, half-lidded
  const qhops = hopQ([[10.5, 10.75], [10.95, 11.2], [11.8, 12.05]], dur)
  // the radiant aura behind him, steady once he is there
  const aura = `<ellipse cx="${(qx + 9) * Q}" cy="${(qy + 6) * Q}" rx="32" ry="26" fill="url(#tapHalo)" opacity="0.85"/>`
  s += `<g opacity="0">${aura}<g>${qs}${qhops}</g>${tapTrack('opacity', [[B0 + 0.3, 0], [B1, 1], [R0 - 0.05, 1], [R1 - 0.3, 0]])}</g>`

  // ---- Picard: wakes, stands, looks around, walks slowly in, startles back ----
  const PD = TAP_PICARD
  const px0 = 12
  const py = 28
  // the walk: an eased glide in (and the startled step back), legs stepping at ~7 Hz
  // (one pair lifted, all down, the other pair, all down); at the end he fades out and
  // fades back in, asleep, where he lay at the start
  const W0 = 4.3
  const W1 = 7.4
  const S0 = 9.75
  const S1 = 10.45
  const F = [15.8, 16.35, 16.5, 17.1] // fade out, (moved back unseen), fade in asleep
  const at = (x: number) => `${(x - px0) * Q} 0`
  const walk = tapTf('translate', [[W0, at(12)], [W1, at(28)], [S0 - 0.05, at(28)], [S1, at(24)], [F[1] + 0.03, at(24)], [F[1] + 0.08, at(12)]], '0.3 0 0.6 1')
  const fade = tapTrack('opacity', [[F[0], 1], [F[1], 0], [F[2], 0], [F[3], 1]])
  const legOn: [number, number][][] = [[], [], []]
  let lastEnd = 0
  for (const [a, b] of [[W0, W1], [S0, S1]]) {
    legOn[0].push([lastEnd, a])
    const n = Math.round((b - a) / 0.14)
    for (let i = 0; i < n; i++) legOn[[1, 0, 2, 0][i % 4]].push([a + (i * (b - a)) / n, a + ((i + 1) * (b - a)) / n])
    lastEnd = b
  }
  legOn[0].push([lastEnd, dur])
  // getting up: an eased rise out of the crouch; the legs below are cut off at the floor
  const rise = tapTf('translate', [[2.0, `0 ${3 * Q}`], [2.6, '0 0'], [F[1] + 0.03, '0 0'], [F[1] + 0.08, `0 ${3 * Q}`]])

  const details = (p: Pix) => {
    p.rect(px0 + 12, 34, 2, 2, '#e8c547').set(px0 + 12, 34, '#fff3b0')
    p.rect(px0 + 4, 34, 1, 1, '#e8c547').rect(px0 + 6, 34, 1, 1, '#e8c547')
  }
  const { p: pbR, ex: pexR } = tapBody(PD, px0, py, 'right')
  details(pbR)
  pbR.rect(px0 + 16, py + 1, 1, 5, '#f09a76') // the light washing over his right side
  let ps = pbR.svg()
  // looking around: the eyes slide left through a halfway frame, and back
  ps += shown(tapEyes(PD, px0, py, 1), [[2.9, 3.0], [3.95, 4.05]], dur)
  ps += shown(tapEyes(PD, px0, py, 2), [[3.0, 3.95]], dur)
  // asleep, then the lids lift in steps; blinks
  ps += tapLidsAt(PD, px0, py, pexR, [[0, 1.6], [1.85, 1.97], [5.6, 5.72], [15.3, 15.42], [F[1], dur]])
  ps += tapLidsAt(PD, px0, py, pexR, [[1.6, 1.7]], 2)
  ps += tapLidsAt(PD, px0, py, pexR, [[1.7, 1.8]], 1)
  ps += tapLidsAt(PD, px0, py, [4, 10], [[3.35, 3.47]])
  for (const f of [0, 1, 2]) ps += shown(tapLegs(PD, px0, py, f), legOn[f], dur)
  // the protest: the claw comes up through two in-between frames, holds, comes down the same way
  const half: [number, number][] = [[12.9, 13.02], [14.27, 14.4]]
  const mid: [number, number][] = [[13.02, 13.15], [14.15, 14.27]]
  const up: [number, number][] = [[13.15, 14.15]]
  ps += shown(armRestHD(PD, px0, py, 'left'), [[0, dur]], dur)
  ps += shown(armRestHD(PD, px0, py, 'right'), complement(merge([...half, ...mid, ...up]), dur), dur)
  ps += shown(tapArmHalfRight(PD, px0, py), half, dur)
  ps += shown(armMidHD(PD, px0, py, 'right'), mid, dur)
  ps += shown(armUpHD(PD, px0, py, 'right'), up, dur)
  s += `<g>${walk}${fade}<g clip-path="url(#tapFloorClip)"><g>${rise}<g>${ps}${hopQ([[9.6, 9.82]], dur)}</g></g></g></g>`

  return s
}
