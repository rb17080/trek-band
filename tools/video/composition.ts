// The README video, as one SVG timeline. Concatenated after the plugin's art section
// (see build.sh), so it draws the same scenes and the same Clawd the band does.

const VW = 1280
const VH = 720
const DUR = 28 // seconds

const INK = '#140f1f'
const LILAC = '#c9a7ff'
const TEXT = '#f3ecff'
const DIM = '#a995c9'
const EASE = '0.45 0 0.2 1'

// A track over the whole video: [[seconds, value], ...], eased between points, held at the ends
function track(attr: string, pts: [number, string | number][], transform?: string) {
  const all = [...pts]
  if (all[0][0] > 0) all.unshift([0, all[0][1]])
  if (all[all.length - 1][0] < DUR) all.push([DUR, all[all.length - 1][1]])
  const keyTimes = all.map(p => +(p[0] / DUR).toFixed(5)).join(';')
  const values = all.map(p => p[1]).join(';')
  const splines = all.slice(1).map(() => EASE).join(';')
  const tag = transform ? 'animateTransform' : 'animate'
  const type = transform ? ` type="${transform}"` : ''
  return `<${tag} attributeName="${attr}"${type} calcMode="spline" keySplines="${splines}" keyTimes="${keyTimes}" values="${values}" dur="${DUR}s" fill="freeze"/>`
}

const fadeIn = (a: number, b: number, c: number, d: number) =>
  c >= DUR ? track('opacity', [[a, 0], [b, 1]]) : track('opacity', [[a, 0], [b, 1], [c, 1], [d, 0]])
const rise = (a: number, b: number, dy = 18) => track('transform', [[a, `0 ${dy}`], [b, '0 0']], 'translate')

const text = (x: number, y: number, s: string, size: number, fill: string, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`
const display = (x: number, y: number, s: string, size: number, fill = TEXT, spacing = 4, anchor = 'start') =>
  text(x, y, s, size, fill, `font-family="Antonio, sans-serif" font-weight="700" letter-spacing="${spacing}" text-anchor="${anchor}"`)
const body = (x: number, y: number, s: string, size: number, fill = DIM, anchor = 'start') =>
  text(x, y, s, size, fill, `font-family="Segoe UI, system-ui, sans-serif" text-anchor="${anchor}"`)

// A scene from the band, placed and scaled
function sceneAt(index: number, x: number, y: number, scale: number) {
  return sceneSvg(index).replace(
    /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="180" height="96"/,
    `<svg x="${x}" y="${y}" width="${180 * scale}" height="${96 * scale}"`,
  )
}

// Clawd as Picard, big, waving
function bigClawd(x: number, y: number, scale: number, wave: [number, number][]) {
  const crab = crabHD(PICARD_HD, 3, 10, 'right', DUR, { left: [], right: wave }, [], 5.3, p => {
    p.rect(3 + 12, 16, 2, 2, '#e8c547').set(3 + 12, 16, '#fff3b0')
  })
  return `<g transform="translate(${x} ${y}) scale(${scale})">${crab}</g>`
}

function starfield() {
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  let dots = ''
  for (let i = 0; i < 170; i++) {
    const x = Math.floor(rnd() * (VW + 300))
    const y = Math.floor(rnd() * VH)
    const s = rnd() < 0.85 ? 2 : 3
    dots += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#cdbaf0" opacity="${(0.12 + rnd() * 0.45).toFixed(2)}"/>`
  }
  return `<g>${dots}<animateTransform attributeName="transform" type="translate" values="0 0;-300 0" dur="${DUR}s" fill="freeze"/></g>`
}

// ---------- A: title ----------
function segTitle() {
  let s = `<g opacity="0">${fadeIn(0, 0.7, 3.6, 4.2)}`
  s += `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" dur="3.2s" repeatCount="indefinite"/>${bigClawd(520, 112, 5, [[1.5, 2.1], [2.5, 3.1]])}</g>`
  s += `<g opacity="0">${fadeIn(0.5, 1.3, 3.6, 4.2)}<g>${rise(0.5, 1.4)}${display(640, 470, 'TREK-BAND', 104, TEXT, 22, 'middle')}</g></g>`
  s += `<g opacity="0">${fadeIn(1.1, 1.9, 3.6, 4.2)}<g>${rise(1.1, 2.0, 12)}${body(640, 522, 'Star Trek, playing above your Claude Code prompt.', 26, DIM, 'middle')}</g></g>`
  return s + '</g>'
}

