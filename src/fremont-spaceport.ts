import * as T from 'three';
import { MARS_LAUNCH_SECONDS } from '../shared/mars';
import { FREMONT_SPACEPORT as site } from '../shared/map';
import { constructionFraction } from './starship-construction';
import { createStarshipWorkyard } from './starship-workyard';
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
  const arms=new T.Group();tower.add(arms);
  for(const z of [-5,5])box(arms,-15,93,z,26,2,2,0x454f54);
  box(tower,-1,127,0,14,4,14,0x454f54);
  const workyard=createStarshipWorkyard(scene);

  // The site sign is deliberately beside, rather than inside, the boarding ring.
  const board=new T.Group();board.position.set(site.entrance.x-15,0,site.entrance.z+20);scene.add(board);
  for(const x of [-9,9])box(board,x,1.3,-.35,.6,2.6,.6,0x465153);
  box(board,0,8,-.2,22.8,11.8,.4,0x34484c);
  const boardCanvas=document.createElement('canvas');boardCanvas.width=1024;boardCanvas.height=512;
  const boardContext=boardCanvas.getContext('2d')!;
  const boardTexture=new T.CanvasTexture(boardCanvas);boardTexture.colorSpace=T.SRGBColorSpace;
  const boardFace=new T.Mesh(new T.PlaneGeometry(22,11),new T.MeshBasicMaterial({map:boardTexture}));
  boardFace.position.set(0,8,.02);board.add(boardFace);
  let lastBoardTotal:number|null|undefined;
  function updateBoard(total:number|null){
    if(total===lastBoardTotal)return;lastBoardTotal=total;
    const c=boardContext;c.fillStyle='#17333b';c.fillRect(0,0,1024,512);
    c.fillStyle='#efb65e';c.font='bold 33px system-ui';c.fillText('FREMONT  /  MISSION TO MARS',54,55);
    c.fillStyle='#f8f4e8';c.font='bold 54px system-ui';c.fillText('BUILD STARSHIP TOGETHER',54,120);
    c.fillStyle='#dce8df';c.font='31px system-ui';
    c.fillText('Your earnings build it automatically. Your cash stays yours.',54,171);
    c.fillStyle='#f8f4e8';c.font='bold 35px system-ui';
    c.fillText(total===null?'WAITING FOR MISSION TOTAL':`LAST CONFIRMED  $${Math.floor(total).toLocaleString('en-US')} / $1 BILLION`,54,235);
    c.fillStyle='#435d60';c.fillRect(54,257,916,15);
    c.fillStyle='#efb65e';c.fillRect(54,257,916*(constructionFraction(total)??0),15);
    c.fillStyle='#dce8df';c.font='29px system-ui';
    c.fillText('Reach level 2 and find Fremont on the Bay map.',54,325);
    c.fillText('At $1B, stop in the gold ring to board for Mars.',54,370);
    c.fillText('Open Actions → Mars mission for details.',54,415);
    boardTexture.needsUpdate=true;
  }
  updateBoard(null);

  const rocket=new T.Group();rocket.position.set(site.pad.x,site.pad.h,site.pad.z);scene.add(rocket);
  // The fixed launch stand and temporary gantry make the site look active even
  // while the first fraction of the hull is still too small to see at a distance.
  const gantry=new T.Group();gantry.position.copy(rocket.position);scene.add(gantry);
  const stand=new T.Mesh(new T.CylinderGeometry(5.1,5.1,1,24),material(0x4c5d5d));stand.position.y=.5;gantry.add(stand);
  for(const x of [-7,7])for(const z of [-7,7])box(gantry,x,9,z,.55,18,.55,0xd19947);
  for(const y of [4,10,16]){
    box(gantry,0,y,-7,14,.35,.35,0xd19947);
    for(const x of [-7,7])box(gantry,x,y,0,.35,.35,14,0xd19947);
  }
  // A faint full-height blueprint gives context even at today's tiny percentage;
  // the solid shell grows from the pad in direct proportion to confirmed income.
  const outlinePoints:number[]=[];
  const line=(x1:number,y1:number,z1:number,x2:number,y2:number,z2:number)=>outlinePoints.push(x1,y1,z1,x2,y2,z2);
  for(let y=0;y<=110;y+=10){
    const radius=y<=107?4.4:4.4*(120-y)/13;
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
      line(Math.cos(a)*radius,y,Math.sin(a)*radius,Math.cos(b)*radius,y,Math.sin(b)*radius);
    }
  }
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=Math.cos(a)*4.4,z=Math.sin(a)*4.4;
    line(x,0,z,x,107,z);line(x,107,z,0,120,0);
  }
  const outlineGeometry=new T.BufferGeometry();outlineGeometry.setAttribute('position',new T.Float32BufferAttribute(outlinePoints,3));
  const outline=new T.LineSegments(outlineGeometry,new T.LineBasicMaterial({color:0x438c8b,transparent:true,opacity:.85}));rocket.add(outline);
  const bodyGeometry=new T.CylinderGeometry(4.5,4.5,1,32),noseGeometry=new T.CylinderGeometry(0,4.5,1,32);
  const parts=[{bottom:0,height:36,color:0xb4c0bf,geometry:bodyGeometry},
    {bottom:36,height:36,color:0xb4c0bf,geometry:bodyGeometry},
    {bottom:72,height:35,color:0xc7d0cd,geometry:bodyGeometry},
    {bottom:107,height:13,color:0xc7d0cd,geometry:noseGeometry}].map(part=>{
      const mesh=new T.Mesh(part.geometry,material(part.color,.3));rocket.add(mesh);return {...part,mesh};
    });
  const ribs=[3,20,40,60,71].map(y=>{
    const mesh=new T.Mesh(new T.CylinderGeometry(4.56,4.56,.35,32),material(0x65757a,.7));mesh.position.y=y;rocket.add(mesh);return {mesh,y};
  });
  const tiles=box(rocket,0,0,4.5,7,1,.2,0x202a30);
  const fins=new T.Group();rocket.add(fins);
  for(const side of [-1,1]){
    const fin=box(fins,side*5,78,0,4,12,1,0x3b484c);fin.rotation.z=side*.28;
    const flap=box(fins,side*4.3,103,0,2.4,5,.8,0x3b484c);flap.rotation.z=-side*.3;
  }
  const engines=new T.Group();rocket.add(engines);
  for(let i=0;i<9;i++){
    const angle=i/9*Math.PI*2,engine=new T.Mesh(new T.ConeGeometry(.7,2,12),material(0x30383b,.5));
    engine.position.set(Math.cos(angle)*3,-.6,Math.sin(angle)*3);engine.rotation.x=Math.PI;engines.add(engine);
  }
  const flame=new T.Mesh(new T.ConeGeometry(4,27,20),new T.MeshBasicMaterial({color:0xffbd68,transparent:true,opacity:.8}));flame.position.y=-14;flame.rotation.x=Math.PI;rocket.add(flame);flame.visible=false;
  const ring=new T.Mesh(new T.RingGeometry(12,12.7,64),new T.MeshBasicMaterial({color:0xffc76e,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(site.entrance.x,.13,site.entrance.z);scene.add(ring);
  return {update(time:number,launchAt:number|null,total:number|null,ambientTime=time){
    const elapsed=launchAt===null?-1:time-launchAt;
    const launching=elapsed>=0&&elapsed<MARS_LAUNCH_SECONDS;
    const height=120*(launching?1:constructionFraction(total)??0);
    for(const part of parts){
      const visibleHeight=Math.max(0,Math.min(part.height,height-part.bottom));
      part.mesh.visible=visibleHeight>0;part.mesh.scale.y=visibleHeight;part.mesh.position.y=part.bottom+visibleHeight/2;
    }
    for(const rib of ribs)rib.mesh.visible=height>=rib.y;
    const tileHeight=Math.max(0,Math.min(23,height-73.5));tiles.visible=tileHeight>0;tiles.scale.y=tileHeight;tiles.position.y=73.5+tileHeight/2;
    fins.visible=height>=107;engines.visible=height>=3;outline.visible=height<120;gantry.visible=height<120;
    updateBoard(total);
    workyard.update(ambientTime,!launching);
    rocket.position.y=site.pad.h+(launching?Math.max(0,elapsed-1)**2*3:0);
    flame.visible=launching;
  }};
}
