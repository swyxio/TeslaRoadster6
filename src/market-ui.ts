import './market-ui.css';
import type { MarketAssetView, MarketKind, MarketListingView, MarketRequest, MarketShopView } from '../shared/market-protocol';

type StripTransport<T> = T extends {operationId:string;action:infer A} ? A extends 'status' ? never : Omit<T,'type'|'requestId'|'operationId'> : never;
export type MarketAction = StripTransport<MarketRequest>;
export type MarketView = {
  state:'loading'|'ready'|'unavailable'; message:string; cash:number|null;
  pending:boolean; listings:readonly MarketListingView[]; owned:readonly MarketAssetView[];
  shop:readonly MarketShopView[]; nextCursor?:string; nextOwnedCursor?:string;
};
type Tab='listings'|'owned'|'shop';
type Review={command:MarketAction; title:string; detail:string; quote:string|null};

const currency=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const money=(value:number)=>`${value<0?'−$':'$'}${currency.format(Math.abs(value))}`;
const kindName=(kind:MarketKind)=>kind==='property'?'Property':kind==='cosmetic'?'Cosmetic':'Collectible';
const validPrice=(value:number)=>Number.isSafeInteger(value)&&value>=0;
const proceeds=(price:number)=>Number(BigInt(price)*95n/100n);
const minimumCash=(kind:MarketKind,price:number)=>kind==='property'?Math.max(2_000_000,price):price;
function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',value?:string):HTMLElementTagNameMap[K]{
  const element=document.createElement(tag);element.className=className;
  if(value!==undefined)element.textContent=value;
  return element;
}
function button(label:string,className=''):HTMLButtonElement{const element=el('button',className,label);element.type='button';return element;}
function priceInput(label:string,value?:number,key?:string){
  const wrapper=el('label','market-price-label',label),input=el('input','market-price');
  input.type='number';input.inputMode='numeric';input.min='0';input.step='1';input.max=String(Number.MAX_SAFE_INTEGER);
  input.placeholder='Price in game cash';if(value!==undefined)input.value=String(value);
  if(key)input.dataset.marketPriceKey=key;
  wrapper.append(input);return {wrapper,input};
}

