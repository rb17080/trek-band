// ---------- All Good Things: "Five card stud, nothing wild. And the sky's the limit." ----------
// One 17.17 s story: Riker, Data and Worf sit at the poker table, Picard's chair empty,
// stars drifting past the window. Picard walks in, pauses by his chair while the others
// look up, sits, takes the deck, shuffles and deals one card to each in turn. Riker
// picks up and grins, Data tilts his head, Worf scowls and pushes his chips into the
// pot, Picard looks at his own card and smiles. Calm tableau to the end.

const AGT_RIKER: CrabHD = {
  skin: '#d97757', light: '#eb9575', shade: '#b85f43',
  upper: '#1c1424', lower: '#b3262e', lowerShade: '#8e1d24', legs: '#1c1424', rim: '#ffb985',
}
const AGT_PICARD: CrabHD = { ...AGT_RIKER }
const AGT_DATA: CrabHD = {
  skin: '#e6dcc0', light: '#f7f1de', shade: '#bfb28e',
  upper: '#1c1424', lower: '#d4a024', lowerShade: '#a87c18', legs: '#1c1424', rim: '#fff8e0',
}
const AGT_WORF: CrabHD = {
  skin: '#a85c3a', light: '#c27552', shade: '#80432a',
  upper: '#1c1424', lower: '#d4a024', lowerShade: '#a87c18', legs: '#1c1424', rim: '#e8945e',
}

const AGT_Y = 26 // seated body top row
const AGT_RX = 5
const AGT_DX = 26
const AGT_WX = 47
const AGT_PX = 68

const AGT_CARD_W = '#f2ece0'
const AGT_CARD_R = '#b02a36'
const AGT_GOLD = '#e8c547'

// Clawd's body without legs (they are under the table), lit from the lamp side
function agtBody(k: CrabHD, x: number, y: number, look: Side, lit: Side) {
  const p = new Pix()
  for (let j = 0; j < 10; j++) {
    const inset = j === 0 || j === 9 ? 1 : 0
    let c = j === 0 ? k.light : k.skin
    if (j >= 6 && k.upper) c = j < 7 ? k.upper : k.lower!
    p.rect(x + inset, y + j, 18 - 2 * inset, 1, c)
  }
  const far = lit === 'right' ? x : x + 17
  const near = lit === 'right' ? x + 17 : x
  p.rect(far, y + 1, 1, 5, k.shade)
  p.rect(near, y + 1, 1, 5, k.rim)
  if (k.lowerShade) p.rect(far, y + 7, 1, 3, k.lowerShade).set(lit === 'right' ? far + 1 : far - 1, y + 9, k.lowerShade)
  const ex = look === 'left' ? [4, 10] : [6, 12]
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, EYE_HD))
  return { p, ex }
}

// Pixel-art head tilt: shear the columns so the right side rises (no blur)
function agtShear(p: Pix, x0: number) {
  const out = new Pix()
  const m = (p as any).m as Map<number, Map<number, string>>
  for (const [y, row] of m) for (const [x, c] of row) out.set(x, y + 1 - Math.floor((x - x0) / 6), c)
  return out
}

// Claws resting on the table edge in front of the body
function agtNub(k: CrabHD, x: number, side: Side) {
  const cx = side === 'left' ? x + 1 : x + 14
  return new Pix().rect(cx, 35, 3, 1, k.light).rect(cx, 36, 3, 1, k.skin).set(side === 'left' ? cx : cx + 2, 36, k.shade).svg()
}

const agtLids = (k: CrabHD, x: number, y: number, ex: number[], period: number, at: number) => {
  const lids = new Pix()
  ex.forEach(e => lids.rect(x + e, y + 2, 2, 3, k.skin))
  return `<g opacity="0">${lids.svg()}<animate attributeName="opacity" calcMode="discrete" dur="${period}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;${at};${+(at + 0.035).toFixed(3)}"/></g>`
}

// A fan of three face-up cards, bottom-left at (x, y)
function agtFan(p: Pix, x: number, y: number) {
  const pips = ['#c8303a', '#1c1424', '#c8303a']
  for (let i = 0; i < 3; i++) {
    const cx = x + i * 2
    const cy = y - 3 - (i === 1 ? 1 : 0)
    p.rect(cx, cy, 2, 4, i === 1 ? '#fffaf0' : AGT_CARD_W)
    p.set(cx + 1, cy + 3, '#c9c0b0')
    p.set(cx, cy + 1, pips[i])
  }
  return p
}

