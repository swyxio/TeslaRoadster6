import {readFile} from 'node:fs/promises';
const [aPath,bPath]=process.argv.slice(2);
if(!aPath||!bPath)throw Error('Supply baseline and candidate reports');
const [a,b]=await Promise.all([aPath,bPath].map(async p=>JSON.parse(await readFile(p,'utf8'))));
const n=v=>typeof v==='number'&&Number.isFinite(v);
const identity=r=>JSON.stringify({scenario:r.fixture.scenarioSha256,recorder:r.fixture.recorderSha256,reporter:r.fixture.reporterSha256,stage:r.fixture.stageSha256,
  seed:r.fixture.seed,start:r.fixture.start,video:r.fixture.captureVideo,platform:r.environment.platform,arch:r.environment.arch,
  cpu:r.environment.cpu,renderer:r.environment.runner.webgl?.renderer,viewport:r.environment.viewport});
const valid=r=>r.target?.revision && r.target?.dirty===false && r.fixture?.captureVideo===false &&
  r.metrics?.browserFrameIntervalP95?.status==='available' && r.metrics?.roomProgress?.status==='available' &&
  r.route?.status==='available' && n(r.route.lengthM) && r.route.points?.length===41 &&
  r.route.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(n));
let reason='';let p95=null,max=null;
if(!valid(a)||!valid(b))reason='Incomplete target, performance or path evidence';
else if(identity(a)!==identity(b))reason='Harness or environment identity differs';
else if(Math.abs(a.route.lengthM-b.route.lengthM)>Math.max(20,a.route.lengthM*.25))reason='Path lengths differ by more than 25%';
else {
  const distances=a.route.points.map((p,i)=>Math.hypot(...p.map((v,j)=>v-b.route.points[i][j]))).sort((x,y)=>x-y);
  p95=distances[Math.floor((distances.length-1)*.95)];max=distances.at(-1);
  if(p95>25||max>50)reason='Distance-normalized paths diverge beyond 25 m p95 or 50 m maximum';
}
const report={comparable:!reason,reason:reason||'Distance-normalized highway paths aligned',pathSeparationM:{p95,max},
  baseline:{target:a.target,frame:a.metrics.browserFrameIntervalP95,room:a.metrics.roomProgress,lengthM:a.route.lengthM,loadBefore:a.environment.loadAverageBefore,loadAfter:a.environment.loadAverageAfter},
  candidate:{target:b.target,frame:b.metrics.browserFrameIntervalP95,room:b.metrics.roomProgress,lengthM:b.route.lengthM,loadBefore:b.environment.loadAverageBefore,loadAfter:b.environment.loadAverageAfter},
  note:'One local seeded highway run per revision. Browser callbacks are not GPU or physical display timings; no capacity, physical-device or production result is implied.'};
console.log(JSON.stringify(report,null,2));
if(reason)process.exitCode=2;
