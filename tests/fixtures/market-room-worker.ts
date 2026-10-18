// Local Wrangler fixture: the production Worker, rooms, wallets and market,
// with a controllable lost reply after a wallet has durably applied a sale.
import walletFixture, { DriverProfile as WalletDriverProfile, GameRoom, GlobalChat, RoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import { MarketService } from '../../worker/market-service';
import type { DriverProgress } from '../../worker/driver-profile';

export { GameRoom, GlobalChat, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService };

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

type FixtureEnv={DRIVERS:DurableObjectNamespace<DriverProfile>;MARKET:DurableObjectNamespace<MarketService>};
export default {
  async fetch(request:Request,env:FixtureEnv,ctx:ExecutionContext):Promise<Response> {
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/__market-test/'))return walletFixture.fetch(request,env as never,ctx);
    if(request.method!=='POST')return new Response('POST required',{status:405});
    const {driverId,operationId}=await request.json() as {driverId:string;operationId:string};
    if(path==='/__market-test/status')return Response.json(await env.MARKET.get(env.MARKET.idFromName('global')).status(driverId,operationId,1));
    const driver=env.DRIVERS.get(env.DRIVERS.idFromName(driverId));
    if(path==='/__market-test/restricted-order')return Response.json(await driver.fixtureRestrictedOrder());
    if(path==='/__market-test/arm'){await driver.fixtureArmMarketApply();return Response.json({ok:true});}
    if(path==='/__market-test/state')return Response.json(await driver.fixtureMarketApplyState());
    if(path==='/__market-test/release'){await driver.fixtureReleaseMarketApply();return Response.json({ok:true});}
    return new Response('Unknown fixture route',{status:404});
  },
};
