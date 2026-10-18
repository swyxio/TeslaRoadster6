import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

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
