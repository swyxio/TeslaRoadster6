import * as T from 'three';
import { isBridge, nearbyBuildings, ROADS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { SHOPS, SHOP_RADIUS } from '../shared/upgrades';
import { RESTAURANTS, CUSTOMERS } from '../shared/delivery';
import { STATIONS, CHARGER_LOT } from '../shared/stations';

type Rect = { x:number; z:number; w:number; d:number; angle?:number };
type Palm = { x:number; z:number; y:number; height:number; seed:number };

function inRect(x:number,z:number,r:Rect,margin:number) {
  const a=r.angle??0,c=Math.cos(a),s=Math.sin(a),dx=x-r.x,dz=z-r.z;
  return Math.abs(dx*c-dz*s)<=r.w/2+margin&&Math.abs(dx*s+dz*c)<=r.d/2+margin;
}

/** Decorative palms near the SF and Oakland waterfronts; the shared world
 * remains authoritative. Their trunks clear roads, structures and activities. */
export function waterfrontPalms():Palm[] {
  const rows=[
    {xs:[-70,-50,-10,10,50,70],minZ:-210,maxZ:115},
    {xs:[320,340,380,400,440,460,500,520],minZ:-210,maxZ:190},
  ];
  const palms:Palm[]=[];
  for(const {xs,minZ,maxZ} of rows)for(const x of xs)for(let z=minZ;z<=maxZ;z+=22){
    const seed=(Math.abs(Math.round(x*17+z*29)))>>>0;
    // Leave breathing room between groups and give each tree its own height.
    if(seed%4===0)continue;
    const y=terrainHeight(x,z);
    if(y===null||isBridge(x,z)||ROADS.some(r=>inRect(x,z,r,2.5)))continue;
    if(nearbyBuildings(x,z,8).some(b=>inRect(x,z,b,3)))continue;
    if(PARKING_LOTS.some(l=>inRect(x,z,{x:l.area.x,z:l.area.z,w:l.area.width,d:l.area.length,angle:l.area.yaw},8)||inRect(x,z,{x:l.approach.x,z:l.approach.z,w:l.approach.width,d:l.approach.length,angle:l.approach.yaw},8)))continue;
    if(SHOPS.some(shop=>Math.hypot(shop.x-x,shop.z-z)<SHOP_RADIUS+8))continue;
    if(STATIONS.some(station=>Math.abs(x-station.x)<CHARGER_LOT.width/2+5&&Math.abs(z-station.z)<CHARGER_LOT.length/2+5))continue;
    if(RESTAURANTS.some(place=>Math.hypot(x-place.x,z-place.z)<20)||CUSTOMERS.some(place=>Math.hypot(x-place.x,z-place.z)<20))continue;
    palms.push({x,z,y,height:7.5+(seed%8)*.38,seed});
  }
  return palms;
}

// Curved ribbons retain parallax around the crown; a single alpha-tested
// texture cuts out the leaflets. Geometry is shared by every palm.
function frondGeometry(segments:number) {
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=segments;i++){
    const t=i/segments,x=t*4.4,y=2.3*Math.sin(t*Math.PI*.65)-3.5*t*t;
    for(const side of [-1,0,1]){
      positions.push(x,y-.1*Math.abs(side)*Math.sin(Math.PI*t),side*.92);
      uv.push(t,(side+1)/2);
    }
  }
  for(let i=0;i<segments;i++)for(let side=0;side<2;side++){
    const a=i*3+side,b=a+1,c=a+3,d=c+1;indices.push(a,c,b,b,c,d);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function fallbackFrond() {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
  const c=canvas.getContext('2d');
  if(c){
    c.strokeStyle='#678143';c.lineWidth=2;c.beginPath();c.moveTo(1,32);c.lineTo(126,32);c.stroke();
    c.fillStyle='#6e8947';
    for(let x=8;x<122;x+=7){const width=Math.sin(Math.PI*x/128)*25;c.beginPath();c.moveTo(x,32);c.lineTo(x+11,32-width);c.lineTo(x+4,32);c.lineTo(x+11,32+width);c.closePath();c.fill();}
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

/** Adds small cullable groups of palms. LOD switches whole cells, not one mesh
 * per frond or tree. Missing optional texture never blocks room joining. */
export function buildBayWaterfront(scene:T.Scene) {
  const palms=waterfrontPalms(),cells=new Map<string,Palm[]>();
  for(const palm of palms){
    const key=`${Math.floor(palm.x/180)},${Math.floor(palm.z/180)}`;
    const cell=cells.get(key)??[];cell.push(palm);cells.set(key,cell);
  }
  const leaves=new T.MeshStandardMaterial({map:fallbackFrond(),color:0xe6efda,alphaTest:.48,roughness:.95,side:T.DoubleSide,forceSinglePass:true});
  new T.TextureLoader().load('/embarcadero/textures/palm-frond.webp',texture=>{
    texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=2;
    const old=leaves.map;leaves.map=texture;leaves.needsUpdate=true;old?.dispose();
  },undefined,()=>console.warn('Palm texture unavailable; using generated fallback.'));
  const trunkMaterial=new T.MeshStandardMaterial({color:0x8c7655,roughness:1});
  const trunk=new T.CylinderGeometry(.33,.50,1,7);
  const near=frondGeometry(8),far=frondGeometry(3);
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
  for(const group of cells.values()){
    // World-positioned meshes share a cell-local LOD center for correct
    // distance selection and independent frustum bounds.
    const cx=group.reduce((sum,p)=>sum+p.x,0)/group.length,cz=group.reduce((sum,p)=>sum+p.z,0)/group.length;
    const lod=new T.LOD();lod.position.set(cx,0,cz);
    const trunks=new T.InstancedMesh(trunk,trunkMaterial,group.length);
    group.forEach((p,i)=>trunks.setMatrixAt(i,matrix.makeScale(1,p.height,1).setPosition(p.x-cx,p.y+p.height/2,p.z-cz)));
    trunks.computeBoundingSphere();lod.add(trunks);
    for(const [geometry,count,distance] of [[near,12,0],[far,6,170]] as const){
      const mesh=new T.InstancedMesh(geometry,leaves,group.length*count);
      let n=0;
      for(const p of group)for(let i=0;i<count;i++){
        const angle=i*Math.PI*2/count+p.seed*.017,layer=i%3;
        const spread=.82+layer*.09;
        mesh.setMatrixAt(n++,matrix.compose(position.set(p.x-cx,p.y+p.height+layer*.13,p.z-cz),rotation.setFromAxisAngle(up,angle),scale.set(spread,.75+layer*.14,spread)));
      }
      mesh.computeBoundingSphere();lod.addLevel(mesh,distance);
    }
    scene.add(lod);
  }
  return {palmCount:palms.length,cellCount:cells.size};
}

/** Shade the existing physical water plane instead of adding a second surface.
 * The wave signal is analytical and shares the world clock and sun direction;
 * no render targets, new assets, scene scans or extra draw calls are needed. */
export function enhanceBayWater(water:T.Mesh) {
  const material=water.material;
  if(!(material instanceof T.MeshStandardMaterial))throw new Error('Bay water expects a standard material');
  const uniforms={
    bayTime:{value:0},bayDaylight:{value:1},baySun:{value:new T.Vector3(-100,160,80).normalize()},
  };
  material.color.setHex(0x397e8e);material.roughness=.34;material.metalness=.18;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBayWaterWorld;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvBayWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vBayWaterWorld;
      uniform float bayTime;
      uniform float bayDaylight;
      uniform vec3 baySun;`)
      .replace('#include <opaque_fragment>',`
        float bayA = sin(vBayWaterWorld.x * 0.13 + vBayWaterWorld.z * 0.095 + bayTime * 0.45);
        float bayB = sin(vBayWaterWorld.x * 0.29 - vBayWaterWorld.z * 0.17 - bayTime * 0.61);
        float bayRipple = bayA * bayB;
        vec3 bayView = normalize(cameraPosition - vBayWaterWorld);
        float bayGlint = pow(max(dot(reflect(-baySun, vec3(0.0, 1.0, 0.0)), bayView), 0.0), 20.0);
        float baySparkle = smoothstep(0.45, 0.95, bayRipple);
        outgoingLight *= 0.96 + bayRipple * 0.055;
        outgoingLight += vec3(0.32, 0.23, 0.13) * bayGlint * (0.18 + 0.72 * baySparkle) * bayDaylight;
        #include <opaque_fragment>`);
  };
  material.needsUpdate=true;
  return {
    update(time:number,daylight:number,sun:T.Vector3){
      uniforms.bayTime.value=time;uniforms.bayDaylight.value=daylight;
      uniforms.baySun.value.copy(sun).normalize();
    },
  };
}
