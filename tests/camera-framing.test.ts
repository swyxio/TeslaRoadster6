import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { VEHICLES } from '../shared/vehicles';
import { createEmptyWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { chaseFraming, chaseResponse, updateChase } from '../src/camera';

test('chase view keeps every vehicle in frame and the road ahead visible',()=>{
  for(const [portrait,aspect] of [[false,1280/720],[false,844/390],[true,390/844]] as const){
    for(const [id,vehicle] of Object.entries(VEHICLES)){
      const {distance,height,lookAhead}=chaseFraming(portrait,vehicle,{distance:0,height:0,lookAhead:0});
      const camera=new T.PerspectiveCamera(55,aspect,.1,1800);
      camera.position.set(0,height,distance);camera.lookAt(0,1.3,-lookAhead);camera.updateMatrixWorld();
      for(const x of [-vehicle.width/2,vehicle.width/2])for(const y of [0,vehicle.height])for(const z of [-vehicle.length/2,vehicle.length/2]){
        const point=new T.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(point.x)<.95&&Math.abs(point.y)<.95&&point.z<1,`${id} should fit in ${portrait?'portrait':'landscape'} chase view`);
      }
      const roadAhead=new T.Vector3(0,0,-50).project(camera);
      assert.ok(Math.abs(roadAhead.y)<.8,`${id} should leave the road ahead visible`);
    }
  }
});

type Sample = ReturnType<typeof makeEntity>;
function recordedRun(grounded:boolean,turn:number,reverse=false):Sample[]{
  const world=createEmptyWorld(),car=makeEntity('camera-car','roadster',grounded?390:0,grounded?60:-1800,'pilot');
  Object.assign(car,{y:grounded?0:90,supportId:grounded?'ground':null,tankLevel:5,vx:0,vy:0,vz:-40,speed:40});
  world.entities=[car];const trace=[{...car}];
  for(let tick=0;tick<120;tick++){
    step(world,new Map([['pilot',{...NEUTRAL,throttle:grounded?1:0,hover:!grounded,steer:tick>=60?turn*(reverse&&tick>=90?-1:1):0}]]),.05);
    trace.push({...car});
  }
  return trace;
}

/** Exercise the same follow and aim update as the rendered camera against
 * 20 Hz shared-simulation poses, independently sampled at display frame rates. */
