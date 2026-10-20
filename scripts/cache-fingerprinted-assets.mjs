// Give only Vite-emitted, fingerprinted files long-lived browser caching.
// Exact paths keep the SPA fallback and unversioned public files revalidatable.
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const manifestPath = 'dist/.vite/manifest.json';
if (existsSync('dist/_headers')) throw new Error('Combine existing _headers rules deliberately before generating asset cache headers.');
const manifestPaths = [manifestPath, 'dist/.vite/embarcadero-manifest.json'].filter(existsSync);
if (!manifestPaths.includes(manifestPath)) throw new Error('Missing main Vite manifest.');
const files = new Set();
for (const path of manifestPaths) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const item of Object.values(manifest)) {
    for (const file of [item.file, ...(item.css ?? []), ...(item.assets ?? [])]) {
      if (file?.startsWith('assets/')) {
        if (!/^assets\/[\w.-]+-[\w-]{8}\.[\w]+$/.test(file) || file.length + 1 > 2000) throw new Error(`Invalid fingerprinted Vite asset path: ${file}`);
        if (!existsSync(`dist/${file}`) || !lstatSync(`dist/${file}`).isFile()) throw new Error(`Missing Vite asset: ${file}`);
        files.add(file);
      }
    }
  }
}
if (!files.size || files.size > 100) throw new Error(`Expected 1–100 fingerprinted assets; found ${files.size}.`);
writeFileSync('dist/_headers', [...files].sort().map((file) => `/${file}\n  Cache-Control: public, max-age=31536000, immutable\n`).join('\n'));
for (const path of manifestPaths) rmSync(path);
