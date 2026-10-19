import test from 'node:test';
import assert from 'node:assert/strict';
import { newAckObservations, observeAcks, type SentInput } from './hosted-room-observations';

test('reports only observed exact-sequence acknowledgement delays',()=>{
  const state=newAckObservations();
  const sent=new Map<number,SentInput>([[1,{at:900,utc:'',targetTick:1,lastSnapshotTick:0}],
    [2,{at:1010,utc:'',targetTick:2,lastSnapshotTick:1}],
    [3,{at:1020,utc:'',targetTick:2,lastSnapshotTick:1}]]);
  observeAcks(state,sent,1,1,950,1000,2000); // warm-up
  observeAcks(state,sent,3,2,1110,1000,2000); // 2 received is skipped
  observeAcks(state,sent,3,2,1120,1000,2000); // duplicate snapshot
  observeAcks(state,sent,4,4,1150,1000,2000); // unseen sequence
  assert.deepEqual(state.receivedMs,[90]);
  assert.deepEqual(state.appliedMs,[100]);
  assert.equal(state.unmatchedReceived,1);assert.equal(state.unmatchedApplied,1);
  assert.equal(state.measuredApplied,true);
});

test('a warm-up input applied during measurement is not counted as measured input',()=>{
  const state=newAckObservations();
  const sent=new Map<number,SentInput>([[1,{at:900,utc:'',targetTick:1,lastSnapshotTick:0}]]);
  observeAcks(state,sent,1,1,1100,1000,2000);
  assert.deepEqual(state.appliedMs,[]);assert.equal(state.measuredApplied,false);
});
