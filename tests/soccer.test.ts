import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DOME } from '../shared/dome';
import { makeEntity } from '../shared/game';
import { domeSurface } from '../shared/map';
import { dimensions } from '../shared/physics';
import { initialSoccer, stepSoccer } from '../shared/soccer';
import { createRocketDome } from '../src/rocket-dome';

const advance=(state:ReturnType<typeof initialSoccer>,time:number)=>stepSoccer(state,[],.05,time);

test('goal frame colors match the score awarded at each end',()=>{
  const {group}=createRocketDome(),matrix=new THREE.Matrix4();
  for(const [side,name,color] of [[1,'dome-goal-blue',0x41d4f3],[-1,'dome-goal-orange',0xffa44f]] as const){
    const frame=group.getObjectByName(name) as THREE.InstancedMesh;
    assert.ok(frame);frame.getMatrixAt(0,matrix);
    assert.equal(Math.sign(matrix.elements[12]),side);
    assert.equal((frame.material as THREE.MeshBasicMaterial).color.getHex(),color);
  }
});

test('kickoff starts at the center with an empty scoreboard',()=>{
  const state=initialSoccer();
  assert.deepEqual(state.ball,{x:DOME.x,y:DOME.ballRadius,z:DOME.z,vx:0,vy:0,vz:0});
  assert.equal(state.phase,'play');assert.equal(state.blueScore,0);assert.equal(state.orangeScore,0);
  assert.equal(state.winner,null);assert.equal(state.lastScorer,null);
});

test('fast shots cross either goal once and return to kickoff after the display',()=>{
  for(const direction of [1,-1]){
    const state=initialSoccer(),end=DOME.x+direction*DOME.halfLength;
    Object.assign(state.ball,{x:end-direction*3,y:3,vx:direction*900});
    advance(state,10);
    assert.equal(state.phase,'goal');assert.equal(state.lastScorer,direction===1?'blue':'orange');
    assert.equal(state.blueScore,direction===1?1:0);assert.equal(state.orangeScore,direction===-1?1:0);
    assert.equal(state.phaseUntil,13);assert.equal(state.ball.x,end);
    for(let time=10.05;time<13;time+=.05)advance(state,time);
    assert.equal(state.blueScore+state.orangeScore,1,'a stopped goal cannot score repeatedly');
    advance(state,13);assert.equal(state.phase,'play');assert.equal(state.lastScorer,null);
    assert.equal(state.ball.x,DOME.x);assert.equal(state.ball.z,DOME.z);assert.equal(state.ball.y,DOME.ballRadius);
  }
});

test('a ball too wide or high for the goal bounces from the end wall',()=>{
  for(const miss of ['post','crossbar'] as const){
    const state=initialSoccer();
    Object.assign(state.ball,{x:DOME.x+DOME.halfLength-DOME.ballRadius-1,
      y:miss==='crossbar'?DOME.goalHeight-DOME.ballRadius+.5:3,
      z:DOME.z+(miss==='post'?DOME.goalHalfWidth-DOME.ballRadius+.5:0),vx:120});
    advance(state,.05);
    assert.equal(state.phase,'play',miss);assert.equal(state.blueScore,0);
    assert.ok(state.ball.x<=DOME.x+DOME.halfLength-DOME.ballRadius+1e-6,miss);
    assert.ok(state.ball.vx<0,miss);
  }
});

test('a ball crossing a goal plane back into the field does not score',()=>{
  for(const direction of [1,-1]){
    const state=initialSoccer();
    Object.assign(state.ball,{x:DOME.x+direction*(DOME.halfLength+1),y:3,vx:-direction*120});
    advance(state,.05);
    assert.equal(state.phase,'play');assert.equal(state.blueScore,0);assert.equal(state.orangeScore,0);
  }
});

test('a fifth goal declares the winner, then resets both scores and the ball',()=>{
  for(const direction of [1,-1]){
    const state=initialSoccer();state.blueScore=direction===1?4:2;state.orangeScore=direction===-1?4:2;
    Object.assign(state.ball,{x:DOME.x+direction*(DOME.halfLength-2),y:3,vx:direction*90});
    advance(state,50);assert.equal(state.phase,'win');assert.equal(state.winner,direction===1?'blue':'orange');
    assert.equal(state.phaseUntil,56);advance(state,55.9);assert.equal(state.phase,'win');
    advance(state,56);assert.equal(state.phase,'play');assert.equal(state.blueScore,0);assert.equal(state.orangeScore,0);
    assert.equal(state.winner,null);assert.equal(state.ball.x,DOME.x);
  }
});

