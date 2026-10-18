import type { RoadSegment } from './map';
import type { Point } from './traffic';

/** Fictional local streets in the game's compressed Bay, not surveyed roads. */
export const TOWN_DELIVERY_LAYOUTS = [
  {id:'south-san-francisco',left:-485,right:-265,top:625,bottom:875},
  {id:'san-mateo',left:-1285,right:-1065,top:1525,bottom:1775},
  {id:'redwood-city',left:-1240,right:-1080,top:2100,bottom:2300},
  {id:'menlo-park',left:-905,right:-745,top:3650,bottom:3900},
  {id:'palo-alto',left:-860,right:-640,top:4175,bottom:4425},
  {id:'mountain-view',left:-35,right:145,top:6225,bottom:6475},
  {id:'santa-clara',left:-60,right:160,top:6425,bottom:6675},
  {id:'cupertino',left:235,right:455,top:7175,bottom:7425},
  {id:'san-jose',left:1925,right:2085,top:8375,bottom:8575},
  {id:'hayward',left:895,right:1115,top:1725,bottom:1975},
  {id:'fremont',left:1385,right:1605,top:5550,bottom:5800},
] as const;

/** Rendering and navigation use the same supported pavement. */
export const TOWN_DELIVERY_ROADS:RoadSegment[]=TOWN_DELIVERY_LAYOUTS.flatMap(({left:L,right:R,top:T,bottom:B})=>[
  {x:(L+R)/2,z:T,w:R-L+18,d:18,axis:'x' as const},
  {x:(L+R)/2,z:B,w:R-L+18,d:18,axis:'x' as const},
  {x:L,z:(T+B)/2,w:18,d:B-T+18,axis:'z' as const},
  {x:R,z:(T+B)/2,w:18,d:B-T+18,axis:'z' as const},
]);
export const TOWN_DELIVERY_ROUTES:Point[][]=TOWN_DELIVERY_LAYOUTS.flatMap(({left:L,right:R,top:T,bottom:B})=>[
  [{x:L+3,z:T+3},{x:R-3,z:T+3},{x:R-3,z:B-3},{x:L+3,z:B-3}],
  [{x:L-3,z:T-3},{x:L-3,z:B+3},{x:R+3,z:B+3},{x:R+3,z:T-3}],
]);
