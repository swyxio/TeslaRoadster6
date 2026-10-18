import './mars-ui.css';
import type { Entity } from '../shared/game';
import { FREMONT_SPACEPORT } from '../shared/map';
import { atMarsBoarding, MARS_GOAL } from '../shared/mars';
import type { Session } from './session';

export function createMarsUI(session:Session,money:(amount:number)=>string,onOpen:()=>void,onClose:()=>void) {
  const dialog=document.createElement('dialog');dialog.className='mars-dialog';dialog.setAttribute('aria-labelledby','mars-title');
  dialog.innerHTML=`<div class="fleet-header"><div><span class="eyebrow mars-eyebrow"></span><h2 id="mars-title">Let’s go to Mars.</h2></div><button type="button" class="mars-close" aria-label="Close Mars mission">✕</button></div>
    <p class="mars-intro"></p>
    <div class="mars-progress"><span>MISSION FUND <b class="mars-total"></b></span><progress max="1000000000" value="0" aria-label="Mars fund progress"></progress><small class="mars-remaining"></small></div>
    <form class="mars-form"><label for="mars-amount">Contribute from your cash <small class="mars-cash"></small></label><div class="mars-contribute"><input id="mars-amount" type="number" min="1" max="1000000000" step="1" inputmode="numeric" value="5" required><button type="button" class="mars-all">All</button><button type="submit" class="primary mars-submit">Contribute →</button></div></form>
    <p class="mars-note">Contributions are permanent and reduce your session cash. The room fund survives restarts; confirmed awards can be saved to your driver. Today’s deliveries are small: future levels will add higher earnings.</p>
    <div class="mars-boarding"><strong>BOARDING / FREMONT SPACEPORT</strong><p class="mars-location"></p><button type="button" class="primary mars-board">Board for Mars →</button></div><p class="mars-feedback" role="status" aria-live="polite"></p>`;
  const win=document.createElement('dialog');win.className='mars-win';win.setAttribute('aria-labelledby','mars-win-title');
  win.innerHTML=`<div class="mars-stars" aria-hidden="true"><span class="mars-rocket">🚀</span><span class="mars-planet"></span></div><span class="eyebrow">MISSION COMPLETE / 2050</span><h2 id="mars-win-title">You made it to Mars.</h2><p class="mars-win-copy"></p><strong>★ ACHIEVEMENT UNLOCKED · TO MARS</strong><button class="primary mars-win-close" type="button">Keep exploring Tesland →</button>`;
  document.body.append(dialog,win);
  const $=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const input=$<HTMLInputElement>('#mars-amount'),feedback=$<HTMLElement>('.mars-feedback'),submit=$<HTMLButtonElement>('.mars-submit'),board=$<HTMLButtonElement>('.mars-board');
  let pending:{id:number;action:'contribute'|'board';sent:number}|null=null,winQueued=false,busyUntil=0;
  let playerId=session.id,room=session.room,soloWorld=session.status==='solo'?session.world:null;
  const close=()=>{if(dialog.open)dialog.close();};
  dialog.querySelector<HTMLButtonElement>('.mars-close')!.onclick=close;
  win.querySelector<HTMLButtonElement>('.mars-win-close')!.onclick=()=>win.close();
  for(const d of [dialog,win])d.addEventListener('close',onClose);
  $('.mars-all').onclick=()=>{const player=session.world.players.find(p=>p.id===session.id);input.value=String(Math.max(1,Math.min(player?.delivery.cash??0,MARS_GOAL-session.world.mars.fund)));};
  dialog.querySelector('form')!.onsubmit=event=>{
    event.preventDefault();
    const amount=Number(input.value),player=session.world.players.find(p=>p.id===session.id);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>(player?.delivery.cash??0)){feedback.textContent='Enter a whole-dollar amount you have available.';return;}
    busyUntil=performance.now()+800;pending={id:session.mars('contribute',amount),action:'contribute',sent:performance.now()};feedback.textContent=session.status==='solo'?'Adding contribution…':'Saving contribution…';
  };
  board.onclick=()=>{busyUntil=performance.now()+800;pending={id:session.mars('board'),action:'board',sent:performance.now()};feedback.textContent='Preparing to board…';};
  function update(entity:Entity|undefined){
    const currentSoloWorld=session.status==='solo'?session.world:null;
    if(playerId!==session.id||room!==session.room||soloWorld!==currentSoloWorld){
      playerId=session.id;room=session.room;soloWorld=currentSoloWorld;pending=null;winQueued=false;busyUntil=0;feedback.textContent='';
    }
    if(pending){
      const result=session.marsResult;
      if(result?.requestId===pending.id){
        if(result.ok&&result.action==='board'){close();winQueued=true;}
        else feedback.textContent=result.ok?`${money(result.amount)} added to the mission fund.`:'Could not complete that action. Check your cash or boarding location and try again.';
        pending=null;session.marsResult=null;
      }else if(performance.now()-pending.sent>5000){feedback.textContent='No reply yet. Check the fund and your cash before trying again.';pending=null;}
    }
    if(winQueued&&!document.querySelector('dialog[open]')){
      winQueued=false;win.querySelector<HTMLElement>('.mars-win-copy')!.textContent=session.status==='solo'?'You funded the mission in this solo drive and boarded at Fremont.':'Your room raised $1 billion and you boarded at Fremont. The Bay made this journey together.';onOpen();win.showModal();
    }
    if(!dialog.open)return;
    const solo=session.status==='solo';
    $('.mars-eyebrow').textContent=solo?'TESLAND 2050 / SOLO MISSION':'TESLAND 2050 / A ROOM-WIDE MISSION';
    $('.mars-intro').textContent=solo?'Fund a Starship in this solo drive, then board at the fictional Fremont spaceport.':'Fund a Starship together, then board at the fictional Fremont spaceport. Each room has its own lasting fund.';
    $('.mars-note').textContent=solo?'Contributions reduce your cash. The solo fund resets when this drive ends. Awards can be saved to your driver; solo awards are self-reported. Today’s deliveries are small: future levels will add higher earnings.':'Contributions are permanent and reduce your session cash. The room fund survives restarts; confirmed awards can be saved to your driver. Today’s deliveries are small: future levels will add higher earnings.';
    const fund=session.world.mars.fund,remaining=MARS_GOAL-fund,player=session.world.players.find(p=>p.id===session.id),cash=player?.delivery.cash??0;
    $('.mars-total').textContent=`${money(fund)} / ${money(MARS_GOAL)}`;
    $<HTMLProgressElement>('progress').value=fund;
    $('.mars-remaining').textContent=remaining>0?`${money(remaining)} to launch`:'Fully funded · ready to board';
    $('.mars-cash').textContent=`${money(cash)} available`;
    const busy=!!pending||performance.now()<busyUntil||(session.status!=='online'&&session.status!=='solo');
    submit.disabled=busy||cash<1||remaining<=0;
    const dx=entity?FREMONT_SPACEPORT.entrance.x-entity.x:0,dz=entity?FREMONT_SPACEPORT.entrance.z-entity.z:0;
    const distance=Math.round(Math.hypot(dx,dz)),direction=['north','northeast','east','southeast','south','southwest','west','northwest'][(Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8)%8];
    const boarded=player?.achievements.unlocked.includes('to-mars')??false;
    $('.mars-location').textContent=boarded?'You already boarded for Mars this session.':entity?`${distance} m ${distance>25?direction:'away'} · ${player&&player.delivery.level<2?'Unlock the South Bay at level 2. ':''}Stop in the gold ring to board once the fund is complete.`:'Connect to your room to board.';
    board.disabled=busy||remaining>0||boarded||!entity||!atMarsBoarding(entity);
  }
  return {open(){if(session.status!=='online'&&session.status!=='solo')return;onOpen();feedback.textContent='';if(!dialog.open)dialog.showModal();update(undefined);},close,update};
}
