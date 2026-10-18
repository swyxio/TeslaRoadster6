import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Controls} from '../src/controls';
import {makeEntity,createWorld,step,type World} from '../shared/game';

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
  const edges:{kind:string;id:number}[]=[];controls.onEdge=(kind,id)=>edges.push({kind,id});
  steering.dispatchEvent(pointer('pointerdown',1));jump.dispatchEvent(pointer('pointerdown',2));jump.dispatchEvent(pointer('pointerup',2));jump.dispatchEvent(click(1));
  assert.equal(controls.read().jump,1);assert.equal(controls.read().steer,1);
  controls.airborne=true;drive.dispatchEvent(pointer('pointerdown',3));flip.dispatchEvent(pointer('pointerdown',4));
  assert.equal(controls.read().throttle,1);assert.equal(controls.read().flip,1);assert.equal(controls.read().steer,1);
  drive.dispatchEvent(pointer('pointerup',3));flip.dispatchEvent(pointer('pointerup',4));
  jump.dispatchEvent(click(0));assert.equal(controls.read().jump,2);
  assert.deepEqual(edges,[{kind:'jump',id:1},{kind:'flip',id:1},{kind:'jump',id:2}], 'each actual press is emitted exactly once');
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
  assert.equal(controls.read().flip,0,'road braking does not queue a flip');
  controls.airborne=true;fakeWindow.dispatchEvent(key('keydown','Space'));fakeWindow.dispatchEvent(key('keyup','Space'));assert.equal(controls.read().flip,1);
  fakeWindow.dispatchEvent(key('keydown','KeyX'));fakeWindow.dispatchEvent(key('keyup','KeyX'));assert.equal(controls.read().flip,2);
  fakeWindow.dispatchEvent(key('keydown','KeyW'));assert.equal(controls.read().throttle,1);
  fakeWindow.dispatchEvent(key('keyup','KeyW'));assert.equal(controls.read().hover,false);
  steering.dispatchEvent(pointer('pointerdown',1));brake.dispatchEvent(pointer('pointerdown',2));
  assert.equal(controls.read().steer,1);assert.equal(controls.read().brake,true);
  brake.dispatchEvent(pointer('pointercancel',2));assert.equal(controls.read().brake,false);assert.equal(controls.read().steer,1);
});

test('a Space tap immediately after jump flips even before the HUD updates',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const car=makeEntity('car','roadster',0,0,'driver');
  const world:World={...createWorld(),entities:[car],players:[],pickups:[],time:0};
  for(const code of ['KeyE','Space']){const event=new Event('keydown');Object.defineProperty(event,'code',{value:code});fakeWindow.dispatchEvent(event);}
  assert.equal(controls.airborne,false);
  step(world,new Map([['driver',controls.read()]]),.05);
  assert.equal(car.supportId,null);assert.ok(car.flipRemaining>0);assert.equal(car.air,89.5);
});

test('braking before a jump in the same tick does not trigger a flip',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const car=makeEntity('car','roadster',0,0,'driver');
  const world:World={...createWorld(),entities:[car],players:[],pickups:[],time:0};
  for(const code of ['Space','KeyE']){const event=new Event('keydown');Object.defineProperty(event,'code',{value:code});fakeWindow.dispatchEvent(event);}
  step(world,new Map([['driver',controls.read()]]),.05);
  assert.equal(car.supportId,null);assert.equal(car.flipRemaining,0);assert.equal(car.air,94);
});

test('pending jump preserves flip until acknowledged, even with a delayed snapshot',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const key=(type:string,code:string)=>{const event=new Event(type);Object.defineProperty(event,'code',{value:code});fakeWindow.dispatchEvent(event);};
  key('keydown','KeyE');key('keyup','KeyE');
  controls.observeFlight(false,0); // A stale grounded snapshot does not cancel the pending jump.
  key('keydown','Space');key('keyup','Space');assert.equal(controls.read().flip,1);
  controls.observeFlight(false,1); // The jump was processed but could not launch.
  key('keydown','Space');key('keyup','Space');assert.equal(controls.read().flip,1);
  controls.observeFlight(true,1);key('keydown','Space');assert.equal(controls.read().flip,2);
});


