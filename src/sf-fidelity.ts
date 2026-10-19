import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, ROADS } from '../shared/map';
import { VEHICLES } from '../shared/vehicles';
import { loft } from './coachwork';
import { box, setVehicleDistantOverride } from './vehicles';

// Opt-in visual-only experiment. Facades sit on existing SF building envelopes;
// authoritative collision, roofs, streets and the world clock are unchanged.
function facadeTexture(kind:'house'|'office', variant:number):T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;
  const c=canvas.getContext('2d')!;
  const base=kind==='house'?['#cbbcad','#e0d4bd','#b9aaa1'][variant]:['#9caaa9','#c5bcb0','#b5bcba'][variant];
  c.fillStyle=base;c.fillRect(0,0,512,1024);
  // Subtle horizontal courses and soft mottling give the facade material
  // without one texture or mesh per window. Deterministic; no network assets.
  for(let y=0;y<1024;y+=kind==='house'?45:32){c.fillStyle='rgba(70,62,55,.10)';c.fillRect(0,y,512,2);c.fillStyle='rgba(255,249,225,.10)';c.fillRect(0,y+2,512,2);}
  for(let i=0;i<900;i++){
    const x=(i*71+variant*53)%512,y=(i*157+variant*43)%1024;
    c.fillStyle=i%2?'rgba(255,248,228,.035)':'rgba(30,35,35,.035)';c.fillRect(x,y,2+(i%5),2+(i%3));
  }
  const floors=kind==='house'?4:11, columns=kind==='house'?3:5;
  const top=kind==='house'?84:28, bottom=kind==='house'?150:26;
  const row=(1024-top-bottom)/floors,col=512/columns;
  for(let f=0;f<floors;f++)for(let n=0;n<columns;n++){
    const x=n*col+col*.15,y=top+f*row+row*.17,w=col*.7,h=row*.66;
    c.fillStyle=kind==='house'?'#e8ded0':'#7d8985';c.fillRect(x-5,y-5,w+10,h+10);
    const glass=c.createLinearGradient(x,y,x+w,y+h);glass.addColorStop(0,'#66838b');glass.addColorStop(.5,(f+n+variant)%4===0?'#9eaaa1':'#435e67');glass.addColorStop(1,'#273e48');
    c.fillStyle=glass;c.fillRect(x,y,w,h);
    c.fillStyle='rgba(228,238,222,.34)';c.fillRect(x+w*.10,y+3,w*.11,h-6);
    c.fillStyle=kind==='house'?'#ddd0bc':'#9ba7a2';c.fillRect(x+w*.49,y,kind==='house'?4:2,h);
    c.fillRect(x,y+h*.55,w,kind==='house'?4:2);
    if(kind==='house'){
      c.fillStyle='#eee2d2';c.fillRect(x-8,y+h+4,w+16,8);
      c.fillStyle='rgba(75,65,55,.25)';c.fillRect(x-8,y+h+12,w+16,5);
    }
  }
  if(kind==='house'){
    // Stoops/doors are painted on the physical envelope, never road geometry.
    c.fillStyle='#6b584c';c.fillRect(206,895,100,129);
    c.fillStyle='#b8a18c';c.fillRect(215,902,82,106);
    c.fillStyle='#4e554f';c.fillRect(226,910,60,90);
    c.fillStyle='#f3e4d2';c.fillRect(0,35,512,23);c.fillRect(0,64,512,8);
  }else{
    c.fillStyle='#4b5e61';c.fillRect(10,948,492,76);
    c.fillStyle='#a2aaa0';for(let x=12;x<512;x+=84)c.fillRect(x,948,4,76);
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

type Face={x:number;y:number;z:number;w:number;h:number;angle:number};
export async function buildSfFidelity(scene:T.Scene) {
  const loader=new T.TextureLoader();
  let textureFallback=false;
  const textures=await Promise.all((['victorian-facade','office-facade'] as const).map(async (name,index)=>{
    try {const texture=await loader.loadAsync(`/visual-lab/${name}.webp`);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;}
    catch {textureFallback=true;return facadeTexture(index===0?'house':'office',0);}
  }));
  const buckets=new Map<string,{kind:'house'|'office';variant:number;faces:Face[]}>();
  for(const b of BUILDINGS){
    if(b.district!=='sf'||!['house','midrise','tower'].includes(b.style))continue;
    const kind=b.style==='house'?'house':'office';
    const variant=Math.abs(Math.round(b.x*13+b.z*17))%3;
    // Small cells retain useful frustum culling without per-building draws.
    const key=`${kind}:${variant}:${Math.floor(b.x/180)}:${Math.floor(b.z/180)}`;
    const bucket=buckets.get(key)??{kind,variant,faces:[]};
    const y=b.h/2;
    bucket.faces.push(
      {x:b.x,y,z:b.z+b.d/2+.09,w:b.w,h:b.h,angle:0},
      {x:b.x,y,z:b.z-b.d/2-.09,w:b.w,h:b.h,angle:Math.PI},
      {x:b.x+b.w/2+.09,y,z:b.z,w:b.d,h:b.h,angle:Math.PI/2},
      {x:b.x-b.w/2-.09,y,z:b.z,w:b.d,h:b.h,angle:-Math.PI/2});
    buckets.set(key,bucket);
  }
  const group=new T.Group();group.name='sf-fidelity-facades';
  const geometry=new T.PlaneGeometry(1,1);
  const mats=new Map<string,T.MeshStandardMaterial>();
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
  for(const {kind,variant,faces} of buckets.values()){
    const materialKey=`${kind}:${variant}`;
    if(!mats.has(materialKey))mats.set(materialKey,new T.MeshStandardMaterial({map:textures[kind==='house'?0:1],color:[0xffffff,0xe6e2dc,0xd7e4df][variant],roughness:.82}));
    const mesh=new T.InstancedMesh(geometry,mats.get(materialKey)!,faces.length);
    faces.forEach((f,i)=>mesh.setMatrixAt(i,matrix.compose(position.set(f.x,f.y,f.z),rotation.setFromAxisAngle(up,f.angle),scale.set(f.w,f.h,1))));
    mesh.computeBoundingSphere();group.add(mesh);
  }
  scene.add(group);
  // A shared, fine-grained asphalt atlas follows existing SF street rectangles
  // and sits below their existing painted markings. No new road/collision.
  const asphaltCanvas=document.createElement('canvas');asphaltCanvas.width=256;asphaltCanvas.height=256;
  const a=asphaltCanvas.getContext('2d')!;a.fillStyle='#565b59';a.fillRect(0,0,256,256);
  for(let i=0;i<6000;i++){const x=(i*73+Math.floor(i/7)*19)%256,y=(i*151+Math.floor(i/23)*13)%256;a.fillStyle=i%3===0?'rgba(230,225,206,.08)':'rgba(20,25,23,.11)';a.fillRect(x,y,1+(i%2),1);}
  const asphaltTexture=new T.CanvasTexture(asphaltCanvas);asphaltTexture.colorSpace=T.SRGBColorSpace;asphaltTexture.wrapS=asphaltTexture.wrapT=T.RepeatWrapping;asphaltTexture.repeat.set(2,2);
  const roads=ROADS.filter(r=>!r.kind&&r.x>=-410&&r.x<=90&&r.z>=-270&&r.z<=230&&r.w<=20&&r.d<=20);
  const roadGeometry=new T.PlaneGeometry(1,1);roadGeometry.rotateX(-Math.PI/2);
  const roadMesh=new T.InstancedMesh(roadGeometry,new T.MeshStandardMaterial({map:asphaltTexture,roughness:1}),roads.length);
  roads.forEach((r,i)=>roadMesh.setMatrixAt(i,matrix.compose(position.set(r.x,.133,r.z),rotation.setFromAxisAngle(up,r.angle??0),scale.set(r.w,1,r.d))));roadMesh.computeBoundingSphere();group.add(roadMesh);
  return {facadeBuildings:[...buckets.values()].reduce((n,b)=>n+b.faces.length/4,0),facadeBatches:buckets.size,textureFallback};
}

let roadsterTemplate:T.Group|undefined;
let distantRoadsterTemplate:T.Mesh|undefined;
/** Replace only the stock Roadster's presentation; preserve its named wheels,
 * seat, rocket hardware and effects. Dimensions and driving remain shared. */
export function applyRoadster2026(root:T.Group) {
  for(const child of [...root.children])if(child instanceof T.Mesh&&!child.name)root.remove(child);
  if(!roadsterTemplate){
    const {length:l,width:w,height:h,wheelbase}=VEHICLES.roadster;
    const group=new T.Group();group.name='roadster-2026-body';
    const pearl=new T.MeshPhysicalMaterial({color:0xf0efea,metalness:.36,roughness:.24,clearcoat:1,clearcoatRoughness:.16});
    const bronze=new T.MeshPhysicalMaterial({color:0x62533e,metalness:.53,roughness:.19,clearcoat:1});
        const sections:[number,number,number,number][]=[[-.50,.80,.30,.44],[-.44,.92,.25,.53],[-.30,1,.23,.69],[-.10,.97,.23,.73],[.12,.98,.23,.76],[.33,1,.24,.79],[.47,.96,.27,.76],[.50,.92,.31,.72]].map(([z,x,b,t])=>[z*l,x*w/2,b,t]);
    const dense:[number,number,number,number][]=[];
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<8;j++)dense.push(sections[i].map((v,k)=>v+(sections[i+1][k]-v)*j/8) as [number,number,number,number]);dense.push(sections[sections.length-1]);
    const body=loft(dense,.22,32).clone(),p=body.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),y=p.getY(i),delta=Math.min(Math.abs(z-wheelbase/2),Math.abs(z+wheelbase/2));
      if(Math.abs(x)>w*.34&&delta<.395&&y<.62)p.setY(i,Math.max(y,.35+Math.sqrt(Math.max(0,.395**2-delta**2))));
    }
    body.computeVertexNormals();const shell=new T.Mesh(body,pearl);shell.name='2026-shell';group.add(shell);
    // Continuous bronze-tinted canopy and angular white roof rails.
    const canopy=loft([[-l*.23,w*.375,.68,.70],[-l*.09,w*.34,.70,h*.97],[l*.12,w*.33,.72,h],[l*.32,w*.375,.73,.76]],.24,24);
    group.add(new T.Mesh(canopy,bronze));
    // Decorative lift-fan covers remain visible when the car rolls or flies.
    const fanGeometry=new T.CylinderGeometry(.32,.32,.04,16),fanMaterial=new T.MeshStandardMaterial({color:0x20282a,metalness:.6,roughness:.35});
    for(const z of [-l*.23,l*.23]){const fan=new T.Mesh(fanGeometry,fanMaterial);fan.name='2026-lift-fan';fan.position.set(0,.14,z);group.add(fan);}
    for(const side of [-1,1]){
      const rail=box(group,side*w*.33,h*.92,l*.02,.07,.05,l*.54,0xeae9e4);rail.rotation.x=side===0?0:.04;
      const sill=box(group,side*w*.49,.30,0,.04,.13,l*.63,0x1a2428);
      sill.name='2026-sill';
      box(group,side*w*.49,.63,l*.06,.025,.025,.19,0x242a2b);
    }
    box(group,0,.64,l*.502,w*.85,.17,.04,0x11191d);
    box(group,0,.67,l*.508,w*.82,.05,.02,0xef3d36);
    box(group,0,.34,l*.501,w*.76,.23,.04,0x0d1519);
    box(group,0,.31,-l*.50,w*.78,.10,.04,0x121a1e);
    // The front lamps are normally hidden; black slots mark their position.
    for(const side of [-1,1])box(group,side*w*.28,.46,-l*.49,w*.23,.022,.05,0x283034);
    roadsterTemplate=group;

    // Distant Roadsters use a small, shared one-draw mesh with the same pearl
    // body and bronze canopy, instead of switching back to the stock red car.
    const parts:T.BufferGeometry[]=[];
    const addPart=(geometry:T.BufferGeometry,color:number)=>{
      const part=geometry.index?geometry.toNonIndexed():geometry;
      if(part!==geometry)geometry.dispose();
      part.deleteAttribute('uv');
      const shade=new T.Color(color),values=new Float32Array(part.getAttribute('position').count*3);
      for(let i=0;i<values.length;i+=3){values[i]=shade.r;values[i+1]=shade.g;values[i+2]=shade.b;}
      part.setAttribute('color',new T.BufferAttribute(values,3));parts.push(part);
    };
    addPart(loft(sections,.22,8),0xf0efea);
    addPart(loft([[-l*.23,w*.375,.68,.70],[-l*.09,w*.34,.70,h*.97],[l*.12,w*.33,.72,h],[l*.32,w*.375,.73,.76]],.24,8),0x62533e);
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
  setVehicleDistantOverride(root,distantRoadsterTemplate!);
  root.add(model);root.userData.sfFidelityRoadster=true;
}
