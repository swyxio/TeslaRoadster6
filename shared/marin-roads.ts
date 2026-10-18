import type { RoadSegment } from './map';
import type { Point } from './traffic';

// Arcade-scale local streets on the existing flat Marin headlands. These do
// not connect to the separate North Bay Playground island.
const streets:readonly (readonly [number,number,number,number])[] = [
  [-395,-535,-125,-535], [-395,-535,-395,-415],
  [-395,-415,-355,-415], [-355,-415,-355,-395],
  [-355,-395,-265,-395], [-265,-395,-265,-535],
  [-265,-410,-210,-410], [-210,-410,-210,-535],
  [-125,-535,-125,-465], [-125,-465,-140,-465],
  [-140,-465,-140,-430], [-140,-430,-210,-430],
  [-395,-455,-375,-455], [-375,-455,-375,-415],
  [-265,-520,-210,-520],
  [-150,-535,-150,-515], [-150,-515,-125,-515],
  [-265,-395,-210,-395], [-210,-410,-210,-395],
];
export const MARIN_ROADS:RoadSegment[]=streets.map(([ax,az,bx,bz])=>{
  const dx=bx-ax,dz=bz-az;
  return {x:(ax+bx)/2,z:(az+bz)/2,w:dx?Math.abs(dx)+1:10,d:dz?Math.abs(dz)+1:10,axis:dx?'x':'z'};
});

// Directed lanes meet the SF grid and follow the existing Golden Gate deck.
// Each local loop allows safe turns without a point turnaround.
const routes:readonly (readonly (readonly [number,number])[])[] = [
  [[-237,-183],[-237,-407],[-207,-407],[-207,-532],[-128,-532],[-128,-468],
   [-143,-468],[-143,-433],[-213,-433],[-213,-413],[-243,-413],[-243,-183]],
  [[-237,-183],[-237,-407],[-207,-407],[-207,-538],[-268,-538],[-268,-413],
   [-243,-413],[-243,-183]],
  [[-392,-532],[-268,-532],[-268,-398],[-352,-398],[-352,-418],[-392,-418]],
  [[-207,-532],[-128,-532],[-128,-468],[-143,-468],[-143,-433],[-207,-433]],
  [[-265,-532],[-213,-532],[-213,-413],[-265,-413]],
  [[-392,-452],[-378,-452],[-378,-418],[-392,-418]],
  [[-262,-532],[-213,-532],[-213,-523],[-262,-523]],
  [[-147,-532],[-128,-532],[-128,-518],[-147,-518]],
  [[-262,-407],[-213,-407],[-213,-398],[-262,-398]],
];
export const MARIN_ROUTES:Point[][]=routes.map(route=>route.map(([x,z])=>({x,z})));

// Independent, collision-cleared arrival points for catalog owners. Their
// town labels and placements are game fiction, not real-world coordinates.
export const MARIN_ARRIVAL_POINTS = {
  'corte-madera': [
    {x:-360,z:-535},{x:-320,z:-535},{x:-300,z:-535},{x:-280,z:-535},{x:-270,z:-506},
    {x:-395,z:-500},{x:-395,z:-460},{x:-375,z:-455},{x:-395,z:-440},{x:-375,z:-435},
    {x:-395,z:-420},{x:-375,z:-415},{x:-355,z:-410},{x:-265,z:-410},{x:-345,z:-395},
    {x:-325,z:-395},{x:-300,z:-395},{x:-275,z:-395},{x:-270,z:-486},{x:-270,z:-466},
  ],
  'mill-valley': [
    {x:-195,z:-535},{x:-175,z:-535},{x:-155,z:-535},{x:-130,z:-535},{x:-210,z:-520},
    {x:-150,z:-515},{x:-130,z:-515},{x:-210,z:-500},{x:-125,z:-495},{x:-210,z:-475},
    {x:-125,z:-470},{x:-140,z:-460},{x:-210,z:-455},{x:-210,z:-435},{x:-180,z:-430},
    {x:-254,z:-540},{x:-210,z:-410},{x:-255,z:-395},{x:-234,z:-540},{x:-214,z:-540},
  ],
} as const;
