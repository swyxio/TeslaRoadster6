import type { ParkingLot } from './parking';
import { CHARGER_LOT, STATIONS, stationStalls } from './stations';

// All gameplay lots use this registry, including their approaches and pads.
// They occupy clear shared land, rather than decorative street-side spaces.
export const PARKING_LOTS:readonly (ParkingLot & {name:string; pickup:{x:number;z:number}})[] = [
  {
    id:'sf-playground',name:'SF parking playground',
    area:{x:-300,z:340,yaw:0,width:80,length:60},
    approach:{x:-300,z:315,yaw:0,width:16,length:20},
    stalls:[-318,-306,-294,-282].map((x,i)=>({id:`sf-${i}`,x,y:0,z:350,yaw:0,width:5,length:10})),
    pickup:{x:-272,z:360},
  },
  {
    id:'island-playground',name:'Rocket Island parking playground',
    area:{x:90,z:-1190,yaw:0,width:80,length:60},
    approach:{x:55,z:-1190,yaw:0,width:18,length:24},
    stalls:[72,84,96,108].map((x,i)=>({id:`island-${i}`,x,y:0,z:-1203,yaw:0,width:5,length:10})),
    pickup:{x:116,z:-1172},
  },
  ...STATIONS.map(station=>({
    id:`charger-${station.id}`,name:`${station.name} · ${station.sourceUrl?'Supercharger':'air station'}`,
    area:{x:station.x,z:station.z,yaw:0,width:CHARGER_LOT.width,length:CHARGER_LOT.length},
    approach:{x:station.x,z:station.z+.75,yaw:0,width:26,length:11.5},
    stalls:stationStalls(station),
    pickup:{x:station.x,z:station.z+14},
  })),
];
