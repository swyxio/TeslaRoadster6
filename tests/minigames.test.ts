import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  return {session,world,controller,menu,games,dialog,feedback,leaveCurrent,notices};
}

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