// ---------- B: the band in the app ----------
function ring(cx: number, cy: number, r: number, pct: number, icon: 'clock' | 'cal' | 'book' | 'ctx', a: number, b: number) {
  const circ = 2 * Math.PI * r
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#241a36" stroke="#3d2d58" stroke-width="4"/>`
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${LILAC}" stroke-width="4" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" stroke-dasharray="0 ${circ}">${track('stroke-dasharray', [[a, `0 ${circ}`], [b, `${(circ * pct) / 100} ${circ}`]])}</circle>`
  s +=
    icon === 'book'
      ? `<path d="M${cx} ${cy - 5}q-5 -3 -10 -1v13q5 -2 10 1zM${cx} ${cy - 5}q5 -3 10 -1v13q-5 -2 -10 1z" fill="none" stroke="${DIM}" stroke-width="2.2" stroke-linejoin="round"/>`
      : icon === 'ctx'
      ? `<path d="M${cx - 9} ${cy - 6}h18M${cx - 9} ${cy}h18M${cx - 9} ${cy + 6}h11" stroke="${DIM}" stroke-width="2.6" stroke-linecap="round"/>`
      : icon === 'clock'
      ? `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${DIM}" stroke-width="2.6"/><path d="M${cx} ${cy - 6}V${cy}l4 3" stroke="${DIM}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
      : `<rect x="${cx - 10}" y="${cy - 8}" width="20" height="18" rx="2.5" fill="none" stroke="${DIM}" stroke-width="2.6"/><path d="M${cx - 10} ${cy - 2}h20M${cx - 5} ${cy - 12}v5M${cx + 5} ${cy - 12}v5" stroke="${DIM}" stroke-width="2.6"/>`
  return s
}

function segProduct() {
  let s = `<g opacity="0">${fadeIn(3.9, 4.6, 9.6, 10.2)}`
  s += `<g opacity="0">${fadeIn(5.2, 5.9, 9.0, 9.6)}${display(640, 46, 'YOUR USAGE · A TINY THEATRE · RIGHT ABOVE THE PROMPT', 26, LILAC, 5, 'middle')}</g>`
  // zoom toward the band
  s += `<g transform="translate(640 470)"><g>${track('transform', [[7.2, '1'], [9.6, '1.34']], 'scale')}<g transform="translate(-640 -470)">`
  // the app window
  s += `<rect x="120" y="70" width="1040" height="610" rx="20" fill="#1b191f" stroke="#2e2a35"/>`
  s += `<circle cx="150" cy="96" r="6" fill="#3a3640"/><circle cx="172" cy="96" r="6" fill="#3a3640"/><circle cx="194" cy="96" r="6" fill="#3a3640"/>`
  const bar = (x: number, y: number, w: number, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="12" rx="6" fill="#2c2833" opacity="${o}"/>`
  s += bar(200, 140, 520) + bar(200, 164, 610) + bar(200, 188, 440) + bar(640, 236, 440, 0.7) + bar(200, 284, 580) + bar(200, 308, 500) + bar(200, 332, 360)
  // prompt and bottom bar
  s += `<rect x="200" y="540" width="880" height="62" rx="16" fill="#232027" stroke="#3a3542"/>`
  s += body(228, 579, 'Type / for commands', 20, '#7d7787')
  s += body(204, 640, '+   Auto', 18, '#8d8797')
  s += body(560, 640, '? for shortcuts', 18, '#7d7787')
  // the cache timer next to the model name, counting down from 59:41
  let clockDigits = ''
  for (let k = 0; k <= 12; k++) {
    const secs = 3581 - k
    const label = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
    clockDigits += `<g opacity="0">${track('opacity', [[5.8 + k - 0.001, 0], [5.8 + k, 1], [5.8 + k + 0.999, 1], [5.8 + k + 1, 0]])}${body(1024, 640, `Cache: ${label}`, 18, '#5fd38a', 'end')}</g>`
  }
  s += clockDigits
  s += body(1076, 640, 'Opus', 18, '#cfc8da', 'end')
  // the band rises from behind the prompt
  s += `<g opacity="0">${fadeIn(4.5, 5.2, 99, 100)}<g>${track('transform', [[4.5, '0 44'], [5.4, '0 0']], 'translate')}`
  s += `<rect x="200" y="416" width="880" height="112" rx="16" fill="#2a1f3d"/>`
  // four meters, two per row: session, weekly, Fable weekly, context window
  const meter = (x: number, y: number, pct: number, icon: 'clock' | 'cal' | 'book' | 'ctx', sub: string, a: number) =>
    ring(x, y, 17, pct, icon, a, a + 1.2) + display(x + 30, y + 9, `${pct}%`, 24, TEXT, 1) + body(x + 92, y + 8, sub, 19, DIM)
  s += meter(244, 446, 37, 'clock', '3:39', 5.4) + meter(474, 446, 53, 'cal', '1:07:49', 5.55)
  s += meter(244, 498, 18, 'book', '1:07:49', 5.7) + meter(474, 498, 26, 'ctx', '264k', 5.85)

  s += `<g>${sceneAt(0, 872, 418, 1.15)}</g>`
  s += `</g></g>`
  s += `</g></g></g>`
  return s + '</g>'
}

// ---------- C: every scene, in a grid ----------
function segGrid() {
  const cols = 5
  const scale = 1.1
  const w = 180 * scale
  const h = 96 * scale
  const gx = 14
  const gy = 12
  const x0 = (VW - (cols * w + (cols - 1) * gx)) / 2
  const y0 = 84
  let s = `<g opacity="0">${fadeIn(9.9, 10.6, 17.6, 18.2)}`
  s += `<g opacity="0">${fadeIn(10.2, 10.9, 17.6, 18.2)}${display(640, 58, `${SCENES.length} SCENES · TNG + VOYAGER`, 30, LILAC, 9, 'middle')}</g>`
  SCENES.forEach((_, i) => {
    const x = x0 + (i % cols) * (w + gx)
    const y = y0 + Math.floor(i / cols) * (h + gy)
    const a = 10.4 + Math.floor(i / cols) * 0.35
    s += `<g opacity="0">${fadeIn(a, a + 0.7, 17.6, 18.2)}`
    s += `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="9" fill="#3b2d58"/>`
    s += `<clipPath id="vclip${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/></clipPath>`
    s += `<g clip-path="url(#vclip${i})">${sceneAt(i, x, y, scale)}</g></g>`
  })
  return s + '</g>'
}

