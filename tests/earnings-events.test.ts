import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAB_REMAINDER_DENOMINATOR, GLOBAL_EVENT_DURATION_MS, ROOM_WIN_DURATION_MS,
  activityPayout, bonusEligible, cabAccrual, earningsMultiplier, globalEarningsEvent, globalWindowsForInstant, globalWindowsForInterval, recordRoomWin,
  type EarningsEvents, type EarningsSource,
} from '../shared/earnings-events.ts';

const start=Date.UTC(2026,9,18,12), minute=60_000;
const none:EarningsEvents={room:[],global:[]};

test('global leases cover both ends of each evaluated time range',()=>{
  const event=globalEarningsEvent(start),end=event.endsAtMs;
  const lateLease={issuedAtMs:end,validUntilMs:end+15_000,windows:[]};
  assert.throws(()=>globalWindowsForInstant(lateLease,end-1),/does not cover/,'a lease acquired after an event ends cannot price an earlier payout');
  assert.throws(()=>globalWindowsForInterval(lateLease,end-1,end),/does not cover/,'settlement needs history for an earlier interval');
  assert.deepEqual(globalWindowsForInstant(lateLease,end),[]);
  assert.throws(()=>globalWindowsForInstant(lateLease,end+15_000),/does not cover/);
  assert.deepEqual(globalWindowsForInterval(lateLease,end,end+15_000),[],'the right end is exclusive');
  assert.throws(()=>globalWindowsForInterval(lateLease,end,end+15_001),/does not cover/);
});

test('a verified win starts and refreshes a room bonus after the match payment',()=>{
  const prior:EarningsEvents={room:[],global:[globalEarningsEvent(start)]};
  assert.equal(activityPayout(100,'dome-match',start,prior),200,'the triggering match uses the prior global rate');
  const room=recordRoomWin([],start);
  assert.equal(earningsMultiplier({room,global:[]},start-1).multiplier,1);
  assert.deepEqual(earningsMultiplier({room,global:[]},start),{multiplier:1.5,roomEndsAtMs:start+10*minute,globalEndsAtMs:null});
  assert.equal(earningsMultiplier({room,global:[]},start+10*minute-1).multiplier,1.5);
  assert.equal(earningsMultiplier({room,global:[]},start+10*minute).multiplier,1);
  const refreshed=recordRoomWin(room,start+8*minute);
  assert.deepEqual(refreshed,[{startsAtMs:start,endsAtMs:start+18*minute}]);
  assert.deepEqual(room,[{startsAtMs:start,endsAtMs:start+10*minute}],'input history remains unchanged');
  assert.deepEqual(recordRoomWin(refreshed,start+8*minute),refreshed,'a duplicate win does not extend its timer');
  assert.throws(()=>recordRoomWin(refreshed,start+7*minute),/time order/);
  const later=recordRoomWin(refreshed,start+20*minute);
  assert.equal(later.length,2,'an expired bonus keeps separate history for delayed settlement');
  assert.equal(earningsMultiplier({room:later,global:[]},start+19*minute).multiplier,1);
});

test('the global event lasts thirty minutes and combines with the room rate at a 3x cap',()=>{
  const global=globalEarningsEvent(start),room=recordRoomWin([],start+5*minute);
  const events={room,global:[global]};
  assert.equal(global.endsAtMs-start,GLOBAL_EVENT_DURATION_MS);
  assert.equal(earningsMultiplier(events,start-1).multiplier,1);
  assert.equal(earningsMultiplier(events,start).multiplier,2);
  assert.equal(earningsMultiplier(events,start+5*minute).multiplier,3);
  assert.equal(earningsMultiplier(events,start+15*minute).multiplier,2);
  assert.equal(earningsMultiplier(events,start+30*minute).multiplier,1);
  assert.equal(earningsMultiplier({room,global:[global,globalEarningsEvent(start+minute)]},start+6*minute).multiplier,3,'overlap does not stack duplicate events');
  assert.equal(activityPayout(2150,'delivery',start+5*minute,events),6450);
  assert.equal(activityPayout(2150,'delivery',start,events),4300);
  assert.equal(activityPayout(2150,'delivery',start+5*minute,{room,global:[]}),3225);
});

