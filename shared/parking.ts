import type { Entity, World } from './game';
import { body, contact, dimensions } from './physics';
import { terrainHeight } from './map';

// These rectangles are authored in the same coordinates as the map. The
// approach may extend beyond the lot's main activity area.
export type ParkingArea = { x:number; z:number; yaw:number; width:number; length:number };
export type ParkingStall = ParkingArea & { id:string; y:number };
export type ParkingLot = { id:string; area:ParkingArea; approach:ParkingArea; stalls:ParkingStall[] };
export type ParkingMode = 'park' | 'queue';
export type ParkingEntrant = {
  playerId:string; entityId:string; joinedAt:number; targetId:string|null;
  hold:number; finishedAt:number|null; elapsed:number|null; overtakes:number|null;
};
export type ParkingRound = {
  lotId:string; mode:ParkingMode; phase:'waiting'|'active'|'results'; hostId:string;
  openedAt:number; startedAt:number|null; endsAt:number; entrants:ParkingEntrant[]; claimedStallIds:string[];
};
export type ParkingState = { rounds:ParkingRound[] };

export const PARKING_MAX_ENTRANTS = 8;
export const PARKING_QUEUE_WAIT = 15;
export const PARKING_QUEUE_DURATION = 90;
export const PARKING_PARK_DURATION = 120;
export const PARKING_RESULTS_DURATION = 30;
export const PARKING_HOLD = 2;
const MAX_HEADING_ERROR = Math.PI / 9;
const EPSILON = 1e-8;

export function createParking():ParkingState { return { rounds:[] }; }

function axes(yaw:number) {
  return { wx:Math.cos(yaw), wz:-Math.sin(yaw), dx:-Math.sin(yaw), dz:-Math.cos(yaw) };
}
export function insideParkingArea(area:ParkingArea, x:number, z:number):boolean {
  const a=axes(area.yaw), dx=x-area.x, dz=z-area.z;
  return Math.abs(dx*a.wx+dz*a.wz)<=area.width/2 && Math.abs(dx*a.dx+dz*a.dz)<=area.length/2;
}
function headingError(a:number,b:number):number {
  return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
}

/** Check the real oriented collision footprint, not merely the vehicle center. */
export function fitsParkingStall(stall:ParkingStall, car:Entity):boolean {
  if(car.kind==='person'||car.supportId!=='ground'||Math.abs(car.y-stall.y)>.5||
    Math.hypot(car.vx,car.vy,car.vz)>=1||Math.abs(car.speed)>=1||headingError(car.yaw,stall.yaw)>MAX_HEADING_ERROR+EPSILON)return false;
  const carBody=body(car), a=axes(stall.yaw), b=axes(car.yaw), dx=car.x-stall.x, dz=car.z-stall.z;
  const across=Math.abs(dx*a.wx+dz*a.wz)+Math.abs(a.wx*b.wx+a.wz*b.wz)*carBody.w/2+Math.abs(a.wx*b.dx+a.wz*b.dz)*carBody.d/2;
  const along=Math.abs(dx*a.dx+dz*a.dz)+Math.abs(a.dx*b.wx+a.dz*b.wz)*carBody.w/2+Math.abs(a.dx*b.dx+a.dz*b.dz)*carBody.d/2;
  return across<=stall.width/2+EPSILON&&along<=stall.length/2+EPSILON;
}