test('touch jump after keyboard jump and touch brake reach the simulation',()=>{
  const jump=new FakeButton('KeyE'),brake=new FakeButton('Space');
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=selector=>selector==='[data-control]'?[jump,brake]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const car=makeEntity('car','roadster',0,0,'driver');
  const world:World={...createWorld(),entities:[car],players:[],pickups:[],time:0};
  const key=new Event('keydown');Object.defineProperty(key,'code',{value:'KeyE'});fakeWindow.dispatchEvent(key);
  step(world,new Map([['driver',controls.read()]]),.05);assert.equal(car.air,94);assert.equal(car.lastJump,1);
  jump.dispatchEvent(pointer('pointerdown',1));jump.dispatchEvent(pointer('pointerup',1));jump.dispatchEvent(click(1));
  step(world,new Map([['driver',controls.read()]]),.05);assert.equal(car.air,88);assert.equal(car.lastJump,2);
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

test('custom keyboard bindings preserve touch controls and browser shortcuts',()=>{
  const steering=new FakeButton('KeyA');
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=selector=>selector==='[data-control]'?[steering]:[];
  Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;controls.bindings.forward=['KeyI',''];
  const key=(code:string,ctrl=false)=>{const event=new Event('keydown',{cancelable:true});Object.defineProperties(event,{code:{value:code},ctrlKey:{value:ctrl}});fakeWindow.dispatchEvent(event);return event;};
  const shortcut=key('KeyW',true);assert.equal(shortcut.defaultPrevented,false);assert.equal(controls.read().throttle,0);
  key('KeyW');assert.equal(controls.read().throttle,0);key('KeyI');assert.equal(controls.read().throttle,1);
  controls.bindings.left=['KeyZ',''];steering.dispatchEvent(pointer('pointerdown',1));assert.equal(controls.read().steer,1);
});

test('standard gamepad drives, brakes, reverses, flies, and triggers tricks once per press',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const buttons=Array.from({length:16},()=>({pressed:false,value:0}));const axes=[0,0,0,0];
  const pad={connected:true,mapping:'standard',index:0,buttons,axes} as Gamepad;
  let connected=true,now=0;const controls=new Controls(()=>connected?[pad]:[],()=>now);controls.enabled=true;
  controls.read();axes[0]=-.575;buttons[7].value=.75;
  let input=controls.read();assert.ok(Math.abs(input.steer-.5)<.001);assert.equal(input.throttle,.75);
  buttons[0].pressed=true;buttons[2].pressed=true;buttons[1].pressed=true;
  input=controls.read();assert.equal(input.jump,1);assert.equal(input.flip,1);assert.equal(input.boost,true);assert.equal(input.hover,false);now=251;assert.equal(controls.read().hover,true);
  assert.equal(controls.read().jump,1);assert.equal(controls.read().flip,1);
  buttons[0].pressed=false;buttons[2].pressed=false;controls.read();buttons[0].pressed=true;assert.equal(controls.read().jump,2);
  controls.observeFlight(false,2,10);buttons[7].value=0;buttons[6].value=1;input=controls.read();assert.equal(input.brake,true);assert.equal(input.throttle,0);
  controls.observeFlight(false,2,0);input=controls.read();assert.equal(input.brake,false);assert.equal(input.throttle,-1);
  controls.observeFlight(true,2,10);input=controls.read();assert.equal(input.brake,false);assert.equal(input.throttle,-1);
  connected=false;input=controls.read();assert.equal(input.throttle,0);assert.equal(input.steer,0);
  connected=true;assert.equal(controls.read().throttle,0,'reconnect requires controls to return to neutral');
  axes.fill(0);buttons.forEach(button=>{button.value=0;button.pressed=false;});controls.read();buttons[7].value=1;assert.equal(controls.read().throttle,1);
  controls.enabled=false;assert.equal(controls.read().throttle,0);controls.enabled=true;assert.equal(controls.read().throttle,0,'resuming requires controls to return to neutral');
});

test('controller action edges pause driving immediately when a menu opens',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const buttons=Array.from({length:16},()=>({pressed:false,value:0}));const pad={connected:true,mapping:'standard',index:0,buttons,axes:[0,0,0,0]} as Gamepad;
  const controls=new Controls(()=>[pad]);controls.enabled=true;let menus=0;controls.onAction=action=>{if(action==='menu'){menus++;controls.enabled=false;}};
  controls.read();buttons[9].pressed=true;buttons[7].value=1;assert.equal(controls.read().throttle,0);assert.equal(menus,1);
  controls.enabled=true;controls.read();assert.equal(menus,1,'held menu button does not fire twice');
});

