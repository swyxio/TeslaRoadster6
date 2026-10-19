/**
 * Local-only group leader for one startup-probe leg. Launched as the only
 * detached child by the supervisor. Wrangler and recorder deliberately inherit
 * this process group; the supervisor verifies their reported PIDs' group IDs.
 * Recorder stderr is bounded and redacted before it is written; raw output
 * and the stage secret are never sent over IPC.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const path = process.argv[2];
if (!path || !process.send || !process.env.PLAYTEST_STAGE_SECRET) throw new Error('invalid leg runner setup');
const cfg = JSON.parse(await readFile(path, 'utf8'));
const secret = process.env.PLAYTEST_STAGE_SECRET;
if (!/^[0-9a-f]{64}$/.test(secret) || typeof cfg.recorderStderrPath !== 'string') throw new Error('invalid recorder diagnostic configuration');
const workerEnv = { ...process.env };
delete workerEnv.PLAYTEST_STAGE_SECRET;
let worker, recorder, disconnected = false;
const send = value => { if (process.connected) process.send(value); };
const killDirect = () => {
  for (const state of [recorder, worker]) if (state && !state.child.killed) { try { state.child.kill('SIGTERM'); } catch {} }
};
process.on('disconnect', () => { disconnected = true; killDirect(); process.exit(1); });
process.on('SIGTERM', () => { killDirect(); process.exit(1); });
process.on('SIGINT', () => { killDirect(); process.exit(1); });

// Hold the last secret.length - 1 characters so a secret split between data
// events is never written in pieces. Only sanitized bytes reach the file.
function captureRecorderStderr(outputPath) {
  const fd = openSync(outputPath, 'wx', 0o600), decoder = new StringDecoder('utf8');
  const cap = 64 * 1024; let pending = '', written = 0, truncated = false, redactions = 0, closed = false;
  function emit(value) {
    const bytes = Buffer.from(value, 'utf8'), allowed = Math.min(bytes.length, cap - written);
    if (allowed < bytes.length) truncated = true;
    let offset = 0;
    while (offset < allowed) {
      const count = writeSync(fd, bytes, offset, allowed - offset);
      if (count <= 0) throw new Error('recorder-stderr-write-failed');
      offset += count;
    }
    written += allowed;
  }
  function drain(final) {
    const cutoff = final ? pending.length : Math.max(0, pending.length - secret.length + 1);
    const pattern = new RegExp(secret, 'gi'); let match, position = 0;
    while ((match = pattern.exec(pending)) && match.index < cutoff) {
      emit(pending.slice(position, match.index)); emit('[redacted]');
      redactions++; position = match.index + match[0].length;
    }
    if (position < cutoff) { emit(pending.slice(position, cutoff)); position = cutoff; }
    pending = pending.slice(position);
    fsyncSync(fd);
  }
  return {
    add(bytes) { pending += decoder.write(bytes); drain(false); },
    finish() { if (closed) return; pending += decoder.end(); drain(true); closeSync(fd); closed = true; },
    abandon() { if (!closed) { try { closeSync(fd); } catch {} closed = true; } },
    stats() { return { capturedBytes: written, truncated, redactions }; },
  };
}
function start(label, executable, args, cwd, env) {
  const capture = label === 'recorder' ? captureRecorderStderr(cfg.recorderStderrPath) : null;
  let child;
  try { child = spawn(executable, args, { cwd, env, detached: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { capture?.abandon(); throw error; }
  if (!child.pid) { child.once('error', () => {}); capture?.abandon(); throw new Error(`${label}-spawn-failed`); }
  const state = { child, label, pid: child.pid, exited: false, closed: false, code: null, signal: null, error: false, stdoutBytes: 0, stderrBytes: 0, stderrCaptureError: false };
  child.stdout.on('data', bytes => { state.stdoutBytes += bytes.length; });
  child.stderr.on('data', bytes => {
    state.stderrBytes += bytes.length;
    if (capture && !state.stderrCaptureError) {
      try { capture.add(bytes); }
      catch { state.stderrCaptureError = true; capture.abandon(); send({ type: 'recorder-stderr-capture-failed' }); }
    }
  });
  if (capture) child.stderr.on('error', () => {
    if (!state.stderrCaptureError) { state.stderrCaptureError = true; capture.abandon(); send({ type: 'recorder-stderr-capture-failed' }); }
  });
  state.done = new Promise(done => {
    child.once('error', () => { state.error = true; });
    child.once('exit', () => { state.exited = true; });
    child.once('close', (code, signal) => {
      state.closed = true; state.code = code; state.signal = signal;
      if (capture && !state.stderrCaptureError) {
        try { capture.finish(); }
        catch { state.stderrCaptureError = true; capture.abandon(); }
      }
      send({ type: 'child-exit', role: label, code, signal, error: state.error, stdoutBytes: state.stdoutBytes, stderrBytes: state.stderrBytes,
        ...(capture ? { stderrCaptureError: state.stderrCaptureError, stderrCapture: capture.stats() } : {}) });
      done(state);
    });
  });
  send({ type: 'child-start', role: label, pid: state.pid });
  return state;
}
try {
  worker = start('worker', cfg.node, cfg.workerArgs, cfg.workerCwd, workerEnv);
  let begin;
  const starting = new Promise(resolve => { begin = resolve; });
  process.on('message', message => { if (message?.type === 'start-recorder') begin(); });
  await starting;
  if (disconnected || worker.closed) throw new Error('worker-ended-before-recorder');
  try { recorder = start('recorder', cfg.node, cfg.recorderArgs, cfg.recorderCwd, { ...process.env, PLAYTEST_STAGE_SECRET: secret }); }
  catch (error) { send({ type: 'recorder-start-failed' }); throw error; }
  const result = await recorder.done;
  send({ type: 'capture-finished', code: result.code, signal: result.signal, error: result.error });
  // The supervisor tears down the entire dedicated process group and verifies
  // it has disappeared. Stay alive so its group identity remains anchored.
  await new Promise(resolve => process.once('disconnect', resolve));
} catch {
  send({ type: 'runner-failed' });
  killDirect();
  process.exitCode = 1;
}
