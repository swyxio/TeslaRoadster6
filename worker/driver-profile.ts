import { DurableObject } from 'cloudflare:workers';
import { applyAchievementAwards, initialAchievements, type AchievementId } from '../shared/achievements';
import { isAchievementEvidence, type AchievementEvidence } from '../shared/achievement-evidence';
import { normalizeAchievementTiers, type AchievementTierProgress } from '../shared/achievement-tiers';
import { applyAcceptedDelivery, applyObservedAchievement, applyTierProgress } from './achievement-progress';
import { applyDeliveryStop, CUSTOMERS, initialDelivery, levelForCash, orderTarget, rerouteInaccessibleOrder, type DeliveryState, type DeliveryStop, type Level, type Order } from '../shared/delivery';
import { applyTicketEvidence, type TicketEvidence } from '../shared/police';
import { luxuryPurchaseAwards, luxuryVehicle, type LuxuryVehicleId } from '../shared/luxury';
import { emptyCybercabFleet, paintCybercab, purchaseCybercab, settleCybercabIntervals, type CybercabFleet, type CybercabInterval } from '../shared/cybercabs';
import type { VehicleUpgrades } from '../shared/upgrades';
import type { PaintId, VehicleStyle } from '../shared/vehicle-style';
import type { TankLevel } from '../shared/air-tank';
import type { SavedOtaSubscription } from '../shared/ota';
import type { GameRoom } from './index';
import type { RoomEconomy } from './room-economy';
import { StarshipLedger } from './starship';
import { normalizeName } from './global-chat-core';
import type { StarshipContributorGroup } from '../shared/starship';
import { earningsMultiplier, type EarningsEvents, type SettledDeliveryEarning } from '../shared/earnings-events';
import { MARKET_LOCK_KEY, MarketWallet, type MarketWalletIntent, type MarketWalletPrepared } from './market-wallet';

export type SavedVehicle = { upgrades:VehicleUpgrades; tankLevel:TankLevel; style:VehicleStyle };
export type SavedVehicles = Record<string,SavedVehicle>;
/** Position, fuel and damage belong to the room; only this state follows a saved driver. */
export type DriverProgress = {
  cash:number; earned:number; completed:number; level:Level; order:Order; tickets:number;
  unlocked:AchievementId[]; vehicles:SavedVehicles; ownedLuxury:LuxuryVehicleId[];
  ota:SavedOtaSubscription;
  /** Cumulative verified game-created income; player transfers never increase this. */
  eligibleIncome:number;
  /** Cumulative active order time, independent of the current order. */
  deliveryClock?:number;
  /** Omitted only by profiles written before fleets existed. */
  cybercabs?:CybercabFleet;
  /** Missing only on profiles saved before repeatable tiers were introduced. */
  achievementTiers?:AchievementTierProgress;
};
export type DriverAction = {kind:'progress';progress:DriverProgress;earnings?:SettledDeliveryEarning[]} | {kind:'luxury';vehicle:LuxuryVehicleId;order?:Order} | {kind:'contribute';amount:number;order?:Order}
  | {kind:'cab-buy';assetId:string;order?:Order} | {kind:'cab-income';intervals:CybercabInterval[]}
  | {kind:'cab-paint';assetId:string;paint:PaintId;order?:Order} | {kind:'ticket';evidence:TicketEvidence;orderBefore:Order;completedBefore:number}
  | {kind:'delivery';stop:DeliveryStop;atMs:number;multiplier:1|1.5|2|3|null}
  | {kind:'achievement';evidence:AchievementEvidence} | {kind:'supply';type:'repair'|'air'};
export type EconomyIntent = {eventId:string;driverId:string;fence:string;roomId:string;revision:number;sequence:number;clock?:number;action:DriverAction;pickup?:{id:string;generation:number}};
export type DriverOutcome =
  | {ok:true;revision:number;progress:DriverProgress;awards:AchievementId[];roomFund?:number;delivery?:{matched:boolean;earnings:SettledDeliveryEarning[];lastReward:DeliveryState['lastReward'];lastPayout:number|null};achievement?:{lastReward:DeliveryState['lastReward']}}
  | {ok:false;reason:'superseded'|'revision'|'conflict'|'invalid'|'unaffordable'|'owned'|'reserved'|'not-ready';available?:number};
type DriverRecord = {driverId:string;fence:string;roomId:string;revision:number;sequence:number;sealed:boolean;progress:DriverProgress;incomeActivated:boolean;marketPaint?:import('../shared/market-protocol').MarketPaint|null};
type Receipt = {payload:string;outcome:DriverOutcome;cabEvents?:EarningsEvents};
type PrivacyPending = {revision:number;name:string|null};
type OutboxRetry = {attempts:number;next:number};

