import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Radio } from '../src/radio';

class FakeAudio extends EventTarget {
  src = ''; preload = ''; volume = 1; muted = false; paused = true; ended = false; blocked = false;
  play() { if (this.blocked) return Promise.reject(new Error('blocked')); this.paused = false; this.ended = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}
const episodes = [
  { title: 'One', audio: 'https://example.com/1.mp3', link: 'https://example.com/1' },
  { title: 'Two', audio: 'https://example.com/2.mp3', link: 'https://example.com/2' },
  { title: 'Three', audio: 'https://example.com/3.mp3', link: 'https://example.com/3' },
];
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(fetcher: typeof fetch = async () => Response.json({ episodes })) {
  const original = { Audio: globalThis.Audio, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const storage = new Map<string, string>();
  const media = new FakeAudio();
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: function () { return media; } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  globalThis.fetch = fetcher;
  return { media, storage, cleanup() { Object.defineProperty(globalThis, 'Audio', { configurable: true, value: original.Audio }); Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original.localStorage }); globalThis.fetch = original.fetch; } };
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
  const env = setup(async input => String(input).includes('latent-space') ? old : Response.json({ episodes: [{ ...episodes[0], title: 'ThursdAI' }] }));
  try {
    const radio = new Radio(() => {}); radio.select('latent-space'); radio.select('thursdai'); await tick();
    assert.equal(radio.episode?.title, 'ThursdAI');
    resolveOld(Response.json({ episodes })); await tick();
    assert.equal(radio.station, 'thursdai'); assert.equal(radio.episode?.title, 'ThursdAI');
  } finally { env.cleanup(); }
});

test('a failed feed can be retried without changing stations', async () => {
  let attempts = 0;
  const env = setup(async () => { if (++attempts === 1) throw new Error('offline'); return Response.json({ episodes }); });
  try {
    const radio = new Radio(() => {}); radio.select('thursdai'); await tick();
    assert.match(radio.status, /Could not load/); assert.equal(radio.episode, null);
    await radio.play(); assert.equal(attempts, 2); assert.equal(radio.playing, true);
  } finally { env.cleanup(); }
});


test('an ended episode advances automatically and long-lived tabs refresh their catalog', async () => {
  let calls = 0;
  const env = setup(async () => Response.json({ episodes: ++calls === 1 ? episodes : [{ ...episodes[0], title: 'New episode' }] }));
  const realNow = Date.now;
  let now = 100_000;
  Date.now = () => now;
  try {
    const radio = new Radio(() => {}); radio.select('latent-space'); await tick(); await radio.play();
    const first = radio.episode!.title;
    env.media.ended = true; env.media.paused = true; env.media.dispatchEvent(new Event('ended')); await tick();
    assert.equal(radio.playing, true); assert.notEqual(radio.episode!.title, first);
    now += 60 * 60 * 1000;
    await radio.next();
    assert.equal(calls, 2); assert.equal(radio.episode!.title, 'New episode'); assert.equal(radio.playing, true);
  } finally { Date.now = realNow; env.cleanup(); }
});
