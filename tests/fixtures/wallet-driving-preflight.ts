// Cheap pure-simulation route validation for the isolated wallet fixture.
// This checks geometry/control behavior; it does not measure room throughput.
import assert from 'node:assert/strict';
import {addPlayer,createWorld,NEUTRAL,step} from '../../shared/game';
import {terrainHeight} from '../../shared/map';
import {walletRouteBlocks,walletRouteSustained,walletRouteThrottle} from './wallet-driving-route';

const world=createWorld(0),players=Array.from({length:5},(_,i)=>addPlayer(world,`preflight-${i}`,`Preflight${i}`));
const cars=players.map((player,i)=>{
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const x=-300+i*12,z=-2050;
  Object.assign(car,{x,z,y:terrainHeight(x,z)??0,yaw:Math.PI,pitch:0,roll:0,vx:0,vy:0,vz:0,
    speed:0,pitchRate:0,yawRate:0,rollRate:0,pushX:0,pushZ:0,steering:0,air:100,health:100,thrusters:0,supportId:'ground',autopilot:false,navigation:null});
  return car;
});
world.time=12.5;
const samples=cars.map(()=>[] as {atMs:number;poseRevision:number;vehicle:{id:string;x:number;z:number;speed:number}}[]);
let observed=cars.map(car=>car.speed);
for(let tick=0;tick<1200;tick++){
  const inputs=new Map(players.map((player,i)=>[player.id,{...NEUTRAL,throttle:walletRouteThrottle(observed[i])}]));
  step(world,inputs,.05);
  if(tick%2===1){
    observed=cars.map(car=>car.speed);
    for(const [i,car] of cars.entries())samples[i].push({atMs:(tick+1)*50-1,poseRevision:1,vehicle:{id:car.id,x:car.x,z:car.z,speed:car.speed}});
  }
}
const blocks=walletRouteBlocks(samples);
console.log(JSON.stringify({fixture:'seed-0, five staged Roadsters, 10 Hz authoritative speed feedback',blocks,final:cars.map(({x,z,speed,health})=>({x,z,speed,health}))},null,2));
assert.ok(walletRouteSustained(blocks),'each of five cars must move at least 75 m with >5 m/s in 80% of snapshots in every 10-second block');
