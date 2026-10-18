import test from 'node:test';
import assert from 'node:assert/strict';
import { initialAchievements } from '../shared/achievements';
import { AchievementEventTracker } from '../src/achievement-events';

test('saved achievements restore silently after the initial guest state',()=>{
  const state=initialAchievements(),tracker=new AchievementEventTracker();
  assert.deepEqual(tracker.update(state),[]);
  state.unlocked.push('luxury-visit','region-oakland','region-peninsula');
  assert.deepEqual(tracker.update(state),[]);
  state.unlocked.push('roof-rider');state.lastUnlock={id:1,achievement:'roof-rider'};
  assert.deepEqual(tracker.update(state),['roof-rider']);
  assert.deepEqual(tracker.update(state),[]);
});

test('multiple new awards between snapshots follow saved awards in order',()=>{
  const state=initialAchievements(),tracker=new AchievementEventTracker();
  state.unlocked.push('luxury-visit','region-oakland','luxury-first','luxury-panigale');
  state.lastUnlock={id:2,achievement:'luxury-panigale'};
  assert.deepEqual(tracker.update(state),['luxury-first','luxury-panigale']);
  state.unlocked.push('luxury-collection-2');state.lastUnlock={id:3,achievement:'luxury-collection-2'};
  assert.deepEqual(tracker.update(state),['luxury-collection-2']);
  assert.deepEqual(tracker.update(state),[]);
});

test('rejoining starts a fresh event counter without replaying the saved collection',()=>{
  const state=initialAchievements(),tracker=new AchievementEventTracker();
  state.unlocked.push('roof-rider');state.lastUnlock={id:1,achievement:'roof-rider'};
  assert.deepEqual(tracker.update(state),['roof-rider']);
  tracker.reset();state.lastUnlock=null;
  assert.deepEqual(tracker.update(state),[]);
  state.unlocked.push('bay-hopper');state.lastUnlock={id:1,achievement:'bay-hopper'};
  assert.deepEqual(tracker.update(state),['bay-hopper']);
});
