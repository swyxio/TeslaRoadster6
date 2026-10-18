// Local-only fault injection around the production room-history barrier.
import { GameRoom as BaseRoom } from '../../worker/index';
import { RoomEconomy as BaseEconomy } from '../../worker/room-economy';
import type { RoomEventCursor } from '../../worker/room-earnings-events';

export class GameRoom extends BaseRoom {
  fixtureJournal(room:string,eventId:string,at:number){
    Reflect.apply(Reflect.get(this,'initWinStorage'),this,[]);
    this.ctx.storage.sql.exec('INSERT INTO game_room_pending_wins (event_id,requested_at,room_id) VALUES (?,?,?)',eventId,at,room);
    Reflect.set(this,'hasPendingWin',true);
  }
  fixtureRecordWin(room:string,at?:number){
    Reflect.apply(Reflect.get(this,'initWinStorage'),this,[]);
    Reflect.set(this,'roomId',room);
    Reflect.apply(Reflect.get(this,'recordWin'),this,at===undefined?[]:[at]);
  }
  fixturePending(){
    Reflect.apply(Reflect.get(this,'initWinStorage'),this,[]);
    return this.ctx.storage.sql.exec('SELECT * FROM game_room_pending_wins ORDER BY requested_at,event_id').toArray();
  }
}

export class RoomEconomy extends BaseEconomy {
  private heldWin=false;
  private heldHistory=false;
  private releaseWin:(()=>void)|null=null;
  private releaseHistory:(()=>void)|null=null;
  private holdHistory=false;
  private failSecondPage=false;
  private historyCalls=0;
  constructor(ctx:DurableObjectState,env:ConstructorParameters<typeof BaseEconomy>[1]){
    super(ctx,env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS fixture_fault (singleton INTEGER PRIMARY KEY, mode TEXT NOT NULL); INSERT OR IGNORE INTO fixture_fault VALUES (1,'none')");
  }
  fixtureMode(mode:string){this.ctx.storage.sql.exec('UPDATE fixture_fault SET mode=? WHERE singleton=1',mode);}
  fixtureHoldHistory(){this.holdHistory=true;}
  fixtureFailSecondPage(fail:boolean){this.failSecondPage=fail;}
  fixtureReleaseHistory(){this.releaseHistory?.();}
  fixtureReleaseWin(){this.releaseWin?.();}
  fixtureState(){
    return {heldWin:this.heldWin,heldHistory:this.heldHistory,historyCalls:this.historyCalls,
      fence:this.ctx.storage.sql.exec<{before_ms:number}>('SELECT before_ms FROM room_earnings_fence WHERE singleton=1').one().before_ms,
      wins:this.ctx.storage.sql.exec('SELECT * FROM room_earnings_wins ORDER BY won_at,event_id').toArray()};
  }
  fixtureSeed(at:number,count:number){
    for(let i=0;i<count;i++)super.recordEarningsWinWithoutPayout(`seed-${String(i).padStart(4,'0')}`,at);
  }
  override recordEarningsWinWithoutPayout(id:string,at:number){
    const mode=this.ctx.storage.sql.exec<{mode:string}>('SELECT mode FROM fixture_fault WHERE singleton=1').one().mode;
    if(mode==='fail-before')throw new Error('Injected win publish failure');
    if(mode==='hold-before'){
      this.heldWin=true;
      return new Promise<ReturnType<BaseEconomy['recordEarningsWinWithoutPayout']>>((resolve,reject)=>{
        this.releaseWin=()=>{this.heldWin=false;this.releaseWin=null;try{resolve(super.recordEarningsWinWithoutPayout(id,at));}catch(error){reject(error);}};
      }) as unknown as ReturnType<BaseEconomy['recordEarningsWinWithoutPayout']>;
    }
    const result=super.recordEarningsWinWithoutPayout(id,at);
    if(mode==='fail-after')throw new Error('Injected lost publish reply');
    return result;
  }
  override earningsHistory(from:number,to:number,cursor?:RoomEventCursor){
    this.historyCalls++;
    if(cursor&&this.failSecondPage)throw new Error('Injected history page failure');
    if(this.holdHistory){
      this.holdHistory=false;this.heldHistory=true;
      return new Promise<ReturnType<BaseEconomy['earningsHistory']>>((resolve,reject)=>{this.releaseHistory=()=>{
        this.heldHistory=false;this.releaseHistory=null;try{resolve(super.earningsHistory(from,to,cursor));}catch(error){reject(error);}
      };}) as unknown as ReturnType<BaseEconomy['earningsHistory']>;
    }
    return super.earningsHistory(from,to,cursor);
  }
}

type Env={ROOMS:DurableObjectNamespace<GameRoom>;ECONOMIES:DurableObjectNamespace<RoomEconomy>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(new URL(request.url).pathname==='/health')return new Response('ok');
    const input=await request.json() as {op:string;room:string;id?:string;at?:number;from?:number;to?:number;count?:number;mode?:string;other?:string;fail?:boolean};
    const room=env.ROOMS.get(env.ROOMS.idFromName(input.room));
    const economy=env.ECONOMIES.get(env.ECONOMIES.idFromName(input.room));
    try{
      switch(input.op){
        case 'journal':await room.fixtureJournal(input.room,input.id!,input.at!);return Response.json({ok:true});
        case 'record':await room.fixtureRecordWin(input.room,input.at);return Response.json({ok:true});
        case 'pending':return Response.json(await room.fixturePending());
        case 'mode':await economy.fixtureMode(input.mode!);return Response.json({ok:true});
        case 'state':return Response.json(await economy.fixtureState());
        case 'seed':await economy.fixtureSeed(input.at!,input.count!);return Response.json({ok:true});
        case 'hold-history':await economy.fixtureHoldHistory();return Response.json({ok:true});
        case 'fail-second-page':await economy.fixtureFailSecondPage(!!input.fail);return Response.json({ok:true});
        case 'release-history':await economy.fixtureReleaseHistory();return Response.json({ok:true});
        case 'release-win':await economy.fixtureReleaseWin();return Response.json({ok:true});
        case 'history':return Response.json(await room.cabEarningsHistory(input.other??input.room,input.from!,input.to!));
        default:return new Response('Not found',{status:404});
      }
    }catch(error){return new Response(error instanceof Error?error.message:String(error),{status:409});}
  },
};
