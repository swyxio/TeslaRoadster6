import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLES } from '../shared/vehicles';
import { type World } from '../shared/game';
import { dayMinute } from '../shared/day';
import { BAY_BRIDGE_SIGNAL, bayBridgeSignal } from '../shared/bridge-signal';
import { isTrafficIncident } from '../shared/traffic';
import { DISTRICTS, domeSurface, supportNormal } from '../shared/map';
import { buildBay } from './bay-world';
import { STATIONS } from '../shared/stations';
import { orderTarget } from '../shared/delivery';
import { box, material, createVehicle, setThrusterEffects } from './vehicles';
import { cockpitPose } from './camera';
import { createRocketDome } from './rocket-dome';
import { DOME } from '../shared/dome';

export type CameraMode = 'chase' | 'wide' | 'cockpit';

export class GameScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private sky = new T.Color();
  private nightSky = new T.Color(0x334b62);
  private daySky = new T.Color(0xa8cbd0);
  private hemisphere = new T.HemisphereLight(0xe9f5ff,0x626953,1.4);
  private sun = new T.DirectionalLight(0xffdfb5,2.2);
  private signalRed = new T.MeshBasicMaterial({color:0x551b19});
  private signalGreen = new T.MeshBasicMaterial({color:0x173d2b});
  private camera = new T.PerspectiveCamera(55,1,.1,1800);
  private entities = new Map<string,T.Group>();
  private pickups = new Map<string,T.Mesh>();
  private labels:T.Sprite[]=[];
  private objective=new T.Group();
  private dome=createRocketDome();
  private ballPosition=new T.Vector3();
  private ballReady=false;
  private objectiveRing=new T.Mesh(new T.RingGeometry(8.5,9,48),new T.MeshBasicMaterial({color:0xffcf75,side:T.DoubleSide}));
  private objectiveBeam=new T.Mesh(new T.CylinderGeometry(.5,1,18,8,1,true),new T.MeshBasicMaterial({color:0xffcf75,transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide}));
  private focus = new T.Vector3(0,1,24);
  private follow = new T.Vector3();
  private surfaceUp = new T.Vector3();
  private surfaceBack = new T.Vector3();
  private surfaceRight = new T.Vector3();
  private orientation = new T.Quaternion();
  private pitchRotation = new T.Quaternion();
  private pitchAxis = new T.Vector3(1,0,0);
  private rollRotation = new T.Quaternion();
  private rollAxis = new T.Vector3(0,0,1);
  private cameraTurn = new T.Quaternion();
  private cameraTargetTurn = new T.Quaternion();
  private basis = new T.Matrix4();
  private cameraReady = false;
  cameraMode:CameraMode = 'chase';
  private renderedCockpit=false;
  private marker = new T.Vector3();
  cycleCamera(){this.cameraMode=this.cameraMode==='chase'?'cockpit':this.cameraMode==='cockpit'?'wide':'chase';this.cameraReady=false;}
  objectiveScreen(){
    this.marker.copy(this.objective.position);this.marker.y+=3;this.marker.project(this.camera);
    return {x:(this.marker.x+1)/2,y:(1-this.marker.y)/2,visible:this.objective.visible&&this.marker.z>=-1&&this.marker.z<=1&&Math.abs(this.marker.x)<1&&Math.abs(this.marker.y)<1};
  }
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .82;
    this.scene.background = new T.Color(0xa8cbd0);
    this.scene.fog = new T.Fog(0xa8cbd0,350,1200);
    this.scene.add(this.hemisphere);
    this.sun.position.set(-100,160,80); this.scene.add(this.sun);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
    this.buildWorld();
    this.objectiveRing.rotation.x=-Math.PI/2;this.objectiveRing.position.y=.25;this.objective.add(this.objectiveRing);
    this.objectiveBeam.position.y=9;this.objective.add(this.objectiveBeam);
    this.scene.add(this.objective);
    const resize = () => { this.renderer.setSize(innerWidth,innerHeight); this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); };
    window.addEventListener('resize',resize); resize();
  }
  private buildWorld() {
    const scene=this.scene;
    buildBay(scene);
    scene.add(this.dome.group);
    const signal=BAY_BRIDGE_SIGNAL;
    // The meter is visual only: the same shared fixture controls NPCs and AVs.
    box(scene,signal.stopX,.06,signal.centerZ+signal.halfWidth/2,.35,.1,signal.halfWidth,0xf7f1db);
    box(scene,signal.lightX,2.2,signal.lightZ,.35,4.4,.35,0x303b3b);
    box(scene,signal.lightX,4.45,signal.lightZ,.85,1.5,.85,0x202a2c);
    const red=new T.Mesh(new T.SphereGeometry(.23,12,8),this.signalRed);
    red.position.set(signal.lightX-.44,4.8,signal.lightZ);scene.add(red);
    const green=new T.Mesh(new T.SphereGeometry(.23,12,8),this.signalGreen);
    green.position.set(signal.lightX-.44,4.1,signal.lightZ);scene.add(green);
    STATIONS.forEach(s=>{
      box(scene,s.x,.1,s.z,9,.15,12,0x65776f);
      for(const offset of [-3,0,3]) {
        box(scene,s.x+offset,1.2,s.z-4,1.1,2.4,.6,0xf3e8d6);
        box(scene,s.x+offset,1.3,s.z-4.33,.65,1.5,.04,0xd34537);
        box(scene,s.x+offset,1.3,s.z-4.37,.32,1,.04,0x30494b);
      }
      const ring=new T.Mesh(new T.RingGeometry(5,5.2,40),new T.MeshBasicMaterial({color:0x9ef7cb,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(s.x,.2,s.z);scene.add(ring);
      const label=this.label('ϟ  '+s.name);label.position.set(s.x,6,s.z);scene.add(label);
    });
    const labels:[string,number,number][]=[['SAN FRANCISCO',-105,110],['GOLDEN GATE',-240,-330],['OAKLAND',440,-80],['YERBA BUENA',198,38],['MARIN',-270,-445],['BAY BRIDGE',245,60],...DISTRICTS.map(d=>[d.name.toUpperCase(),d.x,d.z] as [string,number,number])];
    labels.forEach(([text,x,z])=>{const label=this.label(text);label.position.set(x,32,z);label.scale.multiplyScalar(.8);scene.add(label);});

  }
  private label(text: string) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(18,36,41,.82)';ctx.roundRect(0,0,512,64,14);ctx.fill();ctx.fillStyle='#f8eed9';ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.fillText(text,256,41);
    const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false,transparent:true}));sprite.scale.set(24,3,1);this.labels.push(sprite);return sprite;
  }
  render(world: World, playerId: string, dt: number, menu: boolean) {
    const signal=bayBridgeSignal(world.time).state;
    this.signalRed.color.setHex(signal==='red'?0xff453b:0x551b19);
    this.signalGreen.color.setHex(signal==='green'?0x54ff96:0x173d2b);
    // The shared clock advances the sky; vehicle physics always use real simulation seconds.
    const phase=(dayMinute(world.time)-360)/1440*Math.PI*2;
    const daylight=Math.max(0,Math.min(1,(Math.sin(phase)+.22)/.55));
    this.sky.copy(this.nightSky).lerp(this.daySky,daylight);
    (this.scene.background as T.Color).copy(this.sky);
    (this.scene.fog as T.Fog).color.copy(this.sky);
    this.hemisphere.intensity=.8+daylight*.6;
    this.sun.intensity=.5+daylight*1.7;
    this.sun.position.set(-160*Math.cos(phase),Math.max(20,160*Math.sin(phase)),80);
    const player=world.players.find(p=>p.id===playerId);
    const controlled=world.entities.find(e=>e.id===player?.entityId);
    const cockpit=!menu&&this.cameraMode==='cockpit'&&controlled?.kind!==undefined&&controlled.kind!=='person';
    if(cockpit!==this.renderedCockpit){this.cameraReady=false;this.renderedCockpit=cockpit;this.camera.fov=cockpit?75:55;this.camera.updateProjectionMatrix();}
    const ids=new Set(world.entities.map(e=>e.id));
    for(const [id,mesh] of this.entities) if(!ids.has(id)){this.scene.remove(mesh);this.entities.delete(id);}
    const alpha=1-Math.exp(-14*dt);
    for(const e of world.entities) {
      let mesh=this.entities.get(e.id);
      if(mesh&&mesh.name!==e.kind){this.scene.remove(mesh);this.entities.delete(e.id);mesh=undefined;}
      if(!mesh){mesh=createVehicle(e.kind);if(e.police){
        const h=VEHICLES['model-3'].height;
        box(mesh,0,h+.05,0,.9,.12,.35,0x1b2c35);
        const red=box(mesh,-.23,h+.15,0,.4,.15,.28,0xff4b48);red.name='police-red';
        const blue=box(mesh,.23,h+.15,0,.4,.15,.28,0x3caaff);blue.name='police-blue';
        for(const side of [-1,1])box(mesh,side*(VEHICLES['model-3'].width/2+.01),.67,0,.035,.22,1.4,0x172832);
      }mesh.position.set(e.x,e.y,e.z);this.entities.set(e.id,mesh);this.scene.add(mesh);}
      mesh.visible=!(cockpit&&e.id===controlled?.id);
      const target=new T.Vector3(e.x,e.y,e.z);
      if(mesh.position.distanceTo(target)>35)mesh.position.copy(target);else mesh.position.lerp(target,alpha);
      if(e.kind==='roadster')setThrusterEffects(mesh,e.thrusters,world.time);
      const red=mesh.getObjectByName('police-red'),blue=mesh.getObjectByName('police-blue');if(red&&blue){red.visible=!e.police?.targetId||Math.floor(world.time*4)%2===0;blue.visible=!e.police?.targetId||Math.floor(world.time*4)%2===1;}
      const surface=e.supportId==='dome'&&e.domeS!==null?domeSurface(e.domeS):null;
      const normal=e.supportId===null||e.supportId==='stunt-loop'||e.supportId==='dome'?null:supportNormal(e.supportId,e.x,e.z);
      this.surfaceUp.set(0,surface?.normalY??normal?.y??1,surface?.normalZ??normal?.z??0);
      if(!surface)this.surfaceUp.x=normal?.x??0;
      this.surfaceBack.set(Math.sin(e.yaw),surface?Math.cos(e.yaw)*surface.tangentY:0,surface?Math.cos(e.yaw)*surface.tangentZ:Math.cos(e.yaw));
      this.surfaceRight.crossVectors(this.surfaceUp,this.surfaceBack).normalize();
      this.surfaceBack.crossVectors(this.surfaceRight,this.surfaceUp).normalize();
      this.orientation.setFromRotationMatrix(this.basis.makeBasis(this.surfaceRight,this.surfaceUp,this.surfaceBack));
      this.orientation.multiply(this.pitchRotation.setFromAxisAngle(this.pitchAxis,e.supportId===null||e.supportId==='stunt-loop'?e.pitch:0));
      this.orientation.multiply(this.rollRotation.setFromAxisAngle(this.rollAxis,e.roll));
      mesh.quaternion.slerp(this.orientation,alpha);
      const incident=isTrafficIncident(e,world.time);
      let hazard=mesh.getObjectByName('traffic-hazard');
      if(incident&&!hazard&&e.kind!=='person'){hazard=box(mesh,0,VEHICLES[e.kind].height+.2,0,.9,.2,.35,0xffa63d);hazard.name='traffic-hazard';}
      if(hazard)hazard.visible=incident&&Math.floor(world.time*3)%2===0;
      if(e.kind!=='person'){const spec=VEHICLES[e.kind];for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const wheel=mesh.getObjectByName(name);if(wheel)wheel.rotation.y=e.steering*spec.steerAngle*(name.startsWith('wheel_r')?(spec.fourWheelSteering?-.55*Math.max(0,1-Math.abs(e.speed)/25):0):1);}}
    }
    for(const pickup of world.pickups){
      let mesh=this.pickups.get(pickup.id);
      if(!mesh){mesh=new T.Mesh(new T.OctahedronGeometry(1,0),new T.MeshStandardMaterial({color:pickup.kind==='repair'?0x9ce5aa:0xffd577,emissive:pickup.kind==='repair'?0x3a6b45:0x735024}));mesh.position.set(pickup.x,1.7,pickup.z);this.pickups.set(pickup.id,mesh);this.scene.add(mesh);}
      mesh.visible=pickup.active;mesh.rotation.y+=dt;mesh.position.y=1.7+Math.sin(performance.now()*.002)*.3;
    }
    const ball=world.soccer.ball,ballTarget=new T.Vector3(ball.x,ball.y,ball.z);
    if(!this.ballReady||this.ballPosition.distanceTo(ballTarget)>12){this.ballPosition.copy(ballTarget);this.ballReady=true;}
    else this.ballPosition.lerp(ballTarget,alpha);
    this.dome.update(this.ballPosition);
    const e=controlled;
    this.objective.visible=!!player&&!menu&&!e?.inDome;if(player){const target=orderTarget(player.delivery.order);this.objective.position.set(target.x,target.y+(target.rooftop?.3:0),target.z);this.objectiveRing.scale.setScalar(target.rooftop?2/3:1);}
    this.objectiveBeam.visible=!cockpit;
    const cameraUp=new T.Vector3(0,1,0);
    if(menu){
      const t=performance.now()*.000035;this.follow.set(245+Math.sin(t)*25,235,400);this.focus.set(50,8,0);
    }else if(e&&!cockpit){
      const portrait=this.camera.aspect<.8;
      const distance=this.cameraMode==='wide'?30:portrait?18:15;
      const lookAhead=portrait?-6:5;
      const surface=e.supportId==='dome'&&e.domeS!==null?domeSurface(e.domeS):null;
      const back=new T.Vector3(Math.sin(e.yaw),surface?Math.cos(e.yaw)*surface.tangentY:0,surface?Math.cos(e.yaw)*surface.tangentZ:Math.cos(e.yaw));
      const position=new T.Vector3(e.x,e.y,e.z),focusTarget=position.clone().addScaledVector(back,-lookAhead).addScaledVector(cameraUp,1.3);
      this.follow.copy(position).addScaledVector(back,distance).addScaledVector(cameraUp,this.cameraMode==='wide'?23:8);
      if(surface){
        // A tangent chase camera on the curved wall points out through the
        // shell. Move behind the car and look into the pitch as it climbs,
        // retaining world-up so the field remains legible on the ceiling.
        const wallView=T.MathUtils.clamp((1-surface.normalY)*2.5,0,1);
        const field=new T.Vector3(T.MathUtils.clamp(e.x,DOME.x-DOME.halfLength*.45,DOME.x+DOME.halfLength*.45),0,DOME.z);
        const outward=position.clone().sub(field).normalize();
        const arenaCamera=position.clone().addScaledVector(outward,this.cameraMode==='wide'?22:15).add(new T.Vector3(back.x*6,10,0));
        const arenaFocus=position.clone().lerp(field,.35).add(new T.Vector3(0,1,0));
        this.follow.lerp(arenaCamera,wallView);focusTarget.lerp(arenaFocus,wallView);
      }
      if(!this.cameraReady||this.camera.position.distanceTo(this.follow)>100){this.camera.position.copy(this.follow);this.focus.copy(focusTarget);}
      else this.focus.lerp(focusTarget,1-Math.exp(-8*dt));
    }
    if(cockpit&&e&&e.kind!=='person'){
      const mesh=this.entities.get(e.id)!;const pose=cockpitPose(mesh.position,mesh.quaternion,VEHICLES[e.kind]);
      this.camera.position.copy(pose.position);this.camera.quaternion.copy(pose.quaternion);this.cameraReady=true;
    }else{
      if(!this.cameraReady){this.camera.position.copy(this.follow);this.cameraReady=true;}
      this.camera.position.lerp(this.follow,1-Math.exp(-5*dt));
      this.cameraTargetTurn.setFromUnitVectors(this.camera.up,cameraUp);this.cameraTurn.identity().slerp(this.cameraTargetTurn,1-Math.exp(-5*dt));this.camera.up.applyQuaternion(this.cameraTurn).normalize();
      this.camera.lookAt(this.focus);
    }
    this.camera.updateMatrixWorld();for(const label of this.labels)label.visible=label.position.distanceTo(this.camera.position)>80;this.renderer.render(this.scene,this.camera);
  }
  start(frame:(dt:number)=>void){let last=performance.now();this.renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;frame(dt);});}
}
