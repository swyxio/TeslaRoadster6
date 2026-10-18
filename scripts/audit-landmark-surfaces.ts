import * as T from 'three';
import { NEW_LANDMARKS } from '../shared/new-landmarks';
import { newLandmarkPrimitives, sampleLandmarkPrimitive } from '../shared/new-landmark-surfaces';
const geo={box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(.5,.5,1,12),roof:new T.ConeGeometry(.5,1,4).rotateY(Math.PI/4),dome:new T.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2)};
const ray=new T.Raycaster(),origin=new T.Vector3(),down=new T.Vector3(0,-1,0),mat=new T.MeshBasicMaterial();
const results:Record<string,{parts:number,samples:number,falsePos:number,falseNeg:number,maxDiff:number,worst:string}>={};
for (const place of NEW_LANDMARKS.filter(p=>p.solid)) {
 for (const [index,p] of newLandmarkPrimitives(place.id).entries()) {
  const stats=results[p.shape]??={parts:0,samples:0,falsePos:0,falseNeg:0,maxDiff:0,worst:''};stats.parts++;
  const mesh=new T.Mesh(geo[p.shape],mat);
  mesh.position.set(p.x,p.y,p.z);mesh.scale.set(p.w,p.shape==='dome'?2*p.h:p.h,p.d);mesh.updateMatrixWorld();
  for(let ix=-10;ix<=10;ix++)for(let iz=-10;iz<=10;iz++){
    // Slightly offset grid avoids points exactly on shared triangle boundaries.
    const x=p.x+(ix+.123)*p.w/20,z=p.z+(iz+.217)*p.d/20;
    origin.set(x,p.y+p.h+1,z);ray.set(origin,down);
    const hit=ray.intersectObject(mesh)[0],sample=sampleLandmarkPrimitive(p,x,z);stats.samples++;
    if(!!sample&&!hit)stats.falsePos++;
    if(hit&&!sample)stats.falseNeg++;
    const diff=hit&&sample?Math.abs(hit.point.y-sample.top):0;
    if(diff>stats.maxDiff){stats.maxDiff=diff;stats.worst=`${place.id} part ${index} (${x.toFixed(3)},${z.toFixed(3)}), ray=${hit!.point.y.toFixed(4)} profile=${sample!.top.toFixed(4)} relative=${(diff/place.h).toFixed(4)}h`}
  }
 }
}
console.log(JSON.stringify(results,null,2));
for(const stats of Object.values(results))if(stats.falsePos||stats.falseNeg||stats.maxDiff>1e-4)process.exitCode=1;
