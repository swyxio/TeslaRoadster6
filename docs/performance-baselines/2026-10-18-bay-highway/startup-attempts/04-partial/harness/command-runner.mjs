// Hold the supervisor-owned process group alive even when its command exits
// before a census. The command inherits this group and its output is forwarded
// without alteration. The supervisor terminates the group after collecting the
// result or on any abort; this process is not a retry mechanism.
import { spawn } from 'node:child_process';

const [executable, ...args] = process.argv.slice(2);
if (!executable || !process.send) throw new Error('invalid command runner setup');
let child;
const shutdown = () => {
  if (child && !child.killed) { try { child.kill('SIGTERM'); } catch {} }
  process.exit(1);
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.once('disconnect', shutdown);
let error = false, result;
try {
  child = spawn(executable, args, { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(process.stdout, { end: false });
  child.stderr.pipe(process.stderr, { end: false });
  result = await new Promise(resolve => {
    child.once('error', () => { error = true; });
    child.once('close', (code, signal) => resolve({ code, signal, error }));
  });
} catch { result = { code: null, signal: null, error: true }; }
// Flush and close the output pipes; the supervisor also waits for their end
// before consuming this result so no output is lost to cross-pipe ordering.
await Promise.all([
  new Promise(resolve => process.stdout.end(resolve)),
  new Promise(resolve => process.stderr.end(resolve)),
]);
if (!process.connected) process.exit(1);
process.send({ type: 'command-result', ...result });
// Keep the process-group anchor alive until the supervisor signals cleanup.
await new Promise(resolve => process.once('disconnect', resolve));
