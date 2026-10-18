import * as T from 'three';
import { VEHICLES, type LuxuryVehicleId } from '../shared/vehicles';

/**
 * Original low-poly interpretations with distinctive source-inspired details. -Z is forward; the
 * origin is on the ground at the midpoint between the wheels.
 *
 * Manufacturer visual / dimension references:
 * https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/revuelto/2024/brochure/REVUELTO_DIGITAL_BROCHURE_CN_2024.pdf
 * https://www.lamborghini.com/original/DAM/lamborghini/0_facelift_2025/model_details_new/temerario_2/brochure_2026/Lamborghini%20Temerario_DIGITAL_BROCHURE_2026_EN.pdf
 * https://newsroom.bugatti.com/api/en/press-releases/pdf/bugatti-eb110-vs-chiron-super-sports-and-hyper-sports-cars-compared
 * https://worldpremiere.bugatti.com/fr
 * https://media.ducati.com/dam/MY25_Panigale_V4_EU_UC662332.pdf
 * https://global.kawasaki.com/en/corp/newsroom/news/detail/?f=20180810_1441
 * Ducati's overall envelope is estimated; its wheelbase is sourced. The H2
 * reference is the 2019 model: 2.085 x 0.770 x 1.125 m, 1.455 m wheelbase.
 * The rider sits above the bike's envelope. No logos or external meshes.
 * Geometries and materials belong to the template cache: never dispose them
 * when removing a cloned vehicle.
 */
type CarSpec = {
  length: number; width: number; height: number; wheelbase: number;
  color: number; secondary: number; kind: 'revuelto' | 'temerario' | 'chiron' | 'tourbillon';
};

const cars: Record<Exclude<LuxuryVehicleId, 'ducati-panigale-v4' | 'kawasaki-ninja-h2-carbon'>, Pick<CarSpec, 'secondary' | 'kind'>> = {
  'lamborghini-revuelto': { secondary: 0x292824, kind: 'revuelto' },
  'lamborghini-temerario': { secondary: 0x202826, kind: 'temerario' },
  'bugatti-chiron': { secondary: 0x142a53, kind: 'chiron' },
  'bugatti-tourbillon': { secondary: 0x263957, kind: 'tourbillon' },
};

const materials = new Map<string, T.MeshStandardMaterial>();
const geometryCache = new Map<string, T.BufferGeometry>();
const cube = new T.BoxGeometry(1, 1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 20);
const sphere = new T.SphereGeometry(1, 12, 8);
const DARK = 0x171c23, RUBBER = 0x16181b, GLASS = 0x253f4c;
const SILVER = 0xc2c9ce, LIGHT = 0xeafaff, RED_LIGHT = 0xef303a;
export const MOTORCYCLE_FAIRING_WIDTH = .42;

function material(color: number, metalness = .18, emissive = false): T.MeshStandardMaterial {
  const key = `${color}:${metalness}:${emissive}`;
  let value = materials.get(key);
  if (!value) {
    value = new T.MeshStandardMaterial({
      color, metalness, roughness: color === GLASS ? .22 : .39,
      emissive: emissive ? color : 0, emissiveIntensity: emissive ? .5 : 0,
    });
    materials.set(key, value);
  }
  return value;
}

function box(parent: T.Object3D, position: [number, number, number], size: [number, number, number], color: number, metalness = .18): T.Mesh {
  const mesh = new T.Mesh(cube, material(color, metalness));
  mesh.position.set(...position); mesh.scale.set(...size); parent.add(mesh);
  return mesh;
}

/** Straight trim pieces are boxes instead of lines, so they stay visible at distance. */
function bar(parent: T.Object3D, from: [number, number, number], to: [number, number, number], thickness: number, color: number, metalness = .18): void {
  const a = new T.Vector3(...from), b = new T.Vector3(...to);
  const mesh = new T.Mesh(cube, material(color, metalness));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.scale.set(thickness, a.distanceTo(b), thickness); parent.add(mesh);
}

