import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, interact, makeEntity, NEUTRAL, step } from '../shared/game';
import { DOME } from '../shared/dome';
import { FERRY_DECK } from '../shared/ferry';
import { FERRY_DOCKS, isRocketIsland, isSurface } from '../shared/map';
import { body, contact } from '../shared/physics';

function setup(){
  const world=createWorld();world.entities=[];world.players=[];world.pickups=[];
  const player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
  return {world,player,car};
}

test('replacement spawns account for borrowed cars and remove owned cars and pedestrians',()=>{
  for(const dome of [false,true])for(const mode of ['borrowed','owned','pedestrian'] as const){
    const {world,player,car}=setup(),x=dome?DOME.x-30:-36,z=dome?DOME.z:-1120;
    Object.assign(car,{x,z,y:0,inDome:dome,supportId:dome?'dome':'ground',domeS:dome?DOME.flatHalfWidth:null,speed:0});
    if(mode==='borrowed')car.owner=null;
    if(mode==='pedestrian'){
      interact(world,'p');assert.notEqual(player.entityId,car.id);
    }
    assert.ok(chooseVehicle(world,'p','model-3'));
    const replacement=world.entities.find(e=>e.id===player.entityId)!;
    assert.notEqual(replacement,car);
    if(mode==='borrowed'){
      assert.ok(world.entities.includes(car));assert.equal(contact(body(replacement),body(car)),null);
    }else{
      assert.ok(!world.entities.includes(car));assert.deepEqual([replacement.x,replacement.z],[x,z]);
      assert.ok(!world.entities.some(e=>e.id==='person-p'));
    }
  }
});

test('water recovery uses the island only near its actual shoreline',()=>{
  for(const [x,z,expectedIsland] of [[-540,-1800,true],[150,-800,false],[-300,-650,false]] as const){
    const {world,car}=setup();assert.equal(isSurface(x,z),false);
    Object.assign(car,{x,z,y:.01,vy:-5,vx:0,vz:0,supportId:null});
    const relocated:string[]=[];
    step(world,new Map(),.05,{onRelocation:id=>relocated.push(id)});
    assert.equal(isRocketIsland(car.x,car.z),expectedIsland,`water at ${x},${z}`);
    assert.equal(car.supportId,'ground');
    assert.deepEqual(relocated,['p']);
  }
});

test('a full ferry stops the entire rotated vehicle footprint ashore at either dock',()=>{
  for(const side of ['sf','island'] as const)for(const kind of ['roadster','tesla-semi'] as const)for(const angle of [0,.15]){
    const {world,car}=setup(),dock=FERRY_DOCKS[side],shore=side==='sf'?1:-1;
    Object.assign(world.ferry,{phase:side,z:dock.deckZ,remaining:30});
    for(const x of [-3.5,3.5])for(const offset of [-11,0,11]){
      const occupant=makeEntity(`parked-${x}-${offset}`,'waymo-firefly',x,world.ferry.z+offset);
      occupant.supportId='ferry';world.entities.push(occupant);
    }
    Object.assign(car,{kind,x:0,z:dock.z+shore*20,y:0,yaw:side==='sf'?angle:Math.PI-angle,speed:7,supportId:'ground'});
    for(let i=0;i<150;i++)step(world,new Map([['p',{...NEUTRAL,throttle:.5}]]),.05);
    const deck={x:world.ferry.x,z:world.ferry.z,w:FERRY_DECK.width,d:FERRY_DECK.length,yaw:0};
    assert.equal(car.supportId,'ground');assert.equal(contact(body(car),deck),null,`${side} ${kind} still straddles`);
    world.ferry.remaining=0;step(world,new Map(),.05);
    assert.equal(world.ferry.phase,side==='sf'?'to-island':'to-sf');
    assert.equal(world.ferry.passengers.length,6);
  }
});
