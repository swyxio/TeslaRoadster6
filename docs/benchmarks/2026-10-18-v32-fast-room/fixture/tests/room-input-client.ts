// Small protocol-v32 input helper for local integration tests and benchmarks.
// The owning script parses each socket message once and passes it to observe().
import type { Input } from '../shared/game';
import type { ControlSnapshot, EdgeOutcome } from '../shared/tick-input';

type Rejection = {seq:number;targetTick:number;reason:string};
type Options = {seq?:number;targetTick?:number;roomEpoch?:string;controlRevision?:number; preserveCounters?:boolean};
const newer=(id:number,previous:number)=>{const delta=(id-previous+2**31)%2**31;return delta>0&&delta<2**30;};

export class RoomInputClient {
  tick=-1;
  roomEpoch='';
  poseRevision=0;
  control?:ControlSnapshot;
  private observedAt=0;
  private nextSeq=0;
  private jump=0;
  private flip=0;
  readonly rejections:Rejection[]=[];
  readonly edges:EdgeOutcome[]=[];
  rejectionCount=0;
  constructor(private readonly socket:WebSocket) {}
  observe(message:any):void {
    if(message.type==='welcome'){
      this.tick=message.tick;this.roomEpoch=message.roomEpoch;this.observedAt=performance.now();
    }else if(message.type==='state'){
      this.tick=message.tick;this.roomEpoch=message.roomEpoch;this.control=message.control;this.poseRevision=message.poseRevision;this.observedAt=performance.now();
      if(this.control){
        if(newer(this.control.jump.seen,this.jump))this.jump=this.control.jump.seen;
        if(newer(this.control.flip.seen,this.flip))this.flip=this.control.flip.seen;
      }
    }else if(message.type==='inputRejected'){
      this.rejectionCount++;
      this.rejections.push({seq:message.seq,targetTick:message.targetTick,reason:message.reason});
      if(this.rejections.length>128)this.rejections.shift();
    }else if(message.type==='inputEdge'){
      this.edges.push({kind:message.kind,id:message.id,targetTick:message.targetTick,status:message.status});
      if(this.edges.length>128)this.edges.shift();
    }
  }
  get ready():boolean {return this.socket.readyState===WebSocket.OPEN&&this.tick>=0&&!!this.roomEpoch&&!!this.control;}
  get lastSeq():number{return this.nextSeq;}
  send(input:Input, options:Options={}):number {
    if(!this.ready)throw new Error('Cannot send before the room state is received');
    const seq=options.seq??this.nextSeq+1;
    this.nextSeq=Math.max(this.nextSeq,seq);
    const value={...input};
    if(options.preserveCounters!==false){
      if(newer(value.jump,this.jump))this.jump=value.jump;
      if(newer(value.flip,this.flip))this.flip=value.flip;
      value.jump=this.jump;value.flip=this.flip;
    }
    // Snapshots normally arrive every two room ticks; this modest bounded
    // estimate tolerates the intervening tick without assuming wall time is an
    // authoritative room clock. Rejections are surfaced to the caller.
    const elapsedTicks=Math.min(2,Math.max(0,Math.floor((performance.now()-this.observedAt)/50)));
    const targetTick=options.targetTick??this.tick+3+elapsedTicks;
    this.socket.send(JSON.stringify({type:'input',seq,targetTick,roomEpoch:options.roomEpoch??this.roomEpoch,
      controlRevision:options.controlRevision??this.control!.revision,input:value}));
    return seq;
  }
}
