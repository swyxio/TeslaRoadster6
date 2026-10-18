import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, step, type World } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { terrainHeight } from '../shared/map';
import { TickPrediction } from '../src/tick-prediction';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','P');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  return {world,car,control:new ScheduledInput(NEUTRAL).snapshot()};
}

for(const error of [-.3,2.3])test(`reconciling a safe ${error<0?'behind':'ahead'} position error preserves steady forward motion`,()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-300,z:-2050,y:0,yaw:-Math.PI/2,speed:20,vx:20,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,2,0);
  prediction.renderWorld(0,101,100,0);

  // The confirmed replay is 1.3 m behind or ahead of the extrapolated
  // displayed pose. Both are safe corrections; the behind case reproduces
  // the retained bunched-delivery trace.
  const fresh=structuredClone(world);fresh.entities[0].x+=error;
  prediction.snapshot(fresh,'p',101,control,0,2,50);
  let previous=prediction.renderWorld(50,102,101,0)!.entities[0];
  assert.equal(prediction.takeSnap(),false);
  for(let frame=1;frame<=12;frame++){
    const elapsed=frame*1000/120,whole=Math.floor(elapsed/50),alpha=(elapsed-whole*50)/50;
    const shown=prediction.renderWorld(50+elapsed,102+whole,101+elapsed/50,alpha)!.entities[0];
    const displayedSpeed=(shown.x-previous.x)/(1/120);
    assert.ok(displayedSpeed>0,`frame ${frame} must not reverse or stop`);
    assert.ok(displayedSpeed>=shown.vx*.9&&displayedSpeed<=shown.vx*1.1,
      `frame ${frame}: displayed ${displayedSpeed.toFixed(3)} m/s vs body ${shown.vx.toFixed(3)} m/s`);
    previous=shown;
  }
});

test('an unacknowledged level remains visible when its target tick passes',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  const before=prediction.renderWorld(0,40,39,.5)!.entities[0];
  assert.ok(before.speed>0,'the held control initially predicts motion');
  // A bunched snapshot can complete the target tick before the rejection or
  // a later heartbeat arrives. Authority still reports the prior held level.
  prediction.snapshot(world,'p',40,control,0,1,100);
  const after=prediction.renderWorld(100,42,41,.5)!.entities[0];
  assert.ok(after.speed>0,'the still-held level does not disappear locally');
});

for(const revision of [0,1])test(`a late local level never revives an expired jump at control revision ${revision}`,()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}});
  prediction.renderWorld(0,40,39,.5);
  const revised={...control,revision,edgeFloorRevision:revision};
  prediction.snapshot(world,'p',45,revised,0,1,100);
  const after=prediction.renderWorld(100,47,46,.5)!.entities[0];
  assert.equal(after.y,0);assert.equal(after.lastJump,0);
  if(revision)assert.equal(after.speed,0,'a superseded revision cannot restore throttle');
});

test('a newer release takes effect locally before its future target tick',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  prediction.input({seq:33,targetTick:45,controlRevision:0,actionSeq:0,input:{...NEUTRAL}},41);
  prediction.snapshot(world,'p',40,control,0,1,100);
  const released=prediction.renderWorld(100,42,41,.5)!.entities[0];
  assert.equal(released.speed,0,'the newer release overrides the older held level immediately');
});

for(const retimed of [false,true])test(`a ${retimed?'retimed':'normal'} queued acknowledgement preserves the earlier local press`,()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',100,control,0,1,0);
  const pressed={...NEUTRAL,throttle:1};
  prediction.input({seq:1,targetTick:107,controlRevision:0,actionSeq:0,input:pressed},101);
  prediction.input({seq:2,targetTick:108,controlRevision:0,actionSeq:0,input:pressed},102);
  const acknowledged={...control,receivedSeq:2,queued:[{seq:2,targetTick:108,input:pressed,...(retimed?{retimed:true as const}:{})}]};
  prediction.snapshot(world,'p',100,acknowledged,0,1,10);
  const shown=prediction.renderWorld(10,101,100,1)!.entities[0];
  assert.ok(shown.speed>0,'the superseded first heartbeat still establishes the local press time');
});

