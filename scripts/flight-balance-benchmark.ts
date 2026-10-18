/**
 * Deterministic balance comparison, not a browser, network or device test.
 * Run from the checkout under test: pnpm exec tsx scripts/flight-balance-benchmark.ts
 * The input and initial states are identical across commits; output is JSON.
 */
import { createEmptyWorld, makeEntity, NEUTRAL, step, type Input } from '../shared/game';
import { type TankLevel } from '../shared/air-tank';
import { currentAt } from '../shared/sky-currents';
import { type VehicleId } from '../shared/vehicles';

type Scenario = 'hover'|'flight'|'jump'|'ground-boost'|'jet'|'thermal'|'jet-empty'|'thermal-empty'|'fall-empty';
const dt=.05, round=(n:number)=>Math.round(n*100)/100;
function measure(kind:VehicleId,level:TankLevel,economy:boolean,scenario:Scenario) {
  const current=scenario.startsWith('jet')?'jet':scenario.startsWith('thermal')?'thermal':null;
  const empty=scenario.endsWith('-empty');
  const position=current==='jet'?{x:-200,y:12,z:60}:current==='thermal'?{x:0,y:3,z:-90}:
    scenario==='flight'?{x:1000,y:100,z:3000}:{x:-300,y:scenario==='jump'||scenario==='ground-boost'?0:100,z:-1850};
  const world=createEmptyWorld(),car=makeEntity('car',kind,position.x,position.z,'p');
  car.upgrades.rocket=true;car.upgrades.economy=economy;
  Object.assign(car,{...position,tankLevel:level,air:empty?0:100,supportId:scenario==='jump'||scenario==='ground-boost'?'ground':null});
  world.entities=[car];
  const input:Input={...NEUTRAL,hover:!empty&&scenario!=='jump'&&scenario!=='ground-boost',throttle:scenario==='flight'||scenario==='ground-boost'?1:0,
    boost:scenario==='ground-boost',steer:scenario==='flight'?.3:0,jump:scenario==='jump'?1:0};
  const inputs=new Map([['p',input]]),samples=[] as {seconds:number;y:number;air:number;current:string|null}[];
  const maxSeconds=current?15:scenario==='jump'?8:240;
  let elapsed=0,path=0,peak=car.y,emptyAt:number|null=null,currentTime=0,stop='limit';
  for(let tick=1;tick<=maxSeconds/dt;tick++){
    const x=car.x,z=car.z,wasCurrent=!!currentAt(car);
    step(world,inputs,dt);elapsed=tick*dt;path+=Math.hypot(car.x-x,car.z-z);peak=Math.max(peak,car.y);
    if(wasCurrent)currentTime+=dt;
    if(!empty&&emptyAt===null&&car.air<1e-7)emptyAt=elapsed;
    if(scenario==='ground-boost'){stop='sample';break;}
    if([20,40,80,160,300].includes(tick))samples.push({seconds:round(elapsed),y:round(car.y),air:round(car.air),current:currentAt(car)?.id??null});
    if(car.supportId!==null){stop='landed';break;}
    if(!current&&scenario!=='jump'&&emptyAt!==null){stop='empty';break;}
  }
  return {kind,level,economy,scenario,stop,seconds:round(elapsed),emptyAt:emptyAt===null?null:round(emptyAt),
    peakY:round(peak),endY:round(car.y),pathMeters:round(path),displacementMeters:round(Math.hypot(car.x-position.x,car.z-position.z)),
    airRemainingPercent:round(car.air),currentSeconds:round(currentTime),samples};
}

const results=[];
for(const kind of ['roadster','tesla-semi'] as VehicleId[])
  for(const level of [1,2,3,4,5] as TankLevel[])
    for(const economy of [false,true])
      for(const scenario of ['hover','flight','jump','ground-boost','jet','thermal'] as Scenario[])
        results.push(measure(kind,level,economy,scenario));
for(const kind of ['roadster','tesla-semi'] as VehicleId[])
  for(const scenario of ['jet-empty','thermal-empty','fall-empty'] as Scenario[])
    results.push(measure(kind,1,false,scenario));
console.log(JSON.stringify({dt,description:'Controlled synthetic single-car simulation; flight path steers in a circle; current cases start inside a volume.',results},null,2));
