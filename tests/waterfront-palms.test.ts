import test from 'node:test';
import assert from 'node:assert/strict';
import { waterfrontPalms } from '../src/bay-waterfront';
import { RESTAURANTS, CUSTOMERS } from '../shared/delivery';
import { STATIONS, CHARGER_LOT } from '../shared/stations';

test('waterfront palms leave delivery and charger areas clear',()=>{
  const palms=waterfrontPalms();
  assert.ok(palms.length>0);
  for(const palm of palms){
    for(const place of [...RESTAURANTS,...CUSTOMERS])assert.ok(Math.hypot(palm.x-place.x,palm.z-place.z)>=20);
    for(const station of STATIONS)assert.ok(Math.abs(palm.x-station.x)>=CHARGER_LOT.width/2+5||Math.abs(palm.z-station.z)>=CHARGER_LOT.length/2+5);
  }
});
