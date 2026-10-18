// Local-only workerd Inspector CPU sampling of the staged single-driver room.
// The profile includes client startup and warmup as well as the timed run.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const inspector = new URL(process.argv[2] ?? 'http://127.0.0.1:9317');
const room = new URL(process.argv[3] ?? 'http://127.0.0.1:8795');
const seconds = Number(process.argv[4] ?? 10);
const pid = process.argv[5];
for (const url of [inspector, room]) if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Local HTTP only');
if (!Number.isFinite(seconds) || seconds < 2 || seconds > 20 || (pid && !/^\d+$/.test(pid))) throw new Error('Expected 2–20 seconds and optional PID');
const require = createRequire(import.meta.url);
const WebSocket = require(require.resolve('ws', { paths: [require.resolve('wrangler/package.json')] }));
const targets = await (await fetch(new URL('/json/list', inspector))).json() as { webSocketDebuggerUrl: string }[];
const target = new URL(targets[0]?.webSocketDebuggerUrl);
if (target.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('Inspector must be local');
const ws = new WebSocket(target.href, { origin: inspector.origin });
await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
ws.on('message', (raw: Buffer) => {
  const message = JSON.parse(String(raw));
  // Wrangler's local Inspector replies to some Profiler commands without a
  // result field; match request IDs and reject any explicit protocol error.
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
});
function call(method: string, params: object = {}): Promise<any> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10_000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
try {
  await call('Profiler.enable');
  await call('Profiler.setSamplingInterval', { interval: 1000 });
  await call('Profiler.start');
  const wallStart = performance.now();
  const args = ['exec', 'tsx', 'scripts/profile-fast-room.ts', room.origin, String(seconds), ...(pid ? [pid] : [])];
  const child = spawn('pnpm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const exit = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const { profile } = await call('Profiler.stop');
  const wallMs = performance.now() - wallStart;
  if (exit !== 0) throw new Error(`Driver command exited ${exit}: ${stderr}`);
  const path = '/private/tmp/tesland-fast-room.cpuprofile';
  writeFileSync(path, JSON.stringify(profile));
  const nodes = profile.nodes as { id: number; children?: number[]; callFrame: { functionName: string; url: string; lineNumber: number } }[];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of nodes) for (const childId of node.children ?? []) parent.set(childId, node.id);
  const samples = profile.samples as number[], deltas = profile.timeDeltas as number[];
  const frames = (id: number) => { const result = []; for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) result.push(byId.get(at)?.callFrame); return result; };
  const tickNodeIds = nodes.filter(node => node.callFrame.functionName === 'tick').map(node => node.id);
  const isTick = (id: number) => { for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) if (tickNodeIds.includes(at)) return true; return false; };
  const tickSampleCount = samples.filter(isTick).length;
  const tickDeltaMs = samples.reduce((total, id, index) => total + (isTick(id) ? deltas[index] ?? 0 : 0), 0) / 1000;
  const hits = new Map<number, number>();
  for (const id of samples) hits.set(id, (hits.get(id) ?? 0) + 1);
  const top = [...hits].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, count]) => ({ count, frame: byId.get(id)?.callFrame, stack: frames(id).map(frame => frame?.functionName).slice(0, 8) }));
  console.log(JSON.stringify({ driverRun: JSON.parse(stdout), inspector: { requestedIntervalUs: 1000, wallSeconds: +(wallMs / 1000).toFixed(3),
    profileDurationSeconds: +((profile.endTime - profile.startTime) / 1e6).toFixed(3), totalSamples: samples.length,
    tickFrames: tickNodeIds.map(id => ({ id, frame: byId.get(id)?.callFrame, stack: frames(id).map(frame => frame?.functionName) })),
    tickSamples: tickSampleCount, tickSampleIntervalEstimateMs: tickSampleCount, tickAssociatedTimeDeltasMs: +tickDeltaMs.toFixed(3), top, savedProfile: path,
    note: 'V8 Inspector sampling covers driver process startup, two-second warmup, and the timed run. Tick samples include descendants of frames literally named tick; inspect stacks to verify identity. Count × requested interval is a sampling estimate, not exact CPU time; timeDeltas sum elapsed intervals preceding those samples and may include descheduling. Whole-process ps CPU and callback elapsed are separate measures.' } }, null, 2));
} finally { ws.terminate(); }
