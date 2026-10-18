import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, makeEntity, removePlayer, type Entity, type World } from '../shared/game';
import { initialDelivery } from '../shared/delivery';
import { initialAchievements, updateGameAchievements } from '../shared/achievements';
import { VEHICLE_IDS } from '../shared/vehicles';
import {
  createRace, joinRace, leaveRace, playerRace, startRace, updateRace,
  RACE_COUNTDOWN, RACE_DURATION, RACE_LOBBY_WAIT, RACE_RESULTS_DURATION,
  type RaceCourse, type RaceState,
} from '../shared/race';

const course:RaceCourse={id:'short',start:{x:0,y:0,z:5,radius:50},gates:[
  {id:'one',x:0,z:0,yaw:0,width:10,minY:0,maxY:8},
  {id:'two',x:0,z:-10,yaw:0,width:10,minY:0,maxY:8},
  {id:'finish',x:0,z:-20,yaw:0,width:10,minY:0,maxY:8},
]};
function world():World {const w=createWorld();w.entities=[];w.players=[];w.pickups=[];return w;}
function add(w:World,id:string,kind:Entity['kind']='roadster'):Entity {
  const car=makeEntity(`car-${id}`,kind,0,5,id);Object.assign(car,{y:0,supportId:'ground'});
  w.entities.push(car);w.players.push({id,name:id,entityId:car.id,delivery:initialDelivery(car),achievements:initialAchievements(),cockpit:{active:false,activeSeconds:0,deliveries:0,orderEligible:true,orderSeconds:0}});
  return car;
}
function tick(state:RaceState,w:World,dt:number):void {w.time+=dt;updateRace(state,[course],w,dt);}
function start(state:RaceState,w:World,id:string):void {
  assert.equal(joinRace(state,course,w,id),true);assert.equal(startRace(state,course.id,w,id),true);
  tick(state,w,RACE_COUNTDOWN);assert.equal(state.rounds[0].phase,'active');
}

test('lobby, solo start and countdown are simulation-timed and bounded',()=>{
  const w=world(),state=createRace();
  for(const id of ['a','b','c','d','e','f','g','h']){add(w,id);assert.equal(joinRace(state,course,w,id),true);}
  add(w,'ninth');assert.equal(joinRace(state,course,w,'ninth'),false);
  assert.equal(joinRace(state,course,w,'a'),false);
  assert.equal(startRace(state,course.id,w,'b'),false);
  assert.equal(startRace(state,course.id,w,'a'),true);
  assert.equal(state.rounds[0].phase,'countdown');assert.equal(state.rounds[0].startedAt,3);
  assert.equal(state.rounds[0].starterCount,0,'starters are not fixed before green');
  assert.equal(joinRace(state,course,w,'ninth'),false,'no late entry');
  tick(state,w,RACE_COUNTDOWN);assert.equal(state.rounds[0].phase,'active');assert.equal(state.rounds[0].endsAt,3+RACE_DURATION);assert.equal(state.rounds[0].starterCount,8);
  const solo=world(),soloState=createRace();add(solo,'solo');start(soloState,solo,'solo');
  assert.equal(soloState.rounds[0].entrants.length,1);
  const auto=world(),autoState=createRace();add(auto,'auto');joinRace(autoState,course,auto,'auto');
  tick(autoState,auto,RACE_LOBBY_WAIT);assert.equal(autoState.rounds[0].phase,'countdown');
  tick(autoState,auto,RACE_COUNTDOWN);assert.equal(autoState.rounds[0].phase,'active');
});

test('all vehicle families can join, but people, distant cars and empty courses cannot',()=>{
  for(const kind of VEHICLE_IDS){
    const w=world(),state=createRace();add(w,kind,kind);assert.equal(joinRace(state,course,w,kind),true,kind);
  }
  const w=world(),state=createRace(),person=add(w,'p','person');
  assert.equal(joinRace(state,course,w,'p'),false);
  person.kind='roadster';person.x=1000;assert.equal(joinRace(state,course,w,'p'),false);
  person.x=0;person.driver=null;assert.equal(joinRace(state,course,w,'p'),false);
  person.driver='p';assert.equal(joinRace(state,{...course,gates:[]},w,'p'),false);
});

test('swept gates prevent tunneling and can cross several checkpoints in one fast segment',()=>{
  const w=world(),state=createRace(),car=add(w,'p');start(state,w,'p');
  car.z=-25;tick(state,w,1);
  const round=state.rounds[0],entrant=round.entrants[0];
  assert.equal(round.phase,'results');assert.equal(entrant.nextGate,3);assert.equal(entrant.status,'finished');
  assert.ok(Math.abs(entrant.elapsed!-25/30)<1e-9,'time is interpolated at the finish plane');
  assert.equal(entrant.rank,1);const finishedAt=entrant.finishedAt;tick(state,w,1);assert.equal(entrant.finishedAt,finishedAt);
});

