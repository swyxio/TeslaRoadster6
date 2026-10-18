import { DOME } from './dome';
import type { Entity } from './game';
import { domeSurface } from './map';
import { dimensions } from './physics';
import { hasRockets } from './upgrades';

export type SoccerSide = 'blue' | 'orange';
export type SoccerBall = {x:number;y:number;z:number;vx:number;vy:number;vz:number};
export type DomeCarClass = 'roadster' | 'retrofit' | 'stock';
export type DomeParticipant = {playerId:string;touches:Record<DomeCarClass,boolean>;goals:Record<DomeCarClass,number>};
export type SoccerState = {
  ball:SoccerBall;
  blueScore:number;
  orangeScore:number;
  phase:'play'|'goal'|'win';
  phaseUntil:number;
  winner:SoccerSide|null;
  lastScorer:SoccerSide|null;
  participants:DomeParticipant[];
  lastTouch:{playerId:string;carClass:DomeCarClass}|null;
  winningPlayers:string[];
};

const BALL_RADIUS=DOME.ballRadius, MAX_BALL_SPEED=120, RESTITUTION=.78;
const GOAL_SECONDS=3, WIN_SECONDS=6, WIN_SCORE=5;
const EPSILON=.0001;
const kickoff=():SoccerBall=>({x:DOME.x,y:BALL_RADIUS,z:DOME.z,vx:0,vy:0,vz:0});

export function initialSoccer():SoccerState {
  return {ball:kickoff(),blueScore:0,orangeScore:0,phase:'play',phaseUntil:0,winner:null,lastScorer:null,participants:[],lastTouch:null,winningPlayers:[]};
}

export function domeGoals(participant:DomeParticipant):number {
  return participant.goals.roadster+participant.goals.retrofit+participant.goals.stock;
}

function recordTouch(state:SoccerState,car:Entity):void {
  if(!car.driver||car.kind==='person'){state.lastTouch=null;return;}
  const carClass:DomeCarClass=car.kind==='roadster'?'roadster':hasRockets(car)?'retrofit':'stock';
  let participant=state.participants.find(p=>p.playerId===car.driver);
  if(!participant){
    participant={playerId:car.driver,touches:{roadster:false,retrofit:false,stock:false},goals:{roadster:0,retrofit:0,stock:0}};
    state.participants.push(participant);
  }
  participant.touches[carClass]=true;
  state.lastTouch={playerId:car.driver,carClass};
}

function limitSpeed(ball:SoccerBall):void {
  const speed=Math.hypot(ball.vx,ball.vy,ball.vz);
  if(speed>MAX_BALL_SPEED){const scale=MAX_BALL_SPEED/speed;ball.vx*=scale;ball.vy*=scale;ball.vz*=scale;}
}

// The whole sphere must fit through the visible goal opening.
function fitsGoal(y:number,z:number):boolean {
  return Math.abs(z-DOME.z)<=DOME.goalHalfWidth-BALL_RADIUS&&y<=DOME.goalHeight-BALL_RADIUS;
}

function scoreCrossing(ball:SoccerBall,dx:number,dy:number,dz:number):{t:number;side:SoccerSide}|null {
  if(dx===0)return null;
  const end=dx>0?DOME.x+DOME.halfLength:DOME.x-DOME.halfLength;
  const t=(end-ball.x)/dx;
  if(t<0||t>1)return null;
  const y=ball.y+dy*t,z=ball.z+dz*t;
  return fitsGoal(y,z)?{t,side:dx>0?'blue':'orange'}:null;
}

function recordGoal(state:SoccerState,side:SoccerSide,time:number):void {
  const touch=state.lastTouch,scorer=state.participants.find(p=>p.playerId===touch?.playerId);
  if(touch&&scorer)scorer.goals[touch.carClass]++;
  state.lastTouch=null;
  if(side==='blue')state.blueScore++;else state.orangeScore++;
  state.lastScorer=side;
  state.winner=(side==='blue'?state.blueScore:state.orangeScore)>=WIN_SCORE?side:null;
  if(state.winner){
    const high=Math.max(0,...state.participants.map(domeGoals));
    state.winningPlayers=high>0?state.participants.filter(p=>domeGoals(p)===high).map(p=>p.playerId):[];
  }
  state.phase=state.winner?'win':'goal';
  state.phaseUntil=time+(state.winner?WIN_SECONDS:GOAL_SECONDS);
  state.ball.vx=state.ball.vy=state.ball.vz=0;
}

