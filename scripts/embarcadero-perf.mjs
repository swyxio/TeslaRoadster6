// A bounded, local-only visual-demo trace. Example:
// node scripts/embarcadero-perf.mjs http://127.0.0.1:18890/experiments/embarcadero/ /tmp/emb-trace.json
// An optional third argument supplies an alternate GLB, useful for paired asset checks.
import { chromium } from 'playwright';
import { writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const [url, output, alternateModel] = process.argv.slice(2);
if (!url || !output) throw new Error('Expected URL and output JSON path');
const modelPath = alternateModel || 'public/embarcadero/vehicle/roadster.glb';
const model = readFileSync(modelPath);
const modelSha256 = createHash('sha256').update(model).digest('hex');
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
if (alternateModel) await page.route('**/embarcadero/vehicle/roadster.glb', route => route.fulfill({ body: model, contentType: 'model/gltf-binary' }));
const loadStart = Date.now();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#loading', { state: 'detached', timeout: 30000 });
const readyAfterMs = Date.now() - loadStart;
await page.waitForTimeout(2500);
await page.keyboard.press('h');
await page.screenshot({ path: output.replace(/\.json$/, '-start.png') });
await page.keyboard.press('h');
const hardware = await page.evaluate(() => {
  const gl = document.querySelector('canvas')?.getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { userAgent: navigator.userAgent, renderer: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, devicePixelRatio: devicePixelRatio };
});
await page.evaluate(() => {
  window.__embTrace = { active: true, phase: 'acceleration', frames: [] };
  const sample = time => {
    if (!window.__embTrace.active) return;
    window.__embTrace.frames.push({ time, phase: window.__embTrace.phase, ...window.__embarcaderoSample() });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
await page.keyboard.down('w');
await page.waitForTimeout(2200);
await page.evaluate(() => { window.__embTrace.phase = 'turn'; });
await page.keyboard.down('d');
await page.waitForTimeout(450);
await page.keyboard.up('d');
await page.waitForTimeout(300);
await page.keyboard.down('a');
await page.waitForTimeout(450);
await page.keyboard.up('a');
await page.evaluate(() => { window.__embTrace.phase = 'straight'; });
await page.waitForTimeout(1200);
await page.keyboard.up('w');
await page.evaluate(() => { window.__embTrace.phase = 'flight'; });
await page.keyboard.down('Space');
await page.waitForTimeout(1800);
await page.keyboard.up('Space');
await page.evaluate(() => { window.__embTrace.phase = 'brake'; });
await page.keyboard.down('b');
await page.waitForTimeout(600);
await page.keyboard.up('b');
const frames = await page.evaluate(() => { window.__embTrace.active = false; return window.__embTrace.frames; });
await page.keyboard.press('h');
await page.screenshot({ path: output.replace(/\.json$/, '.png') });
const quantile = (values, p) => { const sorted = values.slice().sort((a,b) => a-b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length*p))] ?? null; };
const intervals = [], ratios = [], turnIntervals = [];
for (let i=1;i<frames.length;i++) {
  const a=frames[i-1], b=frames[i], ms=b.time-a.time;
  if (ms<=0 || ms>1000) continue;
  intervals.push(ms);
  if (b.phase==='turn') turnIntervals.push(ms);
  if ((b.phase==='straight' || b.phase==='turn') && Math.abs(b.simulationSpeed)>10 && a.phase===b.phase) {
    const distance=Math.hypot(b.x-a.x,b.z-a.z);
    ratios.push(distance/(ms/1000)/Math.abs(b.simulationSpeed));
  }
}
const summary = { frameCount: frames.length, medianFrameMs: quantile(intervals,.5), p95FrameMs: quantile(intervals,.95), turnP95FrameMs: quantile(turnIntervals,.95), displayedToSimulatedSpeedP05: quantile(ratios,.05), displayedToSimulatedSpeedP95: quantile(ratios,.95), medianDrawCalls: quantile(frames.map(f=>f.drawCalls),.5), medianTriangles: quantile(frames.map(f=>f.triangles),.5) };
const result = { date: new Date().toISOString(), url, modelSha256, modelBytes: (await stat(modelPath)).size, browser: browser.version(), hardware, host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, loadAverage: os.loadavg() }, viewport: { width: 1440, height: 900, dpr: 1 }, scenario: '2.2s W; 0.45s W+D; 0.3s W; 0.45s W+A; 1.2s W; 1.8s lift; 0.6s brake, after 2.5s warmup', readyAfterMs, errors, summary, frames };
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ modelBytes: result.modelBytes, readyAfterMs, hardware, errors, summary }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
