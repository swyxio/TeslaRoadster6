import './progress-panels.css';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import type { Player } from '../shared/game';
import type { Session } from './session';
import { awardDeliveryTarget, awardProgress, awardSaveView, deliveryStandings, GameResultHistory, nextDeliveryLevel, type GameScores } from './progress-model';

const money=(amount:number)=>`${amount<0?'−':''}$${Math.abs(amount).toLocaleString('en-US')}`;
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const plural=(number:number,word:string)=>`${number} ${word}${number===1?'':'s'}`;
const gameAwards=new Set<AchievementId>(['rocket-rookie','roadster-champion','built-to-fly','garage-champion','no-rockets-needed','park-it','queue-cutter','race-finisher','race-winner']);
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
    <p class="progress-intro">Explore, deliver and play to earn awards. Some award a one-time cash reward.</p>
    <p class="progress-save-status"></p><div class="progress-awards-body"></div>`;
  for(const dialog of [scoresDialog,awardsDialog]){
    dialog.querySelector<HTMLButtonElement>('.progress-close')!.onclick=()=>dialog.close();
    dialog.addEventListener('close',onClose);
  }
  const history=new GameResultHistory();
  let games:GameScores={current:[],recent:[]},lastRender=0;
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
    body.replaceChildren();const player=available()?session.world.players.find(item=>item.id===session.id):undefined;
    const view=awardSaveView(session.status==='online',session.walletStatus,session.wallet?.unlocked??null,player?.achievements.unlocked??[]);
    const savedIds=new Set(view.saved),current=new Set(view.observed),all=new Set([...savedIds,...current]);
    saveStatus.textContent=view.text;
    if(!available()){body.append(element('p','progress-empty','Awards will appear when your driver is connected.'));return;}
    body.append(element('p','progress-awards-count',`${all.size} / ${Object.keys(ACHIEVEMENTS).length} earned${session.walletStatus==='ready'?` · ${savedIds.size} saved`:''}`));
    const entries=Object.entries(ACHIEVEMENTS) as [AchievementId,typeof ACHIEVEMENTS[AchievementId]][];
    for(const [heading,items] of [['Mini-game awards',entries.filter(([id])=>gameAwards.has(id))],['Explore and deliver',entries.filter(([id])=>!gameAwards.has(id))]] as const){
    body.append(element('h3','progress-subheading',heading));
    const list=element('ul','progress-award-list');
    for(const [id,award] of items){
      const isSaved=savedIds.has(id),isCurrent=current.has(id),earned=isSaved||isCurrent;
      const row=element('li',`progress-award${earned?' is-earned':''}`),icon=element('span','progress-award-icon',earned?'★':'◇');icon.setAttribute('aria-hidden','true');
      const copy=element('div','progress-award-copy');copy.append(element('strong','',award.name),element('p','',award.description));
      const status=isSaved?'Saved to your driver':isCurrent?(session.walletStatus==='guest'?'Earned · save your driver to keep':'Earned · awaiting wallet confirmation'):awardProgress(id,player,session.world);
      copy.append(element('small','progress-award-status',status));
      const target=awardDeliveryTarget(id);if(target&&!earned&&player){const bar=element('progress','progress-award-bar');bar.max=target;bar.value=Math.min(player.delivery.completed,target);bar.setAttribute('aria-label',`${award.name} delivery progress`);copy.append(bar);}
      row.append(icon,copy);list.append(row);
    }
    body.append(list);
    }
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
  return {scoresDialog,awardsDialog,update,openScores:()=>open(scoresDialog,renderScores),openAwards:()=>open(awardsDialog,renderAwards),close:()=>{if(scoresDialog.open)scoresDialog.close();if(awardsDialog.open)awardsDialog.close();}};
}
