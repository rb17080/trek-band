// ---------- First Contact: the Borg Queen's entrance ----------
// One 17.17 s story. Picard walks into the dark Borg chamber and stands watching
// the headless body on its dais. Her head, shoulders and dangling spine are lowered
// on cables from the hatch, slowly, and lock onto the body with a small spark burst
// and soft steam. Her red eyepiece kindles; she opens her eyes, turns them to
// Picard and raises a beckoning claw. He steps back. The cables withdraw.

const FCH_DUR = SCENE_SECONDS

// the beats (seconds)
const FCH_T_WALK = 1.0 // Picard starts walking in (7 steps)
const FCH_T_DESC = 3.4 // the crane starts lowering her
const FCH_T_LOCK = 8.2 // her spine seats in the body
const FCH_T_ARMS = 9.2 // her arms come alive
const FCH_T_EYE0 = 8.7 // the eyepiece starts to light...
const FCH_T_EYE1 = 10.2 // ...fully lit
const FCH_T_OPEN = 10.4 // eyes open, straight ahead
const FCH_T_TURN = 11.1 // eyes turn to Picard
const FCH_T_BECK = 11.8 // the claw comes up
const FCH_T_BDOWN = 13.6 // and goes down again
const FCH_T_BACK = 12.6 // Picard steps back (2 steps)
const FCH_T_UP0 = 13.7 // cables start to withdraw...
const FCH_T_UP1 = 15.5 // ...gone into the hatch

const FCH_PICARD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#a9573e',
  upper: '#1c1424',
  lower: '#b3262e',
  lowerShade: '#8e1d24',
  legs: '#1c1424',
  rim: '#c9c47a', // the chamber's green light on the side facing her
}

const FCH_QUEEN: CrabHD = {
  skin: '#b7bcb4',
  light: '#dde3da',
  shade: '#80867f',
  legs: '#1b1f22',
  rim: '#c6efc0',
}

const FCH_SUIT = { top: '#56636a', mid: '#171b1e', low: '#101315', shade: '#0a0c0d', rim: '#3d6e49', tube: '#050607', tubeHi: '#4a555c' }

const fchK = (t: number) => +(t / FCH_DUR).toFixed(4)

// Piecewise-eased track of whole art pixels, written as a discrete translate
function fchTrack(pts: [number, number][], axis: 'x' | 'y', dur: number) {
  const times: number[] = []
  const vals: string[] = []
  let last: number | null = null
  for (let i = 0; i <= dur * 50; i++) {
    const t = i / 50
    let v = pts[pts.length - 1][1]
    for (let k = 0; k < pts.length - 1; k++) {
      const [t0, v0] = pts[k]
      const [t1, v1] = pts[k + 1]
      if (t >= t0 && t < t1) {
        const u = (t - t0) / (t1 - t0)
        const e = u * u * (3 - 2 * u)
        v = v0 + (v1 - v0) * e
        break
      }
    }
    const r = Math.round(v)
    if (r !== last && t < dur) {
      times.push(t / dur)
      vals.push(axis === 'x' ? `${r * Q} 0` : `0 ${r * Q}`)
      last = r
    }
  }
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${vals.join(';')}" keyTimes="${times.map(t => +t.toFixed(4)).join(';')}"/>`
}

// Discrete translate through explicit keys [time, x, y] (art pixels)
function fchKeys(keys: [number, number, number][]) {
  return `<animateTransform attributeName="transform" type="translate" calcMode="discrete" dur="${FCH_DUR}s" repeatCount="indefinite" values="${keys.map(([, x, y]) => `${x * Q} ${y * Q}`).join(';')}" keyTimes="${keys.map(([t]) => fchK(t)).join(';')}"/>`
}

// Smooth opacity ramp on the story timeline: [time, opacity] points
function fchFade(pts: [number, number][]) {
  const all = pts[0][0] > 0 ? [[0, pts[0][1]] as [number, number], ...pts] : pts
  const end = all[all.length - 1]
  if (end[0] < FCH_DUR) all.push([FCH_DUR, end[1]])
  return `<animate attributeName="opacity" dur="${FCH_DUR}s" repeatCount="indefinite" values="${all.map(p => p[1]).join(';')}" keyTimes="${all.map(p => fchK(p[0])).join(';')}"/>`
}

