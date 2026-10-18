(() => {
  // Local-only recording, installed before game scripts. No raw messages,
  // wallet fields, chat text, identities or recovery codes are retained.
  const trace = {
    format: 1, timeOrigin: performance.timeOrigin, frames: [], states: [],
    sent: [], controls: [], events: [], marks: [], turnarounds: [],
    dropped: {frames: 0, states: 0, sent: 0, controls: 0, events: 0, marks: 0, turnarounds: 0}, errors: 0,
  };
  const limits = {frames: 12000, states: 4000, sent: 4000, controls: 4000, events: 4000, marks: 200, turnarounds: 4000};
  const add = (key,value) => {if(trace[key].length<limits[key])trace[key].push(value);else trace.dropped[key]++;};
  const safe = fn => (...args) => {try {fn(...args);} catch {trace.errors++;}};
  const now = () => performance.now();
  let lastControl = '';
  window.__teslandTrace = trace;
  window.__teslandTraceMark = safe(label => add('marks',{atMs:now(),label}));
  window.__teslandTraceInput = safe(input => {
    const value = {throttle:input.throttle,steer:input.steer,brake:input.brake,boost:input.boost,
      hover:input.hover,jump:input.jump,flip:input.flip,roll:input.roll,cockpit:input.cockpit};
    const serialized=JSON.stringify(value);
    if(serialized!==lastControl) {lastControl=serialized;add('controls',{atMs:now(),...value});}
  });
  window.__teslandTraceSent = safe(command => {
    const i=command.input;
    add('sent',{atMs:now(),seq:command.seq,targetTick:command.targetTick,controlRevision:command.controlRevision,
      actionSeq:command.actionSeq,input:{throttle:i.throttle,steer:i.steer,brake:i.brake,boost:i.boost,
        hover:i.hover,jump:i.jump,flip:i.flip,roll:i.roll,cockpit:i.cockpit}});
  });
  window.__teslandTraceTurnaround = safe((seq,sentAtMs,receivedAtMs) =>
    add('turnarounds',{seq,sentAtMs,receivedAtMs,elapsedMs:receivedAtMs-sentAtMs}));
  window.__teslandTraceMessage = safe((message,id) => {
    if(message.type==='inputRejected') {
      add('events',{atMs:now(),type:'inputRejected',seq:message.seq,targetTick:message.targetTick,reason:message.reason});
      return;
    }
    if(message.type!=='state'||!id||!message.world?.players||!message.world?.entities)return;
    const player=message.world.players.find(item=>item.id===id);
    const e=message.world.entities.find(item=>item.id===player?.entityId);
    if(!e)return;
    add('states',{
      atMs:now(),tick:message.tick,poseRevision:message.poseRevision,substeps:message.substeps,
      worldTime:message.world.time,receivedSeq:message.control?.receivedSeq,appliedSeq:message.control?.appliedSeq,
      controlRevision:message.control?.revision,otherEntities:message.world.entities.length-1,
      car:{x:e.x,y:e.y,z:e.z,yaw:e.yaw,pitch:e.pitch,roll:e.roll,speed:e.speed,
        vx:e.vx,vy:e.vy,vz:e.vz,supportId:e.supportId,health:e.health,pushX:e.pushX,pushZ:e.pushZ,kind:e.kind},
    });
  });
  window.__teslandTraceFrame = safe((world,e,mesh,camera,flags) => add('frames',{
    atMs:now(),worldTime:world.time,
    visual:{x:mesh.position.x,y:mesh.position.y,z:mesh.position.z,
      q:[mesh.quaternion.x,mesh.quaternion.y,mesh.quaternion.z,mesh.quaternion.w]},
    body:{x:e.x,y:e.y,z:e.z,yaw:e.yaw,speed:e.speed,vx:e.vx,vy:e.vy,vz:e.vz,supportId:e.supportId,health:e.health},
    camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,
      q:[camera.quaternion.x,camera.quaternion.y,camera.quaternion.z,camera.quaternion.w]},
    ...flags,
  }));
  for(const type of ['keydown','keyup']) window.addEventListener(type,safe(event=>{
    if(['KeyW','KeyA','KeyD','Space','KeyE','KeyX'].includes(event.code))
      add('events',{atMs:now(),eventTimeMs:event.timeStamp,type,code:event.code,repeat:event.repeat,trusted:event.isTrusted});
  }),true);
  for(const type of ['pointerdown','pointerup','pointercancel']) window.addEventListener(type,safe(event=>{
    const control=event.target?.closest?.('[data-control]')?.getAttribute('data-control');
    if(control)add('events',{atMs:now(),eventTimeMs:event.timeStamp,type,control,pointerType:event.pointerType,trusted:event.isTrusted});
  }),true);
})();
