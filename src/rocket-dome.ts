import * as T from 'three';
import { DOME } from '../shared/dome';

export type DomeBallPose = { x:number; y:number; z:number };

/** The arena and ball use world coordinates from the authoritative simulation. */
export function createRocketDome(): {group:T.Group; update:(ball:DomeBallPose)=>void} {
  const group=new T.Group();
  group.name='rocket-dome';
  group.position.set(DOME.x,0,DOME.z);
  const {halfLength:L,flatHalfWidth:W,radius:R,goalHalfWidth:G,goalHeight:H}=DOME;

  // The flat playing surface occupies the level portion of the shared capsule.
  // Alternating panels share one draw call and never extend up the curved walls.
  const turf=new T.InstancedMesh(new T.PlaneGeometry(2*L/10,2*W),new T.MeshStandardMaterial({color:0xffffff,roughness:1}),10);
  const matrix=new T.Matrix4(),rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);
  for(let i=0;i<10;i++){
    matrix.compose(new T.Vector3(-L+(i+.5)*2*L/10,.035,0),rotation,new T.Vector3(1,1,1));
    turf.setMatrixAt(i,matrix);turf.setColorAt(i,new T.Color(i%2?0x427e6b:0x4b8a71));
  }
  turf.name='dome-pitch';turf.computeBoundingSphere();group.add(turf);

  // Continuous painted lines are triangles instead of one-pixel WebGL lines.
  const paint:number[]=[];
  function rectangle(x0:number,z0:number,x1:number,z1:number){
    const y=.065;paint.push(x0,y,z0,x1,y,z0,x1,y,z1,x0,y,z0,x1,y,z1,x0,y,z1);
  }
  function ring(cx:number,cz:number,r:number,width:number){
    const segments=48;
    for(let i=0;i<segments;i++){
      const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments,inner=r-width/2,outer=r+width/2;
      const x0=cx+Math.cos(a)*inner,z0=cz+Math.sin(a)*inner,x1=cx+Math.cos(a)*outer,z1=cz+Math.sin(a)*outer;
      const x2=cx+Math.cos(b)*inner,z2=cz+Math.sin(b)*inner,x3=cx+Math.cos(b)*outer,z3=cz+Math.sin(b)*outer,y=.065;
      paint.push(x0,y,z0,x1,y,z1,x3,y,z3,x0,y,z0,x3,y,z3,x2,y,z2);
    }
  }
  const line=.28,edge=W-2,goalLine=L-1;
  rectangle(-goalLine,-edge,goalLine,-edge+line);rectangle(-goalLine,edge-line,goalLine,edge);
  rectangle(-goalLine,-edge,-goalLine+line,edge);rectangle(goalLine-line,-edge,goalLine,edge);
  rectangle(-line/2,-edge,line/2,edge);ring(0,0,7,line);
  for(const side of [-1,1]){
    const start=side<0?-goalLine:goalLine-15,end=side<0?-goalLine+15:goalLine;
    rectangle(start,-G-3,end,-G-3+line);rectangle(start,G+3-line,end,G+3);
    const inner=side<0?end:start;rectangle(inner-line/2,-G-3,inner+line/2,G+3);
    ring(side*(L-22),0,.4,.25);
  }
  const paintGeometry=new T.BufferGeometry();paintGeometry.setAttribute('position',new T.Float32BufferAttribute(paint,3));
  const markings=new T.Mesh(paintGeometry,new T.MeshBasicMaterial({color:0xeaf5dd,side:T.DoubleSide}));markings.name='dome-markings';group.add(markings);

  // The pitch-end colors guide players toward the two goals.
  const endStrips=new T.InstancedMesh(new T.PlaneGeometry(1.5,2*W),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}),2);
  for(let i=0;i<2;i++){
    const side=i===0?-1:1;
    matrix.compose(new T.Vector3(side*(L-.85),.055,0),rotation,new T.Vector3(1,1,1));
    endStrips.setMatrixAt(i,matrix);endStrips.setColorAt(i,new T.Color(side>0?0x48c9ec:0xffa050));
  }
  endStrips.computeBoundingSphere();group.add(endStrips);

  // Both semicircular walls and the flat roof trace the same cross-section
  // as physics. The faint transparent shell stays readable from either side,
  // including when a chase camera briefly crosses the enclosed boundary.
  const shellPositions:number[]=[],shellIndices:number[]=[];
  function quad(a:number[],b:number[],c:number[],d:number[]){
    const n=shellPositions.length/3;shellPositions.push(...a,...b,...c,...d);shellIndices.push(n,n+1,n+2,n,n+2,n+3);
  }
  quad([-L,2*R,-W],[-L,2*R,W],[L,2*R,W],[L,2*R,-W]);
  const segments=24;
  for(const side of [-1,1])for(let i=0;i<segments;i++){
    const a=i*Math.PI/segments,b=(i+1)*Math.PI/segments;
    const p=(x:number,t:number)=>[x,R-R*Math.cos(t),side*(W+R*Math.sin(t))];
    quad(p(-L,a),p(L,a),p(L,b),p(-L,b));
  }
  const shellGeometry=new T.BufferGeometry();shellGeometry.setAttribute('position',new T.Float32BufferAttribute(shellPositions,3));shellGeometry.setIndex(shellIndices);shellGeometry.computeVertexNormals();
  const shellMaterial=new T.MeshBasicMaterial({color:0x9bd5dd,transparent:true,opacity:.095,depthWrite:false,side:T.DoubleSide});
  const shell=new T.Mesh(shellGeometry,shellMaterial);shell.name='dome-shell';group.add(shell);

  // Concave end caps leave true rectangular visual openings at floor level.
  const endShape=new T.Shape();endShape.moveTo(-W,0);endShape.lineTo(-G,0);endShape.lineTo(-G,H);endShape.lineTo(G,H);endShape.lineTo(G,0);endShape.lineTo(W,0);
  for(let i=1;i<=segments;i++){const t=i*Math.PI/segments;endShape.lineTo(W+R*Math.sin(t),R-R*Math.cos(t));}
  endShape.lineTo(-W,2*R);
  for(let i=segments-1;i>=0;i--){const t=i*Math.PI/segments;endShape.lineTo(-W-R*Math.sin(t),R-R*Math.cos(t));}
  endShape.closePath();
  const endGeometry=new T.ShapeGeometry(endShape);
  for(const side of [-1,1]){
    const end=new T.Mesh(endGeometry,shellMaterial);end.name=side<0?'dome-end-west':'dome-end-east';
    end.rotation.y=-Math.PI/2;end.position.x=side*L;group.add(end);
  }

  // A single line batch outlines the shell without covering play with props.
  const grid:number[]=[];
  function segment(ax:number,ay:number,az:number,bx:number,by:number,bz:number){grid.push(ax,ay,az,bx,by,bz);}
  const inset=.08,gridR=R-inset;
  for(let x=-L;x<=L+.001;x+=15){
    segment(x,2*R-inset,-W,x,2*R-inset,W);
    for(const side of [-1,1])for(let i=0;i<segments;i++){
      const a=i*Math.PI/segments,b=(i+1)*Math.PI/segments;
      segment(x,R-gridR*Math.cos(a),side*(W+gridR*Math.sin(a)),x,R-gridR*Math.cos(b),side*(W+gridR*Math.sin(b)));
    }
  }
  for(const z of [-W,-W/2,0,W/2,W])segment(-L,2*R-inset,z,L,2*R-inset,z);
  for(const side of [-1,1])for(let i=1;i<segments;i+=3){
    const a=i*Math.PI/segments,y=R-gridR*Math.cos(a),z=side*(W+gridR*Math.sin(a));segment(-L,y,z,L,y,z);
  }
  const gridGeometry=new T.BufferGeometry();gridGeometry.setAttribute('position',new T.Float32BufferAttribute(grid,3));
  const gridLines=new T.LineSegments(gridGeometry,new T.LineBasicMaterial({color:0xb5e9e5,transparent:true,opacity:.32,depthWrite:false}));gridLines.name='dome-grid';group.add(gridLines);

  // Colored frames sit at the physics goal planes; recessed nets are decorative.
  const frameGeometry=new T.BoxGeometry(1,1,1);
  for(const side of [-1,1]){
    const color=side>0?0x41d4f3:0xffa44f;
    const frame=new T.InstancedMesh(frameGeometry,new T.MeshBasicMaterial({color}),3);
    const put=(i:number,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
      matrix.makeScale(sx,sy,sz);matrix.setPosition(x,y,z);frame.setMatrixAt(i,matrix);
    };
    put(0,side*(L-.08),H/2,-G,.45,H,.45);put(1,side*(L-.08),H/2,G,.45,H,.45);put(2,side*(L-.08),H,-0,.45,.45,2*G+.45);
    frame.name=side>0?'dome-goal-blue':'dome-goal-orange';frame.computeBoundingSphere();group.add(frame);
    const net:number[]=[],back=side*(L+2.5),front=side*L;
    for(let i=0;i<=8;i++){
      const z=-G+i*2*G/8;net.push(front,H,z,back,H,z,back,H,z,back,0,z);
    }
    for(let i=0;i<=5;i++){
      const y=i*H/5;net.push(back,y,-G,back,y,G);
    }
    const netGeometry=new T.BufferGeometry();netGeometry.setAttribute('position',new T.Float32BufferAttribute(net,3));
    group.add(new T.LineSegments(netGeometry,new T.LineBasicMaterial({color,transparent:true,opacity:.65})));
  }

  // A faceted, high-contrast ball is a single mesh. Its pose is only ever
  // assigned from shared simulation state; rendering does not advance it.
  const ballGeometry=new T.IcosahedronGeometry(DOME.ballRadius,2);
  const vertices=ballGeometry.getAttribute('position'),anchorGeometry=new T.IcosahedronGeometry(1,0),anchors=anchorGeometry.getAttribute('position');
  const colors:number[]=[],center=new T.Vector3(),anchor=new T.Vector3();
  for(let i=0;i<vertices.count;i+=3){
    center.set(0,0,0);for(let j=0;j<3;j++)center.add(new T.Vector3().fromBufferAttribute(vertices,i+j));center.normalize();
    let nearest=-1;for(let j=0;j<anchors.count;j++){anchor.fromBufferAttribute(anchors,j).normalize();nearest=Math.max(nearest,center.dot(anchor));}
    const color=new T.Color(nearest>.93?0x203a45:0xf4f4df);for(let j=0;j<3;j++)colors.push(color.r,color.g,color.b);
  }
  anchorGeometry.dispose();ballGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));ballGeometry.computeVertexNormals();
  const ball=new T.Mesh(ballGeometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.7,flatShading:true}));ball.name='dome-ball';ball.position.y=DOME.ballRadius;group.add(ball);

  return {group,update(pose:DomeBallPose){ball.position.set(pose.x-DOME.x,pose.y,pose.z-DOME.z);}};
}
