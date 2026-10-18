import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,interact,makeEntity,NEUTRAL,removePlayer,resetPlayer,step,type World} from '../shared/game';
import {FERRY_DOCKS,isRocketIsland,terrainHeight} from '../shared/map';
import {FERRY_DECK,FERRY_TRAVEL_SECONDS,updateFerry,whollyOnFerry} from '../shared/ferry';
import {body,contact} from '../shared/physics';
import {VEHICLE_IDS} from '../shared/vehicles';
import {ScheduledInput} from '../shared/tick-input';

function setup(){
  const world=createWorld();world.entities=[];world.players=[];world.pickups=[];
  const player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  return {world,player,car};
}
function advance(world:World,seconds:number,input=NEUTRAL){
  for(let i=0;i<Math.ceil(seconds/.05);i++)step(world,new Map([['p',input]]),.05);
}

test('cars drive from the SF pier onto the actual ferry deck',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:-235,y:0,yaw:0,speed:0,supportId:'ground'});
  for(let i=0;i<160&&car.z>-263;i++)advance(world,.05,{...NEUTRAL,throttle:.5});
  assert.equal(car.supportId,'ferry');assert.ok(car.z<-255&&car.z>-293);
});

test('a driver boards, waits for the scheduled crossing, and drives onto the island',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:-235,y:0,yaw:0,speed:0,supportId:'ground'});
  for(let i=0;i<200&&car.z>-266;i++)advance(world,.05,{...NEUTRAL,throttle:.35});
  for(let i=0;i<100&&Math.abs(car.speed)>.1;i++)advance(world,.05,{...NEUTRAL,brake:true});
  assert.equal(car.supportId,'ferry');assert.ok(whollyOnFerry(world.ferry,car));
  for(let i=0;i<800&&world.ferry.phase==='sf';i++)advance(world,.05);
  assert.equal(world.ferry.phase,'to-island');assert.ok(world.ferry.passengers.some(p=>p.entityId===car.id));
  for(let i=0;i<1100&&world.ferry.phase==='to-island';i++)advance(world,.05);
  assert.equal(world.ferry.phase,'island');assert.equal(car.supportId,'ferry');
  for(let i=0;i<180&&car.supportId==='ferry';i++)advance(world,.05,{...NEUTRAL,throttle:.35});
  assert.equal(car.supportId,'ground');assert.ok(isRocketIsland(car.x,car.z));
});

test('every fleet footprint fits a ferry space without registry changes',()=>{
  const {world}=setup();
  for(const kind of VEHICLE_IDS){
    const car=makeEntity(kind,kind,3.5,world.ferry.z);car.yaw=0;
    assert.ok(whollyOnFerry(world.ferry,car),kind);
  }
});

test('the shared ferry transports secured riders, permits exit, and returns',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:world.ferry.z,y:0,yaw:0,supportId:'ferry',speed:0,air:41,health:83});world.ferry.remaining=.05;
  advance(world,.1);assert.equal(world.ferry.phase,'to-island');
  const offset=car.z-world.ferry.z;
  advance(world,3,{...NEUTRAL,throttle:1,jump:1});
  assert.equal(car.supportId,'ferry');assert.ok(Math.abs(car.z-world.ferry.z-offset)<1e-7);assert.equal(car.air,41);
  interact(world,'p');assert.equal(world.players[0].entityId,car.id);
  advance(world,FERRY_TRAVEL_SECONDS);assert.equal(world.ferry.phase,'island');
  assert.equal(car.supportId,'ferry');assert.equal(car.health,83);assert.equal(car.air,41);
  for(let i=0;i<180&&car.supportId==='ferry';i++)advance(world,.05,{...NEUTRAL,throttle:.5});
  assert.equal(car.supportId,'ground');assert.ok(isRocketIsland(car.x,car.z));
  advance(world,31);assert.equal(world.ferry.phase,'to-sf');
  advance(world,FERRY_TRAVEL_SECONDS);assert.equal(world.ferry.phase,'sf');
});

