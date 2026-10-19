import type { Building } from './map';
import { eastSouthBuildingParts } from './east-south-structures';
import { southBuildingParts } from './south-building-structures';
import { NORTH_LANDMARKS } from './north-landmarks';
import { buildNorthLandmarkModel } from './north-landmark-models';
import { type StructuralPrimitive } from './new-landmark-surfaces';

// Cached once at map creation. Broad-phase envelopes are not solid walls.
const northProfiles=new Map<string,readonly StructuralPrimitive[]>();
for(const place of NORTH_LANDMARKS){
 const parts:StructuralPrimitive[]=[];
 const add=(shape:StructuralPrimitive['shape'])=>(x:number,y:number,z:number,w:number,h:number,d:number,_color:number,structural=true)=>{
  // Thin paint, rails and trim cannot stop a car. Main columns, roofs and decks can.
  if(structural&&w>=.3&&d>=.3&&h>=.25)parts.push({shape,x,y,z,w,h,d});
 };
 buildNorthLandmarkModel(place,{box:add('box'),cyl:add('cylinder'),roof:add('roof'),dome:add('dome'),arc:()=>{}});
 if(parts.length>16)throw new Error(`Unbounded legacy structure: ${place.id}`);
 northProfiles.set(`${place.x},${place.z}`,Object.freeze(parts));
}
export function existingBuildingParts(b:Building):readonly StructuralPrimitive[]|undefined {
 if(b.style==='landmark')return northProfiles.get(`${b.x},${b.z}`)??southBuildingParts(b.x,b.z)??eastSouthBuildingParts(b.x,b.z);
 const {w,d,h}=b,parts:StructuralPrimitive[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>parts.push({shape:'box',x,y,z,w,h,d});
 const roof=(x:number,y:number,z:number,w:number,h:number,d:number)=>parts.push({shape:'roof',x,y,z,w,h,d});
 const cylinder=(y:number,w:number,h:number,d:number,segments:number,topScale=1)=>parts.push({shape:'cylinder',x:0,y,z:0,w,h,d,segments,topScale});
 const dome=(y:number,w:number,h:number,d:number)=>parts.push({shape:'dome',x:0,y,z:0,w,h,d,segments:20,rings:10});
 switch(b.style){
  case 'house':
   box(0,h/2,0,w,h,d);box(0,h+.2,0,w+1,.4,d+1);
   parts.push({shape:'roof',x:0,y:h+1.3,z:0,w:w*1.44,h:2.6,d:d*1.44,roofDiamond:true,rotationY:Math.PI/4});break;
  case 'midrise':case 'tower':case 'ferry':
   box(0,h/2,0,w,h,d);box(0,h+.2,0,w+1,.4,d+1);break;
  case 'tribune':
   box(0,h/2,0,w,h,d);box(0,h+.2,0,w+1,.4,d+1);box(0,46,0,10,4,10);roof(0,53,0,16,10,16);break;
  case 'pyramid':roof(0,h/2,0,w*1.44,h,w*1.44);break;
  case 'salesforce':case 'coit':
   cylinder(h/2,w,h,w,b.style==='coit'?12:20,.92);dome(h,w*.92,w*.46*.38,w*.92);
   if(b.style==='coit')box(0,1,0,18,2,18);break;
  case 'rotunda':cylinder(7,20,14,20,20);dome(14,18,9,18);break;
  case 'campanile':case 'hoover':
   box(0,(h-10)/2,0,w*.8,h-10,d*.8);box(0,h-12,0,w*.94,2,d*.94);
   box(0,h-7.5,0,w*.72,5,d*.72);roof(0,h-2.5,0,w*1.1,5,w*1.1);break;
  case 'airport':
   box(0,5,0,w,10,d);cylinder(24.5,7,29,7,10,5/3.5);cylinder(42,12,6,12,10,8/6);box(0,45.5,0,12,1,12);break;
  case 'mission':
   box(0,5,0,w,10,d);parts.push({shape:'roof',x:0,y:11.5,z:0,w:w*1.4,h:3,d:d*1.4,roofDiamond:true,rotationY:Math.PI/4});
   for(const side of [-1,1]){box(side*8,12,0,4,16,4);box(side*8,19,0,5,2,5);}break;
  default:return undefined;
 }
 return Object.freeze(parts);
}
