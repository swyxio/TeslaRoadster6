import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, step, type EconomyHooks, type Pickup } from '../shared/game';
import { DOME } from '../shared/dome';
import { domeSurface } from '../shared/map';

for(const kind of ['rocket','repair','air'] as const)test(`identity-pending drivers do not claim or block ${kind} pickups`,()=>{
  const world=createEmptyWorld(),pending=addPlayer(world,'a','Waiting'),ready=addPlayer(world,'b','Ready');
  const a=world.entities.find(entity=>entity.id===pending.entityId)!;
  const b=world.entities.find(entity=>entity.id===ready.entityId)!;
  Object.assign(a,{kind:'model-3',x:-3,z:60,y:0,speed:0,vx:0,vy:0,vz:0,health:40,air:40,supportId:'ground'});
  Object.assign(b,{kind:'model-3',x:3,z:60,y:0,speed:0,vx:0,vy:0,vz:0,health:40,air:40,supportId:'ground'});
  a.upgrades.rocket=false;b.upgrades.rocket=false;
  const pickup:Pickup={id:'test',x:0,z:60,kind,active:true};world.pickups=[pickup];
  world.entities=[a];world.players=[pending];
  const claims:string[]=[];
  const economy:EconomyHooks={
    canCollect:id=>id==='b',update:()=>{},
    pickup:(player,_car,item)=>{claims.push(player.id);item.active=false;},
  };
  step(world,new Map(),.05,{economy});
  assert.equal(pickup.active,true,'a waiting driver leaves the pickup available');
  assert.equal(a.upgrades.rocket,false);assert.equal(a.air,40);assert.equal(a.health,40);
  world.entities.push(b);world.players.push(ready);
  step(world,new Map(),.05,{economy});
  assert.equal(pickup.active,false,'an eligible driver can claim the pickup');
  assert.equal(a.upgrades.rocket,false);assert.equal(a.air,40);assert.equal(a.health,40);
  if(kind==='rocket'){assert.equal(b.upgrades.rocket,true);assert.equal(b.air,100);}
  else assert.deepEqual(claims,['b']);
});

test('identity-pending drivers do not receive automatic station or Dome refills',()=>{
  const hooks:EconomyHooks={canCollect:()=>false,update:()=>{},pickup:()=>{}};
  const world=createEmptyWorld(),player=addPlayer(world,'a','Waiting');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{x:32,z:30,y:0,speed:0,vx:0,vz:0,air:40,supportId:'ground'});
  world.entities=[car];world.pickups=[];
  const active=structuredClone(world);
  step(world,new Map(),.05,{economy:hooks});
  step(active,new Map(),.05);
  assert.equal(car.air,40,'a pending driver receives no station refill');
  assert.ok(active.entities[0].air>40,'the station still serves an active driver');

  const dome=createEmptyWorld(),domePlayer=addPlayer(dome,'a','Waiting');
  const domeCar=dome.entities.find(entity=>entity.id===domePlayer.entityId)!;
  const s=2*DOME.flatHalfWidth+DOME.radius*Math.acos(1-12/DOME.radius),surface=domeSurface(s);
  Object.assign(domeCar,{inDome:true,supportId:'dome',domeS:s,x:DOME.x-30,y:surface.y,z:surface.z,yaw:-Math.PI/2,speed:12,air:40});
  dome.entities=[domeCar];dome.pickups=[];
  const activeDome=structuredClone(dome);
  step(dome,new Map(),.05,{economy:hooks});
  step(activeDome,new Map(),.05);
  assert.ok(domeCar.air<=40,'a pending driver receives no Dome refill');
  assert.ok(activeDome.entities[0].air>40,'the Dome still serves an active driver');
});
