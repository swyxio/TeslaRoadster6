import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, type Entity, type World } from '../shared/game';
import { isSurface, nearbyBuildings, terrainHeight } from '../shared/map';
import { body, contact, dimensions } from '../shared/physics';
import { buildingBlocksPose } from '../shared/landmark-collision';
import { HIGHWAY_SPEED_TRIGGER_KPH, newPolice, onHighway, policeFlight, policeInput, updatePolice } from '../shared/police';
import { HIGHWAY_ROUTE_IDS, ROUTES, trafficInput } from '../shared/traffic';

const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const route=ROUTES[HIGHWAY_ROUTE_IDS[0]];
const straight=route.findIndex((a,i)=>i<route.length-1&&a.z>2500&&a.z<3500&&distance(a,route[i+1])>1000);
assert.ok(straight>=0,'fixture requires the long Peninsula highway');
const start=route[straight],end=route[straight+1],length=distance(start,end);
const fx=(end.x-start.x)/length,fz=(end.z-start.z)/length,yaw=Math.atan2(-fx,-fz);
const along=(at:number,side=0)=>({x:start.x+fx*at-fz*side,z:start.z+fz*at+fx*side});

function fixture(){
  const world=createWorld(),player=addPlayer(world,'driver','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];player.delivery.cash=2_000_000;player.delivery.level=6;
  Object.assign(car,along(250),{y:0,yaw,speed:36,supportId:'ground'});
  return {world,player,car};
}
function patrol(world:World,at:number,side=0,reverse=false){
  const pose=along(at,side),cop=makeEntity(`cop-${world.entities.length}`,'model-3',pose.x,pose.z);
  Object.assign(cop,{yaw:yaw+(reverse?Math.PI:0),speed:reverse?20:25,npc:true,autopilot:true,police:newPolice(true)});
  world.entities.push(cop);return cop;
}
function checkSupportedClear(cop:Entity,world:World){
  assert.equal(cop.supportId,'ground');assert.notEqual(terrainHeight(cop.x,cop.z),null);assert.ok(onHighway(cop.x,cop.z));
  const size=dimensions(cop.kind),fx=-Math.sin(cop.yaw),fz=-Math.cos(cop.yaw),rx=Math.cos(cop.yaw),rz=-Math.sin(cop.yaw);
  for(const ahead of [-size.length/2,size.length/2])for(const side of [-size.width/2,size.width/2])
    assert.ok(isSurface(cop.x+fx*ahead+rx*side,cop.z+fz*ahead+rz*side));
  assert.ok(!nearbyBuildings(cop.x,cop.z,size.length+4).some(building=>buildingBlocksPose(building,cop)));
  assert.ok(!world.entities.some(other=>other!==cop&&contact(body(cop),body(other))));
  const lane=ROUTES[cop.routeId],next=lane[cop.waypoint],prev=lane[(cop.waypoint+lane.length-1)%lane.length];
  assert.ok(HIGHWAY_ROUTE_IDS.includes(cop.routeId));
  const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz);
  const t=((cop.x-prev.x)*dx+(cop.z-prev.z)*dz)/(len*len);
  assert.ok(t>=-1e-6&&t<=1+1e-6&&Math.abs((cop.x-prev.x)*dz-(cop.z-prev.z)*dx)/len<1e-5,'spawn lies on its connected route');
}

test('fresh rooms seed exactly four police, with two on supported Bay highway routes',()=>{
  for(const seed of [0,1,8,25]){
    const world=createWorld(seed),cops=world.entities.filter(e=>e.police);
    assert.equal(cops.length,4);const highway=cops.filter(e=>e.police?.highwayPatrol);assert.equal(highway.length,2);
    const aerial=highway.filter(e=>e.police?.airPatrol);assert.equal(aerial.length,1);assert.equal(aerial[0].upgrades.rocket,true);
    for(const cop of highway)checkSupportedClear(cop,world);
  }
});

