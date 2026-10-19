import { link, rename, stat, unlink, writeFile } from 'node:fs/promises';

/** Metadata from Playwright's screencast callbacks, not display or video timing. */
type Frame = { timestamp: number; viewportWidth: number; viewportHeight: number };
type Sample = [presentedAtUnixMs: number | null, receivedAtRunMs: number, viewportWidth: number, viewportHeight: number];

const MAX_SAMPLES = 120_000;
// A descriptive bucket for investigating long gaps, not a performance budget.
const LONG_GAP_MS = 100;

export const captureError = (error: unknown, message: string): Error => error instanceof Error ? error : new Error(message, { cause: error });

/** Bound the wait, not the underlying operation; it may still be in flight. */
export async function withDeadline<T>(operation: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** A failed capture cannot reuse a browser while an old operation may resume. */
export class CaptureSession {
  private usable = true;
  private abandoned = false;
  requireUsable() {
    if (!this.usable) throw new Error('The recording browser is unavailable after a capture failure.');
  }
  retire() { this.usable = false; }
  abandon() { this.retire(); this.abandoned = true; }
  requirePublishable() {
    if (this.abandoned) throw new Error('Recorder shutdown abandoned this segment.');
  }
  async publish(operation: () => Promise<void>): Promise<void> {
    this.requirePublishable();
    await operation();
    this.requirePublishable();
  }
  async retireOnFailure<T>(operation: Promise<T>): Promise<T> {
    try { return await operation; }
    catch (error) { this.retire(); throw error; }
  }
  async stopOrRetire<T>(operation: Promise<T>, close: () => Promise<void>): Promise<T> {
    try { return await this.retireOnFailure(operation); }
    catch (failure) {
      const error = captureError(failure, 'Could not stop capture.');
      try { await close(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Capture failed and its browser could not be closed.'); }
      throw error;
    }
  }
  async finishAndClose(finish: () => Promise<void>, close: () => Promise<void>): Promise<void> {
    this.retire();
    const errors: unknown[] = [];
    try { await finish(); } catch (error) { errors.push(error); }
    try { await close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Could not finish and close the recording browser.');
  }
}

/** A delayed screenshot must never recreate a quarantined output directory. */
export async function writeCaptureScreenshot(session: CaptureSession, screenshot: () => Promise<Uint8Array>, path: string): Promise<void> {
  const bytes = await screenshot();
  const partial = `${path}.partial`;
  // Neither operation creates parent folders. A hard link publishes only fully
  // written bytes and refuses to replace a screenshot that already exists.
  await session.publish(async () => {
    await writeFile(partial, bytes, { flag: 'wx' });
    session.requirePublishable();
    await link(partial, path);
    await unlink(partial);
  });
}

/** Publish a stopped screencast only from its private staging directory. */
export async function publishScreencast(session: CaptureSession, staged: string, output: string): Promise<void> {
  const file = await stat(staged);
  if (!file.isFile() || !file.size) throw new Error('Screencast output is empty or unavailable.');
  await session.publish(() => rename(staged, output));
}

/** Forced shutdown always attempts each cleanup step and reports uncertainty. */
export async function abandonControlSession(session: CaptureSession, operations: {
  quarantine(): Promise<void>;
  closeContext(): Promise<void>;
  closeBrowser(): Promise<void>;
  drain(): Promise<void>;
}): Promise<string[]> {
  session.abandon();
  const failures: string[] = [];
  for (const name of ['quarantine', 'closeContext', 'closeBrowser', 'drain'] as const) {
    try { await operations[name](); } catch { failures.push(name); }
  }
  return failures;
}

/** Attempt every held input even if one dispatch fails, and report failures. */
export async function releaseHeldControls<T>(held: Set<string>, touches: Map<number, T>, pointerHeld: boolean, operations: {
  keyUp(key: string): Promise<void>;
  touchCancel(): Promise<void>;
  pointerUp(): Promise<void>;
}): Promise<void> {
  const errors: unknown[] = [];
  for (const key of held) { try { await operations.keyUp(key); } catch (error) { errors.push(error); } }
  held.clear();
  if (touches.size) { try { await operations.touchCancel(); } catch (error) { errors.push(error); } touches.clear(); }
  if (pointerHeld) { try { await operations.pointerUp(); } catch (error) { errors.push(error); } }
  if (errors.length) throw new AggregateError(errors, 'Could not release all held inputs.');
}

/** Publish only a completely closed, verified segment; keep uncertain partials private. */
export async function finalizeTabCapture<T>(operations: {
  stop(): Promise<T>;
  close(): Promise<void>;
  writeTrace(trace: T): Promise<void>;
  publish(): Promise<void>;
  remove(): Promise<void>;
}): Promise<{ trace?: T; error?: Error; partialRemovalFailed: boolean }> {
  let trace: T | undefined, error: Error | undefined, closeFailed = false;
  try { trace = await operations.stop(); }
  catch (failure) { error = captureError(failure, 'Could not finalize tab recording.'); }
  try { await operations.close(); }
  catch (failure) {
    closeFailed = true;
    const closeError = captureError(failure, 'Could not close tab recording.');
    error = error ? new AggregateError([error, closeError], 'Tab recording failed and its file could not be closed.') : closeError;
  }
  if (!error) {
    try { await operations.writeTrace(trace as T); await operations.publish(); }
    catch (failure) { error = captureError(failure, 'Could not publish tab recording and trace.'); }
  }
  let partialRemovalFailed = closeFailed;
  if (error && !closeFailed) {
    try { await operations.remove(); }
    catch (failure) {
      partialRemovalFailed = true;
      error = new AggregateError([error, failure], 'Tab recording failed and its partial file could not be removed.');
    }
  }
  return { trace, error, partialRemovalFailed };
}

/** Serializes chunks to one segment and rejects writes once it is closing. */
export class TabChunkSink {
  private closing = false;
  private writing = false;
  chunks = 0;
  bytes = 0;

  constructor(private readonly file: { writeFile(data: Buffer): Promise<void>; close(): Promise<void> }, private readonly closeTimeoutMs = 10_000) {}

  async append(chunk: number, encoded: string) {
    if (this.closing || this.writing || chunk !== this.chunks || typeof encoded !== 'string' || encoded.length > 90_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid tab recording chunk.');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || this.bytes + bytes.length > 2_000_000_000) throw new Error('Tab recording exceeds its size limit.');
    this.writing = true;
    try {
      await this.file.writeFile(bytes);
      if (this.closing) throw new Error('Tab recording closed while writing a chunk.');
      this.chunks++; this.bytes += bytes.length;
    } finally { this.writing = false; }
  }

  async close() {
    this.closing = true;
    await withDeadline(this.file.close(), this.closeTimeoutMs, 'Tab recording file close timed out; the partial file remains private.');
  }
}

export class ScreencastCapture {
  private samples: Sample[] = [];
  private received = 0;
  private lastReceivedAtRunMs: number | null = null;

  constructor(private readonly startedAtRunMs: number, private readonly maxSamples = MAX_SAMPLES) {}

  observe(frame: Frame, receivedAtRunMs: number) {
    this.received++;
    this.lastReceivedAtRunMs = receivedAtRunMs;
    if (this.samples.length < this.maxSamples) this.samples.push([
      Number.isFinite(frame.timestamp) && frame.timestamp > 0 ? frame.timestamp : null,
      receivedAtRunMs,
      frame.viewportWidth,
      frame.viewportHeight,
    ]);
  }

  finish(stopRequestedAtRunMs: number) {
    const samples = this.samples;
    const truncated = this.received > samples.length;
    const intervals: number[] = [];
    let invalidTimestamps = 0;
    let nonIncreasingTimestamps = 0;
    for (let i = 0; i < samples.length; i++) {
      const time = samples[i][0];
      if (time === null) invalidTimestamps++;
      if (i && time !== null && samples[i - 1][0] !== null) {
        const interval = time - samples[i - 1][0]!;
        if (interval <= 0) nonIncreasingTimestamps++;
        else intervals.push(interval);
      }
    }
    const flags: string[] = [];
    if (this.received === 0) flags.push('no_callbacks');
    else if (this.received === 1) flags.push('only_one_callback');
    if (truncated) flags.push('trace_truncated');
    if (invalidTimestamps) flags.push('invalid_timestamps');
    if (nonIncreasingTimestamps) flags.push('non_increasing_timestamps');
    const gapsAtLeast100Ms = intervals.filter(value => value >= LONG_GAP_MS).length;
    if (gapsAtLeast100Ms) flags.push('callback_gap_at_least_100ms');
    const tailSilenceMs = this.lastReceivedAtRunMs === null ? null : Math.max(0, stopRequestedAtRunMs - this.lastReceivedAtRunMs);
    if (tailSilenceMs !== null && tailSilenceMs >= LONG_GAP_MS) flags.push('callback_silence_at_stop_at_least_100ms');
    const status = this.received < 2 ? 'unavailable' : truncated || invalidTimestamps || nonIncreasingTimestamps ? 'incomplete' : 'available';
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = (p: number) => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
    const spanMs = samples.length > 1 && samples[0][0] !== null && samples.at(-1)![0] !== null ? samples.at(-1)![0]! - samples[0][0]! : 0;
    return {
      summary: {
        status, flags, callbacksReceived: this.received, samplesRetained: samples.length, truncated,
        invalidTimestamps, nonIncreasingTimestamps,
        observedCallbackFps: status === 'available' && spanMs > 0 ? (samples.length - 1) * 1000 / spanMs : null,
        intervalMs: { p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) ?? null, gapsAtLeast100Ms },
        firstCallbackDelayMs: samples.length ? Math.max(0, samples[0][1] - this.startedAtRunMs) : null,
        callbackSilenceAtStopMs: tailSilenceMs,
      },
      trace: {
        format: 1,
        columns: ['browserPresentedAtUnixMs', 'callbackReceivedAtRunMs', 'viewportWidth', 'viewportHeight'],
        startedAtRunMs: this.startedAtRunMs, stopRequestedAtRunMs, samples,
      },
    };
  }
}
