import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALTRAIN_PARKING_LOTS, CALTRAIN_ROADS, CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { LEVELS, requiredLevelAt } from '../shared/delivery';
import { addPlayer, createWorld, setDestination, step } from '../shared/game';
import { BUILDINGS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { contact } from '../shared/physics';
import { SOUTH_LANDMARKS } from '../shared/south-landmarks';
import { HIGHWAY_ROUTE_IDS, ROUTES } from '../shared/traffic';

test('station names, platforms, rail and parking use shared supported ground',()=>{
  assert.deepEqual(CALTRAIN_STOPS.map(stop=>stop.id),[
    'san-francisco','south-san-francisco','burlingame','redwood-city','palo-alto','mountain-view','santa-clara','san-jose-diridon',
  ]);
  for(const stop of CALTRAIN_STOPS){
    assert.equal(requiredLevelAt(stop.x,stop.z),stop.level,stop.id);
    assert.equal(terrainHeight(stop.platform.x,stop.platform.z),0,stop.id);
    assert.ok(CALTRAIN_TRACK.some(p=>p.x===stop.platform.x&&p.z===stop.platform.z),`${stop.id}: linked platform`);
  }
  for(const lot of CALTRAIN_PARKING_LOTS){
    assert.ok(PARKING_LOTS.includes(lot));
    assert.equal(lot.stalls.length,4);
    for(const {x,z} of [lot.area,lot.approach,...lot.stalls,lot.pickup])
      assert.equal(terrainHeight(x,z),0,`${lot.id}: ground support`);
    for(const building of BUILDINGS)
      assert.equal(contact({x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:0},{...building,yaw:0}),null,`${lot.id}: parking clears buildings`);
  }
  for(const road of CALTRAIN_ROADS)for(const building of BUILDINGS)
    assert.equal(contact({...road,yaw:0},{...building,yaw:0}),null,'station approach clears buildings');
});

test('the flat decorative rail line avoids water, solid buildings and parking lots',()=>{
  for(let i=1;i<CALTRAIN_TRACK.length;i++){
    const a=CALTRAIN_TRACK[i-1],b=CALTRAIN_TRACK[i],dx=b.x-a.x,dz=b.z-a.z;
    const samples=Math.ceil(Math.hypot(dx,dz)/4);
    for(let j=0;j<=samples;j++){
      const x=a.x+dx*j/samples,z=a.z+dz*j/samples;
      for(const offset of [-1.7,1.7]){
        const length=Math.hypot(dx,dz),rx=x+dz/length*offset,rz=z-dx/length*offset;
        assert.equal(terrainHeight(rx,rz),0,`rail segment ${i} has flat supported ground`);
      }
      for(const building of BUILDINGS)
        assert.ok(Math.abs(x-building.x)>building.w/2+3||Math.abs(z-building.z)>building.d/2+3,`rail segment ${i} clears building`);
      for(const lot of PARKING_LOTS)
        assert.ok(Math.abs(x-lot.area.x)>lot.area.width/2+3||Math.abs(z-lot.area.z)>lot.area.length/2+3,`rail segment ${i} clears ${lot.id}`);
    }
  }
});

test('both highway directions navigate into each station area after its unlock',()=>{
  for(const stop of CALTRAIN_STOPS){
    if(!stop.lot||!stop.junction)continue;
    for(const direction of [0,1]){
      const route=ROUTES[HIGHWAY_ROUTE_IDS[direction]],junction=stop.junction;
      const candidates=route.map((a,i)=>{
        const b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
        const t=Math.max(0,Math.min(1,((junction.x-a.x)*dx+(junction.z-a.z)*dz)/length2));
        return {a,b,t,distance:Math.hypot(a.x+dx*t-junction.x,a.z+dz*t-junction.z)};
      }).sort((a,b)=>a.distance-b.distance);
      const segment=candidates[0],length=Math.hypot(segment.b.x-segment.a.x,segment.b.z-segment.a.z);
      const t=Math.max(0,segment.t-35/length),world=createWorld(),player=addPlayer(world,'driver','Driver');
      const car=world.entities.find(entity=>entity.id===player.entityId)!;
      world.entities=[car];world.pickups=[];
      Object.assign(car,{x:segment.a.x+(segment.b.x-segment.a.x)*t,z:segment.a.z+(segment.b.z-segment.a.z)*t,
        yaw:Math.atan2(-(segment.b.x-segment.a.x),-(segment.b.z-segment.a.z))});
      player.delivery.level=(stop.level-1) as typeof player.delivery.level;player.delivery.cash=LEVELS[player.delivery.level].cash+2_500;
      assert.equal(setDestination(world,'driver',stop),false,`${stop.id}: locked destination`);
      player.delivery.level=stop.level;player.delivery.cash=LEVELS[player.delivery.level].cash+2_500;
      assert.equal(setDestination(world,'driver',stop),true,`${stop.id}: connected direction ${direction}`);
      for(let i=0;i<2600&&car.autopilot;i++)step(world,new Map(),.05);
      assert.equal(car.navigation?.status,'arrived',`${stop.id}: arrived direction ${direction}`);
      assert.ok(Math.hypot(car.x-stop.x,car.z-stop.z)<30,`${stop.id}: arrived near station`);
      assert.equal(car.health,100,`${stop.id}: clear approach`);
    }
  }
});

test('Redwood City groups its station with downtown landmarks on supported ground',()=>{
  const station=CALTRAIN_STOPS.find(stop=>stop.id==='redwood-city')!;
  for(const id of ['redwood-fox','county-history']){
    const landmark=SOUTH_LANDMARKS.find(place=>place.id===id)!;
    assert.ok(Math.hypot(landmark.x-station.x,landmark.z-station.z)<110,id);
    assert.equal(terrainHeight(landmark.x,landmark.z),0,id);
  }
});
