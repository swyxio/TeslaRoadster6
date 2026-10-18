import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer, buyUpgrade, createWorld, interact, makeEntity, NEUTRAL, step} from '../shared/game';
import {nearbyBuildings, terrainHeight} from '../shared/map';
import {contact,body} from '../shared/physics';
import {VEHICLE_IDS, VEHICLES} from '../shared/vehicles';
import {SHOPS, UPGRADES, hasRockets} from '../shared/upgrades';
import {parseMessage} from '../worker/protocol';
import {cliffPose} from '../shared/island-stunts';
import type {TankLevel} from '../shared/air-tank';
import {Session} from '../src/session';

function setup(kind:typeof VEHICLE_IDS[number]='model-3'){
  const world=createWorld(),player=addPlayer(world,'p','P'),car=makeEntity('car',kind,SHOPS[0].x,SHOPS[0].z,'p');
  world.entities=[car];world.pickups=[];player.entityId=car.id;return {world,player,car};
}
test('fictional shops sit on clear supported ground for the largest vehicles',()=>{
  for(const shop of SHOPS){
    assert.equal(terrainHeight(shop.x,shop.z),0,shop.name);
    for(const kind of VEHICLE_IDS){const car=makeEntity('test',kind,shop.x,shop.z);assert.ok(!nearbyBuildings(car.x,car.z,12).some(b=>contact(body(car),{...b,yaw:0})),`${shop.name}: ${kind}`);}
  }
});
test('shop validates location, funds, eligibility and one-time purchases on the simulation',()=>{
  const {world,player,car}=setup();
  assert.equal(parseMessage('{"type":"upgrade","upgrade":"__proto__","requestId":1}'),null);
  assert.equal(parseMessage('{"type":"upgrade","upgrade":"rocket"}'),null);
  assert.equal(parseMessage('{"type":"upgrade","upgrade":"rocket","requestId":0}'),null);
  assert.deepEqual(parseMessage('{"type":"upgrade","upgrade":"rocket","requestId":1}'),{type:'upgrade',upgrade:'rocket',requestId:1});
  assert.equal(buyUpgrade(world,'p','rocket'),false,'no cash');
  player.delivery.cash=200;car.x+=50;assert.equal(buyUpgrade(world,'p','rocket'),false,'outside shop');car.x-=50;
  car.supportId=null;assert.equal(buyUpgrade(world,'p','rocket'),false,'airborne');car.supportId='ground';
  car.speed=2;assert.equal(buyUpgrade(world,'p','rocket'),false,'moving');car.speed=0;
  car.pushX=2;assert.equal(buyUpgrade(world,'p','rocket'),false,'sliding');car.pushX=0;
  assert.equal(buyUpgrade(world,'p','economy'),false,'rocket required');
  assert.equal(buyUpgrade(world,'p','rocket'),true);assert.equal(player.delivery.cash,200-UPGRADES.rocket.price);assert.ok(hasRockets(car));
  assert.equal(buyUpgrade(world,'p','rocket'),false,'no double charge');
  for(const id of ['economy','motor','armor'] as const){assert.equal(buyUpgrade(world,'p',id),true,id);assert.equal(buyUpgrade(world,'p',id),false,id);}
  assert.equal(player.delivery.cash,15);car.health=45;car.air=30;assert.equal(buyUpgrade(world,'p','service'),true);assert.equal(car.health,100);assert.equal(car.air,100);assert.equal(player.delivery.cash,3);
  assert.equal(buyUpgrade(world,'p','service'),false);
});
test('solo shop reports authoritative purchase and rejection results',()=>{
  const session=new Session();session.solo('model-3');
  const player=session.world.players.find(p=>p.id===session.id)!,car=session.world.entities.find(e=>e.id===player.entityId)!;
  Object.assign(car,{x:SHOPS[0].x,z:SHOPS[0].z,y:0,supportId:'ground',speed:0,pushX:0,pushZ:0,vy:0});
  player.delivery.cash=UPGRADES.rocket.price;
  const first=session.buyUpgrade('rocket');assert.deepEqual(session.upgradeResult,{requestId:first,upgrade:'rocket',ok:true});
  assert.equal(player.delivery.cash,0);assert.ok(car.upgrades.rocket);
  const second=session.buyUpgrade('rocket');assert.ok(second>first);assert.deepEqual(session.upgradeResult,{requestId:second,upgrade:'rocket',ok:false});
  player.delivery.cash=30;car.air=12;
  const third=session.buyUpgrade('tank');assert.deepEqual(session.upgradeResult,{requestId:third,upgrade:'tank',ok:true});
  assert.equal(car.tankLevel,2);assert.equal(car.air,100);assert.equal(player.delivery.cash,0);
});
test('rocket pickups sit on clear ground without overlapping other pickups',()=>{
  const world=createWorld(), rockets=world.pickups.filter(p=>p.kind==='rocket');
  assert.equal(rockets.length,11);
  for(const pickup of rockets){
    assert.equal(terrainHeight(pickup.x,pickup.z),0,pickup.id);
    const car=makeEntity('test','tesla-semi' as typeof VEHICLE_IDS[number],pickup.x,pickup.z);
    assert.ok(!nearbyBuildings(car.x,car.z,12).some(b=>contact(body(car),{...b,yaw:0})),pickup.id);
    assert.ok(world.pickups.every(other=>other===pickup||Math.hypot(pickup.x-other.x,pickup.z-other.z)>8),pickup.id);
  }
});
test('each family can collect a rocket pickup and use jump',()=>{
  for(const kind of VEHICLE_IDS){
    const {world,player,car}=setup(kind);car.x=0;car.z=60;car.y=0;world.pickups=[{id:'rocket',x:0,z:60,kind:'rocket',active:true}];
    step(world,new Map(),.05);assert.equal(world.pickups[0].active,false,kind);assert.ok(hasRockets(car),kind);
    step(world,new Map([[player.id,{...NEUTRAL,jump:1}]]),.05);assert.equal(car.supportId,null,kind);assert.ok(car.y>0,kind);assert.ok(car.air<100,kind);
  }
});
test('upgrades stay with a taken vehicle when its driver exits and returns',()=>{
  const {world,player,car}=setup('zoox');car.upgrades.rocket=true;car.upgrades.armor=true;
  interact(world,'p');assert.notEqual(player.entityId,car.id);interact(world,'p');assert.equal(player.entityId,car.id);assert.ok(car.upgrades.rocket&&car.upgrades.armor);
});
test('tank upgrades charge escalating prices, refill, and double usable flight each level',()=>{
  const {world,player,car}=setup();player.delivery.cash=1000;
  assert.equal(buyUpgrade(world,'p','tank'),false,'requires a rocket kit');
  car.upgrades.rocket=true;car.air=20;
  for(const [level,price] of [[2,30],[3,60],[4,120],[5,240]] as const){
    const before=player.delivery.cash;
    assert.equal(buyUpgrade(world,'p','tank'),true);assert.equal(car.tankLevel,level);
    assert.equal(player.delivery.cash,before-price);assert.equal(car.air,100);
  }
  assert.equal(buyUpgrade(world,'p','tank'),false,'maximum level');
  step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);assert.equal(car.air,99.25);
});
test('economy, motor and armor alter actual simulation outcomes',()=>{
  function flight(economy:boolean){const {world,car}=setup();car.upgrades.rocket=true;car.upgrades.economy=economy;step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);return car.air;}
  assert.equal(flight(true)-flight(false),3,'jump consumes 25% less air');
  function accelerate(motor:boolean){const {world,car}=setup();car.upgrades.motor=motor;step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);return car.speed;}
  assert.ok(accelerate(true)>accelerate(false)*1.2);
  function land(armor:boolean){const {world,car}=setup();car.upgrades.armor=armor;Object.assign(car,{y:.5,vy:-20,supportId:null});step(world,new Map(),.05);return 100-car.health;}
  assert.ok(Math.abs(land(true)*2-land(false))<.001,'armor halves landing damage');
});

