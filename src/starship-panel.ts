import './starship-panel.css';
import { MARS_LAUNCH_SECONDS } from '../shared/mars';
import { STARSHIP_GOAL, STARSHIP_STAGE_PERCENTAGES, type StarshipContributor, type StarshipContributorGroup } from '../shared/starship';
import type { StarshipViewStatus } from './starship-model';
import type { StarshipClock } from './starship-timeline';

const LAUNCH_DURATION_MS=MARS_LAUNCH_SECONDS*1000;
const dollars=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});

export type StarshipContributorPage = {
  status:'idle'|'loading'|'building'|'ready'|'error';
  group:StarshipContributorGroup;
  /** The page being displayed or requested; null is the first page. */
  cursor:string|null;
  entries:readonly StarshipContributor[];
  next:string|null;
};
export type StarshipPanelState = {
  freshness:'loading'|'live'|'stale'|'unavailable';
  /** Last confirmed coordinator result, retained when a refresh fails. */
  confirmed:StarshipViewStatus|null;
  /** Committed local income awaiting global confirmation; null means unknown. */
  pendingContribution:number|null;
  /** Server UTC at receipt and the local monotonic receipt time; never a browser wall clock. */
  clock:StarshipClock|null;
  contributors:StarshipContributorPage;
  privacy:{status:'loading'|'ready'|'saving'|'pending'|'error'|'unavailable';publicName:string|null};
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
 * Host mounts this view inside its closable Mars dialog and calls update(state, performance.now()) as state or
 * the monotonic clock changes. The host owns all loading, pagination, stale
 * detection, replay, dialog and input-control behavior. onLoad must transition
 * the page to loading for the requested group and cursor, ignore stale responses,
 * and expose building when the frozen list needs another first-page retry.
 */
export function createStarshipPanel(options:{onLoadContributors:(group:StarshipContributorGroup,cursor:string|null)=>void;onWatch:()=>void;onReplay:(preview:boolean)=>void;onSetPublicName:(name:string|null)=>void}) {
  const root=element('section','starship-panel');root.setAttribute('aria-label','Game-wide Starship mission');
  const eyebrow=element('span','starship-eyebrow','ALL TESLAND / ONE MISSION');
  const heading=element('h3','starship-heading','Build the Starship together');
  const intro=element('p','starship-intro','Earnings from every room count automatically. Your cash stays yours.');
  const status=element('p','starship-freshness');status.setAttribute('role','status');
  const progressBox=element('div','starship-progress');
  const progressLabel=element('div','starship-progress-label');
  const progressTitle=element('span','starship-progress-title','GAME-WIDE EARNINGS');
  const total=element('strong','starship-total');progressLabel.append(progressTitle,total);
  const progress=element('progress','starship-progress-bar');progress.max=STARSHIP_GOAL;progress.setAttribute('aria-label','Confirmed game-wide Starship progress');
  const lifetime=element('p','starship-pending');
  const personal=element('p','starship-personal');
  const pending=element('p','starship-pending');
  const stage=element('p','starship-stage');
  const launch=element('p','starship-launch');launch.setAttribute('role','timer');launch.setAttribute('aria-live','off');
  const watch=element('button','starship-watch','Watch the launch site');watch.type='button';watch.onclick=()=>options.onWatch();
  let previewReplay=false;
  const replay=element('button','starship-replay','Replay the launch');replay.type='button';replay.onclick=()=>options.onReplay(previewReplay);
  progressBox.append(progressLabel,progress,lifetime,personal,pending,stage,launch,watch,replay);

  const privacy=element('form','starship-privacy');
  const privacyTitle=element('h4','starship-privacy-title','Your launch crew name');
  const privacyCopy=element('p','starship-privacy-copy','On the crew list, your name and contribution stay private unless you choose a public name. You can change this later.');
  const privacyLabel=element('label','starship-privacy-label');
  const showName=element('input','starship-show-name');showName.type='checkbox';
  privacyLabel.append(showName,document.createTextNode('Show my name on the crew list'));
  const nameLabel=element('label','starship-name-label','Public name');nameLabel.htmlFor='starship-public-name';
  const nameInput=element('input','starship-name');nameInput.id='starship-public-name';nameInput.maxLength=80;nameInput.autocomplete='off';
  nameLabel.hidden=nameInput.hidden=true;
  const privacySave=element('button','starship-privacy-save','Save choice');privacySave.type='submit';
  const privacyStatus=element('p','starship-privacy-status');privacyStatus.setAttribute('role','status');
  privacy.append(privacyTitle,privacyCopy,privacyLabel,nameLabel,nameInput,privacySave,privacyStatus);
  showName.onchange=()=>{nameLabel.hidden=nameInput.hidden=!showName.checked;};
  privacy.onsubmit=event=>{
    event.preventDefault();
    if(showName.checked&&!nameInput.value.trim()){privacyStatus.textContent='Enter a public name or choose to stay anonymous.';nameInput.focus();return;}
    options.onSetPublicName(showName.checked?nameInput.value.trim():null);
  };

  const contributors=element('section','starship-contributors');contributors.setAttribute('aria-label','Launch contributors');
  const contributorsTitle=element('h4','starship-contributors-title','The crew');
  const contributorsCopy=element('p','starship-contributors-copy');
  const groups=element('div','starship-contributor-actions');groups.setAttribute('aria-label','Contributor lists');
  const atGoal=element('button','starship-at-goal','At the goal');atGoal.type='button';
  const later=element('button','starship-later','Later confirmations');later.type='button';
  groups.append(atGoal,later);
  const contributorStatus=element('p','starship-contributor-status');contributorStatus.setAttribute('role','status');
  const list=element('ul','starship-contributor-list');
  const buttons=element('div','starship-contributor-actions');
  const first=element('button','starship-first','First page');first.type='button';
  const load=element('button','starship-load');load.type='button';
  buttons.append(first,load);contributors.append(contributorsTitle,groups,contributorsCopy,contributorStatus,list,buttons);
  root.append(eyebrow,heading,intro,status,progressBox,privacy,contributors);
  let current:StarshipPanelState|null=null,lastEntries='',lastPrivacy:string|null|undefined=undefined;
  function request(group:StarshipContributorGroup,cursor:string|null):void {
    first.disabled=load.disabled=atGoal.disabled=later.disabled=true;
    options.onLoadContributors(group,cursor);
  }
  atGoal.onclick=()=>request('at-goal',null);
  later.onclick=()=>request('later',null);
  first.onclick=()=>{if(current)request(current.contributors.group,null);};
  load.onclick=()=>{
    if(!current)return;
    const page=current.contributors;
    const cursor=page.status==='error'?page.cursor:page.status==='ready'?page.next:null;
    request(page.group,cursor);
  };

  function update(state:StarshipPanelState,now=performance.now()):void {
    current=state;
    const confirmed=state.confirmed;
    const valid=!!confirmed&&amount(confirmed.total)&&(confirmed.personal===null||(amount(confirmed.personal)&&confirmed.personal<=confirmed.total));
    const freshness=state.freshness;
    text(status,!valid?(freshness==='loading'?'Connecting to the game-wide mission…':'Game-wide progress is unavailable.'):
      freshness==='live'?'Live · confirmed game-wide':freshness==='loading'?'Last confirmed · refreshing…':'Last confirmed · updates unavailable');
    progress.hidden=!valid;
    if(valid){
      const actual=confirmed!.launchTotal??confirmed!.cutoverTotal??confirmed!.total;
      text(progressTitle,confirmed!.crossing==='recorded'?'CONFIRMED AT THE GOAL':confirmed!.crossing==='unknown'?'CONFIRMED AT TRACKING START':'GAME-WIDE EARNINGS');
      text(total,`${money(actual)} / ${money(STARSHIP_GOAL)}`);progress.value=Math.min(actual,STARSHIP_GOAL);
      text(lifetime,confirmed!.crossing==='pending'?'':`Current confirmed lifetime earnings: ${money(confirmed!.total)}.`);
      text(personal,confirmed!.personal===null?'Connect a driver to see your confirmed contribution.':`Your confirmed lifetime earnings: ${money(confirmed!.personal)}`);
      text(pending,confirmed!.personal===null?'':amount(state.pendingContribution)?state.pendingContribution>0?`${money(state.pendingContribution)} earned, awaiting global confirmation.`:'All your reported earnings are confirmed.':'Pending contribution is unavailable.');
      const next=STARSHIP_STAGE_PERCENTAGES.find(percent=>actual<STARSHIP_GOAL*percent/100);
      text(stage,next?`Next construction milestone: ${next}% · ${money(STARSHIP_GOAL*next/100)}.`:'All construction milestones reached.');
    }else{
      text(progressTitle,'GAME-WIDE EARNINGS');text(total,'Unavailable');text(lifetime,'');text(personal,'Your confirmed contribution is unavailable.');text(pending,'');text(stage,'');
    }
    const completed=valid&&confirmed!.crossing==='recorded'&&confirmed!.completedAt!==null;
    const unknown=valid&&confirmed!.crossing==='unknown';
    const launchAt=confirmed?.launchAt;
    const clock=state.clock;
    const validClock=!!clock&&amount(clock.serverTime)&&Number.isFinite(clock.receivedAt)&&Number.isFinite(now)&&now>=clock.receivedAt&&
      amount(launchAt)&&clock.launchAt===launchAt;
    const estimatedServerTime=validClock?clock!.serverTime+now-clock!.receivedAt:null;
    let replayReady=false;
    if(unknown)text(launch,'The goal was reached before launch tracking began. The crossing time is unknown.');
    else if(!completed)text(launch,'The launch begins after the $1 billion goal is reached.');
    else if(!validClock)text(launch,'Launch timing is unavailable.');
    else if(freshness!=='live'){
      replayReady=estimatedServerTime!>=launchAt!+LAUNCH_DURATION_MS;
      text(launch,replayReady?'Replay available · current status unavailable.':'Launch timing is unavailable while updates are stale.');
    }else if(estimatedServerTime!<launchAt!)text(launch,`Launch in ${duration(launchAt!-estimatedServerTime!)}`);
    else if(estimatedServerTime!<launchAt!+LAUNCH_DURATION_MS)text(launch,'Launch in progress.');
    else {replayReady=true;text(launch,'Launch complete.');}
    previewReplay=!valid||unknown||(!completed&&freshness!=='live');
    replay.hidden=!replayReady&&!previewReplay;
    text(replay,previewReplay?'Preview a launch':'Replay the launch');

    const choice=state.privacy;
    if(choice.status==='unavailable'&&lastPrivacy!==undefined){
      lastPrivacy=undefined;showName.checked=false;nameInput.value='';nameLabel.hidden=nameInput.hidden=true;
    }
    if((choice.status==='ready'||choice.status==='pending'||choice.status==='error')&&choice.publicName!==lastPrivacy){
      lastPrivacy=choice.publicName;showName.checked=choice.publicName!==null;nameInput.value=choice.publicName??'';
      nameLabel.hidden=nameInput.hidden=!showName.checked;
    }
    const privacyBusy=choice.status==='loading'||choice.status==='saving'||choice.status==='unavailable';
    showName.disabled=nameInput.disabled=privacySave.disabled=privacyBusy;
    text(privacyStatus,choice.status==='loading'?'Loading your choice…':choice.status==='saving'?'Saving your choice…':choice.status==='pending'?'Your choice is awaiting confirmation. Your previous public setting may remain visible until the update completes.':choice.status==='error'?'Could not confirm your choice. Please check again.':choice.status==='unavailable'?'Connect a driver to choose a public name.':'');

    contributors.hidden=!completed&&!unknown;
    const page=state.contributors;
    text(atGoal,`${unknown?'At tracking start':'At the goal'}${page.group==='at-goal'?' ✓':''}`);
    text(later,`Later confirmations${page.group==='later'?' ✓':''}`);
    atGoal.setAttribute('aria-pressed',String(page.group==='at-goal'));later.setAttribute('aria-pressed',String(page.group==='later'));
    atGoal.disabled=later.disabled=page.status==='loading';
    text(contributorsCopy,page.group==='later'?(unknown?'Confirmations after tracking began may include earnings committed earlier. Drivers may appear on both lists or first contribute later.':'Confirmations after the goal may include earnings committed earlier. Drivers may appear on both lists or first contribute later.'):
      (unknown?'Earnings confirmed when launch tracking began. The historical crossing is unknown.':'Earnings confirmed when the goal was reached. Later confirmations may include earnings committed earlier.'));
    const entries=(page.status==='ready'?page.entries:[]).slice(0,20).filter(entry=>typeof entry.name==='string'&&(entry.amount===null||amount(entry.amount)));
    const entriesKey=JSON.stringify(entries);
    if(entriesKey!==lastEntries){
      lastEntries=entriesKey;
      const rows=entries.map(entry=>{
        const row=element('li','starship-contributor');
        const name=element('span','starship-contributor-name',entry.name);
        const contribution=element('span','starship-contributor-amount',entry.amount===null?'Private':money(entry.amount));
        row.append(name,contribution);return row;
      });
      list.replaceChildren(...rows);
    }
    text(contributorStatus,page.status==='loading'?'Loading contributors…':page.status==='building'?'Building the contributor list. Check again shortly.':page.status==='error'?'Could not load contributors. Please try again.':
      page.status==='idle'?'Explore the contributor lists.':entries.length?(page.group==='later'?'Later confirmations.':unknown?'Confirmed contributors at tracking start.':'Confirmed contributors at the goal.'):'No contributors on this page.');
    first.hidden=page.cursor===null&&page.group!=='later';first.disabled=page.status==='loading';
    text(first,page.cursor===null?'Refresh':'First page');
    load.hidden=page.status==='ready'&&page.next===null;
    load.disabled=page.status==='loading';
    text(load,page.status==='loading'?'Loading…':page.status==='building'?'Check again':page.status==='error'?'Try again':page.status==='ready'?'Next page':'View contributors');
  }
  return {element:root,update};
}
