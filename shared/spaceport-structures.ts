import type { StructureBox } from './bridge-structures';

type Envelope={w:number;h:number;d:number};
/** Static masses only. The growing/launching rocket is a separate scene object. */
export function spaceportStructureBoxes(kind:'factory'|'pad'|'tower',size:Envelope):StructureBox[]{
 const parts:StructureBox[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>parts.push({x,y,z,w,h,d,color});
 box(0,size.h/2,0,size.w,size.h,size.d,kind==='factory'?0xd6dad9:kind==='pad'?0x777e7b:0x687178);
 if(kind==='factory')for(let x=-60;x<=60;x+=12)box(x,size.h+.2,0,8,.4,size.d-10,0x30515b);
 if(kind==='pad')box(0,size.h+.05,0,25,.1,25,0x38454a);
 if(kind==='tower'){
  for(const z of [-5,5])box(-15,93,z,26,2,2,0x454f54);
  box(-1,127,0,14,4,14,0x454f54);
 }
 return parts;
}
