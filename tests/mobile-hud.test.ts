import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMobileHud, writeMobileHud } from '../src/mobile-hud';

test('mobile panel choices default compact and persist independently',()=>{
  let stored:string|null=null;
  const storage={getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}};
  assert.deepEqual(readMobileHud(storage),{mission:false,map:false,instruments:false});
  writeMobileHud(storage,{mission:true,map:false,instruments:true});
  assert.deepEqual(readMobileHud(storage),{mission:true,map:false,instruments:true});
  stored='{"mission":true,"map":"yes","instruments":null}';
  assert.deepEqual(readMobileHud(storage),{mission:true,map:false,instruments:false});
});

test('unavailable or malformed storage leaves the HUD usable',()=>{
  const broken={getItem:():string=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  assert.deepEqual(readMobileHud(broken),{mission:false,map:false,instruments:false});
  assert.doesNotThrow(()=>writeMobileHud(broken,{mission:true,map:true,instruments:true}));
  assert.deepEqual(readMobileHud({getItem:()=>'{',setItem:()=>{}}),{mission:false,map:false,instruments:false});
});