// The crane: a slight sway while she comes down, then the descent itself
const FCH_SWAY: [number, number][] = [[0, 0], [FCH_T_DESC + 0.6, 0], [FCH_T_DESC + 1.9, -1], [FCH_T_DESC + 3.3, 1], [FCH_T_LOCK - 0.3, 0], [FCH_DUR, 0]]
const FCH_DOWN: [number, number][] = [[0, -46], [FCH_T_DESC, -46], [FCH_T_LOCK, 0], [FCH_DUR, 0]]

function fchHang(svg: string, down: [number, number][]) {
  return `<g>${fchTrack(FCH_SWAY, 'x', FCH_DUR)}<g>${svg}${fchTrack(down, 'y', FCH_DUR)}</g></g>`
}

// One particle that flies along a path once, inside [t0, t0 + life]
function fchFly(shape: string, x: number, y: number, path: string, t0: number, life: number, fade: boolean) {
  const a = fchK(t0)
  const b = fchK(t0 + life)
  const op = fade
    ? `<animate attributeName="opacity" dur="${FCH_DUR}s" repeatCount="indefinite" values="0;0;0.42;0;0" keyTimes="0;${a};${fchK(t0 + 0.35)};${b};1"/>`
    : `<animate attributeName="opacity" calcMode="discrete" dur="${FCH_DUR}s" repeatCount="indefinite" values="0;1;0" keyTimes="0;${a};${b}"/>`
  return `<g transform="translate(${x * Q} ${y * Q})"><g opacity="0">${shape}<animateMotion path="${path}" dur="${FCH_DUR}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1"/>${op}</g></g>`
}

function fchPuff(c: string, big: boolean) {
  const p = new Pix()
  if (big) p.rect(1, 0, 3, 1, c).rect(0, 1, 5, 2, c).rect(1, 3, 3, 1, c)
  else p.rect(1, 0, 2, 1, c).rect(0, 1, 4, 1, c).rect(1, 2, 2, 1, c)
  return p.svg()
}

const fchR = (x: number, y: number, w: number, h: number, c: string) =>
  `<rect x="${x * Q}" y="${y * Q}" width="${w * Q}" height="${h * Q}" fill="${c}"/>`

function fchBackground(W: number, H: number) {
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let back = `<rect width="${W}" height="${H}" fill="url(#fchWallG)"/>`

  // far wall: the Borg grid of plates, ribs and rivets (one tile, repeated)
  back += `<rect x="0" y="${4 * Q}" width="${W}" height="${38 * Q}" fill="url(#fchGrid)"/>`
  const far = new Pix()
  const lights: [number, number][] = []
  for (let cy = 4; cy < 40; cy += 6) {
    for (let cx = 5; cx < GW; cx += 7) {
      const g = rnd()
      if (g < 0.22) far.rect(cx + 2, cy + 3, 3, 1, '#18402a').set(cx + 2, cy + 3, '#2b6a40')
      else if (g < 0.36) far.rect(cx + 1, cy + 2, 5, 3, '#06100a').rect(cx + 2, cy + 3, 3, 1, '#12301a')
      else if (g < 0.5) lights.push([cx + 2 + Math.floor(rnd() * 3), cy + 2 + Math.floor(rnd() * 3)])
    }
  }
  back += far.svg()

  // near layer: thick conduits, couplings and sagging tubes
  const near = new Pix()
  const pipe = (x: number, w: number, y0: number, y1: number) => {
    back += fchR(x, y0, w, y1 - y0, '#13261a') + fchR(x, y0, 1, y1 - y0, '#2e5238') + fchR(x + w - 1, y0, 1, y1 - y0, '#07100a')
    if (w > 2) back += fchR(x + 1, y0, 1, y1 - y0, '#1f3a28')
    for (let y = y0 + 3; y < y1 - 1; y += 7) near.rect(x - 1, y, w + 2, 2, '#1a3322').set(x - 1, y, '#3d6a4a').set(x + w, y, '#0a140d').set(x - 1, y + 1, '#2a4a34')
  }
  near.rect(0, 13, 38, 2, '#10221a').rect(0, 13, 38, 1, '#2a4a34')
  near.rect(48, 20, 42, 2, '#10221a').rect(48, 20, 42, 1, '#2a4a34')
  back += near.svg()
  pipe(3, 3, 5, 42)
  pipe(9, 2, 5, 42)
  pipe(40, 3, 5, 42)
  pipe(45, 2, 5, 42)
  pipe(86, 3, 5, 42)
  const top = new Pix()
  const sag = (a: number, b: number, y: number, d: number) => {
    for (let x = a; x <= b; x++) {
      const yy = y + Math.round(d * Math.sin((Math.PI * (x - a)) / (b - a)))
      top.set(x, yy, '#050a07').set(x, yy - 1, '#1d3626')
    }
  }
  sag(12, 39, 6, 6)
  sag(20, 33, 6, 10)
  sag(47, 60, 6, 7)
  sag(78, 89, 6, 9)
  // ceiling machinery and the hatch she comes down from
  top.rect(0, 0, GW, 5, '#040906').rect(0, 4, GW, 1, '#163420')
  for (let x = 2; x < GW; x += 5) top.set(x, 2, '#1c3d27')
  top.rect(60, 0, 18, 4, '#010201').rect(59, 0, 1, 5, '#2a4a34').rect(78, 0, 1, 5, '#2a4a34').rect(60, 3, 18, 1, '#1d6b34')
  // floor grating
  top.rect(0, 42, GW, 6, '#050b07').rect(0, 42, GW, 1, '#16301e').rect(0, 45, GW, 1, '#08120a')
  back += top.svg()
  for (let x = 3; x < GW; x += 5) back += fchR(x, 43, 1, 5, '#0a160d')

  // indicator lights in the wall plates, breathing slowly (single art pixels)
  lights.forEach(([x, y], i) => {
    back += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#5dff8a"><animate attributeName="opacity" values="0.9;0.3;0.9" dur="${2.6 + (i % 5) * 0.45}s" begin="${(i * 0.37) % 2.3}s" repeatCount="indefinite"/></rect>`
  })
  return back
}

