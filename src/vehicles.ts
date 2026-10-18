import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coachwork, loft } from './coachwork';
import { VEHICLES, type VehicleId, type VehicleSpec } from '../shared/vehicles';
import { THRUSTER_REAR, THRUSTER_DOWN_LEFT, THRUSTER_DOWN_RIGHT, THRUSTER_SIDE_LEFT, THRUSTER_SIDE_RIGHT } from '../shared/game';

// Geometry and materials belong to the fleet, not individual entities: never dispose
// them when removing a single car. No external models, textures, or brand logos.
const materials = new Map<string, T.MeshStandardMaterial>();
const geometries = new Map<string, T.BufferGeometry>();
const cube = new T.BoxGeometry(1, 1, 1);
const tire = new T.CylinderGeometry(1, 1, 1, 32);
const hub = new T.CylinderGeometry(1, 1, 1, 24);
const head = new T.SphereGeometry(.25, 8, 6);
const nozzleRing = new T.TorusGeometry(.095,.018,8,20);
const nozzleCore = new T.CylinderGeometry(.078,.078,.022,20);
const paintCache=new Map<number,T.MeshPhysicalMaterial>();
function paint(color:number){if(!paintCache.has(color))paintCache.set(color,new T.MeshPhysicalMaterial({color,metalness:.42,roughness:.28,clearcoat:1,clearcoatRoughness:.16}));return paintCache.get(color)!;}
// A soft translucent cloud rather than a combustion flame. Shared across clones.
const vaporPixels=new Uint8Array(32*32*4);
for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const i=(y*32+x)*4,r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);
  vaporPixels[i]=226;vaporPixels[i+1]=243;vaporPixels[i+2]=248;vaporPixels[i+3]=Math.round(150*Math.pow(Math.max(0,1-r),2));
}
const vaporTexture=new T.DataTexture(vaporPixels,32,32,T.RGBAFormat);vaporTexture.needsUpdate=true;
const vaporMaterial=new T.SpriteMaterial({map:vaporTexture,transparent:true,depthWrite:false,opacity:.9});
const DARK = 0x17272f, GLASS = 0x284954, WHITE = 0xe6eeeb;

export function material(color: number, metalness = .1) {
  const key = `${color}:${metalness}`;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: color === GLASS ? .19 : .38, metalness, flatShading: false }));
  return materials.get(key)!;
}
export function box(parent: T.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const mesh = new T.Mesh(cube, material(color));
  mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

function nozzle(root:T.Group,jets:T.Group,name:string,x:number,y:number,z:number,direction:T.Vector3){
  const mount=new T.Group();mount.name=`nozzle_${name}`;mount.position.set(x,y,z);
  mount.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);
  const rim=new T.Mesh(nozzleRing,material(0xb2c2c6,.8));rim.rotation.x=Math.PI/2;mount.add(rim);
  const core=new T.Mesh(nozzleCore,material(0x10191e,.35));mount.add(core);root.add(mount);
  const plume=new T.Group();plume.name=`plume_${name}`;plume.position.copy(mount.position);plume.quaternion.copy(mount.quaternion);plume.visible=false;
  for(let i=0;i<4;i++){
    const cloud=new T.Sprite(vaporMaterial);cloud.position.y=.2+i*.38;cloud.scale.setScalar(.35+i*.17);plume.add(cloud);
  }
  jets.add(plume);
}

/** Snapshot flags describe arcade effects, not the prototype's real control law. */
export function setThrusterEffects(root:T.Object3D,mask:number,time:number){
  const jets=root.getObjectByName('jets');if(!jets)return;
  jets.visible=mask!==0;
  for(const child of jets.children){
    const name=child.name;
    const flag=name.startsWith('plume_rear')?THRUSTER_REAR:name.startsWith('plume_down_l')?THRUSTER_DOWN_LEFT:name.startsWith('plume_down_r')?THRUSTER_DOWN_RIGHT:name==='plume_side_l'?THRUSTER_SIDE_LEFT:THRUSTER_SIDE_RIGHT;
    child.visible=!!(mask&flag);
    child.scale.setScalar(.92+.08*Math.sin(time*19+child.position.z*3));
  }
}

