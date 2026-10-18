import type { StarshipContributor, StarshipStatus } from '../shared/starship';
import type { StarshipClock } from './starship-timeline';

const GOAL=1_000_000_000, LAUNCH_DURATION_MS=12_000;
const dollars=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});

export type StarshipContributorPage = {
  status:'idle'|'loading'|'ready'|'error';
  /** The page being displayed or requested; null is the first page. */
  cursor:string|null;
  entries:readonly StarshipContributor[];
  next:string|null;
};
export type StarshipPanelState = {
  freshness:'loading'|'live'|'stale'|'unavailable';
  /** Last confirmed coordinator result, retained when a refresh fails. */
  confirmed:StarshipStatus|null;
  /** Committed local income awaiting global confirmation; null means unknown. */
  pendingContribution:number|null;
  /** Server UTC at receipt and the local monotonic receipt time; never a browser wall clock. */
  clock:StarshipClock|null;
  contributors:StarshipContributorPage;
};

function element<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string):HTMLElementTagNameMap[K] {
  const result=document.createElement(tag);result.className=className;
  if(text!==undefined)result.textContent=text;
  return result;
}
function text(node:HTMLElement,value:string):void {if(node.textContent!==value)node.textContent=value;}
function amount(value:unknown):value is number {return Number.isSafeInteger(value)&&(value as number)>=0;}
function money(value:number):string {return `$${dollars.format(value)}`;}
function duration(ms:number):string {
  const seconds=Math.ceil(ms/1000),minutes=Math.floor(seconds/60),remainder=seconds%60;
  return `${minutes}:${String(remainder).padStart(2,'0')}`;
}

/**
 * Unbound view: host imports ./starship-panel.css, mounts element inside its
 * closable Mars dialog, and calls update(state, performance.now()) as state or
 * the monotonic clock changes. The host owns all loading, pagination, stale
 * detection, replay, dialog and input-control behavior. onLoad must transition
 * the page to loading and return one page for the requested cursor.
 */
