export type SentInput = {at:number;utc:string;targetTick:number;lastSnapshotTick:number|null};
export type AckObservations = {lastReceived:number;lastApplied:number;receivedMs:number[];appliedMs:number[];
  unmatchedReceived:number;unmatchedApplied:number;measuredApplied:boolean};

export const newAckObservations = ():AckObservations => ({lastReceived:0,lastApplied:0,receivedMs:[],appliedMs:[],
  unmatchedReceived:0,unmatchedApplied:0,measuredApplied:false});

// An observed received sequence can also be rejected. An applied sample only
// measures a sequence actually present in a snapshot; skipped sequences have
// no reported latency. Both ends use this generator's monotonic clock.
export function observeAcks(state:AckObservations, sent:Map<number,SentInput>, received:number, applied:number,
  now:number, start:number, end:number):void {
  const measuring=now>=start&&now<end;
  for(const [kind,seq] of [['received',received],['applied',applied]] as const){
    const last=kind==='received'?state.lastReceived:state.lastApplied;
    if(!Number.isSafeInteger(seq)||seq<=last)continue;
    if(kind==='received')state.lastReceived=seq;else state.lastApplied=seq;
    if(!measuring)continue;
    const command=sent.get(seq);
    if(!command){if(kind==='received')state.unmatchedReceived++;else state.unmatchedApplied++;continue;}
    if(command.at<start||command.at>=end)continue;
    (kind==='received'?state.receivedMs:state.appliedMs).push(now-command.at);
    if(kind==='applied')state.measuredApplied=true;
  }
}
