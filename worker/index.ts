import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, NoSpawnError, chooseVehicle, toggleAutopilot, addPlayer, createWorld, interact, parkingAction, raceAction, enterMinigame, setDestination, removePlayer, resetPlayer, step, travelDome, type Input } from '../shared/game';
import { parseMessage, roomCapacity, roomSlug } from './protocol';
import { prepareSnapshots, snapshotFor } from './snapshot';
import { GlobalChat } from './global-chat';
import { chooseAvailableName } from './global-chat-core';
import { radioFeed } from './radio';
import { MARS_GOAL } from '../shared/mars';
import { initialDelivery } from '../shared/delivery';
import { EconomySession } from './economy-session';
import { DriverProfile, GlobalIncome, progressFrom } from './driver-profile';
import { RoomEconomy } from './room-economy';

export { GlobalChat, DriverProfile, GlobalIncome, RoomEconomy };

type Env = { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<GameRoom>; CHAT: DurableObjectNamespace<GlobalChat>; DRIVERS: DurableObjectNamespace<DriverProfile>; ECONOMIES: DurableObjectNamespace<RoomEconomy>; INCOME: DurableObjectNamespace<GlobalIncome>; MAX_PLAYERS?: string };
type Session = { id:string; lastInput:number; lastMessage:number; windowStart:number; count:number; lastAction:number; inputSeq:number; appliedSeq:number; economy:EconomySession; identityTail:Promise<void>; attachPending:boolean; deferred:string[]; identitySequence:number; pendingBind:{driverId:string;fence:string}|null };
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

// Physics stays room-local; economy writes are isolated per player.
export class GameRoom extends DurableObject<Env> {
  private world=createWorld();
  private sessions=new Map<WebSocket,Session>();
  private inputs=new Map<string,Input>();
  private draining=new Map<string,EconomySession>();
  private timer:ReturnType<typeof setInterval>|null=null;
  private tickCount=0;
  private roomId='';
  private ready:Promise<void>|null=null;
  private pickupGenerations=new Map<string,number>();
  private pendingPickups=new Set<string>();
  private nextRefresh=0;
  private refreshing=false;

