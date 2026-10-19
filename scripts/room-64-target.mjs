import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The event is checked both before target validation and immediately before
// starting the client harness. Neither a push nor a recycled approval is enough.
export function verifyInvocation(env, event, now = Date.now()) {
  const coordination = event?.inputs?.coordination;
  const start = event?.inputs?.window_start;
  const end = event?.inputs?.window_end;
  const utc = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z', '.000Z');
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'swyxio/TeslaRoadster6' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/codex/64-player-room-diagnostic-manual' ||
      !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') ||
      env.GITHUB_RUN_ATTEMPT !== '1' ||
      typeof coordination !== 'string' || coordination.trim().length < 12 || coordination.length > 160 || /[\r\n]/.test(coordination) ||
      !utc(start) || !utc(end) || Date.parse(end) <= Date.parse(start) ||
      Date.parse(end) - Date.parse(start) > 2 * 60 * 60_000 ||
      now < Date.parse(start) || now + 12 * 60_000 > Date.parse(end) ||
      event?.inputs?.preview_reviewed !== 'true' || event?.inputs?.confirmed !== 'true') {
    throw new Error('A manually dispatched, coordinated run on the diagnostic branch with deployed-preview review is required');
  }
}

// An exact immutable preview must be explicitly selected in the committed
// diagnostic target. A production URL or arbitrary workers.dev host is never valid.
export function verifyConfig(config) {
  if (config.repo !== 'swyxio/TeslaRoadster6' || config.approved !== true ||
      !Number.isSafeInteger(config.pullRequest) || config.pullRequest < 1 ||
      !/^[0-9a-f]{40}$/.test(config.sha) || !/^[0-9a-f]{40}$/.test(config.baseSha) || config.sha===config.baseSha ||
      !/^https:\/\/[0-9a-f]{8}-bay-drive\.swyxio\.workers\.dev$/.test(config.preview) ||
      !Number.isSafeInteger(config.protocol) || config.protocol < 1)
    throw new Error('Target must explicitly approve exact candidate and base SHAs, PR, protocol, and immutable non-production preview');
}

export function verifyBot(body, config, headRef) {
  const latest = body.match(/### Preview URL: (https:\/\/[^\s]+) \(commit ([0-9a-f]+)\)/);
  const branchSlug = headRef.replaceAll('/', '-');
  if (!latest || latest[1] !== `https://${branchSlug}-bay-drive.swyxio.workers.dev` ||
      latest[2].length < 7 || !config.sha.startsWith(latest[2]))
    throw new Error('The Cloudflare branch preview is not the exact PR head');
  const rows = body.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  const matches = rows.filter(row => row.includes(`href="${config.preview}"`) &&
    [...row.matchAll(/<td>([0-9a-f]{7,40})<\/td>/g)].some(match => config.sha.startsWith(match[1])) &&
    /<b>Build:<\/b> Success/.test(row) && /<b>Deployment:<\/b> Success/.test(row));
  if (matches.length !== 1) throw new Error('No unique successful exact-head immutable preview build');
}

export function verifyMain(config, mainSha) {
  if (mainSha !== config.baseSha) throw new Error('Current main no longer matches the pinned base SHA');
}

export function verifyBindings(config) {
  if (config.name !== 'bay-drive' || config.main !== 'worker/index.ts' || config.previews?.vars?.MAX_PLAYERS !== '64')
    throw new Error('Unexpected preview Worker or capacity');
  const preview = config.previews;
  if (Object.keys(preview).some(key => !['vars', 'durable_objects'].includes(key)) ||
      Object.keys(preview.vars).some(key => key !== 'MAX_PLAYERS') ||
      Object.keys(preview.durable_objects ?? {}).some(key => key !== 'bindings'))
    throw new Error('Unknown preview bindings require isolation review');
  const classes = {ROOMS:'GameRoom', CHAT:'GlobalChat', DRIVERS:'DriverProfile', ECONOMIES:'RoomEconomy',
    INCOME:'GlobalIncome', GLOBAL_EVENTS:'GlobalEarningsEvent', MARKET:'MarketService'};
  const bindings = preview.durable_objects?.bindings;
  if (!Array.isArray(bindings) || bindings.length !== Object.keys(classes).length ||
      bindings.some(binding => classes[binding.name] !== binding.class_name ||
        Object.keys(binding).some(key => !['name', 'class_name'].includes(key))) ||
      new Set(bindings.map(binding => binding.name)).size !== Object.keys(classes).length)
    throw new Error('Preview bindings must use only the reviewed same-Worker Durable Objects');
}

async function api(path) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required for read-only target checks');
  const response = await fetch(`https://api.github.com/repos/swyxio/TeslaRoadster6/${path}`, {
    headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'tesland-room-64'},
    signal:AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub target check ${path}: HTTP ${response.status}`);
  return response.json();
}

export async function verifyRemote(config) {
  verifyConfig(config);
  const [pr, comments, checks, main] = await Promise.all([
    api(`pulls/${config.pullRequest}`), api(`issues/${config.pullRequest}/comments?per_page=100`),
    api(`commits/${config.sha}/check-runs`), api('git/ref/heads/main'),
  ]);
  verifyMain(config,main.object?.sha);
  if (pr.state !== 'open' || pr.head?.sha !== config.sha || pr.head?.repo?.full_name !== config.repo ||
      pr.base?.ref !== 'main' || pr.head?.ref === 'main') throw new Error('PR head, repository or base changed');
  const successful = (checks.check_runs ?? []).filter(check => check.name === 'Workers Builds: bay-drive' &&
    check.status === 'completed' && check.conclusion === 'success');
  if (!successful.length) throw new Error('No successful Workers Build for the exact target');
  const bots = comments.filter(comment => comment.user?.login === 'cloudflare-workers-and-pages[bot]');
  if (bots.length !== 1) throw new Error('Expected one Cloudflare preview bot comment');
  verifyBot(bots[0].body, config, pr.head.ref);
  const response = await fetch(`${config.preview}/api/health`, {redirect:'error', signal:AbortSignal.timeout(10_000)});
  if (!response.ok) throw new Error(`Preview health HTTP ${response.status}`);
  const health = await response.json();
  if (!health.ok || health.version !== config.protocol || health.capacity !== 64)
    throw new Error(`Unexpected preview health ${JSON.stringify(health)}`);
  return {checkedAt:new Date().toISOString(), sha:config.sha, baseSha:config.baseSha, preview:config.preview, protocol:config.protocol,
    pr:config.pullRequest, health, buildIds:successful.map(check => check.external_id), commentId:bots[0].id};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [targetPath, sourcePath] = process.argv.slice(2);
  if (!targetPath || !sourcePath) throw new Error('Usage: node room-64-target.mjs target.json candidate/wrangler.jsonc');
  const target = JSON.parse(readFileSync(targetPath, 'utf8'));
  verifyBindings(JSON.parse(readFileSync(sourcePath, 'utf8')));
  console.log(JSON.stringify(await verifyRemote(target), null, 2));
}
