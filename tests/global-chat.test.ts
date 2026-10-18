import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAvailableName, createRecoveryCode, hashRecoverySecret, normalizeChatText, normalizeName, parseRecoveryCode } from '../worker/global-chat-core';

test('names are legible, bounded and live collisions get an available suffix', () => {
  assert.equal(normalizeName('  ＡＬＩＣＥ\u200b \n  Roadster '), 'ALICE Roadster');
  assert.equal(normalizeName('\u200b\n '), 'Driver');
  assert.equal(chooseAvailableName('Alice', ['alice', 'ALICE #2']), 'Alice #3');
  assert.equal(chooseAvailableName('12345678901234567890', ['12345678901234567890']), '12345678901234567 #2');
  assert.equal(Array.from(normalizeName('🚗'.repeat(30))).length, 20);
});

test('chat strips invisible controls, preserves text, and rejects empty or oversized messages', () => {
  assert.equal(normalizeChatText('  <hello>\n\u200fworld  '), '<hello> world');
  assert.equal(normalizeChatText('\u200b  '), null);
  assert.equal(normalizeChatText('🚗'.repeat(240)), '🚗'.repeat(240));
  assert.equal(normalizeChatText('🚗'.repeat(241)), null);
});

test('recovery codes carry a random 256-bit secret and validate exact format', async () => {
  const playerId = crypto.randomUUID();
  const first = createRecoveryCode(playerId);
  const second = createRecoveryCode(playerId);
  assert.notEqual(first, second);
  const parsed = parseRecoveryCode(first);
  assert.equal(parsed?.playerId, playerId);
  assert.equal(parsed?.secret.length, 64);
  assert.equal(parseRecoveryCode(first + 'garbage'), null);
  assert.equal(parseRecoveryCode('poly-fake.' + 'a'.repeat(64)), null);
  const hash = await hashRecoverySecret(parsed!.secret);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, parsed!.secret);
  assert.notEqual(hash, await hashRecoverySecret(parseRecoveryCode(second)!.secret));
});

