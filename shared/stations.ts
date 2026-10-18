/** Real site identities; deliberately compressed game coordinates, not navigation data.
 * Tesla sources checked 2026-10-17. Air service is fictional; no live stall data. */
export const STATIONS = [
  { id: 'sf-16th', name: 'SF · 16th Street', address: '2300 16th St, San Francisco, CA 94103', sourceUrl: 'https://www.tesla.com/en_CA/findus/location/supercharger/8739', x: 20, z: 30 },
  { id: 'sf-geary', name: 'SF · Geary Boulevard', address: '2675 Geary Blvd, San Francisco, CA 94118', sourceUrl: 'https://www.tesla.com/en_GB/findus/location/supercharger/SanFranciscoCAsupercharger2', x: -160, z: -90 },
  { id: 'oakland', name: 'Oakland · 2nd Street', address: '255 2nd Street, Oakland, CA 94607', sourceUrl: 'https://www.tesla.com/en_gb/findus/location/supercharger/oaklandcasupercharger', x: 350, z: 90 },
  { id: 'san-mateo', name: 'San Mateo · Park Place', address: '1200 Park Place, San Mateo, CA 94403', sourceUrl: 'https://www.tesla.com/en_CA/findus/location/supercharger/sanmateosupercharger', x: -40, z: 265 },
] as const;

/** The shared parking and refill geometry; positions are fictional game space. */
export const CHARGER_LOT={width:24,length:24,bayWidth:5,bayLength:10} as const;
export function stationStalls(station:{id:string;x:number;z:number}) {
  return [-1.5,-.5,.5,1.5].map((offset,i)=>({id:`${station.id}-${i}`,x:station.x+offset*CHARGER_LOT.bayWidth,z:station.z-CHARGER_LOT.bayLength/2,y:0,yaw:0,width:CHARGER_LOT.bayWidth,length:CHARGER_LOT.bayLength}));
}
export function chargingStationAt(x:number,z:number) {
  return STATIONS.find(s=>Math.abs(x-s.x)<=2*CHARGER_LOT.bayWidth&&z>=s.z-CHARGER_LOT.bayLength&&z<=s.z);
}
