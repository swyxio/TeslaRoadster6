import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLES } from '../shared/vehicles';
import { type World } from '../shared/game';
import { dayMinute } from '../shared/day';
import { BAY_BRIDGE_SIGNAL, bayBridgeSignal } from '../shared/bridge-signal';
import { isTrafficIncident } from '../shared/traffic';
import { DISTRICTS, FERRY_DOCKS, supportNormal } from '../shared/map';
import { buildBay } from './bay-world';
import { STATIONS } from '../shared/stations';
import { orderTarget } from '../shared/delivery';
import { FERRY_DECK, type FerrySide } from '../shared/ferry';
import { hasRocket } from '../shared/rocket';
import { PARKING_LOTS } from '../shared/parking-lots';
import { RACE_COURSES } from '../shared/race-courses';
import { playerRace } from '../shared/race';
import { box, material, createVehicle, setThrusterEffects } from './vehicles';
import { addIslandStunts } from './island-stunts';
import { cockpitPose } from './camera';

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
  private ferry = new T.Group();
  private ferryGates = {sf:new T.Group(),island:new T.Group()};
  private dockSigns: {side:FerrySide; canvas:HTMLCanvasElement; texture:T.CanvasTexture; text:string}[]=[];
  private parkingTargets = new Map<string,T.Mesh>();
  private raceGate = new T.Mesh(new T.RingGeometry(24.2,25,64),new T.MeshBasicMaterial({color:0xffdc80,side:T.DoubleSide,transparent:true,opacity:.8}));
  private labels:T.Sprite[]=[];
  private objective=new T.Group();
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
    addIslandStunts(scene);
    // The hull travels with the authoritative deck; its top is the physical y=0 support.
    box(this.ferry,0,-.65,0,FERRY_DECK.width,1.3,FERRY_DECK.length,0x485e63);
    box(this.ferry,0,-1.5,0,FERRY_DECK.width-1,1,FERRY_DECK.length-2,0x254b54);
    for(const x of [-3.5,3.5])for(const z of [-11,0,11]){
      box(this.ferry,x,.03,z,4.6,.05,9.4,0x697a75);
      box(this.ferry,x,.07,z,3.8,.03,.12,0xeedb9e);
    }
    // Painted pedestrian lanes and gates are visual cues, not collision geometry.
    for(const side of [-1,1]){
      const x=side*6.25;
      box(this.ferry,x,.095,0,1.25,.03,34,0x75b6ac);
      for(const z of [-13,-6,1,8,15])box(this.ferry,x,.12,z,1,.025,.2,0xf4ead0);
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#173e3d';ctx.font='bold 42px system-ui';ctx.textAlign='center';ctx.fillText('WALK',128,47);
      const mark=new T.Mesh(new T.PlaneGeometry(2.5,.65),new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false,side:T.DoubleSide}));
      mark.rotation.x=-Math.PI/2;mark.rotation.z=Math.PI/2;mark.position.set(x,.125,0);this.ferry.add(mark);
    }
    for(const [side,z] of [['sf',FERRY_DECK.length/2],['island',-FERRY_DECK.length/2]] as const){
      const gate=this.ferryGates[side];gate.position.set(-FERRY_DECK.width/2,1.1,z);
      box(gate,FERRY_DECK.width/2,0,0,FERRY_DECK.width,.18,.2,0xf5d06d);
      for(let x=1;x<FERRY_DECK.width;x+=2)box(gate,x,.11,0,.8,.05,.24,0x9b5b45);
      box(this.ferry,-FERRY_DECK.width/2,.55,z,.22,1.1,.22,0x394e4e);this.ferry.add(gate);
    }
    this.scene.add(this.ferry);
    for(const side of ['sf','island'] as const){
      const dock=FERRY_DOCKS[side],z=dock.z+(side==='sf'?15:-15);
      box(scene,16,2,z,.35,4,.35,0x394e4e);
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;
      const texture=new T.CanvasTexture(canvas);
      const sign=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true}));sign.position.set(16,5,z);sign.scale.set(24,5,1);scene.add(sign);
      this.dockSigns.push({side,canvas,texture,text:''});
    }
    for(const lot of PARKING_LOTS){
      box(scene,lot.area.x,.08,lot.area.z,lot.area.width,.12,lot.area.length,0x596766);
      box(scene,lot.approach.x,.16,lot.approach.z,lot.approach.width,.04,lot.approach.length,0x639c9b);
      for(const stall of lot.stalls){
        for(const side of [-1,1])box(scene,stall.x+side*stall.width/2,.19,stall.z,.12,.04,stall.length,0xf4ebcb);
        box(scene,stall.x,.19,stall.z-stall.length/2,stall.width,.04,.12,0xf4ebcb);
        const ring=new T.Mesh(new T.RingGeometry(2.6,3,32),new T.MeshBasicMaterial({color:0xffc46a,side:T.DoubleSide,transparent:true,opacity:.9}));
        ring.rotation.x=-Math.PI/2;ring.position.set(stall.x,.23,stall.z);ring.visible=false;scene.add(ring);this.parkingTargets.set(stall.id,ring);
      }
      const label=this.label(lot.name.toUpperCase());label.position.set(lot.area.x,8,lot.area.z);scene.add(label);
    }
    this.raceGate.visible=false;this.raceGate.scale.y=.52;scene.add(this.raceGate);
    for(const course of RACE_COURSES){
      const ring=new T.Mesh(new T.RingGeometry(6,6.5,40),new T.MeshBasicMaterial({color:0xffcf75,side:T.DoubleSide}));
      ring.rotation.x=-Math.PI/2;ring.position.set(course.start.x,.2,course.start.z);scene.add(ring);
      const label=this.label(course.name.toUpperCase());label.position.set(course.start.x,9,course.start.z);scene.add(label);
    }
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
    const labels:[string,number,number][]=[['SAN FRANCISCO',-105,110],['GOLDEN GATE',-240,-330],['OAKLAND',440,-80],['YERBA BUENA',198,38],['MARIN',-270,-445],['BAY BRIDGE',245,60],['ROCKET ISLAND FERRY',0,-230],['ROCKET ISLAND',200,-1450],...DISTRICTS.map(d=>[d.name.toUpperCase(),d.x,d.z] as [string,number,number])];
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
    const ferryTarget=new T.Vector3(world.ferry.x,0,world.ferry.z);
    if(this.ferry.position.distanceTo(ferryTarget)>35)this.ferry.position.copy(ferryTarget);else this.ferry.position.lerp(ferryTarget,1-Math.exp(-14*dt));
    for(const side of ['sf','island'] as const){
      const target=world.ferry.phase===side?Math.PI/2:0,gate=this.ferryGates[side];
      gate.rotation.z+=(target-gate.rotation.z)*(1-Math.exp(-6*dt));
    }
    const occupancy=world.entities.filter(e=>e.supportId==='ferry'&&e.kind!=='person').length;
    for(const sign of this.dockSigns){
      const f=world.ferry,destination=sign.side==='sf'?'ROCKET ISLAND':'SAN FRANCISCO';
      const waiting=f.blocked==='ramp'?'CLEAR DECK':f.blocked==='capacity'?'DECK FULL':f.blocked==='apron'?'CLEAR ARRIVAL':null;
      const status=f.phase===sign.side?(waiting?`WAIT · ${waiting}`:`BOARDING · DEPARTS ${Math.ceil(f.remaining)}S`)
        :f.phase===(sign.side==='sf'?'to-sf':'to-island')?`ARRIVES ${Math.ceil(f.remaining)}S`
        :f.phase==='sf'?'AT SAN FRANCISCO':f.phase==='island'?'AT ROCKET ISLAND':'EN ROUTE';
      const text=`${destination}|${status} · ${occupancy}/${FERRY_DECK.vehicleCapacity} CARS`;
      if(text!==sign.text){
        sign.text=text;const ctx=sign.canvas.getContext('2d')!;ctx.clearRect(0,0,768,160);
        ctx.fillStyle='#193b40';ctx.fillRect(0,0,768,160);ctx.fillStyle='#f8e9c7';ctx.textAlign='center';
        ctx.font='bold 44px system-ui';ctx.fillText(destination,384,60);ctx.font='bold 28px system-ui';ctx.fillText(`${status} · ${occupancy}/${FERRY_DECK.vehicleCapacity} CARS`,384,118);
        sign.texture.needsUpdate=true;
      }
    }
    const parkingTarget=world.parking.rounds.flatMap(round=>round.entrants).find(entrant=>entrant.playerId===playerId)?.targetId;
    for(const [id,marker] of this.parkingTargets)marker.visible=id===parkingTarget;
    const racing=playerRace(world.races,playerId),race=racing?.round,entrant=racing?.entrant;
    const course=RACE_COURSES.find(item=>item.id===race?.courseId);
    const gate=entrant&&course?.gates[entrant.nextGate];this.raceGate.visible=!!gate&&entrant?.status==='entered'&&race?.phase==='active';
    if(gate){this.raceGate.position.set(gate.x,(gate.minY+gate.maxY)/2,gate.z);this.raceGate.rotation.y=gate.yaw;}
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
      if(e.kind!=='person')setThrusterEffects(mesh,e.thrusters,world.time,hasRocket(e,world.time));
      const red=mesh.getObjectByName('police-red'),blue=mesh.getObjectByName('police-blue');if(red&&blue){red.visible=!e.police?.targetId||Math.floor(world.time*4)%2===0;blue.visible=!e.police?.targetId||Math.floor(world.time*4)%2===1;}
      const normal=e.supportId===null||e.supportId==='stunt-loop'||e.supportId==='island-cliff'?null:supportNormal(e.supportId,e.x,e.z);
      this.surfaceUp.set(normal?.x??0,normal?.y??1,normal?.z??0);
      this.surfaceBack.set(Math.sin(e.yaw),0,Math.cos(e.yaw));
      this.surfaceRight.crossVectors(this.surfaceUp,this.surfaceBack).normalize();
      this.surfaceBack.crossVectors(this.surfaceRight,this.surfaceUp).normalize();
      this.orientation.setFromRotationMatrix(this.basis.makeBasis(this.surfaceRight,this.surfaceUp,this.surfaceBack));
      this.orientation.multiply(this.pitchRotation.setFromAxisAngle(this.pitchAxis,e.supportId===null||e.supportId==='stunt-loop'||e.supportId==='island-cliff'?e.pitch:0));
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
      if(!mesh){mesh=new T.Mesh(new T.OctahedronGeometry(pickup.kind==='rocket'?2:1,0),new T.MeshStandardMaterial({color:pickup.kind==='rocket'?0xdf8bff:pickup.kind==='repair'?0x9ce5aa:0xffd577,emissive:pickup.kind==='rocket'?0x653180:pickup.kind==='repair'?0x3a6b45:0x735024}));mesh.position.set(pickup.x,1.7,pickup.z);this.pickups.set(pickup.id,mesh);this.scene.add(mesh);}
      mesh.visible=pickup.active;mesh.rotation.y+=dt;mesh.position.y=1.7+Math.sin(performance.now()*.002)*.3;
    }
    const e=controlled;
    this.objective.visible=!!player&&!menu;if(player){const target=orderTarget(player.delivery.order);this.objective.position.set(target.x,target.y+(target.rooftop?.3:0),target.z);this.objectiveRing.scale.setScalar(target.rooftop?2/3:1);}
    this.objectiveBeam.visible=!cockpit;
    if(menu){
      const t=performance.now()*.000035;this.follow.set(245+Math.sin(t)*25,235,400);this.focus.set(50,8,0);
    }else if(e&&!cockpit){
      const portrait=this.camera.aspect<.8;
      const distance=this.cameraMode==='wide'?30:portrait?18:15;
      const lookAhead=portrait?-6:5;
      this.follow.set(e.x+Math.sin(e.yaw)*distance,e.y+(this.cameraMode==='wide'?23:8),e.z+Math.cos(e.yaw)*distance);
      this.focus.lerp(new T.Vector3(e.x-Math.sin(e.yaw)*lookAhead,e.y+1.3,e.z-Math.cos(e.yaw)*lookAhead),1-Math.exp(-8*dt));
    }
    if(cockpit&&e&&e.kind!=='person'){
      const mesh=this.entities.get(e.id)!;const pose=cockpitPose(mesh.position,mesh.quaternion,VEHICLES[e.kind]);
      this.camera.position.copy(pose.position);this.camera.quaternion.copy(pose.quaternion);this.cameraReady=true;
    }else{
      if(!this.cameraReady){this.camera.position.copy(this.follow);this.cameraReady=true;}
      this.camera.position.lerp(this.follow,1-Math.exp(-5*dt));this.camera.lookAt(this.focus);
    }
    this.camera.updateMatrixWorld();for(const label of this.labels)label.visible=label.position.distanceTo(this.camera.position)>80;this.renderer.render(this.scene,this.camera);
  }
  start(frame:(dt:number)=>void){let last=performance.now();this.renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;frame(dt);});}
}
