/**
 * Deterministic, untimed gameplay observation (not a capacity or FPS test).
 * Run with: pnpm exec tsx tests/highway-density-observation.ts /path/to/baseline [candidate]
 * Both paths must contain compatible shared/game.ts and shared/traffic.ts.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

type GameModule=typeof import('../shared/game');
type TrafficModule=typeof import('../shared/traffic');
const baseline=process.argv[2],candidate=process.argv[3]??process.cwd();
if(!baseline)throw new Error('Supply a baseline checkout followed by an optional candidate checkout');

async function observe(root:string){
  const game=await import(pathToFileURL(resolve(root,'shared/game.ts')).href) as GameModule;
  const traffic=await import(pathToFileURL(resolve(root,'shared/traffic.ts')).href) as TrafficModule;
  const results=[];
  for(const [direction,z] of [[0,1500],[1,3500],[0,6100],[1,7800]] as const){
    const world=game.createWorld(0),player=game.addPlayer(world,'observer','Observer');
    const car=world.entities.find(entity=>entity.id===player.entityId)!;
    const routeId=traffic.HIGHWAY_ROUTE_IDS[direction],route=traffic.ROUTES[routeId];
    const index=route.findIndex((a,i)=>{
      const b=route[(i+1)%route.length];
      return Math.abs(b.z-a.z)>20&&z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z);
    });
    if(index<0)throw new Error(`No highway segment for ${direction}, ${z}`);
    const a=route[index],b=route[(index+1)%route.length],t=(z-a.z)/(b.z-a.z);
    Object.assign(car,{x:a.x+(b.x-a.x)*t,z,y:0,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),
      npc:false,autopilot:true,routeId,waypoint:(index+1)%route.length,speed:15,supportId:'ground'});
    // The full highway loop crosses the Level 6 San Jose checkpoint.
    player.delivery.cash=2_000_000;player.delivery.level=6;
    world.time=240; // 08:00 in the game's accelerated day.
    const nearby=new Set<string>(),close=new Set<string>(),controls=new Map();
    let samples=0,nearbyCount=0,nearbySeconds=0,nearest=Infinity,distance=0;
    for(let tick=0;tick<240*20;tick++){
      const old={x:car.x,z:car.z};game.step(world,controls,.05);
      distance+=Math.hypot(car.x-old.x,car.z-old.z);
      if(tick%20!==0)continue;
      const cars=world.entities.filter(entity=>entity.id.startsWith('ambient-')&&!entity.driver);
      let count=0;
      for(const other of cars){
        const gap=Math.hypot(other.x-car.x,other.z-car.z);
        if(gap<=1200){nearby.add(other.id);nearest=Math.min(nearest,gap);count++;}
        if(gap<=400)close.add(other.id);
      }
      samples++;nearbyCount+=count;if(count)nearbySeconds++;
    }
    results.push({direction,z,simulatedSeconds:world.time-240,distanceMeters:Math.round(distance),
      meanCarsWithin1200m:+(nearbyCount/samples).toFixed(2),secondsWithCarWithin1200m:nearbySeconds,
      distinctCarsWithin1200m:nearby.size,distinctCarsWithin400m:close.size,
      nearestMeters:Number.isFinite(nearest)?Math.round(nearest):null,
      health:car.health,end:{x:Math.round(car.x),z:Math.round(car.z)}});
  }
  return results;
}

console.log(JSON.stringify({method:'240 simulation seconds per start; same seed and autonomous inputs; proximity sampled at 1 Hz, without visibility or occlusion checks; no performance timing',
  baseline:await observe(baseline),candidate:await observe(candidate)},null,2));
