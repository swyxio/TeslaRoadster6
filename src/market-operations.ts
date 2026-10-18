import type { MarketAction } from './market-ui';

type StoragePort = Pick<Storage, 'getItem'|'setItem'|'removeItem'>;
export type PendingMarketOperation = {version:1;owner:string;operationId:string;command:MarketAction};
export type MarketJournal = {state:'ready';operation:PendingMarketOperation|null}|{state:'unavailable'|'corrupt';operation:null};
const prefix='poly-av-market-operation:';
const key=(owner:string)=>prefix+owner;
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128;
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const price=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** Stored commands are untrusted browser data; the server independently authenticates and validates them. */
function validCommand(value:unknown):value is MarketAction {
  if(!value||typeof value!=='object')return false;
  const command=value as Record<string,unknown>;
  switch(command.action){
    case 'acquire':return text(command.catalogId);
    case 'equip':case 'unequip':return text(command.assetId);
    case 'list':return text(command.assetId)&&price(command.price);
    case 'reprice':return text(command.assetId)&&text(command.listingId)&&positive(command.expectedRevision)&&price(command.price);
    case 'cancel':case 'buy':return text(command.assetId)&&text(command.listingId)&&positive(command.expectedRevision);
    default:return false;
  }
}

/** One outstanding operation per public driver ID. No recovery credential is stored. */
export function readMarketOperation(storage:StoragePort|null,owner:string):MarketJournal {
  try{
    if(!storage||!text(owner))return {state:'unavailable',operation:null};
    const raw=storage.getItem(key(owner));if(raw===null)return {state:'ready',operation:null};
    const value=JSON.parse(raw) as PendingMarketOperation;
    if(!value||value.version!==1||value.owner!==owner||!text(value.operationId)||!validCommand(value.command))return {state:'corrupt',operation:null};
    return {state:'ready',operation:value};
  }catch{return {state:'unavailable',operation:null};}
}

/** Persist and read back before sending so a lost response can use the same operation ID. */
export function stageMarketOperation(storage:StoragePort|null,owner:string,operationId:string,command:MarketAction):MarketJournal {
  const current=readMarketOperation(storage,owner);
  if(current.state!=='ready'||current.operation)return current;
  if(!storage||!text(operationId)||!validCommand(command))return {state:'corrupt',operation:null};
  const operation:PendingMarketOperation={version:1,owner,operationId,command};
  const raw=JSON.stringify(operation);
  try{
    storage.setItem(key(owner),raw);
    if(storage.getItem(key(owner))!==raw)return {state:'unavailable',operation:null};
    return {state:'ready',operation};
  }catch{return {state:'unavailable',operation:null};}
}

/** Remove only the confirmed operation; a failed removal remains safe to retry. */
export function clearMarketOperation(storage:StoragePort|null,owner:string,operationId:string):boolean {
  const current=readMarketOperation(storage,owner);
  if(!storage||current.state!=='ready'||current.operation?.operationId!==operationId)return false;
  try{storage.removeItem(key(owner));return storage.getItem(key(owner))===null;}catch{return false;}
}