type Hit={t:number;nx:number;ny:number;nz:number;depth:number;car:Entity};
/** Sweep the ball against a moving car box, expanded by the ball radius. */
function sweepCar(ball:SoccerBall,car:Entity,elapsed:number,duration:number,dt:number):Hit|null {
  const spec=dimensions(car.kind),c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  const surface=car.supportId==='dome'&&car.domeS!==null?domeSurface(car.domeS):null;
  const up={x:0,y:surface?.normalY??1,z:surface?.normalZ??0};
  const back={x:s,y:c*(surface?.tangentY??0),z:c*(surface?.tangentZ??1)};
  const right={x:up.y*back.z-up.z*back.y,y:up.z*back.x,z:-up.y*back.x};
  const axes=[right,up,back];
  const remaining=dt-elapsed;
  const dx=ball.x-(car.x-car.vx*remaining+up.x*spec.height/2);
  const dy=ball.y-(car.y-car.vy*remaining+up.y*spec.height/2);
  const dz=ball.z-(car.z-car.vz*remaining+up.z*spec.height/2);
  const relX=(ball.vx-car.vx)*duration,relY=(ball.vy-car.vy)*duration,relZ=(ball.vz-car.vz)*duration;
  const pos=axes.map(v=>dx*v.x+dy*v.y+dz*v.z);
  const move=axes.map(v=>relX*v.x+relY*v.y+relZ*v.z);
  const half=[spec.width/2+BALL_RADIUS,spec.height/2+BALL_RADIUS,spec.length/2+BALL_RADIUS];
  let enter=0,exit=1,axis=-1,sign=0;
  const inside=pos.every((value,i)=>Math.abs(value)<=half[i]);
  for(let i=0;i<3;i++){
    if(Math.abs(move[i])<1e-12){if(Math.abs(pos[i])>half[i])return null;continue;}
    const a=(-half[i]-pos[i])/move[i],b=(half[i]-pos[i])/move[i];
    const near=Math.min(a,b),far=Math.max(a,b);
    if(near>enter){enter=near;axis=i;sign=a<b?-1:1;}
    exit=Math.min(exit,far);if(enter>exit)return null;
  }
  let depth=0;
  if(inside){
    axis=0;
    for(let i=1;i<3;i++)if(half[i]-Math.abs(pos[i])<half[axis]-Math.abs(pos[axis]))axis=i;
    sign=pos[axis]>=0?1:-1;depth=Math.max(0,half[axis]-Math.abs(pos[axis]));
    if(depth<EPSILON&&move[axis]*sign>=0)return null;
  }else if(axis<0||enter<0||enter>1)return null;
  const nx=sign*axes[axis].x,ny=sign*axes[axis].y,nz=sign*axes[axis].z;
  return {t:enter,nx,ny,nz,depth,car};
}

function contain(ball:SoccerBall):void {
  // Horizontal ceiling/floor in the middle, with circular side-wall caps.
  if(ball.y<BALL_RADIUS){ball.y=BALL_RADIUS;if(ball.vy<0)ball.vy=-ball.vy*RESTITUTION;if(ball.vy<.7)ball.vy=0;}
  if(ball.y>2*DOME.radius-BALL_RADIUS){ball.y=2*DOME.radius-BALL_RADIUS;if(ball.vy>0)ball.vy=-ball.vy*RESTITUTION;}
  const offset=ball.z-DOME.z,side=Math.sign(offset)||1;
  const out=Math.max(0,Math.abs(offset)-DOME.flatHalfWidth),vertical=ball.y-DOME.radius;
  const distance=Math.hypot(out,vertical),innerRadius=DOME.radius-BALL_RADIUS;
  if(out>0&&distance>innerRadius){
    const nz=side*out/distance,ny=vertical/distance;
    ball.z=DOME.z+side*(DOME.flatHalfWidth+out*innerRadius/distance);
    ball.y=DOME.radius+vertical*innerRadius/distance;
    const velocity=ball.vz*nz+ball.vy*ny;
    if(velocity>0){ball.vz-=(1+RESTITUTION)*velocity*nz;ball.vy-=(1+RESTITUTION)*velocity*ny;}
  }
  // Cars cannot cross the end wall; only a ball fitting the mouth can enter.
  const end=DOME.halfLength-BALL_RADIUS,relative=ball.x-DOME.x;
  if(Math.abs(relative)>end&&!fitsGoal(ball.y,ball.z)){
    const direction=Math.sign(relative);ball.x=DOME.x+direction*end;
    if(ball.vx*direction>0)ball.vx=-ball.vx*RESTITUTION;
  }
}

