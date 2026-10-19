import * as T from 'three';
import { BUILDINGS, FREMONT_SPACEPORT as site, ROADS, STARBASE_PERIMETER_RADIUS, isLand, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { material } from './vehicles';

type Rect={x:number;z:number;w:number;d:number;angle?:number};

/** Decorative landscape stays off streets, structures and the boarding ring. */
export function buildStarbaseLandscape(scene:T.Scene) {
  const pad=site.pad;
  const nearby=(r:Rect)=>Math.hypot(r.x-pad.x,r.z-pad.z)<STARBASE_PERIMETER_RADIUS+Math.hypot(r.w,r.d)/2+30;
  const obstacles:Rect[]=[
    ...ROADS.filter(nearby),
    ...BUILDINGS.filter(nearby),
    ...PARKING_LOTS.flatMap(lot=>[lot.area,lot.approach].map(p=>({x:p.x,z:p.z,w:p.width,d:p.length,angle:p.yaw}))).filter(nearby),
  ];
  const clear=(x:number,z:number,margin:number)=>{
    if(!isLand(x,z)||terrainHeight(x,z)!==0)return false;
    if(Math.hypot(x-site.entrance.x,z-site.entrance.z)<18+margin)return false;
    // The outlet's shared walls extend beyond the nominal pad envelope.
    if(Math.abs(x-pad.x)<18+margin&&z>pad.z-18-margin&&z<pad.z+68+margin)return false;
    return !obstacles.some(rect=>{
      const dx=x-rect.x,dz=z-rect.z,a=rect.angle??0,c=Math.cos(a),s=Math.sin(a);
      return Math.abs(c*dx-s*dz)<rect.w/2+margin&&Math.abs(s*dx+c*dz)<rect.d/2+margin;
    });
  };

  // An illustrative three-stack-height radius, broken at roads and coast.
  // It is a painted visual cue, not a collision fence or safety clearance.
  const segments=180,radius=STARBASE_PERIMETER_RADIUS,marks:{x:number;z:number;angle:number}[]=[];
  for(let i=0;i<segments;i++){
    const start=i*Math.PI*2/segments,end=(i+1)*Math.PI*2/segments,mid=(start+end)/2;
    if(![start,mid,end].every(a=>clear(pad.x+Math.cos(a)*radius,pad.z+Math.sin(a)*radius,3)))continue;
    marks.push({x:pad.x+Math.cos(mid)*radius,z:pad.z+Math.sin(mid)*radius,angle:-mid-Math.PI/2});
  }
  const markMesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(0xe7b04e),marks.length);
  markMesh.name='starbase-radius-markings';
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
  marks.forEach((p,i)=>markMesh.setMatrixAt(i,matrix.compose(position.set(p.x,.16,p.z),rotation.setFromAxisAngle(up,p.angle),scale.set(2*radius*Math.sin(Math.PI/segments)+.1,.08,1.3))));
  markMesh.computeBoundingSphere();scene.add(markMesh);

  // A planted campus around the work yard. Shared instance geometry keeps the
  // extra scenery inexpensive, while clearances preserve existing routes.
  const trees:{x:number;z:number;height:number;variant:number}[]=[];
  for(const [row,r] of [95,130,170,215,255].entries())for(let i=0;i<28;i++){
    const a=(i+(row%2)*.45)*Math.PI*2/28;
    const x=pad.x+Math.cos(a)*r,z=pad.z+Math.sin(a)*r;
    if(!clear(x,z,8))continue;
    // Keep the immediate road-to-pad sightline and active work yard open.
    if(x<pad.x+15&&x>site.factory.x+site.factory.w/2-12&&Math.abs(z-pad.z)<62)continue;
    trees.push({x,z,height:7+(i*3+row)%5,variant:(i+row)%2});
  }
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,7),material(0x776d50),trees.length);
  trunks.name='starbase-tree-trunks';
  const crowns=[0,1].map(variant=>{
    const count=trees.filter(p=>p.variant===variant).length;
    const mesh=new T.InstancedMesh(new T.ConeGeometry(1,1,8),material(variant?0x638b5b:0x78965f),count);
    mesh.name=`starbase-trees-${variant}`;return mesh;
  });
  const counts=[0,0];
  trees.forEach((p,i)=>{
    matrix.makeScale(.35,p.height*.44,.35).setPosition(p.x,p.height*.22,p.z);trunks.setMatrixAt(i,matrix);
    matrix.makeScale(p.height*.27,p.height*.8,p.height*.27).setPosition(p.x,p.height*.65,p.z);
    crowns[p.variant].setMatrixAt(counts[p.variant]++,matrix);
  });
  trunks.computeBoundingSphere();scene.add(trunks);
  for(const crown of crowns){crown.computeBoundingSphere();scene.add(crown);}
}
