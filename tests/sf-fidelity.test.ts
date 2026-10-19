import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from 'three';
import { createVehicle, setVehicleDetail } from '../src/vehicles';
import { applyRoadster2026 } from '../src/sf-fidelity';

test('SF lab Roadsters keep a shared variant silhouette at distance',()=>{
  const first=createVehicle('roadster'),second=createVehicle('roadster');
  applyRoadster2026(first);applyRoadster2026(second);
  for(const root of [first,second]){
    assert.ok(root.getObjectByName('wheel_fl'));
    assert.ok(root.getObjectByName('nozzle_rear_0'));
    assert.ok(root.getObjectByName('2026-lift-fan'));
    assert.equal(setVehicleDetail(root,200**2),false);
  }
  const far1=first.getObjectByName('vehicle-distant'),far2=second.getObjectByName('vehicle-distant');
  assert.ok(far1 instanceof Mesh&&far2 instanceof Mesh);
  assert.equal(far1.geometry,far2.geometry);
  assert.equal(far1.material,far2.material);
  assert.ok(far1.geometry.getAttribute('color'));
  assert.ok((far1.geometry.index?.count??far1.geometry.getAttribute('position').count)/3<1200);
  assert.equal(setVehicleDetail(first,0),true);
  assert.ok(first.getObjectByName('2026-shell'));
});