test('highway speeding requires an officer nearby, a grounded road car, and no race or grace',()=>{
  const {world,player,car}=fixture(),cop=patrol(world,190);
  car.speed=HIGHWAY_SPEED_TRIGGER_KPH/3.6;updatePolice(world,.05);assert.equal(cop.police!.targetId,null);
  car.speed=(HIGHWAY_SPEED_TRIGGER_KPH+1)/3.6;
  Object.assign(cop,along(0));updatePolice(world,.05);assert.equal(cop.police!.targetId,null,'a distant officer cannot see the offense');
  Object.assign(car,{x:-180,z:-100});Object.assign(cop,{x:-180,z:-110});
  assert.equal(onHighway(car.x,car.z),false);updatePolice(world,.05);assert.equal(cop.police!.targetId,null,'city speeding does not use the highway rule');
  Object.assign(car,along(250));
  Object.assign(cop,along(190));car.supportId='roof:0';updatePolice(world,.05);assert.equal(cop.police!.targetId,null,'a roof is not the highway');
  car.supportId='ground';car.inDome=true;updatePolice(world,.05);assert.equal(cop.police!.targetId,null);
  car.inDome=false;player.delivery.ticketGraceUntil=20;updatePolice(world,.05);assert.equal(cop.police!.targetId,null);
  player.delivery.ticketGraceUntil=0;
  world.races.rounds.push({courseId:'short',phase:'active',hostId:player.id,openedAt:0,startedAt:0,endsAt:100,starterCount:1,entrants:[{playerId:player.id,entityId:car.id,status:'entered',nextGate:0,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:car.x,y:car.y,z:car.z,time:0}}]});
  updatePolice(world,.05);assert.equal(cop.police!.targetId,null,'active racers retain their protection');
  world.races.rounds=[];updatePolice(world,.05);assert.equal(cop.police!.targetId,player.id);assert.equal(player.delivery.tickets,0,'seeing a violation does not issue a ticket');
});

test('hidden relocation preserves visible and pursuing officers',()=>{
  const {world,player}=fixture(),visible=patrol(world,450),active=patrol(world,2500);
  active.police!.targetId=player.id;active.police!.lastSeen=15;active.police!.cause='speeding';
  const before=[{x:visible.x,z:visible.z},{x:active.x,z:active.z}];world.time=15;updatePolice(world,.05);
  assert.deepEqual([{x:visible.x,z:visible.z},{x:active.x,z:active.z}],before);
  assert.equal(active.police!.targetId,player.id);
});

test('separate distant drivers receive distinct hidden, supported patrols on connected roads',()=>{
  const {world,car}=fixture(),other=addPlayer(world,'other','Other'),second=world.entities.find(e=>e.id===other.entityId)!;
  const targetZ=8000,index=route.findIndex((a,i)=>i<route.length-1&&a.z<targetZ&&route[i+1].z>targetZ);
  assert.ok(index>=0);const a=route[index],b=route[index+1],t=(targetZ-a.z)/(b.z-a.z);
  Object.assign(second,{x:a.x+(b.x-a.x)*t,z:targetZ,y:0,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),speed:30,supportId:'ground'});
  world.entities=[car,second];const cops=[0,1].map(i=>{const c=makeEntity(`hidden-${i}`,'model-3',0,0);c.npc=true;c.autopilot=true;c.police=newPolice(true);world.entities.push(c);return c;});
  world.time=14.95;updatePolice(world,.05);assert.ok(cops.every(c=>c.x===0&&c.z===0));
  world.time=15;updatePolice(world,.05);assert.equal(cops.filter(c=>c.x!==0||c.z!==0).length,1);
  const first=cops.find(c=>c.x!==0||c.z!==0)!,firstPosition={x:first.x,z:first.z};
  world.time=30;updatePolice(world,.05);assert.deepEqual({x:first.x,z:first.z},firstPosition,'do not steal the only nearby patrol');
  assert.ok(cops.every(c=>c.x!==0||c.z!==0));
  for(const cop of cops){checkSupportedClear(cop,world);assert.ok(!world.entities.some(other=>other!==cop&&distance(cop,other)<14));assert.ok([car,second].every(viewer=>distance(cop,viewer)>1600));}
  for(const viewer of [car,second])assert.equal(cops.filter(cop=>distance(cop,viewer)<2100).length,1);
});

