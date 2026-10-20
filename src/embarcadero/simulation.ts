export type Controls = {
  throttle: boolean; reverse: boolean; left: boolean; right: boolean;
  lift: boolean; boost: boolean; brake: boolean; rollLeft: boolean; rollRight: boolean;
};

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number; height: number; minY?: number };
export type CarState = { x: number; y: number; z: number; yaw: number; roll: number; speed: number; verticalSpeed: number };

// Collision remains an axis-aligned arcade approximation; these dimensions
// describe the body around its ground-contact position rather than its mesh.
const HALF_WIDTH = 1.05;
const HALF_LENGTH = 2.25;
const CAR_HEIGHT = 1.3;

export const emptyControls = (): Controls => ({
  throttle: false, reverse: false, left: false, right: false, lift: false,
  boost: false, brake: false, rollLeft: false, rollRight: false,
});

export const initialCar = (): CarState => ({ x: 2.15, y: 0, z: 20, yaw: 0, roll: 0, speed: 0, verticalSpeed: 0 });

// This local-only visual prototype uses a fixed timestep. It deliberately has no
// connection to the authoritative multiplayer simulation or saved progression.
export function stepCar(car: CarState, input: Controls, dt: number, colliders: readonly Collider[]): 'water' | 'collision' | null {
  const airborne = car.y > 0.02;
  const acceleration = input.throttle ? (input.boost ? 21 : 12) : input.reverse ? -8 : 0;
  car.speed += acceleration * dt;
  car.speed *= Math.exp(-(input.brake ? 3.8 : input.throttle || input.reverse ? 0.12 : 0.62) * dt);
  car.speed = Math.max(-11, Math.min(input.boost ? 52 : 32, car.speed));

  const steering = Number(input.left) - Number(input.right);
  const steeringAuthority = Math.min(1, Math.abs(car.speed) / 6) * (airborne ? 0.55 : 1);
  car.yaw += steering * steeringAuthority * Math.sign(car.speed || 1) * 1.05 * dt;
  const targetRoll = airborne ? (Number(input.rollRight) - Number(input.rollLeft)) * 0.6 : 0;
  car.roll += (targetRoll - car.roll) * (1 - Math.exp(-4 * dt));

  const oldY = car.y;
  let collision = false;
  car.verticalSpeed += ((input.lift ? 18 : 0) - 9.8) * dt;
  car.verticalSpeed = Math.max(-22, Math.min(14, car.verticalSpeed));
  car.y = Math.min(180, car.y + car.verticalSpeed * dt);
  if (car.y === 180 && car.verticalSpeed > 0) car.verticalSpeed = 0;
  if (car.verticalSpeed <= 0) {
    // Land on the top of solid structures rather than dropping through them.
    for (const box of colliders) {
      if (oldY >= box.height && car.y <= box.height &&
          car.x + HALF_WIDTH > box.minX && car.x - HALF_WIDTH < box.maxX &&
          car.z + HALF_LENGTH > box.minZ && car.z - HALF_LENGTH < box.maxZ) {
        car.y = box.height;
        car.verticalSpeed = 0;
      }
    }
  } else {
    // Elevated surfaces have undersides as well as tops. Clamp an ascending
    // car against the underside instead of allowing it to fly through it.
    for (const box of colliders) {
      if (box.minY !== undefined && oldY + CAR_HEIGHT <= box.minY && car.y + CAR_HEIGHT >= box.minY &&
          car.x + HALF_WIDTH > box.minX && car.x - HALF_WIDTH < box.maxX &&
          car.z + HALF_LENGTH > box.minZ && car.z - HALF_LENGTH < box.maxZ) {
        car.y = box.minY - CAR_HEIGHT;
        car.verticalSpeed = 0;
        collision = true;
      }
    }
  }
  if (car.y <= 0) {
    car.y = 0;
    car.verticalSpeed = Math.max(0, car.verticalSpeed);
    if (car.x > 30) return 'water';
  }

  const dx = -Math.sin(car.yaw) * car.speed * dt;
  const dz = -Math.cos(car.yaw) * car.speed * dt;
  const blocked = (x: number, z: number) => colliders.some(box =>
    car.y < box.height && car.y + CAR_HEIGHT > (box.minY ?? 0) &&
    x + HALF_WIDTH > box.minX && x - HALF_WIDTH < box.maxX &&
    z + HALF_LENGTH > box.minZ && z - HALF_LENGTH < box.maxZ,
  );
  if (dx && !blocked(car.x + dx, car.z)) car.x += dx;
  else if (dx) collision = true;
  if (dz && !blocked(car.x, car.z + dz)) car.z += dz;
  else if (dz) collision = true;
  if (collision) car.speed *= 0.45;
  car.x = Math.max(-250, Math.min(400, car.x));
  car.z = Math.max(-450, Math.min(150, car.z));
  return collision ? 'collision' : null;
}
