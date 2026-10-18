import './progress-panels.css';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import { ACHIEVEMENT_TIER_IDS, ACHIEVEMENT_TIER_NAMES, selectAchievementTierLadder, type AchievementTierId, type AchievementTierRow } from '../shared/achievement-tiers';
import type { Player } from '../shared/game';
import type { Session } from './session';
import { AWARD_FAMILY_DESCRIPTIONS, AWARD_GROUPS, awardCardState, awardDeliveryTarget, awardDetails, awardFamilyGroup, awardGroup, awardProgress, awardSaveView, awardTier, deliveryStandings, GameResultHistory, nextDeliveryLevel, savedAwardTiers, type GameScores } from './progress-model';

const money=(amount:number)=>`${amount<0?'−':''}$${Math.abs(amount).toLocaleString('en-US')}`;
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const plural=(number:number,word:string)=>`${number} ${word}${number===1?'':'s'}`;
function element<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string):HTMLElementTagNameMap[K] {
  const item=document.createElement(tag);item.className=className;if(text!==undefined)item.textContent=text;return item;
}

/** Existing app dialogs retain native focus and Escape behavior; callers own driving controls. */
export function createProgressPanels({session,driverId,onOpen,onClose}:{
  session:Session; driverId:()=>string; onOpen:()=>void; onClose:()=>void;
}) {
  const scoresDialog=document.getElementById('scores-dialog') as HTMLDialogElement;
  const awardsDialog=document.getElementById('awards-dialog') as HTMLDialogElement;
  scoresDialog.classList.add('progress-dialog');awardsDialog.classList.add('progress-dialog');
  scoresDialog.innerHTML=`<div class="fleet-header"><div><span class="eyebrow">YOUR DRIVE / RESULTS</span><h2 id="scores-title">Scores</h2></div><button type="button" class="progress-close" aria-label="Close scores">✕</button></div>
    <p class="progress-intro">Delivery progress follows your saved driver. Mini-game results last for this drive.</p>
    <div class="progress-scores-body"></div>`;
  awardsDialog.innerHTML=`<div class="fleet-header"><div><span class="eyebrow">YOUR DRIVER / LITTLE VICTORIES</span><h2 id="awards-title">Awards</h2></div><button type="button" class="progress-close" aria-label="Close awards">✕</button></div>
    <p class="progress-intro">Explore, deliver and play to earn awards. Tier bonuses are extra and apply when newly reached; one-time awards may pay separately.</p>
    <p class="progress-save-status"></p><div class="progress-awards-body"></div>`;
  for(const dialog of [scoresDialog,awardsDialog]){
    dialog.querySelector<HTMLButtonElement>('.progress-close')!.onclick=()=>dialog.close();
    dialog.addEventListener('close',onClose);
  }
  const history=new GameResultHistory();
  let games:GameScores={current:[],recent:[]},lastRender=0,lastAwardsKey='';
  const expandedFamilies=new Set<AchievementTierId>();
  const entries=Object.entries(ACHIEVEMENTS) as [AchievementId,typeof ACHIEVEMENTS[AchievementId]][];
  const available=()=>session.status==='online'&&(session.walletStatus==='guest'||(session.walletStatus==='ready'&&!!session.wallet));
  function observe(){
    if(available())games=history.observe(session.world,session.id,session.room,driverId(),session.snapshotVersion);
    else games={current:[],recent:[]};
  }
  function appendGameList(parent:HTMLElement,title:string,items:GameScores['current']){
    if(!items.length)return;
    parent.append(element('h4','progress-subheading',title));
    const list=element('ul','progress-game-list');
    for(const item of items){
      const row=element('li','progress-game');
      row.append(element('strong','',item.game),element('span','',item.detail));list.append(row);
    }
    parent.append(list);
  }
  function renderScores(){
    const body=scoresDialog.querySelector<HTMLElement>('.progress-scores-body')!;body.replaceChildren();
    if(!available()){
      body.append(element('p','progress-empty',awardSaveView(session.status==='online',session.walletStatus,null,[]).text));return;
    }
    const player=session.world.players.find(item=>item.id===session.id);
    const personal=element('section','progress-section');
    personal.append(element('h3','','Your delivery progress'),element('p','progress-note',session.walletStatus==='guest'?'Guest drive · save your driver to keep delivery progress.':'Delivery progress is saved to your driver.'));
    if(player){
      const stats=element('div','progress-stats');
      for(const [label,value] of [['Deliveries',String(player.delivery.completed)],['Delivery earnings',money(player.delivery.earned)],['Cash now',money(session.wallet?.cash??player.delivery.cash)]]){
        const item=element('div','progress-stat');item.append(element('span','',label),element('strong','',value));stats.append(item);
      }
      personal.append(stats);
      const cash=session.wallet?.cash??player.delivery.cash;
      const next=nextDeliveryLevel(cash);
      if(next){
        const card=element('div','progress-next');
        card.append(element('strong','',`Next level: ${next.name}`));
        const row=element('div','progress-milestone');row.append(element('span','',`Cash: ${money(Math.min(cash,next.cash))} / ${money(next.cash)}`));
        const bar=element('progress','');bar.max=next.cash;bar.value=Math.max(0,Math.min(cash,next.cash));bar.setAttribute('aria-label',`Cash toward ${next.name}`);row.append(bar);card.append(row);
        personal.append(card);
      }else personal.append(element('p','progress-note','All cash levels reached.'));
      personal.append(element('p','progress-note','Levels use your current cash. Spending or fines can lower your level.'));
    }else personal.append(element('p','progress-empty','Your delivery stats are not available yet.'));
    body.append(personal);
    const standings=element('section','progress-section');
    standings.append(element('h3','','Room delivery standings'),element('p','progress-note','Ranked by deliveries completed, then total earned. Cash can be spent or lost to tickets.'));
    if(session.world.players.length){
      const wrapper=element('div','progress-table-wrap'),table=element('table','progress-table');
      const head=element('thead',''),header=element('tr','');
      for(const label of ['Driver','Deliveries','Earned','Cash']){const cell=element('th','',label);cell.scope='col';header.append(cell);}head.append(header);table.append(head);
      const rows=element('tbody','');
      for(const p of deliveryStandings(session.world.players)){
        const row=element('tr','');
        const driver=element('th','progress-driver',`${p.name}${p.id===session.id?' (you)':''}`);driver.scope='row';
        if(p.cockpit.active||p.cockpit.activeSeconds>0||p.cockpit.deliveries>0){
          driver.append(element('small','',`${p.cockpit.active?'● ':''}FIRST PERSON · ${plural(p.cockpit.deliveries,'run')} · ${clock(p.cockpit.activeSeconds)}`));
        }
        row.append(driver,element('td','',String(p.delivery.completed)),element('td','',money(p.delivery.earned)),element('td','',money(p.delivery.cash)));rows.append(row);
      }
      table.append(rows);wrapper.append(table);standings.append(wrapper);
      standings.append(element('p','progress-note','First-person stats are self-reported. A first-person delivery takes the whole active run in cockpit view.'));
    }else standings.append(element('p','progress-empty','No drivers in this drive yet.'));
    body.append(standings);
    const mini=element('section','progress-section');mini.append(element('h3','','Mini-game results'));
    appendGameList(mini,'Current game',games.current);appendGameList(mini,'Recent results this drive',games.recent);
    if(!games.current.length&&!games.recent.length)mini.append(element('p','progress-empty','No results yet. Choose a game in Actions → Mini-games.'));
    else mini.append(element('p','progress-note','Recent results are kept while this drive is open.'));
    body.append(mini);
  }
  function renderAwards(){
    const body=awardsDialog.querySelector<HTMLElement>('.progress-awards-body')!,saveStatus=awardsDialog.querySelector<HTMLElement>('.progress-save-status')!;
    const player=available()?session.world.players.find(item=>item.id===session.id):undefined;
    const view=awardSaveView(session.status==='online',session.walletStatus,session.wallet?.unlocked??null,player?.achievements.unlocked??[]);
    const savedIds=new Set(view.saved),current=new Set(view.observed),all=new Set([...savedIds,...current]);
    const tiers=savedAwardTiers(session.status==='online',session.walletStatus,session.wallet?.achievementTiers??null);
    const key=JSON.stringify([view,tiers,player?.delivery.completed,entries.map(([id])=>awardProgress(id,player,session.world))]);
    saveStatus.textContent=view.text;
    if(key===lastAwardsKey)return;
    lastAwardsKey=key;
    for(const details of body.querySelectorAll<HTMLDetailsElement>('details[data-family]')){
      const id=details.dataset.family as AchievementTierId;
      if(details.open)expandedFamilies.add(id);else expandedFamilies.delete(id);
    }
    const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const activeCard=active?.closest<HTMLElement>('[data-award-id]');
    const activeId=activeCard?.dataset.awardId,summaryFocused=active?.tagName==='SUMMARY';
    const scrollTop=awardsDialog.scrollTop;
    body.replaceChildren();
    if(available())body.append(element('p','progress-awards-count',`${all.size} / ${entries.length} one-time awards earned${session.walletStatus==='ready'?` · ${savedIds.size} saved`:''}`));
    for(const group of AWARD_GROUPS){
      const items=entries.filter(([id])=>awardGroup(id)===group.id);
      const families=ACHIEVEMENT_TIER_IDS.filter(id=>awardFamilyGroup(id)===group.id);
      if(group.id==='delivery')items.sort(([a],[b])=>(awardDeliveryTarget(a)??Infinity)-(awardDeliveryTarget(b)??Infinity));
      if(!items.length&&!families.length)continue;
      const section=element('section','progress-award-group'),heading=element('div','progress-award-group-heading');
      heading.append(element('h3','',group.name));
      if(available()&&items.length)heading.append(element('span','',`${items.filter(([id])=>all.has(id)).length} / ${items.length} one-time awards earned`));
      section.append(heading);
      const list=element('ul','progress-award-list');
      for(const id of families)list.append(renderTierCard(id,tiers?.find(row=>row.id===id)));
      for(const [id,award] of items){
        const isSaved=savedIds.has(id),isCurrent=current.has(id),earned=isSaved||isCurrent;
        const status=awardCardState(available(),isSaved,isCurrent,session.walletStatus),details=awardDetails(id);
        const row=element('li',`progress-award is-${status.state}`),top=element('div','progress-award-top');
        row.id=`progress-award-${id}`;row.dataset.awardId=id;row.tabIndex=-1;
        const tier=element('span','progress-award-tier',awardTier(id));
        const badge=element('span','progress-award-badge',status.label);top.append(tier,badge);
        const title=element('div','progress-award-title'),icon=element('span','progress-award-icon',earned?'★':'◇');
        icon.setAttribute('aria-hidden','true');title.append(icon,element('strong','',award.name));
        row.append(top,title,element('p','progress-award-description',details.description));
        const target=awardDeliveryTarget(id),progress=element('div','progress-award-progress');
        progress.append(element('span','progress-award-label','Progress'));
        progress.append(element('span','progress-award-progress-text',earned&&!target?'Completed':awardProgress(id,player,session.world)));
        if(target&&player){
          const bar=element('progress','progress-award-bar');bar.max=target;bar.value=Math.min(player.delivery.completed,target);
          bar.setAttribute('aria-label',`${award.name} delivery progress`);progress.append(bar);
        }
        const footer=element('div','progress-award-footer'),reward=element('div','progress-award-reward');
        reward.append(element('span','progress-award-label','Reward'),element('strong','',details.reward));
        footer.append(reward,element('span','progress-award-save',status.save));row.append(progress,footer);list.append(row);
      }
      section.append(list);body.append(section);
    }
    if(activeId){
      const replacement=document.getElementById(`progress-award-${activeId}`);
      const target=summaryFocused?replacement?.querySelector<HTMLElement>('summary'):replacement;
      target?.focus({preventScroll:true});
    }
    awardsDialog.scrollTop=scrollTop;
  }
  function renderTierCard(id:AchievementTierId,data:AchievementTierRow|undefined){
    const row=element('li',`progress-award progress-tier-card${data?(data.rank?' is-saved':' is-tier-available'):' is-unavailable'}`);
    row.id=`progress-award-${id}`;row.dataset.awardId=id;row.tabIndex=-1;
    const top=element('div','progress-award-top');
    top.append(element('span','progress-award-tier','Repeatable · 5 tiers'),element('span','progress-award-badge',data?`Rank ${data.rank} / 5`:'Unavailable'));
    const title=element('div','progress-award-title'),icon=element('span','progress-award-icon',data?.rank?'★':'◇');
    icon.setAttribute('aria-hidden','true');title.append(icon,element('strong','',ACHIEVEMENT_TIER_NAMES[id]));
    const progress=element('div','progress-award-progress');progress.append(element('span','progress-award-label','Progress'));
    const number=(value:number)=>value.toLocaleString('en-US');
    const text=data?(data.nextTarget===null?`${number(data.count)} · all five ranks reached`:`${number(data.count)} / ${number(data.nextTarget)} toward rank ${data.rank+1}`):
      session.status==='online'&&session.walletStatus==='guest'?'Save your driver to track these ranks':'Connect your saved driver to see progress';
    progress.append(element('span','progress-award-progress-text',text));
    if(data?.nextTarget){
      const bar=element('progress','progress-award-bar');bar.max=data.nextTarget;bar.value=Math.min(data.count,data.nextTarget);
      bar.setAttribute('aria-label',`${data.name} progress toward rank ${data.rank+1}`);progress.append(bar);
    }
    const footer=element('div','progress-award-footer'),reward=element('div','progress-award-reward');
    reward.append(element('span','progress-award-label','Extra tier bonus'),element('strong','',data?.nextCash===null?'All ranks reached':data?money(data.nextCash!):'See tier details'));
    footer.append(reward,element('span','progress-award-save',data?'Saved to your driver':session.walletStatus==='guest'?'Guest drive · not saved':'Save status unavailable'));
    const details=element('details','progress-tier-details');details.dataset.family=id;details.open=expandedFamilies.has(id);
    const summary=element('summary','','View all 5 tiers');details.append(summary);
    const ladder=element('ol','progress-tier-ladder');
    for(const {rank,target,cash} of selectAchievementTierLadder(id)){
      const step=element('li','progress-tier-step');
      const state=data?(rank<=data.rank?'Reached':rank===data.rank+1?'Next':'Locked'):'Progress unavailable';
      const left=element('span','progress-tier-step-label'),right=element('span','progress-tier-step-status');
      left.append(element('strong','',`Rank ${rank} · ${number(target)}`),element('small','',`Extra tier bonus: ${money(cash)}`));
      right.textContent=state;step.append(left,right);ladder.append(step);
    }
    details.append(ladder);details.addEventListener('toggle',()=>{if(!details.isConnected)return;if(details.open)expandedFamilies.add(id);else expandedFamilies.delete(id);});
    row.append(top,title,element('p','progress-award-description',AWARD_FAMILY_DESCRIPTIONS[id]),progress,footer,details);return row;
  }
  function update(){
    observe();
    if(!scoresDialog.open&&!awardsDialog.open)return;
    if(performance.now()-lastRender<400)return;
    lastRender=performance.now();
    if(scoresDialog.open)renderScores();if(awardsDialog.open)renderAwards();
  }
  function open(dialog:HTMLDialogElement,render:()=>void){
    if(dialog.open)return;onOpen();observe();render();dialog.showModal();lastRender=performance.now();
  }
  function openAwards(targetId?:AchievementTierId|AchievementId){
    open(awardsDialog,renderAwards);
    if(!targetId)return;
    const target=document.getElementById(`progress-award-${targetId}`);
    if(!target||!awardsDialog.contains(target))return;
    const details=target.querySelector<HTMLDetailsElement>('details[data-family]');
    if(details){details.open=true;expandedFamilies.add(targetId as AchievementTierId);}
    (details?.querySelector<HTMLElement>('summary')??target).focus({preventScroll:true});
    target.scrollIntoView({block:'center'});
  }
  return {scoresDialog,awardsDialog,update,openScores:()=>open(scoresDialog,renderScores),openAwards,close:()=>{if(scoresDialog.open)scoresDialog.close();if(awardsDialog.open)awardsDialog.close();}};
}