/** Add visible fictional retrofit hardware to a vehicle when its shared kit is installed. */
export function addRocketKit(root:T.Group,kind:VehicleId){
  if(root.getObjectByName('rocket-kit'))return;
  const spec=VEHICLES[kind],w=spec.width,l=spec.length;
  const kit=new T.Group();kit.name='rocket-kit';root.add(kit);
  const jets=root.getObjectByName('jets') as T.Group;
  for(const side of [-1,1]){
    const label=side<0?'l':'r';
    box(kit,side*w*.39,.34,l*.47,.32,.3,.35,0x9b7be8);
    nozzle(kit,jets,`rear_${label}`,side*w*.39,.34,l*.52,new T.Vector3(0,0,1));
    for(const [end,z] of [['f',-l*.33],['r',l*.33]] as const)
      nozzle(kit,jets,`down_${label}_${end}`,side*w*.38,.2,z,new T.Vector3(0,-1,0));
    nozzle(kit,jets,`side_${label}`,side*w*.5,.48,-l*.35,new T.Vector3(side,0,0));
  }
}

/** Reconcile cached meshes when an entity ID is reused by a new session. */
export function setRocketKit(root:T.Group,kind:VehicleId,installed:boolean){
  if(installed)addRocketKit(root,kind);
  const kit=root.getObjectByName('rocket-kit');if(kit)kit.visible=installed;
}

/** A low-poly side silhouette extruded across X. Profile tuples are [Z,Y]. */
function profile(parent: T.Object3D, width: number, points: [number, number][], color: number) {
  const key = JSON.stringify([width, points]);
  let geometry = geometries.get(key);
  if (!geometry) {
    const shape = new T.Shape();
    points.forEach(([z, y], i) => i ? shape.lineTo(z, y) : shape.moveTo(z, y));
    shape.closePath();
    geometry = new T.ExtrudeGeometry(shape, { depth: width - .06, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 3, steps: 1 });
    // Local shape XY -> vehicle ZY, extrusion Z -> vehicle -X.
    geometry.rotateY(-Math.PI / 2); geometry.translate(width / 2 - .03, 0, 0);
    geometries.set(key, geometry);
  }
  const mesh = new T.Mesh(geometry, material(color, .28)); parent.add(mesh); return mesh;
}

function wheels(root: T.Group, spec: VehicleSpec) {
  const radius = spec.shape === 'semi' || spec.shape === 'bus' ? .5 : spec.shape === 'pickup' ? .44 : spec.shape === 'pod' ? .32 : .35;
  for (const side of [-1, 1]) for (const axle of [-1, 1]) {
    const assembly = new T.Group();
    assembly.name = `wheel_${axle < 0 ? 'f' : 'r'}${side < 0 ? 'l' : 'r'}`;
    assembly.position.set(side * (spec.width / 2 - .09), radius, axle * spec.wheelbase / 2);
    const rubber = new T.Mesh(tire, material(DARK)); rubber.rotation.z = Math.PI / 2; rubber.scale.set(radius, .24, radius); assembly.add(rubber);
    const disk = new T.Mesh(hub, material(spec.id.includes('cybercab') ? spec.color : 0xa6b6b8, .5));
    disk.rotation.z = Math.PI / 2; disk.scale.set(radius * .65, .255, radius * .65); assembly.add(disk);
    const rim=new T.Mesh(new T.TorusGeometry(radius*.73,.025,6,32),material(0xc4cbd0,.7));rim.rotation.y=Math.PI/2;rim.position.x=side*.135;assembly.add(rim);
    for(let j=0;j<5;j++){
      const spoke=box(assembly,side*.14,0,0,.035,radius*1.22,.035,0x89949e);spoke.rotation.x=j*Math.PI/5;
    }
    root.add(assembly);
  }
  if (spec.shape === 'semi') for (const side of [-1, 1]) {
    const extra = new T.Mesh(tire, material(DARK)); extra.rotation.z = Math.PI / 2;
    extra.scale.set(radius, .32, radius); extra.position.set(side * (spec.width / 2 - .1), radius, spec.wheelbase / 2 - 1.1); root.add(extra);
  }
}

