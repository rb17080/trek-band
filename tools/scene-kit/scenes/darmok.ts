// ---------- Darmok: "Darmok and Jalad at Tanagra" ----------
// Dathon tells it with his claws: one up for Darmok, the other for Jalad,
// both with a hop at Tanagra. Picard listens, then answers him the same way.

// One timeline for a crab: claws rest / half / up per side, eyes on the fire or up,
// a 1 px rise, and blinks placed by hand.
type DkArms = { half: [number, number][]; up: [number, number][] }

function dkArmHalf(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const ax = side === 'left' ? x - 3 : x + 19
  p.rect(side === 'left' ? x - 3 : x + 18, y + 4, 3, 2, k.skin)
  p.rect(ax, y, 2, 4, k.skin)
  p.rect(side === 'left' ? ax : ax + 1, y, 1, 4, k.shade)
  const cx = side === 'left' ? x - 4 : x + 18
  p.rect(cx, y - 4, 1, 3, k.skin).rect(cx + 3, y - 4, 1, 3, k.skin)
  p.rect(cx, y - 2, 4, 1, k.skin).rect(cx + 1, y - 1, 2, 1, k.skin)
  p.set(cx, y - 4, k.light).set(cx + 3, y - 4, k.light)
  return p.svg()
}

function dkCrab(
  k: CrabHD, x: number, y: number, look: Side,
  arms: { left: DkArms; right: DkArms },
  eyesUp: [number, number][],
  rise: [number, number][],
  blinks: [number, number][],
  details: (p: Pix) => void,
) {
  const T = SCENE_SECONDS
  const { p, ex } = clawdBody(k, x, y, look)
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin)) // eyes are drawn below, on the timeline
  details(p)
  let s = p.svg()
  for (const side of ['left', 'right'] as Side[]) {
    const a = arms[side]
    s += shown(armRestHD(k, x, y, side), complement(merge([...a.half, ...a.up]), T), T)
    if (a.half.length) s += shown(dkArmHalf(k, x, y, side), a.half, T)
    if (a.up.length) s += shown(armUpHD(k, x, y, side), a.up, T)
  }
  const eyes = (dy: number) => {
    const e = new Pix()
    ex.forEach(i => e.rect(x + i, y + 2 + dy, 2, 3, EYE_HD))
    return e.svg()
  }
  const open = complement(merge(blinks), T)
  const inter = (a: [number, number][], b: [number, number][]) => {
    const out: [number, number][] = []
    for (const [a0, a1] of a) for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
      if (hi > lo) out.push([lo, hi])
    }
    return out
  }
  s += shown(eyes(0), inter(merge(eyesUp), open), T)
  s += shown(eyes(1), inter(complement(merge(eyesUp), T), open), T)
  return `<g>${s}${rise.length ? hopQ(rise, T).split(`0 ${-2 * Q}`).join(`0 ${-Q}`) : ''}</g>`
}

