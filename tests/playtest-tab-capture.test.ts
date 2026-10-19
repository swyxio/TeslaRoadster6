import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Mocks verify the guard's state machine; a real Chromium integration test is
// still required to establish API behavior and event ordering.
const source = await readFile(new URL('../scripts/playtest-tab-capture.js', import.meta.url), 'utf8');

type Config = { handle: string; exposeOrigin: boolean; permittedOrigins: string[] };
function harness(options: { noConfig?: boolean; noHandle?: boolean; nullHandle?: boolean; wrongHandle?: boolean; wrongOrigin?: boolean; deferReader?: boolean; deferStart?: boolean; deferStop?: boolean; deferSelection?: boolean; clearThrows?: boolean; trackStopThrows?: boolean; recorderStopThrows?: boolean; fakeTimers?: boolean; onStop?: () => void } = {}) {
  const origin = 'http://127.0.0.1:8787';
  const log: string[] = [], configs: Config[] = [], chunks: string[] = [];
  let activeConfig: Config | undefined, tokenCount = 0, started = 0, selections = 0, writeCalls = 0, clock = 1;
  let activeRecorder: Recorder | undefined, releaseReader: (() => void) | undefined, releaseStop: (() => void) | undefined;
  let releaseSelection: (() => void) | undefined, resolveDeferredWrite: (() => void) | undefined, rejectDeferredWrite: ((error: unknown) => void) | undefined;
  let onHandleRead: (() => void) | undefined;
  let notifyReaderReady!: () => void;
  const readerReady = new Promise<void>(resolve => { notifyReaderReady = resolve; });
  let timerCount = 0, timerWaiter: (() => void) | undefined;
  const timers = new Map<number, () => void>();
  const fakeSetTimeout = (callback: () => void) => { const id = ++timerCount; timers.set(id, callback); timerWaiter?.(); return id; };
  const fakeClearTimeout = (id: number) => { timers.delete(id); };
  let deferWrite = false, notifyFirstWrite!: () => void, notifyDeferredWrite!: () => void;
  const firstWrite = new Promise<void>(resolve => { notifyFirstWrite = resolve; });
  const deferredWrite = new Promise<void>(resolve => { notifyDeferredWrite = resolve; });
  let override: { handle: string; origin: string } | null | undefined;
  const listeners = new Map<string, Set<() => void>>();
  const track = {
    readyState: 'live',
    getSettings: () => ({ displaySurface: 'browser', width: 1280, height: 720, frameRate: 60 }),
    getCaptureHandle: options.noHandle ? undefined : () => {
      onHandleRead?.();
      return override !== undefined ? override : options.nullHandle ? null :
        { handle: options.wrongHandle ? 'another-tab' : activeConfig?.handle, origin: options.wrongOrigin ? 'https://other.example' : origin };
    },
    addEventListener(type: string, listener: () => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: () => void) { listeners.get(type)?.delete(listener); },
    emit(type: string) { for (const listener of listeners.get(type) ?? []) listener(); },
    stop() { log.push('track-stop'); if (options.trackStopThrows) throw new Error('track stop failed'); this.readyState = 'ended'; },
  };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const devices = {
    setCaptureHandleConfig: options.noConfig ? undefined : (config?: Config) => {
      if (config) { activeConfig = config; configs.push(config); log.push('configure'); }
      else { if (options.clearThrows) { log.push('clear-failed'); throw new Error('reset failed'); } activeConfig = undefined; log.push('clear'); }
    },
    getDisplayMedia: async (constraints: unknown) => {
      selections++;
      assert.equal((constraints as { surfaceSwitching: string }).surfaceSwitching, 'exclude');
      track.readyState = 'live';
      if (options.deferSelection) return await new Promise<typeof stream>(resolve => { releaseSelection = () => resolve(stream); });
      return stream;
    },
  };
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive';
    onstart?: () => void;
    onstop?: () => void;
    ondataavailable?: (event: { data: { size: number } }) => void;
    onerror?: (event: unknown) => void;
    start() { started++; activeRecorder = this; this.state = 'recording'; if (!options.deferStart) queueMicrotask(() => this.onstart?.()); }
    stop() {
      log.push('recorder-stop');
      if (options.recorderStopThrows) throw new Error('recorder stop failed');
      this.state = 'inactive';
      options.onStop?.();
      const finish = () => { this.ondataavailable?.({ data: { size: 4 } }); this.onstop?.(); };
      if (options.deferStop) releaseStop = finish; else queueMicrotask(finish);
    }
  }
  class Reader {
    result = 'data:video/webm;base64,dGVzdA==';
    onload?: () => void;
    onerror?: () => void;
    readAsDataURL() { if (options.deferReader) { releaseReader = () => this.onload?.(); notifyReaderReady(); } else queueMicrotask(() => this.onload?.()); }
  }
  const win = { __teslandTabChunk: async (_index: number, encoded: string) => {
    writeCalls++;
    if (deferWrite) { deferWrite = false; return await new Promise<void>((resolve, reject) => { resolveDeferredWrite = resolve; rejectDeferredWrite = reject; notifyDeferredWrite(); }); }
    chunks.push(encoded); notifyFirstWrite();
  }, __teslandTabCapture: undefined as any };
  vm.runInNewContext(source, { window: win, navigator: { mediaDevices: devices }, location: { origin },
    crypto: { randomUUID: () => `fresh-opaque-${++tokenCount}` }, MediaRecorder: Recorder, FileReader: Reader,
    performance: { now: () => ++clock }, setTimeout: options.fakeTimers ? fakeSetTimeout : setTimeout,
    clearTimeout: options.fakeTimers ? fakeClearTimeout : clearTimeout, Promise, Error });
  const capture = { start: (fps: number, expectedOrigin = origin) => win.__teslandTabCapture.start(fps, expectedOrigin), stop: () => win.__teslandTabCapture.stop() };
  return { capture, track, configs, chunks, log, started: () => started, selections: () => selections, writeCalls: () => writeCalls, readerReady,
    setHandle(value: typeof override) { override = value; }, emitChunk(size = 4) { activeRecorder?.ondataavailable?.({ data: { size } }); },
    releaseReader() { assert.ok(releaseReader); releaseReader(); }, releaseStop() { assert.ok(releaseStop); releaseStop(); },
    releaseSelection() { assert.ok(releaseSelection); releaseSelection(); }, firstWrite, deferredWrite,
    deferNextWrite() { deferWrite = true; }, resolveDeferredWrite() { assert.ok(resolveDeferredWrite); resolveDeferredWrite(); },
    rejectDeferredWrite(error: unknown) { assert.ok(rejectDeferredWrite); rejectDeferredWrite(error); },
    onHandleRead(callback: () => void) { onHandleRead = callback; },
    waitForTimerCount(target: number) { if (timerCount >= target) return Promise.resolve(); return new Promise<void>(resolve => { timerWaiter = () => { if (timerCount >= target) { timerWaiter = undefined; resolve(); } }; }); },
    fireTimer(id: number) { const callback = timers.get(id); assert.ok(callback); timers.delete(id); callback(); }, listeners };
}