  private ledger(){return this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(this.roomId));}
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
    this.ready??=this.refreshPickups(world);
    const walletId=crypto.randomUUID(),fence=crypto.randomUUID();
    const initial=initialDelivery({x:0,z:0});
    let acquired:Awaited<ReturnType<DriverProfile['acquire']>>;
    try{
      [acquired]=await Promise.all([
        this.env.DRIVERS.get(this.env.DRIVERS.idFromName(walletId)).acquire(walletId,fence,progressFrom(initial,[],{},[],0,initial.lifetimeIncome),slug),
        this.ready,
      ]);
    }catch{this.ready=null;return close(1011,'Wallet unavailable. Rejoin to retry.');}
    if(this.world!==world){this.ready=null;try{await(this.ready=this.refreshPickups(this.world));}catch{this.ready=null;return close(1011,'Room unavailable');}}
    if(this.sessions.size>=capacity)return close(ROOM_FULL_CODE,'Room full');
    const id=crypto.randomUUID(),now=Date.now();
    let player;
    try{player=addPlayer(this.world,id,chooseAvailableName('Driver',this.world.players.map(p=>p.name)));}
    catch(error){if(!(error instanceof NoSpawnError))throw error;return close(ROOM_NO_SPAWN_CODE,'No safe starting space');}
    const economy=new EconomySession(this.env,this.ledger(),this.world,player,server,walletId,fence,slug,acquired.revision,acquired.sequence,acquired.progress,this.pickupGenerations,this.pendingPickups);
    const session:Session={id,lastInput:now,lastMessage:now,windowStart:now,count:0,lastAction:0,inputSeq:0,appliedSeq:0,economy,identityTail:Promise.resolve(),attachPending:false,deferred:[],identitySequence:0,pendingBind:null};
    this.sessions.set(server,session);
    server.addEventListener('message',event=>{void this.onMessage(server,event.data);});
    server.addEventListener('close',()=>this.disconnect(server));
    server.addEventListener('error',()=>this.disconnect(server));
    server.send(JSON.stringify({type:'welcome',id,version:PROTOCOL_VERSION,capacity}));
    server.send(JSON.stringify({type:'state',world:snapshotFor(this.world,id),inputAck:0}));
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
    const send=(ok:boolean,message:string)=>{if(current())try{socket.send(JSON.stringify({type:'identityResult',requestId,ok,message}));}catch{}};
    if(!current())return;
    if(code===null){send(true,'Guest selected. Rejoin to start a new driver.');return;}
    try{
      const identity=await this.env.CHAT.get(this.env.CHAT.idFromName('global')).bindWallet(code,session.economy.walletId);
      if(!current())return;
      if(!identity){send(false,'Invalid recovery code.');return;}
      if(identity.walletId===session.economy.walletId){
        const ok=await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(identity.walletId)).activateIncome(session.economy.currentFence);
        send(ok,ok?'Saved driver connected.':'Session superseded. Rejoin to recover.');return;
      }
      if(!session.economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      session.attachPending=true;
      const fence=crypto.randomUUID(),initial=initialDelivery({x:0,z:0});
      // Register the incoming lease before awaiting it: another acquisition can
      // find and cancel this session even before replace() installs the wallet.
      session.pendingBind={driverId:identity.walletId,fence};
      const result=await this.env.DRIVERS.get(this.env.DRIVERS.idFromName(identity.walletId)).acquire(identity.walletId,fence,progressFrom(initial,[],{},[],0,initial.lifetimeIncome),this.roomId);
      if(!current())return;
      if(!session.economy.unstarted){send(false,'Rejoin before loading a different saved driver.');return;}
      session.economy.replace(identity.walletId,fence,result.revision,result.sequence,result.progress);
      session.pendingBind=null;
      session.economy.restoreCurrentVehicle();
      send(true,'Saved driver connected.');
    }catch{send(false,'Could not load driver. Rejoin to retry.');}
    finally{
      session.attachPending=false;session.pendingBind=null;
      if(this.sessions.get(socket)===session){
        const deferred=session.deferred.splice(0);
        for(const raw of deferred)void this.onMessage(socket,raw);
      }
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
      session.identityTail=session.identityTail.then(()=>this.attachIdentity(socket,session,message.code,message.requestId,sequence));
      return;
    }
    if(message.type==='input'){if(message.seq>session.inputSeq){this.inputs.set(session.id,message.input);session.lastInput=now;session.inputSeq=message.seq;}return;}
    if(session.attachPending){if(session.deferred.length<90)session.deferred.push(raw);else this.disconnect(socket,1008,'Too many queued actions');return;}
    if(message.type==='sync'){session.economy.barrier(message.token);return;}
    if(message.type==='name'){const player=this.world.players.find(p=>p.id===session.id);if(player)player.name=chooseAvailableName(message.name,this.world.players.filter(p=>p.id!==session.id).map(p=>p.name));return;}
    if(session.economy.vehicleLocked && (message.type==='interact'||message.type==='reset'||message.type==='selectVehicle'||message.type==='dome'||message.type==='minigame'))return;
    if(message.type==='dome'){travelDome(this.world,session.id);this.inputs.delete(session.id);return;}
    if(message.type==='minigame'){if(enterMinigame(this.world,session.id,message.game))this.inputs.delete(session.id);return;}
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
    if(message.type==='interact')interact(this.world,session.id);
    if(message.type==='reset')resetPlayer(this.world,session.id);
    if(message.type==='autopilot')toggleAutopilot(this.world,session.id);
    if(message.type==='selectVehicle'){if(chooseVehicle(this.world,session.id,message.kind))session.economy.restoreCurrentVehicle();}
    if(message.type==='parking')parkingAction(this.world,session.id,message.action);
    if(message.type==='race')raceAction(this.world,session.id,message.action,message.courseId);
    if(message.type==='destination'){const ok=setDestination(this.world,session.id,{x:message.x,z:message.z});if(ok)this.inputs.delete(session.id);socket.send(JSON.stringify({type:'destinationResult',requestId:message.requestId,ok}));}
    if(message.type==='upgrade')session.economy.workshop('upgrade',message.requestId,message.upgrade);
    if(message.type==='vehicleStyle')session.economy.workshop('vehicleStyle',message.requestId,message);
    if(message.type==='ota')session.economy.ota(message.enabled,message.requestId);
    if(message.type==='luxury')session.economy.luxury(message.action,message.vehicle,message.requestId);
    if(message.type==='mars')session.economy.boardMars(message.requestId);
  }

  private tick():void{
    const now=Date.now();
    for(const [socket,session] of this.sessions){
      if(now-session.lastInput>300)this.inputs.delete(session.id);
      if(now-session.lastMessage>30_000)this.disconnect(socket,1001,'Connection inactive');
    }
    if(!this.sessions.size)return;
    if(now>=this.nextRefresh){this.nextRefresh=now+2000;this.refresh();}
    const byId=new Map([...this.sessions.values()].map(s=>[s.id,s]));
    let inputs=this.inputs;
    if([...byId.values()].some(s=>s.attachPending)){inputs=new Map(this.inputs);for(const s of byId.values())if(s.attachPending)inputs.delete(s.id);}
    for(const session of byId.values())if(inputs.has(session.id))session.appliedSeq=session.inputSeq;
    step(this.world,inputs,.05,{
      update:(player,apply)=>{const session=byId.get(player.id);if(session&&!session.attachPending)session.economy.update(player,apply);},
      pickup:(player,car,pickup)=>{const session=byId.get(player.id);if(session&&!session.attachPending)session.economy.pickup(player,car,pickup);},
    });
    if(++this.tickCount%2)return;
    const snapshot=prepareSnapshots(this.world);
    for(const [socket,session] of this.sessions){try{socket.send(snapshot(session.id,session.appliedSeq,session.economy.sync()));}catch{this.disconnect(socket);}}
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
      const fund=this.world.mars.fund;this.timer=null;this.tickCount=0;this.world=createWorld();this.world.mars.fund=fund;
      this.ready=null;this.pickupGenerations=new Map();this.pendingPickups=new Set();
    }
  }
}
