// Test-only adapter for a room economy's event history.
import { DurableObject } from 'cloudflare:workers';
import { RoomEarningsEvents, type RoomEventCursor } from '../../worker/room-earnings-events';

export class RoomEconomy extends DurableObject {
  private events=new RoomEarningsEvents(this.ctx.storage);
  prepareWin(id:string,time:number){return this.events.prepareWin(id,time);}
  recordWithoutPayout(id:string,time:number){return this.events.recordWinWithoutPayout(id,time);}
  commitWin(id:string){return this.events.commitWin(id);}
  pendingWin(){return this.events.pendingWin();}
  activeUntil(time:number){return this.events.activeUntil(time);}
  history(from:number,to:number,cursor?:RoomEventCursor){return this.events.history(from,to,cursor);}
}
type Env={ROOM_ECONOMY:DurableObjectNamespace<RoomEconomy>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url),room=env.ROOM_ECONOMY.get(env.ROOM_ECONOMY.idFromName('test'));
    try{
      if(url.pathname==='/health')return new Response('ok');
      if(url.pathname==='/win'){
        const input=await request.json() as {id:string;time:number};await room.prepareWin(input.id,input.time);return Response.json(await room.commitWin(input.id));
      }
      if(url.pathname==='/prepare'){
        const input=await request.json() as {id:string;time:number};return Response.json(await room.prepareWin(input.id,input.time));
      }
      if(url.pathname==='/no-payout'){
        const input=await request.json() as {id:string;time:number};const result=await room.recordWithoutPayout(input.id,input.time);
        return url.searchParams.has('lose-reply')?new Response('Simulated lost reply',{status:503}):Response.json(result);
      }
      if(url.pathname==='/commit'){
        const input=await request.json() as {id:string};const result=await room.commitWin(input.id);
        return url.searchParams.has('lose-reply')?new Response('Simulated lost reply',{status:503}):Response.json(result);
      }
      if(url.pathname==='/pending')return Response.json(await room.pendingWin());
      if(url.pathname==='/active')return Response.json(await room.activeUntil(Number(url.searchParams.get('time'))));
      if(url.pathname==='/history'){
        const input=await request.json() as {from:number;to:number;cursor?:RoomEventCursor};return Response.json(await room.history(input.from,input.to,input.cursor));
      }
      return new Response('Not found',{status:404});
    }catch(error){return new Response(String(error),{status:400});}
  }
} satisfies ExportedHandler<Env>;
