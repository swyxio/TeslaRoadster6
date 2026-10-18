import { DurableObject } from 'cloudflare:workers';
import { DriverProfile, type DriverOutcome, type EconomyIntent } from './driver-profile';
import type { GameRoom } from './index';
import { MARS_GOAL } from '../shared/mars';

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;ROOMS:DurableObjectNamespace<GameRoom>};
type IntentRecord={intent:EconomyIntent;outcome:DriverOutcome|null};
type Acknowledged={fence:string;sequence:number};
type PickupReservation={eventId:string|null;generation:number;readyAt:number};
type RoomFund={balance:number;reserved:number};
const RETRY_MS=1000;
const PICKUP_COOLDOWN_MS=20_000;

/** Separate from GameRoom so a slow profile or storage output gate cannot stop physics. */
export class RoomEconomy extends DurableObject<Env> {
  private flights=new Map<string,Promise<void>>();
  private profile(id:string){return this.env.DRIVERS.get(this.env.DRIVERS.idFromName(id));}

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

  async submit(intent:EconomyIntent):Promise<DriverOutcome|null>{
    if(!Number.isSafeInteger(intent.sequence)||intent.sequence<1)return {ok:false,reason:'invalid'};
    if(intent.action.kind==='contribute'&&intent.pickup)return {ok:false,reason:'invalid'};
    const key=`intent:${intent.eventId}`;
    const result=await this.ctx.storage.transaction(async txn=>{
      const existing=await txn.get<IntentRecord>(key);
      if(existing){
        if(JSON.stringify(existing.intent)!==JSON.stringify(intent))return {outcome:{ok:false,reason:'conflict'} as DriverOutcome};
        return existing;
      }
      const acknowledged=await txn.get<Acknowledged>(`ack:${intent.driverId}`);
      if(acknowledged?.fence===intent.fence && intent.sequence<=acknowledged.sequence)return {outcome:{ok:false,reason:'revision'} as DriverOutcome};
      if(await txn.get<boolean>(`frozen:${intent.driverId}:${intent.fence}`)){
        return {outcome:{ok:false,reason:'superseded'} as DriverOutcome};
      }
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
        if(pickup.eventId!==null||pickup.readyAt>Date.now()||pickup.generation!==intent.pickup.generation){
          const denied:IntentRecord={intent,outcome:{ok:false,reason:'reserved'}};
          await txn.put(key,denied);
          await txn.put(`unacked:${intent.driverId}:${intent.eventId}`,intent);
          const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
          if(alarm===null||alarm>next)await txn.setAlarm(next);
          return denied;
        }
        await txn.put(pickupKey,{...pickup,eventId:intent.eventId} satisfies PickupReservation);
      }
      const pending:IntentRecord={intent,outcome:null};
      await txn.put(key,pending);
      await txn.put(`pending:${intent.driverId}:${intent.eventId}`,intent);
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
      return pending;
    });
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
      const result=await this.resolveOnce(intent);
      if(!result.ok && result.reason==='not-ready')break;
    }
  }
  private async resolveOnce(intent:EconomyIntent):Promise<DriverOutcome>{
    const outcome=await this.profile(intent.driverId).commit(intent);
    if(!outcome.ok && outcome.reason==='not-ready')return outcome;
    return this.ctx.storage.transaction(async txn=>{
      const key=`intent:${intent.eventId}`,record=await txn.get<IntentRecord>(key);
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
      await txn.put(key,{intent,outcome:result} satisfies IntentRecord);
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
    if(accepted==='pending')return false;
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
    await this.ctx.storage.transaction(async txn=>{
      await txn.put(`frozen:${driverId}:${fence}`,true);
      const alarm=await txn.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await txn.setAlarm(next);
    });
    await this.resolveDriver(driverId);
    const pending=(await this.pending(driverId)).filter(intent=>intent.fence===fence);
    const revision=pending.length?await this.profile(driverId).currentRevision(fence):null;
    if(pending.length && revision===null){
      await this.resolveDriver(driverId);
      if((await this.pending(driverId)).some(intent=>intent.fence===fence))throw new Error('Unable to reconcile fenced wallet event');
    }
    if(revision!==null && pending.some(intent=>intent.revision<=revision))throw new Error('Unable to reconcile wallet event');
    // The room is closed and has no more submissions. A missing predecessor
    // means later speculative drafts must not be applied to the wallet.
    for(const intent of revision===null?[]:pending)await this.ctx.storage.transaction(async txn=>{
      const key=`intent:${intent.eventId}`,record=await txn.get<IntentRecord>(key);
      if(!record||record.outcome)return;
      await txn.put(key,{intent,outcome:{ok:false,reason:'revision'}} satisfies IntentRecord);
      await txn.delete(`pending:${intent.driverId}:${intent.eventId}`);
      await txn.put(`unacked:${intent.driverId}:${intent.eventId}`,intent);
      if(intent.pickup){const pickupKey=`pickup:${intent.pickup.id}`,pickup=await txn.get<PickupReservation>(pickupKey);if(pickup?.eventId===intent.eventId)await txn.put(pickupKey,{...pickup,eventId:null});}
      if(intent.action.kind==='contribute'){
        const fund=await txn.get<RoomFund>('room-fund');
        if(!fund||fund.reserved<intent.action.amount)throw new Error('Missing room fund reservation');
        await txn.put('room-fund',{...fund,reserved:fund.reserved-intent.action.amount} satisfies RoomFund);
      }
    });
    // No old producer remains. Consume abandoned outcomes while the room is
    // frozen so the profile records even room-only rejected sequences.
    const abandoned=[...(await this.ctx.storage.list<EconomyIntent>({prefix:`unacked:${driverId}:`})).values()].filter(intent=>intent.fence===fence);
    for(const intent of abandoned)if(!await this.acknowledge(intent))throw new Error('Wallet cleanup pending');
    const cleanup=[...(await this.ctx.storage.list<EconomyIntent>({prefix:`cleanup:${driverId}:`})).values()].filter(intent=>intent.fence===fence);
    for(const intent of cleanup)await this.finishCleanup(intent);
    // The durable seal prevents stale requests after the room marker is gone.
    await this.profile(driverId).sealFence(driverId,fence);
    await this.ctx.storage.delete(`frozen:${driverId}:${fence}`);
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
  async alarm():Promise<void>{
    // Alarms are consumed before the handler runs. Arm before reading work or
    // awaiting any RPC, so termination during recovery cannot strand a journal.
    const watchdog=Date.now()+RETRY_MS;
    const armed=await this.ctx.storage.transaction(async txn=>{
      const alarm=await txn.getAlarm();
      if(alarm!==null&&alarm<=watchdog)return false;
      await txn.setAlarm(watchdog);return true;
    });
    const intents=await this.pending();
    const other=await Promise.all(['cleanup:','unacked:','frozen:'].map(prefix=>this.ctx.storage.list({prefix,limit:1})));
    if(!intents.length&&!other.some(entries=>entries.size)){
      // Cancel only our own empty wakeup and recheck atomically with submissions.
      if(armed)await this.ctx.storage.transaction(async txn=>{
        if(await txn.getAlarm()!==watchdog)return;
        const work=await Promise.all(['pending:','cleanup:','unacked:','frozen:'].map(prefix=>txn.list({prefix,limit:1})));
        if(!work.some(entries=>entries.size))await txn.deleteAlarm();
      });
      return;
    }
    await Promise.allSettled([...new Set(intents.map(intent=>intent.driverId))].map(driver=>this.resolveDriver(driver)));
    const cleanup=[...(await this.ctx.storage.list<EconomyIntent>({prefix:'cleanup:'})).values()];
    await Promise.allSettled(cleanup.map(intent=>this.finishCleanup(intent)));
    const unacked=[...(await this.ctx.storage.list<EconomyIntent>({prefix:'unacked:'})).values()];
    await Promise.allSettled(unacked.map(async intent=>{
      // An unavailable room is not evidence that its producer has gone away.
      const room=this.env.ROOMS.get(this.env.ROOMS.idFromName(intent.roomId));
      if(!await room.hasWallet(intent.driverId,intent.fence))await this.freeze(intent.driverId,intent.fence);
    }));
    // A crash between sealing a fence and removing its marker must not leak
    // one marker per reconnect. Freeze is idempotent and resumes the drain.
    const frozen=await this.ctx.storage.list<boolean>({prefix:'frozen:'});
    await Promise.allSettled([...frozen.keys()].map(key=>{
      const [,driverId,fence]=key.split(':');return this.freeze(driverId,fence);
    }));
    if((await this.pending()).length || (await this.ctx.storage.list({prefix:'cleanup:',limit:1})).size ||
      (await this.ctx.storage.list({prefix:'unacked:',limit:1})).size ||
      (await this.ctx.storage.list({prefix:'frozen:',limit:1})).size){
      const alarm=await this.ctx.storage.getAlarm(),next=Date.now()+RETRY_MS;
      if(alarm===null||alarm>next)await this.ctx.storage.setAlarm(next);
    }
  }
}
