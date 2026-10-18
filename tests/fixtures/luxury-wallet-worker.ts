// LOCAL TEST ONLY. This worker supplies funded drivers, showroom positioning,
// and deterministic profile faults. It must never be used as a deployment entry.
import worker, { GameRoom as ProductionGameRoom, GlobalChat as ProductionGlobalChat, RoomEconomy as ProductionRoomEconomy, GlobalIncome } from '../../worker/index';
import { parseRecoveryCode } from '../../worker/global-chat-core';
import { DriverProfile as ProductionDriverProfile, type DriverProgress, type EconomyIntent } from '../../worker/driver-profile';
import { initialDelivery, levelForCash, orderTarget } from '../../shared/delivery';
import { SHOPS } from '../../shared/upgrades';
import { LUXURY_SHOWROOM } from '../../shared/luxury';
import { terrainHeight } from '../../shared/map';
import { addPlayer, createEmptyWorld, type World } from '../../shared/game';
import { progressFrom } from '../../worker/driver-profile';
import { EconomySession } from '../../worker/economy-session';

export { GlobalIncome };

/** Hold the real chat claim or confirmation after its transaction commits. */
export class GlobalChat extends ProductionGlobalChat {
  private nextBindingHold:'bind'|'confirm'|'lost-bind'|'lost-confirm'|'missing-bind'|null=null;
  private bindingHeld=false;
  private releaseUnavailable=false;
  private releaseBindingHold:(()=>void)|undefined;
  async armBindingHold(stage:'bind'|'confirm'|'lost-bind'|'lost-confirm'|'missing-bind'|'restore') {
    if(stage==='restore'){this.releaseUnavailable=false;return;}
    this.nextBindingHold=stage;
  }
  async bindingFaultState() { return {held:this.bindingHeld}; }
  async releaseBinding() { this.releaseBindingHold?.(); }
  private async holdBinding(stage:'bind'|'confirm') {
    if(this.nextBindingHold===`lost-${stage}`){this.nextBindingHold=null;throw new Error('Injected lost binding reply');}
    if(this.nextBindingHold!==stage)return;
    this.nextBindingHold=null;this.bindingHeld=true;
    try{await new Promise<void>(resolve=>{this.releaseBindingHold=resolve;});}
    finally{this.bindingHeld=false;this.releaseBindingHold=undefined;}
  }
  override async bindWallet(code:string,walletId:string,token:string) {
    if(this.nextBindingHold==='missing-bind'){
      this.nextBindingHold=null;this.releaseUnavailable=true;
      throw new TypeError('The RPC receiver does not implement the method "bindWallet".');
    }
    const result=await super.bindWallet(code,walletId,token);await this.holdBinding('bind');return result;
  }
  override async releaseWallet(code:string,token:string) {
    if(this.releaseUnavailable)throw new TypeError('The RPC receiver does not implement the method "releaseWallet".');
    return super.releaseWallet(code,token);
  }
  override async confirmWallet(code:string,token:string) {
    const result=await super.confirmWallet(code,token);await this.holdBinding('confirm');return result;
  }
  async expireBinding(code:string) {
    const parsed=parseRecoveryCode(code);if(!parsed)throw new Error('Invalid recovery code');
    await this.ctx.storage.transaction(async txn=>{
      const key=`identity:${parsed.playerId}`,identity=await txn.get<{binding?:{durable:boolean;claims:Record<string,number|null>}}>(key);
      if(!identity?.binding || !Object.values(identity.binding.claims).some(expiry=>expiry!==null))throw new Error('No provisional claim');
      for(const [token,expiry] of Object.entries(identity.binding.claims))if(expiry!==null)identity.binding.claims[token]=0;
      await txn.put(key,identity);
    });
  }
}

type Fault = 'none' | 'hold-before' | 'fail-before' | 'lost-reply' | 'hold-lost-reply';
const FUNDS = 20_000_000;

