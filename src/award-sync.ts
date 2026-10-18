import type { AchievementId } from '../shared/achievements';
import type { GlobalChat, AwardProgress } from './chat';
import type { Session } from './session';

const RETRY_MS=5_000;
type Chat=Pick<GlobalChat,'status'|'playerId'|'code'|'identityTransition'|'readyGeneration'|'awards'|'awardsRevision'|'awardTicket'|'awardFailure'|'requestAwardTicket'|'getAwards'>;
type Drive=Pick<Session,'status'|'id'|'room'|'awardsBound'|'awardsSync'|'bindAwards'> & {
  awardsUnbound:{requestId:number;ok:boolean}|null;
  unbindAwards:(requestId:number)=>boolean;
};
type PendingBind={key:string;requestId:number;stage:'ticket'|'room';sentAt:number};

/**
 * The authoritative room records awards to the authenticated driver. This
 * coordinator does not store recovery codes or one-use room tickets.
 */
export function createAwardSync(chat:Chat,session:Drive,now:()=>number=Date.now){
  let identity='',seenRevision=-1,seenFailure=0,knownReady=0,nextRequest=0;
  let saved:AwardProgress=[],loaded=false,retryLoad=0;
  let boundKey='',bind:PendingBind|null=null,retryBind=0,bindFailed=false,dataFailed=false;
  let lastSync:boolean|null=null;
  let lastDriver='',wasTransition=false,switchPending=false,roomConnection='';
  let needsUnbind=false,unbind:{requestId:number;sentAt:number}|null=null,retryUnbind=0,unbindFailed=false;

  function switchIdentity(id:string){
    identity=id;saved=[];loaded=false;
    bind=null;boundKey='';retryBind=0;bindFailed=false;dataFailed=false;retryLoad=0;
    chat.awardTicket=null;seenRevision=-1;seenFailure=chat.awardFailure?.revision??0;knownReady=chat.readyGeneration;
  }
  function acceptAwards(value:AwardProgress|null){
    if(!value){dataFailed=true;loaded=false;return;}
    saved=[...value];loaded=true;dataFailed=false;
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
    if(current!==identity)switchIdentity(current);

    if(identity&&chat.status==='online'&&chat.awardsRevision!==seenRevision){
      seenRevision=chat.awardsRevision;acceptAwards(chat.awards);
    }
    if(identity&&chat.awardFailure&&chat.awardFailure.revision!==seenFailure){
      seenFailure=chat.awardFailure.revision;dataFailed=true;
      if(!chat.awardFailure.requestId||chat.awardFailure.requestId===bind?.requestId){bind=null;boundKey='';bindFailed=true;retryBind=time+RETRY_MS;}
      retryLoad=time+RETRY_MS;
    }
    if(session.awardsSync!==lastSync){
      lastSync=session.awardsSync;
      if(lastSync===false)dataFailed=true;
      else if(lastSync===true)dataFailed=false;
    }

    if(!identity||!chat.code||chat.status!=='online'){
      if(bind){bind=null;boundKey='';chat.awardTicket=null;}
      return;
    }

    if((!loaded||dataFailed)&&time>=retryLoad){chat.getAwards();retryLoad=time+RETRY_MS;}
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
  function snapshot():{unlocked:AchievementId[];status:string}{
    if(!identity||!chat.code){return {unlocked:[],status:unbindFailed?'Could not finish switching drivers safely. Retrying…':chat.identityTransition?'Switching drivers. Awards earned before the new driver connects stay in this drive.':'Guest driver: awards last for this drive. Save your driver to keep future awards.'};}
    const unlocked=[...saved];
    let status:string;
    if(unbindFailed)status='Could not finish switching drivers safely. Retrying…';
    else if(needsUnbind||unbind)status='Switching drivers. Waiting to finish saving the previous driver’s awards…';
    else if(chat.status!=='online')status='Chat is offline. Saved awards will refresh when you reconnect.';
    else if(dataFailed||bindFailed||session.awardsSync===false)status='Could not save or load awards. Retrying; current-drive awards are not yet confirmed saved.';
    else if(!loaded)status='Loading saved awards…';
    else if(session.status==='online'&&(!boundKey||bind))status='Connecting this driver to the room for future awards…';
    else status='Saved awards stay with your driver. Awards earned before this driver connected stay in this drive.';
    return {unlocked,status};
  }
  return {update,snapshot};
}
