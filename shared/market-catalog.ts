/**
 * Starter market items. Prices are game-cash prices for a new item, not resale
 * floors. Supply is open: each purchase creates a separate server-minted item.
 * These are distinct from the workshop's existing per-vehicle finishes.
 */
export const MARKET_CATALOG = [
  {
    id:'sunrise-gold-paint', kind:'cosmetic', category:'paint',
    name:'Sunrise Gold', description:'A warm gold finish for a personal vehicle.',
    price:2_000, color:0xe0aa34,
  },
  {
    id:'pacific-blue-paint', kind:'cosmetic', category:'paint',
    name:'Pacific Blue', description:'A deep blue finish for a personal vehicle.',
    price:2_000, color:0x236b9d,
  },
  {
    id:'bay-bridge-postcard', kind:'collectible', category:'keepsake',
    name:'Bay Bridge Postcard', description:'A postcard celebrating the bridge across the Bay.',
    price:5_000,
  },
  {
    id:'launch-day-patch', kind:'collectible', category:'keepsake',
    name:'Launch Day Patch', description:'A commemorative patch for a spaceport launch.',
    price:5_000,
  },
] as const;

export type MarketCatalogEntry = typeof MARKET_CATALOG[number];
export type MarketCatalogId = MarketCatalogEntry['id'];
export type MarketItemKind = MarketCatalogEntry['kind'];
export type MarketPaintId = Extract<MarketCatalogEntry,{kind:'cosmetic'}>['id'];

/** The registry owns custody and ownership; a catalog ID identifies only a design. */
export type MarketInventoryItem = { id:string; catalogId:MarketCatalogId };

export function marketCatalogItem(id:unknown):MarketCatalogEntry|null {
  return typeof id==='string'?MARKET_CATALOG.find(item=>item.id===id)??null:null;
}

/** Resolve only an allowlisted cosmetic; collectibles never supply paint. */
export function marketPaintColor(id:unknown):number|null {
  const item=marketCatalogItem(id);return item?.kind==='cosmetic'?item.color:null;
}

/** Checks record shape only. It does not establish ownership or authorize a transaction. */
export function isMarketInventoryItem(value:unknown):value is MarketInventoryItem {
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  const item=value as Record<string,unknown>;
  return Object.hasOwn(item,'id') && Object.hasOwn(item,'catalogId') && typeof item.id==='string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.id) &&
    marketCatalogItem(item.catalogId)!==null;
}
