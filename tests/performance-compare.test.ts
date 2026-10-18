import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('every route leg must meet p95 and maximum path tolerances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-leg-compare-'));
  try {
    const report = {
      target: { version: 'test', revision: 'abc123' },
      route: { status: 'available', legs: Array.from({ length: 5 }, () => ({
        lengthM: 100, points: Array.from({ length: 41 }, (_, i) => [i, 0, 0]),
      })) },
    };
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    writeFileSync(before, JSON.stringify(report));
    const compare = (candidate: typeof report) => {
      writeFileSync(after, JSON.stringify(candidate));
      return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url)), before, after, '--require-route'], { encoding: 'utf8' });
    };

    const p95Failure = structuredClone(report);
    for (let i = 0; i < 3; i++) p95Failure.route.legs[2].points[i][1] = 30;
    const p95Result = compare(p95Failure);
    assert.equal(p95Result.status, 1);
    assert.match(p95Result.stdout, /leg 3 path divergence exceeds tolerance; path difference p95 0 m, max 30 m/);
    assert.match(p95Result.stdout, /3: 30 \/ 30/);

    const maxFailure = structuredClone(report);
    maxFailure.route.legs[4].points[0][1] = 51;
    const maxResult = compare(maxFailure);
    assert.equal(maxResult.status, 1);
    assert.match(maxResult.stdout, /leg 5 path divergence exceeds tolerance/);

    const boundary = structuredClone(report);
    for (let i = 0; i < 3; i++) boundary.route.legs[2].points[i][1] = 25;
    boundary.route.legs[2].points[3][1] = 50;
    const boundaryResult = compare(boundary);
    assert.equal(boundaryResult.status, 0);
    assert.match(boundaryResult.stdout, /3: 25 \/ 50/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
