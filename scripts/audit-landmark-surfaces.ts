import * as T from 'three';
import { BUILDINGS, nearbyBuildings } from '../shared/map';
import { primitiveExtent, sampleLandmarkPrimitive, type StructuralPrimitive } from '../shared/new-landmark-surfaces';

// Offline geometry check. This compares the shared sampler with Three.js's
// actual constructor triangles, including undersides and broad-phase coverage.
// It cannot detect a solid omitted from both descriptions; actual-world renderer
// tests in structure-surfaces.test.ts cover that separate failure mode.
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function meshFor(p:StructuralPrimitive):T.Mesh {
 let geometry:T.BufferGeometry;
 switch(p.shape){
  case 'box':geometry=new T.BoxGeometry(1,1,1);break;
  case 'cylinder':geometry=new T.CylinderGeometry((p.topScale??1)/2,.5,1,p.segments??12);break;
  case 'roof':geometry=new T.ConeGeometry(.5,1,4);if(!p.roofDiamond)geometry.rotateY(Math.PI/4);break;
  case 'dome':geometry=new T.SphereGeometry(.5,p.segments??16,p.rings??8,0,Math.PI*2,0,Math.PI/2);break;
 }
 const mesh=new T.Mesh(geometry,material);
 mesh.position.set(p.x,p.y,p.z);mesh.scale.set(p.w,p.shape==='dome'?p.h*2:p.h,p.d);
 mesh.rotation.set(p.rotationX??0,p.rotationY??0,p.inverted?Math.PI:p.rotationZ??0);
 mesh.updateMatrixWorld();return mesh;
}
type Stats={parts:number;samples:number;falseSolid:number;missingSolid:number;missingIndex:number;maxTopError:number;maxBottomError:number;worst:string};
const results:Record<string,Stats>={},down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0),ray=new T.Raycaster();
let profiledBuildings=0;
for(const [index,building] of BUILDINGS.entries()){
 if(!building.parts)continue;profiledBuildings++;
 for(const [partIndex,p] of building.parts.entries()){
  const key=[p.shape,p.rotationX?'horizontal':'',p.rotationZ?'tilted':'',p.rotationY?'yawed':'',p.roofDiamond?'diamond':'',p.inverted?'inverted':'',p.topScale!==undefined&&p.topScale!==1?'tapered':''].filter(Boolean).join('/');
  const stats=results[key]??={parts:0,samples:0,falseSolid:0,missingSolid:0,missingIndex:0,maxTopError:0,maxBottomError:0,worst:''};stats.parts++;
  const mesh=meshFor(p),extent=primitiveExtent(p),c=Math.abs(Math.cos(extent.yaw)),s=Math.abs(Math.sin(extent.yaw));
  const w=extent.w*c+extent.d*s,d=extent.w*s+extent.d*c;
  for(let ix=-10;ix<=10;ix++)for(let iz=-10;iz<=10;iz++){
   // Offset rays avoid exact triangle edges and Float32 vertex rounding.
   const x=p.x+(ix+.123)*w/20,z=p.z+(iz+.217)*d/20;
   ray.set(new T.Vector3(x,extent.top+1,z),down);
   const hit=ray.intersectObject(mesh)[0],sample=sampleLandmarkPrimitive(p,x,z);stats.samples++;
   if(sample&&!hit)stats.falseSolid++;
   if(hit&&!sample)stats.missingSolid++;
   if(!sample||!hit)continue;
   if(!nearbyBuildings(building.x+x,building.z+z,0).includes(building))stats.missingIndex++;
   const topError=Math.abs(hit.point.y-sample.top);
   // Domes are authored as surfaces. Convex domes fill to the rim; the
   // inverted dish has an explicit 20 cm shell, not a closed bottom mesh.
   let bottomError=0;
   if(p.shape!=='dome'){
    ray.set(new T.Vector3(x,extent.bottom-1,z),up);
    const bottom=ray.intersectObject(mesh)[0];
    bottomError=bottom?Math.abs(bottom.point.y-sample.bottom):Infinity;
   }
   if(topError>stats.maxTopError||bottomError>stats.maxBottomError)stats.worst=`building ${index} ${building.style} part ${partIndex} at ${x.toFixed(3)},${z.toFixed(3)}`;
   stats.maxTopError=Math.max(stats.maxTopError,topError);stats.maxBottomError=Math.max(stats.maxBottomError,bottomError);
  }
  mesh.geometry.dispose();
 }
}
const totals=Object.values(results).reduce((sum,s)=>({parts:sum.parts+s.parts,samples:sum.samples+s.samples,falseSolid:sum.falseSolid+s.falseSolid,missingSolid:sum.missingSolid+s.missingSolid,missingIndex:sum.missingIndex+s.missingIndex}),{parts:0,samples:0,falseSolid:0,missingSolid:0,missingIndex:0});
console.log(JSON.stringify({scope:'Offline sampled constructor geometry, not browser physics or a proof that every visible solid is authored',profiledBuildings,totalBuildings:BUILDINGS.length,totals,variants:results},null,2));
for(const stats of Object.values(results))if(stats.falseSolid||stats.missingSolid||stats.missingIndex||stats.maxTopError>1e-4||stats.maxBottomError>1e-4)process.exitCode=1;
