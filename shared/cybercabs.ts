import { PAINTS, initialVehicleStyle, isStyleChoice, type PaintId, type VehicleStyle } from './vehicle-style';

/** The five proposed prices and one-time ownership milestones, in game dollars. */
export const CYBERCAB_PRICES = [25_000, 50_000, 100_000, 200_000, 400_000] as const;
export const CYBERCAB_OWNERSHIP_AWARDS = [5_000, 10_000, 20_000, 40_000, 80_000] as const;

/**
 * Quote the next cab from server-owned state. Award milestones must be stored
 * permanently, even if ownership later falls. Debit, award, ownership, and
 * the claimed milestone must commit together; this function does not commit.
 */
export function quoteCybercabPurchase(ownedCount: number, claimedAwards: readonly number[]) {
  if (!Number.isSafeInteger(ownedCount) || ownedCount < 0 || ownedCount >= CYBERCAB_PRICES.length ||
      !Array.isArray(claimedAwards) || claimedAwards.some(n => !Number.isInteger(n) || n < 1 || n > CYBERCAB_OWNERSHIP_AWARDS.length) ||
      new Set(claimedAwards).size !== claimedAwards.length) return null;
  const ordinal = ownedCount + 1;
  return { ordinal, price: CYBERCAB_PRICES[ownedCount], award: claimedAwards.includes(ordinal) ? 0 : CYBERCAB_OWNERSHIP_AWARDS[ownedCount] };
}

/** One-time milestone for each cab's cumulative gross income. The claim is stored with that cab. */
export function cabRevenueAward(gross:number, claimed:boolean):number|null {
  if(!Number.isSafeInteger(gross)||gross<0||typeof claimed!=='boolean')return null;
  return !claimed&&gross>=20_000?2_000:0;
}

export type CybercabDispatchFleet = { ownerId:string; assetIds:readonly string[] };
export type DispatchedCybercab = { ownerId:string; assetId:string; occupied:boolean };

/**
 * Allocate the room's provisional traffic budget in rounds across owners.
 * Occupied cars stay until their driver releases them; other already-dispatched
 * cars are preferred to avoid unnecessary churn. Retired occupied cars consume
 * `reservedSlots` but have no fleet identity. The caller must settle a cab's
 * final interval before retiring it, and wait for a real free slot before
 * dispatching a replacement. A desired dispatch is not proof of operation.
 *
 * Fleets are in stable room-join order and contain only currently authorized
 * owners and assets. Dispatched entries must refer to those same fleets.
 */
export function planCybercabDispatch(fleets:readonly CybercabDispatchFleet[], dispatched:readonly DispatchedCybercab[], budget:number, reservedSlots=0):{
  retire:DispatchedCybercab[]; dispatch:{ownerId:string;assetId:string}[];
}|null {
  if(!Number.isSafeInteger(budget)||budget<0||!Number.isSafeInteger(reservedSlots)||reservedSlots<0||
    dispatched.length+reservedSlots>budget)return null;
  const owners=new Map<string,readonly string[]>(),assetOwners=new Map<string,string>();
  for(const fleet of fleets){
    if(!fleet.ownerId||owners.has(fleet.ownerId)||!Array.isArray(fleet.assetIds))return null;
    owners.set(fleet.ownerId,fleet.assetIds);
    for(const assetId of fleet.assetIds){
      if(!assetId||assetOwners.has(assetId))return null;
      assetOwners.set(assetId,fleet.ownerId);
    }
  }
  const current=new Map<string,DispatchedCybercab>();
  for(const cab of dispatched){
    if(assetOwners.get(cab.assetId)!==cab.ownerId||current.has(cab.assetId)||typeof cab.occupied!=='boolean')return null;
    current.set(cab.assetId,cab);
  }
  const selected=new Set(dispatched.filter(cab=>cab.occupied).map(cab=>cab.assetId));
  const counts=new Map(fleets.map(fleet=>[fleet.ownerId,fleet.assetIds.filter(assetId=>selected.has(assetId)).length]));
  while(selected.size<budget-reservedSlots){
    let candidate:CybercabDispatchFleet|undefined;
    for(const fleet of fleets){
      if(fleet.assetIds.every(assetId=>selected.has(assetId)))continue;
      if(!candidate||counts.get(fleet.ownerId)!<counts.get(candidate.ownerId)!)candidate=fleet;
    }
    if(!candidate)break;
    const assetId=candidate.assetIds.find(id=>!selected.has(id)&&current.has(id))??candidate.assetIds.find(id=>!selected.has(id))!;
    selected.add(assetId);counts.set(candidate.ownerId,counts.get(candidate.ownerId)!+1);
  }
  return {
    retire:dispatched.filter(cab=>!selected.has(cab.assetId)),
    dispatch:fleets.flatMap(fleet=>fleet.assetIds.filter(assetId=>selected.has(assetId)&&!current.has(assetId))
      .map(assetId=>({ownerId:fleet.ownerId,assetId}))),
  };
}

