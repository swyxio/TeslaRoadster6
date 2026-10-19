import { DOME } from './dome';
import type { StructureBox } from './bridge-structures';

/** Architecture is outside the driveable capsule and preserves its entrance. */
function buildStadiumBoxes():readonly StructureBox[]{
 const {halfLength:L,flatHalfWidth:W,radius:R,gateHalfWidth:gate,gateHeight}=DOME;
 const boxes:StructureBox[]=[];
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
 return Object.freeze(boxes);
}
export const DOME_STRUCTURE_BOXES=buildStadiumBoxes();
