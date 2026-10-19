import * as T from 'three';

export type BuildingWindow = { x:number; y:number; z:number; width:number; height:number; angle:number; color:number };

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