const OUTBOX_RPC_TIMEOUT_MS=3_000;
function nextOutboxRetry(previous:OutboxRetry|undefined,now:number):OutboxRetry {
  const attempts=Math.min((previous?.attempts??0)+1,8);
  const delay=Math.min(60_000,Math.round(5_000*2**(attempts-1)*(0.8+Math.random()*0.4)));
  return {attempts,next:now+delay};
}
async function boundedOutbox<T>(operation:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Outbox RPC timed out')),OUTBOX_RPC_TIMEOUT_MS);})]);}
  finally{
    if(timer!==undefined)clearTimeout(timer);
    // Release the RPC stub; a timed-out remote operation may still finish.
    const dispose=Reflect.get(operation,Reflect.get(Symbol,'dispose') as symbol);
    if(typeof dispose==='function')Reflect.apply(dispose,operation,[]);
  }
}

type Env = { INCOME:DurableObjectNamespace<GlobalIncome>; ROOMS:DurableObjectNamespace<GameRoom>; ECONOMIES:DurableObjectNamespace<RoomEconomy> };
const validAmount=(amount:number)=>Number.isSafeInteger(amount) && Math.abs(amount)<=Number.MAX_SAFE_INTEGER;
function validProgress(progress:DriverProgress,previous:DriverProgress):boolean {
  return validAmount(progress.cash) && validAmount(progress.earned) && progress.earned>=previous.earned &&
    validAmount(progress.completed) && progress.completed>=previous.completed &&
    validAmount(progress.tickets) && progress.tickets>=previous.tickets &&
    validAmount(progress.eligibleIncome) && progress.eligibleIncome>=previous.eligibleIncome &&
    previous.unlocked.every(id=>progress.unlocked.includes(id)) &&
    previous.ownedLuxury.length===progress.ownedLuxury.length &&
    previous.ownedLuxury.every(id=>progress.ownedLuxury.includes(id)) &&
    progress.ownedLuxury.every(id=>!!luxuryVehicle(id));
}

function validDeliveryEarnings(parts:SettledDeliveryEarning[],previous:DriverProgress,next:DriverProgress):boolean {
  if(!Array.isArray(parts)||parts.length>2)return false;
  const seen=new Set<string>();let earned=0,total=0;
  for(const part of parts){
    if(!part||typeof part.sourceId!=='string'||seen.has(part.sourceId)||
       !['pickup','delivery','checkpoint'].includes(part.kind)||!Number.isSafeInteger(part.base)||part.base<0||
       !Number.isSafeInteger(part.amount)||part.amount<0||!Number.isSafeInteger(part.atMs)||part.atMs<0||
       ![1,1.5,2,3].includes(part.multiplier))return false;
    const suffix=part.kind==='delivery'?'dropoff':part.kind;
    if(part.sourceId!==`delivery:${previous.completed+1}:${suffix}`)return false;
    if((part.kind==='pickup')!==(previous.order.stage==='pickup'))return false;
    if(part.kind==='checkpoint'&&part.multiplier!==1)return false;
    const expected=(BigInt(part.base)*BigInt(part.multiplier*2)+1n)/2n;
    if(expected!==BigInt(part.amount))return false;
    seen.add(part.sourceId);total+=part.amount;if(part.kind!=='checkpoint')earned+=part.amount;
  }
  return Number.isSafeInteger(total)&&Number.isSafeInteger(earned)&&next.earned-previous.earned===earned&&next.eligibleIncome-previous.eligibleIncome>=total;
}

