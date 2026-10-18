import * as T from 'three';
import { ACCESS_BOUNDARIES, LEVELS } from '../shared/delivery';
import { BRIDGES, HIGHWAYS, terrainHeight, type MapPoint } from '../shared/map';

type GateLevel = 1|2|3;
type Placement = { x:number; z:number; yaw:number; width:number };

// Intersect the road with the shared Z boundary, not a perpendicular road
// segment: the physical access boundary is a line of constant world Z.
function crossings(points:MapPoint[], z:number):Placement[] {
  const result:Placement[]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dz=b.z-a.z;
    if(!dz||z<Math.min(a.z,b.z)||z>Math.max(a.z,b.z))continue;
    const t=(z-a.z)/dz,dx=b.x-a.x;
    const x=a.x+dx*t;
    // Highway rectangles are 32 m wide; an oblique crossing needs a wider
    // plane to span the road at this exact Z. Do not duplicate a shared vertex.
    const width=32*Math.hypot(dx,dz)/Math.abs(dz)+4;
    if(!result.some(point=>Math.abs(point.x-x)<.01))result.push({x,z,yaw:0,width});
  }
  return result;
}

function requirementMaterial(level:GateLevel):T.SpriteMaterial {
  const goal=LEVELS[level];
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='rgba(25,38,43,.94)';ctx.beginPath();ctx.roundRect(8,8,1008,240,24);ctx.fill();
  ctx.strokeStyle='#ffc777';ctx.lineWidth=7;ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#ffcc83';ctx.font='bold 56px system-ui';ctx.fillText(`LEVEL ${level}  ·  ${goal.name.toUpperCase()}`,512,82,950);
  ctx.fillStyle='#fff7e7';ctx.font='bold 43px system-ui';
  ctx.fillText(`${goal.deliveries} DELIVERIES  +  $${goal.earned} TOTAL EARNED`,512,173,950);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  return new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false});
}

/** Visual-only checkpoints. Caller adds each group and sets its visibility per local player. */
export function createProgressionGates():Record<GateLevel,T.Group> {
  const groups:Record<GateLevel,T.Group>={1:new T.Group(),2:new T.Group(),3:new T.Group()};
  const fieldGeometry=new T.PlaneGeometry(1,1),railGeometry=new T.BoxGeometry(1,1,1);
  const fieldMaterial=new T.MeshBasicMaterial({color:0xffc56f,transparent:true,opacity:.14,depthWrite:false,side:T.DoubleSide});
  const railMaterial=new T.MeshBasicMaterial({color:0xffc56f,transparent:true,opacity:.8,depthWrite:false});
  const requirements:Record<GateLevel,T.SpriteMaterial>={1:requirementMaterial(1),2:requirementMaterial(2),3:requirementMaterial(3)};

  function add(level:GateLevel, placement:Placement) {
    const group=new T.Group();group.name=`level-${level}-checkpoint`;
    group.position.set(placement.x,terrainHeight(placement.x,placement.z)??0,placement.z);
    group.rotation.y=placement.yaw;
    const field=new T.Mesh(fieldGeometry,fieldMaterial);field.position.y=5;field.scale.set(placement.width,10,1);group.add(field);
    for(const x of [-placement.width/2,placement.width/2]){
      const rail=new T.Mesh(railGeometry,railMaterial);rail.position.set(x,5,0);rail.scale.set(.3,10,.3);group.add(rail);
    }
    const top=new T.Mesh(railGeometry,railMaterial);top.position.y=10;top.scale.set(placement.width,.3,.3);group.add(top);
    const label=new T.Sprite(requirements[level]);label.position.y=12.7;label.scale.set(30,7.5,1);group.add(label);
    groups[level].add(group);
  }

  const bridge=BRIDGES.find(item=>item.id==='bay-bridge');
  if(bridge&&bridge.axis==='x'&&ACCESS_BOUNDARIES.oaklandX>=bridge.start&&ACCESS_BOUNDARIES.oaklandX<=bridge.end){
    add(1,{x:ACCESS_BOUNDARIES.oaklandX,z:bridge.center,yaw:Math.PI/2,width:bridge.width+4});
  }
  for(const highway of HIGHWAYS){
    for(const gate of crossings(highway.points,ACCESS_BOUNDARIES.bayMaxZ))add(2,gate);
    for(const gate of crossings(highway.points,ACCESS_BOUNDARIES.sanJoseMinZ))add(3,gate);
  }
  return groups;
}
