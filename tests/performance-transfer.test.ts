import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const entryFile = 'assets/main.js';
const entry = Buffer.from('export const message = "Tesland performance fixture";');
const baselineHtml = '<script type="module" src="/assets/main.js"></script>';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type Encoding = 'identity' | 'gzip' | 'br';
type Options = {
  html?: string;
  encoding?: Encoding;
  assetBody?: Buffer;
  duplicate?: boolean;
  handleAsset?: (request: IncomingMessage, response: ServerResponse) => void;
};

function encoded(body: Buffer, encoding: Encoding) {
  return encoding === 'gzip' ? gzipSync(body) : encoding === 'br' ? brotliCompressSync(body) : body;
}

async function withFixture(run: (fixture: {
  origin: string;
  requests: string[];
  probe: (samples?: number) => Promise<{ status: number | null; stdout: string; stderr: string }>;
}) => Promise<void>, options: Options = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'tesland-transfer-test-'));
  const report = join(temp, 'baseline.json');
  const asset = { file: entryFile, sha256: hash(entry), rawBytes: entry.length };
  writeFileSync(report, JSON.stringify({
    metadata: { commit: 'fixture' },
    initialStaticJavaScript: {
      entryFile,
      htmlSha256: hash(baselineHtml),
      assets: options.duplicate ? [asset, asset] : [asset],
      dynamicImportRootsExcluded: ['lazy'],
    },
  }));
  const requests: string[] = [];
  const encoding = options.encoding ?? 'identity';
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    if (request.headers['accept-encoding'] !== 'br, gzip') {
      response.writeHead(400).end('Missing encoding negotiation');
      return;
    }
    if (request.url === `/${entryFile}` && options.handleAsset) {
      options.handleAsset(request, response);
      return;
    }
    const body = request.url === '/'
      ? Buffer.from(options.html ?? baselineHtml)
      : request.url === `/${entryFile}` ? options.assetBody ?? entry : null;
    if (!body) { response.writeHead(404).end(); return; }
    if (encoding !== 'identity') response.setHeader('Content-Encoding', encoding);
    response.setHeader('Cache-Control', 'public, max-age=60');
    response.setHeader('CF-Cache-Status', 'HIT');
    response.end(encoded(body, encoding));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
  const origin = `http://127.0.0.1:${address.port}`;
  const probe = (samples = 1) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'scripts/performance-transfer.mjs'), origin, report, String(samples)]);
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (status) => { clearTimeout(timeout); resolve({ status, stdout, stderr }); });
  });
  try { await run({ origin, requests, probe }); }
  finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(temp, { recursive: true, force: true });
  }
}

for (const encoding of ['identity', 'gzip', 'br'] as const) {
  test(`measures the encoded ${encoding} body for each cold-client sample`, async () => {
    await withFixture(async ({ probe, requests }) => {
      const result = await probe(2);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.acceptEncoding, 'br, gzip');
      assert.deepEqual(requests, ['/', `/${entryFile}`, '/', `/${entryFile}`]);
      assert.equal(report.samples.length, 2);
      for (const sample of report.samples) {
        assert.equal(sample.html.matchesBaseline, true);
        assert.deepEqual(sample.html.extraHtmlRequests, []);
        assert.equal(sample.html.inlineScripts, 0);
        assert.equal(sample.assets[0].decodedSha256, hash(entry));
        assert.equal(sample.assets[0].contentEncoding, encoding);
        assert.equal(sample.assets[0].cacheControl, 'public, max-age=60');
        assert.equal(sample.assets[0].edgeCacheStatus, 'HIT');
        assert.equal(sample.staticGraphEncodedBodyBytes, encoded(entry, encoding).length);
      }
    }, { encoding });
  });
}

test('reports injected scripts and preloads, including quoted greater-than signs', async () => {
  const html = `${baselineHtml}<script data-note=">" src="/extra.js"></script>` +
    `<link data-note='>' rel="preload" as="script" href="/preload.js">` +
    `<link rel="modulepreload" href="https://thirdparty.invalid/module.js"><script>void 0</script>`;
  await withFixture(async ({ origin, probe, requests }) => {
    const result = await probe();
    assert.equal(result.status, 0, result.stderr);
    const sample = JSON.parse(result.stdout).samples[0];
    assert.equal(sample.html.matchesBaseline, false);
    assert.equal(sample.html.inlineScripts, 1);
    assert.deepEqual(sample.html.extraHtmlRequests, [`${origin}/extra.js`, `${origin}/preload.js`, 'https://thirdparty.invalid/module.js']);
    assert.deepEqual(requests, ['/', `/${entryFile}`]);
    assert.equal(sample.staticGraphEncodedBodyBytes, entry.length);
  }, { html });
});

test('rejects HTML without the baseline module entry', async () => {
  await withFixture(async ({ probe, requests }) => {
    const result = await probe();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not reference the baseline entry as a module script/);
    assert.deepEqual(requests, ['/']);
  }, { html: '<script type="text/javascript" src="/assets/main.js"></script>' });
});

test('rejects a base element that changes script URL resolution', async () => {
  await withFixture(async ({ probe, requests }) => {
    const result = await probe();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /contains a base element/);
    assert.deepEqual(requests, ['/']);
  }, { html: `<base href="https://elsewhere.invalid/">${baselineHtml}` });
});

test('rejects duplicate baseline assets before sending requests', async () => {
  await withFixture(async ({ probe, requests }) => {
    const result = await probe();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Baseline must contain/);
    assert.deepEqual(requests, []);
  }, { duplicate: true });
});

test('rejects a different served asset even when its length matches', async () => {
  await withFixture(async ({ probe }) => {
    const result = await probe();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /differs from the baseline build/);
  }, { assetBody: Buffer.alloc(entry.length, 120) });
});

test('rejects non-success asset responses and unsupported content encodings', async () => {
  for (const [handleAsset, error] of [
    [(_request: IncomingMessage, response: ServerResponse) => response.writeHead(503).end('Unavailable'), /HTTP 503/],
    [(_request: IncomingMessage, response: ServerResponse) => response.writeHead(200, { 'Content-Encoding': 'deflate' }).end(entry), /Unsupported content encoding/],
  ] as const) {
    await withFixture(async ({ probe }) => {
      const result = await probe();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    }, { handleAsset });
  }
});

for (const encoding of ['gzip', 'br'] as const) {
  test(`rejects a ${encoding} response expanding past the baseline asset size`, async () => {
    await withFixture(async ({ probe }) => {
      const result = await probe();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /larger than|buffer too large|ERR_BUFFER_TOO_LARGE|exceeds limit/i);
    }, { encoding, assetBody: Buffer.alloc(entry.length + 1024, 120) });
  });
}

test('rejects an excessively large encoded response', async () => {
  await withFixture(async ({ probe }) => {
    const result = await probe();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Encoded response exceeds limit/);
  }, { assetBody: Buffer.alloc(entry.length * 2 + 65_537, 120) });
});

test('rejects an incomplete response', async () => {
  await withFixture(async ({ probe }) => {
    const result = await probe();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /incomplete|aborted|socket hang up/i);
  }, { handleAsset: (_request, response) => {
    response.writeHead(200, { 'Content-Length': entry.length + 10, Connection: 'close' });
    response.end(entry);
  } });
});
