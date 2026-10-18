// Test-only Worker. None of its HTTP controls are exposed by the deployed app.
import { DurableObject } from 'cloudflare:workers';
import { IncomeJournal, type IncomeCredit, type IncomeSnapshot } from '../../worker/income-journal';
import { Starship } from '../../worker/starship';

export { Starship };
type Env = { WALLETS:DurableObjectNamespace<IncomeWallet>; RELAY:DurableObjectNamespace<FaultRelay>; STARSHIP:DurableObjectNamespace<Starship> };
type RelayConfig = { before:number; after:number; hold:boolean; calls:number; held:boolean };
const initialRelay = ():RelayConfig => ({before:0,after:0,hold:false,calls:0,held:false});

export class FaultRelay extends DurableObject<Env> {
  private releaseHold:(()=>void)|null=null;

  async configure(change:Partial<Pick<RelayConfig,'before'|'after'|'hold'>>):Promise<void> {
    const current=await this.ctx.storage.get<RelayConfig>('control')??initialRelay();
    await this.ctx.storage.put('control',{...current,...change});
  }

  async status():Promise<RelayConfig> { return await this.ctx.storage.get<RelayConfig>('control')??initialRelay(); }

  async release():Promise<void> {
    const resume=this.releaseHold;
    this.releaseHold=null;
    if(resume)resume();
  }

  async reconcile(snapshot:IncomeSnapshot):Promise<unknown> {
    const action=await this.ctx.storage.transaction(async txn=>{
      const current=await txn.get<RelayConfig>('control')??initialRelay();
      const action={before:current.before>0,after:current.after>0,hold:current.hold};
      await txn.put('control',{...current,calls:current.calls+1,before:Math.max(0,current.before-1),
        after:action.before?current.after:Math.max(0,current.after-1),hold:false,held:action.hold});
      return action;
    });
    if(action.hold){
      await new Promise<void>(resolve=>{this.releaseHold=resolve;});
      const current=await this.status();
      await this.ctx.storage.put('control',{...current,held:false});
    }
    if(action.before) throw new Error('Injected failure before global reconciliation');
    const result=await this.env.STARSHIP.get(this.env.STARSHIP.idFromName('global')).reconcile(snapshot);
    if(action.after) throw new Error('Injected lost response after global reconciliation');
    return result;
  }
}

export class IncomeWallet extends DurableObject<Env> {
  private readonly journal:IncomeJournal;
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS wallet (singleton INTEGER PRIMARY KEY CHECK (singleton=1), balance INTEGER NOT NULL, updates INTEGER NOT NULL); INSERT OR IGNORE INTO wallet VALUES (1,0,0);');
    this.journal=new IncomeJournal(ctx.storage,750);
  }

  async credit(input:IncomeCredit,fail:boolean):Promise<unknown> {
    return this.journal.credit(input,(sql,kv)=>{
      sql.exec('UPDATE wallet SET balance=balance+?,updates=updates+1 WHERE singleton=1',input.amount);
      const driver=kv.get<{cash:number;revision:number}>('driver')??{cash:0,revision:0};
      kv.put('driver',{cash:driver.cash+input.amount,revision:driver.revision+1});
      if(fail)throw new Error('Injected failure after receipt, alarm and wallet mutation');
    });
  }

  async inspect():Promise<unknown> {
    const wallet=this.ctx.storage.sql.exec<{balance:number;updates:number}>('SELECT balance,updates FROM wallet WHERE singleton=1').one();
    return {...wallet,driver:this.ctx.storage.kv.get('driver')??null,journal:this.journal.state(),alarm:await this.ctx.storage.getAlarm()};
  }

  async drain():Promise<unknown> {
    return this.journal.reconcile(snapshot=>this.env.RELAY.get(this.env.RELAY.idFromName('global')).reconcile(snapshot));
  }

  async external(delay:number):Promise<void> {
    await this.ctx.storage.transaction(async txn=>{
      const due=Date.now()+delay;
      await txn.put('externalDue',due);
      const alarm=await txn.getAlarm();
      if(alarm===null||alarm>due)await txn.setAlarm(due);
    });
  }

  async externalStatus():Promise<{due:number|null;fired:number;alarm:number|null}> {
    return {due:await this.ctx.storage.get<number>('externalDue')??null,
      fired:await this.ctx.storage.get<number>('externalFired')??0,alarm:await this.ctx.storage.getAlarm()};
  }

  async alarm():Promise<void> {
    await this.ctx.storage.transaction(async txn=>{
      const due=await txn.get<number>('externalDue');
      if(due!==undefined&&due<=Date.now()){
        const fired=await txn.get<number>('externalFired')??0;
        await txn.put('externalFired',fired+1);await txn.delete('externalDue');
      }
    });
    await this.drain();
    // Shared-alarm owner restores any later unrelated deadline after an early wakeup.
    await this.ctx.storage.transaction(async txn=>{
      const due=await txn.get<number>('externalDue'),alarm=await txn.getAlarm();
      if(due!==undefined&&(alarm===null||alarm>due))await txn.setAlarm(due);
    });
  }
}

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url),driver=url.searchParams.get('driver');
    const relay=env.RELAY.get(env.RELAY.idFromName('global'));
    try{
      if(url.pathname==='/health')return Response.json({ok:true});
      if(url.pathname==='/relay/config'&&request.method==='POST'){
        await relay.configure(await request.json() as Partial<Pick<RelayConfig,'before'|'after'|'hold'>>);
        return Response.json({ok:true});
      }
      if(url.pathname==='/relay/status')return Response.json(await relay.status());
      if(url.pathname==='/relay/release'&&request.method==='POST'){await relay.release();return Response.json({ok:true});}
      if(url.pathname==='/global')return Response.json(await env.STARSHIP.get(env.STARSHIP.idFromName('global')).status(driver??undefined));
      if(!driver || !/^[a-zA-Z0-9-]{1,128}$/.test(driver))return new Response('Invalid test identity',{status:400});
      const wallet=env.WALLETS.get(env.WALLETS.idFromName(driver));
      if(url.pathname==='/credit'&&request.method==='POST'){
        const input=await request.json() as IncomeCredit;
        if(input.driverId!==driver)return new Response('Identity mismatch',{status:400});
        return Response.json(await wallet.credit(input,url.searchParams.has('fail')));
      }
      if(url.pathname==='/wallet')return Response.json(await wallet.inspect());
      if(url.pathname==='/drain'&&request.method==='POST')return Response.json(await wallet.drain());
      if(url.pathname==='/external'&&request.method==='POST'){
        const {delay}=await request.json() as {delay:number};
        await wallet.external(delay);return Response.json({ok:true});
      }
      if(url.pathname==='/external')return Response.json(await wallet.externalStatus());
      return new Response('Not found',{status:404});
    }catch(error){return new Response(String(error),{status:400});}
  }
} satisfies ExportedHandler<Env>;
