import * as T from 'three';
import type { VehicleSpec } from '../shared/vehicles';

export type CameraMode = 'chase' | 'wide' | 'cockpit';

/** Keep the closer road-level chase view clear of larger vehicle bodies. */
export function chaseFraming(portrait:boolean, vehicle:Pick<VehicleSpec,'length'|'height'>|null, out:{distance:number;height:number;lookAhead:number}){
  out.distance=vehicle?Math.max(portrait?14:10,vehicle.length*1.5+3):portrait?18:15;
  out.height=vehicle?Math.max(portrait?6:4.5,vehicle.height*1.6+1):8;
  out.lookAhead=vehicle?(portrait?0:5):(portrait?-6:5);
  return out;
}

/** A bounded, frame-rate independent lens response for powered chase views. */
export function chaseLens(current:number, thrusting:boolean, dt:number, reducedMotion=false) {
  if(reducedMotion)return 55;
  const target=thrusting?60:55;
  const next=target+(current-target)*Math.exp(-4*Math.min(.1,Math.max(0,dt)));
  return Math.abs(next-target)<.01?target:next;
}

/** Wide keeps a stable lens; an on-foot cockpit selection uses the chase view. */
export function viewLens(current:number,mode:CameraMode,cockpit:boolean,thrusting:boolean,dt:number,reducedMotion:boolean){
  if(cockpit)return 75;
  return mode==='wide'?55:chaseLens(current,thrusting,dt,reducedMotion);
}

/** Camera and car share an orientation: Three cameras look along local -Z. */
export function cockpitPose(position:T.Vector3, rotation:T.Quaternion, vehicle:Pick<VehicleSpec,'width'|'height'|'length'|'shape'>) {
  const eye=vehicle.shape==='motorcycle'
    ?new T.Vector3(0,1.30,-.26)
    :new T.Vector3(-vehicle.width*.19,vehicle.height*.78,-vehicle.length*.07);
  return {position:eye.applyQuaternion(rotation).add(position),quaternion:rotation};
}
