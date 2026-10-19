import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createEmptyWorld,createWorld,makeEntity,NEUTRAL,setDestination,step} from '../shared/game';
import {LEVELS} from '../shared/delivery';
import {HIGHWAYS,terrainHeight} from '../shared/map';
import {HIGHWAY_ROUTE_IDS,ROUTES,trafficInput} from '../shared/traffic';
import type {DriveMode} from '../shared/drive-mode';

function highwayEdge(point:{x:number;z:number}){
  let edge=Infinity;
  for(const highway of HIGHWAYS)for(let i=1;i<highway.points.length;i++){
    const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
    edge=Math.min(edge,Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)-(highway.width??32)/2);
  }
  return edge;
}
function driver(){
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  player.delivery.level=6;player.delivery.cash=LEVELS[6].cash+2500;
  world.entities=[car];world.pickups=[];
  return {world,car};
}

test('each self-drive tier cruises faster and brakes for real Bay bends and stops',()=>{
  const route=ROUTES[HIGHWAY_ROUTE_IDS[0]],modes:DriveMode[]=['road','intercity','jump','sky'];
  for(const kind of ['model-3','robovan'] as const)for(const [start,end] of [[2,19],[43,80]] as const){
    const peaks:number[]=[];
    for(const mode of modes){
      const {world,car}=driver(),a=route[start],b=route[start+1],destination=route[end];
      Object.assign(car,{kind,x:a.x,z:a.z,y:terrainHeight(a.x,a.z)??0,
        yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),speed:0,autopilot:true,
        navigation:{destination,path:route.slice(start+1,end+1),index:0,status:'driving',mode}});
      let peak=0,maxEdge=-Infinity;
      for(let i=0;i<18000&&car.autopilot;i++){
        world.entities=[car];step(world,new Map(),.05);
        peak=Math.max(peak,car.speed);maxEdge=Math.max(maxEdge,highwayEdge(car));
      }
      assert.equal(car.navigation?.status,'arrived',`${kind} ${mode} reaches route end`);
      assert.ok(maxEdge< -2,`${kind} ${mode} stays on the highway (edge ${maxEdge.toFixed(2)} m)`);
      assert.equal(car.health,100,`${kind} ${mode} avoids damage`);
      peaks.push(peak);
    }
    assert.ok(peaks[0]>13,`${kind} Street Pilot exceeds the previous 12 m/s cap`);
    for(let i=1;i<peaks.length;i++)assert.ok(peaks[i]>peaks[i-1]+.5,`${kind} tier speeds increase: ${peaks}`);
  }
});

test('fast self-driving slows for stopped traffic and resumes once it clears',()=>{
  const {world,car}=driver(),route=ROUTES[HIGHWAY_ROUTE_IDS[0]],a=route[27],b=route[28];
  const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const at=(d:number)=>({x:a.x+dx*d,z:a.z+dz*d});
  const start=at(50),destination=at(900),obstacle=at(300),yaw=Math.atan2(-dx,-dz);
  const leader=makeEntity('stopped','robovan',obstacle.x,obstacle.z);leader.yaw=yaw;
  Object.assign(car,{kind:'model-3',...start,y:terrainHeight(start.x,start.z)??0,yaw,speed:0,autopilot:true,
    navigation:{destination,path:[destination],index:0,status:'driving',mode:'sky'}});
  let peak=0,minGap=Infinity,stopped=false,removedAt=-1;
  for(let i=0;i<6000&&car.autopilot;i++){
    world.entities=removedAt<0?[car,leader]:[car];step(world,new Map(),.05);
    peak=Math.max(peak,car.speed);
    if(removedAt<0){
      minGap=Math.min(minGap,Math.hypot(car.x-leader.x,car.z-leader.z));
      if(peak>20&&car.speed<.2){stopped=true;removedAt=i;}
    }
  }
  assert.ok(peak>24,'the car first reaches a fast cruising speed');
  assert.ok(stopped,'the car waits for the stopped vehicle');
  assert.ok(minGap>6,`the cars do not overlap (${minGap.toFixed(2)} m)`);
  assert.equal(car.health,100);assert.equal(car.navigation?.status,'arrived');
});

