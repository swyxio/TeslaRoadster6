import * as T from 'three';

export type Collider = {minX:number;maxX:number;minZ:number;maxZ:number;height:number};
type MaterialName='stone'|'sand'|'cream'|'warm'|'terra'|'glass'|'glassLight'|'dark'|'metal'|'gold'|'leaf'|'trunk'|'paint'|'road'|'paving'|'wood'|'carpaint'|'tire'|'tail';
type Shape='box'|'farbox'|'column'|'sphere'|'frond'|'arch'|'archpane'|'ring'|'carbody'|'cabin'|'wheel'|'gable'|'hull';
type Item={x:number;y:number;z:number;w:number;h:number;d:number;angle:number;color?:number};

// Everything is authored locally: no photographs, external services or model
// downloads. These textures add fine surface variation to simple shared meshes.
function grainTexture(kind:'road'|'stone'|'trunk') {
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d')!;
  g.fillStyle=kind==='road'?'#a4aaad':kind==='stone'?'#ded4c1':'#82705a';g.fillRect(0,0,256,256);
  let seed=kind==='road'?117:kind==='stone'?931:731;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<(kind==='road'?6000:kind==='stone'?2500:1500);i++){
    const x=rnd()*256,y=rnd()*256;
    const light=rnd()>.5;
    g.fillStyle=kind==='road'?(light?'rgba(255,255,250,.15)':'rgba(13,17,20,.17)')
      :(light?'rgba(255,248,231,.10)':'rgba(22,20,18,.10)');
    if(kind==='trunk')g.fillRect(x,y,2+rnd()*12,1+rnd()*2);else g.fillRect(x,y,1+rnd()*2,1+rnd()*2);
  }
  if(kind==='trunk'){for(let y=0;y<256;y+=11){g.strokeStyle='rgba(43,32,23,.18)';g.lineWidth=1;g.beginPath();g.moveTo(0,y);g.lineTo(256,y+4);g.stroke();}}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=texture.wrapT=T.RepeatWrapping;return texture;
}

