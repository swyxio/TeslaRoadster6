import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Radio } from '../src/radio';
import { isRecentRadioEpisode, radioCutoff } from '../shared/radio';

class FakeAudio extends EventTarget {
  src = ''; preload = ''; volume = 1; muted = false; paused = true; ended = false; blocked = false;
  play() { if (this.blocked) return Promise.reject(new Error('blocked')); this.paused = false; this.ended = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { const playing=!this.paused; this.paused = true; if (playing) setImmediate(()=>this.dispatchEvent(new Event('pause'))); }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}
const episodes = [
  { title: 'One', audio: 'https://example.com/1.mp3', link: 'https://example.com/1', publishedAt:Date.now()-86400000 },
  { title: 'Two', audio: 'https://example.com/2.mp3', link: 'https://example.com/2', publishedAt:Date.now()-86400000 },
  { title: 'Three', audio: 'https://example.com/3.mp3', link: 'https://example.com/3', publishedAt:Date.now()-86400000 },
];
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(fetcher: typeof fetch = async () => Response.json({ serverNow:Date.now(), episodes })) {
  const original = { Audio: globalThis.Audio, localStorage: globalThis.localStorage, fetch: globalThis.fetch, performance:globalThis.performance };
  let elapsed=0;
  Object.defineProperty(globalThis, 'performance', { configurable:true,value:{now:()=>elapsed} });
  const storage = new Map<string, string>();
  const media = new FakeAudio();
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: function () { return media; } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  globalThis.fetch = fetcher;
  return { media, storage, advance(ms:number) { elapsed+=ms; }, cleanup() { Object.defineProperty(globalThis, 'Audio', { configurable: true, value: original.Audio }); Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original.localStorage }); globalThis.fetch = original.fetch; Object.defineProperty(globalThis, 'performance', {configurable:true,value:original.performance}); } };
}

test('podcast playback is opt-in, shuffles all episodes, and follows the radio mix', async () => {
  const env = setup();
  try {
    const radio = new Radio(() => {});
    radio.select('latent-space'); await tick();
    assert.ok(radio.episode); assert.equal(env.media.src, '', 'no audio is fetched on station selection');
    assert.equal(radio.playing, false);
    radio.setVolume({ master: 50, music: 40, effects: 80, muted: false });
    assert.equal(env.media.volume, .2);
    await radio.play(); assert.equal(radio.playing, true);
    const heard = [radio.episode!.title];
    await radio.next(); heard.push(radio.episode!.title);
    await radio.next(); heard.push(radio.episode!.title);
    assert.equal(new Set(heard).size, 3); assert.equal(radio.playing, true);
    radio.setVolume({ master: 50, music: 40, effects: 80, muted: true });
    assert.equal(env.media.muted, true);
    radio.select('chiptune'); assert.equal(radio.playing, false); assert.equal(env.media.src, '');
    assert.equal(env.storage.get('tesland.radio.station'), 'chiptune');
  } finally { env.cleanup(); }
});

test('blocked playback is visible and hidden tabs pause and resume', async () => {
  const env = setup();
  try {
    const radio = new Radio(() => {}); radio.select('thursdai'); await tick();
    env.media.blocked = true; await radio.play();
    assert.match(radio.status, /blocked or unavailable/); assert.equal(radio.playing, false);
    env.media.blocked = false; await radio.play(); radio.visibility(true);
    assert.equal(radio.playing, false); assert.match(radio.status, /hidden/);
    radio.visibility(false); await tick(); assert.equal(radio.playing, true);
    radio.pause(); radio.visibility(true); radio.visibility(false); await tick(); assert.equal(radio.playing, false);
  } finally { env.cleanup(); }
});

test('a slow previous feed cannot replace the newly selected station', async () => {
  let resolveOld!: (response: Response) => void;
  const old = new Promise<Response>(resolve => { resolveOld = resolve; });
  const env = setup(async input => String(input).includes('latent-space') ? old : Response.json({ serverNow:Date.now(), episodes: [{ ...episodes[0], title: 'ThursdAI' }] }));
  try {
    const radio = new Radio(() => {}); radio.select('latent-space'); radio.select('thursdai'); await tick();
    assert.equal(radio.episode?.title, 'ThursdAI');
    resolveOld(Response.json({ serverNow:Date.now(), episodes })); await tick();
    assert.equal(radio.station, 'thursdai'); assert.equal(radio.episode?.title, 'ThursdAI');
  } finally { env.cleanup(); }
});

test('a failed feed can be retried without changing stations', async () => {
  let attempts = 0;
  const env = setup(async () => { if (++attempts === 1) throw new Error('offline'); return Response.json({ serverNow:Date.now(), episodes }); });
  try {
    const radio = new Radio(() => {}); radio.select('thursdai'); await tick();
    assert.match(radio.status, /Could not load/); assert.equal(radio.episode, null);
    await radio.play(); assert.equal(attempts, 2); assert.equal(radio.playing, true);
  } finally { env.cleanup(); }
});


test('an ended episode advances automatically and long-lived tabs refresh their catalog', async () => {
  let calls = 0;
  const env = setup(async () => Response.json({ serverNow:Date.now(), episodes: ++calls === 1 ? episodes : [{ ...episodes[0], title: 'New episode' }] }));
  const realNow = Date.now;
  let now = Date.now();
  Date.now = () => now;
  try {
    const radio = new Radio(() => {}); radio.select('latent-space'); await tick(); await radio.play();
    const first = radio.episode!.title;
    env.media.ended = true; env.media.paused = true; env.media.dispatchEvent(new Event('ended')); await tick();
    assert.equal(radio.playing, true); assert.notEqual(radio.episode!.title, first);
    now += 60 * 60 * 1000; env.advance(60 * 60 * 1000);
    await radio.next();
    assert.equal(calls, 2); assert.equal(radio.episode!.title, 'New episode'); assert.equal(radio.playing, true);
  } finally { Date.now = realNow; env.cleanup(); }
});