// Her left arm (toward Picard), raised: 'mid' is half way, 'curl' bends the claw tips in
function fchArmLeft(x: number, y: number, pose: 'mid' | 'up' | 'curl') {
  const k = FCH_QUEEN
  const p = new Pix()
  p.rect(x - 3, y + 4, 3, 2, k.skin)
  if (pose === 'mid') {
    p.rect(x - 5, y + 1, 2, 4, k.skin).rect(x - 5, y + 1, 1, 4, k.shade)
    p.rect(x - 7, y - 2, 1, 2, k.skin).rect(x - 4, y - 2, 1, 2, k.skin)
    p.rect(x - 7, y, 4, 1, k.skin).set(x - 7, y - 2, k.light).set(x - 4, y - 2, k.light)
    return p.svg()
  }
  const ax = x - 3
  const cx = x - 4
  p.rect(ax, y - 4, 2, 8, k.skin).rect(ax, y - 4, 1, 8, k.shade)
  p.rect(cx, y - 6, 4, 1, k.skin).rect(cx + 1, y - 5, 2, 1, k.skin)
  if (pose === 'up') {
    p.rect(cx, y - 8, 1, 3, k.skin).rect(cx + 3, y - 8, 1, 3, k.skin)
    p.set(cx, y - 8, k.light).set(cx + 3, y - 8, k.light)
  } else {
    // tips folded toward her: a come-here curl
    p.rect(cx, y - 7, 1, 2, k.skin).rect(cx + 3, y - 7, 1, 2, k.skin)
    p.set(cx + 1, y - 7, k.light).set(cx + 4, y - 7, k.light)
  }
  return p.svg()
}

