import type { Entity, Input, World } from './game';
import type { Level } from './delivery';
import { requiredLevelAt } from './delivery';
import type { DriveMode } from './drive-mode';
import { airCost, flightLoad } from './air-tank';
import { inDomePlaza, isSurface, nearbyBuildings, overpassHeight, terrainHeight } from './map';
import { dimensions } from './physics';
import { currentAt, JET_STREAMS, THERMALS } from './sky-currents';
import { hasRockets } from './upgrades';

/** Per-route state; the caller retains it until the destination is replaced or cancelled. */
export type AutonomousFlightState={
  phase:'ground'|'air';
  lastLaunch:number;
  nextCheck:number;
  lastJump:number;
  started:number;
  target:{x:number;z:number}|null;
  current:string|null;
  jumps:number;
};
export function initialAutonomousFlight():AutonomousFlightState {
  return {phase:'ground',lastLaunch:-100,nextCheck:0,lastJump:-100,started:0,target:null,current:null,jumps:0};
}
export type AutonomousFlightControl={input:Input;jump:boolean;active:boolean};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
const length=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(b.x-a.x,b.z-a.z);

/** Conservative landing corridor: no water, buildings, arena or raised deck. */
function clearCorridor(car:Entity,a:{x:number;z:number},b:{x:number;z:number},level:Level):boolean {
  const radius=Math.max(dimensions(car.kind).width,dimensions(car.kind).length)/2+1;
  const steps=Math.max(1,Math.ceil(length(a,b)/3));
  let ceiling=Math.max(level,requiredLevelAt(a.x,a.z));
  for(let i=0;i<=steps;i++){
    const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    const required=requiredLevelAt(x,z);
    if(required>ceiling||!isSurface(x,z)||inDomePlaza(x,z)||overpassHeight(x,z)!==null)return false;
    ceiling=Math.max(level,required);
    if(terrainHeight(x,z)===null||nearbyBuildings(x,z,radius).some(building=>
      Math.abs(x-building.x)<building.w/2+radius&&Math.abs(z-building.z)<building.d/2+radius))return false;
  }
  return true;
}

/** Check whether the upward impulse clears a stopped vehicle before contact. */
function jumpable(car:Entity,other:Entity,forward:{x:number;z:number},along:number):boolean {
  const size=dimensions(car.kind),obstacle=dimensions(other.kind);
  if(other.supportId!=='ground'||Math.abs(other.speed)>.15||Math.hypot(other.pushX,other.pushZ)>.15||obstacle.height>3)return false;
  const otherForward={x:-Math.sin(other.yaw),z:-Math.cos(other.yaw)};
  const alignment=Math.abs(forward.x*otherForward.x+forward.z*otherForward.z);
  const cross=Math.abs(forward.x*otherForward.z-forward.z*otherForward.x);
  const footprint=size.length/2+(alignment*obstacle.length+cross*obstacle.width)/2;
  // Check ascent and descent with this vehicle's fictional flight load.
  // Require clearance before the first ballistic descent. The optimistic
  // bound is a rejection check, not a collision-free guarantee.
  const height=obstacle.height+Math.max(0,other.y-car.y)+.5;
  const load=flightLoad(size.massKg),jumpSpeed=11/load,gravity=9.81*load;
  const discriminant=jumpSpeed*jumpSpeed-2*gravity*height;if(discriminant<=0)return false;
  const root=Math.sqrt(discriminant),time=(jumpSpeed-root)/gravity,fallTime=(jumpSpeed+root)/gravity;
  const speed=Math.max(0,car.speed+car.pushX*forward.x+car.pushZ*forward.z);
  // Approximate the controller's proportional throttle toward its 11 m/s
  // target. This credits full air and a straight heading, so remains an
  // optimistic rejection check, not a guarantee of clearance.
  const rate=16/(12*load);
  const possibleTravel=speed>=11?speed*fallTime:
    11*fallTime-(11-speed)*(1-Math.exp(-rate*fallTime))/rate;
  return along>=footprint+(speed+1)*time+8/load*time*time+1&&
    possibleTravel>=along+footprint+1;
}

