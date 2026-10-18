import * as T from 'three';
import { HIGHWAYS } from '../shared/map';

type Observer = { x: number; z: number; yaw: number; inDome?: boolean };

// An occasional, local-only sighting. The UFO never enters the shared world or
// interacts with cars, police, or the sky-current physics.
const INTERVAL = 180;
const START = 20;
const DURATION = 18;

function nearBayHighway(observer: Observer): boolean {
  for (let road = 0; road < Math.min(HIGHWAYS.length, 2); road++) {
    const highway = HIGHWAYS[road];
    for (let i = 1; i < highway.points.length; i++) {
      const a = highway.points[i - 1], b = highway.points[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const length2 = dx * dx + dz * dz;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((observer.x - a.x) * dx + (observer.z - a.z) * dz) / length2));
      if (Math.hypot(observer.x - a.x - t * dx, observer.z - a.z - t * dz) < 115) return true;
    }
  }
  return false;
}

/** Attach group to a scene, then update with simulation seconds and the local driver. */
export function createBayUfo() {
  const group = new T.Group();
  group.visible = false;
  const hullGeometry = new T.LatheGeometry([
    new T.Vector2(0, -1), new T.Vector2(5.5, -1), new T.Vector2(9, -.25),
    new T.Vector2(9, .2), new T.Vector2(5.5, 1.4), new T.Vector2(0, 1.4),
  ], 20);
  const domeGeometry = new T.SphereGeometry(3.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const rimGeometry = new T.TorusGeometry(8.5, .25, 5, 24);
  const lightGeometry = new T.SphereGeometry(.55, 8, 6);
  const hullMaterial = new T.MeshStandardMaterial({ color: 0xb8c7c4, metalness: .35, roughness: .48 });
  const domeMaterial = new T.MeshStandardMaterial({ color: 0x336d78, emissive: 0x174b53, roughness: .35 });
  const lightMaterial = new T.MeshBasicMaterial({ color: 0xffffff });
  const hull = new T.Mesh(hullGeometry, hullMaterial);
  const dome = new T.Mesh(domeGeometry, domeMaterial);
  dome.position.y = 1.25;
  const rim = new T.Mesh(rimGeometry, lightMaterial);
  rim.rotation.x = Math.PI / 2;
  const lights = new T.InstancedMesh(lightGeometry, lightMaterial, 8);
  const matrix = new T.Matrix4();
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    lights.setMatrixAt(i, matrix.makeTranslation(Math.cos(angle) * 7.5, -.6, Math.sin(angle) * 7.5));
    lights.setColorAt(i, new T.Color(i % 2 ? 0x90fff1 : 0xffd684));
  }
  lights.computeBoundingSphere();
  group.add(hull, dome, rim, lights);

  let sighting = -1, nextCandidateAt = 0, lastTime = 0;
  let anchorX = 0, anchorZ = 0, sideX = 0, sideZ = 0, disposed = false;
  const update = (time: number, observer?: Observer | null) => {
    if (disposed || !Number.isFinite(time) || time < START || !observer || observer.inDome) {
      group.visible = false;
      return;
    }
    // Room clocks restart on a new session; snapshot interpolation may wobble
    // by a fraction of a second, so only treat a larger rewind as a reset.
    if (time < lastTime - 1) { sighting = -1; nextCandidateAt = 0; }
    lastTime = time;
    const cycle = Math.floor((time - START) / INTERVAL);
    const elapsed = time - START - cycle * INTERVAL;
    if (elapsed >= DURATION) {
      group.visible = false;
      return;
    }
    if (sighting !== cycle) {
      if (time < nextCandidateAt) {
        group.visible = false;
        return;
      }
      nextCandidateAt = time + 1;
      if (!nearBayHighway(observer)) {
        group.visible = false;
        return;
      }
      // Fix the route when spotted, so it flies across the road instead of
      // following the player. Move the initial point ahead of the chase camera.
      const forwardX = -Math.sin(observer.yaw), forwardZ = -Math.cos(observer.yaw);
      anchorX = observer.x + forwardX * 300;
      anchorZ = observer.z + forwardZ * 300;
      sideX = -forwardZ;
      sideZ = forwardX;
      sighting = cycle;
    }
    const across = (elapsed / DURATION - .5) * 180;
    group.position.set(anchorX + sideX * across, 25 + Math.sin(elapsed * .9) * 2, anchorZ + sideZ * across);
    group.rotation.set(Math.sin(elapsed * .7) * .06, elapsed * .4, Math.cos(elapsed * .6) * .07);
    group.visible = true;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    hullGeometry.dispose(); domeGeometry.dispose(); rimGeometry.dispose(); lightGeometry.dispose();
    hullMaterial.dispose(); domeMaterial.dispose(); lightMaterial.dispose();
  };
  return { group, update, dispose };
}
