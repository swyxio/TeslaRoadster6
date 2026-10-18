import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celebrateReward, resetCelebration } from '../src/rewards';

test('consecutive rewards each get a visible celebration and reset clears the queue',()=>{
  const originalDocument=globalThis.document,originalWindow=globalThis.window,originalClear=globalThis.clearTimeout;
  const label={textContent:''},amount={textContent:''},classes=new Set<string>();
  const confetti={append:()=>{}};
  const popup={offsetWidth:0,classList:{add:(name:string)=>classes.add(name),remove:(name:string)=>classes.delete(name)},
    querySelector:(name:string)=>name==='.confetti'?confetti:name==='#reward-label'?label:amount};
  let next=0;const timers=new Map<number,()=>void>();
  Object.assign(globalThis,{
    document:{getElementById:()=>popup,createElement:()=>({style:{setProperty:()=>{}}})},
    window:{setTimeout:(callback:()=>void)=>{timers.set(++next,callback);return next;}},
    clearTimeout:(id:number)=>timers.delete(id),
  });
  const advance=()=>{const entry=timers.entries().next().value;assert.ok(entry);timers.delete(entry[0]);entry[1]();};
  try{
    celebrateReward({id:1,kind:'delivery-research',amount:800});
    celebrateReward({id:2,kind:'research',amount:250});
    assert.equal(label.textContent,'DELIVERY + AWARDS');assert.equal(amount.textContent,'+$800');
    advance();assert.equal(label.textContent,'ACHIEVEMENT AWARD');assert.equal(amount.textContent,'+$250');
    advance();assert.equal(classes.has('celebrate'),false);
    celebrateReward({id:3,kind:'pickup',amount:100});celebrateReward({id:4,kind:'research',amount:250});
    resetCelebration();assert.equal(classes.has('celebrate'),false);assert.equal(timers.size,0);
  }finally{
    resetCelebration();Object.assign(globalThis,{document:originalDocument,window:originalWindow,clearTimeout:originalClear});
  }
});
