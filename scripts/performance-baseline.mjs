#!/usr/bin/env node
// Repeated local timings and a cold-cache estimate for the game's static JS graph.
import { createHash } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { cpus, loadavg, platform, arch, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureGraph } from './performance-baseline-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/performance-baseline.mjs [--samples N]\nRuns N sequential test/build pairs (default: 3) and prints JSON to stdout.');
  process.exit(0);
}
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--samples' || !/^[1-9]\d*$/.test(args[1]))) {
  throw new Error('Use --samples followed by a positive integer.');
}
const samples = args.length ? Number(args[1]) : 3;
if (!Number.isSafeInteger(samples) || samples > 100) throw new Error('Samples must be between 1 and 100.');
const scratch = mkdtempSync(join(tmpdir(), 'tesland-perf-'));
const digest = (data) => createHash('sha256').update(data).digest('hex');

function commandOutput(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error ?? result.stderr}`);
  return result.stdout.trim();
}
function timed(commandArgs, label) {
  process.stderr.write(`${label}...\n`);
  const logPath = join(scratch, 'command.log');
  const fd = openSync(logPath, 'w');
  const before = loadavg();
  const start = performance.now();
  let result;
  try {
    result = spawnSync('pnpm', commandArgs, { cwd: root, stdio: ['ignore', fd, fd] });
  } finally {
    closeSync(fd);
  }
  const elapsedMs = Math.round((performance.now() - start) * 10) / 10;
  const after = loadavg();
  if (result.error || result.status !== 0) {
    const log = readFileSync(logPath, 'utf8');
    throw new Error(`${label} failed (status ${result.status}, signal ${result.signal ?? 'none'}): ${result.error ?? ''}\n${log.slice(-12000)}`);
  }
  return { elapsedMs, loadAverageBefore: before, loadAverageAfter: after };
}

try {
  const metadata = {
    recordedAt: new Date().toISOString(),
    commit: commandOutput('git', ['rev-parse', 'HEAD']),
    dirty: Boolean(commandOutput('git', ['status', '--porcelain'])),
    lockfileSha256: digest(readFileSync(join(root, 'pnpm-lock.yaml'))),
    node: process.version,
    pnpm: commandOutput('pnpm', ['--version']),
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    ci: process.env.CI ?? null,
  };
  const timings = [];
  for (let sample = 1; sample <= samples; sample++) {
    // Reverse order on alternate samples to avoid always favoring one command's cache state.
    const order = sample % 2 ? ['test', 'build'] : ['build', 'test'];
    const measurements = {};
    for (const name of order) measurements[name] = timed([name], `Sample ${sample}/${samples}: pnpm ${name}`);
    timings.push({ sample, order, ...measurements });
  }
  const manifestDir = join(scratch, 'manifest-build');
  timed(['exec', 'vite', 'build', '--manifest', '--outDir', manifestDir, '--emptyOutDir'], 'Building separate Vite manifest for asset accounting');
  const initialStaticJavaScript = measureGraph(manifestDir, join(root, 'dist'));
  console.log(JSON.stringify({ metadata, timings, initialStaticJavaScript }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
