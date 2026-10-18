import type { VehicleId } from '../shared/vehicles';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE, buyUpgrade, subscribeOta, chooseVehicle, toggleAutopilot, createWorld, addPlayer, step, interact, parkingAction, raceAction, resetPlayer, travelDome, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';
import { LocalPrediction } from './local-prediction';
export const DEFAULT_ROOM = 'bay';
export const validRoom = (room:string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export type SessionStatus = 'solo' | 'connecting' | 'online' | 'disconnected';
export class Session {
  world: World = createWorld();
  id = 'local';
  status: SessionStatus = 'solo';
  capacity = 1;
  private socket?: WebSocket;
  private accumulator = 0;
  private sendTime = 0;
  private lastState = 0;
  private name = 'Driver';
  private nextUpgradeRequest = 0;
  private inputSeq = 0;
  private syncToken = 0;
  private waitingSync = 0;
  private prediction = new LocalPrediction();
  upgradeResult: {requestId:number;upgrade:UpgradeId;ok:boolean}|null = null;
  otaResult: {requestId:number;enabled:boolean;ok:boolean}|null = null;
  error = '';
  room = '';
  roomFull = false;
  constructor() { addPlayer(this.world, this.id, 'You'); }
  solo(kind:VehicleId='roadster',name=this.name) {
    this.name = name;
    this.disconnect(); this.status = 'solo'; this.id = 'local'; this.capacity = 1; this.error = ''; this.room = ''; this.roomFull = false; this.accumulator = 0;
    this.upgradeResult=null;this.otaResult=null;this.world = createWorld(); addPlayer(this.world, this.id, this.name); if(kind!=='roadster')chooseVehicle(this.world,this.id,kind);
  }
  join(room: string, name: string,kind?:VehicleId) {
    if (this.status === 'online' && this.room === room) {
      this.setName(name);
      const player = this.world.players.find(player => player.id === this.id);
      const vehicle = this.world.entities.find(entity => entity.id === player?.entityId);
      if (kind && vehicle?.kind !== kind) this.selectVehicle(kind);
      return;
    }
    kind ??= 'roadster';
    this.name = name;
    this.disconnect(); this.room = room; this.roomFull = false; this.status = 'connecting'; this.error = ''; this.id = ''; this.capacity = 0; this.sendTime = 0; this.upgradeResult=null;this.otaResult=null;this.world = createWorld();
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
        }
        if (message.type === 'upgradeResult') this.upgradeResult = message;
        if (message.type === 'otaResult') this.otaResult = message;
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
  selectVehicle(kind:VehicleId){if(this.status==='solo')chooseVehicle(this.world,this.id,kind);else this.actionWithBarrier({type:'selectVehicle',kind});}
  parkingAction(action:'park'|'queue'|'start'|'leave'){if(this.status==='solo')return parkingAction(this.world,this.id,action);this.actionWithBarrier({type:'parking',action});}
  raceAction(action:'join'|'start'|'leave',courseId:'short'|'oval'){if(this.status==='solo')raceAction(this.world,this.id,action,courseId);else this.actionWithBarrier({type:'race',action,courseId});}
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
  disconnect() { const socket = this.socket; this.socket = undefined; socket?.close(); this.prediction.reset();this.inputSeq=0;this.syncToken=0;this.waitingSync=0;this.sendTime=0;this.status='disconnected'; }
}
