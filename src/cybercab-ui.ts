import './cybercab-ui.css';

export type CybercabQuote = {
  price:number;
  award:number;
  projectedBalance:number;
  projectedLevel:number;
};

export type CybercabView = {
  id:string;
  name:string;
  state:'operating'|'waiting'|'unavailable';
  stateDetail?:string;
  owner:string;
  driver:string|null;
  revenue:{label:string;amount:number|null};
  canFind:boolean;
  canFollow:boolean;
  style?:{
    currentId:string;
    choices:readonly {id:string;label:string}[];
    state:'ready'|'pending'|'unavailable';
    detail?:string;
  };
};

export type CybercabFleetView = {
  /** Values supplied here are already committed; null means unavailable. */
  cash:number|null;
  level:number|null;
  purchase:{state:'ready'|'pending'|'unavailable';quote:CybercabQuote|null;detail?:string};
  cabs:readonly CybercabView[];
};

type CybercabUIOptions = {
  /** Return false only if no request was sent. */
  onPurchase:()=>boolean;
  onFind:(cabId:string)=>void;
  onFollow:(cabId:string)=>void;
  /** Return false only if no request was sent. */
  onStyle:(cabId:string,styleId:string)=>boolean;
  onOpenChange?:(open:boolean)=>void;
};

const moneyFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const validInteger=(value:number|null):value is number=>value!==null&&Number.isSafeInteger(value);
const validAmount=(value:number|null):value is number=>validInteger(value)&&value>=0;
const money=(value:number|null,signed=false)=>validInteger(value)&&(signed||value>=0)?
  `${value<0?'-$':'$'}${moneyFormat.format(Math.abs(value))}`:'Unavailable';
const levelText=(value:number|null)=>validAmount(value)?`Level ${value}`:'Level unavailable';
const text=(node:HTMLElement,value:string)=>{if(node.textContent!==value)node.textContent=value;};
function el<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,value?:string):HTMLElementTagNameMap[K] {
  const node=document.createElement(tag);node.className=className;
  if(value!==undefined)node.textContent=value;
  return node;
}
function button(className:string,label:string):HTMLButtonElement {
  const node=el('button',className,label);node.type='button';return node;
}
function sameQuote(a:CybercabQuote,b:CybercabQuote|null):boolean {
  return !!b&&a.price===b.price&&a.award===b.award&&a.projectedBalance===b.projectedBalance&&a.projectedLevel===b.projectedLevel;
}

/**
 * A transport-independent view. Append element before opening. Keep requests
 * pending across close/reopen and call resolvePurchase/resolveStyle only after
 * a definitive result has been reconciled with the supplied view.
 */
