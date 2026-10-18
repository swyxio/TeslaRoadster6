import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOME } from '../shared/dome';
import { CUSTOMERS } from '../shared/delivery';
import { addPlayer, createWorld, step, travelDome } from '../shared/game';

test('a verified Dome win is announced once before match awards and same-tick delivery resolution',()=>{
  const world=createWorld();
  const scorer=addPlayer(world,'scorer','Scorer');
  const gone=addPlayer(world,'gone','Gone');
  const spectator=addPlayer(world,'spectator','Spectator');
  const courier=addPlayer(world,'courier','Courier');
  for(const player of [scorer,gone,spectator])assert.equal(travelDome(world,player.id),true);
  assert.equal(travelDome(world,gone.id),true,'a former participant has left the Dome');
  const car=(id:string)=>world.entities.find(entity=>entity.id===world.players.find(player=>player.id===id)!.entityId)!;
  const courierCar=car(courier.id),target=CUSTOMERS[0];
  Object.assign(courierCar,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
  courier.delivery.order={...courier.delivery.order,stage:'dropoff',customer:0,elapsed:100,estimate:100,base:1_000};
  world.entities=world.entities.filter(entity=>[scorer,gone,spectator,courier].some(player=>player.entityId===entity.id));
  world.pickups=[];
  world.soccer.participants=[
    {playerId:scorer.id,touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:4,retrofit:0,stock:0}},
    {playerId:gone.id,touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:4,retrofit:0,stock:0}},
  ];
  world.soccer.lastTouch={playerId:scorer.id,carClass:'roadster'};
  world.soccer.blueScore=4;
  Object.assign(world.soccer.ball,{x:DOME.x+DOME.halfLength-2,y:3,z:DOME.z,vx:90,vy:0,vz:0});

  const events:string[]=[];
  let calls=0;
  const hooks={
    update:(player:typeof scorer,apply:()=>void)=>{
      const alreadyAwarded=player.achievements.unlocked.includes('rocket-rookie');
      apply();
      if(player.id===scorer.id&&!alreadyAwarded&&player.achievements.unlocked.includes('rocket-rookie'))events.push('awards');
    },
    pickup:()=>{},
    onDomeWin:({participants,winners}:{participants:readonly typeof world.soccer.participants[number][];winners:readonly string[]})=>{
      calls++;
      events.push('win');
      assert.equal(world.soccer.phase,'win');
      assert.ok(!scorer.achievements.unlocked.includes('rocket-rookie'));
      assert.ok(!scorer.achievements.unlocked.includes('roadster-champion'));
      assert.deepEqual(participants.map(participant=>participant.playerId),['scorer']);
      assert.deepEqual(winners,['scorer']);
      // A room callback cannot modify the match's authoritative state.
      participants[0].touches.roadster=false;
      participants[0].goals.roadster=-1;
      (winners as string[])[0]='tampered';
    },
    resolveDeliveryPayout:(_player:typeof courier,component:{amount:number})=>{
      events.push('resolve');
      return component.amount*2;
    },
  };
  step(world,new Map(),.05,{economy:hooks});
  assert.deepEqual(events,['win','awards','resolve']);
  assert.ok(scorer.achievements.unlocked.includes('rocket-rookie'));
  assert.ok(scorer.achievements.unlocked.includes('roadster-champion'));
  assert.equal(courier.delivery.completed,1);
  assert.equal(courier.delivery.lastPayout,2_000);
  assert.equal(world.soccer.participants[0].touches.roadster,true);
  assert.equal(world.soccer.participants[0].goals.roadster,5);
  assert.deepEqual(world.soccer.winningPlayers,['scorer']);
  step(world,new Map(),.05,{economy:hooks});
  assert.equal(calls,1,'the win display does not announce a second match');
});

test('a server-verified match without a credited scorer reports no winners',()=>{
  const world=createWorld();
  world.entities=[];world.pickups=[];
  world.soccer.blueScore=4;
  Object.assign(world.soccer.ball,{x:DOME.x+DOME.halfLength-2,y:3,z:DOME.z,vx:90,vy:0,vz:0});
  const results:{participants:readonly unknown[];winners:readonly string[]}[]=[];
  step(world,new Map(),.05,{economy:{update:(_player,apply)=>apply(),pickup:()=>{},onDomeWin:result=>results.push(result)}});
  assert.equal(results.length,1);
  assert.deepEqual(results[0],{participants:[],winners:[]});
});
