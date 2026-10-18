/** Tick-target Session and scheduler, driven by the synthetic harness. */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { NEUTRAL, PROTOCOL_VERSION, resetPlayer, step, type Entity, type World } from '../shared/game';
import { domeSurface, supportNormal } from '../shared/map';
import { ScheduledInput, type EdgeOutcome } from '../shared/tick-input';
import { Session } from '../src/session';
import { parseMessage } from '../worker/protocol';
import { prepareSnapshots, snapshotFor } from '../worker/snapshot';
import type { AdapterContext, MotionAdapter, Pose } from './motion-benchmark';

function controlled(world:World,id:string):Entity {
  const entityId=world.players.find(player=>player.id===id)?.entityId;
  const entity=world.entities.find(item=>item.id===entityId);
  if(!entity)throw new Error(`Controlled entity ${id} is missing`);
  return entity;
}

// Mirrors the controlled-car orientation calculation in GameScene. Rendering,
// camera behavior, GPU work, and material/terrain visuals are not exercised.
function orientation(e:Entity,filteredUp?:Vector3):Quaternion {
  const surface=e.supportId==='dome'&&e.domeS!==null?domeSurface(e.domeS):null;
  const normal=e.supportId===null||e.supportId==='stunt-loop'||e.supportId==='island-cliff'||e.supportId==='dome'?null:supportNormal(e.supportId,e.x,e.z);
  const up=new Vector3(surface?0:normal?.x??0,surface?.normalY??normal?.y??1,surface?.normalZ??normal?.z??0);
  if(filteredUp)up.copy(filteredUp);
  const back=new Vector3(Math.sin(e.yaw),surface?Math.cos(e.yaw)*surface.tangentY:0,surface?Math.cos(e.yaw)*surface.tangentZ:Math.cos(e.yaw));
  const right=new Vector3().crossVectors(up,back).normalize();back.crossVectors(right,up).normalize();
  const q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right,up,back));
  q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),e.supportId===null||e.supportId==='stunt-loop'||e.supportId==='island-cliff'?e.pitch:0));
  q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),e.roll));
  return q;
}
const debug=(e:Entity)=>({supportId:e.supportId,yaw:e.yaw,pitch:e.pitch,roll:e.roll,normal:e.supportId===null?null:supportNormal(e.supportId,e.x,e.z),speedMps:Math.hypot(e.vx,e.vy,e.vz)});
const toPose=(e:Entity):Pose=>{const q=orientation(e);return {x:e.x,y:e.y,z:e.z,q:[q.x,q.y,q.z,q.w],debug:debug(e)};};

