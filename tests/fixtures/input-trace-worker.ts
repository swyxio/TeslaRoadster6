// Local-only diagnostic overlay. Never deploy this worker or expose its RPCs.
// It uses the production room and the playtest fixture's persistence denial.
import { GameRoom as BaseRoom } from './playtest-worker';
import type { InputCommand, ScheduledInput } from '../../shared/tick-input';

type Event = Record<string, unknown>;
type RoomSession = {control:ScheduledInput};

export class GameRoom extends BaseRoom {
  private events:Event[]=[];
  private dropped=0;
  private active=new Map<WebSocket,Event>();
  private wrapped=new WeakSet<WebSocket>();
  private holdNext=false;
  private releaseHold:(()=>void)|null=null;
  private delayed:Promise<void>|null=null;

  private record(event:Event) {
    if(this.events.length===512){this.events.shift();this.dropped++;}
    this.events.push(event);
  }
  constructor(ctx:DurableObjectState,env:unknown){
    super(ctx,env);
    const onMessage=Reflect.get(this,'onMessage') as (socket:WebSocket,raw:string|ArrayBuffer)=>Promise<void>;
    const reject=Reflect.get(this,'rejectInput') as (socket:WebSocket,message:{seq:number;targetTick:number},reason:string)=>void;
    Reflect.set(this,'rejectInput',(socket:WebSocket,message:{seq:number;targetTick:number},reason:string)=>{
      const event=this.active.get(socket);if(event)event.rejection=reason;
      return Reflect.apply(reject,this,[socket,message,reason]);
    });
    Reflect.set(this,'onMessage',(socket:WebSocket,raw:string|ArrayBuffer)=>{
      const entryTick=Reflect.get(this,'tickCount'),entryTime=performance.now();
      let message:{type?:string;seq?:number;targetTick?:number}|undefined;
      try {if(typeof raw==='string')message=JSON.parse(raw);}catch{/* production handler validates */}
      if(message?.type!=='input')return Reflect.apply(onMessage,this,[socket,raw]);
      const event:Event={kind:'receipt',seq:Number.isSafeInteger(message.seq)?message.seq:null,
        targetTick:Number.isSafeInteger(message.targetTick)?message.targetTick:null,
        entryTick,entryTime,schedulerCalled:false};
      this.record(event);
      const run=()=>{
        this.active.set(socket,event);
        try{return Reflect.apply(onMessage,this,[socket,raw]);}
        finally{this.active.delete(socket);}
      };
      const hold=this.holdNext;this.holdNext=false;
      // Preserve input order if another input arrives while this fixture holds one.
      const previous=this.delayed;
      if(!hold&&!previous)return run();
      const gate=hold?new Promise<void>(resolve=>{this.releaseHold=resolve;}):Promise.resolve();
      const result=(previous??Promise.resolve()).then(()=>gate).then(run);
      const pending=result.finally(()=>{if(this.delayed===pending)this.delayed=null;});
      this.delayed=pending;return pending;
    });
  }
  async fetch(request:Request):Promise<Response>{
    const response=await super.fetch(request);
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,RoomSession>;
    for(const [socket,session] of sessions){
      if(this.wrapped.has(socket))continue;this.wrapped.add(socket);
      const control=session.control,receive=control.receive.bind(control),advance=control.advance.bind(control);
      control.receive=(command:InputCommand,tick:number,now:number)=>{
        const result=receive(command,tick,now),state=control.snapshot(),event=this.active.get(socket);
        if(event)Object.assign(event,{schedulerCalled:true,receiptTick:tick,receiptTime:performance.now(),
          result:result.rejection??'accepted',revision:state.revision,receivedSeq:state.receivedSeq,
          appliedSeq:state.appliedSeq,heldUntilTick:state.heldUntilTick,
          jump:state.jump,flip:state.flip,outcomes:result.outcomes.map(outcome=>({...outcome}))});
        return result;
      };
      control.advance=(tick:number,now:number)=>{
        const result=advance(tick,now),state=control.snapshot();
        this.record({kind:'advance',tick,at:performance.now(),revision:state.revision,receivedSeq:state.receivedSeq,
          appliedSeq:state.appliedSeq,heldUntilTick:state.heldUntilTick,throttle:result.input.throttle,
          steer:result.input.steer,jump:state.jump,flip:state.flip,outcomes:result.outcomes.map(outcome=>({...outcome}))});
        return result;
      };
      const send=socket.send.bind(socket);
      Reflect.set(socket,'send',(data:string|ArrayBuffer|ArrayBufferView)=>{
        const sent=send(data);
        if(typeof data==='string'){
          if(data.startsWith('{"type":"state"'))this.record({kind:'snapshot-send',tick:Reflect.get(this,'tickCount'),at:performance.now()});
          else if(data.startsWith('{"type":"inputEdge"')){
            const edge=JSON.parse(data) as {kind:string;id:number;targetTick:number;status:string};
            this.record({kind:'edge-send',tick:Reflect.get(this,'tickCount'),at:performance.now(),
              edge:{kind:edge.kind,id:edge.id,targetTick:edge.targetTick,status:edge.status}});
          }
        }
        return sent;
      });
    }
    return response;
  }
  async trace(){return {events:this.events,dropped:this.dropped};}
  async holdDispatch(){if(this.holdNext||this.releaseHold)throw new Error('Dispatch already held');this.holdNext=true;}
  async releaseDispatch(){if(!this.releaseHold)throw new Error('No held dispatch');const release=this.releaseHold;this.releaseHold=null;release();}
}

export default {async fetch(request:Request,env:{ROOMS:DurableObjectNamespace<GameRoom>}){
  const url=new URL(request.url);
  if(!['127.0.0.1','localhost'].includes(url.hostname))return new Response('Local only',{status:403});
  if(url.pathname==='/health')return new Response('ok');
  if(!['/api/room/sandbox-trace','/__trace','/__hold','/__release'].includes(url.pathname))return new Response('Not found',{status:404});
  const room=env.ROOMS.get(env.ROOMS.idFromName('sandbox-trace'));
  if(url.pathname==='/__trace'&&request.method==='GET')return Response.json(await room.trace());
  if(url.pathname==='/__hold'&&request.method==='POST'){await room.holdDispatch();return new Response('ok');}
  if(url.pathname==='/__release'&&request.method==='POST'){await room.releaseDispatch();return new Response('ok');}
  if(url.pathname==='/api/room/sandbox-trace')return room.fetch(request);
  return new Response('Method not allowed',{status:405});
}};
