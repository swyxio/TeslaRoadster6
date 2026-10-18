import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, resetPlayer, step, NEUTRAL } from '../shared/game';
import { onRoof, updateAchievements } from '../shared/achievements';
import { BUILDINGS, OVERPASS, STUNT_LOOP, STUNT_RAMP, terrainHeight, type SupportId } from '../shared/map';

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
  assert.equal(onRoof(car),true);updateAchievements(player,car,false);updateAchievements(player,car,false);
  assert.deepEqual(player.achievements.unlocked,['roof-rider']);
  player.delivery.completed=3;updateAchievements(player,car,true);
  assert.deepEqual(player.achievements.unlocked,['roof-rider','sky-delivery','regular']);
  Object.assign(car,{kind:'person'});assert.equal(onRoof(car),false);
});
test('flying to an Oakland rooftop can earn both achievements',()=>{
  const {player,car}=setup(),index=BUILDINGS.findIndex(b=>b.district==='oakland'&&b.x===350&&b.z===30),roof=BUILDINGS[index];
  assert.ok(roof);point(player,car,50,30,0);
  for(let x=55;x<=roof.x;x+=5)point(player,car,x,30,roof.h+5);
  point(player,car,roof.x,roof.z,roof.h,`roof:${index}`);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));
  assert.ok(player.achievements.unlocked.includes('roof-rider'));
});

// Exercise the actual Roadster's air budget and motion, not just the trigger coordinates.
test('the Roadster can earn Bay Hopper with a continuous two-jump flight',()=>{
  const {world,player,car}=setup();world.entities=[car];world.pickups=[];
  Object.assign(car,{x:50,z:60,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  step(world,new Map([['p',NEUTRAL]]),.05);car.speed=68;
  for(let i=0;i<100&&!player.achievements.unlocked.includes('bay-hopper');i++)
    step(world,new Map([['p',{...NEUTRAL,jump:i<24?1:2}]]),.05);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));assert.ok(car.air>0);
});
