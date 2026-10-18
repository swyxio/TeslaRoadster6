import './mars-ui.css';
import type { Entity } from '../shared/game';
import { FREMONT_SPACEPORT } from '../shared/map';
import { atMarsBoarding, MARS_GOAL } from '../shared/mars';
import type { Session } from './session';

export function createMarsUI(session:Session,money:(amount:number)=>string,onOpen:()=>void,onClose:()=>void) {
  const dialog=document.createElement('dialog');dialog.className='mars-dialog';dialog.setAttribute('aria-labelledby','mars-title');
  dialog.innerHTML=`<div class="fleet-header"><div><span class="eyebrow mars-eyebrow"></span><h2 id="mars-title">Let’s go to Mars.</h2></div><button type="button" class="mars-close" aria-label="Close Mars mission">✕</button></div>
    <p class="mars-intro"></p>
    <div class="mars-progress"><span>GLOBAL EARNINGS <b class="mars-total"></b></span><progress max="1000000000" value="0" aria-label="Global earnings toward the Mars mission"></progress><small class="mars-remaining"></small></div>
    <p class="mars-note">Every driver's earnings move the mission forward. You keep the money you earn.</p>
    <div class="mars-boarding"><strong>BOARDING / FREMONT SPACEPORT</strong><p class="mars-location"></p><button type="button" class="primary mars-board">Board for Mars →</button></div><p class="mars-feedback" role="status" aria-live="polite"></p>`;
  const win=document.createElement('dialog');win.className='mars-win';win.setAttribute('aria-labelledby','mars-win-title');
  win.innerHTML=`<div class="mars-stars" aria-hidden="true"><span class="mars-rocket">🚀</span><span class="mars-planet"></span></div><span class="eyebrow">MISSION COMPLETE / 2050</span><h2 id="mars-win-title">You made it to Mars.</h2><p class="mars-win-copy"></p><strong>★ ACHIEVEMENT UNLOCKED · TO MARS</strong><button class="primary mars-win-close" type="button">Keep exploring Tesland →</button>`;
  document.body.append(dialog,win);
  const $=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const feedback=$<HTMLElement>('.mars-feedback'),board=$<HTMLButtonElement>('.mars-board');
  let pending:{id:number;sent:number}|null=null,winQueued=false,busyUntil=0;
  let playerId=session.id,room=session.room;
  const close=()=>{if(dialog.open)dialog.close();};
  dialog.querySelector<HTMLButtonElement>('.mars-close')!.onclick=close;
  win.querySelector<HTMLButtonElement>('.mars-win-close')!.onclick=()=>win.close();
  for(const d of [dialog,win])d.addEventListener('close',onClose);
  board.onclick=()=>{busyUntil=performance.now()+800;pending={id:session.mars(),sent:performance.now()};feedback.textContent='Preparing to board…';};
  function update(entity:Entity|undefined){
    if(playerId!==session.id||room!==session.room){
      playerId=session.id;room=session.room;pending=null;winQueued=false;busyUntil=0;feedback.textContent='';
    }
    if(pending){
      const result=session.marsResult;
      if(result?.requestId===pending.id){
        if(result.ok&&result.action==='board'){close();winQueued=true;}
        else feedback.textContent='Could not board yet. Check the mission total and your location, then try again.';
        pending=null;session.marsResult=null;
      }else if(performance.now()-pending.sent>5000){feedback.textContent='No reply yet. Check the mission total and your location before trying again.';pending=null;}
    }
    if(winQueued&&!document.querySelector('dialog[open]')){
      winQueued=false;win.querySelector<HTMLElement>('.mars-win-copy')!.textContent='Drivers across the Bay earned $1 billion and you boarded at Fremont. The whole game made this journey together.';onOpen();win.showModal();
    }
    if(!dialog.open)return;
    $('.mars-eyebrow').textContent='TESLAND 2050 / A GLOBAL MISSION';
    $('.mars-intro').textContent='Earn together across every room. When the mission reaches $1 billion, board Starship at the Fremont spaceport.';
    const fund=session.world.mars.fund,remaining=Math.max(0,MARS_GOAL-fund),player=session.world.players.find(p=>p.id===session.id);
    $('.mars-total').textContent=`${money(fund)} / ${money(MARS_GOAL)}`;
    $<HTMLProgressElement>('progress').value=fund;
    $('.mars-remaining').textContent=remaining>0?`${money(remaining)} to launch`:'Fully funded · ready to board';
    const busy=!!pending||performance.now()<busyUntil||session.status!=='online';
    const dx=entity?FREMONT_SPACEPORT.entrance.x-entity.x:0,dz=entity?FREMONT_SPACEPORT.entrance.z-entity.z:0;
    const distance=Math.round(Math.hypot(dx,dz)),direction=['north','northeast','east','southeast','south','southwest','west','northwest'][(Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8)%8];
    const boarded=!!(player?.achievements.unlocked.includes('to-mars')||session.wallet?.unlocked.includes('to-mars'));
    $('.mars-location').textContent=boarded?'You already boarded for Mars.':entity?`${distance} m ${distance>25?direction:'away'} · ${player&&player.delivery.level<2?'Unlock Fremont at level 2. ':''}Stop in the gold ring to board once the mission is complete.`:'Connect to your room to board.';
    board.disabled=busy||remaining>0||boarded||!entity||!atMarsBoarding(entity);
  }
  return {open(){if(session.status!=='online')return;onOpen();feedback.textContent='';if(!dialog.open)dialog.showModal();update(undefined);},close,update};
}
