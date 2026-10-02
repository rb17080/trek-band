// ---------- Scorpion: Species 8472 against the Borg ----------
// One 17.17 s story. Calm space: Janeway and an 8472 in the foreground, a Borg
// cube ahead. The bioship's veins light up one by one and its orb charges; a
// steady beam reaches the cube; cracks creep across it; it splits and drifts
// apart in soft orange and green blooms. The 8472 turns to Janeway, and she
// raises a claw: her decision. Debris drifts on into a quiet ending.

const SC8_JANEWAY: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#b3262e', // command red shoulders
  lower: '#16121c', // black Voyager jacket
  lowerShade: '#0c0a10',
  legs: '#16121c',
  rim: '#ffd27a', // beam light from the right
}

const sc8K = (t: number) => +(t / SCENE_SECONDS).toFixed(4)

// translate in grid units along the story, keyed in seconds (must start at 0, end at SCENE_SECONDS)
function sc8Move(keys: [number, number, number][], discrete = false, easeOut = false) {
  const t = keys.map(k => sc8K(k[0])).join(';')
  const v = keys.map(k => `${+(k[1] * Q).toFixed(2)} ${+(k[2] * Q).toFixed(2)}`).join(';')
  const mode = discrete ? ' calcMode="discrete"' : easeOut ? ` calcMode="spline" keySplines="${keys.slice(1).map(() => '0.25 0.6 0.45 1').join(';')}"` : ''
  return `<animateTransform attributeName="transform" type="translate"${mode} dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${v}" keyTimes="${t}"/>`
}

// opacity along the story, keyed in seconds (must start at 0, end at SCENE_SECONDS)
function sc8Fade(keys: [number, number][]) {
  const t = keys.map(k => sc8K(k[0])).join(';')
  const v = keys.map(k => k[1]).join(';')
  return `<animate attributeName="opacity" dur="${SCENE_SECONDS}s" repeatCount="indefinite" values="${v}" keyTimes="${t}"/>`
}

// a ragged disc: core, then three rings
function sc8Burst(cx: number, cy: number, r: number, ring: string[], seed: number, core = '#fffbe0') {
  let s = seed
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const p = new Pix()
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.sqrt(x * x + y * y) + (rnd() - 0.5) * 1.2
      if (d > r + 0.3) continue
      const f = d / (r + 0.3)
      const c = f < 0.3 ? core : f < 0.55 ? ring[0] : f < 0.8 ? ring[1] : ring[2]
      p.set(cx + x, cy + y, c)
    }
  }
  return sc8Path(p)
}

