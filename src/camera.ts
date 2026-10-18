import * as T from 'three';
import type { VehicleSpec } from '../shared/vehicles';

/** Camera and car share an orientation: Three cameras look along local -Z. */
export function cockpitPose(position:T.Vector3, rotation:T.Quaternion, vehicle:Pick<VehicleSpec,'width'|'height'|'length'|'shape'>) {
  const eye=vehicle.shape==='motorcycle'
    ?new T.Vector3(0,1.30,-.26)
    :new T.Vector3(-vehicle.width*.19,vehicle.height*.78,-vehicle.length*.07);
  return {position:eye.applyQuaternion(rotation).add(position),quaternion:rotation};
}
