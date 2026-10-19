import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGroundedBoost, inspectSingleJump } from '../scripts/visual-proof-checks.mjs';

const event = (type:string, at:number, key?:string) => ({ type, commandStartedAtMs: at, status: 'ok', key });
const keyboard = { trajectory: { status: 'available' }, events: [event('keyDown', 100, 'Shift'), event('keyUp', 800, 'Shift')] };
const touch = { trajectory: { status: 'available' }, events: [event('touchDown', 50), event('touchDown', 100), event('touchUp', 800)] };
const poses = [150, 300, 450].map((atMs, tick) => ({ atMs, tick, supported: true, thrusters: 1, speed: 10 }));

test('grounded rear thrust is observed only during the keyboard or touch boost hold', () => {
  for (const [manifest, simulatedTouch] of [[keyboard, false], [touch, true]] as const) {
    assert.deepEqual(inspectGroundedBoost(manifest, poses, simulatedTouch), { status: 'observed', samples: 3, distinctTicks: 3, durationMs: 300 });
    assert.equal(inspectGroundedBoost(manifest, poses.map(p => ({ ...p, atMs: p.atMs + 800 })), simulatedTouch).status, 'not_observed');
    assert.equal(inspectGroundedBoost(manifest, poses.map(p => ({ ...p, thrusters: 0 })), simulatedTouch).status, 'not_observed');
    assert.equal(inspectGroundedBoost(manifest, poses.map(p => ({ ...p, supported: false })), simulatedTouch).status, 'not_observed');
    assert.equal(inspectGroundedBoost(manifest, poses.map(p => ({ ...p, speed: 0 })), simulatedTouch).status, 'not_observed');
  }
});

test('boost evidence requires actual progress, sustained samples, and a completed release', () => {
  assert.equal(inspectGroundedBoost(keyboard, poses.map(p => ({ ...p, tick: 1 })), false).status, 'not_observed');
  assert.equal(inspectGroundedBoost(keyboard, poses.slice(0, 2), false).status, 'not_observed');
  assert.equal(inspectGroundedBoost(keyboard, poses.map((p, i) => ({ ...p, atMs: 150 + i * 50 })), false).status, 'not_observed');
  assert.equal(inspectGroundedBoost({ ...keyboard, events: [keyboard.events[0]] }, poses, false).status, 'unavailable');
  assert.equal(inspectGroundedBoost({ ...keyboard, trajectory: { status: 'truncated' } }, poses, false).status, 'unavailable');
});

test('a single processed jump is required for keyboard and touch', () => {
  const keyManifest = { events: [event('jumpUntilAirborne', 100)] };
  const touchManifest = { events: [event('touchDown', 10), event('touchDown', 20), event('touchDown', 100)] };
  const single = [{ atMs: 120, type: 'sent', jump: 1 }, { atMs: 240, type: 'edge', id: 1, status: 'processed', targetTick: 17 }];
  for (const [manifest, simulatedTouch] of [[keyManifest, false], [touchManifest, true]] as const) {
    assert.equal(inspectSingleJump(manifest, single, simulatedTouch).status, 'observed');
    assert.equal(inspectSingleJump({ ...manifest, inputEvents: { status: 'truncated' } }, single, simulatedTouch).status, 'unavailable');
    assert.equal(inspectSingleJump(manifest, [single[0]], simulatedTouch).status, 'unavailable');
    assert.equal(inspectSingleJump(manifest, [single[0], { ...single[1], status: 'expired' }], simulatedTouch).status, 'not_observed');
    assert.equal(inspectSingleJump(manifest, [single[0], { ...single[1], status: 'superseded' }], simulatedTouch).status, 'not_observed');
    assert.equal(inspectSingleJump(manifest, [...single, { atMs: 260, type: 'sent', jump: 2 }], simulatedTouch).status, 'not_observed');
    assert.equal(inspectSingleJump(manifest, [single[0], { ...single[1], status: 'expired' }, { atMs: 300, type: 'sent', jump: 2 }, { ...single[1], id: 2 }], simulatedTouch).status, 'not_observed');
  }
});
