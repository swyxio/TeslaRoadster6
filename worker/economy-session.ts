import { applyDeliveryStop, captureDeliveryStop, CUSTOMERS, deliveryStopSignature, levelForCash, matchesDeliveryStop, orderTarget, rerouteInaccessibleOrder, type DeliveryState, type DeliveryStop } from '../shared/delivery';
import { hasRockets, initialVehicleUpgrades } from '../shared/upgrades';
import { restoreOta } from '../shared/ota';
import { atLuxuryShowroom, luxuryPurchaseAwards, luxuryVehicle, type LuxuryVehicleId } from '../shared/luxury';
import { buyUpgrade, buyVehicleStyle, canCollectLuxury, collectLuxury, subscribeOta, type CockpitStats, type EconomyHooks, type EconomyUpdateResult, type Entity, type Pickup, type Player, type World } from '../shared/game';
import { applyAchievementAwards, awardMarsAchievement, type AchievementState } from '../shared/achievements';
import { evaluateAchievementEvidence, type AchievementEvidence } from '../shared/achievement-evidence';
import { ACHIEVEMENT_TIER_CAP, normalizeAchievementTiers, type AchievementTierProgress } from '../shared/achievement-tiers';
import { achievementTierFamilies, applyAcceptedDelivery, applyObservedAchievement, applyTierProgress, coalesceEventRewards, deliveryTierFamilies } from './achievement-progress';
import { atMarsBoarding, marsGoalReached, MARS_GOAL, MARS_LAUNCH_SECONDS } from '../shared/mars';
import type { UpgradeId } from '../shared/upgrades';
import type { PaintId, StyleChoice } from '../shared/vehicle-style';
import { emptyCybercabFleet, paintCybercab, purchaseCybercab, settleCybercabIntervals, type CybercabFleet, type CybercabInterval } from '../shared/cybercabs';
import { DriverProfile, progressFrom, type DriverAction, type DriverOutcome, type DriverProgress, type EconomyIntent, type SavedVehicles } from './driver-profile';
import { RoomEconomy, type CabIncomeStage } from './room-economy';
import type { EarningsEvents, SettledDeliveryEarning } from '../shared/earnings-events';
import { applyTicketEvidence, type TicketEvidence } from '../shared/police';
import type { MarketPaint } from '../shared/market-protocol';

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;ECONOMIES:DurableObjectNamespace<RoomEconomy>};
type Draft={delivery:DeliveryState;achievements:AchievementState;achievementTiers:AchievementTierProgress;cockpit:CockpitStats;vehicles:SavedVehicles;ownedLuxury:LuxuryVehicleId[];cybercabs:CybercabFleet};
type DeliveryProbe={before:Draft;stop:DeliveryStop;signature:string;sample:boolean;newStop:boolean;elapsed:number;payouts:EconomyUpdateResult};
type Item={ordinal:number;intent:EconomyIntent;view:Draft;result:DriverOutcome|null;cabEvents?:EarningsEvents;staged?:Promise<DriverOutcome|null>;onApplied?:(outcome:DriverOutcome)=>void;replayGameAward?:()=>void;awardRejections?:number};
const MAX_GAME_AWARD_RETRIES=1;
const CAB_CHECKPOINT_MS=1_000;
const MAX_CAB_STAGES=8;
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
// Compare only durable fields touched by simulation. Vehicle maps are copied on change.
const durableFields=(d:Draft)=>[d.delivery.cash,d.delivery.lifetimeIncome,d.delivery.earned,d.delivery.completed,d.delivery.level,d.delivery.tickets,d.delivery.order.restaurant,d.delivery.order.customer,d.delivery.order.stage,d.delivery.order.pickupEstimate,d.delivery.order.estimate,d.delivery.order.base,d.delivery.ota.enabled,d.delivery.ota.active,d.delivery.ota.needsRenewalConsent,d.achievements.unlocked.length,d.vehicles];
const changed=(a:unknown[],b:unknown[])=>a.some((value,i)=>value!==b[i]);

