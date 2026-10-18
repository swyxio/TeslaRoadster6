// Production Worker, Durable Objects and WebSockets in local Wrangler.
// pnpm exec tsx tests/market-room.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NEUTRAL, PROTOCOL_VERSION, ROOM_NO_SPAWN_CODE, type World } from '../shared/game';
import { propertyRoom, PROPERTY_HOME_SITE } from '../shared/property';
import type { MarketRequest, MarketResultView, MarketState } from '../shared/market-protocol';
import type { DriverProgress } from '../worker/driver-profile';
import { RoomInputClient } from './room-input-client';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await delay(40);}
  throw new Error(`Timed out: ${label}`);
}
async function freePort(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
}
async function crash(child:ChildProcess){
  process.kill(-child.pid!,'SIGKILL');
  await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler process killed',10_000);
}
const dir=await mkdtemp(join(tmpdir(),'tesland-market-room-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-market-room-test',main:resolve('tests/fixtures/market-room-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__market-test/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},
    {name:'MARKET',class_name:'MarketService'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent','MarketService']}],
}));
let logs='',child:ChildProcess|undefined,requestId=10;
const sockets:WebSocket[]=[];
function start(){
  const current=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-30_000);};
  current.stdout?.on('data',append);current.stderr?.on('data',append);return current;
}
async function ready(){
  await until(async()=>{
    if(child?.exitCode!==null)throw new Error(`Wrangler exited:\n${logs}`);
    try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
  },'Wrangler startup',30_000);
}
async function rpc<T>(group:'wallet'|'market',method:string,body:object):Promise<T>{
  const response=await fetch(`${base}/__${group}-test/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5_000)});
  if(!response.ok)throw new Error(`Fixture ${group}/${method}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
function connect(path:string,guest=false){
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[],input=new RoomInputClient(socket);
  let closed:{code:number;reason:string}|undefined;sockets.push(socket);
  socket.addEventListener('close',event=>{closed={code:event.code,reason:event.reason};});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;input.observe(message);messages.push(message);
    if(guest&&message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
  });
  return {socket,input,messages,get closed(){return closed;},last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
type Client=ReturnType<typeof connect>;
function send(client:Client,message:object){client.socket.send(JSON.stringify(message));}
function world(client:Client):World{return client.last('state')!.world;}
async function savedCode(name:string){
  const chat=connect('/api/chat');await until(()=>chat.socket.readyState===WebSocket.OPEN,'chat opens');
  send(chat,{type:'hello',name});await until(()=>!!chat.last('ready'),'chat identity');
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),'recovery code');
  const code=chat.last('recovery')!.code as string;chat.socket.close();
  await until(()=>chat.socket.readyState===WebSocket.CLOSED,'chat closes');return code;
}
async function makeDriver(name:string,cash:number){
  const driverId=randomUUID(),code=await savedCode(name);
  const associated=await rpc<{walletId:string}>('wallet','associate',{driverId,code});assert.equal(associated.walletId,driverId);
  await rpc('wallet','acquire',{driverId,fence:randomUUID()});await rpc('wallet','fund',{driverId,seedCash:cash});
  return {driverId,code,name};
}
async function joinSaved(room:string,driver:{code:string;name:string},expectedCash?:number){
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('wallet'),`${driver.name} room welcome`);
  assert.equal(client.last('welcome')!.version,PROTOCOL_VERSION);
  send(client,{type:'identity',code:driver.code,requestId:1});
  await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.requestId===1),`${driver.name} saved identity`);
  assert.equal(client.messages.find(message=>message.type==='identityResult'&&message.requestId===1)!.ok,true);
  await until(()=>client.input.active&&(expectedCash===undefined||client.messages.some(message=>message.type==='wallet'&&message.cash===expectedCash)),`${driver.name} saved wallet`);
  send(client,{type:'name',name:driver.name});const id=client.last('welcome')!.id;
  await until(()=>world(client).players.some(player=>player.id===id&&player.name===driver.name),`${driver.name} player name`);
  return client;
}
async function joinGuest(room:string){
  const client=connect(`/api/room/${room}`,true);
  await until(()=>client.input.active&&!!client.last('state'),'guest room');return client;
}
async function closedRoom(room:string,expectedCode:number){
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.closed,`room ${room} closes`);
  assert.equal(client.closed!.code,expectedCode,client.closed!.reason);
  assert.ok(!client.last('welcome'),'closed property does not admit a visitor');
}
const inspect=(driverId:string)=>rpc<{progress:DriverProgress}>('wallet','inspect',{driverId});
async function sync(client:Client){
  const token=++requestId;send(client,{type:'sync',token});
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===token),'wallet sync barrier');
}
async function message<T extends MarketState|MarketResultView>(client:Client,command:{action:MarketRequest['action']} & Record<string,unknown>):Promise<T>{
  const id=++requestId;send(client,{type:'market',requestId:id,...command});
  await until(()=>client.messages.some(item=>(item.type==='marketState'||item.type==='marketResult')&&item.requestId===id),`market ${command.action} reply`);
  return client.messages.find(item=>(item.type==='marketState'||item.type==='marketResult')&&item.requestId===id) as T;
}
async function browse(client:Client){return message<MarketState>(client,{action:'browse'});}
async function settle(client:Client,command:Record<string,unknown>&{action:MarketRequest['action'];operationId:string}){
  let result=await message<MarketResultView>(client,command);
  const end=Date.now()+30_000;
  while(result.status==='pending'&&Date.now()<end){await delay(250);result=await message<MarketResultView>(client,{action:'status',operationId:command.operationId});}
  assert.notEqual(result.status,'pending',`market ${command.action} did not settle`);return result;
}
function completed(result:MarketResultView){assert.equal(result.status,'completed',JSON.stringify(result));}

