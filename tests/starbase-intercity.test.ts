import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, setDestination, step, type Entity } from '../shared/game';
import { LEVELS, requiredLevelAt } from '../shared/delivery';
import { landmarkBlocksPose } from '../shared/landmark-collision';
import { BUILDINGS, terrainHeight } from '../shared/map';
import { DELIVERY_DESTINATION_SNAP, nearestNavigationAnchor, planNavigation } from '../shared/navigation';

test('an off-lane delivery route enters and leaves the Starbase channel without crossing its walls',()=>{
  // A synthetic stop exercises the delivery approach, not catalog scheduling.
  const road={x:1913,z:6250},stop={x:1960,z:6232};
  const pad=BUILDINGS.find(building=>building.style==='spaceport'&&building.x===1960);
  assert.ok(pad);
  const anchor=nearestNavigationAnchor(stop,5);
  assert.ok(anchor&&anchor.distance>DELIVERY_DESTINATION_SNAP&&anchor.distance<=150,'stop requires an off-lane approach');
  assert.notEqual(terrainHeight(stop.x,stop.z),null);
  assert.ok(requiredLevelAt(stop.x,stop.z)<=5);

  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind:'roadster',...road,y:terrainHeight(road.x,road.z)??0,yaw:0,speed:0,supportId:'ground'});
  player.delivery.level=5;player.delivery.cash=LEVELS[5].cash+2_500;car.upgrades.autonomyIntercity=true;
  world.entities=[car];world.pickups=[];
  assert.equal(landmarkBlocksPose(pad,{...car,...stop,y:terrainHeight(stop.x,stop.z)??0}),false,'stop is clear');

  const clearSegment=(a:{x:number;z:number},b:{x:number;z:number},vehicle:Entity,spacing=.05)=>{
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/spacing));
    const yaw=Math.atan2(a.x-b.x,a.z-b.z);
    for(let i=1;i<=count;i++){
      const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(landmarkBlocksPose(pad,{...vehicle,x,z,y:terrainHeight(x,z)??0,yaw}))return false;
    }
    return true;
  };
  assert.equal(clearSegment(road,stop,car),false,'direct approach crosses a real wall');
  const assertRouteClear=()=>{
    let previous={x:car.x,z:car.z};
    for(const next of car.navigation!.path){
      assert.equal(clearSegment(previous,next,car),true,'the planned vehicle footprint clears the channel');
      previous=next;
    }
  };
  const drive=(target:{x:number;z:number})=>{
    const start={x:car.x,z:car.z};
    for(let i=0;i<6000&&car.autopilot;i++){
      world.entities=[car];step(world,new Map(),.05);
      assert.equal(landmarkBlocksPose(pad,car),false,'the driven vehicle stays clear');
    }
    assert.equal(car.navigation?.status,'arrived');
    assert.equal(car.health,100);
    assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<9,'vehicle reaches its target');
    assert.ok(Math.hypot(car.x-start.x,car.z-start.z)>10,'vehicle actually moves');
  };

  const arrival=planNavigation(car,stop,5,DELIVERY_DESTINATION_SNAP,true);
  assert.ok(arrival?.exit,'delivery route leaves the road for the checked stop');
  assert.deepEqual(arrival.destination,stop);
  car.navigation=Object.assign(arrival,{mode:'intercity' as const});car.autopilot=true;car.pauseUntil=0;
  assertRouteClear();drive(stop);
  assert.equal(setDestination(world,'driver',road,'intercity'),true,'the arrived car can return to the road');
  assert.ok(car.navigation?.join,'departure rejoins the lane from off road');
  assertRouteClear();drive(road);
});
