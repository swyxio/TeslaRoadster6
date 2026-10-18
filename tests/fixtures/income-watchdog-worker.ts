// Local-only fault fixture: never deploy this worker.
import { DriverProfile as ProductionDriver, GlobalIncome as ProductionIncome, progressFrom, type DriverProgress } from '../../worker/driver-profile';
import { GameRoom, GlobalChat, RoomEconomy } from '../../worker/index';
import { initialDelivery } from '../../shared/delivery';

export { GameRoom, GlobalChat, RoomEconomy };
export class DriverProfile extends ProductionDriver {
  async fixtureStart(id:string){
    const initial=progressFrom(initialDelivery({x:0,z:0}),[],{},[],0,12345);
    await this.acquire(id,'fixture-fence',initial,'fixture-room');
    await this.activateIncome('fixture-fence');
  }
  async fixtureState(){return {pending:await this.ctx.storage.get<number>('income-pending')??null,incomeRetry:await this.ctx.storage.get('income-retry')??null,privacy:await this.ctx.storage.get('privacy-pending')??null,privacyRetry:await this.ctx.storage.get('privacy-retry')??null,privacyPending:(await this.starshipPrivacyState('income-test','fixture-fence'))?.pending,alarm:await this.ctx.storage.getAlarm()};}
  async fixtureEarn(){
    const record=await this.ctx.storage.get<{revision:number;sequence:number;progress:DriverProgress}>('driver');
    if(!record)throw new Error('Missing test driver');
    const progress=structuredClone(record.progress);progress.cash+=500;progress.eligibleIncome+=500;
    return this.commit({eventId:`fixture-earning-${record.sequence+1}`,driverId:'income-test',fence:'fixture-fence',roomId:'fixture-room',revision:record.revision,sequence:record.sequence+1,action:{kind:'progress',progress}});
  }
  async fixturePurchase(){
    const id='luxury-income-test',fence='luxury-income-fence',roomId='luxury-income-room';
    const delivery=initialDelivery({x:0,z:0});delivery.cash=2_000_000;
    await this.acquire(id,fence,progressFrom(delivery,[],{},[],0,0),roomId);
    return this.commit({eventId:'luxury-income-event',driverId:id,fence,roomId,revision:0,sequence:1,action:{kind:'luxury',vehicle:'ducati-panigale-v4'}});
  }
}
export class GlobalIncome extends ProductionIncome {
  private hold=false;
  private held=false;
  private pauseIncome=false;
  private pausedIncome:Array<()=>void>=[];
  private failIncome=false;
  private incomeCalls=0;
  private holdPrivacy=false;
  private privacyHeld=false;
  private privacyCalls=0;
  async fixtureHold(){this.hold=true;}
  async fixturePauseIncome(){this.pauseIncome=true;}
  async fixtureReleaseIncome(){this.pauseIncome=false;for(const resume of this.pausedIncome.splice(0))resume();}
  async fixtureFailIncome(fail:boolean){this.failIncome=fail;}
  async fixtureHoldPrivacy(){this.holdPrivacy=true;}
  async fixtureState(){return {held:this.held,incomePaused:this.pausedIncome.length>0,incomeCalls:this.incomeCalls,privacyHeld:this.privacyHeld,privacyCalls:this.privacyCalls,total:await this.total(),publicName:await this.publicName('income-test')};}
  override async credit(id:string,cumulative:number){
    this.incomeCalls++;
    if(this.failIncome)throw new Error('Simulated income outage');
    if(this.hold){this.held=true;await new Promise<void>(()=>{});}
    if(this.pauseIncome)await new Promise<void>(resolve=>this.pausedIncome.push(resolve));
    return super.credit(id,cumulative);
  }
  override async setName(id:string,name:string|null,revision:number){
    this.privacyCalls++;
    if(this.holdPrivacy){this.privacyHeld=true;await new Promise<void>(()=>{});}
    return super.setName(id,name,revision);
  }
}
type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;INCOME:DurableObjectNamespace<GlobalIncome>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url),path=url.pathname,driver=env.DRIVERS.get(env.DRIVERS.idFromName('income-test')),income=env.INCOME.get(env.INCOME.idFromName('global'));
    if(path==='/hold'){await income.fixtureHold();return Response.json({ok:true});}
    if(path==='/pause-income'){await income.fixturePauseIncome();return Response.json({ok:true});}
    if(path==='/release-income'){await income.fixtureReleaseIncome();return Response.json({ok:true});}
    if(path==='/fail-income'){await income.fixtureFailIncome(true);return Response.json({ok:true});}
    if(path==='/recover-income'){await income.fixtureFailIncome(false);return Response.json({ok:true});}
    if(path==='/hold-privacy'){await income.fixtureHoldPrivacy();return Response.json({ok:true});}
    if(path==='/set-privacy')return Response.json(await driver.setStarshipName('income-test','fixture-fence',url.searchParams.get('name')??'Test driver'));
    if(path==='/start'){await driver.fixtureStart('income-test');return Response.json({ok:true});}
    if(path==='/earn')return Response.json(await driver.fixtureEarn());
    if(path==='/profile')return Response.json(await driver.fixtureState());
    if(path==='/income')return Response.json(await income.fixtureState());
    if(path==='/purchase')return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName('luxury-income-test')).fixturePurchase());
    return new Response('not found',{status:404});
  }
};