function advanceBall(state:SoccerState,entities:readonly Entity[],elapsed:number,duration:number,dt:number,time:number):void {
  const ball=state.ball;
  let remaining=duration,offset=elapsed;
  // The bound prevents pathological repeated overlap from making a tick unbounded.
  for(let iteration=0;iteration<8&&remaining>1e-8;iteration++){
    let hit:Hit|null=null;
    for(const car of entities){
      if(car.kind==='person'||!car.inDome)continue;
      const candidate=sweepCar(ball,car,offset,remaining,dt);
      if(candidate&&(!hit||candidate.t<hit.t))hit=candidate;
    }
    const dx=ball.vx*remaining,dy=ball.vy*remaining,dz=ball.vz*remaining;
    const crossing=scoreCrossing(ball,dx,dy,dz);
    if(crossing&&(!hit||crossing.t<=hit.t)){
      ball.x+=dx*crossing.t;ball.y+=dy*crossing.t;ball.z+=dz*crossing.t;
      recordGoal(state,crossing.side,time);return;
    }
    const fraction=hit?.t??1;
    ball.x+=dx*fraction;ball.y+=dy*fraction;ball.z+=dz*fraction;
    offset+=remaining*fraction;remaining*=1-fraction;
    if(!hit){contain(ball);return;}
    ball.x+=hit.nx*(hit.depth+EPSILON);ball.y+=hit.ny*(hit.depth+EPSILON);ball.z+=hit.nz*(hit.depth+EPSILON);
    const relative=(ball.vx-hit.car.vx)*hit.nx+(ball.vy-hit.car.vy)*hit.ny+(ball.vz-hit.car.vz)*hit.nz;
    if(relative<0){
      recordTouch(state,hit.car);
      const impulse=-(1+RESTITUTION)*relative;ball.vx+=impulse*hit.nx;ball.vy+=impulse*hit.ny;ball.vz+=impulse*hit.nz;limitSpeed(ball);
    }
    contain(ball);
  }
}

/** Advance server-owned soccer using real simulation seconds and the cars' authoritative poses. */
export function stepSoccer(state:SoccerState,entities:readonly Entity[],dt:number,worldTime:number):void {
  if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(worldTime))return;
  if(state.phase!=='play'){
    if(worldTime>=state.phaseUntil){
      if(state.phase==='win'){state.blueScore=0;state.orangeScore=0;state.participants=[];state.winningPlayers=[];}
      state.lastTouch=null;
      state.ball=kickoff();state.phase='play';state.phaseUntil=0;state.winner=null;state.lastScorer=null;
    }
    return;
  }
  dt=Math.min(dt,.05);
  limitSpeed(state.ball);
  const steps=Math.max(1,Math.ceil(Math.hypot(state.ball.vx,state.ball.vy,state.ball.vz)*dt/(BALL_RADIUS*.4)));
  const substep=dt/steps;
  for(let i=0;i<steps&&state.phase==='play';i++){
    const drag=Math.exp(-.08*substep);
    state.ball.vx*=drag;state.ball.vz*=drag;state.ball.vy-=9.81*substep;
    limitSpeed(state.ball);
    advanceBall(state,entities,i*substep,substep,dt,worldTime);
  }
}
