import * as T from 'three';
import { DOME, DOME_CHARGE_HEIGHT } from '../shared/dome';
import { DOME_PERIMETER, domeSurface } from '../shared/map';

type Box = { x:number; y:number; z:number; w:number; h:number; d:number; color:number };

/** Original, decorative stadium architecture around the authoritative arena. */
export function addDomeStadium(group:T.Group):void {
  const {halfLength:L,flatHalfWidth:W,radius:R,gateHalfWidth:gate,gateHeight}=DOME;
  const boxes:Box[]=[],matrix=new T.Matrix4(),identity=new T.Quaternion(),one=new T.Vector3(1,1,1);
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>boxes.push({x,y,z,w,h,d,color});
  const brick=0xa05b42,brickShadow=0x804531,trim=0x362b2b,orange=0xf27f3e,cream=0xf6daa5;
  const outer=L+4,wingWidth=outer-gate,wingCenter=(outer+gate)/2;

  // A low waterfront-style brick grandstand wraps the shell. The north facade
  // and every seating tier have a continuous, vehicle-sized opening to the field.
  for(const side of [-1,1]){
    const sections=side<0?[{x:-wingCenter,w:wingWidth},{x:wingCenter,w:wingWidth}]:[{x:0,w:outer*2}];
    for(const part of sections){
      box(part.x,9.5,side*60.5,part.w,19,3,brick);
      box(part.x,1,side*62.2,part.w,2,1,brickShadow);
      box(part.x,16.6,side*62.2,part.w,.7,1,trim);
      box(part.x,19.1,side*60.5,part.w,.8,3.6,cream);
      for(let tier=0;tier<4;tier++){
        const z=side*(48+tier*3.1),y=2+tier*3.2;
        box(part.x,y,z,part.w,4,3.2,tier%2?0x3d3233:0x302d31);
        box(part.x,y+2.05,z-side*1.53,part.w,.22,.16,0xffae68);
      }
    }
  }
  // Monumental entrance; the arch is taller than any car and leaves the
  // shared 28 m gate clear all the way from the street to the pitch.
  for(const side of [-1,1]){
    box(side*(gate+1.2),gateHeight/2,-60.5,2.4,gateHeight,4,brickShadow);
    box(side*(gate+1.2),gateHeight+2,-60.5,2.8,4,4.2,cream);
    box(side*(gate+1.2),gateHeight+4.2,-60.5,3.2,.4,4.5,orange);
  }
  box(0,gateHeight+1.2,-60.5,gate*2,2.4,4,brickShadow);
  box(0,gateHeight+2.6,-60.5,gate*2,.5,4.5,cream);
  box(0,20.7,-62.4,48,9,.8,trim);
  box(0,25.4,-62.5,48.8,.6,1.2,orange);
  box(0,15.8,-62.5,48.8,.45,1.2,orange);

  // Goal-end masonry frames stand beyond the goal planes; the goals and nets
  // themselves remain unobstructed and follow the simulation geometry.
  for(const side of [-1,1]){
    for(const z of [-1,1])box(side*(L+2.4),8,z*(DOME.goalHalfWidth+5),4,16,10,brickShadow);
    box(side*(L+2.4),18,0,4,4,DOME.goalHalfWidth*2+20,trim);
    box(side*(L+2.4),20.2,0,4.4,.4,DOME.goalHalfWidth*2+20,orange);
  }

  // Plaza monuments are set outside the clear entrance road.
  for(const side of [-1,1]){
    box(side*27,1.25,-72,5.8,2.5,5.8,0x80776a);
    box(side*27,2.65,-72,6.2,.3,6.2,cream);
    box(side*27,.15,-72,7.1,.3,7.1,0x5f5750);
    // Floodlight pylons extend above the grandstands on all four corners.
    for(const end of [-1,1]){
      const x=end*(L-7),z=side*57;
      box(x,19,z,1.5,38,1.5,trim);
      box(x,37,z,13,1.2,1.8,trim);
      box(x,40,z,13,1.2,1.8,trim);
    }
  }
  const architecture=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0xffffff,roughness:.86}),boxes.length);
  boxes.forEach((b,i)=>{
    matrix.compose(new T.Vector3(b.x,b.y,b.z),identity,new T.Vector3(b.w,b.h,b.d));
    architecture.setMatrixAt(i,matrix);architecture.setColorAt(i,new T.Color(b.color));
  });
  architecture.name='dome-stadium-architecture';architecture.computeBoundingSphere();group.add(architecture);

  // The plaza is still ordinary shared ground, beneath the shared approach
  // road; it adds color without suggesting a separate elevated driving surface.
  const plaza=new T.Mesh(new T.PlaneGeometry(outer*2,22),new T.MeshStandardMaterial({color:0xb7a58b,roughness:1}));
  plaza.rotation.x=-Math.PI/2;plaza.position.set(0,.09,-74);plaza.name='dome-plaza';group.add(plaza);

  // Dark arched recesses on the public facade make the brick building read as
  // a ballpark from the street without putting props in the entrance corridor.
  const arch=new T.Shape();arch.moveTo(-2.1,0);arch.lineTo(-2.1,6.5);arch.absarc(0,6.5,2.1,Math.PI,0,true);arch.lineTo(2.1,0);arch.closePath();
  const arches=new T.InstancedMesh(new T.ShapeGeometry(arch),new T.MeshBasicMaterial({color:0x332b2c,side:T.DoubleSide}),12);
  let n=0;
  for(const side of [-1,1])for(let i=0;i<6;i++){
    matrix.compose(new T.Vector3(side*(21+i*10),3,-62.02),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),one);
    arches.setMatrixAt(n++,matrix);
  }
  arches.name='dome-facade-arches';arches.computeBoundingSphere();group.add(arches);

  // Many little spectators read as a full house but use a single draw call.
  const spectators:{x:number;y:number;z:number;color:number}[]=[];
  for(const side of [-1,1])for(let tier=0;tier<4;tier++)for(let row=0;row<2;row++)for(let i=0;i<56;i++){
    const x=-L+3+i*(2*L-6)/55;
    if(side<0&&Math.abs(x)<gate+2)continue;
    const seed=(i*17+tier*11+row*5+(side+1)*9)%9;
    const color=seed===0?0xffeac4:x<0?(seed<5?0xff9855:0xb95b40):(seed<5?0x72d5f0:0x4b90ae);
    spectators.push({x,y:1.4+tier*3.2+row*1.35+(seed%3)*.13,z:side*(46.38+tier*3.1),color});
  }
  const crowd=new T.InstancedMesh(new T.BoxGeometry(.8,.66,.2),new T.MeshBasicMaterial({color:0xffffff}),spectators.length);
  spectators.forEach((p,i)=>{matrix.compose(new T.Vector3(p.x,p.y,p.z),identity,one);crowd.setMatrixAt(i,matrix);crowd.setColorAt(i,new T.Color(p.color));});
  crowd.name='dome-crowd';crowd.computeBoundingSphere();group.add(crowd);

  const lamps=new T.InstancedMesh(new T.BoxGeometry(1.2,.75,.35),new T.MeshBasicMaterial({color:0xffedc3}),4*2*8);
  n=0;
  for(const side of [-1,1])for(const end of [-1,1])for(const y of [37,40])for(let i=0;i<8;i++){
    matrix.makeTranslation(end*(L-7)-5.25+i*1.5,y,side*55.95);lamps.setMatrixAt(n++,matrix);
  }
  lamps.name='dome-floodlights';lamps.computeBoundingSphere();group.add(lamps);

  // Curved ribs reinforce the physical transparent capsule. The center rib
  // begins above the gate so its struts never cross the driveway.
  const beams:{a:T.Vector3;b:T.Vector3;color:number;width:number}[]=[];
  const beam=(a:T.Vector3,b:T.Vector3,color:number,width=.6)=>beams.push({a,b,color,width});
  const gateAngle=Math.acos(1-gateHeight/R);
  for(const x of [-L+1,-L/2,0,L/2,L-1]){
    const color=x<0?0xf5914f:x>0?0x75ccdf:0xe9d6ab;
    for(const side of [-1,1])for(let i=0;i<20;i++){
      const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
      if(side<0&&Math.abs(x)<gate&&b<=gateAngle)continue;
      const from=side<0&&Math.abs(x)<gate?Math.max(a,gateAngle):a;
      const p=(t:number)=>new T.Vector3(x,R-(R+.2)*Math.cos(t),side*(W+(R+.2)*Math.sin(t)));
      beam(p(from),p(b),color);
    }
    beam(new T.Vector3(x,2*R+.2,-W),new T.Vector3(x,2*R+.2,W),color);
  }
  const beamMesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,6),new T.MeshBasicMaterial({color:0xffffff}),beams.length);
  beams.forEach(({a,b,color,width},i)=>{
    const delta=b.clone().sub(a),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());
    matrix.compose(a.clone().add(b).multiplyScalar(.5),rotation,new T.Vector3(width,delta.length(),width));beamMesh.setMatrixAt(i,matrix);beamMesh.setColorAt(i,new T.Color(color));
  });
  beamMesh.name='dome-roof-trusses';beamMesh.computeBoundingSphere();group.add(beamMesh);

  // Gold paint follows the actual curved wall at the shared recharge height.
  const marks:number[]=[];
  const arc=(side:number,height:number)=>{
    const angle=Math.acos(1-height/R);
    return side>0?2*W+R*angle:DOME_PERIMETER-R*angle;
  };
  const point=(x:number,s:number):number[]=>{
    const p=domeSurface(s);return [x,p.y+p.normalY*.25,p.z-DOME.z+p.normalZ*.25];
  };
  const triangle=(a:number[],b:number[],c:number[])=>marks.push(...a,...b,...c);
  for(const side of [-1,1]){
    const low=arc(side,DOME_CHARGE_HEIGHT),high=arc(side,DOME_CHARGE_HEIGHT+.6);
    const a=point(-L+.5,low),b=point(L-.5,low),c=point(L-.5,high),d=point(-L+.5,high);
    triangle(a,b,c);triangle(a,c,d);
    for(let x=-63;x<=63;x+=14)triangle(point(x-2.3,arc(side,10)),point(x+2.3,arc(side,10)),point(x,arc(side,15)));
  }
  const chargeGeometry=new T.BufferGeometry();chargeGeometry.setAttribute('position',new T.Float32BufferAttribute(marks,3));
  const chargeMarks=new T.Mesh(chargeGeometry,new T.MeshBasicMaterial({color:0xffd46b,side:T.DoubleSide}));
  chargeMarks.name='dome-charge-marks';group.add(chargeMarks);

  addStatues(group);
  addSigns(group);
}