function arc(parent: T.Object3D, points: [number, number, number][], radius: number, color: number): void {
  const key = JSON.stringify(['arc', points, radius]);
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), 24, radius, 6, false);
    geometryCache.set(key, geometry);
  }
  parent.add(new T.Mesh(geometry, material(color, .7)));
}

/** Each cross-section is [z, half-width, bottom, shoulder, crown]. */
function loft(parent: T.Object3D, sections: [number, number, number, number, number][], color: number, metalness = .3): void {
  const key = JSON.stringify(['loft', sections]);
  let geometry = geometryCache.get(key);
  if (!geometry) {
    const vertices: number[] = [], indices: number[] = [];
    for (const [z, w, bottom, shoulder, crown] of sections) {
      vertices.push(-w, bottom, z, -w, shoulder, z, -w * .72, crown, z,
        w * .72, crown, z, w, shoulder, z, w, bottom, z);
    }
    for (let s = 0; s < sections.length - 1; s++) for (let i = 0; i < 6; i++) {
      const a = s * 6 + i, b = s * 6 + (i + 1) % 6, c = b + 6, d = a + 6;
      indices.push(a, d, b, b, d, c);
    }
    // End caps; duplicate triangles deliberately keep the cross-section simple.
    for (let i = 1; i < 5; i++) {
      indices.push(0, i, i + 1);
      const end = (sections.length - 1) * 6;
      indices.push(end, end + i + 1, end + i);
    }
    geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    geometryCache.set(key, geometry);
  }
  parent.add(new T.Mesh(geometry, material(color, metalness)));
}

/** A low-poly fairing, drawn as a [z, y] profile and extruded across X. */
function fairing(parent: T.Object3D, width: number, points: [number, number][], color: number): void {
  const key = JSON.stringify(['fairing', width, points]);
  let geometry = geometryCache.get(key);
  if (!geometry) {
    const shape = new T.Shape();
    points.forEach(([z, y], i) => i ? shape.lineTo(z, y) : shape.moveTo(z, y));
    shape.closePath();
    geometry = new T.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.rotateY(-Math.PI / 2); geometry.translate(width / 2, 0, 0);
    geometryCache.set(key, geometry);
  }
  parent.add(new T.Mesh(geometry, material(color, .35)));
}

function wheel(parent: T.Group, name: string, x: number, z: number, radius: number, width: number, accent: number): void {
  const group = new T.Group(); group.name = name; group.position.set(x, radius, z);
  const rubber = new T.Mesh(cylinder, material(RUBBER));
  rubber.rotation.z = Math.PI / 2; rubber.scale.set(radius, width, radius); group.add(rubber);
  for (const side of [-1, 1]) {
    const disk = new T.Mesh(cylinder, material(0x5a6772, .72));
    disk.rotation.z = Math.PI / 2; disk.scale.set(radius * .70, .015, radius * .70);
    disk.position.x = side * (width / 2 + .006); group.add(disk);
    const hub = new T.Mesh(cylinder, material(accent, .7));
    hub.rotation.z = Math.PI / 2; hub.scale.set(radius * .15, .018, radius * .15);
    hub.position.x = side * (width / 2 + .018); group.add(hub);
    for (let spoke = 0; spoke < 5; spoke++) {
      const strut = box(group, [side * (width / 2 + .017), 0, 0], [.018, radius * 1.20, .045], SILVER, .7);
      strut.rotation.x = spoke * Math.PI / 5;
    }
  }
  parent.add(group);
}

