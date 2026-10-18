// Local characterization of an arrival behind a rejected balance change.
import { EconomySession } from '../../worker/economy-session';
import { progressFrom, type DriverOutcome, type EconomyIntent } from '../../worker/driver-profile';
import { addPlayer, createEmptyWorld, NEUTRAL, step } from '../../shared/game';
import { CUSTOMERS, levelForCash, payoutFor, updateDelivery } from '../../shared/delivery';
import { terrainHeight } from '../../shared/map';

async function scenario(visit:'committed'|'speculative') {
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  player.delivery.cash=10_120;player.delivery.level=levelForCash(player.delivery.cash);
  player.delivery.activeUntil=100;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,base:3_000,elapsed:40};
  player.achievements.unlocked.push('region-oakland');
  const initial=progressFrom(player.delivery,player.achievements.unlocked,{},[],0,0);
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[];
  const ledger={
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      if(writes.length===1){started();await held;return {ok:false,reason:'reserved'};}
      if(intent.action.kind!=='progress')throw new Error(`Unexpected ${intent.action.kind}`);
      saved=structuredClone(intent.action.progress);
      return {ok:true,revision:intent.revision+1,progress:structuredClone(saved),awards:[]};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  session.contributeMars(1_000,1);await began;
  const speculative=structuredClone((Reflect.get(session,'draft') as {delivery:{order:typeof initial.order}}).delivery.order);
  if(speculative.customer===initial.order.customer)throw new Error('The rejected predecessor did not reroute the order');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  // Keep five seconds of active order time independent of either target.
  world.time=5;Object.assign(car,{x:450,z:60,y:0,speed:0,vy:0,supportId:'ground'});
  session.update(player,()=>updateDelivery(world,player,car,NEUTRAL,5),{atMs:1_000,multiplier:2});
  const target=CUSTOMERS[visit==='committed'?initial.order.customer:speculative.customer];
  Object.assign(car,{x:target.x,z:target.z,y:terrainHeight(target.x,target.z)??0,speed:0,vy:0,supportId:'ground'});
  const hooks=session.hooks();
  step(world,new Map(),.05,{economy:{...hooks,update:(p,apply)=>session.update(p,apply,{atMs:2_000,multiplier:2}),
    resolveDeliveryPayout:(_p,component)=>2*component.amount}});
  const draft=structuredClone(Reflect.get(session,'draft') as {delivery:{completed:number;order:typeof initial.order}});
  // The player leaves before the predecessor resolves.
  Object.assign(car,{x:0,z:0,y:0,speed:0,vy:0,supportId:'ground'});
  release();
  for(let i=0;i<2_000&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('The fixture queue did not drain');
  return {initial,speculative,draft,saved,writes,expectedFare:2*payoutFor({...initial.order,elapsed:45.05})};
}

export default {async fetch(request:Request){
  try{return Response.json(await scenario(new URL(request.url).pathname==='/speculative'?'speculative':'committed'));}
  catch(error){return new Response(String(error),{status:500});}
}};
