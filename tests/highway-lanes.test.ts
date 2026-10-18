import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,makeEntity,NEUTRAL,step} from '../shared/game';
import {HIGHWAYS} from '../shared/map';
import {body,contact} from '../shared/physics';
import {HIGHWAY_ROUTE_IDS,ROUTES,trafficInput} from '../shared/traffic';
import {VEHICLES,VEHICLE_IDS,type VehicleId} from '../shared/vehicles';

// Select a real long straight from the existing route and verify road coverage
// independently against the matching 32 m highway centerline.
function straight(direction:number){
  const routeId=HIGHWAY_ROUTE_IDS[direction],route=ROUTES[routeId];
  for(let i=0;i<route.length;i++){
    const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<1000)continue;
    const ux=dx/length,uz=dz/length;
    for(const highway of HIGHWAYS.slice(0,2))for(let j=1;j<highway.points.length;j++){
      const p=highway.points[j-1],q=highway.points[j],hx=q.x-p.x,hz=q.z-p.z,hLength=Math.hypot(hx,hz);
      const hxUnit=hx/hLength,hzUnit=hz/hLength;
      const x=(a.x+b.x)/2-p.x,z=(a.z+b.z)/2-p.z;
      if(Math.abs(hxUnit*ux+hzUnit*uz)>.9995&&Math.abs(hxUnit*z-hzUnit*x)<6&&
        x*hxUnit+z*hzUnit>0&&x*hxUnit+z*hzUnit<hLength){
        return {routeId,waypoint:(i+1)%route.length,a,length,ux,uz,rx:-uz,rz:ux,p,hxUnit,hzUnit};
      }
    }
  }
  throw new Error(`No suitable highway segment for direction ${direction}`);
}

function setup(direction:number,kind:VehicleId='model-3',distance=30){
  const road=straight(direction),world=createWorld();
  const car=makeEntity(`ambient-lane-${kind}`,kind,road.a.x+road.ux*distance,road.a.z+road.uz*distance);
  Object.assign(car,{npc:true,autopilot:true,routeId:road.routeId,waypoint:road.waypoint,
    yaw:Math.atan2(-road.ux,-road.uz),speed:15});
  world.entities=[car];world.players=[];world.pickups=[];
  return {road,world,car};
}

test('all ambient vehicles use the middle lane and return before the end of a straight, in both directions',()=>{
  for(const direction of [0,1])for(const kind of VEHICLE_IDS){
    const {road,world,car}=setup(direction,kind);
    let maxOffset=0,steps=0;
    while(steps++<5000){
      step(world,new Map(),.05);world.entities=[car];
      const x=car.x-road.a.x,z=car.z-road.a.z,along=x*road.ux+z*road.uz,offset=x*road.rx+z*road.rz;
      maxOffset=Math.max(maxOffset,offset);
      // Check the complete oriented body, not just its center, against pavement.
      const spec=VEHICLES[kind],rightX=Math.cos(car.yaw),rightZ=-Math.sin(car.yaw);
      const frontX=-Math.sin(car.yaw),frontZ=-Math.cos(car.yaw);
      for(const side of [-1,1])for(const end of [-1,1]){
        const px=car.x+side*rightX*spec.width/2+end*frontX*spec.length/2-road.p.x;
        const pz=car.z+side*rightZ*spec.width/2+end*frontZ*spec.length/2-road.p.z;
        assert.ok(Math.abs(road.hxUnit*pz-road.hzUnit*px)<=16,`${kind} left the pavement`);
      }
      assert.equal(car.health,100,`${kind} hit something`);
      if(along>=road.length-30){assert.ok(Math.abs(offset)<1.5,`${kind} did not return before the joint: ${offset}`);break;}
    }
    assert.ok(steps<5000,`${kind} did not make progress`);
    assert.ok(maxOffset>5&&maxOffset<6.5,`${kind} missed the middle lane: ${maxOffset}`);
  }
});