function carLights(root: T.Group, spec: CarSpec): void {
  const { length: l, width: w, kind } = spec, front = -l / 2 - .016;
  if (kind === 'revuelto') {
    for (const side of [-1, 1]) {
      const x = side * w * .32;
      bar(root, [x, .38, front], [x, .45, front], .035, LIGHT);
      bar(root, [x, .45, front], [x + side * .13, .53, front + .02], .035, LIGHT);
      bar(root, [x, .45, front], [x - side * .13, .53, front + .02], .035, LIGHT);
    }
  } else if (kind === 'temerario') {
    for (const side of [-1, 1]) {
      const x = side * w * .34, y = .46, r = .105;
      const points: [number, number, number][] = [];
      for (let i = 0; i <= 6; i++) points.push([x + r * Math.cos(Math.PI / 3 * i), y + r * Math.sin(Math.PI / 3 * i), front]);
      for (let i = 0; i < 6; i++) bar(root, points[i], points[i + 1], .025, LIGHT);
      box(root, [x, .54, front + .025], [.28, .035, .025], LIGHT);
    }
  } else {
    // Chiron's four lamps per side; Tourbillon keeps a slimmer four-lamp treatment.
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      box(root, [side * (w * .24 + i * .077), kind === 'chiron' ? .54 : .50, front],
        [.052, kind === 'chiron' ? .075 : .045, .025], LIGHT);
    }
    arc(root, [[-.33, .55, front], [-.31, .29, front], [0, .21, front], [.31, .29, front], [.33, .55, front]], .026, SILVER);
  }
  box(root, [0, .51, l / 2 + .01], [w * .75, .04, .025], RED_LIGHT);
}

function buildCar(id: keyof typeof cars): T.Group {
  const spec = { ...VEHICLES[id], ...cars[id] }, { length: l, width: w, height: h, wheelbase: wb, kind } = spec;
  const root = new T.Group(); root.name = id;
  const seat = new T.Object3D(); seat.name = 'seat_driver'; seat.position.set(-w * .2, .8, 0); root.add(seat);
  const bugatti = kind === 'chiron' || kind === 'tourbillon';
  loft(root, [
    [-l / 2, w * .39, .23, .56, .62], [-l * .36, w * .47, .22, .55, .64],
    [-l * .17, w * .49, .22, .61, .69], [l * .13, w * .49, .22, .62, .68],
    [l * .34, w * .48, .24, .61, .69], [l / 2, w * .39, .25, .46, .56],
  ], spec.color);
  // A separate glass canopy gives all models the long, low mid-engine profile.
  loft(root, [
    [-l * .22, w * .31, .60, .63, .66], [-l * .08, w * .33, .63, h * .84, h],
    [l * .13, w * .32, .63, h * .84, h], [l * .25, w * .28, .63, .70, .73],
  ], GLASS, .32);
  box(root, [0, h - .012, l * .025], [w * .46, .035, l * .21], spec.secondary);
  box(root, [0, .23, 0], [w * .8, .10, l * .90], DARK);
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - .13);
    wheel(root, `wheel_f${side < 0 ? 'l' : 'r'}`, x, -wb / 2, .35, .24, spec.secondary);
    wheel(root, `wheel_r${side < 0 ? 'l' : 'r'}`, x, wb / 2, .37, .27, spec.secondary);
    box(root, [side * w * .43, .42, l * .11], [.035, .15, l * .24], DARK);
    box(root, [side * w * .38, .75, -l * .10], [.16, .09, .20], spec.color);
    if (bugatti) {
      // The sweeping side line and two-tone rear are defining cues.
      box(root, [side * w * .465, .50, l * .34], [.035, .20, l * .22], spec.secondary);
      const sx = side * w * .495;
      arc(root, [[sx, .93, -l * .09], [sx, h * .94, l * .10], [sx, .82, l * .22],
        [sx, .48, l * .20], [sx, .36, l * .04], [sx, .39, -l * .11]], .018, SILVER);
    } else {
      // Angular side intakes and exposed rear buttresses echo the wedge body.
      bar(root, [side * w * .49, .38, l * .03], [side * w * .49, .62, l * .22], .055, DARK);
      box(root, [side * w * .24, .69, l * .34], [.15, .07, l * .25], spec.secondary);
      if (kind === 'revuelto') {
        // A diagonal door seam suggests the scissor-door layout.
        bar(root, [side * w * .487, .40, -l * .11], [side * w * .487, .61, -l * .04], .014, DARK);
      }
    }
  }
  if (kind === 'revuelto') {
    box(root, [0, .62, l * .43], [w * .56, .055, .16], DARK);
    for (const side of [-1, 1]) box(root, [side * .15, .53, l * .49], [.10, .08, .035], SILVER, .7);
  } else if (kind === 'temerario') {
    box(root, [0, .66, l * .43], [w * .66, .05, .14], spec.secondary);
    box(root, [0, .58, l * .495], [.17, .13, .04], SILVER, .7);
  } else {
    box(root, [0, .69, l * .41], [w * .58, .05, .12], spec.secondary);
    box(root, [0, .71, l * .27], [.035, .06, l * .30], SILVER, .7);
    if (kind === 'tourbillon') box(root, [0, .28, l * .48], [w * .65, .09, .13], DARK);
  }
  carLights(root, spec);
  return root;
}

