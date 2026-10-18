import './minigames.css';
import type { Controls } from './controls';
import type { Session } from './session';
import { playerRace } from '../shared/race';

type Game = 'dome' | 'park' | 'queue' | 'short' | 'oval';
type Pending = { game:Game; leavingDome:boolean; sentAt:number };

/** A game is one choice; controls for an active round live beside its status. */
export function setupMinigames({session,controls,closeDrawer,canDrive,notice}:{
  session:Session;controls:Controls;closeDrawer:()=>void;canDrive:()=>boolean;notice:(message:string)=>void;
}) {
  const dialog=document.createElement('dialog');
  dialog.className='minigames-dialog';
  dialog.setAttribute('aria-labelledby','minigames-title');
  dialog.innerHTML=`<div class="fleet-header"><div><span class="eyebrow">TAKE A DETOUR / PLAY TOGETHER</span><h2 id="minigames-title">Pick a mini-game</h2></div><button type="button" class="minigames-close" aria-label="Close mini-games">✕</button></div>
    <p class="minigames-intro">Choose a game and we’ll take you there in your car. You can play solo or with your room.</p>
    <div class="minigames-grid">
      <button type="button" data-game="dome"><span class="game-icon" aria-hidden="true">⚽</span><span><strong>Rocket Dome</strong><small>Car soccer! Knock the ball into either goal. First to five wins.</small></span><b>Play ↗</b></button>
      <button type="button" data-game="park"><span class="game-icon" aria-hidden="true">🅿</span><span><strong>Park It</strong><small>Find your assigned space and park neatly against the clock.</small></span><b>Play ↗</b></button>
      <button type="button" data-game="queue"><span class="game-icon" aria-hidden="true">🚙</span><span><strong>Cut the Queue</strong><small>Race for an open parking space when the queue starts.</small></span><b>Play ↗</b></button>
      <button type="button" data-game="short"><span class="game-icon" aria-hidden="true">🏁</span><span><strong>Short Circuit</strong><small>Race through the checkpoints on Rocket Island’s short course.</small></span><b>Play ↗</b></button>
      <button type="button" data-game="oval"><span class="game-icon" aria-hidden="true">🏎</span><span><strong>Speed Oval</strong><small>Take a fast lap around Rocket Island’s banked oval.</small></span><b>Play ↗</b></button>
    </div><p class="minigames-feedback" role="status" aria-live="polite"></p><button type="button" class="minigames-leave" hidden>Leave current game</button>`;
  document.body.append(dialog);

  const context=document.createElement('div');
  context.className='minigames-context';
  context.innerHTML='<button type="button" data-command="start" hidden>Start now</button><button type="button" data-command="leave" hidden>Leave game</button>';
  document.getElementById('mission-panel')!.append(context);
  const domeLeave=document.createElement('button');
  domeLeave.type='button';domeLeave.className='dome-leave';domeLeave.textContent='↩ Leave Rocket Dome';
  document.getElementById('dome-score')!.append(domeLeave);

  const feedback=dialog.querySelector<HTMLElement>('.minigames-feedback')!;
  const gameButtons=[...dialog.querySelectorAll<HTMLButtonElement>('[data-game]')];
  const start=context.querySelector<HTMLButtonElement>('[data-command="start"]')!;
  const leave=context.querySelector<HTMLButtonElement>('[data-command="leave"]')!;
  const leaveCurrent=dialog.querySelector<HTMLButtonElement>('.minigames-leave')!;
  let pending:Pending|null=null;
  let leaving:Game|null=null,leavingAt=0;

  function car(){
    const player=session.world.players.find(p=>p.id===session.id);
    return session.world.entities.find(e=>e.id===player?.entityId);
  }
  function parking(){return session.world.parking.rounds.find(round=>round.entrants.some(entrant=>entrant.playerId===session.id));}
  function race(){return playerRace(session.world.races,session.id);}
  function playing(game:Game){
    if(game==='dome')return !!car()?.inDome;
    if(game==='park'||game==='queue')return parking()?.mode===game;
    const current=race();return current?.round.courseId===game&&current.entrant.status==='entered';
  }
  function activeGame():Game|null{
    if(car()?.inDome)return 'dome';
    const currentParking=parking();if(currentParking)return currentParking.mode;
    const currentRace=race();return currentRace?.entrant.status==='entered'?currentRace.round.courseId as 'short'|'oval':null;
  }
  function setBusy(){for(const button of gameButtons)button.disabled=!!pending||!!leaving;leaveCurrent.disabled=!!pending||!!leaving;}
  function setPending(value:Pending|null){pending=value;setBusy();}
  function failed(message:string){
    setPending(null);
    if(dialog.open)feedback.textContent=message;else notice(message);
  }
  function update(){
    const park=parking(),racing=race();
    const raceActive=racing?.entrant.status==='entered';
    const hostWaiting=!!park&&park.mode==='queue'&&park.phase==='waiting'&&park.hostId===session.id;
    const hostLobby=!!racing&&raceActive&&racing.round.phase==='lobby'&&racing.round.hostId===session.id;
    start.hidden=!hostWaiting&&!hostLobby;
    leave.hidden=!park&&!raceActive;
    context.hidden=start.hidden&&leave.hidden;
    const active=activeGame();leaveCurrent.hidden=!active;
    if(leaving){
      if(!playing(leaving)){
        leaving=null;setBusy();
        if(dialog.open)feedback.textContent='You left the game. Pick your next detour.';else notice('You left the game.');
      }else if(session.status==='disconnected'||performance.now()-leavingAt>4000){
        leaving=null;setBusy();
        if(dialog.open)feedback.textContent='Could not confirm leaving. Please try again.';else notice('Could not confirm leaving. Please try again.');
      }
    }
    if(!pending)return;
    const entity=car();
    const entered=pending.leavingDome?!!entity&&!entity.inDome:playing(pending.game);
    if(entered){
      const game=pending.game,leaving=pending.leavingDome;
      setPending(null);if(dialog.open)dialog.close();
      notice(leaving?'Back from Rocket Dome.':game==='park'?'Park It joined · find your assigned space.':game==='queue'?'Queue joined · wait for the start.':game==='dome'?'Welcome to Rocket Dome!':'Race joined · wait for the countdown.');
    }else if(session.status==='disconnected'||performance.now()-pending.sentAt>4000){
      failed('Could not confirm entry. The game may be full or unavailable; please try again.');
    }
  }
  function enter(game:Game){
    if(pending||leaving)return;
    const entity=car();
    if(!entity||entity.kind==='person'){
      feedback.textContent='Hop into a car first, then choose a game.';return;
    }
    if(playing(game)){dialog.close();notice('You’re already in this game.');return;}
    if(activeGame()){feedback.textContent='Leave your current game before choosing another.';return;}
    feedback.textContent='Taking you there…';
    setPending({game,leavingDome:false,sentAt:performance.now()});controls.clear();
    const accepted=game==='dome'?(session.action('dome'),undefined):session.enterMinigame(game);
    if(accepted===false){failed('Could not enter. The game may be full or unavailable; please try again.');return;}
    update();
  }
  document.getElementById('minigames')!.onclick=()=>{
    closeDrawer();feedback.textContent=pending?'Taking you there…':activeGame()?'You’re already in a game. Leave it to choose another.':'';update();
    controls.clear();controls.enabled=false;dialog.showModal();
  };
  dialog.querySelector<HTMLButtonElement>('.minigames-close')!.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{controls.clear();controls.enabled=canDrive()&&!document.querySelector('dialog[open]');});
  for(const button of gameButtons)button.onclick=()=>enter(button.dataset.game as Game);
  start.onclick=()=>{if(parking())session.parkingAction('start');else {const active=race();if(active)session.raceAction('start',active.round.courseId as 'short'|'oval');}};
  leave.onclick=()=>{if(parking())session.parkingAction('leave');else {const active=race();if(active)session.raceAction('leave',active.round.courseId as 'short'|'oval');}};
  leaveCurrent.onclick=()=>{
    const active=activeGame();if(!active||leaving||pending)return;
    leaving=active;leavingAt=performance.now();setBusy();feedback.textContent='Leaving your game…';
    if(active==='dome')session.action('dome');else if(active==='park'||active==='queue')session.parkingAction('leave');else session.raceAction('leave',active);
    update();
  };
  domeLeave.onclick=()=>{
    if(pending)return;
    setPending({game:'dome',leavingDome:true,sentAt:performance.now()});controls.clear();session.action('dome');update();
  };
  return {update,close:()=>{if(dialog.open)dialog.close();}};
}