function movingPursuit(scenario:'follow'|'opposite'|'escape'){
  const {world,player,car}=fixture(),cop=patrol(world,scenario==='opposite'?320:190,scenario==='opposite'?8:0,scenario==='opposite');
  const startCar={x:car.x,z:car.z},startCop={x:cop.x,z:cop.z};
  let saw=false,offRoad=0,carTravel=0,copTravel=0;
  for(let i=0;i<900;i++){
    const throttle=scenario==='escape'?1:car.speed<36?.1:0;
    const previousCar={x:car.x,z:car.z},previousCop={x:cop.x,z:cop.z};
    step(world,new Map([[player.id,{...NEUTRAL,throttle}]]),.05);
    carTravel+=distance(car,previousCar);copTravel+=distance(cop,previousCop);
    if(cop.police!.targetId===player.id)saw=true;
    if(!onHighway(cop.x,cop.z))offRoad++;
    if(player.delivery.tickets||(saw&&!cop.police!.targetId))break;
  }
  return {world,player,car,cop,saw,offRoad,startCar,startCop,carTravel,copTravel};
}

for(const scenario of ['follow','opposite'] as const)test(`a moving highway patrol catches a moving speeding driver: ${scenario}`,()=>{
  const {world,player,car,saw,offRoad,carTravel,copTravel}=movingPursuit(scenario);
  assert.ok(saw);assert.equal(player.delivery.tickets,1);assert.equal(player.delivery.lastTicket?.cause,'speeding');
  assert.ok((player.delivery.lastTicket?.speedKph??0)>125);assert.ok(world.time>2);
  assert.ok(carTravel>100&&copTravel>100,'both vehicles actually move before the stop');
  assert.equal(offRoad,0,'the pursuit stays on the authoritative highway in this scenario');
  assert.ok(Math.abs(car.speed)<6,'the stop requires slowing before the citation');assert.ok(player.delivery.ticketGraceUntil>world.time);
});

test('a chasing patrol brakes for traffic in its path without stopping for a clear adjacent lane',()=>{
  const {world,player,car}=fixture(),cop=patrol(world,190),pose=along(230);
  const obstacle=makeEntity('obstacle','model-3',pose.x,pose.z);
  Object.assign(obstacle,{yaw,speed:0});world.entities.push(obstacle);
  cop.police!.targetId=player.id;cop.police!.cause='speeding';cop.police!.path=[{x:car.x,z:car.z}];
  assert.equal(policeInput(cop,world).brake,true,'a stopped car is inside the stopping distance');
  Object.assign(obstacle,along(230,5));
  assert.equal(policeInput(cop,world).brake,false,'a parallel car in the next lane is clear');
  Object.assign(obstacle,along(230,3.5),{yaw:yaw+Math.PI/4});
  assert.equal(policeInput(cop,world).brake,true,'a turning car projects into the patrol lane');
  Object.assign(obstacle,along(230),{yaw,y:10});
  assert.equal(policeInput(cop,world).brake,false,'traffic on a separate level is ignored');
  Object.assign(cop,{yaw:yaw+Math.PI,speed:0});
  Object.assign(obstacle,along(197.5),{yaw,y:0});
  assert.equal(policeInput(cop,world).brake,true,'a blocked reverse is held in place');
});

for(const {speed,obstacleAt,targetAt} of [{speed:25,obstacleAt:220,targetAt:250},{speed:42,obstacleAt:330,targetAt:440}])test(`a ${speed} m/s patrol waits behind stopped traffic and resumes when clear`,()=>{
  const {world,player,car}=fixture(),cop=patrol(world,190),pose=along(obstacleAt);
  cop.speed=speed;Object.assign(car,along(targetAt));
  const obstacle=makeEntity('obstacle','model-3',pose.x,pose.z);
  Object.assign(obstacle,{yaw,speed:0});world.entities.push(obstacle);
  cop.police!.targetId=player.id;cop.police!.cause='speeding';cop.police!.lastSeen=0;
  for(let i=0;i<400;i++){
    step(world,new Map([[player.id,NEUTRAL]]),.05);
    assert.equal(contact(body(cop),body(obstacle)),null,'the patrol does not overlap the stopped car');
    assert.equal(cop.health,100);assert.equal(obstacle.health,100);
  }
  assert.ok(cop.speed<1,'the patrol stops behind the obstacle');
  assert.ok(distance(obstacle,pose)<.001&&Math.hypot(obstacle.pushX,obstacle.pushZ)<.001,'the stopped car is not pushed');
  world.entities=world.entities.filter(entity=>entity!==obstacle);
  for(let i=0;i<40;i++)step(world,new Map([[player.id,NEUTRAL]]),.05);
  assert.ok(cop.speed>4,'the patrol resumes pursuit after the lane clears');
  assert.equal(cop.police!.targetId,player.id);
  assert.equal(car.health,100);
});