function buildBike(id: 'ducati-panigale-v4' | 'kawasaki-ninja-h2-carbon'): T.Group {
  const root = new T.Group(); root.name = id;
  const ducati = id === 'ducati-panigale-v4';
  const { wheelbase: wb, color } = VEHICLES[id];
  const accent = ducati ? 0xe74536 : 0x7cc838;
  wheel(root, 'wheel_f', 0, -wb / 2, ducati ? .30 : .315, .13, accent);
  wheel(root, 'wheel_r', 0, wb / 2, ducati ? .31 : .315, .19, accent);
  // The frame is open around the two wheels; fairings sit above and between them.
  box(root, [0, .47, .02], [.34, .30, .56], DARK);
  fairing(root, MOTORCYCLE_FAIRING_WIDTH, [[-.96, .68], [-.88, .96], [-.54, 1.08], [-.23, .88], [.08, .67], [-.10, .34], [-.56, .36]], color);
  fairing(root, .30, [[.02, .70], [.27, .83], [.72, .84], [.89, .70], [.35, .61]], color);
  box(root, [0, .86, .27], [.27, .08, .41], DARK); // seat
  const seat = new T.Object3D(); seat.name = 'seat_driver'; seat.position.set(0, .90, .27); root.add(seat);
  fairing(root, .23, [[-.79, .96], [-.69, ducati ? 1.12 : 1.125], [-.46, 1.07], [-.45, .94]], GLASS);
  for (const side of [-1, 1]) {
    bar(root, [side * .10, .31, -wb / 2], [side * .16, .89, -.52], .055, SILVER, .7);
    bar(root, [side * .11, .31, wb / 2], [side * .16, .48, .10], .06, ducati ? SILVER : accent, .6);
    bar(root, [side * .12, .91, -.52], [side * (ducati ? .34 : .365), .93, -.48], .038, DARK);
    box(root, [side * .26, .74, -.56], [.16, .035, .25], color);
    if (!ducati) {
      bar(root, [side * .22, .39, .18], [side * .22, .70, -.18], .035, accent);
      bar(root, [side * .22, .39, .18], [side * .22, .65, .25], .035, accent);
    }
  }
  box(root, [0, .72, -.965], [ducati ? .28 : .12, .055, .026], LIGHT);
  box(root, [0, .75, .875], [.19, .045, .03], RED_LIGHT);
  // Helmet, tucked torso and limbs keep the bike recognizable from above.
  const rider = new T.Group(); rider.name = 'rider'; root.add(rider);
  const helmet = new T.Mesh(sphere, material(ducati ? 0xe0e3e3 : 0x263b34, .4));
  helmet.position.set(0, 1.35, -.27); helmet.scale.set(.15, .16, .16); rider.add(helmet);
  box(rider, [0, 1.34, -.415], [.21, .07, .035], GLASS);
  bar(rider, [0, .93, .20], [0, 1.20, -.14], .23, DARK);
  for (const side of [-1, 1]) {
    bar(rider, [side * .12, 1.14, -.13], [side * .24, .94, -.48], .07, DARK);
    bar(rider, [side * .12, .91, .20], [side * .18, .57, .34], .09, DARK);
  }
  return root;
}

/** Build once per model; createVehicle batches and shares this scene graph. */
export function buildLuxuryModel(id: LuxuryVehicleId): T.Group {
  return id === 'ducati-panigale-v4' || id === 'kawasaki-ninja-h2-carbon' ? buildBike(id) : buildCar(id);
}