// A face-down card lying on the felt
const agtCardFlat = (p: Pix, x: number, y: number) =>
  p.rect(x, y, 4, 1, AGT_CARD_W).set(x, y + 1, AGT_CARD_W).rect(x + 1, y + 1, 2, 1, AGT_CARD_R).set(x + 3, y + 1, AGT_CARD_W)

// A chip stack: colours from the bottom up
function agtChips(p: Pix, x: number, yb: number, cols: string[]) {
  const lite: Record<string, string> = { '#c8333a': '#f07a7a', '#3a62c8': '#86a8f4', '#e0d8cc': '#ffffff', '#2a2a34': '#5a5a6a' }
  cols.forEach((c, i) => {
    p.rect(x, yb - i, 3, 1, c).set(x + 1, yb - i, lite[c])
  })
  p.set(x, yb - cols.length + 1, lite[cols[cols.length - 1]])
  return p
}

// Discrete translate through a list of [time, dx, dy] steps (art pixels)
function agtSteps(steps: [number, number, number][], dur: number) {
  const kt = steps.map(s => +(s[0] / dur).toFixed(4))
  const vals = steps.map(s => `${s[1] * Q} ${s[2] * Q}`)
  if (kt[0] !== 0) kt.unshift(0), vals.unshift(vals[0])
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${kt.join(';')}"/>`
}

// The frame between resting and raised: arm half up, claw open
function agtArmMid(k: CrabHD, x: number, y: number, side: Side) {
  const p = new Pix()
  const sx = side === 'left' ? x - 3 : x + 18
  p.rect(sx, y + 3, 3, 2, k.skin).set(side === 'left' ? sx : sx + 2, y + 5, k.shade)
  const cx = side === 'left' ? x - 4 : x + 20
  p.rect(cx, y, 2, 4, k.skin).rect(side === 'left' ? cx : cx + 1, y, 1, 4, k.shade)
  p.rect(cx - 1, y - 1, 4, 1, k.skin).set(cx - 1, y - 2, k.light).set(cx + 2, y - 2, k.light)
  return p.svg()
}

// Eyes raised a pixel and turned toward the newcomer on the right
function agtLookUp(k: CrabHD, x: number, y: number, ex: number[], eye: (p: Pix, ex: number, ey: number) => void) {
  const p = new Pix()
  ex.forEach(e => p.rect(x + e, y + 2, 2, 3, k.skin))
  ex.forEach(e => eye(p, x + e + 1, y + 1))
  return p.svg()
}
const agtPlainEye = (p: Pix, ex: number, ey: number) => p.rect(ex, ey, 2, 3, EYE_HD)
const agtDataEye = (p: Pix, ex: number, ey: number) => p.rect(ex, ey, 2, 3, '#e8b818').set(ex + 1, ey + 1, '#5a3a08').set(ex, ey, '#fff07a')

