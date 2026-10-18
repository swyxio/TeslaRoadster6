import assert from 'node:assert/strict';
import test from 'node:test';
import { measureResponse, runTrace, traceMotion, type AdapterContext, type MotionAdapter, type Pose, type Trace } from '../scripts/motion-benchmark';
import type { Input } from '../shared/game';

function spyAdapter(log:{ticks:number[];frames:number[];snapshots:number[];messages:number[];outcomes:number[]}) {
  return ({world,sendToServer,sendToClient}:AdapterContext):MotionAdapter=>{
    let tick=0,seq=0,lastSend=-Infinity;
    const pose=():Pose=>({x:world.entities[0].x,y:world.entities[0].y,z:world.entities[0].z,q:[0,0,0,1]});
    return {
      onLocalInput(_input,frame){log.frames.push(frame.nowMs);if(frame.nowMs-lastSend>=49.999){lastSend=frame.nowMs;sendToServer(++seq,frame.nowMs);}},
      onLocalAction(){},onServerRelocation(){},onServerInput(message,now){log.messages.push(Number(message));sendToClient({edge:message},now);},
      onServerTick(now){log.ticks.push(now);tick++;world.entities[0].x++;},
      shouldSnapshot(){return tick%2===0;},makeSnapshot(){return tick;},
      onClientMessage(message,now){if(typeof message==='number')log.snapshots.push(now);else log.outcomes.push(now);},render:pose,serverWorld:()=>world,serverPose:pose,
      diagnostics:()=>({ticks:tick}),close(){},
    };
  };
}
const log=()=>({ticks:[] as number[],frames:[] as number[],snapshots:[] as number[],messages:[] as number[],outcomes:[] as number[]});

test('focus suspension omits client frames while server and socket clocks keep advancing',()=>{
  const calls=log(),trace=runTrace(spyAdapter(calls),'focus-loss','steady150');
  assert.equal(calls.ticks.length,160);
  assert.ok(Math.abs(calls.ticks.at(-1)!-8000)<1e-6);
  assert.equal(calls.frames.some(t=>t>=4000&&t<4600),false);
  assert.equal(calls.snapshots.some(t=>t>=4000&&t<4600),true);
  assert.ok(traceMotion(trace).afterFrameGap.gapMs>=600);
});

test('snapshot stalls leave ticks and upstream active and preserve FIFO through bursts',()=>{
  const calls=log(),trace=runTrace(spyAdapter(calls),'network-stall','bunched150');
  assert.equal(calls.ticks.length,160);
  assert.equal(calls.ticks.filter(t=>t>=4000&&t<4800).length,16);
  assert.equal(calls.snapshots.some(t=>t>=4100&&t<4800),false);
  assert.ok(calls.messages.length>120);
  assert.ok(calls.outcomes.length>100);
  assert.ok(calls.messages.every((n,i,a)=>i===0||n>a[i-1]));
  assert.ok(trace.packets.batched>0);
});

test('server overload loses physics ticks without stopping client or network time',()=>{
  const calls=log();runTrace(spyAdapter(calls),'server-overload','steady150');
  assert.equal(calls.ticks.length,152);
  assert.equal(calls.ticks.filter(t=>t>=4000&&t<4800).length,8);
  assert.ok(calls.frames.filter(t=>t>=4000&&t<4800).length>=95);
  assert.ok(calls.messages.length>120);
});

test('jump response ignores a horizontal correction until height increases',()=>{
  const p=(x:number,y:number):Pose=>({x,y,z:0,q:[0,0,0,1]});
  const sample=(timeMs:number,visual:Pose,authority:Pose)=>({timeMs,visual,authority});
  const trace:Trace={samples:[sample(1000,p(0,0),p(0,0)),sample(1010,p(4,0),p(0,0)),sample(1020,p(4,.06),p(0,0)),sample(1030,p(4,.2),p(0,.06))],diagnostics:{},packets:{}};
  const control:Trace={samples:trace.samples.map(s=>sample(s.timeMs,p(0,0),p(0,0))),diagnostics:{},packets:{}};
  const result=measureResponse(trace,control,{name:'jump',timeMs:1000,measure:'height'});
  assert.equal(result.firstVisualMs,20);
  assert.equal(result.firstServerTickMs,30);
});

test('motion metrics expose a significant single-frame velocity reversal',()=>{
  const pose=(x:number):Pose=>({x,y:0,z:0,q:[0,0,0,1]});
  const dt=1000/120,positions=[0,10/120,6/120];
  const trace:Trace={samples:positions.map((x,i)=>({timeMs:i*dt,visual:pose(x),authority:pose(x)})),diagnostics:{},packets:{}};
  const metrics=traceMotion(trace);
  assert.equal(metrics.frameVelocityReversals,1);
  assert.equal(metrics.frameVelocityChangeMaxMps,14);
  assert.equal(metrics.frameVelocityChangeMaxAtMs,16.667);
});

test('slalom fixture reverses held steering and its counterfactual suppresses only the chosen interval',()=>{
  const collect=(excluded:string)=>{
    const samples:{at:number;input:Input}[]=[];
    runTrace(context=>{
      const adapter=spyAdapter(log())(context),send=adapter.onLocalInput;
      adapter.onLocalInput=(input,frame)=>{samples.push({at:frame.nowMs,input:{...input}});send(input,frame);};
      return adapter;
    },'fast-slalom','zero',excluded);
    return (at:number)=>samples.find(sample=>Math.abs(sample.at-at)<.001)!.input;
  };
  const actual=collect(''),withoutRight=collect('right');
  assert.equal(actual(3000).steer,.7);assert.equal(actual(3500).steer,-.7);assert.equal(actual(4000).steer,.7);
  assert.equal(withoutRight(3500).steer,.7);assert.equal(withoutRight(4000).steer,.7);
  assert.equal(actual(3000).throttle,1);
});

test('yaw response reports 1-degree and 5-degree counterfactual milestones',()=>{
  const pose=(degrees:number):Pose=>({x:0,y:0,z:0,q:[0,Math.sin(degrees*Math.PI/360),0,Math.cos(degrees*Math.PI/360)]});
  const times=[0,10,20,30],rotation=[0,.2,2,6];
  const trace:Trace={samples:times.map((timeMs,i)=>({timeMs,visual:pose(rotation[i]),authority:pose(rotation[i])})),diagnostics:{},packets:{}};
  const control:Trace={samples:times.map(timeMs=>({timeMs,visual:pose(0),authority:pose(0)})),diagnostics:{},packets:{}};
  const result=measureResponse(trace,control,{name:'steer',timeMs:0,measure:'yaw'});
  assert.equal(result.firstVisualMs,10);assert.equal(result.firstVisual1DegreeMs,20);assert.equal(result.firstVisual5DegreesMs,30);
});

test('server relocation updates the adapter world and invokes its revision hook',()=>{
  let before=0,after=0,hookAt=0;
  runTrace(context=>{
    const adapter=spyAdapter(log())({...context,world:structuredClone(context.world)});
    before=adapter.serverWorld().entities[0].x;
    adapter.onServerRelocation=now=>{after=adapter.serverWorld().entities[0].x;hookAt=now;};
    return adapter;
  },'teleport','zero');
  // The spy advances 80 server ticks by one metre before the 4000 ms event.
  assert.equal(after-before,109);
  assert.ok(Math.abs(hookAt-4000)<1e-6);
});