// Keep the same numerator units as the shared event accrual contract: hourly
// dollars times milliseconds times half-multiplier units. This remainder can
// be carried into event-aware settlement once event history is authoritative.
export const CYBERCAB_HOURLY_RATE = 15_000;
export const CYBERCAB_INCOME_DENOMINATOR = 2 * 60 * 60 * 1000;
export type CybercabIncome = { amount: number; remainder: number };

/** Durable per-asset state; no room entity or client controls this record. */
export type CybercabAsset = { id:string; gross:number; remainder:number; lastEndMs:number; revenueAwarded:boolean; style:VehicleStyle };
export type CybercabFleet = { assets:CybercabAsset[]; claimedOwnershipAwards:number[] };
export type CybercabInterval = { assetId:string; startMs:number; endMs:number; multiplier:1|1.5|2|3 };
export type CybercabMutation =
  | {ok:true;fleet:CybercabFleet;cash:number;eligibleIncome:number}
  | {ok:false;reason:'invalid'|'owned'|'unaffordable'};

export function emptyCybercabFleet():CybercabFleet { return {assets:[],claimedOwnershipAwards:[]}; }

function validFleet(fleet:CybercabFleet):boolean {
  if(!fleet || !Array.isArray(fleet.assets) || !Array.isArray(fleet.claimedOwnershipAwards))return false;
  const claimed=fleet.claimedOwnershipAwards;
  if(claimed.some(n=>!Number.isInteger(n)||n<1||n>CYBERCAB_OWNERSHIP_AWARDS.length)||new Set(claimed).size!==claimed.length)return false;
  const ids=new Set<string>();
  for(const asset of fleet.assets){
    if(!asset || typeof asset.id!=='string' || !asset.id || ids.has(asset.id) ||
      !Number.isSafeInteger(asset.gross) || asset.gross<0 ||
      !Number.isSafeInteger(asset.remainder) || asset.remainder<0 || asset.remainder>=CYBERCAB_INCOME_DENOMINATOR ||
      !Number.isSafeInteger(asset.lastEndMs) || asset.lastEndMs<0 || typeof asset.revenueAwarded!=='boolean' ||
      !asset.style || !isStyleChoice('paint',asset.style.paint) || !isStyleChoice('decal',asset.style.decal))return false;
    ids.add(asset.id);
  }
  return true;
}

function validWallet(cash:number,eligibleIncome:number):boolean {
  return Number.isSafeInteger(cash) && Number.isSafeInteger(eligibleIncome) && eligibleIncome>=0;
}

/** Pure wallet mutation. The caller commits the result with its existing receipt. */
export function purchaseCybercab(fleet:CybercabFleet,cash:number,eligibleIncome:number,assetId:string):CybercabMutation {
  if(!validFleet(fleet)||!validWallet(cash,eligibleIncome)||typeof assetId!=='string'||!assetId)return {ok:false,reason:'invalid'};
  if(fleet.assets.some(asset=>asset.id===assetId))return {ok:false,reason:'owned'};
  const quote=quoteCybercabPurchase(fleet.assets.length,fleet.claimedOwnershipAwards);
  if(!quote)return {ok:false,reason:'invalid'};
  if(cash<quote.price)return {ok:false,reason:'unaffordable'};
  const nextCash=cash-quote.price+quote.award,nextIncome=eligibleIncome+quote.award;
  if(!validWallet(nextCash,nextIncome))return {ok:false,reason:'invalid'};
  return {ok:true,cash:nextCash,eligibleIncome:nextIncome,fleet:{
    assets:[...fleet.assets.map(asset=>({...asset,style:{...asset.style}})),
      {id:assetId,gross:0,remainder:0,lastEndMs:0,revenueAwarded:false,style:initialVehicleStyle()}],
    claimedOwnershipAwards:quote.award?[...fleet.claimedOwnershipAwards,quote.ordinal]:[...fleet.claimedOwnershipAwards],
  }};
}

