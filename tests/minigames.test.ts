import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { playerRace } from '../shared/race';

// Exercise the actual dialog controller with lightweight DOM nodes. The CSS
// import is inert in this Node test, just as it is for server-side rendering.
class Element {
  hidden=false; disabled=false; open=false; textContent=''; className=''; type=''; dataset:Record<string,string>={};
  onclick?:()=>void;
  children:Element[]=[];
  selectors=new Map<string,Element>();
  listeners=new Map<string,()=>void>();
  set innerHTML(_value:string){}
  setAttribute(_name:string,_value:string){}
  append(element:Element){this.children.push(element);}
  querySelector<T extends Element>(selector:string):T {return this.selectors.get(selector) as T;}
  querySelectorAll(selector:string){return selector==='[data-game]'?this.children:[];}
  addEventListener(event:string,callback:()=>void){this.listeners.set(event,callback);}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.get('close')?.();}
}

function fixture(){
  const dialog=new Element(),feedback=new Element(),close=new Element(),leaveCurrent=new Element();
  const games=Object.fromEntries(['dome','park','queue','short','oval'].map(game=>{
    const button=new Element();button.dataset.game=game;dialog.append(button);return [game,button];
  }));
  dialog.selectors.set('.minigames-feedback',feedback);dialog.selectors.set('.minigames-close',close);
  dialog.selectors.set('.minigames-leave',leaveCurrent);
  const context=new Element(),start=new Element(),leave=new Element();
  context.selectors.set('[data-command="start"]',start);context.selectors.set('[data-command="leave"]',leave);
  const domeLeave=new Element(),menu=new Element(),mission=new Element(),score=new Element();
  const elements:Record<string,Element>={minigames:menu,'mission-panel':mission,'dome-score':score};
  const document={body:new Element(),createElement:(tag:string)=>tag==='dialog'?dialog:tag==='div'?context:domeLeave,
    getElementById:(id:string)=>elements[id],querySelector:()=>dialog.open?dialog:null};
  const source=readFileSync(new URL('../src/minigames.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={};
  runInNewContext(compiled,{exports,document,performance:{now:()=>0},require:(path:string)=>path.endsWith('.css')?{}:{playerRace}});
  const world=(id:string)=>({players:[{id,entityId:'car'}],entities:[{id:'car',kind:'model-3',inDome:false}],parking:{rounds:[] as any[]},races:{rounds:[]}});
  const session={id:'online',room:'bay',status:'online',world:world('online'),action:()=>{},parkingAction:()=>{},raceAction:()=>{},enterMinigame:()=>undefined};
  const notices:string[]=[];
  const controller=exports.setupMinigames({session,controls:{clear:()=>{},enabled:true},closeDrawer:()=>{},canDrive:()=>true,notice:(value:string)=>notices.push(value)});
  return {session,world,controller,menu,games,dialog,feedback,start,leaveCurrent,notices};
}

test('pending mini-game requests survive snapshots but not a room switch',()=>{
  const f=fixture();f.menu.onclick!();f.games.park.onclick!();
  assert.equal(f.games.park.disabled,true);
  f.session.world={...f.session.world};f.controller.update();
  assert.equal(f.games.park.disabled,true,'a normal online snapshot is the same session');
  f.session.id='another';f.session.room='friends';f.session.world=f.world('another');f.controller.update();
  assert.equal(f.games.park.disabled,false);assert.equal(f.feedback.textContent,'');assert.deepEqual(f.notices,[]);
});

test('leaving state clears on a new room session',()=>{
  const f=fixture();
  f.controller.update();f.session.world.parking.rounds.push({mode:'park',phase:'active',hostId:'online',entrants:[{playerId:'online'}]});
  f.menu.onclick!();f.leaveCurrent.onclick!();assert.equal(f.games.park.disabled,true);
  f.session.id='another';f.session.room='friends';f.session.world=f.world('another');f.controller.update();
  assert.equal(f.games.park.disabled,false);assert.equal(f.feedback.textContent,'');assert.deepEqual(f.notices,[]);
});

test('starting state survives snapshots but clears on switching drives',()=>{
  const f=fixture();
  f.session.world.parking.rounds.push({mode:'queue',phase:'waiting',hostId:'online',openedAt:1,entrants:[{playerId:'online'}]});
  f.controller.update();f.start.onclick!();
  assert.equal(f.start.disabled,true);assert.equal(f.start.textContent,'Starting…');
  f.session.world={...f.session.world};f.controller.update();
  assert.equal(f.start.disabled,true,'an ordinary snapshot keeps the pending start');
  f.session.id='another';f.session.room='friends';f.session.world=f.world('another');f.controller.update();
  assert.equal(f.start.disabled,false);assert.equal(f.start.textContent,'Start now');assert.deepEqual(f.notices,[]);

  f.session.world.parking.rounds.push({mode:'queue',phase:'waiting',hostId:'another',openedAt:2,entrants:[{playerId:'another'}]});
  f.controller.update();f.start.onclick!();assert.equal(f.start.disabled,true);
  f.session.id='next';f.session.room='other';f.session.world=f.world('next');f.controller.update();
  assert.equal(f.start.disabled,false);assert.equal(f.games.queue.disabled,false);assert.deepEqual(f.notices,[]);
});

test('mini-game controls wait for confirmed start and leave, and recover after failure', async () => {
  // Exercise the real panel without a browser or a CSS loader.
  let source=await readFile(new URL('../src/minigames.ts',import.meta.url),'utf8');
  source=source.replace("import './minigames.css';",'')
    .replace("'../shared/race'",JSON.stringify(new URL('../shared/race.ts',import.meta.url).href));
  const js=ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
  const {setupMinigames}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

  class Element extends EventTarget {
    className='';textContent='';hidden=false;disabled=false;open=false;
    dataset:Record<string,string>={};onclick:(()=>void)|null=null;
    children:Element[]=[];selectors=new Map<string,Element>();games:Element[]=[];
    set innerHTML(_html:string){
      if(this.className==='minigames-dialog'){
        for(const name of ['.minigames-close','.minigames-feedback','.minigames-leave'])this.selectors.set(name,new Element());
        this.games=['dome','park','queue','short','oval'].map(game=>{const button=new Element();button.dataset.game=game;return button;});
      }else if(this.className==='minigames-context'){
        this.selectors.set('[data-command="start"]',new Element());this.selectors.set('[data-command="leave"]',new Element());
      }
    }
    append(...children:Element[]){this.children.push(...children);}
    setAttribute(){}
    querySelector(selector:string){return this.selectors.get(selector);}
    querySelectorAll(selector:string){return selector==='[data-game]'?this.games:[];}
    showModal(){this.open=true;}
    close(){this.open=false;this.dispatchEvent(new Event('close'));}
    click(){if(!this.disabled&&!this.hidden)this.onclick?.();}
  }
  const body=new Element(),panel=new Element(),score=new Element(),launcher=new Element();
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const oldPerformance=Object.getOwnPropertyDescriptor(globalThis,'performance');
  let now=1000;
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{
    body,createElement:()=>new Element(),querySelector:()=>null,
    getElementById:(id:string)=>({'mission-panel':panel,'dome-score':score,minigames:launcher})[id],
  }});
  try {
    const commands:string[]=[],notices:string[]=[];
    const world={players:[{id:'p',entityId:'car'}],entities:[{id:'car',kind:'model-3',inDome:false}],parking:{rounds:[] as any[]},races:{rounds:[] as any[]}};
    const session={id:'p',status:'online',world,enterMinigame:(game:string)=>commands.push(`enter:${game}`),
      parkingAction:(action:string)=>commands.push(`parking:${action}`),raceAction:(action:string,game:string)=>commands.push(`race:${action}:${game}`),action:(action:string)=>commands.push(action)};
    const controls={clear(){},enabled:true};
    const ui=setupMinigames({session,controls,closeDrawer(){},canDrive:()=>true,notice:(message:string)=>notices.push(message)});
    const dialog=body.children[0],context=panel.children[0];
    const start=context.querySelector('[data-command="start"]')!,leave=context.querySelector('[data-command="leave"]')!;
    launcher.click();dialog.games.find(button=>button.dataset.game==='queue')!.click();
    assert.deepEqual(commands,['enter:queue']);
    assert.ok(dialog.games.every(button=>button.disabled));
    world.parking.rounds=[{mode:'queue',phase:'waiting',hostId:'p',openedAt:1,entrants:[{playerId:'p'}]}];
    ui.update();
    assert.equal(dialog.open,false);assert.equal(start.hidden,false);
    start.click();start.click();
    assert.deepEqual(commands,['enter:queue','parking:start']);
    assert.equal(start.textContent,'Starting…');assert.ok(start.disabled&&leave.disabled);
    assert.ok(!notices.includes('Game started.'));
    world.parking.rounds[0].phase='active';ui.update();
    assert.equal(notices.at(-1),'Game started.');assert.equal(leave.disabled,false);
    leave.click();leave.click();
    assert.equal(commands.at(-1),'parking:leave');assert.equal(commands.filter(command=>command==='parking:leave').length,1);
    assert.equal(leave.textContent,'Leaving…');
    world.parking.rounds=[];ui.update();assert.equal(notices.at(-1),'You left the game.');

    world.races.rounds=[{courseId:'short',phase:'lobby',hostId:'p',openedAt:2,entrants:[{playerId:'p',status:'entered'}]}];
    ui.update();start.click();assert.equal(commands.at(-1),'race:start:short');
    world.races.rounds[0].phase='countdown';ui.update();assert.equal(notices.at(-1),'Game started.');
    leave.click();assert.equal(commands.at(-1),'race:leave:short');
    world.races.rounds[0].entrants[0].status='dnf';ui.update();assert.equal(notices.at(-1),'You left the game.');

    world.races.rounds=[];
    world.parking.rounds=[{mode:'queue',phase:'waiting',hostId:'p',openedAt:3,entrants:[{playerId:'p'}]}];
    ui.update();start.click();now+=4001;ui.update();
    assert.equal(notices.at(-1),'Could not confirm the start. Please try again.');assert.equal(start.disabled,false);
    leave.click();session.status='disconnected';ui.update();
    assert.equal(notices.at(-1),'Could not confirm leaving. Please try again.');assert.equal(leave.disabled,false);
  } finally {
    if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete (globalThis as {document?:unknown}).document;
    if(oldPerformance)Object.defineProperty(globalThis,'performance',oldPerformance);
  }
});

