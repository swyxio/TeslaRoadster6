import { DurableObject } from 'cloudflare:workers';
import { RoomClock } from './room-clock';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, NEUTRAL, NoSpawnError, chooseVehicle, teleportPlayer, buyUpgrade, buyVehicleStyle, subscribeOta, toggleAutopilot, addPlayer, createWorld, dispatchCybercab, retireCybercab, MAX_DISPATCHED_CABS_PER_ROOM, interact, parkingAction, raceAction, enterMinigame, setDestination, setDeliveryDestination, removePlayer, resetPlayer, step, travelDome, type Entity, type Input } from '../shared/game';
import { planCybercabDispatch } from '../shared/cybercabs';
import { ScheduledInput, type EdgeBaseline, type EdgeOutcome } from '../shared/tick-input';
import { parseMessage, roomCapacity, roomSlug, type ClientMessage } from './protocol';
import { prepareSnapshots, snapshotFor } from './snapshot';
import { GlobalChat } from './global-chat';
import { chooseAvailableName } from './global-chat-core';
import { radioFeed } from './radio';
import { MARS_GOAL } from '../shared/mars';
import { playtestMode, prepareSandboxDriver, sandboxWallet, type PlaytestMode } from '../shared/playtest';
import { VEHICLE_IDS } from '../shared/vehicles';
import { initialDelivery } from '../shared/delivery';
import { prepareNavigationGraph } from '../shared/navigation';
import { EconomySession } from './economy-session';
import { DriverProfile, GlobalIncome, progressFrom, type DriverProgress } from './driver-profile';
import { RoomEconomy } from './room-economy';
import { GlobalEarningsEvent } from './global-earnings-event';
import { scheduleGlobalEarnings } from './global-earnings-admin';
import { activityPayout, earningsMultiplier, globalWindowsForInstant, ROOM_WIN_DURATION_MS, type EarningsEvents, type EarningsWindow, type GlobalEventLease } from '../shared/earnings-events';
import type { RoomEventCursor } from './room-earnings-events';
import { leaveParking } from '../shared/parking';
import { resetAchievementFlight } from '../shared/achievements';
import { PROPERTY_HOME_SPAWNS, propertyRoomAssetId } from '../shared/property';
import { MarketService } from './market-service';
import { captureMarketHold, restoreMarketHold, withMarketHolds, type MarketHold } from './market-hold';
import type { MarketPaint } from '../shared/market-protocol';
import { captureAmbientNpcCars } from './vehicle-takeover';

export { GlobalChat, DriverProfile, GlobalIncome, RoomEconomy, GlobalEarningsEvent, MarketService };

type Env = { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<GameRoom>; CHAT: DurableObjectNamespace<GlobalChat>; DRIVERS: DurableObjectNamespace<DriverProfile>; ECONOMIES: DurableObjectNamespace<RoomEconomy>; INCOME: DurableObjectNamespace<GlobalIncome>; GLOBAL_EVENTS: DurableObjectNamespace<GlobalEarningsEvent>; MARKET:DurableObjectNamespace<MarketService>; STARSHIP_ADMIN_TOKEN?:string; MAX_PLAYERS?: string };
type CabMessage=Extract<ClientMessage,{type:'cab'}>;
type Session = { id:string; lastMessage:number; windowStart:number; count:number; lastAction:number; control:ScheduledInput; poseRevision:number; economy:EconomySession|null; syncToken:number; identityTail:Promise<void>; attachPending:boolean; guest:boolean; identitySequence:number; pendingBind:{driverId:string;fence:string}|null;cabHighWater:number;cabRequests:Map<number,{payload:string;reply:string|null}>;marketHold:MarketHold|null };
type ControlledPose = {id:string;x:number;y:number;z:number;yaw:number;pitch:number;roll:number};
type PendingRoomWin = {event_id:string;requested_at:number;room_id:string};
type RoomEarningsSnapshot = {observedAt:number;events:EarningsEvents;lease:GlobalEventLease};
const ROOM_EARNINGS_STALE_MS=5_000;
const reply = (body: string, status: number) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
// Public overflow rooms cannot collide with existing player-chosen slugs.
function roomIdentity(path:string):string|null {
  const named=roomSlug(path);
  if(named)return named;
  const publicRoom=/^\/api\/public-room\/([1-9]|1[0-6])$/.exec(path);
  return publicRoom?`public:${publicRoom[1]}`:null;
}
function validRoomIdentity(id:string):boolean {
  return roomSlug(`/api/room/${id}`)===id ||
    (id.startsWith('public:') && roomIdentity(`/api/public-room/${id.slice(7)}`)===id);
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/api/radio/')) return radioFeed(request, ctx);
    if (url.pathname === '/api/health') return Response.json({ ok: true, version: PROTOCOL_VERSION, capacity: roomCapacity(env.MAX_PLAYERS) });
    if (url.pathname === '/api/admin/earnings-events') return scheduleGlobalEarnings(request,env);
    if (url.pathname === '/api/starship/status' || url.pathname === '/api/starship/contributors'){
      if(request.method!=='GET')return reply('GET required',405);
      const income=env.INCOME.get(env.INCOME.idFromName('global'));
      try{
        if(url.pathname.endsWith('/status'))return Response.json({status:await income.status(),serverTime:Date.now()},{headers:{'Cache-Control':'no-store'}});
        const group=url.searchParams.get('group')??'at-goal',cursor=url.searchParams.get('cursor');
        if(group!=='at-goal'&&group!=='later')return reply('Invalid contributor group',400);
        const page=await income.contributors(group,cursor??undefined);
        return Response.json(page,{headers:{'Cache-Control':'no-store'}});
      }catch(error){
        if(error instanceof Error&&error.message==='Invalid contributor cursor')return reply('Invalid contributor cursor',400);
        return reply('Starship service unavailable',503);
      }
    }
    const roomId = roomIdentity(url.pathname);
    const chat = url.pathname === '/api/chat';
    if (!roomId && !chat) return reply('Unknown API route. Room names use 1–32 lowercase letters, digits, or hyphens.', 404);
    if (request.method !== 'GET') return reply('GET required', 405);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return reply('WebSocket upgrade required', 426);
    const origin = request.headers.get('Origin');
    // Non-browser clients may omit Origin. This is a public sandbox, not authentication.
    if (origin && origin !== url.origin) return reply('Cross-origin connections are not allowed', 403);
    if (chat) return env.CHAT.get(env.CHAT.idFromName('global')).fetch(request);
    return env.ROOMS.get(env.ROOMS.idFromName(roomId!)).fetch(request);
  },
} satisfies ExportedHandler<Env>;

// Physics stays room-local; economy writes are isolated per player.
export class GameRoom extends DurableObject<Env> {
  private world=createWorld(Math.floor(Math.random()*VEHICLE_IDS.length));
  private sessions=new Map<WebSocket,Session>();
  private inputs=new Map<string,Input>();
  private draining=new Map<string,EconomySession>();
  private timer:ReturnType<typeof setTimeout>|null=null;
  private tickCount=0;
  private roomEpoch=crypto.randomUUID();
  private lastSubsteps=1;
  private roomId='';
  private ready:Promise<void>|null=null;
  private pickupGenerations=new Map<string,number>();
  private pendingPickups=new Set<string>();
  private nextRefresh=0;
  private refreshing=false;
  private earningsSnapshot:RoomEarningsSnapshot|null=null;
  private earningsGeneration=0;
  private lastEarningsFailureLog=0;
  private winFlight:Promise<void>|null=null;
  private hasPendingWin=false;
  private winJournalGeneration=0;
  private propertyRefreshing=false;
  private propertyRevision=0;

