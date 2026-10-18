import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomAwardOutbox } from '../worker/room-awards';

function fakeStorage() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null, fail = false;
  const storage = {
    get: async (key: string) => structuredClone(data.get(key)),
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      if (fail) throw new Error('storage unavailable');
      const next = new Map(data); let nextAlarm = alarm;
      await fn({
        put: async (key: string, value: unknown) => { next.set(key, structuredClone(value)); },
        delete: async (key: string) => next.delete(key),
        setAlarm: async (time: number) => { nextAlarm = time; },
        deleteAlarm: async () => { nextAlarm = null; },
      });
      data.clear(); for (const [key, value] of next) data.set(key, value); alarm = nextAlarm;
    },
  };
  return { storage: storage as unknown as DurableObjectStorage, data, alarm: () => alarm, fail: (value: boolean) => { fail = value; } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('outbox retries across restart and a late acknowledgement preserves new awards', async () => {
  const fixture = fakeStorage();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const calls: string[][] = [];
  let offline = false;
  const bridge = { recordRoomAwards: async (_playerId: string, ids: string[]) => {
    calls.push([...ids]); if (calls.length === 1) await held; if (offline) throw new Error('offline');
  } };
  const tasks: Promise<unknown>[] = [];
  const outbox = new RoomAwardOutbox(fixture.storage, () => bridge, task => { tasks.push(task); });
  await outbox.load(); assert.equal(outbox.reserve('driver'), true);
  await outbox.enqueue('driver', ['regular']); await settle();
  assert.deepEqual(calls, [['regular']]);
  await outbox.enqueue('driver', ['roof-rider']);
  offline = true; release(); await Promise.all(tasks);
  assert.deepEqual(fixture.data.get('award-outbox'), { driver: ['regular', 'roof-rider'] });
  assert.ok(fixture.alarm(), 'a retry is armed with the persisted outbox');

  // A new instance sees the durable union, and the alarm retries it without a
  // connected socket. A simultaneous enqueue during acknowledgement remains.
  let releaseRetry!: () => void;
  const retryHeld = new Promise<void>(resolve => { releaseRetry = resolve; });
  const recorded: string[][] = [];
  const restarted = new RoomAwardOutbox(fixture.storage, () => ({ recordRoomAwards: async (_id, ids) => { recorded.push([...ids]); await retryHeld; } }), () => {});
  await restarted.load();
  const retry = restarted.alarm(); await settle();
  await restarted.enqueue('driver', ['sky-delivery']);
  releaseRetry(); await retry; await settle();
  assert.deepEqual(recorded[0], ['regular', 'roof-rider']);
  assert.deepEqual(fixture.data.get('award-outbox'), { driver: ['sky-delivery'] });
  assert.ok(fixture.alarm(), 'newer awards remain scheduled after the old acknowledgement');
  await restarted.alarm();
  assert.equal(fixture.data.has('award-outbox'), false);
  assert.equal(fixture.alarm(), null);
});

test('outbox rejects excessive driver reservations and does not claim failed writes', async () => {
  const fixture = fakeStorage();
  const outbox = new RoomAwardOutbox(fixture.storage, () => ({ recordRoomAwards: async () => {} }), () => {});
  await outbox.load();
  for (let i = 0; i < 256; i++) assert.equal(outbox.reserve(`driver-${i}`), true);
  assert.equal(outbox.reserve('overflow'), false);
  outbox.release('driver-0'); assert.equal(outbox.reserve('overflow'), true);
  fixture.fail(true);
  await assert.rejects(outbox.enqueue('driver-1', ['regular']), /storage unavailable/);
  assert.equal(fixture.data.has('award-outbox'), false);
  fixture.fail(false);
  await outbox.enqueue('driver-1', ['regular']);
  assert.ok(fixture.alarm());
});

test('room binding never transfers another driver’s awards and retries a failed enqueue', async () => {
  // Load the actual room class with only the Workers runtime base and chat
  // class replaced; the shared simulation and outbox implementation are real.
  const { readFile } = await import('node:fs/promises');
  const ts = (await import('typescript')).default;
  let source = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
  source = source.replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  source = source.replace("import { GlobalChat } from './global-chat';", 'class GlobalChat {}');
  source = source.replace(/from '([.][^']+)'/g, (_match, path: string) => `from ${JSON.stringify(new URL(path + '.ts', new URL('../worker/index.ts', import.meta.url)).href)}`);
  const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const { GameRoom } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const { addPlayer } = await import('../shared/game');
  const fixture = fakeStorage(), tasks: Promise<unknown>[] = [];
  const bridge = {
    consumeAwardTicket: async (ticket: string) => ({ first: 'driver-a', second: 'driver-b' } as Record<string, string>)[ticket] ?? null,
    recordRoomAwards: async () => { throw new Error('offline'); },
  };
  let ready: Promise<unknown> = Promise.resolve();
  const context = { storage: fixture.storage, blockConcurrencyWhile: (fn: () => Promise<unknown>) => { ready = fn(); }, waitUntil: (task: Promise<unknown>) => { tasks.push(task); } };
  const env = { CHAT: { idFromName: (name: string) => name, get: () => bridge } };
  const room = new GameRoom(context, env); await ready;
  const player = addPlayer(room.world, 'session', 'Driver');
  const sent: {type:string;ok:boolean}[] = [];
  const socket = { send: (message: string) => { sent.push(JSON.parse(message)); }, close: () => {} };
  const session = { id:'session', awards:null, retiringAwards:null, binding:false, bindEpoch:0 };
  room.sessions.set(socket, session);

  player.achievements.unlocked.push('roof-rider');
  await room.bindAwards(socket, session, 'first', 1);
  assert.equal(sent.at(-1)?.ok, true);
  player.achievements.unlocked.push('regular');
  await room.saveSessionAwards(socket, session, true);
  player.achievements.unlocked.push('sky-delivery');
  await room.unbindAwards(socket, session, 10);
  assert.deepEqual(sent.at(-1), { type:'awardsUnbound', requestId:10, ok:true });
  await room.bindAwards(socket, session, 'second', 2);
  assert.equal(sent.at(-1)?.ok, true);
  assert.deepEqual(fixture.data.get('award-outbox'), { 'driver-a': ['regular', 'sky-delivery'] });

  player.achievements.unlocked.push('bay-hopper'); fixture.fail(true);
  assert.equal(await room.saveSessionAwards(socket, session, true), false);
  assert.equal(session.awards!.seen.has('bay-hopper'), false);
  assert.deepEqual(sent.at(-1), { type:'awardsSync', ok:false });
  fixture.fail(false);
  assert.equal(await room.saveSessionAwards(socket, session, true), true);
  assert.deepEqual(sent.at(-1), { type:'awardsSync', ok:true });
  player.achievements.unlocked.push('to-mars');
  room.disconnect(socket);
  await Promise.all(tasks);
  assert.deepEqual(fixture.data.get('award-outbox'), {
    'driver-a': ['regular', 'sky-delivery'], 'driver-b': ['bay-hopper', 'to-mars'],
  });
  assert.ok(fixture.alarm());
});