/** Two fictional bronze ballplayers, each sharing materials and basic shapes. */
function addStatues(group:T.Group):void {
  const bronze=new T.MeshStandardMaterial({color:0x9b673f,metalness:.65,roughness:.48});
  const head=new T.SphereGeometry(.85,10,8),body=new T.BoxGeometry(1.9,2.5,1),cap=new T.BoxGeometry(1.7,.25,1.4);
  const limb=new T.CylinderGeometry(.29,.34,1,7),bat=new T.CylinderGeometry(.14,.23,1,7);
  const addLimb=(root:T.Group,a:T.Vector3,b:T.Vector3,geometry:T.CylinderGeometry)=>{
    const delta=b.clone().sub(a),mesh=new T.Mesh(geometry,bronze);
    mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());mesh.scale.y=delta.length();root.add(mesh);
  };
  for(const side of [-1,1]){
    const statue=new T.Group();statue.position.set(side*27,2.8,-72);
    const torso=new T.Mesh(body,bronze);torso.position.y=3.25;torso.rotation.z=side*.12;statue.add(torso);
    const face=new T.Mesh(head,bronze);face.position.y=5.25;statue.add(face);
    const brim=new T.Mesh(cap,bronze);brim.position.set(0,5.93,-.25);statue.add(brim);
    addLimb(statue,new T.Vector3(-.48,2.1,0),new T.Vector3(-.9,.15,-.3),limb);
    addLimb(statue,new T.Vector3(.48,2.1,0),new T.Vector3(.95,.15,.3),limb);
    if(side<0){
      // Batter holding a raised bat.
      addLimb(statue,new T.Vector3(-.85,4,0),new T.Vector3(.1,4.4,-.7),limb);
      addLimb(statue,new T.Vector3(.85,4,0),new T.Vector3(.1,4.4,-.7),limb);
      addLimb(statue,new T.Vector3(-.35,3.8,-.7),new T.Vector3(1.7,7,-.7),bat);
    }else{
      // Thrower in a wide, celebratory wind-up.
      addLimb(statue,new T.Vector3(-.85,4,0),new T.Vector3(-2,3.45,-.4),limb);
      addLimb(statue,new T.Vector3(.85,4,0),new T.Vector3(1.9,5.8,-.3),limb);
      const ball=new T.Mesh(new T.SphereGeometry(.34,8,6),bronze);ball.position.set(1.9,6.1,-.3);statue.add(ball);
    }
    statue.name='dome-bronze-ballplayer';group.add(statue);
  }
}

