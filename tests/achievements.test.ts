import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, resetPlayer, step, NEUTRAL } from '../shared/game';
import { onRoof, updateAchievements } from '../shared/achievements';
import { BUILDINGS, LANDMARKS, OVERPASS, STUNT_LOOP, STUNT_RAMP, buildingRoofHeight, terrainHeight, type SupportId } from '../shared/map';

function setup(){const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;return {world,player,car};}
function point(player:ReturnType<typeof setup>['player'],car:ReturnType<typeof setup>['car'],x:number,z:number,y:number,supportId:SupportId|null=y===0?'ground':null){
  Object.assign(car,{x,z,y,vy:supportId===null?1:0,supportId});updateAchievements(player,car,false);
}
test('Bay Hopper requires a continuous airborne crossing over water in either direction',()=>{
  for(const [start,end,direction] of [[50,310,1],[310,50,-1]] as const){
    const {player,car}=setup();point(player,car,start,60,0);
    for(let x=start+5*direction;direction*(end-x)>=0;x+=5*direction)point(player,car,x,60,10);
    assert.ok(player.achievements.unlocked.includes('bay-hopper'));
    const count=player.achievements.unlocked.length;point(player,car,end+5*direction,60,10);assert.equal(player.achievements.unlocked.length,count);
  }
});
test('a low airborne flight over the bridge is not mistaken for grounded travel',()=>{
  const {player,car}=setup();point(player,car,50,60,0);
  for(let x=55;x<=310;x+=5)point(player,car,x,60,.01,null);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));
});
test('bridge driving, island landings and teleport recovery cannot earn Bay Hopper',()=>{
  for(const interruption of ['bridge','island','recovery'] as const){
    const {world,player,car}=setup();point(player,car,50,60,0);
    for(let x=55;x<=310;x+=5){
      if(interruption==='bridge')point(player,car,x,60,0);
      else if(interruption==='island')point(player,car,x,60,x>=180&&x<=210?0:10);
      else {if(x===150){resetPlayer(world,player.id);assert.equal(player.achievements.crossing,null);assert.equal(player.achievements.groundShore,null);break;}point(player,car,x,60,10);}
    }
    assert.ok(!player.achievements.unlocked.includes('bay-hopper'),interruption);
  }
  const {player,car}=setup();point(player,car,50,60,0);point(player,car,100,60,10);point(player,car,310,60,10);
  assert.ok(!player.achievements.unlocked.includes('bay-hopper'));
});
test('Peninsula to East Bay flight is not an SF to Oakland crossing',()=>{
  const {player,car}=setup();point(player,car,0,3000,0);
  for(let x=5;x<=900;x+=5)point(player,car,x,3000,10);
  point(player,car,900,3000,0);
  assert.ok(!player.achievements.unlocked.includes('bay-hopper'));
});
test('hill, overpass, ramp and loop support do not start an airborne crossing',()=>{
  const hillX=-107,hillZ=630,hillHeight=terrainHeight(hillX,hillZ)!;
  assert.ok(hillHeight>1);
  const cases:{x:number;z:number;y:number;id:SupportId}[]=[
    {x:hillX,z:hillZ,y:hillHeight,id:'ground'},
    {x:(OVERPASS.deckStart+OVERPASS.deckEnd)/2,z:OVERPASS.z,y:OVERPASS.height,id:'overpass'},
    {x:STUNT_RAMP.end,z:STUNT_RAMP.z,y:STUNT_RAMP.height,id:'stunt-ramp'},
    {x:STUNT_LOOP.x,z:STUNT_LOOP.z,y:STUNT_LOOP.radius*2,id:'stunt-loop'},
  ];
  for(const pose of cases){
    const {player,car}=setup(),origin=pose.id==='stunt-ramp'||pose.id==='stunt-loop'?'oakland':'sf';
    player.achievements.groundShore=origin;player.achievements.crossing={origin,entityId:car.id,crossedWater:true};
    point(player,car,pose.x,pose.z,pose.y,pose.id);
    assert.equal(player.achievements.crossing,null,pose.id);
    assert.ok(!player.achievements.unlocked.includes('bay-hopper'),pose.id);
  }
});
test('roof identity distinguishes a landing from an overlapping airborne or other support',()=>{
  const {player,car}=setup(),index=BUILDINGS.findIndex(b=>b.style==='midrise'),roof=BUILDINGS[index];
  Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,vy:0,supportId:null});
  assert.equal(onRoof(car),false);updateAchievements(player,car,false);
  Object.assign(car,{supportId:'overpass'});
  assert.equal(onRoof(car),false);updateAchievements(player,car,false);
  assert.ok(!player.achievements.unlocked.includes('roof-rider'));
  Object.assign(car,{supportId:`roof:${index}`});
  const cashBefore=player.delivery.cash,incomeBefore=player.delivery.lifetimeIncome;
  assert.equal(onRoof(car),true);updateAchievements(player,car,false);updateAchievements(player,car,false);
  assert.deepEqual(player.achievements.unlocked,['roof-rider']);
  assert.equal(player.delivery.cash,cashBefore+1_000);assert.equal(player.delivery.lifetimeIncome,incomeBefore+1_000);
  player.delivery.completed=3;updateAchievements(player,car,true);
  assert.deepEqual(player.achievements.unlocked,['roof-rider','sky-delivery','deliveries-1','regular']);
  Object.assign(car,{kind:'person'});assert.equal(onRoof(car),false);
});
test('flying to an Oakland rooftop can earn both achievements',()=>{
  const {player,car}=setup(),index=BUILDINGS.findIndex(b=>b.district==='oakland'&&b.x>=330&&b.x<=420&&Math.abs(b.z-30)<=80&&b.style==='midrise'),roof=BUILDINGS[index];
  assert.ok(roof);point(player,car,50,30,0);
  for(let x=55;x<=roof.x;x+=5)point(player,car,x,30,roof.h+5);
  point(player,car,roof.x,roof.z,roof.h,`roof:${index}`);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));
  assert.ok(player.achievements.unlocked.includes('roof-rider'));
});