test('pending mini-game requests survive snapshots but not a switch from online to solo',()=>{
  const f=fixture();f.menu.onclick!();f.games.park.onclick!();
  assert.equal(f.games.park.disabled,true);
  f.session.world={...f.session.world};f.controller.update();
  assert.equal(f.games.park.disabled,true,'a normal online snapshot is the same session');
  f.session.id='local';f.session.room='';f.session.status='solo';f.session.world=f.world('local');f.controller.update();
  assert.equal(f.games.park.disabled,false);assert.equal(f.feedback.textContent,'');assert.deepEqual(f.notices,[]);
});

test('leaving state clears on a new session, including a fresh solo drive with the same ID',()=>{
  const f=fixture();f.session.status='solo';f.session.id='local';f.session.room='';f.session.world=f.world('local');
  f.controller.update();f.session.world.parking.rounds.push({mode:'park',phase:'active',hostId:'local',entrants:[{playerId:'local'}]});
  f.menu.onclick!();f.leaveCurrent.onclick!();assert.equal(f.games.park.disabled,true);
  f.session.world=f.world('local');f.controller.update();
  assert.equal(f.games.park.disabled,false);assert.equal(f.feedback.textContent,'');assert.deepEqual(f.notices,[]);
});

test('starting state clears when switching to and restarting a solo drive',()=>{
  const f=fixture();
  f.session.world.parking.rounds.push({mode:'queue',phase:'waiting',hostId:'online',openedAt:1,entrants:[{playerId:'online'}]});
  f.controller.update();f.start.onclick!();
  assert.equal(f.start.disabled,true);assert.equal(f.start.textContent,'Starting…');
  f.session.world={...f.session.world};f.controller.update();
  assert.equal(f.start.disabled,true,'an ordinary snapshot keeps the pending start');
  f.session.id='local';f.session.room='';f.session.status='solo';f.session.world=f.world('local');f.controller.update();
  assert.equal(f.start.disabled,false);assert.equal(f.start.textContent,'Start now');assert.deepEqual(f.notices,[]);

  f.session.world.parking.rounds.push({mode:'queue',phase:'waiting',hostId:'local',openedAt:2,entrants:[{playerId:'local'}]});
  f.controller.update();f.start.onclick!();assert.equal(f.start.disabled,true);
  f.session.world=f.world('local');f.controller.update();
  assert.equal(f.start.disabled,false);assert.equal(f.games.queue.disabled,false);assert.deepEqual(f.notices,[]);
});
