import assert from 'node:assert/strict';
import test from 'node:test';
import { ScreencastCapture } from '../scripts/playtest-capture';

const frame = (timestamp: number) => ({ timestamp, viewportWidth: 1280, viewportHeight: 720 });

test('screencast metadata retains callback timestamps and identifies observed long gaps', () => {
  const capture = new ScreencastCapture(200);
  capture.observe(frame(1_000), 201);
  capture.observe(frame(1_016), 217);
  capture.observe(frame(1_136), 337);
  const { summary, trace } = capture.finish(350);
  assert.equal(summary.status, 'available');
  assert.equal(summary.callbacksReceived, 3);
  assert.equal(summary.observedCallbackFps, 2_000 / 136);
  assert.deepEqual(summary.intervalMs, { p50: 16, p95: 120, max: 120, gapsAtLeast100Ms: 1 });
  assert.ok(summary.flags.includes('callback_gap_at_least_100ms'));
  assert.equal(summary.firstCallbackDelayMs, 1);
  assert.equal(summary.callbackSilenceAtStopMs, 13);
  assert.deepEqual(trace.samples[0], [1_000, 201, 1280, 720]);
});

test('missing, invalid, and truncated callbacks do not produce a usable cadence', () => {
  const empty = new ScreencastCapture(0).finish(1_000).summary;
  assert.equal(empty.status, 'unavailable');
  assert.ok(empty.flags.includes('no_callbacks'));
  assert.equal(empty.observedCallbackFps, null);
  const one = new ScreencastCapture(0);
  one.observe(frame(1), 1);
  assert.equal(one.finish(200).summary.status, 'unavailable');
  assert.ok(one.finish(200).summary.flags.includes('callback_silence_at_stop_at_least_100ms'));
  const broken = new ScreencastCapture(0);
  broken.observe(frame(100), 1);
  broken.observe(frame(100), 2);
  broken.observe(frame(NaN), 3);
  broken.observe(frame(0), 4);
  const brokenResult = broken.finish(5);
  assert.equal(brokenResult.summary.status, 'incomplete');
  assert.deepEqual(brokenResult.summary.flags, ['invalid_timestamps', 'non_increasing_timestamps']);
  assert.equal(brokenResult.trace.samples[2][0], null);
  assert.equal(brokenResult.trace.samples[3][0], null);
  assert.equal(brokenResult.summary.observedCallbackFps, null);
  const limited = new ScreencastCapture(0, 2);
  limited.observe(frame(1), 1);
  limited.observe(frame(2), 2);
  limited.observe(frame(3), 999);
  const limitedResult = limited.finish(1_000).summary;
  assert.equal(limitedResult.status, 'incomplete');
  assert.equal(limitedResult.callbacksReceived, 3);
  assert.equal(limitedResult.samplesRetained, 2);
  assert.equal(limitedResult.callbackSilenceAtStopMs, 1);
  assert.ok(limitedResult.flags.includes('trace_truncated'));
});