for(const rearBlocked of [false,true])test(`Hyperloop waits through a long queue with ${rearBlocked?'blocked':'clear'} rear space`,()=>{
  const {world,car}=driver(),route=ROUTES[HIGHWAY_ROUTE_IDS[0]],a=route[27],b=route[28];
  const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const at=(d:number)=>({x:a.x+dx*d,z:a.z+dz*d});
  const start=at(50),destination=at(900),obstacle=at(300),yaw=Math.atan2(-dx,-dz);
  const leaderPlayer=rearBlocked?addPlayer(world,'leader','Leader'):null;
  const leader=leaderPlayer?world.entities.find(entity=>entity.id===leaderPlayer.entityId)!:
    makeEntity('stopped-traffic','model-3',obstacle.x,obstacle.z);
  Object.assign(leader,{...obstacle,y:terrainHeight(obstacle.x,obstacle.z)??0,yaw,speed:0});
  if(!leaderPlayer)Object.assign(leader,{npc:true,autopilot:true,routeId:HIGHWAY_ROUTE_IDS[0],waypoint:28,pauseUntil:1000});
  Object.assign(car,{kind:'model-3',...start,y:terrainHeight(start.x,start.z)??0,yaw,speed:0,autopilot:true,
    navigation:{destination,path:[destination],index:0,status:'driving',mode:'intercity'}});
  let peak=0,stoppedAt=-1,clearedAt=-1,minGap=Infinity;
  let rear:typeof car|undefined;
  for(let i=0;i<6000&&car.autopilot;i++){
    world.entities=[car,...(clearedAt<0?[leader]:[]),...(rear?[rear]:[])];
    step(world,new Map(),.05);
    peak=Math.max(peak,car.speed);
    if(clearedAt<0){
      minGap=Math.min(minGap,Math.hypot(car.x-leader.x,car.z-leader.z));
      if(stoppedAt<0&&peak>10&&Math.abs(car.speed)<.2){
        stoppedAt=world.time;
        if(rearBlocked){
          rear=makeEntity('rear','model-3',car.x-dx*7,car.z-dz*7);
          rear.yaw=yaw;
        }
      }
      if(stoppedAt>=0){
        assert.ok(car.speed>-.1,'waiting never reverses into open or occupied rear space');
        assert.equal(car.navigation?.status,'driving','traffic does not fail the trip');
        if(world.time-stoppedAt>=60)clearedAt=world.time;
      }
    }
  }
  assert.ok(stoppedAt>=0&&clearedAt-stoppedAt>=60,'the stopped leader held the lane for 60 simulated seconds');
  assert.ok(minGap>5,`the cars maintain clearance (${minGap.toFixed(2)} m)`);
  assert.equal(car.health,100);
  if(rear)assert.equal(rear.health,100,'the car behind is not hit');
  assert.equal(car.navigation?.status,'arrived','the trip finishes after traffic clears');
});

for(const rearBlocked of [false,true])test(`Hyperloop resumes when a queue clears just before timeout with ${rearBlocked?'blocked':'clear'} rear space`,()=>{
  const {world,car}=driver(),route=ROUTES[HIGHWAY_ROUTE_IDS[0]],a=route[27],b=route[28];
  const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const at=(d:number)=>({x:a.x+dx*d,z:a.z+dz*d});
  const start=at(50),destination=at(900),yaw=Math.atan2(-dx,-dz);
  const leader=makeEntity('leader','model-3',at(58).x,at(58).z);
  Object.assign(leader,{yaw,npc:true,autopilot:true,routeId:HIGHWAY_ROUTE_IDS[0],waypoint:28,pauseUntil:1000});
  const rear=rearBlocked?makeEntity('rear','model-3',at(43).x,at(43).z):null;
  if(rear)rear.yaw=yaw;
  Object.assign(car,{kind:'model-3',...start,y:terrainHeight(start.x,start.z)??0,yaw,speed:0,autopilot:true,
    navigation:{destination,path:[destination],index:0,status:'driving',mode:'intercity'}});
  let clearedAt=-1;
  for(let i=0;i<6000&&car.autopilot;i++){
    world.entities=[car,...(clearedAt<0?[leader]:[]),...(rear?[rear]:[])];
    step(world,new Map(),.05);
    if(clearedAt<0&&world.time>=11.9){
      assert.ok(Math.abs(car.speed)<.2,'the car is waiting when the queue clears');
      clearedAt=world.time;
    }
    if(clearedAt>=0&&world.time-clearedAt<3){
      assert.ok(car.speed>-.1,'the freshly cleared queue does not trigger reverse');
      assert.equal(car.navigation?.recovery?.attempts,0,'the cleared queue does not consume a recovery attempt');
      assert.ok((car.navigation?.recovery?.reverseUntil??0)<=world.time,'recovery does not start immediately after clearance');
    }
  }
  assert.ok(clearedAt>=11.9);
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(car.health,100);
  if(rear)assert.equal(rear.health,100);
});

