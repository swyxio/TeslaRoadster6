import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, setDestination, step, type Entity } from '../shared/game';
import { LEVELS, requiredLevelAt } from '../shared/delivery';
import { landmarkBlocksPose } from '../shared/landmark-collision';
import { trafficInput } from '../shared/traffic';
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


test('a queue inside the clear Starbase channel does not trigger wall recovery',()=>{
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const pad=BUILDINGS.find(building=>building.style==='spaceport'&&building.x===1960)!;
  const y=terrainHeight(1960,6190.5)??0;
  const leader=makeEntity('channel-leader','model-3',1960,6183.5);
  Object.assign(leader,{y,yaw:0,speed:0,npc:true,autopilot:true});
  Object.assign(car,{kind:'model-3',x:1960,z:6190.5,y,yaw:0,speed:0,autopilot:true,
    navigation:{destination:{x:1960,z:6175},path:[{x:1960,z:6175}],index:0,status:'driving',mode:'intercity',
      recovery:{index:0,distance:15.5,at:0,attempts:0,reverseUntil:0}}});
  world.entities=[car,leader];world.time=13;
  assert.equal(landmarkBlocksPose(pad,car),false,'the car is in the open channel');
  assert.equal(landmarkBlocksPose(pad,leader),false,'the active leader also fits');
  const input=trafficInput(car,world);
  assert.ok(input.throttle>=0,'the queued car does not reverse');
  assert.equal(car.navigation?.recovery?.attempts,0);
  assert.equal(car.navigation?.recovery?.at,world.time,'the queue resets the stall timer');
});

test('a Starbase channel wall beyond the pad envelope starts recovery',()=>{
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const y=terrainHeight(1964,6232)??0;
  const join={x:1984,z:6232},destination={x:1995,z:6232};
  Object.assign(car,{kind:'model-3',x:1964,z:6232,y,yaw:-Math.PI/2,speed:0,autopilot:true,
    navigation:{destination,path:[join,destination],index:0,status:'driving',mode:'intercity',join}});
  world.entities=[car];world.time=1;
  const input=trafficInput(car,world);
  assert.equal(car.navigation?.recovery?.attempts,1,'the actual extended wall is detected');
  assert.ok(input.throttle<0,'the clear channel behind permits a checked reverse');
});
