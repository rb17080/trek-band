// ---------- Chain of Command: "There are four lights!" ----------
// A Cardassian interrogation room. Picard hangs by his wrists under four steady
// lights. Gul Madred turns, walks to him and points up at them; a faint fifth
// light fades in at the end of the row. Picard looks, hesitates, then strains
// against the chains and shouts; the fifth light fades away. There are four lights.

const COC_MADRED: CrabHD = {
  skin: '#86837a',
  light: '#a3a094',
  shade: '#615e57',
  upper: '#4a4935',
  lower: '#3a392a',
  lowerShade: '#2a291f',
  legs: '#22211b',
  rim: '#bdb9a8',
}

const COC_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#f0a483',
  shade: '#b05a40',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#f3b08f',
}

const COC_LIGHTS = [37, 48, 59, 70] // left column of each lamp
const COC_FIFTH = 81

// one ceiling lamp: stem, housing, a blazing face
function cocLamp(lx: number) {
  const p = new Pix()
  p.rect(lx + 1, 0, 4, 1, '#2a231d')
  p.rect(lx - 1, 1, 8, 1, '#5a4d40').set(lx - 1, 1, '#3a3129').set(lx + 6, 1, '#3a3129')
  p.rect(lx - 1, 2, 1, 3, '#3a3129').rect(lx + 6, 2, 1, 3, '#2a231d')
  p.rect(lx, 2, 6, 1, '#fff1bf')
  p.rect(lx, 3, 6, 1, '#ffffff')
  p.rect(lx, 4, 6, 1, '#ffe7a0')
  p.set(lx, 2, '#ffe08a').set(lx + 5, 4, '#f5c96a')
  p.rect(lx, 5, 6, 1, '#2e2620').set(lx - 1, 5, '#1f1914').set(lx + 6, 5, '#1f1914')
  return p.svg()
}

// glow + downward cone of harsh light under a lamp
function cocGlow(lx: number, op = 1) {
  const cx = (lx + 3) * Q
  return (
    `<polygon points="${lx * Q},${5 * Q} ${(lx + 6) * Q},${5 * Q} ${(lx + 13) * Q},${42 * Q} ${(lx - 7) * Q},${42 * Q}" fill="url(#cocBeam)" opacity="${op}"/>` +
    `<ellipse cx="${cx}" cy="${3.5 * Q}" rx="22" ry="13" fill="url(#cocHalo)" opacity="${op}"/>`
  )
}

// a hanging chain: alternating face-on and edge-on links
function cocChain(x: number, y0: number, y1: number) {
  const p = new Pix()
  for (let y = y0; y <= y1; y++) {
    const k = (y - y0) % 3
    if (k === 0) p.set(x, y, '#8d8578').set(x + 1, y, '#5b554b')
    else if (k === 1) p.set(x, y, '#5b554b').set(x + 1, y, '#3a352f')
    else p.set(x, y, '#a49b8b').set(x + 1, y, '#6c655a')
  }
  return p.svg()
}

