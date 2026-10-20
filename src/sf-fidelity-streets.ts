import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, ROADS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { SHOPS, SHOP_RADIUS } from '../shared/upgrades';

// A small, decorative SF-spawn slice. Everything below follows the shared
// ground and street rectangles; it neither adds support nor changes collision.
type Rect = { x:number; z:number; w:number; d:number };
type Tile = Rect & { curb:Rect; axis:'x'|'z'; side:number };
type Tree = { x:number; z:number; size:number };
const BOUNDS = { minX:-205, maxX:105, minZ:-105, maxZ:185 };
const TILE_WIDTH = 3.2;

function overlaps(a:Rect,b:Rect,margin=0) {
  return Math.abs(a.x-b.x)<(a.w+b.w)/2+margin && Math.abs(a.z-b.z)<(a.d+b.d)/2+margin;
}

// A conservative axis-aligned envelope ensures even rotated roads and parking
// approaches are never painted over. False exclusions are preferable to an
// apparent sidewalk or tree in an active lane/charging bay.
function envelope(x:number,z:number,w:number,d:number,angle=0):Rect {
  const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  return {x,z,w:w*c+d*s,d:w*s+d*c};
}

function local(r:Rect) {
  return r.x+r.w/2>=BOUNDS.minX && r.x-r.w/2<=BOUNDS.maxX &&
    r.z+r.d/2>=BOUNDS.minZ && r.z-r.d/2<=BOUNDS.maxZ;
}

function flatGround(r:Rect) {
  for(const dx of [-r.w/2,0,r.w/2])for(const dz of [-r.d/2,0,r.d/2]){
    const y=terrainHeight(r.x+dx,r.z+dz);
    if(y===null||Math.abs(y)>.02)return false;
  }
  return true;
}

/** Deterministic layout, available for visual/geometry checks without WebGL. */
export function sfFidelityStreetLayout() {
  const roads=ROADS.map(r=>envelope(r.x,r.z,r.w,r.d,r.angle)).filter(local);
  const lots=PARKING_LOTS.flatMap(({area,approach})=>[area,approach].map(a=>
    envelope(a.x,a.z,a.width,a.length,a.yaw))).filter(local);
  const buildings=BUILDINGS.map(b=>({x:b.x,z:b.z,w:b.w,d:b.d})).filter(local);
  const shops=SHOPS.map(s=>({x:s.x,z:s.z,w:SHOP_RADIUS*2,d:SHOP_RADIUS*2})).filter(local);
  const exclusions=[...roads,...lots,...buildings,...shops];
  const clear=(r:Rect,margin=0)=>local(r)&&flatGround(r)&&exclusions.every(e=>!overlaps(r,e,margin));
  const tiles:Tile[]=[];
  // The ordinary SF grid is authored as 14 m × 15 m axis-aligned pieces.
  // Leave crossings, highways, slopes and the stadium's special routes alone.
  for(const r of ROADS){
    if(r.kind||r.angle||!local(r))continue;
    const horizontal=r.axis==='x'&&r.w===15&&r.d===14;
    const vertical=r.axis==='z'&&r.w===14&&r.d===15;
    if(!horizontal&&!vertical)continue;
    for(const side of [-1,1])for(let part=-1;part<=1;part++){
      const along=part*5,across=side*(7+.2+TILE_WIDTH/2);
      const tile:Rect=horizontal
        ?{x:r.x+along,z:r.z+across,w:5,d:TILE_WIDTH}
        :{x:r.x+across,z:r.z+along,w:TILE_WIDTH,d:5};
      if(!clear(tile,.04))continue;
      const curb:Rect=horizontal
        ?{x:tile.x,z:r.z+side*7.25,w:tile.w,d:.1}
        :{x:r.x+side*7.25,z:tile.z,w:.1,d:tile.d};
      tiles.push({...tile,curb,axis:r.axis,side});
    }
  }

  // Street trees sit on the outer edge of the sidewalk. Their full crowns
  // clear roads, building envelopes, shops and parking; they are decoration,
  // like the game's existing trees, and never introduce physics obstacles.
  const trees:Tree[]=[];
  for(let i=0;i<tiles.length;i+=3){
    const tile=tiles[i];
    const x=tile.x+(tile.axis==='z'?tile.side*1.1:0);
    const z=tile.z+(tile.axis==='x'?tile.side*1.1:0);
    const seed=Math.abs(Math.round(x*31+z*13));
    // Keep foliage sparse enough to preserve sightlines and the render budget.
    if(seed%3!==0)continue;
    const radius=2.15;
    const footprint={x,z,w:radius*2,d:radius*2};
    if(!clear(footprint,.1)||trees.some(tree=>Math.hypot(tree.x-x,tree.z-z)<13))continue;
    trees.push({x,z,size:.86+(seed%4)*.07});
  }
  return {tiles,trees};
}

function pavementTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d')!;
  c.fillStyle='#b4ada0';c.fillRect(0,0,128,128);
  // Baked joints and small aggregate replace the large unbroken pale ground
  // without new images, per-tile textures or per-frame work.
  for(let i=0;i<1200;i++){
    const x=(i*73+Math.floor(i/11)*19)%128,y=(i*43+Math.floor(i/17)*31)%128;
    c.fillStyle=i%3?'rgba(47,44,40,.075)':'rgba(255,247,226,.10)';
    c.fillRect(x,y,1+(i%2),1);
  }
  c.strokeStyle='rgba(72,70,66,.28)';c.lineWidth=2;
  c.strokeRect(1,1,126,126);
  c.beginPath();c.moveTo(64,0);c.lineTo(64,128);c.stroke();
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

// The five intersecting low-segment lobes have one vertex-colored material and
// one draw call for every tree; the geometry is built once, not per tree.
function crownGeometry() {
  const lobes:[number,number,number,number,number][]=[
    [0,0,0,1.35,0x617d53],[-.85,-.1,.15,1.03,0x516c48],
    [.85,.05,-.1,1.02,0x698457],[0,.48,-.68,.91,0x789362],
    [-.1,.25,.72,.95,0x5d7950],
  ];
  const parts=lobes.map(([x,y,z,r,color])=>{
    const geometry=new T.SphereGeometry(r,8,6);geometry.translate(x,y,z);
    const shade=new T.Color(color),values=new Float32Array(geometry.getAttribute('position').count*3);
    for(let i=0;i<values.length;i+=3){values[i]=shade.r;values[i+1]=shade.g;values[i+2]=shade.b;}
    geometry.setAttribute('color',new T.BufferAttribute(values,3));return geometry;
  });
  const merged=mergeGeometries(parts);parts.forEach(part=>part.dispose());
  if(!merged)throw new Error('Could not create SF street-tree geometry');
  return merged;
}

/** Adds four static instanced batches to the opt-in lab, never to the base map. */
export function buildSfFidelityStreets(scene:T.Scene) {
  const {tiles,trees}=sfFidelityStreetLayout();
  const group=new T.Group();group.name='sf-fidelity-streets';
  const matrix=new T.Matrix4(),pos=new T.Vector3(),scale=new T.Vector3();
  const rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
  const plane=new T.PlaneGeometry(1,1);plane.rotateX(-Math.PI/2);
  const sidewalk=new T.InstancedMesh(plane,new T.MeshStandardMaterial({map:pavementTexture(),roughness:1}),tiles.length);
  const curb=new T.InstancedMesh(plane,new T.MeshStandardMaterial({color:0x817f77,roughness:1}),tiles.length);
  tiles.forEach((tile,i)=>{
    sidewalk.setMatrixAt(i,matrix.compose(pos.set(tile.x,.045,tile.z),rotation,scale.set(tile.w,1,tile.d)));
    curb.setMatrixAt(i,matrix.compose(pos.set(tile.curb.x,.048,tile.curb.z),rotation,scale.set(tile.curb.w,1,tile.curb.d)));
  });
  sidewalk.computeBoundingSphere();curb.computeBoundingSphere();group.add(sidewalk,curb);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.15,.28,3,7),new T.MeshStandardMaterial({color:0x695846,roughness:1}),trees.length);
  const crowns=new T.InstancedMesh(crownGeometry(),new T.MeshStandardMaterial({vertexColors:true,roughness:1}),trees.length);
  trees.forEach((tree,i)=>{
    const yaw=(Math.abs(Math.round(tree.x*7+tree.z*13))%12)*Math.PI/6;
    rotation.setFromAxisAngle(up,yaw);
    trunks.setMatrixAt(i,matrix.compose(pos.set(tree.x,1.5*tree.size,tree.z),rotation,scale.set(tree.size,tree.size,tree.size)));
    crowns.setMatrixAt(i,matrix.compose(pos.set(tree.x,3.5*tree.size,tree.z),rotation,scale.set(tree.size,tree.size,tree.size)));
  });
  trunks.computeBoundingSphere();crowns.computeBoundingSphere();group.add(trunks,crowns);
  scene.add(group);
  return {sidewalks:tiles.length,trees:trees.length,group};
}
