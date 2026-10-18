/** Latest-wins baseline adapter. Run with the pre-tick Session, e.g. commit 146d90a. */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { PROTOCOL_VERSION, resetPlayer, step, type Entity, type Input, type World } from '../shared/game';
import { domeSurface, supportNormal } from '../shared/map';
import { Session } from '../src/session';
import { snapshotFor } from '../worker/snapshot';
import type { AdapterContext, MotionAdapter, Pose } from './motion-benchmark';

function controlled(world:World,id:string):Entity {
  const entityId=world.players.find(player=>player.id===id)?.entityId;
  const entity=world.entities.find(item=>item.id===entityId);
  if(!entity)throw new Error(`Controlled entity ${id} is missing`);
  return entity;
}

// Mirrors the controlled-car orientation calculation in GameScene. Rendering,
// camera behavior, GPU work, and material/terrain visuals are not exercised.
function orientation(e:Entity):Quaternion {
  const surface=e.supportId==='dome'&&e.domeS!==null?domeSurface(e.domeS):null;
  const normal=e.supportId===null||e.supportId==='stunt-loop'||e.supportId==='island-cliff'||e.supportId==='dome'?null:supportNormal(e.supportId,e.x,e.z);
  const up=new Vector3(surface?0:normal?.x??0,surface?.normalY??normal?.y??1,surface?.normalZ??normal?.z??0);
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
  const {world,id,sendToServer}=context;
  let now=0,lastInputAt=-Infinity,lastInputSeq=0,appliedSeq=0,pendingSync=0,latest:Input|undefined;
  let previousApplied=0,repeats=0,skipped=0,ticks=0;
  const priorGlobals=new Map<string,PropertyDescriptor|undefined>();
  const setGlobal=(key:string,value:unknown)=>{priorGlobals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
  class Socket {
    static OPEN=1;
    readyState=1;
    onmessage:((event:{data:string})=>void)|null=null;
    onclose:((event:{code:number})=>void)|null=null;
    onerror:(()=>void)|null=null;
    constructor(_url:string){socket=this;}
    send(data:string){sendToServer(data,now);}
    close(){this.readyState=3;}
  }
  let socket:Socket;
  setGlobal('performance',{now:()=>now});
  setGlobal('location',{protocol:'http:',host:'benchmark.invalid'});
  setGlobal('window',{setTimeout:()=>0});
  setGlobal('WebSocket',Socket);
  const session=new Session();session.join('bench','Benchmark');
  const deliver=(data:string)=>socket.onmessage?.({data});
  deliver(JSON.stringify({type:'welcome',id,version:PROTOCOL_VERSION,capacity:1}));
  if(!session.id)throw new Error('Benchmark welcome protocol version differs from Session');
  deliver(JSON.stringify({type:'state',world:snapshotFor(world,id),inputAck:0}));

  const position=new Vector3(),rotation=new Quaternion();
  let ready=false,previousPredicted=false;
  return {
    onLocalInput(input,frame){now=frame.nowMs;session.tick(frame.dtMs/1000,input);},
    onLocalAction(action,time){now=time;session.action(action);},
    onServerInput(payload,time){
      now=time;
      const message=JSON.parse(String(payload));
      if(message.type==='input'&&message.seq>lastInputSeq){lastInputSeq=message.seq;lastInputAt=time;latest=message.input;}
      else if(message.type==='reset')resetPlayer(world,id);
      else if(message.type==='sync')pendingSync=Math.max(pendingSync,message.token);
    },
    onServerRelocation(){},
    onServerTick(time){
      now=time;ticks++;
      if(time-lastInputAt>300)latest=undefined;
      if(latest){appliedSeq=lastInputSeq;if(appliedSeq===previousApplied)repeats++;else if(previousApplied&&appliedSeq>previousApplied+1)skipped+=appliedSeq-previousApplied-1;previousApplied=appliedSeq;}
      step(world,latest?new Map([[id,latest]]):new Map(),.05);
    },
    shouldSnapshot(){return ticks%2===0;},
    makeSnapshot(){const payload=JSON.stringify({type:'state',world:snapshotFor(world,id),inputAck:appliedSeq,...(pendingSync?{sync:pendingSync}:{})});pendingSync=0;return payload;},
    onClientMessage(payload,time){now=time;deliver(String(payload));},
    render(frame){
      now=frame.nowMs;
      const rendered=session.renderWorld(),predicted=rendered!==session.world,snap=session.takePresentationSnap(),entity=controlled(rendered,id);
      const target=new Vector3(entity.x,entity.y,entity.z);
      if(!ready){position.copy(target);ready=true;}
      const returning=snap||(previousPredicted&&!predicted),blend=returning?1:1-Math.exp(-(predicted?30:14)*frame.dtMs/1000);
      if(position.distanceTo(target)>35)position.copy(target);else position.lerp(target,blend);
      rotation.slerp(orientation(entity),blend);previousPredicted=predicted;
      return {x:position.x,y:position.y,z:position.z,q:[rotation.x,rotation.y,rotation.z,rotation.w],debug:debug(entity)};
    },
    serverWorld(){return world;},
    serverPose(){return toPose(controlled(world,id));},
    diagnostics(){return {repeats,skipped,ticks};},
    close(){
      session.disconnect();
      for(const [key,descriptor] of priorGlobals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    },
  };
}
