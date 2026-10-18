import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('a new capture cannot overwrite an existing published video or its poster', async () => {
  const paths = ['public/blog/recording-webgl-playtests/playtest.mp4', 'public/blog/recording-webgl-playtests/playtest-poster.jpg'];
  const hashes = async () => Promise.all(paths.map(async path => createHash('sha256').update(await readFile(path)).digest('hex')));
  const before = await hashes();
  const result = spawnSync(process.execPath, ['scripts/playtest-to-blog.mjs', '--slug', 'recording-webgl-playtests'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists; choose a different --name/);
  assert.deepEqual(await hashes(), before);
});