  private playtest:PlaytestMode=null;
  private ledger(){return this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(this.roomId));}
  private initWinStorage(){
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS game_room_pending_wins (event_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, room_id TEXT NOT NULL)');
    this.hasPendingWin=this.pendingWins().length>0;
  }
  private pendingWins():PendingRoomWin[]{
    return this.ctx.storage.sql.exec<PendingRoomWin>('SELECT event_id,requested_at,room_id FROM game_room_pending_wins ORDER BY requested_at,event_id').toArray();
  }
  /**
   * Resolve a cab interval only after the room's own win journal has drained.
   * New wins invalidate an in-flight observation; the caller retries rather
   * than consuming a history page which could precede a journalled win.
   */
  async cabEarningsHistory(roomId:string,fromMs:number,toMs:number):Promise<EarningsWindow[]>{
    if(!validRoomIdentity(roomId) || !this.ctx.id.equals(this.env.ROOMS.idFromName(roomId)))
      throw new Error('Room history identity mismatch');
    if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs<0||toMs<fromMs||toMs>Date.now())
      throw new RangeError('Room history must be a past interval');
    this.initWinStorage();
    if(this.pendingWins().length){
      // The retry flight catches publish errors; the journal, not the flight's
      // completion, is the evidence that a win really reached RoomEconomy.
      this.ctx.waitUntil(this.resumeWins());
      throw new Error('Room win is awaiting publication');
    }
    const generation=this.winJournalGeneration;
    const economy=this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(roomId));
    const windows:EarningsWindow[]=[];
    let cursor:RoomEventCursor|undefined;
    do{
      const page=await economy.earningsHistory(fromMs,toMs,cursor);
      if(this.winJournalGeneration!==generation||this.pendingWins().length)
        throw new Error('Room win changed during history observation');
      windows.push(...page.windows);
      cursor=page.next??undefined;
    }while(cursor);
    return windows;
  }
  private publishEarningsStatus(){
    const now=Date.now(),snapshot=this.earningsSnapshot;
    let payload:unknown={type:'earningsStatus',events:null,serverTime:now,validForMs:0};
    if(snapshot&&now>=snapshot.observedAt&&now-snapshot.observedAt<ROOM_EARNINGS_STALE_MS&&now>=snapshot.lease.issuedAtMs&&now<snapshot.lease.validUntilMs){
      payload={type:'earningsStatus',events:snapshot.events,serverTime:now,
        validForMs:Math.min(ROOM_EARNINGS_STALE_MS-(now-snapshot.observedAt),snapshot.lease.validUntilMs-now)};
    }
    const encoded=JSON.stringify(payload);
    for(const [socket] of this.sessions)try{socket.send(encoded);}catch{this.disconnect(socket);}
  }
  private rate(atMs:number):{events:EarningsEvents;multiplier:1|1.5|2|3;atMs:number}|null{
    const snapshot=this.earningsSnapshot;
    if(!snapshot||atMs<snapshot.observedAt||atMs-snapshot.observedAt>=ROOM_EARNINGS_STALE_MS||this.hasPendingWin)return null;
    try{
      const events={room:snapshot.events.room,global:globalWindowsForInstant(snapshot.lease,atMs)};
      return {events,multiplier:earningsMultiplier(events,atMs).multiplier,atMs};
    }catch{return null;}
  }
  private async refreshEarnings(){
    if(!this.roomId||this.hasPendingWin){this.earningsSnapshot=null;this.publishEarningsStatus();return;}
    const observedAt=Date.now(),generation=this.earningsGeneration,roomId=this.roomId;
    let source='validation',receivedLease:GlobalEventLease|undefined;
    try{
      const [roomUntil,lease]=await Promise.all([
        this.ledger().earningsAt(observedAt).catch(error=>{source='room';throw error;}),
        this.env.GLOBAL_EVENTS.get(this.env.GLOBAL_EVENTS.idFromName('global')).lease().catch(error=>{source='global';throw error;}),
      ]);
      receivedLease=lease;
      const receivedAt=Date.now();
      // A remote DO can issue its lease ahead of this callback's cached clock.
      // Yield to a timer rather than discarding it or paying before it begins.
      // Never wait past our existing room-observation freshness budget.
      if(lease.issuedAtMs>receivedAt&&lease.issuedAtMs<observedAt+ROOM_EARNINGS_STALE_MS)
        await new Promise(resolve=>setTimeout(resolve,lease.issuedAtMs-receivedAt));
      if(generation!==this.earningsGeneration||roomId!==this.roomId||this.hasPendingWin)return;
      const room=roomUntil===null?[]:[{startsAtMs:roomUntil-ROOM_WIN_DURATION_MS,endsAtMs:roomUntil}];
      const now=Date.now();globalWindowsForInstant(lease,now);
      this.earningsSnapshot={observedAt,lease,events:{room,global:lease.windows}};
    }catch(error){
      if(generation===this.earningsGeneration)this.earningsSnapshot=null;
      const now=Date.now();
      if(now-this.lastEarningsFailureLog>=30_000){
        this.lastEarningsFailureLog=now;
        // No driver, room name, recovery code or wallet data in diagnostics.
        console.warn('earnings-refresh-failed',{source,reason:error instanceof Error?error.message.slice(0,160):'Unknown error',
          observedAt,now,issuedAtMs:receivedLease?.issuedAtMs,validUntilMs:receivedLease?.validUntilMs});
      }
    }
    this.publishEarningsStatus();
  }
  private resumeWins():Promise<void>{
    if(this.winFlight)return this.winFlight;
    const flight=(async()=>{
      // Arm before remote work; a crash or lost reply leaves the local journal retryable.
      await this.ctx.storage.setAlarm(Date.now()+1000);
      do{
        for(let win=this.pendingWins()[0];win;win=this.pendingWins()[0]){
          const economy=this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(win.room_id));
          const published=await economy.recordEarningsWinWithoutPayout(win.event_id,win.requested_at);
          // A same-millisecond observation can place the win one millisecond
          // later. Do not resume payouts from a snapshot taken before it starts.
          while(Date.now()<published.startsAtMs)await new Promise(resolve=>setTimeout(resolve,Math.min(50,published.startsAtMs-Date.now())));
          this.ctx.storage.sql.exec('DELETE FROM game_room_pending_wins WHERE event_id=?',win.event_id);
        }
        this.hasPendingWin=false;
        this.earningsGeneration++;this.earningsSnapshot=null;
        if(this.sessions.size)await this.refreshEarnings();
      }while(this.hasPendingWin);
    })().catch(async()=>{
      this.earningsSnapshot=null;this.publishEarningsStatus();
      try{await this.ctx.storage.setAlarm(Date.now()+1000);}catch{}
    });
    this.winFlight=flight;
    void flight.finally(()=>{if(this.winFlight===flight)this.winFlight=null;}).catch(()=>{});
    return flight;
  }
  private recordWin(requestedAt=Date.now()){
    const eventId=crypto.randomUUID();
    this.winJournalGeneration++;
    this.earningsGeneration++;this.earningsSnapshot=null;this.hasPendingWin=true;
    this.ctx.storage.sql.exec('INSERT INTO game_room_pending_wins (event_id,requested_at,room_id) VALUES (?,?,?)',eventId,requestedAt,this.roomId);
    // Queue the watchdog in the same synchronous write batch as the journal,
    // before sending anything or awaiting remote work.
    const watchdog=this.ctx.storage.setAlarm(Date.now()+1000);
    this.publishEarningsStatus();this.ctx.waitUntil(watchdog.then(()=>this.resumeWins()));
  }
  async alarm():Promise<void>{
    this.initWinStorage();
    if(this.hasPendingWin){await this.ctx.storage.setAlarm(Date.now()+1000);await this.resumeWins();}
  }
  private async initializeRoom(world=this.world){
    // Static route geometry is prepared before the room's first simulation tick.
    prepareNavigationGraph();
    if(this.playtest)return;
    this.initWinStorage();
    if(this.pendingWins().length)this.ctx.waitUntil(this.resumeWins());
    // The pre-wallet room fund remains in its original object and is never
    // rewritten; the journal seeds its own balance once before accepting gifts.
    const stored=await this.ctx.storage.get<number>('mars-fund');
    if(stored!==undefined&&(!Number.isSafeInteger(stored)||stored<0||stored>MARS_GOAL))throw new Error('Invalid legacy room fund');
    const [,balance]=await Promise.all([this.refreshPickups(world),this.ledger().initializeRoomFund(stored??0)]);
    if(world===this.world)world.mars.roomFund=Math.max(world.mars.roomFund,balance);
  }
  private async refreshPickups(world=this.world){
    const ids=world.pickups.filter(p=>p.kind!=='rocket').map(p=>p.id);
    const states=await this.ledger().pickupStates(ids);
    if(world!==this.world)return;
    for(const pickup of world.pickups){
      if(pickup.kind==='rocket'||this.pendingPickups.has(pickup.id))continue;
      const state=states[pickup.id];if(!state)continue;
      // A slow read must not undo a claim finalized since the read started.
      const observed=this.pickupGenerations.get(pickup.id)??0;
      if(state.generation<observed)continue;
      this.pickupGenerations.set(pickup.id,state.generation);
      if(state.eventId){pickup.active=false;pickup.readyAt=Infinity;}
      else if(state.readyAt>Date.now()){pickup.active=false;pickup.readyAt=world.time+(state.readyAt-Date.now())/1000;}
      else {pickup.active=true;pickup.readyAt=undefined;}
    }
  }
  private refresh(){
    if(this.playtest||this.refreshing||!this.roomId)return;
    this.refreshing=true;const world=this.world;
    void Promise.allSettled([
      this.refreshPickups(world),
      this.env.INCOME.get(this.env.INCOME.idFromName('global')).total().then(total=>{if(world===this.world)world.mars.fund=Math.min(MARS_GOAL,total);}),
      this.ledger().roomFund().then(balance=>{if(world===this.world)world.mars.roomFund=Math.max(world.mars.roomFund,balance);}),
      this.refreshEarnings(),
    ]).finally(()=>{this.refreshing=false;});
    if(propertyRoomAssetId(this.roomId))void this.refreshProperty(world);
  }

  private async property(assetId:string){
    let timer:ReturnType<typeof setTimeout>|undefined;
    const operation=this.env.MARKET.get(this.env.MARKET.idFromName('global')).property(assetId);
    try{return await Promise.race([
      operation,
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Property registry timed out')),3000);}),
    ]);}finally{
      if(timer!==undefined)clearTimeout(timer);
      const dispose=Reflect.get(operation,Reflect.get(Symbol,'dispose') as symbol);
      if(typeof dispose==='function')Reflect.apply(dispose,operation,[]);
    }
  }
  private async refreshProperty(world:typeof this.world){
    const assetId=propertyRoomAssetId(this.roomId);if(!assetId||this.propertyRefreshing)return;
    this.propertyRefreshing=true;
    try{
      const result=await this.property(assetId);if(world!==this.world)return;
      if(result.status==='available'&&result.property.completedHome&&result.property.revision>=this.propertyRevision){
        this.propertyRevision=result.property.revision;world.property={assetId,ownerName:result.property.ownerName};
      }else if(result.status!=='available'||!result.property.completedHome)world.property=null;
    }catch{if(world===this.world)world.property=null;}
    finally{this.propertyRefreshing=false;}
  }

  async fetch(request:Request):Promise<Response>{
    const capacity=roomCapacity(this.env.MAX_PLAYERS);
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    server.accept();
    const close=(code:number,reason:string)=>{server.close(code,reason);return new Response(null,{status:101,webSocket:client});};
    const roomId=roomIdentity(new URL(request.url).pathname);
    const full=()=>{console.info('room_full',{kind:roomId==='bay'?'bay':roomId?.startsWith('public:')?'public-overflow':'named',overflow:roomId?.startsWith('public:')?Number(roomId.slice(7)):undefined});return close(ROOM_FULL_CODE,'Room full');};
    if(this.sessions.size>=capacity)return full();
    if(!roomId)return close(1008,'Invalid room');
    let property:Awaited<ReturnType<GameRoom['property']>>|null=null;
    const assetId=propertyRoomAssetId(roomId);
    if(assetId){
      try{property=await this.property(assetId);}catch{return close(1011,'Property service unavailable. Retry or return to Bay.');}
      if(property.status==='unavailable')return close(1011,'Property service unavailable. Retry or return to Bay.');
      if(property.status!=='available'||!property.property.completedHome)return close(1008,'Property not found. Return to Bay.');
    }
    this.roomId=roomId;this.playtest=playtestMode(roomId);
    const world=this.world;
    if(property?.status==='available'&&property.property.revision>=this.propertyRevision){
      this.propertyRevision=property.property.revision;world.property={assetId:property.property.assetId,ownerName:property.property.ownerName};
    }
    this.ready??=this.initializeRoom(world);
    const walletId=crypto.randomUUID(),fence=crypto.randomUUID();
    const initial=initialDelivery({x:0,z:0});
    let acquired:Awaited<ReturnType<DriverProfile['acquire']>>|null=null;
    try{
      if(!this.playtest)[acquired]=await Promise.all([
        this.env.DRIVERS.get(this.env.DRIVERS.idFromName(walletId)).acquire(walletId,fence,progressFrom(initial,[],{},[],0,initial.lifetimeIncome),roomId),
        this.ready,
      ]);
    }catch{this.ready=null;return close(1011,'Wallet unavailable. Rejoin to retry.');}
    if(this.world!==world){this.ready=null;try{await(this.ready=this.initializeRoom(this.world));}catch{this.ready=null;return close(1011,'Room unavailable');}}
    if(this.sessions.size>=capacity)return full();
    const id=crypto.randomUUID(),now=Date.now();
    let player;
    try{player=addPlayer(this.world,id,chooseAvailableName('Driver',this.world.players.map(p=>p.name)),property?.status==='available'?PROPERTY_HOME_SPAWNS:undefined);}
    catch(error){if(!(error instanceof NoSpawnError))throw error;return close(ROOM_NO_SPAWN_CODE,'No safe starting space');}
    const economy=acquired?new EconomySession(this.env,this.ledger(),this.world,player,server,walletId,fence,roomId,acquired.revision,acquired.sequence,acquired.progress,this.pickupGenerations,this.pendingPickups,acquired.marketPaint):null;
    if(this.playtest==='sandbox')prepareSandboxDriver(this.world,id);
    const control=new ScheduledInput({...NEUTRAL});
    const session:Session={id,lastMessage:now,windowStart:now,count:0,lastAction:0,control,poseRevision:0,economy,syncToken:0,identityTail:Promise.resolve(),attachPending:!!economy,guest:!economy,identitySequence:0,pendingBind:null,cabHighWater:0,cabRequests:new Map(),marketHold:null};
    this.sessions.set(server,session);
    server.addEventListener('message',event=>{void this.onMessage(server,event.data);});
    server.addEventListener('close',()=>this.disconnect(server));
    server.addEventListener('error',()=>this.disconnect(server));
    server.send(JSON.stringify({type:'welcome',id,playtestMode:this.playtest,version:PROTOCOL_VERSION,capacity,tick:this.tickCount,roomEpoch:this.roomEpoch,substeps:this.lastSubsteps,poseRevision:0}));
    server.send(JSON.stringify({type:'state',world:snapshotFor(this.world,id),tick:this.tickCount,roomEpoch:this.roomEpoch,substeps:this.lastSubsteps,poseRevision:0,control:control.snapshot()}));
    economy?.initialWallet();this.refresh();
    if(this.timer===null)this.startTicks();
    return new Response(null,{status:101,webSocket:client});
  }

  /** Called by the driver's profile before replacing the old fence. */
  async hasWallet(driverId:string,fence:string):Promise<boolean>{
    return this.draining.has(`${driverId}:${fence}`)||[...this.sessions.values()].some(s=>
      (s.economy?.walletId===driverId&&s.economy?.currentFence===fence)||
      (s.pendingBind?.driverId===driverId&&s.pendingBind.fence===fence));
  }
  async freezeWallet(driverId:string,fence:string):Promise<void>{
    const matches=[...this.sessions.entries()].filter(([,s])=>
      (s.economy?.walletId===driverId&&s.economy?.currentFence===fence)||
      (s.pendingBind?.driverId===driverId&&s.pendingBind.fence===fence));
    for(const [socket] of matches)this.disconnect(socket,1008,'Driver opened in another room.');
    const detached=this.draining.get(`${driverId}:${fence}`);
    await Promise.all([...matches.map(([,s])=>s.economy?.freeze()),...(detached?[detached.freeze()]:[])]);
  }

  /** Called only by a DriverProfile participant, never by a client. */
  async pauseMarketWallet(driverId:string,fence:string,transactionId:string):Promise<boolean>{
    if([...this.sessions.values()].some(s=>s.pendingBind?.driverId===driverId))return false;
    const matches=[...this.sessions.entries()].filter(([,s])=>s.economy?.walletId===driverId&&
      (s.economy?.currentFence===fence||s.marketHold?.oldFence===fence));
    if(matches.length>1)return false;
    if(!matches.length){
      const detached=this.draining.get(`${driverId}:${fence}`);if(detached)await detached.freeze();
      return true;
    }
    const [socket,session]=matches[0];
    if(session.marketHold){
      if(session.marketHold.transactionId!==transactionId||session.marketHold.oldFence!==fence)return false;
    }else{
      if(session.attachPending)return false;
      const hold=captureMarketHold(this.world,session.id,transactionId,fence);if(!hold)return false;
      session.marketHold=hold;session.attachPending=true;this.invalidate(socket,session);
    }
    await session.economy?.pauseForMarket();
    return true;
  }

  async installMarketWallet(driverId:string,oldFence:string,newFence:string,transactionId:string,revision:number,sequence:number,progress:DriverProgress,marketPaint:MarketPaint|null):Promise<void>{
    const session=[...this.sessions.values()].find(s=>s.economy?.walletId===driverId&&s.marketHold?.transactionId===transactionId&&s.marketHold.oldFence===oldFence);
    if(!session?.economy)return;
    const hold=session.marketHold!;
    if(hold.newFence&&hold.newFence!==newFence)throw new Error('Market fence changed');
    if(!hold.newFence){session.economy.installMarket(driverId,newFence,revision,sequence,progress,marketPaint);hold.marketPaint=marketPaint;hold.newFence=newFence;}
  }

  async resumeMarketWallet(driverId:string,fence:string,transactionId:string):Promise<void>{
    const match=[...this.sessions.entries()].find(([,s])=>s.economy?.walletId===driverId&&s.marketHold?.transactionId===transactionId);
    if(!match)return;
    const [socket,session]=match,hold=session.marketHold!;
    const economy=session.economy;if(!economy)return;
    if(hold.newFence!==fence||economy.currentFence!==fence)throw new Error('Market fence not installed');
    if(hold.resume)return hold.resume;
    const flight=(async()=>{
      const restored=restoreMarketHold(this.world,hold);
      if(!restored.ok){
        // The wallet is already unsealed. Disconnect the paused session so a
        // blocked room cannot prevent either participant's release; rejoining
        // loads the durable wallet and reroutes any inaccessible order.
        this.disconnect(socket,ROOM_NO_SPAWN_CODE,'No safe starting space');
        return;
      }
      economy.setMarketPaint(hold.marketPaint??null);
      await economy.resumeMarket();
      if(this.sessions.get(socket)!==session||session.marketHold!==hold)return;
      session.marketHold=null;session.attachPending=false;
      this.invalidate(socket,session,restored.relocated);
    })();
    hold.resume=flight;
    try{await flight;}finally{if(hold.resume===flight)delete hold.resume;}
  }

  private async attachIdentity(socket:WebSocket,session:Session,code:string|null,requestId:number,sequence:number):Promise<void>{
    const economy=session.economy;if(!economy)return;
    const current=()=>socket.readyState===1&&this.sessions.get(socket)===session&&session.identitySequence===sequence;
    const send=(ok:boolean,message:string)=>{if(!current())return false;try{socket.send(JSON.stringify({type:'identityResult',requestId,ok,message}));return true;}catch{return false;}};
    if(!current())return;
    let accepted=false,claimed=false,stage='bind',bindUnavailable=false;
    const token=crypto.randomUUID(),guestWalletId=economy.walletId;
    const chat=this.env.CHAT.get(this.env.CHAT.idFromName('global'));
    try{
      if(code===null){send(false,'Rejoin to start a new guest driver.');return;}
      const identity=await chat.bindWallet(code,guestWalletId,token);
      claimed=identity?.claim??false;
      if(!current())return;
      if(!identity){send(false,'Invalid recovery code.');return;}
      if(!identity.walletId){send(false,'Rejoin before loading a different saved driver.');return;}
      if(identity.walletId===economy.walletId){
        stage='activate';
        const ok=await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(identity.walletId)).activateIncome(economy.currentFence);
        if(!current())return;
        if(!ok){send(false,'Session superseded. Rejoin to recover.');return;}
        stage='confirm';
        if(identity.claim && !await chat.confirmWallet(code,token)){
          send(false,'Driver connection changed. Rejoin to retry.');return;
        }
        if(!current())return;
        accepted=send(true,'Saved driver connected.');return;
      }
      if(!economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      const fence=crypto.randomUUID(),initial=initialDelivery({x:0,z:0});
      // Register the incoming lease before awaiting it: another acquisition can
      // find and cancel this session even before replace() installs the wallet.
      session.pendingBind={driverId:identity.walletId,fence};
      stage='acquire';
      const result=await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(identity.walletId)).acquire(identity.walletId,fence,progressFrom(initial,[],{},[],0,initial.lifetimeIncome),this.roomId);
      if(!current())return;
      if(!economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      stage='confirm';
      if(identity.claim && !await chat.confirmWallet(code,token)){
        send(false,'Driver connection changed. Rejoin to retry.');return;
      }
      if(!current())return;
      // A match can finish while confirmation is in flight. Its result belongs
      // to the original wallet, so recheck immediately before replacing it.
      if(!economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      // The room player ID is reused for the new wallet. Drop the previous
      // driver's unfinished activity so it cannot become the new driver's win.
      leaveParking(this.world.parking,session.id);
      for(const round of this.world.races.rounds){
        round.entrants=round.entrants.filter(entrant=>entrant.playerId!==session.id);
        if(round.hostId===session.id&&round.entrants.length)round.hostId=round.entrants[0].playerId;
      }
      this.world.races.rounds=this.world.races.rounds.filter(round=>round.entrants.length>0);
      const soccer=this.world.soccer;
      soccer.participants=soccer.participants.filter(participant=>participant.playerId!==session.id);
      soccer.winningPlayers=soccer.winningPlayers.filter(id=>id!==session.id);
      if(soccer.lastTouch?.playerId===session.id)soccer.lastTouch=null;
      const player=this.world.players.find(item=>item.id===session.id);
      if(player)resetAchievementFlight(player);
      economy.replace(identity.walletId,fence,result.revision,result.sequence,result.progress,result.marketPaint);
      economy.restoreCurrentVehicle();
      stage='repair';
      await economy.ensureAccessibleOrder();
      if(!current())return;
      session.pendingBind=null;
      this.invalidate(socket,session,true);
      accepted=send(true,'Saved driver connected.');
    }catch(error){
      // A receiver missing this method cannot execute it. No claim can have
      // been written, so waiting for its likewise-missing release method would
      // prevent the player from retrying while the deployment rolls out.
      bindUnavailable=stage==='bind' && error instanceof Error && error.message==='The RPC receiver does not implement the method "bindWallet".';
      const detail=error instanceof Error?error.message.replace(/poly-[0-9a-f.-]+/gi,'[redacted]').replace(/[0-9a-f]{32,}/gi,'[redacted]').slice(0,300):'Unknown error';
      console.error('wallet attachment failed',stage,detail);
      send(false,bindUnavailable?'Saved driver is temporarily unavailable. Rejoin to retry.':'Could not load driver. Rejoin to retry.');
    }
    finally{
      session.pendingBind=null;
      if(accepted&&claimed&&code!==null)this.ctx.waitUntil(chat.settleWallet(code,token).catch(()=>{}));
      else if(!accepted&&code!==null&&!bindUnavailable){
        // A bind may have committed even when its reply was lost. Reconcile it
        // before starting the next identity request; other drivers keep moving.
        for(;;){
          try{await chat.releaseWallet(code,token);break;}
          catch{await new Promise(resolve=>setTimeout(resolve,500));}
        }
      }
      // A failed or superseded recovery stays paused until the driver makes a
      // new identity choice; another request may already be queued.
      if(current())session.attachPending=!accepted;
    }
  }

  private async onMessage(socket:WebSocket,raw:string|ArrayBuffer):Promise<void>{
    const session=this.sessions.get(socket);if(!session)return;
    const now=Date.now();
    if(now-session.windowStart>=1000){session.windowStart=now;session.count=0;}
    if(++session.count>90){this.disconnect(socket,1008,'Message rate exceeded');return;}
    if(typeof raw!=='string'||raw.length>1024){this.disconnect(socket,1009,'Text messages up to 1024 characters required');return;}
    const message=parseMessage(raw);if(!message){this.disconnect(socket,1008,'Invalid message');return;}
    session.lastMessage=now;
    if(message.type==='identity'){
      if(!session.economy){socket.send(JSON.stringify({type:'identityResult',requestId:message.requestId,ok:message.code===null,message:message.code===null?'Practice driver ready. Progress is not saved.':'Saved drivers cannot be attached in playtest rooms.'}));return;}
      if(session.marketHold){socket.send(JSON.stringify({type:'identityResult',requestId:message.requestId,ok:false,message:'Wait for the market transaction to finish.'}));return;}
      const sequence=++session.identitySequence;
      // A new guest can start immediately; later identity choices must remain
      // ordered behind any recovery already in progress.
      if(message.code===null&&(sequence===1||(session.guest&&!session.attachPending))){session.guest=true;session.attachPending=false;socket.send(JSON.stringify({type:'identityResult',requestId:message.requestId,ok:true,message:'Guest driver ready.'}));return;}
      if(message.code!==null)session.guest=false;
      session.attachPending=true;session.economy.pauseCabs();this.invalidate(socket,session);
      // Autonomous navigation is also a control source: suspend it while an
      // identity is unresolved so the previous driver's route cannot continue.
      const player=this.world.players.find(p=>p.id===session.id);
      const car=this.world.entities.find(e=>e.id===player?.entityId);
      if(car){car.autopilot=false;car.navigation=null;}
      session.identityTail=session.identityTail.then(()=>this.attachIdentity(socket,session,message.code,message.requestId,sequence));
      this.ctx.waitUntil(session.identityTail);
      return;
    }
    if(message.type==='market'){
      if(!session.economy){if(message.action!=='browse')socket.send(JSON.stringify({type:'marketResult',requestId:message.requestId,operationId:message.operationId,action:message.action,status:'rejected',reason:'save-driver'}));return;}
      const economy=session.economy;
      if(session.guest||(session.attachPending&&!session.marketHold)){
        if(message.action!=='browse'&&message.action!=='status')socket.send(JSON.stringify({type:'marketResult',requestId:message.requestId,operationId:message.operationId,action:message.action,status:'rejected',reason:'save-driver'}));
        return;
      }
      const driverId=economy.walletId,fence=economy.currentFence,identitySequence=session.identitySequence;
      const current=()=>this.sessions.get(socket)===session&&session.identitySequence===identitySequence&&economy.walletId===driverId&&socket.readyState===1;
      const run=async()=>{
        try{
          // A held participant is already authenticated by its original fence.
          if(!session.marketHold&&!await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(driverId)).checkFence(fence))return;
          if(!current())return;
          const market=this.env.MARKET.get(this.env.MARKET.idFromName('global'));
          const player=this.world.players.find(item=>item.id===session.id)??session.marketHold?.player;
          const value=message.action==='browse'?await market.browse(driverId,message.requestId,message.cursor,message.ownedCursor):
            message.action==='status'?await market.status(driverId,message.operationId,message.requestId):
              await market.execute(driverId,player?.name??'Driver',message);
          if(current())socket.send(JSON.stringify(value));
        }catch{/* The client retains its operation ID and retries an uncertain outcome. */}
      };
      this.ctx.waitUntil(run());return;
    }
    if(message.type==='input'){
      if(message.roomEpoch!==this.roomEpoch){this.rejectInput(socket,message,'epoch');return;}
      if(session.attachPending){this.rejectInput(socket,message,'revision');return;}
      const result=session.control.receive(message,this.tickCount,now);
      this.sendEdges(socket,result.outcomes);
      if(result.rejection&&this.sessions.has(socket))this.rejectInput(socket,message,result.rejection);
      return;
    }
    if(message.type==='sync'){if(session.economy)session.economy.barrier(message.token);else session.syncToken=Math.max(session.syncToken,message.token);return;}
    if(message.type==='name'){const player=this.world.players.find(p=>p.id===session.id);if(player)player.name=chooseAvailableName(message.name,this.world.players.filter(p=>p.id!==session.id).map(p=>p.name));return;}
    if(message.type==='cab'&&!this.beginCabRequest(socket,session,message))return;
    if(message.type==='starship'){
      const economy=session.economy;if(!economy)return;
      const driverId=economy.walletId,fence=economy.currentFence,identitySequence=session.identitySequence;
      const current=()=>this.sessions.get(socket)===session&&!session.attachPending&&session.identitySequence===identitySequence&&economy.walletId===driverId&&economy.currentFence===fence;
      const send=(value:unknown)=>{if(current())try{socket.send(JSON.stringify(value));}catch{}};
      const run=async()=>{
        if(!current())return;
        const driver=this.env.DRIVERS.get(this.env.DRIVERS.idFromName(driverId));
        if(message.action==='name'){
          try{const result=await driver.setStarshipName(driverId,fence,message.name);send({type:'starshipNameResult',requestId:message.requestId,...result});}
          catch{send({type:'starshipNameResult',requestId:message.requestId,ok:false,publicName:null});}
        }else try{
          if(!await driver.checkFence(fence)||!current())return;
          const before=await driver.starshipPrivacyState(driverId,fence);
          if(!before||!current())return;
          const income=this.env.INCOME.get(this.env.INCOME.idFromName('global'));
          const [status,publicName]=await Promise.all([income.status(driverId),income.publicName(driverId)]);
          const after=await driver.starshipPrivacyState(driverId,fence);
          if(!after||!current())return;
          const privacyPending=before.pending||after.pending||before.revision!==after.revision;
          send({type:'starshipStatus',requestId:message.requestId,status,publicName,privacyPending,serverTime:Date.now()});
        }catch{/* The client marks an unanswered status as stale. */}
      };
      const operation=run();this.ctx.waitUntil(operation);return;
    }
    // Even rejected actions advance the action fence so later inputs remain ordered.
    if('edgeBaseline' in message&&!session.control.beginAction(message.actionSeq,message.edgeBaseline)){
      this.disconnect(socket,1008,'Invalid action sequence or edge baseline');return;
    }
    if(session.attachPending){
      if(message.type==='cab')this.replyCab(socket,session,message,false,'unavailable');
      if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:false}));
      if(message.type==='vehicleStyle')socket.send(JSON.stringify({type:'vehicleStyleResult',requestId:message.requestId,category:message.category,choice:message.choice,ok:false}));
      if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:false}));
      if(message.type==='destination'||message.type==='deliveryDestination')socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok:false}));
      if(message.type==='mars')socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok:false,amount:0}));
      if(message.type==='luxury')socket.send(JSON.stringify({type:'luxuryResult',requestId:message.requestId,action:message.action,vehicle:message.vehicle,ok:false,reason:'unavailable'}));
      return;
    }
    if(session.economy?.vehicleLocked && (message.type==='interact'||message.type==='reset'||message.type==='selectVehicle'||message.type==='dome'||message.type==='minigame'||(message.type==='race'&&message.action==='join')))return;
    if(message.type==='dome'){if(travelDome(this.world,session.id))this.invalidate(socket,session,true,message.edgeBaseline);return;}
    if(message.type==='minigame'){const before=this.pose(session);if(enterMinigame(this.world,session.id,message.game))this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);return;}
    if(message.type==='parking'&&(message.action==='start'||message.action==='leave')){parkingAction(this.world,session.id,message.action);return;}
    if(message.type==='race'&&(message.action==='start'||message.action==='leave')){raceAction(this.world,session.id,message.action,message.courseId);return;}
    if(message.type==='teleport'){
      const ok=this.playtest==='sandbox'&&now-session.lastAction>=400&&teleportPlayer(this.world,session.id,message);
      if(ok){session.lastAction=now;this.invalidate(socket,session,true,message.edgeBaseline);}
      socket.send(JSON.stringify({type:'teleportResult',requestId:message.requestId,ok}));return;
    }
    if(now-session.lastAction<400){
      if(message.type==='cab')this.replyCab(socket,session,message,false,'cooldown');
      if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:false}));
      if(message.type==='vehicleStyle')socket.send(JSON.stringify({type:'vehicleStyleResult',requestId:message.requestId,category:message.category,choice:message.choice,ok:false}));
      if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:false}));
      if(message.type==='destination'||message.type==='deliveryDestination')socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok:false}));
      if(message.type==='mars')socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok:false,amount:0}));
      if(message.type==='luxury')socket.send(JSON.stringify({type:'luxuryResult',requestId:message.requestId,action:message.action,vehicle:message.vehicle,ok:false,reason:'cooldown'}));
      return;
    }
    session.lastAction=now;
    if(message.type==='interact'){
      const player=this.world.players.find(player=>player.id===session.id);
      const before=player?.entityId;
      const current=this.world.entities.find(entity=>entity.id===before);
      const candidates=session.economy&&current?.kind==='person'?captureAmbientNpcCars(this.world.entities):null;
      interact(this.world,session.id);
      const after=player?.entityId;
      if(before!==after){
        const stolen=after?candidates?.get(after):undefined;
        if(player&&stolen)session.economy?.achievement(player,{kind:'npc-stolen',vehicle:stolen});
        if(this.playtest==='sandbox')prepareSandboxDriver(this.world,session.id);
        this.invalidate(socket,session,true,message.edgeBaseline);
      }
    }
    if(message.type==='reset'){const before=this.pose(session);resetPlayer(this.world,session.id);this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);}
    if(message.type==='autopilot'&&toggleAutopilot(this.world,session.id))this.invalidate(socket,session,false,message.edgeBaseline);
    if(message.type==='selectVehicle'&&chooseVehicle(this.world,session.id,message.kind,this.playtest==='sandbox')){session.economy?.restoreCurrentVehicle();if(this.playtest==='sandbox')prepareSandboxDriver(this.world,session.id);this.invalidate(socket,session,true,message.edgeBaseline);}
    if(message.type==='parking')parkingAction(this.world,session.id,message.action);
    if(message.type==='race'){const before=this.pose(session);if(message.action==='join'&&raceAction(this.world,session.id,message.action,message.courseId))this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);}
    if(message.type==='destination'||message.type==='deliveryDestination'){
      const ok=message.type==='destination'?setDestination(this.world,session.id,{x:message.x,z:message.z},message.mode):setDeliveryDestination(this.world,session.id,message.mode);
      if(ok)this.invalidate(socket,session,false,message.edgeBaseline);
      socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok}));
    }
    if(!session.economy){
      if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:buyUpgrade(this.world,session.id,message.upgrade)}));
      if(message.type==='vehicleStyle')socket.send(JSON.stringify({type:'vehicleStyleResult',requestId:message.requestId,category:message.category,choice:message.choice,ok:buyVehicleStyle(this.world,session.id,message)}));
      if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:subscribeOta(this.world,session.id,message.enabled)}));
      if(message.type==='cab')this.replyCab(socket,session,message,false,'save-driver');
      if(message.type==='luxury')socket.send(JSON.stringify({type:'luxuryResult',requestId:message.requestId,action:message.action,vehicle:message.vehicle,ok:false,reason:'Choose any car from Fleet in sandbox.'}));
      if(message.type==='mars')socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok:false,amount:0}));
      if(this.playtest==='sandbox'){const player=this.world.players.find(p=>p.id===session.id);if(player)sandboxWallet(player,this.world.time);}
      return;
    }
    if(message.type==='upgrade')session.economy.workshop('upgrade',message.requestId,message.upgrade);
    if(message.type==='vehicleStyle')session.economy.workshop('vehicleStyle',message.requestId,message);
    if(message.type==='ota')session.economy.ota(message.enabled,message.requestId);
    if(message.type==='luxury'){
      if(message.action==='collect')session.economy.luxury(message.action,message.vehicle,message.requestId,()=>this.invalidate(socket,session,true,message.edgeBaseline));
      else session.economy.luxury(message.action,message.vehicle,message.requestId);
    }
    if(message.type==='cab'){
      const done=(ok:boolean,reason?:string)=>this.replyCab(socket,session,message,ok,reason);
      if(session.guest)done(false,'save-driver');
      else if(message.action==='buy')session.economy.buyCab(done);
      else session.economy.paintCab(message.assetId,message.paint,done);
    }
    if(message.type==='mars'){
      if(message.action==='board')session.economy.boardMars(message.requestId);
      else session.economy.contributeMars(message.amount,message.requestId);
    }
  }

  private beginCabRequest(socket:WebSocket,session:Session,message:CabMessage):boolean {
    const payload=JSON.stringify(message),previous=session.cabRequests.get(message.requestId);
    if(previous){
      if(previous.payload!==payload)socket.send(JSON.stringify({...message,type:'cabResult',ok:false,reason:'conflict'}));
      else if(previous.reply)socket.send(previous.reply);
      return false;
    }
    if(message.requestId<=session.cabHighWater){socket.send(JSON.stringify({...message,type:'cabResult',ok:false,reason:'stale'}));return false;}
    session.cabHighWater=message.requestId;session.cabRequests.set(message.requestId,{payload,reply:null});return true;
  }
  private replyCab(socket:WebSocket,session:Session,message:CabMessage,ok:boolean,reason?:string):void {
    const record=session.cabRequests.get(message.requestId);if(!record)return;
    record.reply=JSON.stringify({...message,type:'cabResult',ok,...(reason?{reason}:{})});
    try{socket.send(record.reply);}catch{}
    while(session.cabRequests.size>128){
      const completed=[...session.cabRequests].find(([,item])=>item.reply!==null);if(!completed)break;
      session.cabRequests.delete(completed[0]);
    }
  }

  private startTicks():void{
    if(this.timer!==null)return;
    const clock=new RoomClock(Date.now());
    const run=()=>{
      this.timer=null;
      try{this.tick();}finally{
        if(this.sessions.size)this.timer=setTimeout(run,clock.afterStep(Date.now()));
      }
    };
    this.timer=setTimeout(run,50);
  }

  private stopTicks():void{
    if(this.timer!==null)clearTimeout(this.timer);
    this.timer=null;
  }

  private tick():void{
    const now=Date.now();
    for(const [socket,session] of this.sessions)if(now-session.lastMessage>30_000)this.disconnect(socket,1001,'Connection inactive');
    if(!this.sessions.size)return;
    if(now>=this.nextRefresh){this.nextRefresh=now+2000;this.refresh();}
    const byId=new Map([...this.sessions.values()].map(s=>[s.id,s]));
    const nextTick=this.tickCount+1;
    const edgeResults=new Map<string,{socket:WebSocket;outcomes:EdgeOutcome[]}>();
    for(const [socket,session] of this.sessions){
      const result=session.control.advance(nextTick,now);
      if(session.attachPending)this.inputs.delete(session.id);else this.inputs.set(session.id,result.input);
      if(result.outcomes.length)edgeResults.set(session.id,{socket,outcomes:result.outcomes});
    }
    const relocated=new Set<string>();
    let settlement:ReturnType<GameRoom['rate']>=null;
    const marketHolds=[...this.sessions.values()].flatMap(session=>session.marketHold?[session.marketHold]:[]);
    const heldRelocations=withMarketHolds(this.world,marketHolds,()=>step(this.world,this.inputs,.05,{onSubsteps:count=>{this.lastSubsteps=count;},onRelocation:id=>{
      const player=this.world.players.find(item=>item.id===id);
      const entity=this.world.entities.find(item=>item.id===player?.entityId);
      for(const outcome of edgeResults.get(id)?.outcomes??[]){
        if(outcome.status==='processed'&&entity&&(outcome.kind==='jump'?entity.lastJump:entity.lastFlip)!==outcome.id)outcome.status='superseded';
      }
      this.inputs.delete(id);relocated.add(id);
    },economy:this.playtest?undefined:{
      canCollect:id=>{const session=byId.get(id);return !!session&&!session.attachPending;},
      update:(player,apply,ticket)=>{const session=byId.get(player.id);if(session&&!session.attachPending){const atMs=Date.now();settlement=this.rate(atMs);try{session.economy?.update(player,apply,settlement,ticket,atMs);}finally{settlement=null;}}},
      deliveryStart:(player,entity,paused)=>{const session=byId.get(player.id);if(session&&!session.attachPending)session.economy?.deliveryStart(player,entity,paused);},
      deliveryEnd:(player,active,payouts)=>{const session=byId.get(player.id);if(session&&!session.attachPending)session.economy?.deliveryEnd(player,active,payouts);},
      // A result can occur while binding (for example, a ball already in
      // motion). Commit it to the current wallet; a different incoming wallet
      // must then pass the unstarted check again before it can replace it.
      gameAward:(player,apply,capture)=>{byId.get(player.id)?.economy?.gameAward(player,apply,capture);},
      achievement:(player,evidence)=>{byId.get(player.id)?.economy?.achievement(player,evidence);},
      decisionsAvailable:player=>byId.get(player.id)?.economy?.decisionsAvailable??false,
      pickup:(player,car,pickup)=>{const session=byId.get(player.id);if(session&&!session.attachPending)session.economy?.pickup(player,car,pickup);},
      resolveDeliveryPayout:(_player,component)=>settlement?activityPayout(component.amount,component.kind,settlement.atMs,settlement.events):null,
      onDomeWin:result=>{if(result.winners.length)this.recordWin();},
    }}));
    for(const id of heldRelocations)relocated.add(id);
    this.tickCount=nextTick;
    if(this.playtest==='sandbox')for(const player of this.world.players)sandboxWallet(player,this.world.time);
    if(!this.playtest){
      const entitiesById=new Map<string,Entity>();
      for(const entity of this.world.entities)entitiesById.set(entity.id,entity);
      for(const player of this.world.players){
        const session=byId.get(player.id);
        session?.economy?.observeVehicleDrive(entitiesById.get(player.entityId),session.attachPending||!!session.marketHold||relocated.has(player.id));
      }
    }
    for(const session of this.sessions.values())if(!session.attachPending)session.economy?.observeCabs(now);
    // Rebalance without awaiting any driver's storage in the physics loop.
    if(this.tickCount%20===0)this.rebalanceCabs();
    for(const {socket,outcomes} of edgeResults.values())this.sendEdges(socket,outcomes);
    for(const [socket,session] of this.sessions)if(relocated.has(session.id))this.invalidate(socket,session,true);
    if(!this.sessions.size||this.tickCount%2)return;
    const snapshot=prepareSnapshots(this.world,this.tickCount,this.roomEpoch,this.lastSubsteps);
    for(const [socket,session] of this.sessions){try{socket.send(snapshot(session.id,session.control.snapshot(),session.poseRevision,session.economy?.sync()??session.syncToken));}catch{this.disconnect(socket);}}
  }

  private rebalanceCabs():void {
    const sessions=[...this.sessions.values()].filter((s):s is Session&{economy:EconomySession}=>!!s.economy),byOwner=new Map(sessions.map(session=>[session.id,session]));
    const fleets=sessions.map(session=>({ownerId:session.id,assetIds:session.economy.cabFleet.assets.map(asset=>asset.id)}));
    const cabs=this.world.entities.filter(entity=>entity.cab&&entity.owner).map(entity=>({ownerId:entity.owner!,assetId:entity.cab!.assetId,occupied:entity.driver!==null}));
    const reserved=this.world.entities.filter(entity=>entity.retiredCab).length;
    const plan=planCybercabDispatch(fleets,cabs,MAX_DISPATCHED_CABS_PER_ROOM,reserved);if(!plan)return;
    const retiring=new Set(plan.retire.map(cab=>cab.assetId));
    for(const cab of cabs){
      const session=byOwner.get(cab.ownerId);if(!session)continue;
      if(retiring.has(cab.assetId)||session.attachPending){
        session.economy.suspendCab(cab.assetId);
        if(!cab.occupied&&!session.attachPending&&session.economy.cabReadyToRetire(cab.assetId))retireCybercab(this.world,cab.ownerId,cab.assetId);
      }else session.economy.resumeCab(cab.assetId);
      const entity=this.world.entities.find(item=>item.cab?.assetId===cab.assetId);
      const asset=session.economy.cabFleet.assets.find(item=>item.id===cab.assetId);
      if(entity&&asset)entity.style=structuredClone(asset.style);
    }
    for(const cab of plan.dispatch){
      const session=byOwner.get(cab.ownerId);if(!session||session.attachPending)continue;
      const asset=session.economy.cabFleet.assets.find(item=>item.id===cab.assetId);if(!asset)continue;
      const entity=dispatchCybercab(this.world,cab.ownerId,cab.assetId);
      if(entity){entity.style=structuredClone(asset.style);session.economy.resumeCab(cab.assetId);}
    }
  }

  private sendEdges(socket:WebSocket,outcomes:EdgeOutcome[]):void {
    try {for(const outcome of outcomes)socket.send(JSON.stringify({type:'inputEdge',...outcome}));}
    catch {this.disconnect(socket);}
  }

  private rejectInput(socket:WebSocket,message:{seq:number;targetTick:number},reason:string):void {
    try {socket.send(JSON.stringify({type:'inputRejected',seq:message.seq,targetTick:message.targetTick,reason}));}
    catch {this.disconnect(socket);}
  }

  private pose(session:Session):ControlledPose|null {
    const player=this.world.players.find(item=>item.id===session.id);
    const e=this.world.entities.find(item=>item.id===player?.entityId);
    return e?{id:e.id,x:e.x,y:e.y,z:e.z,yaw:e.yaw,pitch:e.pitch,roll:e.roll}:null;
  }

  private poseChanged(before:ControlledPose|null,after:ControlledPose|null):boolean {
    if(!before||!after)return before!==after;
    if(before.id!==after.id||Math.hypot(before.x-after.x,before.y-after.y,before.z-after.z)>.001)return true;
    return (['yaw','pitch','roll'] as const).some(key=>Math.abs(Math.atan2(Math.sin(before[key]-after[key]),Math.cos(before[key]-after[key])))>.0001);
  }

  private invalidate(socket:WebSocket,session:Session,relocated=false,edgeBaseline?:EdgeBaseline):void {
    const player=this.world.players.find(item=>item.id===session.id);
    const entity=this.world.entities.find(item=>item.id===player?.entityId);
    this.inputs.delete(session.id);
    if(relocated){session.poseRevision++;session.economy?.resetVehicleDrive();}
    this.sendEdges(socket,session.control.invalidate({...NEUTRAL,jump:entity?.lastJump??0,flip:entity?.lastFlip??0},edgeBaseline?{type:'action',edgeBaseline}:{type:'relocation'}));
  }

  private disconnect(socket:WebSocket,code=1000,reason='Session ended'):void{
    const session=this.sessions.get(socket);if(!session)return;
    this.sessions.delete(socket);this.inputs.delete(session.id);
    // The departing driver may still have an uncommitted final timer checkpoint.
    // Keep it discoverable until drained so a reconnect cannot overtake it.
    const economy=session.economy;
    if(economy){const key=`${economy.walletId}:${economy.currentFence}`;
    economy.finish();this.draining.set(key,economy);
    this.ctx.waitUntil(economy.freeze().finally(()=>{if(this.draining.get(key)===economy)this.draining.delete(key);}));
    }
    removePlayer(this.world,session.id);
    try{socket.close(code,reason);}catch{}
    if(!this.sessions.size){
      this.stopTicks();
      const {fund,roomFund}=this.world.mars;this.tickCount=0;this.lastSubsteps=1;this.roomEpoch=crypto.randomUUID();this.world=createWorld(Math.floor(Math.random()*VEHICLE_IDS.length));this.world.mars.fund=fund;this.world.mars.roomFund=roomFund;
      this.ready=null;this.propertyRevision=0;this.pickupGenerations=new Map();this.pendingPickups=new Set();
    }
  }
}
