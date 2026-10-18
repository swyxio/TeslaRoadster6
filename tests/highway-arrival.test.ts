import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,makeEntity,step,type Input} from '../shared/game';
import {isSurface,nearbyBuildings,terrainHeight} from '../shared/map';
import {body,contact} from '../shared/physics';
import {updateHighwayTraffic} from '../shared/traffic';
import {snapshotFor} from '../worker/snapshot';

const neutral:Input={throttle:0,steer:0,boost:false,hover:false,roll:0,brake:false,jump:0,flip:0,cockpit:false};
function stagedWorld(){
  const world=createWorld(0),x=-798,z=3300,yaw=.053;
  const player=addPlayer(world,'observer','Observer',[{x,y:terrainHeight(x,z)!,z,yaw}]);
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  assert.equal(car.x,x);assert.equal(car.z,z);
  return {world,player,car};
}

test('a clear oncoming replacement enters moving, hidden from every snapshot and with physics clearance',()=>{
  const {world,player}=stagedWorld();
  for(let i=0;i<99;i++)step(world,new Map([[player.id,{...neutral,throttle:1}]]),.05);
  const original=structuredClone(world);world.time=5;
  const before=new Set(world.entities.map(entity=>entity.id));
  updateHighwayTraffic(world,.05,makeEntity);
  const replacement=world.entities.find(entity=>!before.has(entity.id)&&entity.id.startsWith('ambient-'));
  assert.ok(replacement,'far traffic is replaced on the first reconciliation');
  const entry={x:replacement.x,z:replacement.z,yaw:replacement.yaw};
  assert.ok(replacement.speed>=10,'a clear straight permits a moving entry');
  assert.equal(replacement.vx,-Math.sin(replacement.yaw)*replacement.speed);
  assert.equal(replacement.vz,-Math.cos(replacement.yaw)*replacement.speed);
  for(const observer of world.players){
    const viewer=world.entities.find(entity=>entity.id===observer.entityId)!;
    assert.ok(Math.hypot(replacement.x-viewer.x,replacement.z-viewer.z)>1600);
    assert.ok(!snapshotFor(world,observer.id).entities.includes(replacement));
  }
  assert.ok(isSurface(replacement.x,replacement.z));
  assert.ok(!nearbyBuildings(replacement.x,replacement.z,10).some(building=>contact(body(replacement),{...building,yaw:0})));
  for(const other of world.entities)if(other!==replacement){
    assert.ok(Math.hypot(replacement.x-other.x,replacement.z-other.z)>=30);
    assert.equal(contact(body(replacement),body(other)),null);
  }
  for(let i=0;i<40;i++)step(world,new Map([[player.id,{...neutral,throttle:1}]]),.05);
  assert.equal(replacement.health,100,'the moving entry remains clear in shared physics');

  // Re-run the same reconciliation with a stopped car ahead: the spawn stays
  // hidden and non-overlapping, but the moving entry is refused.
  original.time=5;
  const fx=-Math.sin(entry.yaw),fz=-Math.cos(entry.yaw);
  const blocker=makeEntity('entry-blocker','model-3',entry.x+fx*35,entry.z+fz*35);
  blocker.yaw=entry.yaw;original.entities.push(blocker);
  const prior=new Set(original.entities.map(entity=>entity.id));
  updateHighwayTraffic(original,.05,makeEntity);
  const guarded=original.entities.find(entity=>!prior.has(entity.id)&&entity.id.startsWith('ambient-'));
  assert.ok(guarded);assert.ok(Math.hypot(guarded.x-blocker.x,guarded.z-blocker.z)>=30);
  assert.equal(guarded.speed,0,'an obstructed moving entry starts at rest');
});

test('the staged drive encounters oncoming traffic sooner without a visible teleport',()=>{
  const {world,player,car}=stagedWorld();
  const known=new Set(world.entities.map(entity=>entity.id));
  let firstForward1200=Infinity,nearestForward=Infinity;
  for(let tick=0;tick<570;tick++){
    const time=tick*.05,throttle=time<8.5||time>=21&&time<25?1:0;
    step(world,new Map([[player.id,{...neutral,throttle}]]),.05);
    for(const other of world.entities){
      if(!known.has(other.id)&&other.id.startsWith('ambient-')){
        for(const p of world.players){
          const viewer=world.entities.find(entity=>entity.id===p.entityId)!;
          assert.ok(Math.hypot(other.x-viewer.x,other.z-viewer.z)>1600);
        }
        known.add(other.id);
      }
      if(!other.id.startsWith('ambient-')||other.driver)continue;
      const dx=other.x-car.x,dz=other.z-car.z,distance=Math.hypot(dx,dz);
      const ahead=dx*-Math.sin(car.yaw)+dz*-Math.cos(car.yaw);
      const side=Math.abs(dx*Math.cos(car.yaw)-dz*Math.sin(car.yaw));
      if(ahead<=0||side>ahead*Math.tan(35*Math.PI/180))continue;
      nearestForward=Math.min(nearestForward,distance);
      if(distance<=1200)firstForward1200=Math.min(firstForward1200,world.time);
    }
  }
  assert.ok(firstForward1200<=20,`first forward car at ${firstForward1200}s`);
  assert.ok(nearestForward<900,`closest forward car ${nearestForward}m`);
  assert.equal(car.health,100);
});
