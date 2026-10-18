import * as T from 'three';
import { MARS_LAUNCH_SECONDS } from '../shared/mars';
import { FREMONT_SPACEPORT as site } from '../shared/map';
import { box, material } from './vehicles';

/** Fictional Fremont complex. Factory, pad and tower match shared collision boxes. */
export function buildFremontSpaceport(scene:T.Scene) {
  const factory=new T.Group();factory.position.set(site.factory.x,0,site.factory.z);scene.add(factory);
  box(factory,0,site.factory.h/2,0,site.factory.w,site.factory.h,site.factory.d,0xd6dad9);
  box(factory,0,17,site.factory.d/2+.12,site.factory.w,1.6,.25,0xb52c2d);
  box(factory,0,7,site.factory.d/2+.18,55,10,.35,0x31505a);
  for(let x=-60;x<=60;x+=12){
    box(factory,x,11,site.factory.d/2+.2,4,6,.2,0x557782);
    box(factory,x,site.factory.h+.2,0,8,.4,site.factory.d-10,0x30515b);
  }
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=128;
  const c=signCanvas.getContext('2d')!;c.fillStyle='#f2f3ed';c.fillRect(0,0,1024,128);c.fillStyle='#b42f2f';c.font='bold 65px system-ui';c.textAlign='center';c.fillText('TESLA × SPACEX  /  FREMONT',512,84);
  const tex=new T.CanvasTexture(signCanvas);tex.colorSpace=T.SRGBColorSpace;
  const sign=new T.Mesh(new T.PlaneGeometry(55,6.9),new T.MeshBasicMaterial({map:tex}));sign.position.set(0,20,site.factory.d/2+.22);factory.add(sign);
  for(const side of [-1,1]){
    for(let z=-30;z<=30;z+=12)box(factory,side*(site.factory.w/2+.12),11,z,.25,7,7,0x557782);
    const endSign=new T.Mesh(new T.PlaneGeometry(40,5),new T.MeshBasicMaterial({map:tex}));
    endSign.position.set(side*(site.factory.w/2+.2),20,0);endSign.rotation.y=side*Math.PI/2;factory.add(endSign);
  }

  const pad=new T.Group();pad.position.set(site.pad.x,0,site.pad.z);scene.add(pad);
  box(pad,0,site.pad.h/2,0,site.pad.w,site.pad.h,site.pad.d,0x777e7b);
  box(pad,0,site.pad.h+.05,0,25,.1,25,0x38454a);
  for(const z of [-13,13])box(pad,0,site.pad.h+.12,z,27,.2,.5,0xe8b454);

  const tower=new T.Group();tower.position.set(site.tower.x,0,site.tower.z);scene.add(tower);
  box(tower,0,site.tower.h/2,0,site.tower.w,site.tower.h,site.tower.d,0x687178);
  for(const x of [-5,5])for(const z of [-5,5])box(tower,x,site.tower.h/2,z,1.4,site.tower.h,1.4,0x333f45);
  for(let y=8;y<125;y+=12){
    box(tower,0,y,6,12,1,.5,0xcbb59a);box(tower,0,y,-6,12,1,.5,0xcbb59a);
  }
  // The fictional launch tower's arms extend toward the rocket.
  for(const z of [-5,5])box(tower,-15,93,z,26,2,2,0x454f54);
  box(tower,-1,127,0,14,4,14,0x454f54);

  const rocket=new T.Group();rocket.position.set(site.pad.x,site.pad.h,site.pad.z);scene.add(rocket);
  const cylinder=(parent:T.Object3D,rTop:number,rBottom:number,h:number,y:number,color:number)=>{
    const m=new T.Mesh(new T.CylinderGeometry(rTop,rBottom,h,32),material(color,.7));m.position.y=y;parent.add(m);return m;
  };
  // Proportions based on Super Heavy's 72 m × 9 m booster and a Starship upper stage.
  cylinder(rocket,4.5,4.5,72,36,0xb4c0bf);
  for(const y of [3,20,40,60,71])cylinder(rocket,4.56,4.56,.35,y,0x65757a);
  cylinder(rocket,4.5,4.5,35,89.5,0xc7d0cd);
  cylinder(rocket,0,4.5,13,113.5,0xc7d0cd);
  box(rocket,0,85,4.5,7,23,.2,0x202a30);
  for(const side of [-1,1]){
    const fin=box(rocket,side*5,78,0,4,12,1,0x3b484c);fin.rotation.z=side*.28;
    const flap=box(rocket,side*4.3,103,0,2.4,5,.8,0x3b484c);flap.rotation.z=-side*.3;
  }
  for(let i=0;i<9;i++){
    const angle=i/9*Math.PI*2,engine=new T.Mesh(new T.ConeGeometry(.7,2,12),material(0x30383b,.5));
    engine.position.set(Math.cos(angle)*3,-.6,Math.sin(angle)*3);engine.rotation.x=Math.PI;rocket.add(engine);
  }
  const flame=new T.Mesh(new T.ConeGeometry(4,27,20),new T.MeshBasicMaterial({color:0xffbd68,transparent:true,opacity:.8}));flame.position.y=-14;flame.rotation.x=Math.PI;rocket.add(flame);flame.visible=false;
  const ring=new T.Mesh(new T.RingGeometry(12,12.7,64),new T.MeshBasicMaterial({color:0xffc76e,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(site.entrance.x,.13,site.entrance.z);scene.add(ring);
  return {update(time:number,launchAt:number|null){
    const elapsed=launchAt===null?-1:time-launchAt;
    const launching=elapsed>=0&&elapsed<MARS_LAUNCH_SECONDS;
    rocket.position.y=site.pad.h+(launching?Math.max(0,elapsed-1)**2*3:0);
    flame.visible=launching;
  }};
}
