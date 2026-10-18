import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AIRPORT_RUNWAY, BUILDINGS, HIGHWAYS, HILL, LANDMARKS, NATURAL_HILLS, REGIONS, ROADS, ROADSIDE_BUILDINGS, ROADSIDE_EXCLUSIONS, buildingRoofHeight, insidePolygon, isLand, terrainHeight} from '../shared/map';
import {CALTRAIN_STOPS, CALTRAIN_TRACK} from '../shared/caltrain';
import {CUSTOMERS, RESTAURANTS} from '../shared/delivery';
import {PARKING_LOTS} from '../shared/parking-lots';
import {STATIONS} from '../shared/stations';
import {SHOPS} from '../shared/upgrades';
import {BILLBOARDS, BILLBOARD_WIDTH} from '../shared/billboards';
import {contact} from '../shared/physics';
import {generateRoadsideBuildings, type RoadsideExclusion} from '../shared/roadside-buildings';

const point=(p:{x:number;z:number},size=40):RoadsideExclusion=>({...p,w:size,d:size});
const rect=(p:{x:number;z:number;width:number;length:number;yaw:number}):RoadsideExclusion=>({x:p.x,z:p.z,w:p.width,d:p.length,yaw:p.yaw});
const hill=(p:{minX:number;maxX:number;minZ:number;maxZ:number}):RoadsideExclusion=>({x:(p.minX+p.maxX)/2,z:(p.minZ+p.maxZ)/2,w:p.maxX-p.minX,d:p.maxZ-p.minZ});
const exclusions:RoadsideExclusion[]=[
  AIRPORT_RUNWAY,...[HILL,...NATURAL_HILLS].map(hill),
  ...PARKING_LOTS.flatMap(lot=>[rect(lot.area),rect(lot.approach),point(lot.pickup)]),
  ...CALTRAIN_STOPS.map(stop=>({x:stop.platform.x,z:stop.platform.z,w:44,d:8})),
  ...[...STATIONS,...SHOPS,...RESTAURANTS,...CUSTOMERS,...LANDMARKS.map(place=>place.arrival)].map(p=>point(p)),
];
const otherBuildings=BUILDINGS.filter(b=>!ROADSIDE_BUILDINGS.includes(b));
const inputs={highways:HIGHWAYS,buildings:otherBuildings,roads:ROADS,exclusions,rail:CALTRAIN_TRACK,regions:REGIONS,isLand,terrainHeight};
const placed=ROADSIDE_BUILDINGS;
const body=(r:RoadsideExclusion)=>({...r,yaw:r.yaw??0});
const enlarged=(b:RoadsideExclusion,margin:number)=>({...body(b),w:b.w+margin*2,d:b.d+margin*2});

test('roadside buildings are deterministic, bounded, and distributed along both coasts',()=>{
  assert.deepEqual(generateRoadsideBuildings({...inputs,exclusions:ROADSIDE_EXCLUSIONS}),placed);
  assert.ok(placed.length>=40&&placed.length<=120,`${placed.length} buildings`);
  assert.ok(placed.some(b=>b.district==='peninsula')&&placed.some(b=>b.district==='east-bay'));
  assert.ok(placed.every(b=>b.style==='midrise'&&b.h>=8&&b.h<=17&&b.z>=650));
});

test('roadside buildings have supported flat roofs and clear roads, buildings, activities and billboards',()=>{
  for(const [index,b] of placed.entries()){
    assert.equal(buildingRoofHeight(b,b.x,b.z),b.h);
    for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++){
      const x=b.x+ix*(b.w/2+4)/2,z=b.z+iz*(b.d/2+4)/2;
      assert.ok(isLand(x,z));
      assert.equal(terrainHeight(x,z),0);
    }
    for(const road of ROADS)assert.equal(contact(enlarged(b,12),body({...road,yaw:road.angle??0})),null,`road ${index}`);
    for(const other of [...otherBuildings,...placed.slice(0,index)])assert.equal(contact(enlarged(b,8),body(other)),null,`building ${index}`);
    for(const area of exclusions)assert.equal(contact(enlarged(b,10),body(area)),null,`activity ${index}`);
    for(const billboard of BILLBOARDS)assert.equal(contact(enlarged(b,2),{...billboard,w:BILLBOARD_WIDTH,d:.35}),null,`billboard ${index}`);
    const railClearance=Math.hypot(b.w,b.d)/2+10;
    for(let i=1;i<CALTRAIN_TRACK.length;i++){
      const a=CALTRAIN_TRACK[i-1],end=CALTRAIN_TRACK[i],dx=end.x-a.x,dz=end.z-a.z;
      const t=Math.max(0,Math.min(1,((b.x-a.x)*dx+(b.z-a.z)*dz)/(dx*dx+dz*dz)));
      assert.ok(Math.hypot(b.x-a.x-t*dx,b.z-a.z-t*dz)>=railClearance,`rail ${index}`);
    }
  }
});

test('caller-supplied landmark exclusions prevent placement without hardcoded locations',()=>{
  const landmarks=placed.map(b=>({x:b.x,z:b.z,w:16,d:14}));
  const revised=generateRoadsideBuildings({...inputs,exclusions:[...exclusions,...landmarks]});
  assert.ok(revised.length>0);
  for(const b of revised)for(const landmark of landmarks)
    assert.equal(contact(enlarged(b,10),body(landmark)),null);
});

test('a narrow concave shoreline notch cannot cut through a building between terrain samples',()=>{
  const rectangle=[{x:-200,z:600},{x:200,z:600},{x:200,z:1100},{x:-200,z:1100}];
  const notched=[{x:-200,z:600},{x:200,z:600},{x:200,z:1100},
    {x:-86,z:1100},{x:-86,z:935},{x:-87,z:935},{x:-87,z:1100},{x:-200,z:1100}];
  const fixture=(points:typeof rectangle)=>{
    const supported=(x:number,z:number)=>insidePolygon(x,z,points);
    return {highways:[{id:'peninsula',points:[{x:0,z:650},{x:0,z:1000}]}],
      buildings:[],roads:[],exclusions:[],rail:[],regions:[{points}],isLand:supported,
      terrainHeight:(x:number,z:number)=>supported(x,z)?0:null};
  };
  const candidate=generateRoadsideBuildings(fixture(rectangle)).find(b=>b.x===-76);
  assert.ok(candidate);
  // All 25 terrain samples miss the one-meter-wide notch.
  for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++)
    assert.ok(insidePolygon(candidate.x+ix*(candidate.w/2+4)/2,candidate.z+iz*(candidate.d/2+4)/2,notched));
  assert.equal(insidePolygon(-86.5,940,notched),false);
  const placedOnNotchedLand=generateRoadsideBuildings(fixture(notched));
  assert.ok(!placedOnNotchedLand.some(b=>b.x===candidate.x));
  assert.ok(placedOnNotchedLand.some(b=>b.x===-116),'the planner can try a clear setback');
});
