/** Fictional game-space interpretations of real Caltrain stop identities.
 * Source: https://www.caltrain.com/stops. These are not survey coordinates,
 * a timetable, or a simulation of railway service. X is east and Z is south.
 */
export type CaltrainStop = {
  id:string; name:string; x:number; z:number; level:0|2|3|4|5|6;
  /** Four-bay playable lot and the nearby highway junction. */
  lot?:{x:number;z:number}; junction?:{x:number;z:number};
  /** The low, decorative platform sits beside the shared driving surface. */
  platform:{x:number;z:number}; existingLandmark?:boolean;
};
export const CALTRAIN_STOPS:readonly CaltrainStop[]=[
  {id:'san-francisco',name:'San Francisco · 4th & King',x:-205,z:260,level:0,platform:{x:-205,z:260}},
  {id:'south-san-francisco',name:'South San Francisco',x:-631,z:950,level:2,lot:{x:-631,z:950},junction:{x:-491,z:950},platform:{x:-631,z:995}},
  {id:'burlingame',name:'Burlingame',x:-1020.2884954558479,z:1485.6436268884124,level:3,lot:{x:-1020,z:1436},junction:{x:-1079,z:1436},platform:{x:-1020,z:1505},existingLandmark:true},
  {id:'redwood-city',name:'Redwood City',x:-987,z:2450,level:3,lot:{x:-987,z:2450},junction:{x:-1082,z:2450},platform:{x:-987,z:2495}},
  {id:'palo-alto',name:'Palo Alto',x:-566,z:3960,level:4,lot:{x:-566,z:3960},junction:{x:-766,z:3960},platform:{x:-566,z:4005}},
  {id:'mountain-view',name:'Mountain View',x:-165,z:5900,level:5,lot:{x:-165,z:5900},junction:{x:-70,z:5900},platform:{x:-165,z:5935}},
  {id:'santa-clara',name:'Santa Clara',x:-65,z:6790,level:5,lot:{x:-65,z:6790},junction:{x:55,z:6790},platform:{x:-65,z:6835}},
  {id:'san-jose-diridon',name:'San José Diridon',x:1986.5553212989137,z:7740.165105790462,level:6,lot:{x:1987,z:7690},junction:{x:1907,z:7690},platform:{x:1987,z:7759},existingLandmark:true},
];

const STOPS_WITH_LOTS=CALTRAIN_STOPS.filter((stop):stop is CaltrainStop & {lot:{x:number;z:number};junction:{x:number;z:number}}=>!!stop.lot&&!!stop.junction);

// Minor local roads join a highway and the station lot. Their exact rectangles
// are fed to the renderer, minimap, and directed navigation lane loops.
const LOT_ROADS=STOPS_WITH_LOTS.map(({lot,junction})=>({
  x:(lot.x+junction.x)/2,z:lot.z,w:Math.abs(lot.x-junction.x)+24,d:18,axis:'x' as const,
}));
// The reused historic stations sit a short walk from their parking approaches.
// These driveable spurs lead close to each station without crossing the building.
const STATION_SPURS=[
  {x:-1020,z:1452,w:18,d:44,axis:'z' as const},
  {x:1987,z:7706,w:18,d:44,axis:'z' as const},
];
export const CALTRAIN_ROADS=[...LOT_ROADS,...STATION_SPURS];
export const CALTRAIN_ACCESS_ROUTES=CALTRAIN_ROADS.map(road=>road.axis==='x' ? [
  {x:road.x-road.w/2+6,z:road.z+3},
  {x:road.x+road.w/2-6,z:road.z+3},
  {x:road.x+road.w/2-6,z:road.z-3},
  {x:road.x-road.w/2+6,z:road.z-3},
] : [
  {x:road.x-3,z:road.z-road.d/2+6},
  {x:road.x-3,z:road.z+road.d/2-6},
  {x:road.x+3,z:road.z+road.d/2-6},
  {x:road.x+3,z:road.z-road.d/2+6},
]);
/** Each lot uses the ordinary parking-game registry and pickups. */
export const CALTRAIN_PARKING_LOTS=STOPS_WITH_LOTS.map(stop=>({
  id:`caltrain-${stop.id}`,name:`${stop.name} · Caltrain parking`,
  area:{x:stop.lot.x,z:stop.lot.z,yaw:0,width:80,length:60},
  approach:{x:stop.lot.x,z:stop.lot.z+18,yaw:0,width:26,length:20},
  stalls:[-18,-6,6,18].map((dx,i)=>({id:`caltrain-${stop.id}-${i}`,x:stop.lot.x+dx,y:0,z:stop.lot.z-10,yaw:0,width:5,length:10})),
  pickup:{x:stop.lot.x+27,z:stop.lot.z+18},
}));

/** A decorative double rail line, routed across supported land. It links station
 * platforms in the compressed world; no train or real-world service is implied. */
export const CALTRAIN_TRACK:readonly {x:number;z:number}[]=[
  {x:-205,z:260},{x:-220,z:300},{x:-235,z:400},{x:-510,z:900},{x:-540,z:995},
  {x:-631,z:995},{x:-665,z:1065},{x:-1080,z:1350},{x:-1080,z:1505},{x:-1020,z:1505},
  {x:-1020,z:1950},{x:-1000,z:2200},{x:-1100,z:2380},{x:-1100,z:2495},{x:-987,z:2495},
  {x:-800,z:2900},{x:-800,z:3100},{x:-840,z:3350},{x:-510,z:3900},{x:-510,z:4005},{x:-566,z:4005},
  {x:-100,z:5300},{x:-230,z:5750},{x:-230,z:5935},{x:-165,z:5935},{x:-40,z:5935},
  {x:-40,z:6150},{x:-125,z:6700},{x:-125,z:6835},{x:-65,z:6835},
  {x:110,z:7000},{x:200,z:7130},{x:450,z:7500},{x:700,z:7850},
  {x:1000,z:8250},{x:1200,z:8490},{x:1450,z:8720},{x:1700,z:8750},
  {x:1800,z:8700},{x:1880,z:8700},{x:1950,z:8600},{x:2050,z:8350},
  {x:2020,z:8120},{x:1940,z:7900},{x:1987,z:7759},
];