test('an expired local release cannot revive an older authoritative throttle',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-300,z:-2050,y:0,yaw:-Math.PI/2,speed:20,vx:20,vz:0,supportId:'ground'});
  control.held={...NEUTRAL,throttle:1};control.heldUntilTick=120;
  prediction.snapshot(world,'p',100,control,0,1,0);
  prediction.input({seq:1,targetTick:108,controlRevision:0,actionSeq:0,input:{...NEUTRAL}},101);
  const released=prediction.renderWorld(100,107,106,1)!.entities[0];
  assert.ok(released.speed<20,'after the local hold expires, neutral persists until the queued release');
});

test('a locally earlier input invalidates a cached future replay',()=>{
  const {world,control}=setup(),prediction=new TickPrediction(),fresh=new TickPrediction();
  prediction.snapshot(world,'p',100,control,0,1,0);fresh.snapshot(world,'p',100,control,0,1,0);
  prediction.renderWorld(0,102,101,1);
  const command={seq:1,targetTick:108,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}};
  prediction.input(command,102);fresh.input(command,102);
  const cached=prediction.renderWorld(10,103,102,1)!.entities[0];
  const expected=fresh.renderWorld(10,103,102,1)!.entities[0];
  assert.equal(cached.speed,expected.speed,'replay includes the input from its local tick, not only its wire tick');
  assert.ok(cached.speed>0);
});

for(const kind of ['jump','flip'] as const)test(`a local ${kind} survives a queued acknowledgement and is not fired twice`,()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  car.upgrades.rocket=true;
  if(kind==='flip')Object.assign(car,{x:-300,z:-2050,y:30,supportId:null});
  prediction.snapshot(world,'p',100,control,0,1,0);
  const input={...NEUTRAL,[kind]:1};
  prediction.input({seq:1,targetTick:108,controlRevision:0,actionSeq:0,input},101);
  const early=prediction.renderWorld(0,102,101,1)!.entities[0];
  assert.equal(kind==='jump'?early.lastJump:early.lastFlip,1,'edge appears before the wire target');
  const queued={...control,receivedSeq:1,queued:[{seq:1,targetTick:108,input}],
    [kind]:{seen:1,processed:0,pending:[{id:1,targetTick:108}]}};
  prediction.snapshot(world,'p',100,queued,0,1,10);
  prediction.renderWorld(10,112,111,1);
  const replay=Reflect.get(prediction,'cache') as {simulation:World};
  const actual=replay.simulation.entities[0],expected=structuredClone(world);
  for(let tick=101;tick<=112;tick++)step(expected,new Map([['p',input]]),.05);
  const reference=expected.entities[0];
  assert.equal(actual.lastJump,reference.lastJump);assert.equal(actual.lastFlip,reference.lastFlip);
  assert.ok(Math.abs(actual.y-reference.y)<1e-7,'the edge counter does not fall back and fire again');
  assert.ok(Math.abs(actual.air-reference.air)<1e-7,'repeated heartbeats do not spend air twice');
});

test('a wire edge cannot precede the locally recorded press',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',100,control,0,1,0);
  prediction.input({seq:1,targetTick:103,controlRevision:0,actionSeq:0,input:{...NEUTRAL,jump:1}},106);
  const before=prediction.renderWorld(0,105,104,1)!.entities[0];
  const after=prediction.renderWorld(50,106,105,1)!.entities[0];
  assert.equal(before.lastJump,0);assert.equal(after.lastJump,1);
});

for(const status of ['expired','superseded'] as const)test(`a previously ${status} acknowledged edge cannot reappear from an older control snapshot`,()=>{
  const {world,control}=setup(),prediction=new TickPrediction(),input={...NEUTRAL,jump:1};
  prediction.snapshot(world,'p',100,control,0,1,0);
  prediction.input({seq:1,targetTick:108,controlRevision:0,actionSeq:0,input},101);
  const queued={...control,receivedSeq:1,queued:[{seq:1,targetTick:108,input}],
    jump:{seen:1,processed:0,pending:[{id:1,targetTick:108}]}};
  prediction.snapshot(world,'p',100,queued,0,1,10);
  prediction.edgeOutcome('jump',1,status,108);
  const shown=prediction.renderWorld(10,109,108,1)!.entities[0];
  assert.equal(shown.lastJump,0);
});

