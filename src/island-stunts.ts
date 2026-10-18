import * as T from 'three';
import { ISLAND_BANK, ISLAND_CLIFF, bankVertex, cliffVertex } from '../shared/island-stunts';

/** Render the exact lattice and arc segments used by shared surface queries. */
export function addIslandStunts(scene:T.Scene):void {
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