test('unbinding freezes attribution during an outage and cancels an in-flight bind', async () => {
  const { readFile } = await import('node:fs/promises');
  const ts = (await import('typescript')).default;
  let source = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
  source = source.replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
  source = source.replace("import { GlobalChat } from './global-chat';", 'class GlobalChat {}');
  source = source.replace(/from '([.][^']+)'/g, (_match, path: string) => `from ${JSON.stringify(new URL(path + '.ts', new URL('../worker/index.ts', import.meta.url)).href)}`);
  const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const { GameRoom } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const { addPlayer } = await import('../shared/game');
  const fixture = fakeStorage();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const bridge = { consumeAwardTicket: async (ticket: string) => { if(ticket==='held')await hold;return 'driver'; }, recordRoomAwards: async () => { throw new Error('offline'); } };
  let ready: Promise<unknown> = Promise.resolve();
  const context = { storage:fixture.storage, blockConcurrencyWhile:(fn:()=>Promise<unknown>) => { ready=fn(); }, waitUntil:()=>{} };
  const room = new GameRoom(context, { CHAT:{idFromName:(name:string)=>name,get:()=>bridge} }); await ready;
  const player = addPlayer(room.world, 'session', 'Driver');
  const sent: {type:string;ok:boolean}[] = [],socket={send:(message:string)=>{sent.push(JSON.parse(message));},close:()=>{}};
  const session={id:'session',awards:null,retiringAwards:null,binding:false,bindEpoch:0};room.sessions.set(socket,session);
  await room.bindAwards(socket,session,'first',1);
  player.achievements.unlocked.push('regular');fixture.fail(true);
  await room.unbindAwards(socket,session,2);
  assert.deepEqual(sent.at(-1),{type:'awardsUnbound',requestId:2,ok:false});
  assert.equal(session.awards,null,'no new awards are attributed while the old owner is detached');
  player.achievements.unlocked.push('roof-rider');
  fixture.fail(false);assert.equal(await room.saveRetiringAwards(socket,session,true),true);
  assert.deepEqual(fixture.data.get('award-outbox'),{driver:['regular']});
  const pending=room.bindAwards(socket,session,'held',3);
  await settle();await room.unbindAwards(socket,session,4);release();await pending;
  assert.equal(session.awards,null,'a ticket that completes after unbinding cannot reactivate the old owner');
  assert.deepEqual(fixture.data.get('award-outbox'),{driver:['regular']});
});
