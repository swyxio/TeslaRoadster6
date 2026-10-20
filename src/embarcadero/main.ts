import * as T from 'three';
import { buildEmbarcadero } from './world';
import { createEmbarcaderoLighting } from './lighting';
import { createEmbarcaderoCar } from './car';
import { emptyControls, initialCar, stepCar, type CarState, type Controls } from './simulation';
import { CURRENT_RELEASE } from '../../content/version';
import './style.css';

document.title = `Embarcadero demo · Tesland ${CURRENT_RELEASE.label}`;
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div class="scene" id="scene" aria-label="Three-dimensional Embarcadero driving scene"></div>
  <div class="loading" id="loading" role="status">Loading the waterfront and Roadster…</div>
  <header class="topbar"><div><a href="/visual-lab/" class="brand">← TESLAND <span>/ VISUAL LAB</span></a><div class="caption">EMBARCADERO · GOLDEN HOUR · ${CURRENT_RELEASE.label}</div></div>
    <div class="top-actions"><button id="compare" aria-expanded="false">Compare concept</button><button id="stats-toggle" aria-expanded="false">Performance</button><button id="reset">Reset</button></div>
  </header>
  <div class="description"><strong>Drive the waterfront.</strong><span>Standalone visual prototype · offline · infinite air</span><button id="self-drive" aria-pressed="false">Start self-drive</button><span><a href="https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8" target="_blank" rel="noopener noreferrer">Roadster 2020 model</a> by metarex.4d · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY</a> · modified</span></div>
  <div class="readout"><span>ROADSTER · ROCKET</span><div><strong id="speed">0</strong> <small>KM/H</small></div><span id="altitude">GROUND</span></div>
  <div class="desktop-help">W A S D drive <i>·</i> SPACE fly <i>·</i> SHIFT boost <i>·</i> B brake <i>·</i> Q / E roll <i>·</i> R reset <i>·</i> H hide HUD</div>
  <p class="notice" role="status" id="notice"></p>
  <aside id="stats" class="stats" hidden><strong>LIVE FRAME TIMING</strong><p id="stats-text">Measuring…</p><small>Browser frame intervals; not a GPU or device benchmark.</small></aside>
  <section class="touch-controls" aria-label="Driving controls">
    <div class="touch-left"><button data-control="left" aria-label="Steer left">◀</button><button data-control="right" aria-label="Steer right">▶</button><button data-control="reverse">REV</button><button data-control="brake">BRAKE</button></div>
    <div class="touch-right"><button data-control="boost">BOOST</button><button data-control="lift">FLY ↑</button><button data-control="throttle" class="drive">DRIVE ↑</button></div>
  </section>
  <aside id="comparison" class="comparison" hidden><div class="dialog-head"><div><span>VISUAL TARGET · AI ILLUSTRATION</span><h1>Concept reference</h1></div><button id="close-compare" aria-label="Close comparison">×</button></div><p>The playable scene stays live alongside this illustration.</p><img src="/visual-lab/embarcadero.webp" loading="lazy" alt="Golden-hour concept of a white Roadster driving beside the Ferry Building and Bay Bridge" /></aside>`;

const sceneElement = document.querySelector<HTMLDivElement>('#scene')!;
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
sceneElement.appendChild(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(52, 1, 0.1, 3000);
const world = buildEmbarcadero(scene);
const lighting = createEmbarcaderoLighting(scene, renderer);
const loading = document.querySelector<HTMLElement>('#loading')!;
let car: T.Group;
let missingTextures: string[];
try {
  [car, , missingTextures] = await Promise.all([createEmbarcaderoCar(), lighting.ready, world.ready]);
  loading.remove();
} catch (error) {
  loading.textContent = 'The waterfront assets could not be loaded. Please refresh to try again.';
  throw error;
}
scene.add(car);
const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
  .map(name => car.getObjectByName(name)).filter((wheel): wheel is T.Object3D => Boolean(wheel));
const exhaust = new T.InstancedMesh(
  new T.ConeGeometry(0.075, 0.38, 8),
  new T.MeshBasicMaterial({ color: 0xffc18a, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }),
  4,
);
const exhaustTransform = new T.Object3D();
for (const [index, x] of [-0.48, -0.16, 0.16, 0.48].entries()) {
  exhaustTransform.position.set(x, 0.34, (car.userData.exhaustRear as number) + 0.20);
  exhaustTransform.rotation.x = Math.PI / 2;
  exhaustTransform.updateMatrix();
  exhaust.setMatrixAt(index, exhaustTransform.matrix);
}
exhaust.visible = false;
car.add(exhaust);

const state: CarState = initialCar();
let selfDriving = new URLSearchParams(location.search).get('autodrive') === '1';
const selfDriveButton = document.querySelector<HTMLButtonElement>('#self-drive')!;
function setSelfDriving(on: boolean) {
  selfDriving = on;
  selfDriveButton.textContent = on ? 'Self-drive on · take over anytime' : 'Start self-drive';
  selfDriveButton.setAttribute('aria-pressed', String(on));
}
setSelfDriving(selfDriving);
selfDriveButton.onclick = () => setSelfDriving(!selfDriving);
let previous: CarState = { ...state };
const visualPosition = new T.Vector3();
const desiredCamera = new T.Vector3();
const desiredLook = new T.Vector3();
const cameraLook = new T.Vector3();
const lastVisualPosition = new T.Vector3();
const cameraOffset = new T.Vector3();
const lookOffset = new T.Vector3();
let cameraReady = false;
let previousTime = performance.now();
let accumulator = 0;
const fixedStep = 1 / 60;
let noticeTimer = 0;
const notice = document.querySelector<HTMLElement>('#notice')!;
function showNotice(message: string) {
  notice.textContent = message;
  notice.classList.add('visible');
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => notice.classList.remove('visible'), 3000);
}
if (missingTextures.length) {
  console.warn('Embarcadero textures unavailable:', missingTextures);
  showNotice('Some waterfront textures could not load; using simpler materials.');
}
function reset(message?: string) {
  Object.assign(state, initialCar());
  previous = { ...state };
  accumulator = 0;
  cameraReady = false;
  if (message) showNotice(message);
}
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => { clearInputs(); reset('Back at the waterfront.'); };

const keyControls: Record<string, keyof Controls> = {
  w: 'throttle', arrowup: 'throttle', s: 'reverse', arrowdown: 'reverse',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
  ' ': 'lift', shift: 'boost', b: 'brake', q: 'rollLeft', e: 'rollRight',
};
const keys = new Set<string>();
const touches = new Map<number, keyof Controls>();
function clearInputs() { keys.clear(); touches.clear(); document.querySelectorAll('.touch-controls button').forEach(button => button.classList.remove('pressed')); }
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key in keyControls) { event.preventDefault(); keys.add(key); }
  if (!event.repeat && key === 'r') reset('Back at the waterfront.');
  if (!event.repeat && key === 'h') document.body.classList.toggle('hud-hidden');
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', clearInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInputs(); });
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
  const control = button.dataset.control as keyof Controls;
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); button.setPointerCapture(event.pointerId); touches.set(event.pointerId, control); button.classList.add('pressed');
  });
  const release = (event: PointerEvent) => { touches.delete(event.pointerId); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
function readControls(): Controls {
  const controls = emptyControls();
  for (const key of keys) { const control = keyControls[key]; if (control) controls[control] = true; }
  for (const control of touches.values()) controls[control] = true;
  return controls;
}
function selfDriveControls(): Controls {
  const controls = emptyControls();
  // A clear lane through this small, independent waterfront scene; this is
  // local demo steering, not the multiplayer game's navigation system.
  const desiredYaw = Math.max(-0.65, Math.min(0.65, -Math.atan2(2.15 - state.x, 30)));
  const error = Math.atan2(Math.sin(desiredYaw - state.yaw), Math.cos(desiredYaw - state.yaw));
  controls.left = error > 0.035;
  controls.right = error < -0.035;
  controls.throttle = state.z > -405;
  controls.brake = !controls.throttle;
  if (state.z <= -405 && Math.abs(state.speed) < 0.5) {
    setSelfDriving(false);
    showNotice('End of the waterfront. Reset to drive it again.');
  }
  return controls;
}
const comparison = document.querySelector<HTMLElement>('#comparison')!;
const compareButton = document.querySelector<HTMLButtonElement>('#compare')!;
function setComparison(open: boolean) {
  comparison.hidden = !open;
  compareButton.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('comparing', open);
  resize();
}
compareButton.onclick = () => setComparison(comparison.hidden);
document.querySelector<HTMLButtonElement>('#close-compare')!.onclick = () => setComparison(false);
window.addEventListener('keydown', event => { if (event.key === 'Escape') setComparison(false); });
const stats = document.querySelector<HTMLElement>('#stats')!;
const statsButton = document.querySelector<HTMLButtonElement>('#stats-toggle')!;
statsButton.onclick = () => { stats.hidden = !stats.hidden; statsButton.setAttribute('aria-expanded', String(!stats.hidden)); };
function resize() {
  const width = sceneElement.clientWidth, height = sceneElement.clientHeight;
  camera.aspect = width / height;
  camera.fov = width < 700 && height > width ? 75 : 52;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener('resize', resize);
resize();

const frameTimes: number[] = [];
let lastStats = 0;
let lastSpeed = 0;
// An opt-in recorder can sample the actual displayed pose without scraping HUD text.
Object.assign(window, { __embarcaderoSample: () => ({
  x: visualPosition.x, y: visualPosition.y, z: visualPosition.z, yaw: car.rotation.y,
  simulationSpeed: state.speed, cameraX: camera.position.x, cameraY: camera.position.y, cameraZ: camera.position.z,
  drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
}) });
const interpolate = (a: number, b: number, amount: number) => a + (b - a) * amount;
function frame(now: number) {
  const frameMs = now - previousTime;
  previousTime = now;
  // Bound catch-up after a suspended tab; never tie simulation time to packets.
  const dt = Math.min(Math.max(frameMs / 1000, 0), 0.1);
  accumulator = Math.min(accumulator + dt, 0.1);
  let input = readControls();
  if (selfDriving && Object.values(input).some(Boolean)) {
    setSelfDriving(false);
    showNotice('You’re driving.');
  }
  if (selfDriving) input = selfDriveControls();
  exhaust.visible = input.lift || input.boost;
  while (accumulator >= fixedStep) {
    previous = { ...state };
    const result = stepCar(state, input, fixedStep, world.colliders);
    if (result === 'water') { reset('The bay is water. Returning to the waterfront.'); break; }
    accumulator -= fixedStep;
  }
  const alpha = accumulator / fixedStep;
  const yaw = interpolate(previous.yaw, state.yaw, alpha);
  visualPosition.set(interpolate(previous.x, state.x, alpha), interpolate(previous.y, state.y, alpha), interpolate(previous.z, state.z, alpha));
  car.position.copy(visualPosition);
  car.rotation.set(0, yaw, interpolate(previous.roll, state.roll, alpha), 'YXZ');
  for (const wheel of wheels) wheel.rotation.x += state.speed * dt / 0.35;
  // Low rear-left perspective, then follow smoothly in real time, not per packet.
  cameraOffset.set(-3.35, 1.9, 5.3).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw);
  desiredCamera.copy(visualPosition).add(cameraOffset);
  lookOffset.set(4.8, 1.0, -8).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw);
  desiredLook.copy(visualPosition).add(lookOffset);
  if (!cameraReady) { camera.position.copy(desiredCamera); cameraLook.copy(desiredLook); cameraReady = true; }
  else {
    // Keep the car framed while accelerating; ease only changes in orientation.
    const translation = cameraOffset.copy(visualPosition).sub(lastVisualPosition);
    camera.position.add(translation);
    cameraLook.add(translation);
  }
  lastVisualPosition.copy(visualPosition);
  const follow = 1 - Math.exp(-7 * dt);
  camera.position.lerp(desiredCamera, follow);
  cameraLook.lerp(desiredLook, follow);
  camera.lookAt(cameraLook);
  world.update(camera);
  lighting.update(visualPosition, dt);
  renderer.render(scene, camera);
  if (frameMs > 0 && frameMs < 1000) { frameTimes.push(frameMs); if (frameTimes.length > 240) frameTimes.shift(); }
  if (now - lastSpeed > 120) {
    document.querySelector<HTMLElement>('#speed')!.textContent = String(Math.round(Math.abs(state.speed) * 3.6));
    document.querySelector<HTMLElement>('#altitude')!.textContent = state.y > 0.1 ? `${Math.round(state.y)} M ALT · FLYING` : 'GROUND';
    lastSpeed = now;
  }
  if (!stats.hidden && now - lastStats > 500 && frameTimes.length) {
    const sorted = [...frameTimes].sort((a,b) => a-b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const average = frameTimes.reduce((a,b) => a+b,0) / frameTimes.length;
    document.querySelector<HTMLElement>('#stats-text')!.textContent = `${(1000 / average).toFixed(0)} FPS avg · ${p95.toFixed(1)} ms p95\n${renderer.info.render.calls} draw calls · ${Math.round(renderer.info.render.triangles / 1000)}k triangles · ${renderer.getPixelRatio()}× DPR`;
    lastStats = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
