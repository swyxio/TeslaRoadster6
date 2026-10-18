import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, resetPlayer, step, NEUTRAL } from '../shared/game';
import { updateAchievements } from '../shared/achievements';
import { BUILDINGS } from '../shared/map';

function setup(){const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;return {world,player,car};}
function point(player:ReturnType<typeof setup>['player'],car:ReturnType<typeof setup>['car'],x:number,z:number,y:number){Object.assign(car,{x,z,y,vy:y?1:0});updateAchievements(player,car,false);}
test('Bay Hopper requires a continuous airborne crossing over water',()=>{
  const {player,car}=setup();point(player,car,50,60,0);
  for(let x=55;x<=310;x+=5)point(player,car,x,60,10);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));
  const count=player.achievements.unlocked.length;point(player,car,315,60,10);assert.equal(player.achievements.unlocked.length,count);
});
test('bridge driving, island landings and teleport recovery cannot earn Bay Hopper',()=>{
  for(const interruption of ['bridge','island','recovery'] as const){
    const {world,player,car}=setup();point(player,car,50,60,0);
    for(let x=55;x<=310;x+=5){
      if(interruption==='bridge')point(player,car,x,60,0);
      else if(interruption==='island')point(player,car,x,60,x>=180&&x<=210?0:10);
      else {if(x===150){resetPlayer(world,player.id);break;}point(player,car,x,60,10);}
    }
    assert.ok(!player.achievements.unlocked.includes('bay-hopper'),interruption);
  }
  const {player,car}=setup();point(player,car,50,60,0);point(player,car,100,60,10);point(player,car,310,60,10);
  assert.ok(!player.achievements.unlocked.includes('bay-hopper'));
});
test('roof and completed-order achievements are independent and unlock once',()=>{
  const {player,car}=setup(),roof=BUILDINGS.find(b=>b.style==='midrise')!;
  Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,vy:0});updateAchievements(player,car,false);updateAchievements(player,car,false);
  assert.deepEqual(player.achievements.unlocked,['roof-rider']);
  player.delivery.completed=3;updateAchievements(player,car,true);
  assert.deepEqual(player.achievements.unlocked,['roof-rider','sky-delivery','regular']);
});

// Exercise the actual Roadster's air budget and motion, not just the trigger coordinates.
test('the Roadster can earn Bay Hopper with a continuous two-jump flight',()=>{
  const {world,player,car}=setup();world.entities=[car];world.pickups=[];
  Object.assign(car,{x:50,z:60,y:0,yaw:-Math.PI/2,speed:0});
  step(world,new Map([['p',NEUTRAL]]),.05);car.speed=68;
  for(let i=0;i<100&&!player.achievements.unlocked.includes('bay-hopper');i++)
    step(world,new Map([['p',{...NEUTRAL,jump:i<24?1:2}]]),.05);
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));assert.ok(car.air>0);
});
