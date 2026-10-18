import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,NEUTRAL,step,toggleAutopilot} from '../shared/game';
import {BRIDGES,BUILDINGS,isLand,isSurface,nearbyBuildings} from '../shared/map';
import {STATIONS} from '../shared/stations';
import {body,contact} from '../shared/physics';

function drive(x:number,z:number,yaw:number,goal:(x:number,z:number)=>boolean){
 const world=createWorld(),player=addPlayer(world,'crossing','Crossing');
 const car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];Object.assign(car,{x,z,yaw});
 for(let i=0;i<650&&!goal(car.x,car.z);i++)step(world,new Map([['crossing',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(goal(car.x,car.z),`crossing stopped at ${car.x.toFixed(1)}, ${car.z.toFixed(1)}`);
}
test('both bridges traverse water and connect the correct shores',()=>{
 assert.equal(BRIDGES.length,2);
 assert.ok(isLand(60,60)&&isLand(340,60)&&!isLand(120,60)&&isSurface(120,60));
 assert.ok(isLand(-240,-250)&&isLand(-240,-430)&&!isLand(-240,-345)&&isSurface(-240,-345));
 drive(45,60,-Math.PI/2,(x)=>x>340);
 drive(-240,-220,0,(_,z)=>z< -430);
});
test('shore blocks grounded cars while water landings recover to a safe surface',()=>{
 const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];Object.assign(car,{x:80,z:0,yaw:-Math.PI/2,speed:10});
 for(let i=0;i<60;i++)step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(isLand(car.x,car.z));assert.ok(car.x<100);
 Object.assign(car,{x:130,z:-20,y:.1,vy:-5,speed:0});
 step(world,new Map(),.05);assert.ok(isSurface(car.x,car.z));assert.equal(car.y,0);
});
test('parked vehicles and stations begin on land outside collision buildings',()=>{
 const world=createWorld();
 for(const e of world.entities.filter(e=>e.id.startsWith('parked-'))){
  assert.ok(isSurface(e.x,e.z),e.id);
  assert.ok(!nearbyBuildings(e.x,e.z,10).some(b=>contact(body(e),{...b,yaw:0})),e.id);
 }
 for(const station of STATIONS)assert.ok(isLand(station.x,station.z),station.id);
 assert.ok(BUILDINGS.length>100);
});

test('autopilot can cross the Bay and return without teleporting',()=>{
 const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];assert.ok(toggleAutopilot(world,'p'));let furthest=car.x;
 for(let i=0;i<2400;i++){const x=car.x,z=car.z;step(world,new Map(),.05);assert.ok(Math.hypot(car.x-x,car.z-z)<2);furthest=Math.max(furthest,car.x);}
 assert.ok(furthest>330);assert.ok(car.x<100);assert.equal(car.autopilot,true);
});
