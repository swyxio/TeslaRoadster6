import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../src/controls';

class FakeButton extends EventTarget {
  dataset:{control:string};
  classList={add:()=>{},remove:()=>{}};
  constructor(control:string){super();this.dataset={control};}
  setPointerCapture(_id:number){}
}
function pointer(type:string,id:number){const event=new Event(type,{cancelable:true});Object.defineProperty(event,'pointerId',{value:id});return event;}
function click(detail:number){const event=new Event('click');Object.defineProperty(event,'detail',{value:detail});return event;}
test('quick touch jumps and flips survive release without interrupting steering',()=>{
  const steering=new FakeButton('KeyA'),drive=new FakeButton('KeyW'),jump=new FakeButton('KeyJ');
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeDocument.hidden=false;fakeDocument.querySelectorAll=(selector)=>selector==='[data-control]'?[steering,drive,jump]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  steering.dispatchEvent(pointer('pointerdown',1));jump.dispatchEvent(pointer('pointerdown',2));jump.dispatchEvent(pointer('pointerup',2));jump.dispatchEvent(click(1));
  assert.equal(controls.read().jump,1);assert.equal(controls.read().steer,1);
  controls.airborne=true;drive.dispatchEvent(pointer('pointerdown',3));drive.dispatchEvent(pointer('pointerup',3));drive.dispatchEvent(click(1));
  assert.equal(controls.read().flip,1);assert.equal(controls.read().steer,1);
  jump.dispatchEvent(click(0));assert.equal(controls.read().jump,2);
  controls.clear();assert.equal(controls.read().steer,0);
});

test('Space brakes, J jumps, and touch brake combines with steering without sticking',()=>{
  const steering=new FakeButton('KeyA'),brake=new FakeButton('Space');
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=(selector)=>selector==='[data-control]'?[steering,brake]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const key=(type:string,code:string)=>{const e=new Event(type);Object.defineProperty(e,'code',{value:code});return e;};
  fakeWindow.dispatchEvent(key('keydown','Space'));assert.equal(controls.read().brake,true);assert.equal(controls.read().jump,0);
  fakeWindow.dispatchEvent(key('keyup','Space'));assert.equal(controls.read().brake,false);
  fakeWindow.dispatchEvent(key('keydown','KeyJ'));fakeWindow.dispatchEvent(key('keyup','KeyJ'));assert.equal(controls.read().jump,1);assert.equal(controls.read().brake,false);
  steering.dispatchEvent(pointer('pointerdown',1));brake.dispatchEvent(pointer('pointerdown',2));
  assert.equal(controls.read().steer,1);assert.equal(controls.read().brake,true);
  brake.dispatchEvent(pointer('pointercancel',2));assert.equal(controls.read().brake,false);assert.equal(controls.read().steer,1);
});
