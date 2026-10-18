import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLES,type VehicleId } from '../shared/vehicles';
import { createVehicle, setVehicleStyle } from './vehicles';
import type { VehicleStyle } from '../shared/vehicle-style';
/** On-demand still preview. Shares cached fleet meshes, never touches game state. */
export class FleetPreview {
  private renderer:T.WebGLRenderer;
  private scene=new T.Scene();
  private camera=new T.PerspectiveCamera(38,2,.1,100);
  private model?:T.Group;
  private environment:T.WebGLRenderTarget;
  constructor(canvas:HTMLCanvasElement){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(720,360,false);
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.85;
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
    this.scene.add(new T.HemisphereLight(0xffffff,0x52716a,1));const light=new T.DirectionalLight(0xfff4e4,2);light.position.set(4,8,-4);this.scene.add(light);
  }
  dispose(){
    if(this.model)this.scene.remove(this.model);
    this.scene.environment=null;this.environment.dispose();this.renderer.dispose();this.renderer.forceContextLoss();
  }
  show(id:VehicleId,style?:VehicleStyle){
    if(this.model)this.scene.remove(this.model);this.model=createVehicle(id);if(style)setVehicleStyle(this.model,id,style);this.scene.add(this.model);
    const spec=VEHICLES[id],d=Math.max(spec.length,spec.height*2.5);
    this.camera.position.set(d*.69,d*.42,-d*.92);this.camera.lookAt(0,spec.height*.5,0);this.renderer.render(this.scene,this.camera);
  }
}
