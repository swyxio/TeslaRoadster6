import * as T from 'three';
import { BRIDGES, BUILDINGS, PARKS, REGIONS, ROADS, STUNT_LOOP, STUNT_RAMP, isLand, isBridge, type Bridge } from '../shared/map';
import { material } from './vehicles';

/** Visuals derived from shared geography. Street furniture is decorative. */
export function buildBay(scene:T.Scene) {
  const palettes=[0xd0c4b0,0xdecdb6,0xb5beb5,0xdac1a8,0xb7a898,0x9fada8,0xe1d1b9];
  function batches(color:number,items:{x:number;y:number;z:number;w:number;h:number;d:number}[]){
    if(!items.length)return;
    const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(color),items.length),matrix=new T.Matrix4();
    items.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z)));mesh.computeBoundingSphere();scene.add(mesh);
  }
  function box(x:number,y:number,z:number,w:number,h:number,d:number,color:number){
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);scene.add(m);return m;
  }
  // Water is physically below the flat, drivable bridge decks.
  const water=new T.Mesh(new T.PlaneGeometry(2400,2000),new T.MeshStandardMaterial({color:0x478e9b,roughness:.45,metalness:.18}));
  water.rotation.x=-Math.PI/2;water.position.set(50,-4,0);scene.add(water);
  for(const region of REGIONS){
    const shape=new T.Shape();region.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:4,bevelEnabled:false});geometry.rotateX(-Math.PI/2);geometry.translate(0,-4,0);
    scene.add(new T.Mesh(geometry,material(region.color)));
    // Thin shoreline trim follows the exact authoritative land polygon.
    const pts=region.points.map(p=>new T.Vector3(p.x,.12,p.z));pts.push(pts[0].clone());
    const coast=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0xb7bea4}));scene.add(coast);
  }
  for(const p of PARKS)box(p.x,.025,p.z,p.w,.05,p.d,p.color);
  // The lake is an inset visual feature, not a separate traversable body of water.
  const lake=new T.Mesh(new T.CircleGeometry(1,40),material(0x589ca5));lake.rotation.x=-Math.PI/2;lake.scale.set(18,21,1);lake.position.set(480,.055,150);scene.add(lake);
  const road=ROADS.map(r=>({x:r.x,y:.065,z:r.z,w:r.w,h:.12,d:r.d}));batches(0x505e60,road);
  const r=STUNT_RAMP,near=r.z-r.width/2,far=r.z+r.width/2;
  const rampGeometry=new T.BufferGeometry();rampGeometry.setAttribute('position',new T.Float32BufferAttribute([
    r.start,0,near,r.start,0,far,r.end,0,near,r.end,0,far,r.end,r.height,near,r.end,r.height,far
  ],3));rampGeometry.setIndex([0,4,1,1,4,5,2,3,4,3,5,4,0,2,4,1,5,3]);rampGeometry.computeVertexNormals();
  scene.add(new T.Mesh(rampGeometry,new T.MeshStandardMaterial({color:0xc88450,roughness:.8,side:T.DoubleSide})));
  // Ribbon vertices lie on the same analytic circle used by the simulation.
  const loopVertices:number[]=[],loopIndices:number[]=[];
  for(let i=0;i<=96;i++){
    const a=i/96*Math.PI*2,x=STUNT_LOOP.x+STUNT_LOOP.radius*Math.sin(a),y=STUNT_LOOP.radius*(1-Math.cos(a));
    loopVertices.push(x,y,STUNT_LOOP.z-STUNT_LOOP.width/2,x,y,STUNT_LOOP.z+STUNT_LOOP.width/2);
    if(i<96){const n=i*2;loopIndices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const loopGeometry=new T.BufferGeometry();loopGeometry.setAttribute('position',new T.Float32BufferAttribute(loopVertices,3));loopGeometry.setIndex(loopIndices);loopGeometry.computeVertexNormals();
  scene.add(new T.Mesh(loopGeometry,new T.MeshStandardMaterial({color:0xe3a251,roughness:.65,side:T.DoubleSide})));
  for(const side of [-1,1]){
    const points=Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return new T.Vector3(STUNT_LOOP.x+STUNT_LOOP.radius*Math.sin(a),STUNT_LOOP.radius*(1-Math.cos(a)),STUNT_LOOP.z+side*STUNT_LOOP.width/2);});
    scene.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xffe2a7})));
  }
  const stripes:typeof road=[];
  for(const r of ROADS){
    if(r.w>30||r.d>30)continue;
    if(r.axis==='z'&&Math.abs(r.z%60)>14)stripes.push({x:r.x,y:.14,z:r.z,w:.16,h:.018,d:4});
    if(r.axis==='x'&&Math.abs(r.x%60)>14)stripes.push({x:r.x,y:.145,z:r.z,w:4,h:.018,d:.16});
  }
  batches(0xe7d8aa,stripes);
  // Distinct roofs and facade colors make districts less repetitive; windows share one draw call.
  const buildings=palettes.map(()=>[] as {x:number;y:number;z:number;w:number;h:number;d:number}[]), windows:typeof road=[], roofs:typeof road=[];
  BUILDINGS.forEach((b,i)=>{
    const index=(i*11+Math.floor(b.x/60)*3+Math.floor(b.z/60)*7+70)%palettes.length;
    if(!['pyramid','coit','salesforce'].includes(b.style))buildings[(index+palettes.length)%palettes.length].push({x:b.x,y:b.h/2,z:b.z,w:b.w,h:b.h,d:b.d});
    if(b.style==='pyramid'){
      const pyramid=new T.Mesh(new T.ConeGeometry(b.w*.72,b.h,4),material(0xe8e7d9));pyramid.rotation.y=Math.PI/4;pyramid.position.set(b.x,b.h/2,b.z);scene.add(pyramid);
      box(b.x,b.h+.7,b.z,.25,2,.25,0xd6e2d8);
    }else if(b.style==='salesforce'||b.style==='coit'){
      const tower=new T.Mesh(new T.CylinderGeometry(b.w*.46,b.w*.5,b.h, b.style==='coit'?12:20),material(b.style==='coit'?0xded8c3:0x98b2ae));tower.position.set(b.x,b.h/2,b.z);scene.add(tower);
      const cap=new T.Mesh(new T.SphereGeometry(b.w*.46,20,10,0,Math.PI*2,0,Math.PI/2),material(0xbdd1c9));cap.scale.y=.38;cap.position.set(b.x,b.h,b.z);scene.add(cap);
      if(b.style==='coit')box(b.x,1,b.z,18,2,18,0xb5b29e);
    }else{
      roofs.push({x:b.x,y:b.h+.2,z:b.z,w:b.w+1,h:.4,d:b.d+1});
      const floorSpacing=b.h>24?4.1:3.4;
      for(let y=3;y<b.h-1;y+=floorSpacing)for(let x=-b.w/2+2;x<b.w/2-1;x+=3.8){
        windows.push({x:b.x+x,y,z:b.z+b.d/2+.03,w:1.2,h:1.7,d:.07});
        windows.push({x:b.x+x,y,z:b.z-b.d/2-.03,w:1.2,h:1.7,d:.07});
      }
      for(let y=3;y<b.h-1;y+=floorSpacing)for(let z=-b.d/2+2;z<b.d/2-1;z+=3.8){
        windows.push({x:b.x+b.w/2+.03,y,z:b.z+z,w:.07,h:1.7,d:1.2});
        windows.push({x:b.x-b.w/2-.03,y,z:b.z+z,w:.07,h:1.7,d:1.2});
      }
    }
  });
  buildings.forEach((batch,i)=>batches(palettes[i],batch));batches(0xe5d9c5,roofs);batches(0x49676e,windows);
  // Lower residential blocks have pitched roofs, while downtown retains flat roofs.
  const homes=BUILDINGS.filter(b=>b.style==='house');
  const gables=new T.InstancedMesh(new T.ConeGeometry(1,1,4),material(0x8b7770),homes.length),roofMatrix=new T.Matrix4();
  homes.forEach((b,i)=>{roofMatrix.compose(new T.Vector3(b.x,b.h+1.3,b.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/4),new T.Vector3(b.w*.72,2.6,b.d*.72));gables.setMatrixAt(i,roofMatrix);});gables.computeBoundingSphere();scene.add(gables);
  // Zebra crossings at street intersections are a visual cue, kept clear of the shared road surface.
  const crosswalks:typeof road=[];
  for(const x of [-300,-240,-180,-120,-60,0,60,330,390,450,510,570])for(const z of [-180,-120,-60,0,60,120,180]){
    if(!ROADS.some(r=>r.axis==='z'&&r.x===x&&Math.abs(r.z-z)<10))continue;
    for(let stripe=-2;stripe<=2;stripe++){
      crosswalks.push({x:x+stripe*2.2,y:.16,z:z+9,w:1.1,h:.02,d:2.5});
      crosswalks.push({x:x+9,y:.16,z:z+stripe*2.2,w:2.5,h:.02,d:1.1});
    }
  }
  batches(0xcbd2c4,crosswalks);
  // Oakland's Tribune-inspired tower is a distinctive landmark above the East Bay grid.
  box(420,46,-90,10,4,10,0xd7c8a8);
  const spire=new T.Mesh(new T.ConeGeometry(8,10,4),material(0x6f927d));spire.position.set(420,53,-90);spire.rotation.y=Math.PI/4;scene.add(spire);
  // Distant headlands and East Bay hills are scenery beyond playable bounds.
  for(let i=0;i<9;i++){
    const hill=new T.Mesh(new T.ConeGeometry(95+i%3*25,80+i%4*14,7),material(i%2?0x81977d:0x93a689));
    hill.position.set(-490+i*95,-10,-650-i%3*32);scene.add(hill);
  }
  for(let i=0;i<7;i++){
    const hill=new T.Mesh(new T.ConeGeometry(110,70+i%3*15,7),material(i%2?0x8ea18a:0x7f977e));
    hill.position.set(750+i%2*40,-20,-260+i*100);scene.add(hill);
  }
  // Ferry Building clock tower at the SF waterfront.
  box(45,17,-35,7,14,7,0xe7ddc7);box(45,24,-35,9,1,9,0xf3e7d1);
  const clock=new T.Mesh(new T.CircleGeometry(1.8,24),new T.MeshBasicMaterial({color:0xf7ebcc}));clock.position.set(48.6,19,-35);clock.rotation.y=Math.PI/2;scene.add(clock);
  box(45,26,-35,1,4,1,0x90a79f);
  // Waterfront piers, warehouses, and Oakland container cranes convey the working Bay.
  for(const z of [-145,-105,-65,-5,145]){
    box(82,-.35,z,34,.9,11,0xa59f88);box(87,1.8,z,18,3,7,0xd9cfb8);
  }
  const craneRed=0xb65a45;
  for(const [x,z] of [[315,165],[315,195],[330,225]]){
    for(const dz of [-8,8]){box(x,14,z+dz,1.2,28,1.2,craneRed);box(x-17,27.5,z+dz,35,1.2,1.2,craneRed);}
    box(x,27.5,z,1.2,1.2,17,craneRed);box(x-25,25,z,1,4,1,0xd0a95c);
    for(let i=0;i<4;i++)box(x+8+(i%2)*8,1.3,z-5+Math.floor(i/2)*9,7,2.5,6,[0xbb7960,0x87a69e,0xd6b36d,0x8a9aa2][i]);
  }
  // Park groves use instanced trunks and crowns, preserving open streets.
  const trees:{x:number;z:number}[]=[];
  for(const p of PARKS)for(let x=p.x-p.w/2+7;x<p.x+p.w/2-4;x+=16)for(let z=p.z-p.d/2+7;z<p.z+p.d/2-4;z+=15){
    if(p.id==='lake-merritt'&&Math.abs(x-480)<22&&Math.abs(z-150)<25)continue;
    if(ROADS.some(r=>Math.abs(x-r.x)<r.w/2+3&&Math.abs(z-r.z)<r.d/2+3))continue;
    trees.push({x,z});
  }
  batches(0x78674f,trees.map(p=>({...p,y:1.4,w:.55,h:2.8,d:.55})));
  const crown=new T.InstancedMesh(new T.IcosahedronGeometry(2.7,1),material(0x678764),trees.length),m=new T.Matrix4();
  trees.forEach((p,i)=>crown.setMatrixAt(i,m.makeTranslation(p.x,4,p.z)));crown.computeBoundingSphere();scene.add(crown);
  for(const bridge of BRIDGES)drawBridge(bridge);
  function drawBridge(b:Bridge){
    const color=b.id==='golden-gate'?0xc2563d:0x99a7a5;
    const at=(along:number,across:number):[number,number]=>b.axis==='x'?[along,b.center+across]:[b.center+across,along];
    const place=(along:number,y:number,across:number,length:number,h:number,width:number,col:number)=>{const [x,z]=at(along,across);return b.axis==='x'?box(x,y,z,length,h,width,col):box(x,y,z,width,h,length,col);};
    // Deck, curbs and markings lie on the same flat physical bridge surface.
    place((b.start+b.end)/2,-.15,0,b.end-b.start,.45,b.width,0x455659);
    for(let t=b.start+8;t<b.end-4;t+=12)place(t,.15,0,5,.02,.15,0xe9d5a1);
    const railStart=b.id==='bay-bridge'?80:b.start,railEnd=b.id==='golden-gate'?-280:b.end;
    for(const side of [-1,1])place((railStart+railEnd)/2,.35,side*(b.width/2-.5),railEnd-railStart,.5,.7,color);
    const towers=b.id==='golden-gate'?[-385,-300]:[105,155,245];
    for(const t of towers){
      const height=b.id==='golden-gate'?72:t===245?56:50;
      for(const side of [-1,1])place(t,height/2,side*(b.width/2-1),3,height,3,color);
      for(const y of [14,height*.57,height-3])place(t,y,0,3,2,b.width,color);
    }
    // Cable endpoints meet the decks; the main span sags between towers.
    const spans=b.id==='golden-gate'
      ? [[b.start,-385,9,69,5],[-385,-300,69,69,43],[-300,-280,69,9,5]]
      : [[80,105,9,48,4],[105,155,48,48,27],[155,190,48,9,4],[215,245,9,53,4],[245,b.end,53,9,5]];
    for(const side of [-1,1])for(const [a,c,startHeight,endHeight,sag] of spans){
      const length=c-a,coords:T.Vector3[]=[];
      const height=(t:number)=>startHeight+(endHeight-startHeight)*t-sag*4*t*(1-t);
      for(let i=0;i<=20;i++){const t=i/20,along=a+length*t;const [x,z]=at(along,side*(b.width/2-1));coords.push(new T.Vector3(x,height(t),z));}
      const cable=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(coords),40,.22,5),material(color));scene.add(cable);
      for(let t=a+8;t<c;t+=9){const y=height((t-a)/length);place(t,y/2,side*(b.width/2-1),.15,y,.15,color);}
    }
    for(let t=b.start+12;t<b.end;t+=32)place(t,-2,0,2,4,4,0x97a09a);
  }
  const wavelets:typeof road=[];
  for(let i=0;i<260;i++){
    const x=-420+(i*139%1050),z=-520+(i*197%850);
    if(!isLand(x,z)&&!isBridge(x,z))wavelets.push({x,y:-3.97,z,w:4+i%5*2,h:.02,d:.12});
  }
  batches(0x82b5b9,wavelets);
  // A ferry and a few wakes provide scale and movement cues without collision obstacles.
  box(128,-.7,-95,28,2,8,0xd7e4df);box(128,1,-95,12,2,6,0xe7ece1);box(128,2.2,-95,6,.7,5,0x4e777b);
  const wakes:typeof road=[];for(let i=0;i<7;i++)wakes.push({x:146+i*4,y:-3.96,z:-95,w:2,h:.02,d:8+i*1.7});batches(0x86b7b7,wakes);
}
