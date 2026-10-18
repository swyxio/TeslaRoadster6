import * as T from 'three';
import { AIRPORT_RUNWAY, BRIDGES, BUILDINGS, DISTRICTS, HIGHWAYS, HILL, LAKE_MERRITT, MAP_BOUNDS, MYSTERY_YACHT, OVERPASS, PARKS, REGIONS, ROADS, STUNT_LOOP, STUNT_RAMP, isLand, isBridge, overpassHeight, terrainHeight, type Bridge } from '../shared/map';
import { material } from './vehicles';
import { buildRouteSignage } from './route-signage';

/** Visuals derived from shared geography. Street furniture is decorative. */
export function buildBay(scene:T.Scene) {
  const palettes=[0xd0c4b0,0xdecdb6,0xb5beb5,0xdac1a8,0xb7a898,0x9fada8,0xe1d1b9];
  type BoxItem={x:number;y:number;z:number;w:number;h:number;d:number;angle?:number};
  function batches(color:number,items:BoxItem[]){
    if(!items.length)return;
    const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(color),items.length),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
    items.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.angle??0),scale.set(p.w,p.h,p.d))));mesh.computeBoundingSphere();scene.add(mesh);
  }
  function localBatches(color:number,items:BoxItem[]){
    const chunks=new Map<string,BoxItem[]>();
    for(const item of items){
      const key=`${Math.floor(item.x/700)},${Math.floor(item.z/700)}`;
      const chunk=chunks.get(key)??[];chunk.push(item);chunks.set(key,chunk);
    }
    for(const chunk of chunks.values())batches(color,chunk);
  }
  function box(x:number,y:number,z:number,w:number,h:number,d:number,color:number){
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);scene.add(m);return m;
  }
  // Water is physically below the flat, drivable bridge decks.
  const water=new T.Mesh(new T.PlaneGeometry(MAP_BOUNDS.maxX-MAP_BOUNDS.minX+1600,MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ+1600),new T.MeshStandardMaterial({color:0x478e9b,roughness:.45,metalness:.18}));
  water.rotation.x=-Math.PI/2;water.position.set((MAP_BOUNDS.minX+MAP_BOUNDS.maxX)/2,-4,(MAP_BOUNDS.minZ+MAP_BOUNDS.maxZ)/2);scene.add(water);
  const shoreline:number[]=[];
  REGIONS.forEach((region,index)=>{
    const shape=new T.Shape();region.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
    // Shared regions overlap near the South Bay. A tiny visual offset avoids
    // coplanar flicker without changing the simulation's flat Y=0 surface.
    const geometry=new T.ExtrudeGeometry(shape,{depth:4,bevelEnabled:false});geometry.rotateX(-Math.PI/2);geometry.translate(0,-4+index*.003,0);
    scene.add(new T.Mesh(geometry,material(region.color)));
    // Only exposed polygon edges are coast; overlapping region boundaries
    // are inland and should not draw an artificial line through the city.
    region.points.forEach((a,i)=>{
      const b=region.points[(i+1)%region.points.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),steps=Math.ceil(length/20);
      if(!length)return;
      for(let step=0;step<steps;step++){
        const t0=step/steps,t1=(step+1)/steps,mid=(t0+t1)/2,mx=a.x+dx*mid,mz=a.z+dz*mid,nx=-dz/length*2,nz=dx/length*2;
        if(isLand(mx+nx,mz+nz)&&isLand(mx-nx,mz-nz))continue;
        shoreline.push(a.x+dx*t0,.12,a.z+dz*t0,a.x+dx*t1,.12,a.z+dz*t1);
      }
    });
  });
  const shorelineGeometry=new T.BufferGeometry();shorelineGeometry.setAttribute('position',new T.Float32BufferAttribute(shoreline,3));
  scene.add(new T.LineSegments(shorelineGeometry,new T.LineBasicMaterial({color:0xb7bea4})));
  // The hill triangles use the exact lattice and diagonals sampled by shared physics.
  const hillVertices:number[]=[],hillIndices:number[]=[];
  for(let z=0;z<=HILL.rows;z++)for(let x=0;x<=HILL.columns;x++){
    const px=HILL.minX+(HILL.maxX-HILL.minX)*x/HILL.columns,pz=HILL.minZ+(HILL.maxZ-HILL.minZ)*z/HILL.rows;
    hillVertices.push(px,terrainHeight(px,pz)??0,pz);
  }
  for(let z=0;z<HILL.rows;z++)for(let x=0;x<HILL.columns;x++){
    const a=z*(HILL.columns+1)+x,b=a+1,c=a+HILL.columns+1,d=c+1;
    hillIndices.push(a,c,b,b,c,d);
  }
  const hillGeometry=new T.BufferGeometry();hillGeometry.setAttribute('position',new T.Float32BufferAttribute(hillVertices,3));hillGeometry.setIndex(hillIndices);hillGeometry.computeVertexNormals();
  scene.add(new T.Mesh(hillGeometry,new T.MeshStandardMaterial({color:0xc3c9aa,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})));
  // Flat, muted meadow and field patches give the long intercity corridors
  // variety without introducing decorative collision or invented terrain.
  const fields:{x:number;z:number;rx:number;rz:number;angle:number}[][]=[[],[],[]];
  for(let z=450;z<MAP_BOUNDS.maxZ;z+=185)for(let x=MAP_BOUNDS.minX+120;x<MAP_BOUNDS.maxX;x+=185){
    const seed=Math.abs(Math.floor(x*19+z*31));
    const cx=x+(seed%57)-28,cz=z+(Math.floor(seed/7)%57)-28;
    const rx=65+seed%36,rz=54+Math.floor(seed/13)%38,radius=Math.max(rx,rz);
    if(![-radius,0,radius].every(dx=>[-radius,0,radius].every(dz=>isLand(cx+dx,cz+dz))))continue;
    fields[seed%fields.length].push({x:cx,z:cz,rx,rz,angle:(seed%31)*.1});
  }
  const fieldGeometry=new T.CircleGeometry(1,14);fieldGeometry.rotateX(-Math.PI/2);
  fields.forEach((items,i)=>{
    if(!items.length)return;
    const mesh=new T.InstancedMesh(fieldGeometry,material([0xc5caa8,0xc4caa2,0xd1cba9][i]),items.length);
    const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
    items.forEach((p,j)=>mesh.setMatrixAt(j,matrix.compose(position.set(p.x,.02,p.z),rotation.setFromAxisAngle(up,p.angle),scale.set(p.rx,1,p.rz))));
    mesh.computeBoundingSphere();scene.add(mesh);
  });
  for(const p of PARKS)box(p.x,.025,p.z,p.w,.05,p.d,p.color);
  // The lake is an inset visual feature, not a separate traversable body of water.
  const lake=new T.Mesh(new T.CircleGeometry(1,40),material(0x589ca5));lake.rotation.x=-Math.PI/2;lake.scale.set(LAKE_MERRITT.rx,LAKE_MERRITT.rz,1);lake.position.set(LAKE_MERRITT.x,.055,LAKE_MERRITT.z);scene.add(lake);
  // The miniature bird islands are decorative, like the lake itself; cars
  // still drive across the same flat shared ground beneath them.
  for(const island of LAKE_MERRITT.islands){
    const ground=new T.Mesh(new T.CylinderGeometry(island.r,island.r*1.08,.15,10),material(0x91aa7b));ground.position.set(island.x,.12,island.z);scene.add(ground);
    const tree=new T.Mesh(new T.ConeGeometry(island.r*.55,4,7),material(0x60865f));tree.position.set(island.x,2.2,island.z);scene.add(tree);
  }
  const road=ROADS.filter(r=>r.kind!=='highway').map(r=>({x:r.x,y:.065,z:r.z,w:r.w,h:.12,d:r.d,angle:r.angle}));batches(0x505e60,road);
  const highways=ROADS.filter(r=>r.kind==='highway');
  batches(0x424e50,highways.map(r=>({x:r.x,y:.075,z:r.z,w:r.w,h:.12,d:r.d,angle:r.angle})));
  // Adjacent rotated rectangles leave outside wedges at bends. Round joins
  // follow the shared highway vertices and sit just below the road surfaces.
  const joins=[...new Map(HIGHWAYS.flatMap(h=>h.points).map(p=>[`${p.x},${p.z}`,p])).values()];
  if(joins.length){
    const geometry=new T.CircleGeometry(1,32);geometry.rotateX(-Math.PI/2);
    const mesh=new T.InstancedMesh(geometry,material(0x424e50),joins.length),matrix=new T.Matrix4();
    joins.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeScale(16,1,16).setPosition(p.x,.13,p.z)));
    mesh.computeBoundingSphere();scene.add(mesh);
  }
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
  const stripes:BoxItem[]=[];
  for(const r of ROADS.filter(r=>r.kind!=='highway')){
    if(r.w>30||r.d>30)continue;
    if(r.axis==='z'&&Math.abs(r.z%60)>14)stripes.push({x:r.x,y:.14,z:r.z,w:.16,h:.018,d:4});
    if(r.axis==='x'&&Math.abs(r.x%60)>14)stripes.push({x:r.x,y:.145,z:r.z,w:4,h:.018,d:.16});
  }
  batches(0xe7d8aa,stripes);
  // Paint follows each authoritative road rectangle. No separate decorative
  // asphalt, walls or ramps can suggest a surface the simulation lacks.
  const highwayEdges:BoxItem[]=[],highwayCenter:BoxItem[]=[],highwayDashes:BoxItem[]=[];
  for(const r of highways){
    const angle=r.angle??0,s=Math.sin(angle),c=Math.cos(angle);
    const line=(along:number,across:number,length:number,width:number):BoxItem=>({
      x:r.x+s*along+c*across,y:.15,z:r.z+c*along-s*across,w:width,h:.018,d:length,angle,
    });
    for(const side of [-1,1]){
      highwayEdges.push(line(0,side*(r.w/2-.5),r.d,.14));
      highwayCenter.push(line(0,side*.22,r.d,.12));
      for(let along=-r.d/2+4;along<r.d/2-4;along+=14){
        highwayDashes.push(line(along,side*r.w/4,6,.14));
      }
    }
  }
  batches(0xd6d8ca,highwayEdges);batches(0xe9cd82,highwayCenter);batches(0xe4e6dd,highwayDashes);
  // Airport paint is on supported land and follows the shared location; it is
  // a playful driving area, not an aviation simulation.
  const runway=AIRPORT_RUNWAY;
  box(runway.x,.08,runway.z,runway.w,.08,runway.d,0x515e60);
  for(let z=runway.z-runway.d/2+5;z<runway.z+runway.d/2-4;z+=12)box(runway.x,.13,z,.35,.02,6,0xe6e9d9);
  for(const side of [-1,1])for(let n=0;n<4;n++)box(runway.x+side*(3+n*1.8),.14,runway.z+runway.d/2-6,1,.02,6,0xe6e9d9);
  // Sloped deck, sides and underside follow the same piecewise-linear heights
  // as the authoritative overpass. The center crossing stays clear below.
  for(const [a,b] of [[OVERPASS.start,OVERPASS.deckStart],[OVERPASS.deckStart,OVERPASS.deckEnd],[OVERPASS.deckEnd,OVERPASS.end]]){
    const ya=overpassHeight(a,OVERPASS.z)!,yb=overpassHeight(b,OVERPASS.z)!,z0=OVERPASS.z-OVERPASS.width/2,z1=OVERPASS.z+OVERPASS.width/2,t=OVERPASS.thickness;
    const vertices=[a,ya,z0, a,ya,z1, b,yb,z0, b,yb,z1, a,ya-t,z0, a,ya-t,z1, b,yb-t,z0, b,yb-t,z1];
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setIndex([0,1,2,2,1,3, 4,6,5,6,7,5, 0,2,4,2,6,4, 1,5,3,3,5,7, 0,4,1,1,4,5, 2,3,6,3,7,6]);geometry.computeVertexNormals();
    scene.add(new T.Mesh(geometry,material(0x424e50)));
    for(const across of [-OVERPASS.width/2+.5,0,OVERPASS.width/2-.5]){
      const marks=new T.BufferGeometry(),z=OVERPASS.z+across,w=across===0?.16:.12;
      marks.setAttribute('position',new T.Float32BufferAttribute([a,ya+.025,z-w/2, a,ya+.025,z+w/2, b,yb+.025,z-w/2, b,yb+.025,z+w/2],3));
      marks.setIndex([0,1,2,2,1,3]);marks.computeVertexNormals();scene.add(new T.Mesh(marks,material(across===0?0xe9cd82:0xd6d8ca)));
    }
  }
  // Pavement labels use the nearest shared highway segment and stay entirely
  // within one lane. They help players recognize districts without roadside
  // signs that look solid but have no collision.
  const labelGeometry=new T.PlaneGeometry(7,12);labelGeometry.rotateX(Math.PI/2);
  for(const district of DISTRICTS){
    let nearest:{x:number;z:number;angle:number;distance:number}|undefined;
    for(const highway of HIGHWAYS)for(let i=1;i<highway.points.length;i++){
      const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
      if(!length2)continue;
      const t=Math.max(0,Math.min(1,((district.x-a.x)*dx+(district.z-a.z)*dz)/length2));
      const x=a.x+dx*t,z=a.z+dz*t,distance=Math.hypot(district.x-x,district.z-z);
      if(!nearest||distance<nearest.distance)nearest={x,z,angle:Math.atan2(dx,dz),distance};
    }
    if(!nearest||nearest.distance>100)continue;
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
    const ctx=canvas.getContext('2d')!;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(245,245,230,.8)';ctx.font='bold 70px system-ui';ctx.fillText('↑',64,65);
    ctx.font='bold 27px system-ui';ctx.fillText(district.name.toUpperCase(),64,150,116);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const label=new T.Mesh(labelGeometry,new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide}));
    label.position.set(nearest.x-Math.cos(nearest.angle)*4,.16,nearest.z+Math.sin(nearest.angle)*4);
    label.rotation.y=nearest.angle;scene.add(label);
  }
  // Non-obstructive warning paint 350 m before the San Jose connector bends.
  // The positions are on the right-hand approach lanes in each direction.
  const warningCanvas=document.createElement('canvas');warningCanvas.width=128;warningCanvas.height=256;
  const warningContext=warningCanvas.getContext('2d')!;warningContext.textAlign='center';warningContext.textBaseline='middle';warningContext.fillStyle='rgba(255,219,132,.95)';
  warningContext.font='bold 68px system-ui';warningContext.fillText('⚠',64,70);
  warningContext.font='bold 30px system-ui';warningContext.fillText('CURVE',64,145);warningContext.fillText('EASE OFF',64,185);
  const warningTexture=new T.CanvasTexture(warningCanvas);warningTexture.colorSpace=T.SRGBColorSpace;
  const warningMaterial=new T.MeshBasicMaterial({map:warningTexture,transparent:true,depthWrite:false,side:T.DoubleSide});
  for(const {x,z,yaw} of [{x:981,z:8224,yaw:-2.522},{x:1938,z:7968,yaw:-2.862}]){
    const paint=new T.Mesh(labelGeometry,warningMaterial);paint.position.set(x-Math.cos(yaw)*16,.17,z+Math.sin(yaw)*16);paint.rotation.y=yaw+Math.PI;scene.add(paint);
  }
  // Distinct roofs and facade colors make districts less repetitive; windows share one draw call.
  const buildings=palettes.map(()=>[] as BoxItem[]), windows:BoxItem[]=[], roofs:BoxItem[]=[];
  BUILDINGS.forEach((b,i)=>{
    const index=(i*11+Math.floor(b.x/60)*3+Math.floor(b.z/60)*7+70)%palettes.length;
    const landmark=['campanile','hoover','airport','mission','rotunda'].includes(b.style);
    if(!landmark&&!['pyramid','coit','salesforce'].includes(b.style))buildings[(index+palettes.length)%palettes.length].push({x:b.x,y:b.h/2,z:b.z,w:b.w,h:b.h,d:b.d});
    if(b.style==='campanile'||b.style==='hoover'){
      const berkeley=b.style==='campanile',stone=berkeley?0xdad6c7:0xd5c2a0;
      box(b.x,(b.h-10)/2,b.z,b.w*.8,b.h-10,b.d*.8,stone);
      box(b.x,b.h-12,b.z,b.w*.94,2,b.d*.94,berkeley?0xe5e2d3:0xc6a883);
      box(b.x,b.h-7.5,b.z,b.w*.72,5,b.d*.72,berkeley?0xf0e9d8:0xd8c7a9);
      for(const side of [-1,1])box(b.x+side*b.w*.22,b.h-7.5,b.z+b.d*.365,1,3,.05,0x536b68);
      if(berkeley){
        for(const side of [-1,1]){
          const clock=new T.Mesh(new T.CircleGeometry(1.7,24),new T.MeshBasicMaterial({color:0xf5ead2,side:T.DoubleSide}));clock.position.set(b.x,b.h-15,b.z+side*b.d*.405);scene.add(clock);
          box(b.x,b.h-15,b.z+side*b.d*.41,.14,2,.05,0x4c5d58);
          box(b.x+.45,b.h-15,b.z+side*b.d*.41,1,.14,.05,0x4c5d58);
        }
      }
      const roof=new T.Mesh(new T.ConeGeometry(b.w*.55,5,4),material(berkeley?0xa8aaa0:0xa85243));roof.rotation.y=Math.PI/4;roof.position.set(b.x,b.h-2.5,b.z);scene.add(roof);
    }else if(b.style==='airport'){
      box(b.x,5,b.z,b.w,10,b.d,0xd8dfd8);
      const shaft=new T.Mesh(new T.CylinderGeometry(5,3.5,29,10),material(0xe3e9e2));shaft.position.set(b.x,24.5,b.z);scene.add(shaft);
      const cab=new T.Mesh(new T.CylinderGeometry(8,6,6,10),material(0x527985));cab.position.set(b.x,42,b.z);scene.add(cab);
      box(b.x,45.5,b.z,12,1,12,0xe3e9e2);
    }else if(b.style==='mission'){
      box(b.x,5,b.z,b.w,10,b.d,0xe8dfc8);
      const roof=new T.Mesh(new T.ConeGeometry(1,3,4),material(0xab624e));roof.rotation.y=Math.PI/4;roof.scale.set(b.w*.7,1,b.d*.7);roof.position.set(b.x,11.5,b.z);scene.add(roof);
      for(const side of [-1,1]){
        box(b.x+side*8,12,b.z,4,16,4,0xe8dfc8);
        box(b.x+side*8,17,b.z+2.02,1.4,2,.04,0x5a6259);
        box(b.x+side*8,19,b.z,5,2,5,0xb96b51);
      }
      box(b.x,6,b.z+b.d/2+.02,3,6,.04,0x705d50);
      const arch=new T.Mesh(new T.CircleGeometry(1.5,16),material(0x705d50));arch.position.set(b.x,9,b.z+b.d/2+.05);scene.add(arch);
      box(b.x,15.7,b.z+b.d/2+.08,.35,5,.16,0xc8b08e);box(b.x,16.5,b.z+b.d/2+.08,2.4,.35,.16,0xc8b08e);
    }else if(b.style==='rotunda'){
      const hall=new T.Mesh(new T.CylinderGeometry(10,10,14,20),material(0x83a4a4));hall.position.set(b.x,7,b.z);scene.add(hall);
      const dome=new T.Mesh(new T.SphereGeometry(9,20,10,0,Math.PI*2,0,Math.PI/2),material(0xb7cdca));dome.position.set(b.x,14,b.z);scene.add(dome);
      for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4)box(b.x+Math.sin(angle)*9.8,7,b.z+Math.cos(angle)*9.8,.45,14,.45,0xe8e4d6);
    }else if(b.style==='pyramid'){
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
  // Keep far-away district details in separate instanced meshes so frustum
  // culling remains effective as the world grows to the South Bay.
  buildings.forEach((batch,i)=>localBatches(palettes[i],batch));localBatches(0xe5d9c5,roofs);localBatches(0x49676e,windows);
  // Lower residential blocks have pitched roofs, while downtown retains flat roofs.
  const homes=BUILDINGS.filter(b=>b.style==='house');
  const gables=new T.InstancedMesh(new T.ConeGeometry(1,1,4),material(0x8b7770),homes.length),roofMatrix=new T.Matrix4();
  homes.forEach((b,i)=>{roofMatrix.compose(new T.Vector3(b.x,b.h+1.3,b.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/4),new T.Vector3(b.w*.72,2.6,b.d*.72));gables.setMatrixAt(i,roofMatrix);});gables.computeBoundingSphere();scene.add(gables);
  // Zebra crossings at street intersections are a visual cue, kept clear of the shared road surface.
  const crosswalks:BoxItem[]=[];
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
    const x=750+i%2*40,z=-260+i*100;
    // A formerly distant hill may now overlap newly supported East Bay land.
    if([-80,0,80].some(dx=>[-80,0,80].some(dz=>isLand(x+dx,z+dz))))continue;
    const hill=new T.Mesh(new T.ConeGeometry(110,70+i%3*15,7),material(i%2?0x8ea18a:0x7f977e));
    hill.position.set(x,-20,z);scene.add(hill);
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
  const wavelets:BoxItem[]=[];
  for(let i=0;i<260;i++){
    const x=-420+(i*139%1050),z=-520+(i*197%850);
    if(!isLand(x,z)&&!isBridge(x,z))wavelets.push({x,y:-3.97,z,w:4+i%5*2,h:.02,d:.12});
  }
  // Scatter the same subtle water detail across the expanded shared bounds.
  for(let i=0;i<1200;i++){
    const x=MAP_BOUNDS.minX+((i*.61803398875)%1)*(MAP_BOUNDS.maxX-MAP_BOUNDS.minX);
    const z=MAP_BOUNDS.minZ+((i*.754877666)%1)*(MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ);
    if(!isLand(x,z)&&!isBridge(x,z))wavelets.push({x,y:-3.97,z,w:6+i%5*2,h:.02,d:.12});
  }
  batches(0x82b5b9,wavelets);
  // A ferry and a few wakes provide scale and movement cues without collision obstacles.
  box(128,-.7,-95,28,2,8,0xd7e4df);box(128,1,-95,12,2,6,0xe7ece1);box(128,2.2,-95,6,.7,5,0x4e777b);
  const wakes:BoxItem[]=[];for(let i=0;i<7;i++)wakes.push({x:146+i*4,y:-3.96,z:-95,w:2,h:.02,d:8+i*1.7});batches(0x86b7b7,wakes);
  // A fictional billionaire-sized yacht, safely offshore and decorative.
  const yacht=MYSTERY_YACHT;
  box(yacht.x,-2.3,yacht.z,42,3.4,12,0xe8e8de);
  box(yacht.x-2,.2,yacht.z,24,2.2,9,0xcbd8d4);
  box(yacht.x-5,2,yacht.z,14,1.5,7,0x4e7480);
  box(yacht.x-8,4,yacht.z,.4,4,.4,0xd5ded6);
  box(yacht.x-6,5.4,yacht.z,4,1.2,.06,0xe9ba65);
  buildRouteSignage(scene);
}