function palmFrondGeometry() {
  // A shared frond has a curved center rib and paired tapered leaflets. The
  // cutout silhouette holds up against the sky without alpha-test textures.
  const positions:number[]=[];
  const triangle=(a:number[],b:number[],c:number[])=>positions.push(...a,...b,...c);
  const stem=(t:number)=>[t*5.1, 2.9*Math.sin(t*Math.PI*.65)-4.1*t*t,0];
  for(let i=0;i<20;i++){
    const t=i/20,u=(i+1)/20,a=stem(t),b=stem(u),wa=.055*(1-t),wb=.055*(1-u);
    triangle([a[0],a[1],-wa],[a[0],a[1],wa],[b[0],b[1],wb]);
    triangle([a[0],a[1],-wa],[b[0],b[1],wb],[b[0],b[1],-wb]);
  }
  for(let i=1;i<19;i++){
    const t=i/20,a=stem(t),b=stem(Math.min(.99,t+.075));
    const length=.68*Math.sin(Math.PI*t)**.7;
    for(const side of [-1,1]){
      const tip=[a[0]+.50*(1-t),a[1]-.22*length,side*length];
      triangle(a,b,tip);
      triangle(a,tip,[a[0]+.12,a[1]-.06,side*.035]);
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}

// Two shared lofts give the small traffic cars rounded shoulders, a sloped
// windshield and a tapered rear, without loading another external model.
function trafficBodyGeometry() {
  const sections=[[-.50,.39,.53],[-.40,.48,.78],[-.22,.50,.9],[.05,.50,1],[.38,.47,.87],[.50,.40,.55]];
  const vertices:number[]=[],indices:number[]=[];
  for(const [z,w,y] of sections)vertices.push(-w,0,z,-w,y,z,w,y,z,w,0,z);
  for(let s=0;s<sections.length-1;s++)for(let e=0;e<4;e++){
    const a=s*4+e,b=s*4+(e+1)%4,c=(s+1)*4+e,d=(s+1)*4+(e+1)%4;
    indices.push(a,b,c,b,d,c);
  }
  indices.push(0,2,1,0,3,2);const n=(sections.length-1)*4;indices.push(n,n+1,n+2,n,n+2,n+3);
  for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function trafficCabinGeometry() {
  const vertices=[-.44,0,-.30,.44,0,-.30,-.36,1,-.14,.36,1,-.14,-.44,0,.30,.44,0,.30,-.36,1,.18,.36,1,.18];
  const indices=[0,2,3,0,3,1,4,5,7,4,7,6,0,4,6,0,6,2,1,3,7,1,7,5,2,6,7,2,7,3];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// One reusable pitched roof instead of stacking a flat slab on the ferry hall.
// The ridge runs along Z; separate triangles give each slope its own normal.
function gableGeometry() {
  const g=new T.BufferGeometry();
  const positions=[
    -.5,0,-.5, 0,1,-.5, -.5,0,.5,  -.5,0,.5, 0,1,-.5, 0,1,.5,
    .5,0,.5, 0,1,-.5, .5,0,-.5,  .5,0,.5, 0,1,.5, 0,1,-.5,
    -.5,0,.5, 0,1,.5, .5,0,.5,  .5,0,-.5, 0,1,-.5, -.5,0,-.5,
  ];
  for(let i=0;i<positions.length;i+=9)for(let j=0;j<3;j++)
    [positions[i+3+j],positions[i+6+j]]=[positions[i+6+j],positions[i+3+j]];
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.computeVertexNormals();return g;
}

// A pointed, flared ferry hull; the little traffic boats keep actual volume
// and parallax without loading a second model or an animated water reflection.
function ferryHullGeometry() {
  const g=new T.BufferGeometry();
  const v=[-.34,0,-.42,.34,0,-.42,-.38,0,.37,.38,0,.37,
           -.46,1,-.35,.46,1,-.35,-.49,1,.37,.49,1,.37,0,1,-.5];
  const i=[0,4,8,0,8,1,1,8,5,0,2,6,0,6,4,1,5,7,1,7,3,
           2,3,7,2,7,6,4,6,7,4,7,5,4,5,8,0,1,3,0,3,2];
  g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(i);g.computeVertexNormals();return g;
}

function clockTexture() {
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!;
  g.fillStyle='#e4d5b4';g.fillRect(0,0,256,256);g.strokeStyle='#3b3730';g.lineWidth=9;
  g.beginPath();g.arc(128,128,114,0,Math.PI*2);g.stroke();g.lineWidth=3;
  for(let i=0;i<12;i++){const a=i*Math.PI/6;g.beginPath();g.moveTo(128+Math.sin(a)*94,128-Math.cos(a)*94);g.lineTo(128+Math.sin(a)*105,128-Math.cos(a)*105);g.stroke();}
  g.lineWidth=7;g.beginPath();g.moveTo(128,128);g.lineTo(128,59);g.moveTo(128,128);g.lineTo(175,146);g.stroke();
  g.fillStyle='#3b3730';g.beginPath();g.arc(128,128,7,0,Math.PI*2);g.fill();
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

function storefrontTexture() {
  const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d')!;
  const names=['COFFEE & DELI','FERRY BUILDING','CALIFORNIA GOODS','BAY PHARMACY'];
  g.textAlign='center';g.textBaseline='middle';g.font='600 54px sans-serif';
  names.forEach((name,i)=>{g.fillStyle=['#293931','#4d4a3b','#694c3d','#455950'][i];g.fillRect(0,i*128,1024,128);g.fillStyle='#eadabe';g.fillText(name,512,i*128+66);});
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

/** A standalone visual slice. It deliberately has no dependency on Tesland's
 * shared geography or networking; callers own the camera, light and water. */
export function buildEmbarcadero(scene:T.Scene):{colliders:Collider[]} {
  const colliders:Collider[]=[];
  const signs:Item[][]=[[],[],[],[]];
  const asphalt=grainTexture('road');asphalt.repeat.set(8,90);
  const masonry=grainTexture('stone');
  const trunk=grainTexture('trunk');
  const materials:Record<MaterialName,T.MeshStandardMaterial>={
    stone:new T.MeshStandardMaterial({color:0xc9bcaa,map:masonry,roughness:.95}),
    sand:new T.MeshStandardMaterial({color:0xcbb9a1,roughness:.91}),
    cream:new T.MeshStandardMaterial({color:0xe2d4bb,roughness:.89}),
    warm:new T.MeshStandardMaterial({color:0xad927c,roughness:.92}),
    terra:new T.MeshStandardMaterial({color:0xa9775d,roughness:.9}),
    glass:new T.MeshStandardMaterial({color:0x435c60,roughness:.28,metalness:.20}),
    glassLight:new T.MeshStandardMaterial({color:0x778580,roughness:.28,metalness:.18}),
    dark:new T.MeshStandardMaterial({color:0x333b36,roughness:.82}),
    metal:new T.MeshStandardMaterial({color:0x383a32,roughness:.66,metalness:.55}),
    gold:new T.MeshStandardMaterial({color:0xe3b36a,roughness:.38,metalness:.35,emissive:0x52310c,emissiveIntensity:.22}),
    leaf:new T.MeshStandardMaterial({color:0x66723a,side:T.DoubleSide,roughness:.96}),
    trunk:new T.MeshStandardMaterial({color:0x977e60,map:trunk,roughness:1}),
    paint:new T.MeshStandardMaterial({color:0xede4c8,roughness:.85}),
    road:new T.MeshStandardMaterial({color:0x596870,map:asphalt,roughness:.87}),
    paving:new T.MeshStandardMaterial({color:0xb5aa96,roughness:.99}),
    wood:new T.MeshStandardMaterial({color:0x715d4c,roughness:.96}),
    carpaint:new T.MeshStandardMaterial({color:0xffffff,roughness:.34,metalness:.22}),
    tire:new T.MeshStandardMaterial({color:0x202321,roughness:.94}),
    tail:new T.MeshStandardMaterial({color:0x9f2018,emissive:0x6a130d,emissiveIntensity:.6,roughness:.45}),
  };
  const archShape=new T.Shape();archShape.moveTo(-.5,0);
  for(let i=0;i<=16;i++){const a=Math.PI-i*Math.PI/16;archShape.lineTo(Math.cos(a)*.5,Math.sin(a)*.5);}
  archShape.closePath();
  const boxGeometry=new T.BoxGeometry(1,1,1);
  const geometries:Record<Shape,T.BufferGeometry>={box:boxGeometry,farbox:boxGeometry,column:new T.CylinderGeometry(.45,.5,1,10),sphere:new T.SphereGeometry(.5,8,5),frond:palmFrondGeometry(),arch:new T.TorusGeometry(.5,.035,4,16,Math.PI),archpane:new T.ShapeGeometry(archShape),ring:new T.TorusGeometry(.5,.025,4,24),carbody:trafficBodyGeometry(),cabin:trafficCabinGeometry(),wheel:new T.CylinderGeometry(.5,.5,1,14).rotateZ(Math.PI/2),gable:gableGeometry(),hull:ferryHullGeometry()};
  const batches=new Map<string,{shape:Shape;material:MaterialName;items:Item[];cast:boolean}>();
  const add=(shape:Shape,material:MaterialName,x:number,y:number,z:number,w:number,h:number,d:number,angle=0,cast=false,color?:number)=>{
    // Cell groups remain independently culled by both the view and tracked
    // shadow cameras as the player moves down the boulevard.
    const cell=Math.floor(z/120),key=`${shape}:${material}:${cell}:${cast?'s':'n'}`;
    const b=batches.get(key)??{shape,material,items:[],cast};b.items.push({x,y,z,w,h,d,angle,color});batches.set(key,b);
  };
  const box=(m:MaterialName,x:number,y:number,z:number,w:number,h:number,d:number,cast=false,color?:number)=>add('box',m,x,y,z,w,h,d,0,cast,color);
  const col=(m:MaterialName,x:number,y:number,z:number,w:number,h:number,d:number,cast=false)=>add('column',m,x,y,z,w,h,d,0,cast);
  const solid=(cx:number,cz:number,w:number,d:number,height:number)=>colliders.push({minX:cx-w/2,maxX:cx+w/2,minZ:cz-d/2,maxZ:cz+d/2,height});

  // Continuous road, with two curbs and a generous waterside promenade.
  box('paving',-140.5,-.11,-150,239,.22,610);
  box('road',0,-.08,-150,26,.16,610);
  box('paving',-17,.04,-150,8,.16,610);
  box('paving',21.5,.04,-150,17,.16,610);
  for(const x of [-13.15,13.15])box('cream',x,.16,-150,.30,.26,610);
  box('paint',0,.006,-150,.12,.015,610);
  for(const x of [-8.6,-4.3,4.3,8.6])for(let z=-440;z<145;z+=12)box('paint',x,.012,z,.12,.016,5.5);
  for(let z=-410;z<120;z+=18){
    // The promenade joints read as individual large paving slabs.
    box('stone',21.5,.126,z,16.5,.008,.05);
    box('stone',-17,.126,z,7.6,.008,.05);
  }
  for(const cross of [-70,-190,-310])for(let x=-11;x<12;x+=2.5)box('paint',x,.018,cross,1.2,.018,3.2);

  // Sidewalk trees and elegant two-arm street lamps share a handful of
  // instanced meshes. The palm's many leaflets are one reusable geometry.
  const tree=(x:number,z:number,index:number)=>{
    const h=9.3+(index%3)*.7,segments=6;
    for(let j=0;j<segments;j++){
      const t=(j+.5)/segments,lean=.28*Math.sin(t*1.3+index)*t;
      col('trunk',x+lean,h*t,z,.74-t*.20,h/segments+.05,.74-t*.20,true);
    }
    for(let j=0;j<17;j++){
      const a=j*Math.PI*2/17+index*.73,upper=j%3===0;
      const spread=upper?.64:.90+(j%3)*.055,arch=upper?1.38:.92+(j%3)*.1;
      add('frond','leaf',x,h+.1,z,spread,arch,spread,a,true,[0xc0cc8d,0xaabb77,0xd3d69d][j%3]);
    }
    solid(x,z,1.30,.84,h+.2);
    box('stone',x,.21,z,2.9,.20,2.9);
    box('dark',x,.32,z,1.8,.12,1.8);
  };
  const lamp=(x:number,z:number)=>{
    col('metal',x,3.4,z,.20,6.8,.20,true);col('metal',x,.45,z,.62,.9,.62,true);
    col('metal',x,6.7,z,.42,.20,.42);
    for(const side of [-1,1]){
      box('metal',x,6.45,z+side*.72,.13,.13,1.5,true);
      box('metal',x,6.25,z+side*1.27,.16,.48,.16,true);
      add('sphere','gold',x,6.03,z+side*1.27,.42,.50,.42,0,false);
      box('metal',x,6.37,z+side*1.27,.46,.10,.46,true);
    }
  };
  let t=0;
  for(let z=90;z>=-405;z-=24){
    tree(-17,z,t++);if(!(z< -170&&z> -270))tree(17,z,t++);
  }
  for(let z=78;z>=-405;z-=36){lamp(-19.6,z);if(!(z< -165&&z> -280))lamp(26.8,z);}
  // A substantial stone quay and dark iron balustrade give the edge of the
  // water a readable silhouette. Break the railing at the hall and piers.
  for(const [cz,length] of [[59,95],[-30,95],[-130,95],[-305,95],[-390,95]]){
    box('stone',29.65,.18,cz,.68,.66,length);
    box('cream',29.65,.54,cz,.88,.12,length);
    for(const y of [.92,1.31])box('metal',29.15,y,cz,.09,.08,length);
  }
  for(let z=105;z>=-430;z-=3){
    if((z< -174&&z> -260)||Math.abs(z+80)<8||Math.abs(z+320)<8)continue;
    col('metal',29.15,.72,z,.12,1.45,.12);
    add('sphere','metal',29.15,1.48,z,.22,.22,.22);
    if(Math.round((105-z)/3)%4===0){
      box('stone',29.25,.64,z,.65,1.28,.65);
      box('cream',29.25,1.32,z,.75,.14,.75);
    }
  }
  for(const z of [59,-30,-130,-305,-390])box('metal',29.15,1.15,z,.09,.09,95);
  for(let z=88;z>=-400;z-=38){
    if(z< -170&&z> -270)continue;
    box('wood',24,.56,z,1.15,.13,2.3);box('wood',24,1.05,z-.94,.13,.9,.12);
    for(const dz of [-.8,.8])box('metal',24,.3,z+dz,.1,.6,.10);
  }

  // Four static, collidable cars add street life without an AI scheduler or
  // misleading animated vehicles that the collision system cannot follow.
  for(const [x,z,color] of [[-8.5,-55,0x9eaaa4],[4.3,-70,0xe8e3d9],[-4.3,-110,0x697c7b],[0,-155,0xb5b2a3]] as number[][]){
    add('carbody','carpaint',x,.38,z,2,.76,4.5,0,true,color);
    add('cabin','glass',x,1.0,z,1.88,.67,4.5,0,true);
    box('carpaint',x,1.69,z+.09,1.38,.06,1.23,true,color);
    box('dark',x,.43,z+2.22,1.75,.23,.08);
    box('tail',x,.88,z+2.18,1.50,.11,.08);
    box('paint',x,.78,z-2.20,1.35,.10,.08);
    for(const side of [-1,1])for(const dz of [-1.35,1.35]){
      add('wheel','tire',x+side*.90,.37,z+dz,.24,.74,.74,0,true);
      add('wheel','metal',x+side*1.04,.37,z+dz,.055,.43,.43);
    }
    solid(x,z,2.14,4.5,1.72);
  }

  // Varied street-wall buildings, with deep, independently modelled windows,
  // pilasters, cornices and storefronts. Each solid envelope has a collider.
  const palette:MaterialName[]=['sand','stone','cream','warm','stone','sand','terra','cream'];
  const buildings:{x:number;z:number;w:number;d:number;h:number;style:number}[]=[];
  let z=100,idx=0;
  while(z>-430){
    const depth=[27,22,31,25,19,28,24,30][idx%8],height=[31,42,25,54,29,38,58,26][idx%8];
    const center=z-depth/2;
    buildings.push({x:-34.8,z:center,w:27,d:depth-1,h:height,style:idx%8});z-=depth;idx++;
  }
  // Taller towers behind the street wall add a real, spatial skyline.
  for(const [x,zz,w,d,h] of [[-74,-80,27,24,72],[-78,-155,30,27,100],[-65,-235,23,23,87],[-75,-315,33,26,76]] as number[][])
    buildings.push({x,z:zz,w,d,h,style:1});
  for(const b of buildings){
    const face=b.x+b.w/2,front=b.z+b.d/2,wall=palette[b.style],tall=b.h>65;
    box(wall,b.x,b.h/2,b.z,b.w,b.h,b.d,true);
    solid(b.x+.05,b.z,b.w+.85,b.d+.40,b.h+.5);
    box('cream',b.x,b.h-.35,b.z,b.w+.30,.70,b.d+.30,true);
    box('cream',b.x,4.0,b.z,b.w+.22,.28,b.d+.22,true);
    // Alternate masonry bands, slender pilasters and roof setbacks instead of
    // applying the same facade grid to every street-wall building.
    if(!tall&&[0,2,5,7].includes(b.style)){
      for(let yy=10.5;yy<b.h-3;yy+=6.7)box('cream',face+.17,yy,b.z,.23,.20,b.d-.2);
      box('stone',b.x,b.h+.15,b.z,b.w-.7,.3,b.d-1.0,true);
      box('cream',b.x,b.h+.32,b.z,b.w-.4,.10,b.d-.6,true);
    }else{
      for(let zz=b.z-b.d/2+3;zz<b.z+b.d/2-2;zz+=6.7)
        box('stone',face+.18,b.h/2,zz,.35,b.h-.8,.24);
      box('stone',b.x,b.h+.13,b.z,b.w*.72,.26,b.d*.68,true);
      box('cream',b.x,b.h+.32,b.z,b.w*.74,.12,b.d*.70,true);
    }
    const spacing=tall?3.8:3.35,floors=Math.floor((b.h-5)/spacing),cols=Math.max(3,Math.floor((b.d-2)/3.7));
    for(let floor=0;floor<floors;floor++){
      const yy=6+floor*spacing;if(yy+1.15>b.h-.8)continue;
      for(let i=0;i<cols;i++){
        const zz=b.z+(i-(cols-1)/2)*(b.d-2.5)/cols;
        box('cream',face+.035,yy,zz,.08,2.32,2.0);
        box((i+floor)%5===0?'glassLight':'glass',face+.10,yy,zz,.08,2.12,1.8);
        box('cream',face+.16,yy,zz,.05,2.12,.08);
        box('cream',face+.16,yy-.12,zz,.05,.08,1.80);
        box('cream',face+.15,yy-1.24,zz,.30,.14,2.12);
      }
    }
    for(const dz of [-b.d/2+.25,b.d/2-.25])box('cream',face+.12,b.h/2,b.z+dz,.32,b.h,.34,true);
    // A second wall facing the player ensures facades read from oblique views.
    const frontCols=Math.max(2,Math.floor((b.w-2)/4));
    for(let floor=0;floor<floors;floor++){
      const yy=6+floor*spacing;if(yy+1.15>b.h-.8)continue;
      for(let i=0;i<frontCols;i++){
        const xx=b.x+(i-(frontCols-1)/2)*(b.w-2)/frontCols;
        box('cream',xx,yy,front+.04,2,.08+2.24,.08);box('glass',xx,yy,front+.10,1.8,2.08,.08);
      }
    }
    for(let i=0;i<Math.max(3,Math.floor(b.d/4.5));i++){
      const n=Math.max(3,Math.floor(b.d/4.5)),zz=b.z+(i-(n-1)/2)*(b.d-2)/n;
      box('dark',face+.10,2.0,zz,.15,3.1,(b.d-2)/n-.25);
      box(i%3?'glass':'glassLight',face+.19,2.08,zz,.08,2.75,(b.d-2)/n-.55);
    }
    box(['terra','dark','warm'][b.style%3] as MaterialName,face+.24,3.75,b.z,.36,.65,b.d-1.0,true);
    // Slim canvas-style awnings project above the storefront windows.
    if(b.x> -50){
      box((b.style%2?'dark':'terra'),face+.25,3.33,b.z,.40,.16,b.d-1.2,true);
      box('cream',face+.43,3.22,b.z,.08,.18,b.d-1.2);
    }
    if(b.x> -50)signs[[0,2,3][b.style%3]].push({x:face+.43,y:3.76,z:b.z,w:Math.min(9,b.d-.8),h:.58,d:1,angle:Math.PI/2});
  }

  // Ferry Building's long arched hall and stepped clock tower.
  const ferry={x:21.4,z:-221,w:14.5,d:86,h:21},west=ferry.x-ferry.w/2;
  box('stone',ferry.x,ferry.h/2,ferry.z,ferry.w,ferry.h,ferry.d,true);solid(ferry.x,ferry.z,ferry.w+.7,ferry.d+1,ferry.h+2);
  box('cream',ferry.x,20.7,ferry.z,ferry.w+.5,1.2,ferry.d+1,true);
  box('sand',ferry.x,21.65,ferry.z,ferry.w-.5,.7,ferry.d-1,true);
  add('gable','warm',ferry.x,22.0,ferry.z,ferry.w-.5,1.0,ferry.d-1,0,true);
  // Multiple horizontal cornices and the articulated arcade are visible from
  // the street, while retaining the same underlying hall collision envelope.
  for(const yy of [2.0,11.8,13.6,19.0])box('cream',west-.32,yy,ferry.z,.48,.3,ferry.d+.1,true);
  box('cream',west-.50,20.0,ferry.z,.65,.5,ferry.d+.4,true);
  signs[1].push({x:west-.36,y:13.0,z:-200,w:9,h:.8,d:1,angle:-Math.PI/2});
  for(let zf=ferry.z-ferry.d/2+3.5;zf<ferry.z+ferry.d/2-1;zf+=4.2){
    box('cream',west-.12,9,zf,.25,15,.4,true);
    box('dark',west-.16,5.4,zf+1.9,.12,7.0,2.85);
    box('glassLight',west-.24,5.4,zf+1.9,.08,6.5,2.55);
    add('archpane','glassLight',west-.25,8.65,zf+1.9,2.55,2.55,1,-Math.PI/2);
    add('arch','cream',west-.30,8.65,zf+1.9,2.8,2.8,1,-Math.PI/2);
    box('cream',west-.31,5.3,zf+1.9,.10,6.5,.10);
    box('cream',west-.24,12.4,zf+1.9,.12,.35,3.0);
    box('dark',west-.16,16.3,zf+1.9,.12,3.8,2.7);
    box('glass',west-.23,16.3,zf+1.9,.08,3.4,2.4);
  }
  // The end elevation faces the starting camera. Give it the same arched
  // openings as the long arcade so the hall reads immediately from the road.
  const ferryEnd=ferry.z+ferry.d/2;
  for(const xx of [-4.6,-1.55,1.55,4.6]){
    box('cream',ferry.x+xx,5.0,ferryEnd+.08,2.75,8.0,.16);
    box('glass',ferry.x+xx,5.0,ferryEnd+.18,2.45,7.7,.10);
    add('archpane','glass',ferry.x+xx,8.85,ferryEnd+.18,2.45,2.45,1);
    add('arch','cream',ferry.x+xx,8.85,ferryEnd+.25,2.65,2.65,1);
    box('cream',ferry.x+xx,5.0,ferryEnd+.25,.1,7.7,.08);
    box('cream',ferry.x+xx,16,ferryEnd+.08,2.65,3.4,.16);
    box('glass',ferry.x+xx,16,ferryEnd+.18,2.35,3.1,.10);
  }
  for(const xx of [-6.5,-3.05,0,3.05,6.5])box('cream',ferry.x+xx,10,ferryEnd+.19,.3,19,.24,true);
  for(const yy of [2.0,11.8,13.6,19.0])box('cream',ferry.x,yy,ferryEnd+.21,ferry.w,.28,.27,true);
  const towerZ=-200,towerX=21.0;
  box('stone',towerX,33.5,towerZ,8,27,8,true);solid(towerX,towerZ,8,8,74);
  for(const yy of [23.5,29,42,44])box('cream',towerX,yy,towerZ,8.3,.35,8.3,true);
  box('cream',towerX,45.0,towerZ,8.8,1.1,8.8,true);
  box('stone',towerX,49.0,towerZ,7.5,7.4,7.5,true);
  box('cream',towerX,53,towerZ,8.2,.7,8.2,true);
  box('stone',towerX,57.5,towerZ,6.7,8.2,6.7,true);
  box('cream',towerX,61.8,towerZ,7.5,.7,7.5,true);
  box('stone',towerX,65.5,towerZ,5.4,6.6,5.4,true);
  box('cream',towerX,69.2,towerZ,6,.8,6,true);
  box('stone',towerX,71,towerZ,3.7,3.2,3.7,true);
  col('metal',towerX,74.2,towerZ,.15,3.8,.15);
  box('terra',towerX+.6,75.4,towerZ,1.25,.7,.06);
  for(const sx of [-1,1])for(const sz of [-1,1]){
    box('cream',towerX+sx*3.65,35,towerZ+sz*3.65,.55,24,.55,true);
    box('cream',towerX+sx*2.9,57.6,towerZ+sz*2.9,.38,7.8,.38,true);
  }
  // The open belfry tiers and narrow mouldings break the tower's flat shaft
  // into the recognisable stacked, arched silhouette of the Ferry Building.
  for(const [y,half] of [[49,3.75],[57.5,3.35],[65.5,2.7]]){
    for(const offset of [-1.65,0,1.65]){
      const width=offset===0?1.05:.9;
      box('dark',towerX+offset,y-.1,towerZ+half+.06,width,3.7,.1);
      add('archpane','glass',towerX+offset,y+1.75,towerZ+half+.12,width,width,1);
      add('arch','cream',towerX+offset,y+1.75,towerZ+half+.17,width+.13,width+.13,1);
      box('cream',towerX+offset-width/2-.08,y-.1,towerZ+half+.16,.16,3.9,.16);
      box('dark',towerX-half-.06,y-.1,towerZ+offset,.1,3.7,width);
      add('archpane','glass',towerX-half-.12,y+1.75,towerZ+offset,width,width,1,-Math.PI/2);
      add('arch','cream',towerX-half-.17,y+1.75,towerZ+offset,width+.13,width+.13,1,-Math.PI/2);
      box('cream',towerX-half-.16,y-.1,towerZ+offset-width/2-.08,.16,3.9,.16);
    }
    box('cream',towerX,y-2.18,towerZ,half*2+.5,.28,half*2+.5,true);
  }
  const clock=new T.Mesh(new T.CircleGeometry(2.25,32),new T.MeshStandardMaterial({map:clockTexture(),roughness:.8}));
  clock.position.set(towerX,37,towerZ+4.05);scene.add(clock);
  const sideClock=new T.Mesh(new T.CircleGeometry(2.25,32),clock.material);sideClock.position.set(towerX-4.05,37,towerZ);sideClock.rotation.y=-Math.PI/2;scene.add(sideClock);
  add('ring','metal',towerX,37,towerZ+4.10,4.7,4.7,1);
  add('ring','metal',towerX-4.10,37,towerZ,4.7,4.7,1,-Math.PI/2);

  // Timber piers, railings and ferry decks stay in world space, so their
  // parallax changes naturally as the player drives or flies past.
  for(const pz of [-80,-320]){
    box('wood',46,.65,pz,34,.8,13,true);
    for(const px of [33,40,48,56,62])for(const dz of [-5,5])col('wood',px,-1,pz+dz,.6,4,.6,true);
    for(let px=32;px<=62;px+=2.8)box('stone',px,1.06,pz,.05,.025,12.5);
    for(const dz of [-6.2,6.2]){
      for(let px=33;px<63;px+=4)col('metal',px,1.78,pz+dz,.16,1.45,.16);
      for(const y of [1.55,2.20])box('metal',48,y,pz+dz,31,.09,.09);
    }
    box('dark',63,1.05,pz,.4,.4,13);
  }
  for(const [fx,fz,s] of [[71,-90,1],[64,-300,.7],[103,-165,.55]] as number[][]){
    const fy=(y:number)=>y*s-.7*(1-s);
    add('hull','dark',fx,-.7,fz,13*s,2.6*s,29*s,0,true);
    box('cream',fx,fy(1.9),fz,12.4*s,.35*s,28*s,true);
    box('cream',fx,fy(3.6),fz,12*s,3.4*s,26*s,true);
    box('cream',fx,fy(5.9),fz,9.5*s,2*s,16*s,true);
    box('dark',fx,fy(6.95),fz,9.9*s,.2*s,16.5*s);
    for(const side of [-1,1]){
      for(let zf=-9;zf<=9;zf+=4){
        box('glass',fx+side*6*s,fy(4),fz+zf*s,.10*s,1.5*s,2.6*s);
        box('cream',fx+side*6.1*s,fy(4),fz+zf*s,.06*s,1.5*s,.07*s);
      }
      for(const zf of [-7,7])add('ring','terra',fx+side*6.15*s,fy(2.6),fz+zf*s,1*s,1*s,1,side*Math.PI/2);
      box('metal',fx+side*5.4*s,fy(7.25),fz,.07*s,.07*s,13*s);
    }
    col('metal',fx,fy(8),fz,.20*s,4*s,.20*s);
  }

  // The opposite shore is deliberately a low-cost 3D ridge, not a backdrop
  // attached to the camera. Its changing angle makes the bay feel spatial.
  const hills=new T.BufferGeometry(),hillPositions:number[]=[],hillColors:number[]=[],hillIndices:number[]=[],hillUVs:number[]=[];
  const hillSteps=156,hillZ=(i:number)=>-1500+i*13;
  const ridgeColors=[new T.Color(0x879a8d),new T.Color(0x9ca99a),new T.Color(0xb1b9a9)];
  for(let row=0;row<3;row++)for(let i=0;i<=hillSteps;i++){
    const zz=hillZ(i),x=650+row*200;
    const warped=zz+70*Math.sin(zz*.0038+row*.37);
    const undulation=15*Math.sin(warped*.0041+row*.81)+7*Math.sin(warped*.0107+row*.48)+3*Math.sin(warped*.021);
    const height=Math.max(11,28+row*29+undulation);
    hillPositions.push(x,height,zz);
    const c=ridgeColors[row].clone().multiplyScalar(.90+.10*Math.sin(warped*.008));hillColors.push(c.r,c.g,c.b);
    hillUVs.push((zz+1500)/280,row*.55);
  }
  for(let row=0;row<2;row++)for(let i=0;i<hillSteps;i++){
    const a=row*(hillSteps+1)+i,b=a+1,c=a+hillSteps+1,d=c+1;
    hillIndices.push(a,c,b,b,c,d);
  }
  // Lower the near edge to sea level so the ridge hides no water gaps.
  const groundStart=hillPositions.length/3;
  for(let i=0;i<=hillSteps;i++){
    const zz=hillZ(i);
    hillPositions.push(650,-.7,zz);
    const c=new T.Color(0x9aa898).multiplyScalar(.94+.06*Math.sin(zz*.013));hillColors.push(c.r,c.g,c.b);
    hillUVs.push((zz+1500)/280,-.35);
  }
  for(let i=0;i<hillSteps;i++)hillIndices.push(i,i+1,groundStart+i, i+1,groundStart+i+1,groundStart+i);
  hills.setAttribute('position',new T.Float32BufferAttribute(hillPositions,3));
  hills.setAttribute('color',new T.Float32BufferAttribute(hillColors,3));
  hills.setAttribute('uv',new T.Float32BufferAttribute(hillUVs,2));
  hills.setIndex(hillIndices);hills.computeVertexNormals();
  // A low-contrast procedural ground texture suggests scrub, ridges and
  // streets instead of presenting one flat polygon at the horizon.
  const hillside=document.createElement('canvas');hillside.width=hillside.height=256;
  const hg=hillside.getContext('2d')!;hg.fillStyle='#f0f0eb';hg.fillRect(0,0,256,256);
  let hillSeed=6703;const hillRandom=()=>{hillSeed=(hillSeed*1664525+1013904223)>>>0;return hillSeed/4294967296;};
  for(let i=0;i<1800;i++){
    hg.fillStyle=i%5?'rgba(58,78,61,.10)':'rgba(137,107,73,.09)';
    hg.fillRect(hillRandom()*256,hillRandom()*256,1+hillRandom()*5,1+hillRandom()*2);
  }
  const hillTexture=new T.CanvasTexture(hillside);hillTexture.colorSpace=T.SRGBColorSpace;
  hillTexture.wrapS=hillTexture.wrapT=T.RepeatWrapping;
  scene.add(new T.Mesh(hills,new T.MeshStandardMaterial({map:hillTexture,vertexColors:true,roughness:1,side:T.DoubleSide})));
  // Small clustered blocks imply settlements across the bay without large,
  // isolated toy towers. They are beyond the playable boundary.
  for(let i=0;i<130;i++){
    const cluster=Math.floor(i/13),within=i%13;
    const zz=-1110+cluster*145+within*4.5+(i%3)*2,x=640+(i%4)*4;
    const h=1.8+(i*7%8)*.45,w=2.2+(i%3)*.6;
    // Keep the opposite shore in its own culling batches; mixing it with
    // street-level boxes would make their bounding spheres span the bay.
    add('farbox',i%3?'stone':'cream',x,h/2-.4,zz,w,h,2+(i%4)*.7);
  }

  // Bay Bridge silhouette. Its separate towers, deck and suspension cables
  // stay in world space and do not add collision to the playable boulevard.
  const bridgeZ=-440,deckY=21;
  box('metal',305,deckY,bridgeZ,510,2.2,12,true);
  box('stone',305,deckY-1.8,bridgeZ,510,1.4,8);
  for(const tx of [145,390]){
    for(const dz of [-4.5,4.5]){
      box('metal',tx,58,bridgeZ+dz,3.8,74,3.8,true);
      box('stone',tx,19,bridgeZ+dz,7,8,7,true);
    }
    for(const y of [35,52,70,88])box('metal',tx,y,bridgeZ,3,2.2,12,true);
    for(let y=31;y<81;y+=15){
      const cross=new T.Mesh(geometries.box,materials.metal);cross.position.set(tx,y+7.5,bridgeZ);cross.scale.set(2,19,.9);cross.rotation.x=Math.PI/4;scene.add(cross);
      const cross2=cross.clone();cross2.rotation.x=-Math.PI/4;scene.add(cross2);
    }
  }
  for(const side of [-1,1]){
    const points:T.Vector3[]=[];
    for(let i=0;i<=80;i++){
      const x=50+i*6.35;let y;
      if(x<145){const t=(x-50)/95;y=28+64*t*t;}
      else if(x<390){const t=(x-145)/245;y=92-55*4*t*(1-t);}
      else{const t=(x-390)/168;y=92-64*(1-(1-t)*(1-t));}
      points.push(new T.Vector3(x,y,bridgeZ+side*5));
      if(i%3===0)box('metal',x,(y+deckY)/2,bridgeZ+side*5,.10,Math.max(.1,y-deckY),.10);
    }
    const cable=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),80,.34,6,false),materials.metal);scene.add(cable);
  }

  const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),up=new T.Vector3(0,1,0),color=new T.Color();
  for(const b of batches.values()){
    const mesh=new T.InstancedMesh(geometries[b.shape],materials[b.material],b.items.length);
    b.items.forEach((p,i)=>{mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.angle),scale.set(p.w,p.h,p.d)));if(p.color!==undefined)mesh.setColorAt(i,color.setHex(p.color));});
    mesh.castShadow=b.cast;mesh.receiveShadow=b.shape!=='frond';mesh.computeBoundingSphere();scene.add(mesh);
  }
  const signMaterial=new T.MeshStandardMaterial({map:storefrontTexture(),roughness:.9});
  signs.forEach((items,index)=>{
    if(!items.length)return;
    const geometry=new T.PlaneGeometry(1,1),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setY(i,(uv.getY(i)+3-index)/4);
    const mesh=new T.InstancedMesh(geometry,signMaterial,items.length);
    items.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.angle),scale.set(p.w,p.h,1))));
    mesh.computeBoundingSphere();scene.add(mesh);
  });
  return {colliders};
}
