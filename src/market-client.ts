import type { MarketRequest, MarketResultView, MarketState } from '../shared/market-protocol';
import type { MarketAction, MarketView } from './market-ui';
import { clearMarketOperation, readMarketOperation, stageMarketOperation, type PendingMarketOperation } from './market-operations';

type Outgoing<T=MarketRequest> = T extends MarketRequest ? Omit<T,'type'|'requestId'> : never;
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Context={owner:string|null;ready:boolean;generation:number;cash:number|null};
const RETRY_MS=5_000;
const LOAD_TIMEOUT_MS=10_000;
const reasons:Record<string,string>={
  busy:'A driver is busy. Stop safely on the ground and try again.',
  'insufficient-funds':'There is not enough cash for this purchase.',
  'property-gate':'You need $2,000,000 before buying property.',
  'home-slot-occupied':'Sell your purchased home before buying another one.',
  'listing-unavailable':'This listing is no longer available.',
  'stale-listing':'The listing changed. Review its current price.',
  'asset-locked':'This item is involved in another market action.',
  equipped:'Unequip this item before listing it.',
  'not-owner':'You no longer own this item.',
  'self-purchase':'You cannot buy your own listing.',
  unavailable:'This item is unavailable.',
};

/** Keep an uncertain operation tied to its saved driver and reuse its ID across reconnects. */
export class MarketClient {
  private context:Context={owner:null,ready:false,generation:0,cash:null};
  private pending:PendingMarketOperation|null=null;
  private journalProblem:''|'unavailable'|'corrupt'='';
  private data:MarketState|null=null;
  private loading:{id:number;cursor?:string;ownedCursor?:string;deadline:number}|null=null;
  private statusAfter=0;
  private message='';
  constructor(private storage:StoragePort|null,private send:(message:Outgoing)=>number|null,
    private uuid:()=>string=()=>crypto.randomUUID(),private now:()=>number=()=>performance.now()){}

  setContext(next:Context):boolean {
    const changed=next.owner!==this.context.owner||next.generation!==this.context.generation;
    const becameReady=next.ready&&!this.context.ready;
    this.context=next;
    if(changed){
      this.data=null;this.loading=null;this.message='';this.pending=null;this.journalProblem='';
      if(next.owner){const journal=readMarketOperation(this.storage,next.owner);this.pending=journal.operation;this.journalProblem=journal.state==='ready'?'':journal.state;}
      this.statusAfter=0;
    }else if(becameReady){this.loading=null;this.statusAfter=0;}
    return next.ready&&(changed||becameReady);
  }
  refresh(cursor?:string,ownedCursor?:string){
    if(!this.context.ready||this.loading)return;
    // A storage write may have succeeded even if its readback failed. Recover
    // that exact operation before allowing the player to start another one.
    if(this.journalProblem&&this.context.owner){
      const journal=readMarketOperation(this.storage,this.context.owner);
      this.pending=journal.operation;this.journalProblem=journal.state==='ready'?'':journal.state;
      if(this.pending)this.statusAfter=0;
    }
    const request:Outgoing={action:'browse',...(cursor?{cursor}:{}),...(ownedCursor?{ownedCursor}:{})};
    const id=this.send(request);
    if(id===null){this.message='Could not load the market. Reconnect and try again.';return;}
    this.loading={id,cursor,ownedCursor,deadline:this.now()+LOAD_TIMEOUT_MS};
    if(!cursor&&!ownedCursor)this.data=null;
  }
  more(){if(this.data?.nextCursor)this.refresh(this.data.nextCursor);}
  moreOwned(){if(this.data?.nextOwnedCursor)this.refresh(undefined,this.data.nextOwnedCursor);}
  start(command:MarketAction):boolean {
    const {owner,ready}=this.context;
    if(!owner||!ready||this.pending||this.journalProblem||!this.data)return false;
    let operationId:string;try{operationId=this.uuid();}catch{this.message='Could not create a safe transaction ID.';return false;}
    const journal=stageMarketOperation(this.storage,owner,operationId,command);
    if(journal.state!=='ready'||!journal.operation){this.journalProblem=journal.state==='ready'?'unavailable':journal.state;return false;}
    // An earlier operation may have appeared between reading and staging.
    this.pending=journal.operation;
    if(this.pending.operationId===operationId)this.sendOperation();
    else this.statusAfter=0;
    this.message='';return true;
  }
  private sendOperation(){
    if(!this.context.ready||!this.pending)return;
    this.send({...this.pending.command,operationId:this.pending.operationId});
    this.statusAfter=this.now()+RETRY_MS;
  }
  tick(){
    if(this.loading&&this.now()>=this.loading.deadline){this.loading=null;this.message='The market did not respond. Refresh to try again.';}
    if(this.context.ready&&this.pending&&this.now()>=this.statusAfter){
      this.send({action:'status',operationId:this.pending.operationId});this.statusAfter=this.now()+RETRY_MS;
    }
  }
  receiveState(state:MarketState){
    if(!this.context.ready||!this.loading||state.requestId!==this.loading.id)return;
    if((this.loading.cursor||this.loading.ownedCursor)&&this.data){
      const listings=new Map(this.data.listings.map(item=>[item.listingId,item]));
      const owned=new Map(this.data.owned.map(item=>[item.assetId,item]));
      if(this.loading.cursor)for(const item of state.listings)listings.set(item.listingId,item);
      if(this.loading.ownedCursor)for(const item of state.owned)owned.set(item.assetId,item);
      this.data={...state,listings:[...listings.values()],owned:[...owned.values()],
        nextCursor:this.loading.cursor?state.nextCursor:this.data.nextCursor,
        nextOwnedCursor:this.loading.ownedCursor?state.nextOwnedCursor:this.data.nextOwnedCursor};
    }else this.data=state;
    this.loading=null;
  }
  receiveResult(result:MarketResultView){
    const pending=this.pending;
    if(!this.context.ready||!pending||result.operationId!==pending.operationId)return;
    if(result.status==='not-found'){this.sendOperation();return;}
    if(result.action!==pending.command.action)return;
    if(result.status==='pending'){this.statusAfter=this.now()+RETRY_MS;return;}
    if(!clearMarketOperation(this.storage,pending.owner,pending.operationId)){
      this.message='The result was received, but browser storage could not finish saving it. Retrying safely.';
      this.statusAfter=this.now()+RETRY_MS;return;
    }
    this.pending=null;this.message=result.status==='completed'?'Market action completed.':(result.reason&&reasons[result.reason])||'The market could not complete this action. Refresh and try again.';
    this.loading=null;this.refresh();
  }
  view():MarketView {
    const {owner,ready,cash}=this.context;
    const message=!owner?'Save your driver in Actions → Driver identity to use the market.':
      !ready?'Reconnect your saved driver to use the market.':
      this.journalProblem==='corrupt'?'A saved market operation is unreadable. Market actions are paused.':
      this.journalProblem==='unavailable'?'Browser storage is unavailable. Market actions are paused.':this.message;
    const state=!owner||!ready||(!this.data&&!this.loading)?'unavailable':this.data?'ready':'loading';
    return {state,message,cash:ready?cash:null,pending:!!this.pending||!!this.journalProblem,
      listings:this.data?.listings??[],owned:this.data?.owned??[],shop:this.data?.shop??[],nextCursor:this.data?.nextCursor,nextOwnedCursor:this.data?.nextOwnedCursor};
  }
}