function playerCar(world:World, playerId:string):Entity|undefined {
  const player=world.players.find(p=>p.id===playerId);
  const car=world.entities.find(e=>e.id===player?.entityId);
  return car&&car.kind!=='person'&&car.driver===playerId?car:undefined;
}
function fitsDimensions(stall:ParkingStall, car:Entity):boolean {
  const spec=dimensions(car.kind);
  return spec.width<=stall.width&&spec.length<=stall.length;
}
function hash(value:string):number {
  let result=2166136261;
  for(let i=0;i<value.length;i++)result=Math.imul(result^value.charCodeAt(i),16777619);
  return result>>>0;
}
function targetFor(lot:ParkingLot, round:ParkingRound, car:Entity, playerId:string):string|null {
  const suitable=lot.stalls.filter(stall=>fitsDimensions(stall,car));
  if(!suitable.length)return null;
  const used=new Set(round.entrants.map(e=>e.targetId));
  const free=suitable.filter(stall=>!used.has(stall.id));
  const choices=free.length?free:suitable;
  return choices[hash(`${lot.id}:${playerId}:${round.openedAt}`)%choices.length].id;
}
function order(a:ParkingEntrant,b:ParkingEntrant):number {
  return a.joinedAt-b.joinedAt || compareIds(a.playerId,b.playerId);
}
function compareIds(a:string,b:string):number { return a<b?-1:a>b?1:0; }
function results(round:ParkingRound,time:number):void {
  round.phase='results';round.endsAt=time+PARKING_RESULTS_DURATION;
}

/** Join is an intent; only a driven car at the authored lot may enter. */
export function joinParking(state:ParkingState,lot:ParkingLot,world:World,playerId:string,mode:ParkingMode):boolean {
  const car=playerCar(world,playerId);
  const ground=car?terrainHeight(car.x,car.z):null;
  if((mode!=='park'&&mode!=='queue')||!car||car.supportId!=='ground'||ground===null||Math.abs(car.y-ground)>.5||!Number.isFinite(world.time)||
    !(insideParkingArea(lot.area,car.x,car.z)||(mode==='queue'&&insideParkingArea(lot.approach,car.x,car.z)))||
    (mode==='queue'&&!insideParkingArea(lot.approach,car.x,car.z))||
    state.rounds.some(round=>round.entrants.some(entrant=>entrant.playerId===playerId)))return false;
  let round=state.rounds.find(round=>round.lotId===lot.id);
  if(round&&(round.mode!==mode||round.phase!==(mode==='queue'?'waiting':'active')||round.entrants.length>=PARKING_MAX_ENTRANTS||world.time>=round.endsAt))return false;
  if(!round){
    round={lotId:lot.id,mode,phase:mode==='queue'?'waiting':'active',hostId:playerId,openedAt:world.time,
      startedAt:mode==='park'?world.time:null,endsAt:world.time+(mode==='park'?PARKING_PARK_DURATION:PARKING_QUEUE_WAIT),entrants:[],claimedStallIds:[]};
  }
  const targetId=mode==='park'?targetFor(lot,round,car,playerId):null;
  if(mode==='park'&&!targetId)return false;
  if(mode==='queue'&&!lot.stalls.some(stall=>fitsDimensions(stall,car)))return false;
  if(!state.rounds.includes(round))state.rounds.push(round);
  round.entrants.push({playerId,entityId:car.id,joinedAt:world.time,targetId,hold:0,finishedAt:null,elapsed:null,overtakes:null});
  round.entrants.sort(order);
  return true;
}

function beginQueue(round:ParkingRound,time:number):void {
  round.phase='active';round.startedAt=time;round.endsAt=time+PARKING_QUEUE_DURATION;
}
/** The host can start early; otherwise the queue starts after its waiting period. */
export function startQueue(state:ParkingState,lotId:string,world:World,playerId:string):boolean {
  const round=state.rounds.find(r=>r.lotId===lotId);
  if(!round||round.mode!=='queue'||round.phase!=='waiting'||round.hostId!==playerId||!round.entrants.some(e=>e.playerId===playerId)||!playerCar(world,playerId))return false;
  beginQueue(round,world.time);return true;
}

/** Call on explicit leave, disconnect, reset and vehicle change. */
export function leaveParking(state:ParkingState,playerId:string):void {
  for(const round of state.rounds){
    round.entrants=round.entrants.filter(entrant=>entrant.playerId!==playerId);
    if(round.hostId===playerId&&round.entrants.length)round.hostId=round.entrants[0].playerId;
  }
  state.rounds=state.rounds.filter(round=>round.entrants.length>0);
}

