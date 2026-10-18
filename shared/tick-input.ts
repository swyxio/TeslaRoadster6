import { NEUTRAL, type Input } from './game';

export const FUTURE_TICKS = 8;
export const HOLD_TICKS = 6;
export const EDGE_LATE_TICKS = 3;
export const INPUT_TIMEOUT_MS = 300;

export type InputCommand = { seq:number; targetTick:number; controlRevision:number; actionSeq:number; input:Input };
export type EdgeBaseline = Pick<Input,'jump'|'flip'>;
export type EdgeOutcome = { kind:'jump'|'flip'; id:number; targetTick:number; status:'accepted'|'rescheduled'|'processed'|'expired'|'superseded' };
type PendingEdge = { id:number; targetTick:number };
type TimedEdge = PendingEdge & { receivedAtMs:number };
type EdgeState = { seen:number; processed:number; pending:TimedEdge[] };
type Slot = { seq:number; targetTick:number; input:Input };
export type ControlSnapshot = {
  revision:number; actionSeq:number; edgeFloorRevision:number; receivedSeq:number; appliedSeq:number; held:Input; heldUntilTick:number;
  queued:Slot[]; jump:{seen:number;processed:number;pending:PendingEdge[]}; flip:{seen:number;processed:number;pending:PendingEdge[]};
};

const COUNTER_MODULUS = 2 ** 31;
const COUNTER_HALF = COUNTER_MODULUS / 2;
// Half-range serial number comparison: the exactly-half-range case is ambiguous
// and therefore not considered newer. Inputs are validated by the caller.
function newer(id:number, previous:number):boolean {
  const distance=(id-previous+COUNTER_MODULUS)%COUNTER_MODULUS;
  return distance>0 && distance<COUNTER_HALF;
}
function neutral(jump:number,flip:number):Input { return {...NEUTRAL,jump,flip}; }

/** Pure per-connection control scheduler. Call advance exactly once per room tick. */
export class ScheduledInput {
  private revision=0;
  private actionSeq=0;
  private edgeFloorRevision=0;
  private receivedSeq=0;
  private appliedSeq=0;
  private held:Input;
  private heldUntilTick=0;
  private queued:Slot[]=[];
  private jump:EdgeState;
  private flip:EdgeState;
  private lastControlInputMs:number|null=null;

  constructor(initial:Input) {
    this.held={...initial};
    this.jump={seen:initial.jump,processed:initial.jump,pending:[]};
    this.flip={seen:initial.flip,processed:initial.flip,pending:[]};
  }

  // A local prediction copy; the server's wall-clock timeout remains
  // authoritative. Resetting its age to now bounds approximation locally.
  static fromSnapshot(snapshot:ControlSnapshot,nowMs:number):ScheduledInput {
    const scheduler=new ScheduledInput(snapshot.held);
    scheduler.revision=snapshot.revision;
    scheduler.actionSeq=snapshot.actionSeq;
    scheduler.edgeFloorRevision=snapshot.edgeFloorRevision;
    scheduler.receivedSeq=snapshot.receivedSeq;
    scheduler.appliedSeq=snapshot.appliedSeq;
    scheduler.held={...snapshot.held};
    scheduler.heldUntilTick=snapshot.heldUntilTick;
    scheduler.queued=snapshot.queued.map(slot=>({...slot,input:{...slot.input}}));
    scheduler.jump={...snapshot.jump,pending:snapshot.jump.pending.map(edge=>({...edge,receivedAtMs:nowMs}))};
    scheduler.flip={...snapshot.flip,pending:snapshot.flip.pending.map(edge=>({...edge,receivedAtMs:nowMs}))};
    scheduler.lastControlInputMs=snapshot.heldUntilTick>0||snapshot.queued.length>0?nowMs:null;
    return scheduler;
  }

  // The fence advances even when the action itself is rejected. A baseline
  // behind an already observed press is not a valid serial-number snapshot.
  beginAction(seq:number,baseline:EdgeBaseline):boolean {
    if(seq<=this.actionSeq)return false;
    for(const kind of ['jump','flip'] as const){
      const seen=this[kind].seen,id=baseline[kind];
      if(id!==seen&&!newer(id,seen))return false;
    }
    this.actionSeq=seq;
    return true;
  }

