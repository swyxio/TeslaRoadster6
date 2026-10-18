import * as T from 'three';
import { BRIDGES, HIGHWAYS, isLand, type MapPoint } from '../shared/map';

type Marker = { x:number; z:number; angle:number; roadWidth:number; route:'US 101'|'I-880'|'I-80' };

// The positions follow shared road geometry, never an independently drawn road.
function pointAlong(points:MapPoint[], fraction:number):{x:number;z:number;angle:number} {
  const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.z-points[i].z));
  const distance=lengths.reduce((sum,length)=>sum+length,0)*fraction;
  let traversed=0;
  for(let i=0;i<lengths.length;i++){
    const length=lengths[i];
    if(length>0&&(traversed+length>=distance||i===lengths.length-1)){
      const start=points[i],end=points[i+1],t=Math.max(0,Math.min(1,(distance-traversed)/length));
      return {x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t,angle:Math.atan2(end.x-start.x,end.z-start.z)};
    }
    traversed+=length;
  }
  throw new Error('Route marker needs a nonempty road');
}

/** Marker centers are outside the paved width, with room for the 8 m panel. */
export function routeMarkers():Marker[] {
  const markers:Marker[]=[];
  for(const highway of HIGHWAYS){
    const route=highway.id==='peninsula'?'US 101':highway.id==='east-bay'?'I-880':null;
    if(!route)continue;
    for(const fraction of [.14,.4,.67,.89])markers.push({...pointAlong(highway.points,fraction),roadWidth:32,route});
  }
  const bridge=BRIDGES.find(item=>item.id==='bay-bridge');
  if(bridge){
    const points=bridge.axis==='x'
      ? [{x:bridge.start,z:bridge.center},{x:bridge.end,z:bridge.center}]
      : [{x:bridge.center,z:bridge.start},{x:bridge.center,z:bridge.end}];
    for(const fraction of [.22,.78])markers.push({...pointAlong(points,fraction),roadWidth:bridge.width,route:'I-80'});
  }
  return markers.map(marker=>{
    const offset=marker.roadWidth/2+9;
    return {...marker,x:marker.x+Math.cos(marker.angle)*offset,z:marker.z-Math.sin(marker.angle)*offset};
  });
}

function markerTexture(route:Marker['route']):T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#156244';ctx.fillRect(0,0,512,256);
  ctx.strokeStyle='#ecf5e7';ctx.lineWidth=8;ctx.strokeRect(10,10,492,236);
  ctx.fillStyle='#fffdf0';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 98px system-ui';ctx.fillText(route,256,102,460);
  ctx.font='bold 29px system-ui';
  ctx.fillText(route==='US 101'?'BAYSHORE FREEWAY':route==='I-880'?'NIMITZ FREEWAY':'BAY BRIDGE',256,187,455);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

/** Two readable faces, on the roadside rather than in the drivable lane. */
export function buildRouteSignage(scene:T.Scene):void {
  const panel=new T.PlaneGeometry(8,4),post=new T.BoxGeometry(.22,7,.22);
  const postMaterial=new T.MeshStandardMaterial({color:0x9da8a1,roughness:.8});
  const materials=new Map<Marker['route'],T.MeshBasicMaterial>();
  for(const marker of routeMarkers()){
    if(!materials.has(marker.route))materials.set(marker.route,new T.MeshBasicMaterial({map:markerTexture(marker.route)}));
    const group=new T.Group();group.position.set(marker.x,0,marker.z);group.rotation.y=marker.angle;
    // Bay Bridge signs stand in the water beside the deck; extend posts down
    // to its visible surface instead of leaving them floating above it.
    const bottom=isLand(marker.x,marker.z)?0:-4;
    const support=new T.Mesh(post,postMaterial);support.scale.y=(7-bottom)/7;support.position.y=(7+bottom)/2;group.add(support);
    for(const side of [-1,1]){
      const face=new T.Mesh(panel,materials.get(marker.route)!);
      face.position.set(0,7.1,side*.04);if(side<0)face.rotation.y=Math.PI;group.add(face);
    }
    scene.add(group);
  }
}
