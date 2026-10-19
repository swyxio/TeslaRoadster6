// Run: node tesland-continuity-gate-review-repro.mjs /absolute/path/to/driving-continuity-gate.mjs
// These synthetic inputs assert clock/contact proof solely to test analyzer
// behavior; they are not real gameplay evidence or passing regression tests.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(process.argv.length!==3)throw new Error('Usage: node tesland-continuity-gate-review-repro.mjs ANALYZER.mjs');
const {analyzeContinuity}=await import(pathToFileURL(resolve(process.argv[2])).href);
if(typeof analyzeContinuity!=='function')throw new Error('Analyzer does not export analyzeContinuity');
function base(){
 const speed=12,offset=10;
 const ticks=Array.from({length:201},(_,i)=>({tick:i,atMs:i*50,x:i*.6,y:0,z:0,yaw:0,vx:speed,vy:0,vz:0,supportId:'ground',poseRevision:0,contactReasons:[]}));
 const frames=Array.from({length:121},(_,i)=>{const atMs=offset+600+i*1000/60;return {atMs,visual:{x:(atMs-offset)*speed/1000,y:0,z:0,q:[0,0,0,1]},menu:false}});
 return {trace:{frames,controls:[{atMs:0,throttle:1,steer:0,brake:false,boost:false,hover:false}],errors:0,dropped:{frames:0,controls:0,states:0,events:0,sent:0,marks:0,turnarounds:0}},authority:{format:1,complete:true,dropped:0,failed:0,collisionCoverage:'all-solid-and-entity-paths',ticks,interpolation:{verified:true,maxPositionErrorM:0},clock:{browserMinusAuthorityMinMs:offset,browserMinusAuthorityMaxMs:offset,bracketedBefore:true,bracketedAfter:true,continuityVerified:true,maxTickTimingErrorMs:0,offsetModel:'bounded'}},window:{startMs:frames[0].atMs,endMs:frames.at(-1).atMs}};
}
const show=(name,c)=>{const r=analyzeContinuity(c);console.log(JSON.stringify({name,status:r.status,withinTarget:r.withinTarget,window:r.window,samples:r.samples.length,durationMs:r.durationMs,maxFrameMs:r.frameIntervalsMs?.max,p95:r.central?.p95,ratiosAbove1_1:r.samples.filter(x=>x.ratio>1.1).length,missingYaw:r.samples.filter(x=>x.yawRateDegPerSecond===null).length}));};
let c=base();c.window.endMs=60_000;show('59.39s window, only 2s frame evidence',c);
c=base();for(let i=60;i<c.trace.frames.length;i++){const f=c.trace.frames[i];f.atMs+=2000;f.visual.x=(f.atMs-10)*12/1000;}c.window.endMs=c.trace.frames.at(-1).atMs;show('2016.7ms gap between frames',c);
c=base();c.trace.frames=c.trace.frames.slice(0,31);for(let i=1;i<c.trace.frames.length;i++)c.trace.frames[i].visual.x+=(i>=1?.1:0)+(i>=2?.1:0);c.window.endMs=c.trace.frames.at(-1).atMs;show('2/30 above 1.1',c);
c=base();for(const f of c.trace.frames)delete f.visual.q;show('no visual yaw',c);
c=base();for(const t of c.authority.ticks)t.x=t.atMs*2/1000;for(const f of c.trace.frames)f.visual.x=(f.atMs-10)*2/1000;show('2 m/s sampled position but 12 m/s recorded velocity',c);
c=base();c.authority.failed=1;show('authority reports a failed tick probe',c);
c=base();for(let i=0;i<c.trace.frames.length;i++)c.trace.frames[i].visual.q=i%2?[0,Math.SQRT1_2,0,Math.SQRT1_2]:[0,0,0,1];show('recurring 90-degree displayed yaw changes',c);
