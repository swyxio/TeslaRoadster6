// LOCAL TEST ONLY: deterministic physical observations; all wallet work uses
// the production GameRoom, EconomySession, RoomEconomy and DriverProfile.
import fixture, { GameRoom as FixtureGameRoom, DriverProfile, GlobalChat, RoomEconomy as FixtureRoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import { MarketService } from '../../worker/market-service';
import { BUILDINGS } from '../../shared/map';
import { makeEntity, NEUTRAL, type World } from '../../shared/game';
import { resetAchievementFlight, type AchievementState } from '../../shared/achievements';
import type { AchievementTierProgress } from '../../shared/achievement-tiers';
import { RACE_COURSES } from '../../shared/race-courses';
import type { ScheduledInput } from '../../shared/tick-input';
import type { VehicleCollections } from '../../shared/vehicle-collections';

export { DriverProfile, GlobalChat, GlobalIncome, GlobalEarningsEvent, MarketService };
export class RoomEconomy extends FixtureRoomEconomy {
  // Record only after the actual production method accepts the evidence; this
  // avoids depending on the production journal's internal key names.
  async stageAchievement(stage:unknown){
    const method=Reflect.get(FixtureRoomEconomy.prototype,'stageAchievement');
    if(typeof method!=='function')throw new Error('Achievement staging is not implemented');
    const result=await Reflect.apply(method,this,[stage]);
    if(result==='accepted'){
      const item=stage as {driverId:string;eventId:string};
      await this.ctx.storage.put(`fixture-achievement-accepted:${item.driverId}:${item.eventId}`,stage);
    }
    return result;
  }
  async fixtureAccepted(driverId:string){
    const entries=await this.ctx.storage.list({prefix:`fixture-achievement-accepted:${driverId}:`});
    return [...entries.values()];
  }
}
export class GameRoom extends FixtureGameRoom {
  private fixtureDriver(playerId:string){
    const world=Reflect.get(this,'world') as World;
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:object;control:ScheduledInput}>;
    const session=[...sessions.values()].find(candidate=>candidate.id===playerId);
    const player=world.players.find(candidate=>candidate.id===playerId);
    const car=world.entities.find(candidate=>candidate.id===player?.entityId);
    if(!session||!player||!car)throw new Error('Fixture driver is absent');
    return {world,session,player,car};
  }
  async fixtureTransientRoof(playerId:string){
    const {session,player,car}=this.fixtureDriver(playerId);
    const index=BUILDINGS.findIndex(building=>building.style==='midrise'&&building.district==='sf'),roof=BUILDINGS[index];
    if(!roof)throw new Error('Fixture rooftop is absent');
    const previous=structuredClone(car);
    const draft=()=>Reflect.get(session.economy,'draft') as {achievements:AchievementState;achievementTiers:AchievementTierProgress};
    const reset=()=>{resetAchievementFlight(player);resetAchievementFlight({...player,achievements:draft().achievements});};
    const before=draft().achievementTiers['roof-landings'].count;
    const tick=()=>Reflect.apply(Reflect.get(this,'tick') as ()=>void,this,[]);
    Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,
      supportId:`roof:${index}`,inDome:false,autopilot:false,navigation:null,air:100});
    reset();
    let airborne=false,landed=false;
    try{
      // Seed the supported state, then submit the same scheduled jump intent as a client.
      tick();
      const control=session.control.snapshot(),currentTick=Reflect.get(this,'tickCount') as number;
      const jump=(control.jump.seen+1)%(2**31);
      const result=session.control.receive({seq:control.receivedSeq+1,targetTick:currentTick+1,
        controlRevision:control.revision,actionSeq:control.actionSeq,input:{...NEUTRAL,jump,flip:control.flip.seen}},currentTick,Date.now());
      if(result.rejection)throw new Error(`Fixture jump rejected: ${result.rejection}`);
      for(let i=0;i<120;i++){
        tick();
        if(car.supportId===null)airborne=true;
        if(airborne&&car.supportId===`roof:${index}`){landed=true;break;}
      }
      return {observed:airborne&&landed&&draft().achievementTiers['roof-landings'].count===before+1&&
        draft().achievements.unlocked.includes('roof-rider')};
    }finally{
      // Keep the scheduler's consumed jump baseline when restoring the car.
      Object.assign(car,previous,{lastJump:session.control.snapshot().jump.processed});
      reset();
    }
  }
  async fixtureTransientRace(playerId:string){
    const {world,session,car}=this.fixtureDriver(playerId);
    const course=RACE_COURSES.find(item=>item.id==='short')!,gate=course.gates.at(-1)!;
    const previous=structuredClone(car),draft=()=>Reflect.get(session.economy,'draft') as {achievements:AchievementState;achievementTiers:AchievementTierProgress};
    const finishedBefore=draft().achievementTiers['races-finished'].count,wonBefore=draft().achievementTiers['races-won'].count;
    Object.assign(car,{x:gate.x-.5,y:0,z:gate.z,yaw:gate.yaw,vx:0,vy:0,vz:0,speed:30,pushX:0,pushZ:0,
      supportId:'ground',inDome:false,autopilot:false,navigation:null});
    const round:World['races']['rounds'][number]={courseId:course.id,phase:'active',hostId:playerId,starterCount:2,openedAt:world.time-4,
      startedAt:world.time-1,endsAt:world.time+30,entrants:[{playerId,entityId:car.id,status:'entered',nextGate:course.gates.length-1,
        finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:car.x,y:car.y,z:car.z,time:world.time}},
      // The other starter has already withdrawn, as after a real disconnect.
      {playerId:`fixture-opponent:${playerId}`,entityId:'fixture-opponent-car',status:'dnf',nextGate:0,
        finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:0,y:0,z:0,time:world.time}}]};
    world.races.rounds.push(round);
    try{Reflect.apply(Reflect.get(this,'tick') as ()=>void,this,[]);}
    finally{world.races.rounds=world.races.rounds.filter(item=>item!==round);Object.assign(car,previous);}
    return {observed:round.entrants[0].status==='finished'&&round.entrants[0].rank===1&&
      draft().achievementTiers['races-finished'].count===finishedBefore+1&&draft().achievementTiers['races-won'].count===wonBefore+1&&
      draft().achievements.unlocked.includes('race-winner')};
  }
  async fixtureDriveCollection(playerId:string){
    const {world,session,player,car}=this.fixtureDriver(playerId);
    const oldCar=structuredClone(car),oldEntities=world.entities,oldPickups=world.pickups;
    const draft=()=>Reflect.get(session.economy,'draft') as {vehicleCollections:VehicleCollections};
    const reset=()=>Reflect.apply(Reflect.get(session.economy,'resetVehicleDrive') as ()=>void,session.economy,[]);
    const tick=()=>Reflect.apply(Reflect.get(this,'tick') as ()=>void,this,[]);
    world.entities=[car];world.pickups=[];
    Object.assign(car,{x:0,z:100,y:0,yaw:0,speed:20,vx:0,vy:0,vz:0,pushX:0,pushZ:0,
      supportId:'ground',inDome:false,autopilot:false,navigation:null});
    reset();
    try{
      for(let i=0;i<160&&!draft().vehicleCollections.driven.includes('roadster');i++){
        const control=session.control.snapshot(),currentTick=Reflect.get(this,'tickCount') as number;
        const result=session.control.receive({seq:control.receivedSeq+1,targetTick:currentTick+1,
          controlRevision:control.revision,actionSeq:control.actionSeq,input:{...NEUTRAL,throttle:1,jump:control.jump.seen,flip:control.flip.seen}},currentTick,Date.now());
        if(result.rejection)throw new Error(`Fixture drive rejected: ${result.rejection}`);
        tick();
      }
      return {observed:draft().vehicleCollections.driven.includes('roadster'),distance:Math.hypot(car.x,car.z-100)};
    }finally{
      world.entities=oldEntities;world.pickups=oldPickups;Object.assign(car,oldCar);
      reset();resetAchievementFlight(player);
    }
  }
  async fixturePlaceNpc(playerId:string){
    const {world,car:person}=this.fixtureDriver(playerId);
    if(person.kind!=='person'||!person.supportId)throw new Error('Fixture requires an on-foot player');
    const npc=makeEntity('fixture-ambient','waymo-ipace',person.x+3,person.z);
    Object.assign(npc,{y:person.y,supportId:person.supportId,inDome:person.inDome,npc:true,autopilot:true});
    world.entities=[person,npc];
    return {id:npc.id,kind:npc.kind};
  }
}

type FixtureEnv={ROOMS:DurableObjectNamespace<GameRoom>;ECONOMIES:DurableObjectNamespace<RoomEconomy>};
export default {
  async fetch(request:Request,env:FixtureEnv,ctx:ExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/__achievement-test/'))return fixture.fetch(request,env as never,ctx);
    if(request.method!=='POST')return new Response('POST required',{status:405});
    const body=await request.json() as {room:string;playerId:string;driverId:string};
    if(path==='/__achievement-test/accepted')return Response.json(await env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room)).fixtureAccepted(body.driverId));
    const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
    if(path==='/__achievement-test/roof')return Response.json(await room.fixtureTransientRoof(body.playerId));
    if(path==='/__achievement-test/race')return Response.json(await room.fixtureTransientRace(body.playerId));
    if(path==='/__achievement-test/drive')return Response.json(await room.fixtureDriveCollection(body.playerId));
    if(path==='/__achievement-test/npc')return Response.json(await room.fixturePlaceNpc(body.playerId));
    return new Response('Unknown fixture route',{status:404});
  },
};