test('checkpoints enforce width, altitude, order, wrong-way and missed-gate feedback',()=>{
  const w=world(),state=createRace(),car=add(w,'p');start(state,w,'p');
  const entrant=state.rounds[0].entrants[0];
  car.x=20;car.z=-5;tick(state,w,1);assert.equal(entrant.nextGate,0,'outside gate width');
  car.x=0;tick(state,w,1);car.z=-15;tick(state,w,1);assert.equal(entrant.nextGate,0);assert.equal(entrant.feedback,'missed-gate');
  car.z=5;tick(state,w,1);assert.equal(entrant.nextGate,0);assert.equal(entrant.feedback,'wrong-way');
  car.y=20;car.z=-5;tick(state,w,1);assert.equal(entrant.nextGate,0,'crossing too high cannot count');
  car.z=5;car.y=0;tick(state,w,1);
  car.z=-5;tick(state,w,1);assert.equal(entrant.nextGate,1);assert.equal(entrant.feedback,null);
  car.z=-9;tick(state,w,1);assert.equal(entrant.nextGate,1,'approaching a gate is not crossing');
  car.z=-15;tick(state,w,1);assert.equal(entrant.nextGate,2);
  car.z=-25;tick(state,w,1);assert.equal(entrant.status,'finished');
});

test('movement before green cannot award a checkpoint, including a crossing during the final tick',()=>{
  const w=world(),state=createRace(),car=add(w,'p');
  joinRace(state,course,w,'p');startRace(state,course.id,w,'p');
  tick(state,w,2.5);car.z=-10;tick(state,w,1);
  const entrant=state.rounds[0].entrants[0];assert.equal(entrant.nextGate,0);
  car.z=5;tick(state,w,1);car.z=-5;tick(state,w,1);assert.equal(entrant.nextGate,1);
  const later=world(),laterState=createRace(),laterCar=add(later,'later');
  joinRace(laterState,course,later,'later');startRace(laterState,course.id,later,'later');
  tick(laterState,later,2.5);laterCar.z=-3;tick(laterState,later,1);
  assert.equal(laterState.rounds[0].entrants[0].nextGate,1,'crossing after green in the same tick counts');
});

test('simultaneous finishes rank deterministically by ID without modifying physical cars',()=>{
  for(const reverse of [false,true]){
    const w=world(),state=createRace(),z=add(w,'z'),a=add(w,'a');
    joinRace(state,course,w,'z');joinRace(state,course,w,'a');startRace(state,course.id,w,'z');tick(state,w,3);
    z.z=-25;a.z=-25;if(reverse)w.entities.reverse();
    const physical=JSON.stringify(w.entities);tick(state,w,1);assert.equal(JSON.stringify(w.entities),physical);
    const entrants=state.rounds[0].entrants;
    assert.equal(entrants.find(e=>e.playerId==='a')!.rank,1);assert.equal(entrants.find(e=>e.playerId==='z')!.rank,2);
    assert.equal(entrants.find(e=>e.playerId==='a')!.elapsed,entrants.find(e=>e.playerId==='z')!.elapsed);
    w.races=state;
    for(const player of w.players)updateGameAchievements(w,player);
    assert.ok(w.players.find(player=>player.id==='a')!.achievements.unlocked.includes('race-winner'));
    assert.ok(!w.players.find(player=>player.id==='z')!.achievements.unlocked.includes('race-winner'));
  }
});

test('First Across uses drivers at green and counts an opponent who disconnects',()=>{
  const w=world(),state=createRace(),a=add(w,'a');add(w,'b');add(w,'c');w.races=state;
  for(const id of ['a','b','c'])assert.equal(joinRace(state,course,w,id),true);
  assert.equal(startRace(state,course.id,w,'a'),true);
  leaveRace(state,'c'); // Leaving during countdown means c never starts.
  tick(state,w,RACE_COUNTDOWN);
  const round=state.rounds[0];assert.equal(round.starterCount,2);
  removePlayer(w,'b');
  assert.equal(round.entrants.find(entrant=>entrant.playerId==='b')!.status,'dnf');
  assert.equal(round.starterCount,2,'a departed starter still counts');
  // A saved-driver switch removes the old entrant from the public round.
  round.entrants=round.entrants.filter(entrant=>entrant.playerId!=='b');
  a.z=-25;tick(state,w,1);
  const winner=w.players.find(player=>player.id==='a')!;
  updateGameAchievements(w,winner);
  assert.ok(winner.achievements.unlocked.includes('race-winner'));
  assert.equal(round.starterCount,2,'removing the old identity does not erase its start');
});

test('a lone starter cannot win the contested award, including after a countdown departure',()=>{
  for(const countdownDeparture of [false,true]){
    const w=world(),state=createRace(),a=add(w,'a');w.races=state;
    assert.equal(joinRace(state,course,w,'a'),true);
    if(countdownDeparture){add(w,'b');assert.equal(joinRace(state,course,w,'b'),true);}
    assert.equal(startRace(state,course.id,w,'a'),true);
    if(countdownDeparture)leaveRace(state,'b');
    tick(state,w,RACE_COUNTDOWN);assert.equal(state.rounds[0].starterCount,1);
    a.z=-25;tick(state,w,1);
    const player=w.players.find(item=>item.id==='a')!;updateGameAchievements(w,player);
    assert.ok(player.achievements.unlocked.includes('race-finisher'));
    assert.ok(!player.achievements.unlocked.includes('race-winner'));
  }
});