for(const separation of [7.5,8.72])test(`newly queued traffic at ${separation} m cancels an active reverse recovery`,()=>{
  const {world,car}=driver(),route=ROUTES[HIGHWAY_ROUTE_IDS[0]],a=route[27],b=route[28];
  const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const at=(d:number)=>({x:a.x+dx*d,z:a.z+dz*d});
  const start=at(50),destination=at(900),yaw=Math.atan2(-dx,-dz);
  const leader=makeEntity('leader','model-3',at(50+separation).x,at(50+separation).z,'leader');leader.yaw=yaw;
  Object.assign(car,{kind:'model-3',...start,y:terrainHeight(start.x,start.z)??0,yaw,speed:-1,autopilot:true,
    navigation:{destination,path:[destination],index:0,status:'driving',mode:'intercity',
      recovery:{index:0,distance:850,at:18,attempts:1,reverseUntil:22}}});
  world.time=20;world.entities=[car,leader];
  const input=trafficInput(car,world);
  assert.equal(input.brake,true,'brake the reverse when traffic enters');
  assert.equal(input.throttle,0);
  assert.equal(car.navigation?.recovery?.reverseUntil,0);
  assert.equal(car.navigation?.recovery?.attempts,0);
  assert.equal(car.navigation?.recovery?.at,world.time);
  step(world,new Map(),.05);
  assert.ok(car.speed> -1,'vehicle physics slows the reverse immediately');
  let stoppedReversing=false;
  for(let i=0;i<400&&car.autopilot;i++){
    world.entities=[car,leader];step(world,new Map(),.05);
    if(car.speed>-.1)stoppedReversing=true;
    if(stoppedReversing)assert.ok(car.speed>-.1,'the follower does not restart the reverse in the queue');
  }
  assert.ok(stoppedReversing,'the reverse stops');
  assert.equal(car.navigation?.status,'driving');
  assert.equal(car.health,100);
});

for(const activeReverse of [false,true])test(`recovery ${activeReverse?'stops reversing':'waits'} for a fast car approaching from behind`,()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver'),follower=addPlayer(world,'following','Following');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const rear=world.entities.find(entity=>entity.id===follower.entityId)!;
  Object.assign(car,{kind:'model-3',x:-180,z:-177,y:0,yaw:-Math.PI/2,speed:activeReverse?-1:0,supportId:'ground'});
  Object.assign(rear,{kind:'model-3',x:-220,z:-177,y:0,yaw:-Math.PI/2,speed:20,vx:20,vz:0,supportId:'ground'});
  const parked=makeEntity('parked','model-3',-172.5,-177);parked.yaw=-Math.PI/2;
  world.entities=[car,rear,parked];world.pickups=[];world.time=13;
  assert.equal(setDestination(world,'driver',{x:-60,z:-177},'road'),true);
  assert.ok(car.navigation);
  car.navigation.recovery={index:car.navigation.index,distance:120,at:0,attempts:activeReverse?1:0,reverseUntil:activeReverse?17:0};
  const first=trafficInput(car,world);
  assert.equal(first.brake,true,'rear traffic fences recovery');
  assert.equal(first.throttle,0);
  let braked=false;
  for(let tick=0;tick<80;tick++){
    // The already-reversing car needs a little more braking room than the
    // stationary control; this does not promise safety after it is too late.
    if(car.x-rear.x<(activeReverse?14:12))braked=true;
    step(world,new Map([['following',{...NEUTRAL,throttle:braked?0:.22,brake:braked}]]),.05);
  }
  assert.equal(car.health,100);assert.equal(rear.health,100);
  world.entities=[car,parked];
  let resumed=false;
  for(let i=0;i<20&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(car.speed<-.1){resumed=true;break;}
  }
  assert.ok(resumed,'recovery resumes in simulation after the rear car leaves');
});

for(const sample of [
  {name:'in a separate lane',z:-185,speed:20},
  {name:'moving away',z:-177,speed:-20},
])test(`a rear car ${sample.name} does not suppress reverse recovery`,()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind:'model-3',x:-180,z:-177,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  const parked=makeEntity('parked','model-3',-172.5,-177);parked.yaw=-Math.PI/2;
  const rear=makeEntity('rear','model-3',-220,sample.z);Object.assign(rear,{yaw:-Math.PI/2,speed:sample.speed,vx:sample.speed});
  world.entities=[car,rear,parked];world.pickups=[];world.time=13;
  assert.equal(setDestination(world,'driver',{x:-60,z:-177},'road'),true);
  assert.ok(car.navigation);
  car.navigation.recovery={index:car.navigation.index,distance:120,at:0,attempts:0,reverseUntil:0};
  assert.ok(trafficInput(car,world).throttle<0,'the open lane still allows recovery');
});

