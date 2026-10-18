// Local isolation fixture: the real room has no access to persistent services.
import { GameRoom as BaseRoom } from '../../worker/index';
export class GameRoom extends BaseRoom {
  private accesses:string[];
  constructor(ctx:DurableObjectState,env:unknown){
    const accesses:string[]=[];
    super(ctx,new Proxy(env as object,{get(target,key){
      if(['DRIVERS','ECONOMIES','INCOME','GLOBAL_EVENTS','MARKET','CHAT'].includes(String(key))){
        accesses.push(String(key));throw new Error(`Forbidden persistent service: ${String(key)}`);
      }
      return Reflect.get(target,key);
    }}) as never);
    this.accesses=accesses;
  }
  async isolation(){return {accesses:this.accesses,keys:[...(await this.ctx.storage.list()).keys()],tables:this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name != '__miniflare_do_name'").toArray()};}
}
export default {async fetch(request:Request,env:{ROOMS:DurableObjectNamespace<GameRoom>}){
  const url=new URL(request.url);if(url.pathname==='/health')return new Response('ok');
  const room=url.pathname.split('/').at(-1)!;
  const stub=env.ROOMS.get(env.ROOMS.idFromName(room));
  if(url.pathname.startsWith('/isolation/'))return Response.json(await stub.isolation());
  return stub.fetch(request);
}};
