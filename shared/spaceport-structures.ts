import type { StructureBox } from './bridge-structures';

type Envelope={w:number;h:number;d:number};
/** Static masses only. The growing/launching rocket is a separate scene object. */
export function spaceportStructureBoxes(kind:'factory'|'pad'|'tower',size:Envelope):StructureBox[]{
 const parts:StructureBox[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>parts.push({x,y,z,w,h,d,color});
 if(kind==='pad'){
  // An above-ground flame channel: the floor remains the shared ground at
  // y=0 and its walls, open bridge and stepped deflector are physical.
  for(const side of [-1,1]){
   box(side*12,2,0,10,4,34,0x777e7b);
   box(side*8,2,42,2,4,50,0x777e7b);
   box(side*5.25,3.5,0,3.5,1,8,0x777e7b);
  }
  box(0,2,-13,14,4,8,0x777e7b);
  for(const [z,h] of [[5,3],[9,2],[13,1]])box(0,h/2,z,14,h,4,0x777e7b);
 }else box(0,size.h/2,0,size.w,size.h,size.d,kind==='factory'?0xd6dad9:0x687178);
 if(kind==='factory')for(let x=-60;x<=60;x+=12)box(x,size.h+.2,0,8,.4,size.d-10,0x30515b);
 if(kind==='tower'){
  for(const z of [-5,5])box(-15,93,z,26,2,2,0x454f54);
  box(-1,127,0,14,4,14,0x454f54);
 }
 return parts;
}
