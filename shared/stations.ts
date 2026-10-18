/** Tesla-listed identities with compressed game coordinates, not navigation data.
 * Sources checked 2026-10-18. Four arcade air stations are explicitly fictional. */
export type Station = {
  id:string; name:string; area:string; venue:string; address:string|null; sourceUrl:string|null;
  setting:'retail'|'garage'|'museum'|'plaza'|'fictional'; x:number; z:number; frontage?:{x:number;z:number};
};
export const STATIONS:readonly Station[] = [
  {id:'sf-16th',name:'SF · 16th Street',area:'San Francisco',venue:'Potrero Center · Target',address:'2300 16th St, San Francisco, CA 94103',sourceUrl:'https://www.tesla.com/findus/location/supercharger/8739',setting:'retail',x:32,z:30},
  {id:'sf-geary',name:'SF · Geary Boulevard',area:'San Francisco',venue:'Target',address:'2675 Geary Blvd, San Francisco, CA 94118',sourceUrl:'https://www.tesla.com/findus/location/supercharger/SanFranciscoCAsupercharger2',setting:'retail',x:-148,z:-90},
  {id:'oakland',name:'Oakland · 2nd Street',area:'Oakland',venue:'Jack London Square Market Garage #4',address:'255 2nd Street, Oakland, CA 94607',sourceUrl:'https://www.tesla.com/findus/location/supercharger/oaklandcasupercharger',setting:'garage',x:362,z:90},
  {id:'oakland-hegenberger',name:'Oakland · Hegenberger Road',area:'Oakland',venue:'Coliseum Center',address:'640 Hegenberger Road, Oakland, CA 94621',sourceUrl:'https://www.tesla.com/findus/location/supercharger/oaklandcahegenbergerrdsupercharger',setting:'plaza',x:420,z:210},
  {id:'berkeley-north',name:'Berkeley · North (fictional)',area:'Berkeley',venue:'Arcade air station',address:null,sourceUrl:null,setting:'fictional',x:420,z:-270},
  {id:'berkeley-south',name:'Berkeley · South (fictional)',area:'Berkeley',venue:'Arcade air station',address:null,sourceUrl:null,setting:'fictional',x:540,z:-210},
  {id:'emeryville-shellmound',name:'Emeryville · Shellmound Street',area:'Emeryville',venue:'Public Market Lot F',address:'5959 Shellmound Street, Emeryville, CA 94608',sourceUrl:'https://www.tesla.com/findus/location/supercharger/emeryvillesupercharger',setting:'plaza',x:360,z:-150},
  {id:'emeryville-christie',name:'Emeryville · Christie Avenue',area:'Emeryville',venue:'Powell Street Plaza',address:'5795 Christie Avenue, Emeryville, CA 94608',sourceUrl:'https://www.tesla.com/findus/location/supercharger/emeryvillecapowellstreetplazasupercharger',setting:'plaza',x:360,z:-90},
  {id:'mill-valley',name:'Mill Valley · Strawberry Village',area:'Mill Valley',venue:'Strawberry Village',address:'800 Strawberry Village, Mill Valley, CA 94941',sourceUrl:'https://www.tesla.com/findus/location/supercharger/407682',setting:'plaza',x:-180,z:-480,frontage:{x:37,z:0}},
  {id:'corte-madera',name:'Corte Madera · The Village',area:'Corte Madera',venue:'The Village',address:'1618 Redwood Highway, Corte Madera, CA 94925',sourceUrl:'https://www.tesla.com/findus/location/supercharger/cortemaderasupercharger',setting:'retail',x:-340,z:-490,frontage:{x:37,z:-25}},
  {id:'mill-valley-arcade',name:'Mill Valley · Arcade (fictional)',area:'Mill Valley',venue:'Arcade air station',address:null,sourceUrl:null,setting:'fictional',x:-240,z:-455},
  {id:'corte-madera-arcade',name:'Corte Madera · Arcade (fictional)',area:'Corte Madera',venue:'Arcade air station',address:null,sourceUrl:null,setting:'fictional',x:-295,z:-425},
  {id:'san-mateo',name:'San Mateo · Park Place',area:'San Mateo',venue:'Park Place',address:'1200 Park Place, San Mateo, CA 94403',sourceUrl:'https://www.tesla.com/findus/location/supercharger/sanmateosupercharger',setting:'plaza',x:-1150,z:1900,frontage:{x:0,z:-37}},
  {id:'san-mateo-bridgepointe',name:'San Mateo · Bridgepointe',area:'San Mateo',venue:'Target · Bridgepointe',address:'2220 Bridgepointe Pkwy, San Mateo, CA 94404',sourceUrl:'https://www.tesla.com/findus/location/supercharger/sanmbridgepointepkwysupercharger',setting:'retail',x:-1280,z:2100,frontage:{x:0,z:-37}},
  {id:'palo-alto-bryant',name:'Palo Alto · Bryant Street',area:'Palo Alto',venue:'Lytton/Bryant Garage',address:'445 Bryant Street, Palo Alto, CA 94301',sourceUrl:'https://www.tesla.com/findus/location/supercharger/PaloAltoCASupercharger2',setting:'garage',x:-700,z:3900,frontage:{x:0,z:-37}},
  {id:'palo-alto-stanford',name:'Palo Alto · Stanford Shopping Center',area:'Palo Alto',venue:'Stanford Shopping Center',address:'660 Stanford Shopping Center, Palo Alto, CA 94304',sourceUrl:'https://www.tesla.com/findus/location/supercharger/stanfordshoppingsupercharger',setting:'retail',x:-840,z:4100,frontage:{x:0,z:-37}},
  {id:'mountain-view-shoreline',name:'Mountain View · Shoreline',area:'Mountain View',venue:'Computer History Museum',address:'1401 N. Shoreline Blvd, Mountain View, CA 94043',sourceUrl:'https://www.tesla.com/findus/location/supercharger/mountainviewcasupercharger',setting:'museum',x:20,z:5900,frontage:{x:0,z:-37}},
  {id:'mountain-view-grant',name:'Mountain View · Grant Road',area:'Mountain View',venue:'Grant Park Plaza',address:'1350 Grant Rd, Mountain View, CA 94040',sourceUrl:'https://www.tesla.com/findus/location/supercharger/7187',setting:'plaza',x:-100,z:6100,frontage:{x:0,z:-37}},
  {id:'hayward-hesperian',name:'Hayward · Hesperian Boulevard',area:'Hayward',venue:'Target',address:'19661 Hesperian Boulevard, Hayward, CA 94541',sourceUrl:'https://www.tesla.com/findus/location/supercharger/haywardcaliforniasupercharger',setting:'retail',x:1230,z:2690,frontage:{x:0,z:-37}},
  {id:'hayward-jackson',name:'Hayward · Jackson Street',area:'Hayward',venue:'Jackson Square',address:'249 W Jackson St, Hayward, CA 94544',sourceUrl:'https://www.tesla.com/findus/location/supercharger/28480',setting:'plaza',x:1300,z:3300,frontage:{x:0,z:-37}},
  {id:'fremont-thornton',name:'Fremont · Thornton Avenue',area:'Fremont',venue:'Thornton Plaza',address:'3700 Thornton Ave, Fremont, CA 94536',sourceUrl:'https://www.tesla.com/findus/location/supercharger/35135',setting:'plaza',x:1470,z:5860,frontage:{x:0,z:-37}},
  {id:'fremont-pacific',name:'Fremont · Pacific Commons',area:'Fremont',venue:'Target · Pacific Commons',address:'43950 Pacific Commons Boulevard, Fremont, CA 94538',sourceUrl:'https://www.tesla.com/findus/location/supercharger/fremontcapacificcommonsblvdsupercharger',setting:'retail',x:1620,z:6170,frontage:{x:-37,z:0}},
  {id:'san-jose-coleman',name:'San Jose · Coleman Avenue',area:'San Jose',venue:'Target',address:'533 Coleman Avenue, San Jose, CA 95110',sourceUrl:'https://www.tesla.com/findus/location/supercharger/sanjosecaliforniasupercharger',setting:'retail',x:1460,z:8600,frontage:{x:0,z:-37}},
  {id:'san-jose-santana',name:'San Jose · Santana Row',area:'San Jose',venue:'Santana Row',address:'377 Santana Row, San Jose, CA 95128',sourceUrl:'https://www.tesla.com/findus/location/supercharger/santanarowvaletsupercharger',setting:'plaza',x:1600,z:8900,frontage:{x:0,z:-37}},
];

/** Fictional game-space parking geometry, shared by the map and activities. */
export const CHARGER_LOT={width:40,length:40,bayWidth:5,bayLength:10,bayZ:-15} as const;
const BAY_OFFSETS=[-12,-4,4,12] as const;
export function stationStalls(station:{id:string;x:number;z:number}) {
  return BAY_OFFSETS.map((offset,i)=>({id:`${station.id}-${i}`,x:station.x+offset,z:station.z+CHARGER_LOT.bayZ,y:0,yaw:0,width:CHARGER_LOT.bayWidth,length:CHARGER_LOT.bayLength}));
}
export function chargingStationAt(x:number,z:number) {
  return STATIONS.find(s=>{
    const dx=x-s.x,dz=z-s.z;
    return (Math.abs(dx)<9&&Math.abs(dz)<9&&Math.hypot(dx,dz)<9)||
      (Math.abs(dz-CHARGER_LOT.bayZ)<=CHARGER_LOT.bayLength/2&&
        BAY_OFFSETS.some(offset=>Math.abs(dx-offset)<=CHARGER_LOT.bayWidth/2));
  });
}
