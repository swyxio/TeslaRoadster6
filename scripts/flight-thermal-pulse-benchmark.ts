/** Fixed-tick thermal pulse sweep; run from the checkout being measured. */
import {addPlayer,createWorld,NEUTRAL,step} from '../shared/game.ts';
import {currentAt} from '../shared/sky-currents.ts';
import {LEVELS} from '../shared/delivery.ts';
const round=(n:number)=>+n.toFixed(2),dt=.05,results=[];
for(const economy of [false,true])for(const periodTicks of [2,4,5,10,15,20,30,40,50,60,70,80,90,100]){
 const world=createWorld(),player=addPlayer(world,'p','Pilot'),car=world.entities.find(e=>e.id===player.entityId)!;
 player.delivery.cash=LEVELS[0].cash+2500;car.upgrades.economy=economy;
 Object.assign(car,{x:0,z:-90,y:0,yaw:0,speed:0,vx:0,vy:0,vz:0,air:100,tankLevel:1,supportId:'ground'});
 world.entities=[car];world.pickups=[];
 let counter=0,peak=0,longest=0,segment=0,segments=0,thermalSeconds=0,arrivals=0,departures=0;
 for(let i=0;i<2400;i++){
   if(i%periodTicks===0)counter++;
   if(currentAt(car)?.id==='pyramid')thermalSeconds+=dt;
   step(world,new Map([['p',{...NEUTRAL,jump:counter}]]),dt);
   peak=Math.max(peak,car.y);
   if(car.supportId===null){if(segment===0)arrivals++;segment+=dt;longest=Math.max(longest,segment);}
   else if(segment>0){segment=0;segments++;departures++;}
 }
 results.push({economy,periodSeconds:periodTicks*dt,peakM:round(peak),longestAirborneSeconds:round(longest),thermalSeconds:round(thermalSeconds),segments,arrivals,departures,end:{y:round(car.y),air:round(car.air),support:car.supportId}});
}
console.log(JSON.stringify({durationSeconds:120,results},null,2));