test('a jump processed while secured does not fire after disembarking',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry'});world.ferry.remaining=.05;
  advance(world,.1);assert.equal(world.ferry.phase,'to-island');
  const controls=new ScheduledInput(NEUTRAL);
  controls.receive({seq:1,targetTick:1,controlRevision:0,input:{...NEUTRAL,jump:1}},0,0);
  step(world,new Map([['p',controls.advance(1,50).input]]),.05);
  assert.equal(car.lastJump,1);assert.equal(car.supportId,'ferry');
  world.ferry.passengers=[];
  Object.assign(car,{x:0,z:-235,y:terrainHeight(0,-235)??0,supportId:'ground',vx:0,vy:0,vz:0,speed:0});
  step(world,new Map([['p',controls.advance(2,100).input]]),.05);
  assert.equal(car.lastJump,1);assert.equal(car.supportId,'ground');assert.equal(car.vy,0);
});

test('reset and disconnect detach occupants without losing resources or leaving stale manifest entries',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry',health:62,air:37});world.ferry.remaining=0;
  advance(world,.1);assert.equal(world.ferry.passengers.length,1);
  resetPlayer(world,'p');assert.equal(world.ferry.passengers.length,0);assert.equal(car.health,62);assert.equal(car.air,37);assert.equal(car.supportId,'ground');assert.notEqual(terrainHeight(car.x,car.z),null);
  Object.assign(car,{x:world.ferry.x,z:world.ferry.z,y:0,supportId:'ferry'});
  world.ferry.passengers=[{entityId:car.id,x:0,z:0}];removePlayer(world,'p');
  assert.equal(world.ferry.passengers.length,0);assert.equal(world.entities.some(e=>e.id===car.id),false);
});

test('blocked arrivals and unsafe boarding hold the ferry instead of overlapping or departing',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry'});
  world.ferry.arrivals=[car.id];world.ferry.remaining=12;
  updateFerry(world,.05,()=>false);assert.equal(world.ferry.blocked,'apron');assert.equal(world.ferry.remaining,12);
  world.ferry.arrivals=[];world.ferry.remaining=0;car.x=6;
  updateFerry(world,.05,()=>true);assert.equal(world.ferry.blocked,'ramp');assert.equal(world.ferry.phase,'sf');
});

test('forced apron relocation reports the affected driver',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry'});
  world.ferry.arrivals=[car.id];world.ferry.remaining=12;
  const relocated:string[]=[];step(world,new Map(),.05,{onRelocation:id=>relocated.push(id)});
  assert.deepEqual(relocated,['p']);assert.equal(car.supportId,'ground');
});

test('a shore-supported vehicle straddling either dock holds departure until it clears',()=>{
  for(const side of ['sf','island'] as const){
    const {world,car}=setup();
    Object.assign(world.ferry,{phase:side,z:FERRY_DOCKS[side].deckZ,remaining:0});
    const z=FERRY_DOCKS[side].z+(side==='sf'?2:-2);
    Object.assign(car,{x:0,z,y:0,yaw:0,speed:0,supportId:'ground'});
    updateFerry(world,.05,()=>true);
    assert.equal(world.ferry.phase,side);assert.equal(world.ferry.blocked,'ramp');
    car.z+=side==='sf'?8:-8;
    updateFerry(world,.05,()=>true);
    assert.equal(world.ferry.phase,side==='sf'?'to-island':'to-sf');assert.equal(world.ferry.blocked,null);
  }
});

test('an arriving rider who exits a car on deck is relocated with the car before departure',()=>{
  const {world,player,car}=setup();
  Object.assign(world.ferry,{phase:'island',z:FERRY_DOCKS.island.deckZ,remaining:11.99,arrivals:[car.id]});
  Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry',speed:0});
  interact(world,'p');const person=world.entities.find(e=>e.id===player.entityId)!;
  assert.equal(person.kind,'person');assert.ok(world.ferry.arrivals.includes(person.id));
  advance(world,.05);
  assert.equal(car.supportId,'ground');assert.equal(person.supportId,'ground');assert.deepEqual(world.ferry.arrivals,[]);
  assert.ok(isRocketIsland(person.x,person.z));
});

