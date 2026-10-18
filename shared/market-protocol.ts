/** Public market views contain no private wallet or recovery identifiers. */
export type MarketKind = 'property'|'cosmetic'|'collectible';
export type MarketPaint = {assetId:string;catalogId:string};
export type MarketAssetView = {
  assetId:string; kind:MarketKind; name:string; description:string;
  listingId:string|null; equipped?:boolean; completedHome?:boolean;
  listing?:{listingId:string;revision:number;price:number};
};
export type MarketListingView = {
  listingId:string; assetId:string; revision:number; price:number; sellerName:string; mine:boolean;
  kind:MarketKind; name:string; description:string; completedHome?:boolean;
};
export type MarketShopView = {catalogId:string; kind:MarketKind; name:string; description:string; price:number};

type Request = {type:'market';requestId:number};
type Operation = Request & {operationId:string};
export type MarketRequest =
  | (Request & {action:'browse';cursor?:string;ownedCursor?:string})
  | (Request & {action:'status';operationId:string})
  | (Operation & {action:'acquire';catalogId:string})
  | (Operation & {action:'equip'|'unequip';assetId:string})
  | (Operation & {action:'list';assetId:string;price:number})
  | (Operation & {action:'reprice';assetId:string;listingId:string;expectedRevision:number;price:number})
  | (Operation & {action:'cancel'|'buy';assetId:string;listingId:string;expectedRevision:number});
export type MarketOperationAction = Exclude<MarketRequest['action'],'browse'|'status'>;
export type MarketState = {
  type:'marketState'; requestId:number; listings:MarketListingView[]; owned:MarketAssetView[];
  shop:MarketShopView[]; nextCursor?:string; nextOwnedCursor?:string;
};
export type MarketResultView = {type:'marketResult';requestId:number;operationId:string} & (
  | {status:'not-found';action:null}
  | {status:'pending'|'completed'|'rejected';action:MarketOperationAction;reason?:string}
);
