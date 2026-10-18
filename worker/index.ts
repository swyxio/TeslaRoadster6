import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, NEUTRAL, NoSpawnError, buyUpgrade, subscribeOta, chooseVehicle, toggleAutopilot, addPlayer, createWorld, interact, parkingAction, raceAction, enterMinigame, setDestination, removePlayer, resetPlayer, step, travelDome, type Input } from '../shared/game';
import { ScheduledInput, type EdgeBaseline, type EdgeOutcome } from '../shared/tick-input';
import { parseMessage, roomCapacity, roomSlug } from './protocol';
import { prepareSnapshots, snapshotFor } from './snapshot';
import { GlobalChat } from './global-chat';
import { chooseAvailableName } from './global-chat-core';
import { radioFeed } from './radio';
import { MARS_GOAL, applyMarsContribution, boardMars, marsContribution } from '../shared/mars';
import { VEHICLE_IDS } from '../shared/vehicles';

export { GlobalChat };

type Env = { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<GameRoom>; CHAT: DurableObjectNamespace<GlobalChat>; MAX_PLAYERS?: string };
type Session = { id: string; lastMessage: number; windowStart: number; count: number; lastAction: number; control:ScheduledInput; poseRevision:number; pendingSync:number };
type ControlledPose = {id:string;x:number;y:number;z:number;yaw:number;pitch:number;roll:number};
const reply = (body: string, status: number) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
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

// Physics and player cash are session-only. The room's Mars fund is durable.
export class GameRoom extends DurableObject<Env> {
  private world = createWorld(Math.floor(Math.random()*VEHICLE_IDS.length));
  private sessions = new Map<WebSocket, Session>();
  private inputs = new Map<string, Input>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private roomEpoch = crypto.randomUUID();
  private lastSubsteps = 1;

