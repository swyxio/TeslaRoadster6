import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { measureGraph } from '../scripts/performance-baseline-assets.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-perf-fixture-'));
  const generated = join(dir, 'generated');
  const sampled = join(dir, 'sampled');
  const html = '<script type="module" src="/assets/main.js"></script><link rel="modulepreload" href="/assets/shared.js">';
  const files = { 'main.js': 'import "./shared.js";', 'shared.js': 'export const value=42;', 'deep.js': 'export const deep=1;' };
  for (const path of [generated, sampled]) {
    mkdirSync(join(path, 'assets'), { recursive: true });
    writeFileSync(join(path, 'index.html'), html);
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(path, 'assets', name), contents);
  }
  const manifest = {
    'index.html': { isEntry: true, file: 'assets/main.js', imports: ['shared', 'deep'], dynamicImports: ['lazy', 'deep'] },
    shared: { file: 'assets/shared.js', imports: ['deep'] },
    deep: { file: 'assets/deep.js' },
    lazy: { file: 'assets/lazy.js', isDynamicEntry: true },
  };
  mkdirSync(join(generated, '.vite'));
  function setManifest(value: unknown) { writeFileSync(join(generated, '.vite/manifest.json'), JSON.stringify(value)); }
  function setHtml(value: string) {
    for (const path of [generated, sampled]) writeFileSync(join(path, 'index.html'), value);
  }
  setManifest(manifest);
  return { generated, sampled, html, files, manifest, setManifest, setHtml, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('counts each transitive static JavaScript asset once, excluding dynamic imports', () => {
  const f = fixture();
  try {
    const result = measureGraph(f.generated, f.sampled);
    assert.deepEqual(result.assets.map((asset: { file: string }) => asset.file), ['assets/deep.js', 'assets/main.js', 'assets/shared.js']);
    assert.deepEqual(result.dynamicImportRootsExcluded, ['lazy']);
    assert.equal(result.entryFile, 'assets/main.js');
    assert.equal(result.htmlSha256, createHash('sha256').update(f.html).digest('hex'));
    assert.equal(result.assets[1].sha256, createHash('sha256').update(f.files['main.js']).digest('hex'));
    assert.equal(result.totals.rawBytes, Object.values(f.files).reduce((sum, value) => sum + Buffer.byteLength(value), 0));
    assert.equal(result.totals.gzipBytes, Object.values(f.files).reduce((sum, value) => sum + gzipSync(value).length, 0));
    assert.equal(result.totals.brotliBytes, Object.values(f.files).reduce((sum, value) => sum + brotliCompressSync(value).length, 0));
  } finally { f.cleanup(); }
});

test('rejects a missing static manifest reference', () => {
  const f = fixture();
  try {
    f.manifest.shared.imports.push('missing');
    f.setManifest(f.manifest);
    assert.throws(() => measureGraph(f.generated, f.sampled), /Missing manifest entry: missing/);
  } finally { f.cleanup(); }
});

test('rejects missing entry scripts and extra HTML script requests', () => {
  const f = fixture();
  try {
    f.setHtml('<link rel="modulepreload" href="/assets/shared.js">');
    assert.throws(() => measureGraph(f.generated, f.sampled), /missing the module entry script/);
    f.setHtml(f.html.replace('type="module"', 'type="text/javascript"'));
    assert.throws(() => measureGraph(f.generated, f.sampled), /missing the module entry script/);
    f.setHtml(f.html + '<script src="/assets/extra.js"></script>');
    assert.throws(() => measureGraph(f.generated, f.sampled), /outside the static manifest graph/);
    f.setHtml(f.html + '<link rel="preload" as="script" href="/assets/extra.js">');
    assert.throws(() => measureGraph(f.generated, f.sampled), /outside the static manifest graph/);
    f.setHtml(f.html + '<script>console.log("inline")</script>');
    assert.throws(() => measureGraph(f.generated, f.sampled), /Inline script/);
  } finally { f.cleanup(); }
});

test('accounts for script and preload tags containing quoted greater-than characters', () => {
  const f = fixture();
  try {
    const entry = `<script data-label=" > src='/not-an-attribute.js' " type="module" src="/assets/main.js"></script>`;
    f.setHtml(`${entry}<link data-label='> rel="not-an-attribute"' rel="modulepreload" href="/assets/shared.js">`);
    assert.equal(measureGraph(f.generated, f.sampled).assets.length, 3);
    f.setHtml(`${entry}<link data-label='>' rel="preload" as="script" href="/assets/extra.js">`);
    assert.throws(() => measureGraph(f.generated, f.sampled), /outside the static manifest graph/);
  } finally { f.cleanup(); }
});

test('rejects a manifest build whose assets differ from the measured build', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.sampled, 'assets/shared.js'), 'different bytes');
    assert.throws(() => measureGraph(f.generated, f.sampled), /differs from the sampled/);
  } finally { f.cleanup(); }
});
