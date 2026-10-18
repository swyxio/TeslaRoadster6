import './mars-ui.css';
import type { Entity } from '../shared/game';
import { FREMONT_SPACEPORT } from '../shared/map';
import { requiredLevelAt } from '../shared/delivery';
import { atMarsBoarding, marsGoalReached, MARS_GOAL } from '../shared/mars';
import type { Session } from './session';
import type { StarshipClient } from './starship-client';
import { createStarshipPanel } from './starship-panel';
import { createStarshipViewer } from './starship-viewer';

const FREMONT_LEVEL=requiredLevelAt(FREMONT_SPACEPORT.entrance.x,FREMONT_SPACEPORT.entrance.z);

export function createMarsUI(session:Session,money:(amount:number)=>string,onOpen:()=>void,onClose:()=>void,starship:StarshipClient) {
  const dialog=document.createElement('dialog');dialog.className='mars-dialog';dialog.setAttribute('aria-labelledby','mars-title');
  dialog.innerHTML=`<div class="fleet-header"><div><span class="eyebrow mars-eyebrow"></span><h2 id="mars-title">Let’s go to Mars.</h2></div><button type="button" class="mars-close" aria-label="Close Mars mission">✕</button></div>
    <p class="mars-intro"></p>
    <div class="mars-global"></div>
    <details class="mars-progress mars-room"><summary>Optional room fund · <b class="mars-room-total"></b></summary>
      <p class="mars-note">Room donations use your cash and fund a launch for this room, separately from the global earnings goal.</p>
      <form class="mars-form"><label for="mars-amount">Contribute from your cash <small class="mars-cash"></small></label><div class="mars-contribute"><input id="mars-amount" type="number" min="1" max="1000000000" step="1" inputmode="numeric" value="5" required><button type="button" class="mars-all">All</button><button type="submit" class="primary mars-submit">Contribute →</button></div></form>
    </details>
    <div class="mars-boarding"><strong>BOARDING / FREMONT SPACEPORT</strong><p class="mars-location"></p><button type="button" class="primary mars-board">Board for Mars →</button></div><p class="mars-feedback" role="status" aria-live="polite"></p>`;
  const win=document.createElement('dialog');win.className='mars-win';win.setAttribute('aria-labelledby','mars-win-title');
  win.innerHTML=`<div class="mars-stars" aria-hidden="true"><span class="mars-rocket">🚀</span><span class="mars-planet"></span></div><span class="eyebrow">MISSION COMPLETE / 2050</span><h2 id="mars-win-title">You made it to Mars.</h2><p class="mars-win-copy"></p><strong>★ ACHIEVEMENT UNLOCKED · TO MARS</strong><button class="primary mars-win-close" type="button">Keep exploring Tesland →</button>`;
  document.body.append(dialog,win);
  const $=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const feedback=$<HTMLElement>('.mars-feedback'),board=$<HTMLButtonElement>('.mars-board'),input=$<HTMLInputElement>('#mars-amount'),submit=$<HTMLButtonElement>('.mars-submit'),all=$<HTMLButtonElement>('.mars-all');
  const viewer=createStarshipViewer({animation:now=>starship.animation(now),stage:()=>starship.stage()??0,message:now=>starship.viewerMessage(now),onOpen,onClose});
  const watch=()=>{if(!viewer.open())feedback.textContent='The launch view could not start on this device.';};
  const panel=createStarshipPanel({onLoadContributors:(group,cursor)=>{void starship.loadContributors(group,cursor);},onWatch:watch,onReplay:preview=>{starship.replay(preview);watch();},onSetPublicName:name=>starship.setName(name)});
  $('.mars-global').append(panel.element);
  let pending:{id:number;action:'board'|'contribute';sent:number}|null=null,winQueued=false,busyUntil=0;
  let playerId=session.id,room=session.room;
  const close=()=>{if(dialog.open)dialog.close();};
  dialog.querySelector<HTMLButtonElement>('.mars-close')!.onclick=close;
  win.querySelector<HTMLButtonElement>('.mars-win-close')!.onclick=()=>win.close();
  for(const d of [dialog,win])d.addEventListener('close',onClose);
  all.onclick=()=>{const player=session.world.players.find(p=>p.id===session.id);input.value=String(Math.min(player?.delivery.cash??0,Math.max(0,MARS_GOAL-session.world.mars.roomFund)));};
  dialog.querySelector<HTMLFormElement>('.mars-form')!.onsubmit=event=>{
    event.preventDefault();
    const amount=Number(input.value),player=session.world.players.find(p=>p.id===session.id),remaining=MARS_GOAL-session.world.mars.roomFund;
    if(!Number.isSafeInteger(amount)||amount<=0||amount>(player?.delivery.cash??0)||amount>remaining){feedback.textContent=`Enter a whole-dollar amount within your cash and ${money(remaining)} remaining in this room.`;return;}
    busyUntil=performance.now()+800;pending={id:session.contributeMars(amount),action:'contribute',sent:performance.now()};feedback.textContent='Saving contribution…';
  };
  board.onclick=()=>{busyUntil=performance.now()+800;pending={id:session.mars(),action:'board',sent:performance.now()};feedback.textContent='Preparing to board…';};
  function update(entity:Entity|undefined){
    if(playerId!==session.id||room!==session.room){
      playerId=session.id;room=session.room;pending=null;winQueued=false;busyUntil=0;feedback.textContent='';
    }
    if(pending){
      const result=session.marsResult;
      if(result?.requestId===pending.id){
        if(result.ok&&result.action==='board'){close();winQueued=true;}
        else if(result.ok&&result.action==='contribute')feedback.textContent=`${money(result.amount)} added to this room's fund.`;
        else feedback.textContent=result.action==='contribute'?(result.available!==undefined?`Could not contribute. ${money(result.available)} remains available in this room.`:'Could not contribute. Check your cash and the room fund limit.'):'Could not board yet. Check the mission total and your location, then try again.';
        pending=null;session.marsResult=null;
      }else if(performance.now()-pending.sent>5000){feedback.textContent='Still saving. Wait for confirmation.';}
    }
    if(winQueued&&!document.querySelector('dialog[open]')){
      winQueued=false;win.querySelector<HTMLElement>('.mars-win-copy')!.textContent='Drivers funded a Starship launch, and you boarded at Fremont. The community made this journey together.';onOpen();win.showModal();
    }
    if(!dialog.open)return;
    $('.mars-eyebrow').textContent='TESLAND 2050 / A GLOBAL MISSION';
    $('.mars-intro').textContent='Earn together across every room, or fund a launch for this room. Reach $1 billion and board Starship at the Fremont spaceport.';
    panel.update(starship.state());
    const player=session.world.players.find(p=>p.id===session.id);
    const roomRemaining=MARS_GOAL-session.world.mars.roomFund,cash=player?.delivery.cash??0;
    $('.mars-room-total').textContent=session.status==='online'?`${money(session.world.mars.roomFund)} / ${money(MARS_GOAL)} goal`:'Connect to a room';
    $('.mars-cash').textContent=session.status==='online'?`${money(cash)} available`:'Connect to a room';
    input.max=String(Math.max(1,Math.min(cash,roomRemaining)));
    const busy=!!pending||performance.now()<busyUntil||session.status!=='online'||session.walletBlocked;
    submit.disabled=busy||cash<1||roomRemaining<1;all.disabled=submit.disabled;
    const dx=entity?FREMONT_SPACEPORT.entrance.x-entity.x:0,dz=entity?FREMONT_SPACEPORT.entrance.z-entity.z:0;
    const distance=Math.round(Math.hypot(dx,dz)),direction=['north','northeast','east','southeast','south','southwest','west','northwest'][(Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8)%8];
    const boarded=!!(player?.achievements.unlocked.includes('to-mars')||session.wallet?.unlocked.includes('to-mars'));
    const needsFremont=player&&entity&&player.delivery.level<FREMONT_LEVEL&&requiredLevelAt(entity.x,entity.z)<FREMONT_LEVEL;
    $('.mars-location').textContent=boarded?'You already boarded for Mars.':entity?`${distance} m ${distance>25?direction:'away'} · ${needsFremont?`Unlock Fremont at level ${FREMONT_LEVEL}. `:''}Stop in the gold ring to board once the mission is complete.`:'Connect to your room to board.';
    board.disabled=busy||!marsGoalReached(session.world.mars)||boarded||!entity||!atMarsBoarding(entity);
  }
  return {open(){onOpen();feedback.textContent='';if(!dialog.open)dialog.showModal();update(undefined);},close(){viewer.close();close();},update,isOpen:()=>dialog.open,isViewing:()=>viewer.openState};
}
