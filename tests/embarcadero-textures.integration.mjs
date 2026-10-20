// Run against a local Vite server: node tests/embarcadero-textures.integration.mjs http://127.0.0.1:18911
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = new URL(process.argv[2]);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Use a local disposable server');
const url = new URL('/experiments/embarcadero/', base).href;
const browser = await chromium.launch({ headless: true });
try {
  const slow = await browser.newPage();
  let release, observed;
  const gate = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { observed = resolve; });
  await slow.route('**/embarcadero/textures/palm-frond.png', async route => {
    observed();
    await gate;
    await route.continue();
  });
  await slow.goto(url, { waitUntil: 'domcontentloaded' });
  await requested;
  await slow.waitForTimeout(600);
  assert.equal(await slow.locator('#loading').count(), 1, 'loading stays visible while the frond is pending');
  release();
  await slow.locator('#loading').waitFor({ state: 'detached', timeout: 30000 });
  console.log('Delayed frond: loading remains until the texture finishes.');
  await slow.close();

  const failed = await browser.newPage();
  await failed.route('**/embarcadero/textures/palm-frond.png', route => route.abort());
  await failed.goto(url, { waitUntil: 'domcontentloaded' });
  await failed.locator('#loading').waitFor({ state: 'detached', timeout: 30000 });
  await failed.getByText('Some waterfront textures could not load; using simpler materials.').waitFor();
  await failed.waitForFunction(() => typeof window.__embarcaderoSample === 'function');
  await failed.keyboard.down('w');
  await failed.waitForFunction(() => window.__embarcaderoSample().simulationSpeed > 0, null, { timeout: 5000 });
  await failed.keyboard.up('w');
  console.log('Failed frond: a fallback notice appears and the car can still drive.');
  await failed.close();

  const stalled = await browser.newPage();
  let releaseStalled, observedStalled;
  const stalledGate = new Promise(resolve => { releaseStalled = resolve; });
  const stalledRequest = new Promise(resolve => { observedStalled = resolve; });
  await stalled.route('**/embarcadero/textures/palm-frond.png', async route => {
    observedStalled();
    await stalledGate;
    await route.continue();
  });
  await stalled.goto(url, { waitUntil: 'domcontentloaded' });
  await stalledRequest;
  await stalled.locator('#loading').waitFor({ state: 'detached', timeout: 30000 });
  await stalled.getByText('Some waterfront textures could not load; using simpler materials.').waitFor();
  await stalled.waitForFunction(() => typeof window.__embarcaderoSample === 'function');
  await stalled.keyboard.down('w');
  await stalled.waitForFunction(() => window.__embarcaderoSample().simulationSpeed > 0, null, { timeout: 5000 });
  await stalled.keyboard.up('w');
  const lateResponse = stalled.waitForResponse(response => response.url().endsWith('/embarcadero/textures/palm-frond.png'));
  releaseStalled();
  assert.equal((await lateResponse).status(), 200);
  console.log('Stalled frond: the timeout supplies a fallback, the car can drive, and the late image can arrive.');
  await stalled.close();
} finally {
  await browser.close();
}