test('matching self handle records separate segments with fresh tokens and cleanup', async () => {
  const h = harness();
  await h.capture.start(60);
  const first = await h.capture.stop();
  await h.capture.start(60);
  const second = await h.capture.stop();
  assert.equal(first.format, 3);
  assert.equal(second.format, 3);
  assert.equal(first.captureHandleCheck, 'matched');
  assert.equal(second.captureHandleCheck, 'matched');
  assert.equal(h.started(), 2);
  assert.equal(h.chunks.length, 2);
  assert.notEqual(h.configs[0].handle, h.configs[1].handle);
  assert.deepEqual(Array.from(h.configs[0].permittedOrigins), ['http://127.0.0.1:8787']);
  assert.equal(h.configs[0].exposeOrigin, true);
  assert.ok(!JSON.stringify([first, second]).includes('fresh-opaque'));
  assert.deepEqual(h.log, ['configure', 'recorder-stop', 'track-stop', 'clear', 'configure', 'recorder-stop', 'track-stop', 'clear']);
  assert.equal(h.listeners.get('capturehandlechange')?.size, 0);
  assert.equal(h.listeners.get('ended')?.size, 0);
});

test('unsupported or mismatched identity never starts recording', async () => {
  for (const options of [{ noConfig: true }, { noHandle: true }, { nullHandle: true }, { wrongHandle: true }, { wrongOrigin: true }]) {
    const h = harness(options);
    await assert.rejects(h.capture.start(60), /identity/);
    assert.equal(h.started(), 0);
    assert.equal(h.chunks.length, 0);
    if (!options.noConfig) assert.ok(h.log.indexOf('track-stop') < h.log.indexOf('clear'));
  }
});

test('a redirected current origin is rejected before configuring or selecting capture', async () => {
  const h = harness();
  await assert.rejects(h.capture.start(60, 'https://different.example'), /origin does not match/);
  assert.equal(h.configs.length, 0);
  assert.equal(h.selections(), 0);
  assert.equal(h.started(), 0);
  assert.equal(h.log.length, 0);
});

