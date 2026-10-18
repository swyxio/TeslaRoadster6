import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/audio';
import { addPlayer, createWorld } from '../shared/game';

function fakeAudio(initial:'running'|'suspended'='suspended'){
  const calls={constructed:0,nodes:0,started:0,resumed:0};
  class Param {
    value=0;
    setTargetAtTime(){} setValueAtTime(){} exponentialRampToValueAtTime(){}
  }
  class Node {
    gain=new Param();frequency=new Param();pan=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();
    type='';buffer:unknown;loop=false;onended:unknown;
    connect(){return this;} disconnect(){} start(){calls.started++;} stop(){}
  }
  class Context {
    state=initial;currentTime=0;sampleRate=48000;destination=new Node();
    constructor(){calls.constructed++;}
    createDynamicsCompressor(){calls.nodes++;return new Node();}
    createGain(){calls.nodes++;return new Node();}
    createBiquadFilter(){calls.nodes++;return new Node();}
    createBuffer(){calls.nodes++;return {getChannelData:()=>new Float32Array(this.sampleRate)};}
    createBufferSource(){calls.nodes++;return new Node();}
    createOscillator(){calls.nodes++;return new Node();}
    createStereoPanner(){calls.nodes++;return new Node();}
    async resume(){calls.resumed++;this.state='running';}
    async suspend(){this.state='suspended';}
  }
  return {calls,Context};
}

for(const initial of ['running','suspended'] as const)test(`preparation is silent with an initially ${initial} context`,async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext'),fake=fakeAudio(initial);
  Object.defineProperty(globalThis,'AudioContext',{value:fake.Context,configurable:true});
  try{
    const audio=new GameAudio(),world=createWorld(),player=addPlayer(world,'p','Driver');
    audio.prepare();audio.prepare();
    audio.update(world,player.id,true);audio.play('pickup');await audio.visibility(false);
    assert.deepEqual(fake.calls,{constructed:1,nodes:0,started:0,resumed:0},'loading cannot create or play the graph');
    assert.equal(await audio.unlock(),true);
    assert.ok(fake.calls.nodes>0);assert.ok(fake.calls.started>0);
    assert.equal(fake.calls.resumed,initial==='suspended'?1:0);
    const nodes=fake.calls.nodes;
    assert.equal(await audio.unlock(),true);assert.equal(fake.calls.nodes,nodes,'later gestures reuse the graph');
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');
  }
});

test('a failed context preparation retries when the player next interacts',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext'),fake=fakeAudio();
  let attempts=0;
  class UnavailableOnce extends fake.Context {
    constructor(){if(++attempts===1)throw new Error('temporarily unavailable');super();}
  }
  Object.defineProperty(globalThis,'AudioContext',{value:UnavailableOnce,configurable:true});
  try{
    const audio=new GameAudio();audio.prepare();
    assert.equal(audio.initialized,false);
    assert.equal(await audio.unlock(),true);
    assert.equal(attempts,2);assert.equal(fake.calls.resumed,1);
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');
  }
});
