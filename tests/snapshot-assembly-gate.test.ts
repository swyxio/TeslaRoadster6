import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSnapshotPairs, parseSnapshotSample } from '../scripts/evaluate-snapshot-assembly.mjs';

const scenarios=['clustered','spread','owned'];
function sample(cpu:Record<string,number>={clustered:90,spread:90,owned:100}){
  return scenarios.map((scenario,index)=>JSON.stringify({scenario,players:64,entities:80+index,rounds:50,
    uniqueInterestSets:1+index,decodedBytesPerBroadcast:10000+index,elapsedMs:100,cpuMs:cpu[scenario],
    broadcastP50Ms:1,broadcastP95Ms:2,logicalCpus:4,loadBefore:[1,2,3],loadAfter:[1,2,3]})).join('\n');
}
function pairs(candidate=sample()){
  return Array.from({length:5},()=>({base:sample({clustered:100,spread:100,owned:100}),candidate}));
}

test('gate uses the median of paired CPU ratios and applies the declared boundaries',()=>{
  const pass=evaluateSnapshotPairs(pairs(sample({clustered:99,spread:99,owned:110})));
  assert.equal(pass.status,'pass');
  assert.equal(pass.summary.owned.medianPairedCpuRatio,1.1);
  assert.equal(evaluateSnapshotPairs(pairs(sample({clustered:100,spread:99,owned:110}))).status,'hold');
  assert.equal(evaluateSnapshotPairs(pairs(sample({clustered:99,spread:100,owned:110}))).status,'hold');
  assert.equal(evaluateSnapshotPairs(pairs(sample({clustered:99,spread:99,owned:111}))).status,'hold');
  const observations=pairs();
  for(const [index,base] of [10,20,30,40,50].entries()){
    const ratio=[0.8,0.9,1.2,0.7,0.6][index];
    observations[index]={base:sample({clustered:base,spread:100,owned:100}),
      candidate:sample({clustered:base*ratio,spread:90,owned:100})};
  }
  assert.equal(evaluateSnapshotPairs(observations).summary.clustered.medianPairedCpuRatio,0.8);
});

test('gate rejects missing, duplicate, malformed, or incomplete records',()=>{
  assert.throws(()=>evaluateSnapshotPairs(pairs().slice(0,4)),/five/);
  const lines=sample().split('\n');
  assert.throws(()=>parseSnapshotSample(lines.slice(0,2).join('\n')),/exactly three/);
  assert.throws(()=>parseSnapshotSample([lines[0],lines[0],lines[2]].join('\n')),/duplicate/);
  assert.throws(()=>parseSnapshotSample([lines[0],'{',lines[2]].join('\n')),/invalid JSON/);
  assert.throws(()=>parseSnapshotSample(sample().replace('"cpuMs":90','"cpuMs":1e999')),/non-finite cpuMs/);
  const overflow=pairs();
  overflow[0]={base:sample({clustered:1e-308,spread:100,owned:100}),candidate:sample({clustered:1e308,spread:90,owned:100})};
  assert.throws(()=>evaluateSnapshotPairs(overflow),/non-finite paired CPU ratio/);
  assert.throws(()=>parseSnapshotSample(sample().replace('"rounds":50','"rounds":49')),/50 broadcasts/);
  assert.throws(()=>parseSnapshotSample(sample().replace('"loadBefore":[1,2,3]','"loadBefore":[1,2,null]')),/invalid loadBefore/);
});

test('gate requires identical decoded bytes and fixture parameters across all pairs',()=>{
  const changed=pairs();
  changed[0].candidate=changed[0].candidate.replace('"decodedBytesPerBroadcast":10000','"decodedBytesPerBroadcast":10001');
  assert.throws(()=>evaluateSnapshotPairs(changed),/decodedBytesPerBroadcast differs/);
  const equallyChanged=pairs();
  equallyChanged[2].base=equallyChanged[2].base.replace('"entities":80','"entities":81');
  equallyChanged[2].candidate=equallyChanged[2].candidate.replace('"entities":80','"entities":81');
  assert.throws(()=>evaluateSnapshotPairs(equallyChanged),/entities differs/);
});