test('any handle change or ended track permanently invalidates a segment', async () => {
  for (const event of ['capturehandlechange', 'ended']) {
    const h = harness();
    await h.capture.start(60);
    // Even a handle that has already switched back is tainted by the event.
    h.track.emit(event);
    await assert.rejects(h.capture.stop(), /identity/);
    assert.equal(h.chunks.length, 0);
    assert.ok(h.log.indexOf('track-stop') < h.log.indexOf('clear'));
  }
});

test('a mismatch detected at stop fails even if no change event was delivered', async () => {
  const h = harness();
  await h.capture.start(60);
  h.setHandle(null);
  await assert.rejects(h.capture.stop(), /identity/);
  assert.equal(h.chunks.length, 0);
});

test('a mismatched handle is rejected before a chunk is transferred', async () => {
  const h = harness();
  await h.capture.start(60);
  h.setHandle(null);
  h.emitChunk();
  assert.equal(h.track.readyState, 'ended');
  await assert.rejects(h.capture.stop(), /identity changed/);
  assert.equal(h.chunks.length, 0);
});

test('a change during finalization invalidates the segment', async () => {
  let switched = false;
  let h: ReturnType<typeof harness>;
  h = harness({ onStop: () => { if (!switched) { switched = true; h.track.emit('capturehandlechange'); } } });
  await h.capture.start(60);
  await assert.rejects(h.capture.stop(), /identity/);
  assert.equal(h.chunks.length, 0);
});

test('a change delivered while finalization waits invalidates an otherwise successful stop', async () => {
  const h = harness();
  await h.capture.start(60);
  let reads = 0;
  h.onHandleRead(() => {
    // Stop check, data callback, pre-read guard, post-read guard, final check.
    if (++reads === 5) queueMicrotask(() => h.track.emit('capturehandlechange'));
  });
  await assert.rejects(h.capture.stop(), /identity changed/);
  assert.equal(reads, 5);
});

test('a chunk being read is not handed to the caller after identity changes', async () => {
  const h = harness({ deferReader: true });
  await h.capture.start(60);
  h.emitChunk();
  await Promise.resolve();
  h.track.emit('capturehandlechange');
  h.releaseReader();
  await assert.rejects(h.capture.stop(), /identity/);
  assert.equal(h.chunks.length, 0);
});

test('concurrent stops cannot finalize the same segment twice', async () => {
  const h = harness({ deferStop: true });
  await h.capture.start(60);
  const first = h.capture.stop();
  await assert.rejects(h.capture.stop(), /already stopping/);
  h.releaseStop();
  assert.equal((await first).captureHandleCheck, 'matched');
});

test('a pending selection rejects overlapping starts and stops', async () => {
  const h = harness({ deferSelection: true });
  const first = h.capture.start(60);
  await assert.rejects(h.capture.stop(), /still starting/);
  await assert.rejects(h.capture.start(60), /already active/);
  h.releaseSelection();
  await first;
  assert.equal((await h.capture.stop()).captureHandleCheck, 'matched');
});

test('failure to clear the capture handle cannot finalize a segment', async () => {
  const h = harness({ clearThrows: true });
  await h.capture.start(60);
  await assert.rejects(h.capture.stop(), /recording cleanup was incomplete \(handle\)/);
  assert.ok(h.log.indexOf('track-stop') < h.log.indexOf('clear-failed'));
  await assert.rejects(h.capture.start(60), /fresh browser/);
});

test('cleanup failure retains the primary identity failure as its cause', async () => {
  const h = harness({ clearThrows: true });
  await h.capture.start(60);
  h.track.emit('capturehandlechange');
  await assert.rejects(h.capture.stop(), (error: Error & { cause?: Error }) => {
    assert.match(error.message, /recording cleanup was incomplete \(handle\)/);
    assert.match(error.cause?.message ?? '', /identity changed/);
    return true;
  });
});

test('startup and cleanup failures are both reported', async () => {
  const h = harness({ wrongHandle: true, clearThrows: true });
  await assert.rejects(h.capture.start(60), (error: Error & { cause?: Error }) => {
    assert.match(error.message, /capture failed and cleanup was incomplete \(handle\)/);
    assert.match(error.cause?.message ?? '', /identity changed/);
    return true;
  });
  assert.equal(h.started(), 0);
});