/** Exercise the real per-player queue against a deterministic in-memory ledger. */
async function checkpointSimulation(activeOta:boolean) {
  const world=createEmptyWorld(),player=addPlayer(world,'checkpoint','Driver');
  if(activeOta)player.delivery.ota={enabled:true,active:true,renewAt:100};
  const progress=progressFrom(player.delivery,[],{},[],world.time,0);
  const writes:DriverProgress[]=[];
  const ledger={
    async submit(intent:EconomyIntent) {
      if(intent.action.kind!=='progress')throw new Error('Unexpected checkpoint action');
      const saved=structuredClone(intent.action.progress);writes.push(saved);
      return {ok:true as const,revision:intent.revision+1,progress:saved,awards:[]};
    },
    async acknowledge() { return true; },
  };
  const socket={send(){},close(){}};
  const session=new EconomySession({} as never,ledger as never,world,player,socket as never,'driver','fence','room',0,0,progress,new Map(),new Set());
  const idle=async()=>{
    for(let i=0;i<100;i++){
      await Promise.resolve();
      if(!Reflect.get(session,'processing'))return;
    }
    throw new Error('Checkpoint simulation queue did not drain');
  };
  const tick=async(time:number,elapsed:number)=>{
    world.time=time;
    session.update(player,()=>{player.delivery.order.elapsed=elapsed;});
    await idle();
    return writes.length;
  };
  const counts=[];
  counts.push(await tick(1,1));
  counts.push(await tick(10,2));
  counts.push(await tick(20,2));
  counts.push(await tick(30,2));
  counts.push(await tick(31,2));
  if(!activeOta){
    // A paid action creates a fresh checkpoint. Advancing the order within
    // its next ten-second window must be flushed on immediate disconnect.
    world.time=31.5;session.update(player,()=>{player.delivery.cash--;});await idle();
  }
  counts.push(await tick(32,2.5));
  session.finish();await idle();
  return {counts,writes};
}

/** Hold a rejected write while timers and speculative state advance. */
async function rejectionTimerSimulation(scenario:'same'|'order'|'renewal',disconnectBeforeRejection=false) {
  const world=createEmptyWorld(),player=addPlayer(world,'rejection','Driver');
  player.delivery.order.elapsed=2;
  player.delivery.ota={enabled:true,active:true,renewAt:100};
  const progress=progressFrom(player.delivery,[],{},[],world.time,0);
  const writes:DriverProgress[]=[];
  let releaseHead=()=>{},releaseAck=()=>{},ackWaiting=false;
  const heldHead=new Promise<void>(resolve=>{releaseHead=resolve;});
  const heldAck=new Promise<void>(resolve=>{releaseAck=resolve;});
  const ledger={
    async submit(intent:EconomyIntent) {
      if(intent.action.kind!=='progress')throw new Error('Unexpected rejection test action');
      writes.push(structuredClone(intent.action.progress));
      if(writes.length===1){await heldHead;return {ok:false as const,reason:'invalid' as const};}
      return {ok:true as const,revision:intent.revision+1,progress:structuredClone(intent.action.progress),awards:[]};
    },
    async acknowledge() {
      if(!ackWaiting){ackWaiting=true;await heldAck;}
      return true;
    },
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,'driver','fence','room',0,0,progress,new Map(),new Set());
  world.time=1;
  session.update(player,()=>{player.delivery.cash--;});
  world.time=5;
  session.update(player,()=>{
    player.delivery.order.elapsed=7;
    if(scenario==='order'){player.delivery.order.stage='dropoff';player.delivery.completed++;}
    if(scenario==='renewal')player.delivery.ota.renewAt=200;
  });
  if(disconnectBeforeRejection)session.finish();
  const queuedBeforeRejection=(Reflect.get(session,'queue') as unknown[]).length;
  releaseHead();
  for(let i=0;i<100&&!ackWaiting;i++)await Promise.resolve();
  if(!ackWaiting)throw new Error('Rejected head did not reach acknowledgement');
  const after={order:structuredClone(player.delivery.order),completed:player.delivery.completed,remaining:player.delivery.ota.renewAt! - world.time};
  if(!disconnectBeforeRejection)session.finish(); // Disconnect while acknowledgement is held.
  const queued=(Reflect.get(session,'queue') as unknown[]).length;
  releaseAck();
  for(let i=0;i<100&&Reflect.get(session,'processing');i++)await Promise.resolve();
  if(Reflect.get(session,'processing'))throw new Error('Rejection simulation queue did not drain');
  return {initial:progress,after,queued,queuedBeforeRejection,writes};
}