/** A stopped leader is a plausible reason to spend air on a short jump. */
function stoppedLeader(car:Entity,world:World,forward:{x:number;z:number}):boolean {
  const size=dimensions(car.kind);
  let leader=false;
  for(const other of world.entities){
    if(other===car||other.y>car.y+size.height||car.y>other.y+dimensions(other.kind).height)continue;
    const o=dimensions(other.kind),dx=other.x-car.x,dz=other.z-car.z;
    const along=dx*forward.x+dz*forward.z,across=Math.abs(dx*forward.z-dz*forward.x);
    if(along<0||along>38||across>=(size.width+o.width)/2+1)continue;
    if(along>=8&&along<=13&&!leader&&jumpable(car,other,forward,along))leader=true;
    else return false; // A crowded takeoff or landing is not a safe shortcut.
  }
  return leader;
}

/** Avoid taking off or touching down among other cars. */
function skyTrafficClear(car:Entity,world:World,direction:{x:number;z:number},travel:number):boolean {
  const size=dimensions(car.kind);let leader=false;
  for(const other of world.entities){
    if(other===car)continue;
    const o=dimensions(other.kind),dx=other.x-car.x,dz=other.z-car.z;
    const along=dx*direction.x+dz*direction.z,across=Math.abs(dx*direction.z-dz*direction.x);
    if(along<0||along>travel+8||across>=(size.width+o.width)/2+2)continue;
    if(along>=8&&along<=13&&!leader&&jumpable(car,other,direction,along))leader=true;
    else return false;
  }
  return true;
}

/** An intersected low jet needs a reachable downstream exit; its lift prevents landing inside it. */
function flightPlan(car:Entity,direction:{x:number;z:number},available:number,mode:DriveMode):{travel:number;current:string|null}|null {
  let travel=Math.min(mode==='jump'?38:62,available-16),selected:string|null=null;
  const along=(x:number,z:number)=>(x-car.x)*direction.x+(z-car.z)*direction.z;
  const across=(x:number,z:number)=>Math.abs((x-car.x)*direction.z-(z-car.z)*direction.x);
  for(const thermal of THERMALS){
    const at=along(thermal.x,thermal.z);
    if(at< -thermal.radius||at>travel+thermal.radius||across(thermal.x,thermal.z)>thermal.radius+3)continue;
    if(mode==='jump')return null;
    // A flight crossing the thermal must carry on beyond the lift before landing.
    if(across(thermal.x,thermal.z)<=thermal.radius-4&&at<=28){
      travel=Math.max(travel,at+thermal.radius+25);selected=thermal.id;
    }else return null;
  }
  for(const lane of JET_STREAMS){
    if(lane.height-lane.halfHeight>17)continue;
    const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,l=Math.hypot(dx,dz),x=dx/l,z=dz/l;
    const startAlong=(car.x-lane.start.x)*x+(car.z-lane.start.z)*z;
    const startAcross=Math.abs((car.x-lane.start.x)*z-(car.z-lane.start.z)*x);
    const alignment=x*direction.x+z*direction.z;
    // Sample the planned ground corridor, including a vehicle-width margin.
    let intersects=false;
    for(let d=0;d<=travel;d+=4){
      const px=car.x+direction.x*d-lane.start.x,pz=car.z+direction.z*d-lane.start.z;
      if(px*x+pz*z>=0&&px*x+pz*z<=l&&Math.abs(px*z-pz*x)<lane.halfWidth+3){intersects=true;break;}
    }
    if(!intersects)continue;
    if(mode!=='sky'||alignment<.98||startAlong<0||l-startAlong<=0||l-startAlong>45||startAcross>lane.halfWidth-4)return null;
    travel=Math.max(travel,l-startAlong+25);selected=lane.id;
  }
  if(travel>available-16||travel>95)return null;
  return {travel,current:selected};
}

/**
 * Add optional arcade flight to an already planned ground route. The returned
 * `jump` is a one-tick authoritative physics pulse, independent of a player's
 * input counters. `active` means the ground follower must not advance the path
 * during this tick. Never changes position, velocity, resources or progression.
 * A manually cancelled/replaced route must discard its state.
 */
