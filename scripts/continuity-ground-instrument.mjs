// Applied only to a disposable archive of the exact target revision. This is
// intentionally scoped to ordinary ground driving, not flight/contact recovery.
// Every anchor is counted: an unfamiliar source revision fails closed.
const replacements = [
  ['for(let i=0;i<steps;i++)advance(world,inputs,dt/steps,options?.onRelocation,options?.economy,i===steps-1?searchDriver:undefined);',
    "for(let i=0;i<steps;i++){continuityBoundary(world,'before');advance(world,inputs,dt/steps,options?.onRelocation,options?.economy,i===steps-1?searchDriver:undefined);continuityBoundary(world,'after');}"],
  ["if(ferrySecured(world.ferry,e)){e.thrusters=0;continue;}", "if(ferrySecured(world.ferry,e)){continuityContact(e,'ferry-secured');e.thrusters=0;continue;}"],
  ['if(jump&&rocket&&e.air>0){', "if(jump&&rocket&&e.air>0){continuityContact(e,'jump');"],
  ["Math.abs(e.z-world.ferry.z)<=FERRY_DECK.length/2+radius&&!ferryCanBoard(world,e)){",
    "Math.abs(e.z-world.ferry.z)<=FERRY_DECK.length/2+radius&&!ferryCanBoard(world,e)){continuityContact(e,'ferry-area');"],
  ['      followSupport(world,e,old);', "      followSupport(world,e,old);continuityScope(e);"],
  ['const hit=rampWallHit(e,old);if(hit)resolveRampWall(e,old,hit);',
    "const hit=rampWallHit(e,old);if(hit){continuityContact(e,'ramp-wall');resolveRampWall(e,old,hit);}", 2],
  ['const hit=rampWallHit(e,landed);if(hit)resolveRampWall(e,landed,hit);',
    "const hit=rampWallHit(e,landed);if(hit){continuityContact(e,'ramp-wall');resolveRampWall(e,landed,hit);}"],
  ['if(jumpWall&&jumpWall.t<Math.min(jumpTop?.t??Infinity,rampTopTime,groundTime))resolveRampWall(e,old,jumpWall);',
    "if(jumpWall&&jumpWall.t<Math.min(jumpTop?.t??Infinity,rampTopTime,groundTime)){continuityContact(e,'ramp-wall');resolveRampWall(e,old,jumpWall);}"],
  ['        enterCliffFromGround(e,old,margin);', '        enterCliffFromGround(e,old,margin);continuityScope(e);'],
  ['    constrainDome(e,rocket);\n    if(blocksProgression(world,e,old)){',
    "    constrainDome(e,rocket);continuityScope(e);\n    if(blocksProgression(world,e,old)){continuityContact(e,'progression-gate');"],
  ['    if(solid(e)){\n      e.x=oldX;', "    if(solid(e)){continuityContact(e,'solid');\n      e.x=oldX;"],
  ['const hit=contact(body(a),body(b));if(!hit)continue;',
    "const hit=contact(body(a),body(b));if(!hit)continue;continuityContact(a,'entity');continuityContact(b,'entity');"],
];

export function instrumentGroundGame(source) {
  if (typeof source !== 'string') throw new Error('Expected game source');
  const declaration = 'export function step(world:World,inputs:Map<string,Input>,dt:number,options?:';
  if (source.split(declaration).length !== 2) throw new Error('Missing or ambiguous step declaration');
  source = source.replace(declaration, `// Local disposable instrumentation only; callbacks do not modify game state.\nfunction continuityContact(e:Entity,reason:string):void {(globalThis as any).__teslandContinuityProbe?.contact(e,reason);}\nfunction continuityScope(e:Entity):void {(globalThis as any).__teslandContinuityProbe?.scope(e);}\nfunction continuityBoundary(world:World,phase:'before'|'after'):void {(globalThis as any).__teslandContinuityProbe?.boundary(world,phase);}\n${declaration}`);
  for (const [needle, replacement, count = 1] of replacements) {
    const observed = source.split(needle).length - 1;
    if (observed !== count) throw new Error(`Ground instrumentation anchor mismatch: expected ${count}, found ${observed}: ${needle.slice(0, 90)}`);
    source = source.replaceAll(needle, replacement);
  }
  return source;
}