/** Faults affect exactly the next commit to this driver's actual profile DO. */
export class DriverProfile extends ProductionDriverProfile {
  private fault: Fault = 'none';
  private held = false;
  private heldAction:EconomyIntent['action'] | undefined;
  private releaseHeld: (() => void) | undefined;
  private started = 0;
  private compactFault:'none'|'before'|'after'='none';
  private holdNextAcquire = false;
  private acquireHeld = false;
  private releaseAcquire: (()=>void)|undefined;

  async armAcquireHold() { this.holdNextAcquire=true; }
  async acquireFaultState() { return {held:this.acquireHeld}; }
  async releaseAcquireHold() { this.releaseAcquire?.(); }
  override async acquire(driverId:string,fence:string,initial:DriverProgress,roomId:string) {
    const hold=this.holdNextAcquire;this.holdNextAcquire=false;
    const acquired=await super.acquire(driverId,fence,initial,roomId);
    if(hold){
      this.acquireHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseAcquire=resolve;});}
      finally{this.acquireHeld=false;this.releaseAcquire=undefined;}
    }
    return acquired;
  }

  /** Called only with the driver disconnected; simulates an established wallet. */
  async seedFunds(cash=FUNDS) {
    if(!Number.isSafeInteger(cash)||cash<0)throw new Error('Invalid fixture cash');
    return this.ctx.storage.transaction(async txn => {
      const record = await txn.get<{progress:DriverProgress}>('driver');
      if (!record) throw new Error('No profile to fund');
      record.progress.cash = cash;
      record.progress.level = levelForCash(cash);
      await txn.put('driver', record);
      return record.progress;
    });
  }

  async armFault(fault:Fault) {
    if (this.held) throw new Error('Release the held commit before arming another fault');
    this.fault = fault;
    return { started:this.started };
  }
  async faultState() { return { started:this.started, held:this.held, heldAction:this.heldAction }; }
  async releaseFault() { this.releaseHeld?.(); }
  async inspect() { return this.ctx.storage.get('driver'); }
  async fixtureKeys() { return [...(await this.ctx.storage.list()).keys()]; }

  async armCompactFault(fault:'before'|'after') { this.compactFault=fault; }
  override async compact(intent:EconomyIntent) {
    const fault=this.compactFault;this.compactFault='none';
    if(fault==='before')throw new Error('Injected error before receipt compaction');
    await super.compact(intent);
    if(fault==='after')throw new Error('Injected error after receipt compaction');
  }
  override async commit(intent:EconomyIntent) {
    this.started++;
    const fault = this.fault;
    this.fault = 'none';
    if (fault === 'hold-before') {
      this.held = true;
      this.heldAction=structuredClone(intent.action);
      try { await new Promise<void>(resolve => { this.releaseHeld = resolve; }); }
      finally { this.held = false; this.heldAction=undefined; this.releaseHeld = undefined; }
    }
    if (fault === 'fail-before') throw new Error('Injected profile write failure');
    const result = await super.commit(intent);
    if (fault === 'hold-lost-reply') {
      this.held = true;
      this.heldAction=structuredClone(intent.action);
      try { await new Promise<void>(resolve => { this.releaseHeld = resolve; }); }
      finally { this.held = false; this.heldAction=undefined; this.releaseHeld = undefined; }
      throw new Error('Injected held lost profile reply');
    }
    if (fault === 'lost-reply') throw new Error('Injected lost profile reply');
    return result;
  }
}

