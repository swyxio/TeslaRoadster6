// LOCAL TEST ONLY. Exposes authoritative room cabs for the focused test.
import walletFixture, { GameRoom as WalletGameRoom, DriverProfile, GlobalChat, RoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import type { World } from '../../shared/game';

export { DriverProfile, GlobalChat, RoomEconomy, GlobalIncome, GlobalEarningsEvent };
export class GameRoom extends WalletGameRoom {
  async fixtureCabs() {
    const world=Reflect.get(this,'world') as World;
    return world.entities.filter(entity=>entity.cab).map(entity=>({assetId:entity.cab!.assetId,owner:entity.owner,driver:entity.driver}));
  }
  /** Move an existing on-foot borrower beside a real dispatched cab. */
  async fixturePlaceBorrower(playerId:string,assetId:string) {
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(item=>item.id===playerId);
    const person=world.entities.find(item=>item.id===player?.entityId);
    const cab=world.entities.find(item=>item.cab?.assetId===assetId);
    if(!person||person.kind!=='person'||!cab||cab.driver||cab.supportId!=='ground')throw new Error('Expected an on-foot borrower and an unoccupied ground cab');
    Object.assign(cab,{speed:0,vx:0,vy:0,vz:0,pushX:0,pushZ:0,pauseUntil:world.time+5});
    Object.assign(person,{x:cab.x+2,z:cab.z,y:cab.y,supportId:cab.supportId,speed:0,vx:0,vy:0,vz:0,pushX:0,pushZ:0});
    return {cabId:cab.id};
  }
}
type Env={ROOMS:DurableObjectNamespace<GameRoom>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    if(new URL(request.url).pathname==='/__cab-test/cabs'){
      const {room}=await request.json() as {room:string};
      return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(room)).fixtureCabs());
    }
    if(new URL(request.url).pathname==='/__cab-test/place-borrower'){
      const {room,playerId,assetId}=await request.json() as {room:string;playerId:string;assetId:string};
      return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(room)).fixturePlaceBorrower(playerId,assetId));
    }
    return walletFixture.fetch(request,env as never,ctx);
  },
};