export function createMotionAdapter(context:AdapterContext):MotionAdapter {
  const {world,id,sendToServer,sendToClient}=context;
  const roomEpoch='00000000-0000-4000-8000-000000000000',control=new ScheduledInput({...NEUTRAL});
  let now=0,pendingSync=0,lastSubsteps=1,poseRevision=0,ticks=0,rejected=0,processedEdges=0,expiredEdges=0;
  const rejectionCounts:Record<string,number>={},rejectionEvents:{atMs:number;seq:number;targetTick:number;serverTick:number;reason:string}[]=[];
  const presentationEvents:{atMs:number;predicted:boolean;snap:boolean}[]=[];
  const snapDetails:{atMs:number;distanceFromExpected:number|null;expectedRoll:number|null;actualRoll:number;targetTick:number|null;estimatedTick:number|null}[]=[];
  const commandEvents:{atMs:number;seq:number;targetTick:number}[]=[],snapshotEvents:{atMs:number;tick:number;receivedSeq:number;poseRevision:number;pose:{x:number;y:number;z:number;yaw:number}|null}[]=[];
  const noteRejection=(seq:number,targetTick:number,reason:string,time:number)=>{
    rejected++;rejectionCounts[reason]=(rejectionCounts[reason]??0)+1;
    if(rejectionEvents.length<64)rejectionEvents.push({atMs:time,seq,targetTick,serverTick:ticks,reason});
  };
  const priorGlobals=new Map<string,PropertyDescriptor|undefined>();
  const setGlobal=(key:string,value:unknown)=>{priorGlobals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
  class Socket {
    static OPEN=1;
    readyState=1;
    onmessage:((event:{data:string})=>void)|null=null;
    onclose:((event:{code:number})=>void)|null=null;
    onerror:(()=>void)|null=null;
    constructor(_url:string){socket=this;}
    send(data:string){const msg=JSON.parse(data);if(msg.type==='input')commandEvents.push({atMs:now,seq:msg.seq,targetTick:msg.targetTick});sendToServer(data,now);}
    close(){this.readyState=3;}
  }
  let socket:Socket;
  setGlobal('performance',{now:()=>now});
  setGlobal('location',{protocol:'http:',host:'benchmark.invalid'});
  setGlobal('window',{setTimeout:()=>0});
  setGlobal('WebSocket',Socket);
  const sourceEdges={jump:0,flip:0};
  const session=new Session(()=>now,()=>({...sourceEdges}));session.join('bench','Benchmark');
  const deliver=(data:string)=>socket.onmessage?.({data});
  deliver(JSON.stringify({type:'welcome',id,version:PROTOCOL_VERSION,capacity:1,tick:ticks,roomEpoch,substeps:lastSubsteps,poseRevision}));
  if(!session.id)throw new Error('Benchmark welcome protocol version differs from Session');
  deliver(JSON.stringify({type:'state',world:snapshotFor(world,id),tick:ticks,roomEpoch,substeps:lastSubsteps,poseRevision,control:control.snapshot()}));
  if(session.status!=='online')throw new Error(`Benchmark initial state was rejected: ${session.error}`);

  const sendEdges=(outcomes:EdgeOutcome[],time:number)=>{
    for(const outcome of outcomes){
      if(outcome.status==='processed')processedEdges++;else if(outcome.status==='expired'||outcome.status==='superseded')expiredEdges++;
      sendToClient(JSON.stringify({type:'inputEdge',...outcome}),time);
    }
  };
  const invalidate=(time:number,relocated=false,edgeBaseline?:{jump:number;flip:number})=>{
    const entity=controlled(world,id);
    if(relocated)poseRevision++;
    sendEdges(control.invalidate({...NEUTRAL,jump:entity.lastJump,flip:entity.lastFlip},edgeBaseline?{type:'action',edgeBaseline}:{type:'relocation'}),time);
  };
  const poseSignature=()=>{const e=controlled(world,id);return JSON.stringify([e.id,e.x,e.y,e.z,e.yaw,e.pitch,e.roll]);};

  const position=new Vector3(),rotation=new Quaternion(),controlledUp=new Vector3();
  let ready=false,previousPredicted=false,controlledUpId='';
  return {
    onLocalInput(input,frame){
      now=frame.nowMs;
      // These fixtures define each edge explicitly; production Controls emits
      // events at input time instead of inferring them from sampled counters.
      for(const kind of ['jump','flip'] as const)if(input[kind]!==sourceEdges[kind]){sourceEdges[kind]=input[kind];session.queueEdge(kind,input[kind]);}
      session.tick(frame.dtMs/1000,input);
    },
    onLocalAction(action,time){now=time;session.action(action);},
    onServerInput(payload,time){
      now=time;
      const message=parseMessage(String(payload));
      if(!message)throw new Error(`Server rejected malformed benchmark message: ${String(payload)}`);
      if(message.type==='input'){
        if(message.roomEpoch!==roomEpoch){noteRejection(message.seq,message.targetTick,'epoch',time);sendToClient(JSON.stringify({type:'inputRejected',seq:message.seq,targetTick:message.targetTick,reason:'epoch'}),time);return;}
        const result=control.receive(message,ticks,time);sendEdges(result.outcomes,time);
        if(result.rejection){noteRejection(message.seq,message.targetTick,result.rejection,time);sendToClient(JSON.stringify({type:'inputRejected',seq:message.seq,targetTick:message.targetTick,reason:result.rejection}),time);}
      }
      else if(message.type==='reset'){
        if(!control.beginAction(message.actionSeq,message.edgeBaseline))throw new Error('Invalid benchmark action fence');
        const before=poseSignature();resetPlayer(world,id);invalidate(time,before!==poseSignature(),message.edgeBaseline);
      }
      else if(message.type==='sync')pendingSync=Math.max(pendingSync,message.token);
    },
    onServerRelocation(time){invalidate(time,true);},
    onServerTick(time){
      now=time;ticks++;
      const {input,outcomes}=control.advance(ticks,time);let relocated=false;
      step(world,new Map([[id,input]]),.05,{onSubsteps:count=>{lastSubsteps=count;},onRelocation:playerId=>{if(playerId===id)relocated=true;}});
      sendEdges(outcomes,time);if(relocated)invalidate(time,true);
    },
    shouldSnapshot(){return ticks%2===0;},
    makeSnapshot(){const payload=prepareSnapshots(world,ticks,roomEpoch,lastSubsteps)(id,control.snapshot(),poseRevision,pendingSync||undefined);pendingSync=0;return payload;},
    onClientMessage(payload,time){now=time;const data=String(payload),msg=JSON.parse(data);if(msg.type==='state'){
      const entity=msg.world.entities.find((item:Entity)=>item.driver===id);
      snapshotEvents.push({atMs:now,tick:msg.tick,receivedSeq:msg.control.receivedSeq,poseRevision:msg.poseRevision,pose:entity?{x:entity.x,y:entity.y,z:entity.z,yaw:entity.yaw}:null});
    }deliver(data);},
    render(frame){
      now=frame.nowMs;
      const prediction=(session as any).prediction,clock=(session as any).clock;
      const previous=prediction.presented as Entity|null,elapsed=previous?Math.min(.05,Math.max(0,(now-prediction.presentedAt)/1000)):0;
      const expected=previous?{x:previous.x+previous.vx*elapsed,y:previous.y+previous.vy*elapsed,z:previous.z+previous.vz*elapsed,roll:previous.roll}:null;
      const targetTick=clock.target(now),estimatedTick=clock.estimate(now);
      const rendered=session.renderWorld(),predicted=session.localPresentationActive,snap=session.takePresentationSnap(),entity=controlled(rendered,id);
      if((snap||previousPredicted!==predicted)&&presentationEvents.length<128)presentationEvents.push({atMs:now,predicted,snap});
      if(snap)snapDetails.push({atMs:now,distanceFromExpected:expected?Math.hypot(expected.x-entity.x,expected.y-entity.y,expected.z-entity.z):null,expectedRoll:expected?.roll??null,actualRoll:entity.roll,targetTick,estimatedTick});
      const target=new Vector3(entity.x,entity.y,entity.z);
      if(!ready){position.copy(target);ready=true;}
      const returning=snap||(previousPredicted&&!predicted),blend=returning||predicted?1:1-Math.exp(-14*frame.dtMs/1000);
      if(position.distanceTo(target)>35)position.copy(target);else position.lerp(target,blend);
      const surface=entity.supportId==='dome'&&entity.domeS!==null?domeSurface(entity.domeS):null;
      const normal=entity.supportId===null||entity.supportId==='stunt-loop'||entity.supportId==='island-cliff'||entity.supportId==='dome'?null:supportNormal(entity.supportId,entity.x,entity.z);
      const surfaceUp=new Vector3(surface?0:normal?.x??0,surface?.normalY??normal?.y??1,surface?.normalZ??normal?.z??0);
      if(controlledUpId!==entity.id||snap)controlledUp.copy(surfaceUp);
      else controlledUp.lerp(surfaceUp,1-Math.exp(-25*frame.dtMs/1000)).normalize();
      controlledUpId=entity.id;
      rotation.slerp(orientation(entity,controlledUp),blend);previousPredicted=predicted;
      const segment=prediction.segment;
      const timeline={snapshotTick:prediction.tick,targetTick,estimatedTick,alpha:clock.alpha(now),offset:{...prediction.offset},
        segmentTarget:segment?.target,previous:segment&&{x:segment.previous.x,z:segment.previous.z},next:segment&&{x:segment.next.x,z:segment.next.z}};
      return {x:position.x,y:position.y,z:position.z,q:[rotation.x,rotation.y,rotation.z,rotation.w],debug:{...debug(entity),timeline}};
    },
    serverWorld(){return world;},
    serverPose(){return toPose(controlled(world,id));},
    diagnostics(){return {ticks,rejected,rejectionCounts,rejectionEvents,commandEvents,snapshotEvents,presentationEvents,snapDetails,processedEdges,expiredEdges};},
    close(){
      session.disconnect();
      for(const [key,descriptor] of priorGlobals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    },
  };
}