function fchQueenBody(x: number, y: number) {
  const k = FCH_QUEEN
  const S = FCH_SUIT
  const p = new Pix()
  // black bodysuit, rows 5..9, with ribbing and tubes
  p.rect(x, y + 5, 18, 1, S.top)
  p.rect(x, y + 6, 18, 2, S.mid)
  p.rect(x, y + 8, 18, 1, S.low)
  p.rect(x + 1, y + 9, 16, 1, S.low)
  p.rect(x, y + 6, 1, 3, S.shade).rect(x + 17, y + 6, 1, 3, S.rim)
  for (let i = 5; i < 13; i += 2) p.set(x + i, y + 7, '#23292d')
  for (const tx of [3, 14]) p.rect(x + tx, y + 5, 1, 5, S.tube).set(x + tx, y + 6, S.tubeHi)
  p.set(x + 2, y + 8, S.tubeHi).set(x + 15, y + 8, S.tubeHi)
  for (const lx of [1, 5, 11, 15]) p.rect(x + lx, y + 10, 2, 4, k.legs).set(x + lx, y + 10, '#2b3135')
  let s = p.svg()
  // the open socket waiting for her spine; its glow dies away once she is seated
  const sock = new Pix().rect(x + 6, y + 5, 6, 1, '#020403').rect(x + 7, y + 6, 4, 1, '#020403').rect(x + 8, y + 5, 2, 1, '#3cff7a')
  s += `<g>${sock.svg()}${fchFade([[FCH_T_LOCK, 1], [FCH_T_LOCK + 0.8, 0]])}</g>`
  // arms: limp until she is whole, then at rest; the left one beckons Picard
  const B = FCH_T_BECK
  const D = FCH_T_BDOWN
  const limp = new Pix().rect(x - 3, y + 6, 3, 2, k.skin).rect(x - 3, y + 8, 3, 1, k.shade).rect(x + 18, y + 6, 3, 2, k.skin).rect(x + 18, y + 8, 3, 1, k.shade)
  s += shown(limp.svg(), [[0, FCH_T_ARMS]], FCH_DUR)
  s += shown(armRestHD(k, x, y, 'right'), [[FCH_T_ARMS, FCH_DUR]], FCH_DUR)
  s += shown(armRestHD(k, x, y, 'left'), [[FCH_T_ARMS, B], [D + 0.3, FCH_DUR]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'mid'), [[B, B + 0.3], [D, D + 0.3]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'up'), [[B + 0.3, B + 0.75], [B + 1.15, B + 1.4], [B + 1.75, D]], FCH_DUR)
  s += shown(fchArmLeft(x, y, 'curl'), [[B + 0.75, B + 1.15], [B + 1.4, B + 1.75]], FCH_DUR)
  return s
}

// What hangs behind the body: the spine and her tubes
function fchQueenBack(x: number, y: number) {
  const p = new Pix()
  // spine: vertebrae with dark discs, a stray wire
  for (let j = 0; j < 11; j++) {
    const yy = y + 5 + j
    if (j % 2 === 0) {
      const w = j > 7 ? 2 : 4
      const ox = j > 7 ? 8 : 7
      p.rect(x + ox, yy, w, 1, '#8b969c').set(x + ox, yy, '#c9d3d8').set(x + ox + w - 1, yy, '#5a656b')
    } else p.rect(x + 8, yy, 2, 1, '#3a4348')
  }
  p.set(x + 8, y + 16, '#5a656b')
  p.set(x + 10, y + 7, '#2a2f33').set(x + 11, y + 8, '#2a2f33').set(x + 11, y + 9, '#ff3b3b')
  p.set(x + 6, y + 9, '#2a2f33').set(x + 6, y + 10, '#2a2f33').set(x + 5, y + 11, '#2a2f33')
  // black tubes hanging from the back of her crown
  for (const [tx, len, dir] of [[-1, 8, -1], [18, 8, 1], [2, 10, -1], [15, 10, 1]] as [number, number, number][]) {
    for (let j = 0; j < len; j++) {
      const xx = x + tx + (j > 4 ? dir : 0)
      p.set(xx, y + j, FCH_SUIT.tube)
      if (j % 3 === 1) p.set(xx, y + j, FCH_SUIT.tubeHi)
    }
  }
  return p.svg()
}

function fchCables(x: number, y: number) {
  const p = new Pix()
  for (let yy = y - 60; yy < y - 3; yy++) {
    const hi = (yy - y) % 4 === 0
    p.set(x + 4, yy, hi ? '#4b6a55' : '#1b2a20').set(x + 13, yy, hi ? '#4b6a55' : '#1b2a20')
    p.rect(x + 8, yy, 2, 1, '#0f1712').set(x + 8, yy, hi ? '#3a5a44' : '#1e3326')
  }
  // the clamp that holds her crown
  p.rect(x + 3, y - 4, 12, 1, '#2f3e35').set(x + 3, y - 4, '#6f8a78').rect(x + 6, y - 5, 6, 1, '#4a5d51')
  p.rect(x + 3, y - 3, 1, 1, '#2f3e35').rect(x + 14, y - 3, 1, 1, '#2f3e35')
  return p.svg()
}