// Workers' `cloudflare:workers` module cannot be imported by Node. Transpile the
// exact DO implementation with only its runtime base replaced; live Wrangler
// integration separately exercises real sockets and durable storage.
test('socket teardown and racing recovery retain one live owner and persistent hash only', async () => {
  const { readFile } = await import('node:fs/promises');
  const { timingSafeEqual } = await import('node:crypto');
  const ts = (await import('typescript')).default;
  let source = await readFile(new URL('../worker/global-chat.ts', import.meta.url), 'utf8');
  const workerImport = "import { DurableObject } from 'cloudflare:workers';";
  assert.ok(source.includes(workerImport));
  source = source.replace(workerImport, 'class DurableObject { constructor(ctx) { this.ctx = ctx; } }');
  source = source.replace("'./global-chat-core'", JSON.stringify(new URL('../worker/global-chat-core.ts', import.meta.url).href));
  const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const { GlobalChat } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  Object.defineProperty(crypto.subtle, 'timingSafeEqual', { configurable: true, value: (a: Uint8Array, b: Uint8Array) => timingSafeEqual(a, b) });
  try {
    const data = new Map<string, unknown>();
    const storage = { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } };
    const makeSocket = () => ({
      sent: [] as any[], closed: 0,
      send(message: string) { this.sent.push(JSON.parse(message)); },
      close() { this.closed++; },
    });
    const attach = (chat: any, socket: ReturnType<typeof makeSocket>) => {
      const session = { ip: 'test', lastActivity: Date.now(), authenticating: false, saving: false, updates: Promise.resolve(), authFailures: 0, inboundStart: Date.now(), inboundCount: 0, warnedRate: false, messageTimes: [], handshakeTimer: null };
      chat.sessions.set(socket, session);
      return session;
    };
    const chat = new GlobalChat({ storage });
    const a = makeSocket(), aSession = attach(chat, a);
    await chat.hello(a, aSession, 'Driver One');
    await chat.save(a, aSession);
    const code = a.sent.find(message => message.type === 'recovery').code as string;
    const ready = a.sent.find(message => message.type === 'ready');
    chat.onMessage(a, JSON.stringify({ type: 'save' }));
    assert.equal(a.sent.at(-1).code, code);
    assert.equal(data.size, 1);
    assert.doesNotMatch(JSON.stringify([...data.values()]), new RegExp(parseRecoveryCode(code)!.secret));

    const b = makeSocket(), c = makeSocket(), bSession = attach(chat, b), cSession = attach(chat, c);
    await chat.hello(b, bSession, '', code);
    assert.match(b.sent.at(-1).message, /already connected/);
    assert.equal(b.sent.at(-1).code, 'identity_active');
    let timerFired = false;
    aSession.handshakeTimer = setTimeout(() => { timerFired = true; }, 10);
    chat.disconnect(a);
    assert.equal(a.closed, 1);
    await Promise.all([chat.hello(b, bSession, '', code), chat.hello(c, cSession, '', code)]);
    assert.equal([b, c].filter(socket => socket.sent.some(message => message.type === 'ready')).length, 1);
    assert.equal([b, c].filter(socket => socket.sent.at(-1)?.message?.includes('already connected')).length, 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(timerFired, false);

    // A fresh object has no chat history but can resume the saved identity.
    const restarted = new GlobalChat({ storage });
    const d = makeSocket(), dSession = attach(restarted, d);
    await restarted.hello(d, dSession, '', code);
    const recovered = d.sent.find(message => message.type === 'ready');
    assert.equal(recovered.playerId, ready.playerId);
    assert.equal(recovered.name, ready.name);
    assert.deepEqual(recovered.messages, []);
    // Repeated save requests return the same credential, even after resume.
    // They must not invalidate a previously saved code if a socket drops.
    restarted.globalIdentityBucket.count = 240;
    restarted.onMessage(d, JSON.stringify({ type: 'save' }));
    assert.equal(d.sent.at(-1).code, code, 'existing drivers can retrieve their code even at the creation limit');
    restarted.disconnect(d);
    const e = makeSocket(), eSession = attach(restarted, e);
    const wrongCode = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
    await restarted.hello(e, eSession, '', wrongCode);
    assert.match(e.sent.at(-1).message, /not recognized/);
    await restarted.hello(e, eSession, '', code);
    assert.equal(e.sent.at(-1).playerId, ready.playerId);

    // Bounds are independent: one shared address has headroom for 24 sockets,
    // 30 first-time saves/hour, and all addresses share 240 saves/hour.
    const limits = new GlobalChat({ storage });
    const now = Date.now();
    const crowded = Array.from({ length: 24 }, () => {
      const socket = makeSocket(), session = attach(limits, socket);
      session.lastActivity = now - 180_001;
      return { socket, session };
    });
    assert.equal(limits.hasRoomForIp('test'), false);
    assert.equal(limits.hasRoomForIp('another-address'), true);
    crowded[0].session.playerId = crypto.randomUUID();
    crowded[0].session.name = 'Awake';
    limits.onMessage(crowded[0].socket, JSON.stringify({ type: 'ping' }));
    limits.reapTimer = setInterval(() => {}, 60_000);
    limits.reap(now);
    assert.equal(limits.sessions.size, 1, 'ping retains the active socket while stale ones close');
    assert.equal(crowded.slice(1).every(item => item.socket.closed === 1), true);
    assert.ok(limits.reapTimer, 'timer remains while any socket is active');
    limits.reap(Date.now() + 180_001);
    assert.equal(limits.sessions.size, 0);
    assert.equal(limits.reapTimer, null, 'last disconnect clears the reaper timer');

    for (let i = 0; i < 30; i++) assert.equal(limits.allowIdentityCreation('shared-address', now), true);
    assert.equal(limits.allowIdentityCreation('shared-address', now), false);
    assert.equal(limits.allowIdentityCreation('shared-address', now + 3_600_001), true, 'hourly quota resets');
    const globalLimit = new GlobalChat({ storage });
    // Its global bucket starts at construction, so use a timestamp no earlier
    // than construction even when a loaded CI runner pauses between statements.
    const globalNow = Date.now();
    for (let i = 0; i < 240; i++) assert.equal(globalLimit.allowIdentityCreation(`address-${i}`, globalNow), true);
    assert.equal(globalLimit.allowIdentityCreation('one-more', globalNow), false);
    const limitedSocket = makeSocket(), limited = attach(globalLimit, limitedSocket);
    limited.playerId = crypto.randomUUID(); limited.name = 'New driver';
    globalLimit.onMessage(limitedSocket, JSON.stringify({ type: 'save' }));
    assert.match(limitedSocket.sent.at(-1).message, /temporarily limited/);
    assert.equal(globalLimit.allowIdentityCreation('one-more', globalNow + 3_600_001), true);

    // Hold the durable rename write so a later message arrives while the old
    // name is still committed. The socket's order must remain observable.
    let releaseWrite!: () => void;
    const held = new Promise<void>(resolve => { releaseWrite = resolve; });
    const orderedHub = new GlobalChat({ storage: { get: storage.get, put: async (key: string, value: unknown) => { await held; await storage.put(key, value); } } });
    const sender = makeSocket(), observer = makeSocket();
    const senderSession = attach(orderedHub, sender), observerSession = attach(orderedHub, observer);
    await orderedHub.hello(sender, senderSession, '', code);
    await orderedHub.hello(observer, observerSession, 'Observer');
    orderedHub.onMessage(sender, JSON.stringify({ type: 'message', text: 'before' }));
    orderedHub.onMessage(sender, JSON.stringify({ type: 'rename', name: 'New Name', requestId: 7 }));
    orderedHub.onMessage(sender, JSON.stringify({ type: 'message', text: 'after' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(observer.sent.some(event => event.type === 'message' && event.message.text === 'before'));
    assert.ok(!observer.sent.some(event => event.type === 'message' && event.message.text === 'after'));
    orderedHub.disconnect(sender);
    const reconnecting = makeSocket(), reconnectingSession = attach(orderedHub, reconnecting);
    await orderedHub.hello(reconnecting, reconnectingSession, '', code);
    assert.equal(reconnecting.sent.at(-1).code, 'identity_active', 'identity stays reserved while accepted work drains');
    orderedHub.onMessage(observer, JSON.stringify({ type: 'message', text: 'other' }));
    await observerSession.updates;
    const beforeRelease = Date.now();
    releaseWrite();
    await senderSession.updates;
    const orderedMessages = observer.sent.filter(event => event.type === 'message');
    assert.deepEqual(orderedMessages.map(event => [event.message.text, event.message.name]), [['before', 'Driver One'], ['other', 'Observer'], ['after', 'New Name']]);
    assert.ok(orderedMessages.at(-1).message.time >= beforeRelease, 'message time reflects when it was broadcast');
    assert.ok(!sender.sent.some(event => event.type === 'renamed'), 'closed sender is not acknowledged');
    await orderedHub.hello(reconnecting, reconnectingSession, '', code);
    assert.equal(reconnecting.sent.at(-1).name, 'New Name', 'recovery sees the completed rename');
  } finally {
    Reflect.deleteProperty(crypto.subtle, 'timingSafeEqual');
  }
});
