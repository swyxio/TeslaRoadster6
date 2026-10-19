import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyConfig,verifyBindings,verifyBot,verifyMain} from './room-64-target.mjs';
import {aggregate} from './room-64-aggregate.mjs';

const target={repo:'swyxio/TeslaRoadster6',approved:true,pullRequest:123,sha:'a'.repeat(40),baseSha:'c'.repeat(40),
  preview:'https://1234abcd-bay-drive.swyxio.workers.dev',protocol:47};
const bot=`### Preview URL: https://codex-example-bay-drive.swyxio.workers.dev (commit aaaaaaa)
<tr><td>aaaaaaa</td><td><a href="${target.preview}">preview</a></td><td><b>Build:</b> Success</td><td><b>Deployment:</b> Success</td></tr>`;
test('requires an explicitly approved immutable exact-PR preview',()=>{
  verifyConfig(target);
  for (const invalid of [{...target,approved:false},{...target,sha:'abc'}, {...target,baseSha:'abc'}, {...target,baseSha:target.sha},
    {...target,preview:'https://bay-drive.swyxio.workers.dev'},
    {...target,preview:'https://abcd1234-example.swyxio.workers.dev'}, {...target,pullRequest:0}])
    assert.throws(()=>verifyConfig(invalid));
  verifyBot(bot,target,'codex/example');
  verifyMain(target,target.baseSha);
  assert.throws(()=>verifyMain(target,'d'.repeat(40)));
  assert.throws(()=>verifyBot(bot,{...target,sha:'b'.repeat(40)},'codex/example'));
  assert.throws(()=>verifyBot(bot,target,'codex/different'));
});
test('requires same-Worker isolated preview bindings',()=>{
  const bindings=Object.entries({ROOMS:'GameRoom',CHAT:'GlobalChat',DRIVERS:'DriverProfile',ECONOMIES:'RoomEconomy',
    INCOME:'GlobalIncome',GLOBAL_EVENTS:'GlobalEarningsEvent',MARKET:'MarketService'}).map(([name,class_name])=>({name,class_name}));
  const config={name:'bay-drive',main:'worker/index.ts',previews:{vars:{MAX_PLAYERS:'64'},durable_objects:{bindings}}};
  verifyBindings(config);
  assert.throws(()=>verifyBindings({...config,previews:{...config.previews,durable_objects:{bindings:[...bindings.slice(1)]}}}));
  assert.throws(()=>verifyBindings({...config,previews:{...config.previews,kv_namespaces:[]}}));
});
const record=group=>({before:{sha:target.sha,baseSha:target.baseSha,preview:target.preview,protocol:47},after:{sha:target.sha,baseSha:target.baseSha,preview:target.preview,protocol:47},
  report:{group,room:'sandbox-d1234-1',runId:'1234',attempt:'1',candidateSha:target.sha,baseSha:target.baseSha,diagnosticSha:'b'.repeat(40),
    preview:target.preview,health:{ok:true,version:47,capacity:64},barrierTick:100,targetTick:180,roomEpochs:['epoch'],failure:null,diagnosticCoverageComplete:true,incomplete:[],
    clients:16,onlineAtEnd:16,clientsSeeingAll:16,extraClose:group===1?{code:4003}:null,simulatedSeconds:{min:59.9},elapsedSeconds:60,
    startedUtc:'2026-10-18T20:00:00.000Z',endedUtc:'2026-10-18T20:01:00.000Z',inputsSent:{measured:19000},decodedJsonMiB:1200,
    slots:Array.from({length:16},()=>({lastPlayers:64,measuredApplied:true,leftCorridor:false,movement:{blocks:Array.from({length:6},()=>({complete:true}))}}))}});
test('aggregate refuses missing, conflicting or incomplete runner evidence',()=>{
  const records=[1,2,3,4].map(record);
  assert.equal(aggregate(records).clients,64);
  assert.throws(()=>aggregate(records.slice(1)));
  assert.throws(()=>aggregate([record(1),record(1),record(3),record(4)]));
  const mismatch=[1,2,3,4].map(record);mismatch[2].report.roomEpochs=['other'];assert.throws(()=>aggregate(mismatch));
  const drift=[1,2,3,4].map(record);drift[1].after.sha='c'.repeat(40);assert.throws(()=>aggregate(drift));
  const baseDrift=[1,2,3,4].map(record);baseDrift[2].after.baseSha='d'.repeat(40);assert.throws(()=>aggregate(baseDrift));
  const capacity=[1,2,3,4].map(record);capacity[0].report.extraClose.code=1008;assert.throws(()=>aggregate(capacity));
  const incomplete=[1,2,3,4].map(record);incomplete[3].report.slots[0].movement.blocks[2].complete=false;assert.throws(()=>aggregate(incomplete));
  const corridor=[1,2,3,4].map(record);corridor[3].report.slots[1].leftCorridor=true;assert.throws(()=>aggregate(corridor));
  const overlap=[1,2,3,4].map(record);overlap[0].report.endedUtc='2026-10-18T20:00:58.000Z';assert.throws(()=>aggregate(overlap));
});