test('a faster driver can escape a moving highway patrol without an automatic fine',()=>{
  const {world,player,car,cop,saw,offRoad,startCar}=movingPursuit('escape');
  assert.ok(saw);assert.equal(cop.police!.targetId,null);assert.equal(player.delivery.tickets,0);
  assert.ok(world.time>20&&distance(car,startCar)>500&&distance(car,cop)>300);
  assert.equal(offRoad,0);
});

test('a redistributed patrol drives its actual route to a moving driver and catches them',()=>{
  const {world,player,car}=fixture(),cop=makeEntity('hidden-patrol','model-3',0,0);
  cop.npc=true;cop.autopilot=true;cop.police=newPolice(true);world.entities.push(cop);
  world.time=15;updatePolice(world,.05);
  const original={x:cop.x,z:cop.z};checkSupportedClear(cop,world);
  assert.ok(distance(cop,car)>1600&&distance(cop,car)<2100);
  let saw=false,offRoad=0;
  for(let i=0;i<1200&&!player.delivery.tickets;i++){
    step(world,new Map([[player.id,{...NEUTRAL,throttle:car.speed<36?.1:0}]]),.05);
    saw ||= cop.police!.targetId===player.id;
    if(!onHighway(cop.x,cop.z))offRoad++;
  }
  assert.ok(saw);assert.equal(player.delivery.tickets,1);assert.ok(distance(cop,original)>500);
  assert.equal(offRoad,0);assert.ok(world.time<75,'the relocated patrol actually reaches the driver');
});

test('a moving pursuit follows highway bends without drifting off the shared road',()=>{
  const corners=[];
  for(let i=1;i<route.length-1;i++){
    const a=route[i-1],b=route[i],c=route[i+1],ux=b.x-a.x,uz=b.z-a.z,vx=c.x-b.x,vz=c.z-b.z;
    const before=Math.hypot(ux,uz),after=Math.hypot(vx,vz),cosine=(ux*vx+uz*vz)/(before*after);
    if(b.z>1200&&b.z<8200&&before>100&&after>100&&cosine<.98)corners.push(i);
  }
  assert.ok(corners.length>=3,'exercise bends in both sides of the Bay loop');
  for(const i of corners){
    const {world,player,car}=fixture(),a=route[i-1],b=route[i],len=distance(a,b),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
    const heading=Math.atan2(-dx,-dz),position=(at:number)=>({x:b.x+dx*at,z:b.z+dz*at});
    Object.assign(car,position(-15),{y:0,yaw:heading,speed:36,supportId:'ground',routeId:HIGHWAY_ROUTE_IDS[0],waypoint:i});
    const p=position(-70),cop=makeEntity('cop','model-3',p.x,p.z);cop.police=newPolice(true);
    Object.assign(cop,{npc:true,autopilot:true,yaw:heading,speed:25,routeId:HIGHWAY_ROUTE_IDS[0],waypoint:i});world.entities.push(cop);
    let saw=false,offRoad=0;
    for(let n=0;n<900;n++){
      const steer=trafficInput(car,world).steer,throttle=car.speed<36?.1:0;
      step(world,new Map([[player.id,{...NEUTRAL,steer,throttle}]]),.05);
      saw ||= cop.police!.targetId===player.id;if(!onHighway(cop.x,cop.z))offRoad++;
      if(player.delivery.tickets||(saw&&!cop.police!.targetId))break;
    }
    assert.ok(saw,`bend ${i}: violation observed`);assert.equal(player.delivery.tickets,1,`bend ${i}: moving stop`);
    assert.equal(offRoad,0,`bend ${i}: stays on highway`);
  }
});