function traceCamera(trace:Sample[],aspect:number,hz:number,adaptive=true){
  const car=VEHICLES.roadster,portrait=aspect<.8;
  const framing={distance:0,height:0,lookAhead:0,focusRate:8},response={motion:0,distance:0,ready:false};
  const camera=new T.PerspectiveCamera(55,aspect,.1,1800),focus=new T.Vector3();
  let ready=false,maxBound=0,maxAngularRate=0,maxMotionRate=0,cuts=0;
  const velocities:T.Vector3[]=[],airborneFrames:boolean[]=[];
  for(let frame=0;frame<=(trace.length-1)*.05*hz;frame++){
    const seconds=frame/hz,tick=Math.min(trace.length-2,Math.floor(seconds/.05));
    const part=Math.min(1,(seconds-tick*.05)/.05),a=trace[tick],b=trace[tick+1];
    const pos=new T.Vector3(T.MathUtils.lerp(a.x,b.x,part),T.MathUtils.lerp(a.y,b.y,part),T.MathUtils.lerp(a.z,b.z,part));
    const yaw=T.MathUtils.lerp(a.yaw,b.yaw,part),pitch=T.MathUtils.lerp(a.pitch,b.pitch,part),roll=T.MathUtils.lerp(a.roll,b.roll,part);
    const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw)
      .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),pitch))
      .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),roll));
    const visualBack=new T.Vector3(0,0,1).applyQuaternion(rotation),visualYaw=Math.atan2(visualBack.x,visualBack.z);
    const back=new T.Vector3(Math.sin(visualYaw),0,Math.cos(visualYaw));
    chaseFraming(portrait,car,framing);
    framing.focusRate=8;
    // tick-prediction interpolates poses, but takes velocity from b. Its
    // support-transition path considers intermediate takeoff/landing airborne.
    const ground=(support:Sample['supportId'])=>support==='ground'||support==='island-oval';
    const supportTransition=a.supportId===null&&ground(b.supportId)||ground(a.supportId)&&b.supportId===null;
    const airborne=supportTransition?(part<=0?a.supportId===null:part>=1?b.supportId===null:true):b.supportId===null;
    airborneFrames.push(airborne);
    if(adaptive)chaseResponse(Math.hypot(b.vx,b.vz),airborne,1/hz,response,framing);
    const follow=pos.clone().addScaledVector(back,framing.distance).add(new T.Vector3(0,framing.height,0));
    const target=pos.clone().addScaledVector(back,-framing.lookAhead).add(new T.Vector3(0,1.3,0));
    const oldPosition=camera.position.clone(),oldRotation=camera.quaternion.clone();
    if(ready&&camera.position.distanceTo(follow)>100)cuts++;
    updateChase(camera.position,focus,follow,target,1/hz,ready,framing.focusRate);
    camera.lookAt(focus);camera.updateMatrixWorld();
    velocities.push(camera.position.clone().sub(oldPosition).multiplyScalar(hz));
    if(ready){maxAngularRate=Math.max(maxAngularRate,oldRotation.angleTo(camera.quaternion)*hz);maxMotionRate=Math.max(maxMotionRate,oldPosition.distanceTo(camera.position)*hz);}
    ready=true;
    for(const x of [-car.width/2,car.width/2])for(const y of [0,car.height])for(const z of [-car.length/2,car.length/2]){
      const point=new T.Vector3(x,y,z).applyQuaternion(rotation).add(pos).project(camera);
      maxBound=Math.max(maxBound,Math.abs(point.x),Math.abs(point.y));
      assert.ok(point.z<1,'vehicle remains in front of camera');
    }
  }
  return {maxBound,maxAngularRate,maxMotionRate,cuts,velocities,airborneFrames};
}

test('high-speed ground and airborne turns keep the whole car in the chase view without cuts',()=>{
  for(const grounded of [false,true])for(const turn of [-1,1])for(const reverse of [false,true]){
    const trace=recordedRun(grounded,turn,reverse);
    assert.ok(Math.abs(trace[90].yaw-trace[60].yaw)>.5,'scenario actually turns');
    if(reverse)assert.equal(Math.sign(trace[120].yaw-trace[90].yaw),-turn,'scenario reverses its steering');
    assert.ok(trace.every(sample=>grounded?sample.supportId!==null:sample.supportId===null),'scenario stays on its intended surface');
    for(const aspect of [1280/720,390/844])for(const hz of [30,60,120]){
      const {maxBound,maxAngularRate,cuts}=traceCamera(trace,aspect,hz);
      assert.ok(maxBound<1,`${grounded?'ground':'flight'} turn ${turn}, ${aspect}, ${hz}Hz: vehicle bounds ${maxBound}`);
      assert.ok(maxAngularRate<4,`unexpected camera rotation jump: ${maxAngularRate} rad/s`);
      assert.equal(cuts,0,'a continuous maneuver must not reset the camera');
    }
  }
});

test('takeoff and landing change chase framing without cutting or jumping',()=>{
  const world=createEmptyWorld(),car=makeEntity('camera-car','roadster',390,60,'pilot');car.tankLevel=5;world.entities=[car];const trace=[{...car}];
  for(let tick=0;tick<150;tick++){
    step(world,new Map([['pilot',{...NEUTRAL,throttle:tick<120?1:0,jump:tick>=20?1:0,hover:tick>=20&&tick<90}]]),.05);
    trace.push({...car});
  }
  assert.ok(trace.some(sample=>sample.supportId===null),'scenario takes off');
  assert.ok(trace.slice(100).some(sample=>sample.supportId==='ground'),'scenario lands');
  for(const aspect of [1280/720,390/844]){
    const {maxBound,maxAngularRate,maxMotionRate,cuts}=traceCamera(trace,aspect,60);
    assert.ok(maxBound<1,`vehicle bounds ${maxBound}`);
    assert.ok(maxAngularRate<4,`unexpected camera rotation jump: ${maxAngularRate} rad/s`);
    assert.ok(maxMotionRate<100,`unexpected camera position jump: ${maxMotionRate} m/s`);
    assert.equal(cuts,0);
  }
});