try{
  child=start();await ready();
  const seller=await makeDriver('Seller',4_000_000),buyer=await makeDriver('Buyer',4_000_000),limited=await makeDriver('Limited',1_500_000);
  let sellerClient=await joinSaved('market-seller',seller,4_000_000),buyerClient=await joinSaved('market-buyer',buyer,4_000_000);
  const limitedClient=await joinSaved('market-limited',limited,1_500_000);
  const guest=await joinGuest('market-guest');
  const guestResult=await settle(guest,{action:'acquire',operationId:randomUUID(),catalogId:'starter-home'});
  assert.equal(guestResult.status,'rejected');assert.equal(guestResult.reason,'save-driver');

  // A fully blocked resume disconnects the held buyer rather than trapping
  // either wallet in the sale; the durable result survives a fresh room.
  const blockedSeller=await makeDriver('BlockedSeller',300_000),blockedBuyer=await makeDriver('BlockedBuyer',10_000);
  const blockedSellerClient=await joinSaved('market-blocked-seller',blockedSeller,300_000);
  const blockedBuyerClient=await joinSaved('market-blocked-buyer',blockedBuyer,10_000);
  completed(await settle(blockedSellerClient,{action:'acquire',operationId:randomUUID(),catalogId:'sunrise-gold-paint'}));
  const blockedAsset=(await browse(blockedSellerClient)).owned.find(item=>item.name==='Sunrise Gold');assert.ok(blockedAsset);
  completed(await settle(blockedSellerClient,{action:'list',operationId:randomUUID(),assetId:blockedAsset.assetId,price:2_000}));
  const blockedListing=(await browse(blockedBuyerClient)).listings.find(item=>item.assetId===blockedAsset.assetId);assert.ok(blockedListing);
  const blockedSellerCash=(await inspect(blockedSeller.driverId)).progress.cash,blockedBuyerCash=(await inspect(blockedBuyer.driverId)).progress.cash;
  await rpc('market','block-resume',{room:'market-blocked-buyer'});
  const blockedOp=randomUUID();send(blockedBuyerClient,{type:'market',requestId:++requestId,action:'buy',operationId:blockedOp,assetId:blockedAsset.assetId,listingId:blockedListing.listingId,expectedRevision:blockedListing.revision});
  await until(()=>!!blockedBuyerClient.closed,'blocked market buyer disconnects',30_000);
  assert.equal(blockedBuyerClient.closed!.code,ROOM_NO_SPAWN_CODE);
  await until(async()=>(await rpc<MarketResultView>('market','status',{driverId:blockedBuyer.driverId,operationId:blockedOp})).status==='completed','blocked sale finishes',30_000);
  assert.equal((await inspect(blockedBuyer.driverId)).progress.cash,blockedBuyerCash-2_000);
  assert.equal((await inspect(blockedSeller.driverId)).progress.cash,blockedSellerCash+1_900);
  const blockedRejoined=await joinSaved('market-blocked-recovery',blockedBuyer,blockedBuyerCash-2_000);
  assert.equal((await browse(blockedRejoined)).owned.filter(item=>item.assetId===blockedAsset.assetId).length,1);
  completed(await settle(blockedRejoined,{action:'status',operationId:blockedOp}));
  assert.ok(!(await browse(blockedSellerClient)).owned.some(item=>item.assetId===blockedAsset.assetId));
  blockedRejoined.socket.close();blockedSellerClient.socket.close();

  await delay(600);await sync(sellerClient);await sync(buyerClient);await sync(limitedClient);
  const sellerStart=(await inspect(seller.driverId)).progress,buyerStart=(await inspect(buyer.driverId)).progress;
  assert.ok(sellerStart.cash>=4_000_000);assert.ok(buyerStart.cash>=4_000_000);

  // Acquire the same operation twice: the server mints exactly one home.
  const shop=await browse(sellerClient);assert.equal(shop.shop.find(item=>item.catalogId==='starter-home')?.price,1_000_000);
  const limitedStart=(await inspect(limited.driverId)).progress;
  const gated=await settle(limitedClient,{action:'acquire',operationId:randomUUID(),catalogId:'starter-home'});
  assert.equal(gated.status,'rejected');assert.equal(gated.reason,'property-gate');
  assert.equal((await inspect(limited.driverId)).progress.cash,limitedStart.cash);

  // The profile calls back into the room during release. Dropping below the
  // Oakland access threshold forces that room to commit a reroute through the
  // very same profile before the market may report success.
  const downgrade=await makeDriver('Downgrade',20_001);
  await rpc('market','restricted-order',{driverId:downgrade.driverId});
  const downgradeClient=await joinSaved('market-downgrade',downgrade,20_001);
  const downgradeStart=(await inspect(downgrade.driverId)).progress;
  assert.equal(downgradeStart.order.customer,4);
  assert.ok(downgradeStart.cash>=20_000&&downgradeStart.cash<22_000,'purchase crosses the level boundary');
  const downgradeOp=randomUUID();
  completed(await settle(downgradeClient,{action:'acquire',operationId:downgradeOp,catalogId:'pacific-blue-paint'}));
  const downgraded=(await inspect(downgrade.driverId)).progress;
  assert.equal(downgraded.cash,downgradeStart.cash-12_000);assert.equal(downgraded.level,0);
  assert.equal(downgraded.order.stage,'dropoff');assert.notEqual(downgraded.order.customer,4);
  const refreshed=downgradeClient.messages.findIndex(message=>message.type==='wallet'&&message.cash===downgraded.cash);
  const reported=downgradeClient.messages.findIndex(message=>message.type==='marketResult'&&message.operationId===downgradeOp&&message.status==='completed');
  assert.ok(refreshed>=0&&reported>refreshed,'refreshed wallet precedes transaction completion');
  downgradeClient.socket.close();

  const acquireId=randomUUID(),acquire={action:'acquire' as const,operationId:acquireId,catalogId:'starter-home'};
  completed(await settle(sellerClient,acquire));completed(await settle(sellerClient,acquire));
  const conflict=await settle(sellerClient,{...acquire,catalogId:'sunrise-gold-paint'});
  assert.equal(conflict.status,'rejected');assert.equal(conflict.reason,'operation-conflict');
  const owned=await browse(sellerClient),homes=owned.owned.filter(item=>item.kind==='property');
  assert.equal(homes.length,1);assert.equal(homes[0].completedHome,true);
  const assetId=homes[0].assetId,slug=propertyRoom(assetId);assert.ok(slug);
  const sellerAfterAcquire=(await inspect(seller.driverId)).progress;
  assert.equal(sellerAfterAcquire.cash,sellerStart.cash-1_000_000);assert.equal(sellerAfterAcquire.eligibleIncome,sellerStart.eligibleIncome);
  const duplicate=await settle(sellerClient,{action:'acquire',operationId:randomUUID(),catalogId:'starter-home'});
  assert.equal(duplicate.status,'rejected');assert.equal(duplicate.reason,'home-slot-occupied');

  // Property URLs address the asset, not the current owner's wallet.
  const ordinary=await joinGuest('p-joe');assert.equal(world(ordinary).property,null);
  const shortOrdinary=await joinGuest('p-0');assert.equal(world(shortOrdinary).property,null);shortOrdinary.socket.close();
  await closedRoom(propertyRoom(randomUUID())!,1008);
  let visitor=await joinGuest(slug);await until(()=>world(visitor).property?.assetId===assetId,'property marker');
  assert.equal(world(visitor).property!.ownerName,'Seller');
  const playerId=visitor.last('welcome')!.id,player=world(visitor).players.find(item=>item.id===playerId)!;
  const entity=world(visitor).entities.find(item=>item.id===player.entityId)!;
  assert.ok(Math.hypot(entity.x-PROPERTY_HOME_SITE.x,entity.z-PROPERTY_HOME_SITE.z)<40,'visitor arrives near home');

  const listingOp={action:'list' as const,operationId:randomUUID(),assetId,price:500_000};
  completed(await settle(sellerClient,listingOp));completed(await settle(sellerClient,listingOp));
  const listing=(await browse(buyerClient)).listings.find(item=>item.assetId===assetId);assert.ok(listing);
  assert.equal(listing.sellerName,'Seller');assert.equal(listing.price,500_000);
  const stale=await settle(buyerClient,{action:'buy',operationId:randomUUID(),assetId,listingId:listing.listingId,expectedRevision:listing.revision+1});
  assert.equal(stale.status,'rejected');

  // Hold the reply after the buyer's wallet durably commits. The property
  // must fail closed while custody is unresolved; a retry must not debit twice.
  await rpc('market','arm',{driverId:buyer.driverId});
  const buyOp={action:'buy' as const,operationId:randomUUID(),assetId,listingId:listing.listingId,expectedRevision:listing.revision};
  const buyRequestId=++requestId;send(buyerClient,{type:'market',requestId:buyRequestId,...buyOp});
  await until(async()=>(await rpc<{held:boolean}>('market','state',{driverId:buyer.driverId})).held,'wallet apply reply held',30_000);
  const applied=(await inspect(buyer.driverId)).progress;
  assert.equal(applied.cash,buyerStart.cash-500_000);
  await closedRoom(slug,1011);
  const beforeTick=guest.input.tick,seq=guest.input.send({...NEUTRAL,steer:1});
  await until(()=>guest.input.tick>=beforeTick+4&&(guest.input.control?.appliedSeq??0)>=seq,'unrelated room continues during market hold');
  // Crash the entire Worker with the wallet reply still held. Its persisted
  // transaction and alarm must complete the same sale after restart.
  await crash(child);child=start();await ready();
  await until(async()=>{
    const result=await rpc<MarketResultView>('market','status',{driverId:buyer.driverId,operationId:buyOp.operationId});
    if(result.status==='rejected')throw new Error(`Recovery rejected sale: ${JSON.stringify(result)}`);
    return result.status==='completed';
  },'market recovers interrupted sale',45_000);
  sellerClient=await joinSaved('market-seller-recovery',seller,sellerStart.cash-1_000_000+475_000);
  buyerClient=await joinSaved('market-reconnect',buyer,buyerStart.cash-500_000);
  visitor=await joinGuest(slug);
  assert.equal(world(visitor).property?.assetId,assetId);assert.equal(world(visitor).property?.ownerName,'Buyer');
  completed(await settle(buyerClient,{action:'status',operationId:buyOp.operationId}));
  completed(await settle(buyerClient,buyOp));
  const buyerOwned=await browse(buyerClient),sellerOwned=await browse(sellerClient);
  assert.equal(buyerOwned.owned.filter(item=>item.assetId===assetId).length,1);
  assert.ok(!sellerOwned.owned.some(item=>item.assetId===assetId));assert.ok(!buyerOwned.listings.some(item=>item.assetId===assetId));
  await sync(sellerClient);await sync(buyerClient);
  const sellerAfter=(await inspect(seller.driverId)).progress,buyerAfter=(await inspect(buyer.driverId)).progress;
  assert.equal(sellerAfter.cash,sellerStart.cash-1_000_000+475_000);
  assert.equal(buyerAfter.cash,buyerStart.cash-500_000);
  assert.equal(sellerAfter.eligibleIncome,sellerStart.eligibleIncome);assert.equal(buyerAfter.eligibleIncome,buyerStart.eligibleIncome);
  const sellerSeq=sellerClient.input.send({...NEUTRAL,steer:1});
  await until(()=>(sellerClient.input.control?.appliedSeq??0)>=sellerSeq,'seller control resumes after sale');
  const buyerAtHome=await joinSaved(slug,buyer,buyerAfter.cash);
  assert.equal(world(buyerAtHome).property?.assetId,assetId);assert.equal(world(buyerAtHome).property?.ownerName,'Buyer');

  // Restart Wrangler with the same persistent storage and recover the sale and address.
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
  await stop(child);child=start();await ready();
  sellerClient=await joinSaved('market-seller-restart',seller,sellerAfter.cash);
  buyerClient=await joinSaved(slug,buyer,buyerAfter.cash);
  assert.equal(world(buyerClient).property?.assetId,assetId);assert.equal(world(buyerClient).property?.ownerName,'Buyer');
  completed(await settle(buyerClient,{action:'status',operationId:buyOp.operationId}));
  completed(await settle(buyerClient,buyOp));
  assert.equal((await browse(buyerClient)).owned.filter(item=>item.assetId===assetId).length,1);
  assert.equal((await inspect(buyer.driverId)).progress.cash,buyerAfter.cash);
  assert.equal((await inspect(seller.driverId)).progress.cash,sellerAfter.cash);

  // A purchased finish affects the owned vehicle and remains equipped after a
  // saved-driver handoff. Equipped assets cannot be listed for sale.
  completed(await settle(buyerClient,{action:'acquire',operationId:randomUUID(),catalogId:'sunrise-gold-paint'}));
  const paint=(await browse(buyerClient)).owned.find(item=>item.kind==='cosmetic'&&item.name==='Sunrise Gold');assert.ok(paint);
  completed(await settle(buyerClient,{action:'equip',operationId:randomUUID(),assetId:paint.assetId}));
  const painted=(client:Client)=>{
    const player=world(client).players.find(item=>item.id===client.last('welcome')!.id);
    return world(client).entities.find(item=>item.id===player?.entityId)?.marketPaint==='sunrise-gold-paint';
  };
  await until(()=>painted(buyerClient),'equipped finish appears on vehicle');
  const equippedListing=await settle(buyerClient,{action:'list',operationId:randomUUID(),assetId:paint.assetId,price:2_000});
  assert.equal(equippedListing.status,'rejected');assert.equal(equippedListing.reason,'equipped');
  buyerClient=await joinSaved('market-paint-reconnect',buyer);
  await until(()=>painted(buyerClient),'equipped finish survives handoff');
  assert.equal((await browse(buyerClient)).owned.find(item=>item.assetId===paint.assetId)?.equipped,true);

  // A connected visitor sees a later sale on the same property address.
  visitor=await joinGuest(slug);
  const resale={action:'list' as const,operationId:randomUUID(),assetId,price:250_000};
  completed(await settle(buyerClient,resale));
  const secondListing=(await browse(sellerClient)).listings.find(item=>item.assetId===assetId);assert.ok(secondListing);
  completed(await settle(sellerClient,{action:'buy',operationId:randomUUID(),assetId,listingId:secondListing.listingId,expectedRevision:secondListing.revision}));
  await until(()=>world(visitor).property?.ownerName==='Seller','existing visitor sees property resale',20_000);
  assert.equal(world(visitor).property?.assetId,assetId);
  assert.equal((await browse(sellerClient)).owned.filter(item=>item.assetId===assetId).length,1);
  console.log('Market room integration passed: saved wallets, replay, custody failure, sale, property visits, restart and equipped paint.');
}catch(error){console.error(error);console.error(`Wrangler logs:\n${logs}`);process.exitCode=1;}
finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
  if(child)await stop(child);await rm(dir,{recursive:true,force:true});
}