test('every vehicle fits the new outside lane on the existing pavement in both directions',()=>{
  for(const direction of [0,1])for(const kind of VEHICLE_IDS){
    const {road,world,car}=setup(direction,kind,170);
    // The navigation lane is 4 m from the center; another 10 m puts the car
    // in the center of the new outer lane, between the 12 m line and edge.
    car.x+=road.rx*10;car.z+=road.rz*10;car.driver='p';car.autopilot=false;
    for(let i=0;i<120;i++){
      step(world,new Map([['p',{...NEUTRAL,throttle:.5}]]),.05);
      const spec=VEHICLES[kind],rightX=Math.cos(car.yaw),rightZ=-Math.sin(car.yaw);
      const frontX=-Math.sin(car.yaw),frontZ=-Math.cos(car.yaw);
      for(const side of [-1,1])for(const end of [-1,1]){
        const x=car.x+side*rightX*spec.width/2+end*frontX*spec.length/2-road.p.x;
        const z=car.z+side*rightZ*spec.width/2+end*frontZ*spec.length/2-road.p.z;
        const lateral=Math.abs(road.hxUnit*z-road.hzUnit*x);
        assert.ok(lateral>=12&&lateral<=16,`${kind} did not fit the outside lane: ${lateral}`);
      }
    }
    assert.equal(car.health,100,`${kind} hit something`);
  }
});

test('the widest and fastest representative vehicles stay on every eligible straight',()=>{
  let covered=0;
  for(const routeId of HIGHWAY_ROUTE_IDS){
    const route=ROUTES[routeId];
    for(let i=0;i<route.length;i++){
      const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<500)continue;
      const ux=dx/length,uz=dz/length,rx=-uz,rz=ux,waypoint=(i+1)%route.length;
      let road:{p:{x:number;z:number};hx:number;hz:number}|null=null;
      for(const highway of HIGHWAYS.slice(0,2))for(let j=1;j<highway.points.length;j++){
        const p=highway.points[j-1],q=highway.points[j],hl=Math.hypot(q.x-p.x,q.z-p.z);
        const hx=(q.x-p.x)/hl,hz=(q.z-p.z)/hl,x=(a.x+b.x)/2-p.x,z=(a.z+b.z)/2-p.z;
        if(Math.abs(hx*ux+hz*uz)>.9995&&Math.abs(hx*z-hz*x)<6&&x*hx+z*hz>0&&x*hx+z*hz<hl)road={p,hx,hz};
      }
      if(!road)continue;
      const probeWorld=createWorld(),probe=makeEntity('ambient-probe','model-3',(a.x+b.x)/2,(a.z+b.z)/2);
      Object.assign(probe,{npc:true,autopilot:true,routeId,waypoint,yaw:Math.atan2(-ux,-uz),speed:15});
      probeWorld.entities=[probe];probeWorld.players=[];
      let eligible=false;
      for(const fraction of [.25,.5,.75]){
        probe.x=a.x+ux*length*fraction;probe.z=a.z+uz*length*fraction;
        if(Math.abs(trafficInput(probe,probeWorld).steer)>.04)eligible=true;
      }
      if(!eligible)continue;
      covered++;
      for(const kind of ['roadster','waymo-firefly','waymo-peterbilt'] as const){
        const world=createWorld(),car=makeEntity(`ambient-segment-${routeId}-${i}`,kind,a.x+ux*30,a.z+uz*30);
        Object.assign(car,{npc:true,autopilot:true,routeId,waypoint,yaw:Math.atan2(-ux,-uz),speed:15});
        world.entities=[car];world.players=[];world.pickups=[];
        let steps=0;
        while(steps++<6000){
          step(world,new Map(),.05);world.entities=[car];
          const along=(car.x-a.x)*ux+(car.z-a.z)*uz,offset=(car.x-a.x)*rx+(car.z-a.z)*rz;
          const spec=VEHICLES[kind],rightX=Math.cos(car.yaw),rightZ=-Math.sin(car.yaw);
          const frontX=-Math.sin(car.yaw),frontZ=-Math.cos(car.yaw);
          for(const side of [-1,1])for(const end of [-1,1]){
            const x=car.x+side*rightX*spec.width/2+end*frontX*spec.length/2-road.p.x;
            const z=car.z+side*rightZ*spec.width/2+end*frontZ*spec.length/2-road.p.z;
            assert.ok(Math.abs(road.hx*z-road.hz*x)<=16,`${routeId}/${i} ${kind} left pavement`);
          }
          assert.equal(car.health,100,`${routeId}/${i} ${kind} hit something`);
          if(along>=length-30){assert.ok(Math.abs(offset)<1.5,`${routeId}/${i} ${kind} missed the return`);break;}
        }
        assert.ok(steps<6000,`${routeId}/${i} ${kind} did not make progress`);
      }
    }
  }
  assert.ok(covered>=20,`only ${covered} eligible segments were exercised`);
});

