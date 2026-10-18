import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, NEUTRAL, NoSpawnError, chooseVehicle, toggleAutopilot, addPlayer, createWorld, interact, parkingAction, raceAction, enterMinigame, setDestination, removePlayer, resetPlayer, step, travelDome, type Input } from '../shared/game';
import { ScheduledInput, type EdgeBaseline, type EdgeOutcome } from '../shared/tick-input';
import { parseMessage, roomCapacity, roomSlug } from './protocol';
import { prepareSnapshots, snapshotFor } from './snapshot';
import { GlobalChat } from './global-chat';
import { chooseAvailableName } from './global-chat-core';
import { radioFeed } from './radio';
import { MARS_GOAL } from '../shared/mars';
import { VEHICLE_IDS } from '../shared/vehicles';
import { initialDelivery } from '../shared/delivery';
import { EconomySession } from './economy-session';
import { DriverProfile, GlobalIncome, progressFrom } from './driver-profile';
import { RoomEconomy } from './room-economy';
import { GlobalEarningsEvent } from './global-earnings-event';
import { scheduleGlobalEarnings } from './global-earnings-admin';
import { activityPayout, earningsMultiplier, globalWindowsForInstant, ROOM_WIN_DURATION_MS, type EarningsEvents, type GlobalEventLease } from '../shared/earnings-events';

export { GlobalChat, DriverProfile, GlobalIncome, RoomEconomy, GlobalEarningsEvent };

type Env = { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<GameRoom>; CHAT: DurableObjectNamespace<GlobalChat>; DRIVERS: DurableObjectNamespace<DriverProfile>; ECONOMIES: DurableObjectNamespace<RoomEconomy>; INCOME: DurableObjectNamespace<GlobalIncome>; GLOBAL_EVENTS: DurableObjectNamespace<GlobalEarningsEvent>; STARSHIP_ADMIN_TOKEN?:string; MAX_PLAYERS?: string };
type Session = { id:string; lastMessage:number; windowStart:number; count:number; lastAction:number; control:ScheduledInput; poseRevision:number; economy:EconomySession; identityTail:Promise<void>; attachPending:boolean; guest:boolean; identitySequence:number; pendingBind:{driverId:string;fence:string}|null };
type ControlledPose = {id:string;x:number;y:number;z:number;yaw:number;pitch:number;roll:number};
type PendingRoomWin = {event_id:string;requested_at:number;room_id:string};
type RoomEarningsSnapshot = {observedAt:number;events:EarningsEvents;lease:GlobalEventLease};
const ROOM_EARNINGS_STALE_MS=5_000;
const reply = (body: string, status: number) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
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
    const slug = roomSlug(url.pathname);
    const chat = url.pathname === '/api/chat';
    if (!slug && !chat) return reply('Unknown API route. Room names use 1–32 lowercase letters, digits, or hyphens.', 404);
    if (request.method !== 'GET') return reply('GET required', 405);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return reply('WebSocket upgrade required', 426);
    const origin = request.headers.get('Origin');
    // Non-browser clients may omit Origin. This is a public sandbox, not authentication.
    if (origin && origin !== url.origin) return reply('Cross-origin connections are not allowed', 403);
    if (chat) return env.CHAT.get(env.CHAT.idFromName('global')).fetch(request);
    return env.ROOMS.get(env.ROOMS.idFromName(slug!)).fetch(request);
  },
} satisfies ExportedHandler<Env>;

// Physics stays room-local; economy writes are isolated per player.
export class GameRoom extends DurableObject<Env> {
  private world=createWorld(Math.floor(Math.random()*VEHICLE_IDS.length));
  private sessions=new Map<WebSocket,Session>();
  private inputs=new Map<string,Input>();
  private draining=new Map<string,EconomySession>();
  private timer:ReturnType<typeof setInterval>|null=null;
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
  private winFlight:Promise<void>|null=null;
  private hasPendingWin=false;

