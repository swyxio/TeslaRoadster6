import { DurableObject } from 'cloudflare:workers';
import type { AchievementId } from '../shared/achievements';
import { levelForCash, type DeliveryState, type Level, type Order } from '../shared/delivery';
import { luxuryPurchaseAwards, luxuryVehicle, type LuxuryVehicleId } from '../shared/luxury';
import type { VehicleUpgrades } from '../shared/upgrades';
import type { VehicleStyle } from '../shared/vehicle-style';
import type { TankLevel } from '../shared/air-tank';
import type { GameRoom } from './index';
import type { RoomEconomy } from './room-economy';
import { StarshipLedger } from './starship';
import { normalizeName } from './global-chat-core';
import type { StarshipContributorGroup } from '../shared/starship';

export type SavedVehicle = { upgrades:VehicleUpgrades; tankLevel:TankLevel; style:VehicleStyle };
export type SavedVehicles = Record<string,SavedVehicle>;
/** Position, fuel and damage belong to the room; only this state follows a saved driver. */
export type DriverProgress = {
  cash:number; earned:number; completed:number; level:Level; order:Order; tickets:number;
  unlocked:AchievementId[]; vehicles:SavedVehicles; ownedLuxury:LuxuryVehicleId[];
  ota:{enabled:boolean; active:boolean; remaining:number};
  /** Cumulative verified game-created income; player transfers never increase this. */
  eligibleIncome:number;
};
export type DriverAction = {kind:'progress';progress:DriverProgress} | {kind:'luxury';vehicle:LuxuryVehicleId;order?:Order} | {kind:'contribute';amount:number;order?:Order};
export type EconomyIntent = {eventId:string;driverId:string;fence:string;roomId:string;revision:number;sequence:number;action:DriverAction;pickup?:{id:string;generation:number}};
export type DriverOutcome =
  | {ok:true;revision:number;progress:DriverProgress;awards:AchievementId[];roomFund?:number}
  | {ok:false;reason:'superseded'|'revision'|'conflict'|'invalid'|'unaffordable'|'owned'|'reserved'|'not-ready';available?:number};
type DriverRecord = {driverId:string;fence:string;roomId:string;revision:number;sequence:number;sealed:boolean;progress:DriverProgress;incomeActivated:boolean};
type Receipt = {payload:string;outcome:DriverOutcome};
type PrivacyPending = {revision:number;name:string|null};


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

