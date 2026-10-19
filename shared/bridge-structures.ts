import type { Bridge } from './map';
export type StructureBox={x:number;y:number;z:number;w:number;h:number;d:number;color:number};
/** Tower legs and crossbeams only; cables and lane paint remain decoration. */
export function bridgeTowerBoxes(b:Bridge):StructureBox[]{
 const result:StructureBox[]=[],color=b.id==='golden-gate'?0xc2563d:0x99a7a5;
 const add=(along:number,y:number,across:number,length:number,h:number,width:number)=>result.push(b.axis==='x'
  ?{x:along,y,z:b.center+across,w:length,h,d:width,color}
  :{x:b.center+across,y,z:along,w:width,h,d:length,color});
 for(const t of b.id==='golden-gate'?[-385,-300]:[105,155,245]){
  const h=b.id==='golden-gate'?72:t===245?56:50;
  for(const side of [-1,1])add(t,h/2,side*(b.width/2-1),3,h,3);
  for(const y of [14,h*.57,h-3])add(t,y,0,3,2,b.width);
 }
 return result;
}