/** One draft and an ordered durable event stream per player; no room-wide awaits. */
export class EconomySession {
  private draft:Draft;
  private queue:Item[]=[];
  private nextRevision:number;
  private committedRevision:number;
  private nextSequence:number;
  private submitted=0;
  private settled=0;
  private settledOutOfOrder=new Set<number>();
  private staging=new Set<Promise<DriverOutcome|null>>();
  private stageTail:Promise<DriverOutcome|null>=Promise.resolve(null);
  private prepareTail:Promise<DriverOutcome|null>=Promise.resolve(null);
  private nextCabStage=1;
  private barriers:{token:number;after:number}[]=[];
  private lockedCar=false;
  private closed=false;
  private processing=false;
  private failed=false;
  private pickupGenerations:Map<string,number>;
  private lastTimerCheckpoint=0;
  private lastOrderElapsed=0;
  private lastOtaRemaining:number|null=null;
  private committedOtaPeriodEnd:number|null=null;
  private committed:DriverProgress;
  private driverId:string;
  private fence:string;
  // An open interval remains room-local until it is closed and staged.
  private cabClock:number|null=null;
  private cabOpen=new Map<string,CybercabInterval>();
  private cabIntervals:CybercabInterval[]=[];
  private suspendedCabs=new Set<string>();
  private cabBackpressure=false;
  private marketPaint:string|null=null;
  private marketPaused=false;
  private marketResume:Promise<void>|null=null;
  private deliveryClock:number;
  private deliveryProbe:DeliveryProbe|null=null;
  private lastStop='';
  private stopFollowup=false;
  private otherActionVersion=0;
  private stopActionVersion=0;
  private pendingAchievements=new Set<string>();
  private replayClock:number|undefined;
  private uncertainDeliveries=0;
  constructor(private env:Env,private economy:DurableObjectStub<RoomEconomy>,private world:World,private player:Player,private socket:WebSocket,
    driverId:string,fence:string,private roomId:string,revision:number,sequence:number,progress:DriverProgress,pickupGenerations:Map<string,number>,private pendingPickups:Set<string>,marketPaint:MarketPaint|null=null) {
    this.driverId=driverId;this.fence=fence;this.nextRevision=revision;this.committedRevision=revision;this.nextSequence=sequence+1;this.committed=structuredClone(progress);this.deliveryClock=progress.deliveryClock??0;
    this.pickupGenerations=pickupGenerations;
    this.install(progress);
    this.draft={delivery:structuredClone(player.delivery),achievements:structuredClone(player.achievements),achievementTiers:normalizeAchievementTiers(progress.achievementTiers,progress.completed,progress.unlocked),cockpit:structuredClone(player.cockpit),vehicles:structuredClone(progress.vehicles),ownedLuxury:[...progress.ownedLuxury],cybercabs:structuredClone(progress.cybercabs??emptyCybercabFleet())};
    this.committedOtaPeriodEnd=player.delivery.ota.renewAt;
    this.rememberTimers();
    this.setMarketPaint(marketPaint);
  }
  private driver(id=this.driverId){return this.env.DRIVERS.get(this.env.DRIVERS.idFromName(id));}
  private send(value:unknown){if(this.closed)return;try{this.socket.send(JSON.stringify(value));}catch{}}
  private install(progress:DriverProgress){
    const d=this.player.delivery;
    Object.assign(d,{cash:progress.cash,lifetimeIncome:progress.eligibleIncome,earned:progress.earned,completed:progress.completed,level:progress.level,order:{...progress.order},tickets:progress.tickets});
    d.ota=restoreOta(progress.ota,this.world.time);
    this.player.achievements.unlocked=[...progress.unlocked];
  }
  private progress():DriverProgress{return {...progressFrom(this.draft.delivery,this.draft.achievements.unlocked,this.draft.vehicles,this.draft.ownedLuxury,this.world.time,this.draft.delivery.lifetimeIncome),achievementTiers:structuredClone(this.draft.achievementTiers),deliveryClock:this.deliveryClock};}
  private otaRemaining():number|null{
    const ota=this.draft.delivery.ota;
    return ota.active&&ota.renewAt!==null?Math.max(0,ota.renewAt-this.world.time):null;
  }
  private timersChanged(){return this.draft.delivery.order.elapsed!==this.lastOrderElapsed||this.otaRemaining()!==this.lastOtaRemaining;}
  private rememberTimers(){this.lastOrderElapsed=this.draft.delivery.order.elapsed;this.lastOtaRemaining=this.otaRemaining();this.lastTimerCheckpoint=this.world.time;}
  private restoreCommittedOta(){
    const ota=this.player.delivery.ota;
    if(!ota.active||this.committedOtaPeriodEnd===null)return;
    if(this.committedOtaPeriodEnd<=this.world.time){ota.active=false;ota.renewAt=null;}
    else ota.renewAt=this.committedOtaPeriodEnd;
  }
  private wallet(){this.send({type:'wallet',cash:this.committed.cash,earned:this.committed.earned,eligibleIncome:this.committed.eligibleIncome,level:this.committed.level,unlocked:this.committed.unlocked,achievementTiers:normalizeAchievementTiers(this.committed.achievementTiers,this.committed.completed,this.committed.unlocked),ownedLuxury:this.committed.ownedLuxury,cybercabs:this.committed.cybercabs??emptyCybercabFleet()});}
  initialWallet(){this.wallet();}
  get pending(){return this.queue.length>0;}
  get vehicleLocked(){return this.lockedCar;}
  get decisionsAvailable(){return !this.uncertainDeliveries;}
  get unstarted(){return this.submitted===0&&this.draft.delivery.earned===0&&this.draft.delivery.lifetimeIncome===0&&this.draft.achievements.unlocked.length===0;}
  get walletId(){return this.driverId;}
  get currentFence(){return this.fence;}
  get cabFleet(){return this.committed.cybercabs??emptyCybercabFleet();}
  close(){this.closed=true;}
  finish(){
    // A paused handoff has already drained before sealing its old fence.
    // Disconnect must not create work on that sealed fence.
    if(this.marketPaused){this.close();return;}
    this.closeCabIntervals();
    if(!this.failed && !this.uncertainDeliveries && this.timersChanged())
      this.enqueue({kind:'progress',progress:this.progress()});
    this.flushCabIncome();
    this.close();
  }
  async freeze():Promise<void>{
    if(!this.closed){this.closed=true;try{this.socket.close(1008,'Driver opened in another room.');}catch{}}
    while(this.processing || this.queue.length || this.staging.size || (!this.failed&&this.cabIntervals.length)){
      this.flushCabIncome();await wait(100);
    }
  }
  /** Caller holds this player's world simulation and rejects actions first. */
  async pauseForMarket():Promise<void>{
    if(this.closed||this.failed)throw new Error('Wallet is unavailable');
    this.marketPaused=true;
    this.pauseCabs();
    const drain=async()=>{
      while(this.processing||this.queue.length||this.staging.size||this.cabIntervals.length){
        if(this.closed||this.failed)throw new Error('Wallet could not drain');
        this.flushCabIncome();await wait(100);
      }
      if(this.closed||this.failed)throw new Error('Wallet could not drain');
    };
    await drain();
    // Timers may have advanced without a wallet event; checkpoint only after
    // all earlier drafts settle, so a rejected predecessor cannot erase it.
    if(this.timersChanged()){this.enqueue({kind:'progress',progress:this.progress()});await drain();}
  }
  /** The old fence must have been sealed while the player remains held. */
  installMarket(driverId:string,fence:string,revision:number,sequence:number,progress:DriverProgress,paint:MarketPaint|null):void{
    if(!this.marketPaused||this.closed||this.failed||this.processing||this.queue.length||this.staging.size||driverId!==this.driverId)throw new Error('Wallet is not paused and drained');
    this.installProfile(driverId,fence,revision,sequence,progress,paint);
  }
  resumeMarket():Promise<void>{
    if(this.marketResume)return this.marketResume;
    const resume=(async()=>{
      if(!this.marketPaused||this.closed||this.failed)throw new Error('Wallet is unavailable');
      await this.ensureAccessibleOrder();
      if(this.closed||this.failed)throw new Error('Wallet is unavailable');
      this.marketPaused=false;this.wallet();
    })();
    this.marketResume=resume;
    void resume.finally(()=>{if(this.marketResume===resume)this.marketResume=null;}).catch(()=>{});
    return resume;
  }
  /** Reconcile an inaccessible job after a balance-changing market handoff. */
  async ensureAccessibleOrder():Promise<void>{
    if(this.closed||this.failed)throw new Error('Wallet is unavailable');
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    if(!car)throw new Error('Driver is unavailable');
    if(!rerouteInaccessibleOrder(this.draft.delivery,car,hasRockets(car)))return;
    const item=this.enqueue({kind:'progress',progress:this.progress()});
    const outcome=await new Promise<DriverOutcome>(resolve=>{item.onApplied=resolve;});
    if(!outcome.ok)throw new Error('Unable to save rerouted order');
    while(this.processing||this.queue.length||this.staging.size){
      if(this.closed||this.failed)throw new Error('Wallet could not drain');
      await wait(100);
    }
    if(this.closed||this.failed)throw new Error('Wallet could not drain');
  }
  barrier(token:number){this.barriers.push({token,after:this.submitted});}
  sync():number|undefined{
    // Never acknowledge a barrier whose wallet could not be reconciled.
    if(this.failed)return undefined;
    const done=this.barriers.filter(b=>b.after<=this.settled);this.barriers=this.barriers.filter(b=>b.after>this.settled);
    return done.length?Math.max(...done.map(b=>b.token)):undefined;
  }
  private markSettled(ordinal:number){
    this.settledOutOfOrder.add(ordinal);
    while(this.settledOutOfOrder.delete(this.settled+1))this.settled++;
  }
  /** The caller must serialize identity switches and ensure no guest events happened. */
  replace(driverId:string,fence:string,revision:number,sequence:number,progress:DriverProgress,marketPaint:MarketPaint|null=null){
    this.installProfile(driverId,fence,revision,sequence,progress,marketPaint);
    this.wallet();
  }
  private installProfile(driverId:string,fence:string,revision:number,sequence:number,progress:DriverProgress,marketPaint:MarketPaint|null){
    this.cabClock=null;
    this.nextCabStage=1;this.stageTail=Promise.resolve(null);this.prepareTail=Promise.resolve(null);
    this.driverId=driverId;this.fence=fence;this.nextRevision=revision;this.committedRevision=revision;this.nextSequence=sequence+1;this.committed=structuredClone(progress);this.deliveryClock=progress.deliveryClock??0;
    this.lastStop='';this.stopFollowup=false;this.otherActionVersion=0;this.stopActionVersion=0;
    this.pendingAchievements.clear();
    this.uncertainDeliveries=0;
    this.install(progress);
    this.draft={delivery:structuredClone(this.player.delivery),achievements:structuredClone(this.player.achievements),achievementTiers:normalizeAchievementTiers(progress.achievementTiers,progress.completed,progress.unlocked),cockpit:structuredClone(this.player.cockpit),vehicles:structuredClone(progress.vehicles),ownedLuxury:[...progress.ownedLuxury],cybercabs:structuredClone(progress.cybercabs??emptyCybercabFleet())};
    this.committedOtaPeriodEnd=this.player.delivery.ota.renewAt;
    this.rememberTimers();
    this.setMarketPaint(marketPaint);
  }
  setMarketPaint(paint:MarketPaint|null){
    this.marketPaint=paint?.catalogId??null;
    for(const car of this.world.entities)if(car.owner===this.player.id&&car.kind!=='person'&&!car.cab&&!car.retiredCab)this.paintPersonalVehicle(car);
  }
  private paintPersonalVehicle(car:Entity){if(this.marketPaint)car.marketPaint=this.marketPaint;else delete car.marketPaint;}
  /** Only committed ownership may enter the world or be shown to the player. */
  buyCab(reply:(ok:boolean,reason?:string)=>void){
    if(this.failed||this.marketPaused||this.uncertainDeliveries||this.queue.length>=32||this.closed){reply(false,'unavailable');return;}
    const assetId=crypto.randomUUID();
    const result=purchaseCybercab(this.draft.cybercabs,this.draft.delivery.cash,this.draft.delivery.lifetimeIncome,assetId);
    if(!result.ok){reply(false,result.reason);return;}
    const previousLevel=this.draft.delivery.level;
    this.draft.cybercabs=result.fleet;this.draft.delivery.cash=result.cash;this.draft.delivery.lifetimeIncome=result.eligibleIncome;
    this.draft.delivery.level=levelForCash(result.cash);
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    const rerouted=car&&this.draft.delivery.level<previousLevel&&rerouteInaccessibleOrder(this.draft.delivery,car,hasRockets(car));
    this.enqueue({kind:'cab-buy',assetId,...(rerouted?{order:{...this.draft.delivery.order}}:{})},undefined,
      outcome=>reply(outcome.ok,outcome.ok?undefined:outcome.reason));
  }
  paintCab(assetId:string,paint:PaintId,reply:(ok:boolean,reason?:string)=>void){
    if(this.failed||this.marketPaused||this.uncertainDeliveries||this.queue.length>=32||this.closed){reply(false,'unavailable');return;}
    const result=paintCybercab(this.draft.cybercabs,this.draft.delivery.cash,this.draft.delivery.lifetimeIncome,assetId,paint);
    if(!result.ok){reply(false,result.reason);return;}
    const previousLevel=this.draft.delivery.level;
    this.draft.cybercabs=result.fleet;this.draft.delivery.cash=result.cash;this.draft.delivery.level=levelForCash(result.cash);
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    const rerouted=car&&this.draft.delivery.level<previousLevel&&rerouteInaccessibleOrder(this.draft.delivery,car,hasRockets(car));
    this.enqueue({kind:'cab-paint',assetId,paint,...(rerouted?{order:{...this.draft.delivery.order}}:{})},undefined,
      outcome=>reply(outcome.ok,outcome.ok?undefined:outcome.reason));
  }
  private closeCabInterval(id:string){
    const interval=this.cabOpen.get(id);if(!interval)return;
    this.cabOpen.delete(id);if(interval.endMs>interval.startMs)this.cabIntervals.push(interval);
  }
  private closeCabIntervals(){for(const id of this.cabOpen.keys())this.closeCabInterval(id);}
  pauseCabs(){this.closeCabIntervals();this.cabClock=null;this.flushCabIncome();}
  /** Stop measuring before eviction; the entity stays until the journal drains. */
  suspendCab(id:string){this.suspendedCabs.add(id);this.closeCabInterval(id);this.flushCabIncome();}
  resumeCab(id:string){this.suspendedCabs.delete(id);}
  cabReadyToRetire(id:string){return this.suspendedCabs.has(id)&&!this.cabOpen.has(id)&&!this.cabIntervals.some(interval=>interval.assetId===id)&&!this.pending&&!this.processing&&!this.staging.size;}
  /** Record only observed consecutive room ticks while the owner is active. */
  observeCabs(now:number){
    if(this.marketPaused)return;
    const previous=this.cabClock;this.cabClock=now;
    if(this.closed||this.failed||previous===null||!Number.isSafeInteger(now)||now<=previous||now-previous>200){
      this.closeCabIntervals();this.flushCabIncome();return;
    }
    const owned=new Set(this.cabFleet.assets.map(asset=>asset.id));
    const active=this.world.time<=this.draft.delivery.activeUntil;
    const operating=new Set(this.world.entities.filter(e=>active&&e.owner===this.player.id&&e.cab&&owned.has(e.cab.assetId)&&
      !this.suspendedCabs.has(e.cab.assetId)&&e.npc&&e.autopilot&&!e.driver).map(e=>e.cab!.assetId));
    for(const id of this.cabOpen.keys())if(!operating.has(id))this.closeCabInterval(id);
    for(const id of operating){
      const open=this.cabOpen.get(id);
      if(open&&open.endMs===previous)open.endMs=now;
      else {this.closeCabInterval(id);this.cabOpen.set(id,{assetId:id,startMs:previous,endMs:now});}
    }
    // Batch consecutive observations; missing room ticks never imply activity.
    for(const [id,interval] of this.cabOpen)if(interval.endMs-interval.startMs>=CAB_CHECKPOINT_MS)this.closeCabInterval(id);
    this.flushCabIncome();
  }
  private flushCabIncome(){
    if(this.failed||!this.cabIntervals.length)return;
    // Preserve every observed open tail before stopping at the backlog limit.
    // Stages still awaiting acceptance remain volatile if the room crashes.
    if(this.staging.size>=MAX_CAB_STAGES-1)this.closeCabIntervals();
    while(this.cabIntervals.length)this.stageCabIncome(this.cabIntervals.splice(0,128));
    if(this.staging.size>=MAX_CAB_STAGES&&!this.cabBackpressure){
      this.cabBackpressure=true;this.failed=true;
      try{this.socket.close(1011,'Cab income delayed. Please rejoin.');}catch{}
    }
  }
  hooks():EconomyHooks {return {update:(player,apply,ticket)=>this.update(player,apply,null,ticket),
    deliveryStart:(player,entity,paused)=>this.deliveryStart(player,entity,paused),deliveryEnd:(player,active,payouts)=>this.deliveryEnd(player,active,payouts),
    gameAward:(player,apply,capture)=>this.gameAward(player,apply,capture),achievement:(player,evidence)=>this.achievement(player,evidence),
    decisionsAvailable:()=>this.decisionsAvailable,pickup:(player,car,pickup)=>this.pickup(player,car,pickup)};}
  /** Called inside the synchronous simulation update before order mutation. */
  deliveryStart(_player:Player,entity:Entity,paused:boolean){
    this.deliveryProbe=null;
    const signature=paused?'':deliveryStopSignature(entity);
    if(!signature){this.lastStop='';this.stopFollowup=false;return;}
    const newStop=signature!==this.lastStop;
    const sample=newStop||this.stopFollowup||this.stopActionVersion!==this.otherActionVersion;
    if(!sample&&(this.uncertainDeliveries>0||!matchesDeliveryStop(this.draft.delivery.order,entity)))return;
    this.deliveryProbe={before:structuredClone(this.draft),stop:captureDeliveryStop(entity),signature,sample,newStop,elapsed:0,payouts:undefined};
  }
  deliveryEnd(_player:Player,activeOrderSeconds:number,payouts:EconomyUpdateResult){
    if(!Number.isFinite(activeOrderSeconds)||activeOrderSeconds<0)throw new Error('Invalid delivery clock');
    const elapsed=activeOrderSeconds;
    // A rate lookup may defer the visible arrival, but the immutable stop was
    // observed at this active-order time and must retain its event-time fare.
    if(payouts===null)this.draft.delivery.order.elapsed+=elapsed;
    this.deliveryClock+=elapsed;
    if(this.deliveryProbe){this.deliveryProbe.elapsed=elapsed;this.deliveryProbe.payouts=payouts;}
  }
  update(player:Player,apply:()=>EconomyUpdateResult,rate:{atMs:number;multiplier:1|1.5|2|3}|null=null,ticket?:TicketEvidence,observedAt=rate?.atMs??Date.now()){
    if(this.failed||this.marketPaused)return;
    // Bound memory during an extended backend outage. The pending events keep
    // retrying after this driver leaves; the rest of the room is unaffected.
    const overloaded=this.queue.length>=32;
    if(overloaded&&!ticket){
      // Preserve the final observed intervals before closing this session. Do
      // not project them through a speculative wallet that may be rejected;
      // the journal settles them after the preceding events, or on recovery.
      this.closeCabIntervals();
      while(this.cabIntervals.length){
        const intervals=this.cabIntervals.splice(0,128);
        this.stageCabIncome(intervals);
      }
      this.failed=true;
      try{this.socket.close(1011,'Wallet delayed. Rejoin to recover.');}catch{}
      return;
    }
    const live={delivery:player.delivery,achievements:player.achievements,cockpit:player.cockpit};
    const before=durableFields(this.draft);
    const previousLevel=this.draft.delivery.level;
    const ticketOrder=ticket?structuredClone(this.draft.delivery.order):undefined,ticketCompleted=this.draft.delivery.completed;
    player.delivery=this.draft.delivery;player.achievements=this.draft.achievements;player.cockpit=this.draft.cockpit;
    let payouts:EconomyUpdateResult;
    try{
      payouts=apply();player.delivery.level=levelForCash(player.delivery.cash);
      if(player.delivery.level<previousLevel){
        const car=this.world.entities.find(e=>e.id===player.entityId);
        if(car)rerouteInaccessibleOrder(player.delivery,car,hasRockets(car));
      }
    }finally{
      player.delivery=live.delivery;player.achievements=live.achievements;player.cockpit=live.cockpit;
    }
    const earnings:SettledDeliveryEarning[]=Array.isArray(payouts)?payouts.map(({component,amount})=>{
      if(!rate)throw new Error('A delivery payout requires an authoritative rate');
      return {sourceId:component.sourceId,kind:component.kind,base:component.amount,amount,atMs:rate.atMs,multiplier:component.kind==='checkpoint'?1:rate.multiplier};
    }):[];
    let item:Item|undefined;
    const probe=this.deliveryProbe;this.deliveryProbe=null;
    if(probe&&(probe.sample||Array.isArray(probe.payouts)||probe.payouts===null)){
      const view=probe.before;view.delivery.order.elapsed+=probe.elapsed;
      const order={...view.delivery.order},wasDropoff=order.stage==='dropoff',customer=CUSTOMERS[order.customer]?.id,rooftop=wasDropoff&&orderTarget(order).rooftop;
      const rewardBefore=view.delivery.lastReward?.id??0;
      const parts=rate&&probe.payouts!==null?applyDeliveryStop(view.delivery,probe.stop,component=>Math.round(component.amount*rate.multiplier)):undefined;
      if(parts){
        view.achievementTiers=applyAcceptedDelivery(view.delivery,view.achievements,view.achievementTiers,order,rooftop,wasDropoff?customer:undefined,(view.delivery.lastReward?.id??0)>rewardBefore).progress;
        this.draft.achievementTiers=applyTierProgress(this.draft.delivery,this.draft.achievementTiers,deliveryTierFamilies(order,rooftop),(this.draft.delivery.lastReward?.id??0)>rewardBefore);
        applyAchievementAwards(this.draft.delivery,this.draft.achievements,[]);
      }
      if(rate&&probe.payouts!==null&&JSON.stringify(parts??undefined)!==JSON.stringify(probe.payouts??undefined))throw new Error('Delivery projection mismatch');
      view.vehicles=this.draft.vehicles;
      const multiplier=rate&&probe.payouts!==null?rate.multiplier:null;
      if(multiplier===null)this.uncertainDeliveries++;
      item=this.enqueue({kind:'delivery',stop:probe.stop,atMs:rate?.atMs??observedAt,multiplier},undefined,undefined,view);
      this.lastStop=probe.signature;
      this.stopFollowup=probe.newStop||Array.isArray(parts);
      if(!probe.newStop&&!Array.isArray(parts))this.stopFollowup=false;
      this.stopActionVersion=this.otherActionVersion;
      if(!this.uncertainDeliveries&&changed(durableFields(view),durableFields(this.draft)))item=this.enqueue({kind:'progress',progress:this.progress(),earnings:[]});
    }else if(changed(before,durableFields(this.draft))&&(ticket||!this.uncertainDeliveries))item=this.enqueue(ticket?{kind:'ticket',evidence:structuredClone(ticket),orderBefore:ticketOrder!,completedBefore:ticketCompleted}:{kind:'progress',progress:this.progress(),earnings});
    else if(!this.pending && !this.uncertainDeliveries && this.world.time-this.lastTimerCheckpoint>=10 && this.timersChanged())item=this.enqueue({kind:'progress',progress:this.progress()});
    if(overloaded){
      this.closeCabIntervals();while(this.cabIntervals.length)this.stageCabIncome(this.cabIntervals.splice(0,128));
      this.failed=true;try{this.socket.close(1011,'Wallet delayed. Rejoin to recover.');}catch{}
    }
    // Timers and flight geometry can advance visually; money, awards and order stages remain committed.
    if(!this.pending){
      live.delivery.activeSeconds=this.draft.delivery.activeSeconds;live.delivery.activeUntil=this.draft.delivery.activeUntil;
      live.delivery.order.elapsed=this.draft.delivery.order.elapsed;Object.assign(live.cockpit,this.draft.cockpit);
    }
    Object.assign(live.achievements,{groundShore:this.draft.achievements.groundShore,crossing:this.draft.achievements.crossing,lastPosition:this.draft.achievements.lastPosition,roofFlight:this.draft.achievements.roofFlight});
    return item;
  }
  gameAward(player:Player,apply:()=>void,capture?:()=>()=>void){
    const before=this.draft.achievements.unlocked.length;
    const item=this.update(player,apply);
    if(item&&this.draft.achievements.unlocked.length>before)item.replayGameAward=capture?capture():apply;
    return item;
  }
  /** Capture a server-observed fact, independent of speculative unlocks. */
  achievement(_player:Player,evidence:AchievementEvidence){
    if(this.failed||this.marketPaused||this.closed)return;
    const key=JSON.stringify(evidence);
    const repeatable=achievementTierFamilies(evidence).some(id=>this.draft.achievementTiers[id].count<ACHIEVEMENT_TIER_CAP);
    if(!repeatable&&(this.pendingAchievements.has(key)||!evaluateAchievementEvidence(this.committed.unlocked,evidence).length))return;
    if(this.queue.length>=32){
      this.closeCabIntervals();while(this.cabIntervals.length)this.stageCabIncome(this.cabIntervals.splice(0,128));
      this.failed=true;try{this.socket.close(1011,'Wallet delayed. Rejoin to recover.');}catch{}return;
    }
    if(!repeatable)this.pendingAchievements.add(key);
    this.projectAchievement(evidence);
    const item=this.enqueue({kind:'achievement',evidence:structuredClone(evidence)});
    const onApplied=item.onApplied;
    item.onApplied=outcome=>{onApplied?.(outcome);if(!repeatable&&outcome.ok)this.pendingAchievements.delete(key);};
  }
  private enqueue(action:DriverAction,pickup?:{id:string;generation:number},onApplied?:(outcome:DriverOutcome)=>void,view?:Draft){
    const ordinal=++this.submitted;
    const intent:EconomyIntent={eventId:crypto.randomUUID(),driverId:this.driverId,fence:this.fence,roomId:this.roomId,revision:this.nextRevision++,sequence:this.nextSequence++,clock:this.replayClock??this.deliveryClock,action,...(pickup?{pickup}:{})};
    const item:Item={ordinal,intent,view:structuredClone(view??this.draft),result:null,onApplied};
    if(action.kind!=='delivery')this.otherActionVersion++;
    if(action.kind==='ticket'){
      const stage={eventId:intent.eventId,driverId:intent.driverId,fence:intent.fence,roomId:intent.roomId,walletOrder:intent.sequence,clock:intent.clock,action};
      item.staged=this.stageTail.then(previous=>previous??this.persistStage(()=>this.economy.stageTicket(stage)));
      this.stageTail=item.staged;
      item.onApplied=outcome=>{if(!outcome.ok){this.failed=true;if(!this.closed)try{this.socket.close(1011,'Ticket interrupted. Please rejoin.');}catch{}}};
    }
    if(action.kind==='delivery'){
      const stage={eventId:intent.eventId,driverId:intent.driverId,fence:intent.fence,roomId:intent.roomId,walletOrder:intent.sequence,clock:this.deliveryClock,action};
      item.staged=this.stageTail.then(previous=>previous??this.persistStage(()=>this.economy.stageDelivery(stage)));
      this.stageTail=item.staged;
      item.onApplied=outcome=>{if(!outcome.ok){this.failed=true;if(!this.closed)try{this.socket.close(1011,'Delivery interrupted. Please rejoin.');}catch{}}};
    }
    if(action.kind==='achievement'){
      const stage={eventId:intent.eventId,driverId:intent.driverId,fence:intent.fence,roomId:intent.roomId,walletOrder:intent.sequence,clock:intent.clock!,action};
      item.staged=this.stageTail.then(previous=>previous??this.persistStage(()=>this.economy.stageAchievement(stage)));
      this.stageTail=item.staged;
      item.onApplied=outcome=>{if(!outcome.ok){this.failed=true;if(!this.closed)try{this.socket.close(1011,'Achievement interrupted. Please rejoin.');}catch{}}};
    }
    if(action.kind==='supply'){
      if(!pickup)throw new Error('Missing supply pickup generation');
      const stage={eventId:intent.eventId,driverId:intent.driverId,fence:intent.fence,roomId:intent.roomId,walletOrder:intent.sequence,clock:intent.clock!,action,pickup};
      item.staged=this.stageTail.then(previous=>previous??this.persistStage(()=>this.economy.stageSupply(stage)));
      // A competing pickup is a normal rejection, not a failure of later
      // unrelated physical evidence waiting on the shared acceptance tail.
      this.stageTail=item.staged.then(result=>result&&!result.ok&&result.reason==='reserved'?null:result);
    }
    this.queue.push(item);
    if(action.kind==='progress')this.rememberTimers();
    if(!this.processing)void this.process();
    return item;
  }
  private stageCabIncome(intervals:CybercabInterval[]){
    // Acceptance has its own order. A wallet sequence is assigned only when
    // complete history is available and this credit enters the wallet queue.
    const ordinal=++this.submitted;
    const stage:CabIncomeStage={eventId:crypto.randomUUID(),driverId:this.driverId,fence:this.fence,roomId:this.roomId,
      sequence:this.nextCabStage++,intervals};
    const persisted=this.stageTail.then(previous=>previous??this.persistCabStage(stage));
    this.stageTail=persisted;
    // Persist subsequent observations independently of a slow history query,
    // while projecting them in the same order as their staged intervals.
    const prepared=this.prepareTail.then(async previous=>{
      const failed=previous??await persisted;
      if(failed){
        this.failed=true;
        if(!this.closed)try{this.socket.close(1011,'Cab income interrupted. Please rejoin.');}catch{}
        return failed;
      }
      while(!this.failed){
        try{
          const events=await this.economy.prepareCab(stage);
          if(!this.failed)this.enqueuePreparedCab(stage,events,ordinal);
          return null;
        }catch{}
        await wait(500);
      }
      return null;
    });
    this.prepareTail=prepared;this.staging.add(prepared);
    void prepared.finally(()=>this.staging.delete(prepared)).catch(()=>{});
  }
  private projectCab(intervals:CybercabInterval[],events:EarningsEvents):boolean{
    const result=settleCybercabIntervals(this.draft.cybercabs,this.draft.delivery.cash,this.draft.delivery.lifetimeIncome,intervals,events);
    if(!result.ok)return false;
    this.draft.cybercabs=result.fleet;this.draft.delivery.cash=result.cash;this.draft.delivery.lifetimeIncome=result.eligibleIncome;
    this.draft.delivery.level=levelForCash(result.cash);
    applyAchievementAwards(this.draft.delivery,this.draft.achievements,[]);
    return true;
  }
  private enqueuePreparedCab(stage:CabIncomeStage,events:EarningsEvents,ordinal:number){
    if(!this.projectCab(stage.intervals,events)){
      this.failed=true;
      if(!this.closed)try{this.socket.close(1011,'Cab income interrupted. Please rejoin.');}catch{}
      return;
    }
    const intent:EconomyIntent={eventId:stage.eventId,driverId:stage.driverId,fence:stage.fence,roomId:stage.roomId,
      revision:this.nextRevision++,sequence:this.nextSequence++,clock:this.deliveryClock,action:{kind:'cab-income',intervals:stage.intervals}};
    this.otherActionVersion++;
    const assigned=this.stageTail.then(previous=>previous??this.persistStage(()=>this.economy.assignCab(stage,intent.sequence)));
    this.stageTail=assigned;
    this.queue.push({ordinal,intent,view:structuredClone(this.draft),result:null,cabEvents:events,staged:assigned,onApplied:outcome=>{
      if(!outcome.ok){this.failed=true;if(!this.closed)try{this.socket.close(1011,'Cab income interrupted. Please rejoin.');}catch{}}
    }});
    if(!this.processing)void this.process();
  }
  private async persistCabStage(stage:CabIncomeStage):Promise<DriverOutcome|null>{
    return this.persistStage(()=>this.economy.stageCab(stage));
  }
  private async persistStage(call:()=>Promise<'accepted'|'superseded'|'conflict'|'reserved'>):Promise<DriverOutcome|null>{
    for(;;){
      try{
        const result=await call();
        if(result==='accepted')return null;
        return {ok:false,reason:result};
      }catch{}
      await wait(500);
    }
  }
  /** The profile must commit exactly the credit already projected into drafts. */
  private rebaseCabIncome(item:Item,progress:DriverProgress):boolean{
    return progress.cash===item.view.delivery.cash&&progress.eligibleIncome===item.view.delivery.lifetimeIncome&&
      progress.level===item.view.delivery.level&&JSON.stringify(progress.unlocked)===JSON.stringify(item.view.achievements.unlocked)&&
      JSON.stringify(progress.cybercabs??emptyCybercabFleet())===JSON.stringify(item.view.cybercabs);
  }
  private rebaseTicket(item:Item,progress:DriverProgress):boolean{
    const expected=item.view.delivery,actual=progress.order,order=expected.order;
    return progress.cash===expected.cash&&progress.tickets===expected.tickets&&progress.level===expected.level&&
      actual.restaurant===order.restaurant&&actual.customer===order.customer&&actual.stage===order.stage&&
      actual.pickupEstimate===order.pickupEstimate&&actual.estimate===order.estimate&&actual.base===order.base;
  }
  private projectDelivery(action:Extract<DriverAction,{kind:'delivery'}>):boolean{
    // Reproject this placeholder again when its historical rate resolves.
    if(action.multiplier===null)return true;
    const order={...this.draft.delivery.order},dropoff=order.stage==='dropoff',customer=CUSTOMERS[order.customer]?.id;
    const rooftop=dropoff&&orderTarget(order).rooftop,rewardBefore=this.draft.delivery.lastReward?.id??0;
    const parts=applyDeliveryStop(this.draft.delivery,action.stop,component=>Math.round(component.amount*action.multiplier!));
    if(parts===null)return false;
    if(parts)this.draft.achievementTiers=applyAcceptedDelivery(this.draft.delivery,this.draft.achievements,this.draft.achievementTiers,order,rooftop,dropoff?customer:undefined,
      (this.draft.delivery.lastReward?.id??0)>rewardBefore).progress;
    return true;
  }
  private projectAchievement(evidence:AchievementEvidence){
    this.draft.achievementTiers=applyObservedAchievement(this.draft.delivery,this.draft.achievements,this.draft.achievementTiers,evidence).progress;
  }
  private projectSupply(type:'repair'|'air'){
    const delivery=this.draft.delivery;
    delivery.cash+=5;delivery.lifetimeIncome+=5;delivery.level=levelForCash(delivery.cash);
    delivery.lastReward={id:(delivery.lastReward?.id??0)+1,kind:type==='repair'?'supply-repair':'supply-air',amount:5};
    const rewardBefore=delivery.lastReward,cashBefore=delivery.cash;
    this.draft.achievementTiers=applyTierProgress(delivery,this.draft.achievementTiers,['supply-pickups'],true);
    applyAchievementAwards(delivery,this.draft.achievements,[]);
    coalesceEventRewards(delivery,rewardBefore,cashBefore,true);
  }
  private rebaseSupply(item:Item,progress:DriverProgress):boolean{
    return progress.cash===item.view.delivery.cash&&progress.eligibleIncome===item.view.delivery.lifetimeIncome&&progress.level===item.view.delivery.level&&
      JSON.stringify(progress.unlocked)===JSON.stringify(item.view.achievements.unlocked)&&JSON.stringify(progress.achievementTiers)===JSON.stringify(item.view.achievementTiers);
  }
  private rebaseAchievement(item:Item,progress:DriverProgress):boolean{
    return progress.cash===item.view.delivery.cash&&progress.eligibleIncome===item.view.delivery.lifetimeIncome&&
      progress.level===item.view.delivery.level&&JSON.stringify(progress.unlocked)===JSON.stringify(item.view.achievements.unlocked)&&JSON.stringify(progress.achievementTiers)===JSON.stringify(item.view.achievementTiers);
  }
  private rebaseDelivery(item:Item,progress:DriverProgress):boolean{
    const expected=item.view.delivery,order=expected.order,actual=progress.order;
    return progress.cash===expected.cash&&progress.earned===expected.earned&&progress.eligibleIncome===expected.lifetimeIncome&&
      progress.completed===expected.completed&&progress.level===expected.level&&
      actual.restaurant===order.restaurant&&actual.customer===order.customer&&actual.stage===order.stage&&
      actual.pickupEstimate===order.pickupEstimate&&actual.estimate===order.estimate&&actual.base===order.base&&
      Math.abs(actual.elapsed-order.elapsed)<1e-7&&JSON.stringify(progress.unlocked)===JSON.stringify(item.view.achievements.unlocked)&&JSON.stringify(progress.achievementTiers)===JSON.stringify(item.view.achievementTiers);
  }
  /** A deferred rate may change the order and balance observed by later facts. */
  private reprojectAfterHistoricalRate(){
    const pending=this.queue.splice(0);
    this.nextRevision=this.committedRevision;
    this.install(this.committed);this.restoreCommittedOta();
    this.draft={delivery:structuredClone(this.player.delivery),achievements:structuredClone(this.player.achievements),achievementTiers:normalizeAchievementTiers(this.committed.achievementTiers,this.committed.completed,this.committed.unlocked),cockpit:structuredClone(this.player.cockpit),
      vehicles:structuredClone(this.committed.vehicles),ownedLuxury:[...this.committed.ownedLuxury],cybercabs:structuredClone(this.committed.cybercabs??emptyCybercabFleet())};
    let clock=this.committed.deliveryClock??0;
    const advance=(next:number|undefined)=>{
      if(next===undefined)return;
      if(next<clock)throw new Error('Physical work clock moved backwards');
      this.draft.delivery.order.elapsed+=next-clock;clock=next;
    };
    for(const item of pending){
      const action=item.intent.action;
      if(action.kind==='cab-income'||action.kind==='ticket'||action.kind==='delivery'||action.kind==='achievement'||action.kind==='supply'){
        advance(item.intent.clock);
        let valid=true;
        if(action.kind==='cab-income')valid=!!item.cabEvents&&this.projectCab(action.intervals,item.cabEvents);
        else if(action.kind==='ticket'){
          const level=this.draft.delivery.level;applyTicketEvidence(this.draft.delivery,action.evidence);
          if(this.draft.delivery.level<level)rerouteInaccessibleOrder(this.draft.delivery,action.evidence,action.evidence.canFly);
        }else if(action.kind==='delivery')valid=this.projectDelivery(action);
        else if(action.kind==='achievement')this.projectAchievement(action.evidence);
        else this.projectSupply(action.type);
        if(!valid){this.failed=true;this.closed=true;try{this.socket.close(1011,'Economy interrupted. Please rejoin.');}catch{}return;}
        item.intent.revision=this.nextRevision++;item.intent.sequence=this.nextSequence++;
        item.view=structuredClone(this.draft);this.queue.push(item);continue;
      }
      this.markSettled(item.ordinal);item.onApplied?.({ok:false,reason:'revision'});
    }
    advance(this.deliveryClock);
    if(this.closed&&!this.failed&&!this.uncertainDeliveries&&this.timersChanged())this.enqueue({kind:'progress',progress:this.progress()});
  }
  private async process(){
    this.processing=true;
    try {
      while(this.queue.length){
        const item=this.queue[0];
        const stageFailure=item.staged?await item.staged:null;
        if(stageFailure&&(stageFailure.ok||stageFailure.reason!=='reserved')){
          this.failed=true;this.closed=true;try{this.socket.close(1011,'Economy interrupted. Rejoin to recover.');}catch{}
          for(const pending of this.queue.splice(0))if(pending.intent.action.kind!=='cab-income'&&pending.intent.action.kind!=='ticket'&&pending.intent.action.kind!=='delivery'&&pending.intent.action.kind!=='achievement'&&pending.intent.action.kind!=='supply')pending.onApplied?.(stageFailure);
          break;
        }
        let outcome:DriverOutcome|null=stageFailure;
        while(!outcome){
          try{outcome=await this.economy.submit(item.intent);}catch{}
          if(!outcome)await wait(500);
        }
        this.queue.shift();
        if(!outcome.ok){
          // Later drafts were never submitted and must not survive a failed head.
          const abandoned=this.queue.splice(0);
          this.nextRevision=this.committedRevision;
          this.markSettled(item.ordinal);
          const saved=this.committed.order;
          this.install(this.committed);
          // The committed period keeps counting down even if a later draft
          // speculatively renewed or disabled the subscription.
          this.restoreCommittedOta();
          this.draft={delivery:structuredClone(this.player.delivery),achievements:structuredClone(this.player.achievements),achievementTiers:normalizeAchievementTiers(this.committed.achievementTiers,this.committed.completed,this.committed.unlocked),cockpit:structuredClone(this.player.cockpit),vehicles:structuredClone(this.committed.vehicles),ownedLuxury:[...this.committed.ownedLuxury],cybercabs:structuredClone(this.committed.cybercabs??emptyCybercabFleet())};
          let projectedClock=this.committed.deliveryClock??0;
          const advanceClock=(clock:number|undefined)=>{
            if(clock===undefined)return;
            if(clock<projectedClock)throw new Error('Physical work clock moved backwards');
            this.draft.delivery.order.elapsed+=clock-projectedClock;projectedClock=clock;
          };
          // Preserved elapsed time is still dirty and must flush on disconnect.
          this.lastOrderElapsed=saved.elapsed;
          this.lastOtaRemaining=this.committed.ota.active?this.committed.ota.remaining:null;
          this.lastTimerCheckpoint=this.world.time;
          const rejectedAward=!!item.replayGameAward&&(outcome.reason==='invalid'||outcome.reason==='revision');
          const awardRetryExhausted=rejectedAward&&(item.awardRejections??0)>=MAX_GAME_AWARD_RETRIES;
          if(outcome.reason==='superseded'||outcome.reason==='conflict'||awardRetryExhausted||(item.intent.action.kind==='supply'&&!stageFailure)){
            this.failed=true;
            if(!this.closed)try{this.socket.close(1011,awardRetryExhausted?'Award could not be saved. Rejoin.':'Economy interrupted. Rejoin to recover.');}catch{}
            this.closed=true;
          }
          item.onApplied?.(outcome);
          const replayAward=(discarded:Item)=>{
            if(!discarded.replayGameAward||this.failed)return;
            advanceClock(discarded.intent.clock);
            const barriers=this.barriers.filter(barrier=>barrier.after>=discarded.ordinal);
            this.replayClock=discarded.intent.clock;
            let replayed:Item|undefined;
            try{replayed=this.gameAward(this.player,discarded.replayGameAward);}finally{this.replayClock=undefined;}
            if(replayed){
              replayed.awardRejections=(discarded.awardRejections??0)+(discarded===item?1:0);
              for(const barrier of barriers)barrier.after=Math.max(barrier.after,replayed.ordinal);
            }
          };
          if(rejectedAward)replayAward(item);
          // Re-project durable cab stages and replay independent game awards
          // in their original order. Neither was submitted behind this head,
          // so each receives a new wallet sequence while stage order is fixed.
          for(const discarded of abandoned){
            if(discarded.intent.action.kind==='cab-income'&&!this.failed&&item.intent.action.kind!=='cab-income'){
              advanceClock(discarded.intent.clock);
              if(!discarded.cabEvents||!this.projectCab(discarded.intent.action.intervals,discarded.cabEvents)){
                this.failed=true;if(!this.closed)try{this.socket.close(1011,'Cab income interrupted. Please rejoin.');}catch{}
              }else{
                discarded.intent.revision=this.nextRevision++;discarded.intent.sequence=this.nextSequence++;
                discarded.view=structuredClone(this.draft);this.queue.push(discarded);continue;
              }
            }
            if(discarded.intent.action.kind==='ticket'&&!this.failed){
              advanceClock(discarded.intent.clock);
              const evidence=discarded.intent.action.evidence,previousLevel=this.draft.delivery.level;
              applyTicketEvidence(this.draft.delivery,evidence);
              if(this.draft.delivery.level<previousLevel)rerouteInaccessibleOrder(this.draft.delivery,evidence,evidence.canFly);
              discarded.intent.revision=this.nextRevision++;discarded.intent.sequence=this.nextSequence++;
              discarded.view=structuredClone(this.draft);this.queue.push(discarded);continue;
            }
            if(discarded.intent.action.kind==='delivery'&&!this.failed){
              advanceClock(discarded.intent.clock);
              if(this.projectDelivery(discarded.intent.action)){
                discarded.intent.revision=this.nextRevision++;discarded.intent.sequence=this.nextSequence++;
                discarded.view=structuredClone(this.draft);this.queue.push(discarded);continue;
              }
              this.failed=true;if(!this.closed)try{this.socket.close(1011,'Delivery interrupted. Please rejoin.');}catch{}
            }
            if(discarded.intent.action.kind==='achievement'&&!this.failed){
              advanceClock(discarded.intent.clock);
              this.projectAchievement(discarded.intent.action.evidence);
              discarded.intent.revision=this.nextRevision++;discarded.intent.sequence=this.nextSequence++;
              discarded.view=structuredClone(this.draft);this.queue.push(discarded);continue;
            }
            if(discarded.intent.action.kind==='supply'&&!this.failed){
              advanceClock(discarded.intent.clock);
              this.projectSupply(discarded.intent.action.type);
              discarded.intent.revision=this.nextRevision++;discarded.intent.sequence=this.nextSequence++;
              discarded.view=structuredClone(this.draft);this.queue.push(discarded);continue;
            }
            this.markSettled(discarded.ordinal);
            if(discarded.intent.action.kind!=='cab-income')discarded.onApplied?.({ok:false,reason:'revision'});
            replayAward(discarded);
          }
          advanceClock(this.deliveryClock);
          // A disconnect may already have queued a final checkpoint behind
          // this rejected head; replace that discarded draft with the restored
          // committed order and its still-valid elapsed time.
          if(this.closed&&!this.failed&&this.timersChanged())this.enqueue({kind:'progress',progress:this.progress()});
        }else{
          const historical=item.intent.action.kind==='delivery'&&item.intent.action.multiplier===null;
          if((item.intent.action.kind==='cab-income'&&!this.rebaseCabIncome(item,outcome.progress))||
            (item.intent.action.kind==='ticket'&&!this.rebaseTicket(item,outcome.progress))||
            (item.intent.action.kind==='delivery'&&!historical&&!this.rebaseDelivery(item,outcome.progress))||
            (item.intent.action.kind==='achievement'&&!this.rebaseAchievement(item,outcome.progress))||
            (item.intent.action.kind==='supply'&&!this.rebaseSupply(item,outcome.progress))){
            // The committed receipt remains in the journal for fenced recovery.
            this.failed=true;this.closed=true;try{this.socket.close(1011,'Economy interrupted. Please rejoin.');}catch{}
            for(const pending of this.queue.splice(0))if(pending.intent.action.kind!=='cab-income'&&pending.intent.action.kind!=='ticket'&&pending.intent.action.kind!=='delivery'&&pending.intent.action.kind!=='achievement'&&pending.intent.action.kind!=='supply')pending.onApplied?.({ok:false,reason:'revision'});
            break;
          }
          this.committed=structuredClone(outcome.progress);this.committedRevision=outcome.revision;this.markSettled(item.ordinal);
          if(outcome.roomFund!==undefined)this.world.mars.roomFund=Math.max(this.world.mars.roomFund,outcome.roomFund);
          if(item.intent.action.kind==='progress')this.committedOtaPeriodEnd=item.view.delivery.ota.renewAt;
          if(!this.closed){
            const rewardId=this.player.delivery.lastReward?.id??0;
            this.install(outcome.progress);
            this.restoreCommittedOta();
            if(historical&&outcome.delivery?.lastReward){
              const reward=outcome.delivery.lastReward;
              this.player.delivery.lastReward={...reward,id:(this.player.delivery.lastReward?.id??0)+1};
              this.player.delivery.lastPayout=outcome.delivery.lastPayout;
            }else {
              this.player.delivery.lastReward=item.view.delivery.lastReward;
              this.player.delivery.lastPayout=item.view.delivery.lastPayout;
            }
            this.player.delivery.lastTicket=item.view.delivery.lastTicket;
            this.player.delivery.lastReroute=item.view.delivery.lastReroute;
            this.player.achievements.lastUnlock=item.view.achievements.lastUnlock;
            Object.assign(this.player.cockpit,item.view.cockpit);
            this.wallet();
            const reward=this.player.delivery.lastReward;
            if(reward&&reward.id>rewardId)this.send({type:'reward',reward});
          }
          if(historical){this.uncertainDeliveries--;this.reprojectAfterHistoricalRate();}
          item.onApplied?.(outcome);
        }
        // Acknowledge only after consuming the outcome. Retry without blocking
        // the room or other players; later events for this driver wait here.
        // Preserve a failed staged-income receipt for fenced recovery instead
        // of compacting away the only durable evidence of the owed interval.
        if(stageFailure&&!stageFailure.ok&&stageFailure.reason==='reserved'){if(!this.queue.length)this.flushCabIncome();continue;}
        if(!outcome.ok&&(item.intent.action.kind==='cab-income'||item.intent.action.kind==='ticket'||item.intent.action.kind==='delivery'||item.intent.action.kind==='achievement'||item.intent.action.kind==='supply'))break;
        let acknowledged=false;
        while(!acknowledged){
          try{acknowledged=await this.economy.acknowledge(item.intent);}catch{}
          if(!acknowledged)await wait(500);
        }
        if(!this.queue.length)this.flushCabIncome();
      }
    } finally { this.processing=false; }
  }
  pickup(player:Player,car:Entity,pickup:Pickup){
    if(this.failed||this.marketPaused||this.queue.length>=32||!pickup.active)return;
    pickup.active=false;pickup.readyAt=Infinity;this.pendingPickups.add(pickup.id);
    this.projectSupply(pickup.kind==='repair'?'repair':'air');
    const generation=this.pickupGenerations.get(pickup.id)??0;
    this.enqueue({kind:'supply',type:pickup.kind==='repair'?'repair':'air'},{id:pickup.id,generation},outcome=>{
      this.pendingPickups.delete(pickup.id);
      if(outcome.ok){
        this.pickupGenerations.set(pickup.id,generation+1);pickup.readyAt=this.world.time+20;
        if(this.world.entities.includes(car)){if(pickup.kind==='repair')car.health=100;else car.air=100;}
      }else if(outcome.reason==='reserved'){
        // Let the next ledger refresh restore the authoritative cooldown.
        pickup.active=false;pickup.readyAt=Infinity;
      }else {pickup.active=true;pickup.readyAt=undefined;}
    });
  }
  luxury(action:'buy'|'collect',vehicle:LuxuryVehicleId,requestId:number,onCollected?:()=>void){
    const entry=luxuryVehicle(vehicle),car=this.world.entities.find(e=>e.id===this.player.entityId);
    const reply=(ok:boolean,reason?:string,awards?:string[])=>this.send({type:'luxuryResult',requestId,action,vehicle,ok,...(reason?{reason}:{}),...(awards?{awards}:{})});
    if(this.failed||this.marketPaused||this.uncertainDeliveries||this.queue.length>=32||!entry||!car||this.lockedCar){reply(false,'unavailable');return;}
    if(action==='collect'){
      if(!this.committed.ownedLuxury.includes(vehicle)||!canCollectLuxury(car)){reply(false,'unavailable');return;}
      const ok=collectLuxury(this.world,this.player.id,vehicle);
      if(ok)this.restoreCurrentVehicle();
      if(ok)onCollected?.();
      reply(ok,ok?undefined:'no-space');return;
    }
    if(!atLuxuryShowroom(car)){reply(false,'location');return;}
    if(this.draft.ownedLuxury.includes(vehicle)){reply(false,'owned');return;}
    if(this.draft.delivery.cash<entry.price){reply(false,'unaffordable');return;}
    const awards=luxuryPurchaseAwards(vehicle,this.draft.ownedLuxury,this.draft.achievements.unlocked);
    const reward=awards.reduce((n,a)=>n+a.reward,0);
    const previousLevel=this.draft.delivery.level;
    this.draft.delivery.cash+=reward-entry.price;this.draft.delivery.lifetimeIncome+=reward;
    this.draft.delivery.level=levelForCash(this.draft.delivery.cash);this.draft.ownedLuxury.push(vehicle);
    for(const award of awards){const id=award.id as typeof this.draft.achievements.unlocked[number];this.draft.achievements.unlocked.push(id);this.draft.achievements.lastUnlock={id:(this.draft.achievements.lastUnlock?.id??0)+1,achievement:id};}
    const rerouted=this.draft.delivery.level<previousLevel && rerouteInaccessibleOrder(this.draft.delivery,car,hasRockets(car));
    this.enqueue({kind:'luxury',vehicle,...(rerouted?{order:{...this.draft.delivery.order}}:{})},undefined,outcome=>reply(outcome.ok,outcome.ok?undefined:outcome.reason,outcome.ok?outcome.awards:undefined));
  }
  restoreCurrentVehicle(){
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    const saved=car && this.committed.vehicles[car.kind];
    if(car && car.owner===this.player.id && !car.cab&&!car.retiredCab){
      this.paintPersonalVehicle(car);
      if(saved){car.upgrades={...initialVehicleUpgrades(),...structuredClone(saved.upgrades)};car.tankLevel=saved.tankLevel;car.style=structuredClone(saved.style);}
    }
  }
  boardMars(requestId:number){
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    const reply=(ok:boolean)=>this.send({type:'marsResult',requestId,action:'board',ok,amount:0});
    if(this.failed||this.marketPaused||this.uncertainDeliveries||!marsGoalReached(this.world.mars)||!car||!atMarsBoarding(car)||this.draft.achievements.unlocked.includes('to-mars')){reply(false);return;}
    const before=this.submitted;
    this.update(this.player,()=>awardMarsAchievement(this.player));
    const item=this.queue.at(-1);
    if(!item||this.submitted===before){reply(false);return;}
    const previous=item.onApplied;
    item.onApplied=outcome=>{
      previous?.(outcome);
      if(outcome.ok){if(this.world.mars.launchAt===null||this.world.time-this.world.mars.launchAt>=MARS_LAUNCH_SECONDS)this.world.mars.launchAt=this.world.time;reply(true);}
      else reply(false);
    };
  }
  contributeMars(amount:number,requestId:number){
    const reply=(ok:boolean,available?:number)=>this.send({type:'marsResult',requestId,action:'contribute',ok,amount:ok?amount:0,...(available!==undefined?{available}:{})});
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    if(this.failed||this.marketPaused||this.uncertainDeliveries||this.queue.length>=32||!car||!Number.isSafeInteger(amount)||amount<=0||amount>MARS_GOAL||this.draft.delivery.cash<amount){reply(false);return;}
    const previousLevel=this.draft.delivery.level;
    this.draft.delivery.cash-=amount;this.draft.delivery.level=levelForCash(this.draft.delivery.cash);
    const rerouted=this.draft.delivery.level<previousLevel&&rerouteInaccessibleOrder(this.draft.delivery,car,hasRockets(car));
    this.enqueue({kind:'contribute',amount,...(rerouted?{order:{...this.draft.delivery.order}}:{})},undefined,outcome=>reply(outcome.ok,outcome.ok?undefined:outcome.available));
  }
  ota(enabled:boolean,requestId:number){
    if(this.failed||this.marketPaused||this.uncertainDeliveries||this.queue.length>=32){this.send({type:'otaResult',requestId,enabled,ok:false});return;}
    this.update(this.player,()=>{subscribeOta(this.world,this.player.id,enabled);});
    const latest=this.queue.at(-1);
    const send=(ok:boolean)=>this.send({type:'otaResult',requestId,enabled,ok});
    if(latest&&!latest.result){const old=latest.onApplied;latest.onApplied=result=>{old?.(result);send(result.ok);};}else send(true);
  }
  workshop(type:'upgrade'|'vehicleStyle',requestId:number,value:UpgradeId|StyleChoice){
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    const reply=(ok:boolean)=>{
      if(type==='upgrade')this.send({type:'upgradeResult',requestId,upgrade:value,ok});
      else {const {category,choice}=value as StyleChoice;this.send({type:'vehicleStyleResult',requestId,category,choice,ok});}
    };
    if(this.failed||this.marketPaused||this.uncertainDeliveries||this.queue.length>=32||!car||car.kind==='person'||car.owner!==this.player.id||this.lockedCar){reply(false);return;}
    const clone=structuredClone(car),world={...this.world,entities:this.world.entities.map(e=>e===car?clone:e)};
    let ok=false;const before=this.submitted;
    this.update(this.player,()=>{
      ok=type==='upgrade'?buyUpgrade(world,this.player.id,value as UpgradeId):buyVehicleStyle(world,this.player.id,value as StyleChoice);
      if(ok){
        const previous=this.draft.vehicles[clone.kind];
        const upgrades={...clone.upgrades,rocket:type==='upgrade'&&value==='rocket'?clone.upgrades.rocket:previous?.upgrades.rocket??false};
        this.draft.vehicles={...this.draft.vehicles,[clone.kind]:{upgrades,tankLevel:clone.tankLevel,style:{...clone.style}}};
      }
    });
    if(this.submitted===before){reply(ok);return;}
    const item=this.queue.at(-1)!;this.lockedCar=ok;
    item.onApplied=result=>{
      this.lockedCar=false;
      if(result.ok&&ok&&this.world.entities.includes(car)){
        // A free rocket pickup can occur while this paid edit is in flight.
        // Keep that session capability without writing it to the saved car.
        const rocket=type==='upgrade'&&value==='rocket'?clone.upgrades.rocket:car.upgrades.rocket;
        car.upgrades={...clone.upgrades,rocket};car.tankLevel=clone.tankLevel;car.style={...clone.style};
        if(type==='upgrade'&&(value==='service'||value==='tank'||value==='rocket')){car.air=clone.air;if(value==='service')car.health=clone.health;}
      }
      reply(result.ok&&ok);
    };
  }
}