test('an arriving pedestrian entering a deck car transfers their pending arrival',()=>{
  const {world,player,car}=setup();
  Object.assign(world.ferry,{phase:'island',z:FERRY_DOCKS.island.deckZ,remaining:11.99,arrivals:[car.id]});
  Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry',speed:0});
  interact(world,'p');const personId=player.entityId;
  interact(world,'p');assert.equal(player.entityId,car.id);
  assert.equal(world.ferry.arrivals.includes(personId),false);assert.deepEqual(world.ferry.arrivals,[car.id]);
  advance(world,.05);assert.equal(car.supportId,'ground');assert.deepEqual(world.ferry.arrivals,[]);
});

test('a full deck leaves the seventh car on shore and can still depart',()=>{
  const {world,car}=setup();
  for(const x of [-3.5,3.5])for(const offset of [-11,0,11]){
    const occupant=makeEntity(`parked-${x}-${offset}`,'waymo-firefly',x,world.ferry.z+offset);
    occupant.supportId='ferry';world.entities.push(occupant);
  }
  Object.assign(car,{x:0,z:-245,y:0,yaw:0,speed:7,supportId:'ground'});
  for(let i=0;i<80;i++)advance(world,.05,{...NEUTRAL,throttle:.5});
  assert.equal(car.supportId,'ground');assert.ok(car.z>=FERRY_DOCKS.sf.z);
  assert.equal(contact(body(car),{x:world.ferry.x,z:world.ferry.z,w:FERRY_DECK.width,d:FERRY_DECK.length,yaw:0}),null);
  world.ferry.remaining=0;advance(world,.1);assert.equal(world.ferry.phase,'to-island');assert.equal(world.ferry.passengers.length,6);
});

test('a car landing across a full ferry seam can withdraw but cannot drive aboard',()=>{
  for(const side of ['sf','island'] as const)for(const exit of ['reverse','sideways'] as const){
    const {world,car}=setup(),dock=FERRY_DOCKS[side],shore=side==='sf'?1:-1;
    Object.assign(world.ferry,{phase:side,z:dock.deckZ,remaining:30});
    for(const x of [-3.5,3.5])for(const offset of [-11,0,11]){
      const occupant=makeEntity(`parked-${x}-${offset}`,'waymo-firefly',x,world.ferry.z+offset);
      occupant.supportId='ferry';world.entities.push(occupant);
    }
    const deck={x:world.ferry.x,z:world.ferry.z,w:FERRY_DECK.width,d:FERRY_DECK.length,yaw:0};
    Object.assign(car,{x:0,z:dock.z+shore,y:.1,vy:-5,yaw:side==='sf'?0:Math.PI,speed:0,supportId:null});
    advance(world,.05);
    assert.equal(car.supportId,'ground');assert.ok(contact(body(car),deck),'the landing straddles the seam');
    world.ferry.remaining=0;advance(world,.05);
    assert.equal(world.ferry.phase,side);assert.equal(world.ferry.blocked,'ramp');
    const landed=car.z;
    advance(world,.5,{...NEUTRAL,throttle:1});
    assert.ok(shore*(car.z-landed)>=-1e-6,'driving toward the full deck is blocked');
    assert.equal(car.supportId,'ground');assert.equal(world.ferry.phase,side);
    if(exit==='sideways')car.yaw=-Math.PI/2;
    advance(world,2,{...NEUTRAL,throttle:exit==='reverse'?-1:1});
    if(exit==='reverse')assert.ok(shore*(car.z-landed)>2,'reverse moves the car back onto the pier');
    else assert.ok(car.x>7,'the car can also leave sideways');
    assert.equal(contact(body(car),deck),null);
    advance(world,.05);
    assert.equal(world.ferry.phase,side==='sf'?'to-island':'to-sf');
    assert.equal(world.ferry.passengers.length,6);
  }
});

test('delivery order pauses on the island and the ferry while active time continues',()=>{
  const {world,player,car}=setup();Object.assign(car,{x:0,z:-1140,y:0,supportId:'ground'});
  const input={...NEUTRAL,steer:1};advance(world,2,input);
  assert.equal(player.delivery.order.elapsed,0);assert.ok(player.delivery.activeSeconds>1);
  Object.assign(car,{x:0,z:world.ferry.z,y:0,supportId:'ferry'});advance(world,1,input);
  assert.equal(player.delivery.order.elapsed,0);
  Object.assign(car,{x:0,z:-180,y:0,supportId:'ground'});advance(world,1,input);
  assert.ok(player.delivery.order.elapsed>.5);
});