test('an island kit remains installed and enables the shop after crossing back',()=>{
  const {world,player,car}=setup();
  world.pickups=[{id:'island-kit',x:0,z:-1160,kind:'rocket',active:true}];
  Object.assign(car,{x:0,z:-1160,y:0,supportId:'ground',air:10});
  step(world,new Map(),.05);assert.ok(car.upgrades.rocket);assert.equal(car.air,100);
  world.time+=120;Object.assign(car,{x:SHOPS[0].x,z:SHOPS[0].z,y:0,supportId:'ground',speed:0});
  player.delivery.cash=200;
  assert.equal(buyUpgrade(world,'p','rocket'),false);assert.equal(player.delivery.cash,200);
  assert.equal(buyUpgrade(world,'p','economy'),true);assert.equal(player.delivery.cash,200-UPGRADES.economy.price);
  car.supportId='ferry';assert.equal(buyUpgrade(world,'p','motor'),false);
});

test('rocket economy and sport motor affect real island-cliff physics',()=>{
  function run(motor:boolean,economy:boolean,jump:boolean,tankLevel:TankLevel=1,throttle=1){
    const {world,car}=setup(),pose=cliffPose(.4);
    car.upgrades={rocket:true,motor,economy,armor:false};
    Object.assign(car,{x:pose.point.x,y:pose.point.y,z:pose.point.z,yaw:-Math.PI/2,pitch:.4,
      supportId:'island-cliff',loopAngle:.4,speed:20,vx:pose.tangent.x*20,vy:pose.tangent.y*20,vz:0,tankLevel});
    step(world,new Map([['p',{...NEUTRAL,throttle,jump:jump?1:0}]]),.05);
    return car;
  }
  assert.ok(run(true,false,false).speed>run(false,false,false).speed);
  const jumpOnly=run(false,false,true,1,0),normal=run(false,false,true),economy=run(false,true,true);
  const normalUse=100-normal.air,economyUse=100-economy.air;
  assert.equal(jumpOnly.supportId,null);
  assert.equal(jumpOnly.air,88,'the level-1 tank spends 12% on the jump');
  assert.ok(normalUse>100-jumpOnly.air,'throttle consumes additional air after detaching');
  assert.ok(Math.abs(economyUse-normalUse*.75)<1e-9,'efficient nozzles reduce both costs by 25%');
  const largerTankUse=100-run(false,false,true,3).air;
  assert.ok(Math.abs(largerTankUse*4-normalUse)<1e-9,'level 3 has four times the level-1 capacity');
});