/** One authority per saved identity. Only trusted worker RPCs can reach it. */
export class DriverProfile extends DurableObject<Env> {
  private marketParticipant:MarketWallet|null=null;
  private marketWallet():MarketWallet {
    if(this.marketParticipant)return this.marketParticipant;
    type Room = {
      pauseMarketWallet(driverId:string,fence:string,transactionId:string):Promise<boolean>;
      installMarketWallet(driverId:string,oldFence:string,newFence:string,transactionId:string,revision:number,sequence:number,progress:DriverProgress,marketPaint:import('../shared/market-protocol').MarketPaint|null):Promise<void>;
      resumeMarketWallet(driverId:string,fence:string,transactionId:string):Promise<void>;
    };
    const room=(id:string)=>this.env.ROOMS.get(this.env.ROOMS.idFromName(id)) as unknown as Room;
    return this.marketParticipant=new MarketWallet(this.ctx.storage,{
      pause:(driverId,fence,transactionId,id)=>room(id).pauseMarketWallet(driverId,fence,transactionId),
      drain:(driverId,fence,id)=>this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(id)).freeze(driverId,fence),
      install:(driverId,oldFence,newFence,transactionId,id,revision,sequence,progress,marketPaint)=>room(id).installMarketWallet(driverId,oldFence,newFence,transactionId,revision,sequence,progress,marketPaint),
      resume:(driverId,fence,transactionId,id)=>room(id).resumeMarketWallet(driverId,fence,transactionId),
    });
  }

  /** Trusted worker-to-worker calls only; no public fetch route exposes these. */
  marketPrepare(intent:MarketWalletIntent):Promise<MarketWalletPrepared>{return this.marketWallet().prepare(intent);}
  marketApply(transactionId:string):Promise<boolean>{return this.marketWallet().apply(transactionId);}
  marketRelease(transactionId:string,decision:'commit'|'abort'):Promise<boolean>{return this.marketWallet().release(transactionId,decision);}

  async acquire(driverId:string,fence:string,initial:DriverProgress,roomId:string):Promise<{revision:number;sequence:number;progress:DriverProgress;marketPaint:import('../shared/market-protocol').MarketPaint|null;resumed:boolean}> {
    for(;;){
      if(await this.ctx.storage.get(MARKET_LOCK_KEY))throw new Error('Market wallet transaction pending');
      const previous=await this.ctx.storage.get<DriverRecord>('driver');
      if(previous && previous.driverId!==driverId)throw new Error('Driver identity mismatch');
      if(previous && previous.fence!==fence){
        // Stop acceptance and drain its in-memory queue before fencing. Neither
        // RPC runs in the room tick, so unrelated drivers continue moving.
        await this.env.ROOMS.get(this.env.ROOMS.idFromName(previous.roomId)).freezeWallet(driverId,previous.fence);
        await this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(previous.roomId)).freeze(driverId,previous.fence);
      }
      const result=await this.ctx.storage.transaction(async txn=>{
        if(await txn.get(MARKET_LOCK_KEY))throw new Error('Market wallet transaction pending');
        const current=await txn.get<DriverRecord>('driver');
        if(current?.fence!==previous?.fence || current?.roomId!==previous?.roomId)return null;
        const progress=current?.progress??initial;
        const normalized={...progress,cybercabs:progress.cybercabs??emptyCybercabFleet(),
          achievementTiers:normalizeAchievementTiers(progress.achievementTiers,progress.completed,progress.unlocked)};
        const record:DriverRecord=current?{...current,fence,roomId,sealed:current.fence===fence?current.sealed:false,progress:normalized}:{driverId,fence,roomId,revision:0,sequence:0,sealed:false,progress:normalized,incomeActivated:false};
        await txn.put('driver',record);
        return {revision:record.revision,sequence:record.sequence,progress:record.progress,marketPaint:record.marketPaint??null,resumed:!!current};
      });
      if(result)return result;
    }
  }

  async currentRevision(fence:string):Promise<number|null>{
    const record=await this.ctx.storage.get<DriverRecord>('driver');
    return record?.fence===fence?record.revision:null;
  }

  /** Fenced recovery assigns new wallet sequences after all recorded writes. */
  async currentCursor(fence:string):Promise<{revision:number;sequence:number}|null>{
    const record=await this.ctx.storage.get<DriverRecord>('driver');
    return record?.fence===fence&&!record.sealed?{revision:record.revision,sequence:record.sequence}:null;
  }

  /** Receipt lookup precedes fencing, including for a reply lost before a room switch. */
  async commit(intent:EconomyIntent,cabEvents?:EarningsEvents):Promise<DriverOutcome> {
    const payload=JSON.stringify(intent);
    return this.ctx.storage.transaction(async txn=>{
      const key=`receipt:${intent.eventId}`;
      const receipt=await txn.get<Receipt>(key);
      if(receipt)return receipt.payload===payload && (intent.action.kind!=='cab-income'&&intent.action.kind!=='delivery'||JSON.stringify(receipt.cabEvents)===JSON.stringify(cabEvents))?receipt.outcome:{ok:false,reason:'conflict'};
      const record=await txn.get<DriverRecord>('driver');
      let result:DriverOutcome;
      if(!record || record.driverId!==intent.driverId || record.fence!==intent.fence || record.roomId!==intent.roomId || record.sealed)return {ok:false,reason:'superseded'};
      record.progress={...record.progress,cybercabs:record.progress.cybercabs??emptyCybercabFleet(),
        achievementTiers:normalizeAchievementTiers(record.progress.achievementTiers,record.progress.completed,record.progress.unlocked)};
      if(!Number.isSafeInteger(intent.sequence)||intent.sequence<=record.sequence)return {ok:false,reason:'revision'};
      if(!Number.isSafeInteger(intent.revision)||intent.revision<0)return {ok:false,reason:'invalid'};
      if(record.revision<intent.revision)return {ok:false,reason:'not-ready'};
      else if(record.revision>intent.revision)result={ok:false,reason:'revision'};
      else {
        const next=structuredClone(record.progress);
        let awards:AchievementId[]=[];
        let error:'invalid'|'owned'|'unaffordable'|undefined;
        let deliveryResult:Extract<DriverOutcome,{ok:true}>['delivery'];
        let achievementResult:Extract<DriverOutcome,{ok:true}>['achievement'];
        let deliveryEarnings:SettledDeliveryEarning[]|undefined;
        if(intent.clock!==undefined){
          const before=next.deliveryClock??0;
          if(!Number.isFinite(intent.clock)||intent.clock<before||!Number.isFinite(before)||before<0)error='invalid';
          else {next.order.elapsed+=intent.clock-before;next.deliveryClock=intent.clock;}
        }
        if(error){} else if(intent.action.kind==='progress'){
          const progress=intent.action.progress,earnings=intent.action.earnings;
          if(!validProgress(progress,record.progress)||(earnings!==undefined&&!validDeliveryEarnings(earnings,record.progress,progress)))error='invalid';
          else if(earnings?.length&&[...(await txn.get(earnings.map(part=>`earned-source:${part.sourceId}`))).values()].some(value=>value!==undefined))error='invalid';
          else {
            const order=next.order,clock=next.deliveryClock;
            const same=next.completed===progress.completed&&order.restaurant===progress.order.restaurant&&order.customer===progress.order.customer&&order.stage===progress.order.stage&&
              order.pickupEstimate===progress.order.pickupEstimate&&order.estimate===progress.order.estimate&&order.base===progress.order.base;
            Object.assign(next,structuredClone(progress));next.cybercabs=structuredClone(record.progress.cybercabs);
            next.achievementTiers=structuredClone(record.progress.achievementTiers);next.deliveryClock=clock;
            if(intent.clock!==undefined&&same)next.order.elapsed=order.elapsed;
          }
        } else if(intent.action.kind==='cab-buy' || intent.action.kind==='cab-income' || intent.action.kind==='cab-paint'){
          const result=intent.action.kind==='cab-buy'
            ?purchaseCybercab(next.cybercabs!,next.cash,next.eligibleIncome,intent.action.assetId)
            :intent.action.kind==='cab-paint'
              ?paintCybercab(next.cybercabs!,next.cash,next.eligibleIncome,intent.action.assetId,intent.action.paint)
              :cabEvents?settleCybercabIntervals(next.cybercabs!,next.cash,next.eligibleIncome,intent.action.intervals,cabEvents):{ok:false as const,reason:'invalid' as const};
          if(!result.ok)error=result.reason;
          else {
            next.cybercabs=result.fleet;next.cash=result.cash;next.eligibleIncome=result.eligibleIncome;
            if(intent.action.kind==='cab-income'){
              const delivery=initialDelivery({x:0,z:0});
              Object.assign(delivery,{cash:next.cash,lifetimeIncome:next.eligibleIncome,level:levelForCash(next.cash)});
              const state=initialAchievements();state.unlocked=[...next.unlocked];
              awards=applyAchievementAwards(delivery,state,[]);
              if(!validAmount(delivery.cash)||!validAmount(delivery.lifetimeIncome))error='invalid';
              else {next.cash=delivery.cash;next.eligibleIncome=delivery.lifetimeIncome;next.unlocked=state.unlocked;}
            }
            if(intent.action.kind!=='cab-income' && intent.action.order)next.order=structuredClone(intent.action.order);
          }
        } else if(intent.action.kind==='ticket'){
          const evidence=intent.action.evidence;
          if(!evidence||![evidence.seconds,evidence.peakHeight,evidence.at,evidence.x,evidence.z].every(Number.isFinite)||
            evidence.seconds<0||evidence.peakHeight<0||evidence.at<0||typeof evidence.canFly!=='boolean')error='invalid';
          else {
            const delivery=initialDelivery(evidence);
            Object.assign(delivery,{cash:next.cash,level:levelForCash(next.cash),tickets:next.tickets,completed:next.completed,order:{...next.order}});
            const before=intent.action.orderBefore,order=delivery.order;
            if(intent.clock===undefined&&before&&next.completed===intent.action.completedBefore&&before.restaurant===order.restaurant&&before.customer===order.customer&&before.stage===order.stage&&
              before.pickupEstimate===order.pickupEstimate&&before.estimate===order.estimate&&before.base===order.base&&Number.isFinite(before.elapsed)&&before.elapsed>=0)
              order.elapsed=Math.max(order.elapsed,before.elapsed);
            const previousLevel=delivery.level;
            applyTicketEvidence(delivery,evidence);
            if(delivery.level<previousLevel)rerouteInaccessibleOrder(delivery,evidence,evidence.canFly);
            if(!validAmount(delivery.cash)||!validAmount(delivery.tickets))error='invalid';
            else {next.cash=delivery.cash;next.tickets=delivery.tickets;next.order=delivery.order;}
          }
        } else if(intent.action.kind==='delivery'){
          const {stop,atMs,multiplier}=intent.action;
          if(!stop||![stop.x,stop.y,stop.z,stop.vy,stop.speed].every(Number.isFinite)||
             typeof stop.kind!=='string'||(stop.supportId!==null&&typeof stop.supportId!=='string')||typeof stop.canFly!=='boolean'||
             !Number.isSafeInteger(atMs)||atMs<0||![null,1,1.5,2,3].includes(multiplier))error='invalid';
          else {
            let projected:DeliveryState|undefined,projectedAwards:AchievementId[]=[];
            let projectedUnlocked:AchievementId[]|undefined,projectedTiers:AchievementTierProgress|undefined,matched=false;
            try{
              const rate=multiplier??(cabEvents?earningsMultiplier(cabEvents,atMs).multiplier:null);
              if(rate===null)return {ok:false,reason:'not-ready'};
              const delivery=initialDelivery(stop);
              Object.assign(delivery,{cash:next.cash,lifetimeIncome:next.eligibleIncome,earned:next.earned,completed:next.completed,
                level:levelForCash(next.cash),order:{...next.order},tickets:next.tickets});
              const previous={...delivery.order},wasDropoff=previous.stage==='dropoff',customer=CUSTOMERS[previous.customer]?.id,rooftop=wasDropoff&&orderTarget(previous).rooftop;
              const rewardBefore=delivery.lastReward?.id??0;
              const parts=applyDeliveryStop(delivery,stop,component=>{
                const amount=(BigInt(component.amount)*BigInt(rate*2)+1n)/2n;
                if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Delivery payout overflow');
                return Number(amount);
              });
              if(parts===null)throw new Error('Missing delivery rate');
              deliveryEarnings=parts?.map(({component,amount})=>({sourceId:component.sourceId,kind:component.kind,base:component.amount,amount,
                atMs,multiplier:component.kind==='checkpoint'?1:rate}))??[];
              if(parts){
                const state=initialAchievements();state.unlocked=[...next.unlocked];
                const tier=applyAcceptedDelivery(delivery,state,next.achievementTiers!,previous,rooftop,wasDropoff?customer:undefined,(delivery.lastReward?.id??0)>rewardBefore);
                projectedAwards=tier.awards;projectedTiers=tier.progress;
                projectedUnlocked=state.unlocked;
              }
              if(!validAmount(delivery.cash)||!validAmount(delivery.lifetimeIncome)||!validAmount(delivery.earned)||!validAmount(delivery.completed))error='invalid';
              else {projected=delivery;matched=!!parts;}
            }catch{error='invalid';}
            if(!error&&deliveryEarnings?.length&&[...(await txn.get(deliveryEarnings.map(part=>`earned-source:${part.sourceId}`))).values()].some(value=>value!==undefined))error='invalid';
            if(!error&&projected&&deliveryEarnings){
              awards=projectedAwards;if(projectedUnlocked)next.unlocked=projectedUnlocked;
              if(projectedTiers)next.achievementTiers=projectedTiers;
              Object.assign(next,{cash:projected.cash,eligibleIncome:projected.lifetimeIncome,earned:projected.earned,completed:projected.completed,order:projected.order});
              deliveryResult={matched,earnings:deliveryEarnings,lastReward:projected.lastReward,lastPayout:projected.lastPayout};
            }
          }
        } else if(intent.action.kind==='achievement'){
          const evidence=intent.action.evidence;
          if(!isAchievementEvidence(evidence))error='invalid';
          else {
            const delivery=initialDelivery({x:0,z:0});
            Object.assign(delivery,{cash:next.cash,lifetimeIncome:next.eligibleIncome,level:levelForCash(next.cash)});
            const state=initialAchievements();state.unlocked=[...next.unlocked];
            const tier=applyObservedAchievement(delivery,state,next.achievementTiers!,evidence);
            awards=tier.awards;
            if(!validAmount(delivery.cash)||!validAmount(delivery.lifetimeIncome))error='invalid';
            else {
              next.cash=delivery.cash;next.eligibleIncome=delivery.lifetimeIncome;next.unlocked=state.unlocked;next.achievementTiers=tier.progress;
              achievementResult={lastReward:delivery.lastReward};
            }
          }
        } else if(intent.action.kind==='supply'){
          if((intent.action.type!=='repair'&&intent.action.type!=='air')||!intent.pickup||typeof intent.pickup.id!=='string'||!intent.pickup.id||
            !Number.isSafeInteger(intent.pickup.generation)||intent.pickup.generation<0||!validAmount(next.cash+5)||!validAmount(next.eligibleIncome+5))error='invalid';
          else {
            const delivery=initialDelivery({x:0,z:0});
            Object.assign(delivery,{cash:next.cash+5,lifetimeIncome:next.eligibleIncome+5,level:levelForCash(next.cash+5)});
            const state=initialAchievements();state.unlocked=[...next.unlocked];
            const tiers=applyTierProgress(delivery,next.achievementTiers!,['supply-pickups']);
            awards=applyAchievementAwards(delivery,state,[]);
            if(!validAmount(delivery.cash)||!validAmount(delivery.lifetimeIncome))error='invalid';
            else {next.cash=delivery.cash;next.eligibleIncome=delivery.lifetimeIncome;next.unlocked=state.unlocked;next.achievementTiers=tiers;}
          }
        } else if(intent.action.kind==='contribute'){
          const amount=intent.action.amount;
          if(!Number.isSafeInteger(amount)||amount<=0||amount>1_000_000_000)error='invalid';
          else if(next.cash<amount)error='unaffordable';
          else {next.cash-=amount;if(intent.action.order)next.order=structuredClone(intent.action.order);}
        } else {
          const vehicle=luxuryVehicle(intent.action.vehicle);
          if(!vehicle)error='invalid';
          else if(next.ownedLuxury.includes(vehicle.id))error='owned';
          else if(next.cash<vehicle.price)error='unaffordable';
          else {
            const rewards=luxuryPurchaseAwards(vehicle.id,next.ownedLuxury,next.unlocked);
            const value=rewards.reduce((total,award)=>total+award.reward,0);
            if(!validAmount(next.cash-vehicle.price+value)||!validAmount(next.eligibleIncome+value))error='invalid';
            else {
              next.cash+=value-vehicle.price;
              next.ownedLuxury.push(vehicle.id);
              awards=rewards.map(award=>award.id as AchievementId);
              next.unlocked.push(...awards);
              next.eligibleIncome+=value;
              if(intent.action.order)next.order=structuredClone(intent.action.order);
            }
          }
        }
        if(error)result={ok:false,reason:error};
        else {
          next.level=levelForCash(next.cash);
          const revision=record.revision+1;
          result={ok:true,revision,progress:next,awards,...(deliveryResult?{delivery:deliveryResult}:{}),...(achievementResult?{achievement:achievementResult}:{})};
          await txn.put('driver',{...record,revision,sequence:intent.sequence,progress:next,incomeActivated:true} satisfies DriverRecord);
          if(intent.action.kind==='progress'&&intent.action.earnings?.length){
            const rows=Object.fromEntries(intent.action.earnings.map(part=>[`earned-source:${part.sourceId}`,part]));
            await txn.put(rows);
          }
          if(deliveryEarnings?.length)await txn.put(Object.fromEntries(deliveryEarnings.map(part=>[`earned-source:${part.sourceId}`,part])));
          if(next.eligibleIncome>record.progress.eligibleIncome || (!record.incomeActivated && next.eligibleIncome>0)){
            await txn.put('income-pending',next.eligibleIncome);
            const alarm=await txn.getAlarm();
            const retry=await txn.get<OutboxRetry>('income-retry');
            const nextAttempt=Math.max(Date.now()+500,retry?.next??0);
            if(alarm===null || alarm>nextAttempt)await txn.setAlarm(nextAttempt);
          }
        }
      }
      if(!result.ok)await txn.put('driver',{...record,sequence:intent.sequence} satisfies DriverRecord);
      await txn.put(key,{payload,outcome:result,...((intent.action.kind==='cab-income'||intent.action.kind==='delivery')&&cabEvents?{cabEvents}:{} )} satisfies Receipt);
      return result;
    });
  }

  /** An acknowledgement makes the outcome unnecessary; sequence prevents replay. */
  async compact(intent:EconomyIntent):Promise<void>{
    const payload=JSON.stringify(intent);
    await this.ctx.storage.transaction(async txn=>{
      const key=`receipt:${intent.eventId}`,receipt=await txn.get<Receipt>(key);
      if(receipt && receipt.payload!==payload)throw new Error('Economy receipt mismatch');
      const record=await txn.get<DriverRecord>('driver');
      // Room-only rejections (e.g. a pickup reservation) never reached commit.
      // Record their sequence before deleting anything so later retries stay stale.
      if(record && record.driverId===intent.driverId && record.fence===intent.fence && record.roomId===intent.roomId && !record.sealed &&
          Number.isSafeInteger(intent.sequence) && intent.sequence>record.sequence)
        await txn.put('driver',{...record,sequence:intent.sequence} satisfies DriverRecord);
      if(receipt)await txn.delete(key);
    });
  }

  /** Seal the old fence before its room drops the temporary freeze marker. */
  async sealFence(driverId:string,fence:string):Promise<void>{
    await this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<DriverRecord>('driver');
      if(record?.driverId===driverId && record.fence===fence && !record.sealed)await txn.put('driver',{...record,sealed:true} satisfies DriverRecord);
    });
  }

  async activateIncome(fence:string):Promise<boolean>{
    return this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<DriverRecord>('driver');
      if(!record||record.fence!==fence||record.sealed)return false;
      if(!record.incomeActivated){
        await txn.put('driver',{...record,incomeActivated:true} satisfies DriverRecord);
        if(record.progress.eligibleIncome>0){
          await txn.put('income-pending',record.progress.eligibleIncome);
          const retry=await txn.get<OutboxRetry>('income-retry');
          const alarm=await txn.getAlarm(),next=Math.max(Date.now()+500,retry?.next??0);
          if(alarm===null||alarm>next)await txn.setAlarm(next);
        }
      }
      return true;
    });
  }

  async checkFence(fence:string):Promise<boolean>{const record=await this.ctx.storage.get<DriverRecord>('driver');return record?.fence===fence&&!record.sealed;}

  async starshipPrivacyState(driverId:string,fence:string):Promise<{pending:boolean;revision:number}|null>{
    return this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<DriverRecord>('driver');
      if(!record||record.driverId!==driverId||record.fence!==fence||record.sealed)return null;
      return {pending:!!await txn.get<PrivacyPending>('privacy-pending'),revision:await txn.get<number>('privacy-revision')??0};
    });
  }

  /** Privacy changes are ordered at the profile and retried independently of income. */
  async setStarshipName(driverId:string,fence:string,name:string|null):Promise<{ok:boolean;publicName:string|null}>{
    if(name!==null&&(typeof name!=='string'||name.length>256))throw new Error('Invalid public name');
    const normalized=name===null?null:normalizeName(name);
    const pending=await this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<DriverRecord>('driver');
      if(!record||record.driverId!==driverId||record.fence!==fence||record.sealed)return null;
      const previous=await txn.get<number>('privacy-revision')??0,revision=previous+1;
      if(!Number.isSafeInteger(revision))throw new Error('Privacy revision overflow');
      const change={revision,name:normalized};
      // Reserve before sending. A newer choice may replace the pending
      // revision, but it must not bypass an already reserved deadline.
      const now=Date.now(),previousRetry=await txn.get<OutboxRetry>('privacy-retry');
      const attempt=!previousRetry||previousRetry.next<=now;
      const retry=attempt?nextOutboxRetry(previousRetry,now):previousRetry;
      await txn.put({'privacy-revision':revision,'privacy-pending':change,'privacy-retry':retry});
      const alarm=await txn.getAlarm();
      if(alarm===null||alarm>retry.next)await txn.setAlarm(retry.next);
      return {change,attempt,deadline:retry.next};
    });
    if(!pending||!pending.attempt||pending.deadline-Date.now()<=OUTBOX_RPC_TIMEOUT_MS)return {ok:false,publicName:null};
    try{
      const publicName=await this.flushPrivacy(driverId,pending.change);
      const latest=await this.ctx.storage.get<number>('privacy-revision');
      return {ok:latest===pending.change.revision&&publicName===normalized,publicName};
    }catch{return {ok:false,publicName:null};}
  }

  private async flushPrivacy(driverId:string,pending:PrivacyPending):Promise<string|null>{
    const global=this.env.INCOME.get(this.env.INCOME.idFromName('global'));
    const publicName=await boundedOutbox(global.setName(driverId,pending.name,pending.revision));
    await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<PrivacyPending>('privacy-pending');
      if(current?.revision===pending.revision)await txn.delete(['privacy-pending','privacy-retry']);
    });
    return publicName;
  }

  async alarm():Promise<void>{
    // Reserve independent retry deadlines and arm the next alarm atomically
    // before making either RPC. A stalled lane cannot prevent the other lane
    // from progressing, and prolonged failures back off instead of flooding.
    const reserved=await this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<DriverRecord>('driver');
      const pending=await txn.get<number>('income-pending'),privacy=await txn.get<PrivacyPending>('privacy-pending');
      let incomeRetry=await txn.get<OutboxRetry>('income-retry'),privacyRetry=await txn.get<OutboxRetry>('privacy-retry');
      const now=Date.now();
      const incomeDue=!!record&&pending!==undefined&&(!incomeRetry||incomeRetry.next<=now);
      const privacyDue=!!record&&!!privacy&&(!privacyRetry||privacyRetry.next<=now);
      if(incomeDue){incomeRetry=nextOutboxRetry(incomeRetry,now);await txn.put('income-retry',incomeRetry);}
      if(privacyDue){privacyRetry=nextOutboxRetry(privacyRetry,now);await txn.put('privacy-retry',privacyRetry);}
      const next=Math.min(pending!==undefined?(incomeRetry?.next??now+500):Infinity,privacy?(privacyRetry?.next??now+500):Infinity);
      const alarm=await txn.getAlarm();
      if(Number.isFinite(next)){if(alarm===null||alarm>next)await txn.setAlarm(next);}
      return {record,pending:incomeDue?pending:undefined,privacy:privacyDue?privacy:undefined,incomeDeadline:incomeRetry?.next,privacyDeadline:privacyRetry?.next};
    });
    const {record}=reserved;
    if(!record)return;
    // A slow storage transaction can consume a reservation. Let its already
    // armed alarm reserve again instead of dispatching an expired attempt.
    const pending=(reserved.incomeDeadline??0)-Date.now()>OUTBOX_RPC_TIMEOUT_MS?reserved.pending:undefined;
    const privacy=(reserved.privacyDeadline??0)-Date.now()>OUTBOX_RPC_TIMEOUT_MS?reserved.privacy:undefined;
    // A hung RPC must not keep this alarm open forever: future earnings or
    // privacy changes still need the already-armed watchdog to run again.
    const privacyFlush=privacy?this.flushPrivacy(record.driverId,privacy).catch(()=>{}):Promise.resolve();
    const incomeFlush=pending===undefined?Promise.resolve():(async()=>{try {
      const global=this.env.INCOME.get(this.env.INCOME.idFromName('global'));
      await boundedOutbox(global.credit(record.driverId,pending));
      await this.ctx.storage.transaction(async txn=>{
        const current=await txn.get<number>('income-pending');
        if(current!==undefined && current<=pending)await txn.delete(['income-pending','income-retry']);
        else if(current!==undefined){
          // The successful credit did not include newer earnings. Preserve the
          // existing reservation so a stream of earnings cannot reset backoff.
          const retry=await txn.get<OutboxRetry>('income-retry');
          const alarm=await txn.getAlarm(),next=retry?.next??Date.now()+500;
          if(alarm===null||alarm>next)await txn.setAlarm(next);
        }
      });
    } catch { /* The durable retry deadline is already armed. */ }})();
    await Promise.all([privacyFlush,incomeFlush]);
  }
}

