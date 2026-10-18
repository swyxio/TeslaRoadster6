// LOCAL TEST ONLY: deterministic one-tick observations; all wallet work uses
// the production GameRoom, EconomySession, RoomEconomy and DriverProfile.
import fixture, { GameRoom as FixtureGameRoom, DriverProfile, GlobalChat, RoomEconomy as FixtureRoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import { MarketService } from '../../worker/market-service';
import { BUILDINGS } from '../../shared/map';
import type { World } from '../../shared/game';

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
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:object}>;
    const session=[...sessions.values()].find(candidate=>candidate.id===playerId);
    const player=world.players.find(candidate=>candidate.id===playerId);
    const car=world.entities.find(candidate=>candidate.id===player?.entityId);
    if(!session||!player||!car)throw new Error('Fixture driver is absent');
    return {world,session,player,car};
  }
  async fixtureTransientRoof(playerId:string){
    const {session,car}=this.fixtureDriver(playerId),roof=BUILDINGS[0];
    const previous=structuredClone(car);
    Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,supportId:'roof:0',autopilot:false,navigation:null});
    try{Reflect.apply(Reflect.get(this,'tick') as ()=>void,this,[]);}
    finally{Object.assign(car,previous);}
    const draft=Reflect.get(session.economy,'draft') as {achievements:{unlocked:string[]}};
    return {observed:draft.achievements.unlocked.includes('roof-rider')};
  }
  async fixtureTransientRace(playerId:string){
    const {world,session,car}=this.fixtureDriver(playerId);
    const round={courseId:'short',phase:'results' as const,hostId:playerId,starterCount:2,openedAt:world.time,
      startedAt:world.time,endsAt:world.time+30,entrants:[{playerId,entityId:car.id,status:'finished' as const,nextGate:5,
        finishedAt:world.time,elapsed:1,rank:1,feedback:null,feedbackUntil:0,previous:{x:car.x,y:car.y,z:car.z,time:world.time}}]};
    world.races.rounds.push(round);
    try{Reflect.apply(Reflect.get(this,'tick') as ()=>void,this,[]);}
    finally{world.races.rounds=world.races.rounds.filter(item=>item!==round);}
    const draft=Reflect.get(session.economy,'draft') as {achievements:{unlocked:string[]}};
    return {observed:draft.achievements.unlocked.includes('race-winner')};
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
    return new Response('Unknown fixture route',{status:404});
  },
};
