import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The standalone diagnostic helper has no TypeScript declarations.
import { controlEvent } from '../scripts/playtest-input-events.mjs';

test('playtest diagnostics retain input rejection reasons without identity data', () => {
  const input = { type: 'input', seq: 68, targetTick: 73, controlRevision: 2, actionSeq: 3,
    roomEpoch: 'private', input: { jump: 1, hover: false } };
  assert.deepEqual(controlEvent('sent', input, 100), { atMs: 100, type: 'sent', seq: 68, targetTick: 73,
    controlRevision: 2, actionSeq: 3, jump: 1, hover: false });
  assert.deepEqual(controlEvent('received', { type: 'inputRejected', seq: 68, targetTick: 73, reason: 'future', recoveryCode: 'private' }, 120),
    { atMs: 120, type: 'rejected', seq: 68, targetTick: 73, reason: 'future' });
  assert.deepEqual(controlEvent('received', { type: 'inputEdge', kind: 'jump', id: 1, targetTick: 73, status: 'expired' }, 121),
    { atMs: 121, type: 'edge', id: 1, targetTick: 73, status: 'expired' });
  assert.equal(controlEvent('received', { type: 'inputRejected', seq: 68, targetTick: 73, reason: 'private' }, 122), null);
  assert.equal(controlEvent('received', { type: 'identityResult', recoveryCode: 'private' }, 123), null);
});