/** Cumulative-per-driver credits are safe to retry and can arrive out of order. */
export class GlobalIncome extends DurableObject {
  private starship=new StarshipLedger(this.ctx.storage);
  credit(driverId:string,cumulative:number):Promise<number>{return this.starship.credit(driverId,cumulative);}
  async total():Promise<number>{return await this.ctx.storage.get<number>('total')??0;}
  status(driverId?:string){return this.starship.status(driverId);}
  publicName(driverId:string){return this.starship.publicName(driverId);}
  setName(driverId:string,name:string|null,revision:number){return this.starship.setPublicName(driverId,name,revision);}
  contributors(group:StarshipContributorGroup,cursor?:string){return this.starship.contributors(group,cursor);}
}

export function progressFrom(delivery:DeliveryState,unlocked:AchievementId[],vehicles:SavedVehicles,ownedLuxury:LuxuryVehicleId[],time:number,eligibleIncome:number):DriverProgress {
  return {cash:delivery.cash,earned:delivery.earned,completed:delivery.completed,level:delivery.level,
    order:{...delivery.order},tickets:delivery.tickets,unlocked:[...unlocked],vehicles:structuredClone(vehicles),
    ownedLuxury:[...ownedLuxury],eligibleIncome,
    ota:{enabled:delivery.ota.enabled,active:delivery.ota.active,remaining:delivery.ota.active&&delivery.ota.renewAt!==null?Math.max(0,delivery.ota.renewAt-time):0,needsRenewalConsent:delivery.ota.needsRenewalConsent}};
}
