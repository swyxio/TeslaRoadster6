// Isolated test-only HTTP adapter for RPC. This is not a deployed entry point.
import { GlobalEarningsEvent } from '../../worker/global-earnings-event';

export class TestGlobalEarningsEvent extends GlobalEarningsEvent {
  private fakeNow?:number;
  protected override nowMs():number { return this.fakeNow??Date.now(); }
  setTime(now:number):void { this.fakeNow=now; }
}

type FixtureEnv={ EVENTS:DurableObjectNamespace<TestGlobalEarningsEvent> };
export default {
  async fetch(request:Request,env:FixtureEnv):Promise<Response> {
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true});
    if(request.method!=='POST')return new Response('POST required',{status:405});
    const data=await request.json() as {object?:string;op:string;now?:number;id?:string;start?:number;from?:number;to?:number;cursor?:number;count?:number};
    const stub=env.EVENTS.get(env.EVENTS.idFromName(data.object??'test'));
    try{
      if(data.op==='setTime'){await stub.setTime(data.now!);return Response.json({ok:true});}
      if(data.op==='schedule')return Response.json(await stub.schedule(data.id!,data.start!));
      if(data.op==='lease')return Response.json(await stub.lease());
      if(data.op==='history')return Response.json(await stub.history(data.from!,data.to!,data.cursor));
      if(data.op==='batch'){
        const jobs=Array.from({length:data.count!},(_,index)=>stub.schedule(`batch-${index}`,data.start!+index*1_800_000));
        return Response.json(await Promise.allSettled(jobs));
      }
      return new Response('Unknown test operation',{status:404});
    }catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:400});}
  },
} satisfies ExportedHandler<FixtureEnv>;
