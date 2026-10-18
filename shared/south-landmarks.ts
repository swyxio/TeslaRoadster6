/** Original, stylized Bay landmarks. Positions and scale are artistic, not navigation.
 * No dependency on map.ts: its collision index imports these records. */
import { BAY_HIGHWAY_TRACES } from './bay-highway-traces';

export type SouthLandmarkStyle = 'civic'|'museum'|'station'|'garden'|'theater'|'temple'|'mansion'|'hangar'|'church'|'quad'|'rotunda'|'dish'|'arena'|'adobe'|'market'|'tower'|'peak'|'zoo'|'slide'|'nursery'|'garage';
export type SouthLandmark = {id:string;name:string;x:number;z:number;w:number;d:number;h:number;district:'peninsula'|'east-bay'|'south-bay';style:SouthLandmarkStyle;color:number};
type Spec = {id:string;name:string;route:'peninsula'|'east-bay';z:number;side:-1|1;style:SouthLandmarkStyle;color:number;h:number;offset?:number;position?:{x:number;z:number};district?:SouthLandmark['district']};

// Individual forms have real names; locations are deliberately redistributed
// along the compressed corridor so they are visible from the existing roads.
const specs:Spec[]=[
 {id:'south-sf-city-hall',name:'South San Francisco City Hall',route:'peninsula',z:950,side:-1,style:'civic',color:0xe5d8c5,h:22},
 {id:'sfo-museum',name:'SFO Aviation Museum',route:'peninsula',z:1100,side:-1,style:'museum',color:0xd9d3c5,h:15},
 {id:'burlingame-station',name:'Burlingame Train Station',route:'peninsula',z:1450,side:1,style:'station',color:0xd6b89f,h:15},
 {id:'curiodyssey',name:'CuriOdyssey',route:'peninsula',z:1600,side:-1,style:'museum',color:0xd5c7a5,h:17},
 {id:'san-mateo-garden',name:'San Mateo Japanese Garden',route:'peninsula',z:1780,side:1,style:'garden',color:0xcacfb1,h:9},
 {id:'san-mateo-city-hall',name:'San Mateo City Hall',route:'peninsula',z:1990,side:1,style:'civic',color:0xe4d7c2,h:20},
 // The historic courthouse, Fox Theatre and station form a compact downtown.
 {id:'county-history',name:'San Mateo County History Museum',route:'peninsula',z:2400,side:-1,position:{x:-1020,z:2400},style:'rotunda',color:0xe0d5be,h:23},
 {id:'redwood-fox',name:'Redwood City Fox Theatre',route:'peninsula',z:2400,side:1,style:'theater',color:0xd4a58e,h:18},
 {id:'pulgas',name:'Pulgas Water Temple',route:'peninsula',z:2580,side:-1,style:'temple',color:0xe1d6c0,h:17},
 {id:'filoli',name:'Filoli Historic House',route:'peninsula',z:2780,side:1,style:'mansion',color:0xc6a78f,h:16},
 {id:'hiller',name:'Hiller Aviation Museum',route:'peninsula',z:2970,side:-1,style:'hangar',color:0xa1b9b5,h:17},
 {id:'allied-arts',name:'Allied Arts Guild',route:'peninsula',z:3170,side:1,style:'quad',color:0xd9c6a7,h:13},
 {id:'hp-garage',name:'Palo Alto HP Garage',route:'peninsula',z:3360,side:-1,style:'garage',color:0xdac9aa,h:10},
 {id:'stanford-church',name:'Stanford Memorial Church',route:'peninsula',z:3520,side:-1,style:'church',color:0xd9b789,h:24},
 {id:'stanford-quad',name:'Stanford Main Quad',route:'peninsula',z:3680,side:-1,style:'quad',color:0xd6c09e,h:15},
 {id:'cantor',name:'Cantor Arts Center',route:'peninsula',z:3840,side:-1,style:'rotunda',color:0xd6c2a3,h:22},
 {id:'stanford-oval',name:'Stanford Oval and Palm Drive',route:'peninsula',z:4050,side:1,style:'garden',color:0xb4c69a,h:9},
 {id:'stanford-dish',name:'Stanford Dish',route:'peninsula',z:4220,side:-1,style:'dish',color:0xd9e1d9,h:24},
 {id:'stanford-mausoleum',name:'Stanford Mausoleum',route:'peninsula',z:4380,side:1,style:'temple',color:0xd6ccae,h:15},
 {id:'bing',name:'Bing Concert Hall',route:'peninsula',z:4530,side:-1,style:'theater',color:0xd2b697,h:18},
 {id:'arizona-garden',name:'Stanford Arizona Cactus Garden',route:'peninsula',z:4700,side:1,style:'garden',color:0xc5cd9f,h:10},
 {id:'computer-history',name:'Computer History Museum',route:'peninsula',z:4940,side:-1,style:'museum',color:0xa7b9ad,h:18},
 {id:'moffett-hangar-one',name:'Moffett Field Hangar One',route:'peninsula',z:5140,side:1,style:'hangar',color:0xb7c5c2,h:25},
 {id:'shoreline-amphitheatre',name:'Shoreline Amphitheatre',route:'peninsula',z:5360,side:-1,style:'arena',color:0xe3d4b9,h:15},
 {id:'rengstorff-house',name:'Rengstorff House',route:'peninsula',z:5570,side:1,style:'mansion',color:0xe2d6c0,h:17},
 {id:'mv-performing-arts',name:'Mountain View Performing Arts',route:'peninsula',z:5780,side:-1,style:'theater',color:0xcdb3a3,h:18},
 {id:'mv-adobe',name:'Mountain View Historic Adobe',route:'peninsula',z:6000,side:1,style:'adobe',color:0xd5bf9d,h:12},
 {id:'winchester',name:'Winchester Mystery House',route:'peninsula',z:7850,side:-1,style:'mansion',color:0xbc917f,h:24,district:'south-bay'},
 {id:'rosicrucian',name:'Rosicrucian Egyptian Museum',route:'peninsula',z:8000,side:1,style:'temple',color:0xd4b47c,h:20,district:'south-bay'},
 {id:'tech-interactive',name:'The Tech Interactive',route:'peninsula',z:8150,side:-1,style:'museum',color:0x7a78a7,h:21,district:'south-bay'},
 {id:'st-joseph',name:'Cathedral Basilica of St. Joseph',route:'peninsula',z:8300,side:1,style:'church',color:0xd9c7a9,h:27,district:'south-bay'},
 {id:'sj-art-museum',name:'San José Museum of Art',route:'peninsula',z:8420,side:-1,style:'museum',color:0xc79881,h:22,district:'south-bay'},
 {id:'sap-center',name:'SAP Center',route:'east-bay',z:8320,side:-1,style:'arena',color:0x7eabb0,h:19,district:'south-bay'},
 {id:'peralta-adobe',name:'Peralta Adobe',route:'east-bay',z:8450,side:1,style:'adobe',color:0xcfb793,h:12,district:'south-bay'},
 {id:'san-pedro-square',name:'San Pedro Square Market',route:'east-bay',z:8570,side:-1,style:'market',color:0xc48e76,h:15,district:'south-bay'},
 {id:'sjsu-tower-hall',name:'San José State Tower Hall',route:'east-bay',z:8700,side:1,style:'tower',color:0xd3c8b2,h:29,district:'south-bay'},
 {id:'childrens-discovery',name:'Children’s Discovery Museum',route:'peninsula',z:8560,side:-1,style:'museum',color:0x9277aa,h:17,district:'south-bay'},
 {id:'sj-rose-garden',name:'San José Municipal Rose Garden',route:'peninsula',z:8690,side:-1,style:'garden',color:0x91b184,h:10,district:'south-bay'},
 {id:'happy-hollow',name:'Happy Hollow Park and Zoo',route:'east-bay',z:8200,side:1,style:'zoo',color:0xc3b188,h:14,district:'south-bay'},
 {id:'japanese-friendship',name:'Japanese Friendship Garden',route:'east-bay',z:8050,side:-1,style:'garden',color:0x9ebc9c,h:10,district:'south-bay'},
 {id:'california-theatre',name:'San José California Theatre',route:'east-bay',z:7900,side:1,style:'theater',color:0xcda488,h:22,district:'south-bay'},
 {id:'diridon-station',name:'San José Diridon Station',route:'east-bay',z:7750,side:-1,style:'station',color:0xdac9af,h:17,district:'south-bay'},
 {id:'patterson-house',name:'Patterson House at Ardenwood',route:'east-bay',z:4600,side:1,style:'mansion',color:0xe0c9b1,h:18},
 {id:'shinn-house',name:'Shinn Historical House',route:'east-bay',z:4950,side:-1,style:'mansion',color:0xd3baa5,h:18},
 {id:'vallejo-adobe',name:'Vallejo Adobe',route:'east-bay',z:5300,side:1,style:'adobe',color:0xcfb794,h:12},
 {id:'niles-depot',name:'Niles Depot Museum',route:'east-bay',z:5650,side:-1,style:'station',color:0xd0b9a0,h:15},
 {id:'niles-essanay',name:'Niles Essanay Silent Film Museum',route:'east-bay',z:6000,side:-1,style:'theater',color:0xc7aa94,h:17},
 {id:'california-nursery',name:'California Nursery Historic Park',route:'east-bay',z:6350,side:1,style:'nursery',color:0xa7bf91,h:13},
 {id:'aqua-adventure',name:'Fremont Aqua Adventure',route:'east-bay',z:6700,side:-1,style:'slide',color:0x80bbca,h:17},
 {id:'mission-peak',name:'Mission Peak Regional Preserve',route:'east-bay',z:7050,side:1,style:'peak',color:0xc5ab7e,h:18},
];
const dimensions:Record<SouthLandmarkStyle,[number,number]>={civic:[24,20],museum:[24,20],station:[24,18],garden:[24,20],theater:[24,18],temple:[22,20],mansion:[24,20],hangar:[28,22],church:[24,20],quad:[26,20],rotunda:[24,20],dish:[24,24],arena:[28,24],adobe:[22,18],market:[24,20],tower:[22,20],peak:[22,20],zoo:[24,20],slide:[24,20],nursery:[24,20],garage:[20,18]};

function alongHighway(route:Spec['route'],z:number,side:-1|1,offset:number){
 const points=BAY_HIGHWAY_TRACES[route];
 for(let i=1;i<points.length;i++){
  const [ax,az]=points[i-1],[bx,bz]=points[i];
  if(z<Math.min(az,bz)||z>Math.max(az,bz))continue;
  const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),t=(z-az)/dz;
  return {x:ax+dx*t+(dz/length)*offset*side,z:z-(dx/length)*offset*side};
 }
 throw new Error(`No ${route} road at ${z}`);
}
export const SOUTH_LANDMARKS:SouthLandmark[]=specs.map(spec=>{
 const {id,name,route,z,side,style,color,h,offset=75}=spec;
 const [w,d]=dimensions[style],position=spec.position??alongHighway(route,z,side,offset);
 return {id,name,...position,w,d,h,district:spec.district??(route==='peninsula'?'peninsula':'east-bay'),style,color};
});
