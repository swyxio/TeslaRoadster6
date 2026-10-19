import { NEUTRAL, type Entity, type Input } from '../shared/game';
import { MAP_BOUNDS, isSurface, nearbyBuildings, terrainHeight } from '../shared/map';
import { contact } from '../shared/physics';

export type Lane = {x:number; z:number};
const clamp = (n:number, min:number, max:number) => Math.max(min, Math.min(max,n));
export const yawError = (yaw:number) => Math.atan2(Math.sin(-yaw), Math.cos(-yaw));

// Sample a wide, 1.1 km southbound corridor on the exact candidate map. This
// checks static geometry, not moving traffic or between-sample contacts.
export function corridors():Lane[] {
  const lanes:Lane[] = [];
  for (let x = -1450; x <= 1800 && lanes.length < 64; x += 12) {
    let clear = true;
    for (let z = 4100; z >= 3000 && clear; z -= 2) {
      if (x-3 < MAP_BOUNDS.minX || x+3 > MAP_BOUNDS.maxX || z-4.25 < MAP_BOUNDS.minZ || z+4.25 > MAP_BOUNDS.maxZ) {clear=false;break;}
      for (const dx of [-3,0,3]) for (const dz of [-4.25,0,4.25])
        if (!isSurface(x+dx,z+dz) || terrainHeight(x+dx,z+dz) === null) clear = false;
      if (nearbyBuildings(x,z,14.5).some(building => contact({x,z,w:6,d:10.5,yaw:0},{...building,yaw:0}))) clear=false;
    }
    if (clear) lanes.push({x,z:4100});
  }
  if (lanes.length !== 64) throw new Error(`Static corridor preflight found ${lanes.length}/64 lanes`);
  return lanes;
}

export function alignControl(car:Entity|null):Input {
  if (!car || !Number.isFinite(car.yaw) || !Number.isFinite(car.speed)) return {...NEUTRAL};
  const error=yawError(car.yaw);
  if (Math.abs(error) < .035) return {...NEUTRAL,brake:true};
  return {...NEUTRAL, throttle:car.speed < 4 ? .1 : 0, steer:clamp(error*1.5,-1,1)};
}

export function driveControl(car:Entity|null, lane:Lane, snapshotAgeMs:number):Input {
  if (!car || snapshotAgeMs > 500 || !Number.isFinite(car.yaw) || !Number.isFinite(car.speed)) return {...NEUTRAL};
  if (car.speed > 13) return {...NEUTRAL,brake:true};
  const steer=clamp(yawError(car.yaw)*1.4+(car.x-lane.x)*.02-car.yawRate*.3,-.3,.3);
  return {...NEUTRAL,throttle:clamp((12-car.speed)*.06,0,.1),steer};
}

export function safelyStaged(car:Entity|null, lane:Lane):boolean {
  return !!car && car.supportId === 'ground' && Math.hypot(car.x-lane.x,car.z-lane.z) < .5 &&
    Math.abs(yawError(car.yaw)) < .05 && Math.abs(car.speed) < .5;
}