for(const fence of ['action','revision','relocation','identity'] as const)test(`the ${fence} fence does not replay an unaccepted early input`,()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',100,control,0,1,0);
  prediction.input({seq:1,targetTick:108,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}},101);
  const next=structuredClone(world);
  if(fence==='identity'){next.entities[0].id='replacement';next.players[0].entityId='replacement';}
  const revised={...control,revision:fence==='revision'?1:0,actionSeq:fence==='action'?1:0,
    edgeFloorRevision:fence==='revision'?1:0};
  prediction.snapshot(next,'p',100,revised,fence==='relocation'?1:0,1,10);
  const shown=prediction.renderWorld(10,102,101,1)!.entities[0];
  assert.equal(shown.speed,0);assert.equal(shown.lastJump,0);
});

for(const rejectBeforeRender of [false,true])test(`a future release stays effective when an older level is rejected ${rejectBeforeRender?'before':'after'} rendering`,()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-300,z:-2050,y:0,yaw:-Math.PI/2,speed:20,vx:20,vz:0,supportId:'ground'});
  control.held={...NEUTRAL,throttle:1};control.heldUntilTick=1000;
  prediction.snapshot(world,'p',34,control,0,2,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  prediction.input({seq:33,targetTick:45,controlRevision:0,actionSeq:0,input:{...NEUTRAL}},41);
  prediction.snapshot(world,'p',40,control,0,2,100);
  if(rejectBeforeRender)prediction.reject(32,'late');
  const released=prediction.renderWorld(100,42,41,.5)!.entities[0];
  assert.ok(released.speed<20);
  if(!rejectBeforeRender)prediction.reject(32,'late');
  const afterRejection=prediction.renderWorld(150,43,42,.5)!.entities[0];
  assert.ok(afterRejection.speed<20,'an older rejection cannot reinstate throttle');
  const acknowledged={...control,receivedSeq:33,queued:[{seq:33,targetTick:45,input:{...NEUTRAL}}]};
  prediction.snapshot(world,'p',41,acknowledged,0,2,200);
  const afterAcknowledgement=prediction.renderWorld(200,43,42,.5)!.entities[0];
  assert.ok(afterAcknowledgement.speed<20,'a queued release stays effective before its authoritative tick');
});

test('a late rejection before its snapshot keeps the latest level until it expires',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}},35);
  prediction.reject(32,'late');
  const moving=prediction.renderWorld(0,36,35,1)!.entities[0];
  assert.ok(moving.speed>0,'late rejection keeps the held level visible');
  assert.equal(moving.y,0,'the rejected level cannot invent a jump');
  prediction.input({seq:33,targetTick:42,controlRevision:0,actionSeq:0,input:{...NEUTRAL,jump:1}},41);
  prediction.reject(33,'late');
  prediction.snapshot(world,'p',40,{...control,receivedSeq:33},0,1,100);
  const released=prediction.renderWorld(100,42,41,1)!.entities[0];
  assert.equal(released.speed,0,'a later rejected release cannot restore stale throttle');
  assert.equal(released.y,0);
  prediction.snapshot(world,'p',48,{...control,receivedSeq:33},0,1,200);
  const expired=prediction.renderWorld(200,49,48,1)!.entities[0];
  assert.equal(expired.speed,0,'the rejected level is bounded by the input hold');
});

for(const fence of ['revision','action'] as const)test(`a ${fence} change clears the late-level bridge`,()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  prediction.reject(32,'late');
  const revised={...control,revision:fence==='revision'?1:0,actionSeq:fence==='action'?1:0,
    edgeFloorRevision:fence==='revision'?1:0,receivedSeq:32,
    queued:[{seq:33,targetTick:45,input:{...NEUTRAL,throttle:1}}]};
  prediction.snapshot(world,'p',40,revised,0,1,100);
  const shown=prediction.renderWorld(100,42,41,1)!.entities[0];
  assert.equal(shown.speed,0,'the new generation does not inherit early level replay');
});

test('a late level cannot outlive the bounded input hold',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  prediction.snapshot(world,'p',46,control,0,1,100);
  const shown=prediction.renderWorld(100,47,46,.5)!.entities[0];
  assert.equal(shown.speed,0);
});

