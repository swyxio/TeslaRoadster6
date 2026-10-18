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
    return {events,boostStarted:feedback.update(car,input,events,dt,active,world.ferry)};
  };
  observe();
  return {world,player,car,element,feedback,audio,observe};
}

test('boost feedback follows the held input and sounds once per input edge',()=>{
  const {car,element,observe}=setup();
  const boost={...NEUTRAL,boost:true,throttle:1};
  car.thrusters=0;
  assert.equal(observe({...NEUTRAL,boost:true}).boostStarted,false,'ground boost without throttle is unavailable');
  assert.equal(element.hidden,true);
  assert.equal(observe(boost).boostStarted,true,'feedback is immediate even before a thruster update');
  assert.equal(element.textContent,'BOOST HELD');
  assert.equal(observe(boost).boostStarted,false);
  observe(NEUTRAL,.05);
  assert.equal(element.hidden,true,'releasing boost clears the input indicator');
  assert.equal(observe(boost,.05).boostStarted,false,'rapid re-press is rate limited');
  observe(NEUTRAL,.25);observe(NEUTRAL,.25);
  assert.equal(observe(boost).boostStarted,true,'a later activation gets its own cue');
});

test('ordinary airborne thrust does not count as boost input',()=>{
  const {car,element,observe}=setup();
  car.supportId=null;car.thrusters=THRUSTER_REAR;
  assert.equal(observe({...NEUTRAL,throttle:1}).boostStarted,false);
  assert.equal(element.hidden,true,'normal forward flight alone does not show the boost input');
  assert.equal(observe({...NEUTRAL,throttle:1,boost:true}).boostStarted,true);
  assert.equal(element.textContent,'BOOST HELD');
  observe(NEUTRAL,.25);observe(NEUTRAL,.25);car.thrusters=0;
  assert.equal(observe({...NEUTRAL,boost:true}).boostStarted,true,'airborne boost can be requested without forward throttle');
});

test('boost input survives a partial last tick, but clears when air and plume are gone',()=>{
  const {car,element,observe}=setup();
  const boost={...NEUTRAL,boost:true};
  car.supportId=null;
  car.air=.001;car.thrusters=THRUSTER_REAR;
  assert.equal(observe(boost).boostStarted,true);
  car.air=0;
  assert.equal(observe(boost).boostStarted,false,'the same hold does not repeat its cue');
  assert.equal(element.textContent,'BOOST HELD','a rear plume may represent a partial last boost');
  car.thrusters=0;
  assert.equal(observe(boost).boostStarted,false);
  assert.equal(element.hidden,true,'empty air with no plume is unavailable');
  observe(NEUTRAL,.25);observe(NEUTRAL,.25);
  assert.equal(observe(boost).boostStarted,false,'an empty-tank press makes no sound');
  car.thrusters=THRUSTER_REAR;
  assert.equal(observe(boost).boostStarted,true,'a first observed partial last tick can still cue');
  assert.equal(element.textContent,'BOOST HELD');
});

test('vehicles without rockets have no boost input feedback',()=>{
  const {car,element,observe}=setup();
  const boost={...NEUTRAL,boost:true,throttle:1};
  car.kind='model-3';car.upgrades.rocket=false;car.thrusters=THRUSTER_REAR;
  assert.equal(observe(boost).boostStarted,false);
  assert.equal(element.hidden,true);
  car.upgrades.rocket=true;car.thrusters=0;
  assert.equal(observe(boost).boostStarted,true,'adding rockets makes the held input available');
  assert.equal(element.textContent,'BOOST HELD');
});

test('a secured ferry passenger has no boost cue while jump and landing feedback remain visible',()=>{
  const {world,car,element,feedback,observe}=setup();
  const boost={...NEUTRAL,boost:true,throttle:1};
  car.supportId='ferry';
  world.ferry.passengers=[{entityId:car.id,x:0,z:0}];
  world.ferry.phase='to-island';
  assert.equal(observe(boost).boostStarted,false);
  assert.equal(element.hidden,true,'secured controls cannot trigger boost feedback');
  assert.equal(feedback.update(car,boost,[{cue:'jump'}],.05,true,world.ferry),false);
  assert.equal(element.textContent,'LIFT OFF');
  assert.equal(feedback.update(car,boost,[{cue:'land'}],.05,true,world.ferry),false);
  assert.equal(element.textContent,'TOUCHDOWN');
  for(let i=0;i<4;i++)observe(boost,.25);
  assert.equal(element.hidden,true,'the landing transient clears while still secured');
  world.ferry.phase='island';
  assert.equal(observe(boost).boostStarted,true,'a held input can cue once controls resume at dock');
  assert.equal(element.textContent,'BOOST HELD');
  assert.equal(observe(boost).boostStarted,false,'the continuing hold does not repeat the sound');
  world.ferry.phase='to-sf';
  assert.equal(observe(boost).boostStarted,false);
  assert.equal(element.hidden,true,'securing the same passenger clears the held-input label');
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
  feedback.update(other,NEUTRAL,events,.05,true,world.ferry);
  assert.equal(element.hidden,true);
});
