// Run from the project root after pnpm install/build:
//   pnpm exec tsx tests/chat-restart.integration.ts
// Starts only its own local Wrangler on an ephemeral loopback port, with a new
// temporary persistence directory; never contacts a deployed Worker.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let interrupted = false;
const onInterrupt = () => { interrupted = true; };
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onInterrupt);

async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('Interrupted');
    if (await check()) return;
    await delay(40);
  }
  throw new Error(`Timed out: ${label}`);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

// Give each Wrangler its own process group. Signals target only that group,
// never another developer's server or a process selected by port/name.
function signalGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}
async function waitForExit(child: ChildProcess, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    await delay(40);
  }
  return child.exitCode !== null || child.signalCode !== null;
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalGroup(child, 'SIGINT');
  if (await waitForExit(child, 4000)) return;
  signalGroup(child, 'SIGTERM');
  if (await waitForExit(child, 2000)) return;
  signalGroup(child, 'SIGKILL');
  if (!await waitForExit(child, 2000)) throw new Error('Could not stop the isolated Wrangler process');
}

const readyChildren = new WeakSet<ChildProcess>();
function start(port: number, statePath: string) {
  const cli = resolve('node_modules/wrangler/bin/wrangler.js');
  const child = spawn(process.execPath, [cli, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', statePath, '--log-level', 'info', '--show-interactive-dev-session', 'false'], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true', BROWSER: 'none' },
  });
  // Only inspect the startup banner, then drain output without retaining or
  // printing request data. This prevents an existing service on a raced port
  // from masquerading as the newly started child.
  let startup = '';
  child.stdout?.on('data', chunk => {
    if (readyChildren.has(child)) return;
    startup = (startup + String(chunk)).slice(-2048);
    if (startup.includes(`Ready on http://127.0.0.1:${port}`)) {
      readyChildren.add(child);
      startup = '';
    }
  });
  child.stderr?.on('data', () => {});
  return child;
}

async function waitForServer(child: ChildProcess, base: string) {
  await until(async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Isolated Wrangler exited before becoming ready');
    if (!readyChildren.has(child)) return false;
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
      return response.ok && (await response.json() as { ok?: boolean }).ok === true;
    } catch { return false; }
  }, 'isolated Wrangler startup', 25_000);
}

type ChatEvent = { type: string; playerId?: string; name?: string; code?: string; messages?: unknown[]; message?: { text?: string } };
function connect(url: string) {
  const socket = new WebSocket(url);
  const events: ChatEvent[] = [];
  socket.addEventListener('message', event => events.push(JSON.parse(String(event.data)) as ChatEvent));
  return { socket, events };
}
function send(socket: WebSocket, message: object) { socket.send(JSON.stringify(message)); }

const statePath = await mkdtemp(join(tmpdir(), 'poly-chat-restart-'));
let child: ChildProcess | undefined;
const sockets: WebSocket[] = [];
try {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const chatUrl = `ws://127.0.0.1:${port}/api/chat`;
  child = start(port, statePath);
  await waitForServer(child, base);
  const first = connect(chatUrl);
  sockets.push(first.socket);
  await until(() => first.socket.readyState === WebSocket.OPEN, 'first chat opens');
  const name = `Restart${randomUUID().slice(0, 8)}`;
  send(first.socket, { type: 'hello', name });
  await until(() => first.events.some(event => event.type === 'ready'), 'guest identity');
  const guest = first.events.find(event => event.type === 'ready')!;
  assert.equal(guest.name, name);
  assert.ok(guest.playerId);
  const marker = `history-${randomUUID()}`;
  send(first.socket, { type: 'message', text: marker });
  await until(() => first.events.some(event => event.type === 'message' && event.message?.text === marker), 'message before restart');
  send(first.socket, { type: 'save' });
  const renamed = `Again${randomUUID().slice(0, 8)}`;
  send(first.socket, { type: 'rename', name: renamed });
  await until(() => first.events.some(event => event.type === 'recovery'), 'recovery code');
  const code = first.events.find(event => event.type === 'recovery')!.code;
  assert.ok(code);
  await until(() => first.events.some(event => event.type === 'renamed'), 'renamed driver before restart');
  assert.equal(first.events.find(event => event.type === 'renamed')?.playerId, guest.playerId);
  await stop(child);
  child = undefined;

  child = start(port, statePath);
  await waitForServer(child, base);
  const second = connect(chatUrl);
  sockets.push(second.socket);
  await until(() => second.socket.readyState === WebSocket.OPEN, 'chat opens after restart');
  send(second.socket, { type: 'hello', name: 'Ignored on recovery', code });
  await until(() => second.events.some(event => event.type === 'ready' || event.type === 'error'), 'saved driver after restart');
  const recovered = second.events.find(event => event.type === 'ready');
  assert.ok(recovered, 'saved recovery code must be accepted after the restart');
  assert.equal(recovered.playerId, guest.playerId);
  assert.equal(recovered.name, renamed);
  assert.deepEqual(recovered.messages, [], 'chat history must not survive a restart');
  console.log('PASS: real local Wrangler restart preserved saved player ID/name and discarded chat history.');
} finally {
  for (const socket of sockets) if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  if (child) await stop(child);
  await rm(statePath, { recursive: true, force: true });
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onInterrupt);
}