export function createCybercabUI(options:CybercabUIOptions) {
  const dialog=el('dialog','cybercab-dialog');dialog.setAttribute('aria-label','Cybercab fleet');
  const header=el('header','cybercab-header'),heading=el('div','cybercab-heading');
  heading.append(el('span','cybercab-eyebrow','YOUR FLEET'),el('h2','','Cybercabs'));
  const close=button('cybercab-close','✕');close.setAttribute('aria-label','Close Cybercab fleet');
  header.append(heading,close);
  const intro=el('p','cybercab-intro','Find your cabs, check their status and choose how they look.');
  const wallet=el('div','cybercab-wallet'),cash=el('span',''),level=el('span','');wallet.append(cash,level);
  const content=el('div','cybercab-content'),fleet=el('section','cybercab-fleet');fleet.setAttribute('aria-label','Your Cybercabs');
  const fleetHeading=el('h3','','Your cabs'),empty=el('p','cybercab-empty','No Cybercabs yet.');
  const list=el('ul','cybercab-list');fleet.append(fleetHeading,empty,list);
  const purchase=el('section','cybercab-purchase');purchase.setAttribute('aria-label','Next Cybercab');
  const purchaseHeading=el('h3','','Next Cybercab'),quoteList=el('dl','cybercab-quote');
  const quoteValues:HTMLElement[]=[];
  for(const label of ['Price','One-time award','Projected balance','Projected level']){
    const dt=el('dt','',label),dd=el('dd','');quoteList.append(dt,dd);quoteValues.push(dd);
  }
  const estimate=el('p','cybercab-estimate','Projected amounts are estimates until the purchase is confirmed.');
  const review=button('cybercab-primary','Review purchase');
  const confirmBox=el('div','cybercab-confirm');confirmBox.hidden=true;
  const confirmTitle=el('strong','','Confirm purchase'),confirmCopy=el('p','','Review the price and projected balance above before buying.');
  const confirmActions=el('div','cybercab-actions'),cancel=button('','Cancel'),confirm=button('cybercab-primary','Confirm purchase');
  confirmActions.append(cancel,confirm);confirmBox.append(confirmTitle,confirmCopy,confirmActions);
  const purchaseStatus=el('p','cybercab-status');purchaseStatus.setAttribute('role','status');purchaseStatus.setAttribute('aria-live','polite');purchaseStatus.tabIndex=-1;
  purchase.append(purchaseHeading,quoteList,estimate,review,confirmBox,purchaseStatus);
  content.append(fleet,purchase);dialog.append(header,intro,wallet,content);

  let view:CybercabFleetView={cash:null,level:null,purchase:{state:'unavailable',quote:null,detail:'Fleet information is unavailable.'},cabs:[]};
  let reviewed:CybercabQuote|null=null,reviewedCash:number|null=null,reviewedLevel:number|null=null,purchasePending=false,purchaseMessage='';
  const stylePending=new Set<string>();
  type Row={node:HTMLLIElement;update:(cab:CybercabView)=>void;resetStyle:()=>void};
  const rows=new Map<string,Row>();

  function renderPurchase(){
    const {purchase:offer}=view,quote=offer.quote;
    text(cash,`Spendable cash: ${money(view.cash,true)}`);
    text(level,levelText(view.level));
    const values=quote?[money(quote.price),money(quote.award),money(quote.projectedBalance,true),levelText(quote.projectedLevel)]:['Unavailable','Unavailable','Unavailable','Unavailable'];
    quoteValues.forEach((node,index)=>text(node,values[index]));
    const busy=purchasePending||offer.state==='pending';
    const valid=validInteger(view.cash)&&validAmount(view.level)&&!!quote&&validInteger(quote.projectedBalance)&&
      [quote.price,quote.award,quote.projectedLevel].every(validAmount);
    const available=offer.state==='ready'&&valid&&!busy;
    const changed=!!reviewed&&(!available||!sameQuote(reviewed,quote)||reviewedCash!==view.cash||reviewedLevel!==view.level);
    const restoreFocus=changed&&confirmBox.contains(document.activeElement);
    if(changed){reviewed=null;purchaseMessage='The offer changed. Review it again before buying.';}
    review.hidden=!!reviewed;review.disabled=!available;
    confirmBox.hidden=!reviewed;confirm.disabled=!available;
    text(purchaseStatus,busy?(offer.state==='pending'&&offer.detail||'Purchase pending. Waiting for confirmation.'):
      offer.state==='unavailable'?(offer.detail||'Purchase unavailable.'):
        !valid?'Purchase information unavailable.':purchaseMessage||offer.detail||'');
    if(restoreFocus&&dialog.open)(review.disabled?close:review).focus();
  }

  function createRow(id:string):Row {
    const node=el('li','cybercab-row'),top=el('div','cybercab-row-top');
    const name=el('h4',''),status=el('span','cybercab-badge');top.append(name,status);
    const detail=el('p','cybercab-detail'),people=el('p','cybercab-people'),revenue=el('p','cybercab-revenue');
    const actions=el('div','cybercab-actions'),find=button('','Find on map'),follow=button('','Follow');actions.append(find,follow);
    const styleArea=el('div','cybercab-style'),styleLabel=el('label','','Style'),select=el('select',''),save=button('','Apply style');
    styleLabel.append(select);styleArea.append(styleLabel,save);
    const styleStatus=el('p','cybercab-style-status');styleStatus.setAttribute('role','status');styleArea.append(styleStatus);
    node.append(top,detail,people,revenue,actions,styleArea);
    let current:CybercabView|undefined,dirty=false,choiceKey='';

    function refreshStyle(){
      const style=current?.style;
      styleArea.hidden=!style;
      if(!style)return;
      const key=JSON.stringify(style.choices.map(choice=>[choice.id,choice.label]));
      if(key!==choiceKey){
        choiceKey=key;select.replaceChildren();
        for(const choice of style.choices){const option=el('option','',choice.label);option.value=choice.id;select.append(option);}
        dirty=false;
      }
      if(!dirty)select.value=style.currentId;
      const busy=stylePending.has(id)||style.state==='pending';
      const available=style.state==='ready'&&!busy&&style.choices.some(choice=>choice.id===select.value);
      select.disabled=style.state!=='ready'||busy;
      save.disabled=!available||select.value===style.currentId;
      text(styleStatus,busy?(style.state==='pending'&&style.detail||'Style change pending. Waiting for confirmation.'):
        style.state==='unavailable'?(style.detail||'Style changes unavailable.'):style.detail||'');
    }
    select.addEventListener('change',()=>{dirty=true;refreshStyle();});
    save.addEventListener('click',()=>{
      if(!current?.style||save.disabled)return;
      const selected=select.value;stylePending.add(id);refreshStyle();
      if(!options.onStyle(id,selected)){stylePending.delete(id);refreshStyle();text(styleStatus,'Style change could not be started.');}
    });
    find.addEventListener('click',()=>{if(current?.canFind)options.onFind(id);});
    follow.addEventListener('click',()=>{if(current?.canFollow)options.onFollow(id);});
    return {node,update(cab){
      current=cab;text(name,cab.name);
      text(status,cab.state==='operating'?'Operating':cab.state==='waiting'?'Waiting':'Unavailable');status.dataset.state=cab.state;
      text(detail,cab.stateDetail||'');detail.hidden=!cab.stateDetail;
      text(people,`Owner: ${cab.owner}${cab.driver?` · Driver: ${cab.driver}`:''}`);
      text(revenue,`${cab.revenue.label}: ${money(cab.revenue.amount)}`);
      find.disabled=!cab.canFind;follow.disabled=!cab.canFollow;
      find.setAttribute('aria-label',`Find ${cab.name} on the map`);follow.setAttribute('aria-label',`Follow ${cab.name}`);
      refreshStyle();
    },resetStyle(){dirty=false;refreshStyle();}};
  }
  function renderFleet(){
    empty.hidden=view.cabs.length>0;
    const seen=new Set<string>();
    for(const [index,cab] of view.cabs.entries()){
      if(seen.has(cab.id))continue;
      seen.add(cab.id);
      let row=rows.get(cab.id);if(!row){row=createRow(cab.id);rows.set(cab.id,row);}
      row.update(cab);
      if(list.children[index]!==row.node)list.insertBefore(row.node,list.children[index]??null);
    }
    for(const [id,row] of rows)if(!seen.has(id)){row.node.remove();rows.delete(id);}
  }

  review.addEventListener('click',()=>{
    if(review.disabled||!view.purchase.quote)return;
    reviewed={...view.purchase.quote};reviewedCash=view.cash;reviewedLevel=view.level;purchaseMessage='';renderPurchase();confirm.focus();
  });
  cancel.addEventListener('click',()=>{reviewed=null;purchaseMessage='';renderPurchase();review.focus();});
  confirm.addEventListener('click',()=>{
    if(!reviewed)return;
    if(confirm.disabled||!sameQuote(reviewed,view.purchase.quote)||reviewedCash!==view.cash||reviewedLevel!==view.level){renderPurchase();return;}
    reviewed=null;purchasePending=true;purchaseMessage='';renderPurchase();purchaseStatus.focus();
    if(!options.onPurchase()){purchasePending=false;purchaseMessage='Purchase could not be started.';renderPurchase();}
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{reviewed=null;renderPurchase();options.onOpenChange?.(false);});
  renderPurchase();renderFleet();
  return {
    element:dialog,
    open(){if(dialog.open)return;dialog.showModal();options.onOpenChange?.(true);close.focus();},
    close(){if(dialog.open)dialog.close();},
    update(next:CybercabFleetView){view=next;renderPurchase();renderFleet();},
    resolvePurchase(){purchasePending=false;purchaseMessage='';renderPurchase();},
    resolveStyle(cabId:string){stylePending.delete(cabId);rows.get(cabId)?.resetStyle();},
  };
}
