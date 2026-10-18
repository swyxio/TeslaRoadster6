import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, THRUSTER_REAR } from '../shared/game';
import { GameAudio } from '../src/audio';
import { DriveFeedback } from '../src/drive-feedback';

function setup(){
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const element={hidden:true,dataset:{},textContent:''} as unknown as HTMLElement;
  const feedback=new DriveFeedback(element),audio=new GameAudio();
  const observe=(input=NEUTRAL,dt=.05,active=true)=>{
    world.time+=dt;
    const events=audio.update(world,player.id,active);
    return {events,boostStarted:feedback.update(car,input,events,dt,active)};
  };
  observe();
  return {world,player,car,element,feedback,audio,observe};
}

test('boost feedback requires a firing rear thruster and sounds once per activation',()=>{
  const {car,element,observe}=setup();
  const boost={...NEUTRAL,boost:true,throttle:1};
  assert.equal(observe(boost).boostStarted,false,'holding boost without a firing thruster is not shown as boost');
  assert.equal(element.hidden,true);
  car.thrusters=THRUSTER_REAR;
  assert.equal(observe(boost).boostStarted,true);
  assert.equal(element.textContent,'BOOST');
  assert.equal(observe(boost).boostStarted,false);
  observe(NEUTRAL,.25);observe(NEUTRAL,.25);
  assert.equal(observe(boost).boostStarted,true,'a later activation gets its own cue');
  car.air=0;observe(boost);
  assert.equal(element.hidden,true,'an empty tank cannot claim boost');
});

test('liftoff and supported landing share the snapshot-derived audio events',()=>{
  const {car,element,observe}=setup();
  car.jumpBurstUntil=1;car.y=3;car.vy=8;car.supportId=null;
  assert.deepEqual(observe().events.map(event=>event.cue),['jump']);
  assert.equal(element.textContent,'LIFT OFF');
  car.y=10;car.vy=-8;observe();
  car.y=8;car.vy=0;car.supportId='overpass';
  assert.deepEqual(observe().events.map(event=>event.cue),['land']);
  assert.equal(element.textContent,'TOUCHDOWN');
  for(let i=0;i<5;i++)observe(NEUTRAL,.25);
  assert.equal(element.hidden,true,'the landing label clears after a brief beat');
});

test('teleports, changing vehicles and pausing do not leave stale feedback',()=>{
  const {world,player,car,element,feedback,audio,observe}=setup();
  car.x+=300;car.y=3;car.vy=8;car.supportId=null;car.jumpBurstUntil=1;
  assert.deepEqual(observe().events,[],'teleports do not claim takeoff');
  car.jumpBurstUntil=2;observe();assert.equal(element.textContent,'LIFT OFF');
  observe(NEUTRAL,.05,false);assert.equal(element.hidden,true);
  const other=makeEntity('other','roadster',car.x,car.z,player.id);world.entities.push(other);player.entityId=other.id;
  const events=audio.update(world,player.id,true);
  feedback.update(other,NEUTRAL,events,.05,true);
  assert.equal(element.hidden,true);
});