/** One authority per saved identity. Only trusted worker RPCs can reach it. */
export class DriverProfile extends DurableObject<Env> {
  async acquire(driverId:string,fence:string,initial:DriverProgress,roomId:string):Promise<{revision:number;sequence:number;progress:DriverProgress;resumed:boolean}> {
    for(;;){
      const previous=await this.ctx.storage.get<DriverRecord>('driver');
      if(previous && previous.driverId!==driverId)throw new Error('Driver identity mismatch');
      if(previous && previous.fence!==fence){
        // Stop acceptance and drain its in-memory queue before fencing. Neither
        // RPC runs in the room tick, so unrelated drivers continue moving.
        await this.env.ROOMS.get(this.env.ROOMS.idFromName(previous.roomId)).freezeWallet(driverId,previous.fence);
        await this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(previous.roomId)).freeze(driverId,previous.fence);
      }
      const result=await this.ctx.storage.transaction(async txn=>{
        const current=await txn.get<DriverRecord>('driver');
        if(current?.fence!==previous?.fence || current?.roomId!==previous?.roomId)return null;
        const record:DriverRecord=current?{...current,fence,roomId,sealed:current.fence===fence?current.sealed:false}:{driverId,fence,roomId,revision:0,sequence:0,sealed:false,progress:initial,incomeActivated:false};
        await txn.put('driver',record);
        return {revision:record.revision,sequence:record.sequence,progress:record.progress,resumed:!!current};
      });
      if(result)return result;
    }
  }

  async currentRevision(fence:string):Promise<number|null>{
    const record=await this.ctx.storage.get<DriverRecord>('driver');
    return record?.fence===fence?record.revision:null;
  }

  /** Receipt lookup precedes fencing, including for a reply lost before a room switch. */
  async commit(intent:EconomyIntent):Promise<DriverOutcome> {
    const payload=JSON.stringify(intent);
    return this.ctx.storage.transaction(async txn=>{
      const key=`receipt:${intent.eventId}`;
      const receipt=await txn.get<Receipt>(key);
      if(receipt)return receipt.payload===payload?receipt.outcome:{ok:false,reason:'conflict'};
      const record=await txn.get<DriverRecord>('driver');
      let result:DriverOutcome;
      if(!record || record.driverId!==intent.driverId || record.fence!==intent.fence || record.roomId!==intent.roomId || record.sealed)return {ok:false,reason:'superseded'};
      if(!Number.isSafeInteger(intent.sequence)||intent.sequence<=record.sequence)return {ok:false,reason:'revision'};
      if(!Number.isSafeInteger(intent.revision)||intent.revision<0)return {ok:false,reason:'invalid'};
      if(record.revision<intent.revision)return {ok:false,reason:'not-ready'};
      else if(record.revision>intent.revision)result={ok:false,reason:'revision'};
      else {
        const next=structuredClone(record.progress);
        let awards:AchievementId[]=[];
        let error:'invalid'|'owned'|'unaffordable'|undefined;
        if(intent.action.kind==='progress'){
          if(!validProgress(intent.action.progress,record.progress))error='invalid';
          else Object.assign(next,structuredClone(intent.action.progress));
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
          result={ok:true,revision,progress:next,awards};
          await txn.put('driver',{...record,revision,sequence:intent.sequence,progress:next,incomeActivated:true} satisfies DriverRecord);
          if(next.eligibleIncome>record.progress.eligibleIncome || (!record.incomeActivated && next.eligibleIncome>0)){
            await txn.put('income-pending',next.eligibleIncome);
            const alarm=await txn.getAlarm();
            const nextAttempt=Date.now()+500;
            if(alarm===null || alarm>nextAttempt)await txn.setAlarm(nextAttempt);
          }
        }
      }
      if(!result.ok)await txn.put('driver',{...record,sequence:intent.sequence} satisfies DriverRecord);
      await txn.put(key,{payload,outcome:result} satisfies Receipt);
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
          const alarm=await txn.getAlarm(),next=Date.now()+500;
          if(alarm===null||alarm>next)await txn.setAlarm(next);
        }
      }
      return true;
    });
  }

  async checkFence(fence:string):Promise<boolean>{const record=await this.ctx.storage.get<DriverRecord>('driver');return record?.fence===fence&&!record.sealed;}

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
      await txn.put({'privacy-revision':revision,'privacy-pending':change});
      const alarm=await txn.getAlarm(),next=Date.now()+500;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return change;
    });
    if(!pending)return {ok:false,publicName:null};
    try{
      const publicName=await this.flushPrivacy(driverId,pending);
      const latest=await this.ctx.storage.get<number>('privacy-revision');
      return {ok:latest===pending.revision&&publicName===normalized,publicName};
    }catch{return {ok:false,publicName:null};}
  }

  private async flushPrivacy(driverId:string,pending:PrivacyPending):Promise<string|null>{
    const global=this.env.INCOME.get(this.env.INCOME.idFromName('global'));
    const publicName=await global.setName(driverId,pending.name,pending.revision);
    await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<PrivacyPending>('privacy-pending');
      if(current?.revision===pending.revision)await txn.delete('privacy-pending');
    });
    return publicName;
  }

  async alarm():Promise<void>{
    // Arm before reading the outbox or awaiting its remote credit, preserving
    // any earlier deadline set by another operation.
    const watchdog=Date.now()+1000;
    const armed=await this.ctx.storage.transaction(async txn=>{
      const alarm=await txn.getAlarm();
      if(alarm!==null&&alarm<=watchdog)return false;
      await txn.setAlarm(watchdog);return true;
    });
    const [record,pending,privacy]=await Promise.all([this.ctx.storage.get<DriverRecord>('driver'),this.ctx.storage.get<number>('income-pending'),this.ctx.storage.get<PrivacyPending>('privacy-pending')]);
    if(!record||(pending===undefined&&!privacy)){
      if(armed&&pending===undefined&&!privacy)await this.ctx.storage.transaction(async txn=>{
        if(await txn.getAlarm()===watchdog && await txn.get('income-pending')===undefined && await txn.get('privacy-pending')===undefined)await txn.deleteAlarm();
      });
      return;
    }
    if(privacy)try{await this.flushPrivacy(record.driverId,privacy);}catch{}
    if(pending!==undefined)try {
      const global=this.env.INCOME.get(this.env.INCOME.idFromName('global'));
      await global.credit(record.driverId,pending);
      await this.ctx.storage.transaction(async txn=>{
        const current=await txn.get<number>('income-pending');
        if(current!==undefined && current<=pending)await txn.delete('income-pending');
        else if(current!==undefined){const alarm=await txn.getAlarm(),next=Date.now()+500;if(alarm===null||alarm>next)await txn.setAlarm(next);}
      });
    } catch {
      await this.ctx.storage.transaction(async txn=>{
        const alarm=await txn.getAlarm(),next=Date.now()+1000;
        if(alarm===null||alarm>next)await txn.setAlarm(next);
      });
    }
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
    ota:{enabled:delivery.ota.enabled,active:delivery.ota.active,remaining:delivery.ota.active&&delivery.ota.renewAt!==null?Math.max(0,delivery.ota.renewAt-time):0}};
}
