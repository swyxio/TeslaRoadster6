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
  async fixtureState(){return {pending:await this.ctx.storage.get<number>('income-pending')??null,privacy:await this.ctx.storage.get('privacy-pending')??null,alarm:await this.ctx.storage.getAlarm()};}
  async fixtureEarn(){
    const record=await this.ctx.storage.get<{revision:number;sequence:number;progress:DriverProgress}>('driver');
    if(!record)throw new Error('Missing test driver');
    const progress=structuredClone(record.progress);progress.cash+=500;progress.eligibleIncome+=500;
    return this.commit({eventId:'privacy-held-earning',driverId:'income-test',fence:'fixture-fence',roomId:'fixture-room',revision:record.revision,sequence:record.sequence+1,action:{kind:'progress',progress}});
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
  private holdPrivacy=false;
  private privacyHeld=false;
  async fixtureHold(){this.hold=true;}
  async fixtureHoldPrivacy(){this.holdPrivacy=true;}
  async fixtureState(){return {held:this.held,privacyHeld:this.privacyHeld,total:await this.total(),publicName:await this.publicName('income-test')};}
  override async credit(id:string,cumulative:number){
    if(this.hold){this.held=true;await new Promise<void>(()=>{});}
    return super.credit(id,cumulative);
  }
  override async setName(id:string,name:string|null,revision:number){
    if(this.holdPrivacy){this.privacyHeld=true;await new Promise<void>(()=>{});}
    return super.setName(id,name,revision);
  }
}
type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;INCOME:DurableObjectNamespace<GlobalIncome>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const path=new URL(request.url).pathname,driver=env.DRIVERS.get(env.DRIVERS.idFromName('income-test')),income=env.INCOME.get(env.INCOME.idFromName('global'));
    if(path==='/hold'){await income.fixtureHold();return Response.json({ok:true});}
    if(path==='/hold-privacy'){await income.fixtureHoldPrivacy();return Response.json({ok:true});}
    if(path==='/set-privacy')return Response.json(await driver.setStarshipName('income-test','fixture-fence','Test driver'));
    if(path==='/start'){await driver.fixtureStart('income-test');return Response.json({ok:true});}
    if(path==='/earn')return Response.json(await driver.fixtureEarn());
    if(path==='/profile')return Response.json(await driver.fixtureState());
    if(path==='/income')return Response.json(await income.fixtureState());
    if(path==='/purchase')return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName('luxury-income-test')).fixturePurchase());
    return new Response('not found',{status:404});
  }
};
