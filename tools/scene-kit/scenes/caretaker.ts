// ---------- Caretaker: "the displacement wave" ----------
// One 17.17 s story: Voyager cruises through the Badlands plasma. A soft,
// shimmering wave crosses slowly from the left, catches the ship, tilts it and
// pulls it away while the plasma dissolves into calm Delta Quadrant space with
// the Caretaker's array. Janeway's chair rocks, settles; she looks up at the
// array and raises her claw. No flashes: every change is slow and local.

const CT_JANEWAY: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#b3262e',
  lower: '#1c1424',
  lowerShade: '#120c18',
  legs: '#1c1424',
  rim: '#f6a77c',
}

function ctRnd(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

// translate jitter between t0 and t1 (seconds), amp in CSS px: an eased sway
// from one offset to the next, starting and ending at rest
function ctJitter(t0: number, t1: number, step: number, amp: number, dur: number, seed: number) {
  const r = ctRnd(seed)
  const times = [0, t0 / dur]
  const vals = ['0 0', '0 0']
  for (let t = t0 + step; t < t1 - step / 2; t += step) {
    times.push(t / dur)
    const dx = Math.round((r() * 2 - 1) * amp)
    const dy = Math.round((r() * 2 - 1) * amp * 0.6)
    vals.push(`${dx} ${dy}`)
  }
  times.push(t1 / dur, 1), vals.push('0 0', '0 0')
  const splines = Array(vals.length - 1).fill('0.45 0 0.55 1').join(';')
  return `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}" keySplines="${splines}"/>`
}

// Voyager seen from above, bow to the right: 32 x 13 art pixels
function ctShip() {
  const p = new Pix()
  const L = '#e8e4f0'
  const M = '#bab4ca'
  const S = '#837c98'
  const D = '#4e4862'
  const cy = 6
  const tone = (y: number) => (y < cy ? L : y === cy ? M : S)
  // engineering hull
  for (let c = 3; c <= 15; c++) {
    const h = c === 3 ? 1 : 2
    for (let y = cy - h; y <= cy + h; y++) p.set(c, y, tone(y))
    p.set(c, cy + h, D)
  }
  p.set(3, cy, '#7fd4ff').set(2, cy, '#3f7fb8') // shuttlebay glow aft
  // pylons sweeping out to the nacelles
  p.rect(8, 3, 2, 1, M).rect(9, 2, 2, 1, L)
  p.rect(8, 9, 2, 1, S).rect(9, 10, 2, 1, D)
  // nacelles: grey casing, blue warp glow, red bussard at the front
  const nacelle = (y: number) => {
    p.rect(1, y, 12, 1, y < cy ? L : M)
    p.rect(1, y + 1, 12, 1, '#4fb8f0').rect(3, y + 1, 8, 1, '#a8e6ff')
    p.rect(1, y + 2, 12, 1, y < cy ? S : D)
    p.set(0, y + 1, S)
    p.set(13, y, '#a83a2a').set(13, y + 1, '#ff6a4a').set(13, y + 2, '#a83a2a')
  }
  nacelle(0)
  nacelle(10)
  // the arrowhead saucer
  for (let c = 12; c <= 31; c++) {
    const h = c === 12 ? 2 : c === 13 ? 3 : c <= 21 ? 4 : Math.max(0, Math.round((31.5 - c) * 0.42))
    for (let y = cy - h; y <= cy + h; y++) p.set(c, y, tone(y))
    p.set(c, cy - h, c > 13 ? '#f8f6ff' : L)
    p.set(c, cy + h, D)
  }
  // windows, bridge dome, impulse glow
  for (let c = 15; c <= 25; c += 2) p.set(c, cy - 2, '#ffe9a0').set(c + 1, cy + 2, '#d9b860')
  p.set(22, cy, '#ffffff').set(21, cy, L)
  p.set(12, cy - 1, '#ff8a5a').set(12, cy + 1, '#ff8a5a')
  return p.svg()
}

// The Caretaker's array: a hub bristling with long spines, lights on the tips
function ctArray(cx: number, cy: number) {
  const p = new Pix()
  const spines: [number, number, number][] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2
    spines.push([Math.cos(a), Math.sin(a), i % 2 ? 9 : 13])
  }
  for (const [dx, dy, len] of spines) {
    for (let r = 4; r <= len; r++) {
      const x = Math.round(cx + dx * r)
      const y = Math.round(cy + dy * r * 0.85)
      const lit = dx + -dy > 0.3
      p.set(x, y, r === len ? '#e8e2f4' : lit ? '#a8a0b8' : '#6a6478')
      if (r < len - 3 && r > 5) p.set(x + (Math.abs(dx) > Math.abs(dy) ? 0 : 1), y + (Math.abs(dx) > Math.abs(dy) ? 1 : 0), lit ? '#7a7290' : '#4e4862')
    }
  }
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y
      if (d > 26) continue
      let c = '#7a7290'
      if (x - y > 2) c = '#a8a0bc'
      if (x - y > 5) c = '#cfc8de'
      if (x - y < -3) c = '#4e4862'
      if (d > 19) c = x - y > 0 ? '#9a92ae' : '#3e3852'
      p.set(cx + x, cy + y, c)
    }
  }
  // ring of ports around the hub
  for (const [x, y] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [2, -2], [-2, 2]]) p.set(cx + x, cy + y, '#3a344a')
  p.rect(cx - 1, cy - 1, 3, 3, '#c9f0ff').set(cx, cy, '#ffffff')
  return p.svg()
}