test('a blocked merge stays clear and resumes when the adjacent car leaves',()=>{
  const {road,world,car}=setup(0,'model-3',170);
  const other=makeEntity('adjacent-car','model-3',car.x+road.rx*5.5,car.z+road.rz*5.5);
  Object.assign(other,{driver:'p',yaw:car.yaw});world.entities.push(other);
  for(let i=0;i<100;i++){step(world,new Map(),.05);world.entities=[car,other];}
  let side=(car.x-road.a.x)*road.rx+(car.z-road.a.z)*road.rz;
  assert.ok(side<1,`blocked car crossed lanes: ${side}`);assert.equal(car.health,100);
  world.entities=[car];
  for(let i=0;i<300;i++){step(world,new Map(),.05);world.entities=[car];}
  side=(car.x-road.a.x)*road.rx+(car.z-road.a.z)*road.rz;
  assert.ok(side>4.5&&side<6.5,`car did not merge into the middle lane after clearance: ${side}`);assert.equal(car.health,100);
});

test('a player occupying or rapidly approaching the swept lane defers the merge',()=>{
  for(const behind of [false,true]){
    const {road,world,car}=setup(0,'model-3',170);
    assert.equal(trafficInput(car,world).brake,false);
    const distance=behind?-125:0;
    const player=makeEntity('player-car','model-3',car.x+road.rx*5.5+road.ux*distance,car.z+road.rz*5.5+road.uz*distance);
    Object.assign(player,{driver:'p',yaw:car.yaw,speed:behind?55:15});world.entities.push(player);
    assert.equal(trafficInput(car,world).brake,true,behind?'fast car approaching from behind':'occupied lane');
    world.entities.pop();assert.equal(trafficInput(car,world).brake,false,'merge resumes after clearance');
  }
});

test('a stopped same-lane queue behind a merging car does not deadlock it',()=>{
  const {road,world,car}=setup(0,'model-3',170);
  car.speed=0;
  const follower=makeEntity('player-car','roadster',car.x-road.ux*7,car.z-road.uz*7);
  Object.assign(follower,{driver:'p',yaw:car.yaw,speed:0});
  const police=makeEntity('police-follower','model-3',car.x-road.ux*17,car.z-road.uz*17);
  Object.assign(police,{yaw:car.yaw,speed:0});
  world.entities.push(follower,police);
  assert.equal(trafficInput(car,world).brake,false,'a clear merge is not blocked by stationary followers');
  const start={x:car.x,z:car.z};
  for(let i=0;i<200;i++){step(world,new Map(),.05);world.entities=[car,follower,police];}
  assert.ok(Math.hypot(car.x-start.x,car.z-start.z)>40,'the leading car escapes the queue');
  assert.equal(car.health,100);assert.equal(follower.health,100);assert.equal(police.health,100);
});

test('a rapidly closing same-lane follower still defers the merge',()=>{
  const {road,world,car}=setup(0,'model-3',170);
  car.speed=0;
  const follower=makeEntity('fast-follower','model-3',car.x-road.ux*35,car.z-road.uz*35);
  Object.assign(follower,{driver:'p',yaw:car.yaw,speed:20});world.entities.push(follower);
  assert.equal(trafficInput(car,world).brake,true);
});

test('a populated highway does not deadlock the player behind a merging car',()=>{
  const world=createWorld(0),player=addPlayer(world,'observer','Observer');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const routeId=HIGHWAY_ROUTE_IDS[0],route=ROUTES[routeId],z=1500;
  const index=route.findIndex((a,i)=>{
    const b=route[(i+1)%route.length];
    return Math.abs(b.z-a.z)>20&&z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z);
  });
  assert.ok(index>=0);
  const a=route[index],b=route[(index+1)%route.length],t=(z-a.z)/(b.z-a.z);
  Object.assign(car,{x:a.x+(b.x-a.x)*t,z,y:0,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),
    npc:false,autopilot:true,routeId,waypoint:index+1,speed:15,supportId:'ground'});
  player.delivery.cash=1_000_000;player.delivery.level=3;world.time=240;
  let distance=0,slow=0,longestSlow=0;
  for(let tick=0;tick<240*20;tick++){
    const x=car.x,previousZ=car.z;step(world,new Map(),.05);
    distance+=Math.hypot(car.x-x,car.z-previousZ);
    slow=car.speed<4?slow+.05:0;longestSlow=Math.max(longestSlow,slow);
    for(const other of world.entities){
      if(other!==car&&Math.hypot(other.x-car.x,other.z-car.z)<15){
        assert.equal(contact(body(car),body(other)),null,'player traffic stays physically clear');
      }
    }
  }
  assert.ok(longestSlow<5,`slow or stopped for ${longestSlow.toFixed(1)} s`);
  assert.ok(distance>4500,`only traveled ${distance.toFixed(0)} m`);
  assert.equal(car.health,100);assert.equal(car.autopilot,true);
});

