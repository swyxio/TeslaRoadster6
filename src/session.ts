import type { VehicleId } from '../shared/vehicles';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, createEmptyWorld, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';
import type { StyleChoice } from '../shared/vehicle-style';
import type { AchievementId } from '../shared/achievements';
import type { LuxuryVehicleId } from '../shared/luxury';
import { LocalPrediction } from './local-prediction';
export const DEFAULT_ROOM = 'bay';
export const validRoom = (room:string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export type SessionStatus = 'connecting' | 'online' | 'disconnected';
export type WalletView = {cash:number;earned:number;eligibleIncome:number;level:number;unlocked:AchievementId[];ownedLuxury:LuxuryVehicleId[]};
export type LuxuryResult = {requestId:number;action:'buy'|'collect';vehicle:LuxuryVehicleId;ok:boolean;reason?:string;awards?:AchievementId[]};
export class Session {
  world: World = createEmptyWorld();
  id = '';
  status: SessionStatus = 'disconnected';
  capacity = 0;
  private socket?: WebSocket;
  private connectTimeout?: number;
  private sendTime = 0;
  private lastState = 0;
  private name = 'Driver';
  private identityCode?: string;
  private identityRequestId = 0;
  private nextUpgradeRequest = 0;
  private inputSeq = 0;
  private syncToken = 0;
  private waitingSync = 0;
  private pendingVehicle?: {kind:VehicleId;previousId:string|undefined;token:number};
  private prediction = new LocalPrediction();
  upgradeResult: {requestId:number;upgrade:UpgradeId;ok:boolean}|null = null;
  vehicleStyleResult: ({requestId:number;ok:boolean}&StyleChoice)|null = null;
  otaResult: {requestId:number;enabled:boolean;ok:boolean}|null = null;
  destinationResult: {requestId:number;ok:boolean}|null = null;
  marsResult: {requestId:number;action:'board';ok:boolean}|null = null;
  identityResult: {requestId:number;ok:boolean;message:string}|null = null;
  wallet: WalletView|null = null;
  luxuryResult: LuxuryResult|null = null;
  vehicleResult: {kind:VehicleId;ok:boolean}|null = null;
  error = '';
  room = '';
  roomFull = false;
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
    this.disconnect(); this.room = room; this.roomFull = false; this.status = 'connecting'; this.error = ''; this.id = ''; this.capacity = 0; this.sendTime = 0; this.upgradeResult=null;this.vehicleStyleResult=null;this.otaResult=null;this.destinationResult=null;this.marsResult=null;this.identityResult=null;this.wallet=null;this.luxuryResult=null;this.world = createEmptyWorld();
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
          this.id = message.id; this.capacity = message.capacity; this.lastState = performance.now();
          socket.send(JSON.stringify({type:'name',name:this.name}));
          if(this.identityCode)socket.send(JSON.stringify({type:'identity',code:this.identityCode,requestId:this.identityRequestId}));
          if(kind!=='roadster')this.actionWithBarrier({type:'selectVehicle',kind});
        }
        if (message.type === 'state' && this.id) {
          this.world = message.world; this.status = 'online'; this.lastState = performance.now(); clearTimeout(timeout);if(this.connectTimeout===timeout)this.connectTimeout=undefined;
          const passed=Number.isSafeInteger(message.sync)&&this.waitingSync>0&&message.sync>=this.waitingSync;
          if(passed)this.waitingSync=0;
          this.prediction.snapshot(this.world,this.id,message.inputAck,this.lastState,passed);
          if(this.pendingVehicle&&Number.isSafeInteger(message.sync)&&message.sync>=this.pendingVehicle.token){
            const {kind,previousId}=this.pendingVehicle;
            const player=this.world.players.find(player=>player.id===this.id);
            const vehicle=this.world.entities.find(entity=>entity.id===player?.entityId);
            this.vehicleResult={kind,ok:vehicle?.kind===kind&&vehicle.owner===this.id&&vehicle.id!==previousId};
            this.pendingVehicle=undefined;
          }
        }
        if (message.type === 'upgradeResult') this.upgradeResult = message;
        if (message.type === 'vehicleStyleResult') this.vehicleStyleResult = message;
        if (message.type === 'otaResult') this.otaResult = message;
        if (message.type === 'destinationResult') this.destinationResult = message;
        if (message.type === 'marsResult') this.marsResult = message;
        if (message.type === 'identityResult' && message.requestId===this.identityRequestId) this.identityResult = message;
        if (message.type === 'wallet') this.wallet = message;
        if (message.type === 'luxuryResult') this.luxuryResult = message;
      } catch { this.error = 'Invalid server message. Please reconnect.'; socket.close(); }
    };
    socket.onclose = event => { clearTimeout(timeout);if(this.connectTimeout===timeout)this.connectTimeout=undefined; if (this.socket === socket) { this.prediction.reset();this.waitingSync=0;this.status = 'disconnected'; if(event.code === ROOM_FULL_CODE){this.roomFull = true; this.error = 'This room is full. Try another room.';} else if(event.code === ROOM_NO_SPAWN_CODE){this.error = 'No safe starting space is available right now. Try again or choose another room.';} else this.error ||= 'Room disconnected. Rejoin or choose another room.'; } };
    socket.onerror = () => { if(this.socket === socket) this.error ||= 'Could not reach the room server. Try again or choose another room.'; };
  }
  tick(dt: number, input: Input) {
    if (this.status === 'online') {
      if (performance.now() - this.lastState > 6000) { this.error = 'Connection stalled. Rejoin to continue.'; this.socket?.close(); return; }
      this.sendTime += dt;
      if (this.sendTime >= .05) {
        const seq=this.inputSeq+1;
        if(this.send({type:'input',seq,input})){this.inputSeq=seq;this.prediction.input(seq,input,performance.now());}
        // Preserve the frame's fractional remainder so a 60 Hz render loop
        // does not quantize a 20 Hz input stream down to roughly 15 Hz.
        // Missed intervals are dropped, not burst-sent after a slow frame.
        this.sendTime %= .05;
      }
    }
  }
  renderWorld():World {return this.status==='online'?this.prediction.renderWorld(performance.now())??this.world:this.world;}
  takePresentationSnap():boolean {return this.prediction.takeSnap();}
  takeCameraSnap():boolean {return this.prediction.takeCameraSnap();}
  selectVehicle(kind:VehicleId){
    this.vehicleResult=null;
    const player=this.world.players.find(player=>player.id===this.id);
    if(this.status==='online'&&this.actionWithBarrier({type:'selectVehicle',kind})){
      this.pendingVehicle={kind,previousId:player?.entityId,token:this.syncToken};
    }else this.vehicleResult={kind,ok:false};
  }
  parkingAction(action:'park'|'queue'|'start'|'leave'){this.actionWithBarrier({type:'parking',action});}
  raceAction(action:'join'|'start'|'leave',courseId:'short'|'oval'){this.actionWithBarrier({type:'race',action,courseId});}
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
    this.identityCode=code;this.identityRequestId=requestId;this.identityResult=null;
    if(this.id)this.send({type:'identity',code:code??null,requestId});
    return requestId;
  }
  luxury(action:'buy'|'collect',vehicle:LuxuryVehicleId) {
    const requestId=++this.nextUpgradeRequest;this.luxuryResult=null;
    const message={type:'luxury',action,vehicle,requestId};
    const sent=this.status==='online'&&(action==='collect'?this.actionWithBarrier(message):this.send(message));
    if(!sent)this.luxuryResult={requestId,action,vehicle,ok:false,reason:'Connection lost. Rejoin and try again.'};
    return requestId;
  }
  buyUpgrade(upgrade:UpgradeId){
    const requestId=++this.nextUpgradeRequest;this.upgradeResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'upgrade',upgrade,requestId}))this.upgradeResult={requestId,upgrade,ok:false};
    return requestId;
  }
  buyVehicleStyle(selection:StyleChoice){
    const requestId=++this.nextUpgradeRequest;this.vehicleStyleResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'vehicleStyle',...selection,requestId}))this.vehicleStyleResult={requestId,...selection,ok:false};
    return requestId;
  }
  mars(){
    const requestId=++this.nextUpgradeRequest;this.marsResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'mars',action:'board',requestId}))this.marsResult={requestId,action:'board',ok:false};
    return requestId;
  }
  setOta(enabled:boolean){
    const requestId=++this.nextUpgradeRequest;this.otaResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'ota',enabled,requestId}))this.otaResult={requestId,enabled,ok:false};
    return requestId;
  }
  action(type: 'interact' | 'reset' | 'autopilot' | 'dome') {
    this.actionWithBarrier({type},type==='reset');
  }
  private actionWithBarrier(value:unknown,reset=false):boolean {
    if(!this.send(value)){this.prediction.suspend();return false;}
    this.prediction.suspend(reset);
    const token=++this.syncToken;this.waitingSync=token;return this.send({type:'sync',token});
  }
  private send(value: unknown):boolean { if (this.socket?.readyState !== WebSocket.OPEN)return false;this.socket.send(JSON.stringify(value));return true; }
  disconnect() { const socket = this.socket; this.socket = undefined;clearTimeout(this.connectTimeout);this.connectTimeout=undefined; socket?.close(); this.prediction.reset();this.inputSeq=0;this.syncToken=0;this.waitingSync=0;this.pendingVehicle=undefined;this.vehicleResult=null;this.wallet=null;this.luxuryResult=null;this.sendTime=0;this.status='disconnected'; }
}
