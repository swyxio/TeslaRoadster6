import type { VehicleId } from '../shared/vehicles';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, createEmptyWorld, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';
import { LocalPrediction } from './local-prediction';
export const DEFAULT_ROOM = 'bay';
export const validRoom = (room:string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export type SessionStatus = 'connecting' | 'online' | 'disconnected';
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
  private nextUpgradeRequest = 0;
  private inputSeq = 0;
  private syncToken = 0;
  private waitingSync = 0;
  private pendingVehicle?: {kind:VehicleId;previousId:string|undefined;token:number};
  private prediction = new LocalPrediction();
  upgradeResult: {requestId:number;upgrade:UpgradeId;ok:boolean}|null = null;
  otaResult: {requestId:number;enabled:boolean;ok:boolean}|null = null;
  destinationResult: {requestId:number;ok:boolean}|null = null;
  awardsBound: {requestId:number;ok:boolean}|null = null;
  awardsUnbound: {requestId:number;ok:boolean}|null = null;
  awardsSync: boolean|null = null;
  marsResult: {requestId:number;action:'contribute'|'board';ok:boolean;amount:number}|null = null;
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
    this.disconnect(); this.room = room; this.roomFull = false; this.status = 'connecting'; this.error = ''; this.id = ''; this.capacity = 0; this.sendTime = 0; this.upgradeResult=null;this.otaResult=null;this.destinationResult=null;this.marsResult=null;this.world = createEmptyWorld();
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
        if (message.type === 'awardsUnbound' && Number.isSafeInteger(message.requestId) && typeof message.ok === 'boolean') this.awardsUnbound = {requestId:message.requestId,ok:message.ok};
        if (message.type === 'awardsBound' && Number.isSafeInteger(message.requestId) && typeof message.ok === 'boolean') this.awardsBound = {requestId:message.requestId,ok:message.ok};
        if (message.type === 'awardsSync' && typeof message.ok === 'boolean') this.awardsSync = message.ok;
        if (message.type === 'upgradeResult') this.upgradeResult = message;
        if (message.type === 'otaResult') this.otaResult = message;
        if (message.type === 'destinationResult') this.destinationResult = message;
        if (message.type === 'marsResult') this.marsResult = message;
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
  unbindAwards(requestId:number):boolean {
    this.awardsUnbound=null;
    return this.status==='online'&&this.send({type:'unbindAwards',requestId});
  }
  bindAwards(ticket:string,requestId:number):boolean {
    this.awardsBound=null;this.awardsSync=null;
    return this.status==='online'&&this.send({type:'bindAwards',ticket,requestId});
  }
  setName(name:string) {
    this.name = name;
    if (this.id) this.send({type:'name',name});
  }
  buyUpgrade(upgrade:UpgradeId){
    const requestId=++this.nextUpgradeRequest;this.upgradeResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'upgrade',upgrade,requestId}))this.upgradeResult={requestId,upgrade,ok:false};
    return requestId;
  }
  mars(action:'contribute'|'board',amount=0){
    const requestId=++this.nextUpgradeRequest;this.marsResult=null;
    const message=action==='board'?{type:'mars',action,requestId}:{type:'mars',action,amount,requestId};
    if(this.status!=='online'||!this.actionWithBarrier(message))this.marsResult={requestId,action,ok:false,amount:0};
    return requestId;
  }
  setOta(enabled:boolean){
    const requestId=++this.nextUpgradeRequest;this.otaResult=null;
    if(this.status!=='online'||!this.actionWithBarrier({type:'ota',enabled,requestId}))this.otaResult={requestId,enabled,ok:false};
    return requestId;
  }
  action(type: 'interact' | 'reset' | 'autopilot' | 'dome') {
    this.actionWithBarrier({type});
  }
  private actionWithBarrier(value:unknown):boolean {
    this.prediction.suspend();
    if(!this.send(value))return false;
    const token=++this.syncToken;this.waitingSync=token;return this.send({type:'sync',token});
  }
  private send(value: unknown):boolean { if (this.socket?.readyState !== WebSocket.OPEN)return false;this.socket.send(JSON.stringify(value));return true; }
  disconnect() { const socket = this.socket; this.socket = undefined;clearTimeout(this.connectTimeout);this.connectTimeout=undefined; socket?.close(); this.prediction.reset();this.inputSeq=0;this.syncToken=0;this.waitingSync=0;this.pendingVehicle=undefined;this.vehicleResult=null;this.awardsBound=null;this.awardsUnbound=null;this.awardsSync=null;this.sendTime=0;this.status='disconnected'; }
}
