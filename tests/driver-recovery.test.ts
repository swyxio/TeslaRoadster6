import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVER_PENDING_KEY, DRIVER_RECOVERY_KEY, DRIVER_REMEMBER_KEY, readDriverRecovery, stageDriverRecovery, confirmDriverRecovery, setDriverRemember, forgetDriverRecovery } from '../src/driver-recovery';

function store() {
  const entries=new Map<string,string>();
  return { getItem:(key:string)=>entries.get(key)??null, setItem:(key:string,value:string)=>{entries.set(key,value);}, removeItem:(key:string)=>{entries.delete(key);} };
}
test('a first save is staged before binding and promoted only after confirmation',()=>{
  const storage=store();
  assert.equal(stageDriverRecovery(storage,'first'),'ok');
  assert.deepEqual(readDriverRecovery(storage),{remember:true,remembered:undefined,pending:'first',available:true});
  assert.deepEqual(confirmDriverRecovery(storage,'first'),{saved:true,cleared:true});
  assert.deepEqual(readDriverRecovery(storage),{remember:true,remembered:'first',pending:undefined,available:true});
});
test('a pending switch preserves the previous driver through rejection and reload',()=>{
  const storage=store();storage.setItem(DRIVER_RECOVERY_KEY,'old');
  assert.equal(stageDriverRecovery(storage,'new'),'ok');
  assert.deepEqual(readDriverRecovery(storage),{remember:true,remembered:'old',pending:'new',available:true});
  assert.equal(stageDriverRecovery(storage,'other'),'pending');
  assert.equal(stageDriverRecovery(storage,'old'),'ok');
  assert.deepEqual(readDriverRecovery(storage),{remember:true,remembered:'old',pending:'new',available:true});
  assert.deepEqual(confirmDriverRecovery(storage,'new'),{saved:true,cleared:true});
  assert.equal(storage.getItem(DRIVER_RECOVERY_KEY),'new');assert.equal(storage.getItem(DRIVER_PENDING_KEY),null);
});
test('reload after a lost binding reply retains the pending code for retry',()=>{
  const storage=store();assert.equal(stageDriverRecovery(storage,'crash-window'),'ok');
  const restart=readDriverRecovery(storage);
  assert.equal(restart.pending,'crash-window');assert.equal(restart.remembered,undefined);
  assert.equal(stageDriverRecovery(storage,restart.pending!),'ok');
  assert.deepEqual(confirmDriverRecovery(storage,restart.pending!),{saved:true,cleared:true});
});
test('storage failures are reported and do not replace an earlier code',()=>{
  const storage=store();storage.setItem(DRIVER_RECOVERY_KEY,'old');
  const blocked={...storage,setItem(){throw new Error('blocked');}};
  assert.equal(stageDriverRecovery(blocked,'new'),'unavailable');
  assert.deepEqual(confirmDriverRecovery(blocked,'new'),{saved:false,cleared:false});
  assert.equal(storage.getItem(DRIVER_RECOVERY_KEY),'old');
  const unreadable={...storage,getItem(){throw new Error('blocked');}};
  assert.equal(readDriverRecovery(unreadable).available,false);
  assert.equal(stageDriverRecovery(unreadable,'new'),'unavailable');
});
test('remember off hides and removes recovery material; deliberate guest clears both codes',()=>{
  const storage=store();storage.setItem(DRIVER_RECOVERY_KEY,'old');storage.setItem(DRIVER_PENDING_KEY,'new');
  assert.equal(setDriverRemember(storage,false),true);assert.equal(storage.getItem(DRIVER_REMEMBER_KEY),'off');
  assert.deepEqual(readDriverRecovery(storage),{remember:false,available:true});
  assert.equal(storage.getItem(DRIVER_RECOVERY_KEY),null);assert.equal(storage.getItem(DRIVER_PENDING_KEY),null);
  assert.equal(setDriverRemember(storage,true),true);storage.setItem(DRIVER_RECOVERY_KEY,'old');storage.setItem(DRIVER_PENDING_KEY,'new');
  assert.equal(forgetDriverRecovery(storage),true);assert.equal(storage.getItem(DRIVER_RECOVERY_KEY),null);assert.equal(storage.getItem(DRIVER_PENDING_KEY),null);
});
