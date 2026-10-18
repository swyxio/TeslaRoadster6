import * as T from 'three';
import { ISLAND_JUMPS, islandJumpHeight } from '../shared/island-jumps';

/** The visible wedge uses the same ramp endpoints as shared physics. */
export function addIslandJumps(scene:T.Scene):void {
  const rampMaterial=new T.MeshStandardMaterial({color:0xd47c4c,roughness:.8,side:T.DoubleSide});
  const stripeMaterial=new T.LineBasicMaterial({color:0xffe8a6});
  for(const jump of ISLAND_JUMPS){
    const near=jump.z-jump.width/2,far=jump.z+jump.width/2;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute([
      jump.start,0,near,jump.start,0,far,jump.end,0,near,jump.end,0,far,
      jump.end,jump.height,near,jump.end,jump.height,far,
    ],3));
    geometry.setIndex([0,4,1,1,4,5,2,3,4,3,5,4,0,2,4,1,5,3]);
    geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,rampMaterial);mesh.name=`island-jump-${jump.id}`;scene.add(mesh);
    for(const z of [near+1,far-1]){
      const points=[jump.start+1,jump.end-.5].map(x=>new T.Vector3(x,islandJumpHeight(x,z)!+.04,z));
      scene.add(new T.Line(new T.BufferGeometry().setFromPoints(points),stripeMaterial));
    }
    // Bright chevrons make the safe approach and direction legible from the track.
    for(const x of [jump.start+8,jump.start+17,jump.start+26]){
      const y=islandJumpHeight(x,jump.z)!+.05;
      const points=[new T.Vector3(x-2,y-.2,jump.z-3),new T.Vector3(x,y,jump.z),new T.Vector3(x-2,y-.2,jump.z+3)];
      scene.add(new T.Line(new T.BufferGeometry().setFromPoints(points),stripeMaterial));
    }
  }
}