test('a stale response cannot replace a newer catalog for the same station', async () => {
  let resolveOld!: (response: Response) => void;
  const old = new Promise<Response>(resolve => { resolveOld = resolve; });
  let latentRequests = 0;
  const env = setup(async input => String(input).includes('latent-space') && ++latentRequests === 1 ? old : Response.json({ serverNow:Date.now(), episodes: [{ ...episodes[0], title: 'Fresh' }] }));
  try {
    const radio = new Radio(() => {}); radio.select('latent-space'); radio.select('thursdai'); radio.select('latent-space'); await tick();
    assert.equal(radio.episode?.title, 'Fresh');
    resolveOld(Response.json({ serverNow:Date.now(), episodes })); await tick(); await radio.next(false);
    assert.equal(radio.episode?.title, 'Fresh');
  } finally { env.cleanup(); }
});

test('radio uses two calendar months including the boundary, with month-end clamping', () => {
  const now=Date.parse('2026-10-18T19:45:00Z'),cutoff=Date.parse('2026-08-18T19:45:00Z');
  assert.equal(radioCutoff(now),cutoff);
  assert.equal(isRecentRadioEpisode(cutoff,now),true);
  assert.equal(isRecentRadioEpisode(cutoff-1,now),false);
  assert.equal(isRecentRadioEpisode(now,now),true);
  assert.equal(isRecentRadioEpisode(now+1,now),false);
  assert.equal(isRecentRadioEpisode(NaN,now),false);
  assert.equal(isRecentRadioEpisode(undefined as unknown as number,now),false);
  assert.equal(new Date(radioCutoff(Date.parse('2026-04-30T12:00:00Z'))).toISOString(),'2026-02-28T12:00:00.000Z');
  assert.equal(new Date(radioCutoff(Date.parse('2024-04-30T12:00:00Z'))).toISOString(),'2024-02-29T12:00:00.000Z');
  assert.equal(new Date(radioCutoff(Date.parse('2026-01-31T12:00:00Z'))).toISOString(),'2025-11-30T12:00:00.000Z');
});

test('catalogs exclude old, undated and future episodes instead of falling back to the archive', async () => {
  const now=Date.now();
  const env=setup(async()=>Response.json({serverNow:Date.now(),episodes:[
    {...episodes[0],title:'Recent',publishedAt:now-1000},
    {...episodes[0],title:'Old',publishedAt:radioCutoff(now)-86400000},
    {...episodes[0],title:'Future',publishedAt:now+86400000},
    {...episodes[0],title:'Undated',publishedAt:undefined},
  ]}));
  try {
    const radio=new Radio(()=>{});radio.select('latent-space');await tick();
    assert.equal(radio.episode?.title,'Recent');
    await radio.next(false);assert.equal(radio.episode?.title,'Recent');
  } finally {env.cleanup();}
});

test('a cached shuffle discards episodes as they leave the rolling window', async () => {
  const realNow=Date.now;let now=realNow(),calls=0;
  const env=setup(async()=>{calls++;return Response.json({serverNow:Date.now(),episodes:[{...episodes[0],publishedAt:radioCutoff(now)+1000}]});});
  Date.now=()=>now;
  try {
    const radio=new Radio(()=>{});radio.select('latent-space');await tick();await radio.play();
    now+=2000;env.advance(2000);
    await radio.next(true);await tick();
    assert.equal(calls,1,'reuses the hour-long catalog but rechecks publication dates');
    assert.equal(radio.episode,null);assert.equal(radio.playing,false);
    assert.match(radio.status,/No episodes from the last two months/);
  } finally {Date.now=realNow;env.cleanup();}
});

test('an episode prepared before the cutoff is rechecked when Play is pressed', async () => {
  const realNow=Date.now;let now=realNow();
  const env=setup(async()=>Response.json({serverNow:Date.now(),episodes:[{...episodes[0],publishedAt:radioCutoff(now)+1000}]}));
  Date.now=()=>now;
  try {
    const radio=new Radio(()=>{});radio.select('thursdai');await tick();
    assert.ok(radio.episode);now+=2000;env.advance(2000);
    await radio.play();
    assert.equal(radio.episode,null);assert.equal(radio.playing,false);
    assert.match(radio.status,/No episodes from the last two months/);
  } finally {Date.now=realNow;env.cleanup();}
});


test('server-relative expiry survives incorrect and subsequently changed device clocks', async () => {
  const realNow=Date.now,serverNow=realNow();
  let deviceNow=serverNow+365*86400000;
  Date.now=()=>deviceNow;
  const env=setup(async (_input,options)=>{
    assert.equal(options?.cache,'no-store','do not reuse a stale HTTP clock anchor');
    return Response.json({serverNow,episodes:[{...episodes[0],publishedAt:radioCutoff(serverNow)+1000}]});
  });
  try {
    const radio=new Radio(()=>{});radio.select('latent-space');await tick();
    assert.ok(radio.episode,'wrong wall clock must not empty a valid station');
    deviceNow=serverNow-365*86400000;
    await radio.play();assert.equal(radio.playing,true);
    env.advance(2000);await radio.next(true);await tick();
    assert.equal(radio.episode,null);assert.match(radio.status,/No episodes from the last two months/);
  } finally {Date.now=realNow;env.cleanup();}
});