function darmok() {
  const T0 = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let s = `<defs>
    <linearGradient id="dkSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120c22"/><stop offset="1" stop-color="#2e1d44"/></linearGradient>
    <linearGradient id="dkFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="dkFade"><rect width="${W}" height="${H}" fill="url(#dkFadeG)"/></mask>
    <radialGradient id="dkGlow"><stop offset="0" stop-color="#ff9a4a" stop-opacity="0.42"/><stop offset="0.6" stop-color="#ff7a3a" stop-opacity="0.12"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="dkNeb"><stop offset="0" stop-color="#9b7bd6" stop-opacity="0.22"/><stop offset="1" stop-color="#9b7bd6" stop-opacity="0"/></radialGradient>
  </defs>`

  // sky, stars, moon, mesas, ground: all of it fading in from the band on the left
  let back = `<rect width="${W}" height="${H}" fill="url(#dkSky)"/>`
  back += `<ellipse cx="${40 * Q}" cy="${10 * Q}" rx="70" ry="18" fill="url(#dkNeb)"/>`
  let seed = 17
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let y = 1; y < 27; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rnd() < 0.5) continue
      const o = 0.12 + rnd() * 0.3
      back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#cdbaf0" opacity="${o.toFixed(2)}"/>`
    }
  }
  ;[[30, 4], [46, 2], [58, 11], [20, 14], [86, 18]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#bfa8ee').set(x + 1, y, '#bfa8ee').set(x, y - 1, '#bfa8ee').set(x, y + 1, '#bfa8ee')
    back += `<g>${glow.svg()}<animate attributeName="opacity" values="0.15;0.9;0.15" dur="${2.6 + i * 0.7}s" begin="${i * 0.6}s" repeatCount="indefinite"/></g>`
    back += `<g>${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0.6;1;0.6" dur="${2.6 + i * 0.7}s" begin="${i * 0.6}s" repeatCount="indefinite"/></g>`
  })
  // shooting star: crosses once, after the two understand each other
  {
    const k = (t: number) => (t / T0).toFixed(4)
    back += `<rect x="0" y="0" width="${Q}" height="${Q}" fill="#fff" opacity="0"><animateTransform attributeName="transform" type="translate" values="56 6;56 6;132 30;132 30" keyTimes="0;${k(14.6)};${k(15.6)};1" dur="${T0}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.9;0.9;0;0" keyTimes="0;${k(14.6)};${k(14.8)};${k(15.2)};${k(15.6)};1" dur="${T0}s" repeatCount="indefinite"/><animate attributeName="width" values="2;2;10;10;2;2" keyTimes="0;${k(14.6)};${k(14.8)};${k(15.3)};${k(15.6)};1" dur="${T0}s" repeatCount="indefinite"/></rect>`
  }

  // the moon over El-Adrel
  const moon = new Pix()
  const mx = 76
  const my = 9
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = x * x + y * y
      if (d > 38) continue
      let c = '#e6dcf2'
      if (x + y * 0.3 < -2.5) c = '#b9a9d4'
      if (d > 30) c = x < 0 ? '#9d8cbf' : '#cfc2e6'
      moon.set(mx + x, my + y, c)
    }
  }
  ;[[2, -2], [-1, 2], [3, 3], [-3, -3]].forEach(([x, y]) => moon.set(mx + x, my + y, '#cbbde0'))
  moon.set(mx + 3, my - 2, '#cbbde0')
  back += `<circle cx="${(mx + 0.5) * Q}" cy="${(my + 0.5) * Q}" r="20" fill="#d9c9ff" opacity="0.08"/>` + moon.svg()

  // two layers of mesas, then the ground
  const far = new Pix()
  const near = new Pix()
  for (let c = 0; c < GW; c++) {
    const h1 = 25 + Math.round(2.4 * Math.sin(c / 6.5) + 1.6 * Math.sin(c / 2.7 + 1))
    const flat = c > 10 && c < 22 ? 23 : h1
    far.rect(c, flat, 1, 42 - flat, '#2a1f42')
    far.set(c, flat, '#372a55')
    const h2 = 33 + Math.round(1.8 * Math.sin(c / 4.3 + 2) + Math.sin(c / 1.9))
    near.rect(c, h2, 1, 42 - h2, '#1f1733')
    near.set(c, h2, '#2b2145')
  }
  back += far.svg() + near.svg()
  const ground = new Pix().rect(0, 42, GW, 6, '#1a1328').rect(0, 42, GW, 1, '#262039')
  for (let i = 0; i < 26; i++) ground.set(Math.floor(rnd() * GW), 43 + Math.floor(rnd() * 5), rnd() < 0.5 ? '#2a2140' : '#140f20')
  back += ground.svg()
  s += `<g mask="url(#dkFade)">${back}</g>`

  // firelight on the ground and the two of them
  s += `<ellipse cx="${51 * Q}" cy="${40 * Q}" rx="84" ry="30" fill="url(#dkGlow)"><animate attributeName="opacity" values="0.9;0.97;0.92;1;0.9" dur="4.3s" calcMode="spline" keyTimes="0;0.3;0.5;0.8;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/></ellipse>`

  // smoke curling up from the fire
  for (let i = 0; i < 3; i++) {
    const d = 4.5 + i
    s += `<rect x="${50 * Q}" y="${23 * Q}" width="${3 * Q}" height="${2 * Q}" fill="#8a7fa0" opacity="0"><animateMotion path="M0 0 q 6 -12 2 -22 t 8 -22" dur="${d}s" begin="${i * 1.5}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.35;0" dur="${d}s" begin="${i * 1.5}s" repeatCount="indefinite"/></rect>`
  }

  // stones and crossed logs
  const pit = new Pix()
  for (const [x, y] of [[41, 40], [44, 41], [48, 42], [52, 42], [56, 41], [59, 40]] as [number, number][]) {
    pit.rect(x, y, 3, 2, '#4a4458').set(x, y, '#7e6a6a').set(x + 1, y, '#9a7a68')
  }
  for (let i = 0; i < 12; i++) {
    const r = 40 - Math.floor(i / 3)
    pit.rect(45 + i, r, 1, 2, '#5a3a22').set(45 + i, r, '#7a4e2c')
    pit.rect(56 - i, r, 1, 2, '#4e3220').set(56 - i, r, '#6e4628')
  }
  pit.rect(44, 40, 1, 2, '#c9a66b').rect(57, 40, 1, 2, '#c9a66b')
  s += pit.svg()

  // the flames: four frames in turn
  const pal = { R: '#a8321f', r: '#e8552d', o: '#ff8a3d', y: '#ffd36b', w: '#fff2c0' }
  const frames = [
    ['......y.....', '.....yy.....', '.....oy..y..', '....ooy..y..', '....oyyo.o..', '...ooyyoo...', '..o.oywyoo..', '..ooyywwyoo.', '.roooywwyoo.', '.rooyywwyyor', '.rrooywwyoor', '..rrooyyoorr', '..RrrooooorR', '...RRrrrrRR.'],
    ['....y.......', '....yy......', '..y.yo......', '..y.yoo.....', '...oyyoo....', '...ooyyoo.y.', '..ooywyoo.o.', '.ooyywwyoo..', '.ooyywwyyoo.', 'rooyywwwyoor', 'rrooywwyyoor', '.rrooyyyoorr', '.RrroooooorR', '..RRrrrrrRR.'],
    ['.....y......', '.....y......', '.....yy.....', '....oyy.....', '....oyyo.y..', '...ooywo.o..', '...oywwyoo..', '..ooywwyyo..', '.roooywwyoo.', '.rooyywwyyor', 'rrooyywwyoor', '.rroooyyoorr', '.RrrrooooorR', '..RRRrrrrRR.'],
    ['.......y....', '......yy....', '......oy.y..', '.....ooy.y..', '....ooyyo...', '.o..ooyyoo..', '.o.ooywyoo..', '..ooyywwyoo.', '.ooyywwwyyo.', 'rooyywwwyyor', 'roooywwyyoor', 'rrooyyyyoorr', 'RrrooooooorR', '.RRrrrrrrRR.'],
  ]
  frames.forEach((f, i) => {
    s += shown(new Pix().rows(f, 45, 25, pal).svg(), [[i * 0.16, (i + 1) * 0.16]], 0.64)
  })
  // embers
  for (let i = 0; i < 5; i++) {
    const d = 2 + i * 0.45
    s += `<rect x="${51 * Q}" y="${25 * Q}" width="${Q}" height="${Q}" fill="${i % 2 ? '#ffd36b' : '#ff9a4a'}" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 8 : -8} -14 ${i % 2 ? -3 : 4} -28 t ${i % 2 ? 6 : -6} -18" dur="${d}s" begin="${i * 0.5}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.8;0" dur="${d}s" begin="${i * 0.5}s" repeatCount="indefinite"/></rect>`
  }

  // Dathon, Tamarian ridges and robe, a dagger at his belt
  // (timeline below: claws as [rest, half, up] windows per side, eyes on the fire or on the other)
  s += dkCrab(
    DATHON_HD, 22, 28, 'right',
    {
      // "Darmok" (left), "Jalad" (right), "at Tanagra" (both), then again with Picard
      left: { half: [[2.9, 3.2], [4.4, 4.65], [5.9, 6.2], [7.3, 7.6], [12.0, 12.3], [13.9, 14.2]], up: [[3.2, 4.4], [6.2, 7.3], [12.3, 13.9]] },
      right: { half: [[4.5, 4.8], [7.3, 7.6], [12.1, 12.4], [13.9, 14.2]], up: [[4.8, 7.3], [12.4, 13.9]] },
    },
    [[2.5, 14.5]], // looks up from the fire at Picard, back down once understood
    [[6.4, 6.9]], // a little rise at Tanagra
    [[1.8, 1.95], [8.9, 9.05], [15.4, 15.55]],
    p => {
      for (const c of [3, 6, 9, 12, 15]) p.set(22 + c, 27, DATHON_HD.shade).set(22 + c, 28, DATHON_HD.shade)
      p.rect(22 + 10, 29, 1, 4, DATHON_HD.shade)
      p.set(22 + 4, 33, DATHON_HD.shade).set(22 + 15, 33, DATHON_HD.shade)
      p.rect(23, 34, 16, 1, '#8a6a44')
      p.rect(22, 36, 18, 1, '#c9a66b')
      p.rect(22 + 5, 36, 1, 3, '#9aa0a8').set(22 + 5, 36, '#d8dde3')
    },
  )

  // Picard, command red, combadge catching the firelight
  s += dkCrab(
    PICARD_HD, 62, 28, 'left',
    {
      // a hesitant half-raise that drops back, then the answer, then together with Dathon
      left: { half: [[8.3, 8.9], [9.3, 9.6], [10.8, 11.05], [12.1, 12.4], [13.9, 14.2]], up: [[9.6, 10.8], [12.4, 13.9]] },
      right: { half: [[10.9, 11.2], [13.9, 14.2]], up: [[11.2, 13.9]] },
    },
    [[2.8, 14.7]], // watches Dathon tell it
    [[12.6, 13.1]],
    [[2.2, 2.35], [7.8, 7.95], [15.0, 15.15]],
    p => {
      p.rect(62 + 12, 34, 2, 2, '#e8c547').set(62 + 12, 34, '#fff3b0')
      p.rect(62 + 4, 34, 1, 1, '#e8c547').rect(62 + 6, 34, 1, 1, '#e8c547')
    },
  )
  return s
}