test('a falsy queued write rejection cannot erase identity taint', async () => {
  const h = harness();
  await h.capture.start(60);
  h.emitChunk();
  await h.firstWrite;
  h.deferNextWrite();
  h.emitChunk();
  await h.deferredWrite;
  h.track.emit('capturehandlechange');
  h.rejectDeferredWrite(null);
  await assert.rejects(h.capture.stop(), /identity changed/);
});

test('a later identity failure preserves an earlier queued write error', async () => {
  const h = harness();
  await h.capture.start(60);
  h.deferNextWrite();
  h.emitChunk();
  await h.deferredWrite;
  h.rejectDeferredWrite(new Error('mock write failed'));
  await new Promise<void>(resolve => setImmediate(resolve));
  h.track.emit('capturehandlechange');
  await assert.rejects(h.capture.stop(), /mock write failed/);
  assert.equal(h.track.readyState, 'ended');
});

test('excess pending data immediately stops capture and rejects the recording', async () => {
  const h = harness();
  await h.capture.start(60);
  h.emitChunk(64 * 1024 * 1024 + 1);
  assert.equal(h.track.readyState, 'ended');
  assert.equal(h.writeCalls(), 0);
  assert.ok(h.log.indexOf('track-stop') < h.log.indexOf('clear'));
  await assert.rejects(h.capture.stop(), /could not write chunks fast enough/);
});

test('a stalled chunk reader times out and cannot start a late write', { timeout: 3000 }, async () => {
  const h = harness({ deferReader: true, fakeTimers: true });
  await h.capture.start(60);
  h.emitChunk();
  await h.readerReady;
  const stopping = h.capture.stop();
  // Selection, start, stop and queue drain each install a timer.
  await h.waitForTimerCount(4);
  h.fireTimer(4);
  await assert.rejects(stopping, /recording cleanup was incomplete \(queue\)/);
  assert.ok(h.log.includes('recorder-stop'));
  assert.ok(h.log.includes('track-stop'));
  assert.ok(h.log.includes('clear'));
  await assert.rejects(h.capture.start(60), /fresh browser/);
  h.releaseReader();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(h.writeCalls(), 0);
  assert.equal(h.chunks.length, 0);
});

test('startup failure also bounds a stalled chunk queue and stops capture', { timeout: 3000 }, async () => {
  const h = harness({ deferStart: true, deferReader: true, fakeTimers: true });
  const starting = h.capture.start(60);
  await h.waitForTimerCount(2);
  h.emitChunk();
  await h.readerReady;
  h.fireTimer(2);
  await h.waitForTimerCount(3);
  h.fireTimer(3);
  await assert.rejects(starting, (error: Error & { cause?: Error }) => {
    assert.match(error.message, /capture failed and cleanup was incomplete \(queue\)/);
    assert.match(error.cause?.message ?? '', /start timed out/);
    return true;
  });
  assert.ok(h.log.includes('recorder-stop'));
  assert.ok(h.log.includes('track-stop'));
  assert.ok(h.log.includes('clear'));
  await assert.rejects(h.capture.start(60), /fresh browser/);
  h.releaseReader();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(h.writeCalls(), 0);
});

test('an in-flight binding times out, closes capture, and prevents later writes', { timeout: 3000 }, async () => {
  const h = harness({ fakeTimers: true });
  await h.capture.start(60);
  h.deferNextWrite();
  h.emitChunk();
  await h.deferredWrite;
  const stopping = h.capture.stop();
  await h.waitForTimerCount(4);
  h.fireTimer(4);
  await assert.rejects(stopping, /recording cleanup was incomplete \(queue\)/);
  assert.ok(h.log.includes('track-stop'));
  assert.ok(h.log.includes('clear'));
  await assert.rejects(h.capture.start(60), /fresh browser/);
  h.resolveDeferredWrite();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(h.writeCalls(), 1);
  assert.equal(h.chunks.length, 0);
});

test('throwing recorder and track stops still attempt the other cleanup steps', async () => {
  const h = harness({ recorderStopThrows: true, trackStopThrows: true });
  await h.capture.start(60);
  await assert.rejects(h.capture.stop(), /recording cleanup was incomplete \(recorder, track\)/);
  assert.ok(h.log.includes('recorder-stop'));
  assert.ok(h.log.includes('track-stop'));
  assert.ok(h.log.indexOf('track-stop') < h.log.indexOf('clear'));
  assert.equal(h.listeners.get('capturehandlechange')?.size, 0);
  assert.equal(h.listeners.get('ended')?.size, 0);
  await assert.rejects(h.capture.start(60), /fresh browser/);
});
