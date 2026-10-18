import * as T from 'three';
import type { Entity } from '../shared/game';
const materials = new Map<number, T.MeshStandardMaterial>();
export function material(color: number, metalness = .1) {
  if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({color,roughness:.65,metalness}));
  return materials.get(color)!;
}
export function box(parent: T.Object3D, x: number,y: number,z: number,w: number,h: number,d: number,color: number) {
  const mesh = new T.Mesh(new T.BoxGeometry(w,h,d),material(color)); mesh.position.set(x,y,z); parent.add(mesh); return mesh;
}
/** Replace visual internals freely. Root origin is ground center, forward is -Z. */
export function createVehicle(kind: Entity['kind']): T.Group {
  const root = new T.Group(); root.name = kind;
  if (kind === 'person') {
    box(root,0,1,0,.65,1,.4,0xf5b94b);
    const head = new T.Mesh(new T.SphereGeometry(.25,8,6),material(0xd5a786)); head.position.y=1.75; root.add(head);
    box(root,-.18,.3,0,.22,.6,.25,0x253544); box(root,.18,.3,0,.22,.6,.25,0x253544); return root;
  }
  const truck = kind === 'truck', roadster = kind === 'roadster';
  const color = roadster ? 0xf04d35 : truck ? 0x98abb1 : 0xe7bb69;
  box(root,0,.6,0,2,.6,truck?4.9:4.5,color);
  box(root,0,.38,0,1.9,.24,4.3,0x182831);
  box(root,0,1.02,truck?-.6:.1,1.65,.6,truck?2:2.1,0x233e49);
  box(root,0,1.36,truck?-.6:.2,1.7,.09,truck?2.1:1.5,color);
  if (truck) box(root,0,.95,1.6,1.85,.25,1.5,0x60747a);
  else {
    const hood = box(root,0,.88,-1.55,1.9,.12,1.25,color); hood.rotation.x=-.09;
    box(root,0,.98,1.9,2,.1,.24,0x202d32);
  }
  [-1,1].forEach(x => {
    [-1.4,1.4].forEach(z => {
      const wheel = new T.Mesh(new T.CylinderGeometry(.48,.48,.28,12),material(0x172126)); wheel.rotation.z=Math.PI/2; wheel.position.set(x,.48,z); root.add(wheel);
      const hub = new T.Mesh(new T.CylinderGeometry(.27,.27,.3,8),material(0xb9c2c3)); hub.rotation.z=Math.PI/2; hub.position.copy(wheel.position); root.add(hub);
    });
    box(root,x*.72,.76,-2.26,.42,.12,.035,0xf7f0d1);
    box(root,x*.72,.76,2.26,.5,.1,.035,0xe94032);
  });
  const jets = new T.Group(); jets.name='jets';
  [-.65,.65].forEach(x => {
    const jet = new T.Mesh(new T.ConeGeometry(.22,1.8,8),new T.MeshBasicMaterial({color:0x8feaff,transparent:true,opacity:.75})); jet.rotation.z=Math.PI; jet.position.set(x,-.55,1); jets.add(jet);
  });
  root.add(jets); jets.visible=false;
  return root;
}
