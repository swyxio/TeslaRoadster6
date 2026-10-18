import test from 'node:test';
import assert from 'node:assert/strict';
import { TickPrediction } from '../src/tick-prediction';
import { ScheduledInput } from '../shared/tick-input';
import { addPlayer, createWorld, makeEntity, NEUTRAL, type Entity, type World } from '../shared/game';
import { body, contact, dimensions } from '../shared/physics';
import { FERRY_DECK, FERRY_TRAVEL_SECONDS, whollyOnFerry } from '../shared/ferry';
import { BUILDINGS, FERRY_DOCKS, OVERPASS, STUNT_RAMP, buildingRoofHeight, overpassHeight, rampHeight, terrainHeight } from '../shared/map';
import { ISLAND_JUMPS, islandJumpHeight, sweepIslandJumpWall } from '../shared/island-jumps';

function setup() {
  const world = createWorld(), player = addPlayer(world, 'p', 'Player');
  const car = world.entities.find(entity => entity.id === player.entityId)!;
  world.entities = [car];
  world.pickups = [];
  return { world, car };
}
function control() { return new ScheduledInput({ ...NEUTRAL }).snapshot(); }
function driven(world: World): Entity { return world.entities.find(entity => entity.driver === 'p')!; }

// Begin with a displayed authoritative pose, then receive a correction to a
// second valid pose. Sampling each subsequent frame catches unsafe smoothing;
// a deliberate cut is allowed because it does not display intermediate poses.
function correction(from: World, to: World) {
  const prediction = new TickPrediction(), state = control();
  prediction.snapshot(from, 'p', 100, state, 0, 1, 0);
  const start = driven(prediction.renderWorld(0, 101, 100, 0) ?? from);
  prediction.snapshot(to, 'p', 101, state, 0, 1, 100);
  return { prediction, start, to };
}

test('replay retains shared-physics contact with a parked vehicle', () => {
  const {world,car}=setup();
  Object.assign(car,{x:-130,z:60,y:0,yaw:-Math.PI/2,speed:20,vx:20,vz:0,supportId:'ground'});
  const parked=makeEntity('parked','roadster',-123,60);
  Object.assign(parked,{y:0,yaw:-Math.PI/2,supportId:'ground'});world.entities.push(parked);
  const open=structuredClone(world);open.entities=open.entities.filter(entity=>entity.id!=='parked');
  const sample=(state:World)=>{const prediction=new TickPrediction();prediction.snapshot(state,'p',100,control(),0,5,0);
    return driven(prediction.renderWorld(25,106,100.5,1)!);};
  const impact=sample(world),unobstructed=sample(open);
  assert.ok(impact.speed<unobstructed.speed-1,'the parked body affects shared replay physics');
  assert.equal(car.health,100,'the speculative collision does not mutate room authority');
});

test('airborne correction does not blend through a ridge between valid endpoints', () => {
  const {world,car}=setup();
  Object.assign(car,{x:-345.5,z:150,y:6,yaw:0,speed:0,vx:0,vy:0,vz:0,supportId:null});
  const after=structuredClone(world);driven(after).x=-334.5;
  assert.ok(terrainHeight(car.x,car.z)!<6&&terrainHeight(-334.5,150)!<6);
  assert.ok(terrainHeight(-340,150)!>6);
  const {prediction}=correction(world,after);
  for(let now=100;now<=400;now+=10){
    const shown=driven(prediction.renderWorld(now,102,101,0)??after);
    assert.ok(shown.y>=terrainHeight(shown.x,shown.z)!-.001,`at ${now} ms`);
  }
});

for (const steer of [0,.35]) test(`decaying correction cannot enter a building while driving with steer ${steer}`, () => {
  const {world,car}=setup(),wall=BUILDINGS[0],left=wall.x-wall.w/2;
  Object.assign(car,{x:left-9,z:wall.z,y:0,yaw:-Math.PI/2,speed:35,vx:35,vy:0,vz:0,supportId:'ground'});
  const state=new ScheduledInput({...NEUTRAL,throttle:1,steer}).snapshot();state.heldUntilTick=1000;
  const prediction=new TickPrediction();prediction.snapshot(world,'p',100,state,0,5,0);
  let previous=driven(prediction.renderWorld(0,101,100,0)!);
  const after=structuredClone(world);driven(after).x=left-13;
  prediction.snapshot(after,'p',101,state,0,5,10);
  for(let now=10;now<=500;now+=1000/120){
    const elapsed=now-10,target=102+Math.floor(elapsed/50),phase=(elapsed%50)/50;
    const shown=driven(prediction.renderWorld(now,target,101+elapsed/50,phase)!);
    const cut=prediction.takeSnap(),hit=contact(body(shown),{...wall,yaw:0});
    assert.ok(!hit||hit.depth<1e-7,`rendered penetration at ${now}: ${hit?.depth}`);
    if(!cut){
      const delta=Math.atan2(Math.sin(shown.yaw-previous.yaw),Math.cos(shown.yaw-previous.yaw));
      for(let sample=1;sample<10;sample++){
        const t=sample/10,pose={...shown,x:previous.x+(shown.x-previous.x)*t,z:previous.z+(shown.z-previous.z)*t,yaw:previous.yaw+delta*t};
        assert.equal(contact(body(pose),{...wall,yaw:0}),null,`swept penetration at ${now}`);
      }
    }
    previous=shown;
  }
});

