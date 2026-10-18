// LOCAL TEST ONLY: supply reservation and lost-reply fault injection.
import base, { GameRoom as BaseRoom, RoomEconomy as BaseEconomy, DriverProfile as BaseProfile,
  GlobalIncome as BaseIncome, GlobalEarningsEvent as BaseGlobal } from './delivery-journal-worker';
import type { PickupStage } from '../../worker/room-economy';
import type { EconomyIntent } from '../../worker/driver-profile';
import type { EarningsEvents } from '../../shared/earnings-events';

export class GameRoom extends BaseRoom {}
export class GlobalIncome extends BaseIncome {}
export class GlobalEarningsEvent extends BaseGlobal {}
export class RoomEconomy extends BaseEconomy {
  private holdSupply=false;
  private supplyHeld=false;
  fixtureHoldSupply(){this.holdSupply=true;}
  fixtureSupplyHeld(){return this.supplyHeld;}
  override async stageSupply(stage:PickupStage){
    const result=await super.stageSupply(stage);
    if(this.holdSupply){this.holdSupply=false;this.supplyHeld=true;await new Promise<void>(()=>{});}
    return result;
  }
}
export class DriverProfile extends BaseProfile {
  private holdSupply=false;
  private supplyHeld=false;
  private rejectSupply=false;
  private holdPostcheck=false;
  private postcheckCount=0;
  private postcheckHeld=false;
  private releasePostcheck:(()=>void)|undefined;
  fixtureHoldSupply(){this.holdSupply=true;}
  fixtureSupplyHeld(){return this.supplyHeld;}
  fixtureRejectSupply(){this.rejectSupply=true;}
  fixtureHoldPostcheck(){this.holdPostcheck=true;this.postcheckCount=0;}
  fixturePostcheckHeld(){return this.postcheckHeld;}
  fixtureReleasePostcheck(){this.releasePostcheck?.();}
  override async checkFence(fence:string){
    if(this.holdPostcheck&&++this.postcheckCount===2){
      this.holdPostcheck=false;this.postcheckHeld=true;
      try{await new Promise<void>(resolve=>{this.releasePostcheck=resolve;});}finally{this.postcheckHeld=false;}
    }
    return super.checkFence(fence);
  }
  override async commit(intent:EconomyIntent,events?:EarningsEvents){
    if(intent.action.kind==='supply'&&this.rejectSupply){this.rejectSupply=false;return {ok:false as const,reason:'invalid' as const};}
    const result=await super.commit(intent,events);
    if(intent.action.kind==='supply'&&this.holdSupply){this.holdSupply=false;this.supplyHeld=true;await new Promise<void>(()=>{});}
    return result;
  }
}
type Env={ROOMS:DurableObjectNamespace<GameRoom>;ECONOMIES:DurableObjectNamespace<RoomEconomy>;
  DRIVERS:DurableObjectNamespace<DriverProfile>;INCOME:DurableObjectNamespace<GlobalIncome>;
  GLOBAL_EVENTS:DurableObjectNamespace<GlobalEarningsEvent>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(new URL(request.url).pathname==='/health')return new Response('ok');
    const body=await request.clone().json() as any;
    const economy=env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room??'fixture'));
    const driver=env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId??'fixture'));
    try{
      switch(body.op){
        case 'stage-supply':return Response.json(await economy.stageSupply(body.stage));
        case 'pickup-states':return Response.json(await economy.pickupStates(body.ids));
        case 'hold-supply-stage':await economy.fixtureHoldSupply();return Response.json(true);
        case 'supply-stage-held':return Response.json(await economy.fixtureSupplyHeld());
        case 'hold-supply-profile':await driver.fixtureHoldSupply();return Response.json(true);
        case 'supply-profile-held':return Response.json(await driver.fixtureSupplyHeld());
        case 'reject-supply':await driver.fixtureRejectSupply();return Response.json(true);
        case 'hold-postcheck':await driver.fixtureHoldPostcheck();return Response.json(true);
        case 'postcheck-held':return Response.json(await driver.fixturePostcheckHeld());
        case 'release-postcheck':await driver.fixtureReleasePostcheck();return Response.json(true);
        default:return base.fetch(request,env);
      }
    }catch(error){return new Response(error instanceof Error?error.stack:String(error),{status:500});}
  },
};
