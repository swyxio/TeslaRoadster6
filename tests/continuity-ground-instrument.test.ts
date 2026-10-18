import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, type World } from '../shared/game';
import { BUILDINGS, STUNT_RAMP } from '../shared/map';
import { instrumentGroundGame } from '../scripts/continuity-ground-instrument.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const original = await readFile(join(root, 'shared/game.ts'), 'utf8');
const source = instrumentGroundGame(original);
const temporary = await mkdtemp(join(tmpdir(), 'tesland-ground-test-'));
await cp(join(root, 'shared'), join(temporary, 'shared'), { recursive: true });
await cp(join(root, 'package.json'), join(temporary, 'package.json'));
await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
await writeFile(join(temporary, 'shared/game.ts'), source);
const { step: tracedStep } = await import(pathToFileURL(join(temporary, 'shared/game.ts')).href);
after(async () => { await rm(temporary, { recursive: true, force: true }); });

function setup() {
  const world = createWorld(), player = addPlayer(world, 'p', 'Player');
  const car = world.entities.find(e => e.id === player.entityId)!;
  world.entities = [car]; world.pickups = [];
  return { world, car };
}

function compare(initial: World, iterations: number, input = NEUTRAL) {
  const unmodified = structuredClone(initial), traced = structuredClone(initial);
  const entityId = traced.players[0].entityId, reasons = new Set<string>();
  let before = 0, afterCount = 0;
  const scope = (e: any) => {
    if (!e || e.id !== entityId || e.supportId !== 'ground' || e.inDome || e.loopAngle !== null) reasons.add('out-of-ground-scope');
  };
  (globalThis as any).__teslandContinuityProbe = {
    contact: (e: any, reason: string) => { if (e?.id === entityId) reasons.add(reason); },
    scope: (e: any) => { if (e?.id === entityId) scope(e); },
    boundary: (world: World, phase: string) => {
      if (phase === 'before') before++; else if (phase === 'after') afterCount++;
      scope(world.entities.find(e => e.id === entityId));
    },
  };
  try {
    for (let i = 0; i < iterations; i++) {
      step(unmodified, new Map([['p', input]]), .05);
      tracedStep(traced, new Map([['p', input]]), .05);
      assert.deepEqual(traced, unmodified, `instrumentation changed gameplay on tick ${i}`);
    }
  } finally { delete (globalThis as any).__teslandContinuityProbe; }
  assert.ok(before > 0); assert.equal(before, afterCount);
  return reasons;
}

test('ground instrumentation compiles and refuses unfamiliar collision or step sources', () => {
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  assert.deepEqual((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  assert.throws(() => instrumentGroundGame(original.replace('if(solid(e)){', 'if(false){')), /anchor mismatch/);
  assert.throws(() => instrumentGroundGame(original.replace('export function step(', 'export function changedStep(')), /step declaration/);
});

test('clear ground travel stays clear and gameplay-equivalent', () => {
  const { world, car } = setup();
  Object.assign(car, { x: -300, z: -2050, y: 0, yaw: Math.PI, speed: 12, supportId: 'ground' });
  assert.deepEqual([...compare(world, 12, { ...NEUTRAL, throttle: 1 })], []);
});

test('solid wall and another vehicle are recorded without changing gameplay', () => {
  const solid = setup(), building = BUILDINGS[0];
  Object.assign(solid.car, { x: building.x, z: building.z + building.d / 2 + 1.9, y: 0, speed: 40, yaw: 0, supportId: 'ground' });
  assert.ok(compare(solid.world, 1).has('solid'));
  const entity = setup(), parked = makeEntity('parked-test', 'roadster', 0, -3.5);
  Object.assign(entity.car, { x: 0, z: 0, y: 0, speed: 10, yaw: 0, supportId: 'ground' });
  entity.world.entities.push(parked);
  assert.ok(compare(entity.world, 1).has('entity'));
});

test('progression checkpoint and ramp wall are recorded without changing gameplay', () => {
  const gate = setup();
  Object.assign(gate.car, { x: 109.9, z: 60, y: 0, yaw: -Math.PI / 2, speed: 70, supportId: 'ground' });
  assert.ok(compare(gate.world, 1).has('progression-gate'));
  const ramp = setup();
  Object.assign(ramp.car, { x: STUNT_RAMP.end + .2, z: STUNT_RAMP.z, y: 0, yaw: Math.PI / 2, speed: 12, supportId: 'ground' });
  assert.ok(compare(ramp.world, 1).has('stunt-ramp-wall'));
});

test('full ferry and airborne paths are never mistaken for clear ground travel', () => {
  const ferry = setup();
  for (const x of [-3.5, 3.5]) for (const offset of [-11, 0, 11]) {
    const occupant = makeEntity(`parked-${x}-${offset}`, 'waymo-firefly', x, ferry.world.ferry.z + offset);
    occupant.supportId = 'ferry'; ferry.world.entities.push(occupant);
  }
  Object.assign(ferry.car, { x: 0, z: -245, y: 0, yaw: 0, speed: 7, supportId: 'ground' });
  assert.ok(compare(ferry.world, 80, { ...NEUTRAL, throttle: .5 }).has('ferry-area'));
  const airborne = setup();
  Object.assign(airborne.car, { x: -300, z: -2050, y: 30, supportId: null });
  assert.ok(compare(airborne.world, 1).has('out-of-ground-scope'));
});
