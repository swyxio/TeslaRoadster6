import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GlobalChat, type ChatStatus } from '../src/chat';

class Socket extends EventTarget {
  static OPEN = 1;
  static CLOSED = 3;
  static sockets: Socket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(_url: string) { super(); Socket.sockets.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 2; }
  open() { this.readyState = Socket.OPEN; this.onopen?.(new Event('open')); }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
  finishClose() {
    this.readyState = Socket.CLOSED;
    this.onclose?.({} as CloseEvent);
    this.dispatchEvent(new Event('close'));
  }
  packets() { return this.sent.map(item => JSON.parse(item)); }
}

test('chat preserves saved identity across reconnect, waits for replacement, and blocks invalid recovery', () => {
  const original = {
    WebSocket: globalThis.WebSocket,
    window: globalThis.window,
    location: globalThis.location,
    clearTimeout: globalThis.clearTimeout,
    clearInterval: globalThis.clearInterval,
  };
  let nextTimer = 0;
  const timers = new Map<number, () => void>();
  const intervals = new Map<number, { fn: () => void; delay: number }>();
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: Socket });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout(fn: () => void) { const id = ++nextTimer; timers.set(id, fn); return id; }, setInterval(fn: () => void, delay: number) { const id = ++nextTimer; intervals.set(id, { fn, delay }); return id; } } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', host: 'example.test' } });
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: (id: number) => timers.delete(id) });
  Object.defineProperty(globalThis, 'clearInterval', { configurable: true, value: (id: number) => intervals.delete(id) });
  try {
    Socket.sockets = [];
    const states: ChatStatus[] = [];
    const errors: string[] = [];
    const client = new GlobalChat({
      onStatus: status => states.push(status), onReady: () => {}, onRenamed: () => {}, onMessage: () => {},
      onRecovery: () => {}, onError: error => errors.push(error),
    });
    client.connect('Sky');
    const first = Socket.sockets[0]; first.open();
    assert.deepEqual(first.packets()[0], { type: 'hello', name: 'Sky' });
    first.receive({ type: 'ready', playerId: 'id-1', name: 'Sky', messages: [] });
    assert.equal(intervals.size, 1);
    const heartbeat = [...intervals.values()][0];
    assert.equal(heartbeat.delay, 25_000);
    heartbeat.fn();
    assert.deepEqual(first.packets().at(-1), { type: 'ping' });
    assert.equal(client.save(), true);
    first.receive({ type: 'recovery', code: 'private-code' });
    assert.equal(client.rename('Sky Again'), true);
    assert.deepEqual(first.packets().at(-1), { type: 'rename', name: 'Sky Again' });
    first.receive({ type: 'renamed', playerId: 'id-1', name: 'Sky Again' });
    assert.equal(client.playerId, 'id-1');
    assert.equal(client.name, 'Sky Again');
    first.finishClose();
    assert.equal(intervals.size, 0, 'heartbeat stops on disconnect');
    heartbeat.fn();
    assert.notDeepEqual(first.packets().at(-1), { type: 'ping' }, 'stale callback cannot send');
    assert.equal(client.status, 'offline');
    assert.equal(client.send('not sent'), false);
    const reconnect = [...timers.values()][0]; timers.clear(); reconnect();
    const second = Socket.sockets[1]; second.open();
    assert.deepEqual(second.packets()[0], { type: 'hello', name: 'Sky Again', code: 'private-code' });
    second.receive({ type: 'ready', playerId: 'id-1', name: 'Sky Again', messages: [] });
    assert.equal(intervals.size, 1, 'heartbeat restarts after reconnect');
    [...intervals.values()][0].fn();
    assert.deepEqual(second.packets().at(-1), { type: 'ping' });
    assert.equal(client.send('hello'), true);
    assert.deepEqual(second.packets().at(-1), { type: 'message', text: 'hello' });
    for (let n = 0; n < 4; n++) assert.equal(client.send(`message ${n}`), true);
    assert.equal(client.send('keep this draft'), false, 'local rate limit preserves unsent input');
    assert.match(errors.at(-1)!, /Please wait/);

    client.connect('New', undefined, true);
    assert.equal(intervals.size, 0, 'heartbeat stops while replacing socket');
    assert.equal(Socket.sockets.length, 2, 'replacement waits until previous socket closes');
    second.finishClose();
    assert.equal(Socket.sockets.length, 3);
    const third = Socket.sockets[2]; third.open();
    assert.deepEqual(third.packets()[0], { type: 'hello', name: 'New' });
    third.receive({ type: 'ready', playerId: 'id-2', name: 'New', messages: [] });

    client.connect('New', 'bad-code', true);
    third.finishClose();
    const fourth = Socket.sockets[3]; fourth.open();
    assert.deepEqual(fourth.packets()[0], { type: 'hello', name: 'New', code: 'bad-code' });
    fourth.receive({ type: 'error', message: 'Recovery code not recognized.' });
    assert.equal(intervals.size, 0, 'failed recovery does not start a heartbeat');
    assert.equal(client.status, 'offline');
    assert.equal(errors.at(-1), 'Recovery code not recognized.');
    fourth.finishClose();
    assert.equal(timers.size, 0, 'failed recovery does not reconnect as a guest');
    assert.equal(Socket.sockets.length, 4);

    client.connect('New', 'correct-code', true);
    const fifth = Socket.sockets[4]; fifth.open();
    assert.deepEqual(fifth.packets()[0], { type: 'hello', name: 'New', code: 'correct-code' });
    fifth.receive({ type: 'ready', playerId: 'id-3', name: 'Restored', messages: [] });
    assert.equal(intervals.size, 1, 'successful recovery starts a heartbeat');
    assert.equal(client.name, 'Restored');
    assert.equal(client.code, 'correct-code');
    assert.ok(states.includes('connecting') && states.includes('online') && states.includes('offline'));

    client.connect('Restored', 'correct-code', true);
    fifth.finishClose();
    const sixth = Socket.sockets[5]; sixth.open();
    sixth.receive({ type: 'error', code: 'identity_active', message: 'Already connected.' });
    assert.equal(client.status, 'connecting', 'a possibly stale connection does not block recovery immediately');
    assert.equal(timers.size, 1);
    let retry = [...timers.values()][0]; timers.clear(); retry();
    assert.deepEqual(sixth.packets().at(-1), { type: 'hello', name: 'Restored', code: 'correct-code' });
    sixth.receive({ type: 'ready', playerId: 'id-3', name: 'Restored', messages: [] });
    assert.equal(client.status, 'online', 'recovery succeeds after the old server session releases');

    client.connect('Restored', 'correct-code', true);
    sixth.finishClose();
    const seventh = Socket.sockets[6]; seventh.open();
    for (let n = 0; n < 4; n++) {
      seventh.receive({ type: 'error', code: 'identity_active', message: 'Already connected.' });
      assert.equal(timers.size, 1);
      retry = [...timers.values()][0]; timers.clear(); retry();
    }
    seventh.receive({ type: 'error', code: 'identity_active', message: 'Already connected.' });
    assert.equal(client.status, 'offline', 'a persistently active identity eventually requires action');
    assert.equal(errors.at(-1), 'Already connected.');
    seventh.finishClose();
    assert.equal(timers.size, 0, 'bounded identity retries stop when action is needed');
  } finally {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original.WebSocket });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: original.window });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: original.location });
    Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: original.clearTimeout });
    Object.defineProperty(globalThis, 'clearInterval', { configurable: true, value: original.clearInterval });
  }
});
