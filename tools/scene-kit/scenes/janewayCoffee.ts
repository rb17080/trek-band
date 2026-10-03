// ---------- The Cloud: "There's coffee in that nebula." ----------
// Janeway sips her coffee on the bridge, gazes at the nebula turning on the
// viewscreen, slowly realises, points at it, hops once: we're going in. Last sip.

const JC_HD: CrabHD = {
  skin: '#d97757',
  light: '#eb9575',
  shade: '#b85f43',
  upper: '#a3242c',
  lower: '#18131f',
  lowerShade: '#0e0b13',
  legs: '#18131f',
  rim: '#f2a3b4',
}

const JC_HAIR = { h: '#7a2e1a', l: '#a8452a', d: '#4f1c10', g: '#c25a36' }

const jcMugPal = { w: '#ffffff', k: '#4a2a18', m: '#ece8e0', s: '#aaa398', h: '#c4bdb2', r: '#b3262e' }
const jcMugRows = ['..wkkw', '.hmmms', 'h.rrrs', '.hmmms', '..ssss']

function jcNebula(x0: number, y0: number, w: number, h: number, cx: number, cy: number) {
  const p = new Pix()
  const cols = ['#0c0a1c', '#1a1236', '#2c1a52', '#47206e', '#6e2a86', '#a43d92', '#d86aa8', '#f7b7d2', '#fff1f6']
  const teal = ['#0f2a3a', '#145266', '#1f8494', '#4cc4c0', '#a6f0e4']
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = (x - cx) * 0.48
      const dy = (y - cy) * 1.15
      const r = Math.sqrt(dx * dx + dy * dy)
      const a = Math.atan2(dy, dx)
      const arm = Math.sin(a * 2 - r * 0.42) // two swirling arms
      const n = 0.5 * Math.sin(x * 0.37 + y * 0.9) + 0.35 * Math.sin(x * 0.11 - y * 0.53 + 1.3)
      let v = 1.2 - r / 14 + 0.38 * arm + 0.3 * n
      // a teal outer arm on the far side
      const tv = 0.7 - Math.abs(r - 10) / 6 + 0.45 * Math.sin(a * 2 - r * 0.42 + 2.4) + 0.45 * n
      let c: string
      if (v > 0.25) {
        const i = Math.min(cols.length - 1, Math.floor(1 + (v - 0.25) * 4.2))
        c = cols[i]
      } else if (tv > 0.35) {
        c = teal[Math.min(teal.length - 1, Math.floor((tv - 0.35) * 5))]
      } else {
        c = v > 0 ? cols[1] : cols[0]
      }
      p.set(x, y, c)
    }
  }
  return p
}