test('a single replay stops applying a late level after its input hold ends',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',34,control,0,1,0);
  prediction.input({seq:32,targetTick:40,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  prediction.snapshot(world,'p',40,control,0,1,100);
  const whileHeld=prediction.renderWorld(100,45,44,1)!.entities[0];
  const afterHold=prediction.renderWorld(200,47,46,1)!.entities[0];
  assert.ok(whileHeld.speed>0,'the recent level is visible before expiry');
  assert.ok(afterHold.speed<whileHeld.speed,'forecast ticks after expiry use neutral input');
});

test('tick prediction is presentation only and rebases a new input without a position kick',()=>{
  const {world,control}=setup(),original=structuredClone(world),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  const before=prediction.renderWorld(0,3,0)!.entities[0];
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}});
  const onset=prediction.renderWorld(1000/120,3,1/6)!.entities[0];
  assert.ok(Math.hypot(onset.x-before.x,onset.y-before.y,onset.z-before.z)<.05,'new controls cannot advance several simulation frames at once');
  const later=prediction.renderWorld(50,3,1)!.entities[0];
  assert.ok(later.y>before.y||later.speed>before.speed,'input becomes visible as the correction decays');
  assert.deepEqual(world,original,'prediction does not mutate the authoritative world');
});

for(const {name,target,alpha,tickDelta} of [
  {name:'a slow presentation clock',target:103,alpha:.95,tickDelta:.05},
  {name:'a 1.5x clock crossing a tick boundary',target:104,alpha:.15,tickDelta:.25},
  {name:'an abrupt two-tick clock jump',target:105,alpha:.9,tickDelta:.25},
])test(`a rebase follows ${name}`,()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-300,z:-2050,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,5,0);
  const before=prediction.renderWorld(0,103,100,.9)!.entities[0];
  prediction.input({seq:1,targetTick:103,controlRevision:0,actionSeq:0,input:{...NEUTRAL}});
  const after=prediction.renderWorld(1000/120,target,100,alpha)!.entities[0];
  assert.ok(Math.abs(after.x-before.x-before.vx*tickDelta*.05)<.002,'rebase uses elapsed presentation ticks');
  assert.equal(prediction.takeSnap(),false);
});

test('a close peer and the local car rebase on the same 1.5x timeline',()=>{
  const {world,car,control}=setup(),other=addPlayer(world,'q','Other');
  const peer=world.entities.find(entity=>entity.id===other.entityId)!;
  for(const [entity,x] of [[car,-300],[peer,-290]] as const)
    Object.assign(entity,{x,z:-2050,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  const prediction=new TickPrediction();prediction.snapshot(world,'p',100,control,0,5,0);
  const first=prediction.renderWorld(0,103,100,.9)!;
  const before=first.entities.find(entity=>entity.driver==='p')!,beforePeer=first.entities.find(entity=>entity.driver==='q')!;
  const next=structuredClone(world);
  for(const entity of next.entities)entity.x+=2.5;
  prediction.snapshot(next,'p',101,control,0,5,1000/120);
  const second=prediction.renderWorld(1000/120,104,101,.15)!;
  const after=second.entities.find(entity=>entity.driver==='p')!,afterPeer=second.entities.find(entity=>entity.driver==='q')!;
  assert.ok(Math.abs(after.x-before.x-before.vx*.0125)<.002,'local car uses presentation time');
  assert.ok(Math.abs(afterPeer.x-beforePeer.x-beforePeer.vx*.0125)<.002,'nearby peer uses the same time');
  assert.ok(Math.abs((afterPeer.x-after.x)-(beforePeer.x-before.x))<.1,'the following gap stays nearly steady');
});

test('local and nearby supported poses follow the shared curved hill at fractional ticks',()=>{
  const {world,car,control}=setup(),other=addPlayer(world,'q','Other');
  const peer=world.entities.find(entity=>entity.id===other.entityId)!;
  for(const [entity,x] of [[car,-345.5],[peer,-338.5]] as const)
    Object.assign(entity,{x,z:150,y:terrainHeight(x,150)!,yaw:-Math.PI/2,speed:20,vx:20,vz:0,supportId:'ground'});
  const prediction=new TickPrediction();prediction.snapshot(world,'p',100,control,0,5,0);
  for(let frame=0;frame<=10;frame++){
    const shown=prediction.renderWorld(frame*5,103,100,frame/10)!;
    for(const entity of shown.entities){
      assert.equal(entity.supportId,'ground');
      assert.ok(Math.abs(entity.y-terrainHeight(entity.x,entity.z)!)<.001,`vehicle follows shared terrain at frame ${frame}`);
    }
  }
});

test('a ground correction follows the hill surface without a chord-induced cut',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-345.5,z:150,y:terrainHeight(-345.5,150)!,speed:0,vx:0,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,5,0);
  const before=prediction.renderWorld(0,101,100,0)!.entities[0];
  const next=structuredClone(world);next.entities[0].x=-334.5;next.entities[0].y=terrainHeight(-334.5,150)!;
  prediction.snapshot(next,'p',102,control,0,5,50);
  for(let frame=0;frame<=20;frame++){
    const shown=prediction.renderWorld(50+frame*1000/120,103,102,0)!.entities[0];
    assert.ok(Math.abs(shown.y-terrainHeight(shown.x,shown.z)!)<.001,`ground height at frame ${frame}`);
    assert.equal(prediction.takeSnap(),false,`no unnecessary cut at frame ${frame}`);
    if(frame===0)assert.ok(Math.abs(shown.x-before.x)<.01,'correction begins at the previous displayed pose');
  }
});