export function createStarshipPanel(options:{onLoadContributors:(cursor:string|null)=>void;onReplay:()=>void}) {
  const root=element('section','starship-panel');root.setAttribute('aria-label','Game-wide Starship mission');
  const eyebrow=element('span','starship-eyebrow','ALL TESLAND / ONE MISSION');
  const heading=element('h3','starship-heading','Build the Starship together');
  const intro=element('p','starship-intro','Verified earnings from every room count automatically. Your cash stays yours.');
  const status=element('p','starship-freshness');status.setAttribute('role','status');
  const progressBox=element('div','starship-progress');
  const progressLabel=element('div','starship-progress-label');
  const progressTitle=element('span','starship-progress-title','GAME-WIDE EARNINGS');
  const total=element('strong','starship-total');progressLabel.append(progressTitle,total);
  const progress=element('progress','starship-progress-bar');progress.max=GOAL;progress.setAttribute('aria-label','Confirmed game-wide Starship progress');
  const personal=element('p','starship-personal');
  const pending=element('p','starship-pending');
  const launch=element('p','starship-launch');launch.setAttribute('role','status');
  const replay=element('button','starship-replay','Replay the launch');replay.type='button';replay.onclick=()=>options.onReplay();
  progressBox.append(progressLabel,progress,personal,pending,launch,replay);

  const contributors=element('section','starship-contributors');contributors.setAttribute('aria-label','Launch contributors');
  const contributorsTitle=element('h4','starship-contributors-title','The crew');
  const contributorsCopy=element('p','starship-contributors-copy','Everyone with confirmed earnings when the goal was reached is part of the crew.');
  const contributorStatus=element('p','starship-contributor-status');contributorStatus.setAttribute('role','status');
  const list=element('ul','starship-contributor-list');
  const buttons=element('div','starship-contributor-actions');
  const first=element('button','starship-first','First page');first.type='button';
  const load=element('button','starship-load');load.type='button';
  buttons.append(first,load);contributors.append(contributorsTitle,contributorsCopy,contributorStatus,list,buttons);
  root.append(eyebrow,heading,intro,status,progressBox,contributors);
  let current:StarshipPanelState|null=null,lastEntries='';
  first.onclick=()=>{first.disabled=true;load.disabled=true;options.onLoadContributors(null);};
  load.onclick=()=>{
    if(!current)return;
    const page=current.contributors;
    const cursor=page.status==='error'?page.cursor:page.status==='ready'?page.next:null;
    first.disabled=true;load.disabled=true;options.onLoadContributors(cursor);
  };

  function update(state:StarshipPanelState,now=performance.now()):void {
    current=state;
    const confirmed=state.confirmed;
    const valid=!!confirmed&&amount(confirmed.total)&&amount(confirmed.personal)&&confirmed.personal<=confirmed.total;
    const freshness=state.freshness;
    text(status,!valid?(freshness==='loading'?'Connecting to the game-wide mission…':'Game-wide progress is unavailable.'):
      freshness==='live'?'Live · confirmed game-wide':freshness==='loading'?'Last confirmed · refreshing…':'Last confirmed · updates unavailable');
    progress.hidden=!valid;
    if(valid){
      const actual=confirmed!.total;
      text(total,`${money(actual)} / ${money(GOAL)}`);progress.value=Math.min(actual,GOAL);
      text(personal,`Your confirmed contribution: ${money(confirmed!.personal)}`);
      text(pending,amount(state.pendingContribution)?state.pendingContribution>0?`${money(state.pendingContribution)} earned, awaiting global confirmation.`:'All your reported earnings are confirmed.':'Pending contribution is unavailable.');
    }else{
      text(total,'Unavailable');text(personal,'Your confirmed contribution is unavailable.');text(pending,'');
    }
    const completed=valid&&confirmed!.completedAt!==null;
    const launchAt=confirmed?.launchAt;
    const clock=state.clock;
    const validClock=!!clock&&amount(clock.serverTime)&&Number.isFinite(clock.receivedAt)&&Number.isFinite(now)&&now>=clock.receivedAt&&
      amount(launchAt)&&clock.launchAt===launchAt;
    const estimatedServerTime=validClock?clock!.serverTime+now-clock!.receivedAt:null;
    let replayReady=false;
    if(!completed)text(launch,'The launch begins after the $1 billion goal is reached.');
    else if(!validClock)text(launch,'Launch timing is unavailable.');
    else if(freshness!=='live'){
      replayReady=clock!.serverTime>=launchAt!+LAUNCH_DURATION_MS;
      text(launch,replayReady?'Launch complete.':'Launch timing is unavailable while updates are stale.');
    }else if(estimatedServerTime!<launchAt!)text(launch,`Launch in ${duration(launchAt!-estimatedServerTime!)}`);
    else if(estimatedServerTime!<launchAt!+LAUNCH_DURATION_MS)text(launch,'Launch in progress.');
    else {replayReady=true;text(launch,'Launch complete.');}
    replay.hidden=!replayReady;

    contributors.hidden=!completed;
    const page=state.contributors;
    const entries=page.entries.slice(0,20).filter(entry=>typeof entry.name==='string'&&amount(entry.amount));
    const entriesKey=JSON.stringify(entries);
    if(entriesKey!==lastEntries){
      lastEntries=entriesKey;
      const rows=entries.map(entry=>{
        const row=element('li','starship-contributor');
        const name=element('span','starship-contributor-name',entry.name);
        const contribution=element('span','starship-contributor-amount',money(entry.amount));
        row.append(name,contribution);return row;
      });
      list.replaceChildren(...rows);
    }
    text(contributorStatus,page.status==='loading'?'Loading contributors…':page.status==='error'?'Could not load contributors. Please try again.':
      page.status==='idle'?'Explore the frozen contributor list.':entries.length?'Confirmed contributors at launch.':'No contributors on this page.');
    first.hidden=page.cursor===null;first.disabled=page.status==='loading';
    load.hidden=page.status==='ready'&&page.next===null;
    load.disabled=page.status==='loading';
    text(load,page.status==='loading'?'Loading…':page.status==='error'?'Try again':page.status==='ready'?'Next page':'View contributors');
  }
  return {element:root,update};
}
