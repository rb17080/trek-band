// Renders composition.html frame by frame: headless Edge, driven over the DevTools protocol.
// Every frame is the SVG timeline paused and set to an exact time, so motion is perfectly even.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const [page, outDir, fpsArg, only] = process.argv.slice(2)
const FPS = Number(fpsArg || 24)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9339
fs.mkdirSync(outDir, { recursive: true })

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'trek-video-'))
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page')
  } catch {}
}
if (!target) throw new Error('Edge did not start')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', m => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method) events.push(msg.method)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, msg => (msg.error ? reject(new Error(method + ': ' + msg.error.message)) : resolve(msg.result)))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'file:///' + path.resolve(page).replace(/\\/g, '/') })
for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100)
await evalJs('document.fonts.ready.then(() => document.fonts.size)')
const dur = await evalJs(`(() => { const s = document.getElementById('video'); s.pauseAnimations(); s.setCurrentTime(0); return 37 })()`)

const total = Math.round(dur * FPS)
const frames = only ? only.split(',').map(t => Math.round(Number(t) * FPS)) : Array.from({ length: total }, (_, i) => i)
const started = Date.now()
for (const f of frames) {
  const t = f / FPS
  await evalJs(`document.getElementById('video').setCurrentTime(${t}); 0`)
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 } })
  fs.writeFileSync(path.join(outDir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(data, 'base64'))
}
console.log(`rendered ${frames.length} frames in ${((Date.now() - started) / 1000).toFixed(1)} s`)
ws.close()
edge.kill()