  private ledger(){return this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(this.roomId));}
  private initWinStorage(){
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS game_room_pending_wins (event_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, room_id TEXT NOT NULL)');
    this.hasPendingWin=this.pendingWins().length>0;
  }
  private pendingWins():PendingRoomWin[]{
    return this.ctx.storage.sql.exec<PendingRoomWin>('SELECT event_id,requested_at,room_id FROM game_room_pending_wins ORDER BY requested_at,event_id').toArray();
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
    try{
      const [roomUntil,lease]=await Promise.all([
        this.ledger().earningsAt(observedAt),this.env.GLOBAL_EVENTS.get(this.env.GLOBAL_EVENTS.idFromName('global')).lease(),
      ]);
      if(generation!==this.earningsGeneration||roomId!==this.roomId||this.hasPendingWin)return;
      const room=roomUntil===null?[]:[{startsAtMs:roomUntil-ROOM_WIN_DURATION_MS,endsAtMs:roomUntil}];
      const now=Date.now();globalWindowsForInstant(lease,now);
      this.earningsSnapshot={observedAt,lease,events:{room,global:lease.windows}};
    }catch{if(generation===this.earningsGeneration)this.earningsSnapshot=null;}
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
  private recordWin(){
    const eventId=crypto.randomUUID(),requestedAt=Date.now();
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
    if(this.refreshing||!this.roomId)return;
    this.refreshing=true;const world=this.world;
    void Promise.allSettled([
      this.refreshPickups(world),
      this.env.INCOME.get(this.env.INCOME.idFromName('global')).total().then(total=>{if(world===this.world)world.mars.fund=Math.min(MARS_GOAL,total);}),
      this.ledger().roomFund().then(balance=>{if(world===this.world)world.mars.roomFund=Math.max(world.mars.roomFund,balance);}),
      this.refreshEarnings(),
    ]).finally(()=>{this.refreshing=false;});
  }

  async fetch(request:Request):Promise<Response>{
    const capacity=roomCapacity(this.env.MAX_PLAYERS);
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    server.accept();
    const close=(code:number,reason:string)=>{server.close(code,reason);return new Response(null,{status:101,webSocket:client});};
    if(this.sessions.size>=capacity)return close(ROOM_FULL_CODE,'Room full');
    const slug=roomSlug(new URL(request.url).pathname);
    if(!slug)return close(1008,'Invalid room');
    this.roomId=slug;
    const world=this.world;
    this.ready??=this.initializeRoom(world);
    const walletId=crypto.randomUUID(),fence=crypto.randomUUID();
    const initial=initialDelivery({x:0,z:0});
    let acquired:Awaited<ReturnType<DriverProfile['acquire']>>;
    try{
      [acquired]=await Promise.all([
        this.env.DRIVERS.get(this.env.DRIVERS.idFromName(walletId)).acquire(walletId,fence,progressFrom(initial,[],{},[],0,initial.lifetimeIncome),slug),
        this.ready,
      ]);
    }catch{this.ready=null;return close(1011,'Wallet unavailable. Rejoin to retry.');}
    if(this.world!==world){this.ready=null;try{await(this.ready=this.initializeRoom(this.world));}catch{this.ready=null;return close(1011,'Room unavailable');}}
    if(this.sessions.size>=capacity)return close(ROOM_FULL_CODE,'Room full');
    const id=crypto.randomUUID(),now=Date.now();
    let player;
    try{player=addPlayer(this.world,id,chooseAvailableName('Driver',this.world.players.map(p=>p.name)));}
    catch(error){if(!(error instanceof NoSpawnError))throw error;return close(ROOM_NO_SPAWN_CODE,'No safe starting space');}
    const economy=new EconomySession(this.env,this.ledger(),this.world,player,server,walletId,fence,slug,acquired.revision,acquired.sequence,acquired.progress,this.pickupGenerations,this.pendingPickups);
    const control=new ScheduledInput({...NEUTRAL});
    const session:Session={id,lastMessage:now,windowStart:now,count:0,lastAction:0,control,poseRevision:0,economy,identityTail:Promise.resolve(),attachPending:true,guest:false,identitySequence:0,pendingBind:null};
    this.sessions.set(server,session);
    server.addEventListener('message',event=>{void this.onMessage(server,event.data);});
    server.addEventListener('close',()=>this.disconnect(server));
    server.addEventListener('error',()=>this.disconnect(server));
    server.send(JSON.stringify({type:'welcome',id,version:PROTOCOL_VERSION,capacity,tick:this.tickCount,roomEpoch:this.roomEpoch,substeps:this.lastSubsteps,poseRevision:0}));
    server.send(JSON.stringify({type:'state',world:snapshotFor(this.world,id),tick:this.tickCount,roomEpoch:this.roomEpoch,substeps:this.lastSubsteps,poseRevision:0,control:control.snapshot()}));
    economy.initialWallet();this.refresh();
    if(!this.timer)this.timer=setInterval(()=>this.tick(),50);
    return new Response(null,{status:101,webSocket:client});
  }

  /** Called by the driver's profile before replacing the old fence. */
  async hasWallet(driverId:string,fence:string):Promise<boolean>{
    return this.draining.has(`${driverId}:${fence}`)||[...this.sessions.values()].some(s=>
      (s.economy.walletId===driverId&&s.economy.currentFence===fence)||
      (s.pendingBind?.driverId===driverId&&s.pendingBind.fence===fence));
  }
  async freezeWallet(driverId:string,fence:string):Promise<void>{
    const matches=[...this.sessions.entries()].filter(([,s])=>
      (s.economy.walletId===driverId&&s.economy.currentFence===fence)||
      (s.pendingBind?.driverId===driverId&&s.pendingBind.fence===fence));
    for(const [socket] of matches)this.disconnect(socket,1008,'Driver opened in another room.');
    const detached=this.draining.get(`${driverId}:${fence}`);
    await Promise.all([...matches.map(([,s])=>s.economy.freeze()),...(detached?[detached.freeze()]:[])]);
  }

  private async attachIdentity(socket:WebSocket,session:Session,code:string|null,requestId:number,sequence:number):Promise<void>{
    const current=()=>socket.readyState===1&&this.sessions.get(socket)===session&&session.identitySequence===sequence;
    const send=(ok:boolean,message:string)=>{if(!current())return false;try{socket.send(JSON.stringify({type:'identityResult',requestId,ok,message}));return true;}catch{return false;}};
    if(!current())return;
    let accepted=false,claimed=false;
    const token=crypto.randomUUID(),guestWalletId=session.economy.walletId;
    const chat=this.env.CHAT.get(this.env.CHAT.idFromName('global'));
    try{
      if(code===null){send(false,'Rejoin to start a new guest driver.');return;}
      const identity=await chat.bindWallet(code,guestWalletId,token);
      claimed=identity?.claim??false;
      if(!current())return;
      if(!identity){send(false,'Invalid recovery code.');return;}
      if(!identity.walletId){send(false,'Rejoin before loading a different saved driver.');return;}
      if(identity.walletId===session.economy.walletId){
        const ok=await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(identity.walletId)).activateIncome(session.economy.currentFence);
        if(!current())return;
        if(!ok){send(false,'Session superseded. Rejoin to recover.');return;}
        if(identity.claim && !await chat.confirmWallet(code,token)){
          send(false,'Driver connection changed. Rejoin to retry.');return;
        }
        if(!current())return;
        accepted=send(true,'Saved driver connected.');return;
      }
      if(!session.economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      const fence=crypto.randomUUID(),initial=initialDelivery({x:0,z:0});
      // Register the incoming lease before awaiting it: another acquisition can
      // find and cancel this session even before replace() installs the wallet.
      session.pendingBind={driverId:identity.walletId,fence};
      const result=await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(identity.walletId)).acquire(identity.walletId,fence,progressFrom(initial,[],{},[],0,initial.lifetimeIncome),this.roomId);
      if(!current())return;
      if(!session.economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      if(identity.claim && !await chat.confirmWallet(code,token)){
        send(false,'Driver connection changed. Rejoin to retry.');return;
      }
      if(!current())return;
      session.economy.replace(identity.walletId,fence,result.revision,result.sequence,result.progress);
      session.pendingBind=null;
      session.economy.restoreCurrentVehicle();
      this.invalidate(socket,session,true);
      accepted=send(true,'Saved driver connected.');
    }catch{send(false,'Could not load driver. Rejoin to retry.');}
    finally{
      session.pendingBind=null;
      if(accepted&&claimed&&code!==null)this.ctx.waitUntil(chat.settleWallet(code,token).catch(()=>{}));
      else if(!accepted&&code!==null){
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
      const sequence=++session.identitySequence;
      // A new guest can start immediately; later identity choices must remain
      // ordered behind any recovery already in progress.
      if(message.code===null&&(sequence===1||(session.guest&&!session.attachPending))){session.guest=true;session.attachPending=false;socket.send(JSON.stringify({type:'identityResult',requestId:message.requestId,ok:true,message:'Guest driver ready.'}));return;}
      if(message.code!==null)session.guest=false;
      session.attachPending=true;this.invalidate(socket,session);
      // Autonomous navigation is also a control source: suspend it while an
      // identity is unresolved so the previous driver's route cannot continue.
      const player=this.world.players.find(p=>p.id===session.id);
      const car=this.world.entities.find(e=>e.id===player?.entityId);
      if(car){car.autopilot=false;car.navigation=null;}
      session.identityTail=session.identityTail.then(()=>this.attachIdentity(socket,session,message.code,message.requestId,sequence));
      this.ctx.waitUntil(session.identityTail);
      return;
    }
    if(message.type==='input'){
      if(message.roomEpoch!==this.roomEpoch){this.rejectInput(socket,message,'epoch');return;}
      if(session.attachPending){this.rejectInput(socket,message,'revision');return;}
      const result=session.control.receive(message,this.tickCount,now);
      this.sendEdges(socket,result.outcomes);
      if(result.rejection&&this.sessions.has(socket))this.rejectInput(socket,message,result.rejection);
      return;
    }
    if(message.type==='sync'){session.economy.barrier(message.token);return;}
    if(message.type==='name'){const player=this.world.players.find(p=>p.id===session.id);if(player)player.name=chooseAvailableName(message.name,this.world.players.filter(p=>p.id!==session.id).map(p=>p.name));return;}
    if(message.type==='starship'){
      const driverId=session.economy.walletId,fence=session.economy.currentFence,identitySequence=session.identitySequence;
      const current=()=>this.sessions.get(socket)===session&&!session.attachPending&&session.identitySequence===identitySequence&&session.economy.walletId===driverId&&session.economy.currentFence===fence;
      const send=(value:unknown)=>{if(current())try{socket.send(JSON.stringify(value));}catch{}};
      const run=async()=>{
        if(!current())return;
        const driver=this.env.DRIVERS.get(this.env.DRIVERS.idFromName(driverId));
        if(message.action==='name'){
          try{const result=await driver.setStarshipName(driverId,fence,message.name);send({type:'starshipNameResult',requestId:message.requestId,...result});}
          catch{send({type:'starshipNameResult',requestId:message.requestId,ok:false,publicName:null});}
        }else try{
          if(!await driver.checkFence(fence)||!current())return;
          const income=this.env.INCOME.get(this.env.INCOME.idFromName('global'));
          const [status,publicName]=await Promise.all([income.status(driverId),income.publicName(driverId)]);
          send({type:'starshipStatus',requestId:message.requestId,status,publicName,serverTime:Date.now()});
        }catch{/* The client marks an unanswered status as stale. */}
      };
      const operation=run();this.ctx.waitUntil(operation);return;
    }
    // Even rejected actions advance the action fence so later inputs remain ordered.
    if('edgeBaseline' in message&&!session.control.beginAction(message.actionSeq,message.edgeBaseline)){
      this.disconnect(socket,1008,'Invalid action sequence or edge baseline');return;
    }
    if(session.attachPending){
      if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:false}));
      if(message.type==='vehicleStyle')socket.send(JSON.stringify({type:'vehicleStyleResult',requestId:message.requestId,category:message.category,choice:message.choice,ok:false}));
      if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:false}));
      if(message.type==='destination')socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok:false}));
      if(message.type==='mars')socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok:false,amount:0}));
      if(message.type==='luxury')socket.send(JSON.stringify({type:'luxuryResult',requestId:message.requestId,action:message.action,vehicle:message.vehicle,ok:false,reason:'unavailable'}));
      return;
    }
    if(session.economy.vehicleLocked && (message.type==='interact'||message.type==='reset'||message.type==='selectVehicle'||message.type==='dome'||message.type==='minigame'||(message.type==='race'&&message.action==='join')))return;
    if(message.type==='dome'){if(travelDome(this.world,session.id))this.invalidate(socket,session,true,message.edgeBaseline);return;}
    if(message.type==='minigame'){const before=this.pose(session);if(enterMinigame(this.world,session.id,message.game))this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);return;}
    if(message.type==='parking'&&(message.action==='start'||message.action==='leave')){parkingAction(this.world,session.id,message.action);return;}
    if(message.type==='race'&&(message.action==='start'||message.action==='leave')){raceAction(this.world,session.id,message.action,message.courseId);return;}
    if(now-session.lastAction<400){
      if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:false}));
      if(message.type==='vehicleStyle')socket.send(JSON.stringify({type:'vehicleStyleResult',requestId:message.requestId,category:message.category,choice:message.choice,ok:false}));
      if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:false}));
      if(message.type==='destination')socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok:false}));
      if(message.type==='mars')socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok:false,amount:0}));
      if(message.type==='luxury')socket.send(JSON.stringify({type:'luxuryResult',requestId:message.requestId,action:message.action,vehicle:message.vehicle,ok:false,reason:'cooldown'}));
      return;
    }
    session.lastAction=now;
    if(message.type==='interact'){
      const before=this.world.players.find(player=>player.id===session.id)?.entityId;
      interact(this.world,session.id);
      if(before!==this.world.players.find(player=>player.id===session.id)?.entityId)this.invalidate(socket,session,true,message.edgeBaseline);
    }
    if(message.type==='reset'){const before=this.pose(session);resetPlayer(this.world,session.id);this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);}
    if(message.type==='autopilot'&&toggleAutopilot(this.world,session.id))this.invalidate(socket,session,false,message.edgeBaseline);
    if(message.type==='selectVehicle'&&chooseVehicle(this.world,session.id,message.kind)){session.economy.restoreCurrentVehicle();this.invalidate(socket,session,true,message.edgeBaseline);}
    if(message.type==='parking')parkingAction(this.world,session.id,message.action);
    if(message.type==='race'){const before=this.pose(session);if(message.action==='join'&&raceAction(this.world,session.id,message.action,message.courseId))this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);}
    if(message.type==='destination'){const ok=setDestination(this.world,session.id,{x:message.x,z:message.z});if(ok)this.invalidate(socket,session,false,message.edgeBaseline);socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok}));}
    if(message.type==='upgrade')session.economy.workshop('upgrade',message.requestId,message.upgrade);
    if(message.type==='vehicleStyle')session.economy.workshop('vehicleStyle',message.requestId,message);
    if(message.type==='ota')session.economy.ota(message.enabled,message.requestId);
    if(message.type==='luxury'){
      if(message.action==='collect')session.economy.luxury(message.action,message.vehicle,message.requestId,()=>this.invalidate(socket,session,true,message.edgeBaseline));
      else session.economy.luxury(message.action,message.vehicle,message.requestId);
    }
    if(message.type==='mars'){
      if(message.action==='board')session.economy.boardMars(message.requestId);
      else session.economy.contributeMars(message.amount,message.requestId);
    }
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
    step(this.world,this.inputs,.05,{onSubsteps:count=>{this.lastSubsteps=count;},onRelocation:id=>{
      const player=this.world.players.find(item=>item.id===id);
      const entity=this.world.entities.find(item=>item.id===player?.entityId);
      for(const outcome of edgeResults.get(id)?.outcomes??[]){
        if(outcome.status==='processed'&&entity&&(outcome.kind==='jump'?entity.lastJump:entity.lastFlip)!==outcome.id)outcome.status='superseded';
      }
      this.inputs.delete(id);relocated.add(id);
    },economy:{
      canCollect:id=>{const session=byId.get(id);return !!session&&!session.attachPending;},
      update:(player,apply)=>{const session=byId.get(player.id);if(session&&!session.attachPending){settlement=this.rate(Date.now());try{session.economy.update(player,apply,settlement);}finally{settlement=null;}}},
      pickup:(player,car,pickup)=>{const session=byId.get(player.id);if(session&&!session.attachPending)session.economy.pickup(player,car,pickup);},
      resolveDeliveryPayout:(_player,component)=>settlement?activityPayout(component.amount,component.kind,settlement.atMs,settlement.events):null,
      onDomeWin:result=>{if(result.winners.length)this.recordWin();},
    }});
    this.tickCount=nextTick;
    for(const {socket,outcomes} of edgeResults.values())this.sendEdges(socket,outcomes);
    for(const [socket,session] of this.sessions)if(relocated.has(session.id))this.invalidate(socket,session,true);
    if(!this.sessions.size||this.tickCount%2)return;
    const snapshot=prepareSnapshots(this.world,this.tickCount,this.roomEpoch,this.lastSubsteps);
    for(const [socket,session] of this.sessions){try{socket.send(snapshot(session.id,session.control.snapshot(),session.poseRevision,session.economy.sync()));}catch{this.disconnect(socket);}}
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
    if(relocated)session.poseRevision++;
    this.sendEdges(socket,session.control.invalidate({...NEUTRAL,jump:entity?.lastJump??0,flip:entity?.lastFlip??0},edgeBaseline?{type:'action',edgeBaseline}:{type:'relocation'}));
  }

  private disconnect(socket:WebSocket,code=1000,reason='Session ended'):void{
    const session=this.sessions.get(socket);if(!session)return;
    this.sessions.delete(socket);this.inputs.delete(session.id);
    // The departing driver may still have an uncommitted final timer checkpoint.
    // Keep it discoverable until drained so a reconnect cannot overtake it.
    const economy=session.economy,key=`${economy.walletId}:${economy.currentFence}`;
    economy.finish();this.draining.set(key,economy);
    this.ctx.waitUntil(economy.freeze().finally(()=>{if(this.draining.get(key)===economy)this.draining.delete(key);}));
    removePlayer(this.world,session.id);
    try{socket.close(code,reason);}catch{}
    if(!this.sessions.size){
      if(this.timer)clearInterval(this.timer);
      const {fund,roomFund}=this.world.mars;this.timer=null;this.tickCount=0;this.lastSubsteps=1;this.roomEpoch=crypto.randomUUID();this.world=createWorld(Math.floor(Math.random()*VEHICLE_IDS.length));this.world.mars.fund=fund;this.world.mars.roomFund=roomFund;
      this.ready=null;this.pickupGenerations=new Map();this.pendingPickups=new Set();
    }
  }
}