/** Fault a pickup refresh after taking a real ledger snapshot. */
export class RoomEconomy extends ProductionRoomEconomy {
  private pickupFault:'none'|'hold'|'fail'='none';
  private ackFault:'none'|'hold-before'|'lost-reply'='none';
  private ackHeld=false;
  private releaseAck:(()=>void)|undefined;
  async fixtureKeys() { return [...(await this.ctx.storage.list()).keys()]; }
  private pickupHeld=false;
  private releasePickup:(()=>void)|undefined;
  async armAckFault(fault:'hold-before'|'lost-reply') { this.ackFault=fault; }
  async ackFaultState() { return {held:this.ackHeld}; }
  async releaseAckFault() { this.releaseAck?.(); }
  override async acknowledge(intent:EconomyIntent) {
    const fault=this.ackFault;this.ackFault='none';
    if(fault==='hold-before'){
      this.ackHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseAck=resolve;});}
      finally{this.ackHeld=false;this.releaseAck=undefined;}
    }
    const acknowledged=await super.acknowledge(intent);
    if(fault==='lost-reply')throw new Error('Injected lost acknowledgement reply');
    return acknowledged;
  }
  async armPickupFault(fault:'hold'|'fail') { this.pickupFault=fault; }
  async pickupFaultState() { return {held:this.pickupHeld}; }
  async releasePickupFault() { this.releasePickup?.(); }
  override async pickupStates(ids:string[]) {
    const fault=this.pickupFault;this.pickupFault='none';
    if(fault==='fail')throw new Error('Injected pickup state read failure');
    const snapshot=await super.pickupStates(ids);
    if(fault==='hold'){
      this.pickupHeld=true;
      try{await new Promise<void>(resolve=>{this.releasePickup=resolve;});}
      finally{this.pickupHeld=false;this.releasePickup=undefined;}
    }
    return snapshot;
  }
}

