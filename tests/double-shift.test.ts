import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../src/controls';
import {listenForDoubleShift} from '../src/double-shift';

function environment(){
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  const win=new EventTarget() as EventTarget & {matches:()=>boolean};win.matches=()=>false;
  const doc=new EventTarget() as EventTarget & {hidden:boolean;activeElement:EventTarget|null;dialogOpen:boolean;querySelector:()=>object|null;querySelectorAll:()=>[]};
  doc.hidden=false;doc.activeElement=null;doc.dialogOpen=false;doc.querySelector=()=>doc.dialogOpen?{}:null;doc.querySelectorAll=()=>[];
  Object.assign(globalThis,{window:win,document:doc});
  let time=0;const pending=new Set<{at:number;callback:()=>void}>();
  const at=(next:number)=>{for(const item of [...pending].sort((a,b)=>a.at-b.at)){if(item.at<=next&&pending.delete(item)){time=item.at;item.callback();}}time=next;};
  const schedule=(callback:()=>void,delay:number)=>{const item={at:time+delay,callback};pending.add(item);return()=>{pending.delete(item);};};
  const key=(type:'keydown'|'keyup',code='ShiftLeft',properties:Record<string,unknown>={})=>{const event=new Event(type,{cancelable:true});for(const [name,value] of Object.entries({code,repeat:false,ctrlKey:false,altKey:false,metaKey:false,...properties}))Object.defineProperty(event,name,{value});win.dispatchEvent(event);return event;};
  const tap=(code='ShiftLeft')=>{key('keydown',code);at(time+50);key('keyup',code);at(time+50);};
  return {window:win,document:doc,key,tap,at,now:()=>time,schedule,restore:()=>Object.assign(globalThis,{window:oldWindow,document:oldDocument})};
}

test('double Shift waits for a possible third tap without consuming boost',()=>{
  const env=environment();try{
    const controls=new Controls(()=>[]);controls.enabled=true;let doubles=0,triples=0;
    const shortcut=listenForDoubleShift({enabled:()=>controls.enabled,allowed:()=>true,now:env.now,schedule:env.schedule,onDoubleTap:()=>{doubles++;assert.equal(controls.read().boost,false);},onTripleTap:()=>triples++});
    assert.equal(env.key('keydown').defaultPrevented,false);assert.equal(controls.read().boost,true);env.at(50);env.key('keyup');assert.equal(controls.read().boost,false);
    env.at(100);env.key('keydown');env.at(150);env.key('keyup');assert.equal(doubles,0);
    env.at(499);assert.equal(doubles,0);env.at(500);assert.equal(doubles,1);assert.equal(triples,0);shortcut.dispose();
  }finally{env.restore();}
});

test('triple Shift requests only the charger and normal controls stay immediate',()=>{
  const env=environment();try{
    const controls=new Controls(()=>[]);controls.enabled=true;let doubles=0,triples=0;
    const shortcut=listenForDoubleShift({enabled:()=>true,allowed:()=>true,now:env.now,schedule:env.schedule,onDoubleTap:()=>doubles++,onTripleTap:()=>triples++});
    env.tap();env.tap();env.key('keydown');assert.equal(controls.read().boost,true);env.at(env.now()+50);env.key('keyup');assert.equal(triples,1);env.at(env.now()+500);assert.equal(doubles,0);shortcut.dispose();
  }finally{env.restore();}
});

test('long holds, mismatched keys, focus, dialogs and rebinding cancel a pending shortcut',()=>{
  const env=environment();try{
    let enabled=true,allowed=true,doubles=0,triples=0;
    const shortcut=listenForDoubleShift({enabled:()=>enabled,allowed:()=>allowed,now:env.now,schedule:env.schedule,onDoubleTap:()=>doubles++,onTripleTap:()=>triples++});
    env.key('keydown');env.at(301);env.key('keyup');env.tap();env.window.dispatchEvent(new Event('blur'));env.tap();env.document.dispatchEvent(new Event('pointerdown'));
    env.tap('ShiftLeft');env.tap('ShiftRight');env.document.dispatchEvent(new Event('focusin'));
    env.tap();env.tap();env.document.dialogOpen=true;env.at(env.now()+500);env.document.dialogOpen=false;
    env.tap();env.tap();allowed=false;env.at(env.now()+500);allowed=true;
    env.tap();env.tap();enabled=false;env.at(env.now()+500);enabled=true;
    env.tap();env.tap();shortcut.reset();env.at(env.now()+500);
    assert.equal(doubles,0);assert.equal(triples,0);shortcut.dispose();
  }finally{env.restore();}
});

test('repeating a held Shift after controls clear does not re-arm boost or a shortcut',()=>{
  const env=environment();try{
    const controls=new Controls(()=>[]);controls.enabled=true;let calls=0;
    const shortcut=listenForDoubleShift({enabled:()=>true,allowed:()=>true,now:env.now,schedule:env.schedule,onDoubleTap:()=>calls++,onTripleTap:()=>calls++});
    env.key('keydown');assert.equal(controls.read().boost,true);controls.clear();
    env.key('keydown','ShiftLeft',{repeat:true});assert.equal(controls.read().boost,false);
    env.key('keyup');env.at(600);assert.equal(calls,0);shortcut.dispose();
  }finally{env.restore();}
});
