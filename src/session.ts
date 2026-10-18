import type { VehicleId } from '../shared/vehicles';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, buyUpgrade, buyVehicleStyle, subscribeOta, chooseVehicle, toggleAutopilot, createWorld, addPlayer, step, interact, parkingAction, raceAction, enterMinigame, setDestination, resetPlayer, travelDome, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';
import type { StyleChoice } from '../shared/vehicle-style';
import { applyMarsContribution, boardMars, marsContribution } from '../shared/mars';
import { LocalPrediction } from './local-prediction';
export const DEFAULT_ROOM = 'bay';
export const validRoom = (room:string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export type SessionStatus = 'solo' | 'connecting' | 'online' | 'disconnected';
export class Session {
  world: World = createWorld();
  id = '';
  status: SessionStatus = 'disconnected';
  capacity = 0;
  private socket?: WebSocket;
  private accumulator = 0;
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
  vehicleStyleResult: ({requestId:number;ok:boolean}&StyleChoice)|null = null;
  otaResult: {requestId:number;enabled:boolean;ok:boolean}|null = null;
  destinationResult: {requestId:number;ok:boolean}|null = null;
  marsResult: {requestId:number;action:'contribute'|'board';ok:boolean;amount:number}|null = null;
  vehicleResult: {kind:VehicleId;ok:boolean}|null = null;
  error = '';
  room = '';
  roomFull = false;
  solo(kind:VehicleId='roadster',name=this.name) {
    this.name = name;
    this.disconnect(); this.status = 'solo'; this.id = 'local'; this.capacity = 1; this.error = ''; this.room = ''; this.roomFull = false; this.accumulator = 0;
    this.upgradeResult=null;this.vehicleStyleResult=null;this.otaResult=null;this.destinationResult=null;this.marsResult=null;this.world = createWorld(); addPlayer(this.world, this.id, this.name); if(kind!=='roadster')chooseVehicle(this.world,this.id,kind);
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
    this.disconnect(); this.room = room; this.roomFull = false; this.status = 'connecting'; this.error = ''; this.id = ''; this.capacity = 0; this.sendTime = 0; this.upgradeResult=null;this.vehicleStyleResult=null;this.otaResult=null;this.destinationResult=null;this.marsResult=null;this.world = createWorld();
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${encodeURIComponent(room)}`);
    this.socket = socket;
    const timeout = window.setTimeout(() => { if (this.socket === socket && this.status === 'connecting') { this.error = 'Connection timed out. Try again or drive solo.'; socket.close(); } }, 10000);
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
          this.world = message.world; this.status = 'online'; this.lastState = performance.now(); clearTimeout(timeout);
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
      } catch { this.error = 'Invalid server message. Please reconnect.'; socket.close(); }
    };
    socket.onclose = event => { clearTimeout(timeout); if (this.socket === socket) { this.prediction.reset();this.waitingSync=0;this.status = 'disconnected'; if(event.code === ROOM_FULL_CODE){this.roomFull = true; this.error = 'This room is full. Try another room or drive solo.';} else if(event.code === ROOM_NO_SPAWN_CODE){this.error = 'No safe starting space is available right now. Try again, choose another room, or drive solo.';} else this.error ||= 'Room disconnected. Rejoin, choose another room, or drive solo.'; } };
    socket.onerror = () => { if(this.socket === socket) this.error ||= 'Could not reach the room server. Try again or drive solo.'; };
  }
  tick(dt: number, input: Input) {
    if (this.status === 'solo') {
      this.accumulator += Math.min(dt, .1);
      while (this.accumulator >= .05) { step(this.world, new Map([[this.id, input]]), .05); this.accumulator -= .05; }
    } else if (this.status === 'online') {
      if (performance.now() - this.lastState > 6000) { this.error = 'Connection stalled. Rejoin to continue.'; this.socket?.close(); return; }
      this.sendTime += dt;
      if (this.sendTime >= .05) {
        const seq=this.inputSeq+1;
        if(this.send({type:'input',seq,input})){this.inputSeq=seq;this.prediction.input(seq,input,performance.now());}
        this.sendTime = 0;
      }
    }
  }
  renderWorld():World {return this.status==='online'?this.prediction.renderWorld(performance.now())??this.world:this.world;}
  takePresentationSnap():boolean {return this.prediction.takeSnap();}
  selectVehicle(kind:VehicleId){
    this.vehicleResult=null;
    if(this.status==='solo'){this.vehicleResult={kind,ok:chooseVehicle(this.world,this.id,kind)};return;}
    const player=this.world.players.find(player=>player.id===this.id);
    if(this.status==='online'&&this.actionWithBarrier({type:'selectVehicle',kind})){
      this.pendingVehicle={kind,previousId:player?.entityId,token:this.syncToken};
    }else this.vehicleResult={kind,ok:false};
  }
  parkingAction(action:'park'|'queue'|'start'|'leave'){if(this.status==='solo')return parkingAction(this.world,this.id,action);this.actionWithBarrier({type:'parking',action});}
  raceAction(action:'join'|'start'|'leave',courseId:'short'|'oval'){if(this.status==='solo')raceAction(this.world,this.id,action,courseId);else this.actionWithBarrier({type:'race',action,courseId});}
  enterMinigame(game:'park'|'queue'|'short'|'oval'){if(this.status==='solo')return enterMinigame(this.world,this.id,game);if(this.status!=='online'||!this.actionWithBarrier({type:'minigame',game}))return false;}
  setDestination(x:number,z:number){
    const requestId=++this.nextUpgradeRequest;this.destinationResult=null;
    if(this.status==='solo')this.destinationResult={requestId,ok:setDestination(this.world,this.id,{x,z})};
    else if(this.status!=='online'||!this.actionWithBarrier({type:'destination',x,z,requestId}))this.destinationResult={requestId,ok:false};
    return requestId;
  }
  setName(name:string) {
    this.name = name;
    if (this.status === 'solo') {
      const player = this.world.players.find(p => p.id === this.id);
      if (player) player.name = name;
    } else if (this.id) this.send({type:'name',name});
  }
  buyUpgrade(upgrade:UpgradeId){
    const requestId=++this.nextUpgradeRequest;this.upgradeResult=null;
    if(this.status==='solo')this.upgradeResult={requestId,upgrade,ok:buyUpgrade(this.world,this.id,upgrade)};
    else if(this.status!=='online'||!this.actionWithBarrier({type:'upgrade',upgrade,requestId}))this.upgradeResult={requestId,upgrade,ok:false};
    return requestId;
  }
  buyVehicleStyle(selection:StyleChoice){
    const requestId=++this.nextUpgradeRequest;this.vehicleStyleResult=null;
    if(this.status==='solo')this.vehicleStyleResult={requestId,...selection,ok:buyVehicleStyle(this.world,this.id,selection)};
    else if(this.status!=='online'||!this.actionWithBarrier({type:'vehicleStyle',...selection,requestId}))this.vehicleStyleResult={requestId,...selection,ok:false};
    return requestId;
  }
  mars(action:'contribute'|'board',amount=0){
    const requestId=++this.nextUpgradeRequest;this.marsResult=null;
    if(this.status==='solo'){
      const contribution=action==='contribute'?marsContribution(this.world,this.id,amount):0;
      const ok=action==='board'?boardMars(this.world,this.id):contribution>0;
      if(contribution>0)applyMarsContribution(this.world,this.id,contribution);
      this.marsResult={requestId,action,ok,amount:contribution};
    }else{
      const message=action==='board'?{type:'mars',action,requestId}:{type:'mars',action,amount,requestId};
      if(this.status!=='online'||!this.actionWithBarrier(message))this.marsResult={requestId,action,ok:false,amount:0};
    }
    return requestId;
  }
  setOta(enabled:boolean){
    const requestId=++this.nextUpgradeRequest;this.otaResult=null;
    if(this.status==='solo')this.otaResult={requestId,enabled,ok:subscribeOta(this.world,this.id,enabled)};
    else if(this.status!=='online'||!this.actionWithBarrier({type:'ota',enabled,requestId}))this.otaResult={requestId,enabled,ok:false};
    return requestId;
  }
  action(type: 'interact' | 'reset' | 'autopilot' | 'dome') {
    if (this.status === 'solo') (type === 'interact' ? interact : type==='autopilot'?toggleAutopilot:type==='dome'?travelDome:resetPlayer)(this.world, this.id);
    else this.actionWithBarrier({type});
  }
  private actionWithBarrier(value:unknown):boolean {
    this.prediction.suspend();
    if(!this.send(value))return false;
    const token=++this.syncToken;this.waitingSync=token;return this.send({type:'sync',token});
  }
  private send(value: unknown):boolean { if (this.socket?.readyState !== WebSocket.OPEN)return false;this.socket.send(JSON.stringify(value));return true; }
  disconnect() { const socket = this.socket; this.socket = undefined; socket?.close(); this.prediction.reset();this.inputSeq=0;this.syncToken=0;this.waitingSync=0;this.pendingVehicle=undefined;this.vehicleResult=null;this.sendTime=0;this.status='disconnected'; }
}