test('a parked car behind an obstructed driver still reaches bounded recovery failure',()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind:'model-3',x:-180,z:-177,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  const front=makeEntity('front','model-3',-172.5,-177),rear=makeEntity('rear','model-3',-192,-177);
  front.yaw=rear.yaw=-Math.PI/2;
  world.entities=[car,front,rear];world.pickups=[];world.time=13;
  assert.equal(setDestination(world,'driver',{x:-60,z:-177},'road'),true);
  assert.ok(car.navigation);
  car.navigation.recovery={index:car.navigation.index,distance:120,at:0,attempts:0,reverseUntil:0};
  for(let i=0;i<2000&&car.autopilot;i++)step(world,new Map(),.05);
  assert.equal(car.navigation?.status,'failed','static obstructions do not reset attempts forever');
  assert.equal(car.health,100);assert.equal(rear.health,100);
});

test('rear traffic detection accounts for a reverse collision impulse',()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind:'model-3',x:-180,z:-177,y:0,yaw:-Math.PI/2,speed:0,pushX:-10,supportId:'ground'});
  const front=makeEntity('front','model-3',-172.5,-177),rear=makeEntity('rear','model-3',-215,-177);
  Object.assign(front,{yaw:-Math.PI/2});Object.assign(rear,{yaw:-Math.PI/2,speed:10});
  world.entities=[car,front,rear];world.pickups=[];world.time=13;
  assert.equal(setDestination(world,'driver',{x:-60,z:-177},'road'),true);
  assert.ok(car.navigation);
  car.navigation.recovery={index:car.navigation.index,distance:120,at:0,attempts:0,reverseUntil:0};
  assert.equal(trafficInput(car,world).brake,true,'the closing impulse triggers the guard');
});

test('Hyperloop follows a slower moving car and continues when it leaves',()=>{
  const {world,car}=driver(),leaderPlayer=addPlayer(world,'leader','Leader');
  leaderPlayer.delivery.level=6;leaderPlayer.delivery.cash=LEVELS[6].cash+2500;
  const leader=world.entities.find(entity=>entity.id===leaderPlayer.entityId)!;
  const route=ROUTES[HIGHWAY_ROUTE_IDS[0]],a=route[27],b=route[28];
  const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const at=(d:number)=>({x:a.x+dx*d,z:a.z+dz*d});
  const destination=at(900),yaw=Math.atan2(-dx,-dz);
  for(const [vehicle,start,mode] of [[car,at(50),'intercity'],[leader,at(170),'road']] as const){
    Object.assign(vehicle,{kind:'model-3',...start,y:terrainHeight(start.x,start.z)??0,yaw,speed:0,autopilot:true,
      navigation:{destination,path:[destination],index:0,status:'driving',mode}});
  }
  world.entities=[car,leader];world.pickups=[];
  let minGap=Infinity,followed=false,leaderLeft=false;
  for(let i=0;i<6000&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(!leaderLeft){
      const gap=Math.hypot(car.x-leader.x,car.z-leader.z);
      minGap=Math.min(minGap,gap);
      if(gap<65&&car.speed<17&&leader.speed>10)followed=true;
      if(!leader.autopilot){world.entities=[car];leaderLeft=true;}
    }
  }
  assert.ok(followed,'the faster car adjusts to moving traffic');
  assert.ok(minGap>6,`the cars maintain clearance (${minGap.toFixed(2)} m)`);
  assert.equal(car.health,100);assert.equal(leader.health,100);
  assert.equal(car.navigation?.status,'arrived','the faster car continues after the leader leaves');
});

test('passing the departure waypoint off-center keeps the local approach slow',()=>{
  const {world,car}=driver(),exit={x:0,z:0};
  Object.assign(car,{x:1,z:9,yaw:-Math.PI/2,speed:4,autopilot:true,
    // Simplification may retain a point less than 0.1 m from the exact exit.
    navigation:{destination:{x:0,z:100},path:[{x:-100,z:0},{x:.05,z:0},{x:0,z:100}],index:1,status:'driving',mode:'intercity',exit}});
  trafficInput(car,world);
  assert.equal(car.navigation?.index,2,'the exit waypoint was passed');
  assert.equal(car.navigation?.exitReached,true,'the low-speed approach remains active after passing it');
});

test('being near a later exit does not start the approach before the route reaches it',()=>{
  const {world,car}=driver(),exit={x:0,z:0};
  Object.assign(car,{x:0,z:5,yaw:Math.PI,speed:0,autopilot:true,
    navigation:{destination:{x:-60,z:0},path:[{x:0,z:100},{x:100,z:100},exit,{x:-60,z:0}],index:0,status:'driving',mode:'intercity',exit}});
  trafficInput(car,world);
  assert.notEqual(car.navigation?.exitReached,true,'proximity to a later route segment does not lock the car into approach speed');
});
