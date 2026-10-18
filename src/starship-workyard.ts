import * as T from 'three';
import { FREMONT_SPACEPORT as site } from '../shared/map';
import { box, material } from './vehicles';

/** Decorative activity in the open ground between the factory and the pad. */
export function createStarshipWorkyard(scene:T.Scene):{update(seconds:number,active:boolean):void} {
  const fixed=new T.Group(),crew=new T.Group();
  fixed.name='starship-workyard';crew.name='starship-workyard-crew';
  scene.add(fixed,crew);
  // Both geometries and the project's cached materials are reused by every prop.
  const cylinder=new T.CylinderGeometry(1,1,1,12);
  const coneGeometry=new T.ConeGeometry(1,1,8);
  const ball=new T.SphereGeometry(1,10,6);
  const round=(parent:T.Object3D,x:number,y:number,z:number,r:number,h:number,color:number)=>{
    const mesh=new T.Mesh(cylinder,material(color));
    mesh.position.set(x,y,z);mesh.scale.set(r,h,r);parent.add(mesh);return mesh;
  };
  const sphere=(parent:T.Object3D,x:number,y:number,z:number,r:number,color:number)=>{
    const mesh=new T.Mesh(ball,material(color));
    mesh.position.set(x,y,z);mesh.scale.setScalar(r);parent.add(mesh);return mesh;
  };
  const factoryEast=site.factory.x+site.factory.w/2;
  const padWest=site.pad.x-site.pad.w/2;

  // Two imaginary propellant tanks, with piping and red warning bands.
  for(const x of [factoryEast+9,factoryEast+18]){
    const z=site.pad.z-28;
    round(fixed,x,5.7,z,2.55,10.2,0xdde3dc);
    const cap=sphere(fixed,x,10.8,z,2.55,0xdde3dc);cap.scale.y=.38;
    round(fixed,x,2.4,z,2.59,.35,0xc35c3e);
    round(fixed,x,.45,z,2.8,.9,0x57686a);
    box(fixed,x+2.8,5,z,.35,9,.35,0x65777b);
    box(fixed,x+1.8,9.3,z,2.2,.35,.35,0x65777b);
  }
  // A small rocket section waits on supports for the welding crew.
  const part=round(fixed,padWest-6.5,1.35,site.pad.z-1,1.15,4,0xb8c8c8);
  part.rotation.z=Math.PI/2;
  for(const x of [padWest-8,padWest-5])box(fixed,x,.65,site.pad.z-1,.45,1.3,2.5,0xc58036);

  const wheels=(parent:T.Group,xs:number[],z:number,r=.58)=>{
    const result:T.Mesh[]=[];
    for(const x of xs)for(const side of [-1,1]){
      const wheel=round(parent,x,r,side*z,r,.32,0x28373a);wheel.rotation.x=Math.PI/2;result.push(wheel);
    }
    return result;
  };

  // A short flatbed carries a silver cylindrical rocket section along one lane.
  const transporter=new T.Group();transporter.name='starship-parts-transporter';crew.add(transporter);
  box(transporter,0,1.05,0,7.3,.65,2.5,0x495b5d);
  box(transporter,2.5,1.85,0,2.1,1.55,2.4,0xc97733);
  box(transporter,2.65,2.15,0,1.3,.7,2.46,0x547d82);
  const cargo=round(transporter,-1,2.05,0,1.1,4.1,0xc5d1d0);cargo.rotation.z=Math.PI/2;
  for(const x of [-2.4,.4])box(transporter,x,2.1,0,.18,2.25,2.3,0x6f8081);
  const transporterWheels=wheels(transporter,[-2.4,2.3],1.25);

  // Compact forklift and its load move in a separate lane.
  const forklift=new T.Group();forklift.name='starship-forklift';crew.add(forklift);
  box(forklift,-.25,.9,0,3.1,1.15,1.9,0xe2a13a);
  box(forklift,-1.35,1.15,0,.7,1.35,1.9,0x8c733e);
  for(const x of [-1.1,.35])for(const z of [-.83,.83])box(forklift,x,2.1,z,.16,2,.16,0x33494d);
  box(forklift,-.38,3.05,0,1.75,.18,1.9,0x33494d);
  box(forklift,.98,1.75,0,.2,2.9,1.95,0x34494b);
  for(const z of [-.65,.65])box(forklift,1.8,.55,z,1.55,.18,.22,0x34494b);
  box(forklift,1.85,1.05,0,1.4,.8,1.55,0xc9d2c8);
  box(forklift,1.85,1.05,0,.16,.84,1.6,0x758583);
  const forkliftWheels=wheels(forklift,[-1,.7],1,.44);

  type Worker={group:T.Group;leftArm:T.Group;rightArm:T.Group;leftLeg:T.Group;rightLeg:T.Group};
  const worker=(vest:number):Worker=>{
    const group=new T.Group();crew.add(group);
    box(group,0,1.24,0,.65,.82,.38,vest);
    box(group,0,1.27,.2,.67,.12,.03,0xf8e5a4);
    round(group,0,1.83,0,.26,.42,0xc69268);
    round(group,0,2.08,0,.31,.18,0xf2c357);
    round(group,0,2,0,.36,.07,0xf2c357);
    const limb=(x:number,y:number,color:number)=>{
      const joint=new T.Group();joint.position.set(x,y,0);group.add(joint);
      box(joint,0,-.25,0,.21,.55,.23,color);return joint;
    };
    return {group,leftArm:limb(-.43,1.55,vest),rightArm:limb(.43,1.55,vest),
      leftLeg:limb(-.19,.82,0x344d55),rightLeg:limb(.19,.82,0x344d55)};
  };
  const carrier=worker(0xe48637);carrier.group.name='starship-parts-worker';
  const carried=round(carrier.group,0,1.28,.58,.34,1.3,0xc5d1d0);carried.rotation.z=Math.PI/2;
  const spotter=worker(0xd2a33d);spotter.group.name='starship-spotter';
  const welder=worker(0xc67939);welder.group.name='starship-welder';
  welder.group.position.set(padWest-10,0,site.pad.z-1);welder.group.rotation.y=Math.PI/2;
  const tool=box(welder.rightArm,0,-.55,.2,.15,.2,.65,0x34494b);
  tool.rotation.x=-.6;
  const spark=sphere(welder.rightArm,0,-.6,.55,.12,0xffdb79);

  // Small cones mark the yard; they do not create any gameplay obstacle.
  for(const [x,z] of [[factoryEast+7,site.pad.z-6],[padWest-4,site.pad.z-9],
    [factoryEast+7,site.pad.z+8],[padWest-4,site.pad.z+8]]){
    round(fixed,x,.15,z,.43,.3,0x3d4b48);
    const cone=new T.Mesh(coneGeometry,material(0xe88e39));cone.position.set(x,.57,z);cone.scale.set(.28,.75,.28);fixed.add(cone);
    round(fixed,x,.63,z,.25,.13,0xf5e8bf);
  }

  // Modulo before applying offsets keeps even negative/very large times bounded.
  const phase=(seconds:number,period:number)=>{
    const value=Number.isFinite(seconds)?seconds%period:0;
    return (value+period)%period;
  };
  const move=(group:T.Group,seconds:number,period:number,start:number,end:number,z:number,offset:number)=>{
    const progress=phase(seconds+offset,period)/period;
    const forward=progress<.5;
    const fraction=forward?progress*2:(1-progress)*2;
    group.position.set(start+(end-start)*fraction,0,z);
    group.rotation.y=forward?0:Math.PI;
  };
  const walk=(worker:Worker,seconds:number,period:number,start:number,end:number,z:number,offset:number,carrying:boolean)=>{
    const progress=phase(seconds+offset,period)/period;
    const forward=progress<.5;
    const fraction=forward?progress*2:(1-progress)*2;
    worker.group.position.set(start+(end-start)*fraction,0,z);
    worker.group.rotation.y=forward?Math.PI/2:-Math.PI/2;
    const stride=Math.sin(phase(seconds+offset,1.2)*Math.PI/1.2*2)*.55;
    worker.leftLeg.rotation.x=stride;worker.rightLeg.rotation.x=-stride;
    worker.leftArm.rotation.x=carrying?-1.05:-stride;
    worker.rightArm.rotation.x=carrying?-1.05:stride;
  };
  const update=(seconds:number,active:boolean)=>{
    crew.visible=active;
    if(!active)return;
    // Reduce before adding offsets so Infinity or huge values never reach transforms.
    const time=phase(seconds,12768);
    move(transporter,time,32,factoryEast+9,padWest-9,site.pad.z-14,0);
    move(forklift,time,28,factoryEast+10,padWest-8,site.pad.z+11,11);
    const spin=phase(time,8)*Math.PI*2;
    for(let i=0;i<transporterWheels.length;i++)transporterWheels[i].rotation.y=spin;
    for(let i=0;i<forkliftWheels.length;i++)forkliftWheels[i].rotation.y=-spin;
    walk(carrier,time,38,factoryEast+10,padWest-14,site.pad.z+1,5,true);
    walk(spotter,time,42,factoryEast+14,padWest-13,site.pad.z+6,17,false);
    welder.rightArm.rotation.x=-1+.18*Math.sin(phase(time,2)*Math.PI);
    welder.leftArm.rotation.x=-.45;
    spark.visible=phase(time,.8)<.35;
  };
  update(0,true);
  return {update};
}
