/** Original miniature campus interpretations in the compressed Bay map.
 * Coordinates, dimensions and buildings are fictional; see docs/TECH_CAMPUSES.md. */
export type CampusId = 'stripe'|'meta'|'google'|'nvidia'|'apple';
export type TechCampusBuilding = {
 x:number; z:number; w:number; d:number; h:number;
 district:'peninsula'|'south-bay'; style:'tech-campus'; campusId:CampusId;
};
export type TechCampus = {
 id:CampusId; name:string; city:string; x:number; z:number;
 color:number; glass:number; buildings:readonly TechCampusBuilding[];
};

function building(campusId:CampusId,x:number,z:number,w:number,d:number,h:number,district:TechCampusBuilding['district']):TechCampusBuilding {
 return {campusId,x,z,w,d,h,district,style:'tech-campus'};
}

// A stepped low-poly ring, made out of collision-backed rectangular walls.
// A south gate gives ground traffic access to the clear central courtyard.
function appleRing(x:number,z:number):TechCampusBuilding[] {
 const result:TechCampusBuilding[]=[];
 for(let row=-4;row<=4;row++){
  let start:number|null=null;
  for(let col=-4;col<=5;col++){
   const radius=Math.hypot(col*10,row*10);
   const occupied=col<=4&&radius<=45&&radius>=25&&!(row>=2&&Math.abs(col)<=1);
   if(occupied&&start===null)start=col;
   if(!occupied&&start!==null){
    const end=col-1;
    result.push(building('apple',x+(start+end)*5,z+row*10,(end-start+1)*10,10,18,'south-bay'));
    start=null;
   }
  }
 }
 return result;
}

export const TECH_CAMPUSES:readonly TechCampus[] = [
 {id:'stripe',name:'Stripe HQ',city:'South San Francisco',x:-440,z:1000,color:0xd7d5e7,glass:0x657a92,buildings:[building('stripe',-440,1000,60,40,22,'peninsula')]},
 {id:'meta',name:'Meta / Facebook HQ',city:'Menlo Park',x:-720,z:3400,color:0xd7d7ca,glass:0x678c98,buildings:[building('meta',-720,3400,70,44,20,'peninsula')]},
 {id:'google',name:'Googleplex',city:'Mountain View',x:-240,z:5200,color:0xe4dfcf,glass:0x70939b,buildings:[building('google',-240,5200,70,44,21,'peninsula')]},
 {id:'nvidia',name:'NVIDIA HQ',city:'Santa Clara',x:120,z:6800,color:0x879b93,glass:0x4d7074,buildings:[building('nvidia',120,6800,60,46,24,'south-bay')]},
 {id:'apple',name:'Apple Park',city:'Cupertino',x:320,z:7100,color:0xeeeae0,glass:0x75999a,buildings:appleRing(320,7100)},
];
export const TECH_CAMPUS_BUILDINGS:readonly TechCampusBuilding[] = TECH_CAMPUSES.flatMap(campus=>campus.buildings);
