#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const relevant = path => /^(src|shared|worker|public\/assets)\//.test(path) || /^(package\.json|pnpm-lock\.yaml|\.nvmrc|vite\.config\.ts|wrangler\.jsonc|index\.html)$/.test(path) || /^scripts\/(motion-|performance-|recording-|playtest)/.test(path) || /^tests\/(playtest-recorder\.integration|playtest-capture\.test|recording-quality\.test)\.ts$/.test(path) || /^tests\/fixtures\/(playtest-stage-worker\.ts|wrangler\.playtest-stage\.jsonc)$/.test(path) || path === '.github/workflows/performance.yml';

// A cheap classifier runs on runtime-related PRs; the expensive browser job is
// reserved for large diffs or an explicit label. Binary runtime assets count as
// substantial because their size/impact cannot be inferred from line counts.
export function selectPerformance(changes, labels = [], manual = false) {
  if (manual) return { run: true, reason: 'manual dispatch', changedLines: 0 };
  const matching = changes.filter(change => relevant(change.path));
  const changedLines = matching.reduce((sum, item) => sum + (item.binary ? 100 : item.added + item.deleted), 0);
  if (!matching.length) return { run: false, reason: 'no runtime or performance-tool changes', changedLines };
  if (labels.includes('performance-required')) return { run: true, reason: 'performance-required label', changedLines };
  return { run: changedLines >= 100, reason: changedLines >= 100 ? 'at least 100 changed relevant lines' : 'small change without performance-required label', changedLines };
}

function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  let changes = [];
  if (!manual) {
    const base = event.pull_request.base.sha, head = event.pull_request.head.sha;
    // Count a rename on both real paths; Git's compact `{src => shared}` form
    // otherwise hides cross-directory runtime moves from the selector.
    const rows = execFileSync('git', ['diff', '--no-renames', '--numstat', `${base}...${head}`], { encoding: 'utf8' });
    changes = rows.trim().split('\n').filter(Boolean).map(row => {
      const [added, deleted, ...parts] = row.split('\t');
      return { path: parts.join('\t'), binary: added === '-' || deleted === '-', added: Number(added) || 0, deleted: Number(deleted) || 0 };
    });
  }
  const selected = selectPerformance(changes, event.pull_request?.labels?.map(label => label.name) ?? [], manual);
  console.log(JSON.stringify(selected));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${selected.run}\nreason=${selected.reason}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
