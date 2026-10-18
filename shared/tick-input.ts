import { NEUTRAL, type Input } from './game';

export const FUTURE_TICKS = 8;
export const HOLD_TICKS = 6;
export const EDGE_LATE_TICKS = 3;
export const INPUT_TIMEOUT_MS = 300;

export type InputCommand = { seq:number; targetTick:number; controlRevision:number; input:Input };
export type EdgeOutcome = { kind:'jump'|'flip'; id:number; targetTick:number; status:'rescheduled'|'processed'|'expired'|'superseded' };
type PendingEdge = { id:number; targetTick:number };
type EdgeState = { seen:number; processed:number; pending:PendingEdge[] };
type Slot = { seq:number; targetTick:number; input:Input };
export type ControlSnapshot = {
  revision:number; receivedSeq:number; appliedSeq:number; held:Input; heldUntilTick:number;
  queued:Slot[]; jump:EdgeState; flip:EdgeState;
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
  private receivedSeq=0;
  private appliedSeq=0;
  private held:Input;
  private heldUntilTick=0;
  private queued:Slot[]=[];
  private jump:EdgeState;
  private flip:EdgeState;
  private lastControlInputMs:number|null=null;
  private lastEdgeInputMs:number|null=null;

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
    scheduler.receivedSeq=snapshot.receivedSeq;
    scheduler.appliedSeq=snapshot.appliedSeq;
    scheduler.held={...snapshot.held};
    scheduler.heldUntilTick=snapshot.heldUntilTick;
    scheduler.queued=snapshot.queued.map(slot=>({...slot,input:{...slot.input}}));
    scheduler.jump={...snapshot.jump,pending:snapshot.jump.pending.map(edge=>({...edge}))};
    scheduler.flip={...snapshot.flip,pending:snapshot.flip.pending.map(edge=>({...edge}))};
    scheduler.lastControlInputMs=snapshot.heldUntilTick>0||snapshot.queued.length>0?nowMs:null;
    scheduler.lastEdgeInputMs=snapshot.jump.pending.length>0||snapshot.flip.pending.length>0?nowMs:null;
    return scheduler;
  }

  receive(command:InputCommand,currentTick:number,nowMs:number):{rejection?:'late'|'future'|'revision'|'order';outcomes:EdgeOutcome[]} {
    const outcomes:EdgeOutcome[]=[];
    if(command.controlRevision!==this.revision){
      // A press sent before the client learned of an action's new revision
      // must not be resurrected by the same counter on its next valid frame.
      if(command.controlRevision<this.revision&&command.seq>this.receivedSeq){
        for(const kind of ['jump','flip'] as const){
          const state=this[kind],id=command.input[kind];
          if(newer(id,state.seen)){
            state.seen=id;
            outcomes.push({kind,id,targetTick:command.targetTick,status:'expired'});
          }
        }
      }
      return {rejection:'revision',outcomes};
    }
    if(command.seq<=this.receivedSeq)return {rejection:'order',outcomes};
    outcomes.push(...this.expireTimedOut(nowMs));
    this.receivedSeq=command.seq;
    const rejection=command.targetTick<=currentTick?'late':command.targetTick>currentTick+FUTURE_TICKS?'future':undefined;
    // Distinct counters are events, not a property of the continuous slot.
    // A slightly late press can reach the next step while its held input is
    // rejected; far-future and excessively late presses are terminal.
    let acceptedLateEdge=false;
    for(const kind of ['jump','flip'] as const){
      const state=this[kind],id=command.input[kind];
      if(!newer(id,state.seen))continue;
      state.seen=id;
      const targetTick=rejection==='late'&&currentTick-command.targetTick<=EDGE_LATE_TICKS?currentTick+1:command.targetTick;
      // A later sequence aimed earlier must not cause older presses to fire
      // after the newer event, even if the new event itself expires.
      const retained:PendingEdge[]=[];
      for(const edge of state.pending){
        if(edge.targetTick>=targetTick)outcomes.push({kind,...edge,status:'superseded'});
        else retained.push(edge);
      }
      state.pending=retained;
      if(rejection==='future'||(rejection==='late'&&currentTick-command.targetTick>EDGE_LATE_TICKS)){
        outcomes.push({kind,id,targetTick:command.targetTick,status:'expired'});
      }else{
        if(rejection==='late'){
          acceptedLateEdge=true;
          outcomes.push({kind,id,targetTick,status:'rescheduled'});
        }
        state.pending.push({id,targetTick});
        state.pending.sort((a,b)=>a.targetTick-b.targetTick);
      }
    }
    if(rejection){
      if(acceptedLateEdge)this.lastEdgeInputMs=nowMs;
      return {rejection,outcomes};
    }
    this.lastControlInputMs=nowMs;
    this.lastEdgeInputMs=nowMs;
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
      const state=this[kind],pending:PendingEdge[]=[];
      for(const edge of state.pending){
        if(edge.targetTick>tick)pending.push(edge);
        else if(edge.targetTick<tick)outcomes.push({kind,...edge,status:'expired'});
        else{
          state.processed=edge.id;
          this.held[kind]=edge.id;
          outcomes.push({kind,...edge,status:'processed'});
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
    if(this.lastEdgeInputMs!==null&&nowMs-this.lastEdgeInputMs>INPUT_TIMEOUT_MS){
      for(const kind of ['jump','flip'] as const){
        for(const edge of this[kind].pending)outcomes.push({kind,...edge,status:'expired'});
        this[kind].pending=[];
      }
      this.lastEdgeInputMs=null;
    }
    return outcomes;
  }

  invalidate(baseline:Input):EdgeOutcome[] {
    const outcomes:EdgeOutcome[]=[];
    this.revision++;
    this.queued=[];
    for(const kind of ['jump','flip'] as const){
      const state=this[kind];
      for(const edge of state.pending)outcomes.push({kind,...edge,status:'superseded'});
      state.pending=[];
      state.processed=baseline[kind];
      if(newer(baseline[kind],state.seen))state.seen=baseline[kind];
    }
    this.held=neutral(baseline.jump,baseline.flip);
    this.heldUntilTick=0;
    this.lastControlInputMs=null;
    this.lastEdgeInputMs=null;
    return outcomes;
  }

  snapshot():ControlSnapshot {
    const edge=(state:EdgeState):EdgeState=>({...state,pending:state.pending.map(item=>({...item}))});
    return {revision:this.revision,receivedSeq:this.receivedSeq,appliedSeq:this.appliedSeq,
      held:{...this.held},heldUntilTick:this.heldUntilTick,
      queued:this.queued.map(slot=>({...slot,input:{...slot.input}})),jump:edge(this.jump),flip:edge(this.flip)};
  }
}
