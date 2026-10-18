import type { RoadSegment } from './map';
import type { Point } from './traffic';

// Fictional local streets reach preserved landmark arrivals in the compressed Bay.
const layouts = [
  { left:-970, right:-850, top:3967, bottom:4027 }, // Stanford
  { left:1710, right:1910, top:6038, bottom:6278 }, // Mission San José
  { left:1702, right:1762, top:8715, bottom:8775 }, // San José City Hall
];

// A wide connector keeps the forecourt clear and gives traffic room to turn.
const stanfordConnection:RoadSegment = {x:-795,z:3969,w:148,d:40,axis:'x'};
export const LANDMARK_ACCESS_ROADS:RoadSegment[] = [...layouts.flatMap(({left:L,right:R,top:T,bottom:B})=>[
  {x:(L+R)/2,z:T,w:R-L+18,d:18,axis:'x' as const},
  {x:(L+R)/2,z:B,w:R-L+18,d:18,axis:'x' as const},
  {x:L,z:(T+B)/2,w:18,d:B-T+18,axis:'z' as const},
  {x:R,z:(T+B)/2,w:18,d:B-T+18,axis:'z' as const},
]),stanfordConnection];
export const LANDMARK_ACCESS_ROUTES:Point[][] = [...layouts.flatMap(({left:L,right:R,top:T,bottom:B})=>[
  [{x:L+3,z:T+3},{x:R-3,z:T+3},{x:R-3,z:B-3},{x:L+3,z:B-3}],
  [{x:L-3,z:T-3},{x:L-3,z:B+3},{x:R+3,z:B+3},{x:R+3,z:T-3}],
]),
 [{x:-857,z:3959},{x:-733,z:3959},{x:-733,z:3979},{x:-857,z:3979}]];
