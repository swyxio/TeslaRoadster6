import assert from 'node:assert/strict';
import test from 'node:test';
import { MARS_LAUNCH_SECONDS } from '../shared/mars';
import { starshipAnimation } from '../src/starship-timeline';

test('server time and a monotonic receipt clock synchronize launch across rooms and client clock settings',()=>{
  const epoch=1_792_000_000_000,launchAt=epoch+30_000;
  const a={launchAt,serverTime:epoch,receivedAt:100};
  const b={launchAt,serverTime:epoch+5_000,receivedAt:500};
  assert.equal(starshipAnimation(a,null,30_099),null);
  assert.deepEqual(starshipAnimation(a,null,32_600),{source:'global',elapsed:2.5});
  assert.deepEqual(starshipAnimation(b,null,28_000),{source:'global',elapsed:2.5});
  assert.equal(starshipAnimation(a,null,30_100+MARS_LAUNCH_SECONDS*1000),null);
});

test('local replay is optional, bounded, and yields to the global event',()=>{
  const clock={launchAt:10_000,serverTime:9_000,receivedAt:100};
  assert.deepEqual(starshipAnimation(clock,500,900),{source:'replay',elapsed:.4});
  assert.deepEqual(starshipAnimation(clock,500,1_600),{source:'global',elapsed:.5});
  assert.equal(starshipAnimation(null,500,12_500),null);
  assert.equal(starshipAnimation({launchAt:NaN,serverTime:9_000,receivedAt:100},null,1_600),null);
  assert.equal(starshipAnimation(null,500,NaN),null);
});
