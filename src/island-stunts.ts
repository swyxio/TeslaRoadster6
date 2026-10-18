import * as T from 'three';
import { ISLAND_BANK, ISLAND_CLIFF, bankVertex, cliffVertex } from '../shared/island-stunts';
import { OVAL_BANK, ovalBankVertex } from '../shared/oval-bank';

/** The track and shoulders use the same triangles as the physical surface. */
function addOvalBank(scene:T.Scene):void {
  const {segments,rows,halfWidth,laneHalfWidth}=OVAL_BANK;
  const laneStart=Math.round((halfWidth-laneHalfWidth)*rows/(2*halfWidth));
  const laneEnd=rows-laneStart;
  const positions:number[]=[],laneIndices:number[]=[],shoulderIndices:number[]=[];
  for(let segment=0;segment<=segments;segment++)for(let row=0;row<=rows;row++){
    const p=ovalBankVertex(segment,row);positions.push(p.x,p.y,p.z);
  }
  for(let segment=0;segment<segments;segment++)for(let row=0;row<rows;row++){
    const a=segment*(rows+1)+row,b=a+1,c=a+rows+1,d=c+1;
    (row>=laneStart&&row<laneEnd?laneIndices:shoulderIndices).push(a,c,b,b,c,d);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setIndex([...shoulderIndices,...laneIndices]);
  geometry.addGroup(0,shoulderIndices.length,0);geometry.addGroup(shoulderIndices.length,laneIndices.length,1);
  geometry.computeVertexNormals();
  const track=new T.Mesh(geometry,[
    new T.MeshStandardMaterial({color:0x89917d,roughness:1,side:T.DoubleSide}),
    new T.MeshStandardMaterial({color:0x505e60,roughness:.9,side:T.DoubleSide}),
  ]);
  // Keep the oval above terrain but below intersecting flat roads (top y=.125).
  track.position.y=.1;track.name='island-oval-bank';scene.add(track);

  const marks:number[]=[],markIndices:number[]=[];
  const point=(segment:number,row:number)=>{
    const lower=Math.floor(row),t=row-lower,a=ovalBankVertex(segment,lower),b=ovalBankVertex(segment,lower+1);
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t+.13,z:a.z+(b.z-a.z)*t};
  };
  const stripe=(segment:number,row:number)=>{
    const halfRow=.05,a=point(segment,row-halfRow),b=point(segment,row+halfRow);
    const c=point(segment+1,row-halfRow),d=point(segment+1,row+halfRow),index=marks.length/3;
    for(const p of [a,b,c,d])marks.push(p.x,p.y,p.z);
    markIndices.push(index,index+2,index+1,index+1,index+2,index+3);
  };
  for(let segment=0;segment<segments;segment++){
    stripe(segment,laneStart);stripe(segment,laneEnd);
    if(segment%2===0)stripe(segment,rows/2);
  }
  const markings=new T.BufferGeometry();markings.setAttribute('position',new T.Float32BufferAttribute(marks,3));markings.setIndex(markIndices);
  const paint=new T.Mesh(markings,new T.MeshBasicMaterial({color:0xe9d6a1,side:T.DoubleSide,depthWrite:false}));
  paint.name='island-oval-markings';scene.add(paint);
}

/** Render the exact lattice and arc segments used by shared surface queries. */
export function addIslandStunts(scene:T.Scene):void {
  addOvalBank(scene);
  const bankPositions:number[]=[],bankIndices:number[]=[];
  for(let row=0;row<=ISLAND_BANK.rows;row++)for(let column=0;column<=ISLAND_BANK.columns;column++){
    const p=bankVertex(column,row);bankPositions.push(p.x,p.y,p.z);
  }
  for(let row=0;row<ISLAND_BANK.rows;row++)for(let column=0;column<ISLAND_BANK.columns;column++){
    const a=row*(ISLAND_BANK.columns+1)+column,b=a+1,c=a+ISLAND_BANK.columns+1,d=c+1;
    bankIndices.push(a,c,b,b,c,d);
  }
  const bankGeometry=new T.BufferGeometry();bankGeometry.setAttribute('position',new T.Float32BufferAttribute(bankPositions,3));bankGeometry.setIndex(bankIndices);bankGeometry.computeVertexNormals();
  const bank=new T.Mesh(bankGeometry,new T.MeshStandardMaterial({color:0x526971,roughness:.85,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));bank.name='island-bank';scene.add(bank);
  for(const row of [8,22]){
    const points=Array.from({length:ISLAND_BANK.columns+1},(_,i)=>{const p=bankVertex(i,row);return new T.Vector3(p.x,p.y+.03,p.z);});
    scene.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xffe7a0})));
  }

  const cliffPositions:number[]=[],cliffIndices:number[]=[];
  for(let i=0;i<=ISLAND_CLIFF.segments;i++){
    const p=cliffVertex(i);
    cliffPositions.push(p.x,p.y,p.z-ISLAND_CLIFF.width/2,p.x,p.y,p.z+ISLAND_CLIFF.width/2);
    if(i<ISLAND_CLIFF.segments){const a=i*2;cliffIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const cliffGeometry=new T.BufferGeometry();cliffGeometry.setAttribute('position',new T.Float32BufferAttribute(cliffPositions,3));cliffGeometry.setIndex(cliffIndices);cliffGeometry.computeVertexNormals();
  const cliff=new T.Mesh(cliffGeometry,new T.MeshStandardMaterial({color:0xdf955c,roughness:.7,side:T.DoubleSide}));cliff.name='island-cliff';scene.add(cliff);
  for(const side of [-1,1]){
    const points=Array.from({length:ISLAND_CLIFF.segments+1},(_,i)=>{const p=cliffVertex(i);return new T.Vector3(p.x,p.y,p.z+side*ISLAND_CLIFF.width/2);});
    scene.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xffe7a0})));
  }
}
