import type { GlobalEarningsEvent } from './global-earnings-event';

type AdminEnv={GLOBAL_EVENTS:DurableObjectNamespace<GlobalEarningsEvent>;STARSHIP_ADMIN_TOKEN?:string};
const encoder=new TextEncoder();

/** Authenticated operator endpoint; never accepts a client-supplied clock. */
export async function scheduleGlobalEarnings(request:Request,env:AdminEnv):Promise<Response>{
  const secret=env.STARSHIP_ADMIN_TOKEN;
  if(!secret||secret.length<32)return new Response('Event scheduling unavailable',{status:503});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
  const match=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')??'');
  if(!match)return new Response('Unauthorized',{status:401});
  const [provided,expected]=await Promise.all([
    crypto.subtle.digest('SHA-256',encoder.encode(match[1])),
    crypto.subtle.digest('SHA-256',encoder.encode(secret)),
  ]);
  if(!crypto.subtle.timingSafeEqual(provided,expected))return new Response('Unauthorized',{status:401});
  if(Number(request.headers.get('Content-Length')??0)>1024)return new Response('Request too large',{status:413});
  let input:unknown;
  try{const body=await request.text();if(body.length>1024)return new Response('Request too large',{status:413});input=JSON.parse(body);}
  catch{return new Response('Invalid JSON',{status:400});}
  if(!input||typeof input!=='object'||Array.isArray(input))return new Response('Invalid event',{status:400});
  const {requestId,startsAtMs}=input as Record<string,unknown>;
  if(typeof requestId!=='string'||!Number.isSafeInteger(startsAtMs))return new Response('Invalid event',{status:400});
  try{
    const service=env.GLOBAL_EVENTS.get(env.GLOBAL_EVENTS.idFromName('global'));
    return Response.json(await service.schedule(requestId,startsAtMs as number),{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const invalid=new Set(['Invalid event request ID','Event request ID already used for another start',
      'Event must start at least 60 seconds in the future','Event would start before an existing lease expires',
      'Event overlaps an existing event','Expected a valid UTC millisecond timestamp']);
    return invalid.has(message)?new Response(message,{status:400}):new Response('Event service unavailable',{status:503});
  }
}
