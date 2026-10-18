#!/usr/bin/env node
// Fetch the baseline's initial static JS graph without a browser cache.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const [originArg, reportPath, countArg = '3', ...extra] = process.argv.slice(2);
if (!originArg || !reportPath || extra.length || !/^[1-9]\d*$/.test(countArg) || Number(countArg) > 100) {
  throw new Error('Usage: node scripts/performance-transfer.mjs <origin> <baseline.json> [samples: 1–100]');
}
const origin = new URL(originArg);
if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
  throw new Error('Provide an HTTP(S) origin without a path, query, or credentials.');
}
const baseline = JSON.parse(readFileSync(reportPath, 'utf8'));
const graph = baseline.initialStaticJavaScript;
if (!/^[a-f0-9]{64}$/.test(graph?.htmlSha256 ?? '') || !Array.isArray(graph.assets) || !graph.assets.length ||
    !graph.assets.some((asset) => asset.file === graph.entryFile) ||
    new Set(graph.assets.map((asset) => asset.file)).size !== graph.assets.length ||
    graph.assets.some((asset) => !/^assets\/[\w.-]+\.m?js$/.test(asset.file) || !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.rawBytes) || asset.rawBytes <= 0)) {
  throw new Error('Baseline must contain the built HTML hash and initial JS assets with hashes.');
}
const sha256 = (body) => createHash('sha256').update(body).digest('hex');

function request(path, decodedLimit, encodedLimit) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, origin);
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error); else resolve(value);
    };
    const req = client.get(url, { headers: { 'accept-encoding': 'br, gzip' } }, (res) => {
      const chunks = [];
      let size = 0;
      if (res.statusCode !== 200) {
        req.destroy();
        finish(new Error(`${url} returned HTTP ${res.statusCode}; use the final origin directly`));
        return;
      }
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > encodedLimit) { req.destroy(new Error(`Encoded response exceeds limit for ${url}`)); return; }
        chunks.push(chunk);
      });
      res.on('error', (error) => finish(error));
      res.on('aborted', () => finish(new Error(`Incomplete response from ${url}`)));
      res.on('end', () => {
        try {
          const encoded = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'] ?? 'identity';
          const decoded = encoding === 'br' ? brotliDecompressSync(encoded, { maxOutputLength: decodedLimit }) : encoding === 'gzip' ? gunzipSync(encoded, { maxOutputLength: decodedLimit }) : encoding === 'identity' ? encoded : null;
          if (!decoded) throw new Error(`Unsupported content encoding ${encoding} for ${url}`);
          if (decoded.length > decodedLimit) throw new Error(`Decoded response exceeds limit for ${url}`);
          finish(null, { path: url.pathname, encodedBodyBytes: encoded.length, decodedSha256: sha256(decoded), decoded, contentEncoding: encoding,
            cacheControl: res.headers['cache-control'] ?? null, edgeCacheStatus: res.headers['cf-cache-status'] ?? null });
        } catch (error) { finish(error); }
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error(`Timed out requesting ${url}`)), 30000);
    req.on('error', (error) => finish(error));
  });
}

const samples = [];
for (let sample = 1; sample <= Number(countArg); sample++) {
  const html = await request('/', 5 * 1024 * 1024, 5 * 1024 * 1024);
  const htmlText = html.decoded.toString('utf8');
  delete html.decoded;
  if (/<base\b/i.test(htmlText)) throw new Error('Served HTML contains a base element; script URLs cannot be accounted for safely.');
  const attribute = (tag, name) => {
    const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match?.[1] ?? match?.[2] ?? match?.[3];
  };
  const expectedUrls = new Set(graph.assets.map((asset) => new URL(`/${asset.file}`, origin).href));
  const extraHtmlRequests = [];
  let entryFound = false, inlineScripts = 0;
  for (const match of htmlText.matchAll(/<script\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const src = attribute(match[0], 'src');
    if (!src) { inlineScripts++; continue; }
    const url = new URL(src, origin).href;
    if (url === new URL(`/${graph.entryFile}`, origin).href && attribute(match[0], 'type')?.toLowerCase() === 'module') entryFound = true;
    if (!expectedUrls.has(url)) extraHtmlRequests.push(url);
  }
  for (const match of htmlText.matchAll(/<link\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const rel = (attribute(match[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('modulepreload') && !(rel.includes('preload') && attribute(match[0], 'as')?.toLowerCase() === 'script')) continue;
    const href = attribute(match[0], 'href');
    if (!href) throw new Error('Served HTML has a modulepreload without an href.');
    const url = new URL(href, origin).href;
    if (!expectedUrls.has(url)) extraHtmlRequests.push(url);
  }
  if (!entryFound) throw new Error('Served HTML does not reference the baseline entry as a module script.');
  const assets = [];
  for (const expected of graph.assets) {
    const actual = await request(`/${expected.file}`, expected.rawBytes, expected.rawBytes * 2 + 65536);
    delete actual.decoded;
    if (actual.decodedSha256 !== expected.sha256) throw new Error(`${actual.path} differs from the baseline build.`);
    assets.push(actual);
  }
  samples.push({ sample, html: { ...html, matchesBaseline: html.decodedSha256 === graph.htmlSha256, extraHtmlRequests, inlineScripts },
    assets, staticGraphEncodedBodyBytes: assets.reduce((sum, asset) => sum + asset.encodedBodyBytes, 0) });
}
console.log(JSON.stringify({ recordedAt: new Date().toISOString(), origin: origin.origin, acceptEncoding: 'br, gzip',
  baselineCommit: baseline.metadata?.commit ?? null, dynamicImportRootsExcluded: graph.dynamicImportRootsExcluded, samples }, null, 2));
