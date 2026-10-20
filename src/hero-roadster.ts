import * as T from 'three';
import { VEHICLES } from '../shared/vehicles';

// Only the controlled Roadster needs the costly model. The ordinary fleet is
// immediately available while the optional, attributed model is loading.
type HiddenPart = { object:T.Object3D; visible:boolean; name:string };
type HeroState = { enabled:boolean; loading:boolean; failed:boolean; model?:T.Group; hidden:HiddenPart[] };
const states = new WeakMap<T.Group, HeroState>();

function prepare(model:T.Group) {
  // Main-game rocket equipment and driver positioning remain authoritative.
  model.getObjectByName('rear_thrusters')?.removeFromParent();
  let stock:T.Material|undefined;
  const opaqueGlass=new Map<T.Material,T.Material>();
  model.traverse(object=>{
    if(!(object instanceof T.Mesh)||Array.isArray(object.material))return;
    if(object.material.userData.teslandHeroPaint){
      stock??=object.material.clone();
      if(stock instanceof T.MeshStandardMaterial)stock.color.setHex(VEHICLES.roadster.color);
      object.material=stock;
      object.userData.originalVehiclePaint=stock;
    }else if(object.material instanceof T.MeshPhysicalMaterial&&object.material.transmission>0){
      // Refractive glass makes Three.js render the whole scene again for a
      // tiny headlamp lens. Approximate it with opaque reflective glass here.
      let replacement=opaqueGlass.get(object.material);
      if(!replacement){replacement=object.material.clone();(replacement as T.MeshPhysicalMaterial).transmission=0;replacement.transparent=false;replacement.opacity=1;opaqueGlass.set(object.material,replacement);}
      object.material=replacement;
    }
  });
}

function install(root:T.Group, state:HeroState, model:T.Group) {
  const detail=root.getObjectByName('vehicle-detail') ?? root;
  for(const part of [...detail.children]) {
    if(part.name==='rocket_hardware'||part.name==='jets'||part.name==='seat_driver'||part.name==='vehicle-decal'||part.name==='traffic-hazard')continue;
    state.hidden.push({object:part,visible:part.visible,name:part.name});
    part.visible=false;
    if(part.name.startsWith('wheel_'))part.name=`fallback_${part.name}`;
  }
  model.name='hero-roadster';
  detail.add(model);state.model=model;
  root.userData.vehicleStyle=undefined;
}

export function updateHeroRoadster(root:T.Group, enabled:boolean, renderer:T.WebGLRenderer, camera:T.Camera, scene:T.Scene) {
  let state=states.get(root);
  if(!state){state={enabled:false,loading:false,failed:false,hidden:[]};states.set(root,state);}
  if(state.enabled===enabled)return;
  state.enabled=enabled;
  if(!enabled){
    state.model?.removeFromParent();
    for(const part of state.hidden){part.object.visible=part.visible;part.object.name=part.name;}
    state.hidden=[];root.userData.vehicleStyle=undefined;
    return;
  }
  if(state.model){install(root,state,state.model);return;}
  if(state.loading||state.failed)return;
  state.loading=true;
  const target=state;
  void import('./embarcadero/car').then(module=>module.createEmbarcaderoCar()).then(async model=>{
    prepare(model);
    // The model contains many materials. Compile them against the actual
    // scene before attaching it so the first visible frame does not block on
    // all of their shaders at once. Stock geometry stays driveable meanwhile.
    await renderer.compileAsync(model,camera,scene);
    target.loading=false;target.model=model;
    if(target.enabled)install(root,target,model);
  }).catch(error=>{target.loading=false;target.failed=true;console.warn('Detailed Roadster unavailable; using the standard vehicle.',error);});
}
