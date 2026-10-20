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

export type ChaseResponseState={motion:number;distance:number;gate:number;ready:boolean};

/** Smooth the framing response to discrete velocity, ground/air and arena updates. */
export function chaseResponse(speed:number, airborne:boolean, enabled:boolean, dt:number, state:ChaseResponseState, out:{distance:number;lookAhead:number;focusRate:number}){
  const speedMotion=T.MathUtils.clamp((Math.abs(speed)-8)/20,0,1),gateTarget=enabled?1:0;
  if(!state.ready){state.gate=gateTarget;state.motion=speedMotion*state.gate;state.distance=(airborne?8:4)*state.motion;state.ready=true;}
  else{
    state.gate+=(gateTarget-state.gate)*(1-Math.exp(-dt));
    const targetMotion=speedMotion*state.gate;
    state.motion+=(targetMotion-state.motion)*(1-Math.exp(-8*dt));
    state.distance+=((airborne?8:4)*targetMotion-state.distance)*(1-Math.exp(-dt));
  }
  out.lookAhead*=1-state.motion;out.distance+=state.distance;out.focusRate=8+16*state.motion;
}

/** Smooth the chase position and aim independently; retain intentional cuts. */
export function updateChase(position:T.Vector3,focus:T.Vector3,follow:T.Vector3,target:T.Vector3,dt:number,ready:boolean,focusRate:number){
  if(!ready||position.distanceTo(follow)>100){position.copy(follow);focus.copy(target);return;}
  position.lerp(follow,1-Math.exp(-5*dt));
  focus.lerp(target,1-Math.exp(-focusRate*dt));
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
