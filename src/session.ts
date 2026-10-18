import type { VehicleId } from '../shared/vehicles';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, createWorld, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';

export const DEFAULT_ROOM = 'bay';
export const validRoom = (room: string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export type SessionStatus = 'connecting' | 'online' | 'disconnected';

export class Session {
  world: World = createWorld();
  id = '';
  status: SessionStatus = 'disconnected';
  capacity = 0;
  error = '';
  roomFull = false;
  room = '';
  private socket?: WebSocket;
  private sendTime = 0;
  private lastState = 0;
  private name = 'Driver';
  private nextUpgradeRequest = 0;
  upgradeResult: {requestId:number;upgrade:UpgradeId;ok:boolean}|null = null;
  otaResult: {requestId:number;enabled:boolean;ok:boolean}|null = null;

  join(room: string, name: string, kind: VehicleId = 'roadster') {
    if (this.status === 'online' && this.room === room) {
      this.setName(name);
      return;
    }
    this.name = name;
    this.disconnect();
    this.room = room;
    this.status = 'connecting'; this.error = ''; this.roomFull = false; this.id = ''; this.capacity = 0;
    this.sendTime = 0; this.upgradeResult = null; this.otaResult = null; this.world = createWorld();
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${encodeURIComponent(room)}`);
    this.socket = socket;
    const timeout = window.setTimeout(() => {
      if (this.socket === socket && this.status === 'connecting') { this.error = 'Connection timed out. Try again or choose another room.'; socket.close(); }
    }, 10000);
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') {
          if (message.version !== PROTOCOL_VERSION) { this.error = 'Game updated. Reload to reconnect.'; socket.close(); return; }
          this.id = message.id; this.capacity = message.capacity; this.lastState = performance.now();
          socket.send(JSON.stringify({type:'name',name:this.name}));
          if (kind !== 'roadster') socket.send(JSON.stringify({type:'selectVehicle',kind}));
        }
        if (message.type === 'state' && this.id) { this.world = message.world; this.status = 'online'; this.lastState = performance.now(); clearTimeout(timeout); }
        if (message.type === 'upgradeResult') this.upgradeResult = message;
        if (message.type === 'otaResult') this.otaResult = message;
      } catch { this.error = 'Invalid server message. Please reconnect.'; socket.close(); }
    };
    socket.onclose = event => {
      clearTimeout(timeout);
      if (this.socket !== socket) return;
      this.status = 'disconnected';
      if (event.code === ROOM_FULL_CODE) { this.roomFull = true; this.error = 'This room is full. Try again or name another room to play in.'; }
      else this.error ||= 'The room disconnected. Try again or choose another room.';
    };
    socket.onerror = () => { if (this.socket === socket) this.error ||= 'Could not reach the room server. Try again or choose another room.'; };
  }
  tick(dt: number, input: Input) {
    if (this.status !== 'online') return;
    if (performance.now() - this.lastState > 6000) { this.error = 'Connection stalled. Rejoin to continue.'; this.socket?.close(); return; }
    this.sendTime += dt;
    if (this.sendTime >= .05) { this.send({type:'input',input}); this.sendTime = 0; }
  }
  selectVehicle(kind: VehicleId) { this.send({type:'selectVehicle',kind}); }
  parkingAction(action:'park'|'queue'|'start'|'leave') { this.send({type:'parking',action}); }
  raceAction(action:'join'|'start'|'leave',courseId:'short'|'oval') { this.send({type:'race',action,courseId}); }
  setName(name: string) { this.name = name; if (this.id) this.send({type:'name',name}); }
  buyUpgrade(upgrade: UpgradeId) {
    const requestId = ++this.nextUpgradeRequest; this.upgradeResult = null;
    if (this.status !== 'online' || !this.send({type:'upgrade',upgrade,requestId})) this.upgradeResult = {requestId,upgrade,ok:false};
    return requestId;
  }
  setOta(enabled: boolean) {
    const requestId = ++this.nextUpgradeRequest; this.otaResult = null;
    if (this.status !== 'online' || !this.send({type:'ota',enabled,requestId})) this.otaResult = {requestId,enabled,ok:false};
    return requestId;
  }
  action(type: 'interact' | 'reset' | 'autopilot' | 'dome') { this.send({type}); }
  private send(value: unknown): boolean { if (this.socket?.readyState !== WebSocket.OPEN) return false; this.socket.send(JSON.stringify(value)); return true; }
  disconnect() { const socket = this.socket; this.socket = undefined; socket?.close(); this.status = 'disconnected'; }
}
