import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLES } from '../shared/vehicles';
import { type World } from '../shared/game';
import { buildBay } from './bay-world';
import { STATIONS } from '../shared/stations';
import { orderTarget } from '../shared/delivery';
import { box, material, createVehicle, setThrusterEffects } from './vehicles';

export class GameScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(55,1,.1,1800);
  private entities = new Map<string,T.Group>();
  private pickups = new Map<string,T.Mesh>();
  private labels:T.Sprite[]=[];
  private objective=new T.Group();
  private objectiveRing=new T.Mesh(new T.RingGeometry(8.5,9,48),new T.MeshBasicMaterial({color:0xffcf75,side:T.DoubleSide}));
  private focus = new T.Vector3(0,1,24);
  private follow = new T.Vector3();
  private cameraReady = false;
  wideCamera = false;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .82;
    this.scene.background = new T.Color(0xa8cbd0);
    this.scene.fog = new T.Fog(0xa8cbd0,350,1200);
    this.scene.add(new T.HemisphereLight(0xe9f5ff,0x626953,1.4));
    const sun = new T.DirectionalLight(0xffdfb5,2.2); sun.position.set(-100,160,80); this.scene.add(sun);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
    this.buildWorld();
    this.objectiveRing.rotation.x=-Math.PI/2;this.objectiveRing.position.y=.25;this.objective.add(this.objectiveRing);
    const beam=new T.Mesh(new T.CylinderGeometry(.5,1,18,8,1,true),new T.MeshBasicMaterial({color:0xffcf75,transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide}));beam.position.y=9;this.objective.add(beam);
    this.scene.add(this.objective);
    const resize = () => { this.renderer.setSize(innerWidth,innerHeight); this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); };
    window.addEventListener('resize',resize); resize();
  }
  private buildWorld() {
    const scene=this.scene;
    buildBay(scene);
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
    const labels:[string,number,number][]=[['SAN FRANCISCO',-105,110],['GOLDEN GATE',-240,-330],['OAKLAND',440,-80],['YERBA BUENA',198,38],['MARIN',-270,-445],['BAY BRIDGE',245,60]];
    labels.forEach(([text,x,z])=>{const label=this.label(text);label.position.set(x,32,z);label.scale.multiplyScalar(.8);scene.add(label);});

  }
  private label(text: string) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(18,36,41,.82)';ctx.roundRect(0,0,512,64,14);ctx.fill();ctx.fillStyle='#f8eed9';ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.fillText(text,256,41);
    const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false,transparent:true}));sprite.scale.set(24,3,1);this.labels.push(sprite);return sprite;
  }
  render(world: World, playerId: string, dt: number, menu: boolean) {
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
      const target=new T.Vector3(e.x,e.y,e.z);
      if(mesh.position.distanceTo(target)>35)mesh.position.copy(target);else mesh.position.lerp(target,alpha);
      mesh.rotation.order='YXZ';
      const delta=(target:number,current:number)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
      mesh.rotation.y+=delta(e.yaw,mesh.rotation.y)*alpha;mesh.rotation.x+=delta(e.pitch,mesh.rotation.x)*alpha;mesh.rotation.z+=delta(e.roll,mesh.rotation.z)*alpha;
      if(e.kind==='roadster')setThrusterEffects(mesh,e.thrusters,world.time);
      const red=mesh.getObjectByName('police-red'),blue=mesh.getObjectByName('police-blue');if(red&&blue){red.visible=!e.police?.targetId||Math.floor(world.time*4)%2===0;blue.visible=!e.police?.targetId||Math.floor(world.time*4)%2===1;}
      if(e.kind!=='person'){const spec=VEHICLES[e.kind];for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const wheel=mesh.getObjectByName(name);if(wheel)wheel.rotation.y=e.steering*spec.steerAngle*(name.startsWith('wheel_r')?(spec.fourWheelSteering?-.55*Math.max(0,1-Math.abs(e.speed)/25):0):1);}}
    }
    for(const pickup of world.pickups){
      let mesh=this.pickups.get(pickup.id);
      if(!mesh){mesh=new T.Mesh(new T.OctahedronGeometry(1,0),new T.MeshStandardMaterial({color:pickup.kind==='repair'?0x9ce5aa:0xffd577,emissive:pickup.kind==='repair'?0x3a6b45:0x735024}));mesh.position.set(pickup.x,1.7,pickup.z);this.pickups.set(pickup.id,mesh);this.scene.add(mesh);}
      mesh.visible=pickup.active;mesh.rotation.y+=dt;mesh.position.y=1.7+Math.sin(performance.now()*.002)*.3;
    }
    const player=world.players.find(p=>p.id===playerId);
    const e=world.entities.find(e=>e.id===player?.entityId);
    this.objective.visible=!!player&&!menu;if(player){const target=orderTarget(player.delivery.order);this.objective.position.set(target.x,target.y+(target.rooftop?.3:0),target.z);this.objectiveRing.scale.setScalar(target.rooftop?2/3:1);}
    if(menu){
      const t=performance.now()*.000035;this.follow.set(245+Math.sin(t)*25,235,400);this.focus.set(50,8,0);
    }else if(e){
      const portrait=this.camera.aspect<.8;
      const distance=this.wideCamera?30:portrait?18:15;
      const lookAhead=portrait?-6:5;
      this.follow.set(e.x+Math.sin(e.yaw)*distance,e.y+(this.wideCamera?23:8),e.z+Math.cos(e.yaw)*distance);
      this.focus.lerp(new T.Vector3(e.x-Math.sin(e.yaw)*lookAhead,e.y+1.3,e.z-Math.cos(e.yaw)*lookAhead),1-Math.exp(-8*dt));
    }
    if(!this.cameraReady){this.camera.position.copy(this.follow);this.cameraReady=true;}
    this.camera.position.lerp(this.follow,1-Math.exp(-5*dt));this.camera.lookAt(this.focus);for(const label of this.labels)label.visible=label.position.distanceTo(this.camera.position)>80;this.renderer.render(this.scene,this.camera);
  }
  start(frame:(dt:number)=>void){let last=performance.now();this.renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;frame(dt);});}
}
