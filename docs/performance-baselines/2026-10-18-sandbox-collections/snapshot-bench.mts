import {execFileSync} from 'node:child_process';
import {loadavg,cpus} from 'node:os';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
const root=process.argv[2],output=process.argv[3];
if(!root||!output)throw Error('Usage: tsx tesland-snapshot-bench.mts ROOT OUTPUT');
const get=async(path:string)=>import(pathToFileURL(`${root}/${path}`).href);
const {createWorld,addPlayer,NEUTRAL}=await get('shared/game.ts');
const {ScheduledInput}=await get('shared/tick-input.ts');
const {prepareSnapshots}=await get('worker/snapshot.ts');
const ids=['tesla-drive-1','tesla-drive-5','tesla-drive-11','npc-theft-1','npc-theft-5','npc-theft-10','npc-theft-26','vault-drive-panigale','vault-drive-ninja','vault-drive-temerario','vault-drive-revuelto','vault-drive-chiron','vault-drive-tourbillon'];
const world=createWorld();
for(let i=0;i<64;i++){const p=addPlayer(world,`p-${i}`,`Driver ${i}`);p.achievements.unlocked=['roadster-champion',...ids];p.achievements.lastUnlock={id:13,achievement:ids.at(-1)};}
const control=new ScheduledInput(NEUTRAL).snapshot();
function broadcast(){const prepare=prepareSnapshots(world,0,'epoch',1);let bytes=0;for(const p of world.players)bytes+=Buffer.byteLength(prepare(p.id,control,0));return bytes;}
for(let i=0;i<5;i++)broadcast();
const loadBefore=loadavg(),samples:number[]=[],sizes:number[]=[];
for(let i=0;i<30;i++){const begin=performance.now();sizes.push(broadcast());samples.push(performance.now()-begin);}
const sorted=[...samples].sort((a,b)=>a-b),pct=(p:number)=>sorted[Math.floor((sorted.length-1)*p)];
const result={revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,loadBefore,loadAfter:loadavg(),scenario:'64 synthetic players, each with the same 13 added collection badges; 64 recipient snapshots',timing:'same-process serialization and UTF-8 byte counting, not room tick, transport or capacity',samplesMs:samples,p50Ms:pct(.5),p95Ms:pct(.95),bytesPerBroadcast:sizes[0],stableSizes:sizes.every(x=>x===sizes[0])};
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