test('the floor, ceiling and curved sidewalls contain the ball',()=>{
  const ceiling=initialSoccer();Object.assign(ceiling.ball,{y:2*DOME.radius-DOME.ballRadius-1,vy:100});
  advance(ceiling,.05);assert.ok(ceiling.ball.y<=2*DOME.radius-DOME.ballRadius);assert.ok(ceiling.ball.vy<0);
  const side=initialSoccer();Object.assign(side.ball,{y:DOME.radius,z:DOME.z+DOME.flatHalfWidth+DOME.radius-DOME.ballRadius-1,vz:100});
  advance(side,.05);
  const out=Math.max(0,Math.abs(side.ball.z-DOME.z)-DOME.flatHalfWidth);
  assert.ok(Math.hypot(out,side.ball.y-DOME.radius)<=DOME.radius-DOME.ballRadius+1e-6);
  assert.ok(side.ball.vz<0);
  const floor=initialSoccer();Object.assign(floor.ball,{y:DOME.ballRadius+1,vy:-100});
  advance(floor,.05);assert.ok(floor.ball.y>=DOME.ballRadius);assert.ok(floor.ball.vy>=0);
});

test('a fast car sweeps through and strikes the ball, including in midair',()=>{
  for(const y of [0,10]){
    const state=initialSoccer();state.ball.y=y+DOME.ballRadius;
    const car=makeEntity('striker','roadster',DOME.x+5,DOME.z);
    Object.assign(car,{y,vx:400,vy:0,vz:0,yaw:-Math.PI/2,inDome:true});
    stepSoccer(state,[car],.05,.05);
    assert.ok(state.ball.vx>20,`car at height ${y} hit the ball`);
    assert.ok(state.ball.x>DOME.x);
    assert.ok(Math.hypot(state.ball.vx,state.ball.vy,state.ball.vz)<=120+1e-6);
  }
});

test('a car on the dome wall or ceiling strikes on its inward-facing body',()=>{
  for(const arc of [2*DOME.flatHalfWidth+Math.PI*DOME.radius/2,3*DOME.flatHalfWidth+Math.PI*DOME.radius]){
    const surface=domeSurface(arc),state=initialSoccer();
    const car=makeEntity('surface-striker','roadster',DOME.x+5,surface.z);
    const gap=dimensions('roadster').height+DOME.ballRadius-.25;
    Object.assign(car,{y:surface.y,vx:400,vy:0,vz:0,yaw:-Math.PI/2,inDome:true,supportId:'dome',domeS:arc});
    Object.assign(state.ball,{y:surface.y+surface.normalY*gap,z:surface.z+surface.normalZ*gap});
    stepSoccer(state,[car],.05,.05);
    assert.ok(state.ball.vx>20,`surface contact at arc ${arc}`);
    assert.ok(state.ball.x>DOME.x);
  }
});

test('simultaneous car contacts remain bounded and deterministic',()=>{
  const left=makeEntity('left','roadster',DOME.x+5,DOME.z);
  const right=makeEntity('right','roadster',DOME.x-5,DOME.z);
  Object.assign(left,{vx:400,yaw:-Math.PI/2,inDome:true});Object.assign(right,{vx:-400,yaw:Math.PI/2,inDome:true});
  const first=initialSoccer(),second=initialSoccer();
  stepSoccer(first,[left,right],.05,.05);stepSoccer(second,[left,right],.05,.05);
  assert.deepEqual(first,second);
  assert.ok(Object.values(first.ball).every(Number.isFinite));
  assert.ok(Math.hypot(first.ball.vx,first.ball.vy,first.ball.vz)<=120+1e-6);
  assert.equal(first.phase,'play');
});

test('cars outside the arena cannot strike its separate ball',()=>{
  const state=initialSoccer(),car=makeEntity('outside','roadster',DOME.x+5,DOME.z);
  Object.assign(car,{vx:400,yaw:-Math.PI/2,inDome:false});
  stepSoccer(state,[car],.05,.05);
  assert.equal(state.ball.vx,0);assert.equal(state.ball.x,DOME.x);
});
