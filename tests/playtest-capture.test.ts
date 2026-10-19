import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeTabCapture, ScreencastCapture, TabChunkSink, withDeadline } from '../scripts/playtest-capture';

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

test('tab finalization publishes only after stop, close and trace writing succeed', async () => {
  for (const failing of ['stop', 'close', 'trace', 'publish'] as const) {
    const calls: string[] = [];
    const result = await finalizeTabCapture({
      stop: async () => { calls.push('stop'); if (failing === 'stop') throw null; return { chunks: 1 }; },
      close: async () => { calls.push('close'); if (failing === 'close') throw false; },
      writeTrace: async () => { calls.push('trace'); if (failing === 'trace') throw undefined; },
      publish: async () => { calls.push('publish'); if (failing === 'publish') throw null; },
      remove: async () => { calls.push('remove'); },
    });
    assert.ok(result.error instanceof Error);
    assert.equal(result.partialRemovalFailed, failing === 'close');
    assert.deepEqual(calls, {
      stop: ['stop', 'close', 'remove'], close: ['stop', 'close'],
      trace: ['stop', 'close', 'trace', 'remove'], publish: ['stop', 'close', 'trace', 'publish', 'remove'],
    }[failing]);
  }
  const failedRemoval = await finalizeTabCapture({
    stop: async () => { throw new Error('stop failed'); }, close: async () => {},
    writeTrace: async () => {}, publish: async () => {}, remove: async () => { throw null; },
  });
  assert.equal(failedRemoval.partialRemovalFailed, true);
  assert.ok(failedRemoval.error instanceof AggregateError);
  const calls: string[] = [];
  const success = await finalizeTabCapture({
    stop: async () => { calls.push('stop'); return { chunks: 1 }; }, close: async () => { calls.push('close'); },
    writeTrace: async () => { calls.push('trace'); }, publish: async () => { calls.push('publish'); },
    remove: async () => { throw new Error('successful segments must not be removed'); },
  });
  assert.equal(success.error, undefined);
  assert.deepEqual(calls, ['stop', 'close', 'trace', 'publish']);
});

test('timeouts leave a stalled segment private and do not pretend to cancel work', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const sink = new TabChunkSink({ writeFile: async () => {}, close: async () => { await pending; } }, 10);
  let removed = false, published = false;
  const result = await finalizeTabCapture({
    stop: async () => { await withDeadline(new Promise<void>(() => {}), 10, 'page timed out'); },
    close: async () => { await sink.close(); }, writeTrace: async () => {},
    publish: async () => { published = true; }, remove: async () => { removed = true; },
  });
  assert.ok(result.error instanceof AggregateError);
  assert.equal(result.partialRemovalFailed, true);
  assert.equal(removed, false);
  assert.equal(published, false);
  release();
});

test('a delayed chunk cannot update another segment after its sink closes', async () => {
  let signalStart!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { signalStart = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const first = new TabChunkSink({ writeFile: async () => { signalStart(); await pending; }, close: async () => { await pending; } });
  const writing = first.append(0, 'YQ==');
  await started;
  const closing = first.close();
  await assert.rejects(first.append(0, 'Yg=='), /Invalid tab recording chunk/);
  const second = new TabChunkSink({ writeFile: async () => {}, close: async () => {} });
  await second.append(0, 'Yg==');
  const rejected = assert.rejects(writing, /closed while writing/);
  release();
  await rejected;
  await closing;
  assert.deepEqual([first.chunks, first.bytes, second.chunks, second.bytes], [0, 0, 1, 1]);
  await second.close();
});