// one extra arm frame for Janeway: the right claw on its way up
function ctArmMid(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 3, 3, 2, k.skin).rect(x + 20, y + 1, 2, 2, k.skin).rect(x + 21, y - 1, 2, 2, k.skin)
  p.rect(x + 18, y + 5, 2, 1, k.shade).set(x + 22, y + 1, k.shade)
  p.rect(x + 20, y - 3, 1, 2, k.skin).rect(x + 23, y - 3, 1, 2, k.skin).rect(x + 20, y - 2, 4, 1, k.skin)
  p.set(x + 20, y - 3, k.light).set(x + 23, y - 3, k.light)
  return p.svg()
}

// the very first lift: the claw just leaving the armrest
function ctArmLow(k: CrabHD, x: number, y: number) {
  const p = new Pix()
  p.rect(x + 18, y + 4, 3, 2, k.skin).rect(x + 20, y + 3, 2, 2, k.skin).rect(x + 18, y + 6, 2, 1, k.shade).set(x + 21, y + 5, k.shade)
  p.rect(x + 21, y + 1, 1, 2, k.skin).rect(x + 23, y + 1, 1, 2, k.skin).rect(x + 21, y + 2, 3, 1, k.skin)
  p.set(x + 21, y + 1, k.light).set(x + 23, y + 1, k.light)
  return p.svg()
}

