// LOCAL TEST ONLY. Extend the wallet fixture with a real drop-off arrival.
import walletWorker, { DriverProfile as WalletDriverProfile, GameRoom as WalletGameRoom, GlobalIncome } from './luxury-wallet-worker';
import { BUILDINGS, LANDMARKS, terrainHeight } from '../../shared/map';
import { advanceDeliverySearch, CUSTOMERS, initialDelivery, orderTarget } from '../../shared/delivery';
import { normalizeAchievementTiers } from '../../shared/achievement-tiers';
import type { World } from '../../shared/game';
import type { DriverProgress } from '../../worker/driver-profile';

export { RoomEconomy, GlobalChat, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';

/** Seed prior progress only; the normal scheduler selects the next order. */
export class DriverProfile extends WalletDriverProfile {
  async fixtureSeedUcsfCheckpoint() {
    const origin={x:-120,z:60,supportId:'ground'} as const;
    const delivery=initialDelivery(origin);
    delivery.completed=2;
    // Simulate a previous Tony's → Poly Ave job, ending at this origin.
    delivery.order.restaurant=1;delivery.order.customer=0;
    delivery.order.search={kind:'next',origin,level:0,roofEligible:true,cursor:{pair:0,leg:0,heading:0}};
    let steps=0;
    while(!advanceDeliverySearch(delivery,true))if(++steps>10_000)throw new Error('Fixture assignment did not finish');
    if(CUSTOMERS[delivery.order.customer].id!=='landmark-ucsf')throw new Error('Scheduler did not select UCSF');
    return this.ctx.storage.transaction(async txn=>{
      const record=await txn.get<{progress:DriverProgress}>('driver');
      if(!record)throw new Error('Missing fixture profile');
      record.progress.completed=2;
      record.progress.order=delivery.order;
      record.progress.unlocked=['deliveries-1'];
      record.progress.achievementTiers=normalizeAchievementTiers(undefined,2,record.progress.unlocked);
      await txn.put('driver',record);
      return record.progress;
    });
  }
}

export class GameRoom extends WalletGameRoom {
  async fixtureDeliveryDropoff(playerId:string,atResearch=false) {
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(candidate=>candidate.id===playerId);
    const car=world.entities.find(entity=>entity.id===player?.entityId);
    if(!player||!car||player.delivery.order.stage!=='dropoff')throw new Error('Test driver has no drop-off');
    // Make this isolated fixture's current stop overlap a research marker.
    // Both rewards then arise from ordinary room ticks and independent receipts.
    const target=orderTarget(player.delivery.order);
    if(atResearch)Object.assign(LANDMARKS.find(item=>item.id==='stanford')!.arrival,{x:target.x,z:target.z});
    const roof=target.rooftop?BUILDINGS.findIndex(building=>building.x===target.x&&building.z===target.z&&building.h===target.y):-1;
    if(target.rooftop&&roof<0)throw new Error('Drop-off roof missing');
    Object.assign(car,{x:target.x,z:target.z,y:target.rooftop?target.y:terrainHeight(target.x,target.z)??0,
      vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,supportId:target.rooftop?`roof:${roof}`:'ground'});
    return {x:target.x,z:target.z};
  }
}

export default {
  async fetch(request:Request,env:{ROOMS:DurableObjectNamespace<GameRoom>;DRIVERS:DurableObjectNamespace<DriverProfile>;INCOME:DurableObjectNamespace<GlobalIncome>},ctx:ExecutionContext):Promise<Response> {
    if(new URL(request.url).pathname==='/__checkpoint-test/seed-ucsf'){
      const {driverId}=await request.json() as {driverId:string};
      return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName(driverId)).fixtureSeedUcsfCheckpoint());
    }
    if(new URL(request.url).pathname==='/__checkpoint-test/dropoff'){
      const {room,playerId,atResearch}=await request.json() as {room:string;playerId:string;atResearch?:boolean};
      return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(room)).fixtureDeliveryDropoff(playerId,atResearch));
    }
    if(new URL(request.url).pathname==='/__checkpoint-test/income'){
      return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).total());
    }
    return walletWorker.fetch(request,env as never,ctx);
  },
};
