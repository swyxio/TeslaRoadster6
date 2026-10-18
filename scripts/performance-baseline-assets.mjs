// Follow Vite's static entry graph; dynamic chunks are reported but excluded.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const digest = (data) => createHash('sha256').update(data).digest('hex');
function attr(tag, name) {
  for (const match of tag.matchAll(/\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    if (match[1].toLowerCase() === name) return match[2] ?? match[3] ?? match[4];
  }
}
function localAsset(value) {
  const url = new URL(value, 'http://baseline.invalid/');
  if (url.origin !== 'http://baseline.invalid' || url.search || url.hash) {
    throw new Error(`Unaccounted script or modulepreload: ${value}`);
  }
  return decodeURIComponent(url.pathname).replace(/^\//, '');
}
export function measureGraph(manifestDir, sampledDistDir) {
  const manifest = JSON.parse(readFileSync(join(manifestDir, '.vite/manifest.json'), 'utf8'));
  if (!manifest['index.html']?.isEntry) throw new Error('Vite manifest has no index.html entry.');
  const keys = new Set();
  const dynamicImports = new Set();
  function visit(key) {
    if (keys.has(key)) return;
    const item = manifest[key];
    if (!item) throw new Error(`Missing manifest entry: ${key}`);
    keys.add(key);
    for (const entry of item.dynamicImports ?? []) dynamicImports.add(entry);
    for (const entry of item.imports ?? []) visit(entry);
  }
  visit('index.html');
  const files = [...new Set([...keys].map((key) => manifest[key].file))].sort();
  if (files.some((file) => !/\.(?:m?js)$/.test(file))) throw new Error('The static manifest graph includes a non-JavaScript output.');
  const html = readFileSync(join(manifestDir, 'index.html'), 'utf8');
  const builtHtml = readFileSync(join(sampledDistDir, 'index.html'), 'utf8');
  if (html !== builtHtml) throw new Error('Manifest HTML differs from the sampled pnpm build output.');
  const referenced = [];
  const scripts = [];
  const moduleScripts = [];
  for (const match of html.matchAll(/<script\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const src = attr(match[0], 'src');
    if (!src) throw new Error('Inline script in built index.html is not accounted for.');
    scripts.push(localAsset(src));
    referenced.push(scripts.at(-1));
    if ((attr(match[0], 'type') ?? '').toLowerCase() === 'module') moduleScripts.push(scripts.at(-1));
  }
  for (const match of html.matchAll(/<link\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const rel = (attr(match[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (rel.includes('modulepreload') || (rel.includes('preload') && (attr(match[0], 'as') ?? '').toLowerCase() === 'script')) {
      const href = attr(match[0], 'href');
      if (!href) throw new Error('Script preload without an href is not accounted for.');
      referenced.push(localAsset(href));
    }
  }
  if (!moduleScripts.includes(manifest['index.html'].file) || referenced.some((file) => !files.includes(file))) {
    throw new Error('Built HTML is missing the module entry script or references a script/preload outside the static manifest graph.');
  }
  const assets = files.map((file) => {
    const bytes = readFileSync(join(manifestDir, file));
    const sampledBytes = readFileSync(join(sampledDistDir, file));
    if (digest(bytes) !== digest(sampledBytes)) throw new Error(`${file} differs from the sampled pnpm build output.`);
    return { file, sha256: digest(bytes), rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length, brotliBytes: brotliCompressSync(bytes).length };
  });
  return {
    entry: 'index.html', entryFile: manifest['index.html'].file, htmlSha256: digest(builtHtml), assets,
    totals: Object.fromEntries(['rawBytes', 'gzipBytes', 'brotliBytes'].map((key) => [key, assets.reduce((sum, asset) => sum + asset[key], 0)])),
    dynamicImportRootsExcluded: [...dynamicImports].filter((key) => !keys.has(key)).sort(),
  };
}

