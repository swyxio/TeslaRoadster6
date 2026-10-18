import type { VehicleId } from '../shared/vehicles';
import { PROTOCOL_VERSION, buyUpgrade, chooseVehicle, toggleAutopilot, createWorld, addPlayer, step, interact, parkingAction, raceAction, resetPlayer, travelDome, type World, type Input } from '../shared/game';
import type { UpgradeId } from '../shared/upgrades';
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
  error = '';
  constructor() { addPlayer(this.world, this.id, 'You'); }
  solo(kind:VehicleId='roadster') {
    this.disconnect(); this.status = 'solo'; this.id = 'local'; this.capacity = 1; this.error = '';
    this.world = createWorld(); addPlayer(this.world, this.id, 'You'); if(kind!=='roadster')chooseVehicle(this.world,this.id,kind);
  }
  join(room: string, name: string,kind:VehicleId='roadster') {
    this.disconnect(); this.status = 'connecting'; this.error = ''; this.id = ''; this.world = createWorld();
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${encodeURIComponent(room)}`);
    this.socket = socket;
    const timeout = window.setTimeout(() => { if (this.status === 'connecting') { this.error = 'Connection timed out. Try again or drive solo.'; socket.close(); } }, 10000);
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') {
          if (message.version !== PROTOCOL_VERSION) { this.error = 'Game updated. Reload to reconnect.'; socket.close(); return; }
          this.id = message.id; this.capacity = message.capacity; this.lastState = performance.now();
          socket.send(JSON.stringify({type:'name',name}));
          if(kind!=='roadster')socket.send(JSON.stringify({type:'selectVehicle',kind}));
        }
        if (message.type === 'state' && this.id) { this.world = message.world; this.status = 'online'; this.lastState = performance.now(); clearTimeout(timeout); }
      } catch { this.error = 'Invalid server message. Please reconnect.'; socket.close(); }
    };
    socket.onclose = () => { clearTimeout(timeout); if (this.socket === socket) { this.status = 'disconnected'; this.error ||= 'Room disconnected or full. Rejoin, choose a new room, or drive solo.'; } };
    socket.onerror = () => { this.error = 'Could not reach the room server. Try again or drive solo.'; };
  }
  tick(dt: number, input: Input) {
    if (this.status === 'solo') {
      this.accumulator += Math.min(dt, .1);
      while (this.accumulator >= .05) { step(this.world, new Map([[this.id, input]]), .05); this.accumulator -= .05; }
    } else if (this.status === 'online') {
      if (performance.now() - this.lastState > 6000) { this.error = 'Connection stalled. Rejoin to continue.'; this.socket?.close(); return; }
      this.sendTime += dt;
      if (this.sendTime >= .05) { this.send({type:'input',input}); this.sendTime = 0; }
    }
  }
  selectVehicle(kind:VehicleId){if(this.status==='solo')chooseVehicle(this.world,this.id,kind);else this.send({type:'selectVehicle',kind});}
  parkingAction(action:'park'|'queue'|'start'|'leave'){if(this.status==='solo')parkingAction(this.world,this.id,action);else this.send({type:'parking',action});}
  raceAction(action:'join'|'start'|'leave',courseId:'short'|'oval'){if(this.status==='solo')raceAction(this.world,this.id,action,courseId);else this.send({type:'race',action,courseId});}
  buyUpgrade(upgrade:UpgradeId){if(this.status==='solo')buyUpgrade(this.world,this.id,upgrade);else this.send({type:'upgrade',upgrade});}
  action(type: 'interact' | 'reset' | 'autopilot' | 'dome') {
    if (this.status === 'solo') (type === 'interact' ? interact : type==='autopilot'?toggleAutopilot:type==='dome'?travelDome:resetPlayer)(this.world, this.id);
    else this.send({type});
  }
  private send(value: unknown) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value)); }
  disconnect() { const socket = this.socket; this.socket = undefined; socket?.close(); }
}
