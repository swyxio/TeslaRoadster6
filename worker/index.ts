import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, NoSpawnError, buyUpgrade, subscribeOta, chooseVehicle, toggleAutopilot, addPlayer, createWorld, interact, parkingAction, raceAction, enterMinigame, setDestination, removePlayer, resetPlayer, step, travelDome, type Input } from '../shared/game';
import { parseMessage, roomCapacity, roomSlug } from './protocol';
import { prepareSnapshots, snapshotFor } from './snapshot';
import { GlobalChat } from './global-chat';
import { chooseAvailableName } from './global-chat-core';
import { radioFeed } from './radio';
import { MARS_GOAL, applyMarsContribution, boardMars, marsContribution } from '../shared/mars';
import type { AchievementId } from '../shared/achievements';
import { RoomAwardOutbox } from './room-awards';

export { GlobalChat };

type Env = { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<GameRoom>; CHAT: DurableObjectNamespace<GlobalChat>; MAX_PLAYERS?: string };
type BoundAwards = { playerId:string; seen:Set<AchievementId>; saving:Promise<boolean>|null; retryAt:number; failed:boolean };
type RetiringAwards = { playerId:string; ids:AchievementId[]; saving:Promise<boolean>|null; retryAt:number; failed:boolean };
type Session = { id: string; lastInput: number; lastMessage: number; windowStart: number; count: number; lastAction: number; inputSeq:number; appliedSeq:number; pendingSync:number; awards:BoundAwards|null; retiringAwards:RetiringAwards|null; binding:boolean; bindEpoch:number };
const reply = (body: string, status: number) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function withTimeout<T>(task:Promise<T>,ms:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out')),ms);})]);}
  finally{if(timer)clearTimeout(timer);}
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/api/radio/')) return radioFeed(request, ctx);
    if (url.pathname === '/api/health') return Response.json({ ok: true, version: PROTOCOL_VERSION, capacity: roomCapacity(env.MAX_PLAYERS) });
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

// Physics and player cash are session-only. The Mars fund and award outbox are durable.
export class GameRoom extends DurableObject<Env> {
  private world = createWorld();
  private sessions = new Map<WebSocket, Session>();
  private inputs = new Map<string, Input>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private ticking = false;
  private awardOutbox:RoomAwardOutbox;

  constructor(ctx:DurableObjectState,env:Env) {
    super(ctx,env);
    this.awardOutbox=new RoomAwardOutbox(ctx.storage,()=>this.awardBridge(),promise=>ctx.waitUntil(promise));
    ctx.blockConcurrencyWhile(async()=>{
      const fund=await ctx.storage.get<number>('mars-fund');
      if(Number.isSafeInteger(fund) && fund!>=0 && fund!<=MARS_GOAL)this.world.mars.fund=fund!;
      await this.awardOutbox.load();
    });
  }

  private awardBridge() {
    return this.env.CHAT.get(this.env.CHAT.idFromName('global')) as unknown as {
      consumeAwardTicket(ticket:string):Promise<string|null>;
      recordRoomAwards(playerId:string,ids:AchievementId[]):Promise<unknown>;
    };
  }
  async alarm() { await this.awardOutbox.alarm(); }

  fetch(): Response {
    const capacity = roomCapacity(this.env.MAX_PLAYERS);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Browsers cannot inspect a rejected WebSocket upgrade's HTTP status.
    if (this.sessions.size >= capacity) {
      server.accept();
      server.close(ROOM_FULL_CODE, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    server.accept();
    try {
      addPlayer(this.world, id, chooseAvailableName('Driver', this.world.players.map(player => player.name)));
    } catch (error) {
      if (!(error instanceof NoSpawnError)) { server.close(1011, 'Could not start session'); throw error; }
      server.close(ROOM_NO_SPAWN_CODE, 'No safe starting space');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.sessions.set(server, { id, lastInput: now, lastMessage: now, windowStart: now, count: 0, lastAction: 0, inputSeq:0, appliedSeq:0, pendingSync:0, awards:null, retiringAwards:null, binding:false, bindEpoch:0 });
    server.addEventListener('message', event => { void this.onMessage(server, event.data); });
    server.addEventListener('close', () => this.disconnect(server));
    server.addEventListener('error', () => this.disconnect(server));
    server.send(JSON.stringify({ type: 'welcome', id, version: PROTOCOL_VERSION, capacity }));
    server.send(JSON.stringify({ type: 'state', world: snapshotFor(this.world, id), inputAck:0 }));
    if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const session = this.sessions.get(socket);
    if (!session) return;
    const now = Date.now();
    if (now - session.windowStart >= 1000) { session.windowStart = now; session.count = 0; }
    if (++session.count > 90) { this.disconnect(socket, 1008, 'Message rate exceeded'); return; }
    if (typeof raw !== 'string' || raw.length > 1024) { this.disconnect(socket, 1009, 'Text messages up to 1024 characters required'); return; }
    const message = parseMessage(raw);
    if (!message) { this.disconnect(socket, 1008, 'Invalid message'); return; }
    session.lastMessage = now;
    if (message.type === 'input') {
      if(message.seq>session.inputSeq){this.inputs.set(session.id, message.input);session.lastInput=now;session.inputSeq=message.seq;}
      return;
    }
    const awardBind=message as {type:string;ticket:string;requestId:number};
    if(awardBind.type==='unbindAwards'){
      void this.unbindAwards(socket,session,awardBind.requestId);
      return;
    }
    if(awardBind.type==='bindAwards'){
      if(session.binding){socket.send(JSON.stringify({type:'awardsBound',requestId:awardBind.requestId,ok:false,reason:'busy'}));return;}
      session.binding=true;
      void this.bindAwards(socket,session,awardBind.ticket,awardBind.requestId,session.bindEpoch).finally(()=>{session.binding=false;});
      return;
    }
    // Coalesce barriers into the next regular snapshot. WebSocket ordering
    // places it after preceding actions, including cooldown rejections.
    if(message.type==='sync'){
      session.pendingSync=Math.max(session.pendingSync,message.token);
      return;
    }
    if (message.type === 'name') {
      const player = this.world.players.find(p => p.id === session.id);
      if (player) player.name = chooseAvailableName(message.name, this.world.players.filter(p => p.id !== session.id).map(p => p.name));
      return;
    }
    // Joining and controlling a mini-game are often consecutive clicks. The
    // simulation checks membership, host and position; the socket rate limit
    // still applies, but the unrelated action cooldown must not drop them.
    if(message.type==='dome'){travelDome(this.world,session.id);this.inputs.delete(session.id);return;}
    if(message.type==='minigame'){if(enterMinigame(this.world,session.id,message.game))this.inputs.delete(session.id);return;}
    if(message.type==='parking'&&(message.action==='start'||message.action==='leave')){parkingAction(this.world,session.id,message.action);return;}
    if(message.type==='race'&&(message.action==='start'||message.action==='leave')){raceAction(this.world,session.id,message.action,message.courseId);return;}
    if (now - session.lastAction < 400) {
      if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:false}));
      if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:false}));
      if(message.type==='destination')socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok:false}));
      if(message.type==='mars')socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok:false,amount:0}));
      return;
    }
    session.lastAction = now;
    if (message.type === 'interact') interact(this.world, session.id);
    if (message.type === 'reset') resetPlayer(this.world, session.id);
    if(message.type==='autopilot')toggleAutopilot(this.world,session.id);
    if(message.type==='selectVehicle')chooseVehicle(this.world,session.id,message.kind);
    if(message.type==='parking')parkingAction(this.world,session.id,message.action);
    if(message.type==='race')raceAction(this.world,session.id,message.action,message.courseId);
    if(message.type==='destination'){
      const ok=setDestination(this.world,session.id,{x:message.x,z:message.z});
      if(ok)this.inputs.delete(session.id);
      socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok}));
    }
    if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:buyUpgrade(this.world,session.id,message.upgrade)}));
    if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:subscribeOta(this.world,session.id,message.enabled)}));
    if(message.type==='mars'){
      if(message.action==='board'){
        const ok=boardMars(this.world,session.id);
        if(ok)await this.saveSessionAwards(socket,session,true);
        try { socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok,amount:0})); } catch { /* Disconnected while saving. */ }
      }else{
        const amount=marsContribution(this.world,session.id,message.amount);
        let ok=false;
        if(amount>0){
          let saved=false;
          try {
            // The storage input gate keeps later sync events behind this continuation;
            // the output gate holds messages until the write is durable.
            await this.ctx.storage.put('mars-fund',this.world.mars.fund+amount);
            saved=true;
          } catch { /* No cash is deducted if the contribution cannot be saved. */ }
          if(saved){applyMarsContribution(this.world,session.id,amount);ok=true;}
        }
        try { socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok,amount:ok?amount:0})); } catch { /* The driver disconnected while saving. */ }
      }
    }
  }

  private tick(): void {
    if(this.ticking)return;
    this.ticking=true;
    void this.runTick().finally(()=>{this.ticking=false;});
  }

  private async runTick(): Promise<void> {
    const now = Date.now();
    for (const [socket, session] of this.sessions) {
      if (now - session.lastInput > 300) this.inputs.delete(session.id);
      if (now - session.lastMessage > 30_000) this.disconnect(socket, 1001, 'Connection inactive');
    }
    if (!this.sessions.size) return;
    for(const session of this.sessions.values())if(this.inputs.has(session.id))session.appliedSeq=session.inputSeq;
    step(this.world, this.inputs, 0.05);
    await Promise.all([...this.sessions].flatMap(([socket,session])=>[this.saveSessionAwards(socket,session),this.saveRetiringAwards(socket,session)]));
    if (++this.tickCount % 2) return;
    const snapshot = prepareSnapshots(this.world);
    for (const [socket, session] of this.sessions) {
      try {
        socket.send(snapshot(session.id,session.appliedSeq,session.pendingSync||undefined));
        session.pendingSync=0;
      } catch { this.disconnect(socket); }
    }
  }

  private unsavedAwards(session:Session, bound:BoundAwards):AchievementId[] {
    const player=this.world.players.find(player=>player.id===session.id);
    return player?.achievements.unlocked.filter(id=>!bound.seen.has(id))??[];
  }

  private saveSessionAwards(socket:WebSocket,session:Session,force=false):Promise<boolean> {
    const bound=session.awards;
    if(!bound)return Promise.resolve(true);
    if(bound.saving)return bound.saving;
    const ids=this.unsavedAwards(session,bound);
    if(!ids.length)return Promise.resolve(true);
    if(!force&&Date.now()<bound.retryAt)return Promise.resolve(false);
    const task=this.awardOutbox.enqueue(bound.playerId,ids).then(()=>{
      for(const id of ids)bound.seen.add(id);
      bound.retryAt=0;
      if(bound.failed){bound.failed=false;if(session.awards===bound)try{socket.send(JSON.stringify({type:'awardsSync',ok:true}));}catch{}}
      return true;
    },()=>{
      bound.retryAt=Date.now()+1_000;
      if(!bound.failed){bound.failed=true;if(session.awards===bound)try{socket.send(JSON.stringify({type:'awardsSync',ok:false}));}catch{}}
      return false;
    }).finally(()=>{bound.saving=null;});
    bound.saving=task;
    return task;
  }

  private saveRetiringAwards(socket:WebSocket,session:Session,force=false):Promise<boolean> {
    const retiring=session.retiringAwards;
    if(!retiring)return Promise.resolve(true);
    if(retiring.saving)return retiring.saving;
    if(!force&&Date.now()<retiring.retryAt)return Promise.resolve(false);
    const task=this.awardOutbox.enqueue(retiring.playerId,retiring.ids).then(()=>{
      if(session.retiringAwards===retiring){session.retiringAwards=null;this.awardOutbox.release(retiring.playerId);}
      if(retiring.failed)try{socket.send(JSON.stringify({type:'awardsSync',ok:true}));}catch{}
      return true;
    },()=>{
      retiring.retryAt=Date.now()+1_000;
      if(!retiring.failed){retiring.failed=true;try{socket.send(JSON.stringify({type:'awardsSync',ok:false}));}catch{}}
      return false;
    }).finally(()=>{retiring.saving=null;});
    retiring.saving=task;
    return task;
  }

  private async unbindAwards(socket:WebSocket,session:Session,requestId:number):Promise<void> {
    // Freeze attribution before any asynchronous storage or ticket RPC.
    session.bindEpoch++;
    const bound=session.awards;
    if(bound){
      const ids=this.unsavedAwards(session,bound);
      session.awards=null;
      if(ids.length)session.retiringAwards={playerId:bound.playerId,ids,saving:null,retryAt:0,failed:false};
      else this.awardOutbox.release(bound.playerId);
    }
    const ok=await this.saveRetiringAwards(socket,session,true);
    try { socket.send(JSON.stringify({type:'awardsUnbound',requestId,ok})); } catch { /* Disconnected while saving. */ }
  }

  private async bindAwards(socket:WebSocket,session:Session,ticket:string,requestId:number,epoch=session.bindEpoch):Promise<void> {
    let ok=false,reason:'invalid'|'capacity'|'storage'|'unavailable'='invalid';
    try {
      const playerId=await withTimeout(this.awardBridge().consumeAwardTicket(ticket),5_000);
      if(playerId&&this.sessions.get(socket)===session&&session.bindEpoch===epoch){
        if(session.retiringAwards&&!await this.saveRetiringAwards(socket,session,true))reason='storage';
        if(this.sessions.get(socket)!==session||session.bindEpoch!==epoch)return;
        // The old owner's newly earned awards must be queued before switching.
        while(reason!=='storage'&&session.awards&&this.unsavedAwards(session,session.awards).length){
          if(!await this.saveSessionAwards(socket,session,true)){reason='storage';break;}
          if(this.sessions.get(socket)!==session||session.bindEpoch!==epoch)return;
        }
        const previous=session.awards;
        if(reason==='storage') { /* Keep the old identity until its awards are queued. */ }
        else if(previous?.playerId===playerId)ok=true;
        else if(this.awardOutbox.reserve(playerId)){
          const player=this.world.players.find(p=>p.id===session.id);
          if(player){
            session.awards={playerId,seen:new Set(player.achievements.unlocked),saving:null,retryAt:0,failed:false};
            if(previous)this.awardOutbox.release(previous.playerId);
            ok=true;
          }else this.awardOutbox.release(playerId);
        } else reason='capacity';
      }
    } catch { reason='unavailable'; }
    try { socket.send(JSON.stringify(ok?{type:'awardsBound',requestId,ok}:{type:'awardsBound',requestId,ok,reason})); } catch { /* Disconnected while binding. */ }
  }

  private disconnect(socket: WebSocket, code = 1000, reason = 'Session ended'): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    // Capture before removing the player; an in-flight durable write continues
    // after the socket closes. Once queued, alarms retry delivery across restarts.
    const pending=this.saveSessionAwards(socket,session,true);
    this.ctx.waitUntil(pending);
    this.ctx.waitUntil(this.saveRetiringAwards(socket,session,true));
    if(session.awards){
      const {playerId}=session.awards,ids=this.unsavedAwards(session,session.awards);
      // Include awards earned while a previous write was still in flight.
      if(ids.length)this.ctx.waitUntil(this.awardOutbox.enqueue(playerId,ids).catch(()=>{}));
      this.awardOutbox.release(playerId);
    }
    this.sessions.delete(socket); this.inputs.delete(session.id); removePlayer(this.world, session.id);
    try { socket.close(code, reason); } catch { /* Already disconnected. */ }
    if (!this.sessions.size) {
      if (this.timer) clearInterval(this.timer);
      const fund=this.world.mars.fund;
      this.timer = null; this.tickCount = 0; this.world = createWorld(); this.world.mars.fund=fund;
    }
  }
}