export function autonomousFlight(car:Entity,world:World,level:Level,mode:DriveMode,groundInput:Input,state:AutonomousFlightState):AutonomousFlightControl {
  const ground={input:groundInput,jump:false,active:false};
  const nav=car.navigation;
  if((mode!=='jump'&&mode!=='sky')||!nav||nav.status!=='driving'||!hasRockets(car)||car.inDome||car.loopAngle!==null){state.phase='ground';return ground;}
  const airUse=flightLoad(dimensions(car.kind).massKg)*(car.upgrades.economy?.75:1);
  if(state.phase==='air'){
    if(car.supportId!==null){state.phase='ground';state.target=null;return ground;}
    const target=state.target;
    if(!target)return ground;
    const distance=length(car,target),angle=wrap(Math.atan2(-(target.x-car.x),-(target.z-car.z))-car.yaw);
    const vx=-Math.sin(car.yaw),vz=-Math.cos(car.yaw),forwardSpeed=car.vx*vx+car.vz*vz;
    // The wind supplies thrust and lift. Point along the route and only use
    // jets while useful; gravity handles a landing once clear of a current.
    const current=currentAt(car);
    const speedTarget=distance>22?11:distance>10?5:0;
    const throttle=car.air>0?clamp((speedTarget-forwardSpeed)/12,-1,1):0;
    const steering=clamp(angle*1.25-car.yawRate*.35,-1,1);
    const groundHeight=terrainHeight(car.x,car.z)??0;
    const height=car.y-groundHeight;
    let jump=false;
    // Sky mode adds a second measured pulse for a longer cruise, but avoids
    // spending a jump once airborne wind is already carrying the car upward.
    if(mode==='sky'&&state.jumps<2&&car.air>=airCost(18*airUse,car.tankLevel)&&world.time-state.lastJump>.9&&
       height<9&&car.vy<3&&!current&&distance>18&&world.time-state.started<3){
      jump=true;state.lastJump=world.time;state.jumps++;
    }
    const hover=car.air>=airCost(5*airUse,car.tankLevel)&&height<6&&car.vy< -6;
    const input:Input={...groundInput,throttle,steer:steering,brake:false,boost:false,hover,roll:0};
    return {input,jump,active:true};
  }
  // Never demand more than 90% of the installed tank: a heavy Level 1
  // vehicle still needs a substantial reserve but can actually take off.
  const launchReserve=Math.min(90,airCost(45*airUse,car.tankLevel));
  if(car.supportId!=='ground'||nav.join||world.time-state.lastLaunch<10||car.air<launchReserve||
     Math.abs(car.speed)>12||car.speed<-.2||world.time<state.nextCheck)return ground;
  const next=nav.path[nav.index];if(!next)return ground;
  const distance=length(car,next);if(distance<70)return ground;
  const direction={x:(next.x-car.x)/distance,z:(next.z-car.z)/distance};
  const forward={x:-Math.sin(car.yaw),z:-Math.cos(car.yaw)};
  if(direction.x*forward.x+direction.z*forward.z<.98)return ground;
  // Corridor and traffic checks are bounded to a few times a second per route.
  state.nextCheck=world.time+(mode==='jump'?.2:1);
  if(mode==='jump'&&!stoppedLeader(car,world,forward))return ground;
  const plan=flightPlan(car,direction,distance,mode);if(!plan||
     (mode==='sky'&&!skyTrafficClear(car,world,direction,plan.travel)))return ground;
  const target={x:car.x+direction.x*plan.travel,z:car.z+direction.z*plan.travel};
  if(!clearCorridor(car,car,target,level))return ground;
  state.phase='air';state.started=world.time;state.lastJump=world.time;state.lastLaunch=world.time;
  state.target=target;state.current=plan.current;state.jumps=1;
  return {input:{...groundInput,throttle:Math.max(groundInput.throttle,.35),steer:0,brake:false,boost:false,hover:false,roll:0},jump:true,active:true};
}
