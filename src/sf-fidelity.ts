import * as T from 'three';
import { BUILDINGS, ROADS, terrainHeight } from '../shared/map';
import { NORTH_LANDMARKS } from '../shared/north-landmarks';
import { buildSfFidelityStreets } from './sf-fidelity-streets';

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
  const trim:Face[]=[];
  const plainSideLandmarks=new Map(NORTH_LANDMARKS.filter(p=>p.district==='sf'&&['modern','theatre','plaza','pier','cliff'].includes(p.shape)).map(p=>[`${p.x}:${p.z}`,p.shape]));
  let facadeBuildings=0;
  const addFaces=(kind:'house'|'office',variant:number,x:number,z:number,faces:Face[])=>{
    // Small cells retain useful frustum culling without per-building draws.
    const key=`${kind}:${variant}:${Math.floor(x/180)}:${Math.floor(z/180)}`;
    const bucket=buckets.get(key)??{kind,variant,faces:[]};
    bucket.faces.push(...faces);buckets.set(key,bucket);facadeBuildings++;
  };
  for(const b of BUILDINGS){
    if(b.district!=='sf')continue;
    const variant=Math.abs(Math.round(b.x*13+b.z*17))%3;
    if(['house','midrise','tower'].includes(b.style)){
      const kind=b.style==='house'?'house':'office',y=b.h/2;
      const faces=[
        {x:b.x,y,z:b.z+b.d/2+.09,w:b.w,h:b.h,angle:0},
        {x:b.x,y,z:b.z-b.d/2-.09,w:b.w,h:b.h,angle:Math.PI},
        {x:b.x+b.w/2+.09,y,z:b.z,w:b.d,h:b.h,angle:Math.PI/2},
        {x:b.x-b.w/2-.09,y,z:b.z,w:b.d,h:b.h,angle:-Math.PI/2}];
      addFaces(kind,variant,b.x,b.z,faces);
      if(kind==='house')for(const face of faces)for(const height of [2.7,b.h-.45]){
        // Shallow architectural courses stop well below the shared roof and
        // remain cosmetic: the underlying collision envelope is unchanged.
        trim.push({...face,y:height,h:.14,w:face.w-.2});
      }
      continue;
    }
    // Older SF landmarks have authored fronts and roofs. Their largest plain
    // ground-level box has a shared collision primitive, so its two sides and
    // rear can carry material without stretching art across the envelope or
    // hiding that landmark's front. Named landmark models stay untouched.
    if(b.style!=='landmark'||b.landmarkId||b.x< -410||b.x>90||b.z< -270||b.z>230)continue;
    const landmarkShape=plainSideLandmarks.get(`${b.x}:${b.z}`);
    if(!landmarkShape)continue;
    const body=b.parts?.[0];
    if(!body||body.shape!=='box'||body.x!==0||body.z!==0||body.w<8||body.d<8||body.h<6||Math.abs(body.y-body.h/2)>.01)continue;
    const y=(terrainHeight(b.x,b.z)??0)+body.y;
    addFaces(landmarkShape==='modern'?'office':'house',variant,b.x,b.z,[
      {x:b.x,y,z:b.z-body.d/2-.025,w:body.w,h:body.h,angle:Math.PI},
      {x:b.x+body.w/2+.025,y,z:b.z,w:body.d,h:body.h,angle:Math.PI/2},
      {x:b.x-body.w/2-.025,y,z:b.z,w:body.d,h:body.h,angle:-Math.PI/2}]);
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
  if(trim.length){
    const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0xd3c8b3,roughness:.9}),trim.length);
    trim.forEach((f,i)=>mesh.setMatrixAt(i,matrix.compose(position.set(f.x,f.y,f.z),rotation.setFromAxisAngle(up,f.angle),scale.set(f.w,f.h,.08))));
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
  const streets=buildSfFidelityStreets(scene);
  return {facadeBuildings,facadeBatches:buckets.size,textureFallback,sidewalks:streets.sidewalks,trees:streets.trees};
}


export { applyRoadster2026 } from './sf-fidelity-roadster';
