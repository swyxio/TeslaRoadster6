import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// This source is licensed CC BY; see public/embarcadero/vehicle/ATTRIBUTION.md.
// The downloaded model is only loaded in this isolated visual demo.
const vehiclePath = '/embarcadero/vehicle/';
let templatePromise: Promise<T.Group> | undefined;

function addRocketNozzles(root: T.Group, rear: number) {
  const trim = new T.MeshStandardMaterial({ color: 0xa9a18a, metalness: .8, roughness: .3 });
  const bore = new T.MeshStandardMaterial({ color: 0x101519, metalness: .35, roughness: .55 });
  const group = new T.Group();
  group.name = 'rear_thrusters';
  const ringGeometry = new T.TorusGeometry(.086, .015, 8, 24);
  const boreGeometry = new T.CircleGeometry(.076, 24);
  for (const x of [-.48, -.16, .16, .48]) {
    const ring = new T.Mesh(ringGeometry, trim);
    const hole = new T.Mesh(boreGeometry, bore);
    ring.position.set(x, .34, rear + .014);
    hole.position.set(x, .34, rear + .013);
    group.add(ring, hole);
  }
  root.add(group);
}

async function loadTemplate(): Promise<T.Group> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${vehiclePath}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  let gltf;
  try {
    gltf = await loader.loadAsync(`${vehiclePath}roadster.glb`);
  } catch (cause) {
    throw new Error('The Embarcadero Roadster model could not be loaded.', { cause });
  } finally {
    draco.dispose();
  }

  const car = new T.Group();
  car.name = 'embarcadero-roadster';
  const model = gltf.scene;
  // The source's nose points toward +Z; the demo's vehicle contract is -Z.
  model.rotation.y = Math.PI;
  car.add(model);
  car.updateMatrixWorld(true);
  let bounds = new T.Box3().setFromObject(model);
  const sourceLength = bounds.max.z - bounds.min.z;
  if (!Number.isFinite(sourceLength) || sourceLength < .001) throw new Error('The Roadster model has invalid bounds.');
  model.scale.multiplyScalar(4.5 / sourceLength);
  car.updateMatrixWorld(true);
  bounds = new T.Box3().setFromObject(model);
  model.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  car.updateMatrixWorld(true);
  bounds = new T.Box3().setFromObject(model);

  const paint = new T.MeshPhysicalMaterial({ color: 0xdce1df, metalness: .45, roughness: .22, clearcoat: .9, clearcoatRoughness: .15 });
  const glass = new T.MeshPhysicalMaterial({ color: 0x1c292e, metalness: .3, roughness: .17, clearcoat: 1, clearcoatRoughness: .08 });
  const wheelNames: Record<string, string> = {
    'TRDEF-WheelFtR': 'wheel_fr', 'TRDEF-WheelFtL': 'wheel_fl',
    'TRDEF-WheelBkR': 'wheel_rr', 'TRDEF-WheelBkL': 'wheel_rl',
  };
  model.traverse(object => {
    if (wheelNames[object.name]) object.name = wheelNames[object.name];
    if (!(object instanceof T.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const replace = (material: T.Material) => {
      if (material.name === 'car_main_paint') return paint;
      if (material.name === 'Glass_mid_tint' || material.name === 'Glass_Tint_max') return glass;
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
  });
  addRocketNozzles(car, bounds.max.z);
  return car;
}

/** Vehicle root is at ground level; nose is -Z. Spin wheel_* groups around local X. */
export async function createEmbarcaderoCar(): Promise<T.Group> {
  if (!templatePromise) templatePromise = loadTemplate().catch(error => { templatePromise = undefined; throw error; });
  return (await templatePromise).clone(true);
}
