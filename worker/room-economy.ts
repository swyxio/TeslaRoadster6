import { DurableObject } from 'cloudflare:workers';
import { DriverProfile, type DriverAction, type DriverOutcome, type EconomyIntent } from './driver-profile';
import type { GameRoom } from './index';
import { MARS_GOAL } from '../shared/mars';
import type { CybercabInterval } from '../shared/cybercabs';
import { RoomEarningsEvents, type RoomEventCursor } from './room-earnings-events';
import type { GlobalEarningsEvent } from './global-earnings-event';
import type { EarningsEvents, EarningsWindow } from '../shared/earnings-events';
import { isAchievementEvidence } from '../shared/achievement-evidence';

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;ROOMS:DurableObjectNamespace<GameRoom>;GLOBAL_EVENTS:DurableObjectNamespace<GlobalEarningsEvent>};
type IntentRecord={intent:EconomyIntent;outcome:DriverOutcome|null;cabEvents?:EarningsEvents;stageSequence?:number;walletOrder?:number};
type Acknowledged={fence:string;sequence:number};
type PickupReservation={eventId:string|null;generation:number;readyAt:number};
type RoomFund={balance:number;reserved:number};
/** sequence orders stages within a fence; wallet sequence is assigned at settlement. */
export type CabIncomeStage={eventId:string;driverId:string;fence:string;roomId:string;sequence:number;intervals:CybercabInterval[]};
export type TicketStage={eventId:string;driverId:string;fence:string;roomId:string;walletOrder:number;clock?:number;action:Extract<DriverAction,{kind:'ticket'}>};
export type DeliveryStage={eventId:string;driverId:string;fence:string;roomId:string;walletOrder:number;clock:number;action:Extract<DriverAction,{kind:'delivery'}>};
export type AchievementStage={eventId:string;driverId:string;fence:string;roomId:string;walletOrder:number;clock:number;action:Extract<DriverAction,{kind:'achievement'}>};
export type PickupStage={eventId:string;driverId:string;fence:string;roomId:string;walletOrder:number;clock:number;action:Extract<DriverAction,{kind:'supply'}>;pickup:{id:string;generation:number}};
const stageKey=(stage:CabIncomeStage)=>`cab-stage:${stage.driverId}:${stage.eventId}`;
const ticketKey=(stage:Pick<TicketStage,'driverId'|'eventId'>)=>`ticket-stage:${stage.driverId}:${stage.eventId}`;
const deliveryKey=(stage:Pick<DeliveryStage,'driverId'|'eventId'>)=>`delivery-stage:${stage.driverId}:${stage.eventId}`;
const achievementKey=(stage:Pick<AchievementStage,'driverId'|'eventId'>)=>`achievement-stage:${stage.driverId}:${stage.eventId}`;
const supplyKey=(stage:Pick<PickupStage,'driverId'|'eventId'>)=>`supply-stage:${stage.driverId}:${stage.eventId}`;
const cabOrderKey=(stage:Pick<CabIncomeStage,'driverId'|'eventId'>)=>`cab-order:${stage.driverId}:${stage.eventId}`;
const walletOrderKey=(stage:Pick<TicketStage,'driverId'|'fence'>,order:number)=>`wallet-stage:${stage.driverId}:${stage.fence}:${order}`;
const stageEventsKey=(stage:Pick<CabIncomeStage,'driverId'|'eventId'>)=>`cab-events:${stage.driverId}:${stage.eventId}`;
const stageHighKey=(stage:Pick<CabIncomeStage,'driverId'|'fence'>)=>`cab-stage-high:${stage.driverId}:${stage.fence}`;
const submittedHighKey=(driverId:string,fence:string)=>`wallet-submitted-high:${driverId}:${fence}`;
const closedFenceKey=(driverId:string,fence:string)=>`closed-fence:${driverId}:${fence}`;
const matchesStage=(stage:CabIncomeStage,intent:EconomyIntent)=>intent.action.kind==='cab-income' &&
  stage.eventId===intent.eventId&&stage.driverId===intent.driverId&&stage.fence===intent.fence&&stage.roomId===intent.roomId&&
  JSON.stringify(stage.intervals)===JSON.stringify(intent.action.intervals);
const RETRY_MS=1000;
const ALARM_WAIT_MS=250;
const PICKUP_COOLDOWN_MS=20_000;

/** Separate from GameRoom so a slow profile or storage output gate cannot stop physics. */
export class RoomEconomy extends DurableObject<Env> {
  private flights=new Map<string,Promise<void>>();
  private freezes=new Map<string,Promise<void>>();
  private recoveries=new Map<string,Promise<void>>();
  private earningsEvents=new RoomEarningsEvents(this.ctx.storage);
  private profile(id:string){return this.env.DRIVERS.get(this.env.DRIVERS.idFromName(id));}
  private async stages(driverId:string):Promise<CabIncomeStage[]>{
    return [...(await this.ctx.storage.list<CabIncomeStage>({prefix:`cab-stage:${driverId}:`})).values()];
  }
  private async tickets(driverId:string):Promise<TicketStage[]>{
    return [...(await this.ctx.storage.list<TicketStage>({prefix:`ticket-stage:${driverId}:`})).values()];
  }
  private async deliveries(driverId:string):Promise<DeliveryStage[]>{
    return [...(await this.ctx.storage.list<DeliveryStage>({prefix:`delivery-stage:${driverId}:`})).values()];
  }
  private async achievements(driverId:string):Promise<AchievementStage[]>{
    return [...(await this.ctx.storage.list<AchievementStage>({prefix:`achievement-stage:${driverId}:`})).values()];
  }
  private async supplies(driverId:string):Promise<PickupStage[]>{
    return [...(await this.ctx.storage.list<PickupStage>({prefix:`supply-stage:${driverId}:`})).values()];
  }

  /** Trusted room RPCs; pending wins fence later payout and cab observations. */
  prepareEarningsWin(eventId:string,atMs:number){return this.earningsEvents.prepareWin(eventId,atMs);}
  recordEarningsWinWithoutPayout(eventId:string,atMs:number){return this.earningsEvents.recordWinWithoutPayout(eventId,atMs);}
  commitEarningsWin(eventId:string){return this.earningsEvents.commitWin(eventId);}
  pendingEarningsWin(){return this.earningsEvents.pendingWin();}
  earningsAt(atMs:number){return this.earningsEvents.activeUntil(atMs);}
  earningsHistory(fromMs:number,toMs:number,cursor?:RoomEventCursor){return this.earningsEvents.history(fromMs,toMs,cursor);}

