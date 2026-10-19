import { buildingBlocksPose } from '../shared/landmark-collision';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, makeEntity, step } from '../shared/game';
import { MARIN_ARRIVAL_POINTS, MARIN_ROADS, MARIN_ROUTES } from '../shared/marin-roads';
import { insidePolygon, isBridge, isRocketIsland, isSurface, nearbyBuildings, REGIONS, terrainHeight } from '../shared/map';
import { NORTH_LANDMARKS } from '../shared/north-landmarks';
import { PARKING_LOTS } from '../shared/parking-lots';
import { CUSTOMERS, RESTAURANTS, requiredLevelAt } from '../shared/delivery';
import { SHOPS } from '../shared/upgrades';
import { ROUTES } from '../shared/traffic';
import { DELIVERY_DESTINATION_SNAP, planNavigation } from '../shared/navigation';

type Point={x:number;z:number};
function laneHeading(p:Point):number{
  let bestDistance=Infinity,bestYaw=0;
  for(const route of ROUTES)for(let i=0;i<route.length;i++){
    const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    const distance=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
    if(distance<bestDistance){bestDistance=distance;bestYaw=Math.atan2(-dx,-dz);}
  }
  return bestYaw;
}

test('Marin streets and arrivals use flat, clear, supported headlands',()=>{
  const region=REGIONS.find(r=>r.id==='marin')!;
  const points=Object.values(MARIN_ARRIVAL_POINTS).flat();
  assert.equal(MARIN_ARRIVAL_POINTS['mill-valley'].length,20);
  assert.equal(MARIN_ARRIVAL_POINTS['corte-madera'].length,20);
  for(const [i,p] of points.entries()){
    for(const dx of [-7,7])for(const dz of [-7,7])assert.ok(insidePolygon(p.x+dx,p.z+dz,region.points),`supported arrival ${i}`);
    assert.equal(terrainHeight(p.x,p.z),0);
    assert.equal(isBridge(p.x,p.z),false,`arrival ${i} is not on a bridge`);
    assert.equal(isRocketIsland(p.x,p.z),false);
    assert.equal(requiredLevelAt(p.x,p.z),0);
    assert.ok(!nearbyBuildings(p.x,p.z,15).some(b=>Math.abs(p.x-b.x)<b.w/2+7&&Math.abs(p.z-b.z)<b.d/2+7),`building clearance ${i}`);
    assert.ok(!PARKING_LOTS.some(l=>Math.abs(p.x-l.area.x)<l.area.width/2+7&&Math.abs(p.z-l.area.z)<l.area.length/2+7),`parking clearance ${i}`);
    for(const landmark of NORTH_LANDMARKS)assert.ok(Math.hypot(p.x-landmark.x,p.z-landmark.z)>=24,`${landmark.id} clearance ${i}`);
    for(const other of [...SHOPS,...RESTAURANTS,...CUSTOMERS]){
      const d=Math.hypot(p.x-other.x,p.z-other.z);
      if(d>0)assert.ok(d>=18,`existing stop clearance ${i}`);
    }
    for(const other of points.slice(i+1))assert.ok(Math.hypot(p.x-other.x,p.z-other.z)>=18,`arrival spacing ${i}`);
  }
  for(const [i,road] of MARIN_ROADS.entries()){
    const length=road.axis==='x'?road.w:road.d;
    for(let d=-length/2;d<=length/2;d+=2){
      const x=road.x+(road.axis==='x'?d:0),z=road.z+(road.axis==='z'?d:0);
      for(const side of [-5,0,5]){
        const px=x+(road.axis==='z'?side:0),pz=z+(road.axis==='x'?side:0);
        assert.ok(isSurface(px,pz),`road ${i} supported`);
        assert.equal(terrainHeight(px,pz),0,`road ${i} flat`);
        assert.equal(isRocketIsland(px,pz),false);
      }
      assert.ok(!nearbyBuildings(x,z,15).some(b=>Math.abs(x-b.x)<b.w/2+5&&Math.abs(z-b.z)<b.d/2+5),`road ${i} building clearance`);
    }
  }
});

