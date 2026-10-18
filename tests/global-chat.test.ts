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
  source = source.replace("'../shared/achievements'", JSON.stringify(new URL('../shared/achievements.ts', import.meta.url).href));
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
      const session = { ip: 'test', lastActivity: Date.now(), authenticating: false, ready: false, saving: false, updates: Promise.resolve(), authFailures: 0, inboundStart: Date.now(), inboundCount: 0, warnedRate: false, messageTimes: [], handshakeTimer: null };
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
    limited.playerId = crypto.randomUUID(); limited.name = 'New driver'; limited.ready = true;
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

    // Awards are tied to an authenticated saved identity, and room tickets are
    // private, one-use grants rather than names or recovery credentials.
    const awardsHub = new GlobalChat({ storage });
    const owner = makeSocket(), ownerSession = attach(awardsHub, owner);
    const other = makeSocket(), otherSession = attach(awardsHub, other);
    await awardsHub.hello(owner, ownerSession, 'Award Driver');
    await awardsHub.hello(other, otherSession, 'Another Driver');
    awardsHub.onMessage(owner, JSON.stringify({ type: 'awardTicket', requestId: 1 }));
    await ownerSession.updates;
    assert.match(owner.sent.at(-1).message, /Save your driver/);
    await awardsHub.save(owner, ownerSession);
    await awardsHub.save(other, otherSession);
    const ownerCode = owner.sent.find(event => event.type === 'recovery').code as string;
    const ownerId = owner.sent.find(event => event.type === 'ready').playerId as string;
    const otherId = other.sent.find(event => event.type === 'ready').playerId as string;
    assert.notEqual(ownerId, otherId);
    awardsHub.onMessage(owner, JSON.stringify({ type: 'awardTicket', requestId: 2 }));
    await ownerSession.updates;
    const firstTicket = owner.sent.at(-1);
    assert.equal(firstTicket.requestId, 2);
    assert.match(firstTicket.ticket, /^[0-9a-f]{64}$/);
    assert.notEqual(firstTicket.ticket, parseRecoveryCode(ownerCode)!.secret);
    assert.ok(!other.sent.some(event => event.type === 'awardTicket'));
    assert.equal(awardsHub.consumeAwardTicket(firstTicket.ticket), ownerId);
    assert.equal(awardsHub.consumeAwardTicket(firstTicket.ticket), null, 'a grant cannot be replayed');
    awardsHub.onMessage(owner, JSON.stringify({ type: 'awardTicket', requestId: 3 }));
    await ownerSession.updates;
    const replacedTicket = owner.sent.at(-1).ticket;
    awardsHub.onMessage(owner, JSON.stringify({ type: 'awardTicket', requestId: 4 }));
    await ownerSession.updates;
    const expiredTicket = owner.sent.at(-1).ticket;
    assert.equal(awardsHub.consumeAwardTicket(replacedTicket), null, 'a new grant revokes the old grant');
    awardsHub.awardTickets.get(expiredTicket).expiresAt = Date.now() - 1;
    assert.equal(awardsHub.consumeAwardTicket(expiredTicket), null, 'expired grants cannot be consumed');

    // Chat clients cannot self-report an award: only the room RPC can record it.
    awardsHub.onMessage(owner, JSON.stringify({ type: 'soloAwards', achievements: ['regular'] }));
    await ownerSession.updates;
    assert.match(owner.sent.at(-1).message, /Unknown chat request/);
    assert.equal(data.get(`awards:${ownerId}`), undefined);
    const roomAwards = await awardsHub.recordRoomAwards(ownerId, ['regular', 'sky-delivery', 'regular']);
    assert.deepEqual(roomAwards, ['sky-delivery', 'regular']);
    assert.ok(!other.sent.some(event => event.type === 'awards' && event.awards.length));
    assert.deepEqual(await awardsHub.recordRoomAwards(ownerId, ['regular']), roomAwards, 'repeated awards are idempotent');
    await assert.rejects(awardsHub.recordRoomAwards(ownerId, ['not-real']), /Invalid award request/);
    await assert.rejects(awardsHub.recordRoomAwards(crypto.randomUUID(), ['regular']), /Saved driver unavailable/);
    assert.deepEqual(data.get(`awards:${ownerId}`), roomAwards);
    assert.equal(data.get(`awards:${otherId}`), undefined);
    assert.doesNotMatch(JSON.stringify([...data.values()]), new RegExp(parseRecoveryCode(ownerCode)!.secret));

    // Concurrent writes cannot lose one another; a rejected write sends no
    // success notification and remains retryable.
    let unblockAward!: () => void;
    const blockedAward = new Promise<void>(resolve => { unblockAward = resolve; });
    let holdFirst = true, failAward = false;
    const guardedStorage = { get: storage.get, put: async (key: string, value: unknown) => {
      if (key === `awards:${ownerId}` && failAward) throw new Error('injected storage failure');
      if (key === `awards:${ownerId}` && holdFirst) { holdFirst = false; await blockedAward; }
      await storage.put(key, value);
    } };
    const guardedHub = new GlobalChat({ storage: guardedStorage });
    const guarded = makeSocket(), guardedSession = attach(guardedHub, guarded);
    await guardedHub.hello(guarded, guardedSession, '', ownerCode);
    assert.deepEqual(guarded.sent.find(event => event.type === 'ready').awards, roomAwards);
    const firstWrite = guardedHub.recordRoomAwards(ownerId, ['bay-hopper']);
    const secondWrite = guardedHub.recordRoomAwards(ownerId, ['rocket-rookie']);
    await new Promise(resolve => setTimeout(resolve, 0));
    unblockAward();
    await Promise.all([firstWrite, secondWrite]);
    assert.deepEqual(data.get(`awards:${ownerId}`), ['bay-hopper', 'sky-delivery', 'regular', 'rocket-rookie']);
    failAward = true;
    const notices = guarded.sent.filter(event => event.type === 'awards').length;
    await assert.rejects(guardedHub.recordRoomAwards(ownerId, ['to-mars']), /storage failure/);
    assert.equal(guarded.sent.filter(event => event.type === 'awards').length, notices);
    assert.ok(!(data.get(`awards:${ownerId}`) as string[]).includes('to-mars'));
    failAward = false;
    await guardedHub.recordRoomAwards(ownerId, ['to-mars']);
    assert.ok(guarded.sent.at(-1).awards.includes('to-mars'));
    guardedHub.onMessage(guarded, JSON.stringify({ type: 'rename', name: 'Award Driver Renamed', requestId: 8 }));
    await guardedSession.updates;
    assert.equal(guarded.sent.find(event => event.type === 'renamed').name, 'Award Driver Renamed');
    assert.ok(guarded.sent.at(-1).awards.includes('to-mars'), 'renaming refreshes the same profile');
    guardedHub.onMessage(guarded, JSON.stringify({ type: 'awardTicket', requestId: 5 }));
    await guardedSession.updates;
    const disconnectedTicket = guarded.sent.at(-1).ticket;
    guardedHub.disconnect(guarded);
    assert.equal(guardedHub.consumeAwardTicket(disconnectedTicket), null, 'disconnect revokes the grant');
    const restoredHub = new GlobalChat({ storage });
    const restored = makeSocket(), restoredSession = attach(restoredHub, restored);
    await restoredHub.hello(restored, restoredSession, '', ownerCode);
    assert.equal(restored.sent.at(-1).name, 'Award Driver Renamed');
    assert.ok(restored.sent.at(-1).awards.includes('to-mars'));
    assert.ok(restored.sent.at(-1).awards.includes('bay-hopper'));

    // A broken awards read does not masquerade as an empty profile or block
    // the chat identity. The driver can retry when storage recovers.
    let failRead = true;
    const readHub = new GlobalChat({ storage: { get: async (key: string) => {
      if (key === `awards:${ownerId}` && failRead) throw new Error('injected read failure');
      return storage.get(key);
    }, put: storage.put } });
    const readSocket = makeSocket(), readSession = attach(readHub, readSocket);
    await readHub.hello(readSocket, readSession, '', ownerCode);
    assert.equal(readSocket.sent.find(event => event.type === 'ready').awards, null);
    assert.equal(readSocket.sent.at(-1).code, 'awards_failed');
    failRead = false;
    readHub.onMessage(readSocket, JSON.stringify({ type: 'getAwards' }));
    await readSession.updates;
    assert.ok(readSocket.sent.at(-1).awards.includes('bay-hopper'));
  } finally {
    Reflect.deleteProperty(crypto.subtle, 'timingSafeEqual');
  }
});
