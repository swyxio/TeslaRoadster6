import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import type { GlobalChat, AwardProgress } from './chat';
import type { Session } from './session';

const RETRY_MS=5_000;
const KEY_PREFIX='tesland:pending-solo-awards:';
type Store=Pick<Storage,'getItem'|'setItem'>|null;
type Chat=Pick<GlobalChat,'status'|'playerId'|'code'|'identityTransition'|'readyGeneration'|'awards'|'awardsRevision'|'awardTicket'|'awardFailure'|'requestAwardTicket'|'saveSoloAwards'|'getAwards'>;
type Drive=Pick<Session,'status'|'id'|'room'|'world'|'awardsBound'|'awardsSync'|'bindAwards'> & {
  awardsUnbound:{requestId:number;ok:boolean}|null;
  unbindAwards:(requestId:number)=>boolean;
};
type PendingBind={key:string;requestId:number;stage:'ticket'|'room';sentAt:number};
const known=(id:unknown):id is AchievementId=>typeof id==='string'&&Object.hasOwn(ACHIEVEMENTS,id);

/**
 * Room awards are recorded by the authoritative room. Solo awards are marked
 * self-reported and queued under the authenticated driver's ID. Never store a
 * recovery code or a one-use room ticket in the browser.
 */
export function createAwardSync(chat:Chat,session:Drive,storage:Store,now:()=>number=Date.now){
  let identity='',seenRevision=-1,seenFailure=0,knownReady=0,nextRequest=0;
  let saved:AwardProgress={room:[],solo:[]},loaded=false;
  let pending:AchievementId[]=[],storageFailed=false;
  const memoryPending=new Map<string,AchievementId[]>();
  let soloWorld:Drive['world']|null=null,soloSeen=new Set<AchievementId>();
  let sending: { ids:AchievementId[]; sentAt:number }|null=null,retrySolo=0,retryLoad=0;
  let boundKey='',bind:PendingBind|null=null,retryBind=0,bindFailed=false,dataFailed=false;
  let lastSync:boolean|null=null;
  let lastDriver='',wasTransition=false,switchPending=false,roomConnection='';
  let needsUnbind=false,unbind:{requestId:number;sentAt:number}|null=null,retryUnbind=0,unbindFailed=false;

  function readPending(id:string):AchievementId[]{
    const inMemory=memoryPending.get(id)??[];
    if(!storage){storageFailed=true;return [...inMemory];}
    try {
      const raw=storage.getItem(KEY_PREFIX+id);if(!raw)return [...inMemory];
      const parsed:unknown=JSON.parse(raw);
      if(!Array.isArray(parsed)||!parsed.every(known)){storageFailed=true;return [...inMemory];}
      return [...new Set([...parsed,...inMemory])];
    } catch {storageFailed=true;return [...inMemory];}
  }
  function writePending(){
    if(!identity)return;
    memoryPending.set(identity,[...pending]);
    if(!storage){storageFailed=true;return;}
    try {storage.setItem(KEY_PREFIX+identity,JSON.stringify(pending));storageFailed=false;} catch {storageFailed=true;}
  }
  function soloUnlocked(){return session.status==='solo'?session.world.players.find(player=>player.id===session.id)?.achievements.unlocked??[]:[];}
  function resetBaseline(){soloSeen=new Set(soloUnlocked());}
  function savedSet(){return new Set([...saved.room,...saved.solo]);}
  function switchIdentity(id:string){
    identity=id;saved={room:[],solo:[]};loaded=false;pending=[];storageFailed=false;sending=null;
    bind=null;boundKey='';retryBind=0;bindFailed=false;dataFailed=false;retrySolo=0;retryLoad=0;
    chat.awardTicket=null;seenRevision=-1;seenFailure=chat.awardFailure?.revision??0;knownReady=chat.readyGeneration;
    if(id)pending=readPending(id);
    resetBaseline();
  }
  function acceptAwards(value:AwardProgress|null){
    if(!value){dataFailed=true;loaded=false;return;}
    saved={room:[...value.room],solo:[...value.solo]};loaded=true;dataFailed=false;
    const persisted=savedSet(),remaining=pending.filter(id=>!persisted.has(id));
    if(remaining.length!==pending.length){pending=remaining;writePending();}
    if(sending&&sending.ids.every(id=>persisted.has(id)))sending=null;
  }
  function update(){
    const time=now();
    const room=session.status==='online'&&session.id?`${session.id}|${session.room}`:'';
    if(room!==roomConnection){
      // A new room socket has no binding from the old room socket.
      roomConnection=room;needsUnbind=false;unbind=null;retryUnbind=0;unbindFailed=false;
    }
    const transitionStarted=chat.identityTransition&&!wasTransition;
    const driverChanged=!chat.identityTransition&&!!chat.playerId&&!!lastDriver&&chat.playerId!==lastDriver;
    if(transitionStarted&&lastDriver){
      switchPending=true;
      if(room){needsUnbind=true;unbind=null;retryUnbind=0;unbindFailed=false;}
    }else if(driverChanged&&!switchPending&&room){
      // The whole switch may have completed between animation frames.
      needsUnbind=true;unbind=null;retryUnbind=0;unbindFailed=false;
    }
    if(!chat.identityTransition&&chat.playerId){lastDriver=chat.playerId;switchPending=false;}
    wasTransition=chat.identityTransition;

    if(unbind&&session.awardsUnbound?.requestId===unbind.requestId){
      const result=session.awardsUnbound;session.awardsUnbound=null;unbind=null;
      if(result.ok){needsUnbind=false;unbindFailed=false;retryUnbind=0;}
      else {unbindFailed=true;retryUnbind=time+RETRY_MS;}
    }
    if(unbind&&time-unbind.sentAt>=RETRY_MS){unbind=null;unbindFailed=true;retryUnbind=time+RETRY_MS;}
    if(room&&needsUnbind&&!unbind&&time>=retryUnbind){
      const requestId=++nextRequest;
      if(session.unbindAwards(requestId))unbind={requestId,sentAt:time};
      else {unbindFailed=true;retryUnbind=time+RETRY_MS;}
    }
    // A failed/ongoing identity switch has no authenticated owner. Reconnects
    // for the same saved identity retain the owner while offline.
    const current=chat.identityTransition?'':chat.playerId&&(chat.status==='online'||chat.code)?chat.playerId:'';
    const currentSolo=session.status==='solo'?session.world:null;
    if(current!==identity)switchIdentity(current);
    if(currentSolo!==soloWorld){soloWorld=currentSolo;resetBaseline();}

    if(identity&&chat.status==='online'&&chat.awardsRevision!==seenRevision){
      seenRevision=chat.awardsRevision;acceptAwards(chat.awards);
    }
    if(identity&&chat.awardFailure&&chat.awardFailure.revision!==seenFailure){
      seenFailure=chat.awardFailure.revision;dataFailed=true;
      if(!chat.awardFailure.requestId||chat.awardFailure.requestId===bind?.requestId){bind=null;boundKey='';bindFailed=true;retryBind=time+RETRY_MS;}
      sending=null;retrySolo=time+RETRY_MS;retryLoad=time+RETRY_MS;
    }
    if(session.awardsSync!==lastSync){
      lastSync=session.awardsSync;
      if(lastSync===false)dataFailed=true;
      else if(lastSync===true)dataFailed=false;
    }

    // Capture only newly unlocked solo awards after authentication. Baselines
    // advance while a guest/switching so older awards never move to a new ID.
    if(currentSolo){
      const awards=soloUnlocked();
      if(identity&&chat.code){
        const acknowledged=savedSet(),added=awards.filter(id=>!soloSeen.has(id)&&!pending.includes(id)&&!acknowledged.has(id));
        if(added.length){pending.push(...added);writePending();}
      }
      soloSeen=new Set(awards);
    }
    if(!identity||!chat.code||chat.status!=='online'){
      if(bind){bind=null;boundKey='';chat.awardTicket=null;}
      sending=null;
      return;
    }

    if((!loaded||dataFailed)&&time>=retryLoad){chat.getAwards();retryLoad=time+RETRY_MS;}
    if(sending&&time-sending.sentAt>=RETRY_MS){sending=null;retrySolo=time;}
    if(pending.length&&!sending&&time>=retrySolo){
      const ids=[...pending];
      if(chat.saveSoloAwards(ids))sending={ids,sentAt:time};else retrySolo=time+RETRY_MS;
    }

    const key=session.status==='online'&&session.id?`${identity}|${chat.readyGeneration}|${session.id}|${session.room}`:'';
    if(chat.readyGeneration!==knownReady){knownReady=chat.readyGeneration;bind=null;boundKey='';retryBind=0;chat.awardTicket=null;}
    if(bind&&bind.key!==key){bind=null;chat.awardTicket=null;}
    if(!key||needsUnbind||unbind){boundKey='';bind=null;chat.awardTicket=null;return;}
    if(bind?.stage==='ticket'&&chat.awardTicket?.requestId===bind.requestId){
      const ticket=chat.awardTicket;chat.awardTicket=null;
      if(ticket.expiresAt>time&&session.bindAwards(ticket.ticket,bind.requestId)){bind.stage='room';bind.sentAt=time;}
      else {bind=null;bindFailed=true;retryBind=time+RETRY_MS;}
    }
    if(bind?.stage==='room'&&session.awardsBound?.requestId===bind.requestId){
      const result=session.awardsBound;session.awardsBound=null;
      if(result.ok){boundKey=key;bindFailed=false;retryBind=0;}
      else {boundKey='';bindFailed=true;retryBind=time+RETRY_MS;}
      bind=null;
    }
    if(bind&&time-bind.sentAt>=RETRY_MS){bind=null;bindFailed=true;retryBind=time+RETRY_MS;}
    if(!bind&&boundKey!==key&&time>=retryBind){
      const requestId=++nextRequest;
      if(chat.requestAwardTicket(requestId))bind={key,requestId,stage:'ticket',sentAt:time};
      else {bindFailed=true;retryBind=time+RETRY_MS;}
    }
  }
  function snapshot():{unlocked:AchievementId[];solo:AchievementId[];status:string}{
    if(!identity||!chat.code){return {unlocked:[],solo:[],status:unbindFailed?'Could not finish switching drivers safely. Retrying…':chat.identityTransition?'Switching drivers. Awards earned before the new driver connects stay in this drive.':'Guest driver: awards last for this drive. Save your driver to keep future awards.'};}
    const unlocked=[...savedSet()];
    let status:string;
    if(unbindFailed)status='Could not finish switching drivers safely. Retrying…';
    else if(needsUnbind||unbind)status='Switching drivers. Waiting to finish saving the previous driver’s awards…';
    else if(chat.status!=='online')status=pending.length?'Chat is offline. Solo awards are waiting to sync for this driver.':'Chat is offline. Saved awards will refresh when you reconnect.';
    else if(storageFailed)status='Could not access pending solo awards on this browser. Keep this drive open while they save.';
    else if(dataFailed||bindFailed||session.awardsSync===false)status='Could not save or load awards. Retrying; current-drive awards are not yet confirmed saved.';
    else if(!loaded)status='Loading saved awards…';
    else if(pending.length||sending)status='Saving solo awards for this driver…';
    else if(session.status==='online'&&(!boundKey||bind))status='Connecting this driver to the room for future awards…';
    else status='Saved awards stay with your driver. Solo awards are self-reported; awards earned before this driver connected stay in this drive.';
    if(chat.status!=='online'&&storageFailed&&pending.length)status+=' Browser storage is unavailable; keep this drive open.';
    return {unlocked,solo:[...saved.solo],status};
  }
  return {update,snapshot};
}
