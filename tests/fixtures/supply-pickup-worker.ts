// LOCAL TEST ONLY. Real room, ledger and profile with pickup-specific fault gates.
import walletFixture, { DriverProfile as WalletDriverProfile, GameRoom as WalletGameRoom, GlobalChat, RoomEconomy as WalletRoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import { MarketService } from '../../worker/market-service';
import type { EconomyIntent } from '../../worker/driver-profile';
import type { EarningsEvents } from '../../shared/earnings-events';
import type { World } from '../../shared/game';

export { GlobalChat, GlobalIncome, GlobalEarningsEvent, MarketService };

type Fault='reject'|'before-commit'|'after-commit';
export class DriverProfile extends WalletDriverProfile {
  private pickupFault:Fault|null=null;
  private heldPickup:string|null=null;
  private releasePickup:(()=>void)|undefined;
  async armPickupCommit(fault:Fault){this.pickupFault=fault;}
  async pickupCommitState(){return {held:this.heldPickup};}
  async releasePickupCommit(){this.releasePickup?.();}
  override async commit(intent:EconomyIntent,events?:EarningsEvents){
    const fault=intent.pickup?this.pickupFault:null;
    if(!fault)return super.commit(intent,events);
    this.pickupFault=null;
    const committed=fault==='after-commit'?await super.commit(intent,events):null;
    this.heldPickup=intent.eventId;
    try{await new Promise<void>(resolve=>{this.releasePickup=resolve;});}
    finally{this.heldPickup=null;this.releasePickup=undefined;}
    if(fault==='reject')return {ok:false as const,reason:'invalid' as const};
    return committed??super.commit(intent,events);
  }
}

export class GameRoom extends WalletGameRoom {
  async pickupCar(playerId:string,moveAway:boolean){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(item=>item.id===playerId);
    const car=world.entities.find(item=>item.id===player?.entityId);
    if(!car)throw new Error('Fixture player is missing');
    if(moveAway){
      const place=Reflect.get(this,'fixturePlace') as (id:string,x:number,z:number)=>unknown;
      place.call(this,playerId,-330,-30);
    }else car.health=20;
    return {health:car.health};
  }
  async pickupCarState(playerId:string){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(item=>item.id===playerId);
    const car=world.entities.find(item=>item.id===player?.entityId);
    return {health:car?.health};
  }
}

export class RoomEconomy extends WalletRoomEconomy {
  private holdNextSupplyStage=false;
  private heldSupplyStage:string|null=null;
  private releaseSupplyStage:(()=>void)|undefined;
  async armSupplyStage(){this.holdNextSupplyStage=true;}
  async supplyStageState(){return {held:this.heldSupplyStage};}
  async releaseStage(){this.releaseSupplyStage?.();}
  async supplyStages(driverId:string){return [...(await this.ctx.storage.list({prefix:`supply-stage:${driverId}:`})).values()];}
  override async stageSupply(stage:Parameters<WalletRoomEconomy['stageSupply']>[0]){
    const hold=this.holdNextSupplyStage;this.holdNextSupplyStage=false;
    const result=await super.stageSupply(stage);
    if(hold&&result==='accepted'){
      this.heldSupplyStage=stage.eventId;
      try{await new Promise<void>(resolve=>{this.releaseSupplyStage=resolve;});}
      finally{this.heldSupplyStage=null;this.releaseSupplyStage=undefined;}
    }
    return result;
  }
}

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;ROOMS:DurableObjectNamespace<GameRoom>;ECONOMIES:DurableObjectNamespace<RoomEconomy>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/__pickup-test/'))return walletFixture.fetch(request,env as never,ctx);
    if(request.method!=='POST')return new Response('POST required',{status:405});
    const {driverId,room,playerId,pickupId,eventId,fault,moveAway}=await request.json() as {driverId:string;room:string;playerId:string;pickupId:string;eventId:string;fault:Fault;moveAway:boolean};
    const driver=env.DRIVERS.get(env.DRIVERS.idFromName(driverId||'unused'));
    if(path==='/__pickup-test/arm'){await driver.armPickupCommit(fault);return Response.json({ok:true});}
    if(path==='/__pickup-test/held')return Response.json(await driver.pickupCommitState());
    if(path==='/__pickup-test/release'){await driver.releasePickupCommit();return Response.json({ok:true});}
    const roomStub=env.ROOMS.get(env.ROOMS.idFromName(room));
    if(path==='/__pickup-test/car')return Response.json(await roomStub.pickupCar(playerId,moveAway));
    if(path==='/__pickup-test/car-state')return Response.json(await roomStub.pickupCarState(playerId));
    const economy=env.ECONOMIES.get(env.ECONOMIES.idFromName(room));
    if(path==='/__pickup-test/arm-stage'){await economy.armSupplyStage();return Response.json({ok:true});}
    if(path==='/__pickup-test/stage-held')return Response.json(await economy.supplyStageState());
    if(path==='/__pickup-test/release-stage'){await economy.releaseStage();return Response.json({ok:true});}
    if(path==='/__pickup-test/status')return Response.json(await economy.status(eventId));
    if(path==='/__pickup-test/journal')return Response.json({pickup:(await economy.pickupStates([pickupId]))[pickupId],pending:await economy.pending(driverId),stages:await economy.supplyStages(driverId)});
    return new Response('Unknown fixture route',{status:404});
  },
};