  constructor(ctx:DurableObjectState,env:Env) {
    super(ctx,env);
    ctx.blockConcurrencyWhile(async()=>{
      const fund=await ctx.storage.get<number>('mars-fund');
      if(Number.isSafeInteger(fund) && fund!>=0 && fund!<=MARS_GOAL)this.world.mars.fund=fund!;
    });
  }

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
    const control=new ScheduledInput({...NEUTRAL});
    this.sessions.set(server, { id, lastMessage: now, windowStart: now, count: 0, lastAction: 0, control, poseRevision:0, pendingSync:0 });
    server.addEventListener('message', event => { void this.onMessage(server, event.data); });
    server.addEventListener('close', () => this.disconnect(server));
    server.addEventListener('error', () => this.disconnect(server));
    server.send(JSON.stringify({ type: 'welcome', id, version: PROTOCOL_VERSION, capacity, tick:this.tickCount, roomEpoch:this.roomEpoch, substeps:this.lastSubsteps, poseRevision:0 }));
    server.send(JSON.stringify({ type: 'state', world: snapshotFor(this.world, id), tick:this.tickCount, roomEpoch:this.roomEpoch, substeps:this.lastSubsteps, poseRevision:0, control:control.snapshot() }));
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
      if(message.roomEpoch!==this.roomEpoch){this.rejectInput(socket,message,'epoch');return;}
      const result=session.control.receive(message,this.tickCount,now);
      this.sendEdges(socket,result.outcomes);
      if(result.rejection&&this.sessions.has(socket))this.rejectInput(socket,message,result.rejection);
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
    // Fence every potentially invalidating action, including cooldown and
    // simulation rejections. Only accepted actions consume its baseline.
    if('edgeBaseline' in message&&!session.control.beginAction(message.actionSeq,message.edgeBaseline)){
      this.disconnect(socket,1008,'Invalid action sequence or edge baseline');return;
    }
    // Joining and controlling a mini-game are often consecutive clicks. The
    // simulation checks membership, host and position; the socket rate limit
    // still applies, but the unrelated action cooldown must not drop them.
    if(message.type==='dome'){if(travelDome(this.world,session.id))this.invalidate(socket,session,true,message.edgeBaseline);return;}
    if(message.type==='minigame'){const before=this.pose(session);if(enterMinigame(this.world,session.id,message.game))this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);return;}
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
    if (message.type === 'interact') {
      const before=this.world.players.find(player=>player.id===session.id)?.entityId;
      interact(this.world,session.id);
      if(before!==this.world.players.find(player=>player.id===session.id)?.entityId)this.invalidate(socket,session,true,message.edgeBaseline);
    }
    if (message.type === 'reset') {const before=this.pose(session);resetPlayer(this.world, session.id);this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);}
    if(message.type==='autopilot'&&toggleAutopilot(this.world,session.id))this.invalidate(socket,session,false,message.edgeBaseline);
    if(message.type==='selectVehicle'&&chooseVehicle(this.world,session.id,message.kind))this.invalidate(socket,session,true,message.edgeBaseline);
    if(message.type==='parking')parkingAction(this.world,session.id,message.action);
    if(message.type==='race'){const before=this.pose(session);if(message.action==='join'&&raceAction(this.world,session.id,message.action,message.courseId))this.invalidate(socket,session,this.poseChanged(before,this.pose(session)),message.edgeBaseline);}
    if(message.type==='destination'){
      const ok=setDestination(this.world,session.id,{x:message.x,z:message.z});
      if(ok)this.invalidate(socket,session,false,message.edgeBaseline);
      socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok}));
    }
    if(message.type==='upgrade')socket.send(JSON.stringify({type:'upgradeResult',requestId:message.requestId,upgrade:message.upgrade,ok:buyUpgrade(this.world,session.id,message.upgrade)}));
    if(message.type==='ota')socket.send(JSON.stringify({type:'otaResult',requestId:message.requestId,enabled:message.enabled,ok:subscribeOta(this.world,session.id,message.enabled)}));
    if(message.type==='mars'){
      if(message.action==='board'){
        const ok=boardMars(this.world,session.id);
        socket.send(JSON.stringify({type:'marsResult',requestId:message.requestId,action:message.action,ok,amount:0}));
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
    const now = Date.now();
    for (const [socket, session] of this.sessions) {
      if (now - session.lastMessage > 30_000) this.disconnect(socket, 1001, 'Connection inactive');
    }
    if (!this.sessions.size) return;
    const nextTick=this.tickCount+1;
    const edgeResults=new Map<string,{socket:WebSocket;outcomes:EdgeOutcome[]}>();
    for(const [socket,session] of this.sessions){
      const result=session.control.advance(nextTick,now);
      this.inputs.set(session.id,result.input);
      if(result.outcomes.length)edgeResults.set(session.id,{socket,outcomes:result.outcomes});
    }
    const relocated=new Set<string>();
    step(this.world, this.inputs, 0.05,{onSubsteps:count=>{this.lastSubsteps=count;},onRelocation:id=>{
      // Ferry apron moves happen before that substep consumes controls; water
      // recovery happens after. Stop both from carrying old input forward.
      const player=this.world.players.find(item=>item.id===id);
      const entity=this.world.entities.find(item=>item.id===player?.entityId);
      for(const outcome of edgeResults.get(id)?.outcomes??[]){
        if(outcome.status==='processed'&&entity&&(outcome.kind==='jump'?entity.lastJump:entity.lastFlip)!==outcome.id)outcome.status='superseded';
      }
      this.inputs.delete(id);
      relocated.add(id);
    }});
    this.tickCount=nextTick;
    for(const {socket,outcomes} of edgeResults.values())this.sendEdges(socket,outcomes);
    for(const [socket,session] of this.sessions)if(relocated.has(session.id))this.invalidate(socket,session,true);
    if(!this.sessions.size)return;
    if (this.tickCount % 2) return;
    const snapshot = prepareSnapshots(this.world,this.tickCount,this.roomEpoch,this.lastSubsteps);
    for (const [socket, session] of this.sessions) {
      try {
        socket.send(snapshot(session.id,session.control.snapshot(),session.poseRevision,session.pendingSync||undefined));
        session.pendingSync=0;
      } catch { this.disconnect(socket); }
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
    if(relocated)session.poseRevision++;
    this.sendEdges(socket,session.control.invalidate({...NEUTRAL,jump:entity?.lastJump??0,flip:entity?.lastFlip??0},edgeBaseline?{type:'action',edgeBaseline}:{type:'relocation'}));
  }

  private disconnect(socket: WebSocket, code = 1000, reason = 'Session ended'): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket); this.inputs.delete(session.id); removePlayer(this.world, session.id);
    try { socket.close(code, reason); } catch { /* Already disconnected. */ }
    if (!this.sessions.size) {
      if (this.timer) clearInterval(this.timer);
      const fund=this.world.mars.fund;
      this.timer = null; this.tickCount = 0; this.lastSubsteps=1;this.roomEpoch=crypto.randomUUID();this.world = createWorld(Math.floor(Math.random()*VEHICLE_IDS.length)); this.world.mars.fund=fund;
    }
  }
}