test('confirmed relocations or entity changes cut the camera',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);prediction.renderWorld(0,3,0);
  const airborne=structuredClone(world);airborne.entities[0].supportId=null;airborne.entities[0].y=3;
  prediction.snapshot(airborne,'p',2,{...control,revision:1},0,1,100);
  assert.equal(prediction.takeCameraSnap(),false,'support and control revisions are not teleports');
  const moved=structuredClone(airborne);moved.entities[0].x+=3;
  prediction.snapshot(moved,'p',4,{...control,revision:2},1,1,200);
  assert.equal(prediction.takeCameraSnap(),true,'even a short confirmed relocation cuts the camera');
  assert.equal(prediction.takeSnap(),true);
  assert.equal(prediction.takeCameraSnap(),false,'the cut is consumed once');
  const replacement=structuredClone(moved);replacement.entities[0].id='replacement';replacement.players[0].entityId='replacement';
  prediction.snapshot(replacement,'p',6,{...control,revision:3},1,1,300);
  assert.equal(prediction.takeCameraSnap(),true,'a changed controlled body cuts the camera');
});

test('a stale connection freezes the displayed car until a fresh snapshot',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  const shown=prediction.renderWorld(50,3,.5)!.entities[0];
  const frozen=prediction.renderWorld(600,null,2)!.entities[0];
  assert.deepEqual(frozen,shown);
  const fresh=structuredClone(world);fresh.entities[0].x+=1;
  prediction.snapshot(fresh,'p',10,control,0,1,650);
  assert.ok(prediction.renderWorld(650,13,10));
});

for(const renderDuringStall of [true,false])test(`recovery rebases from a held pose ${renderDuringStall?'with':'without'} a frame during the outage`,()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-130,z:60,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,1,0);
  const before=prediction.renderWorld(0,101,100,0)!.entities[0];
  if(renderDuringStall)prediction.renderWorld(600,null,null);
  const fresh=structuredClone(world);Object.assign(fresh.entities[0],{x:-120,speed:10,vx:10});
  prediction.snapshot(fresh,'p',112,control,0,1,650);
  const resumed=prediction.renderWorld(650,113,112,0)!.entities[0];
  assert.ok(Math.abs(resumed.x-before.x)<.001,'the frozen car does not jump forward on recovery');
  assert.equal(prediction.takeSnap(),false);
});

test('an unavoidable large recovery cut also recenters the chase camera',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-130,z:60,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,1,0);prediction.renderWorld(0,101,100,0);
  prediction.renderWorld(600,null,null);
  const fresh=structuredClone(world);fresh.entities[0].x=-90;
  prediction.snapshot(fresh,'p',112,control,0,1,650);prediction.renderWorld(650,113,112,0);
  assert.equal(prediction.takeSnap(),true);
  assert.equal(prediction.takeCameraSnap(),true);
});

