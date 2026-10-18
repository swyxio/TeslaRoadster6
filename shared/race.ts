import type { Entity, World } from './game';

// Yaw points in the legal direction of travel; a gate is a vertical plane.
// The last gate is the finish. The start marker must be behind the first gate.
export type RaceGate = { id:string; x:number; z:number; yaw:number; width:number; minY:number; maxY:number };
export type RaceCourse = { id:string; start:{x:number; y:number; z:number; radius:number}; gates:RaceGate[] };
type Sample = {x:number; y:number; z:number; time:number};
export type RaceEntrant = {
  playerId:string; entityId:string; status:'entered'|'finished'|'dnf'; nextGate:number;
  finishedAt:number|null; elapsed:number|null; rank:number|null;
  feedback:'wrong-way'|'missed-gate'|null; feedbackUntil:number; previous:Sample;
};
export type RaceRound = {
  courseId:string; phase:'lobby'|'countdown'|'active'|'results'; hostId:string;
  openedAt:number; startedAt:number|null; endsAt:number; entrants:RaceEntrant[];
};
export type RaceState = {rounds:RaceRound[]};

export const RACE_MAX_ENTRANTS=8;
export const RACE_LOBBY_WAIT=15;
export const RACE_COUNTDOWN=3;
export const RACE_DURATION=300;
export const RACE_RESULTS_DURATION=30;
const FEEDBACK_DURATION=2;
const EPSILON=1e-9;

export function createRace():RaceState { return {rounds:[]}; }
function compareIds(a:string,b:string):number {return a<b?-1:a>b?1:0;}
/** Prefer the current race; otherwise show the most recently opened result. */
export function playerRace(state:RaceState,playerId:string):{round:RaceRound;entrant:RaceEntrant}|undefined {
  return state.rounds.flatMap(round=>round.entrants.filter(entrant=>entrant.playerId===playerId).map(entrant=>({round,entrant})))
    .sort((a,b)=>Number(b.entrant.status==='entered')-Number(a.entrant.status==='entered')||
      b.round.openedAt-a.round.openedAt||compareIds(a.round.courseId,b.round.courseId))[0];
}
function sample(car:Entity,time:number):Sample {return {x:car.x,y:car.y,z:car.z,time};}
function playerCar(world:World,playerId:string):Entity|undefined {
  const player=world.players.find(p=>p.id===playerId);
  const car=world.entities.find(e=>e.id===player?.entityId);
  return car&&car.kind!=='person'&&car.driver===playerId?car:undefined;
}
function nearStart(course:RaceCourse,car:Entity):boolean {
  const start=course.start;
  return Math.hypot(car.x-start.x,car.y-start.y,car.z-start.z)<=start.radius;
}
function close(round:RaceRound,time:number):void {
  round.phase='results';round.endsAt=time+RACE_RESULTS_DURATION;
}
function countdown(round:RaceRound,time:number):void {
  round.phase='countdown';round.startedAt=time+RACE_COUNTDOWN;round.endsAt=round.startedAt;
}
function rank(round:RaceRound):void {
  const finished=round.entrants.filter(e=>e.status==='finished').sort((a,b)=>a.elapsed!-b.elapsed!||compareIds(a.playerId,b.playerId));
  finished.forEach((entrant,index)=>{entrant.rank=index+1;});
}

/** Join only a supplied course, close to its authored start, in a driven car. */
export function joinRace(state:RaceState,course:RaceCourse,world:World,playerId:string):boolean {
  const car=playerCar(world,playerId);
  if(!car||!Number.isFinite(world.time)||!course.gates.length||!nearStart(course,car)||
    state.rounds.some(round=>round.entrants.some(entrant=>entrant.playerId===playerId&&entrant.status==='entered')))return false;
  let round=state.rounds.find(r=>r.courseId===course.id);
  if(round&&(round.phase!=='lobby'||world.time>=round.endsAt||round.entrants.length>=RACE_MAX_ENTRANTS))return false;
  if(!round){
    round={courseId:course.id,phase:'lobby',hostId:playerId,openedAt:world.time,startedAt:null,
      endsAt:world.time+RACE_LOBBY_WAIT,entrants:[]};
    state.rounds.push(round);
  }
  round.entrants.push({playerId,entityId:car.id,status:'entered',nextGate:0,finishedAt:null,elapsed:null,rank:null,
    feedback:null,feedbackUntil:0,previous:sample(car,world.time)});
  return true;
}

/** A host may start alone; everyone still sees the countdown. */
export function startRace(state:RaceState,courseId:string,world:World,playerId:string):boolean {
  const round=state.rounds.find(r=>r.courseId===courseId);
  if(!round||round.phase!=='lobby'||round.hostId!==playerId||!round.entrants.some(e=>e.playerId===playerId)||!playerCar(world,playerId))return false;
  countdown(round,world.time);return true;
}