  /** Seed once from the read-only legacy GameRoom key; later credits live here. */
  async initializeRoomFund(legacy:number):Promise<number>{
    if(!Number.isSafeInteger(legacy)||legacy<0||legacy>MARS_GOAL)throw new Error('Invalid legacy room fund');
    return this.ctx.storage.transaction(async txn=>{
      const fund=await txn.get<RoomFund>('room-fund');
      if(fund)return fund.balance;
      await txn.put('room-fund',{balance:legacy,reserved:0} satisfies RoomFund);
      return legacy;
    });
  }
  async roomFund():Promise<number>{
    const fund=await this.ctx.storage.get<RoomFund>('room-fund');
    if(!fund)throw new Error('Room fund not initialized');
    return fund.balance;
  }

  /** Persist trusted, observed work without waiting for this driver's wallet queue. */
  async stageCab(stage:CabIncomeStage):Promise<'accepted'|'superseded'|'conflict'> {
    if(!stage.eventId||!stage.driverId||!stage.fence||!stage.roomId||!Number.isSafeInteger(stage.sequence)||stage.sequence<1||
       !Array.isArray(stage.intervals)||!stage.intervals.length||stage.intervals.length>128)return 'conflict';
    if(!await this.profile(stage.driverId).checkFence(stage.fence))return 'superseded';
    const result=await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<CabIncomeStage>(stageKey(stage));
      if(existing)return JSON.stringify(existing)===JSON.stringify(stage)?'accepted':'conflict';
      const intent=await txn.get<IntentRecord>(`intent:${stage.eventId}`);
      if(intent)return matchesStage(stage,intent.intent)&&intent.stageSequence===stage.sequence?'accepted':'conflict';
      if(await txn.get<boolean>(`frozen:${stage.driverId}:${stage.fence}`)||await txn.get<boolean>(closedFenceKey(stage.driverId,stage.fence)))return 'superseded';
      const high=await txn.get<number>(stageHighKey(stage))??0;
      if(stage.sequence!==high+1)return stage.sequence<=high?'superseded':'conflict';
      await txn.put({[stageKey(stage)]:stage,[stageHighKey(stage)]:stage.sequence});
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return 'accepted';
    });
    if(result!=='accepted')return result;
    // A stage can race a freeze that completes between the fence check and the
    // transaction. Never accept a newly inserted stage for an already sealed
    // profile. A stage converted to an intent is owned by the journal instead.
    if(await this.profile(stage.driverId).checkFence(stage.fence))return result;
    await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<CabIncomeStage>(stageKey(stage));
      if(existing&&JSON.stringify(existing)===JSON.stringify(stage)){
        await txn.delete(stageKey(stage));
        if(await txn.get<number>(stageHighKey(stage))===stage.sequence)await txn.delete(stageHighKey(stage));
      }
    });
    return 'superseded';
  }

  /** Assign a prepared cab's place in the wallet before accepting later physical work. */
  async assignCab(stage:CabIncomeStage,walletOrder:number):Promise<'accepted'|'superseded'|'conflict'> {
    if(!Number.isSafeInteger(walletOrder)||walletOrder<1)return 'conflict';
    if(!await this.profile(stage.driverId).checkFence(stage.fence))return 'superseded';
    return this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<CabIncomeStage>(stageKey(stage));
      const intent=await txn.get<IntentRecord>(`intent:${stage.eventId}`);
      if((!existing||JSON.stringify(existing)!==JSON.stringify(stage))&&(!intent||!matchesStage(stage,intent.intent)))return 'conflict';
      const orderKey=walletOrderKey(stage,walletOrder),owner=await txn.get<string>(orderKey);
      const previous=await txn.get<number>(cabOrderKey(stage));
      if((owner&&owner!==stage.eventId)||(previous!==undefined&&previous!==walletOrder))return 'conflict';
      if(await txn.get<boolean>(`frozen:${stage.driverId}:${stage.fence}`)||await txn.get<boolean>(closedFenceKey(stage.driverId,stage.fence)))return 'superseded';
      if(!existing)return owner===stage.eventId?'accepted':'conflict';
      if(previous===undefined&&(await txn.get<number>(submittedHighKey(stage.driverId,stage.fence))??0)>=walletOrder)return 'conflict';
      await txn.put({[orderKey]:stage.eventId,[cabOrderKey(stage)]:walletOrder});
      return 'accepted';
    });
  }

  /** Persist one immutable police stop before it enters the profile. */
  async stageTicket(stage:TicketStage):Promise<'accepted'|'superseded'|'conflict'> {
    if(!stage.eventId||!stage.driverId||!stage.fence||!stage.roomId||!Number.isSafeInteger(stage.walletOrder)||stage.walletOrder<1||
      (stage.clock!==undefined&&(!Number.isFinite(stage.clock)||stage.clock<0)))return 'conflict';
    if(!await this.profile(stage.driverId).checkFence(stage.fence))return 'superseded';
    const result=await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<TicketStage>(ticketKey(stage));
      if(existing)return JSON.stringify(existing)===JSON.stringify(stage)?'accepted':'conflict';
      const intent=await txn.get<IntentRecord>(`intent:${stage.eventId}`);
      if(intent)return intent.intent.action.kind==='ticket'&&intent.intent.driverId===stage.driverId&&intent.intent.fence===stage.fence&&intent.intent.roomId===stage.roomId&&
        JSON.stringify(intent.intent.action)===JSON.stringify(stage.action)&&intent.intent.clock===stage.clock&&await txn.get<string>(walletOrderKey(stage,stage.walletOrder))===stage.eventId?'accepted':'conflict';
      if(await txn.get<boolean>(`frozen:${stage.driverId}:${stage.fence}`)||await txn.get<boolean>(closedFenceKey(stage.driverId,stage.fence)))return 'superseded';
      const key=walletOrderKey(stage,stage.walletOrder),owner=await txn.get<string>(key);
      // An order whose stage and intent are gone was already acknowledged.
      // Never resurrect it when a delayed stage reply is retried.
      if(owner)return owner===stage.eventId?'superseded':'conflict';
      if((await txn.get<number>(submittedHighKey(stage.driverId,stage.fence))??0)>=stage.walletOrder)return 'conflict';
      await txn.put({[ticketKey(stage)]:stage,[key]:stage.eventId});
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return 'accepted';
    });
    if(result!=='accepted')return result;
    if(await this.profile(stage.driverId).checkFence(stage.fence))return result;
    await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<TicketStage>(ticketKey(stage));
      if(current&&JSON.stringify(current)===JSON.stringify(stage)){
        await txn.delete(ticketKey(stage));
        const key=walletOrderKey(stage,stage.walletOrder);
        if(await txn.get<string>(key)===stage.eventId)await txn.delete(key);
      }
    });
    return 'superseded';
  }

  /** Journal a qualifying physical stop independently of the speculative order. */
  async stageDelivery(stage:DeliveryStage):Promise<'accepted'|'superseded'|'conflict'> {
    const action=stage.action,stop=action?.stop;
    if(action?.kind!=='delivery'||!stop||![stop.x,stop.y,stop.z,stop.vy,stop.speed].every(Number.isFinite)||
      typeof stop.kind!=='string'||(stop.supportId!==null&&typeof stop.supportId!=='string')||typeof stop.canFly!=='boolean'||
      !Number.isSafeInteger(action.atMs)||action.atMs<0||action.atMs>Date.now()||![null,1,1.5,2,3].includes(action.multiplier))return 'conflict';
    return this.stageObservation(stage,deliveryKey(stage));
  }
  /** Journal immutable room-verified physical or match achievement evidence. */
  async stageAchievement(stage:AchievementStage):Promise<'accepted'|'superseded'|'conflict'> {
    if(stage.action?.kind!=='achievement'||!isAchievementEvidence(stage.action.evidence))return 'conflict';
    return this.stageObservation(stage,achievementKey(stage));
  }
  private async stageObservation(stage:DeliveryStage|AchievementStage,stageKey:string):Promise<'accepted'|'superseded'|'conflict'> {
    if(!stage.eventId||!stage.driverId||!stage.fence||!stage.roomId||!Number.isSafeInteger(stage.walletOrder)||stage.walletOrder<1||
      !Number.isFinite(stage.clock)||stage.clock<0)return 'conflict';
    if(!await this.profile(stage.driverId).checkFence(stage.fence))return 'superseded';
    const result=await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<DeliveryStage|AchievementStage>(stageKey);
      if(existing)return JSON.stringify(existing)===JSON.stringify(stage)?'accepted':'conflict';
      const intent=await txn.get<IntentRecord>(`intent:${stage.eventId}`);
      if(intent)return intent.intent.action.kind===stage.action.kind&&intent.intent.driverId===stage.driverId&&intent.intent.fence===stage.fence&&intent.intent.roomId===stage.roomId&&
        intent.intent.clock===stage.clock&&JSON.stringify(intent.intent.action)===JSON.stringify(stage.action)&&
        await txn.get<string>(walletOrderKey(stage,stage.walletOrder))===stage.eventId?'accepted':'conflict';
      if(await txn.get<boolean>(`frozen:${stage.driverId}:${stage.fence}`)||await txn.get<boolean>(closedFenceKey(stage.driverId,stage.fence)))return 'superseded';
      const key=walletOrderKey(stage,stage.walletOrder),owner=await txn.get<string>(key);
      if(owner)return owner===stage.eventId?'superseded':'conflict';
      if((await txn.get<number>(submittedHighKey(stage.driverId,stage.fence))??0)>=stage.walletOrder)return 'conflict';
      await txn.put({[stageKey]:stage,[key]:stage.eventId});
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return 'accepted';
    });
    if(result!=='accepted')return result;
    if(await this.profile(stage.driverId).checkFence(stage.fence))return result;
    await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<DeliveryStage|AchievementStage>(stageKey);
      if(current&&JSON.stringify(current)===JSON.stringify(stage)){
        await txn.delete(stageKey);
        const key=walletOrderKey(stage,stage.walletOrder);
        if(await txn.get<string>(key)===stage.eventId)await txn.delete(key);
      }
    });
    return 'superseded';
  }

  /** Claim a physical supply contact and its pickup generation atomically. */
  async stageSupply(stage:PickupStage):Promise<'accepted'|'reserved'|'superseded'|'conflict'> {
    if(!stage.eventId||!stage.driverId||!stage.fence||!stage.roomId||!Number.isSafeInteger(stage.walletOrder)||stage.walletOrder<1||
      !Number.isFinite(stage.clock)||stage.clock<0||stage.action?.kind!=='supply'||!['repair','air'].includes(stage.action.type)||
      !stage.pickup||typeof stage.pickup.id!=='string'||!stage.pickup.id||!Number.isSafeInteger(stage.pickup.generation)||stage.pickup.generation<0)return 'conflict';
    if(!await this.profile(stage.driverId).checkFence(stage.fence))return 'superseded';
    const result=await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<PickupStage>(supplyKey(stage));
      if(existing)return JSON.stringify(existing)===JSON.stringify(stage)?'accepted':'conflict';
      const intent=await txn.get<IntentRecord>(`intent:${stage.eventId}`);
      if(intent)return intent.intent.action.kind==='supply'&&intent.intent.driverId===stage.driverId&&intent.intent.fence===stage.fence&&intent.intent.roomId===stage.roomId&&
        intent.intent.clock===stage.clock&&JSON.stringify(intent.intent.action)===JSON.stringify(stage.action)&&JSON.stringify(intent.intent.pickup)===JSON.stringify(stage.pickup)&&
        await txn.get<string>(walletOrderKey(stage,stage.walletOrder))===stage.eventId?'accepted':'conflict';
      if(await txn.get<boolean>(`frozen:${stage.driverId}:${stage.fence}`)||await txn.get<boolean>(closedFenceKey(stage.driverId,stage.fence)))return 'superseded';
      const orderKey=walletOrderKey(stage,stage.walletOrder),owner=await txn.get<string>(orderKey);
      if(owner)return owner===stage.eventId?'superseded':'conflict';
      if((await txn.get<number>(submittedHighKey(stage.driverId,stage.fence))??0)>=stage.walletOrder)return 'conflict';
      const pickupKey=`pickup:${stage.pickup.id}`;
      const pickup=await txn.get<PickupReservation>(pickupKey)??{eventId:null,generation:0,readyAt:0};
      if(pickup.eventId!==null||pickup.readyAt>Date.now()||pickup.generation!==stage.pickup.generation)return 'reserved';
      await txn.put({[supplyKey(stage)]:stage,[orderKey]:stage.eventId,[pickupKey]:{...pickup,eventId:stage.eventId} satisfies PickupReservation});
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return 'accepted';
    });
    if(result!=='accepted')return result;
    if(await this.profile(stage.driverId).checkFence(stage.fence))return result;
    await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<PickupStage>(supplyKey(stage));
      if(current&&JSON.stringify(current)===JSON.stringify(stage)){
        await txn.delete(supplyKey(stage));
        const orderKey=walletOrderKey(stage,stage.walletOrder);
        if(await txn.get<string>(orderKey)===stage.eventId)await txn.delete(orderKey);
        const pickupKey=`pickup:${stage.pickup.id}`,pickup=await txn.get<PickupReservation>(pickupKey);
        if(pickup?.eventId===stage.eventId&&pickup.generation===stage.pickup.generation)await txn.put(pickupKey,{...pickup,eventId:null});
      }
    });
    return 'superseded';
  }

  private async cabHistory(roomId:string,intervals:CybercabInterval[]):Promise<EarningsEvents>{
    if(!Array.isArray(intervals)||!intervals.length||intervals.length>128||intervals.some(interval=>
      !Number.isSafeInteger(interval.startMs)||!Number.isSafeInteger(interval.endMs)||interval.startMs<0||interval.endMs<=interval.startMs||interval.endMs>Date.now()))
      throw new Error('Invalid cab history interval');
    const from=Math.min(...intervals.map(interval=>interval.startMs)),to=Math.max(...intervals.map(interval=>interval.endMs));
    const room=await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId)).cabEarningsHistory(roomId,from,to);
    const global:EarningsWindow[]=[];
    const service=this.env.GLOBAL_EVENTS.get(this.env.GLOBAL_EVENTS.idFromName('global'));
    let cursor:number|undefined;
    for(;;){
      const page=await service.history(from,to,cursor);global.push(...page.windows);
      if(page.next===null)break;
      if(!Number.isSafeInteger(page.next)||(cursor!==undefined&&page.next<=cursor)||page.next>=to)throw new Error('Invalid global history cursor');
      cursor=page.next;
    }
    return {room,global};
  }

  /** Complete and durably capture history before the producer projects a credit. */
  async prepareCab(stage:CabIncomeStage):Promise<EarningsEvents>{
    const key=stageKey(stage),eventsKey=stageEventsKey(stage);
    const existing=await this.ctx.storage.get<CabIncomeStage>(key);
    if(!existing||JSON.stringify(existing)!==JSON.stringify(stage))throw new Error('Missing cab stage');
    const cached=await this.ctx.storage.get<EarningsEvents>(eventsKey);
    if(cached)return cached;
    // The room barrier calls back into this object: do not hold a transaction.
    const events=await this.cabHistory(stage.roomId,stage.intervals);
    return this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<CabIncomeStage>(key);
      if(!current||JSON.stringify(current)!==JSON.stringify(stage))throw new Error('Missing cab stage');
      const saved=await txn.get<EarningsEvents>(eventsKey);
      if(saved)return saved;
      await txn.put(eventsKey,events);return events;
    });
  }

  async submit(intent:EconomyIntent):Promise<DriverOutcome|null>{
    if(!Number.isSafeInteger(intent.sequence)||intent.sequence<1)return {ok:false,reason:'invalid'};
    if(intent.action.kind==='contribute'&&intent.pickup)return {ok:false,reason:'invalid'};
    if(intent.action.kind==='supply'&&!intent.pickup)return {ok:false,reason:'invalid'};
    const key=`intent:${intent.eventId}`;
    const result=await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<IntentRecord>(key);
      if(existing){
        if(JSON.stringify(existing.intent)!==JSON.stringify(intent))return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        return existing;
      }
      const acknowledged=await txn.get<Acknowledged>(`ack:${intent.driverId}`);
      if(acknowledged?.fence===intent.fence && intent.sequence<=acknowledged.sequence)return {outcome:{ok:false,reason:'revision'} as DriverOutcome};
      if(await txn.get<boolean>(`frozen:${intent.driverId}:${intent.fence}`)||await txn.get<boolean>(closedFenceKey(intent.driverId,intent.fence))){
        return {outcome:{ok:false,reason:'superseded'} as DriverOutcome};
      }
      // Every kind of submission waits behind earlier assigned physical work,
      // not just another physical event. Unassigned cab observations have not
      // yet acquired a wallet position.
      const physicalTickets=await txn.list<TicketStage>({prefix:`ticket-stage:${intent.driverId}:`});
      const physicalDeliveries=await txn.list<DeliveryStage>({prefix:`delivery-stage:${intent.driverId}:`});
      const physicalAchievements=await txn.list<AchievementStage>({prefix:`achievement-stage:${intent.driverId}:`});
      const physicalSupplies=await txn.list<PickupStage>({prefix:`supply-stage:${intent.driverId}:`});
      const physicalCabs=await txn.list<CabIncomeStage>({prefix:`cab-stage:${intent.driverId}:`});
      const ownTicket=physicalTickets.get(ticketKey(intent)),ownDelivery=physicalDeliveries.get(deliveryKey(intent)),ownAchievement=physicalAchievements.get(achievementKey(intent)),ownSupply=physicalSupplies.get(supplyKey(intent));
      const ownCab=physicalCabs.get(`cab-stage:${intent.driverId}:${intent.eventId}`);
      const order=ownTicket?.walletOrder??ownDelivery?.walletOrder??ownAchievement?.walletOrder??ownSupply?.walletOrder??(ownCab?await txn.get<number>(cabOrderKey(ownCab)):undefined)??intent.sequence;
      const orderOwner=await txn.get<string>(walletOrderKey(intent,order));
      if(orderOwner&&orderOwner!==intent.eventId)return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
      if([...physicalTickets.values(),...physicalDeliveries.values(),...physicalAchievements.values(),...physicalSupplies.values()].some(stage=>stage.eventId!==intent.eventId&&stage.fence===intent.fence&&stage.walletOrder<order))
        return {outcome:null,blocked:true as const};
      for(const stage of physicalCabs.values())if(stage.eventId!==intent.eventId&&stage.fence===intent.fence){
        const assigned=await txn.get<number>(cabOrderKey(stage));
        if(assigned!==undefined&&assigned<order)return {outcome:null,blocked:true as const};
      }
      let cabEvents:EarningsEvents|undefined,stageSequence:number|undefined;
      if(intent.action.kind==='cab-income'){
        const stage=await txn.get<CabIncomeStage>(stageKey({eventId:intent.eventId,driverId:intent.driverId,fence:intent.fence,roomId:intent.roomId,sequence:intent.sequence,intervals:intent.action.intervals}));
        if(!stage||!matchesStage(stage,intent))return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        const stages=await txn.list<CabIncomeStage>({prefix:`cab-stage:${intent.driverId}:`});
        if([...stages.values()].some(item=>item.fence===stage.fence&&item.sequence<stage.sequence))return {outcome:null,blocked:true as const};
        const order=await txn.get<number>(cabOrderKey(stage))??intent.sequence;
        const tickets=await txn.list<TicketStage>({prefix:`ticket-stage:${intent.driverId}:`});
        if([...tickets.values()].some(ticket=>ticket.fence===stage.fence&&ticket.walletOrder<order))return {outcome:null,blocked:true as const};
        stageSequence=stage.sequence;
        cabEvents=await txn.get<EarningsEvents>(stageEventsKey(stage));
        await txn.delete(stageKey(stage));
        await txn.delete(stageEventsKey(stage));
        await txn.delete(cabOrderKey(stage));
      } else if(intent.action.kind==='ticket'){
        const ticket=await txn.get<TicketStage>(ticketKey(intent));
        if(!ticket||ticket.fence!==intent.fence||ticket.roomId!==intent.roomId||ticket.clock!==intent.clock||JSON.stringify(ticket.action)!==JSON.stringify(intent.action))return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        const tickets=await txn.list<TicketStage>({prefix:`ticket-stage:${intent.driverId}:`});
        if([...tickets.values()].some(other=>other.fence===ticket.fence&&other.walletOrder<ticket.walletOrder))return {outcome:null,blocked:true as const};
        const stages=await txn.list<CabIncomeStage>({prefix:`cab-stage:${intent.driverId}:`});
        for(const stage of stages.values())if(stage.fence===ticket.fence){
          const order=await txn.get<number>(cabOrderKey(stage));
          if(order!==undefined&&order<ticket.walletOrder)return {outcome:null,blocked:true as const};
        }
        await txn.delete(ticketKey(ticket));
      } else if(intent.action.kind==='delivery'||intent.action.kind==='achievement'){
        const stageKey=intent.action.kind==='delivery'?deliveryKey(intent):achievementKey(intent);
        const stage=await txn.get<DeliveryStage|AchievementStage>(stageKey);
        if(!stage||stage.fence!==intent.fence||stage.roomId!==intent.roomId||stage.clock!==intent.clock||JSON.stringify(stage.action)!==JSON.stringify(intent.action))
          return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        await txn.delete(stageKey);
      } else if(intent.action.kind==='supply'){
        const stage=await txn.get<PickupStage>(supplyKey(intent));
        if(!stage||stage.fence!==intent.fence||stage.roomId!==intent.roomId||stage.clock!==intent.clock||
          JSON.stringify(stage.action)!==JSON.stringify(intent.action)||JSON.stringify(stage.pickup)!==JSON.stringify(intent.pickup))
          return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        const pickup=await txn.get<PickupReservation>(`pickup:${stage.pickup.id}`);
        if(!pickup||pickup.eventId!==intent.eventId||pickup.generation!==stage.pickup.generation)return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        await txn.delete(supplyKey(stage));
      }
      const highKey=submittedHighKey(intent.driverId,intent.fence),high=await txn.get<number>(highKey)??0;
      if(intent.sequence>high)await txn.put(highKey,intent.sequence);
      if(intent.action.kind==='contribute'){
        const fund=await txn.get<RoomFund>('room-fund'),amount=intent.action.amount;
        if(!fund)throw new Error('Room fund not initialized');
        if(!Number.isSafeInteger(amount)||amount<=0||amount>MARS_GOAL||amount>MARS_GOAL-fund.balance-fund.reserved){
          const denied:IntentRecord={intent,outcome:{ok:false,reason:'reserved',available:Math.max(0,MARS_GOAL-fund.balance-fund.reserved)}};
          await txn.put(key,denied);
          await txn.put(`unacked:${intent.driverId}:${intent.eventId}`,intent);
          const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
          if(alarm===null||alarm>next)await txn.setAlarm(next);
          return denied;
        }
        await txn.put('room-fund',{...fund,reserved:fund.reserved+amount} satisfies RoomFund);
      }
      if(intent.pickup){
        const pickupKey=`pickup:${intent.pickup.id}`;
        const pickup=await txn.get<PickupReservation>(pickupKey)??{eventId:null,generation:0,readyAt:0};
        if(intent.action.kind==='supply'){
          if(pickup.eventId!==intent.eventId||pickup.generation!==intent.pickup.generation)throw new Error('Missing staged pickup reservation');
        }else if(pickup.eventId!==null||pickup.readyAt>Date.now()||pickup.generation!==intent.pickup.generation){
          const denied:IntentRecord={intent,outcome:{ok:false,reason:'reserved'}};
          await txn.put(key,denied);
          await txn.put(`unacked:${intent.driverId}:${intent.eventId}`,intent);
          const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
          if(alarm===null||alarm>next)await txn.setAlarm(next);
          return denied;
        }
        if(intent.action.kind!=='supply')await txn.put(pickupKey,{...pickup,eventId:intent.eventId} satisfies PickupReservation);
      }
      const pending:IntentRecord={intent,outcome:null,walletOrder:order,...(cabEvents?{cabEvents}:{}),...(stageSequence!==undefined?{stageSequence}:{})};
      await txn.put(key,pending);
      await txn.put(`pending:${intent.driverId}:${intent.eventId}`,intent);
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return pending;
    });
    if('blocked' in result)return null;
    if(result.outcome)return result.outcome;
    try{await this.resolveDriver(intent.driverId);return await this.status(intent.eventId);}catch{return null;}
  }

  private resolveDriver(driverId:string):Promise<void>{
    const existing=this.flights.get(driverId);if(existing)return existing;
    const flight=this.resolveDriverOnce(driverId);this.flights.set(driverId,flight);
    void flight.finally(()=>{if(this.flights.get(driverId)===flight)this.flights.delete(driverId);}).catch(()=>{});
    return flight;
  }
  private async resolveDriverOnce(driverId:string):Promise<void>{
    const pending=(await this.pending(driverId)).sort((a,b)=>a.sequence-b.sequence);
    for(const intent of pending){
      const record=await this.ctx.storage.get<IntentRecord>(`intent:${intent.eventId}`);
      if(!record)throw new Error('Missing pending intent');
      const order=record.walletOrder??intent.sequence;
      const [tickets,deliveries,achievements,supplies,cabs]=await Promise.all([this.tickets(driverId),this.deliveries(driverId),this.achievements(driverId),this.supplies(driverId),this.stages(driverId)]);
      if([...tickets,...deliveries,...achievements,...supplies].some(stage=>stage.fence===intent.fence&&stage.eventId!==intent.eventId&&stage.walletOrder<order))break;
      let blocked=false;
      for(const stage of cabs)if(stage.fence===intent.fence&&stage.eventId!==intent.eventId){
        const assigned=await this.ctx.storage.get<number>(cabOrderKey(stage));
        if(assigned!==undefined&&assigned<order){blocked=true;break;}
      }
      if(blocked)break;
      const result=await this.resolveOnce(intent);
      if(!result.ok && result.reason==='not-ready')break;
    }
  }
  private async resolveOnce(intent:EconomyIntent):Promise<DriverOutcome>{
    const key=`intent:${intent.eventId}`;
    let record=await this.ctx.storage.get<IntentRecord>(key);
    if(!record||JSON.stringify(record.intent)!==JSON.stringify(intent))throw new Error('Missing economy intent');
    if(record.outcome)return record.outcome;
    if(intent.action.kind==='cab-income'&&!record.cabEvents){
      const events=await this.cabHistory(intent.roomId,intent.action.intervals);
      record=await this.ctx.storage.transaction(async txn=>{
        const current=await txn.get<IntentRecord>(key);
        if(!current||JSON.stringify(current.intent)!==JSON.stringify(intent))throw new Error('Missing economy intent');
        if(current.cabEvents)return current;
        const updated={...current,cabEvents:events} satisfies IntentRecord;
        await txn.put(key,updated);
        return updated;
      });
    }
    if(intent.action.kind==='delivery'&&intent.action.multiplier===null&&!record.cabEvents){
      // Query a half-open millisecond containing the physical observation.
      // Both history services reject pending wins and incomplete pages.
      const at=intent.action.atMs;
      const events=await this.cabHistory(intent.roomId,[{assetId:'delivery',startMs:at,endMs:at+1}]);
      record=await this.ctx.storage.transaction(async txn=>{
        const current=await txn.get<IntentRecord>(key);
        if(!current||JSON.stringify(current.intent)!==JSON.stringify(intent))throw new Error('Missing economy intent');
        if(current.cabEvents)return current;
        const updated={...current,cabEvents:events} satisfies IntentRecord;
        await txn.put(key,updated);return updated;
      });
    }
    const outcome=await this.profile(intent.driverId).commit(intent,record.cabEvents);
    if(!outcome.ok && outcome.reason==='not-ready')return outcome;
    return this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<IntentRecord>(key);
      if(!record)throw new Error('Missing economy intent');
      if(record.outcome)return record.outcome;
      let result=outcome;
      if(intent.action.kind==='contribute'){
        const fund=await txn.get<RoomFund>('room-fund'),amount=intent.action.amount;
        if(!fund||fund.reserved<amount)throw new Error('Missing room fund reservation');
        const balance=fund.balance+(outcome.ok?amount:0);
        await txn.put('room-fund',{balance,reserved:fund.reserved-amount} satisfies RoomFund);
        if(outcome.ok)result={...outcome,roomFund:balance};
      }
      await txn.put(key,{...record,outcome:result} satisfies IntentRecord);
      await txn.delete(`pending:${intent.driverId}:${intent.eventId}`);
      await txn.put(`unacked:${intent.driverId}:${intent.eventId}`,intent);
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      if(intent.pickup){
        const pickupKey=`pickup:${intent.pickup.id}`;
        const pickup=await txn.get<PickupReservation>(pickupKey);
        if(!pickup||pickup.eventId!==intent.eventId)throw new Error('Missing pickup reservation');
        await txn.put(pickupKey,{eventId:null,generation:outcome.ok?pickup.generation+1:pickup.generation,readyAt:outcome.ok?Date.now()+PICKUP_COOLDOWN_MS:0} satisfies PickupReservation);
      }
      return result;
    });
  }
  /** The producer calls this only after it consumes the recorded outcome. */
  async acknowledge(intent:EconomyIntent):Promise<boolean>{
    const cleanupKey=`cleanup:${intent.driverId}:${intent.eventId}`;
    const accepted=await this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<IntentRecord>(`intent:${intent.eventId}`);
      // A mismatched event ID must never delete another producer's result.
      if(!record || JSON.stringify(record.intent)!==JSON.stringify(intent))return 'done' as const;
      if(!record.outcome)return 'pending' as const;
      if((intent.action.kind==='cab-income'||intent.action.kind==='ticket'||intent.action.kind==='delivery'||intent.action.kind==='achievement'||intent.action.kind==='supply')&&!record.outcome.ok)return 'blocked' as const;
      await txn.put(cleanupKey,intent);
      const ackKey=`ack:${intent.driverId}`,previous=await txn.get<Acknowledged>(ackKey);
      if(previous?.fence!==intent.fence || intent.sequence>previous.sequence)
        await txn.put(ackKey,{fence:intent.fence,sequence:intent.sequence} satisfies Acknowledged);
      await txn.delete(`unacked:${intent.driverId}:${intent.eventId}`);
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return 'cleanup' as const;
    });
    if(accepted==='done')return true;
    if(accepted==='pending'||accepted==='blocked')return false;
    try{await this.finishCleanup(intent);return true;}catch{return false;}
  }
  private async finishCleanup(intent:EconomyIntent):Promise<void>{
    const cleanupKey=`cleanup:${intent.driverId}:${intent.eventId}`;
    const cleanup=await this.ctx.storage.get<EconomyIntent>(cleanupKey);
    if(!cleanup)return;
    if(JSON.stringify(cleanup)!==JSON.stringify(intent))throw new Error('Economy cleanup mismatch');
    await this.profile(intent.driverId).compact(intent);
    await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<EconomyIntent>(cleanupKey);
      if(!current)return;
      if(JSON.stringify(current)!==JSON.stringify(intent))throw new Error('Economy cleanup mismatch');
      const key=`intent:${intent.eventId}`,record=await txn.get<IntentRecord>(key);
      if(record && JSON.stringify(record.intent)!==JSON.stringify(intent))throw new Error('Economy intent mismatch');
      await txn.delete(key);await txn.delete(cleanupKey);
    });
  }
  /** Stop this fence accepting new intents, then reconcile every recorded intent. */
  async freeze(driverId:string,fence:string):Promise<void>{
    const key=`${driverId}:${fence}`,existing=this.freezes.get(key);if(existing)return existing;
    const flight=this.freezeOnce(driverId,fence);this.freezes.set(key,flight);
    try{await flight;}finally{if(this.freezes.get(key)===flight)this.freezes.delete(key);}
  }
  private async freezeOnce(driverId:string,fence:string):Promise<void>{
    const started=await this.ctx.storage.transaction(async txn=>{
      if(await txn.get<boolean>(closedFenceKey(driverId,fence)))return false;
      await txn.put(`frozen:${driverId}:${fence}`,true);
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return true;
    });
    if(!started)return;
    // Merge pending writes and assigned physical stages in wallet order. A
    // later speculative snapshot must never jump ahead of an accepted stop.
    for(;;){
      await this.resolveDriver(driverId);
      const remainingStages=(await this.stages(driverId)).filter(stage=>stage.fence===fence);
      const ticketStages=(await this.tickets(driverId)).filter(stage=>stage.fence===fence);
      const deliveryStages=(await this.deliveries(driverId)).filter(stage=>stage.fence===fence);
      const achievementStages=(await this.achievements(driverId)).filter(stage=>stage.fence===fence);
      const supplyStages=(await this.supplies(driverId)).filter(stage=>stage.fence===fence);
      const work=[...await Promise.all(remainingStages.map(async stage=>({kind:'cab' as const,stage,order:await this.ctx.storage.get<number>(cabOrderKey(stage))}))),
        ...ticketStages.map(stage=>({kind:'ticket' as const,stage,order:stage.walletOrder})),
        ...deliveryStages.map(stage=>({kind:'delivery' as const,stage,order:stage.walletOrder})),
        ...achievementStages.map(stage=>({kind:'achievement' as const,stage,order:stage.walletOrder})),
        ...supplyStages.map(stage=>({kind:'supply' as const,stage,order:stage.walletOrder}))]
        .sort((a,b)=>(a.order??Number.MAX_SAFE_INTEGER)-(b.order??Number.MAX_SAFE_INTEGER)||
          (a.kind==='cab'&&b.kind==='cab'?a.stage.sequence-b.stage.sequence:0));
      const pending=(await this.pending(driverId)).filter(intent=>intent.fence===fence);
      const orderedPending=await Promise.all(pending.map(async intent=>({intent,record:await this.ctx.storage.get<IntentRecord>(`intent:${intent.eventId}`)})));
      orderedPending.sort((a,b)=>(a.record?.walletOrder??a.intent.sequence)-(b.record?.walletOrder??b.intent.sequence));
      const first=orderedPending[0],stageOrder=work[0]?.order??Number.MAX_SAFE_INTEGER;
      if(first&&(!work.length||(first.record?.walletOrder??first.intent.sequence)<stageOrder)){
        const cursor=await this.profile(driverId).currentCursor(fence);
        if(!cursor||first.intent.revision<=cursor.revision)throw new Error('Unable to reconcile fenced wallet event');
        const intent=first.intent;
        if(intent.action.kind==='cab-income'||intent.action.kind==='ticket'||intent.action.kind==='delivery'||intent.action.kind==='achievement'||intent.action.kind==='supply'){
          // A missing speculative predecessor cannot invalidate physical work.
          // No profile receipt exists for a not-ready intent, so rebase it.
          const rebased={...intent,revision:cursor.revision,sequence:cursor.sequence+1};
          await this.ctx.storage.transaction(async txn=>{
            const key=`intent:${intent.eventId}`,record=await txn.get<IntentRecord>(key);
            if(!record||record.outcome||JSON.stringify(record.intent)!==JSON.stringify(intent))throw new Error('Physical intent changed');
            await txn.put(key,{...record,intent:rebased});await txn.put(`pending:${driverId}:${intent.eventId}`,rebased);
          });
        }else await this.ctx.storage.transaction(async txn=>{
          const key=`intent:${intent.eventId}`,record=await txn.get<IntentRecord>(key);
          if(!record||record.outcome)return;
          await txn.put(key,{...record,outcome:{ok:false,reason:'revision'}} satisfies IntentRecord);
          await txn.delete(`pending:${driverId}:${intent.eventId}`);
          await txn.put(`unacked:${driverId}:${intent.eventId}`,intent);
          if(intent.pickup){const pickupKey=`pickup:${intent.pickup.id}`,pickup=await txn.get<PickupReservation>(pickupKey);if(pickup?.eventId===intent.eventId)await txn.put(pickupKey,{...pickup,eventId:null});}
          if(intent.action.kind==='contribute'){
            const fund=await txn.get<RoomFund>('room-fund');
            if(!fund||fund.reserved<intent.action.amount)throw new Error('Missing room fund reservation');
            await txn.put('room-fund',{...fund,reserved:fund.reserved-intent.action.amount} satisfies RoomFund);
          }
        });
        continue;
      }
      const entry=work[0];
      if(!entry){if(first)throw new Error('Unable to reconcile fenced wallet event');break;}
      const stage=entry.stage,cursor=await this.profile(driverId).currentCursor(fence);
      if(!cursor)throw new Error('Unable to settle fenced physical work');
      const intent:EconomyIntent={eventId:stage.eventId,driverId,fence,roomId:stage.roomId,sequence:cursor.sequence+1,revision:cursor.revision,
        ...('clock' in stage&&stage.clock!==undefined?{clock:stage.clock}:{}),
        ...(entry.kind==='supply'?{pickup:entry.stage.pickup}:{}),
        action:entry.kind==='cab'?{kind:'cab-income',intervals:entry.stage.intervals}:entry.stage.action};
      const converted=await this.ctx.storage.transaction(async txn=>{
        const key=entry.kind==='cab'?stageKey(entry.stage):entry.kind==='ticket'?ticketKey(entry.stage):entry.kind==='delivery'?deliveryKey(entry.stage):entry.kind==='achievement'?achievementKey(entry.stage):supplyKey(entry.stage);
        const current=await txn.get<CabIncomeStage|TicketStage|DeliveryStage|AchievementStage|PickupStage>(key);
        if(!current)return false;
        if(JSON.stringify(current)!==JSON.stringify(stage)||await txn.get(`intent:${stage.eventId}`))throw new Error('Physical stage mismatch');
        if(entry.kind==='supply'){
          const pickup=await txn.get<PickupReservation>(`pickup:${entry.stage.pickup.id}`);
          if(!pickup||pickup.eventId!==stage.eventId||pickup.generation!==entry.stage.pickup.generation)throw new Error('Missing staged pickup reservation');
        }
        const cabEvents=entry.kind==='cab'?await txn.get<EarningsEvents>(stageEventsKey(entry.stage)):undefined;
        await txn.put(`intent:${stage.eventId}`,{intent,outcome:null,walletOrder:entry.order??Number.MAX_SAFE_INTEGER,...(entry.kind==='cab'?{stageSequence:entry.stage.sequence}:{}),...(cabEvents?{cabEvents}:{})} satisfies IntentRecord);
        await txn.put(`pending:${driverId}:${stage.eventId}`,intent);await txn.delete(key);
        if(entry.kind==='cab'){await txn.delete(stageEventsKey(entry.stage));await txn.delete(cabOrderKey(entry.stage));}
        const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
        if(alarm===null||alarm>next)await txn.setAlarm(next);
        return true;
      });
      if(!converted)continue;
      await this.resolveDriver(driverId);
      const outcome=await this.status(stage.eventId);
      if(!outcome?.ok)throw new Error('Unable to settle staged physical work');
      if(!await this.acknowledge(intent))throw new Error('Physical work cleanup pending');
    }
    // No old producer remains. Consume abandoned outcomes while the room is
    // frozen so the profile records even room-only rejected sequences.
    const abandoned=[...(await this.ctx.storage.list<EconomyIntent>({prefix:`unacked:${driverId}:`})).values()].filter(intent=>intent.fence===fence);
    for(const intent of abandoned){
      const record=await this.ctx.storage.get<IntentRecord>(`intent:${intent.eventId}`);
      if((intent.action.kind==='cab-income'||intent.action.kind==='ticket'||intent.action.kind==='delivery'||intent.action.kind==='achievement'||intent.action.kind==='supply')&&(!record?.outcome||!record.outcome.ok))throw new Error('Unable to settle staged physical work');
      if(!await this.acknowledge(intent))throw new Error('Wallet cleanup pending');
    }
    const cleanup=[...(await this.ctx.storage.list<EconomyIntent>({prefix:`cleanup:${driverId}:`})).values()].filter(intent=>intent.fence===fence);
    for(const intent of cleanup)await this.finishCleanup(intent);
    // The durable seal prevents stale requests after the room marker is gone.
    await this.profile(driverId).sealFence(driverId,fence);
    // Keep a durable closed marker: a stale producer may have passed the
    // profile check before this freeze and resume after the profile is sealed.
    // Replacing the in-progress marker atomically leaves no insertion gap.
    await this.ctx.storage.transaction(async txn=>{
      const orders=await txn.list({prefix:`wallet-stage:${driverId}:${fence}:`});
      await txn.put(closedFenceKey(driverId,fence),true);
      await txn.delete([`frozen:${driverId}:${fence}`,stageHighKey({driverId,fence}),submittedHighKey(driverId,fence),...orders.keys()]);
    });
  }
  async pickupStates(ids:string[]):Promise<Record<string,PickupReservation>>{
    const entries=await Promise.all(ids.map(async id=>[id,await this.ctx.storage.get<PickupReservation>(`pickup:${id}`)??{eventId:null,generation:0,readyAt:0}] as const));
    return Object.fromEntries(entries);
  }
  async status(eventId:string):Promise<DriverOutcome|null>{return (await this.ctx.storage.get<IntentRecord>(`intent:${eventId}`))?.outcome??null;}
  async pending(driverId?:string):Promise<EconomyIntent[]>{
    const prefix=driverId?`pending:${driverId}:`:'pending:';
    return [...(await this.ctx.storage.list<EconomyIntent>({prefix})).values()];
  }
  private startRecovery(driverId:string):Promise<void>|null{
    // Do not attach another waiter to a stalled flight on every alarm.
    if(this.recoveries.has(driverId))return null;
    const flight=this.recoverDriver(driverId);this.recoveries.set(driverId,flight);
    // Retain the detached work beyond this alarm's bounded wait. DO waitUntil
    // does not hold the alarm open; a reset discards the map, not the journal.
    this.ctx.waitUntil(flight.finally(()=>{if(this.recoveries.get(driverId)===flight)this.recoveries.delete(driverId);}).catch(()=>{}));
    return flight;
  }
  private async recoverDriver(driverId:string):Promise<void>{
    await this.resolveDriver(driverId);
    const cleanup=[...(await this.ctx.storage.list<EconomyIntent>({prefix:`cleanup:${driverId}:`})).values()]
      .sort((a,b)=>a.sequence-b.sequence);
    for(const intent of cleanup)await this.finishCleanup(intent);
    const unacked=[...(await this.ctx.storage.list<EconomyIntent>({prefix:`unacked:${driverId}:`})).values()];
    const stages=await this.stages(driverId),tickets=await this.tickets(driverId),deliveries=await this.deliveries(driverId),achievements=await this.achievements(driverId),supplies=await this.supplies(driverId);
    const producers=new Map<string,{roomId:string;fence:string}>();
    for(const item of [...unacked,...stages,...tickets,...deliveries,...achievements,...supplies])producers.set(JSON.stringify([item.roomId,item.fence]),item);
    for(const {roomId,fence} of producers.values()){
      // An unavailable room is not evidence that its producer has gone away.
      const room=this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId));
      if(!await room.hasWallet(driverId,fence))await this.freeze(driverId,fence);
    }
    // A crash between sealing a fence and removing its marker must not leak it.
    const prefix=`frozen:${driverId}:`,frozen=await this.ctx.storage.list<boolean>({prefix});
    for(const key of frozen.keys())await this.freeze(driverId,key.slice(prefix.length));
  }
  async alarm():Promise<void>{
    // Alarms are consumed before the handler runs. Arm before reading work or
    // awaiting any RPC, so termination during recovery cannot strand a journal.
    const watchdog=Date.now()+RETRY_MS;
    const armed=await this.ctx.storage.transaction(async txn=>{
      const alarm=await txn.getAlarm();
      if(alarm!==null&&alarm<=watchdog)return false;
      await txn.setAlarm(watchdog);return true;
    });
    const [intents,cleanup,unacked,stages,tickets,deliveries,achievements,supplies,frozen]=await Promise.all([
      this.pending(),this.ctx.storage.list<EconomyIntent>({prefix:'cleanup:'}),
      this.ctx.storage.list<EconomyIntent>({prefix:'unacked:'}),this.ctx.storage.list<CabIncomeStage>({prefix:'cab-stage:'}),
      this.ctx.storage.list<TicketStage>({prefix:'ticket-stage:'}),
      this.ctx.storage.list<DeliveryStage>({prefix:'delivery-stage:'}),
      this.ctx.storage.list<AchievementStage>({prefix:'achievement-stage:'}),
      this.ctx.storage.list<PickupStage>({prefix:'supply-stage:'}),
      this.ctx.storage.list<boolean>({prefix:'frozen:'}),
    ]);
    const drivers=new Set(intents.map(intent=>intent.driverId));
    for(const item of [...cleanup.values(),...unacked.values(),...stages.values(),...tickets.values(),...deliveries.values(),...achievements.values(),...supplies.values()])drivers.add(item.driverId);
    for(const key of frozen.keys())drivers.add(key.split(':')[1]);
    if(!drivers.size){
      // Cancel only our own empty wakeup and recheck atomically with submissions.
      if(armed)await this.ctx.storage.transaction(async txn=>{
        if(await txn.getAlarm()!==watchdog)return;
        const work=await Promise.all(['pending:','cleanup:','unacked:','frozen:','cab-stage:','ticket-stage:','delivery-stage:','achievement-stage:','supply-stage:'].map(prefix=>txn.list({prefix,limit:1})));
        if(!work.some(entries=>entries.size))await txn.deleteAlarm();
      });
      return;
    }
    const flights=[...drivers].map(driver=>this.startRecovery(driver)).filter((flight):flight is Promise<void>=>flight!==null);
    if(!flights.length)return;
    // One alarm handler runs at a time. Return even if an RPC never finishes;
    // the armed watchdog will scan for work that arrived after this scan.
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      await Promise.race([Promise.allSettled(flights),new Promise<void>(resolve=>{timer=setTimeout(resolve,ALARM_WAIT_MS);})]);
    }finally{if(timer!==undefined)clearTimeout(timer);}
  }
}