function janewayCoffee() {
  const dur = SCENE_SECONDS
  const D = SCENE_SECONDS
  const W = GW * Q
  const H = GH * Q
  const X = 24 // Janeway's body
  const Y = 28
  // viewscreen interior
  const sx = 6, sy = 3, sw = 80, sh = 20
  const ncx = 66, ncy = 12 // nebula core
  const kt = (list: number[]) => list.map(t => +(t / D).toFixed(4)).join(';')
  // ambient loops run on whole fractions of the story, so the frame at D matches t=0
  const per = (n: number) => +(D / n).toFixed(5)

  // ---------- the story (seconds) ----------
  // 0.0-1.8   calm: the bridge, the nebula turning, her mug steaming at her side
  // 1.8-2.3   the mug comes up            2.3-5.2  a long slow sip, eyes closed
  // 5.2-5.6   the mug comes down          5.8-8.0  she gazes up at the nebula
  // 8.0-9.6   it dawns on her: eyes go wide, a small sparkle by her head
  // 9.4-9.8   her claw comes up           9.8-13.0 pointing at it, holding
  // 11.5-12.5 a determined hop and a little nod
  // 13.0-13.4 the claw comes down         13.6-15.8 one last satisfied sip
  // 15.8-17.17 calm again, mug at her side, the nebula still turning
  // the mug travels through five drawings, one art pixel apart, ~0.1 s each:
  // side -> P1 -> P2 -> P3 (halfway) -> P4 -> at her lips, and back down
  const lift = (a: number): [number, number][][] => [[[a, a + 0.1]], [[a + 0.1, a + 0.2]], [[a + 0.2, a + 0.35]], [[a + 0.35, a + 0.5]]]
  const lower = (a: number): [number, number][][] => [[[a + 0.3, a + 0.4]], [[a + 0.2, a + 0.3]], [[a + 0.1, a + 0.2]], [[a, a + 0.1]]]
  const tMugStep: [number, number][][] = [0, 1, 2, 3].map(i => [lift(1.8)[i], lower(5.2)[i], lift(13.6)[i], lower(15.4)[i]].flat())
  const tMugUp: [number, number][] = [[2.3, 5.2], [14.1, 15.4]]
  const tMugSide = complement(merge([...tMugStep.flat(), ...tMugUp]), dur)
  const tClosed: [number, number][] = [[2.5, 5.0], [14.3, 15.3]]
  const tHalf: [number, number][] = [[2.4, 2.5], [5.0, 5.1], [14.2, 14.3], [15.3, 15.4]]
  const tGaze: [number, number][] = [[5.8, 8.0]]
  const tLit: [number, number][] = [[8.0, 13.2]]
  const tArmMid: [number, number][] = [[9.4, 9.8], [13.0, 13.4]]
  // the claw reaches out in three growing drawings on the way up, and back
  const tReach: [number, number][][] = [
    [[9.4, 9.5], [13.27, 13.4]],
    [[9.5, 9.65], [13.13, 13.27]],
    [[9.65, 9.8], [13.0, 13.13]],
  ]
  const tPoint: [number, number][] = [[9.8, 13.0]]
  const tBlink: [number, number][] = [[1.2, 1.35], [7.3, 7.45], [16.0, 16.15]]

  let s = `<defs>
    <linearGradient id="jcFadeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="jcFade"><rect width="${W}" height="${H}" fill="url(#jcFadeG)"/></mask>
    <clipPath id="jcScr"><rect x="${sx * Q}" y="${sy * Q}" width="${sw * Q}" height="${sh * Q}"/></clipPath>
    <radialGradient id="jcCore"><stop offset="0" stop-color="#ffe6f2" stop-opacity="0.75"/><stop offset="0.35" stop-color="#e070b8" stop-opacity="0.3"/><stop offset="1" stop-color="#7a3cc0" stop-opacity="0"/></radialGradient>
    <radialGradient id="jcTeal"><stop offset="0" stop-color="#5fe0d0" stop-opacity="0.35"/><stop offset="1" stop-color="#5fe0d0" stop-opacity="0"/></radialGradient>
    <radialGradient id="jcSpill"><stop offset="0" stop-color="#b06ad8" stop-opacity="0.22"/><stop offset="1" stop-color="#b06ad8" stop-opacity="0"/></radialGradient>
    <radialGradient id="jcGleam"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.5"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
  </defs>`

  let back = `<rect width="${W}" height="${H}" fill="#1b1729"/>`

  // the bridge wall around the screen
  const wall = new Pix()
  wall.rect(0, 0, GW, 42, '#221d33')
  wall.rect(sx - 3, sy - 2, sw + 6, sh + 4, '#14111f') // outer frame
  wall.rect(sx - 2, sy - 1, sw + 4, sh + 2, '#3a3552') // bezel
  wall.rect(sx - 2, sy - 1, sw + 4, 1, '#58517a')
  wall.rect(sx - 2, sy + sh, sw + 4, 1, '#2a2640')
  // wall panels under the screen
  wall.rect(0, 26, GW, 1, '#2e2844')
  wall.rect(0, 27, GW, 7, '#262036')
  for (let c = 4; c < GW; c += 12) wall.rect(c, 27, 1, 7, '#1c1729')
  wall.rect(0, 34, GW, 1, '#3a3352')
  wall.rect(0, 35, GW, 7, '#1e1a2c')
  // LCARS strips
  const lc = [['#e89a4a', 10], ['#b48ad8', 6], ['#6f8fd8', 4], ['#e8b06a', 8], ['#c26a8a', 5], ['#b48ad8', 9], ['#e89a4a', 6]] as [string, number][]
  let lx = 2
  for (const [c, w] of lc) {
    if (lx + w < 16 || lx > 50) wall.rect(lx, 29, w, 2, c).rect(lx, 29, 1, 2, '#3a3352')
    lx += w + 3
    if (lx > GW - 4) break
  }
  wall.rect(52, 32, 30, 1, '#4a3f66')
  back += wall.svg()

  // the nebula on the screen: the glows turn slowly and the core breathes, never flares
  let scr = jcNebula(sx, sy, sw, sh, ncx, ncy).svg()
  scr += `<g transform="translate(${(ncx + 0.5) * Q} ${(ncy + 0.5) * Q})"><g><ellipse cx="14" cy="0" rx="30" ry="12" fill="url(#jcTeal)"/><ellipse cx="-18" cy="3" rx="22" ry="9" fill="url(#jcSpill)"/><animateTransform attributeName="transform" type="rotate" values="0;110;0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${D}s" repeatCount="indefinite"/></g></g>`
  scr += `<ellipse cx="${(ncx + 0.5) * Q}" cy="${(ncy + 0.5) * Q}" rx="34" ry="18" fill="url(#jcCore)" opacity="0.8"><animate attributeName="opacity" values="0.8;0.95;0.8" dur="${D / 2}s" repeatCount="indefinite"/></ellipse>`
  // slow, soft twinkles in the cloud
  const sparks = [[60, 7], [72, 15], [48, 10], [80, 6], [55, 18], [70, 5], [36, 14], [24, 8], [84, 19], [64, 16]]
  sparks.forEach(([x, y], i) => {
    const g = new Pix().set(x - 1, y, '#e8c8ff').set(x + 1, y, '#e8c8ff').set(x, y - 1, '#e8c8ff').set(x, y + 1, '#e8c8ff')
    const d = per([5, 4, 4, 3][i % 4])
    scr += `<g opacity="0">${g.svg()}${new Pix().set(x, y, '#ffffff').svg()}<animate attributeName="opacity" values="0;0.8;0;0" keyTimes="0;0.35;0.7;1" dur="${d}s" begin="${(-i * 0.53).toFixed(2)}s" repeatCount="indefinite"/></g>`
  })
  // faint distant stars
  let seed = 41
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 26; i++) {
    const x = sx + Math.floor(rnd() * sw)
    const y = sy + Math.floor(rnd() * sh)
    scr += `<rect x="${x * Q}" y="${y * Q}" width="${Q}" height="${Q}" fill="#e6dcff" opacity="${(0.25 + rnd() * 0.4).toFixed(2)}"/>`
  }
  // a faint scanline drifting down the screen, from just above it to just below (both ends hidden by the clip)
  scr += `<rect x="${sx * Q}" y="0" width="${sw * Q}" height="${Q}" fill="#ffffff" opacity="0.05"><animate attributeName="y" values="${(sy - 1) * Q};${(sy + sh) * Q}" dur="${per(3)}s" repeatCount="indefinite"/></rect>`
  back += `<g clip-path="url(#jcScr)">${scr}</g>`
  // screen glass glint
  back += new Pix().rect(sx, sy, sw, 1, '#ffffff').svg().replace('<rect', '<rect opacity="0.08"')

  const floor = new Pix().rect(0, 42, GW, 6, '#15111f').rect(0, 42, GW, 1, '#2a2440')
  for (let c = 0; c < GW; c += 6) floor.set(c, 44, '#1d1829')
  back += floor.svg()
  s += `<g mask="url(#jcFade)">${back}</g>`
  // light spilling from the screen, breathing with the core
  s += `<ellipse cx="${60 * Q}" cy="${30 * Q}" rx="90" ry="30" fill="url(#jcSpill)" opacity="0.9"><animate attributeName="opacity" values="0.9;1;0.9" dur="${D / 2}s" repeatCount="indefinite"/></ellipse>`

  // console lights, slowly dimming and brightening
  ;[[8, 32, '#e89a4a'], [52, 29, '#6f8fd8'], [84, 32, '#c26a8a'], [60, 36, '#e8b06a'], [76, 36, '#6f8fd8']].forEach(([x, y, c], i) => {
    s += `<rect x="${(x as number) * Q}" y="${(y as number) * Q}" width="${Q * 2}" height="${Q}" fill="${c}"><animate attributeName="opacity" values="1;0.35;1" dur="${per([8, 7, 6, 5, 4][i])}s" repeatCount="indefinite"/></rect>`
  })

  // the conn console on the right, in front of the screen
  const con = new Pix()
  con.rect(56, 36, 32, 1, '#5a5378').rect(55, 37, 34, 1, '#3b3554').rect(56, 38, 32, 4, '#2a2540')
  con.rect(60, 36, 8, 1, '#e89a4a').rect(70, 36, 4, 1, '#b48ad8').rect(76, 36, 8, 1, '#6f8fd8')
  con.rect(56, 38, 1, 4, '#3b3554')
  s += con.svg()

  // ---------- Janeway ----------
  const k = JC_HD
  const { p } = clawdBody(k, X, Y, 'right')
  // Voyager uniform: grey collar, red yoke, black jacket, combadge, pips
  p.rect(X + 7, Y + 6, 5, 1, '#8a8e99').set(X + 7, Y + 6, '#6c707b')
  p.rect(X + 1, Y + 8, 16, 1, k.lower!)
  p.rect(X + 12, Y + 7, 2, 2, '#e8c547').set(X + 12, Y + 7, '#fff3b0')
  p.set(X + 9, Y + 6, '#e8c547').set(X + 10, Y + 6, '#e8c547')
  // auburn hair with the bun on top
  const hr = new Pix()
  hr.rows(
    [
      '.....dhhd.........',
      '....dhllhd........',
      '....dhhhhd........',
      '..dhhhhhhhhhhhlll.',
      '.dhhhhhhhhhhhhhhgl',
      'dhhh..............',
      'dd................',
    ],
    X, Y - 4, JC_HAIR,
  )
  let jan = p.svg() + hr.svg()

  // eyes: closed (sipping), looking up (gazing), wide and bright (it dawns on her), blinks
  const eyeSkin = (cols: number[]) => {
    const e = new Pix()
    cols.forEach(c => e.rect(X + c, Y + 2, 2, 3, k.skin))
    return e
  }
  const closed = eyeSkin([6, 12])
  closed.rect(X + 4, Y + 3, 2, 1, EYE_HD).set(X + 3, Y + 2, EYE_HD)
  closed.rect(X + 10, Y + 3, 2, 1, EYE_HD).set(X + 9, Y + 2, EYE_HD)
  const gaze = new Pix()
  for (const e of [6, 12]) gaze.rect(X + e, Y + 4, 2, 1, k.skin).rect(X + e, Y + 1, 2, 1, EYE_HD)
  const lit = new Pix()
  for (const e of [6, 12]) lit.set(X + e, Y + 2, '#ffffff').set(X + e + 1, Y + 3, '#3a2a5a').rect(X + e, Y + 1, 2, 1, EYE_HD)
  const lids = eyeSkin([6, 12])
  for (const e of [6, 12]) lids.rect(X + e, Y + 1, 2, 1, k.skin)

  const half = eyeSkin([])
  for (const e of [6, 12]) half.rect(X + e, Y + 2, 2, 2, k.skin)
  jan += shown(half.svg(), tHalf, dur)
  jan += shown(closed.svg(), tClosed, dur)
  jan += shown(gaze.svg(), tGaze, dur)
  jan += shown(lit.svg(), tLit, dur)
  jan += shown(lids.svg(), tBlink, dur)

  // left claw: the mug at her side, halfway up, or at her lips
  const mugAt = (mx: number, my: number) => new Pix().rows(jcMugRows, mx, my, jcMugPal)
  const steam = (mx: number, my: number, n: number) => {
    let o = ''
    for (let i = 0; i < n; i++) {
      const d = per([7, 6, 5][i])
      o += `<rect x="${(mx + 3 + (i % 2)) * Q}" y="${(my - 1) * Q}" width="${Q}" height="${Q * 2}" fill="#e9e2f2" opacity="0"><animateMotion path="M0 0 q ${i % 2 ? 4 : -4} -6 0 -11 t ${i % 2 ? 3 : -3} -10" dur="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0.6;0" dur="${d}s" repeatCount="indefinite"/></rect>`
    }
    return o
  }
  // at her side
  const side = new Pix().rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  const m1x = X - 9, m1y = Y + 2
  const side2 = mugAt(m1x, m1y)
  side2.rect(X - 4, Y + 4, 1, 2, k.skin).set(X - 4, Y + 6, k.shade).rect(X - 6, Y + 7, 3, 1, k.skin).set(X - 6, Y + 7, k.light)
  // in between: the mug at (mx, my), the claw under it, a forearm back to the shoulder
  const between = (mx: number, my: number) => {
    const q = new Pix()
    q.rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
    const fx = mx + 3, fy = my + 5
    const n = Math.max(Math.abs(X - 4 - fx), Math.abs(Y + 4 - fy))
    for (let i = 0; i <= n; i++) {
      const xx = Math.round(fx + ((X - 4 - fx) * i) / Math.max(1, n))
      const yy = Math.round(fy + ((Y + 4 - fy) * i) / Math.max(1, n))
      q.rect(xx, yy, 2, 2, k.skin).set(xx, yy + 1, k.shade)
    }
    const m = mugAt(mx, my)
    m.rect(mx + 2, my + 5, 3, 1, k.skin).set(mx + 2, my + 5, k.light)
    return q.svg() + m.svg()
  }
  const steps: [number, number][] = [[m1x, m1y - 1], [m1x + 1, m1y - 2], [m1x + 1, m1y - 3], [m1x + 2, m1y - 4]]
  // raised to her face
  const up = new Pix()
  up.rect(X - 3, Y + 4, 3, 2, k.skin).rect(X - 3, Y + 6, 3, 1, k.shade)
  up.rect(X - 4, Y + 1, 2, 5, k.skin).rect(X - 4, Y + 1, 1, 5, k.shade)
  const m2x = X - 6, m2y = Y - 3
  const upSvg = up.svg() + mugAt(m2x, m2y).rect(m2x + 2, m2y + 5, 3, 1, k.skin).set(m2x + 2, m2y + 5, k.light).svg()
  jan += shown(side.svg() + side2.svg(), tMugSide, dur)
  steps.forEach(([mx, my], i) => (jan += shown(between(mx, my), tMugStep[i], dur)))
  jan += shown(upSvg, tMugUp, dur)
  // one set of steam wisps, gliding along with the mug
  const off = (dx: number, dy: number) => `${dx * Q} ${dy * Q}`
  const sKeys: [number, string][] = [[0, off(0, 0)]]
  for (const [a, dir] of [[1.8, 1], [5.2, -1], [13.6, 1], [15.4, -1]] as [number, number][]) {
    const path = dir > 0 ? [off(0, 0), off(m2x - m1x, m2y - m1y)] : [off(m2x - m1x, m2y - m1y), off(0, 0)]
    const len = dir > 0 ? 0.5 : 0.4
    sKeys.push([a, path[0]], [a + len, path[1]])
  }
  sKeys.push([D, off(0, 0)])
  jan += `<g>${steam(m1x, m1y, 3)}<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${D}s" repeatCount="indefinite" values="${sKeys.map(([, v]) => v).join(';')}" keyTimes="${kt(sKeys.map(([t]) => t))}" keySplines="${sKeys.slice(1).map(() => '0.4 0 0.2 1').join(';')}"/></g>`

  // right claw: at rest, half raised, or pointing at the nebula
  jan += shown(armRestHD(k, X, Y, 'right'), complement(merge([...tPoint, ...tArmMid]), dur), dur)
  const ax = X + 18
  const am = new Pix()
  for (let i = 0; i < 3; i++) {
    const yy = Y + 4 - i
    am.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade).set(ax + i * 2 + 2, yy, k.rim)
  }
  am.rect(ax + 6, Y + 1, 2, 2, k.skin).set(ax + 7, Y + 1, k.light).set(ax + 6, Y + 3, k.shade)
  void am
  const reach = (n: number) => {
    const r = new Pix()
    for (let i = 0; i < n; i++) {
      const yy = Y + 4 - i * 2
      r.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade).set(ax + i * 2 + 2, yy, k.rim)
    }
    const ex = ax + n * 2, ey = Y + 4 - n * 2
    r.rect(ex, ey, 2, 2, k.skin).set(ex + 1, ey, k.light).set(ex, ey + 2, k.shade).set(ex + 2, ey - 1, k.skin)
    return r.svg()
  }
  ;[2, 3, 4].forEach((n, i) => (jan += shown(reach(n), tReach[i], dur)))
  const pt = new Pix()
  // a long diagonal arm reaching up toward the nebula
  for (let i = 0; i < 5; i++) {
    const yy = Y + 4 - i * 2
    pt.rect(ax + i * 2, yy, 3, 2, k.skin).rect(ax + i * 2, yy + 2, 2, 1, k.shade)
    pt.set(ax + i * 2 + 2, yy, k.rim)
  }
  // open pincer at the end, jaws toward the screen
  const cx = ax + 10, cy = Y - 6
  pt.rect(cx, cy, 3, 3, k.skin).set(cx, cy + 2, k.shade).set(cx + 2, cy, k.light)
  pt.rect(cx, cy - 3, 1, 3, k.skin).set(cx, cy - 3, k.light) // upper jaw
  pt.rect(cx + 3, cy + 1, 3, 1, k.skin).set(cx + 5, cy + 1, k.light).rect(cx + 3, cy + 2, 3, 1, k.shade) // lower jaw
  jan += shown(pt.svg(), tPoint, dur)

  // the idea dawning: a small, soft local sparkle by her head (rises 0.5 s, fades 1.1 s)
  const burst = new Pix()
  for (const [bx, by] of [[X + 20, Y - 6], [X + 15, Y - 9]] as [number, number][]) {
    burst.set(bx, by, '#fff6dc').set(bx - 1, by, '#ffe9a8').set(bx + 1, by, '#ffe9a8').set(bx, by - 1, '#ffe9a8').set(bx, by + 1, '#ffe9a8')
  }
  const gl = `<circle cx="${(X + 18) * Q}" cy="${(Y - 7) * Q}" r="10" fill="url(#jcGleam)"/>`
  s += `<g opacity="0">${gl}${burst.svg()}<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt([0, 8.0, 8.5, 9.0, 10.1, D])}" dur="${D}s" repeatCount="indefinite"/></g>`
  // a tiny second glint, a beat later
  const g2 = new Pix().set(X + 23, Y - 10, '#fff6dc').set(X + 22, Y - 10, '#ffe9a8').set(X + 24, Y - 10, '#ffe9a8').set(X + 23, Y - 11, '#ffe9a8').set(X + 23, Y - 9, '#ffe9a8')
  s += `<g opacity="0">${g2.svg()}<animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="${kt([0, 8.4, 8.9, 9.9, D])}" dur="${D}s" repeatCount="indefinite"/></g>`

  // the determined hop, then a small nod of a hop
  const hopV = ['0 0', '0 0', `0 ${-2 * Q}`, `0 ${-2 * Q}`, '0 0', '0 0', `0 ${-Q}`, `0 ${-Q}`, '0 0', '0 0']
  const hopT = [0, 11.45, 11.65, 11.82, 12.0, 12.25, 12.38, 12.45, 12.6, D]
  const hopS = ['0 0 1 1', '0.2 0.7 0.4 1', '0 0 1 1', '0.6 0 0.8 0.3', '0 0 1 1', '0.2 0.7 0.4 1', '0 0 1 1', '0.6 0 0.8 0.3', '0 0 1 1']
  const hop = `<animateTransform attributeName="transform" type="translate" calcMode="spline" dur="${D}s" repeatCount="indefinite" values="${hopV.join(';')}" keyTimes="${kt(hopT)}" keySplines="${hopS.join(';')}"/>`
  s += `<g>${jan}${hop}</g>`
  return s
}
