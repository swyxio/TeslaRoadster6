import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../src/controls';
import {makeEntity,step,type World} from '../shared/game';
import {initialSoccer} from '../shared/soccer';

class FakeButton extends EventTarget {
  dataset:{control:string};
  classList={add:()=>{},remove:()=>{}};
  constructor(control:string){super();this.dataset={control};}
  setPointerCapture(_id:number){}
}
function pointer(type:string,id:number){const event=new Event(type,{cancelable:true});Object.defineProperty(event,'pointerId',{value:id});return event;}
function click(detail:number){const event=new Event('click');Object.defineProperty(event,'detail',{value:detail});return event;}
test('quick touch jumps and flips survive release without interrupting steering',()=>{
  const steering=new FakeButton('KeyA'),drive=new FakeButton('KeyW'),jump=new FakeButton('KeyE'),flip=new FakeButton('KeyX');
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeDocument.hidden=false;fakeDocument.querySelectorAll=(selector)=>selector==='[data-control]'?[steering,drive,jump,flip]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  steering.dispatchEvent(pointer('pointerdown',1));jump.dispatchEvent(pointer('pointerdown',2));jump.dispatchEvent(pointer('pointerup',2));jump.dispatchEvent(click(1));
  assert.equal(controls.read().jump,1);assert.equal(controls.read().steer,1);
  controls.airborne=true;drive.dispatchEvent(pointer('pointerdown',3));flip.dispatchEvent(pointer('pointerdown',4));
  assert.equal(controls.read().throttle,1);assert.equal(controls.read().flip,1);assert.equal(controls.read().steer,1);
  drive.dispatchEvent(pointer('pointerup',3));flip.dispatchEvent(pointer('pointerup',4));
  jump.dispatchEvent(click(0));assert.equal(controls.read().jump,2);
  controls.clear();assert.equal(controls.read().steer,0);
});

test('Space brakes on the road and flips in the air, E jumps, and touch brake combines with steering',()=>{
  const steering=new FakeButton('KeyA'),brake=new FakeButton('Space');
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=(selector)=>selector==='[data-control]'?[steering,brake]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const key=(type:string,code:string)=>{const e=new Event(type);Object.defineProperty(e,'code',{value:code});return e;};
  fakeWindow.dispatchEvent(key('keydown','Space'));assert.equal(controls.read().brake,true);assert.equal(controls.read().jump,0);
  fakeWindow.dispatchEvent(key('keyup','Space'));assert.equal(controls.read().brake,false);
  fakeWindow.dispatchEvent(key('keydown','KeyE'));fakeWindow.dispatchEvent(key('keyup','KeyE'));assert.equal(controls.read().jump,1);assert.equal(controls.read().brake,false);
  controls.airborne=true;fakeWindow.dispatchEvent(key('keydown','Space'));fakeWindow.dispatchEvent(key('keyup','Space'));assert.equal(controls.read().flip,1);
  steering.dispatchEvent(pointer('pointerdown',1));brake.dispatchEvent(pointer('pointerdown',2));
  assert.equal(controls.read().steer,1);assert.equal(controls.read().brake,true);
  brake.dispatchEvent(pointer('pointercancel',2));assert.equal(controls.read().brake,false);assert.equal(controls.read().steer,1);
});


test('touch jump after keyboard jump and touch brake reach the simulation',()=>{
  const jump=new FakeButton('KeyE'),brake=new FakeButton('Space');
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=selector=>selector==='[data-control]'?[jump,brake]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const car=makeEntity('car','roadster',0,0,'driver');
  const world:World={entities:[car],players:[],pickups:[],time:0,soccer:initialSoccer()};
  const key=new Event('keydown');Object.defineProperty(key,'code',{value:'KeyE'});fakeWindow.dispatchEvent(key);
  step(world,new Map([['driver',controls.read()]]),.05);assert.equal(car.air,76);assert.equal(car.lastJump,1);
  jump.dispatchEvent(pointer('pointerdown',1));jump.dispatchEvent(pointer('pointerup',1));jump.dispatchEvent(click(1));
  step(world,new Map([['driver',controls.read()]]),.05);assert.equal(car.air,52);assert.equal(car.lastJump,2);
  Object.assign(car,{x:0,z:0,y:0,vy:0,supportId:'ground',speed:20});
  brake.dispatchEvent(pointer('pointerdown',2));step(world,new Map([['driver',controls.read()]]),.05);
  assert.ok(car.speed<19);brake.dispatchEvent(pointer('pointerup',2));assert.equal(controls.read().brake,false);
});

test('Tab navigates the HUD and Space activates a focused button instead of braking',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  let buttonFocused=false;
  fakeWindow.matches=selector=>buttonFocused&&selector==='button,a';fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const key=(code:string)=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'code',{value:code});return event;};
  const tab=key('Tab');fakeWindow.dispatchEvent(tab);assert.equal(tab.defaultPrevented,false);
  buttonFocused=true;const space=key('Space');fakeWindow.dispatchEvent(space);assert.equal(space.defaultPrevented,false);assert.equal(controls.read().brake,false);
  buttonFocused=false;const brake=key('Space');fakeWindow.dispatchEvent(brake);assert.equal(brake.defaultPrevented,true);assert.equal(controls.read().brake,true);
});