function addSigns(group:T.Group):void {
  if(typeof document==='undefined')return;
  const sign=(title:string,subtitle:string,accent:string)=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const context=canvas.getContext('2d');if(!context)return null;
    context.fillStyle='#292628';context.fillRect(0,0,1024,256);
    context.fillStyle=accent;context.fillRect(22,18,980,10);context.fillRect(22,228,980,10);
    context.textAlign='center';context.fillStyle='#fff1d3';context.font='bold 104px system-ui';context.fillText(title,512,130,960);
    context.fillStyle=accent;context.font='bold 40px system-ui';context.fillText(subtitle,512,197,960);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    return new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});
  };
  const entrance=sign('ROCKET DOME','CHINA BASIN  ·  DRIVE IN','#ff914f');
  if(entrance){
    const board=new T.Mesh(new T.PlaneGeometry(46,8),entrance);board.rotation.y=Math.PI;board.position.set(0,20.7,-62.85);board.name='dome-entrance-sign';group.add(board);
  }
  for(const side of [-1,1]){
    const material=sign('ROCKET DOME',side<0?'ORANGE GOAL':'BLUE GOAL',side<0?'#ffaf70':'#82deff');
    if(!material)continue;
    const board=new T.Mesh(new T.PlaneGeometry(27,6.75),material);
    board.rotation.y=side<0?Math.PI/2:-Math.PI/2;board.position.set(side*(DOME.halfLength+.35),18,0);board.name='dome-goal-sign';group.add(board);
  }
}
