import * as T from 'three';
import type { VehicleSpec } from '../shared/vehicles';

/** A bounded, frame-rate independent lens response for powered chase views. */
export function chaseLens(current:number, thrusting:boolean, dt:number, reducedMotion=false) {
  if(reducedMotion)return 55;
  const target=thrusting?60:55;
  const next=target+(current-target)*Math.exp(-4*Math.min(.1,Math.max(0,dt)));
  return Math.abs(next-target)<.01?target:next;
}

/** Camera and car share an orientation: Three cameras look along local -Z. */
export function cockpitPose(position:T.Vector3, rotation:T.Quaternion, vehicle:Pick<VehicleSpec,'width'|'height'|'length'|'shape'>) {
  const eye=vehicle.shape==='motorcycle'
    ?new T.Vector3(0,1.30,-.26)
    :new T.Vector3(-vehicle.width*.19,vehicle.height*.78,-vehicle.length*.07);
  return {position:eye.applyQuaternion(rotation).add(position),quaternion:rotation};
}
