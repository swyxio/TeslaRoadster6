import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS} from '../shared/delivery';
import {addPlayer,createWorld,enterMinigame,parkingAction,step} from '../shared/game';
import {BUILDINGS,ROADS,STATION_VENUES,terrainHeight} from '../shared/map';
import {PARKING_LOTS} from '../shared/parking-lots';
import {body,contact} from '../shared/physics';
import {STATIONS,chargingStationAt,stationStalls} from '../shared/stations';

test('each represented Bay area has two uniquely identified and honestly sourced lots',()=>{
  for(const area of ['San Francisco','Oakland','Berkeley','Emeryville','Mill Valley','Corte Madera','San Mateo','Palo Alto','Mountain View','Hayward','Fremont','San Jose'])
    assert.ok(STATIONS.filter(s=>s.area===area).length>=2,area);
  assert.equal(new Set(STATIONS.map(s=>s.id)).size,STATIONS.length);
  for(const station of STATIONS){
    if(station.sourceUrl){
      assert.match(station.sourceUrl,/^https:\/\/www\.tesla\.com\/findus\/location\/supercharger\//);
      assert.ok(station.address,station.id);
    }else{
      assert.equal(station.address,null,station.id);
      assert.match(station.name,/fictional/i);
    }
    assert.equal(chargingStationAt(station.x,station.z)?.id,station.id);
    for(const stall of stationStalls(station))assert.equal(chargingStationAt(stall.x,stall.z)?.id,station.id);
  }
});

test('authored venue buildings have shared, supported, unobstructed footprints',()=>{
  const world=createWorld();
  for(const venue of STATION_VENUES){
    const footprint={...venue,yaw:0};
    assert.ok(BUILDINGS.includes(venue),venue.stationId);
    for(const dx of [-venue.w/2,venue.w/2])for(const dz of [-venue.d/2,venue.d/2])
      assert.equal(terrainHeight(venue.x+dx,venue.z+dz),0,venue.stationId);
    for(const road of ROADS)assert.equal(contact(footprint,{...road,yaw:road.angle??0}),null,`${venue.stationId}: road`);
    for(const lot of PARKING_LOTS)assert.equal(contact(footprint,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null,`${venue.stationId}: lot`);
    for(const entity of world.entities)assert.equal(contact(footprint,body(entity)),null,`${venue.stationId}: spawn`);
    for(const other of BUILDINGS)if(other!==venue)assert.equal(contact(footprint,{...other,yaw:0}),null,`${venue.stationId}: building`);
  }
});

test('every station supports Park It and Cut the queue in the authoritative simulation',()=>{
  for(const station of STATIONS){
    const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`)!;
    const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
    player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;world.entities=[car];world.pickups=[];
    Object.assign(car,{x:lot.approach.x,z:lot.approach.z,y:0,yaw:0,supportId:'ground',speed:0,vx:0,vy:0,vz:0});
    assert.equal(parkingAction(world,'p','park'),true,`${station.id}: park join`);
    const round=world.parking.rounds[0],stall=lot.stalls.find(s=>s.id===round.entrants[0].targetId)!;
    Object.assign(car,{x:stall.x,z:stall.z,y:0,yaw:stall.yaw,supportId:'ground',speed:0,vx:0,vy:0,vz:0});
    for(let i=0;i<42;i++)step(world,new Map(),.05);
    assert.notEqual(round.entrants[0].finishedAt,null,`${station.id}: parked`);
    parkingAction(world,'p','leave');
    Object.assign(car,{x:lot.approach.x,z:lot.approach.z,y:0,yaw:0,supportId:'ground',speed:0,vx:0,vy:0,vz:0});
    assert.equal(parkingAction(world,'p','queue'),true,`${station.id}: queue join`);
    assert.equal(parkingAction(world,'p','start'),true,`${station.id}: queue start`);
  }
});

test('the mini-game menu uses the current station, including its queue approach',()=>{
  for(const station of STATIONS){
    const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`)!;
    for(const game of ['park','queue'] as const){
      const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
      player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;world.entities=[car];world.pickups=[];
      Object.assign(car,{x:lot.approach.x,z:lot.approach.z,y:0,supportId:'ground',autopilot:true});
      assert.equal(enterMinigame(world,'p',game),true,`${station.id}: ${game}`);
      assert.equal(world.parking.rounds[0].lotId,lot.id);
      assert.deepEqual({x:car.x,z:car.z},{x:lot.approach.x,z:lot.approach.z});
      assert.equal(car.autopilot,false);
    }
    const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
    player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;world.entities=[car];world.pickups=[];
    Object.assign(car,{x:lot.area.x,z:lot.area.z-10,y:0,supportId:'ground'});
    assert.equal(enterMinigame(world,'p','queue'),true,`${station.id}: move to local approach`);
    assert.equal(world.parking.rounds[0].lotId,lot.id);
    assert.ok(Math.abs(car.x-lot.approach.x)<=lot.approach.width/2&&Math.abs(car.z-lot.approach.z)<=lot.approach.length/2);
  }
});

test('joining a local parking game stops a moving car before it can leave the lot',()=>{
  const lot=PARKING_LOTS.find(l=>l.id==='charger-sf-16th')!;
  const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  Object.assign(car,{x:lot.area.x+17,z:lot.area.z,y:0,yaw:-Math.PI/2,supportId:'ground',speed:30,vx:30,pushX:30});
  assert.equal(enterMinigame(world,'p','park'),true);
  assert.equal(car.speed,0);assert.equal(car.vx,0);assert.equal(car.pushX,0);
  for(let i=0;i<10;i++)step(world,new Map(),.05);
  assert.equal(world.parking.rounds[0]?.lotId,lot.id);
});
