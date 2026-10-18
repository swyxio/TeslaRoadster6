import * as T from 'three';
import { DOME, DOME_CHARGE_HEIGHT } from '../shared/dome';
import { DOME_PERIMETER, domeSurface } from '../shared/map';

/** Original, non-colliding stadium dressing around the shared capsule. */
export function addDomeStadium(group:T.Group):void {
  const {halfLength:L,flatHalfWidth:W,radius:R,goalHalfWidth:G,goalHeight:H}=DOME;
  const matrix=new T.Matrix4(),identity=new T.Quaternion(),one=new T.Vector3(1,1,1);
  const boxes:{x:number;y:number;z:number;w:number;h:number;d:number;color:number}[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>boxes.push({x,y,z,w,h,d,color});
  // Tiered stands sit outside the shell, below the wall-riding chase camera.
  for(const side of [-1,1])for(let tier=0;tier<4;tier++){
    box(0,3+tier*4,side*(49+tier*3),2*L+8,4,3.1,tier%2?0x263b58:0x1b2d47);
    box(0,5.05+tier*4,side*(47.4+tier*3),2*L+8,.22,.2,0x54748b);
  }
  for(const side of [-1,1]){
    const accent=side>0?0x28bce9:0xff8e43,dark=side>0?0x123c5c:0x523125;
    box(side*(L+2.3),H/2,-(G+4),3,H,8,dark);box(side*(L+2.3),H/2,G+4,3,H,8,dark);
    box(side*(L+2.3),H+5,0,3,9,2*G+16,dark);
    box(side*(L+1.9),H+9.7,0,.3,.35,2*G+16,accent);box(side*(L+1.9),H+1,0,.3,.3,2*G+16,accent);
    for(const z of [-G-8,G+8])box(side*(L+1.9),H/2,z,.3,H,.4,accent);
  }
  const architecture=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xffffff}),boxes.length);
  boxes.forEach((b,i)=>{matrix.compose(new T.Vector3(b.x,b.y,b.z),identity,new T.Vector3(b.w,b.h,b.d));architecture.setMatrixAt(i,matrix);architecture.setColorAt(i,new T.Color(b.color));});
  architecture.name='dome-stadium-stands';architecture.computeBoundingSphere();group.add(architecture);

  // Static, deterministic audience lights are batched into one draw call.
  const crowd=new T.InstancedMesh(new T.BoxGeometry(.8,.48,.12),new T.MeshBasicMaterial({color:0xffffff}),2*4*2*52);
  let n=0;
  for(const side of [-1,1])for(let tier=0;tier<4;tier++)for(let row=0;row<2;row++)for(let i=0;i<52;i++){
    const x=-71+i*2.75+((i*13+tier*7+row*3)%5)*.13;
    const y=2+tier*4+row*1.35+((i*7+tier*3)%4)*.13;
    matrix.compose(new T.Vector3(x,y,side*(47.3+tier*3)),identity,one);crowd.setMatrixAt(n,matrix);
    const bright=(i*17+tier*11+row*5+(side+1)*9)%7;
    crowd.setColorAt(n,new T.Color(bright===0?0xffe7b1:x<0?(bright<4?0xff9b57:0xb65f4b):(bright<4?0x65ddff:0x498eb3)));n++;
  }
  crowd.name='dome-crowd-lights';crowd.computeBoundingSphere();group.add(crowd);

  // Paint follows the physical wall; gold arrows mark the recharge boundary.
  const panel:number[]=[],colors:number[]=[],charge:number[]=[];
  const angle=(height:number)=>Math.acos(1-height/R);
  const arc=(side:number,height:number)=>side>0?2*W+R*angle(height):DOME_PERIMETER-R*angle(height);
  const point=(x:number,s:number,lift=.12):[number,number,number]=>{
    const p=domeSurface(s);return [x,p.y+p.normalY*lift,p.z-DOME.z+p.normalZ*lift];
  };
  const triangle=(target:number[],a:number[],b:number[],c:number[])=>target.push(...a,...b,...c);
  const quad=(target:number[],a:number[],b:number[],c:number[],d:number[])=>{triangle(target,a,b,c);triangle(target,a,c,d);};
  for(const side of [-1,1])for(let section=0;section<10;section++)for(let level=0;level<8;level++){
    const x0=-L+section*2*L/10,x1=-L+(section+1)*2*L/10;
    quad(panel,point(x0,arc(side,level*3.5)),point(x1,arc(side,level*3.5)),point(x1,arc(side,(level+1)*3.5)),point(x0,arc(side,(level+1)*3.5)));
    const tint=new T.Color(section<5?(level%2?0xb76842:0xd07e4d):(level%2?0x3c8eb7:0x56b0cd));
    for(let i=0;i<6;i++)colors.push(tint.r,tint.g,tint.b);
  }
  const panels=new T.BufferGeometry();panels.setAttribute('position',new T.Float32BufferAttribute(panel,3));panels.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const wall=new T.Mesh(panels,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.28,depthWrite:false,side:T.DoubleSide}));
  wall.name='dome-wall-panels';group.add(wall);
  for(const side of [-1,1]){
    quad(charge,point(-L+.5,arc(side,DOME_CHARGE_HEIGHT),.24),point(L-.5,arc(side,DOME_CHARGE_HEIGHT),.24),point(L-.5,arc(side,DOME_CHARGE_HEIGHT+.6),.24),point(-L+.5,arc(side,DOME_CHARGE_HEIGHT+.6),.24));
    for(let x=-63;x<=63;x+=14){const base=arc(side,10),tip=arc(side,15);triangle(charge,point(x-2.3,base,.27),point(x+2.3,base,.27),point(x,tip,.27));}
  }
  const chargeGeometry=new T.BufferGeometry();chargeGeometry.setAttribute('position',new T.Float32BufferAttribute(charge,3));
  const chargeMarks=new T.Mesh(chargeGeometry,new T.MeshBasicMaterial({color:0xffd46b,side:T.DoubleSide}));chargeMarks.name='dome-charge-marks';group.add(chargeMarks);

  // Curved structural ribs and roof floodlights share one instanced mesh.
  const beams:{a:T.Vector3;b:T.Vector3;color:number;width:number}[]=[];
  const beam=(a:T.Vector3,b:T.Vector3,color:number,width=.26)=>beams.push({a,b,color,width});
  for(const x of [-L+1,-L/2,0,L/2,L-1]){
    const color=x<0?0xffa25a:x>0?0x68d9fa:0xd7f5ed;
    for(const side of [-1,1])for(let i=0;i<16;i++){
      const p=(t:number)=>new T.Vector3(x,R-(R+.35)*Math.cos(t),side*(W+(R+.35)*Math.sin(t)));
      beam(p(i*Math.PI/16),p((i+1)*Math.PI/16),color,.18);
    }
    beam(new T.Vector3(x,2*R+.35,-W),new T.Vector3(x,2*R+.35,W),color,.18);
  }
  for(const z of [-13,13])for(let x=-55;x<=55;x+=22)beam(new T.Vector3(x-6,2*R-.25,z),new T.Vector3(x+6,2*R-.25,z),0xfff4d0,.4);
  const beamMesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,6),new T.MeshBasicMaterial({color:0xffffff}),beams.length);
  beams.forEach(({a,b,color,width},i)=>{
    const delta=b.clone().sub(a),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());
    matrix.compose(a.clone().add(b).multiplyScalar(.5),rotation,new T.Vector3(width,delta.length(),width));beamMesh.setMatrixAt(i,matrix);beamMesh.setColorAt(i,new T.Color(color));
  });
  beamMesh.name='dome-roof-trusses';beamMesh.computeBoundingSphere();group.add(beamMesh);

  // Locally generated signage requires no remote artwork or texture files.
  if(typeof document!=='undefined')for(const side of [-1,1]){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const context=canvas.getContext('2d');if(!context)continue;
    context.fillStyle=side>0?'#123c5c':'#523125';context.fillRect(0,0,1024,256);
    context.textAlign='center';context.fillStyle='#f7f6e7';context.font='bold 100px sans-serif';context.fillText('ROCKET DOME',512,125);
    context.fillStyle=side>0?'#68dcff':'#ffad70';context.font='bold 42px sans-serif';context.fillText(side>0?'BLUE GOAL':'ORANGE GOAL',512,198);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const sign=new T.Mesh(new T.PlaneGeometry(31,7.75),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));
    sign.rotation.y=side>0?-Math.PI/2:Math.PI/2;sign.position.set(side*(L+.65),H+5,0);group.add(sign);
  }
}