test('only eligible repeatable earnings receive the current payout-time multiplier',()=>{
  const events={room:recordRoomWin([],start),global:[globalEarningsEvent(start)]};
  const included:EarningsSource[]=['pickup','delivery','dome-match','race','parking','scenic','cab'];
  const excluded:EarningsSource[]=['achievement','check-in','checkpoint','transfer','sale','gift','loan','refund','supply'];
  for(const source of included){assert.equal(bonusEligible(source),true);assert.equal(activityPayout(101,source,start,events),303,source);}
  for(const source of excluded){assert.equal(bonusEligible(source),false);assert.equal(activityPayout(101,source,start,events),101,source);}
  assert.equal(activityPayout(101,'delivery',start,{room:events.room,global:[]}),152,'half dollars round up for discrete payouts');
  assert.equal(activityPayout(101,'delivery',start+ROOM_WIN_DURATION_MS,events),202,'the rate at payment decides the multiplier');
  assert.throws(()=>bonusEligible('unknown' as EarningsSource),/Unknown/);
});

test('cab pay prorates event starts, ends, overlapping windows, and settlement splits without rounding drift',()=>{
  // 5 minutes base, 5 global, 10 combined, 15 global, 25 base = 60 min total.
  const events={room:recordRoomWin([],start+10*minute),global:[globalEarningsEvent(start+5*minute)]};
  const whole=cabAccrual(15_000,start,start+60*minute,events);
  assert.deepEqual(whole,{amount:25_000,remainder:0});
  const cuts=[0,7,12,19,22,35,45,60].map(m=>start+m*minute);
  let amount=0,remainder=0;
  for(let i=1;i<cuts.length;i++){
    const part=cabAccrual(15_000,cuts[i-1],cuts[i],events,remainder);
    amount+=part.amount;remainder=part.remainder;
  }
  assert.deepEqual({amount,remainder},whole);
  // Overlapping developer events never compound; their union covers 35 minutes.
  const overlapping={room:[],global:[globalEarningsEvent(start),globalEarningsEvent(start+5*minute)]};
  assert.deepEqual(cabAccrual(3_600,start,start+60*minute,overlapping),{amount:5_700,remainder:0});
  const disjointRoom=recordRoomWin(recordRoomWin([],start+10*minute),start+30*minute);
  const multiple={room:disjointRoom,global:[globalEarningsEvent(start+5*minute),globalEarningsEvent(start+20*minute)]};
  assert.deepEqual(cabAccrual(1_200,start,start+60*minute,multiple),{amount:2_500,remainder:0},'separate room wins and overlapping global events are counted once');
  const tiny=cabAccrual(1,start,start+1,none);
  assert.deepEqual(tiny,{amount:0,remainder:2});
  assert.deepEqual(cabAccrual(1,start+1,start+3_600_000,none,tiny.remainder),{amount:1,remainder:0});
});

test('invalid timestamps, windows, amounts, remainders and overflow fail closed',()=>{
  for(const bad of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>globalEarningsEvent(bad),RangeError);
  assert.throws(()=>globalEarningsEvent(8_640_000_000_000_000-GLOBAL_EVENT_DURATION_MS+1),RangeError);
  assert.throws(()=>earningsMultiplier({room:[{startsAtMs:start,endsAtMs:start+1}],global:[]},start),/duration/);
  assert.throws(()=>earningsMultiplier({room:[],global:[{startsAtMs:start,endsAtMs:start+1}]},start),/duration/);
  assert.throws(()=>activityPayout(-1,'delivery',start,none),RangeError);
  assert.throws(()=>activityPayout(1.5,'delivery',start,none),RangeError);
  assert.throws(()=>activityPayout(Number.MAX_SAFE_INTEGER,'delivery',start,{room:[],global:[globalEarningsEvent(start)]}),/safe integer/);
  assert.throws(()=>cabAccrual(1,start+1,start,none),/before/);
  assert.throws(()=>cabAccrual(1,start,start+1,none,CAB_REMAINDER_DENOMINATOR),/remainder/);
  assert.throws(()=>cabAccrual(Number.MAX_SAFE_INTEGER,start,start+2*3_600_000,none),/safe integer/);
});
