// Local Wrangler fixture: the production Worker, rooms, wallets and market,
// with a controllable lost reply after a wallet has durably applied a sale.
import walletFixture, { DriverProfile as WalletDriverProfile, GameRoom as WalletGameRoom, GlobalChat, RoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import { MarketService } from '../../worker/market-service';
import type { DriverProgress } from '../../worker/driver-profile';
import { makeEntity, type Entity, type World } from '../../shared/game';

export { GlobalChat, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService };

/** Block every fallback spawn only during one real room's market resume. */
export class GameRoom extends WalletGameRoom {
  private blockNextMarketResume=false;
  async fixtureBlockMarketResume(){this.blockNextMarketResume=true;}
  override async resumeMarketWallet(driverId:string,fence:string,transactionId:string) {
    if(!this.blockNextMarketResume)return super.resumeMarketWallet(driverId,fence,transactionId);
    this.blockNextMarketResume=false;
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{economy:{walletId:string};marketHold:{car:Entity}|null}>;
    const held=[...sessions.values()].find(session=>session.economy.walletId===driverId)?.marketHold;
    if(!held)throw new Error('No held market driver');
    const world=Reflect.get(this,'world') as World,blockers:Entity[]=[];
    const block=(x:number,z:number,y?:number)=>{const car=makeEntity(`market-blocker-${blockers.length}`,'model-3',x,z);if(y!==undefined)car.y=y;blockers.push(car);};
    block(held.car.x,held.car.z,held.car.y);block(40,60);
    for(let i=0;i<192;i++){const road=[60,0,-60,-120,-180,-240][Math.floor(i/32)];block(road+(i%2?3.5:-3.5),120-Math.floor(i/2)%16*14);}
    for(let x=-220;x<=220;x+=20)for(const z of [210,-210])block(x,z);
    world.entities.push(...blockers);
    try{return await super.resumeMarketWallet(driverId,fence,transactionId);}
    finally{world.entities=world.entities.filter(entity=>!blockers.includes(entity));}
  }
}

export class DriverProfile extends WalletDriverProfile {
  private holdNextMarketApply=false;
  private marketApplyHeld=false;
  private releaseMarketApply:(()=>void)|undefined;

  /** Seed a level-one dropoff before connecting, so a purchase requires rerouting. */
  async fixtureRestrictedOrder() {
    return this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<{progress:DriverProgress}>('driver');
      if(!record||record.progress.level!==1)throw new Error('A level-one fixture wallet is required');
      record.progress.order={...record.progress.order,stage:'dropoff',customer:4};
      await txn.put('driver',record);
      return record.progress;
    });
  }

  async fixtureArmMarketApply() { this.holdNextMarketApply=true; }
  async fixtureMarketApplyState() { return {held:this.marketApplyHeld}; }
  async fixtureReleaseMarketApply() { this.releaseMarketApply?.(); }
  override async marketApply(transactionId:string) {
    const hold=this.holdNextMarketApply;this.holdNextMarketApply=false;
    const applied=await super.marketApply(transactionId);
    if(hold&&applied){
      this.marketApplyHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseMarketApply=resolve;});}
      finally{this.marketApplyHeld=false;this.releaseMarketApply=undefined;}
      throw new Error('Injected lost market wallet reply after commit');
    }
    return applied;
  }
}

type FixtureEnv={DRIVERS:DurableObjectNamespace<DriverProfile>;MARKET:DurableObjectNamespace<MarketService>;ROOMS:DurableObjectNamespace<GameRoom>};
export default {
  async fetch(request:Request,env:FixtureEnv,ctx:ExecutionContext):Promise<Response> {
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/__market-test/'))return walletFixture.fetch(request,env as never,ctx);
    if(request.method!=='POST')return new Response('POST required',{status:405});
    const {driverId,operationId,room}=await request.json() as {driverId:string;operationId:string;room:string};
    if(path==='/__market-test/status')return Response.json(await env.MARKET.get(env.MARKET.idFromName('global')).status(driverId,operationId,1));
    if(path==='/__market-test/block-resume'){await env.ROOMS.get(env.ROOMS.idFromName(room)).fixtureBlockMarketResume();return Response.json({ok:true});}
    const driver=env.DRIVERS.get(env.DRIVERS.idFromName(driverId));
    if(path==='/__market-test/restricted-order')return Response.json(await driver.fixtureRestrictedOrder());
    if(path==='/__market-test/arm'){await driver.fixtureArmMarketApply();return Response.json({ok:true});}
    if(path==='/__market-test/state')return Response.json(await driver.fixtureMarketApplyState());
    if(path==='/__market-test/release'){await driver.fixtureReleaseMarketApply();return Response.json({ok:true});}
    return new Response('Unknown fixture route',{status:404});
  },
};
