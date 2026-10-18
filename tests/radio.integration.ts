import { strict as assert } from 'node:assert';

const base = process.argv[2] ?? 'http://localhost:8787';
for (const station of ['latent-space', 'thursdai']) {
  const response = await fetch(`${base}/api/radio/${station}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${station}: ${await response.clone().text()}`);
  const data = await response.json() as { episodes: { title: string; audio: string; link: string }[] };
  assert.ok(data.episodes.length > 10, `${station} should contain public episodes`);
  for (const episode of data.episodes) {
    assert.ok(episode.title && !episode.title.includes('<![CDATA['));
    assert.match(episode.audio, /^https:\/\//);
    assert.match(episode.link, /^https:\/\//);
  }
  console.log(`${station}: ${data.episodes.length} episodes`);
}
assert.equal((await fetch(`${base}/api/radio/unknown`)).status, 404);
assert.equal((await fetch(`${base}/api/radio/latent-space`, { method: 'POST' })).status, 405);
console.log('Radio endpoints OK');