/** Call on leave, disconnect, reset and vehicle change. Active racers become DNF. */
export function leaveRace(state:RaceState,playerId:string):void {
  for(const round of state.rounds){
    if(round.phase==='lobby'||round.phase==='countdown'){
      round.entrants=round.entrants.filter(e=>e.playerId!==playerId);
      if(round.hostId===playerId&&round.entrants.length)round.hostId=round.entrants[0].playerId;
    }else {
      const entrant=round.entrants.find(e=>e.playerId===playerId);
      if(entrant?.status==='entered')entrant.status='dnf';
    }
  }
  state.rounds=state.rounds.filter(round=>round.entrants.length>0);
}

function interpolate(a:Sample,b:Sample,t:number):Sample {
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,time:a.time+(b.time-a.time)*t};
}
/** Crossing fraction on the sampled segment, including its width and altitude. */
function crossing(gate:RaceGate,a:Sample,b:Sample,forward:boolean):number|null {
  const nx=-Math.sin(gate.yaw),nz=-Math.cos(gate.yaw),wx=Math.cos(gate.yaw),wz=-Math.sin(gate.yaw);
  const before=(a.x-gate.x)*nx+(a.z-gate.z)*nz,after=(b.x-gate.x)*nx+(b.z-gate.z)*nz;
  if(forward?!(before<=0&&after>0):!(before>=0&&after<0))return null;
  const t=-before/(after-before),point=interpolate(a,b,t);
  const across=(point.x-gate.x)*wx+(point.z-gate.z)*wz;
  return Math.abs(across)<=gate.width/2+EPSILON&&point.y>=gate.minY-EPSILON&&point.y<=gate.maxY+EPSILON?t:null;
}
function feedback(entrant:RaceEntrant,kind:RaceEntrant['feedback'],time:number):void {
  entrant.feedback=kind;entrant.feedbackUntil=time+FEEDBACK_DURATION;
}

/** Advance after every authoritative physics substep; clients never submit progress or time. */
export function updateRace(state:RaceState,courses:readonly RaceCourse[],world:World,dt:number):void {
  if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(world.time))return;
  for(const round of state.rounds){
    const course=courses.find(c=>c.id===round.courseId);
    if(!course){round.entrants=[];continue;}
    if(round.phase==='results')continue;
    if(round.phase==='lobby'||round.phase==='countdown'){
      // Players can leave before the start. Do not silently move anyone to a slot.
      round.entrants=round.entrants.filter(entrant=>{
        const car=playerCar(world,entrant.playerId);
        return !!car&&car.id===entrant.entityId&&nearStart(course,car);
      });
      if(!round.entrants.length)continue;
      if(!round.entrants.some(e=>e.playerId===round.hostId))round.hostId=round.entrants[0].playerId;
      if(round.phase==='lobby'&&world.time>=round.endsAt)countdown(round,round.endsAt);
      if(round.phase==='countdown'&&world.time>=round.endsAt){
        round.phase='active';round.endsAt=round.startedAt!+RACE_DURATION;
      }
      if(round.phase!=='active'){
        for(const entrant of round.entrants)entrant.previous=sample(playerCar(world,entrant.playerId)!,world.time);
        continue;
      }
    }
    for(const entrant of round.entrants){
      if(entrant.status!=='entered')continue;
      const car=playerCar(world,entrant.playerId);
      if(!car||car.id!==entrant.entityId){entrant.status='dnf';continue;}
      if(entrant.feedback&&world.time>=entrant.feedbackUntil)entrant.feedback=null;
      const now=sample(car,world.time),previous=entrant.previous;
      entrant.previous=now;
      if(now.time<=previous.time)continue;
      const from=Math.max(previous.time,round.startedAt!),to=Math.min(now.time,round.endsAt);
      if(from>to)continue;
      const span=now.time-previous.time;
      const a=interpolate(previous,now,(from-previous.time)/span),b=interpolate(previous,now,(to-previous.time)/span);
      let lastCrossing=-1;
      while(entrant.nextGate<course.gates.length){
        const t=crossing(course.gates[entrant.nextGate],a,b,true);
        if(t===null||t<=lastCrossing+EPSILON)break;
        lastCrossing=t;entrant.nextGate++;entrant.feedback=null;
        if(entrant.nextGate===course.gates.length){
          entrant.finishedAt=a.time+(b.time-a.time)*t;entrant.elapsed=entrant.finishedAt-round.startedAt!;entrant.status='finished';
        }
      }
      if(entrant.status==='entered'){
        const expected=course.gates[entrant.nextGate];
        if(crossing(expected,a,b,false)!==null)feedback(entrant,'wrong-way',world.time);
        else if(course.gates.slice(entrant.nextGate+1).some(gate=>crossing(gate,a,b,true)!==null))feedback(entrant,'missed-gate',world.time);
      }
    }
    rank(round);
    if(world.time>=round.endsAt){
      for(const entrant of round.entrants)if(entrant.status==='entered')entrant.status='dnf';
      close(round,world.time);
    }else if(round.entrants.every(entrant=>entrant.status!=='entered'))close(round,world.time);
  }
  state.rounds=state.rounds.filter(round=>round.entrants.length>0&&(round.phase!=='results'||world.time<round.endsAt));
}
