/** Synthetic side-by-side camera evaluation. No browser, GPU, real network, device or performance claims. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import * as T from 'three';
import {runTrace, type AdapterContext, type MotionAdapter, type Scenario, type Profile} from './motion-benchmark';
import {createMotionAdapter} from './motion-adapter-ticks';
import {chaseFraming,chaseResponse,updateChase} from '../../../../src/camera';
import {VEHICLES} from '../../../../shared/vehicles';

type Observation={t:number;x:number;y:number;z:number;q:number[];cut:boolean;focusRate:number;distance:number;vx:number;vz:number;inDome:boolean;support:string|null};
function makeCamera(candidate:boolean){
 const camera=new T.PerspectiveCamera(55,1280/720,.1,1800),focus=new T.Vector3(), state={motion:0,distance:0,gate:0,ready:false};
 const framing={distance:0,height:0,lookAhead:0,focusRate:8};let ready=false;
 return (visual:any,dt:number,t:number):Observation=>{
   const f=visual.debug.camFields,back=new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion(...visual.q));
   const yaw=Math.atan2(back.x,back.z),dir=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
   if(f.cameraSnap)ready=false;
   if(candidate){chaseFraming(false,VEHICLES.roadster,framing);framing.focusRate=8;chaseResponse(Math.hypot(f.vx,f.vz),visual.debug.supportId===null,!f.inDome,dt,state,framing);}
   else Object.assign(framing,{distance:15,height:8,lookAhead:5,focusRate:8});
   const position=new T.Vector3(visual.x,visual.y,visual.z),follow=position.clone().addScaledVector(dir,framing.distance).add(new T.Vector3(0,framing.height,0));
   const target=position.clone().addScaledVector(dir,-framing.lookAhead).add(new T.Vector3(0,1.3,0));
   const cut=ready&&camera.position.distanceTo(follow)>100;
   updateChase(camera.position,focus,follow,target,dt,ready,framing.focusRate);ready=true;camera.lookAt(focus);camera.updateMatrixWorld();
   return {t,x:camera.position.x,y:camera.position.y,z:camera.position.z,q:camera.quaternion.toArray(),cut,focusRate:framing.focusRate,distance:framing.distance,vx:f.vx,vz:f.vz,inDome:f.inDome,support:visual.debug.supportId};
 }
}
const factory=(ctx:AdapterContext):MotionAdapter=>{
 const adapter=createMotionAdapter(ctx),old=makeCamera(false),candidate=makeCamera(true),render=adapter.render.bind(adapter);
 adapter.render=(frame)=>{
   const visual:any=render(frame);
   visual.debug.camera={old:old(visual,frame.dtMs/1000,frame.nowMs),candidate:candidate(visual,frame.dtMs/1000,frame.nowMs)};
   return visual;
 };
 return adapter;
};
const pct=(a:number[],p:number)=>{const x=[...a].sort((a,b)=>a-b);return x[Math.floor((x.length-1)*p)];};
const round=(n:number)=>+n.toFixed(4);
function summarize(samples:any[],mode:'old'|'candidate'){
 let prior:any=null,previousVel:T.Vector3|null=null,previousYawRate:number|null=null;
 const frameVelChanges:number[]=[],frameYawRates:number[]=[],yawRateChanges:number[]=[],angularSteps:number[]=[],frameMoves:number[]=[];
 let cuts=0,flaggedSnaps=0,maxVelAt=0,maxYawAt=0;let maxVel=0,maxYawChange=0;
 for(const s of samples){
  const o=s.visual.debug.camera[mode],ctrl=s.visual.debug.camFields;
  if(ctrl.cameraSnap&&o.t>=1000)flaggedSnaps++;
  if(o.cut&&o.t>=1000)cuts++;
  if(prior){
    const dt=(o.t-prior.t)/1000,vel=new T.Vector3(o.x-prior.x,o.y-prior.y,o.z-prior.z).divideScalar(dt);
    const qa=new T.Quaternion(...prior.q),qb=new T.Quaternion(...o.q),angle=qa.angleTo(qb)*180/Math.PI;
    const a=new T.Vector3(0,0,1).applyQuaternion(qa),b=new T.Vector3(0,0,1).applyQuaternion(qb);
    const ya=Math.atan2(a.x,a.z),yb=Math.atan2(b.x,b.z),yawRate=Math.atan2(Math.sin(yb-ya),Math.cos(yb-ya))/dt*180/Math.PI;
    if(o.t>=3000&&!ctrl.cameraSnap&&!o.cut){
      frameMoves.push(vel.length()*dt);angularSteps.push(angle);frameYawRates.push(Math.abs(yawRate));
      if(previousVel){const change=vel.distanceTo(previousVel);frameVelChanges.push(change);if(change>maxVel){maxVel=change;maxVelAt=o.t;}}
      if(previousYawRate!==null){const change=Math.abs(yawRate-previousYawRate);yawRateChanges.push(change);if(change>maxYawChange){maxYawChange=change;maxYawAt=o.t;}}
    }
    previousVel=vel;previousYawRate=yawRate;
  }prior=o;
 }
 return {samples:frameMoves.length,cuts,explicitSnapFlags:flaggedSnaps,frameMoveP99M:round(pct(frameMoves,.99)),frameAngularStepP99Deg:round(pct(angularSteps,.99)),yawRateP95DegS:round(pct(frameYawRates,.95)),velocityStepP95Mps:round(pct(frameVelChanges,.95)),velocityStepMaxMps:round(maxVel),velocityStepMaxAtMs:round(maxVelAt),yawRateStepP95DegS:round(pct(yawRateChanges,.95)),yawRateStepMaxDegS:round(maxYawChange),yawRateStepMaxAtMs:round(maxYawAt)};
}
const outputDir=process.argv[2] ?? '/tmp/tesland-camera-net-replay';
mkdirSync(outputDir,{recursive:true});
let summary:any={method:'Same displayed position/quaternion and authoritative tick b velocity/support feed both chase cameras. Production 0.0.51 vs 12d5cf06; 120Hz frames, landscape 1280x720, 20Hz physics; omit initial 3s from continuity stats. Synthetic transport, not browser/GPU/WAN/device.',runs:[]};
for(const scenario of ['fast-slalom','flight-turn'] as Scenario[])for(const profile of ['zero','steady150','bunched150'] as Profile[]){
 const trace=runTrace(factory,scenario,profile);
 writeFileSync(join(outputDir,`${scenario}-${profile}.json`),JSON.stringify(trace));
 summary.runs.push({scenario,profile,packets:trace.packets,old:summarize(trace.samples,'old'),candidate:summarize(trace.samples,'candidate'),presentationEvents:trace.diagnostics.presentationEvents,snapDetails:trace.diagnostics.snapDetails});
}
writeFileSync(join(outputDir,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
