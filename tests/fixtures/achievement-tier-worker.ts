// LOCAL TEST ONLY: exercise the production wallet/journal with old and corrupt profiles.
import base, { DriverProfile as BaseProfile } from './delivery-journal-worker';
import type { DriverProgress } from '../../worker/driver-profile';

export { GameRoom, RoomEconomy, GlobalIncome, GlobalEarningsEvent } from './delivery-journal-worker';

export class DriverProfile extends BaseProfile {
  async fixtureSetProgress(fields:Partial<DriverProgress>,clearTiers:boolean,clearCollections:boolean){
    return this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<{progress:DriverProgress}>('driver');
      if(!record)throw new Error('Missing fixture driver');
      Object.assign(record.progress,structuredClone(fields));
      if(clearTiers)delete record.progress.achievementTiers;
      if(clearCollections)delete record.progress.vehicleCollections;
      await txn.put('driver',record);
      return record.progress;
    });
  }
}

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(new URL(request.url).pathname!=='/__tier-test')return base.fetch(request,env as never);
    const body=await request.json() as {driverId:string;fields:Partial<DriverProgress>;clearTiers:boolean;clearCollections:boolean};
    try{
      return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId)).fixtureSetProgress(body.fields,body.clearTiers,body.clearCollections));
    }catch(error){return new Response(error instanceof Error?error.stack:String(error),{status:500});}
  },
};
