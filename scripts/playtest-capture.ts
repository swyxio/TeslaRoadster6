/** Metadata from Playwright's screencast callbacks, not display or video timing. */
type Frame = { timestamp: number; viewportWidth: number; viewportHeight: number };
type Sample = [presentedAtUnixMs: number | null, receivedAtRunMs: number, viewportWidth: number, viewportHeight: number];

const MAX_SAMPLES = 120_000;
// A descriptive bucket for investigating long gaps, not a performance budget.
const LONG_GAP_MS = 100;

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