test('tower awards require landing on the named roof and pay once',()=>{
  for(const [style,id] of [['coit','coit-landing'],['salesforce','salesforce-landing']] as const){
    const {player,car}=setup(),index=BUILDINGS.findIndex(building=>building.style===style),tower=BUILDINGS[index];
    const cash=player.delivery.cash,income=player.delivery.lifetimeIncome;
    point(player,car,tower.x,tower.z,buildingRoofHeight(tower,tower.x,tower.z),null);
    assert.ok(!player.achievements.unlocked.includes(id));
    point(player,car,tower.x,tower.z,buildingRoofHeight(tower,tower.x,tower.z),`roof:${index}`);
    point(player,car,tower.x,tower.z,buildingRoofHeight(tower,tower.x,tower.z),`roof:${index}`);
    assert.ok(player.achievements.unlocked.includes(id));
    assert.equal(player.delivery.cash,cash+3_000);assert.equal(player.delivery.lifetimeIncome,income+3_000);
  }
});

test('Fremont and San Jose landmark visits pay once on stopped ground arrival',()=>{
  for(const [landmark,id] of [['mission-san-jose','fremont-mission'],['san-jose-city-hall','san-jose-city-hall']] as const){
    const {player,car}=setup(),place=LANDMARKS.find(item=>item.id===landmark)!;
    const cash=player.delivery.cash,income=player.delivery.lifetimeIncome;
    point(player,car,place.arrival.x,place.arrival.z,0,null);
    assert.ok(!player.achievements.unlocked.includes(id));
    point(player,car,place.arrival.x,place.arrival.z,0,'ground');
    point(player,car,place.arrival.x,place.arrival.z,0,'ground');
    assert.ok(player.achievements.unlocked.includes(id));
    assert.equal(player.delivery.cash,cash+1_000);assert.equal(player.delivery.lifetimeIncome,income+1_000);
  }
});

// Exercise the actual Roadster's air budget and motion, not just the trigger coordinates.
test('the Roadster can earn Bay Hopper with a continuous two-jump flight',()=>{
  const {world,player,car}=setup();player.delivery.cash=10_000;player.delivery.level=1;world.entities=[car];world.pickups=[];
  Object.assign(car,{x:50,z:60,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  step(world,new Map([['p',NEUTRAL]]),.05);car.speed=68;
  for(let i=0;i<100&&!player.achievements.unlocked.includes('bay-hopper');i++)
    step(world,new Map([['p',{...NEUTRAL,jump:i<24?1:2}]]),.05);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));assert.ok(car.air>0);
});


test('an immediate first-frame jump starts Bay Hopper after spawn, reset or vehicle selection',()=>{
  for(const mode of ['spawn','reset','vehicle'] as const){
    const {world,player,car:original}=setup();world.entities=[original];world.pickups=[];
    if(mode!=='spawn')step(world,new Map([['p',NEUTRAL]]),.05);
    if(mode==='reset')resetPlayer(world,player.id);
    if(mode==='vehicle')assert.ok(chooseVehicle(world,player.id,'roadster'));
    const car=world.entities.find(entity=>entity.id===player.entityId)!;
    step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);
    assert.equal(car.supportId,null,mode);
    assert.equal(player.achievements.crossing?.origin,'sf',mode);
    assert.equal(player.achievements.crossing?.entityId,car.id,mode);
  }
});

test('a first-frame two-jump flight can unlock Bay Hopper without a neutral tick',()=>{
  const {world,player,car}=setup();player.delivery.cash=10_000;player.delivery.level=1;world.entities=[car];world.pickups=[];car.x=50;car.yaw=-Math.PI/2;car.speed=68;
  for(let i=0;i<100&&!player.achievements.unlocked.includes('bay-hopper');i++)
    step(world,new Map([['p',{...NEUTRAL,jump:i<24?1:2}]]),.05);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));
});