test('action callbacks can snapshot gamepad edge counters without rereading the controller',()=>{
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const buttons=Array.from({length:16},()=>({pressed:false,value:0}));const pad={connected:true,mapping:'standard',index:0,buttons,axes:[0,0,0,0]} as Gamepad;
  let reads=0;const controls=new Controls(()=>{reads++;return [pad];});controls.enabled=true;
  let seen:{jump:number;flip:number}|undefined;
  controls.onAction=action=>{if(action==='reset')seen=controls.edgeCounters();};
  controls.read();buttons[0].pressed=true;buttons[14].pressed=true;controls.read();
  assert.deepEqual(seen,{jump:1,flip:0});assert.equal(reads,2);
  controls.read();assert.deepEqual(controls.edgeCounters(),{jump:1,flip:0},'held controls do not create another edge');
});

test('tap jump then hold the same rebound key or touch button to hover',()=>{
  const jump=new FakeButton('KeyE'),drive=new FakeButton('KeyW');
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=selector=>selector==='[data-control]'?[jump,drive]:[];Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  let now=0;const controls=new Controls(()=>[],()=>now);controls.enabled=true;controls.bindings.jump=['KeyI',''];
  const key=(type:string,code:string)=>{const event=new Event(type);Object.defineProperty(event,'code',{value:code});fakeWindow.dispatchEvent(event);};
  key('keydown','KeyI');assert.equal(controls.read().jump,1);assert.equal(controls.read().hover,false);
  now=249;assert.equal(controls.read().hover,false);now=250;assert.equal(controls.read().hover,true);
  key('keydown','KeyW');assert.equal(controls.read().throttle,1);key('keyup','KeyI');assert.equal(controls.read().hover,false);
  jump.dispatchEvent(pointer('pointerdown',3));assert.equal(controls.read().jump,2);now=501;assert.equal(controls.read().hover,true);
  jump.dispatchEvent(pointer('pointercancel',3));assert.equal(controls.read().hover,false);
  jump.dispatchEvent(pointer('pointerdown',4));assert.equal(controls.read().hover,false);controls.clear();now=1000;assert.equal(controls.read().hover,false);
});


test('held driving keys stay cleared until released and pressed again',()=>{
  const fakeWindow=new EventTarget() as EventTarget&{matches:(s:string)=>boolean},fakeDocument=new EventTarget() as EventTarget&{hidden:boolean;querySelectorAll:(s:string)=>FakeButton[]};
  fakeWindow.matches=()=>false;fakeDocument.hidden=false;fakeDocument.querySelectorAll=()=>[];Object.assign(globalThis,{window:fakeWindow,document:fakeDocument});
  const controls=new Controls();controls.enabled=true;
  const key=(type:string,code:string,repeat=false)=>{const event=new Event(type);Object.defineProperties(event,{code:{value:code},repeat:{value:repeat}});fakeWindow.dispatchEvent(event);};
  key('keydown','KeyW');assert.equal(controls.read().throttle,1);
  key('keydown','KeyW',true);assert.equal(controls.read().throttle,1,'ordinary repeat preserves a held key');
  controls.clear();assert.equal(controls.read().throttle,0);
  key('keydown','KeyW',true);assert.equal(controls.read().throttle,0,'repeat cannot cancel a route after controls are cleared');
  key('keyup','KeyW');key('keydown','KeyW');assert.equal(controls.read().throttle,1,'a fresh press resumes manual driving');
});