/** Transport and wallet state are supplied by the room; no action is optimistic. */
export function createMarketUI(options:{onAction:(action:MarketAction)=>boolean;onRefresh:()=>void;onMore:()=>void;onMoreOwned:()=>void;onVisit:(assetId:string)=>void;onOpenChange?:(open:boolean)=>void}){
  const dialog=el('dialog','market-dialog');dialog.setAttribute('aria-label','Market');
  const header=el('header','market-header'),heading=el('div');
  heading.append(el('span','market-eyebrow','THE BAY EXCHANGE'),el('h2','','Market'));
  const close=button('✕','market-close');close.setAttribute('aria-label','Close market');header.append(heading,close);
  const intro=el('p','market-intro','Trade owned items and eligible property at a fixed price. Sales have a 5% fee.');
  const wallet=el('p','market-wallet'),status=el('p','market-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const refresh=button('Refresh');refresh.addEventListener('click',options.onRefresh);
  const tabs=el('nav','market-tabs');tabs.setAttribute('aria-label','Market sections');
  const tabButtons:Record<Tab,HTMLButtonElement>={listings:button('Listings'),owned:button('Your items'),shop:button('Shop')};
  for(const [name,control] of Object.entries(tabButtons) as [Tab,HTMLButtonElement][]){control.addEventListener('click',()=>{tab=name;review=null;render();});tabs.append(control);}
  const content=el('div','market-content'),reviewBox=el('section','market-review');reviewBox.setAttribute('aria-label','Confirm market action');
  const reviewTitle=el('strong'),reviewDetail=el('p'),reviewActions=el('div','market-actions');
  const back=button('Back'),confirm=button('Confirm','market-primary');reviewActions.append(back,confirm);reviewBox.append(reviewTitle,reviewDetail,reviewActions);
  dialog.append(header,intro,wallet,status,refresh,tabs,reviewBox,content);
  let tab:Tab='listings',review:Review|null=null;
  let view:MarketView={state:'loading',message:'Loading market…',cash:null,pending:false,listings:[],owned:[],shop:[]};

  const ready=()=>view.state==='ready'&&!view.pending;
  function quote(command:MarketAction):string|null {
    if(command.action==='acquire'){
      const item=view.shop.find(entry=>entry.catalogId===command.catalogId);
      return item&&view.cash!==null&&view.cash>=minimumCash(item.kind,item.price)?JSON.stringify(item):null;
    }
    if(command.action==='buy'){
      const item=view.listings.find(entry=>entry.listingId===command.listingId&&entry.assetId===command.assetId&&entry.revision===command.expectedRevision);
      return item&&view.cash!==null&&view.cash>=minimumCash(item.kind,item.price)?JSON.stringify(item):null;
    }
    if(command.action==='reprice'||command.action==='cancel'){
      const item=view.owned.find(entry=>entry.assetId===command.assetId);
      if(item?.listing?.listingId===command.listingId&&item.listing.revision===command.expectedRevision)return JSON.stringify(item);
      const listing=view.listings.find(entry=>entry.mine&&entry.assetId===command.assetId&&entry.listingId===command.listingId&&entry.revision===command.expectedRevision);
      return listing?JSON.stringify(listing):null;
    }
    const item=view.owned.find(entry=>entry.assetId===command.assetId);
    if(!item||item.listingId||item.equipped&&command.action!=='unequip'||!item.equipped&&command.action==='unequip')return null;
    return JSON.stringify(item);
  }
  function request(command:MarketAction,title:string,detail:string){
    if(!ready())return;const current=quote(command);if(!current){status.textContent='This item changed. Refresh and try again.';return;}
    review={command,title,detail,quote:current};render();confirm.focus();
  }
  function card(kind:MarketKind,name:string,description:string){
    const article=el('article','market-card'),top=el('div','market-card-top');
    top.append(el('h3','',name),el('span','market-kind',kindName(kind)));article.append(top,el('p','market-description',description));return article;
  }
  function listingCard(item:MarketListingView){
    const article=card(item.kind,item.name,item.description),own=item.mine;
    article.append(el('p','market-meta',`${money(item.price)} · ${own?'Your listing':`Seller: ${item.sellerName}`}`));
    const actions=el('div','market-actions');
    if(own){
      const {wrapper,input}=priceInput('New price',item.price,`listing:${item.listingId}`),change=button('Update price'),cancel=button('Cancel listing');
      change.disabled=!ready();cancel.disabled=!ready();
      change.addEventListener('click',()=>{const price=Number(input.value);if(input.value.trim()===''||!validPrice(price)){status.textContent='Enter a whole price of $0 or more.';input.focus();return;}
        request({action:'reprice',assetId:item.assetId,listingId:item.listingId,expectedRevision:item.revision,price},'Update listing',`List ${item.name} for ${money(price)}. You receive ${money(proceeds(price))} after the 5% fee.`);});
      cancel.addEventListener('click',()=>request({action:'cancel',assetId:item.assetId,listingId:item.listingId,expectedRevision:item.revision},'Cancel listing',`${item.name} returns to your items.`));
      article.append(wrapper);actions.append(change,cancel);
    }else{
      const buy=button('Buy','market-primary'),required=minimumCash(item.kind,item.price);buy.disabled=!ready()||view.cash===null||view.cash<required;
      buy.dataset.marketCost=String(required);
      if(item.kind==='property')article.append(el('p','market-description',`Requires $2,000,000 before purchase${item.completedHome?' and a free purchased-home slot':''}.`));
      buy.addEventListener('click',()=>request({action:'buy',assetId:item.assetId,listingId:item.listingId,expectedRevision:item.revision},`Buy ${item.name}?`,`Pay ${money(item.price)}. The seller receives ${money(proceeds(item.price))}; ${money(item.price-proceeds(item.price))} is the market fee.`));
      actions.append(buy);
    }
    article.append(actions);return article;
  }
  function ownedCard(item:MarketAssetView){
    const article=card(item.kind,item.name,item.description);
    if(item.kind==='property'&&item.completedHome){
      const visit=button('Visit home');visit.disabled=!ready();visit.addEventListener('click',()=>options.onVisit(item.assetId));article.append(visit);
    }
    if(item.listing){
      const listing=item.listing,{wrapper,input}=priceInput('New price',listing.price,`listing:${listing.listingId}`),actions=el('div','market-actions');
      const change=button('Update price'),cancel=button('Cancel listing');change.disabled=!ready();cancel.disabled=!ready();
      change.addEventListener('click',()=>{const price=Number(input.value);if(input.value.trim()===''||!validPrice(price)){status.textContent='Enter a whole price of $0 or more.';input.focus();return;}
        request({action:'reprice',assetId:item.assetId,listingId:listing.listingId,expectedRevision:listing.revision,price},'Update listing',`List ${item.name} for ${money(price)}. You receive ${money(proceeds(price))} after the 5% fee.`);});
      cancel.addEventListener('click',()=>request({action:'cancel',assetId:item.assetId,listingId:listing.listingId,expectedRevision:listing.revision},'Cancel listing',`${item.name} returns to your items.`));
      article.append(el('p','market-meta',`Listed for ${money(listing.price)}`),wrapper);actions.append(change,cancel);article.append(actions);return article;
    }
    if(item.listingId){article.append(el('p','market-meta','Listing details are unavailable. Refresh to manage this item.'));return article;}
    if(item.equipped){
      article.append(el('p','market-meta','Equipped. Unequip before listing.'));
      const unequip=button('Unequip');unequip.disabled=!ready();unequip.addEventListener('click',()=>request({action:'unequip',assetId:item.assetId},`Unequip ${item.name}?`,'This item can be listed after it is unequipped.'));article.append(unequip);return article;
    }
    const {wrapper,input}=priceInput('Asking price',undefined,`asset:${item.assetId}`),actions=el('div','market-actions'),list=button('Review listing');
    list.disabled=!ready();list.addEventListener('click',()=>{const price=Number(input.value);if(input.value.trim()===''||!validPrice(price)){status.textContent='Enter a whole price of $0 or more.';input.focus();return;}
      request({action:'list',assetId:item.assetId,price},`List ${item.name}?`,`The asking price is ${money(price)}. You receive ${money(proceeds(price))} after the 5% fee.`);});
    if(item.kind==='cosmetic'){const equip=button('Equip');equip.disabled=!ready();equip.addEventListener('click',()=>request({action:'equip',assetId:item.assetId},`Equip ${item.name}?`,'This item cannot be listed while it is equipped.'));actions.append(equip);}
    actions.append(list);article.append(wrapper,actions);return article;
  }
  function shopCard(item:MarketShopView){
    const article=card(item.kind,item.name,item.description);article.append(el('p','market-meta',money(item.price)));
    const buy=button('Buy from the city','market-primary'),required=minimumCash(item.kind,item.price);buy.disabled=!ready()||view.cash===null||view.cash<required;
    buy.dataset.marketCost=String(required);
    if(item.kind==='property')article.append(el('p','market-description','Requires $2,000,000 before purchase and a free purchased-home slot.'));
    buy.addEventListener('click',()=>request({action:'acquire',catalogId:item.catalogId},`Buy ${item.name}?`,`Pay ${money(item.price)} from your wallet.`));article.append(buy);return article;
  }
  function render(){
    const savedInputs=new Map([...content.querySelectorAll<HTMLInputElement>('input[data-market-price-key]')].map(input=>[input.dataset.marketPriceKey!,input.value]));
    const activeKey=document.activeElement instanceof HTMLInputElement?document.activeElement.dataset.marketPriceKey:undefined;
    wallet.textContent=view.cash===null?'Wallet unavailable':`Spendable cash: ${money(view.cash)}`;
    status.textContent=view.message||(view.pending?'Waiting for the market to confirm this transaction.':'');
    for(const [name,control] of Object.entries(tabButtons) as [Tab,HTMLButtonElement][])control.setAttribute('aria-current',name===tab?'page':'false');
    reviewBox.hidden=!review||!ready();
    if(review){reviewTitle.textContent=review.title;reviewDetail.textContent=review.detail;}
    content.replaceChildren();
    if(view.state!=='ready'){content.append(el('p','market-empty',view.state==='loading'?'Loading listings and your items…':'Market information is unavailable.'));return;}
    const cards=tab==='listings'?view.listings.map(listingCard):tab==='owned'?view.owned.map(ownedCard):view.shop.map(shopCard);
    if(!cards.length)content.append(el('p','market-empty',tab==='listings'?'No listings yet.':tab==='owned'?'You do not own any tradable items yet.':'No city items are available.'));
    else content.append(...cards);
    if(tab==='listings'&&view.nextCursor){const more=button('Load more listings');more.disabled=view.pending;more.addEventListener('click',options.onMore);content.append(more);}
    if(tab==='owned'&&view.nextOwnedCursor){const more=button('Load more items');more.disabled=view.pending;more.addEventListener('click',options.onMoreOwned);content.append(more);}
    for(const input of content.querySelectorAll<HTMLInputElement>('input[data-market-price-key]')){
      const key=input.dataset.marketPriceKey!;if(savedInputs.has(key))input.value=savedInputs.get(key)!;if(key===activeKey)input.focus();
    }
  }
  close.addEventListener('click',()=>dialog.close());
  back.addEventListener('click',()=>{review=null;render();});
  confirm.addEventListener('click',()=>{
    if(!review||!ready())return;
    if(!review.quote||quote(review.command)!==review.quote){review=null;render();status.textContent='This item changed. Review the current details before trying again.';return;}
    const command=review.command;review=null;
    if(!options.onAction(command))view={...view,message:'Could not start this action. Reconnect and try again.'};
    render();
  });
  dialog.addEventListener('close',()=>{review=null;options.onOpenChange?.(false);});
  render();
  return {
    element:dialog,
    isOpen:()=>dialog.open,
    open(){if(dialog.open)return;dialog.showModal();options.onOpenChange?.(true);options.onRefresh();close.focus();},
    close(){if(dialog.open)dialog.close();},
    update(next:MarketView){
      const before=JSON.stringify([view.state,view.pending,view.listings,view.owned,view.shop,view.nextCursor,view.nextOwnedCursor]);
      view=next;let reviewChanged=false;
      if(review&&quote(review.command)!==review.quote){review=null;view={...view,message:'This item changed. Review the current details before trying again.'};reviewChanged=true;}
      const after=JSON.stringify([view.state,view.pending,view.listings,view.owned,view.shop,view.nextCursor,view.nextOwnedCursor]);
      if(reviewChanged||before!==after)render();else {
        wallet.textContent=view.cash===null?'Wallet unavailable':`Spendable cash: ${money(view.cash)}`;
        status.textContent=view.message||(view.pending?'Waiting for the market to confirm this transaction.':'');
        for(const control of content.querySelectorAll<HTMLButtonElement>('button[data-market-cost]'))control.disabled=!ready()||view.cash===null||view.cash<Number(control.dataset.marketCost);
      }
    },
  };
}
