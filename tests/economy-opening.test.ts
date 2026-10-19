import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {selectAchievementTierLadder} from '../shared/achievement-tiers';
import {initialDelivery,pickupBonusFor} from '../shared/delivery';

test('opening ledger includes the pickup tier and matches the published data',()=>{
  const output=execFileSync(process.execPath,['--import','tsx','scripts/economy-opening.ts','--json'],{encoding:'utf8'});
  const runs=JSON.parse(output);
  assert.deepEqual(runs,JSON.parse(readFileSync('public/blog/economy/opening-wallet.json','utf8')));
  const slow=runs.find((run:{name:string})=>run.name==='Slow delivery');
  assert.ok(slow);
  assert.equal(slow.points[0].deliveries,0);
  assert.equal(slow.points[0].tiers,1);
  const firstOrder={...initialDelivery({x:0,z:0}).order,elapsed:45};
  assert.equal(slow.points[0].gross,selectAchievementTierLadder('pickups')[0].cash+pickupBonusFor(firstOrder));
});
