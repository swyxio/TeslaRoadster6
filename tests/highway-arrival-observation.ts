/** Untimed fixed-seed replay of the staged highway drive; not a rendering or performance test. */
import {addPlayer,createWorld,step,type Input} from '../shared/game';
import {terrainHeight} from '../shared/map';
import {ROUTES} from '../shared/traffic';

const world=createWorld(0),x=-798,z=3300,yaw=.053;
const player=addPlayer(world,'observer','Observer',[{x,y:terrainHeight(x,z)!,z,yaw}]);
const car=world.entities.find(entity=>entity.id===player.entityId)!;
if(car.x!==x||car.z!==z)throw new Error('Staged pose was unavailable');
const neutral:Input={throttle:0,steer:0,boost:false,hover:false,roll:0,brake:false,jump:0,flip:0,cockpit:false};
const first:Record<string,number|null>={'400':null,'600':null,'1200':null};
const initial=world.entities.filter(entity=>entity.id.startsWith('ambient-')).map(entity=>({
  id:entity.id,x:Math.round(entity.x),z:Math.round(entity.z),routeId:entity.routeId,
  distance:Math.round(Math.hypot(entity.x-x,entity.z-z)),
}));
const spawned:{time:number;id:string;x:number;z:number;routeId:number;distance:number;kind:string;speed:number;waypointDistance:number}[]=[];
const known=new Set(world.entities.map(entity=>entity.id));
let nearest=Infinity;
for(let tick=0;tick<1200;tick++){
  const time=tick*.05,throttle=time<8.5||time>=21&&time<25?1:0;
  step(world,new Map([[player.id,{...neutral,throttle}]]),.05);
  for(const other of world.entities){
    if(!known.has(other.id)&&other.id.startsWith('ambient-')){
      spawned.push({time:+world.time.toFixed(2),id:other.id,x:Math.round(other.x),z:Math.round(other.z),
        routeId:other.routeId,distance:Math.round(Math.hypot(other.x-car.x,other.z-car.z)),kind:other.kind,speed:+other.speed.toFixed(1),
        waypointDistance:Math.round(Math.hypot(other.x-ROUTES[other.routeId][other.waypoint].x,other.z-ROUTES[other.routeId][other.waypoint].z))});
      known.add(other.id);
    }
    if(!other.id.startsWith('ambient-')||other.driver)continue;
    const dx=other.x-car.x,dz=other.z-car.z,distance=Math.hypot(dx,dz);
    const ahead=dx*-Math.sin(car.yaw)+dz*-Math.cos(car.yaw);
    const side=Math.abs(dx*Math.cos(car.yaw)-dz*Math.sin(car.yaw));
    // Approximate the chase camera's forward field, with conservative 600 m
    // visibility under fog; it does not model occlusion, meshes or HUD cover.
    if(ahead<=0||side>ahead*Math.tan(35*Math.PI/180))continue;
    nearest=Math.min(nearest,distance);
    for(const radius of [400,600,1200])if(distance<=radius&&first[String(radius)]===null)
      first[String(radius)]=+world.time.toFixed(2);
  }
}
console.log(JSON.stringify({method:'seed 0; actual shared physics; staged pose and W/coast schedule, then coast to 60 s; forward 35 degree cone, no occlusion or rendering proof',
  firstForwardSeconds:first,closestForwardMeters:Number.isFinite(nearest)?Math.round(nearest):null,
  player:{x:Math.round(car.x),z:Math.round(car.z),health:car.health},initial,spawned,
  finalAmbient:world.entities.filter(entity=>entity.id.startsWith('ambient-')).map(entity=>({id:entity.id,
    x:Math.round(entity.x),z:Math.round(entity.z),speed:+entity.speed.toFixed(1),health:entity.health,routeId:entity.routeId,
    distance:Math.round(Math.hypot(entity.x-car.x,entity.z-car.z))}))},null,2));
