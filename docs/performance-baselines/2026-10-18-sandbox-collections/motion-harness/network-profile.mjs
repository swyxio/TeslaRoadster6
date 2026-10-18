import { performance } from 'node:perf_hooks';

export const profiles=['zero','steady150','bunched150','gap250'];
const maxEvents=12000,maxQueue=512;
const bunchedExtra=[0,0,125,-16.667,-16.667];

// Only public protocol timing identifiers are retained. Never save raw data,
// player names, wallet data, recovery codes, chat text, or arbitrary fields.
export function safeMessage(message) {
  if(typeof message!=='string')return {type:'binary'};
  try {
    const raw=JSON.parse(message);
    const integer=value=>Number.isSafeInteger(value)?value:null;
    if(raw?.type==='input')return {type:'input',seq:integer(raw.seq),targetTick:integer(raw.targetTick)};
    if(raw?.type==='state')return {type:'state',tick:integer(raw.tick),receivedSeq:integer(raw.control?.receivedSeq),poseRevision:integer(raw.poseRevision)};
    if(raw?.type==='inputRejected')return {type:'inputRejected',seq:integer(raw.seq),targetTick:integer(raw.targetTick)};
    if(raw?.type==='inputEdge')return {type:'inputEdge',targetTick:integer(raw.targetTick),
      status:['accepted','rescheduled','processed','expired','superseded'].includes(raw.status)?raw.status:null};
    if(raw?.type==='welcome')return {type:'welcome',tick:integer(raw.tick),poseRevision:integer(raw.poseRevision)};
  }catch{}
  return {type:'other'};
}

// Inject clocks and timers for cheap deterministic tests. All event timestamps
// are in the Node performance.now() clock; data sent onward is untouched.
export function createNetworkProfile(profile, options={}) {
  if(!profiles.includes(profile))throw new Error(`Unknown network profile: ${profile}`);
  const now=options.now||(()=>performance.now());
  const setTimer=options.setTimer||((fn,ms)=>setTimeout(fn,ms));
  const clearTimer=options.clearTimer||clearTimeout;
  const eventLimit=options.eventLimit||maxEvents,queueLimit=options.queueLimit||maxQueue;
  const data={profile,nodeTimeOrigin:performance.timeOrigin,events:[],droppedEvents:0,overflow:false,
    sendsFailed:0,gap:{armedAtNodeMs:null,startAtNodeMs:null,endTargetAtNodeMs:null,held:0,firstAfterNodeMs:null},
    maxQueue:{up:0,down:0}};
  const dirs={up:{queue:[],timer:null,index:0,priorDue:-Infinity},down:{queue:[],timer:null,index:0,priorDue:-Infinity}};
  let nextId=0,stopped=false;
  const record=event=>{if(data.events.length<eventLimit)data.events.push(event);else data.droppedEvents++;};
  const pump=direction=>{
    const state=dirs[direction];state.timer=null;
    while(!stopped&&state.queue.length&&state.queue[0].due<=now()){
      const item=state.queue.shift(),sentAt=now();
      try{item.forward(item.payload);}catch{data.sendsFailed++;}
      record({event:'forwarded',id:item.id,direction,forwardInvokedNodeMs:sentAt,queueDwellMs:sentAt-item.seenAt,...item.meta});
      if(profile==='gap250'&&direction==='down'){
        const gap=data.gap;
        if(gap.armedAtNodeMs!==null&&gap.startAtNodeMs===null&&item.meta.type==='state'){
          gap.startAtNodeMs=sentAt;gap.endTargetAtNodeMs=sentAt+250;
          record({event:'gap-start',direction,forwardInvokedNodeMs:sentAt,endTargetNodeMs:gap.endTargetAtNodeMs});
        }else if(gap.startAtNodeMs!==null&&gap.firstAfterNodeMs===null&&sentAt>=gap.endTargetAtNodeMs){
          gap.firstAfterNodeMs=sentAt;
          record({event:'gap-end',direction,forwardInvokedNodeMs:sentAt});
        }
      }
    }
    if(!stopped&&state.queue.length)state.timer=setTimer(()=>pump(direction),Math.max(0,state.queue[0].due-now()));
  };
  function enqueue(direction,payload,forward) {
    if(stopped)throw new Error('Network profile is stopped');
    const state=dirs[direction];if(!state)throw new Error('Invalid direction');
    if(state.queue.length>=queueLimit){data.overflow=true;throw new Error(`Network ${direction} queue exceeded ${queueLimit}`);}
    const seenAt=now(),index=state.index++,baseMs=(profile==='steady150'||profile==='bunched150')?75:0;
    const jitterMs=profile==='bunched150'?bunchedExtra[index%bunchedExtra.length]:0;
    let desired=seenAt+Math.max(0,baseMs+jitterMs),gapDelayMs=0;
    if(profile==='gap250'&&direction==='down'&&data.gap.endTargetAtNodeMs!==null&&seenAt<data.gap.endTargetAtNodeMs){
      gapDelayMs=data.gap.endTargetAtNodeMs-seenAt;desired=Math.max(desired,data.gap.endTargetAtNodeMs);data.gap.held++;
    }
    const due=Math.max(desired,state.priorDue),fifoDelayMs=due-desired;
    state.priorDue=due;
    const meta=safeMessage(payload),id=++nextId;
    state.queue.push({id,payload,forward,seenAt,due,meta});
    data.maxQueue[direction]=Math.max(data.maxQueue[direction],state.queue.length);
    record({event:'enqueued',id,direction,scheduleIndex:index,seenAtNodeMs:seenAt,releaseTargetNodeMs:due,
      requestedBaseDelayMs:baseMs,jitterMs,gapDelayMs,fifoDelayMs,...meta});
    if(state.timer===null)pump(direction);
    return id;
  }
  function armGap(){
    if(profile!=='gap250')throw new Error('The gap can only be armed for gap250');
    if(data.gap.armedAtNodeMs!==null)throw new Error('Gap already armed');
    data.gap.armedAtNodeMs=now();record({event:'gap-armed',armedAtNodeMs:data.gap.armedAtNodeMs});
  }
  function startScenario(){
    for(const state of Object.values(dirs))state.index=0;
    record({event:'scenario-network-phase',atNodeMs:now()});
  }
  function pendingBefore(cutoff){return Object.values(dirs).flatMap(d=>d.queue).filter(item=>item.seenAt<=cutoff).length;}
  function stop(){stopped=true;for(const state of Object.values(dirs)){if(state.timer!==null)clearTimer(state.timer);state.timer=null;state.queue.length=0;}}
  function snapshot(){return {...data,events:data.events.slice(),gap:{...data.gap},maxQueue:{...data.maxQueue},
    pending:{up:dirs.up.queue.length,down:dirs.down.queue.length}};}
  return {enqueue,armGap,startScenario,pendingBefore,stop,snapshot};
}
