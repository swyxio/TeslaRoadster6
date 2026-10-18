import { strict as assert } from 'node:assert';
import { isRecentRadioEpisode, RADIO_CATALOG_VERSION, type RadioEpisode } from '../shared/radio';

const base = process.argv[2] ?? 'http://localhost:8787';
for (const station of ['latent-space', 'thursdai']) {
  const response = await fetch(`${base}/api/radio/${station}?format=${RADIO_CATALOG_VERSION}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${station}: ${await response.clone().text()}`);
  const data = await response.json() as { episodes: RadioEpisode[]; serverNow:number };
  assert.ok(Number.isFinite(data.serverNow));
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.ok(data.episodes.length > 0, `${station} should contain recent public episodes`);
  for (const episode of data.episodes) {
    assert.ok(episode.title && !episode.title.includes('<![CDATA['));
    assert.match(episode.audio, /^https:\/\//);
    assert.match(episode.link, /^https:\/\//);
    assert.ok(isRecentRadioEpisode(episode.publishedAt, data.serverNow), `${station}: out-of-window episode ${episode.title}`);
  }
  console.log(`${station}: ${data.episodes.length} episodes`);
}
assert.equal((await fetch(`${base}/api/radio/unknown`)).status, 404);
assert.equal((await fetch(`${base}/api/radio/latent-space`, { method: 'POST' })).status, 405);
console.log('Radio endpoints OK');
