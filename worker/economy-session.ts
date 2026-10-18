import { levelForCash, rerouteInaccessibleOrder, type DeliveryState } from '../shared/delivery';
import { hasRockets } from '../shared/upgrades';
import { atLuxuryShowroom, luxuryPurchaseAwards, luxuryVehicle, type LuxuryVehicleId } from '../shared/luxury';
import { buyUpgrade, buyVehicleStyle, canCollectLuxury, collectLuxury, subscribeOta, type CockpitStats, type EconomyHooks, type EconomyUpdateResult, type Entity, type Pickup, type Player, type World } from '../shared/game';
import { awardMarsAchievement, type AchievementState } from '../shared/achievements';
import { atMarsBoarding, marsGoalReached, MARS_GOAL, MARS_LAUNCH_SECONDS } from '../shared/mars';
import type { UpgradeId } from '../shared/upgrades';
import type { StyleChoice } from '../shared/vehicle-style';
import { DriverProfile, progressFrom, type DriverAction, type DriverOutcome, type DriverProgress, type EconomyIntent, type SavedVehicles } from './driver-profile';
import { RoomEconomy } from './room-economy';

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;ECONOMIES:DurableObjectNamespace<RoomEconomy>};
type Draft={delivery:DeliveryState;achievements:AchievementState;cockpit:CockpitStats;vehicles:SavedVehicles;ownedLuxury:LuxuryVehicleId[]};
type Item={ordinal:number;intent:EconomyIntent;view:Draft;result:DriverOutcome|null;onApplied?:(outcome:DriverOutcome)=>void};
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
// Compare only durable fields touched by simulation. Vehicle maps are copied on change.
const durableFields=(d:Draft)=>[d.delivery.cash,d.delivery.lifetimeIncome,d.delivery.earned,d.delivery.completed,d.delivery.level,d.delivery.tickets,d.delivery.order.restaurant,d.delivery.order.customer,d.delivery.order.stage,d.delivery.order.pickupEstimate,d.delivery.order.estimate,d.delivery.order.base,d.delivery.ota.enabled,d.delivery.ota.active,d.achievements.unlocked.length,d.vehicles];
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
  constructor(private env:Env,private economy:DurableObjectStub<RoomEconomy>,private world:World,private player:Player,private socket:WebSocket,
    driverId:string,fence:string,private roomId:string,revision:number,sequence:number,progress:DriverProgress,pickupGenerations:Map<string,number>,private pendingPickups:Set<string>) {
    this.driverId=driverId;this.fence=fence;this.nextRevision=revision;this.committedRevision=revision;this.nextSequence=sequence+1;this.committed=structuredClone(progress);
    this.pickupGenerations=pickupGenerations;
    this.install(progress);
    this.draft={delivery:structuredClone(player.delivery),achievements:structuredClone(player.achievements),cockpit:structuredClone(player.cockpit),vehicles:structuredClone(progress.vehicles),ownedLuxury:[...progress.ownedLuxury]};
    this.committedOtaPeriodEnd=player.delivery.ota.renewAt;
    this.rememberTimers();
  }
  private driver(id=this.driverId){return this.env.DRIVERS.get(this.env.DRIVERS.idFromName(id));}
  private send(value:unknown){if(this.closed)return;try{this.socket.send(JSON.stringify(value));}catch{}}
  private install(progress:DriverProgress){
    const d=this.player.delivery;
    Object.assign(d,{cash:progress.cash,lifetimeIncome:progress.eligibleIncome,earned:progress.earned,completed:progress.completed,level:progress.level,order:{...progress.order},tickets:progress.tickets});
    d.ota={enabled:progress.ota.enabled,active:progress.ota.active&&progress.ota.remaining>0,renewAt:progress.ota.active&&progress.ota.remaining>0?this.world.time+progress.ota.remaining:null};
    this.player.achievements.unlocked=[...progress.unlocked];
  }
  private progress():DriverProgress{return progressFrom(this.draft.delivery,this.draft.achievements.unlocked,this.draft.vehicles,this.draft.ownedLuxury,this.world.time,this.draft.delivery.lifetimeIncome);}
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
  private wallet(){this.send({type:'wallet',cash:this.committed.cash,earned:this.committed.earned,eligibleIncome:this.committed.eligibleIncome,level:this.committed.level,unlocked:this.committed.unlocked,ownedLuxury:this.committed.ownedLuxury});}
  initialWallet(){this.wallet();}
  get pending(){return this.queue.length>0;}
  get vehicleLocked(){return this.lockedCar;}
  get unstarted(){return this.submitted===0&&this.draft.delivery.earned===0&&this.draft.delivery.lifetimeIncome===0&&this.draft.achievements.unlocked.length===0;}
  get walletId(){return this.driverId;}
  get currentFence(){return this.fence;}
  close(){this.closed=true;}
  finish(){
    if(!this.failed && this.timersChanged())
      this.enqueue({kind:'progress',progress:this.progress()});
    this.close();
  }
  async freeze():Promise<void>{
    if(!this.closed){this.closed=true;try{this.socket.close(1008,'Driver opened in another room.');}catch{}}
    while(this.processing || this.queue.length)await wait(100);
  }
  barrier(token:number){this.barriers.push({token,after:this.submitted});}
  sync():number|undefined{
    const done=this.barriers.filter(b=>b.after<=this.settled);this.barriers=this.barriers.filter(b=>b.after>this.settled);
    return done.length?Math.max(...done.map(b=>b.token)):undefined;
  }
  /** The caller must serialize identity switches and ensure no guest events happened. */
  replace(driverId:string,fence:string,revision:number,sequence:number,progress:DriverProgress){
    this.driverId=driverId;this.fence=fence;this.nextRevision=revision;this.committedRevision=revision;this.nextSequence=sequence+1;this.committed=structuredClone(progress);
    this.install(progress);
    this.draft={delivery:structuredClone(this.player.delivery),achievements:structuredClone(this.player.achievements),cockpit:structuredClone(this.player.cockpit),vehicles:structuredClone(progress.vehicles),ownedLuxury:[...progress.ownedLuxury]};
    this.committedOtaPeriodEnd=this.player.delivery.ota.renewAt;
    this.rememberTimers();
    this.wallet();
  }
  hooks():EconomyHooks {return {update:(player,apply)=>this.update(player,apply),pickup:(player,car,pickup)=>this.pickup(player,car,pickup)};}
  update(player:Player,apply:()=>EconomyUpdateResult){
    if(this.failed)return;
    // Bound memory during an extended backend outage. The pending events keep
    // retrying after this driver leaves; the rest of the room is unaffected.
    if(this.queue.length>=32){
      this.failed=true;
      try{this.socket.close(1011,'Wallet delayed. Rejoin to recover.');}catch{}
      return;
    }
    const live={delivery:player.delivery,achievements:player.achievements,cockpit:player.cockpit};
    const before=durableFields(this.draft);
    const previousLevel=this.draft.delivery.level;
    player.delivery=this.draft.delivery;player.achievements=this.draft.achievements;player.cockpit=this.draft.cockpit;
    try{
      apply();player.delivery.level=levelForCash(player.delivery.cash);
      if(player.delivery.level<previousLevel){
        const car=this.world.entities.find(e=>e.id===player.entityId);
        if(car)rerouteInaccessibleOrder(player.delivery,car,hasRockets(car));
      }
    }finally{
      player.delivery=live.delivery;player.achievements=live.achievements;player.cockpit=live.cockpit;
    }
    if(changed(before,durableFields(this.draft)))this.enqueue({kind:'progress',progress:this.progress()});
    else if(!this.pending && this.world.time-this.lastTimerCheckpoint>=10 && this.timersChanged())this.enqueue({kind:'progress',progress:this.progress()});
    // Timers and flight geometry can advance visually; money, awards and order stages remain committed.
    if(!this.pending){
      live.delivery.activeSeconds=this.draft.delivery.activeSeconds;live.delivery.activeUntil=this.draft.delivery.activeUntil;
      live.delivery.order.elapsed=this.draft.delivery.order.elapsed;Object.assign(live.cockpit,this.draft.cockpit);
    }
    Object.assign(live.achievements,{groundShore:this.draft.achievements.groundShore,crossing:this.draft.achievements.crossing,lastPosition:this.draft.achievements.lastPosition});
  }
  private enqueue(action:DriverAction,pickup?:{id:string;generation:number},onApplied?:(outcome:DriverOutcome)=>void){
    const ordinal=++this.submitted;
    const intent:EconomyIntent={eventId:crypto.randomUUID(),driverId:this.driverId,fence:this.fence,roomId:this.roomId,revision:this.nextRevision++,sequence:this.nextSequence++,action,...(pickup?{pickup}:{})};
    const item:Item={ordinal,intent,view:structuredClone(this.draft),result:null,onApplied};this.queue.push(item);
    if(action.kind==='progress')this.rememberTimers();
    if(!this.processing)void this.process();
    return item;
  }
  private async process(){
    this.processing=true;
    try {
      while(this.queue.length){
        const item=this.queue[0];
        let outcome:DriverOutcome|null=null;
        while(!outcome){
          try{outcome=await this.economy.submit(item.intent);}catch{}
          if(!outcome)await wait(500);
        }
        this.queue.shift();
        if(!outcome.ok){
          // Later drafts were never submitted and must not survive a failed head.
          const abandoned=this.queue.splice(0);
          this.nextRevision=this.committedRevision;
          this.settled=abandoned.at(-1)?.ordinal??item.ordinal;
          const draft=this.draft.delivery,old=draft.order,saved=this.committed.order;
          const sameOrder=draft.completed===this.committed.completed && old.restaurant===saved.restaurant && old.customer===saved.customer &&
            old.stage===saved.stage && old.pickupEstimate===saved.pickupEstimate && old.estimate===saved.estimate && old.base===saved.base;
          const elapsed=sameOrder?Math.max(saved.elapsed,old.elapsed):saved.elapsed;
          this.install(this.committed);
          this.player.delivery.order.elapsed=elapsed;
          // The committed period keeps counting down even if a later draft
          // speculatively renewed or disabled the subscription.
          this.restoreCommittedOta();
          this.draft={delivery:structuredClone(this.player.delivery),achievements:structuredClone(this.player.achievements),cockpit:structuredClone(this.player.cockpit),vehicles:structuredClone(this.committed.vehicles),ownedLuxury:[...this.committed.ownedLuxury]};
          // Preserved elapsed time is still dirty and must flush on disconnect.
          this.lastOrderElapsed=saved.elapsed;
          this.lastOtaRemaining=this.committed.ota.active?this.committed.ota.remaining:null;
          this.lastTimerCheckpoint=this.world.time;
          if(outcome.reason==='superseded'||outcome.reason==='conflict'){
            this.failed=true;
            if(!this.closed)try{this.socket.close(1011,'Economy interrupted. Rejoin to recover.');}catch{}
            this.closed=true;
          }
          item.onApplied?.(outcome);
          for(const discarded of abandoned)discarded.onApplied?.({ok:false,reason:'revision'});
          // A disconnect may already have queued a final checkpoint behind
          // this rejected head; replace that discarded draft with the restored
          // committed order and its still-valid elapsed time.
          if(this.closed&&!this.failed&&this.timersChanged())this.enqueue({kind:'progress',progress:this.progress()});
        }else{
          this.committed=structuredClone(outcome.progress);this.committedRevision=outcome.revision;this.settled=item.ordinal;
          if(outcome.roomFund!==undefined)this.world.mars.roomFund=Math.max(this.world.mars.roomFund,outcome.roomFund);
          if(item.intent.action.kind==='progress')this.committedOtaPeriodEnd=item.view.delivery.ota.renewAt;
          if(!this.closed){
            this.install(outcome.progress);
            this.restoreCommittedOta();
            this.player.delivery.lastReward=item.view.delivery.lastReward;
            this.player.delivery.lastPayout=item.view.delivery.lastPayout;
            this.player.delivery.lastTicket=item.view.delivery.lastTicket;
            this.player.delivery.lastReroute=item.view.delivery.lastReroute;
            this.player.achievements.lastUnlock=item.view.achievements.lastUnlock;
            Object.assign(this.player.cockpit,item.view.cockpit);
            this.wallet();
          }
          item.onApplied?.(outcome);
        }
        // Acknowledge only after consuming the outcome. Retry without blocking
        // the room or other players; later events for this driver wait here.
        let acknowledged=false;
        while(!acknowledged){
          try{acknowledged=await this.economy.acknowledge(item.intent);}catch{}
          if(!acknowledged)await wait(500);
        }
      }
    } finally { this.processing=false; }
  }
  pickup(player:Player,car:Entity,pickup:Pickup){
    if(this.failed||this.queue.length>=32||!pickup.active)return;
    pickup.active=false;pickup.readyAt=Infinity;this.pendingPickups.add(pickup.id);
    const live={delivery:player.delivery,achievements:player.achievements,cockpit:player.cockpit};
    player.delivery=this.draft.delivery;player.achievements=this.draft.achievements;player.cockpit=this.draft.cockpit;
    player.delivery.cash+=5;player.delivery.lifetimeIncome+=5;player.delivery.level=levelForCash(player.delivery.cash);
    player.delivery.lastReward={id:(player.delivery.lastReward?.id??0)+1,kind:pickup.kind==='repair'?'supply-repair':'supply-air',amount:5};
    player.delivery=live.delivery;player.achievements=live.achievements;player.cockpit=live.cockpit;
    const generation=this.pickupGenerations.get(pickup.id)??0;
    this.enqueue({kind:'progress',progress:this.progress()},{id:pickup.id,generation},outcome=>{
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
    if(this.failed||this.queue.length>=32||!entry||!car||this.lockedCar){reply(false,'unavailable');return;}
    if(action==='collect'){
      if(!this.committed.ownedLuxury.includes(vehicle)||!canCollectLuxury(car)){reply(false,'unavailable');return;}
      const ok=collectLuxury(this.world,this.player.id,vehicle);
      if(ok){const selected=this.world.entities.find(e=>e.id===this.player.entityId),saved=this.committed.vehicles[vehicle];if(selected&&saved){selected.upgrades=structuredClone(saved.upgrades);selected.tankLevel=saved.tankLevel;selected.style=structuredClone(saved.style);}}
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
    if(car && car.owner===this.player.id && saved){car.upgrades=structuredClone(saved.upgrades);car.tankLevel=saved.tankLevel;car.style=structuredClone(saved.style);}
  }
  boardMars(requestId:number){
    const car=this.world.entities.find(e=>e.id===this.player.entityId);
    const reply=(ok:boolean)=>this.send({type:'marsResult',requestId,action:'board',ok,amount:0});
    if(!marsGoalReached(this.world.mars)||!car||!atMarsBoarding(car)||this.draft.achievements.unlocked.includes('to-mars')){reply(false);return;}
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
    if(this.failed||this.queue.length>=32||!car||!Number.isSafeInteger(amount)||amount<=0||amount>MARS_GOAL||this.draft.delivery.cash<amount){reply(false);return;}
    const previousLevel=this.draft.delivery.level;
    this.draft.delivery.cash-=amount;this.draft.delivery.level=levelForCash(this.draft.delivery.cash);
    const rerouted=this.draft.delivery.level<previousLevel&&rerouteInaccessibleOrder(this.draft.delivery,car,hasRockets(car));
    this.enqueue({kind:'contribute',amount,...(rerouted?{order:{...this.draft.delivery.order}}:{})},undefined,outcome=>reply(outcome.ok,outcome.ok?undefined:outcome.available));
  }
  ota(enabled:boolean,requestId:number){
    if(this.failed||this.queue.length>=32){this.send({type:'otaResult',requestId,enabled,ok:false});return;}
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
    if(this.failed||this.queue.length>=32||!car||car.kind==='person'||car.owner!==this.player.id||this.lockedCar){reply(false);return;}
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
