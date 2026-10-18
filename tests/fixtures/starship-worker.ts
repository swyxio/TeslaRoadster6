// Test-only HTTP adapter. The deployed Worker exposes no route for crediting.
import { Starship, type StarshipReconciliation } from '../../worker/starship';
export { Starship };

type Env = { STARSHIP:DurableObjectNamespace<Starship> };
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url),mission=env.STARSHIP.get(env.STARSHIP.idFromName('test'));
    try {
      if(url.pathname==='/credit'&&request.method==='POST'){
        const status=await mission.reconcile(await request.json() as StarshipReconciliation);
        // Simulate a response lost after the global commit succeeded.
        if(url.searchParams.has('lose-reply'))return new Response('injected lost reply',{status:503});
        return Response.json(status);
      }
      if(url.pathname==='/status')return Response.json(await mission.status(url.searchParams.get('driver')??undefined));
      if(url.pathname==='/contributors')return Response.json(await mission.contributors(url.searchParams.get('cursor')??undefined));
      return new Response('Not found',{status:404});
    }catch(error){return new Response(String(error),{status:400});}
  }
} satisfies ExportedHandler<Env>;