function caretaker() {
  const T = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const k = (t: number) => +(t / T).toFixed(4)
  const kt = (ts: number[]) => ts.map(k).join(';')
  // the story, in seconds
  const WAVE0 = 3.6 // the wave appears at the left edge
  const WAVE1 = 8.8 // and has left on the right
  const CAUGHT = 5.9 // its front reaches Voyager
  const FADE0 = 8.4 // the plasma starts to dissolve
  const FADE1 = 11.0 // the Delta Quadrant is all that is left
  const LOOK = 11.6 // Janeway looks up at the array
  const ARM = 12.5 // and raises her claw
  const BACK0 = 15.6 // the replay has no veil: from here everything eases back to its t=0 spot
  const RET0 = 13.4 // the plasma starts gathering again, slowly (3.8 s), for the next showing
  // ambient loops run on whole fractions of the story so t=T matches t=0
  const per = (n: number) => +(T / n).toFixed(5)

  let s = `<defs>
    <linearGradient id="ctFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="ctFade"><rect width="${W}" height="${H}" fill="url(#ctFadeG)"/></mask>
    <linearGradient id="ctStormSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e0f2c"/><stop offset="1" stop-color="#2e1530"/></linearGradient>
    <linearGradient id="ctCalmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0d22"/><stop offset="1" stop-color="#1a1838"/></linearGradient>
    <linearGradient id="ctWaveG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fc8ff" stop-opacity="0"/><stop offset="0.3" stop-color="#a8d4ff" stop-opacity="0.22"/><stop offset="0.55" stop-color="#cfe4ff" stop-opacity="0.38"/><stop offset="0.75" stop-color="#c9b4ff" stop-opacity="0.2"/><stop offset="1" stop-color="#c9a7ff" stop-opacity="0"/></linearGradient>
    <radialGradient id="ctNacG"><stop offset="0" stop-color="#6fd0ff" stop-opacity="0.5"/><stop offset="1" stop-color="#6fd0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ctArrG"><stop offset="0" stop-color="#bfe6ff" stop-opacity="0.3"/><stop offset="1" stop-color="#bfe6ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ctNebG"><stop offset="0" stop-color="#3fa8a0" stop-opacity="0.22"/><stop offset="1" stop-color="#3fa8a0" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- the Delta Quadrant underneath: calm stars, a teal nebula, the array ----
  let calm = `<rect width="${W}" height="${H}" fill="url(#ctCalmSky)"/>`
  calm += `<ellipse cx="${36 * Q}" cy="${12 * Q}" rx="70" ry="20" fill="url(#ctNebG)"/>`
  const rs = ctRnd(23)
  const starD = ['', '', '']
  for (let y = 1; y < 41; y += 3) {
    for (let x = 0; x < GW; x += 3) {
      if (rs() < 0.5) continue
      starD[Math.floor(rs() * 3)] += `M${(x + Math.floor(rs() * 2)) * Q} ${y * Q}h2v2h-2z`
    }
  }
  starD.forEach((d, i) => (calm += `<path d="${d}" fill="#d4e2ff" opacity="${[0.15, 0.3, 0.48][i]}"/>`))
  ;[[28, 5], [52, 3], [60, 14], [40, 9], [88, 30]].forEach(([x, y], i) => {
    const glow = new Pix()
    glow.set(x - 1, y, '#a8c4ff').set(x + 1, y, '#a8c4ff').set(x, y - 1, '#a8c4ff').set(x, y + 1, '#a8c4ff')
    calm += `<g>${glow.svg()}<animate attributeName="opacity" values="0.2;0.8;0.2" dur="${per([7, 6, 5, 4, 8][i])}s" begin="${-i * 0.5}s" repeatCount="indefinite"/></g>`
    calm += new Pix().set(x, y, '#ffffff').svg()
  })
  const ax = 77
  const ay = 11
  calm += `<circle cx="${(ax + 0.5) * Q}" cy="${(ay + 0.5) * Q}" r="30" fill="url(#ctArrG)"><animate attributeName="opacity" values="0.75;1;0.75" dur="${per(4)}s" repeatCount="indefinite"/></circle>`
  calm += ctArray(ax, ay)
  ;[[ax - 9, ay - 7], [ax + 10, ay + 3], [ax - 6, ay + 9], [ax + 4, ay - 9]].forEach(([x, y], i) => {
    calm += `<g>${new Pix().set(x, y, '#9fe4ff').svg()}<animate attributeName="opacity" values="1;0.3;1" dur="${per([8, 7, 6, 5][i])}s" repeatCount="indefinite"/></g>`
  })

  // ---- the Badlands on top: plasma currents drifting slowly, then dissolving ----
  let storm = `<rect width="${W}" height="${H}" fill="url(#ctStormSky)"/>`
  const clouds = new Pix()
  for (let y = 0; y < 42; y++) {
    for (let x = 0; x < GW + 12; x++) {
      const band = Math.sin(y * 0.52 + 2.4 * Math.sin(x / 10 + y / 14) + x * 0.06)
      const swell = 0.5 + 0.5 * Math.sin(x / 13 - y / 9 + 1) - (y > 30 ? (y - 30) * 0.05 : 0)
      const v = band * 0.6 + swell * 0.9
      let c = ''
      if (v > 1.32) c = '#ffb46a'
      else if (v > 1.12) c = '#e8683e'
      else if (v > 0.85) c = '#a83a5e'
      else if (v > 0.5) c = '#5e2458'
      else if (v > 0.2) c = '#3a1a44'
      if (c) clouds.set(x, y, c)
    }
  }
  const drift = (12 * Q) / T // px per second, as before
  const hid = FADE1 + 0.2
  storm += `<g>${clouds.svg()}<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="0 0;${(drift * T).toFixed(2)} 0" keyTimes="0;${k(hid)}" dur="${T}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;${(-drift * T).toFixed(2)} 0" dur="${T}s" repeatCount="indefinite"/></g>`
  // the plasma dissolves, and gathers again slowly for the next showing
  const stormG = `<g>${storm}<animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="1;1;0;0;1" keyTimes="0;${kt([FADE0, FADE1, RET0])};1" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.7 1;0 0 1 1;0.3 0 0.7 1"/></g>`

  // ---- the bridge floor: dark, console lights glowing softly on the right ----
  const floor = new Pix().rect(0, 42, GW, 6, '#150f22').rect(0, 42, GW, 1, '#2a2140')
  floor.rect(40, 43, 48, 3, '#1f1832').rect(40, 43, 48, 1, '#3a2f55')
  let floorSvg = floor.svg()
  const pads: [number, string][] = [[43, '#f2b866'], [47, '#c9a7ff'], [51, '#ff8a5a'], [57, '#8fb8ff'], [61, '#f2b866'], [67, '#c9a7ff'], [73, '#ff8a5a'], [79, '#8fb8ff'], [83, '#f2b866']]
  pads.forEach(([x, c], i) => {
    floorSvg += `<g>${new Pix().rect(x, 44, 2, 1, c).svg()}<animate attributeName="opacity" values="1;0.4;1" dur="${per([9, 7, 6, 5][i % 4])}s" begin="${-i * 0.3}s" repeatCount="indefinite"/></g>`
  })

  // ---- Voyager ----
  const ship = ctShip()
  const halo = `<ellipse cx="${7 * Q}" cy="${1.5 * Q}" rx="16" ry="5" fill="url(#ctNacG)"/><ellipse cx="${7 * Q}" cy="${11.5 * Q}" rx="16" ry="5" fill="url(#ctNacG)"/>`
  // centre of the ship in CSS px over the story: cruise, caught, pulled away, arrives
  const PT = [0, CAUGHT, 7.4, 10.2, 12.4, BACK0 - 0.3, T]
  const pos = ['132 33', '132 33', '138 34', '158 46', '114 58', '111 58', '132 33']
  const rot = ['0', '0', '-10', '-16', '0', '0', '0']
  const scl = ['1', '1', '0.95', '0.55', '0.85', '0.85', '1']
  const anim = (type: string, vals: string[]) =>
    `<animateTransform attributeName="transform" type="${type}" dur="${T}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="0;${kt(PT.slice(1, -1))};1" calcMode="spline" keySplines="${Array(vals.length - 1).fill('0.4 0 0.6 1').join(';')}"/>`
  const bob = `<animateTransform attributeName="transform" type="translate" calcMode="spline" values="0 0;0 ${Q};0 0" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${per(5)}s" repeatCount="indefinite"/>`
  const shipG =
    `<g>${anim('translate', pos)}<g>${anim('rotate', rot)}<g>${anim('scale', scl)}` +
    `<g transform="translate(${-16 * Q} ${-6.5 * Q})"><g>${bob}<g>${ctJitter(CAUGHT, 7.6, 0.3, 2, T, 5)}` +
    `<g>${halo}<animate attributeName="opacity" values="0.75;1;0.75" dur="${per(7)}s" repeatCount="indefinite"/></g>${ship}` +
    `</g></g></g></g></g></g>`

  // ---- the displacement wave: a soft shimmering band, crossing slowly ----
  const shimmer = new Pix()
  const rw = ctRnd(77)
  for (let y = 0; y < GH * 2; y += 3) {
    const off = Math.floor(rw() * 10)
    shimmer.rect(10 + off, y, 3 + Math.floor(rw() * 6), 1, rw() < 0.5 ? '#e6f4ff' : '#efe2ff')
  }
  const wave =
    `<g opacity="0"><g>` +
    `<rect x="0" y="0" width="${36 * Q}" height="${H}" fill="url(#ctWaveG)"/>` +
    `<g opacity="0.35"><g>${shimmer.svg()}</g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-GH * Q}" dur="${per(3)}s" repeatCount="indefinite"/></g>` +
    `<animateTransform attributeName="transform" type="translate" dur="${T}s" repeatCount="indefinite" values="${-40 * Q} 0;${-40 * Q} 0;${W + 4} 0;${W + 4} 0" keyTimes="0;${kt([WAVE0, WAVE1])};1"/>` +
    `</g><animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${kt([WAVE0 - 0.6, WAVE0 + 0.8, WAVE1 - 0.6, WAVE1])};1"/></g>`

  let scene = `<g mask="url(#ctFade)">${calm}${stormG}${floorSvg}${shipG}${wave}</g>`

  // ---- Janeway in the command chair ----
  const jx = 14
  const jy = 28
  const chair = new Pix()
  chair.rect(jx - 2, jy - 3, 22, 13, '#3a3450').rect(jx - 2, jy - 3, 22, 1, '#5e5478')
  chair.rect(jx - 2, jy - 2, 1, 12, '#4a4262').rect(jx + 19, jy - 2, 1, 12, '#2a2440')
  chair.rect(jx + 1, jy - 2, 16, 1, '#4a4262')
  chair.rect(jx - 5, jy + 7, 5, 2, '#4a4262').rect(jx - 5, jy + 7, 5, 1, '#6e6488').set(jx - 5, jy + 8, '#2a2440')
  chair.rect(jx + 18, jy + 7, 5, 2, '#4a4262').rect(jx + 18, jy + 7, 5, 1, '#6e6488').set(jx + 22, jy + 8, '#2a2440')
  chair.rect(jx - 4, jy + 9, 1, 4, '#2a2440').rect(jx + 21, jy + 9, 1, 4, '#2a2440')
  chair.rect(jx + 7, jy + 10, 4, 4, '#2a2440')
  chair.set(jx + 20, jy + 7, '#f2b866').set(jx - 3, jy + 7, '#8fb8ff')
  let jane = chair.svg()
  jane += crabHD(
    CT_JANEWAY, jx, jy, 'right', T,
    { left: [], right: [[ARM, BACK0 + 0.3]] },
    [],
    per(4),
    p => {
      const A = '#a8452a'
      const AL = '#c96a3e'
      const AD = '#7a2e1c'
      p.rect(jx + 2, jy - 1, 14, 1, A).rect(jx, jy, 18, 1, A).rect(jx, jy + 1, 4, 1, A).rect(jx, jy + 2, 2, 2, AD)
      p.rect(jx + 6, jy - 1, 8, 1, AL).rect(jx + 10, jy, 5, 1, AL)
      p.set(jx + 16, jy + 1, A).set(jx + 17, jy + 1, A)
      p.rect(jx - 2, jy - 3, 5, 3, A).rect(jx - 1, jy - 4, 3, 1, A)
      p.rect(jx, jy - 3, 2, 1, AL).set(jx - 2, jy - 1, AD).set(jx - 2, jy - 3, AD)
      p.rect(jx + 6, jy + 6, 6, 1, '#6e6878')
      for (const c of [13, 14, 15, 16]) p.set(jx + c, jy + 6, '#e8c547')
      p.rect(jx + 3, jy + 7, 2, 2, '#e8c547').set(jx + 3, jy + 7, '#fff3b0')
    },
  )
  // the claw on its way up, between resting and raised
  // rest -> low (0.1 s) -> diagonal (0.2 s) -> kit half-raised (0.09 s) -> up
  // and the same way down before the replay
  jane += shown(ctArmLow(CT_JANEWAY, jx, jy), [[ARM - 0.3, ARM - 0.2], [BACK0 + 0.5, BACK0 + 0.6]], T)
  jane += shown(ctArmMid(CT_JANEWAY, jx, jy), [[ARM - 0.2, ARM], [BACK0 + 0.3, BACK0 + 0.5]], T)
  // looking up and to the right, at the array
  // in two one-pixel steps: first across to the right, then up
  const across = new Pix().rect(jx + 6, jy + 2, 9, 3, CT_JANEWAY.skin).rect(jx + 7, jy + 2, 2, 3, EYE_HD).rect(jx + 13, jy + 2, 2, 3, EYE_HD)
  jane += shown(across.svg(), [[LOOK, LOOK + 0.12], [BACK0, BACK0 + 0.12]], T)
  const up = new Pix().rect(jx + 6, jy + 1, 9, 4, CT_JANEWAY.skin).rect(jx + 7, jy + 1, 2, 3, EYE_HD).rect(jx + 13, jy + 1, 2, 3, EYE_HD)
  jane += shown(up.svg(), [[LOOK + 0.12, BACK0]], T)
  // the chair rocks gently while the wave has the ship, then settles
  const rock = [0, 0, 2.5, -2, 2, -1.5, 1, 0, 0]
  const rockT = [0, CAUGHT, 6.6, 7.3, 8.0, 8.7, 9.4, 10.0, T]
  scene += `<g>${jane}<animateTransform attributeName="transform" type="rotate" dur="${T}s" repeatCount="indefinite" values="${rock.map(a => `${a} ${(jx + 9) * Q} ${(jy + 14) * Q}`).join(';')}" keyTimes="0;${kt(rockT.slice(1, -1))};1" calcMode="spline" keySplines="${Array(rock.length - 1).fill('0.45 0 0.55 1').join(';')}"/></g>`

  s += scene
  return s
}