/** Deterministic positioning while all rewards and purchases use real game logic. */
export class GameRoom extends ProductionGameRoom {
  private fixtureLive=new Set<string>();
  private measuring=false;
  private measureStart:{wall:number;world:number;tick:number}|null=null;
  private measuredTicks:number[]=[];
  private droppedTicks=0;
  private maxQueue=0;
  constructor(ctx:DurableObjectState,env:ConstructorParameters<typeof ProductionGameRoom>[1]) {
    super(ctx,env);
    const tick=Reflect.get(this,'tick') as ()=>void;
    Reflect.set(this,'tick',()=>{
      if(!this.measuring)return tick.call(this);
      const start=performance.now();
      try{tick.call(this);}finally{
        const elapsed=performance.now()-start;
        if(this.measuredTicks.length<1500)this.measuredTicks.push(elapsed);else this.droppedTicks++;
        const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{economy:object}>;
        for(const session of sessions.values())this.maxQueue=Math.max(this.maxQueue,(Reflect.get(session.economy,'queue') as unknown[]).length);
      }
    });
  }
  async fixtureMeasure(action:'start'|'stop') {
    const world=Reflect.get(this,'world') as World;
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:object}>;
    if(action==='start'){
      if(this.measuring||sessions.size!==5)throw new Error('Measurement needs exactly five connected clients');
      this.measuredTicks=[];this.droppedTicks=0;this.maxQueue=0;
      this.measureStart={wall:performance.now(),world:world.time,tick:Reflect.get(this,'tickCount') as number};
      this.measuring=true;return {started:true};
    }
    if(!this.measuring||!this.measureStart)throw new Error('No active measurement');
    this.measuring=false;
    return {wallMs:performance.now()-this.measureStart.wall,worldSeconds:world.time-this.measureStart.world,
      tickCount:(Reflect.get(this,'tickCount') as number)-this.measureStart.tick,players:sessions.size,
      ticksMs:this.measuredTicks,droppedTicks:this.droppedTicks,maxQueue:this.maxQueue};
  }
  async fixtureQueues() {
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:object}>;
    return [...sessions.values()].map(session=>({playerId:session.id,queued:(Reflect.get(session.economy,'queue') as unknown[]).length,
      processing:Reflect.get(session.economy,'processing') as boolean}));
  }
  async fixtureSetLive(driverId:string,fence:string,live:boolean) {
    const key=`${driverId}:${fence}`;
    if(live)this.fixtureLive.add(key);else this.fixtureLive.delete(key);
  }
  override async freezeWallet(driverId:string,fence:string) {
    this.fixtureLive.delete(`${driverId}:${fence}`);
    return super.freezeWallet(driverId,fence);
  }
  override async hasWallet(driverId:string,fence:string) {
    return this.fixtureLive.has(`${driverId}:${fence}`) || await super.hasWallet(driverId,fence);
  }
  private fixturePlace(playerId:string, x:number, z:number) {
    const world = Reflect.get(this, 'world') as World;
    const player = world.players.find(candidate => candidate.id === playerId);
    const car = world.entities.find(entity => entity.id === player?.entityId);
    if (!car) throw new Error('Test driver not in room');
    Object.assign(car, { x, z, y:terrainHeight(x, z) ?? 0, vx:0, vy:0, vz:0, speed:0, pushX:0, pushZ:0, supportId:'ground' });
    return {x,z};
  }
  async fixtureShowroom(playerId:string, side:number) {
    return this.fixturePlace(playerId,LUXURY_SHOWROOM.arrival.x + side * 5,LUXURY_SHOWROOM.arrival.z);
  }
  /** Emulate many distinct income ticks without bypassing the room queue. */
  async fixtureQueueIncome(playerId:string,count:number) {
    const world=Reflect.get(this,'world') as World;
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:{update:(player:any,apply:()=>void)=>void}}>;
    const session=[...sessions.values()].find(candidate=>candidate.id===playerId);
    const player=world.players.find(candidate=>candidate.id===playerId);
    if(!session||!player)throw new Error('Test driver not in room');
    const before=Reflect.get(session.economy,'submitted') as number;
    for(let i=0;i<count;i++)session.economy.update(player,()=>{player.delivery.cash++;player.delivery.lifetimeIncome++;});
    return {accepted:(Reflect.get(session.economy,'submitted') as number)-before,queued:(Reflect.get(session.economy,'queue') as unknown[]).length};
  }
  async fixturePlayers() {
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:{walletId:string}}>;
    return [...sessions.values()].map(session=>({playerId:session.id,driverId:session.economy.walletId}));
  }
  async fixtureSupplyPickup(playerId:string,pickupId:string) {
    const world=Reflect.get(this,'world') as World;
    const pickup=world.pickups.find(candidate=>candidate.id===pickupId && candidate.kind!=='rocket');
    if(!pickup || !pickup.active)throw new Error('Test supply pickup is not available');
    return this.fixturePlace(playerId,pickup.x,pickup.z);
  }
  async fixtureRocketPickup(playerId:string,pickupId:string) {
    const world=Reflect.get(this,'world') as World;
    const pickup=world.pickups.find(candidate=>candidate.id===pickupId && candidate.kind==='rocket');
    if(!pickup || !pickup.active)throw new Error('Test rocket pickup is not available');
    const position=this.fixturePlace(playerId,pickup.x,pickup.z);
    const player=world.players.find(candidate=>candidate.id===playerId);
    const car=world.entities.find(entity=>entity.id===player?.entityId);
    if(!car)throw new Error('Test driver not in room');
    car.air=40;
    return position;
  }
  async fixturePickupState(pickupId:string) {
    const world=Reflect.get(this,'world') as World;
    const pickup=world.pickups.find(candidate=>candidate.id===pickupId);
    const generations=Reflect.get(this,'pickupGenerations') as Map<string,number>;
    return {pickup,generation:generations.get(pickupId)};
  }
  async fixtureRefreshPickups() {
    const refresh=Reflect.get(this,'refreshPickups') as ()=>Promise<void>;
    void refresh.call(this);
    return {ok:true};
  }
  async fixtureWorkshop(playerId:string,shopIndex=4) {
    const shop=SHOPS[shopIndex];if(!shop)throw new Error('Unknown test workshop');
    return this.fixturePlace(playerId,shop.x,shop.z);
  }
  async fixtureDeliveryPickup(playerId:string) {
    const world = Reflect.get(this, 'world') as World;
    const player = world.players.find(candidate => candidate.id === playerId);
    if (!player || player.delivery.order.stage !== 'pickup') throw new Error('Test driver has no pickup');
    const target=orderTarget(player.delivery.order);
    return this.fixturePlace(playerId,target.x,target.z);
  }
}

