import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAchievementEvidence } from '../shared/achievement-evidence';
import { DOME } from '../shared/dome';
import { addPlayer, createEmptyWorld, makeEntity, removePlayer } from '../shared/game';
import { DOME_CHAMPION_AIR, DOME_PULSE_COOLDOWN, initialSoccer, pulseShotRemaining, stepSoccer } from '../shared/soccer';

const touches={roadster:false,retrofit:false,stock:true};
const goals={roadster:0,retrofit:0,stock:1};

test('completing a touched match unlocks Pulse Shot and a credited win unlocks Champion Charge',()=>{
  const ids=(won:boolean,hit=touches,scored=goals)=>evaluateAchievementEvidence([],{kind:'dome',touches:hit,goals:scored,won}).map(item=>item.id);
  assert.ok(ids(false).includes('dome-debut'));
  assert.ok(!ids(false).includes('dome-champion'));
  assert.ok(ids(true).includes('dome-champion'));
  assert.ok(!ids(true,{roadster:false,retrofit:false,stock:false}).includes('dome-debut'));
  assert.ok(!ids(true,touches,{roadster:0,retrofit:0,stock:0}).includes('dome-champion'));
  assert.deepEqual(evaluateAchievementEvidence(['dome-debut','dome-champion','no-rockets-needed'],{kind:'dome',touches,goals,won:true}),[]);
});

test('Pulse Shot strengthens a real car hit, cools down, and is capped',()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=makeEntity('striker','model-3',DOME.x-3.8,DOME.z,player.id);
  Object.assign(car,{y:0,vx:30,vy:0,vz:0,yaw:-Math.PI/2,inDome:true});
  const shoot=(state:ReturnType<typeof initialSoccer>,time:number)=>{
    Object.assign(state.ball,{x:DOME.x,y:DOME.ballRadius,z:DOME.z,vx:0,vy:0,vz:0});
    stepSoccer(state,[car],.05,time,[player]);
    return state.ball.vx;
  };
  const state=initialSoccer(),plain=shoot(state,1);
  assert.ok(plain>0,'the car physically struck the ball');
  assert.equal(state.pulseShots.length,0,'locked Pulse Shot cannot activate');
  player.achievements.unlocked.push('dome-debut');
  const boosted=shoot(state,2);
  assert.ok(boosted>plain+15,`the unlocked hit is stronger (${boosted} vs ${plain})`);
  assert.equal(pulseShotRemaining(state,player.id,2),DOME_PULSE_COOLDOWN);
  assert.ok(Math.abs(shoot(state,3)-plain)<1e-6,'a second hit during cooldown is ordinary');
  assert.ok(shoot(state,2+DOME_PULSE_COOLDOWN)>plain+15,'Pulse Shot recharges using simulation time');
  car.vx=400;
  Object.assign(car,{x:DOME.x+5});
  shoot(state,2+2*DOME_PULSE_COOLDOWN);
  assert.ok(Math.hypot(state.ball.vx,state.ball.vy,state.ball.vz)<=120+1e-6,'power cannot bypass the ball speed limit');
  world.soccer=state;removePlayer(world,player.id);
  assert.deepEqual(state.pulseShots,[],'departed drivers do not leave cooldown state behind');
});

test('Pulse Shot waits for identity attachment without consuming its cooldown',()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=makeEntity('striker','model-3',DOME.x-3.8,DOME.z,player.id);
  Object.assign(car,{y:0,vx:30,vy:0,vz:0,yaw:-Math.PI/2,inDome:true});
  const state=initialSoccer();
  const shoot=(time:number,canCollect:(id:string)=>boolean)=>{
    Object.assign(state.ball,{x:DOME.x,y:DOME.ballRadius,z:DOME.z,vx:0,vy:0,vz:0});
    stepSoccer(state,[car],.05,time,[player],canCollect);
    return state.ball.vx;
  };
  const ordinary=shoot(1,()=>true);
  player.achievements.unlocked.push('dome-debut');
  const pending=shoot(2,id=>{assert.equal(id,player.id);return false;});
  assert.ok(Math.abs(pending-ordinary)<1e-6,'pending identity still gets an ordinary physical hit');
  assert.ok(state.participants.some(participant=>participant.playerId===player.id),'the contact remains recorded');
  assert.equal(state.pulseShots.length,0,'pending identity cannot consume a Pulse Shot');
  assert.ok(shoot(3,()=>true)>ordinary+15,'the shot is available after identity attachment');
  assert.equal(pulseShotRemaining(state,player.id,3),DOME_PULSE_COOLDOWN);
});

test('Champion Charge applies only to a present rocket-equipped credited scorer and caps air',()=>{
  for(const [unlocked,kind,retrofit,present,start,expected,allow] of [
    [false,'roadster',false,true,10,10,true],
    [true,'roadster',false,true,10,10+DOME_CHAMPION_AIR,true],
    [true,'model-3',true,true,90,100,true],
    [true,'model-3',false,true,10,10,true],
    [true,'roadster',false,false,10,10,true],
    [true,'roadster',false,true,10,10,false],
  ] as const){
    const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
    if(unlocked)player.achievements.unlocked.push('dome-champion');
    const car=makeEntity('scorer',kind,DOME.x-30,DOME.z,player.id);
    car.inDome=present;car.air=start;car.upgrades.rocket=retrofit;
    const state=initialSoccer();state.participants.push({playerId:player.id,touches,goals:{roadster:0,retrofit:0,stock:0}});
    state.lastTouch={playerId:player.id,carClass:'stock'};
    Object.assign(state.ball,{x:DOME.x+DOME.halfLength-2,y:3,z:DOME.z,vx:90,vy:0,vz:0});
    stepSoccer(state,[car],.05,10,[player],allow===false?()=>false:undefined);
    assert.equal(state.phase,'goal');
    assert.equal(car.air,expected,`${unlocked}/${kind}/${retrofit}/${present}`);
    stepSoccer(state,[car],.05,10.05,[player]);
    assert.equal(car.air,expected,'a goal display cannot charge twice');
  }
});