function sensors(root: T.Group, spec: VehicleSpec) {
  const { width: w, height: h, length: l } = spec;
  if (spec.sensorRig === 'roof') {
    box(root, 0, h + .06, 0, w * .72, .12, .5, DARK);
    const dome = new T.Mesh(hub, material(WHITE)); dome.scale.set(.24, .3, .24); dome.position.set(0, h + .25, 0); root.add(dome);
    for (const side of [-1, 1]) box(root, side * w * .37, h + .18, 0, .21, .25, .28, DARK);
  } else if (spec.sensorRig === 'corners') {
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      box(root, side * w * .46, h - .08, end * l * .38, .21, .32, .24, DARK);
    }
  }
}

/** Original stylized models. Ground-centered pivot; -Z front; SI dimensions. */
const templates=new Map<string,T.Group>();
export function createVehicle(kind:VehicleId|'person'):T.Group {
  if(!templates.has(kind)){
    const template=buildVehicle(kind);
    const batch=(group:T.Group)=>{
      const buckets=new Map<T.Material,T.Mesh[]>();
      for(const child of [...group.children]){
        if(child instanceof T.Group)batch(child);
        if(child instanceof T.Mesh&&!child.name&&!Array.isArray(child.material)){
          const meshes=buckets.get(child.material)??[];meshes.push(child);buckets.set(child.material,meshes);
        }
      }
      for(const [mat,meshes] of buckets)if(meshes.length>1){
        const parts=meshes.map(mesh=>{mesh.updateMatrix();const part=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();part.deleteAttribute('uv');return part.applyMatrix4(mesh.matrix);});
        const merged=mergeGeometries(parts);parts.forEach(part=>part.dispose());
        if(merged){meshes.forEach(mesh=>group.remove(mesh));group.add(new T.Mesh(merged,mat));}
      }
    };
    batch(template);templates.set(kind,template);
  }
  return templates.get(kind)!.clone(true);
}
function buildVehicle(kind: VehicleId | 'person'): T.Group {
  const root = new T.Group(); root.name = kind;
  if (kind === 'person') {
    box(root, 0, 1, 0, .65, 1, .4, 0xf5b94b);
    const face = new T.Mesh(head, material(0xd5a786)); face.position.y = 1.75; root.add(face);
    box(root, -.18, .3, 0, .22, .6, .25, 0x253544); box(root, .18, .3, 0, .22, .6, .25, 0x253544);
    return root;
  }
  const spec = VEHICLES[kind];
  const { length: l, width: w, height: h, color, shape } = spec;
  const id = String(kind);
  const zoox = id.includes('zoox') && shape === 'pod';
  const firefly = id.includes('firefly');
  const origin = id.includes('origin');
  const cybercab = id.includes('cybercab');
  const classic = shape === 'roadster' && (id.includes('2008') || id.includes('original') || id.includes('classic'));
  const belt = shape === 'pod' || shape === 'bus' ? h * .43 : shape === 'semi' ? .95 : h * .48;
  box(root, 0, .36, 0, w * .9, .22, l * .9, DARK);

  if (shape === 'pickup') {
    profile(root, w, [[-l / 2, .47], [-l / 2, .88], [-l * .08, h], [l / 2, h * .56], [l / 2, .47]], color);
    profile(root, w * 1.006, [[-l * .32, 1.28], [-l * .08, h + .01], [l * .22, h * .75], [l * .22, 1.03]], GLASS);
    // Windshield follows the exterior roof plane rather than hiding inside it.
    const glassFrontY=.88+(h-.88)*(.16/.42),glassRise=h-glassFrontY;
    const windshield=box(root,0,(h+glassFrontY)/2+.025,-l*.21,w*.88,.035,Math.hypot(l*.26,glassRise),GLASS);
    windshield.rotation.x=-Math.atan2(glassRise,l*.26);
    const tonneau=box(root,0,h*.685+.025,l*.34,w*.79,.035,l*.25,DARK);
    tonneau.rotation.x=Math.atan2(h*.44,l*.58);
    box(root, 0, .93, -l / 2 - .015, w * .93, .065, .03, WHITE);
  } else if (shape === 'semi' && id !== 'tesla-semi') {
    // Conventional Waymo Via tractor: long bonnet, upright sleeper cab.
    box(root, 0, .65, 0, w * .87, .32, l, DARK);
    profile(root, w * .77, [[-l / 2, .8], [-l / 2, 1.55], [-l * .22, 1.8], [-l * .22, .8]], color);
    profile(root, w, [[-l * .24, .8], [-l * .24, h * .78], [-l * .12, h], [l * .15, h], [l * .19, .8]], color);
    box(root, 0, h * .65, -l * .245, w * .85, h * .23, .04, GLASS);
    box(root, 0, 1.08, -l / 2 - .025, w * .57, .7, .04, 0x8c9da0);
    if (id.includes('peterbilt')) for (const side of [-1, 1]) box(root, side * w * .44, h * .53, l * .07, .12, h * .76, .12, 0xa6b6b8);
  } else if (shape === 'semi') {
    profile(root, w, [[-l / 2, .5], [-l / 2, h * .58], [-l * .36, h], [-l * .02, h], [l * .05, .8], [l / 2, .8], [l / 2, .5]], color);
    profile(root, w * 1.005, [[-l * .49, h * .6], [-l * .36, h * .89], [-l * .08, h * .89], [-l * .04, h * .6]], GLASS);
    box(root, 0, .94, l * .26, w * .65, .14, l * .2, DARK);
  } else if (shape === 'pod' || shape === 'bus') {
    // Rounded bidirectional shuttles; Firefly has a much narrower egg-shaped nose.
    const ends=firefly?.66:.88;
    root.add(new T.Mesh(loft([
      [-l*.5,w*ends/2,.4,belt],[-l*.46,w*.48,.3,belt+.04],[-l*.34,w*.5,.28,belt+.06],
      [0,w*.5,.28,belt+.06],[l*.34,w*.5,.28,belt+.06],[l*.46,w*.48,.3,belt+.04],[l*.5,w*ends/2,.4,belt],
    ],firefly?.8:.35),paint(color)));
    root.add(new T.Mesh(loft([
      [-l*.467,w*.448,belt,h*.74],[-l*.35,w*.48,belt,h*.91],[0,w*.484,belt,h*.94],
      [l*.35,w*.48,belt,h*.91],[l*.467,w*.448,belt,h*.74],
    ],.4),material(GLASS,.5)));
    root.add(new T.Mesh(loft([[-l*.35,w*.46,h*.91,h*.96],[0,w*.47,h*.94,h],[l*.35,w*.46,h*.91,h*.96]],.4),paint(color)));
    for (const side of [-1, 1]) {
      box(root, side * w * .507, h * .51, 0, .025, h * .76, .035, color);
      box(root, side * w * .509, h * .52, -.12, .03, .18, .04, WHITE);
      if (shape === 'bus') for (let z = -.3; z <= .3; z += .15) box(root, side * w * .51, h * .71, l * z, .02, h * .35, .055, color);
    }
    if (zoox) for (const end of [-1, 1]) box(root, 0, .8, end * (l / 2 + .015), w * .8, .16, .03, DARK);
    if (firefly) {
      for (const side of [-1, 1]) {
        const eye = new T.Mesh(hub, material(WHITE)); eye.rotation.x = Math.PI / 2; eye.scale.set(.18, .03, .18); eye.position.set(side * w * .3, .8, -l / 2 - .02); root.add(eye);
      }
      box(root, 0, .58, -l / 2 - .02, w * .3, .06, .035, DARK);
    }
  } else {
    coachwork(root,spec,paint(color),material(GLASS,.55),material(DARK));

  }

  if (id.includes('lexus')) {
    box(root, 0, .57, -l / 2 - .03, w * .37, .33, .04, DARK);
  }
  if (id.includes('prius')) box(root, 0, belt + .2, l * .35, w * .77, .06, .19, DARK);
  if (id.includes('ipace')) box(root, 0, .57, -l / 2 - .03, w * .48, .22, .04, DARK);
  // Family markings without copied logos; sensors remain obvious at driving distance.
  if (id.includes('cruise') || origin) for (const side of [-1, 1]) box(root, side * w * .51, belt * .82, 0, .025, .25, l * .68, 0xef6a37);
  if (id.includes('waymo')) for (const side of [-1, 1]) box(root, side * w * .51, belt * .82, l * .12, .025, .17, l * .28, 0x73c4bd);
  if (id.includes('ioniq')) {
    for (const side of [-1, 1]) for (const pixel of [-1, 1]) box(root, side * w * .31 + pixel * .09, belt, -l / 2 - .025, .13, .13, .03, WHITE);
  } else if (!firefly && shape !== 'pickup' && shape !== 'roadster') for (const side of [-1, 1]) box(root, side * w * .33, Math.max(.6, belt), -l / 2 - .025, w * .22, .09, .03, WHITE);
  if(id==='roadster'){
    box(root,0,h*.56,l*.493,w*.78,.055,.035,0xe9483c);
    box(root,0,h*.72,l*.39,w*.84,.045,.28,DARK);
  }else for (const side of [-1, 1]) box(root, side * w * .33, Math.max(.6, belt), l / 2 + .025, w * .23, .09, .03, 0xe9483c);
  if(shape==='roadster'){
    for(const side of [-1,1]){
      const lamp=box(root,side*w*.25,h*.49,-l*.47,w*.18,.025,.1,WHITE);lamp.rotation.y=side*.24;
      box(root,side*w*.26,.37,-l*.493,w*.18,.09,.05,DARK);
    }
    box(root,0,.28,-l*.495,w*.72,.045,.14,DARK);
    box(root,0,.36,l*.485,w*.6,.15,.04,DARK);
  }
  wheels(root, spec); sensors(root, spec);
  const jets = new T.Group(); jets.name = 'jets'; jets.visible = false;
  if (spec.airThrusters) {
    // The four rear, four corner and two front lateral nozzles follow the
    // reported arrangement. Shapes and activation are artistic estimates.
    for(const z of [-l*.18,l*.18]){
      const fan=new T.Mesh(hub,material(DARK));fan.scale.set(.38,.035,.38);fan.position.set(0,.12,z);root.add(fan);
      for(const angle of [0,Math.PI/2]){const blade=box(root,0,.075,z,.6,.025,.045,0x82969a);blade.rotation.y=angle;}
    }
    box(root,0,.32,l*.498,w*.76,.24,.035,0x10191e);
    for(let i=0;i<4;i++)nozzle(root,jets,`rear_${i}`,(i-1.5)*w*.16,.33,l*.51,new T.Vector3(0,0,1));
    for(const side of [-1,1]){
      const label=side<0?'l':'r';
      for(const [end,z] of [['f',-l*.33],['r',l*.33]] as const)
        nozzle(root,jets,`down_${label}_${end}`,side*w*.38,.2,z,new T.Vector3(0,-1,0));
      nozzle(root,jets,`side_${label}`,side*w*.5,.48,-l*.35,new T.Vector3(side,0,0));
    }
  }
  root.add(jets);
  const seat = new T.Object3D(); seat.name = 'seat_driver'; seat.position.set(-w * .2, belt + .2, 0); root.add(seat);
  return root;
}
