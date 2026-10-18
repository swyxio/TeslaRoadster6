import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLES } from '../shared/vehicles';
import { BUILDINGS, WORLD_LIMIT, type World, type Entity } from '../shared/game';
import { STATIONS } from '../shared/stations';
import { box, material, createVehicle } from './vehicles';

export class GameScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(55,1,.1,1800);
  private entities = new Map<string,T.Group>();
  private pickups = new Map<string,T.Mesh>();
  private labels:T.Sprite[]=[];
  private focus = new T.Vector3(0,1,24);
  private follow = new T.Vector3();
  private cameraReady = false;
  wideCamera = false;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new T.Color(0xa8cbd0);
    this.scene.fog = new T.Fog(0xa8cbd0,180,650);
    this.scene.add(new T.HemisphereLight(0xe9f5ff,0x626953,2.8));
    const sun = new T.DirectionalLight(0xffdfb5,3.5); sun.position.set(-100,160,80); this.scene.add(sun);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
    this.buildWorld();
    const resize = () => { this.renderer.setSize(innerWidth,innerHeight); this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); };
    window.addEventListener('resize',resize); resize();
  }
  private buildWorld() {
    const scene=this.scene;
    box(scene,0,-1.5,0,480,3,480,0xb4b397);
    box(scene,0,-3,0,2000,1,2000,0x579ca9);
    // Quays and the seven-road grid form the shared collision world's streets.
    for (let a=-180;a<=180;a+=60) {
      box(scene,a,.015,0,14,.08,480,0x46555a);
      box(scene,0,.025,a,480,.08,14,0x46555a);
      for (let b=-230;b<=230;b+=12) {
        if (Math.abs(b%60)<10) continue;
        box(scene,a,.08,b,.14,.02,4,0xc8bc8b);
        box(scene,b,.09,a,4,.02,.14,0xc8bc8b);
      }
    }
    const windowTransforms:T.Matrix4[]=[];
    const palettes=[0xd4c9b5,0xe0d9c7,0xa9b9b5,0xc2b5a6,0xe2ceac,0x99b1b7];
    BUILDINGS.forEach((b,i) => {
      box(scene,b.x,.1,b.z,b.w+2,.25,b.d+2,0xd7d0bb);
      box(scene,b.x,b.h/2,b.z,b.w,b.h,b.d,palettes[i%palettes.length]);
      box(scene,b.x,b.h+.2,b.z,b.w+.4,.4,b.d+.4,0xece2ca);
      box(scene,b.x,b.h+.8,b.z,Math.min(3,b.w/2),1.2,3,0x8d9b95);
      for (let y=3;y<b.h-1;y+=3.5) for (let x=-b.w/2+2;x<b.w/2-1;x+=3.8) {
        windowTransforms.push(new T.Matrix4().compose(new T.Vector3(b.x+x,y,b.z+b.d/2+.02),new T.Quaternion(),new T.Vector3(1.3,1.5,.08)));
        windowTransforms.push(new T.Matrix4().compose(new T.Vector3(b.x+x,y,b.z-b.d/2-.02),new T.Quaternion(),new T.Vector3(1.3,1.5,.08)));
      }
    });
    const windows=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(0x52717a),windowTransforms.length);
    windowTransforms.forEach((m,i)=>windows.setMatrixAt(i,m)); scene.add(windows);
    // Trees on sidewalks, safely outside road collision lanes.
    for(let x=-180;x<=180;x+=60) for(let z=-210;z<=210;z+=30) {
      if(Math.abs(z%60)<10) continue;
      box(scene,x-10,1.2,z,.45,2.4,.45,0x76694f);
      const crown=new T.Mesh(new T.IcosahedronGeometry(2.1,0),material(0x577b61)); crown.position.set(x-10,3.4,z);scene.add(crown);
    }
    // Golden Gate silhouette at the northern edge; road underneath remains playable.
    const red=0xc3543c;
    for(const x of [-110,110]) {
      for(const z of [-188,-172]) box(scene,x,27,z,2.5,54,2.5,red);
      for(const y of [12,32,48]) box(scene,x,y,-180,2.5,2,18,red);
    }
    for(const z of [-188,-172]) {
      const points:T.Vector3[]=[];
      for(let x=-235;x<=235;x+=5) {
        const y=Math.abs(x)<=110?15+33*(x/110)**2:48-35*((Math.abs(x)-110)/125);
        points.push(new T.Vector3(x,y,z));
        if(x%10===0) box(scene,x,y/2,z,.16,y,.16,red);
      }
      const cable = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),100,.22,5,false),material(red));scene.add(cable);
    }
    for(let i=0;i<14;i++) {
      const hill=new T.Mesh(new T.ConeGeometry(80+(i%3)*25,80+(i%4)*20,5),material(i%2?0x789586:0x8ba08e));
      hill.position.set(-650+i*100,5,-430-(i%3)*45);scene.add(hill);
    }
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
    const labels:[string,number,number][]=[['SAN FRANCISCO',-80,70],['GOLDEN GATE',0,-190],['EAST BAY',180,-70],['PENINSULA',0,210],['POLY AVE',0,0]];
    labels.forEach(([text,x,z])=>{const label=this.label(text);label.position.set(x,35,z);label.scale.multiplyScalar(1.5);scene.add(label);});
    // Edge bollards clearly mark the limits of the first playground.
    for(let p=-WORLD_LIMIT;p<=WORLD_LIMIT;p+=12) for(const [x,z] of [[p,-WORLD_LIMIT],[p,WORLD_LIMIT],[-WORLD_LIMIT,p],[WORLD_LIMIT,p]]) box(scene,x,.6,z,.4,1.2,.4,0xe8d7ac);
  }
  private label(text: string) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(18,36,41,.82)';ctx.roundRect(0,0,512,64,14);ctx.fill();ctx.fillStyle='#f8eed9';ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.fillText(text,256,41);
    const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false,transparent:true}));sprite.scale.set(24,3,1);this.labels.push(sprite);return sprite;
  }
  render(world: World, playerId: string, dt: number, menu: boolean, lift: boolean) {
    const ids=new Set(world.entities.map(e=>e.id));
    for(const [id,mesh] of this.entities) if(!ids.has(id)){this.scene.remove(mesh);this.entities.delete(id);}
    const alpha=1-Math.exp(-14*dt);
    for(const e of world.entities) {
      let mesh=this.entities.get(e.id);
      if(mesh&&mesh.name!==e.kind){this.scene.remove(mesh);this.entities.delete(e.id);mesh=undefined;}
      if(!mesh){mesh=createVehicle(e.kind);mesh.position.set(e.x,e.y,e.z);this.entities.set(e.id,mesh);this.scene.add(mesh);}
      const target=new T.Vector3(e.x,e.y,e.z);
      if(mesh.position.distanceTo(target)>35)mesh.position.copy(target);else mesh.position.lerp(target,alpha);
      const yawDelta=Math.atan2(Math.sin(e.yaw-mesh.rotation.y),Math.cos(e.yaw-mesh.rotation.y));mesh.rotation.y+=yawDelta*alpha;mesh.rotation.z=e.roll;
      const jets=mesh.getObjectByName('jets');if(jets)jets.visible=e.kind!=='person'&&VEHICLES[e.kind].airThrusters&&e.y>.5&&(e.driver!==playerId||lift);
      if(e.kind!=='person'){const spec=VEHICLES[e.kind];for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const wheel=mesh.getObjectByName(name);if(wheel)wheel.rotation.y=e.steering*spec.steerAngle*(name.startsWith('wheel_r')?(spec.fourWheelSteering?-.55*Math.max(0,1-Math.abs(e.speed)/25):0):1);}}
    }
    for(const pickup of world.pickups){
      let mesh=this.pickups.get(pickup.id);
      if(!mesh){mesh=new T.Mesh(new T.OctahedronGeometry(1,0),new T.MeshStandardMaterial({color:pickup.kind==='repair'?0x9ce5aa:0xffd577,emissive:pickup.kind==='repair'?0x3a6b45:0x735024}));mesh.position.set(pickup.x,1.7,pickup.z);this.pickups.set(pickup.id,mesh);this.scene.add(mesh);}
      mesh.visible=pickup.active;mesh.rotation.y+=dt;mesh.position.y=1.7+Math.sin(performance.now()*.002)*.3;
    }
    const player=world.players.find(p=>p.id===playerId);
    const e=world.entities.find(e=>e.id===player?.entityId);
    if(menu){
      const t=performance.now()*.000035;this.follow.set(105+Math.sin(t)*25,100,155);this.focus.set(0,7,-40);
    }else if(e){
      const distance=this.wideCamera?30:15;
      const lookAhead=this.camera.aspect<.8?-6:5;
      this.follow.set(e.x+Math.sin(e.yaw)*distance,e.y+(this.wideCamera?23:8),e.z+Math.cos(e.yaw)*distance);
      this.focus.lerp(new T.Vector3(e.x-Math.sin(e.yaw)*lookAhead,e.y+1.3,e.z-Math.cos(e.yaw)*lookAhead),1-Math.exp(-8*dt));
    }
    if(!this.cameraReady){this.camera.position.copy(this.follow);this.cameraReady=true;}
    this.camera.position.lerp(this.follow,1-Math.exp(-5*dt));this.camera.lookAt(this.focus);for(const label of this.labels)label.visible=label.position.distanceTo(this.camera.position)>35;this.renderer.render(this.scene,this.camera);
  }
  start(frame:(dt:number)=>void){let last=performance.now();this.renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;frame(dt);});}
}
