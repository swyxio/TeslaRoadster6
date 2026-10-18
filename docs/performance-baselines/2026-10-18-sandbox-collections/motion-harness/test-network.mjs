import assert from 'node:assert/strict';
import {createNetworkProfile,safeMessage} from './network-profile.mjs';

function clock(){
  let current=0,id=0;const timers=new Map();
  return {
    now:()=>current,
    setTimer:(fn,ms)=>{const key=++id;timers.set(key,{at:current+ms,fn});return key;},
    clearTimer:key=>timers.delete(key),
    advance:time=>{
      if(time<current)throw new Error('Clock cannot go backwards');
      for(;;){const next=[...timers].filter(([,v])=>v.at<=time).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
        if(!next)break;timers.delete(next[0]);current=next[1].at;next[1].fn();}
      current=time;
    },
  };
}
const input=seq=>JSON.stringify({type:'input',seq,targetTick:seq+1,input:{secret:'NEVER_SAVE'}});
const state=tick=>JSON.stringify({type:'state',tick,poseRevision:1,control:{receivedSeq:tick},world:{private:'NEVER_SAVE'}});
const opts=c=>({now:c.now,setTimer:c.setTimer,clearTimer:c.clearTimer});
{
  const c=clock(),n=createNetworkProfile('zero',opts(c)),sent=[];
  n.enqueue('up',input(1),message=>sent.push({message,at:c.now()}));
  assert.equal(sent[0].at,0);assert.equal(sent[0].message,input(1));
  assert.equal(n.snapshot().events[0].requestedBaseDelayMs,0);n.stop();
}
{
  const c=clock(),n=createNetworkProfile('steady150',opts(c)),sent=[];
  n.enqueue('up',input(1),m=>sent.push(['up',JSON.parse(m).seq,c.now()]));
  n.enqueue('down',state(2),m=>sent.push(['down',JSON.parse(m).tick,c.now()]));
  c.advance(74);assert.equal(sent.length,0);c.advance(75);
  assert.deepEqual(sent,[['up',1,75],['down',2,75]]);
  for(const e of n.snapshot().events.filter(e=>e.event==='forwarded'))assert.equal(e.queueDwellMs,75);
  n.stop();
}
{
  const c=clock(),n=createNetworkProfile('bunched150',opts(c)),sent=[];
  for(let seq=1;seq<=5;seq++)n.enqueue('up',input(seq),m=>sent.push([JSON.parse(m).seq,c.now()]));
  c.advance(200);assert.deepEqual(sent,[[1,75],[2,75],[3,200],[4,200],[5,200]]);
  const enqueued=n.snapshot().events.filter(e=>e.event==='enqueued');
  assert.equal(enqueued[2].jitterMs,125);assert.ok(enqueued[3].fifoDelayMs>0);n.stop();
}
{
  const c=clock(),n=createNetworkProfile('gap250',opts(c)),sent=[];
  n.armGap();n.enqueue('down',state(1),m=>sent.push([JSON.parse(m).tick,c.now()]));
  c.advance(100);n.enqueue('down',state(2),m=>sent.push([JSON.parse(m).tick,c.now()]));
  c.advance(220);n.enqueue('down',state(3),m=>sent.push([JSON.parse(m).tick,c.now()]));
  c.advance(249);assert.deepEqual(sent,[[1,0]]);c.advance(250);
  assert.deepEqual(sent,[[1,0],[2,250],[3,250]]);
  assert.deepEqual(n.snapshot().gap,{armedAtNodeMs:0,startAtNodeMs:0,endTargetAtNodeMs:250,held:2,firstAfterNodeMs:250});
  n.stop();
}
{
  const c=clock(),n=createNetworkProfile('steady150',{...opts(c),queueLimit:2,eventLimit:1});
  n.enqueue('up',input(1),()=>{});n.enqueue('up',input(2),()=>{});
  assert.throws(()=>n.enqueue('up',input(3),()=>{}),/queue exceeded/);
  assert.equal(n.snapshot().overflow,true);assert.ok(n.snapshot().droppedEvents>0);n.stop();
}
assert.equal(JSON.stringify(safeMessage(state(5))).includes('NEVER_SAVE'),false);
assert.deepEqual(safeMessage('{"type":"identity","code":"NEVER_SAVE"}'),{type:'other'});
assert.equal(JSON.stringify(safeMessage('{"type":"input","seq":"NEVER_SAVE","targetTick":1}')).includes('NEVER_SAVE'),false);
assert.equal(JSON.stringify(safeMessage('{"type":"inputEdge","status":"NEVER_SAVE"}')).includes('NEVER_SAVE'),false);
process.stdout.write('PASS: virtual-clock FIFO, zero/150ms/bunched/250ms gap, queue bounds, privacy projection\n');
