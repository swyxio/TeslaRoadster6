import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {addPlayer,buyVehicleStyle,chooseVehicle,createWorld,makeEntity} from '../shared/game';
import {SHOPS} from '../shared/upgrades';
import {PAINTS,DECALS,type StyleChoice} from '../shared/vehicle-style';
import {parseMessage} from '../worker/protocol';
import {snapshotFor} from '../worker/snapshot';
import {createVehicle,setVehicleStyle} from '../src/vehicles';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Sky'),car=makeEntity('car','roadster',SHOPS[0].x,SHOPS[0].z,'p');
  world.entities=[car];player.entityId=car.id;return {world,player,car};
}
test('vehicle finishes validate the driver, funds and workshop and charge once',()=>{
  const {world,player,car}=setup();const red:StyleChoice={category:'paint',choice:'ember'};
  assert.equal(buyVehicleStyle(world,'p',red),false,'no cash');
  player.delivery.cash=100;car.x+=30;assert.equal(buyVehicleStyle(world,'p',red),false,'outside workshop');car.x-=30;
  car.supportId=null;assert.equal(buyVehicleStyle(world,'p',red),false,'airborne');car.supportId='ground';
  car.driver='other';assert.equal(buyVehicleStyle(world,'p',red),false,'only the driver can buy');car.driver='p';
  assert.equal(buyVehicleStyle(world,'p',{category:'paint',choice:'__proto__'} as StyleChoice),false,'invalid finishes cannot be installed');
  assert.ok(buyVehicleStyle(world,'p',red));assert.equal(player.delivery.cash,100-PAINTS.ember.price);assert.equal(car.style.paint,'ember');
  assert.equal(buyVehicleStyle(world,'p',red),false,'repeating the same purchase does not charge');
  assert.ok(buyVehicleStyle(world,'p',{category:'decal',choice:'stripe'}));assert.equal(player.delivery.cash,100-PAINTS.ember.price-DECALS.stripe.price);
  assert.ok(buyVehicleStyle(world,'p',{category:'paint',choice:'stock'}));assert.equal(player.delivery.cash,100-PAINTS.ember.price-DECALS.stripe.price,'original paint is free');
  assert.deepEqual(car.style,{paint:'stock',decal:'stripe'});
  assert.ok(chooseVehicle(world,'p','model-3'));assert.deepEqual(world.entities.find(e=>e.id===player.entityId)?.style,{paint:'stock',decal:'none'},'a replacement car starts with its own finish');
});
test('wire accepts only bounded style choices and replicated snapshots contain the finish and driver name',()=>{
  assert.deepEqual(parseMessage('{"type":"vehicleStyle","category":"paint","choice":"mint","requestId":1}'),{type:'vehicleStyle',category:'paint',choice:'mint',requestId:1});
  for(const raw of ['{"type":"vehicleStyle","category":"paint","choice":"__proto__","requestId":1}','{"type":"vehicleStyle","category":"paint","choice":"stripe","requestId":1}','{"type":"vehicleStyle","category":"decal","choice":"stripe","requestId":0}'])assert.equal(parseMessage(raw),null);
  const {world,player}=setup();player.delivery.cash=100;
  assert.ok(buyVehicleStyle(world,'p',{category:'paint',choice:'mint'}));assert.ok(buyVehicleStyle(world,'p',{category:'decal',choice:'checker'}));
  const snapshot=snapshotFor(world,'p');assert.equal(snapshot.players[0].name,'Sky');assert.deepEqual(snapshot.entities.find(e=>e.id===player.entityId)?.style,{paint:'mint',decal:'checker'});
});
test('changing one vehicle finish does not change another vehicle or shared materials',()=>{
  const first=createVehicle('roadster'),second=createVehicle('roadster');
  const painted=(root:T.Group)=>{const found:T.Mesh[]=[];root.traverse(node=>{if(node instanceof T.Mesh&&node.material instanceof T.MeshPhysicalMaterial)found.push(node);});return found;};
  const initial=painted(first)[0].material;assert.equal(painted(second)[0].material,initial);
  setVehicleStyle(first,'roadster',{paint:'mint',decal:'checker'});
  assert.notEqual(painted(first)[0].material,initial);assert.equal(painted(second)[0].material,initial);
  assert.ok(first.getObjectByName('vehicle-decal'));assert.equal(second.getObjectByName('vehicle-decal'),undefined);
  setVehicleStyle(first,'roadster',{paint:'stock',decal:'none'});assert.equal(painted(first)[0].material,initial);assert.equal(first.getObjectByName('vehicle-decal'),undefined);
});
test('the Cybercab has visible paint and decal meshes',()=>{
  const cab=createVehicle('cybercab');let changed=0;
  setVehicleStyle(cab,'cybercab',{paint:'violet',decal:'checker'});
  cab.traverse(node=>{if(node instanceof T.Mesh&&node.userData.originalVehiclePaint)changed++;});
  assert.ok(changed>0,'Cybercab body is repainted');
  assert.ok(cab.getObjectByName('vehicle-decal')?.children.length,'Cybercab has checker marks on both sides');
});