test('only a tagged rocket officer may launch and protected players cannot trigger flight',()=>{
  const {world,player,car}=fixture(),cop=patrol(world,220);
  car.y=6;car.supportId=null;cop.police!.targetId=player.id;cop.police!.cause='flight';cop.speed=10;
  cop.upgrades.rocket=true;
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'ordinary officers stay grounded');
  cop.police!.airPatrol=true;cop.upgrades.rocket=false;
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'a rocket kit is required');
  cop.upgrades.rocket=true;car.inDome=true;
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'arena protection applies before launch');
  car.inDome=false;const targetPosition={x:car.x,z:car.z};Object.assign(car,{x:0,z:-1500});
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'island protection applies before launch');
  Object.assign(car,targetPosition);
  world.races.rounds.push({courseId:'short',phase:'active',hostId:player.id,openedAt:0,startedAt:0,endsAt:100,starterCount:1,entrants:[{playerId:player.id,entityId:car.id,status:'entered',nextGate:0,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:car.x,y:car.y,z:car.z,time:0}}]});
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'racers remain protected');world.races.rounds=[];
  assert.equal(policeFlight(cop,world,{...NEUTRAL,brake:true}).jump,false,'braking for traffic cannot be overridden by a flight launch');
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,true);
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'launch has a bounded cooldown');
});

test('a rocket officer flies after a moving airborne driver, lands, and completes a physical stop',()=>{
  const {world,player,car}=fixture(),cop=patrol(world,220);
  Object.assign(car,{speed:12});Object.assign(cop,{speed:10,routeId:HIGHWAY_ROUTE_IDS[0],waypoint:straight+1,tankLevel:5});
  cop.police!.airPatrol=true;cop.upgrades.rocket=true;
  let saw=false,airborne=false,landed=false,maxHeight=0,airStart:{x:number;z:number}|undefined,airTravel=0;
  for(let i=0;i<400&&!player.delivery.tickets;i++){
    step(world,new Map([[player.id,{...NEUTRAL,throttle:world.time<3?.1:0,jump:1}]]),.05);
    saw ||= cop.police!.targetId===player.id;
    if(cop.supportId===null&&cop.y>1){
      airborne=true;maxHeight=Math.max(maxHeight,cop.y);airStart??={x:cop.x,z:cop.z};airTravel=Math.max(airTravel,distance(cop,airStart));
    }
    if(airborne&&cop.supportId==='ground')landed=true;
  }
  assert.ok(saw&&airborne&&landed);assert.ok(maxHeight>3&&airTravel>10,'officer moves visibly through the air');
  assert.equal(player.delivery.tickets,1);assert.equal(player.delivery.lastTicket?.cause,'flight');
  assert.equal(car.supportId,'ground');assert.ok(player.delivery.ticketGraceUntil>world.time);
});


test('rocket police sweep the spaceport channel walls before launching',()=>{
  const {world,player,car}=fixture(),cop=patrol(world,220);
  Object.assign(cop,{x:1964.25,z:6232,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  Object.assign(car,{x:1994.25,z:6232,y:6,supportId:null});
  cop.police!.airPatrol=true;cop.police!.targetId=player.id;cop.police!.cause='flight';cop.upgrades.rocket=true;
  const blocked=(x:number,z:number)=>nearbyBuildings(x,z,5).some(building=>buildingBlocksPose(building,
    {kind:'model-s',x,z,y:terrainHeight(x,z)??0,yaw:-Math.PI/2,pitch:0,roll:0,supportId:'ground'}));
  for(const x of [1964.25,1971.75,1979.25,1986.75,1994.25]){
    assert.equal(isSurface(x,6232),true,`sample ${x} is supported`);
    assert.equal(blocked(x,6232),false,`sample ${x} is clear`);
  }
  assert.equal(blocked(1968,6232),true,'the body crosses a wall between sampled poses');
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,false,'the wall prevents launch');
  Object.assign(cop,{x:1960,z:6218,yaw:Math.PI});
  Object.assign(car,{x:1960,z:6248});
  assert.equal(policeFlight(cop,world,NEUTRAL).jump,true,'a clear hop along the channel remains available');
});