  receive(command:InputCommand,currentTick:number,nowMs:number):{rejection?:'late'|'future'|'revision'|'order'|'action';outcomes:EdgeOutcome[]} {
    if(command.seq<=this.receivedSeq)return {rejection:'order',outcomes:[]};
    const outcomes=this.expireTimedOut(nowMs);
    this.receivedSeq=command.seq;
    const actionMismatch=command.actionSeq!==this.actionSeq;
    const stale=command.controlRevision<this.revision;
    const bridge=stale&&!actionMismatch&&command.controlRevision>=this.edgeFloorRevision;
    const invalidRevision=command.controlRevision!==this.revision;
    const rejection=actionMismatch?'action':invalidRevision?'revision':
      command.targetTick<=currentTick?'late':command.targetTick>currentTick+FUTURE_TICKS?'future':undefined;
    const canSchedule=!actionMismatch&&(!invalidRevision||bridge);
    for(const kind of ['jump','flip'] as const){
      const state=this[kind],id=command.input[kind];
      if(!newer(id,state.seen))continue;
      state.seen=id;
      const late=command.targetTick<=currentTick;
      if(!canSchedule||command.targetTick>currentTick+FUTURE_TICKS||(late&&currentTick-command.targetTick>EDGE_LATE_TICKS)){
        outcomes.push({kind,id,targetTick:command.targetTick,status:'expired'});
        continue;
      }
      const last=state.pending.at(-1)?.targetTick??currentTick;
      const targetTick=Math.max(command.targetTick,currentTick+1,last+1);
      if(targetTick>currentTick+FUTURE_TICKS){
        outcomes.push({kind,id,targetTick:command.targetTick,status:'expired'});
        continue;
      }
      state.pending.push({id,targetTick,receivedAtMs:nowMs});
      if(targetTick!==command.targetTick)outcomes.push({kind,id,targetTick,status:'rescheduled'});
      else if(bridge)outcomes.push({kind,id,targetTick,status:'accepted'});
    }
    if(rejection)return {rejection,outcomes};
    this.lastControlInputMs=nowMs;
    // If target ticks move backwards, a later-tick slot from an older sequence
    // must not reinstate obsolete held controls after this one has run.
    this.queued=this.queued.filter(slot=>slot.targetTick<command.targetTick);
    this.queued.push({seq:command.seq,targetTick:command.targetTick,input:{...command.input}});
    this.queued.sort((a,b)=>a.targetTick-b.targetTick);
    return {outcomes};
  }

  advance(tick:number,nowMs:number):{input:Input;outcomes:EdgeOutcome[]} {
    const outcomes=this.expireTimedOut(nowMs);
    const slot=this.queued.find(item=>item.targetTick===tick);
    this.queued=this.queued.filter(item=>item.targetTick>tick);
    if(slot){
      this.held={...slot.input,jump:this.jump.processed,flip:this.flip.processed};
      this.heldUntilTick=tick+HOLD_TICKS-1;
      this.appliedSeq=slot.seq;
    }else if(tick>this.heldUntilTick){
      this.held=neutral(this.jump.processed,this.flip.processed);
    }
    for(const kind of ['jump','flip'] as const){
      const state=this[kind],pending:TimedEdge[]=[];
      for(const edge of state.pending){
        if(edge.targetTick>tick)pending.push(edge);
        else if(edge.targetTick<tick)outcomes.push({kind,id:edge.id,targetTick:edge.targetTick,status:'expired'});
        else{
          state.processed=edge.id;
          this.held[kind]=edge.id;
          outcomes.push({kind,id:edge.id,targetTick:edge.targetTick,status:'processed'});
        }
      }
      state.pending=pending;
    }
    return {input:{...this.held},outcomes};
  }

  private expireTimedOut(nowMs:number):EdgeOutcome[] {
    const outcomes:EdgeOutcome[]=[];
    if(this.lastControlInputMs!==null&&nowMs-this.lastControlInputMs>INPUT_TIMEOUT_MS){
      this.queued=[];
      this.held=neutral(this.jump.processed,this.flip.processed);
      this.heldUntilTick=0;
      this.lastControlInputMs=null;
    }
    for(const kind of ['jump','flip'] as const){
      const retained:TimedEdge[]=[];
      for(const edge of this[kind].pending){
        if(nowMs-edge.receivedAtMs>INPUT_TIMEOUT_MS)outcomes.push({kind,id:edge.id,targetTick:edge.targetTick,status:'expired'});
        else retained.push(edge);
      }
      this[kind].pending=retained;
    }
    return outcomes;
  }

  invalidate(baseline:Input,reason:{type:'action';edgeBaseline:EdgeBaseline}|{type:'relocation'}):EdgeOutcome[] {
    const outcomes:EdgeOutcome[]=[];
    this.revision++;
    if(reason.type==='relocation')this.edgeFloorRevision=this.revision;
    this.queued=[];
    for(const kind of ['jump','flip'] as const){
      const state=this[kind];
      for(const edge of state.pending)outcomes.push({kind,id:edge.id,targetTick:edge.targetTick,status:'superseded'});
      state.pending=[];
      state.processed=baseline[kind];
      if(newer(baseline[kind],state.seen))state.seen=baseline[kind];
      if(reason.type==='action'&&newer(reason.edgeBaseline[kind],state.seen))state.seen=reason.edgeBaseline[kind];
    }
    this.held=neutral(baseline.jump,baseline.flip);
    this.heldUntilTick=0;
    this.lastControlInputMs=null;
    return outcomes;
  }

  snapshot():ControlSnapshot {
    const edge=(state:EdgeState)=>({seen:state.seen,processed:state.processed,pending:state.pending.map(({id,targetTick})=>({id,targetTick}))});
    return {revision:this.revision,actionSeq:this.actionSeq,edgeFloorRevision:this.edgeFloorRevision,receivedSeq:this.receivedSeq,appliedSeq:this.appliedSeq,
      held:{...this.held},heldUntilTick:this.heldUntilTick,
      queued:this.queued.map(slot=>({...slot,input:{...slot.input}})),jump:edge(this.jump),flip:edge(this.flip)};
  }
}