test('Marin lanes stay clear and connect every authored arrival in either town',()=>{
  for(const [i,route] of MARIN_ROUTES.entries())for(let j=0;j<route.length;j++){
    const a=route[j],b=route[(j+1)%route.length],length=Math.hypot(b.x-a.x,b.z-a.z);
    for(let d=0;d<=length;d+=2){
      const x=a.x+(b.x-a.x)*d/length,z=a.z+(b.z-a.z)*d/length;
      for(const dx of [-2,2])for(const dz of [-2,2])assert.ok(isSurface(x+dx,z+dz),`route ${i} supported`);
      assert.ok(!nearbyBuildings(x,z,7).some(building=>buildingBlocksPose(building,{kind:'model-3',x,z,y:terrainHeight(x,z)??0,yaw:Math.atan2(a.x-b.x,a.z-b.z),pitch:0,roll:0,supportId:'ground'})),`route ${i} clear`);
    }
  }
  const places=Object.values(MARIN_ARRIVAL_POINTS).flat();
  const sf=makeEntity('sf','model-3',-237,-170);sf.yaw=0;
  for(const [i,start] of places.entries()){
    assert.ok(planNavigation(sf,start,0,DELIVERY_DESTINATION_SNAP),`SF to arrival ${i}`);
    const car=makeEntity('marin','model-3',start.x,start.z);car.yaw=laneHeading(start);
    for(const [j,end] of places.entries()){
      if(i===j)continue;
      assert.ok(planNavigation(car,end,0,DELIVERY_DESTINATION_SNAP),`arrival ${i} to ${j}`);
    }
    assert.ok(planNavigation(car,{x:-237,z:-177},0,DELIVERY_DESTINATION_SNAP),`arrival ${i} to SF`);
  }
});

test('cars drive across the Golden Gate and reach both towns and return',()=>{
  const cases=[
    {name:'SF to Corte Madera',start:{x:-237,z:-170,yaw:0},end:{x:-325,z:-395}},
    {name:'SF to Mill Valley',start:{x:-237,z:-170,yaw:0},end:{x:-180,z:-430}},
    {name:'SF to Mill Valley side street',start:{x:-237,z:-170,yaw:0},end:{x:-150,z:-515}},
    {name:'SF to Corte Madera side street',start:{x:-237,z:-170,yaw:0},end:{x:-375,z:-435}},
    {name:'Corte Madera to SF',start:{x:-325,z:-398,yaw:Math.PI/2},end:{x:-237,z:-177}},
    {name:'Mill Valley to SF',start:{x:-180,z:-433,yaw:Math.PI/2},end:{x:-237,z:-177}},
  ];
  for(const [i,p] of [
    {x:-270,z:-506},{x:-270,z:-486},{x:-270,z:-466},
    {x:-254,z:-540},{x:-234,z:-540},{x:-214,z:-540},
  ].entries()){
    cases.push({name:`SF to added Marin arrival ${i}`,start:{x:-237,z:-170,yaw:0},end:p});
    cases.push({name:`added Marin arrival ${i} to SF`,start:{...p,yaw:laneHeading(p)},end:{x:-237,z:-177}});
  }
  for(const example of cases){
    const world=createWorld(),player=addPlayer(world,'driver','Driver');
    const car=world.entities.find(entity=>entity.id===player.entityId)!;
    world.entities=[car];world.pickups=[];
    Object.assign(car,example.start,{speed:0,vx:0,vz:0});
    const navigation=planNavigation(car,example.end,0,DELIVERY_DESTINATION_SNAP);
    assert.ok(navigation,`${example.name} planned`);
    car.navigation=navigation;car.autopilot=true;
    for(let i=0;i<6000&&car.autopilot;i++)step(world,new Map(),.05);
    assert.equal(car.navigation?.status,'arrived',example.name);
    assert.ok(Math.hypot(car.x-example.end.x,car.z-example.end.z)<9,`${example.name} within marker`);
    assert.equal(car.health,100,`${example.name} without collision damage`);
  }
});