test('a blocked return merge brakes before the end of the straight and resumes when clear',()=>{
  const road=straight(0),{world,car}=setup(0,'model-3',road.length-100);
  car.x+=road.rx*5.5;car.z+=road.rz*5.5;
  const player=makeEntity('player-car','model-3',car.x-road.rx*5.5,car.z-road.rz*5.5);
  Object.assign(player,{driver:'p',yaw:car.yaw,speed:15});world.entities.push(player);
  assert.equal(trafficInput(car,world).brake,true);
  world.entities.pop();
  const clear=trafficInput(car,world);
  assert.equal(clear.brake,false);assert.ok(Math.abs(clear.steer)>.01,'steers back toward the inner lane');
});

test('a blocked return stops on pavement and safely finishes after the adjacent lane clears',()=>{
  const road=straight(0),{world,car}=setup(0,'model-3',road.length-100);
  car.x+=road.rx*5.5;car.z+=road.rz*5.5;
  const other=makeEntity('player-car','model-3',car.x-road.rx*5.5,car.z-road.rz*5.5);
  Object.assign(other,{driver:'p',yaw:car.yaw,speed:0});world.entities.push(other);
  for(let i=0;i<100;i++){step(world,new Map(),.05);world.entities=[car,other];}
  let along=(car.x-road.a.x)*road.ux+(car.z-road.a.z)*road.uz;
  assert.ok(along<road.length-30&&Math.abs(car.speed)<1,'car stops before its exit taper ends');
  assert.equal(car.health,100);
  world.entities=[car];
  let i=0;
  for(;i<1000;i++){
    step(world,new Map(),.05);world.entities=[car];
    along=(car.x-road.a.x)*road.ux+(car.z-road.a.z)*road.uz;
    if(along>=road.length-30)break;
  }
  const side=(car.x-road.a.x)*road.rx+(car.z-road.a.z)*road.rz;
  assert.ok(i<1000&&Math.abs(side)<1.5,`car failed to finish its return: ${side}`);
  assert.equal(car.health,100);
});

test('a taken car and an ambient car on the narrow bridge keep the original follower',()=>{
  const {road,world,car}=setup(0,'model-3',170);
  car.driver='p';const occupied=trafficInput(car,world);
  assert.ok(Math.abs(occupied.steer)<.03,'the lane change is exclusive to unattended traffic');
  const route=ROUTES[HIGHWAY_ROUTE_IDS[0]];
  const index=route.findIndex((a,i)=>Math.abs(route[(i+1)%route.length].x-a.x)>250&&Math.abs(route[(i+1)%route.length].z-a.z)<20);
  assert.ok(index>=0,'bridge segment exists');
  const a=route[index],b=route[(index+1)%route.length];
  Object.assign(car,{driver:null,x:(a.x+b.x)/2,z:(a.z+b.z)/2,waypoint:(index+1)%route.length,
    yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))});
  assert.ok(Math.abs(trafficInput(car,world).steer)<.03,'the bridge keeps the original lane');
});

test('the 20 m El Camino alternative keeps its original lane',()=>{
  const routeId=HIGHWAY_ROUTE_IDS[4],route=ROUTES[routeId];
  const index=route.findIndex((a,i)=>{
    const b=route[(i+1)%route.length];
    return a.z>3400&&b.z<3900&&Math.hypot(b.x-a.x,b.z-a.z)>60&&Math.hypot(b.x-a.x,b.z-a.z)<200;
  });
  assert.ok(index>=0);
  const a=route[index],b=route[(index+1)%route.length],world=createWorld();
  const car=makeEntity('ambient-el-camino','model-3',(a.x+b.x)/2,(a.z+b.z)/2);
  Object.assign(car,{npc:true,autopilot:true,routeId,waypoint:(index+1)%route.length,
    yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),speed:15});
  world.entities=[car];world.players=[];
  assert.ok(Math.abs(trafficInput(car,world).steer)<.03);
});
