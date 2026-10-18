import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { assessCapture, clockBounds } from '../scripts/driving-continuity-capture.mjs';
import { continuityWorkerSource } from '../scripts/continuity-worker-template.mjs';

test('calibration preserves before/after request bounds and rejects missing clocks', () => {
  const first = { beforeBrowserMs: 100, afterBrowserMs: 104, authorityEpochMs: 1000 };
  const second = { beforeBrowserMs: 205, afterBrowserMs: 211, authorityEpochMs: 1100 };
  assert.deepEqual(clockBounds(first, second), { browserMinusAuthorityMinMs: -900, browserMinusAuthorityMaxMs: -889 });
  assert.equal(clockBounds(first, { ...second, afterBrowserMs: 200 }), null);
  assert.equal(clockBounds(first, {}), null);
});

test('local collector wraps the target tick and cannot invent collision or time proof', async () => {
  const source = continuityWorkerSource('/target/tests/fixtures/playtest-stage-worker.ts');
  const transformed = source.replace(/^import base,.*$/m, '').replace(/^export \{.*$/m, '')
    .replace('export class GameRoom', 'class GameRoom').replace('export default {', 'const worker = {') + '\nglobalThis.result = { GameRoom, worker };';
  const transpiled = ts.transpileModule(transformed, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
  assert.deepEqual((transpiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const car = { id: 'car', x: 0, y: 0, z: 0, yaw: 0, vx: 12, vy: 0, vz: 0, supportId: 'ground' };
  class StageRoom {
    ctx: any; env: any; world: any; sessions: any; tickCount = 0;
    constructor(ctx: any, env: any) {
      this.ctx = ctx; this.env = env; this.world = { entities: [], players: [{ id: 'driver', entityId: 'car' }], time: 0 };
      this.sessions = new Map([[{}, { id: 'driver', poseRevision: 4 }]]);
    }
    tick() { this.tickCount++; this.world.time += .05; car.x += .6; }
  }
  const context: any = { StageRoom, base: { fetch: () => new Response('game') }, URL, Response, TextEncoder, performance,
    crypto: { subtle: { timingSafeEqual: (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b)) } } };
  vm.runInNewContext(transpiled.outputText, context);
  const { GameRoom, worker } = context.result, token = 'a'.repeat(64);
  let room: any;
  const env = { PLAYTEST_TRACE_SECRET: token, ROOMS: { idFromName: (name: string) => name, get: () => room } };
  room = new GameRoom({ id: { equals: (id: string) => id === 'motion-abc' } }, env);
  room.world.entities.push(car);
  room.tick(); room.tick();
  const recorded = room.traceRead('motion-abc');
  assert.equal(recorded.ticks.length, 2); assert.equal(recorded.ticks[1].tick, 2);
  assert.equal(recorded.ticks[1].poseRevision, 4); assert.equal(recorded.ticks[1].contactReasons, null);
  assert.equal(recorded.collisionCoverage, 'unproven'); assert.equal(recorded.clock.continuityVerified, false);
  assert.equal(recorded.clock.maxTickTimingErrorMs, null);
  assert.equal(recorded.interpolation.verified, false); assert.equal(recorded.interpolation.maxPositionErrorM, null);
  assert.throws(() => room.traceRead('motion-other'), /Room identity mismatch/);
  const request = (host: string, auth?: string, origin?: string) => new Request(`http://${host}/api/continuity/read/motion-abc`, {
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(origin ? { Origin: origin } : {}) },
  });
  assert.equal((await worker.fetch(request('example.com', token), env, {})).status, 403);
  assert.equal((await worker.fetch(request('127.0.0.1'), env, {})).status, 401);
  assert.equal((await worker.fetch(request('127.0.0.1', token, 'https://example.com'), env, {})).status, 403);
  const ok = await worker.fetch(request('127.0.0.1', token), env, {});
  assert.equal(ok.status, 200); assert.equal((await ok.json()).ticks.length, 2);
});

test('grounded collector records traced contact and fails closed on missing boundaries', () => {
  const stage = `class StageRoom {
    ctx: any; env: any; world: any; sessions: any; tickCount = 0; mode = 'solid';
    constructor(ctx: any, env: any) {
      this.ctx=ctx; this.env=env; this.world={entities:[],players:[{id:'driver',entityId:'car'}],time:0};
      this.sessions=new Map([[{}, {id:'driver',poseRevision:4}]]);
    }
    tick() {
      const probe=(globalThis as any).__teslandContinuityProbe;
      if(this.mode!=='missing')probe.boundary(this.world,'before');
      if(this.mode==='solid')probe.contact(this.world.entities[0],'solid');
      if(this.mode==='air')this.world.entities[0].supportId=null;
      if(this.mode!=='missing')probe.boundary(this.world,'after');
      this.tickCount++; this.world.time+=.05;
    }
  }`;
  const transformed = stage + '\n' + continuityWorkerSource('/target/tests/fixtures/playtest-stage-worker.ts', { grounded: true })
    .replace(/^import base,.*$/m, '').replace(/^export \{.*$/m, '')
    .replace('export class GameRoom', 'class GameRoom').replace('export default {', 'const worker = {') + '\nglobalThis.result = { GameRoom };';
  const transpiled = ts.transpileModule(transformed, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
  assert.deepEqual((transpiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const context: any = { URL, Response, TextEncoder, performance, base: { fetch: () => new Response('game') } };
  vm.runInNewContext(transpiled.outputText, context);
  const token = 'a'.repeat(64), env = { PLAYTEST_TRACE_SECRET: token, ROOMS: { idFromName: (name: string) => name } };
  const room = new context.result.GameRoom({ id: { equals: (id: string) => id === 'motion-abc' } }, env);
  room.world.entities.push({ id: 'car', x: 0, y: 0, z: 0, yaw: 0, vx: 12, vy: 0, vz: 0, supportId: 'ground', inDome: false, loopAngle: null });
  const existingProbe = {}; context.__teslandContinuityProbe = existingProbe;
  room.tick(); assert.equal(context.__teslandContinuityProbe, existingProbe);
  room.mode = 'missing'; room.tick();
  room.mode = 'air'; room.tick();
  const recorded = room.traceRead('motion-abc');
  assert.equal(recorded.collisionCoverage, 'grounded-path-v1');
  assert.deepEqual(Array.from(recorded.ticks[0].contactReasons), ['solid']);
  assert.deepEqual(Array.from(recorded.ticks[1].contactReasons), ['missing-substep-boundary']);
  assert.deepEqual(Array.from(recorded.ticks[2].contactReasons), ['out-of-ground-scope']);
  assert.equal(recorded.clock.continuityVerified, false);
  assert.equal(recorded.clock.maxTickTimingErrorMs, null);
  assert.equal(recorded.interpolation.verified, false);
});

function completeCapture() {
  const input = (throttle: number, steer: number, brake = false) => ({ throttle, steer, brake });
  const controls = [input(1, 0), input(1, -1), input(1, 1), input(1, 0), input(0, 0, true), input(0, 0)]
    .map((c, i) => ({ ...c, atMs: [350, 4350, 5350, 6350, 8350, 9350][i] }));
  const events = [['keydown','KeyW'], ['keydown','KeyD'], ['keyup','KeyD'], ['keydown','KeyA'],
    ['keyup','KeyA'], ['keyup','KeyW'], ['keydown','Space'], ['keyup','Space']]
    .map(([type, code], i) => ({ type, code, atMs: [300, 4300, 5300, 5300, 6300, 8300, 8300, 9300][i], trusted: true }));
  const frames = Array.from({ length: 101 }, (_, i) => ({ atMs: 100 + i * 100, visual: { x: i * .2, y: 0, z: 0 } }));
  const states = Array.from({ length: 51 }, (_, i) => ({ atMs: 100 + i * 200, tick: i * 4, poseRevision: 1, car: { x: i * .4, y: 0, z: 0 } }));
  const ticks = Array.from({ length: 210 }, (_, tick) => ({ tick, poseRevision: 1, x: tick * .1, y: 0, z: 0, contactReasons: [] }));
  return {
    trace: { marks: [{ label: 'drive-start', atMs: 100 }, { label: 'drive-end', atMs: 10100 }], frames, states, controls, events,
      sent: controls.map(({ atMs, ...input }) => ({ atMs, input })), turnarounds: [{ receivedAtMs: 1000, elapsedMs: 100 }],
      errors: 0, dropped: { frames: 0, states: 0, sent: 0, controls: 0, events: 0, marks: 0, turnarounds: 0 } },
    authority: { ticks, complete: true, dropped: 0, failed: 0 }, profile: 'zero',
    routed: { overflow: false, sendsFailed: 0, droppedEvents: 0, gap: {}, events: [] as any[] },
    connections: 1, pageErrors: 0, consoleErrors: 0, networkErrors: 0, pending: 0, connectionAtEnd: 'LIVE', cleanAfter: true,
  };
}

test('scenario completeness rejects warm-up-only data, missing controls, no motion, or stale snapshots', () => {
  assert.equal(assessCapture(completeCapture()).complete, true);
  for (const mutate of [
    (x: ReturnType<typeof completeCapture>) => { x.trace.frames = x.trace.frames.map(f => ({ ...f, atMs: f.atMs - 20000 })); },
    (x: ReturnType<typeof completeCapture>) => { x.trace.frames.forEach(f => { f.visual.x = 0; }); },
    (x: ReturnType<typeof completeCapture>) => { x.trace.states.forEach(s => { s.car.x = 0; }); },
    (x: ReturnType<typeof completeCapture>) => { x.authority.ticks.forEach(t => { t.x = 0; }); },
    (x: ReturnType<typeof completeCapture>) => { x.trace.controls = []; },
    (x: ReturnType<typeof completeCapture>) => { x.trace.sent = []; },
    (x: ReturnType<typeof completeCapture>) => { x.trace.turnarounds = []; },
    (x: ReturnType<typeof completeCapture>) => { x.trace.states = x.trace.states.filter(s => s.atMs < 8000); },
    (x: ReturnType<typeof completeCapture>) => { x.trace.events[0].trusted = false; },
    (x: ReturnType<typeof completeCapture>) => { x.authority.failed = 1; },
  ]) {
    const candidate = completeCapture(); mutate(candidate);
    assert.equal(assessCapture(candidate).complete, false);
  }
});

test('scenario completeness requires authoritative motion during the initial W-only segment', () => {
  const candidate = completeCapture();
  // The car remains stationary through the first four seconds of W, then
  // moves far enough afterward to satisfy the whole-scenario checks.
  candidate.authority.ticks.forEach(t => { t.x = Math.max(0, t.tick - 84) * .2; });
  candidate.trace.states.forEach(s => { s.car.x = candidate.authority.ticks[s.tick].x; });
  const result = assessCapture(candidate);
  assert.ok(result.authorityDisplacementM > 10);
  assert.ok(result.stateDisplacementM > 10);
  assert.equal(result.firstStraightAuthorityDisplacementM, 0);
  assert.ok(result.invalid.includes('insufficient-first-straight-motion'));
  assert.equal(result.complete, false);

  const missingBoundary = completeCapture();
  missingBoundary.trace.states = missingBoundary.trace.states.filter(s => s.atMs < 300 || s.atMs > 1400);
  assert.ok(assessCapture(missingBoundary).invalid.includes('insufficient-first-straight-motion'));

  const wrongTick = completeCapture();
  wrongTick.trace.states.filter(s => s.atMs >= 300 && s.atMs < 4300).forEach(s => { s.poseRevision = 2; });
  assert.ok(assessCapture(wrongTick).invalid.includes('insufficient-first-straight-motion'));
});

test('scenario completeness rejects a trusted W release during the first straight segment', () => {
  const candidate = completeCapture();
  candidate.trace.events.splice(1, 0,
    { type: 'keyup', code: 'KeyW', atMs: 1200, trusted: true },
    { type: 'keydown', code: 'KeyW', atMs: 1300, trusted: true });
  const result = assessCapture(candidate);
  assert.deepEqual(result.invalid, ['interrupted-first-straight']);
  assert.equal(result.complete, false);
  candidate.trace.events[1].trusted = false;
  assert.equal(assessCapture(candidate).complete, true);
});

test('gap completeness requires a held message to be forwarded after the full hold and no intermediate sends', () => {
  const candidate = completeCapture(); candidate.profile = 'gap250';
  candidate.routed.gap = { armedAtNodeMs: 100, startAtNodeMs: 110, endTargetAtNodeMs: 360, firstAfterNodeMs: 360, held: 1 };
  candidate.routed.events = [
    { event: 'gap-start', forwardInvokedNodeMs: 110 },
    { event: 'enqueued', id: 1, direction: 'down', gapDelayMs: 200, seenAtNodeMs: 160, releaseTargetNodeMs: 360 },
    { event: 'forwarded', id: 1, direction: 'down', forwardInvokedNodeMs: 360 },
    { event: 'gap-end', forwardInvokedNodeMs: 360 },
  ];
  assert.equal(assessCapture(candidate).complete, true);
  candidate.routed.events.push({ event: 'forwarded', id: 2, direction: 'down', forwardInvokedNodeMs: 250 });
  assert.ok(assessCapture(candidate).invalid.includes('unsuccessful-gap'));
  candidate.routed.events.pop(); candidate.routed.events = candidate.routed.events.filter(e => e.event !== 'forwarded');
  assert.ok(assessCapture(candidate).invalid.includes('unsuccessful-gap'));
});