// Her head: pale Clawd block, glossy black skullcap, implant with a red eye light
function fchQueenHead(x: number, y: number) {
  const k = FCH_QUEEN
  const p = new Pix()
  p.rect(x + 1, y, 16, 1, k.light)
  p.rect(x, y + 1, 18, 4, k.skin)
  p.rect(x, y + 1, 1, 4, k.shade).rect(x + 17, y + 1, 1, 4, k.rim)
  p.rect(x + 1, y + 4, 16, 1, '#a9aea6') // jaw shadow above the collar
  // skullcap / crown
  p.rect(x + 5, y - 3, 8, 1, '#121618')
  p.rect(x + 3, y - 2, 12, 1, '#121618')
  p.rect(x + 1, y - 1, 16, 1, '#0d1012')
  p.rect(x, y, 18, 1, '#0d1012')
  p.rect(x, y + 1, 2, 1, '#0d1012').rect(x + 16, y + 1, 2, 1, '#0d1012')
  p.rect(x, y + 2, 1, 1, '#0d1012').rect(x + 17, y + 2, 1, 1, '#0d1012')
  p.rect(x + 6, y - 3, 2, 1, '#a7bac2').rect(x + 4, y - 2, 4, 1, '#5f7480').set(x + 5, y - 2, '#9fb3bc')
  p.rect(x + 2, y - 1, 3, 1, '#2f3b42').set(x + 9, y - 2, '#24303a').set(x + 12, y - 2, '#24303a')
  p.set(x + 1, y, '#3a4850').set(x + 16, y - 1, '#2a3238')
  // cybernetic plate around her right eye, and a tube at her temple
  p.rect(x + 14, y + 1, 3, 3, '#3b4246').set(x + 14, y + 1, '#6c767c').rect(x + 16, y + 1, 1, 3, '#23292d')
  p.set(x + 1, y + 2, '#262c30').set(x + 1, y + 3, '#262c30')
  // the dormant eyepiece
  p.set(x + 15, y + 2, '#5a1414')
  let s = p.svg()
  // eyes: closed while she is carried, open ahead, then turned to Picard (one slow blink)
  const O = FCH_T_OPEN
  const T = FCH_T_TURN
  s += shown(new Pix().rect(x + 5, y + 3, 2, 1, '#4b514b').rect(x + 11, y + 3, 2, 1, '#4b514b').svg(), [[0, O]], FCH_DUR)
  s += shown(new Pix().rect(x + 5, y + 2, 2, 3, EYE_HD).rect(x + 11, y + 2, 2, 3, EYE_HD).svg(), [[O, T]], FCH_DUR)
  s += shown(new Pix().rect(x + 3, y + 2, 2, 3, EYE_HD).rect(x + 9, y + 2, 2, 3, EYE_HD).svg(), [[T, 14.9], [15.05, FCH_DUR]], FCH_DUR)
  s += shown(new Pix().rect(x + 3, y + 3, 2, 1, '#4b514b').rect(x + 9, y + 3, 2, 1, '#4b514b').svg(), [[14.9, 15.05]], FCH_DUR)
  // red eyepiece: kindles slowly after the lock, then breathes gently
  const lit = new Pix().set(x + 15, y + 2, '#ff3b3b').set(x + 15, y + 3, '#b01c1c').svg()
  const glow = `<circle cx="${(x + 15.5) * Q}" cy="${(y + 2.5) * Q}" r="5" fill="#ff3030" opacity="0.3"><animate attributeName="opacity" values="0.22;0.4;0.22" dur="3.2s" repeatCount="indefinite"/></circle>`
  s += `<g opacity="0">${glow}${lit}${fchFade([[FCH_T_EYE0, 0], [FCH_T_EYE1, 1]])}</g>`
  return s
}