function blocked(stall:ParkingStall,world:World,contenders:Set<string>):boolean {
  const rectangle={x:stall.x,z:stall.z,w:stall.width,d:stall.length,yaw:stall.yaw};
  return world.entities.some(e=>!contenders.has(e.id)&&e.y<stall.y+2&&e.y+dimensions(e.kind).height>stall.y&&!!contact(rectangle,body(e)));
}

/** Advance after world physics so all decisions use authoritative poses. */
export function updateParking(state:ParkingState,lots:readonly ParkingLot[],world:World,dt:number):void {
  if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(world.time))return;
  for(const round of state.rounds){
    const lot=lots.find(l=>l.id===round.lotId);
    if(!lot){round.entrants=[];continue;}
    round.entrants=round.entrants.filter(entrant=>{
      const car=playerCar(world,entrant.playerId);
      return !!car&&car.id===entrant.entityId&&(insideParkingArea(lot.area,car.x,car.z)||(round.mode==='queue'&&insideParkingArea(lot.approach,car.x,car.z)))&&
        (round.phase!=='waiting'||insideParkingArea(lot.approach,car.x,car.z));
    });
    if(!round.entrants.length)continue;
    if(!round.entrants.some(e=>e.playerId===round.hostId))round.hostId=round.entrants[0].playerId;
    if(round.phase==='results')continue;
    if(round.phase==='waiting'){
      if(world.time>=round.endsAt)beginQueue(round,world.time);
      continue;
    }
    if(world.time>=round.endsAt){results(round,world.time);continue;}
    if(round.mode==='park'){
      for(const entrant of round.entrants){
        if(entrant.finishedAt!==null)continue;
        const stall=lot.stalls.find(s=>s.id===entrant.targetId),car=playerCar(world,entrant.playerId)!;
        entrant.hold=stall&&fitsParkingStall(stall,car)?entrant.hold+dt:0;
        if(entrant.hold+EPSILON>=PARKING_HOLD){
          entrant.finishedAt=world.time;entrant.elapsed=world.time-entrant.joinedAt;entrant.hold=PARKING_HOLD;
        }
      }
    }else{
      // Gather all candidates before awarding any: same-tick claims are settled
      // by player ID, independent of entity or entrant array iteration order.
      const candidates=round.entrants.filter(e=>e.finishedAt===null).map(entrant=>{
        const car=playerCar(world,entrant.playerId)!;
        return {entrant,car,stall:lot.stalls.find(stall=>fitsParkingStall(stall,car))};
      }).filter((item):item is typeof item & {stall:ParkingStall}=>!!item.stall)
        .sort((a,b)=>compareIds(a.entrant.playerId,b.entrant.playerId));
      const claimed=new Set(round.claimedStallIds);
      for(const candidate of candidates){
        const {entrant,stall}=candidate;
        if(claimed.has(stall.id))continue;
        const contenders=new Set(candidates.filter(c=>c.stall.id===stall.id).map(c=>c.car.id));
        if(blocked(stall,world,contenders))continue;
        entrant.finishedAt=world.time;entrant.elapsed=world.time-round.startedAt!;entrant.targetId=stall.id;
        entrant.overtakes=round.entrants.filter(other=>other.finishedAt===null&&order(other,entrant)<0).length;
        claimed.add(stall.id);round.claimedStallIds.push(stall.id);
      }
    }
    if(round.entrants.every(entrant=>entrant.finishedAt!==null)||
      (round.mode==='queue'&&lot.stalls.every(stall=>round.claimedStallIds.includes(stall.id))))results(round,world.time);
  }
  state.rounds=state.rounds.filter(round=>round.entrants.length>0&&(round.phase!=='results'||world.time<round.endsAt));
}