test('correction cannot interpolate through an island jump wall', () => {
  const { world, car } = setup(), ramp = ISLAND_JUMPS[1], near = ramp.z - ramp.width / 2;
  Object.assign(car, { x: ramp.start + 15, z: near - 2.5, y: 0, yaw: 0, speed: 0, vx: 0, vy: 0, vz: 0, supportId: 'ground' });
  const after = structuredClone(world), target = driven(after);
  Object.assign(target, { z: near + .5, y: islandJumpHeight(car.x, near + .5)!, supportId: 'island-jump' });
  const size = dimensions(car.kind), extent = { halfWidth: size.width / 2, halfLength: size.length / 2, yaw: car.yaw, minY: 0, maxY: size.height };
  assert.ok(sweepIslandJumpWall(car, target, extent), 'the endpoints straddle the physical wedge face');
  const { prediction, start } = correction(world, after);
  let previous = start;
  for (let now = 100; now <= 350; now += 10) {
    const rendered = prediction.renderWorld(now, 102, 101, 0) ?? after, current = driven(rendered);
    const cut = prediction.takeSnap();
    if (!cut && Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z) > 1e-6)
      assert.equal(sweepIslandJumpWall(previous, current, extent), null, 'a smoothed frame crosses the jump wall');
    previous = current;
  }
});

test('correction cannot interpolate through the stunt ramp end wall', () => {
  const { world, car } = setup();
  Object.assign(car, { x: STUNT_RAMP.end + 2, z: STUNT_RAMP.z, y: 0, yaw: -Math.PI / 2,
    speed: 0, vx: 0, vy: 0, vz: 0, supportId: 'ground' });
  const after = structuredClone(world), target = driven(after);
  Object.assign(target, { x: STUNT_RAMP.end - 2, y: rampHeight(STUNT_RAMP.end - 2, STUNT_RAMP.z)!, supportId: 'stunt-ramp' });
  const { prediction } = correction(world, after);
  for (let now = 100; now <= 350; now += 10) {
    const rendered = prediction.renderWorld(now, 102, 101, 0) ?? after, current = driven(rendered);
    const cut = prediction.takeSnap();
    const roof = rampHeight(current.x, current.z);
    if (!cut && roof !== null)
      assert.ok(current.y >= roof - 1e-6, 'a smoothed frame is inside the ramp end wall');
  }
});

for (const { name, x, start, end } of [
  { name: 'level deck', x: -290, start: 5, end: 9 },
  { name: 'sloped approach', x: -400, start: .3, end: 2.7 },
]) test(`an airborne correction cannot interpolate through the overpass ${name}`, () => {
  const { world, car } = setup();
  Object.assign(car, { x, z: OVERPASS.z, y: start, yaw: 0,
    speed: 0, vx: 0, vy: 0, vz: 0, supportId: null });
  const after = structuredClone(world), target = driven(after); target.y = end;
  const top = overpassHeight(car.x, car.z)!, height = dimensions(car.kind).height;
  assert.ok(car.y + height < top - OVERPASS.thickness && target.y > top, 'the endpoints clear the deck');
  const { prediction } = correction(world, after);
  for (let now = 100; now <= 350; now += 10) {
    const rendered = prediction.renderWorld(now, 102, 101, 0) ?? after, current = driven(rendered);
    const cut = prediction.takeSnap();
    if (!cut) assert.ok(current.y >= top || current.y + height <= top - OVERPASS.thickness,
      'a smoothed frame is inside the overpass deck');
  }
});

test('correction cannot interpolate through a curved landmark roof', () => {
  const { world, car } = setup(), building = BUILDINGS.find(item => item.style === 'salesforce')!;
  Object.assign(car, { x: building.x - 3, z: building.z + 9.8, y: building.h + .8, yaw: 0, speed: 0, vx: 0, vy: 0, vz: 0, supportId: null });
  const after = structuredClone(world), target = driven(after); target.x = building.x + 3;
  assert.ok(car.y >= buildingRoofHeight(building, car.x, car.z));
  assert.ok(target.y >= buildingRoofHeight(building, target.x, target.z));
  assert.ok(car.y < buildingRoofHeight(building, building.x, car.z), 'the path crosses the actual dome');
  const { prediction } = correction(world, after);
  for (let now = 100; now <= 350; now += 10) {
    const rendered = prediction.renderWorld(now, 102, 101, 0) ?? after, current = driven(rendered);
    prediction.takeSnap();
    if (contact(body(current), { ...building, yaw: 0 }))
      assert.ok(current.y >= buildingRoofHeight(building, current.x, current.z) - 1e-6, 'a displayed frame is inside the curved roof');
  }
});

test('a secured edge passenger stays on the rendered ferry deck', () => {
  const { world, car } = setup();
  const ferryZ = FERRY_DOCKS.sf.deckZ - 20 * (10 - 20 / 3 / 2);
  Object.assign(world.ferry, { phase: 'to-island', x: 0, z: ferryZ, velocity: -20,
    remaining: FERRY_TRAVEL_SECONDS - 10, passengers: [{ entityId: car.id, x: 0, z: -15 }] });
  Object.assign(car, { x: 0, z: ferryZ - 15, y: 0, yaw: 0, speed: 0, vx: 0, vz: -20, supportId: 'ferry' });
  assert.equal(whollyOnFerry(world.ferry, car), true, 'the authoritative passenger starts on deck');
  const prediction = new TickPrediction();
  prediction.snapshot(world, 'p', 100, control(), 0, 1, 0);
  const rendered = prediction.renderWorld(25, 105, 100.5, .5) ?? world, shown = driven(rendered);
  assert.ok(Math.abs(shown.z - rendered.ferry.z) < FERRY_DECK.length / 2);
  assert.equal(whollyOnFerry(rendered.ferry, shown), true, 'the passenger body must stay on the visible deck');
});
