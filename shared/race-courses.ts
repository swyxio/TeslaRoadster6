import type { RaceCourse, RaceGate } from './race';

export const SHORT_TRACK=[{x:-40,z:-1330},{x:300,z:-1330},{x:300,z:-1530},{x:-40,z:-1530}];
const gate=(id:string,x:number,z:number,yaw:number,width=50):RaceGate=>({id,x,z,yaw,width,minY:-1,maxY:25});
// The long course follows the shared painted island loop in increasing angle.
const ovalGate=(i:number,a:number):RaceGate=>{
  const dx=-510*Math.sin(a),dz=350*Math.cos(a);
  return gate(`oval-${i}`,200+510*Math.cos(a),-1650+350*Math.sin(a),Math.atan2(-dx,-dz),50);
};
export const RACE_COURSES:readonly (RaceCourse & {name:string;startYaw:number})[]=[
  {id:'short',name:'Island short circuit',start:{x:0,y:0,z:-1330,radius:25},startYaw:-Math.PI/2,gates:[
    gate('short-1',80,-1330,-Math.PI/2),gate('short-2',300,-1400,0),
    gate('short-3',200,-1530,Math.PI/2),gate('short-4',-40,-1450,Math.PI),gate('short-finish',20,-1330,-Math.PI/2),
  ]},
  {id:'oval',name:'Island speed oval',start:{x:240,y:0,z:-1301,radius:25},startYaw:Math.PI/2,gates:[
    ...Array.from({length:7},(_,i)=>ovalGate(i,Math.PI/2+(i+1)*Math.PI/4)),ovalGate(7,Math.PI/2+Math.PI*2),
  ]},
];