function firstContactHD() {
  const dur = FCH_DUR
  const W = GW * Q
  const H = GH * Q
  const qx = 60
  const qy = 28
  let s = `<defs>
    <linearGradient id="fchWallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05100a"/><stop offset="0.6" stop-color="#0b1f12"/><stop offset="1" stop-color="#0f2a17"/></linearGradient>
    <linearGradient id="fchFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="fchFade"><rect width="${W}" height="${H}" fill="url(#fchFadeG)"/></mask>
    <linearGradient id="fchBeamG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8dffb0" stop-opacity="0.26"/><stop offset="1" stop-color="#3cff7a" stop-opacity="0.04"/></linearGradient>
    <radialGradient id="fchHaze"><stop offset="0" stop-color="#3cff7a" stop-opacity="0.3"/><stop offset="0.6" stop-color="#2bd35e" stop-opacity="0.08"/><stop offset="1" stop-color="#2bd35e" stop-opacity="0"/></radialGradient>
    <pattern id="fchGrid" x="${-2 * Q}" y="${4 * Q}" width="${7 * Q}" height="${6 * Q}" patternUnits="userSpaceOnUse">${new Pix().rect(0, 0, 7, 6, '#10281a').rect(1, 1, 6, 1, '#1a4226').rect(6, 2, 1, 4, '#081509').rect(1, 5, 5, 1, '#0c1f12').rect(0, 0, 1, 6, '#163c22').rect(0, 0, 7, 1, '#163c22').set(0, 0, '#3f8a52').svg()}</pattern>
    <mask id="fchSpineM" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${(qx + 4) * Q}" y="${(qy + 5) * Q}" width="${10 * Q}" height="${12 * Q}" fill="#000"/></mask>
    <radialGradient id="fchSpark"><stop offset="0" stop-color="#e6ffd8" stop-opacity="0.75"/><stop offset="0.45" stop-color="#9dffb8" stop-opacity="0.3"/><stop offset="1" stop-color="#3cff7a" stop-opacity="0"/></radialGradient>
  </defs>`

  let back = fchBackground(W, H)
  // green haze drifting slowly through the chamber
  back += `<ellipse cx="${30 * Q}" cy="${26 * Q}" rx="70" ry="26" fill="url(#fchHaze)" opacity="0.6"><animate attributeName="cx" values="${26 * Q};${36 * Q};${26 * Q}" dur="12s" repeatCount="indefinite"/></ellipse>`
  back += `<rect x="0" y="${37 * Q}" width="${W}" height="${8 * Q}" fill="#3cff7a" opacity="0.05"/>`
  s += `<g mask="url(#fchFade)">${back}</g>`

  // the light pouring down from the hatch onto her body: steady, a very slow breath
  s += `<polygon points="${60 * Q},${4 * Q} ${78 * Q},${4 * Q} ${88 * Q},${42 * Q} ${50 * Q},${42 * Q}" fill="url(#fchBeamG)" opacity="0.9"><animate attributeName="opacity" values="0.86;0.96;0.86" dur="7s" repeatCount="indefinite"/></polygon>`
  s += `<ellipse cx="${69 * Q}" cy="${34 * Q}" rx="44" ry="30" fill="url(#fchHaze)" opacity="0.65"/>`

  // the dais she stands on
  const dais = new Pix().rect(55, 42, 28, 1, '#2c5238').rect(57, 43, 24, 1, '#13241a').set(55, 42, '#4f8a5f')
  for (const lx of [59, 66, 72, 78]) dais.set(lx, 43, '#3cff7a')
  s += dais.svg()

  // floor vent breathing steam between them
  for (let i = 0; i < 3; i++) {
    const d = 4.2 + i * 0.8
    s += `<g transform="translate(${46 * Q} ${40 * Q})"><g opacity="0">${fchPuff('#9fc7aa', i === 1)}<animateMotion path="M0 0 q ${i % 2 ? 6 : -4} -10 ${i % 2 ? 2 : 5} -24" dur="${d}s" begin="${i * 1.4}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.28;0" dur="${d}s" begin="${i * 1.4}s" repeatCount="indefinite"/></g></g>`
  }
  s += new Pix().rect(44, 41, 5, 1, '#1d3a26').set(45, 41, '#0a140d').set(47, 41, '#0a140d').svg()

  // Picard, command red, combadge. He walks in (7 steps), stands, later backs off 2 steps
  const px0 = 16
  const pic = crabHD(
    FCH_PICARD, px0, 28, 'right', dur,
    { left: [], right: [] },
    [],
    4.3,
    p => {
      p.rect(px0 + 12, 34, 2, 2, '#e8c547').set(px0 + 12, 34, '#fff3b0')
      p.set(px0 + 4, 34, '#e8c547').set(px0 + 6, 34, '#e8c547')
      p.set(px0 + 1, 28, '#cf8a6a').set(px0 + 16, 28, '#e6b08a')
    },
  )
  const walk: [number, number, number][] = [[0, -21, 0]]
  for (let i = 0; i < 7; i++) {
    const t = FCH_T_WALK + i * 0.32
    const x = -21 + 3 * (i + 1)
    walk.push([t, x, -1], [t + 0.16, x, 0])
  }
  const bk = FCH_T_BACK
  walk.push([bk, -1, -1], [bk + 0.16, -1, 0], [bk + 0.42, -3, -1], [bk + 0.58, -3, 0])
  s += `<g>${pic}${fchKeys(walk)}</g>`

  // the Queen: cables, spine and tubes, body, then head, with a 1px settle on the lock
  let queen = fchHang(fchCables(qx, qy), [[0, -46], [FCH_T_DESC, -46], [FCH_T_LOCK, 0], [FCH_T_UP0, 0], [FCH_T_UP1, -46], [dur, -46]])
  queen += `<g mask="url(#fchSpineM)">${fchHang(fchQueenBack(qx, qy), FCH_DOWN)}</g>`
  queen += fchQueenBody(qx, qy)
  queen += fchHang(fchQueenHead(qx, qy), FCH_DOWN)
  s += `<g>${queen}${fchKeys([[0, 0, 0], [FCH_T_LOCK, 0, 1], [FCH_T_LOCK + 0.35, 0, 0]])}</g>`

  // the lock: a small local glow at the neck, a few sparks, soft steam both sides
  s += `<ellipse cx="${69 * Q}" cy="${33 * Q}" rx="12" ry="5" fill="url(#fchSpark)" opacity="0">${fchFade([[FCH_T_LOCK - 0.1, 0], [FCH_T_LOCK + 0.4, 0.8], [FCH_T_LOCK + 1.5, 0]])}</ellipse>`
  const sparks: [number, number, number, string][] = [
    [-16, -8, 0.7, '#fff6c8'], [-22, -5, 0.8, '#ff9a4a'], [-9, -12, 0.55, '#ffd36b'],
    [16, -8, 0.7, '#fff6c8'], [22, -5, 0.85, '#ff9a4a'], [9, -12, 0.55, '#ffd36b'],
    [-5, -9, 0.6, '#ffd36b'], [5, -9, 0.6, '#fff6c8'],
  ]
  sparks.forEach(([dx, h, life, c], i) => {
    const t0 = FCH_T_LOCK + 0.1 + (i % 3) * 0.08 + (i > 5 ? 0.35 : 0)
    const ox = dx < 0 ? 66 : 71
    s += fchFly(`<rect width="${Q}" height="${Q}" fill="${c}"/>`, ox, 33, `M0 0 q ${dx * 0.6} ${h * 2} ${dx * 2} ${24 - 2 * h}`, t0, life, false)
  })
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1
    const t0 = FCH_T_LOCK + 0.15 + Math.floor(i / 2) * 0.3
    const ox = side < 0 ? 62 : 74
    s += fchFly(fchPuff('#cfe6d6', i < 2), ox, 31, `M0 0 q ${side * 12} -2 ${side * 20} -${16 + i * 3}`, t0, 2.2 + i * 0.15, true)
  }
  // a second, smaller hiss as the cables let go
  for (let i = 0; i < 2; i++) {
    s += fchFly(fchPuff('#b7d8c1', false), i ? 75 : 61, 24, `M0 0 q ${i ? 6 : -6} -4 ${i ? 8 : -8} -14`, FCH_T_UP0 + i * 0.2, 2.0, true)
  }

  // a faint scan line drifting down the chamber
  s += `<rect x="0" y="0" width="${W}" height="${Q}" fill="#7dffa0" opacity="0.06"><animateTransform attributeName="transform" type="translate" values="0 0;0 ${H}" dur="6.5s" repeatCount="indefinite"/></rect>`
  return s
}
