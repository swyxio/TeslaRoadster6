import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,interact,makeEntity,step} from '../shared/game';
import {HIGHWAY_ROUTE_IDS,ROUTES,TRAFFIC_INCIDENT,updateHighwayTraffic} from '../shared/traffic';
import {VEHICLES} from '../shared/vehicles';

function placeOnHighway(world:ReturnType<typeof createWorld>,id:string,z:number){
  const player=addPlayer(world,id,id),car=world.entities.find(entity=>entity.id===player.entityId)!;
  const routeId=HIGHWAY_ROUTE_IDS[0],route=ROUTES[routeId];
  const index=route.findIndex((a,i)=>{
    const b=route[(i+1)%route.length];
    return Math.abs(b.z-a.z)>20&&z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z);
  });
  assert.ok(index>=0);
  const a=route[index],b=route[(index+1)%route.length],t=(z-a.z)/(b.z-a.z);
  Object.assign(car,{x:a.x+(b.x-a.x)*t,z,y:0,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId,waypoint:index+1});
  return car;
}

test('highway spawns replace slow city cars with a freeway-capable model',()=>{
  const world=createWorld();placeOnHighway(world,'p',1500);
  world.time=270;updateHighwayTraffic(world,5,makeEntity);
  // The deterministic choice for this id would otherwise be the slow Firefly.
  const car=world.entities.find(entity=>entity.id==='ambient-54');
  assert.ok(car);
  assert.ok(VEHICLES[car.kind as keyof typeof VEHICLES].maxSpeed>=20,`${car.kind} is too slow for the freeway`);
});

test('highway fleet replenishes around separated drivers without appearing in either snapshot',()=>{
  const world=createWorld(),one=placeOnHighway(world,'one',1500),two=placeOnHighway(world,'two',7200);
  world.entities=world.entities.filter(entity=>!entity.id.startsWith('ambient-'));
  for(let time=240;time<=295;time+=5){
    const before=new Set(world.entities.map(entity=>entity.id));
    world.time=time;updateHighwayTraffic(world,5,makeEntity);
    const added=world.entities.filter(entity=>!before.has(entity.id));
    assert.ok(added.length<=1);
    for(const car of added){
      const distances=[one,two].map(viewer=>Math.hypot(car.x-viewer.x,car.z-viewer.z));
      assert.ok(distances.every(distance=>distance>1600),'no car appears in either driver’s view');
      assert.ok(Math.min(...distances)<=3000,'new traffic is near a driver');
    }
  }
  const cars=world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  assert.equal(cars.length,12);
  for(const viewer of [one,two])assert.ok(cars.some(car=>Math.hypot(car.x-viewer.x,car.z-viewer.z)<3000),'both separated drivers receive traffic');
});

test('only an isolated, hidden, moving highway car is recycled',()=>{
  const world=createWorld(),viewer=placeOnHighway(world,'p',3000);
  world.entities=world.entities.filter(entity=>!entity.id.startsWith('ambient-'));
  const car=(id:string,x:number,z:number,speed:number)=>{
    const entity=makeEntity(id,'model-3',x,z);
    Object.assign(entity,{npc:true,autopilot:true,routeId:HIGHWAY_ROUTE_IDS[0],speed});
    world.entities.push(entity);return entity;
  };
  const far=car('ambient-far',1000,9000,20);
  const stopped=car('ambient-stopped',1200,9000,0);
  const queued=car('ambient-queued',1225,9000,20);
  const incident=car(TRAFFIC_INCIDENT.entityId,viewer.x+100,viewer.z,20);
  const taken=car('ambient-taken',1400,9000,20);taken.driver='other';taken.autopilot=false;
  for(let i=0;i<8;i++)car(`ambient-near-${i}`,viewer.x+150+i*50,viewer.z+100,20);
  const previous=new Set(world.entities.map(entity=>entity.id));
  world.time=240;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(!world.entities.includes(far),'a hidden free-flowing car was recycled');
  for(const keep of [stopped,queued,incident,taken])assert.ok(world.entities.includes(keep),`${keep.id} was retained`);
  const added=world.entities.filter(entity=>!previous.has(entity.id));
  assert.equal(added.length,1,'replacement enters during the same reconciliation');
  const distance=Math.hypot(added[0].x-viewer.x,added[0].z-viewer.z);
  assert.ok(distance>1600&&distance<3000,'replacement stays hidden but is closer to the driver');
});

