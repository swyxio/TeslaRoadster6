import { DurableObject } from 'cloudflare:workers';
import type { MarketRequest } from '../shared/market-protocol';
import { DriverProfile } from './driver-profile';
import { MarketCoordinator } from './market-coordinator';

type Env={DRIVERS:DurableObjectNamespace<DriverProfile>};
type Command=Exclude<MarketRequest,{action:'browse'|'status'}>;

/** One private registry coordinates custody and durable wallet participants. */
export class MarketService extends DurableObject<Env> {
  private market:MarketCoordinator;
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    this.market=new MarketCoordinator(ctx.storage,id=>env.DRIVERS.get(env.DRIVERS.idFromName(id)));
  }
  browse(actorId:string,requestId:number,cursor?:string,ownedCursor?:string){return this.market.browse(actorId,requestId,cursor,ownedCursor);}
  status(actorId:string,operationId:string,requestId:number){return this.market.status(actorId,operationId,requestId);}
  execute(actorId:string,actorName:string,command:Command){return this.market.execute(actorId,actorName,command);}
  property(assetId:string){return this.market.property(assetId);}
  alarm(){return this.market.recover();}
}