// Pix written as one <path> per colour: far smaller than one <rect> per run
function sc8Path(p: Pix) {
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

function scorpion() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let seed = 8472
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  // ---- the story, in seconds ----
  const tVeins = 2.2 // the bioship's veins begin to glow, back to front
  const tOrb = 3.0 // the orb at the prongs starts to gather
  const tFire = 6.2 // the beam leaves the prongs...
  const tHit = 7.0 // ...and reaches the cube
  const tSplit = 9.6 // the cube gives way
  const tTurn = 12.2 // the 8472 turns to Janeway
  const tClaw = 13.8 // Janeway raises her claw

  let s = `<defs>
    <linearGradient id="sc8Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0a1c"/><stop offset="1" stop-color="#241a3a"/></linearGradient>
    <linearGradient id="sc8FadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="sc8Fade"><rect width="${W}" height="${H}" fill="url(#sc8FadeG)"/></mask>
    <radialGradient id="sc8NebG"><stop offset="0" stop-color="#46d17a" stop-opacity="0.22"/><stop offset="1" stop-color="#46d17a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8NebV"><stop offset="0" stop-color="#a67bd6" stop-opacity="0.26"/><stop offset="1" stop-color="#a67bd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8Hit"><stop offset="0" stop-color="#ffcf6a" stop-opacity="0.5"/><stop offset="0.5" stop-color="#ff7a3a" stop-opacity="0.16"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8Charge"><stop offset="0" stop-color="#ffe9a0" stop-opacity="0.6"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8GlowO"><stop offset="0" stop-color="#ff9a3d" stop-opacity="0.45"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc8GlowG"><stop offset="0" stop-color="#6ef07a" stop-opacity="0.4"/><stop offset="1" stop-color="#2a9a48" stop-opacity="0"/></radialGradient>
    <clipPath id="sc8BeamClip"><rect x="${47 * Q}" y="0" width="0" height="${H}"><animate attributeName="width" dur="${dur}s" repeatCount="indefinite" values="0;0;${14 * Q};${14 * Q}" keyTimes="0;${sc8K(tFire)};${sc8K(tHit)};1"/></rect></clipPath>
  </defs>`

  // ---- background: space, nebulae, stars, distant cube ----
  let back = `<rect width="${W}" height="${H}" fill="url(#sc8Sky)"/>`
  back += `<ellipse cx="${62 * Q}" cy="${12 * Q}" rx="62" ry="30" fill="url(#sc8NebG)"/>`
  back += `<ellipse cx="${26 * Q}" cy="${8 * Q}" rx="60" ry="22" fill="url(#sc8NebV)"/>`
  const dots = [new Pix(), new Pix(), new Pix()]
  for (let y = 1; y < 40; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.6) continue
      dots[Math.floor(rnd() * 3)].set(x, y, '#cdbaf0')
    }
  }
  dots.forEach((d, i) => (back += `<g opacity="${0.14 + i * 0.12}">${sc8Path(d)}</g>`))
  // a few stars that breathe slowly
  ;[[12, 20], [48, 2], [86, 30], [58, 26], [30, 22]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${sc8Path(glow)}<animate attributeName="opacity" values="0.15;0.8;0.15" dur="${2.6 + i * 0.7}s" begin="${i * 0.5}s" repeatCount="indefinite"/></g>`
    back += new Pix().set(x, y, '#ffffff').svg()
  })
  // a second, distant cube: the Collective is everywhere
  const far = new Pix()
  far.rect(85, 6, 4, 4, '#2a3038').rect(86, 5, 4, 1, '#3a414b').rect(89, 6, 1, 4, '#1c2026')
  far.set(86, 7, '#3fae5c').set(88, 8, '#3fae5c')
  back += `<g opacity="0.8">${sc8Path(far)}</g>`
  s += `<g mask="url(#sc8Fade)">${back}</g>`

  // ---- the Borg cube: two halves along a jagged crack ----
  const cx0 = 52 // front face left
  const cy0 = 8 // front face top
  const F = 14 // front face size
  const D = 4 // depth
  const crack = (y: number) => cx0 + 7 + ((y * 3) % 5 === 0 ? 1 : 0) - (y % 4 === 1 ? 1 : 0) + Math.round((y - cy0) * 0.15)
  const leftHalf = new Pix()
  const rightHalf = new Pix()
  const put = (x: number, y: number, c: string) => (x <= crack(y) ? leftHalf : rightHalf).set(x, y, c)
  // top face (slanted back and right)
  for (let j = 0; j < D; j++) {
    const y = cy0 - D + j
    for (let i = 0; i < F; i++) {
      const x = cx0 + (D - j) + i
      put(x, y, j === 0 ? '#7a828c' : (i + j) % 4 === 0 ? '#4c535c' : '#5d656f')
    }
  }
  // right face
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < F; j++) {
      const x = cx0 + F + i
      const y = cy0 + j - i
      put(x, y, (j + i) % 3 === 0 ? '#1a1e23' : '#23282e')
    }
  }
  // front face: machinery grid
  for (let j = 0; j < F; j++) {
    for (let i = 0; i < F; i++) {
      const x = cx0 + i
      const y = cy0 + j
      let c = (i % 4 === 0 || j % 5 === 0) ? '#2c3138' : '#3b4149'
      if ((i * 7 + j * 3) % 11 === 0) c = '#4a515a'
      if (i === 0) c = '#59616b'
      put(x, y, c)
    }
  }
  // green Borg lights; half of them pulse slowly while the cube is whole
  const lights: [number, number][] = [[2, 2], [9, 1], [5, 6], [12, 4], [3, 10], [10, 9], [7, 12], [12, 12]]
  const pulseL = new Pix()
  const pulseR = new Pix()
  lights.forEach(([i, j], n) => {
    put(cx0 + i, cy0 + j, '#2f8f4a')
    if (n % 2 === 0) (cx0 + i <= crack(cy0 + j) ? pulseL : pulseR).set(cx0 + i, cy0 + j, '#8dffa8')
  })
  put(cx0 + F + 1, cy0 + 5, '#2f8f4a')
  put(cx0 + F + 2, cy0 + 9, '#2f8f4a')
  // the slice creeps out from where the beam strikes, then spiders sideways
  const cracks = [new Pix(), new Pix(), new Pix()]
  for (let y = cy0 - D; y < cy0 + F; y++) {
    const d = Math.abs(y - (cy0 + 2))
    cracks[d < 4 ? 0 : d < 8 ? 1 : 2].set(crack(y), y, y % 2 ? '#ffb347' : '#ffe08a')
  }
  ;[[3, 4], [4, 4], [5, 5], [10, 7], [11, 8], [11, 9], [2, 11], [3, 12], [4, 13]].forEach(([i, j], n) => cracks[n < 3 ? 1 : 2].set(cx0 + i, cy0 + j, '#ff8a3d'))

  // each crack layer glows in over 0.8 s, then cools to embers after the split
  const crackT = [tHit + 0.3, tHit + 1.0, tHit + 1.7]
  const crackSvg = (n: number) =>
    `<g opacity="0">${sc8Path(cracks[n])}${sc8Fade([[0, 0], [crackT[n], 0], [crackT[n] + 0.8, 1], [tSplit + 0.6, 1], [tSplit + 3.5, 0.35], [dur, 0.25]])}</g>`
  const lightsDie = (p: Pix) =>
    `<g>${`<g>${sc8Path(p)}<animate attributeName="opacity" values="0.2;0.9;0.2" dur="2.4s" repeatCount="indefinite"/></g>`}${sc8Fade([[0, 1], [tSplit, 1], [tSplit + 1.5, 0], [dur, 0]])}</g>`
  // the halves drift apart, quickly at first, then slower and slower
  const halfMove = (dx: number, dy: number) => sc8Move([[0, 0, 0], [tSplit, 0, 0], [dur, dx, dy]], false, true)
  let cube = ''
  cube += `<g>${sc8Path(leftHalf)}${lightsDie(pulseL)}${crackSvg(0)}${crackSvg(1)}${crackSvg(2)}${halfMove(-3, -1)}</g>`
  cube += `<g>${sc8Path(rightHalf)}${lightsDie(pulseR)}${halfMove(7, -2)}</g>`
  // while the beam holds it, the cube trembles: one art pixel, slowly
  const shake: [number, number, number][] = [[0, 0, 0]]
  for (let t = tHit + 0.4, n = 0; t < tSplit - 0.2; t += 0.4, n++) shake.push([t, n % 2 ? 0 : 0.5, n % 2 ? 0.5 : 0])
  shake.push([tSplit - 0.2, 0, 0], [dur, 0, 0])
  s += `<g>${cube}${sc8Move(shake, true)}</g>`

  // ---- the bioship: a spiny organic bulb with three prongs curving forward ----
  const ship = new Pix()
  const by = 10 // centre line
  const tan = (v: number) => (v < 0.16 ? '#8b6c96' : v < 0.3 ? '#b99a7e' : '#a8876c')
  const bcx = 27
  for (let y = -5; y <= 5; y++) {
    for (let x = -7; x <= 7; x++) {
      const e = (x * x) / 49 + (y * y) / 27
      if (e > 1) continue
      let c = tan(rnd())
      if (y < -2 && e > 0.55) c = '#dcc09c'
      else if (y < -1 && e > 0.4 && rnd() < 0.5) c = '#c8aa88'
      if (y > 1 && e > 0.5) c = rnd() < 0.5 ? '#6e5770' : '#7c6276'
      if (y > 2 && e > 0.75) c = '#4a3956'
      if (x > 4 && y > -3 && e > 0.7) c = '#e8c9a0'
      ship.set(bcx + x, by + y, c)
    }
  }
  const nx = 45
  const ny = by
  const prong = (p0: number[], p1: number[], p2: number[], thick: number) => {
    for (let k = 0; k <= 24; k++) {
      const t = k / 24
      const x = Math.round((1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0])
      const y = Math.round((1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
      const w = t < 0.6 ? thick : 1
      for (let j = 0; j < w; j++) ship.set(x, y + j, j === 0 ? (t > 0.8 ? '#f0d8b0' : '#c9ab8a') : tan(rnd()) === '#8b6c96' ? '#8b6c96' : '#7c6276')
    }
  }
  prong([31, by - 3], [36, by - 9], [43, by - 3], 2)
  prong([33, by], [38, by - 1], [42, by], 2)
  prong([31, by + 2], [36, by + 8], [43, by + 2], 2)
  ;[[21, -4, -1], [24, -5, -1], [27, -5, -1], [22, 4, 1], [25, 5, 1]].forEach(([x, y, d]) => {
    ship.set(x, by + y + d, '#c9ab8a').set(x - 1, by + y + 2 * d, '#9c7f9e').set(x - 2, by + y + 3 * d, '#6e5770')
  })
  ship.rect(18, by - 1, 2, 1, '#8b6c96').set(17, by - 2, '#6e5770').rect(18, by + 1, 2, 1, '#6e5770').set(17, by + 2, '#4a3956')
  s += sc8Path(ship)

  // organic veins: they wake one stretch at a time, from the back of the bulb to the prongs
  const veinPts = [[20, 0], [22, -1], [24, 0], [26, 1], [28, 0], [30, 0], [33, -3], [35, -4], [33, 3], [35, 4], [34, -1], [37, 0]]
  const veinGroups = [new Pix(), new Pix(), new Pix()]
  veinPts.forEach(([x, y]) => veinGroups[x < 25 ? 0 : x < 31 ? 1 : 2].set(x + 2, by + y, '#ffcf6a'))
  veinGroups.forEach((g, i) => {
    const a = tVeins + i * 1.1
    s += `<g opacity="0">${sc8Path(g)}${sc8Fade([[0, 0], [a, 0], [a + 1.8, 1], [tSplit, 1], [tSplit + 2.5, 0.25], [dur, 0.2]])}</g>`
  })

  // the orb gathers at the focal point in three sizes, each held over a second
  const orbRings = ['#ffe9a0', '#ffc35a', '#e8892e']
  const orbFade = sc8Fade([[0, 0], [tOrb, 0], [tOrb + 0.6, 1], [tSplit, 1], [tSplit + 1.2, 0], [dur, 0]])
  let orb = ''
  orb += shown(sc8Burst(nx, ny, 0, orbRings, 11, '#fff2c0'), [[tOrb, tOrb + 1.4]], dur)
  orb += shown(sc8Burst(nx, ny, 1, orbRings, 12, '#fff2c0'), [[tOrb + 1.4, tOrb + 2.6]], dur)
  orb += shown(sc8Burst(nx, ny, 2, orbRings, 13, '#fff2c0'), [[tOrb + 2.6, dur]], dur)
  s += `<g opacity="0">${orb}${orbFade}</g>`
  s += `<circle cx="${(nx + 0.5) * Q}" cy="${(ny + 0.5) * Q}" r="12" fill="url(#sc8Charge)" opacity="0">${sc8Fade([[0, 0], [tOrb, 0], [tFire, 0.9], [tSplit, 0.9], [tSplit + 1.4, 0], [dur, 0]])}</circle>`

  // the beam: a steady line that extends from the orb to the cube's face, then fades
  const bx1 = nx + 2
  const bx2 = crack(ny)
  const beam = new Pix()
  for (let x = bx1; x <= bx2; x++) {
    beam.set(x, ny, '#fff0b8')
    beam.set(x, ny - 1, '#ffd36b').set(x, ny + 1, '#ffa94a')
  }
  const halo = `<rect x="${bx1 * Q}" y="${(ny - 2) * Q}" width="${(bx2 - bx1 + 1) * Q}" height="${5 * Q}" fill="#ffb347" opacity="0.22"/>`
  s += `<g clip-path="url(#sc8BeamClip)" opacity="0">${halo}${sc8Path(beam)}${sc8Fade([[0, 0], [tFire, 0], [tFire + 0.3, 1], [tSplit, 1], [tSplit + 1.0, 0], [dur, 0]])}</g>`

  // where it strikes: a small local glow that rises, holds, and cools
  s += `<circle cx="${(bx2 + 0.5) * Q}" cy="${(ny + 0.5) * Q}" r="16" fill="url(#sc8Hit)" opacity="0">${sc8Fade([[0, 0], [tHit, 0], [tHit + 0.8, 0.85], [tSplit + 1.2, 0.85], [tSplit + 4, 0], [dur, 0]])}</circle>`
  // sparks peeling away from the strike point
  for (let i = 0; i < 6; i++) {
    const t0 = tHit + 0.3 + i * 0.4
    const dx = (2 + rnd() * 3) * Q
    const dy = (rnd() - 0.5) * 8 * Q
    s += `<rect x="${bx2 * Q}" y="${ny * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffd36b' : '#ff9a3d'}" opacity="0"><animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${dx.toFixed(1)} ${dy.toFixed(1)};${dx.toFixed(1)} ${dy.toFixed(1)}" keyTimes="0;${sc8K(t0)};${sc8K(t0 + 1.2)};1"/>${sc8Fade([[0, 0], [t0, 0], [t0 + 0.2, 1], [t0 + 1.2, 0], [dur, 0]])}</rect>`
  }

  // ---- the split: soft local blooms, orange and green, one after another ----
  const orange = ['#ffd27a', '#ff9a3d', '#d8452a']
  const green = ['#c8f7a8', '#6ef07a', '#2a9a48']
  const booms: [number, number, number, number, boolean][] = [
    [59, 9, tSplit, 4, false],
    [64, 15, tSplit + 0.7, 3, true],
    [55, 16, tSplit + 1.4, 3, false],
    [67, 5, tSplit + 2.1, 3, true],
    [60, 13, tSplit + 2.8, 3, true],
    [56, 6, tSplit + 3.5, 2, false],
  ]
  booms.forEach(([x, y, t, r, isGreen], i) => {
    const ring = isGreen ? green : orange
    const disc = sc8Burst(0, 0, r, ring, 100 + i * 7, ring[0])
    const px = (x + 0.5) * Q
    const py = (y + 0.5) * Q
    // the disc swells from half size while it brightens, then keeps growing a little as it fades
    const grow = `<animateTransform attributeName="transform" type="scale" dur="${dur}s" repeatCount="indefinite" values="0.5;0.5;1;1.2;1.2" keyTimes="0;${sc8K(t)};${sc8K(t + 0.7)};${sc8K(t + 2.2)};1"/>`
    const fade = sc8Fade([[0, 0], [t, 0], [t + 0.6, 0.85], [t + 0.9, 0.85], [t + 2.2, 0], [dur, 0]])
    s += `<g opacity="0"><circle cx="${px}" cy="${py}" r="${(r + 4) * Q}" fill="url(#${isGreen ? 'sc8GlowG' : 'sc8GlowO'})"/><g transform="translate(${px - Q / 2} ${py - Q / 2})"><g>${disc}${grow}</g></g>${fade}</g>`
  })

  // debris: shards of cube and hot fragments, drifting out slowly and staying adrift
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2
    const dist = 9 + rnd() * 18
    const dx = Math.cos(a) * dist * Q
    const dy = Math.sin(a) * dist * Q * 0.7
    const t0 = tSplit + 0.2 + rnd() * 3.2
    const hot = i % 3 !== 2
    const c = !hot ? (i % 2 ? '#59616b' : '#4a515a') : i % 2 ? '#ffb347' : '#5fe36a'
    const sz = i % 5 === 0 ? 2 : 1
    const end = hot ? 0.35 : 0.9
    s += `<rect x="${(59 + Math.round((rnd() - 0.5) * 6)) * Q}" y="${(11 + Math.round((rnd() - 0.5) * 6)) * Q}" width="${sz * Q}" height="${sz * Q}" fill="${c}" opacity="0"><animateTransform attributeName="transform" type="translate" calcMode="spline" keySplines="0 0 1 1;0.2 0.6 0.4 1" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${dx.toFixed(1)} ${dy.toFixed(1)}" keyTimes="0;${sc8K(t0)};1"/>${sc8Fade([[0, 0], [t0, 0], [t0 + 0.5, 1], [t0 + 3, end], [dur, end]])}</rect>`
  }

  // ---- Voyager's hull as the foreground deck ----
  const hull = new Pix()
  hull.rect(0, 42, GW, 6, '#1b1626').rect(18, 42, GW - 18, 1, '#3a3350')
  for (let x = 24; x < GW; x += 9) hull.rect(x, 43, 1, 2, '#120e1a')
  for (let i = 0; i < 8; i++) hull.set(20 + Math.floor(rnd() * 70), 44 + Math.floor(rnd() * 4), rnd() < 0.5 ? '#251f33' : '#140f1e')
  s += `<g mask="url(#sc8Fade)">${sc8Path(hull)}</g>`
  ;[44, 62, 80].forEach((x, i) => {
    s += `<g>${new Pix().set(x, 43, '#ffb347').svg()}<animate attributeName="opacity" values="1;0.35;1" dur="2.6s" begin="${i * 0.8}s" repeatCount="indefinite"/></g>`
  })

  // ---- Species 8472: tall, tripod-legged, mottled cream-green ----
  const alien = [
    '.......lll........',
    '......llaal.......',
    '.....laaaaac......',
    '.....aaaaaac......',
    '.....aaaaaac......',
    '......abaac.......',
    '.......dad........',
    '........ac........',
    '.......aac........',
    '....llaaaaac......',
    '...laabaabaac.....',
    '..lab.aaaac.bac...',
    '..ac..abac...ac...',
    '..ac..aabc...bc...',
    '..bc..aaac...ac...',
    '..ac..abac...ac...',
    '..ac..aaac...bc...',
    '.lac.laaaac..ac...',
    '.a.a.aabaac.a.a...',
    '.a.a.aac.aac.a.a..',
    '.....ac..ac.ac....',
    '....ac...bc..ac...',
    '....ac...ac..ac...',
    '...ac....ac...ac..',
    '...bc....ac...ac..',
    '..ac.....bc....ac.',
    '..ac.....ac....ac.',
    '.ac......ac.....ac',
    '.ac.....ldd.....ac',
    'ldd.............ldd',
  ]
  const ax = 70
  const ay = 12
  const HEAD = 7 // rows 0..6 turn with the head
  const alienPal = { l: '#ecebc6', a: '#cfcf9c', b: '#93ad6c', c: '#7d8a58', d: '#4a5636', e: '#2a2a1a' }
  const head = new Pix().rows(alien.slice(0, HEAD), ax, ay, alienPal)
  const body = new Pix().rows(alien.slice(HEAD), ax, ay + HEAD, alienPal)
  alien.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 'a') continue
      const v = rnd()
      const p = j < HEAD ? head : body
      if (v < 0.17) p.set(ax + i, ay + j, '#a6bc7a')
      else if (v < 0.23) p.set(ax + i, ay + j, '#a68fa6')
    }
  })
  // eyes: dark sockets with a yellow glint; straight ahead, then on the cube, then down at Janeway
  const eyePair = (pts: [number, number][]) => {
    const p = new Pix()
    pts.forEach(([i, j]) => p.set(ax + i, ay + j, '#ffe066'))
    return sc8Path(p)
  }
  const tWatch = tHit + 0.4
  let eyes = ''
  eyes += shown(eyePair([[6, 3], [9, 3]]), [[0, tWatch]], dur)
  eyes += shown(eyePair([[5, 3], [8, 3]]), [[tWatch, tTurn]], dur)
  eyes += shown(eyePair([[5, 4], [8, 4]]), [[tTurn, dur]], dur)
  const eyeGlow = `<animate attributeName="opacity" values="0.75;1;0.75" dur="3.2s" repeatCount="indefinite"/>`
  // the head turns in two steps: eyes drop first, then the head leans toward her
  const headTurn = sc8Move([[0, 0, 0], [tTurn + 0.5, -1, 0], [dur, -1, 0]], true)
  s += `<g>${sc8Path(body)}<g>${sc8Path(head)}<g>${eyes}${eyeGlow}</g>${headTurn}</g></g>`

  // ---- Janeway: auburn bun, black jacket, red shoulders, four pips ----
  const jx = 26
  const jy = 28
  s += crabHD(
    SC8_JANEWAY, jx, jy, 'right', dur,
    { left: [], right: [[tClaw + 0.7, dur]] },
    [],
    4.7,
    p => {
      const hair = '#8a3a1e'
      const hairL = '#b2522a'
      const dark = '#5e2412'
      p.rect(jx + 1, jy, 15, 1, hair).rect(jx + 4, jy, 9, 1, hairL)
      p.rect(jx, jy + 1, 2, 3, hair).set(jx + 2, jy + 1, hair).set(jx, jy + 3, dark)
      p.rect(jx + 2, jy - 1, 11, 1, hair).rect(jx + 5, jy - 1, 6, 1, hairL)
      p.rows(['.bbb.', 'bLLbb', 'bLbbd', '.bbd.'], jx, jy - 4, { b: hair, L: hairL, d: dark })
      p.rect(jx + 8, jy + 6, 2, 1, '#8a8a96')
      for (const c of [12, 13, 14, 15]) p.set(jx + c, jy + 7, '#e8c547')
      p.rect(jx + 4, jy + 6, 2, 2, '#e8c547').set(jx + 4, jy + 6, '#fff3b0')
    },
  )
  // her claw comes up in two in-between frames before it is raised high
  const k = SC8_JANEWAY
  const arm1 = new Pix()
  arm1.rect(jx + 20, jy + 2, 2, 3, k.skin).rect(jx + 22, jy + 1, 2, 2, k.skin).set(jx + 21, jy + 4, k.shade).set(jx + 23, jy + 2, k.shade)
  arm1.set(jx + 24, jy - 1, k.light).set(jx + 24, jy + 0, k.skin).set(jx + 22, jy - 1, k.light).set(jx + 22, jy, k.skin)
  const arm2 = new Pix()
  arm2.rect(jx + 19, jy, 2, 4, k.skin).set(jx + 20, jy + 3, k.shade).rect(jx + 20, jy - 2, 2, 2, k.skin).set(jx + 21, jy - 1, k.shade)
  arm2.rect(jx + 19, jy - 4, 1, 2, k.skin).rect(jx + 22, jy - 4, 1, 2, k.skin).rect(jx + 19, jy - 3, 4, 1, k.skin).set(jx + 19, jy - 4, k.light).set(jx + 22, jy - 4, k.light)
  s += shown(sc8Path(arm1), [[tClaw, tClaw + 0.35]], dur)
  s += shown(sc8Path(arm2), [[tClaw + 0.35, tClaw + 0.7]], dur)
  return s
}
