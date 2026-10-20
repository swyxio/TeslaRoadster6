import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLES } from '../shared/vehicles';
import { loft } from './coachwork';
import { box, setVehicleDistantOverride } from './vehicles';

let roadsterTemplate:T.Group|undefined;
let distantRoadsterTemplate:T.Mesh|undefined;

/**
 * Original, Roadster-inspired lab body. The geometry belongs to the shared
 * template; the named wheels, seat, hardware and physics remain on the car.
 */
export function applyRoadster2026(root:T.Group) {
  for(const child of [...root.children])if(child instanceof T.Mesh&&!child.name)root.remove(child);
  if(!roadsterTemplate){
    const {length:l,width:w,height:h,wheelbase}=VEHICLES.roadster;
    const group=new T.Group();group.name='roadster-2026-body';
    const pearl=new T.MeshPhysicalMaterial({color:0xf0efea,metalness:.36,roughness:.24,clearcoat:1,clearcoatRoughness:.16});
    const glass=new T.MeshPhysicalMaterial({color:0x29373a,metalness:.45,roughness:.16,clearcoat:1,clearcoatRoughness:.1});
    const sections:[number,number,number,number][]=[
      [-.50,.78,.30,.43],[-.46,.91,.25,.49],[-.31,1,.23,.65],[-.14,.96,.23,.69],
      [.08,.97,.23,.71],[.30,1,.24,.77],[.43,.98,.27,.75],[.49,.91,.30,.69],[.50,.88,.34,.68],
    ].map(([z,x,b,t])=>[z*l,x*w/2,b,t]);
    const dense:[number,number,number,number][]=[];
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<6;j++)dense.push(sections[i].map((v,k)=>v+(sections[i+1][k]-v)*j/6) as [number,number,number,number]);
    dense.push(sections[sections.length-1]);
    const body=loft(dense,.35,28).clone(),p=body.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),y=p.getY(i),delta=Math.min(Math.abs(z-wheelbase/2),Math.abs(z+wheelbase/2));
      if(Math.abs(x)>w*.34&&delta<.395&&y<.62)p.setY(i,Math.max(y,.35+Math.sqrt(Math.max(0,.395**2-delta**2))));
    }
    body.computeVertexNormals();
    const shell=new T.Mesh(body,pearl);shell.name='2026-shell';group.add(shell);

    // A longer raked windshield and fastback rear give the cockpit a sports-car
    // silhouette. The glass is opaque: the game has no modeled interior here.
    const canopySections:[number,number,number,number][]=[
      [-l*.28,w*.34,.64,.65],[-l*.21,w*.36,.65,.76],[-l*.12,w*.34,.68,h*.92],
      [-l*.04,w*.32,.69,h*.99],[l*.10,w*.32,.70,h],[l*.19,w*.33,.70,h*.94],
      [l*.30,w*.36,.70,.78],[l*.36,w*.35,.70,.71],
    ];
    group.add(new T.Mesh(loft(canopySections,.45,24),glass));
    // White roof spine and pillars frame the dark panoramic canopy.
    const roof=new T.Mesh(loft([[-l*.09,w*.245,h*.92,h*.932],[-l*.035,w*.25,h*.991,h*1.003],[l*.10,w*.25,h*1.001,h*1.013],[l*.16,w*.25,h*.962,h*.973]],.55,16),pearl);
    roof.name='2026-roof';group.add(roof);
    const fanGeometry=new T.CylinderGeometry(.32,.32,.04,16),fanMaterial=new T.MeshStandardMaterial({color:0x20282a,metalness:.6,roughness:.35});
    for(const z of [-l*.23,l*.23]){const fan=new T.Mesh(fanGeometry,fanMaterial);fan.name='2026-lift-fan';fan.position.set(0,.14,z);group.add(fan);}
    for(const side of [-1,1]){
      // Dark rocker and a sharply raked side intake break up the plain side.
      box(group,side*w*.49,.29,.03,.035,.11,l*.56,0x152025);
      const intake=box(group,side*w*.493,.44,l*.22,.035,.09,l*.23,0x152025);intake.rotation.x=-.11;
      box(group,side*w*.492,.64,l*.04,.025,.018,.17,0x222b2d);
      const mirror=box(group,side*w*.48,.76,-l*.16,.18,.055,.14,0x202c30);mirror.rotation.y=side*.18;
      // A thin strip at the shoulders keeps the rear deck legible at chase view.
      const edge=box(group,side*w*.39,.735,l*.40,w*.16,.025,l*.16,0xe6e5e0);edge.rotation.y=-side*.10;
    }
    // Dark recessed fascia, full-width light bar and diffuser fins. The actual
    // four nozzles are the pre-existing articulated rocket hardware, not copies.
    box(group,0,.535,l*.503,w*.86,.30,.035,0x11191c);
    box(group,0,.672,l*.514,w*.84,.045,.012,0xe9483c);
    box(group,0,.23,l*.497,w*.80,.10,.075,0x11191c);
    for(const x of [-.30,-.15,0,.15,.30])box(group,x*w,.22,l*.466,.025,.13,.29,0x11191c);
    box(group,0,.31,-l*.50,w*.76,.09,.04,0x121a1e);
    for(const side of [-1,1]){
      const lamp=box(group,side*w*.28,.46,-l*.49,w*.22,.025,.045,0xd5e0df);lamp.rotation.y=side*.10;
    }

    // Batch decorative rigid pieces once by material. The paint shell and
    // named fan meshes remain separate so finishes and existing tests work.
    const buckets=new Map<T.Material,T.Mesh[]>();
    for(const child of [...group.children])if(child instanceof T.Mesh&&!child.name&&!Array.isArray(child.material)){
      const parts=buckets.get(child.material)??[];parts.push(child);buckets.set(child.material,parts);
    }
    for(const [mat,meshes] of buckets)if(meshes.length>1){
      const parts=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.deleteAttribute('uv');return geometry.applyMatrix4(mesh.matrix);});
      const merged=mergeGeometries(parts);parts.forEach(part=>part.dispose());
      if(merged){meshes.forEach(mesh=>group.remove(mesh));group.add(new T.Mesh(merged,mat));}
    }
    roadsterTemplate=group;

    // Distant Roadsters use a single shared draw, retaining the pearl fastback.
    const parts:T.BufferGeometry[]=[];
    const addPart=(geometry:T.BufferGeometry,color:number)=>{
      const part=geometry.index?geometry.toNonIndexed():geometry;
      if(part!==geometry)geometry.dispose();
      part.deleteAttribute('uv');
      const shade=new T.Color(color),values=new Float32Array(part.getAttribute('position').count*3);
      for(let i=0;i<values.length;i+=3){values[i]=shade.r;values[i+1]=shade.g;values[i+2]=shade.b;}
      part.setAttribute('color',new T.BufferAttribute(values,3));parts.push(part);
    };
    addPart(loft(sections,.35,8).clone(),0xf0efea);
    addPart(loft(canopySections,.45,8).clone(),0x29373a);
    for(const side of [-1,1])for(const end of [-1,1]){
      const wheel=new T.CylinderGeometry(.35,.35,.2,8);wheel.rotateZ(Math.PI/2);wheel.translate(side*w*.45,.35,end*wheelbase/2);addPart(wheel,0x171d20);
    }
    const distantGeometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());
    if(!distantGeometry)throw new Error('Could not create the SF lab Roadster LOD');
    distantRoadsterTemplate=new T.Mesh(distantGeometry,new T.MeshStandardMaterial({vertexColors:true,metalness:.25,roughness:.5}));
  }
  const model=roadsterTemplate.clone(true);
  const shell=model.getObjectByName('2026-shell') as T.Mesh;
  shell.userData.originalVehiclePaint=shell.material;
  const roof=model.getObjectByName('2026-roof') as T.Mesh;
  roof.userData.originalVehiclePaint=roof.material;
  setVehicleDistantOverride(root,distantRoadsterTemplate!);
  root.add(model);root.userData.sfFidelityRoadster=true;
}
