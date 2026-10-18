// Run against local Wrangler: pnpm exec tsx tests/chat.integration.ts [http://localhost:8787]
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomUUID } from 'node:crypto';

type Event = { type: string; [key: string]: any };
const base = process.argv[2] ?? 'http://localhost:8787';
const chatUrl = base.replace(/^http/, 'ws') + '/api/chat';
const sockets: WebSocket[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, label: string, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
function connect(url: string) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const events: Event[] = [];
  let closed: number | undefined;
  socket.addEventListener('message', event => events.push(JSON.parse(String(event.data)) as Event));
  socket.addEventListener('close', event => { closed = event.code; });
  return { socket, events, get closed() { return closed; } };
}
function send(socket: WebSocket, message: object) { socket.send(JSON.stringify(message)); }
async function open(client: ReturnType<typeof connect>) {
  await eventually(() => client.socket.readyState === WebSocket.OPEN, 'WebSocket opens');
}
async function rejectedCrossOrigin() {
  const url = new URL('/api/chat', base);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<number>((resolve, reject) => {
    const req = request(url, { headers: {
      Origin: 'https://unrelated.invalid', Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    } }, res => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on('upgrade', (_res, socket) => { socket.destroy(); reject(new Error('Cross-origin WebSocket unexpectedly upgraded')); });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Cross-origin check timed out')));
    req.end();
  });
}

const name = `Test${randomUUID().slice(0, 8)}`;
const one = connect(chatUrl), two = connect(chatUrl);
try {
  await Promise.all([open(one), open(two)]);
  send(one.socket, { type: 'hello', name });
  await eventually(() => one.events.some(event => event.type === 'ready'), 'first chat identity');
  send(two.socket, { type: 'hello', name: name.toLowerCase() });
  await eventually(() => two.events.some(event => event.type === 'ready'), 'second chat identity');
  const first = one.events.find(event => event.type === 'ready')!;
  const second = two.events.find(event => event.type === 'ready')!;
  assert.equal(first.name, name);
  assert.equal(second.name, `${name.toLowerCase()} #2`, 'case-insensitive collision is disambiguated');
  assert.notEqual(first.playerId, second.playerId);
  send(one.socket, { type: 'ping' });

  const text = `Hello from ${name}`;
  send(one.socket, { type: 'message', text });
  await eventually(() => [one, two].every(client => client.events.some(event => event.type === 'message' && event.message?.text === text)), 'both clients receive global chat');
  assert.ok(!one.events.some(event => event.type === 'error'), 'heartbeat is accepted without a reply or error');
  const received = two.events.find(event => event.type === 'message' && event.message?.text === text)!;
  assert.equal(received.message.playerId, first.playerId);
  assert.equal(received.message.name, first.name);

  send(one.socket, { type: 'save' });
  await eventually(() => one.events.some(event => event.type === 'recovery'), 'private recovery code');
  const code = one.events.find(event => event.type === 'recovery')!.code as string;
  assert.match(code, /^poly-[0-9a-f-]{36}\.[0-9a-f]{64}$/);
  assert.ok(code.startsWith(`poly-${first.playerId}.`));
  send(one.socket, { type: 'save' });
  await eventually(() => one.events.filter(event => event.type === 'recovery').length === 2, 'repeated save returns a code');
  assert.equal(one.events.filter(event => event.type === 'recovery')[1].code, code, 'repeated save does not rotate the code');
  await delay(200);
  assert.ok(!two.events.some(event => event.type === 'recovery' || JSON.stringify(event).includes(code)), 'recovery code is not broadcast');

  one.socket.close();
  await eventually(() => one.closed !== undefined, 'first chat disconnects');
  const resumed = connect(chatUrl);
  await open(resumed);
  send(resumed.socket, { type: 'hello', name: 'Ignored on recovery', code });
  await eventually(() => resumed.events.some(event => event.type === 'ready' || event.type === 'error'), 'saved identity resumes');
  const restored = resumed.events.find(event => event.type === 'ready');
  assert.ok(restored, 'valid recovery succeeds');
  assert.equal(restored.playerId, first.playerId);
  assert.equal(restored.name, first.name);
  send(resumed.socket, { type: 'save' });
  await eventually(() => resumed.events.some(event => event.type === 'recovery'), 'saving after recovery returns a code');
  assert.equal(resumed.events.find(event => event.type === 'recovery')!.code, code, 'save after recovery retains the code');

  const bad = connect(chatUrl);
  await open(bad);
  const invalidCode = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
  send(bad.socket, { type: 'hello', name, code: invalidCode });
  await eventually(() => bad.events.some(event => event.type === 'error'), 'invalid recovery rejected');
  assert.ok(!bad.events.some(event => event.type === 'ready'), 'invalid recovery does not receive an identity');
  assert.equal(await rejectedCrossOrigin(), 403, 'cross-origin WebSocket rejected');

  // Room labels use the same case-insensitive collision policy, independently of
  // authenticated chat identities. Two players can still choose any room code.
  const roomUrl = base.replace(/^http/, 'ws') + `/api/room/chat-${Date.now()}`;
  const roomOne = connect(roomUrl), roomTwo = connect(roomUrl);
  await Promise.all([open(roomOne), open(roomTwo)]);
  await eventually(() => [roomOne, roomTwo].every(client => client.events.some(event => event.type === 'welcome')), 'two room players join');
  const roomIdOne = roomOne.events.find(event => event.type === 'welcome')!.id;
  const roomIdTwo = roomTwo.events.find(event => event.type === 'welcome')!.id;
  send(roomOne.socket, { type: 'name', name });
  await eventually(() => roomOne.events.some(event => event.type === 'state' && event.world?.players?.some((player: Event) => player.id === roomIdOne && player.name === name)), 'first room name');
  send(roomTwo.socket, { type: 'name', name: name.toLowerCase() });
  await eventually(() => roomTwo.events.some(event => event.type === 'state' && event.world?.players?.some((player: Event) => player.id === roomIdTwo && player.name === `${name.toLowerCase()} #2`)), 'room name collision resolved');
  console.log('PASS: global chat delivery, name collisions, private saved identity and recovery, invalid-code isolation, cross-origin rejection, and room name collisions.');
} finally {
  for (const socket of sockets) socket.close();
}