// ---------- D: what it does ----------
function segFeatures() {
  const rows: [string, string][] = [
    ['LIVE USAGE', 'session, weekly, per-model and context'],
    ['23 SCENES, 10 SECONDS EACH', 'shuffled, each plays once'],
    ['PROMPT CACHE TIMER', 'by the model name: green, then red once cold'],
    ['FLASH-CHECKED', 'no strobing, no white-outs, measured'],
  ]
  let s = `<g opacity="0">${fadeIn(17.6, 18.3, 21.4, 22.0)}`
  rows.forEach(([head, sub], i) => {
    const a = 18.1 + i * 0.25
    const y = 214 + i * 108
    s += `<g opacity="0">${fadeIn(a, a + 0.6, 21.4, 22.0)}<g>${rise(a, a + 0.7, 16)}`
    s += `<rect x="128" y="${y - 30}" width="10" height="10" fill="${LILAC}"/>`
    s += display(156, y - 16, head, 36, TEXT, 3)
    s += body(158, y + 20, sub, 22, DIM)
    s += '</g></g>'
  })
  s += `<rect x="797" y="243" width="${180 * 2.2 + 6}" height="${96 * 2.2 + 6}" rx="16" fill="#3b2d58"/>`
  s += `<clipPath id="vclipF"><rect x="800" y="246" width="${180 * 2.2}" height="${96 * 2.2}" rx="13"/></clipPath>`
  s += `<g clip-path="url(#vclipF)">${sceneAt(0, 800, 246, 2.2)}</g>`
  return s + '</g>'
}

// ---------- E: install ----------
function typed(x: number, y: number, s: string, a: number, b: number, id: string) {
  const w = s.length * 15.2 + 30
  return `<clipPath id="${id}"><rect x="${x - 4}" y="${y - 30}" width="0" height="44">${track('width', [[a, 0], [b, w]])}</rect></clipPath><g clip-path="url(#${id})">${text(x, y, s, 25, TEXT, 'font-family="JetBrains Mono, Consolas, monospace"')}</g>`
}

function segInstall() {
  let s = `<g opacity="0">${fadeIn(21.8, 22.5, 99, 100)}`
  s += `<g>${bigClawd(580, 40, 2.6, [[24.4, 25.0], [25.4, 26.0]])}</g>`
  s += display(640, 230, 'INSTALL', 40, LILAC, 12, 'middle')
  s += `<rect x="170" y="262" width="940" height="152" rx="16" fill="#0e0a15" stroke="#3b2d58"/>`
  s += text(202, 320, '›', 28, LILAC, 'font-family="JetBrains Mono, Consolas, monospace"')
  s += typed(230, 320, '/plugin marketplace add rb17080/trek-band', 22.6, 23.7, 'vtype1')
  s += text(202, 378, '›', 28, LILAC, 'font-family="JetBrains Mono, Consolas, monospace"')
  s += typed(230, 378, '/plugin install trek-band@trek-band', 23.9, 24.8, 'vtype2')
  s += `<g opacity="0">${fadeIn(25.0, 25.7, 99, 100)}`
  s += body(640, 470, 'Claude Code 2.1.286+  ·  desktop Code tab and terminal', 22, DIM, 'middle')
  s += display(640, 520, 'GITHUB.COM/RB17080/TREK-BAND', 26, TEXT, 6, 'middle')
  s += '</g>'
  return s + '</g>'
}

function composition() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" id="video" data-dur="${DUR}" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}">`
  s += `<defs><radialGradient id="vglow" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#2b1f45"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>`
  s += `<rect width="${VW}" height="${VH}" fill="url(#vglow)"/>`
  s += starfield()
  s += segTitle() + segProduct() + segGrid() + segFeatures() + segInstall()
  return s + '</svg>'
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Antonio:wght@400;700&family=JetBrains+Mono&display=block" rel="stylesheet">
<style>html,body{margin:0;background:${INK};overflow:hidden}</style></head>
<body>${composition()}</body></html>`
require('fs').writeFileSync(process.argv[2], html)
console.log('composition', html.length, 'chars,', DUR, 's')
