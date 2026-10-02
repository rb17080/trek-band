// The README video, as one SVG timeline. Concatenated after the plugin's art section
// (see build.sh), so it draws the same scenes and the same Clawd the band does.

const VW = 1280
const VH = 720
const DUR = 37 // seconds

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
function ring(cx: number, cy: number, r: number, pct: number, icon: 'clock' | 'cal', a: number, b: number) {
  const circ = 2 * Math.PI * r
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#241a36" stroke="#3d2d58" stroke-width="4"/>`
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${LILAC}" stroke-width="4" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" stroke-dasharray="0 ${circ}">${track('stroke-dasharray', [[a, `0 ${circ}`], [b, `${(circ * pct) / 100} ${circ}`]])}</circle>`
  s +=
    icon === 'clock'
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
  s += `<g opacity="0">${fadeIn(5.6, 6.2, 99, 100)}${body(560, 640, '? for shortcuts', 18, '#7d7787')}${body(708, 640, '59:41', 18, '#5fd38a')}</g>`
  s += body(1076, 640, 'Opus', 18, '#cfc8da', 'end')
  // the band rises from behind the prompt
  s += `<g opacity="0">${fadeIn(4.5, 5.2, 99, 100)}<g>${track('transform', [[4.5, '0 44'], [5.4, '0 0']], 'translate')}`
  s += `<rect x="200" y="416" width="880" height="112" rx="16" fill="#2a1f3d"/>`
  s += ring(250, 472, 22, 37, 'clock', 5.4, 6.6) + display(288, 482, '37%', 30, TEXT, 1) + body(362, 481, '4:39', 22, DIM)
  s += ring(476, 472, 22, 53, 'cal', 5.6, 6.8) + display(514, 482, '53%', 30, TEXT, 1) + body(588, 481, '1:18:03', 22, DIM)
  s += `<g>${sceneAt(0, 872, 418, 1.15)}</g>`
  s += `</g></g>`
  s += `</g></g></g>`
  return s + '</g>'
}

// ---------- C: all thirteen scenes ----------
const SERIES = ['TNG', 'TNG', 'VOYAGER', 'TNG · FILM', 'VOYAGER', 'TNG', 'VOYAGER', 'TNG', 'VOYAGER', 'TNG', 'TNG', 'TNG', 'TNG']

function segFilmstrip() {
  const start = 10.2
  const step = 1.3
  const gap = 600
  const scale = 3
  let s = `<g opacity="0">${fadeIn(9.9, 10.6, 26.4, 27.1)}`
  s += `<g opacity="0">${fadeIn(10.4, 11.1, 26.4, 27.1)}${display(640, 92, `${SCENES.length} SCENES · TNG + VOYAGER`, 34, LILAC, 9, 'middle')}</g>`
  // step from card to card: hold, then glide
  const pts: [number, string][] = [[start, '0 0']]
  for (let i = 1; i < SCENES.length; i++) {
    const t = start + i * step
    pts.push([t - 0.55, `${-(i - 1) * gap} 0`])
    pts.push([t, `${-i * gap} 0`])
  }
  s += `<g>${track('transform', pts, 'translate')}`
  SCENES.forEach((sc, i) => {
    const x = 640 - (180 * scale) / 2 + i * gap
    s += `<rect x="${x - 3}" y="${157}" width="${180 * scale + 6}" height="${96 * scale + 6}" rx="18" fill="#3b2d58"/>`
    s += `<clipPath id="vclip${i}"><rect x="${x}" y="160" width="${180 * scale}" height="${96 * scale}" rx="15"/></clipPath>`
    s += `<g clip-path="url(#vclip${i})">${sceneAt(i, x, 160, scale)}</g>`
    s += display(x + 90 * scale, 520, sc.name.toUpperCase(), 34, TEXT, 4, 'middle')
    s += display(x + 90 * scale, 556, SERIES[i] ?? '', 18, DIM, 6, 'middle')
  })
  s += '</g>'
  return s + '</g>'
}

// ---------- D: what it does ----------
function segFeatures() {
  const rows: [string, string][] = [
    ['LIVE 5-HOUR + WEEKLY LIMITS', 'rings turn amber at 75%, red at 90%'],
    ['13 STORIES, 17 SECONDS EACH', 'each plays twice, then the next scene'],
    ['PROMPT CACHE TIMER', 'green while the hour lasts, red once it has gone cold'],
    ['FLASH-CHECKED', 'every frame measured: no strobing, no white-outs'],
  ]
  let s = `<g opacity="0">${fadeIn(26.8, 27.5, 30.6, 31.2)}`
  rows.forEach(([head, sub], i) => {
    const a = 27.3 + i * 0.25
    const y = 214 + i * 108
    s += `<g opacity="0">${fadeIn(a, a + 0.6, 30.6, 31.2)}<g>${rise(a, a + 0.7, 16)}`
    s += `<rect x="128" y="${y - 30}" width="10" height="10" fill="${LILAC}"/>`
    s += display(156, y - 16, head, 36, TEXT, 3)
    s += body(158, y + 20, sub, 22, DIM)
    s += '</g></g>'
  })
  s += `<rect x="749" y="223" width="${180 * 2.4 + 6}" height="${96 * 2.4 + 6}" rx="16" fill="#3b2d58"/>`
  s += `<clipPath id="vclipF"><rect x="752" y="226" width="${180 * 2.4}" height="${96 * 2.4}" rx="13"/></clipPath>`
  s += `<g clip-path="url(#vclipF)">${sceneAt(7, 752, 226, 2.4)}</g>`
  return s + '</g>'
}

// ---------- E: install ----------
function typed(x: number, y: number, s: string, a: number, b: number, id: string) {
  const w = s.length * 15.2 + 30
  return `<clipPath id="${id}"><rect x="${x - 4}" y="${y - 30}" width="0" height="44">${track('width', [[a, 0], [b, w]])}</rect></clipPath><g clip-path="url(#${id})">${text(x, y, s, 25, TEXT, 'font-family="JetBrains Mono, Consolas, monospace"')}</g>`
}

function segInstall() {
  let s = `<g opacity="0">${fadeIn(31.0, 31.7, 99, 100)}`
  s += `<g>${bigClawd(580, 40, 2.6, [[33.6, 34.2], [34.6, 35.2]])}</g>`
  s += display(640, 230, 'INSTALL', 40, LILAC, 12, 'middle')
  s += `<rect x="170" y="262" width="940" height="152" rx="16" fill="#0e0a15" stroke="#3b2d58"/>`
  s += text(202, 320, '›', 28, LILAC, 'font-family="JetBrains Mono, Consolas, monospace"')
  s += typed(230, 320, '/plugin marketplace add rb17080/trek-band', 31.8, 32.9, 'vtype1')
  s += text(202, 378, '›', 28, LILAC, 'font-family="JetBrains Mono, Consolas, monospace"')
  s += typed(230, 378, '/plugin install trek-band@trek-band', 33.1, 34.0, 'vtype2')
  s += `<g opacity="0">${fadeIn(34.2, 34.9, 99, 100)}`
  s += body(640, 470, 'Claude Code 2.1.287+  ·  desktop Code tab and terminal', 22, DIM, 'middle')
  s += display(640, 520, 'GITHUB.COM/RB17080/TREK-BAND', 26, TEXT, 6, 'middle')
  s += '</g>'
  return s + '</g>'
}

function composition() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" id="video" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}">`
  s += `<defs><radialGradient id="vglow" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#2b1f45"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>`
  s += `<rect width="${VW}" height="${VH}" fill="url(#vglow)"/>`
  s += starfield()
  s += segTitle() + segProduct() + segFilmstrip() + segFeatures() + segInstall()
  return s + '</svg>'
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Antonio:wght@400;700&family=JetBrains+Mono&display=block" rel="stylesheet">
<style>html,body{margin:0;background:${INK};overflow:hidden}</style></head>
<body>${composition()}</body></html>`
require('fs').writeFileSync(process.argv[2], html)
console.log('composition', html.length, 'chars,', DUR, 's')
