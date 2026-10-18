import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultBindings,loadBindings,saveBindings,keyLabel} from '../src/key-bindings';

test('keyboard bindings save, load and reject malformed or conflicting data',()=>{
  let stored:string|null=null;
  Object.assign(globalThis,{localStorage:{getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}}});
  const keys=defaultBindings();keys.forward=['KeyI','ArrowUp'];assert.equal(saveBindings(keys),true);assert.deepEqual(loadBindings(),keys);
  keys.reverse=['KeyI',''];stored=JSON.stringify(keys);assert.deepEqual(loadBindings(),defaultBindings());
  stored='{broken';assert.deepEqual(loadBindings(),defaultBindings());assert.equal(keyLabel('ArrowLeft'),'←');
  Object.assign(globalThis,{localStorage:{getItem:()=>{throw Error();},setItem:()=>{throw Error();}}});
  assert.deepEqual(loadBindings(),defaultBindings());assert.equal(saveBindings(keys),false);
});
