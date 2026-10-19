import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyConfig(config) {
  if (config.repo !== 'swyxio/TeslaRoadster6' || config.pullRequest !== 109 ||
      !/^[0-9a-f]{40}$/.test(config.sha) ||
      !/^https:\/\/[0-9a-f]{8}-bay-drive\.swyxio\.workers\.dev$/.test(config.preview) ||
      !Number.isSafeInteger(config.protocol) || config.protocol < 1) throw new Error('Target must pin PR 109, an exact SHA, protocol and immutable preview URL');
}

export function verifyBot(body,config) {
  const latest=body.match(/### Preview URL: https:\/\/codex-driving-continuity-throughput-bay-drive\.swyxio\.workers\.dev \(commit ([0-9a-f]+)\)/);
  if(!latest || latest[1].length<7 || !config.sha.startsWith(latest[1]))throw new Error('Cloudflare branch preview is not the target head');
  const rows=body.match(/<tr>[\s\S]*?<\/tr>/g)??[];
  const matching=rows.filter(row=>row.includes(`href="${config.preview}"`) &&
    [...row.matchAll(/<td>([0-9a-f]{7,40})<\/td>/g)].some(match=>config.sha.startsWith(match[1])) &&
    /<b>Build:<\/b> Success/.test(row) && /<b>Deployment:<\/b> Success/.test(row));
  if(matching.length!==1)throw new Error('Cloudflare bot does not bind the exact immutable URL to the successful target build');
}

export function verifyBindings(config) {
  if(config.name!=='bay-drive'||config.main!=='worker/index.ts'||config.previews?.vars?.MAX_PLAYERS!=='64')throw new Error('Unexpected preview Worker/configuration');
  const preview=config.previews;
  if(Object.keys(preview).some(key=>!['vars','durable_objects'].includes(key)))throw new Error('Unknown preview bindings require isolation review');
  if(Object.keys(preview.vars).some(key=>key!=='MAX_PLAYERS')||Object.keys(preview.durable_objects??{}).some(key=>key!=='bindings'))throw new Error('Unknown preview configuration requires isolation review');
  const classes={ROOMS:'GameRoom',CHAT:'GlobalChat',DRIVERS:'DriverProfile',ECONOMIES:'RoomEconomy',
    INCOME:'GlobalIncome',GLOBAL_EVENTS:'GlobalEarningsEvent',MARKET:'MarketService'};
  const bindings=preview.durable_objects?.bindings;
  if(!Array.isArray(bindings)||bindings.length!==Object.keys(classes).length || bindings.some(binding=>
    classes[binding.name]!==binding.class_name||Object.keys(binding).some(key=>!['name','class_name'].includes(key))) ||
    new Set(bindings.map(binding=>binding.name)).size!==Object.keys(classes).length)throw new Error('Preview Durable Object bindings are not the reviewed same-Worker classes');
}

async function api(path) {
  const token=process.env.GH_TOKEN;if(!token)throw new Error('GH_TOKEN is required for read-only identity checks');
  const response=await fetch(`https://api.github.com/repos/swyxio/TeslaRoadster6/${path}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'tesland-throughput-diagnostic'},
    signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error(`GitHub identity check ${path}: HTTP ${response.status}`);
  return response.json();
}

export async function verifyRemote(config) {
  verifyConfig(config);
  const [pr,comments,checks]=await Promise.all([api('pulls/109'),api('issues/109/comments?per_page=100'),api(`commits/${config.sha}/check-runs`)]);
  if(pr.state!=='open'||pr.head?.sha!==config.sha||pr.head?.repo?.full_name!==config.repo||
      pr.head?.ref!=='codex/driving-continuity-throughput'||pr.base?.ref!=='main')throw new Error('PR head or base changed');
  const successful=(checks.check_runs??[]).filter(check=>check.name==='Workers Builds: bay-drive'&&check.status==='completed'&&check.conclusion==='success');
  if(!successful.length)throw new Error('No successful Workers Build for the exact target commit');
  const bots=comments.filter(comment=>comment.user?.login==='cloudflare-workers-and-pages[bot]');
  if(bots.length!==1)throw new Error('Expected exactly one Cloudflare preview bot comment');
  verifyBot(bots[0].body,config);
  const response=await fetch(`${config.preview}/api/health`,{redirect:'error',signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw new Error(`Preview health HTTP ${response.status}`);
  const health=await response.json();
  if(!health.ok||health.version!==config.protocol||health.capacity!==64)throw new Error(`Unexpected preview health ${JSON.stringify(health)}`);
  return {checkedAt:new Date().toISOString(),sha:config.sha,preview:config.preview,protocol:config.protocol,health,
    buildIds:successful.map(check=>check.external_id),commentId:bots[0].id};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [targetPath,sourcePath]=process.argv.slice(2);
  if(!targetPath||!sourcePath)throw new Error('Usage: node hosted-room-target.mjs target.json candidate/wrangler.jsonc');
  const target=JSON.parse(readFileSync(targetPath,'utf8'));
  verifyBindings(JSON.parse(readFileSync(sourcePath,'utf8')));
  console.log(JSON.stringify(await verifyRemote(target),null,2));
}