function chainOfCommandHD() {
  const dur = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  let s = `<defs>
    <linearGradient id="cocWallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14100d"/><stop offset="0.25" stop-color="#231c17"/><stop offset="1" stop-color="#2c241d"/></linearGradient>
    <linearGradient id="cocFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="cocFade"><rect width="${W}" height="${H}" fill="url(#cocFadeG)"/></mask>
    <linearGradient id="cocBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d0" stop-opacity="0.22"/><stop offset="1" stop-color="#fff4d0" stop-opacity="0.03"/></linearGradient>
    <radialGradient id="cocHalo"><stop offset="0" stop-color="#fff8dc" stop-opacity="0.75"/><stop offset="0.45" stop-color="#ffe9a8" stop-opacity="0.22"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
    <radialGradient id="cocFlare"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.4" stop-color="#fff4c8" stop-opacity="0.4"/><stop offset="1" stop-color="#fff4c8" stop-opacity="0"/></radialGradient>
    <radialGradient id="cocPool"><stop offset="0" stop-color="#ffefc0" stop-opacity="0.22"/><stop offset="1" stop-color="#ffefc0" stop-opacity="0"/></radialGradient>
    <radialGradient id="cocAmber"><stop offset="0" stop-color="#e0902e" stop-opacity="0.35"/><stop offset="1" stop-color="#e0902e" stop-opacity="0"/></radialGradient>
  </defs>`

  // ---- the room: angular Cardassian walls, faded in from the left ----
  let back = `<rect width="${W}" height="${H}" fill="url(#cocWallG)"/>`
  const wall = new Pix()
  // ceiling soffit, stepped down in angular tiers
  wall.rect(0, 0, GW, 6, '#110d0b')
  for (let c = 0; c < GW; c++) {
    const step = (c % 22) < 11 ? 0 : 1
    wall.set(c, 6 + step, '#3b3128').set(c, 7 + step, '#1a1411')
  }
  // piers: tapered heads, then straight ribbed columns (vertical rects keep it small)
  let cols = ''
  const vr = (x: number, y: number, w: number, h: number, c: string) =>
    (cols += `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`)
  for (const px0 of [6, 28, 50, 72]) {
    for (let r = 8; r < 14; r++) {
      const w = 7 - Math.floor((r - 8) / 1.5)
      const x0 = px0 - Math.floor(w / 2)
      wall.rect(x0, r, w, 1, '#3a3027').set(x0, r, '#4d4033').set(x0 + w - 1, r, '#241d18')
    }
    vr(px0 - 1, 14, 3, 28, '#3a3027')
    vr(px0 - 1, 14, 1, 28, '#4d4033')
    vr(px0 + 1, 14, 1, 28, '#241d18')
    for (let r = 16; r < 42; r += 5) wall.rect(px0 - 2, r, 5, 1, '#4f4236').set(px0 + 2, r, '#2a221c')
  }
  // recessed panels between the piers: pointed trapezoid frames with ribs
  for (const cx of [17, 39, 61, 83]) {
    for (let r = 12; r < 20; r++) {
      const inset = 19 - r
      wall.rect(cx - 7 + inset, r, 15 - 2 * inset, 1, '#1d1713').set(cx - 7 + inset, r, '#3d3229').set(cx + 7 - inset, r, '#16110e')
    }
    vr(cx - 7, 20, 15, 18, '#211a16')
    vr(cx - 7, 20, 1, 18, '#3d3229')
    vr(cx + 7, 20, 1, 18, '#16110e')
    for (let r = 22; r < 37; r += 3) vr(cx - 6, r, 13, 1, '#2b231d')
    wall.rect(cx - 7, 38, 15, 1, '#3d3229')
    // dim amber slit near the bottom of each panel
    wall.rect(cx - 4, 22, 9, 1, '#7a5326').rect(cx - 3, 22, 7, 1, '#b07a34')
  }
  // floor: dark metal deck with grating
  wall.rect(0, 42, GW, 6, '#17120f').rect(0, 42, GW, 1, '#3a3027').rect(0, 43, GW, 1, '#221b16')
  for (let c = 2; c < GW; c += 6) wall.rect(c, 44, 1, 4, '#100c0a')
  back += cols + wall.svg()
  // amber slit glows, slowly breathing
  for (const cx of [17, 39, 61, 83]) {
    back += `<ellipse cx="${(cx + 0.5) * Q}" cy="${22.5 * Q}" rx="16" ry="6" fill="url(#cocAmber)"><animate attributeName="opacity" values="0.6;1;0.6" dur="${3.2 + cx / 40}s" repeatCount="indefinite"/></ellipse>`
  }
  s += `<g mask="url(#cocFade)">${back}</g>`

  // ---- the four lights: steady, breathing very slowly ----
  let glow = ''
  for (const lx of COC_LIGHTS) glow += cocGlow(lx)
  s += `<g>${glow}<animate attributeName="opacity" values="1;0.92;1" dur="${dur / 2}s" repeatCount="indefinite"/></g>`
  s += `<ellipse cx="${59 * Q}" cy="${43 * Q}" rx="60" ry="6" fill="url(#cocPool)"/>`
  for (const lx of COC_LIGHTS) s += cocLamp(lx)

  // the fifth light: fades in faintly at the end of the row, then fades away
  const kt = (ts: number[]) => ts.map(t => +(t / dur).toFixed(4)).join(';')
  const fifth = cocGlow(COC_FIFTH, 0.9) +
    new Pix().rect(COC_FIFTH, 2, 6, 3, '#fff6d8').rect(COC_FIFTH + 1, 3, 4, 1, '#ffffff').set(COC_FIFTH, 2, '#ffe9a8').set(COC_FIFTH + 5, 4, '#ffe9a8').svg()
  s += `<g opacity="0">${fifth}<animate attributeName="opacity" dur="${dur}s" repeatCount="indefinite" values="0;0;0.62;0.62;0;0" keyTimes="${kt([0, 7.0, 9.0, 10.8, 12.8, dur])}"/></g>`

  // dust motes drifting through the beams
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 7
    const d = 6 + (i % 3) * 1.7
    s += `<rect x="${x * Q}" y="${8 * Q}" width="${Q / 2}" height="${Q / 2}" fill="#fff6d8" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 6 : -6} 20 ${i % 2 ? -2 : 3} 52" dur="${d}s" begin="${i * 1.1}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.7;0.5;0" dur="${d}s" begin="${i * 1.1}s" repeatCount="indefinite"/></rect>`
  }

  // ---- the chain rail and chains ----
  const px = 58
  const py = 26
  const rail = new Pix()
  rail.rect(51, 8, 34, 1, '#6b6152').rect(51, 9, 34, 1, '#3a332b')
  for (const bx of [51, 66, 84]) rail.rect(bx, 7, 1, 3, '#8a7f6c').set(bx, 7, '#a89c86')
  for (const cx of [55, 77]) rail.rect(cx - 1, 10, 4, 1, '#4a433a').set(cx, 10, '#8d8578')
  s += rail.svg()
  // three slow jolts against the chains; the chains swing and settle
  const jolts: [number, number][] = [[10.5, 10.95], [11.3, 11.75], [12.1, 12.55]]
  const swayK = [0, 10.5, 10.95, 11.3, 11.75, 12.1, 12.55, 13.1, 13.7, 14.3, dur]
  const swayV = ['0 0', '0 0', `${Q / 2} 0`, `${-Q / 2} 0`, `${Q / 2} 0`, `${-Q / 2} 0`, `${Q / 2} 0`, `${-Q / 2} 0`, `${Q / 2} 0`, '0 0', '0 0']
  const sway = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${swayV.join(';')}" keyTimes="${kt(swayK)}"/>`
  s += `<g>${cocChain(px - 3, 11, py - 3)}${cocChain(px + 19, 11, py - 3)}${sway}</g>`

  // shadow under the suspended prisoner
  s += `<ellipse cx="${(px + 9) * Q}" cy="${43 * Q}" rx="18" ry="2.5" fill="#0b0807" opacity="0.7"/>`

  s += `<ellipse cx="${31 * Q}" cy="${31 * Q}" rx="34" ry="22" fill="url(#cocPool)"/>`
  // ---- Gul Madred: grey ridged skin, black hair, segmented armour ----
  const mx = 20
  const my = 28
  const M = COC_MADRED
  const madredDetails = (look: Side) => (p: Pix) => {
    // slicked black hair
    p.rect(mx + 2, my - 1, 14, 1, '#1a1513').rect(mx + 1, my, 16, 1, '#100d0c')
    p.rect(mx + 6, my - 1, 7, 1, '#4a433d').rect(mx + 8, my - 1, 3, 1, '#7a7068')
    // the forehead spoon
    p.rect(mx + 8, my + 1, 4, 1, '#4e4b45').rect(mx + 9, my + 1, 2, 1, M.rim)
    p.set(mx + 8, my + 2, '#4e4b45').set(mx + 11, my + 2, '#4e4b45').rect(mx + 9, my + 2, 2, 1, M.light)
    p.rect(mx + 9, my + 3, 2, 1, '#4e4b45').rect(mx + 9, my, 2, 1, '#4e4b45')
    // stern brow ridges
    p.rect(mx + 5, my + 1, 3, 1, '#615d55').rect(mx + 12, my + 1, 3, 1, '#615d55')
    // neck ridges sweeping down to the shoulders (lit on the side facing the lights)
    const lit = look === 'right' ? [M.light, M.rim] : [M.rim, M.light]
    for (let i = 0; i < 3; i++) {
      p.set(mx + 1 + i, my + 2 + i, '#4e4b45').set(mx + 2 + i, my + 2 + i, lit[0]).set(mx + 1 + i, my + 3 + i, '#4e4b45')
      p.set(mx + 16 - i, my + 2 + i, '#4e4b45').set(mx + 15 - i, my + 2 + i, lit[1]).set(mx + 16 - i, my + 3 + i, '#4e4b45')
    }
    // armour: ribbed collar, banded segments, chest plate, rank insignia
    p.rect(mx + 3, my + 5, 12, 1, '#2c2b21')
    for (let c = 4; c < 14; c += 2) p.set(mx + c, my + 5, '#55543f')
    p.rect(mx + 1, my + 6, 16, 1, '#646249')
    p.rect(mx + 1, my + 8, 16, 1, '#55543f')
    for (const c of [3, 14]) p.rect(mx + c, my + 7, 1, 3, '#22211a')
    p.rect(mx + 7, my + 6, 4, 4, '#3a392b').rect(mx + 7, my + 6, 4, 1, '#77755a').rect(mx + 8, my + 7, 2, 1, '#2a291f')
    p.set(mx + 8, my + 8, '#c9a94e').set(mx + 9, my + 8, '#8a7434')
    const edge = look === 'right' ? mx + 17 : mx
    p.set(edge, my + 6, '#8a8868').set(edge, my + 8, '#6a6850')
  }
  // facing away (left) at the start and the end, toward Picard (right) in between
  const awayOn: [number, number][] = [[0, 2.4], [13.6, dur]]
  const towardOn: [number, number][] = [[2.4, 13.6]]
  const raised: [number, number][] = [[5.1, 12.8]]
  const madAway = crabHD(M, mx, my, 'left', dur, { left: [], right: [] }, [], 6.2, madredDetails('left'))
  const madToward = crabHD(M, mx, my, 'right', dur, { left: [], right: raised }, [], 6.2, madredDetails('right'))
  // the claw on its way up and on its way down: reaching out toward the lights
  const mid = new Pix()
  for (let i = 0; i < 4; i++) mid.rect(mx + 20 + i, my + 3 - i, 2, 1, M.skin).set(mx + 20 + i, my + 4 - i, M.shade)
  mid.rect(mx + 23, my - 3, 1, 2, M.skin).rect(mx + 26, my - 3, 1, 2, M.skin).rect(mx + 23, my - 1, 4, 1, M.skin).set(mx + 23, my - 3, M.light).set(mx + 26, my - 3, M.light)
  let mad = shown(madAway, awayOn, dur) + shown(madToward, towardOn, dur)
  mad += shown(mid.svg(), [[4.75, 5.1], [12.8, 13.25]], dur)
  // the walk: a few unhurried steps in, later the same steps back out
  const walk: [number, number, number][] = [[0, -6, 0]]
  for (let k = 0; k < 6; k++) {
    const t = 2.8 + k * 0.3
    walk.push([t, -5 + k, -1], [t + 0.15, -5 + k, 0])
  }
  for (let k = 0; k < 6; k++) {
    const t = 14.0 + k * 0.3
    walk.push([t, -1 - k, -1], [t + 0.15, -1 - k, 0])
  }
  const walkAnim = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${walk.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${kt(walk.map(w => w[0]))}"/>`
  s += `<g>${mad}${walkAnim}</g>`

  // ---- Picard: hung by the wrists ----
  const P = COC_PICARD
  let pic = crabHD(
    P, px, py, 'left', dur,
    { left: [[0, dur]], right: [[0, dur]] },
    [],
    4.3,
    p => {
      // rumpled uniform: a torn seam and a crease
      p.set(px + 13, py + 8, '#7a161c').set(px + 14, py + 9, '#7a161c').set(px + 5, py + 8, '#c94048')
      // grey fringe of hair at the temples
      p.rect(px, py + 2, 1, 2, '#8e8a86').rect(px + 17, py + 2, 1, 2, '#b4b0aa')
      // furrowed brow
      p.rect(px + 3, py + 1, 4, 1, P.shade).rect(px + 9, py + 1, 4, 1, P.shade)
    },
  )
  // exhausted: heavy, half-closed eyelids (again while he hesitates)
  const lids = new Pix()
  for (const e of [4, 10]) lids.rect(px + e, py + 2, 2, 2, P.shade).rect(px + e, py + 2, 2, 1, P.skin)
  pic += shown(lids.svg(), [[0, 4.9], [9.7, 10.3]], dur)
  // he looks up and right at the fifth light
  const glance = new Pix()
  for (const e of [4, 10]) glance.rect(px + e, py + 2, 2, 3, P.skin)
  for (const e of [6, 12]) glance.rect(px + e, py + 1, 2, 3, EYE_HD)
  pic += shown(glance.svg(), [[8.0, 9.7]], dur)
  // defiance: brows drawn down hard
  const brows = new Pix()
  brows.set(px + 3, py + 1, P.shade).rect(px + 5, py + 1, 2, 1, '#6e2f20').set(px + 7, py + 2, '#6e2f20')
  brows.set(px + 9, py + 2, '#6e2f20').rect(px + 10, py + 1, 2, 1, '#6e2f20').set(px + 13, py + 1, P.shade)
  pic += shown(brows.svg(), [[10.3, dur]], dur)
  // iron manacles at both wrists
  const cuffs = new Pix()
  for (const ax of [px - 3, px + 19]) {
    cuffs.rect(ax - 1, py - 4, 4, 2, '#4f4940').rect(ax - 1, py - 4, 4, 1, '#8d8578').set(ax + 2, py - 3, '#2e2a25')
  }
  pic += cuffs.svg()
  // sweat running down his head
  pic += `<rect x="${(px + 15) * Q}" y="${(py + 1) * Q}" width="${Q}" height="${Q}" fill="#cfe4ff" opacity="0"><animate attributeName="y" values="${(py + 1) * Q};${(py + 5) * Q}" dur="2.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.8;1" dur="2.5s" repeatCount="indefinite"/></rect>`
  // the shout: mouth wide open, a few strokes of sound
  const shout = new Pix().rect(px + 6, py + 4, 4, 2, '#3a0f16').rect(px + 7, py + 5, 2, 1, '#8e2a32')
  for (const [sx, sy] of [[px - 7, py + 1], [px - 8, py + 4], [px - 7, py + 7]] as [number, number][]) shout.rect(sx, sy, 2, 1, '#e8d8b8')
  pic += shown(shout.svg(), [[10.5, 12.7]], dur)
  // body: sagging until he gathers himself, then three jolts upward
  const bodyK = [0, 10.3]
  const bodyV = [`0 ${Q}`, '0 0']
  for (const [a, b] of jolts) bodyK.push(a, b), bodyV.push(`0 ${-Q}`, '0 0')
  const bodyAnim = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${bodyV.join(';')}" keyTimes="${kt(bodyK)}"/>`
  s += `<g>${pic}${bodyAnim}</g>`

  return s
}