test('a predicted water recovery does not interpolate across the map',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:600,y:.01,z:-2250,vy:-5,supportId:null});
  prediction.snapshot(world,'p',100,control,0,1,0);
  const preview=prediction.renderWorld(25,101,100.5);
  assert.equal(preview,null,'the relocation is withheld until the server confirms it');
  assert.equal(prediction.takeCameraSnap(),false);
  const recovered=structuredClone(world);Object.assign(recovered.entities[0],{x:-36,y:0,z:-1120,vy:0,supportId:'ground'});
  prediction.snapshot(recovered,'p',102,{...control,revision:1},1,1,100);
  assert.equal(prediction.takeCameraSnap(),true);
});

test('rejects a forecast tick outside JavaScript safe integers',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',Number.MAX_SAFE_INTEGER-1,control,0,1,0);
  assert.equal(prediction.renderWorld(0,Number.MAX_SAFE_INTEGER+1,Number.MAX_SAFE_INTEGER),null);
});

test('a rejected late level can retain an explicitly rescheduled jump',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:1,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}});
  prediction.edgeOutcome('jump',1,'rescheduled',2);
  prediction.reject(1);
  const car=prediction.renderWorld(25,3,.5)!.entities[0];
  assert.ok(car.y>world.entities[0].y,'the accepted one-shot is still replayed');
  assert.ok(Math.abs(car.speed)<.001,'the rejected throttle is not replayed');
  prediction.edgeOutcome('jump',1,'expired',2);
  const stopped=prediction.renderWorld(30,3,.6)!.entities[0];
  assert.ok(stopped.y<=car.y+.1,'an expired edge is not newly replayed');
});


test('an accepted edge survives a stale-revision rejection across an action snapshot',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:1,input:{...NEUTRAL,throttle:1,jump:1}});
  prediction.edgeOutcome('jump',1,'accepted',3);
  prediction.reject(1);
  prediction.snapshot(world,'p',0,{...control,revision:1,actionSeq:1,edgeFloorRevision:0},0,1,10);
  const preview=prediction.renderWorld(20,4,0,1)!.entities[0];
  assert.ok(preview.y>world.entities[0].y,'accepted jump is replayed');
  assert.ok(Math.abs(preview.speed)<.001,'rejected throttle remains rejected');
});

test('a relocation floor discards a previously accepted stale edge',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:0,input:{...NEUTRAL,jump:1}});
  prediction.edgeOutcome('jump',1,'accepted',3);prediction.reject(1);
  prediction.snapshot(world,'p',0,{...control,revision:1,edgeFloorRevision:1},1,1,10);
  const preview=prediction.renderWorld(20,4,0,1)!.entities[0];
  assert.equal(preview.y,world.entities[0].y);
});

test('prediction does not award landmarks or claim supply pickups',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-829,z:4030,y:0,health:40,speed:0,vx:0,vz:0,supportId:'ground'});
  world.players[0].delivery.cash=9_000;
  world.pickups=[{id:'test-repair',x:car.x,z:car.z,kind:'repair',active:true}];
  const authoritative=structuredClone(world);
  step(authoritative,new Map([['p',NEUTRAL]]),.05);
  assert.ok(authoritative.players[0].achievements.unlocked.includes('luxury-visit'),'the same position earns a real landmark award');
  assert.equal(authoritative.pickups[0].active,false,'the authority claims the nearby pickup');
  assert.ok(authoritative.players[0].delivery.level>0,'the award would unlock a higher region');
  prediction.snapshot(world,'p',0,control,0,1,0);
  const shown=prediction.renderWorld(50,3,1)!;
  const replay=Reflect.get(prediction,'cache') as {simulation:World};
  assert.equal(replay.simulation.players[0].delivery.level,0,'the simulated car cannot use a speculative level');
  assert.deepEqual(replay.simulation.players[0].achievements.unlocked,[], 'the replay does not grant landmarks');
  assert.equal(shown.players[0].delivery.cash,world.players[0].delivery.cash);
  assert.deepEqual(shown.players[0].achievements.unlocked,world.players[0].achievements.unlocked);
  assert.equal(shown.entities[0].health,40);
  assert.equal(shown.pickups[0].active,true);
});