function allGoodThings() {
  const dur = SCENE_SECONDS
  const END = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const Y = AGT_Y
  let s = `<defs>
    <linearGradient id="agtWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1626"/><stop offset="1" stop-color="#3a2a32"/></linearGradient>
    <linearGradient id="agtSpace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07061a"/><stop offset="1" stop-color="#15102e"/></linearGradient>
    <linearGradient id="agtFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="agtFade"><rect width="${W}" height="${H}" fill="url(#agtFadeG)"/></mask>
    <linearGradient id="agtFadeT" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.09" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="agtFadeTable"><rect width="${W}" height="${H}" fill="url(#agtFadeT)"/></mask>
    <clipPath id="agtWin"><rect x="${23 * Q}" y="${4 * Q}" width="${62 * Q}" height="${15 * Q}"/></clipPath>
    <radialGradient id="agtGlow"><stop offset="0" stop-color="#ffb060" stop-opacity="0.38"/><stop offset="0.6" stop-color="#ff9a4a" stop-opacity="0.1"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <linearGradient id="agtCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd89a" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb060" stop-opacity="0.04"/></linearGradient>
  </defs>`

  // ---- the room: wall, the big window onto the stars, the lamp ----
  let back = `<rect width="${W}" height="${H}" fill="url(#agtWall)"/>`
  const wall = new Pix()
  for (const c of [8, 20, 87]) wall.rect(c, 0, 1, 36, '#2a1f2c').rect(c + 1, 0, 1, 36, '#3e2f3a')
  wall.rect(0, 22, GW, 1, '#4a3842').rect(0, 23, GW, 1, '#2a1f2c') // window ledge line
  back += wall.svg()
  // window: space with stars drifting slowly past, three panes
  back += `<rect x="${23 * Q}" y="${4 * Q}" width="${62 * Q}" height="${15 * Q}" fill="url(#agtSpace)"/>`
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const star = new Pix()
  const starB = new Pix()
  for (let i = 0; i < 46; i++) {
    const x = 23 + Math.floor(rnd() * 62)
    const y = 4 + Math.floor(rnd() * 15)
    const b = rnd()
    ;(b < 0.75 ? star : starB).set(x, y, b < 0.75 ? '#7d70a8' : '#e8e0ff')
    ;(b < 0.75 ? star : starB).set(x + 62, y, b < 0.75 ? '#7d70a8' : '#e8e0ff')
  }
  back += `<g clip-path="url(#agtWin)"><g>${star.svg()}<g>${starB.svg()}<animate attributeName="opacity" values="1;0.6;1" dur="3.1s" repeatCount="indefinite"/></g><animateTransform attributeName="transform" type="translate" values="0 0;${-62 * Q} 0" dur="46s" repeatCount="indefinite"/></g>`
  back += `<ellipse cx="${66 * Q}" cy="${9 * Q}" rx="40" ry="10" fill="#7a5ac0" opacity="0.14"/></g>`
  const frame = new Pix()
  frame.rect(22, 3, 64, 1, '#6a5866').rect(22, 19, 64, 1, '#5a4856').rect(22, 20, 64, 1, '#3a2c38')
  frame.rect(22, 4, 1, 15, '#5a4856').rect(85, 4, 1, 15, '#4a3a46')
  for (const c of [43, 64]) frame.rect(c, 4, 1, 15, '#4a3a46').set(c, 4, '#6a5866')
  back += frame.svg()
  // a shelf with a plant on the left wall
  const deco = new Pix()
  deco.rect(10, 25, 9, 1, '#5a4248').rect(10, 26, 9, 1, '#3a2a30')
  deco.rect(12, 21, 3, 4, '#6a8a5a').set(13, 20, '#86a86e').set(11, 22, '#86a86e').set(15, 21, '#86a86e').rect(12, 24, 3, 1, '#5a3a2a')
  back += deco.svg()
  back += new Pix().rect(0, 44, GW, 4, '#1a1320').svg()
  s += `<g mask="url(#agtFade)">${back}</g>`

  // the lamp over the table and its cone of warm light (a very slow, slight breathing)
  const lamp = new Pix()
  lamp.rect(46, 0, 1, 2, '#5a4a52')
  lamp.rect(43, 2, 7, 1, '#a8703c').rect(42, 3, 9, 1, '#8a5a30').rect(41, 4, 11, 1, '#6a4224')
  lamp.rect(43, 2, 2, 1, '#d89a5a')
  lamp.rect(43, 5, 7, 1, '#ffe2a0').set(46, 5, '#fff6dc')
  s += `<polygon points="${42 * Q},${5 * Q} ${51 * Q},${5 * Q} ${84 * Q},${37 * Q} ${10 * Q},${37 * Q}" fill="url(#agtCone)"><animate attributeName="opacity" values="1;0.9;1" dur="6.2s" repeatCount="indefinite"/></polygon>`
  s += lamp.svg()
  s += `<ellipse cx="${47 * Q}" cy="${33 * Q}" rx="92" ry="30" fill="url(#agtGlow)"/>`

  // Picard's empty chair
  const chair = new Pix()
  chair.rect(71, 25, 12, 1, '#7a4040').rect(70, 26, 14, 10, '#5a2c30').rect(70, 26, 14, 1, '#8a4a48').rect(70, 27, 1, 9, '#7a4040').rect(83, 27, 1, 9, '#3e1c20')
  s += chair.svg()

  // ---- the story, on one 17.17 s timeline ----
  const walk0 = 1.1 // first step in
  const stepT = 0.3 // one step
  const nSteps = 9 // 3 art px each: from off-screen to beside the chair
  const walkEnd = walk0 + nSteps * stepT // 3.8: standing by the chair
  const sitA = 4.8 // lowering
  const sitB = 5.05 // seated
  const deckMid = 5.4 // reaching for the deck
  const deckUp = 5.6 // deck raised
  const shuf = [5.9, 6.2, 6.5, 6.8, 7.1] // split, riffle, split, riffle, squared
  const deal0 = 7.4 // first card leaves the deck
  const dealGap = 0.55
  const flight = 0.4
  const armDownMid = 9.6 // deck goes back on the table
  const armDown = 9.8
  const rikerAt = 9.9
  const dataAt = 11.2
  const worfAt = 12.5
  const picAt = 13.9
  const looks: Record<string, [number, number]> = { r: [3.8, 5.4], d: [4.0, 5.5], w: [4.2, 5.6] }

  // ---- Riker: beard, command red; picks up and grins ----
  {
    const k = AGT_RIKER
    const x = AGT_RX
    const { p, ex } = agtBody(k, x, Y, 'right', 'right')
    const beard = '#4a2a1c'
    p.rect(x + 1, Y, 16, 1, '#3a2016').set(x + 2, Y, '#5a3422').set(x + 3, Y, '#5a3422')
    p.rect(x + 1, Y + 3, 2, 3, beard).rect(x + 15, Y + 3, 2, 3, beard)
    p.rect(x + 2, Y + 5, 14, 1, beard).rect(x + 8, Y + 4, 4, 1, beard)
    p.rect(x + 12, Y + 6, 2, 2, AGT_GOLD).set(x + 12, Y + 6, '#fff3b0')
    p.set(x + 3, Y + 6, AGT_GOLD).set(x + 5, Y + 6, AGT_GOLD).set(x + 7, Y + 6, AGT_GOLD)
    let r = p.svg()
    r += agtLids(k, x, Y, ex, 4.7, 0.3)
    r += shown(agtLookUp(k, x, Y, ex, agtPlainEye), [looks.r], dur)
    const grin = new Pix().rect(x + 8, Y + 5, 5, 1, '#fff4e0').set(x + 7, Y + 4, '#fff4e0').set(x + 13, Y + 4, '#fff4e0')
    r += shown(grin.svg(), [[rikerAt + 0.5, END]], dur)
    r += agtNub(k, x, 'left')
    r += shown(agtNub(k, x, 'right'), complement([[rikerAt, END]], dur), dur)
    r += shown(agtArmMid(k, x, Y, 'right'), [[rikerAt, rikerAt + 0.2]], dur)
    r += shown(armUpHD(k, x, Y, 'right') + agtFan(new Pix(), x + 18, Y - 8).svg(), [[rikerAt + 0.2, END]], dur)
    s += `<g>${r}${hopQ([[rikerAt + 0.8, rikerAt + 1.05]], dur)}</g>`
  }

  // ---- Data: pale gold skin, yellow eyes, operations gold; tilts his head ----
  {
    const k = AGT_DATA
    const x = AGT_DX
    const { p, ex } = agtBody(k, x, Y, 'right', 'right')
    p.rect(x + 1, Y, 16, 1, '#2a2018').set(x, Y + 1, '#2a2018').set(x + 4, Y, '#4a3a2a').set(x + 5, Y, '#4a3a2a')
    ex.forEach(e => p.rect(x + e, Y + 2, 2, 3, '#e8b818').set(x + e + 1, Y + 3, '#5a3a08').set(x + e, Y + 2, '#fff07a'))
    p.rect(x + 12, Y + 6, 2, 2, AGT_GOLD).set(x + 12, Y + 6, '#fff3b0')
    p.set(x + 3, Y + 6, AGT_GOLD).set(x + 5, Y + 6, AGT_GOLD)
    const tilt: [number, number][] = [[dataAt + 0.7, dataAt + 2.0]]
    let d = shown(p.svg() + agtLids(k, x, Y, ex, 6.1, 0.5) + shown(agtLookUp(k, x, Y, ex, agtDataEye), [looks.d], dur), complement(tilt, dur), dur)
    d += shown(agtShear(p, x).svg(), tilt, dur)
    d += agtNub(k, x, 'left')
    d += shown(agtNub(k, x, 'right'), complement([[dataAt, END]], dur), dur)
    // the claw lifts off the felt, then holds the card up in front of him
    const lift = new Pix().rect(x + 14, 34, 3, 1, k.light).rect(x + 14, 35, 3, 1, k.skin).set(x + 16, 35, k.shade)
    d += shown(lift.svg(), [[dataAt, dataAt + 0.2]], dur)
    const hand = agtFan(new Pix(), x + 11, Y + 9).rect(x + 12, 35, 4, 1, k.light).rect(x + 12, 36, 4, 1, k.skin)
    d += shown(hand.svg(), [[dataAt + 0.2, END]], dur)
    s += `<g>${d}</g>`
  }

  // ---- Worf: ridges, long hair, gold with the baldric; scowls and pushes his chips in ----
  {
    const k = AGT_WORF
    const x = AGT_WX
    const { p, ex } = agtBody(k, x, Y, 'right', 'left')
    const hair = '#1c120e'
    p.rect(x + 1, Y, 16, 1, hair).rect(x - 1, Y, 1, 8, hair).rect(x + 18, Y, 1, 8, hair)
    p.rect(x, Y + 1, 1, 4, hair).rect(x + 17, Y + 1, 1, 4, hair).set(x - 1, Y + 8, hair).set(x + 18, Y + 8, '#2a1a14')
    for (const c of [3, 5, 7, 10, 12, 14]) p.set(x + c, Y + 1, k.shade)
    p.rect(x + 8, Y + 1, 2, 1, k.light).set(x + 8, Y, '#3a2418')
    p.rect(x + 6, Y + 1, 1, 1, k.light).set(x + 11, Y + 1, k.light)
    // baldric over the shoulder
    const sil = '#b8bcc6'
    const hi = '#eef0f6'
    ;[[14, 6], [13, 6], [12, 7], [11, 7], [10, 8], [9, 8], [8, 9], [7, 9]].forEach(([i, j], n) => p.set(x + i, Y + j, n % 2 ? sil : hi))
    p.set(x + 15, Y + 6, sil)
    p.rect(x + 3, Y + 6, 2, 2, AGT_GOLD).set(x + 3, Y + 6, '#fff3b0')
    let w = p.svg()
    w += agtLids(k, x, Y, ex, 5.5, 0.62)
    w += shown(agtLookUp(k, x, Y, ex, agtPlainEye), [looks.w], dur)
    const brow = new Pix().set(x + 5, Y + 1, '#3a1a10').rect(x + 6, Y + 2, 2, 1, '#3a1a10').rect(x + 12, Y + 2, 2, 1, '#3a1a10').set(x + 14, Y + 1, '#3a1a10').rect(x + 8, Y + 1, 4, 1, '#5a2a18')
    brow.rect(x + 8, Y + 4, 3, 1, '#3a1a10').set(x + 7, Y + 5, '#3a1a10').set(x + 11, Y + 5, '#3a1a10') // a frown
    w += shown(brow.svg(), [[worfAt + 0.5, END]], dur)
    // left claw: picks up his card and holds it up
    w += shown(agtNub(k, x, 'left'), complement([[worfAt, END]], dur), dur)
    w += shown(agtArmMid(k, x, Y, 'left'), [[worfAt, worfAt + 0.2]], dur)
    w += shown(armUpHD(k, x, Y, 'left') + agtFan(new Pix(), x - 5, Y - 8).svg(), [[worfAt + 0.2, END]], dur)
    // right claw: shoves his chip stack into the pot, then comes back
    const pushA = +((worfAt + 0.9) / dur).toFixed(4)
    const pushB = +((worfAt + 1.7) / dur).toFixed(4)
    const backA = +((worfAt + 2.0) / dur).toFixed(4)
    const backB = +((worfAt + 2.5) / dur).toFixed(4)
    w += `<g>${agtNub(k, x, 'right')}<animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${-8 * Q} 0;${-8 * Q} 0;0 0;0 0" keyTimes="0;${pushA};${pushB};${backA};${backB};1"/></g>`
    s += `<g>${w}</g>`
  }

  // ---- Picard: walks in, pauses by his chair, sits, shuffles, deals, looks, smiles ----
  {
    const k = AGT_PICARD
    const x = AGT_PX
    const { p, ex } = agtBody(k, x, Y, 'left', 'left')
    p.rect(x + 12, Y + 6, 2, 2, AGT_GOLD).set(x + 12, Y + 6, '#fff3b0')
    p.set(x + 3, Y + 6, AGT_GOLD).set(x + 5, Y + 6, AGT_GOLD).set(x + 7, Y + 6, AGT_GOLD).set(x + 9, Y + 6, AGT_GOLD)
    let pc = p.svg()
    // legs while walking, two frames in turn, one per step
    const legA = new Pix()
    const legB = new Pix()
    for (const lx of [1, 5, 11, 15]) legA.rect(x + lx, Y + 10, 2, 3, k.legs)
    for (const [lx, l] of [[0, 3], [5, 2], [10, 3], [15, 2]] as [number, number][]) legB.rect(x + lx, Y + 10, 2, l, k.legs)
    const stepsA: [number, number][] = [[0, walk0], [walkEnd, sitB]]
    const stepsB: [number, number][] = []
    for (let i = 0; i < nSteps; i++) (i % 2 ? stepsA : stepsB).push([walk0 + i * stepT, walk0 + (i + 1) * stepT])
    pc += shown(legA.svg(), stepsA, dur)
    pc += shown(legB.svg(), stepsB, dur)
    pc += agtLids(k, x, Y, ex, 4.3, 0.75)
    // left claw: reaches for the deck, holds it up through the shuffle and the deal
    const hold: [number, number] = [deckMid, armDown]
    pc += shown(agtNub(k, x, 'left'), complement([hold], dur), dur)
    pc += shown(agtArmMid(k, x, Y, 'left'), [[deckMid, deckUp], [armDownMid, armDown]], dur)
    pc += shown(armUpHD(k, x, Y, 'left'), [[deckUp, armDownMid]], dur)
    const deck = new Pix().rect(x - 4, Y - 12, 4, 4, AGT_CARD_R).rect(x - 4, Y - 12, 4, 1, AGT_CARD_W).rect(x - 4, Y - 9, 4, 1, '#d8d0c4').set(x - 3, Y - 10, '#d0505a')
    const split = new Pix()
      .rect(x - 6, Y - 12, 2, 4, AGT_CARD_R).rect(x - 6, Y - 12, 2, 1, AGT_CARD_W).rect(x - 6, Y - 9, 2, 1, '#d8d0c4')
      .rect(x - 1, Y - 13, 2, 4, AGT_CARD_R).rect(x - 1, Y - 13, 2, 1, AGT_CARD_W).rect(x - 1, Y - 10, 2, 1, '#d8d0c4')
    const riffle = new Pix()
    ;['#f2ece0', '#b02a36', '#f2ece0', '#b02a36', '#d8d0c4'].forEach((c, j) => riffle.rect(x - 5, Y - 13 + j, 5, 1, c))
    riffle.set(x - 5, Y - 12, '#d0505a').set(x - 1, Y - 10, '#d0505a')
    pc += shown(deck.svg(), [[deckUp, shuf[0]], [shuf[4], armDownMid]], dur)
    pc += shown(split.svg(), [[shuf[0], shuf[1]], [shuf[2], shuf[3]]], dur)
    pc += shown(riffle.svg(), [[shuf[1], shuf[2]], [shuf[3], shuf[4]]], dur)
    // right claw: picks up his own card at the end
    pc += shown(agtNub(k, x, 'right'), complement([[picAt, END]], dur), dur)
    pc += shown(agtArmMid(k, x, Y, 'right'), [[picAt, picAt + 0.2]], dur)
    pc += shown(armUpHD(k, x, Y, 'right') + agtFan(new Pix(), x + 16, Y - 8).svg(), [[picAt + 0.2, END]], dur)
    const smile = new Pix().rect(x + 6, Y + 5, 4, 1, '#8e3a28').set(x + 5, Y + 4, '#8e3a28').set(x + 10, Y + 4, '#8e3a28')
    pc += shown(smile.svg(), [[picAt + 0.6, END]], dur)
    // the walk: off-screen right, 3 art px a step, standing; then lowering into the chair
    const steps: [number, number, number][] = [[0, 30, -2]]
    for (let i = 0; i < nSteps; i++) steps.push([+(walk0 + i * stepT).toFixed(2), 27 - 3 * i, -2])
    steps.push([sitA, 1, -1], [sitB, 0, 0])
    s += `<g>${pc}${agtSteps(steps, dur)}</g>`
  }

  // ---- the table ----
  const tb = new Pix()
  tb.rect(3, 36, 87, 1, '#9a6438').rect(2, 37, 88, 1, '#6a3e22')
  for (let r = 38; r <= 40; r++) {
    for (let c = 1; c < GW; c++) {
      const d = Math.abs(c - 47)
      tb.set(c, r, d < 18 ? '#3c7a52' : d < 32 ? '#336a47' : '#2a573b')
    }
  }
  tb.rect(1, 38, GW, 1, '#2a573b')
  tb.rect(0, 41, GW, 1, '#7a4a28').rect(0, 42, GW, 1, '#4a2a18').rect(0, 43, GW, 1, '#2e1a12')
  for (const c of [24, 52, 70]) tb.set(c, 39, '#468a5e')
  s += `<g mask="url(#agtFadeTable)">${tb.svg()}</g>`

  // ---- chips, the pot, the deck on the table ----
  const chips = new Pix()
  agtChips(chips, AGT_RX + 13, 40, ['#3a62c8', '#c8333a', '#c8333a', '#e0d8cc'])
  agtChips(chips, AGT_DX + 14, 40, ['#e0d8cc', '#3a62c8', '#e0d8cc'])
  agtChips(chips, AGT_PX + 14, 40, ['#c8333a', '#3a62c8', '#c8333a'])
  agtChips(chips, 44, 40, ['#c8333a', '#e0d8cc', '#c8333a'])
  agtChips(chips, 42, 40, ['#3a62c8'])
  s += chips.svg()
  // Worf's stack, shoved into the pot by his right claw
  {
    const ws = agtChips(new Pix(), AGT_WX + 11, 40, ['#2a2a34', '#c8333a', '#2a2a34', '#c8333a']).svg()
    const a = +((worfAt + 0.9) / dur).toFixed(4)
    const b = +((worfAt + 1.7) / dur).toFixed(4)
    s += `<g>${ws}<animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" values="0 0;0 0;${-8 * Q} 0;${-8 * Q} 0" keyTimes="0;${a};${b};1"/></g>`
  }
  s += shown(agtCardFlat(new Pix(), AGT_PX + 6, 39).rect(AGT_PX + 6, 38, 4, 1, AGT_CARD_W).svg(), [[0, deckUp]], dur)
  s += shown(agtCardFlat(new Pix(), AGT_PX + 1, 39).rect(AGT_PX + 1, 38, 4, 1, AGT_CARD_W).svg(), [[armDown, END]], dur)

  // ---- the deal: one card at a time from Picard's deck to each player, himself last ----
  const order = [AGT_WX, AGT_DX, AGT_RX, AGT_PX]
  const pickup: Record<number, number> = { [AGT_RX]: rikerAt, [AGT_DX]: dataAt, [AGT_WX]: worfAt, [AGT_PX]: picAt }
  const sx = AGT_PX - 4
  const sy = Y - 11
  order.forEach((px, i) => {
    const t0 = deal0 + i * dealGap
    const t1 = t0 + flight
    const lx = px + 5
    const ly = 39
    const card = agtCardFlat(new Pix(), lx, ly).svg()
    const ddx = (sx - lx) * Q
    const ddy = (sy - ly) * Q
    const path = `M${ddx} ${ddy} Q${ddx / 2} ${ddy - 14} 0 0`
    const a = +(t0 / dur).toFixed(4)
    const b = +(t1 / dur).toFixed(4)
    s += `<g>${card}<animateMotion path="${path}" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1" dur="${dur}s" repeatCount="indefinite"/>${windows([[t0, pickup[px]]], dur)}</g>`
  })

  // a slow, faint glint on the pot
  s += `<rect x="${45 * Q}" y="${40 * Q}" width="${Q}" height="${Q}" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;0.7;0;0" keyTimes="0;0.5;0.68;0.88;1" dur="4.1s" repeatCount="indefinite"/></rect>`
  return s
}
