import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, inDomePlaza, isSurface, nearbyBuildings, terrainHeight } from '../shared/map';
import { body, contact, dimensions } from '../shared/physics';
import { PROPERTY_HOME_SITE, PROPERTY_HOME_SPAWNS, propertyRoom, propertyRoomAssetId } from '../shared/property';
import { LUXURY_VEHICLE_IDS, VEHICLE_IDS } from '../shared/vehicles';

test('property rooms canonically encode the asset UUID and survive an ownership change',()=>{
  for(const id of ['00000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-bfff-ffffffffffff',
    'af24a7ae-f349-4bb7-b15e-7e8d88ccdb45']){
    const seller={assetId:id,ownerId:'seller'},buyer={assetId:id,ownerId:'buyer'};
    const room=propertyRoom(seller.assetId);
    assert.ok(room);assert.match(room,/^p-[0-9a-z]+$/);assert.ok(room.length<=32);
    assert.equal(propertyRoomAssetId(room),id);
    assert.equal(propertyRoom(buyer.assetId),room,'the new owner keeps the asset room');
    assert.equal(propertyRoomAssetId(room.replace('p-','p-0')),null,'no leading-zero alias');
  }
});

test('invalid UUIDs and malformed, noncanonical or overflowing room addresses are rejected',()=>{
  for(const id of [null,undefined,{},'', 'af24a7ae-f349-3bb7-b15e-7e8d88ccdb45',
    'af24a7ae-f349-4bb7-715e-7e8d88ccdb45','AF24A7AE-F349-4BB7-B15E-7E8D88CCDB45'])
    assert.equal(propertyRoom(id),null);
  for(const room of [null,{},'', 'bay','p-','p-0','p-000000','P-1','p-a!', 'p-'+ 'z'.repeat(25), 'p-'+ '1'.repeat(26)])
    assert.equal(propertyRoomAssetId(room),null);
});

test('home marker uses an existing solid house and candidate arrivals clear static collision',()=>{
  const home=BUILDINGS.find(building=>building.x===PROPERTY_HOME_SITE.x&&building.z===PROPERTY_HOME_SITE.z);
  assert.ok(home);assert.equal(home.style,'house');assert.ok(home.h>0);
  assert.equal(terrainHeight(home.x,home.z),0);assert.equal(inDomePlaza(home.x,home.z),false);
  for(const pose of PROPERTY_HOME_SPAWNS){
    assert.equal(terrainHeight(pose.x,pose.z),0);assert.equal(inDomePlaza(pose.x,pose.z),false);
    for(const kind of [...VEHICLE_IDS,...LUXURY_VEHICLE_IDS,'person' as const]){
      const size=dimensions(kind),entity={kind,...pose,y:0},shape=body(entity);
      assert.ok([-1,1].every(dx=>[-1,1].every(dz=>isSurface(pose.x+dx*size.width/2,pose.z+dz*size.length/2))),`${kind} has supported corners`);
      assert.equal(nearbyBuildings(pose.x,pose.z,Math.max(size.width,size.length)+2)
        .some(building=>!!contact(shape,{...building,yaw:0})),false,`${kind} clears buildings at ${pose.z}`);
    }
  }
});