type TestEnv = {
  ROOMS:DurableObjectNamespace<GameRoom>;
  CHAT:DurableObjectNamespace<GlobalChat>;
  DRIVERS:DurableObjectNamespace<DriverProfile>;
  ECONOMIES:DurableObjectNamespace<RoomEconomy>;
};
export default {
  async fetch(request:Request, env:TestEnv, ctx:ExecutionContext):Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/__wallet-test/')) return worker.fetch(request, env as never, ctx);
    if (request.method !== 'POST') return new Response('POST required', { status:405 });
    const body = await request.json() as {driverId:string;fence:string;eventId:string;intent:EconomyIntent;fault:Fault;room:string;playerId:string;side:number;code:string;token:string;bindingStage:'bind'|'confirm'|'lost-bind'|'lost-confirm'|'missing-bind'|'restore';pickupId:string;pickupFault:'hold'|'fail';compactFault:'before'|'after';ackFault:'hold-before'|'lost-reply';count:number;seedCash?:number;shopIndex?:number};
    const driver = env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId || 'unused'));
    const economy = env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room || 'fixture'));
    switch (url.pathname) {
      case '/__wallet-test/checkpoint-simulation': {
        return Response.json({paused:await checkpointSimulation(false),active:await checkpointSimulation(true)});
      }
      case '/__wallet-test/rejection-simulation': {
        return Response.json({same:await rejectionTimerSimulation('same'),order:await rejectionTimerSimulation('order'),renewal:await rejectionTimerSimulation('renewal'),closedSame:await rejectionTimerSimulation('same',true),closedOrder:await rejectionTimerSimulation('order',true)});
      }
      case '/__wallet-test/associate': {
        const chat=env.CHAT.get(env.CHAT.idFromName('global'));
        const token=crypto.randomUUID(),result=await chat.bindWallet(body.code,body.driverId,token);
        if(result?.claim && await chat.confirmWallet(body.code,token))await chat.settleWallet(body.code,token);
        return Response.json(result);
      }
      case '/__wallet-test/binding-begin': return Response.json(await env.CHAT.get(env.CHAT.idFromName('global')).bindWallet(body.code,body.driverId,body.token));
      case '/__wallet-test/binding-confirm': return Response.json(await env.CHAT.get(env.CHAT.idFromName('global')).confirmWallet(body.code,body.token));
      case '/__wallet-test/binding-release': await env.CHAT.get(env.CHAT.idFromName('global')).releaseWallet(body.code,body.token);return Response.json({ok:true});
      case '/__wallet-test/binding-expire': await env.CHAT.get(env.CHAT.idFromName('global')).expireBinding(body.code);return Response.json({ok:true});
      case '/__wallet-test/binding-arm': await env.CHAT.get(env.CHAT.idFromName('global')).armBindingHold(body.bindingStage);return Response.json({ok:true});
      case '/__wallet-test/binding-state': return Response.json(await env.CHAT.get(env.CHAT.idFromName('global')).bindingFaultState());
      case '/__wallet-test/binding-resume': await env.CHAT.get(env.CHAT.idFromName('global')).releaseBinding();return Response.json({ok:true});
      case '/__wallet-test/players': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixturePlayers());
      }
      case '/__wallet-test/queue-income': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureQueueIncome(body.playerId,body.count));
      }
      case '/__wallet-test/measurement-start': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));return Response.json(await room.fixtureMeasure('start'));
      }
      case '/__wallet-test/measurement-stop': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));return Response.json(await room.fixtureMeasure('stop'));
      }
      case '/__wallet-test/queues': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));return Response.json(await room.fixtureQueues());
      }
      case '/__wallet-test/position': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureShowroom(body.playerId,body.side));
      }
      case '/__wallet-test/workshop': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureWorkshop(body.playerId,body.shopIndex));
      }
      case '/__wallet-test/delivery-pickup': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureDeliveryPickup(body.playerId));
      }
      case '/__wallet-test/supply-pickup': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureSupplyPickup(body.playerId,body.pickupId));
      }
      case '/__wallet-test/rocket-pickup': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureRocketPickup(body.playerId,body.pickupId));
      }
      case '/__wallet-test/pickup-state': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixturePickupState(body.pickupId));
      }
      case '/__wallet-test/refresh-pickups': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        return Response.json(await room.fixtureRefreshPickups());
      }
      case '/__wallet-test/producer-gone': {
        const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
        await room.fixtureSetLive(body.driverId,body.fence,false);return Response.json({ok:true});
      }
      case '/__wallet-test/arm-pickups': await economy.armPickupFault(body.pickupFault); return Response.json({ok:true});
      case '/__wallet-test/pickup-fault-state': return Response.json(await economy.pickupFaultState());
      case '/__wallet-test/release-pickups': await economy.releasePickupFault(); return Response.json({ok:true});
      case '/__wallet-test/acquire': {
        const initial = progressFrom(initialDelivery({x:0,z:0}), [], {}, [], 0, 0);
        initial.cash=FUNDS; initial.level=levelForCash(FUNDS);
        const roomId=body.room || 'fixture';
        const acquired=await driver.acquire(body.driverId, body.fence, initial, roomId);
        const room=env.ROOMS.get(env.ROOMS.idFromName(roomId));
        await room.fixtureSetLive(body.driverId,body.fence,true);
        return Response.json(acquired);
      }
      case '/__wallet-test/fund': return Response.json(await driver.seedFunds(body.seedCash));
      case '/__wallet-test/inspect': return Response.json(await driver.inspect() ?? null);
      case '/__wallet-test/profile-keys': return Response.json(await driver.fixtureKeys());
      case '/__wallet-test/economy-keys': return Response.json(await economy.fixtureKeys());
      case '/__wallet-test/commit': return Response.json(await driver.commit(body.intent));
      case '/__wallet-test/arm-acquire': await driver.armAcquireHold(); return Response.json({ok:true});
      case '/__wallet-test/acquire-fault-state': return Response.json(await driver.acquireFaultState());
      case '/__wallet-test/release-acquire': await driver.releaseAcquireHold(); return Response.json({ok:true});
      case '/__wallet-test/arm': return Response.json(await driver.armFault(body.fault));
      case '/__wallet-test/arm-compact': await driver.armCompactFault(body.compactFault); return Response.json({ok:true});
      case '/__wallet-test/fault-state': return Response.json(await driver.faultState());
      case '/__wallet-test/release': await driver.releaseFault(); return Response.json({ok:true});
      case '/__wallet-test/submit': return Response.json(await economy.submit(body.intent));
      case '/__wallet-test/arm-ack': await economy.armAckFault(body.ackFault); return Response.json({ok:true});
      case '/__wallet-test/ack-fault-state': return Response.json(await economy.ackFaultState());
      case '/__wallet-test/release-ack': await economy.releaseAckFault(); return Response.json({ok:true});
      case '/__wallet-test/ack': {
        try { return Response.json({ok:await economy.acknowledge(body.intent)}); }
        catch { return Response.json({threw:true}); }
      }
      case '/__wallet-test/status': return Response.json(await economy.status(body.eventId));
      case '/__wallet-test/pending': return Response.json(await economy.pending());
      case '/__wallet-test/freeze': await economy.freeze(body.driverId, body.fence); return Response.json({ok:true});
      default: return new Response('Unknown fixture route', { status:404 });
    }
  },
};
