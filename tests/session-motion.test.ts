import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, NEUTRAL, PROTOCOL_VERSION, step, type Entity, type World } from '../shared/game';
import { body, contact } from '../shared/physics';
import { ScheduledInput } from '../shared/tick-input';
import { Session } from '../src/session';

class Socket {
  static OPEN=1;static last:Socket;readyState=Socket.OPEN;sent:string[]=[];
  onmessage?: (event:{data:string})=>void;onclose?: (event:{code:number})=>void;
  constructor(_url:string){Socket.last=this;}
  send(value:string){this.sent.push(value);}
  close(){this.readyState=3;}
  message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
Object.assign(globalThis,{WebSocket:Socket,window:globalThis,location:{protocol:'https:',host:'example.com'}});
function pair(world:World){
  const local=world.entities.find(entity=>entity.driver==='p')!,peer=world.entities.find(entity=>entity.driver==='q')!;
  return {local,peer};
}
function setup(lane=0){
  let now=-200;
  const session=new Session(()=>now);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64,roomEpoch:'room',tick:10,poseRevision:0});
  const world=createEmptyWorld(),p=addPlayer(world,'p','Player'),q=addPlayer(world,'q','Other');
  const local=world.entities.find(e=>e.id===p.entityId)!,peer=world.entities.find(e=>e.id===q.entityId)!;
  world.entities=[local,peer];world.pickups=[];
  Object.assign(local,{x:-310,z:-2050,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  Object.assign(peer,{x:-300,z:-2050+lane,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  const control=new ScheduledInput({...NEUTRAL,throttle:1}).snapshot();
  const state=(tick:number,poseRevision=0)=>socket.message({type:'state',world,roomEpoch:'room',tick,control,poseRevision,substeps:1});
  state(10);now=0;local.x=-300;peer.x=-290;state(14);
  return {session,world,local,peer,state,setTime:(value:number)=>{now=value;}};
}
for(const lane of [0,3.5])test(`Session keeps a 50 m/s ${lane?'adjacent-lane':'convoy'} pair smooth and separate`,()=>{
  const {session,local,peer,state,setTime}=setup(lane),authority=[] as number[];
  let last: {local:Entity;peer:Entity}|null=null,start:number|undefined;
  for(let frame=0;frame<=24;frame++){
    const now=frame*1000/120;setTime(now);
    if(frame===12||frame===24){local.x+=5;peer.x+=5;state(frame===12?16:18);}
    session.tick(1/120,{...NEUTRAL,throttle:1});
    const shown=pair(session.renderWorld());start??=shown.local.x;
    assert.equal(contact(body(shown.local),body(shown.peer)),null,`frame ${frame}`);
    if(last){
      assert.ok(Math.abs(shown.local.x-last.local.x)<1,`local frame ${frame}`);
      assert.ok(Math.abs(shown.peer.x-last.peer.x)<1,`peer frame ${frame}`);
    }
    last=shown;authority.push(session.world.entities.find(e=>e.driver==='p')!.x);
  }
  assert.ok(last!.local.x-start!>8,'local prediction advances through snapshot updates');
  assert.equal(local.x,-290);assert.deepEqual(authority.slice(0,12),Array(12).fill(-300));
  session.disconnect();
});

test('speculative peer braking does not replace local prediction with a stale snapshot',()=>{
  const {session,local,peer,state,setTime}=setup();
  session.renderWorld();setTime(100);local.x=-295;peer.x=-288;peer.speed=0;peer.vx=0;state(16);
  const shown=session.renderWorld();
  assert.equal(session.localPresentationActive,true);
  assert.equal(session.world.entities.find(e=>e.driver==='p')!.x,-295,'authority remains unchanged');
  assert.ok(Number.isFinite(pair(shown).local.x));
  session.disconnect();
});

test('a forecast approaching peer leaves the authoritative state untouched',()=>{
  const {session,local,peer,state,setTime}=setup();setTime(100);
  Object.assign(local,{x:-300,speed:0,vx:0});
  Object.assign(peer,{x:-290,yaw:Math.PI/2,speed:50,vx:-50});state(16);
  const shown=pair(session.renderWorld());
  assert.equal(session.localPresentationActive,true);
  assert.ok(Number.isFinite(shown.local.vx));
  assert.equal(session.world.entities.find(e=>e.driver==='p')!.x,-300);
  session.disconnect();
});

test('a close 50 m/s convoy stays smooth through real physics and 10 Hz snapshots',()=>{
  let now=-200;const session=new Session(()=>now);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64,roomEpoch:'room',tick:10,poseRevision:0});
  const world=createEmptyWorld();addPlayer(world,'p','Player');addPlayer(world,'q','Other');
  const {local,peer}=pair(world);world.entities=[local,peer];world.pickups=[];
  Object.assign(local,{x:-310,z:-2050,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  Object.assign(peer,{x:-305,z:-2050,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  const control=new ScheduledInput({...NEUTRAL,throttle:1}).snapshot();control.heldUntilTick=100;
  const state=(tick:number)=>{const inputs=socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input');
    control.receivedSeq=inputs.at(-1)?.seq??0;
    socket.message({type:'state',world,roomEpoch:'room',tick,control,poseRevision:0,substeps:5});};
  const drive=new Map([['p',{...NEUTRAL,throttle:1}],['q',{...NEUTRAL,throttle:1}]]);
  state(10);now=0;for(let i=0;i<4;i++)step(world,drive,.05,{substeps:5});state(14);
  let last:number|undefined;
  for(let frame=0;frame<=120;frame++){
    now=frame*1000/120;
    if(frame&&frame%6===0)step(world,drive,.05,{substeps:5});
    if(frame&&frame%12===0)state(14+frame/6);
    session.tick(1/120,{...NEUTRAL,throttle:1});
    const shown=pair(session.renderWorld());
    assert.equal(session.localPresentationActive,true,`frame ${frame}`);
    assert.equal(session.takePresentationSnap(),false,`frame ${frame}`);
    assert.equal(contact(body(shown.local),body(shown.peer)),null,`frame ${frame}`);
    if(last!==undefined)assert.ok(Math.abs(shown.local.x-last)<1,`frame ${frame}`);
    last=shown.local.x;
  }
  session.disconnect();
});

test('independent fades do not draw two following peers through each other',()=>{
  let now=-200;const session=new Session(()=>now);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64,roomEpoch:'room',tick:10,poseRevision:0});
  const world=createEmptyWorld();for(const id of ['p','q','r'])addPlayer(world,id,id);
  const [local,first,second]=world.entities;world.entities=[local,first,second];world.pickups=[];
  for(const [i,entity] of world.entities.entries())Object.assign(entity,{x:[-310,-295,-290][i],z:-2050,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  const control=new ScheduledInput({...NEUTRAL,throttle:1}).snapshot();
  const state=(tick:number)=>socket.message({type:'state',world,roomEpoch:'room',tick,control,poseRevision:0,substeps:1});
  state(10);now=0;local.x=-300;first.x=-285;second.x=-280;state(14);
  for(let frame=0;frame<12;frame++){
    now=frame*1000/120;const shown=session.renderWorld(),a=shown.entities.find(e=>e.driver==='q')!,b=shown.entities.find(e=>e.driver==='r')!;
    assert.equal(contact(body(a),body(b)),null,`frame ${frame}`);
    assert.equal(session.localPresentationActive,true,`frame ${frame}`);
  }
  session.disconnect();
});

test('a ferry passenger uses the authoritative shared deck frame',()=>{
  const {session,local,state}=setup();local.supportId='ferry';state(16);
  assert.equal(session.renderWorld(),session.world);
  assert.equal(session.localPresentationActive,false);
  session.disconnect();
});

test('a predicted recovery is withheld and a confirmed relocation cuts the camera',()=>{
  const {session,local,state,setTime}=setup();
  setTime(50);Object.assign(local,{x:600,y:.01,z:-2250,vy:-5,supportId:null});state(15);
  assert.equal(session.renderWorld(),session.world);
  assert.equal(session.takeCameraSnap(),false);
  setTime(100);Object.assign(local,{x:-36,y:0,z:-1120,vy:0,supportId:'ground'});state(16,1);
  assert.equal(session.takeCameraSnap(),true);
  session.disconnect();
});

for(const mode of ['turn','brake','brake-then-turn','flight-turn'] as const)test(`delayed ${mode} keeps local driving continuous through nearby peers`,()=>{
  let now=-200;const session=new Session(()=>now);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64,roomEpoch:'room',tick:10,poseRevision:0});
  const world=createEmptyWorld();for(const id of ['p','q','r'])addPlayer(world,id,id);
  const local=world.entities.find(e=>e.driver==='p')!,peer=world.entities.find(e=>e.driver==='q')!,far=world.entities.find(e=>e.driver==='r')!;
  const airborne=mode==='flight-turn';world.entities=[local,peer,far];world.pickups=[];
  for(const [index,entity] of world.entities.entries())Object.assign(entity,{x:[-310,-305,-410][index],z:-2050,y:airborne?150:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:airborne?null:'ground'});
  const input={...NEUTRAL,throttle:1,hover:airborne};
  const control=new ScheduledInput(input).snapshot();control.heldUntilTick=1000;
  const packet=(tick:number)=>{const inputs=socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input');
    control.receivedSeq=inputs.at(-1)?.seq??0;
    return {type:'state',world:structuredClone(world),roomEpoch:'room',tick,control:structuredClone(control),poseRevision:0,substeps:5};};
  socket.message(packet(10));now=0;
  for(let i=0;i<4;i++)step(world,new Map([['p',input],['q',input],['r',input]]),.05,{substeps:5});
  socket.message(packet(14));const queue:{when:number;packet:unknown}[]=[];
  let last:Entity|undefined,stationary=0,maxStationary=0,startFar:number|undefined,finalFar:number|undefined;
  for(let frame=0;frame<=360;frame++){
    now=frame*1000/120;
    if(frame&&frame%6===0){
      let remote=input;
      if(now>=400){
        if(mode==='turn'||mode==='flight-turn')remote={...input,steer:1};
        else if(mode==='brake')remote={...input,throttle:0,brake:true};
        else remote={...input,brake:now<700,throttle:now<700?0:1,steer:now<700?0:-1};
      }
      step(world,new Map([['p',input],['q',remote],['r',input]]),.05,{substeps:5});
    }
    if(frame&&frame%12===0)queue.push({when:now+75,packet:packet(14+frame/6)});
    while(queue.length&&queue[0].when<=now+1e-6)socket.message(queue.shift()!.packet);
    session.tick(1/120,input);const shown=session.renderWorld(),a=shown.entities.find(e=>e.driver==='p')!,r=shown.entities.find(e=>e.driver==='r')!;
    assert.equal(session.localPresentationActive,true,`frame ${frame}`);
    assert.equal(session.takePresentationSnap(),false,`frame ${frame}`);
    if(last){
      const delta=Math.hypot(a.x-last.x,a.y-last.y,a.z-last.z);
      assert.ok(delta<1,`frame ${frame} moved ${delta} m`);
      stationary=delta<1e-5?stationary+1:0;maxStationary=Math.max(maxStationary,stationary);
    }
    startFar??=r.x;finalFar=r.x;last=a;
  }
  assert.ok(maxStationary<5,`local held for ${maxStationary} frames`);
  assert.ok(finalFar!-startFar!>80,'unrelated traffic keeps moving');
  assert.ok(Math.hypot(local.x-last!.x,local.y-last!.y,local.z-last!.z)<12,'prediction converges near authority');
  session.disconnect();
});

test('peer forecasts do not expose speculative resource changes',()=>{
  const {session,local,peer,state,setTime}=setup();
  for(const entity of [local,peer])Object.assign(entity,{y:150,supportId:null,air:100,thrusters:7});
  setTime(100);state(16);setTime(200);state(18);setTime(225);
  const shown=pair(session.renderWorld());
  assert.equal(shown.peer.air,peer.air,'peer air remains authoritative');
  assert.equal(shown.peer.health,peer.health);
  session.disconnect();
});

test('head-on contact reconciles against authoritative shared physics',()=>{
  let now=-200;const session=new Session(()=>now);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64,roomEpoch:'room',tick:10,poseRevision:0});
  const world=createEmptyWorld();addPlayer(world,'p','Player');addPlayer(world,'q','Other');
  const {local,peer}=pair(world);world.entities=[local,peer];world.pickups=[];
  Object.assign(local,{x:-310,z:-2050,y:0,yaw:-Math.PI/2,speed:35,vx:35,vz:0,supportId:'ground'});
  Object.assign(peer,{x:-285,z:-2050,y:0,yaw:Math.PI/2,speed:35,vx:-35,vz:0,supportId:'ground'});
  const input={...NEUTRAL,throttle:1},control=new ScheduledInput(input).snapshot();control.heldUntilTick=1000;
  const packet=(tick:number)=>({type:'state',world:structuredClone(world),roomEpoch:'room',tick,control:structuredClone(control),poseRevision:0,substeps:5});
  socket.message(packet(10));now=0;for(let i=0;i<4;i++)step(world,new Map([['p',input],['q',input]]),.05,{substeps:5});socket.message(packet(14));
  const queue:{when:number;packet:unknown}[]=[];let previous:Entity|undefined,maxStep=0,snaps=0;
  for(let frame=0;frame<=180;frame++){
    now=frame*1000/120;if(frame&&frame%6===0)step(world,new Map([['p',input],['q',input]]),.05,{substeps:5});
    if(frame&&frame%12===0)queue.push({when:now+75,packet:packet(14+frame/6)});
    while(queue.length&&queue[0].when<=now+1e-6)socket.message(queue.shift()!.packet);
    session.tick(1/120,input);const shown=pair(session.renderWorld()).local;
    if(previous)maxStep=Math.max(maxStep,Math.hypot(shown.x-previous.x,shown.y-previous.y,shown.z-previous.z));
    snaps+=Number(session.takePresentationSnap());previous=shown;
  }
  assert.ok(local.health<100,'server simulation registered impact damage');
  assert.ok(maxStep<1,`maximum visual step ${maxStep} m`);
  assert.equal(snaps,0,'contact does not repeatedly snap');
  assert.ok(Math.hypot(previous!.x-local.x,previous!.z-local.z)<12,'display returns near confirmed authority');
  session.disconnect();
});
