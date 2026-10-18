import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {addPlayer,buyVehicleStyle,chooseVehicle,createWorld,makeEntity} from '../shared/game';
import {SHOPS} from '../shared/upgrades';
import {PAINTS,DECALS,type StyleChoice} from '../shared/vehicle-style';
import {parseMessage} from '../worker/protocol';
import {snapshotFor} from '../worker/snapshot';
import {createVehicle,setVehicleStyle} from '../src/vehicles';
import {VEHICLES} from '../shared/vehicles';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Sky'),car=makeEntity('car','roadster',SHOPS[0].x,SHOPS[0].z,'p');
  world.entities=[car];player.entityId=car.id;return {world,player,car};
}
test('vehicle finishes validate the driver, funds and workshop and charge once',()=>{
  const {world,player,car}=setup();player.delivery.cash=0;const red:StyleChoice={category:'paint',choice:'ember'};
  assert.equal(buyVehicleStyle(world,'p',red),false,'no cash');
  player.delivery.cash=2500;car.x+=30;assert.equal(buyVehicleStyle(world,'p',red),false,'outside workshop');car.x-=30;
  car.supportId=null;assert.equal(buyVehicleStyle(world,'p',red),false,'airborne');car.supportId='ground';
  car.driver='other';assert.equal(buyVehicleStyle(world,'p',red),false,'only the driver can buy');car.driver='p';
  assert.equal(buyVehicleStyle(world,'p',{category:'paint',choice:'__proto__'} as StyleChoice),false,'invalid finishes cannot be installed');
  assert.ok(buyVehicleStyle(world,'p',red));assert.equal(player.delivery.cash,2500-PAINTS.ember.price);assert.equal(car.style.paint,'ember');
  assert.equal(buyVehicleStyle(world,'p',red),false,'repeating the same purchase does not charge');
  assert.ok(buyVehicleStyle(world,'p',{category:'decal',choice:'stripe'}));assert.equal(player.delivery.cash,2500-PAINTS.ember.price-DECALS.stripe.price);
  assert.ok(buyVehicleStyle(world,'p',{category:'paint',choice:'stock'}));assert.equal(player.delivery.cash,2500-PAINTS.ember.price-DECALS.stripe.price,'original paint is free');
  assert.deepEqual(car.style,{paint:'stock',decal:'stripe'});
  assert.ok(chooseVehicle(world,'p','model-3'));assert.deepEqual(world.entities.find(e=>e.id===player.entityId)?.style,{paint:'stock',decal:'none'},'a replacement car starts with its own finish');
});
test('wire accepts only bounded style choices and replicated snapshots contain the finish and driver name',()=>{
  assert.deepEqual(parseMessage('{"type":"vehicleStyle","category":"paint","choice":"mint","requestId":1}'),{type:'vehicleStyle',category:'paint',choice:'mint',requestId:1});
  for(const raw of ['{"type":"vehicleStyle","category":"paint","choice":"__proto__","requestId":1}','{"type":"vehicleStyle","category":"paint","choice":"stripe","requestId":1}','{"type":"vehicleStyle","category":"decal","choice":"stripe","requestId":0}'])assert.equal(parseMessage(raw),null);
  const {world,player}=setup();player.delivery.cash=2500;
  assert.ok(buyVehicleStyle(world,'p',{category:'paint',choice:'mint'}));assert.ok(buyVehicleStyle(world,'p',{category:'decal',choice:'checker'}));
  const snapshot=snapshotFor(world,'p');assert.equal(snapshot.players[0].name,'Sky');assert.deepEqual(snapshot.entities.find(e=>e.id===player.entityId)?.style,{paint:'mint',decal:'checker'});
});
test('the server checks current cash level before charging and keeps an applied finish after the level drops',()=>{
  const {world,player,car}=setup();
  const selection:StyleChoice={category:'paint',choice:'sunset'};
  player.delivery.cash=9_999;
  assert.equal(buyVehicleStyle(world,'p',selection),false,'enough cash but the required level is locked');
  assert.equal(player.delivery.cash,9_999);assert.equal(car.style.paint,'stock');
  player.delivery.cash=10_000;
  assert.equal(buyVehicleStyle(world,'p',selection),true,'level is checked before spending');
  assert.equal(player.delivery.cash,7_000);assert.equal(player.delivery.level,0);
  assert.equal(car.style.paint,'sunset','paint stays applied after level drops');
  assert.equal(buyVehicleStyle(world,'p',{category:'decal',choice:'double'}),false,'a separate locked finish cannot be bought');
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
test('motorcycle decals sit on both fairings without changing a shared bike',()=>{
  for(const kind of ['ducati-panigale-v4','kawasaki-ninja-h2-carbon'] as const){
    const bike=createVehicle(kind),other=createVehicle(kind),body:T.Mesh[]=[];
    bike.traverse(node=>{
      if(node instanceof T.Mesh&&node.material instanceof T.MeshStandardMaterial&&node.material.color.getHex()===VEHICLES[kind].color)body.push(node);
    });
    assert.ok(body.length,`${kind} has a painted fairing`);
    const geometry=body[0].geometry,raycaster=new T.Raycaster();
    for(const style of ['stripe','checker'] as const){
      setVehicleStyle(bike,kind,{paint:'mint',decal:style});
      const decal=bike.getObjectByName('vehicle-decal');assert.ok(decal);
      assert.equal(decal.children.length,style==='stripe'?2:12);
      bike.updateMatrixWorld(true);
      for(const piece of decal.children){
        assert.ok(piece instanceof T.Mesh);
        const side=Math.sign(piece.position.x);
        for(const dy of [-.4,.4])for(const dz of [-.4,.4]){
          raycaster.set(new T.Vector3(side*(Math.abs(piece.position.x)+.04),piece.position.y+piece.scale.y*dy,piece.position.z+piece.scale.z*dz),new T.Vector3(-side,0,0));
          const hit=raycaster.intersectObjects(body)[0];
          assert.ok(hit,`${kind} ${style} has fairing behind each corner`);
          const gap=Math.abs(piece.position.x-hit.point.x)-piece.scale.x/2;
          assert.ok(Math.abs(gap)<.002,`${kind} ${style} touches its fairing (gap ${gap})`);
        }
      }
      assert.equal(body[0].geometry,geometry,'styling preserves cached geometry');
      assert.equal(other.getObjectByName('vehicle-decal'),undefined,'other clones stay unchanged');
    }
  }
});
test('all catalog decals produce distinct marks on cars and motorcycles',()=>{
  for(const kind of ['roadster','cybercab','ducati-panigale-v4'] as const){
    const vehicle=createVehicle(kind),signatures=new Set<string>();
    for(const decal of Object.keys(DECALS) as (keyof typeof DECALS)[]){
      if(decal==='none')continue;
      setVehicleStyle(vehicle,kind,{paint:'gold',decal});
      const marks=vehicle.getObjectByName('vehicle-decal');assert.ok(marks?.children.length,`${kind} ${decal} has visible marks`);
      const signature=JSON.stringify(marks.children.map(mark=>[mark.position.toArray(),mark.scale.toArray()]));
      assert.ok(!signatures.has(signature),`${kind} ${decal} has a distinct pattern`);signatures.add(signature);
    }
  }
});