test('fast takeoff and landing do not introduce a packet-shaped camera kick',()=>{
  const world=createEmptyWorld(),car=makeEntity('camera-car','roadster',390,60,'pilot');
  Object.assign(car,{tankLevel:5,vx:0,vz:-30,speed:30});world.entities=[car];const trace=[{...car}];
  for(let tick=0;tick<150;tick++){
    step(world,new Map([['pilot',{...NEUTRAL,throttle:1,jump:tick>=40?1:0,hover:tick>=40&&tick<85}]]),.05);
    trace.push({...car});
  }
  for(const aspect of [1280/720,390/844])for(const hz of [30,60,120]){
    const revised=traceCamera(trace,aspect,hz),base=traceCamera(trace,aspect,hz,false);
    const transitions=revised.airborneFrames.flatMap((airborne,i)=>i>1&&airborne!==revised.airborneFrames[i-1]?[i]:[]);
    assert.equal(transitions.length,2,'scenario takes off and lands once');
    for(const frame of transitions){
      const kick=revised.velocities[frame].clone().sub(revised.velocities[frame-1]);
      const baseline=base.velocities[frame].clone().sub(base.velocities[frame-1]);
      assert.ok(kick.clone().sub(baseline).length()*hz<25,'support transition must not create a sudden camera-velocity jump');
    }
  }
});

test('framing changes gradually as 20 Hz speed and support updates cross thresholds',()=>{
  for(const hz of [30,60,120]){
    const state={motion:0,distance:0,ready:false},framing={distance:0,height:0,lookAhead:0,focusRate:8};
    let priorDistance=0,priorAim=5;
    for(let frame=0;frame<2*hz;frame++){
      // Alternating velocity snapshots stress both the 8 and 28 m/s thresholds.
      const tick=Math.floor(frame/hz*20),speed=[0,7,9,27,29,45][tick%6],airborne=tick>=20;
      chaseFraming(false,VEHICLES.roadster,framing);
      chaseResponse(speed,airborne,1/hz,state,framing);
      const extra=framing.distance-10;
      if(frame>0){
        assert.ok(Math.abs(extra-priorDistance)<=8*(1-Math.exp(-1/hz))+1e-8,'distance response stays bounded');
        assert.ok(Math.abs(framing.lookAhead-priorAim)<=5*(1-Math.exp(-8/hz))+1e-8,'aim response stays bounded');
      }
      priorDistance=extra;priorAim=framing.lookAhead;
    }
  }
});

test('a fast car remains framed when it turns during takeoff',()=>{
  for(const turn of [-1,1]){
    const world=createEmptyWorld(),car=makeEntity('camera-car','roadster',390,60,'pilot');
    Object.assign(car,{tankLevel:5,vx:0,vz:-30,speed:30});world.entities=[car];const trace=[{...car}];
    for(let tick=0;tick<120;tick++){
      step(world,new Map([['pilot',{...NEUTRAL,throttle:1,jump:tick>=40?1:0,hover:tick>=40,steer:tick>=40?turn:0}]]),.05);
      trace.push({...car});
    }
    assert.ok(trace.slice(41).some(sample=>sample.supportId===null),'scenario takes off');
    for(const aspect of [1280/720,390/844])for(const hz of [30,60,120]){
      const {maxBound,maxAngularRate,cuts}=traceCamera(trace,aspect,hz);
      assert.ok(maxBound<1,`takeoff turn ${turn}, ${aspect}, ${hz}Hz: vehicle bounds ${maxBound}`);
      assert.ok(maxAngularRate<4,`unexpected camera rotation jump: ${maxAngularRate} rad/s`);
      assert.equal(cuts,0);
    }
  }
});
