import type { VehicleId } from '../shared/vehicles';
import { NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, createEmptyWorld, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';
import type { StyleChoice } from '../shared/vehicle-style';
import type { AchievementId } from '../shared/achievements';
import type { LuxuryVehicleId } from '../shared/luxury';
import { TickPrediction } from './tick-prediction';
import { MotionClock } from './motion-clock';
import { RemotePresentation } from './remote-presentation';
import { validStarshipStatus, validStarshipTime, type StarshipRoomStatus } from './starship-model';
export const DEFAULT_ROOM = 'bay';
export const validRoom = (room:string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export type SessionStatus = 'connecting' | 'online' | 'disconnected';
export type WalletStatus = 'guest' | 'connecting' | 'syncing' | 'ready' | 'failed';
const WALLET_TIMEOUT_MS=15_000;
export type WalletView = {cash:number;earned:number;eligibleIncome:number;level:number;unlocked:AchievementId[];ownedLuxury:LuxuryVehicleId[]};
export type LuxuryResult = {requestId:number;action:'buy'|'collect';vehicle:LuxuryVehicleId;ok:boolean;reason?:string;awards?:AchievementId[]};
export class Session {
  world: World = createEmptyWorld();
  id = '';
  status: SessionStatus = 'disconnected';
  capacity = 0;
  snapshotVersion = 0;
  walletStatus:WalletStatus = 'guest';
  walletError = '';
  private socket?: WebSocket;
  private connectTimeout?: number;
  private walletTimeout?: number;
  private walletSnapshot=0;
  private startingVehicle?:VehicleId;
  private sendTime = 0;
  private lastState = 0;
  private name = 'Driver';
  private identityCode?: string;
  private identityRequestId = 0;
  private nextUpgradeRequest = 0;
  private inputSeq = 0;
  private actionSeq = 0;
  private syncToken = 0;
  private edgeQueue:{kind:'jump'|'flip';id:number;at:number;revision:number}[]=[];
  private sentEdges:Pick<Input,'jump'|'flip'>={jump:0,flip:0};
  droppedInputEdges=0;
  private lastInput:Input = {...NEUTRAL};
  private pendingVehicle?: {kind:VehicleId;previousId:string|undefined;token:number};
  private prediction = new TickPrediction();
  private clock = new MotionClock();
  private remote = new RemotePresentation();
  localPresentationActive=false;
  remotePresentationActive=false;
  private roomEpoch = '';
  private controlRevision = 0;
  private lastTargetTick = 0;
  private lastSentInput:Input|null = null;
  private lastSentAt = -Infinity;
  private sentAt = new Map<number,number>();
  upgradeResult: {requestId:number;upgrade:UpgradeId;ok:boolean}|null = null;
  vehicleStyleResult: ({requestId:number;ok:boolean}&StyleChoice)|null = null;
  otaResult: {requestId:number;enabled:boolean;ok:boolean}|null = null;
  destinationResult: {requestId:number;ok:boolean}|null = null;
  marsResult: {requestId:number;action:'board'|'contribute';ok:boolean;amount:number;available?:number}|null = null;
  starshipStatus:StarshipRoomStatus|null = null;
  starshipNameResult:{requestId:number;ok:boolean;publicName:string|null}|null = null;
  private starshipStatusRequest=0;
  identityResult: {requestId:number;ok:boolean;message:string;levelBaseline:{level:number;eligibleIncome:number;afterSnapshot:number}|null}|null = null;
  wallet: WalletView|null = null;
  luxuryResult: LuxuryResult|null = null;
  vehicleResult: {kind:VehicleId;ok:boolean}|null = null;
  error = '';
  room = '';
  roomFull = false;
  constructor(private now:()=>number=()=>performance.now(),private edgeCounters?:()=>Pick<Input,'jump'|'flip'>) {}
  get walletBlocked():boolean {return this.walletStatus==='connecting'||this.walletStatus==='syncing'||this.walletStatus==='failed';}
  private waitForWallet(requestId:number):void {
    clearTimeout(this.walletTimeout);this.walletStatus='connecting';this.walletError='';this.prediction.reset();
    this.droppedInputEdges+=this.edgeQueue.length;this.edgeQueue=[];this.lastSentInput=null;this.lastTargetTick=0;
    this.walletTimeout=window.setTimeout(()=>{
      if(this.identityRequestId!==requestId||!this.walletBlocked)return;
      this.walletStatus='failed';this.walletError='Your saved driver is taking too long to connect.';
      this.error=this.walletError;this.socket?.close();
    },WALLET_TIMEOUT_MS);
  }
  join(room: string, name: string,kind?:VehicleId) {
    if (this.status === 'online' && this.room === room) {
      this.setName(name);
      const player = this.world.players.find(player => player.id === this.id);
      const vehicle = this.world.entities.find(entity => entity.id === player?.entityId);
      if (kind && (vehicle?.kind !== kind || vehicle.owner !== this.id)) this.selectVehicle(kind);
      return;
    }
    kind ??= 'roadster';
    this.name = name;
    this.disconnect(); this.room = room; this.roomFull = false; this.status = 'connecting'; this.error = ''; this.id = ''; this.capacity = 0;this.snapshotVersion=0;this.walletStatus=this.identityCode?'connecting':'guest';this.walletError='';this.startingVehicle=undefined; this.sendTime = 0; this.upgradeResult=null;this.vehicleStyleResult=null;this.otaResult=null;this.destinationResult=null;this.marsResult=null;this.identityResult=null;this.wallet=null;this.luxuryResult=null;this.world = createEmptyWorld();
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${encodeURIComponent(room)}`);
    this.socket = socket;
    const timeout = window.setTimeout(() => { if (this.socket === socket && this.status === 'connecting') { this.error = 'Connection timed out. Try again or choose another room.'; socket.close(); } }, 10000);
    this.connectTimeout=timeout;
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') {
          if (message.version !== PROTOCOL_VERSION) { this.error = 'Game updated. Reload to reconnect.'; socket.close(); return; }
          if(typeof message.roomEpoch!=='string'||!Number.isSafeInteger(message.tick)||!Number.isSafeInteger(message.poseRevision))throw new Error('Invalid room clock');
          this.id = message.id; this.capacity = message.capacity; this.roomEpoch=message.roomEpoch;this.lastState = this.now();
          socket.send(JSON.stringify({type:'name',name:this.name}));
          if(!this.identityRequestId)this.identityRequestId=++this.nextUpgradeRequest;
          if(this.identityCode)this.waitForWallet(this.identityRequestId);
          socket.send(JSON.stringify({type:'identity',code:this.identityCode??null,requestId:this.identityRequestId}));
          if(kind!=='roadster'){if(this.walletBlocked)this.startingVehicle=kind;else this.actionWithBarrier({type:'selectVehicle',kind});}
        }
        if (message.type === 'state' && this.id) {
          const now=this.now();
          if(message.roomEpoch!==this.roomEpoch||!message.control||!Number.isSafeInteger(message.control.revision)||
             !Number.isSafeInteger(message.control.receivedSeq)||!Number.isSafeInteger(message.control.actionSeq)||
             !Number.isSafeInteger(message.control.edgeFloorRevision)||!Number.isSafeInteger(message.poseRevision)||
             !Number.isInteger(message.substeps)||message.substeps<1||message.substeps>8||
             !this.clock.observe(message.tick,now))throw new Error('Invalid room state');
          const sent=this.sentAt.get(message.control.receivedSeq);
          if(sent!==undefined)this.clock.observeTurnaround(now-sent);
          for(const seq of this.sentAt.keys())if(seq<=message.control.receivedSeq)this.sentAt.delete(seq);
          // A spontaneous relocation invalidates even presses captured before
          // its snapshot arrived. Explicit actions leave this floor unchanged.
          const queued=this.edgeQueue.length;
          this.edgeQueue=this.edgeQueue.filter(edge=>edge.revision>=message.control.edgeFloorRevision);
          this.droppedInputEdges+=queued-this.edgeQueue.length;
          if(message.control.revision!==this.controlRevision){this.controlRevision=message.control.revision;this.lastTargetTick=0;this.lastSentInput=null;}
          this.world = message.world;this.snapshotVersion++; this.status = 'online'; this.lastState = now; clearTimeout(timeout);if(this.connectTimeout===timeout)this.connectTimeout=undefined;
          if(this.walletStatus==='syncing'&&this.snapshotVersion>this.walletSnapshot){
            this.walletStatus='ready';clearTimeout(this.walletTimeout);this.walletTimeout=undefined;
            // Discard presses from before/during recovery; start at the server's
            // observed edge counters so they cannot be replayed after binding.
            this.sentEdges={jump:message.control.jump.seen,flip:message.control.flip.seen};
            this.lastSentInput=null;
          }
          this.remote.snapshot(this.world,this.id,message.tick);
          this.prediction.snapshot(this.world,this.id,message.tick,message.control,message.poseRevision,message.substeps,this.lastState);
          if(!this.walletBlocked&&this.startingVehicle){const starting=this.startingVehicle;this.startingVehicle=undefined;this.actionWithBarrier({type:'selectVehicle',kind:starting});}
          if(this.pendingVehicle&&Number.isSafeInteger(message.sync)&&message.sync>=this.pendingVehicle.token){
            const {kind,previousId}=this.pendingVehicle;
            const player=this.world.players.find(player=>player.id===this.id);
            const vehicle=this.world.entities.find(entity=>entity.id===player?.entityId);
            this.vehicleResult={kind,ok:vehicle?.kind===kind&&vehicle.owner===this.id&&vehicle.id!==previousId};
            this.pendingVehicle=undefined;
          }
        }
        if(message.type==='inputRejected'&&Number.isSafeInteger(message.seq)){this.prediction.reject(message.seq);this.lastSentInput=null;}
        if(message.type==='inputEdge'&&(message.kind==='jump'||message.kind==='flip')&&Number.isSafeInteger(message.id)&&
          Number.isSafeInteger(message.targetTick)&&['accepted','rescheduled','processed','expired','superseded'].includes(message.status))
          this.prediction.edgeOutcome(message.kind,message.id,message.status,message.targetTick);
        if (message.type === 'identityResult' && message.requestId===this.identityRequestId && this.walletStatus!=='failed') {
          const levelBaseline=message.ok&&this.identityCode&&this.wallet?{level:this.wallet.level,eligibleIncome:this.wallet.eligibleIncome,afterSnapshot:this.snapshotVersion}:null;
          this.identityResult={requestId:message.requestId,ok:message.ok,message:message.message,levelBaseline};
          if(this.identityCode){
            if(message.ok){this.walletStatus='syncing';this.walletSnapshot=this.snapshotVersion;}
            else{clearTimeout(this.walletTimeout);this.walletTimeout=undefined;this.walletStatus='failed';this.walletError=message.message;}
          }
        }
        if (message.type === 'wallet') this.wallet = message;
        if (message.type === 'luxuryResult') this.luxuryResult = message;
        if (message.type === 'vehicleStyleResult') this.vehicleStyleResult = message;
        if (message.type === 'upgradeResult') this.upgradeResult = message;
        if (message.type === 'otaResult') this.otaResult = message;
        if (message.type === 'destinationResult') this.destinationResult = message;
        if (message.type === 'marsResult') this.marsResult = message;
        if(message.type==='starshipStatus'&&message.requestId===this.starshipStatusRequest&&
          validStarshipStatus(message.status)&&validStarshipTime(message.serverTime)&&
          (message.publicName===null||typeof message.publicName==='string')){
          this.starshipStatus={status:message.status,publicName:message.publicName,serverTime:message.serverTime,receivedAt:this.now()};
        }
        if(message.type==='starshipNameResult'&&Number.isSafeInteger(message.requestId)&&typeof message.ok==='boolean'&&
          (message.publicName===null||typeof message.publicName==='string'))this.starshipNameResult=message;
      } catch (error) { console.error('Room message processing failed:',error);this.error = 'Invalid server message. Please reconnect.'; socket.close(); }
    };
    socket.onclose = event => { clearTimeout(timeout);if(this.connectTimeout===timeout)this.connectTimeout=undefined; if (this.socket === socket) { clearTimeout(this.walletTimeout);this.walletTimeout=undefined;this.prediction.reset();this.status = 'disconnected';this.starshipStatus=null;this.starshipNameResult=null;this.starshipStatusRequest=0; if(event.code === ROOM_FULL_CODE){this.roomFull = true; this.error = 'This room is full. Try another room.';} else if(event.code === ROOM_NO_SPAWN_CODE){this.error = 'No safe starting space is available right now. Try again or choose another room.';} else this.error ||= 'Room disconnected. Rejoin or choose another room.'; } };
    socket.onerror = () => { if(this.socket === socket) this.error ||= 'Could not reach the room server. Try again or choose another room.'; };
  }
  queueEdge(kind:'jump'|'flip',id:number) {
    if(this.status!=='online'||this.walletBlocked)return;
    // A bounded queue preserves distinct presses; never replay an old press
    // after a long interruption or let bursts grow without bound.
    if(this.edgeQueue.length>=16){this.droppedInputEdges++;return;}
    this.edgeQueue.push({kind,id,at:this.now(),revision:this.controlRevision});
  }
  tick(dt: number, input: Input) {
    this.lastInput={...input};
    if (this.status === 'online') {
      const now=this.now();
      if (now - this.lastState > 6000) { this.error = 'Connection stalled. Rejoin to continue.'; this.socket?.close(); return; }
      if(this.walletBlocked)return;
      this.sendTime += dt;
      while(this.edgeQueue.length&&now-this.edgeQueue[0].at>300){this.edgeQueue.shift();this.droppedInputEdges++;}
      const edge=this.edgeQueue[0];
      // Counters advance only as their actual press events are sent. Reading
      // the latest counters here would silently collapse rapid presses.
      const outgoing={...input,...this.sentEdges,...(edge?{[edge.kind]:edge.id}:{})};
      const before=this.lastSentInput;
      const changed=!before||Object.keys(outgoing).some(key=>outgoing[key as keyof Input]!==before[key as keyof Input]);
      if ((this.sendTime >= .05 || changed || edge) && now-this.lastSentAt>=20) {
        if(!this.sendInput(outgoing,now))return;
        if(edge){this.edgeQueue.shift();this.sentEdges[edge.kind]=edge.id;}
        // Preserve the frame's fractional remainder so a 60 Hz render loop
        // does not quantize a 20 Hz input stream down to roughly 15 Hz.
        // Missed intervals are dropped, not burst-sent after a slow frame.
        this.sendTime %= .05;
      }
    }
  }
  renderWorld():World {
    this.localPresentationActive=false;this.remotePresentationActive=false;
    if(this.status!=='online'||this.walletBlocked)return this.world;
    const now=this.now(),display=this.remote.render(this.world,this.id,this.clock.remote(now));
    // With only one snapshot the remote buffer holds its last known poses;
    // the scene and local collision checks must use those same held poses.
    this.remotePresentationActive=true;
    const predicted=this.prediction.renderWorld(now,this.clock.target(now),this.clock.estimate(now),this.clock.alpha(now),display,this.remote.ready);
    this.localPresentationActive=!!predicted;
    if(predicted)return predicted;
    // Ferry passengers share the authoritative deck while shore traffic plays
    // back normally. Other unsafe replay states must keep every car on one
    // authoritative frame. Keep remotePresentationActive so the scene does not
    // extrapolate those peers away from it.
    const onFerry=this.world.entities.some(entity=>entity.driver===this.id&&entity.supportId==='ferry');
    return onFerry?display:this.world;
  }
  takePresentationSnap():boolean {return this.prediction.takeSnap();}
  takeCameraSnap():boolean {return this.prediction.takeCameraSnap();}
  selectVehicle(kind:VehicleId){
    this.vehicleResult=null;
    const player=this.world.players.find(player=>player.id===this.id);
    if(this.status==='online'&&this.actionWithBarrier({type:'selectVehicle',kind})){
      this.pendingVehicle={kind,previousId:player?.entityId,token:this.syncToken};
    }else this.vehicleResult={kind,ok:false};
  }
  parkingAction(action:'park'|'queue'|'start'|'leave'){this.actionWithBarrier({type:'parking',action},false);}
  raceAction(action:'join'|'start'|'leave',courseId:'short'|'oval'){this.actionWithBarrier({type:'race',action,courseId},action==='join');}
  enterMinigame(game:'park'|'queue'|'short'|'oval'){if(this.status!=='online'||!this.actionWithBarrier({type:'minigame',game}))return false;}
  setDestination(x:number,z:number){
    const requestId=++this.nextUpgradeRequest;this.destinationResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'destination',x,z,requestId}))this.destinationResult={requestId,ok:false};
    return requestId;
  }
  setName(name:string) {
    this.name = name;
    if (this.id) this.send({type:'name',name});
  }
  /** Recovery codes are sent only to the room and never added to snapshots. */
  setIdentity(code?:string) {
    const requestId=++this.nextUpgradeRequest;
    this.starshipStatus=null;this.starshipNameResult=null;this.starshipStatusRequest=0;
    this.identityCode=code;this.identityRequestId=requestId;this.identityResult=null;
    if(this.id&&this.socket?.readyState===WebSocket.OPEN){
      if(code)this.waitForWallet(requestId);
      else if(this.walletStatus!=='guest'){clearTimeout(this.walletTimeout);this.walletTimeout=undefined;this.walletStatus='failed';this.walletError='Rejoin to start a new guest driver.';}
      this.send({type:'identity',code:code??null,requestId});
    }
    return requestId;
  }
  luxury(action:'buy'|'collect',vehicle:LuxuryVehicleId) {
    const requestId=++this.nextUpgradeRequest;this.luxuryResult=null;
    const message={type:'luxury',action,vehicle,requestId};
    const sent=this.status==='online'&&!this.walletBlocked&&(action==='collect'?this.actionWithBarrier(message):this.send(message));
    if(!sent)this.luxuryResult={requestId,action,vehicle,ok:false,reason:'Connection lost. Rejoin and try again.'};
    return requestId;
  }
  buyUpgrade(upgrade:UpgradeId){
    const requestId=++this.nextUpgradeRequest;this.upgradeResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'upgrade',upgrade,requestId},false))this.upgradeResult={requestId,upgrade,ok:false};
    return requestId;
  }
  buyVehicleStyle(selection:StyleChoice){
    const requestId=++this.nextUpgradeRequest;this.vehicleStyleResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'vehicleStyle',...selection,requestId},false))this.vehicleStyleResult={requestId,...selection,ok:false};
    return requestId;
  }
  mars(){
    const requestId=++this.nextUpgradeRequest;this.marsResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'mars',action:'board',requestId},false))this.marsResult={requestId,action:'board',ok:false,amount:0};
    return requestId;
  }
  contributeMars(amount:number){
    const requestId=++this.nextUpgradeRequest;this.marsResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'mars',action:'contribute',amount,requestId},false))this.marsResult={requestId,action:'contribute',ok:false,amount:0};
    return requestId;
  }
  requestStarshipStatus():boolean {
    if(this.status!=='online'||this.walletBlocked)return false;
    const requestId=++this.nextUpgradeRequest;
    if(!this.send({type:'starship',action:'status',requestId}))return false;
    this.starshipStatusRequest=requestId;return true;
  }
  setStarshipName(name:string|null):number {
    const requestId=++this.nextUpgradeRequest;this.starshipNameResult=null;
    if(this.status!=='online'||this.walletBlocked||!this.send({type:'starship',action:'name',name,requestId}))
      this.starshipNameResult={requestId,ok:false,publicName:null};
    return requestId;
  }
  setOta(enabled:boolean){
    const requestId=++this.nextUpgradeRequest;this.otaResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'ota',enabled,requestId},false))this.otaResult={requestId,enabled,ok:false};
    return requestId;
  }
  action(type: 'interact' | 'reset' | 'autopilot' | 'dome') {
    this.actionWithBarrier({type});
  }
  private actionWithBarrier(value:Record<string,unknown>,invalidates=true):boolean {
    if(this.walletBlocked)return false;
    // The baseline is captured at the action itself, including gamepad
    // actions fired during Controls.read(), without an extra simulation frame.
    const actionSeq=this.actionSeq+1;
    const action=invalidates?{...value,actionSeq,edgeBaseline:this.edgeCounters?.()??{jump:this.lastInput.jump,flip:this.lastInput.flip}}:value;
    if(!this.send(action))return false;
    if(invalidates)this.actionSeq=actionSeq;
    const token=++this.syncToken;
    return this.send({type:'sync',token});
  }
  private sendInput(input:Input,now:number):boolean {
    const estimated=this.clock.inputTarget(now);
    if(estimated===null)return false;
    const targetTick=Math.max(this.lastTargetTick,estimated),seq=this.inputSeq+1;
    const command={seq,targetTick,controlRevision:this.controlRevision,actionSeq:this.actionSeq,input:{...input}};
    if(!this.send({type:'input',...command,roomEpoch:this.roomEpoch}))return false;
    this.inputSeq=seq;this.lastTargetTick=targetTick;this.lastSentInput={...input};this.lastSentAt=now;
    this.sentAt.set(seq,now);if(this.sentAt.size>64)this.sentAt.delete(this.sentAt.keys().next().value!);
    this.prediction.input(command);return true;
  }
  private send(value: unknown):boolean { if (this.socket?.readyState !== WebSocket.OPEN)return false;this.socket.send(JSON.stringify(value));return true; }
  disconnect() { const socket = this.socket; this.socket = undefined;clearTimeout(this.connectTimeout);this.connectTimeout=undefined;clearTimeout(this.walletTimeout);this.walletTimeout=undefined; socket?.close(); this.prediction.reset();this.clock.reset();this.remote.reset();this.localPresentationActive=false;this.remotePresentationActive=false;this.roomEpoch='';this.controlRevision=0;this.lastTargetTick=0;this.lastSentInput=null;this.lastInput={...NEUTRAL};this.lastSentAt=-Infinity;this.sentAt.clear();this.inputSeq=0;this.actionSeq=0;this.syncToken=0;this.edgeQueue=[];this.sentEdges={jump:0,flip:0};this.droppedInputEdges=0;this.pendingVehicle=undefined;this.startingVehicle=undefined;this.vehicleResult=null;this.wallet=null;this.luxuryResult=null;this.starshipStatus=null;this.starshipNameResult=null;this.starshipStatusRequest=0;this.sendTime=0;this.status='disconnected'; }
}