test('first place is awarded before remaining drivers finish and survives the winner leaving',()=>{
  const w=world(),state=createRace(),a=add(w,'a'),b=add(w,'b');w.races=state;
  assert.equal(joinRace(state,course,w,'a'),true);assert.equal(joinRace(state,course,w,'b'),true);
  assert.equal(startRace(state,course.id,w,'a'),true);tick(state,w,RACE_COUNTDOWN);
  a.z=-25;tick(state,w,1);
  const winner=w.players.find(player=>player.id==='a')!,round=state.rounds[0];
  assert.equal(round.phase,'active');assert.equal(round.entrants.find(entrant=>entrant.playerId==='a')!.rank,1);
  updateGameAchievements(w,winner);
  assert.ok(winner.achievements.unlocked.includes('race-winner'),'first place is earned before the other finisher');
  removePlayer(w,'a');b.z=-25;tick(state,w,1);
  const other=w.players.find(player=>player.id==='b')!;updateGameAchievements(w,other);
  assert.equal(round.phase,'results');assert.equal(round.entrants.find(entrant=>entrant.playerId==='a')!.rank,1);
  assert.equal(winner.achievements.unlocked.filter(id=>id==='race-winner').length,1);
  assert.ok(!other.achievements.unlocked.includes('race-winner'));
});

test('lobby leave, out-of-range departure and active disconnect, reset or vehicle change clean up',()=>{
  const w=world(),state=createRace(),a=add(w,'a'),b=add(w,'b');
  joinRace(state,course,w,'a');joinRace(state,course,w,'b');leaveRace(state,'a');
  assert.equal(state.rounds[0].hostId,'b');b.x=100;tick(state,w,.05);assert.equal(state.rounds.length,0);
  a.x=0;b.x=0;joinRace(state,course,w,'a');joinRace(state,course,w,'b');
  startRace(state,course.id,w,'a');tick(state,w,3);
  leaveRace(state,'a');assert.equal(state.rounds[0].entrants.find(e=>e.playerId==='a')!.status,'dnf');
  w.players.find(p=>p.id==='b')!.entityId='new-car';tick(state,w,.05);
  assert.equal(state.rounds[0].entrants.find(e=>e.playerId==='b')!.status,'dnf');assert.equal(state.rounds[0].phase,'results');
  tick(state,w,RACE_RESULTS_DURATION);assert.equal(state.rounds.length,0);
});

test('finished or withdrawn racers may join another course without erasing their old results',()=>{
  for(const finish of [false,true]){
    const w=world(),state=createRace(),a=add(w,'a');add(w,'b');
    const otherCourse={...course,id:'oval'};
    assert.equal(joinRace(state,course,w,'a'),true);assert.equal(joinRace(state,course,w,'b'),true);
    assert.equal(startRace(state,course.id,w,'a'),true);tick(state,w,3);
    if(finish){a.z=-25;tick(state,w,1);}else leaveRace(state,'a');
    const old=state.rounds[0],oldResult=old.entrants.find(e=>e.playerId==='a')!;
    assert.equal(old.phase,'active','the other racer is still competing');
    assert.equal(oldResult.status,finish?'finished':'dnf');
    const resultTime=oldResult.elapsed,resultRank=oldResult.rank;
    a.z=5;assert.equal(joinRace(state,otherCourse,w,'a'),true);
    assert.equal(old.entrants.includes(oldResult),true);assert.equal(oldResult.elapsed,resultTime);assert.equal(oldResult.rank,resultRank);
    assert.equal(playerRace(state,'a')?.round.courseId,'oval','the new entry wins over the earlier result');
    state.rounds.reverse();assert.equal(playerRace(state,'a')?.round.courseId,'oval','selection is independent of array order');
    assert.equal(joinRace(state,{...course,id:'third'},w,'a'),false,'only one current race per player');
    leaveRace(state,'a');assert.equal(playerRace(state,'a')?.round.courseId,'short','leaving the new lobby retains the previous result');
  }
});

test('when results share an opening time, playerRace uses course ID as a stable tie-break',()=>{
  const w=world(),state=createRace();add(w,'a');
  assert.equal(joinRace(state,course,w,'a'),true);state.rounds[0].entrants[0].status='dnf';
  assert.equal(joinRace(state,{...course,id:'alpha'},w,'a'),true);state.rounds[1].entrants[0].status='finished';
  assert.equal(playerRace(state,'a')?.round.courseId,'alpha');
  state.rounds.reverse();assert.equal(playerRace(state,'a')?.round.courseId,'alpha');
});

test('timeout marks unfinished racers DNF and removes results after 30 seconds',()=>{
  const w=world(),state=createRace();add(w,'p');start(state,w,'p');
  tick(state,w,RACE_DURATION-.05);assert.equal(state.rounds[0].phase,'active');
  tick(state,w,.05);assert.equal(state.rounds[0].phase,'results');assert.equal(state.rounds[0].entrants[0].status,'dnf');
  tick(state,w,RACE_RESULTS_DURATION);assert.equal(state.rounds.length,0);
});
