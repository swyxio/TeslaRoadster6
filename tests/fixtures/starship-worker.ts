// Test-only adapter for the same storage keys as the canonical GlobalIncome DO.
import { DurableObject } from 'cloudflare:workers';
import { StarshipLedger } from '../../worker/starship';
import type { StarshipContributorGroup } from '../../shared/starship';

export class GlobalIncome extends DurableObject {
  private ledger=new StarshipLedger(this.ctx.storage);
  credit(driverId:string,total:number){return this.ledger.credit(driverId,total);}
  status(driverId?:string){return this.ledger.status(driverId);}
  contributors(group:StarshipContributorGroup,cursor?:string){return this.ledger.contributors(group,cursor);}
  async setName(driverId:string,name:string|null,revision?:number){
    const next=revision??await this.ctx.storage.transaction(async txn=>{
      const key=`fixture-privacy:${driverId}`,n=(await txn.get<number>(key)??0)+1;await txn.put(key,n);return n;
    });
    return this.ledger.setPublicName(driverId,name,next);
  }
  publicName(driverId:string){return this.ledger.publicName(driverId);}
  async seed(driverId:string,total:number){
    await this.ctx.storage.transaction(async txn=>{
      const key=`income:${driverId}`,previous=await txn.get<number>(key)??0,overall=await txn.get<number>('total')??0;
      await txn.put({[key]:total,total:overall+total-previous});
    });
  }
}
type Env={INCOME:DurableObjectNamespace<GlobalIncome>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url),income=env.INCOME.get(env.INCOME.idFromName(url.searchParams.get('instance')??'global'));
    try{
      if(url.pathname==='/credit'&&request.method==='POST'){
        const input=await request.json() as {driverId:string;total:number};
        const result=await income.credit(input.driverId,input.total);
        if(url.searchParams.has('lose-reply'))return new Response('injected lost reply',{status:503});
        return Response.json(result);
      }
      if(url.pathname==='/seed'&&request.method==='POST'){
        const input=await request.json() as {driverId:string;total:number};await income.seed(input.driverId,input.total);return new Response('ok');
      }
      if(url.pathname==='/name'&&request.method==='POST'){
        const input=await request.json() as {driverId:string;name:string|null;revision?:number};return Response.json(await income.setName(input.driverId,input.name,input.revision));
      }
      if(url.pathname==='/name')return Response.json(await income.publicName(url.searchParams.get('driver')??''));
      if(url.pathname==='/status')return Response.json(await income.status(url.searchParams.get('driver')??undefined));
      if(url.pathname==='/contributors')return Response.json(await income.contributors((url.searchParams.get('group')??'at-goal') as StarshipContributorGroup,url.searchParams.get('cursor')??undefined));
      return new Response('Not found',{status:404});
    }catch(error){return new Response(String(error),{status:400});}
  }
} satisfies ExportedHandler<Env>;
