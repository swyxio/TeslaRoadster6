import * as T from 'three';
import type { Entity } from '../shared/game';
import { HILL, NATURAL_HILLS, isSurface } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { VEHICLES } from '../shared/vehicles';

const MAX_SHADOWS=32;
const MAX_DISTANCE_SQUARED=60**2;
// Above ordinary asphalt and lot pavement, below road markings and low cars.
// Raised approaches are excluded below; this is not a physics height.
const GROUND_OFFSET=.145;
const HILLS=[HILL,...NATURAL_HILLS];
// Approaches are rendered as axis-aligned boxes in scene.ts.
const APPROACHES=PARKING_LOTS.map(({approach:a})=>({minX:a.x-a.width/2,maxX:a.x+a.width/2,minZ:a.z-a.length/2,maxZ:a.z+a.length/2}));

/** One bounded batch of soft contact patches; these never alter world state. */
export class ContactShadows {
  readonly mesh:T.InstancedMesh;
  private matrix=new T.Matrix4();
  private position=new T.Vector3();
  private scale=new T.Vector3();
  private up=new T.Vector3(0,1,0);
  private vehicleUp=new T.Vector3();
  private forward=new T.Vector3();
  private rotation=new T.Quaternion();
  private count=0;

  constructor(scene:T.Scene) {
    const size=32,pixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,r=Math.hypot((x-(size-1)/2)/(size/2),(y-(size-1)/2)/(size/2));
      pixels[i]=pixels[i+1]=pixels[i+2]=255;
      pixels[i+3]=Math.round(255*Math.max(0,1-r)**2);
    }
    const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
    const material=new T.MeshBasicMaterial({color:0x10191b,map:texture,transparent:true,opacity:.42,depthWrite:false});
    const geometry=new T.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
    this.mesh=new T.InstancedMesh(geometry,material,MAX_SHADOWS);
    this.mesh.name='vehicle-contact-shadows';
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // Instance positions change every frame; only nearby candidates enter the batch.
    this.mesh.frustumCulled=false;this.mesh.count=0;this.mesh.visible=false;
    scene.add(this.mesh);
  }

  update(entities:readonly Entity[],meshes:ReadonlyMap<string,T.Group>,camera:T.Vector3,controlled?:Entity) {
    this.count=0;
    // Always give the controlled car priority when a crowded room exceeds the cap.
    if(controlled)this.add(controlled,meshes.get(controlled.id),camera);
    for(const entity of entities){
      if(this.count===MAX_SHADOWS)break;
      if(entity.id!==controlled?.id)this.add(entity,meshes.get(entity.id),camera);
    }
    this.mesh.count=this.count;this.mesh.visible=this.count>0;
    if(this.count)this.mesh.instanceMatrix.needsUpdate=true;
  }

  private add(entity:Entity,vehicle:T.Group|undefined,camera:T.Vector3) {
    // Only flat, shared ground is handled by this first slice. In particular,
    // do not project through the Dome, ferry, roofs, ramps or airborne cars.
    if(this.count===MAX_SHADOWS||entity.kind==='person'||entity.supportId!=='ground'||entity.inDome||!vehicle?.visible)return;
    const {x,y,z}=vehicle.position;
    if(vehicle.position.distanceToSquared(camera)>MAX_DISTANCE_SQUARED||Math.abs(y)>.25)return;
    this.vehicleUp.set(0,1,0).applyQuaternion(vehicle.quaternion);
    if(this.vehicleUp.y<.95)return;
    const spec=VEHICLES[entity.kind],width=spec.width*.95,length=spec.length*.8;
    this.forward.set(0,0,1).applyQuaternion(vehicle.quaternion);
    const yaw=Math.atan2(this.forward.x,this.forward.z),s=Math.sin(yaw),c=Math.cos(yaw);
    // Skip entire hill bounds, including their flat edges. This avoids
    // per-corner height sampling and keeps the plane away from sloped ground.
    const radius=Math.hypot(width,length)/2;
    // A single flat patch would be cut by a raised approach (top .18). Skip
    // the entire footprint near that edge instead of drawing through cars.
    for(const approach of APPROACHES){
      if(x+radius>=approach.minX&&x-radius<=approach.maxX&&z+radius>=approach.minZ&&z-radius<=approach.maxZ)return;
    }
    for(const hill of HILLS){
      if(x+radius>=hill.minX&&x-radius<=hill.maxX&&z+radius>=hill.minZ&&z-radius<=hill.maxZ)return;
    }
    // All four corners and the center must still be on flat supported land or
    // bridge deck. This avoids patches floating over shores or sloping hills.
    if(!isSurface(x,z))return;
    for(let side=-1;side<=1;side+=2)for(let end=-1;end<=1;end+=2){
      const across=side*width/2,along=end*length/2;
      if(!isSurface(x+across*c+along*s,z-across*s+along*c))return;
    }
    this.position.set(x,GROUND_OFFSET,z);
    this.rotation.setFromAxisAngle(this.up,yaw);
    this.scale.set(width,1,length);
    this.mesh.setMatrixAt(this.count++,this.matrix.compose(this.position,this.rotation,this.scale));
  }
}
