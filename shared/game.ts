import { STATIONS } from './stations';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from './vehicles';
import { body, contact, dimensions } from './physics';
import { engageAutopilot, routePose, trafficInput } from './traffic';

export const PROTOCOL_VERSION=2;
export type Input = { throttle:number;steer:number;boost:boolean;lift:boolean;roll:number;brake:boolean };
export type Entity = {id:string;kind:VehicleId|'person';x:number;y:number;z:number;yaw:number;roll:number;speed:number;health:number;air:number;driver:string|null;vy:number;pushX:number;pushZ:number;steering:number;owner:string|null;npc:boolean;autopilot:boolean;routeId:number;waypoint:number;pauseUntil:number};
export type Player = {id:string;name:string;entityId:string};
export type Pickup = {id:string;x:number;z:number;kind:'repair'|'air';active:boolean;readyAt?:number};
export type World = {entities:Entity[];players:Player[];pickups:Pickup[];time:number};
export const WORLD_LIMIT=240;
export const NEUTRAL:Input={throttle:0,steer:0,boost:false,lift:false,roll:0,brake:false};
export const BUILDINGS:{x:number;z:number;w:number;d:number;h:number}[]=[];
for(let x=-180;x<180;x+=60)for(let z=-180;z<180;z+=60)BUILDINGS.push({x:x+30,z:z+30,w:24,d:24,h:9+((x+z+360)/60%5)*7});
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const makeEntity=(id:string,kind:Entity['kind'],x:number,z:number,driver:string|null=null):Entity=>({id,kind,x,y:0,z,yaw:0,roll:0,speed:0,health:100,air:100,driver,vy:0,pushX:0,pushZ:0,steering:0,owner:null,npc:false,autopilot:false,routeId:0,waypoint:0,pauseUntil:0});
export function createWorld():World {
  const entities:Entity[]=[];
  VEHICLE_IDS.forEach((kind,i)=>{
    // One parked and one autonomous example of every catalog model.
    const parked=makeEntity(`parked-${i}`,kind,-180+(i%7)*60+10,-100+Math.floor(i/7)*66);
    entities.push(parked);
    const pose=routePose(i,VEHICLE_IDS.length);
    entities.push({...makeEntity(`traffic-${i}`,kind,pose.x,pose.z),...pose,npc:true,autopilot:true});
  });
  return {entities,players:[],time:0,pickups:Array.from({length:12},(_,i)=>({id:`pickup-${i}`,x:-150+(i%6)*60,z:i<6?-60:60,kind:i%2?'air':'repair',active:true}))};
}
function solid(e:Entity):boolean {
  const b=body(e),radius=Math.abs(Math.cos(e.yaw))*b.w/2+Math.abs(Math.sin(e.yaw))*b.d/2;
  const rz=Math.abs(Math.sin(e.yaw))*b.w/2+Math.abs(Math.cos(e.yaw))*b.d/2;
  return Math.abs(e.x)+radius>WORLD_LIMIT||Math.abs(e.z)+rz>WORLD_LIMIT||BUILDINGS.some(building=>e.y<building.h-.001&&!!contact(b,{...building,yaw:0}));
}
function fits(world:World,e:Entity,ignore?:Entity):boolean{return !solid(e)&&!world.entities.some(other=>other!==ignore&&other!==e&&Math.abs(other.y-e.y)<2.5&&!!contact(body(e),body(other)));}
function spawnPosition(world:World,kind:Entity['kind']='roadster'):{x:number;z:number} {
  for(let i=0;i<224;i++){
    const road=[0,60,-60,120,-120,180,-180][Math.floor(i/32)];
    const x=road+(i%2?3.5:-3.5),z=24-Math.floor(i/2)%16*14;
    const candidate=makeEntity('candidate',kind,x,z);
    if(fits(world,candidate))return {x,z};
  }
  // Sparse outer apron is also checked: never spawn on an occupied point.
  for(let x=-220;x<=220;x+=20)for(let z of [210,-210])if(fits(world,makeEntity('candidate',kind,x,z)))return {x,z};
  throw new Error('No free spawn position');
}
export function addPlayer(world:World,id:string,name:string):Player {
  const existing=world.players.find(p=>p.id===id);if(existing)return existing;
  const spawn=spawnPosition(world),car=makeEntity(`ride-${id}`,'roadster',spawn.x,spawn.z,id);car.owner=id;
  const player={id,name:name.slice(0,24),entityId:car.id};world.entities.push(car);world.players.push(player);return player;
}
function cleanupCars(world:World){world.entities=world.entities.filter(e=>!e.owner||e.driver!==null||world.players.some(p=>p.id===e.owner));}
function release(e:Entity,world:World){e.driver=null;e.speed=0;e.autopilot=false;if(e.npc){engageAutopilot(e);e.pauseUntil=world.time+2;}}
export function removePlayer(world:World,id:string):void {
  world.players=world.players.filter(p=>p.id!==id);
  for(const e of world.entities)if(e.driver===id)release(e,world);
  world.entities=world.entities.filter(e=>e.id!==`person-${id}`);cleanupCars(world);
}
export function interact(world:World,playerId:string):void {
  const player=world.players.find(p=>p.id===playerId),e=world.entities.find(e=>e.id===player?.entityId);
  if(!player||!e||e.y>.5||Math.abs(e.speed)>5)return;
  if(e.kind==='person'){
    const car=world.entities.filter(other=>other.kind!=='person'&&!other.driver&&other.y<.5&&Math.hypot(other.x-e.x,other.z-e.z)<Math.max(7,dimensions(other.kind).length/2+2)).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
    if(!car)return;
    car.driver=playerId;car.autopilot=false;car.speed=0;car.pushX=0;car.pushZ=0;player.entityId=car.id;world.entities=world.entities.filter(other=>other!==e);
  }else{
    const width=dimensions(e.kind).width/2+1.3,length=dimensions(e.kind).length/2+1.3;
    const exits=[{angle:Math.PI/2,distance:width},{angle:-Math.PI/2,distance:width},{angle:Math.PI,distance:length},{angle:0,distance:length}];
    const person=exits.map(({angle,distance})=>makeEntity(`person-${playerId}`,'person',e.x-Math.sin(e.yaw+angle)*distance,e.z-Math.cos(e.yaw+angle)*distance,playerId)).find(p=>fits(world,p));
    if(!person)return;
    release(e,world);player.entityId=person.id;world.entities.push(person);cleanupCars(world);
  }
}
export function chooseVehicle(world:World,id:string,kind:VehicleId):boolean {
  const player=world.players.find(p=>p.id===id),old=world.entities.find(e=>e.id===player?.entityId);
  if(!player||!old||old.y>.5||Math.abs(old.speed)>1||!Object.hasOwn(VEHICLES,kind))return false;
  release(old,world);
  world.entities=world.entities.filter(e=>e.id!==`person-${id}`&&!(e.owner===id&&!e.driver));
  const spawn=spawnPosition(world,kind),car=makeEntity(`ride-${id}-${world.time.toFixed(2)}`,kind,spawn.x,spawn.z,id);car.owner=id;
  world.entities.push(car);player.entityId=car.id;return true;
}
export function toggleAutopilot(world:World,id:string):boolean {
  const p=world.players.find(p=>p.id===id),e=world.entities.find(e=>e.id===p?.entityId);
  if(!e||e.kind==='person')return false;
  if(e.autopilot){e.autopilot=false;return true;}return engageAutopilot(e);
}
export function resetPlayer(world:World,id:string):void {
  const player=world.players.find(p=>p.id===id),e=world.entities.find(e=>e.id===player?.entityId);if(!e)return;
  Object.assign(e,spawnPosition(world,e.kind),{y:0,vy:0,yaw:0,roll:0,speed:0,pushX:0,pushZ:0,autopilot:false,steering:0});
}
function applyImpulse(e:Entity,x:number,z:number){const fx=-Math.sin(e.yaw),fz=-Math.cos(e.yaw),forward=x*fx+z*fz;e.speed+=forward;e.pushX+=x-forward*fx;e.pushZ+=z-forward*fz;}
export function step(world:World,inputs:Map<string,Input>,dt:number):void {
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.05);world.time+=dt;
  for(const e of world.entities){
    const manual=e.driver?inputs.get(e.driver)??NEUTRAL:NEUTRAL;
    if(e.driver&&(manual.throttle||manual.steer||manual.brake||manual.lift||manual.boost||manual.roll))e.autopilot=false;
    const input=e.autopilot?trafficInput(e,world):manual;
    const person=e.kind==='person',spec=person?null:VEHICLES[e.kind as VehicleId];
    const oldX=e.x,oldZ=e.z,oldY=e.y;
    const boosting=!!spec?.airThrusters&&input.boost&&e.air>0,lifting=!!spec?.airThrusters&&input.lift&&e.air>0;
    const top=person?8:boosting?Math.max(72,spec!.maxSpeed):spec!.maxSpeed;
    e.speed+=input.throttle*(person?28:boosting?32:spec!.acceleration)*dt;
    e.speed*=Math.exp(-(input.throttle===0?.65:.12)*dt);
    if(input.brake){const delta=(person?20:spec!.brakeDecel)*dt;e.speed=Math.sign(e.speed)*Math.max(0,Math.abs(e.speed)-delta);}
    e.speed=clamp(e.speed,-Math.min(top*.35,12),top)*(e.health<20?.995:1);
    e.steering+=(input.steer-e.steering)*Math.min(1,dt*8);
    if(person)e.yaw+=input.steer*2.7*dt;
    else {
      // Bicycle steering: wheelbase sets turning radius; four-wheel steer helps at low speed.
      const rearFactor=spec!.fourWheelSteering?1+.55*Math.max(0,1-Math.abs(e.speed)/25):1;
      const yawRate=e.speed/spec!.wheelbase*Math.tan(e.steering*spec!.steerAngle)*rearFactor;
      e.yaw+=clamp(yawRate,-Math.min(2.2,10/Math.max(4,Math.abs(e.speed))),Math.min(2.2,10/Math.max(4,Math.abs(e.speed))))*dt;
    }
    e.x+=(-Math.sin(e.yaw)*e.speed+e.pushX)*dt;e.z+=(-Math.cos(e.yaw)*e.speed+e.pushZ)*dt;
    e.pushX*=Math.exp(-3*dt);e.pushZ*=Math.exp(-3*dt);
    if(lifting)e.vy=Math.min(20,e.vy+30*dt);
    if(e.y>0||lifting){e.vy-=12*dt;e.y+=e.vy*dt;}
    if(e.y>0&&spec?.airThrusters)e.roll+=input.roll*3.6*dt;
    if(e.y<=0){e.y=0;e.vy=0;e.roll=0;}
    if(e.y>=100){e.y=100;e.vy=Math.min(e.vy,0);}
    e.air=clamp(e.air-(boosting?14:0)*dt-(lifting?22:0)*dt,0,100);
    for(const b of BUILDINGS)if(e.vy<=0&&e.y<=b.h&&oldY>=b.h&&contact(body(e),{...b,yaw:0})){e.y=b.h;e.vy=0;e.roll=0;}
    if(solid(e)){e.x=oldX;e.z=oldZ;e.health=Math.max(5,e.health-Math.max(0,Math.abs(e.speed)-8)*.25);e.speed*=e.autopilot?0:-.25;e.pushX=0;e.pushZ=0;}
    if(!person&&e.y<1&&Math.abs(e.speed)<1&&STATIONS.some(s=>Math.hypot(e.x-s.x,e.z-s.z)<9))e.air=Math.min(100,e.air+28*dt);
  }
  for(let i=0;i<world.entities.length;i++)for(let j=i+1;j<world.entities.length;j++){
    const a=world.entities[i],b=world.entities[j];
    if(a.y>=b.y+dimensions(b.kind).height||b.y>=a.y+dimensions(a.kind).height)continue;
    const hit=contact(body(a),body(b));if(!hit)continue;
    const ma=dimensions(a.kind).massKg,mb=dimensions(b.kind).massKg,total=ma+mb;
    const oldAX=a.x,oldAZ=a.z,oldBX=b.x,oldBZ=b.z;
    a.x-=hit.nx*(hit.depth+.01)*mb/total;a.z-=hit.nz*(hit.depth+.01)*mb/total;
    b.x+=hit.nx*(hit.depth+.01)*ma/total;b.z+=hit.nz*(hit.depth+.01)*ma/total;
    if(solid(a)){a.x=oldAX;a.z=oldAZ;}if(solid(b)){b.x=oldBX;b.z=oldBZ;}
    const avx=-Math.sin(a.yaw)*a.speed+a.pushX,avz=-Math.cos(a.yaw)*a.speed+a.pushZ;
    const bvx=-Math.sin(b.yaw)*b.speed+b.pushX,bvz=-Math.cos(b.yaw)*b.speed+b.pushZ;
    const closing=(bvx-avx)*hit.nx+(bvz-avz)*hit.nz;
    if(closing<0){const impulse=-1.25*closing/(1/ma+1/mb);applyImpulse(a,-hit.nx*impulse/ma,-hit.nz*impulse/ma);applyImpulse(b,hit.nx*impulse/mb,hit.nz*impulse/mb);const damage=Math.max(0,-closing-5)*.35;a.health=Math.max(5,a.health-damage*mb/total);b.health=Math.max(5,b.health-damage*ma/total);}
  }
  for(const pickup of world.pickups){
    if(!pickup.active&&world.time>=(pickup.readyAt??Infinity))pickup.active=true;if(!pickup.active)continue;
    const car=world.entities.find(e=>e.driver&&e.kind!=='person'&&e.y<2&&Math.hypot(e.x-pickup.x,e.z-pickup.z)<4);if(!car)continue;
    if(pickup.kind==='repair')car.health=100;else car.air=100;pickup.active=false;pickup.readyAt=world.time+20;
  }
}
