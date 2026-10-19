import * as T from 'three';
import horizonUrl from './assets/bay-horizon.webp';
import { createHorizonGeometryData, projectHorizon } from './horizon-geometry';

/** Distant visual scenery only; collision, water and roads stay authoritative. */
export function createHorizon(scene: T.Scene) {
  const data=createHorizonGeometryData(), positions=new Float32Array(data.world.length);
  const geometry=new T.BufferGeometry();
  const position=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position',position);
  geometry.setAttribute('uv',new T.BufferAttribute(data.uv,2));
  geometry.setIndex(data.indices);
  const texture=new T.TextureLoader().load(horizonUrl,undefined,undefined,()=>{
    // A missing optional art asset must never prevent the game from joining.
    mesh.visible=false;
    console.warn('Bay horizon texture could not be loaded.');
  });
  texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=T.MirroredRepeatWrapping;
  // The horizon is a thin card: render its two-sided transparent material in
  // one pass rather than Three.js's default separate front/back passes.
  const material=new T.MeshBasicMaterial({map:texture,transparent:true,opacity:.88,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,fog:false});
  const mesh=new T.Mesh(geometry,material);
  // Bounds move with the camera, so the static world-space frustum test is not applicable.
  mesh.frustumCulled=false;
  mesh.renderOrder=-100;
  scene.add(mesh);
  let lastX=NaN,lastY=NaN,lastZ=NaN;
  return {
    update(camera: T.Camera, daylight: number) {
      const {x,y,z}=camera.position;
      if (x!==lastX||y!==lastY||z!==lastZ) {
        projectHorizon(data.world,positions,x,y,z);
        position.needsUpdate=true;
        lastX=x;lastY=y;lastZ=z;
      }
      const light=.28+.72*daylight;
      material.color.setRGB(light*.91,light*.96,light);
    },
  };
}