test('recycling followed by a takeover replenishes with a unique ID',()=>{
  const world=createWorld(),viewer=placeOnHighway(world,'observer',3000);
  world.entities=world.entities.filter(entity=>!entity.id.startsWith('ambient-'));
  const add=(id:string,x:number,z:number)=>{
    const car=makeEntity(id,'model-3',x,z);
    Object.assign(car,{npc:true,autopilot:true,routeId:HIGHWAY_ROUTE_IDS[0],speed:20});
    world.entities.push(car);return car;
  };
  const far=add('ambient-far',1000,9000);
  const visible=Array.from({length:11},(_,i)=>add(`ambient-visible-${i}`,viewer.x+100+i*50,viewer.z+100));
  world.time=240;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(!world.entities.includes(far));
  const replacement=world.entities.find(entity=>entity.id==='ambient-49');
  assert.ok(replacement,'recycling assigned the next reconciliation tick');

  const taker=addPlayer(world,'take','Take');taker.delivery.level=3;taker.delivery.cash=1_000_000;
  const target=visible[0],person=makeEntity('person-take','person',target.x+3,target.z,'take');
  world.entities=world.entities.filter(entity=>entity.id!==taker.entityId);
  world.entities.push(person);taker.entityId=person.id;interact(world,'take');
  assert.equal(taker.entityId,target.id);assert.equal(target.driver,'take');

  world.time=245;updateHighwayTraffic(world,5,makeEntity);
  const ambient=world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  assert.equal(ambient.length,13);
  assert.equal(ambient.filter(entity=>!entity.driver&&entity.autopilot).length,12);
  assert.equal(new Set(ambient.map(entity=>entity.id)).size,ambient.length);
  assert.ok(world.entities.includes(replacement));
  assert.equal(target.driver,'take');
});

test('owned and ferry-supported vehicles are never reclaimed outside the normal view radius',()=>{
  const world=createWorld(),viewer=placeOnHighway(world,'p',3000);
  world.entities=world.entities.filter(entity=>!entity.id.startsWith('ambient-'));
  const add=(id:string,x:number,z:number)=>{
    const car=makeEntity(id,'model-3',x,z);
    Object.assign(car,{npc:true,autopilot:true,routeId:HIGHWAY_ROUTE_IDS[0],speed:20});
    world.entities.push(car);return car;
  };
  const owned=add('ambient-owned',1000,9000);owned.owner='p';
  const ferry=add('ambient-ferry',1200,9000);ferry.supportId='ferry';
  for(let i=0;i<2;i++)add(`ambient-visible-${i}`,viewer.x+100+i*50,viewer.z);
  world.time=240;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(world.entities.includes(owned));assert.ok(world.entities.includes(ferry));
  // Also preserve those cars when demand is falling rather than redistributing.
  world.time=2160;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(world.entities.includes(owned));assert.ok(world.entities.includes(ferry));
});

test('highway cars have a repeatable mix of simulated driving speeds',()=>{
  const routeId=HIGHWAY_ROUTE_IDS[0],route=ROUTES[routeId];
  const index=route.findIndex((a,i)=>{
    const b=route[(i+1)%route.length];
    return a.z>2500&&a.z<7000&&b.z>2500&&b.z<7000&&Math.hypot(b.x-a.x,b.z-a.z)>300;
  });
  assert.ok(index>=0);
  const a=route[index],b=route[(index+1)%route.length];
  const speeds:number[]=[];
  for(let i=0;i<9;i++){
    const world=createWorld(),car=makeEntity(`ambient-mix-${i}`,'model-3',(a.x+b.x)/2,(a.z+b.z)/2);
    Object.assign(car,{npc:true,autopilot:true,routeId,waypoint:index+1,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),speed:15});
    world.entities=[car];world.players=[];world.pickups=[];
    for(let j=0;j<200;j++)step(world,new Map(),.05);
    assert.equal(car.health,100);
    speeds.push(car.speed);
  }
  assert.ok(Math.max(...speeds)-Math.min(...speeds)>4,`speed range ${speeds}`);
  assert.ok(speeds.every(speed=>speed>12&&speed<25),`highway speed bounds ${speeds}`);
});
