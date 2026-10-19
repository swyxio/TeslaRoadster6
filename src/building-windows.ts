import * as T from 'three';
import type { Building } from '../shared/map';

export type BuildingWindow = { x:number; y:number; z:number; width:number; height:number; angle:number; color:number };

/** Street-level glazing stays on the existing walls and shares the window batches. */
export function storefrontWindows(b:Building):BuildingWindow[]{
  if(b.style!=='midrise'&&b.style!=='tower')return [];
  const seed=Math.abs(Math.round(b.x*3+b.z*7))%4;
  const glass=[0x547b81,0x4d7283,0x587b70,0x60798a][seed];
  const fascia=[0xc07054,0x4d9182,0xc39b5b,0x718c9d][seed];
  const windows:BuildingWindow[]=[];
  for(const angle of [0,Math.PI,Math.PI/2,-Math.PI/2]){
    const side=Math.abs(Math.sin(angle))>.5,extent=side?b.w/2:b.d/2;
    const span=(side?b.d:b.w)-2,door=1.35,gap=.2,pane=(span-door-4*gap)/4;
    const normalX=Math.sin(angle),normalZ=Math.cos(angle);
    const centerX=b.x+normalX*(extent+.03),centerZ=b.z+normalZ*(extent+.03);
    const add=(offset:number,y:number,width:number,height:number,color:number)=>windows.push({
      x:centerX+Math.cos(angle)*offset,z:centerZ-Math.sin(angle)*offset,
      y,width,height,angle,color,
    });
    for(const direction of [-1,1])for(const n of [0,1])
      add(direction*(door/2+gap+pane*(n+.5)+n*gap),1.45,pane,2.4,glass);
    add(0,1.45,door,2.4,0x354f58);
    add(0,3.5,span,.55,fascia);
  }
  return windows;
}

// Five coplanar quads give each window a glass pane and a narrow frame in a
// single material. A shared instanced mesh keeps the per-district draw count
// unchanged and uses fewer triangles than the old box for every window.
function windowGeometry(){
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  function quad(x0:number,y0:number,x1:number,y1:number,shade:number){
    const base=positions.length/3;
    positions.push(x0,y0,0,x1,y0,0,x1,y1,0,x0,y1,0);
    for(let i=0;i<4;i++)colors.push(shade,shade,shade);
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  quad(-.42,-.42,.42,.42,1);
  quad(-.5,-.5,.5,-.42,.48);quad(-.5,.42,.5,.5,.48);
  quad(-.5,-.42,-.42,.42,.48);quad(.42,-.42,.5,.42,.48);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

/** Add one culled instanced batch per map cell, with outward-facing windows. */
export function addBuildingWindows(scene:T.Scene,windows:BuildingWindow[],cellSize=700){
  const chunks=new Map<string,BuildingWindow[]>();
  for(const window of windows){
    const key=`${Math.floor(window.x/cellSize)},${Math.floor(window.z/cellSize)}`;
    const chunk=chunks.get(key)??[];chunk.push(window);chunks.set(key,chunk);
  }
  if(!chunks.size)return;
  const geometry=windowGeometry();
  const glass=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.38,metalness:.1});
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0),color=new T.Color();
  for(const chunk of chunks.values()){
    const mesh=new T.InstancedMesh(geometry,glass,chunk.length);
    chunk.forEach((p,i)=>{
      mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.angle),scale.set(p.width,p.height,1)));
      mesh.setColorAt(i,color.setHex(p.color));
    });
    mesh.computeBoundingSphere();scene.add(mesh);
  }
}
