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
      const session = { authenticating: false, saving: false, authFailures: 0, inboundStart: Date.now(), inboundCount: 0, warnedRate: false, messageTimes: [], handshakeTimer: null };
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
    restarted.onMessage(d, JSON.stringify({ type: 'save' }));
    assert.equal(d.sent.at(-1).code, code);
    restarted.disconnect(d);
    const e = makeSocket(), eSession = attach(restarted, e);
    const wrongCode = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
    await restarted.hello(e, eSession, '', wrongCode);
    assert.match(e.sent.at(-1).message, /not recognized/);
    await restarted.hello(e, eSession, '', code);
    assert.equal(e.sent.at(-1).playerId, ready.playerId);
  } finally {
    Reflect.deleteProperty(crypto.subtle, 'timingSafeEqual');
  }
});
