// Read the local-only room-profile fixture. Run `reset` before each workload;
// after it exits, run `summary <full-room-client-count> [warmup-ms]`.
import { performance } from 'node:perf_hooks';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8794');
const action = process.argv[3] ?? 'summary';
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Only local HTTP is allowed');
if (!['summary', 'reset', 'enable', 'disable'].includes(action)) throw new Error('Action must be summary, reset, enable or disable');
const roomSize = Number(process.argv[4]);
const warmupMs = Number(process.argv[5] ?? 2000);
if (action === 'summary' && (!Number.isInteger(roomSize) || roomSize < 1 || roomSize > 64 || !Number.isFinite(warmupMs) || warmupMs < 0)) {
  throw new Error('Summary requires a room size of 1–64 and an optional nonnegative warmup in milliseconds');
}
type Sample = { started: number; elapsed: number; sessions: number; snapshot: boolean };
const url = new URL('/__room_profile', base);
if (action !== 'summary') url.searchParams.set('action', action);
const started = performance.now();
const response = await fetch(url, { redirect: 'error' });
if (!response.ok) throw new Error(`Profile response failed: ${response.status}`);
const profile = await response.json() as { enabled: boolean; dropped: number; samples: Sample[] };
if (action !== 'summary') {
  console.log(JSON.stringify({ action, enabled: profile.enabled, dropped: profile.dropped, samples: profile.samples.length }));
} else {
  const full = profile.samples.filter(sample => sample.sessions === roomSize);
  const cutoff = (full[0]?.started ?? 0) + warmupMs;
  const selected = full.filter(sample => sample.started >= cutoff);
  function describe(samples: Sample[]) {
    const values = samples.map(sample => sample.elapsed).sort((a, b) => a - b);
    const percentile = (p: number) => values.length ? values[Math.floor((values.length - 1) * p)] : null;
    return { samples: values.length, zeroMs: values.filter(value => value === 0).length,
      meanMs: values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : null,
      p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: values.at(-1) ?? null };
  }
  console.log(JSON.stringify({ enabled: profile.enabled, dropped: profile.dropped, roomSize, warmupMs,
    allSamples: profile.samples.length, fullRoomSamples: full.length, selectedSamples: selected.length,
    observedWindowMs: selected.length > 1 ? selected.at(-1)!.started - selected[0].started : 0,
    allTicks: describe(selected), simulationOnlyTicks: describe(selected.filter(sample => !sample.snapshot)),
    snapshotTicks: describe(selected.filter(sample => sample.snapshot)),
    retrievalMs: +(performance.now() - started).toFixed(1),
    note: 'Local callback elapsed wall milliseconds, integer resolution; not deployed Worker CPU time. Filtered by session count before tick; warmup starts at first observed full-room tick, not exactly the client measurement start. Includes simulation and synchronous snapshot construction/sends, excludes timer wait, incoming handlers and network flush. Instrumentation, host contention and scheduling apply; not production capacity.' }, null, 2));
}
