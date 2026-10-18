// Test-only adapter for a room economy's event history.
import { DurableObject } from 'cloudflare:workers';
import { RoomEarningsEvents, type RoomEventCursor } from '../../worker/room-earnings-events';

export class RoomEconomy extends DurableObject {
  private events=new RoomEarningsEvents(this.ctx.storage);
  recordWin(id:string,time:number){return this.events.recordWin(id,time);}
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
        const input=await request.json() as {id:string;time:number};return Response.json(await room.recordWin(input.id,input.time));
      }
      if(url.pathname==='/active')return Response.json(await room.activeUntil(Number(url.searchParams.get('time'))));
      if(url.pathname==='/history'){
        const input=await request.json() as {from:number;to:number;cursor?:RoomEventCursor};return Response.json(await room.history(input.from,input.to,input.cursor));
      }
      return new Response('Not found',{status:404});
    }catch(error){return new Response(String(error),{status:400});}
  }
} satisfies ExportedHandler<Env>;