/** Paint is charged from the server catalog and belongs to the cab's owner. */
export function paintCybercab(fleet:CybercabFleet,cash:number,eligibleIncome:number,assetId:string,paint:PaintId):CybercabMutation {
  if(!validFleet(fleet)||!validWallet(cash,eligibleIncome)||typeof assetId!=='string'||!assetId||!isStyleChoice('paint',paint))return {ok:false,reason:'invalid'};
  const asset=fleet.assets.find(item=>item.id===assetId);
  if(!asset)return {ok:false,reason:'invalid'};
  if(asset.style.paint===paint)return {ok:false,reason:'owned'};
  const price=PAINTS[paint].price;
  if(cash<price)return {ok:false,reason:'unaffordable'};
  return {ok:true,cash:cash-price,eligibleIncome,fleet:{
    assets:fleet.assets.map(item=>({...item,style:{...item.style,...(item.id===assetId?{paint}:{})}})),
    claimedOwnershipAwards:[...fleet.claimedOwnershipAwards],
  }};
}

/**
 * Intervals come only from the authoritative room, after event-history
 * reconciliation. Ordered segments for an asset may be adjacent, but can
 * never overlap its durable watermark or another segment in this batch.
 */
export function settleCybercabIntervals(fleet:CybercabFleet,cash:number,eligibleIncome:number,intervals:readonly CybercabInterval[]):CybercabMutation {
  if(!validFleet(fleet)||!validWallet(cash,eligibleIncome)||!Array.isArray(intervals)||!intervals.length)return {ok:false,reason:'invalid'};
  const next:CybercabFleet={assets:fleet.assets.map(asset=>({...asset,style:{...asset.style}})),claimedOwnershipAwards:[...fleet.claimedOwnershipAwards]};
  const assets=new Map(next.assets.map(asset=>[asset.id,asset]));
  let nextCash=cash,nextIncome=eligibleIncome;
  for(const interval of intervals){
    if(!interval || typeof interval.assetId!=='string' || !Number.isSafeInteger(interval.startMs) ||
      !Number.isSafeInteger(interval.endMs) || interval.startMs<0 || interval.endMs<=interval.startMs)return {ok:false,reason:'invalid'};
    const asset=assets.get(interval.assetId);
    if(!asset || interval.startMs<asset.lastEndMs)return {ok:false,reason:'invalid'};
    const income=settleCybercabIncome(interval.endMs-interval.startMs,interval.multiplier,true,asset.remainder);
    if(!income || !Number.isSafeInteger(asset.gross+income.amount))return {ok:false,reason:'invalid'};
    const gross=asset.gross+income.amount,award=cabRevenueAward(gross,asset.revenueAwarded);
    if(award===null || !validWallet(nextCash+income.amount+award,nextIncome+income.amount+award))return {ok:false,reason:'invalid'};
    nextCash+=income.amount+award;nextIncome+=income.amount+award;
    asset.gross=gross;asset.remainder=income.remainder;asset.lastEndMs=interval.endMs;
    if(award)asset.revenueAwarded=true;
  }
  return {ok:true,fleet:next,cash:nextCash,eligibleIncome:nextIncome};
}

/**
 * Settle one server-measured interval for one operating cab. Persist remainder
 * alongside the credited amount so splitting intervals or reconnecting cannot
 * change the result. Eligibility and elapsed milliseconds must come from the
 * authoritative server, never a client; inactive intervals earn nothing.
 *
 * Inputs and outputs are safe integers. BigInt prevents intermediate overflow;
 * the wallet owner must separately check that adding amount remains safe.
 * Invalid state or unsupported rates return null and must not credit income.
 */
export function settleCybercabIncome(elapsedMs: number, multiplier: number, operating: boolean, remainder: number): CybercabIncome | null {
  const halfRate = multiplier === 1 ? 2 : multiplier === 1.5 ? 3 : multiplier === 2 ? 4 : multiplier === 3 ? 6 : 0;
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || !halfRate || typeof operating !== 'boolean' ||
      !Number.isSafeInteger(remainder) || remainder < 0 || remainder >= CYBERCAB_INCOME_DENOMINATOR) return null;
  if (!operating) return { amount: 0, remainder };
  const units = BigInt(CYBERCAB_HOURLY_RATE) * BigInt(elapsedMs) * BigInt(halfRate) + BigInt(remainder);
  const denominator = BigInt(CYBERCAB_INCOME_DENOMINATOR);
  const amount = units / denominator;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { amount: Number(amount), remainder: Number(units % denominator) };
}
