import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

type Chunk = { file?: string; css?: string[]; assets?: string[] };
const script = join(process.cwd(), 'scripts/cache-fingerprinted-assets.mjs');

function fixture(manifest: Record<string, Chunk>, files: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-cache-test-'));
  const dist = join(dir, 'dist');
  const manifestPath = join(dist, '.vite/manifest.json');
  const headersPath = join(dist, '_headers');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest));
  for (const file of files) {
    const path = join(dist, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'fixture');
  }
  return {
    dist, manifestPath, headersPath,
    run: () => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' }),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('writes one immutable rule for each distinct Vite output and leaves public paths alone', () => {
  const files = ['assets/index-AbCd1234.js', 'assets/index-Css12345.css', 'assets/logo-Logo1234.svg', 'assets/lazy-Lazy1234.js'];
  const f = fixture({
    'index.html': { file: files[0], css: [files[1]], assets: [files[2]] },
    'logo.svg': { file: files[2] },
    'lazy.ts': { file: files[3], css: [files[1]] },
    public: { file: 'changelog.js' },
  }, files);
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const expected = [...files].sort().map((file) => `/${file}\n  Cache-Control: public, max-age=31536000, immutable\n`).join('\n');
    assert.equal(readFileSync(f.headersPath, 'utf8'), expected);
    assert.equal(existsSync(f.manifestPath), false);
  } finally { f.cleanup(); }
});

test('rejects unversioned Vite output without writing headers', () => {
  const f = fixture({ main: { file: 'assets/main.js' } }, ['assets/main.js']);
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid fingerprinted Vite asset path/);
    assert.equal(existsSync(f.headersPath), false);
    assert.equal(existsSync(f.manifestPath), true);
  } finally { f.cleanup(); }
});

test('rejects a missing fingerprinted asset so a fallback cannot receive its cache rule', () => {
  const f = fixture({ main: { file: 'assets/main-AbCd1234.js' } }, []);
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing Vite asset/);
    assert.equal(existsSync(f.headersPath), false);
    assert.equal(existsSync(f.manifestPath), true);
  } finally { f.cleanup(); }
});

test('leaves an existing headers file untouched', () => {
  const f = fixture({ main: { file: 'assets/main-AbCd1234.js' } }, ['assets/main-AbCd1234.js']);
  try {
    writeFileSync(f.headersPath, '/\n  X-Test: existing\n');
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /existing _headers/);
    assert.equal(readFileSync(f.headersPath, 'utf8'), '/\n  X-Test: existing\n');
    assert.equal(existsSync(f.manifestPath), true);
  } finally { f.cleanup(); }
});

test('accepts 100 unique rules and rejects 101', () => {
  for (const count of [100, 101]) {
    const files = Array.from({ length: count }, (_, index) => `assets/chunk${index}-AbCd1234.js`);
    const manifest = Object.fromEntries(files.map((file, index) => [`chunk${index}`, { file }]));
    const f = fixture(manifest, files);
    try {
      const result = f.run();
      if (count === 100) {
        assert.equal(result.status, 0, result.stderr);
        assert.equal((readFileSync(f.headersPath, 'utf8').match(/Cache-Control:/g) ?? []).length, 100);
        assert.equal(existsSync(f.manifestPath), false);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Expected 1–100 fingerprinted assets; found 101/);
        assert.equal(existsSync(f.headersPath), false);
        assert.equal(existsSync(f.manifestPath), true);
      }
    } finally { f.cleanup(); }
  }
});
