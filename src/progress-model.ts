import { LEVELS } from '../shared/delivery';
import type { Player, World } from '../shared/game';
import { PARKING_LOTS } from '../shared/parking-lots';
import { MARS_GOAL } from '../shared/mars';
import { playerRace } from '../shared/race';
import { RACE_COURSES } from '../shared/race-courses';
import { domeGoals } from '../shared/soccer';
import type { AchievementId } from '../shared/achievements';

export type GameResult = { key:string; game:string; detail:string };
export type GameScores = { current:GameResult[]; recent:GameResult[] };
const elapsed=(seconds:number|null)=>seconds===null?'—':`${seconds.toFixed(1)}s`;
const plural=(count:number,singular:string)=>`${count} ${singular}${count===1?'':'s'}`;

/** Keep only observed results for this drive; the simulation expires rounds quickly. */
export class GameResultHistory {
  private results:GameResult[]=[];
  private scope:{playerId:string;room:string;driverId:string}|null=null;
  private snapshot=-1;
  private latest:GameScores={current:[],recent:[]};
  clear(){this.results=[];this.scope=null;this.snapshot=-1;this.latest={current:[],recent:[]};}
  private remember(result:GameResult){
    this.results=[result,...this.results.filter(item=>item.key!==result.key)].slice(0,5);
  }
  observe(world:World,playerId:string,room:string,driverId:string,snapshot:number):GameScores {
    if(!this.scope||this.scope.playerId!==playerId||this.scope.room!==room||this.scope.driverId!==driverId){
      this.clear();this.scope={playerId,room,driverId};
    }
    if(this.snapshot===snapshot)return this.latest;
    this.snapshot=snapshot;
    const current:GameResult[]=[];
    const parking=world.parking.rounds.find(round=>round.entrants.some(entrant=>entrant.playerId===playerId));
    const entrant=parking?.entrants.find(item=>item.playerId===playerId);
    if(parking&&entrant){
      const game=parking.mode==='park'?'Park It':'Cut the Queue';
      const place=PARKING_LOTS.find(lot=>lot.id===parking.lotId)?.name??'Parking lot';
      const finished=entrant.finishedAt!==null;
      const detail=finished?`Parked in ${elapsed(entrant.elapsed)}${parking.mode==='queue'?` · ${plural(entrant.overtakes??0,'overtake')}`:''} · ${place}`:
        parking.phase==='waiting'?`Waiting to start · ${place}`:
        parking.phase==='results'?`${parking.mode==='queue'?'No space claimed':'Round ended before you parked'} · ${place}`:
        parking.mode==='park'?`Finding your space · hold ${Math.min(entrant.hold,2).toFixed(1)} / 2s · ${place}`:`Looking for an open space · ${place}`;
      const result={key:`parking:${parking.lotId}:${parking.mode}:${parking.openedAt}`,game,detail};
      current.push(result);
      if(finished||parking.phase==='results')this.remember(result);
    }
    const racing=playerRace(world.races,playerId);
    if(racing){
      const {round,entrant:racer}=racing;
      const course=RACE_COURSES.find(item=>item.id===round.courseId);
      const game=course?.name??'Race';
      const detail=racer.status==='finished'?`Finished in ${elapsed(racer.elapsed)}${round.phase==='results'&&racer.rank?` · #${racer.rank}`:' · standings pending'}`:
        racer.status==='dnf'?'Did not finish':round.phase==='lobby'?'Waiting to start':round.phase==='countdown'?'Starting soon':
        course?`Checkpoint ${Math.min(racer.nextGate,course.gates.length)} / ${course.gates.length} passed`:'Race in progress';
      const result={key:`race:${round.courseId}:${round.openedAt}`,game,detail};
      current.push(result);
      if(round.phase==='results')this.remember(result);
    }
    const soccer=world.soccer;
    const participant=soccer.participants.find(item=>item.playerId===playerId);
    const player=world.players.find(item=>item.id===playerId);
    const car=world.entities.find(item=>item.id===player?.entityId);
    if(participant||car?.inDome){
      const goals=participant?domeGoals(participant):0;
      const outcome=soccer.phase!=='win'?'Match in progress':soccer.winningPlayers.includes(playerId)?(soccer.winningPlayers.length>1?'Shared win':'You won'):
        soccer.winningPlayers.length?'Match complete':'Match complete · no credited winner';
      const result={key:`dome:${soccer.phaseUntil}`,game:'Rocket Dome',detail:`${outcome} · Blue ${soccer.blueScore}–${soccer.orangeScore} Orange · ${plural(goals,'goal')} credited to you`};
      if(car?.inDome)current.push(result);
      if(soccer.phase==='win'&&participant)this.remember(result);
    }
    this.latest={current,recent:this.results.filter(item=>!current.some(active=>active.key===item.key))};
    return this.latest;
  }
}

export function deliveryStandings(players:readonly Player[]):Player[] {
  return [...players].sort((a,b)=>b.delivery.completed-a.delivery.completed||b.delivery.earned-a.delivery.earned||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function nextDeliveryLevel(cash:number){return LEVELS.find(level=>level.cash>cash);}
export function awardDeliveryTarget(id:AchievementId):number|null {
  if(id==='regular')return 3;
  const match=/^deliveries-(\d+)$/.exec(id);
  return match?Number(match[1]):null;
}
export type AwardWalletStatus='guest'|'connecting'|'syncing'|'ready'|'failed';
export function awardSaveView(online:boolean,status:AwardWalletStatus,wallet:readonly AchievementId[]|null,current:readonly AchievementId[]){
  const usable=online&&(status==='guest'||status==='ready');
  const saved=online&&status==='ready'&&wallet?[...wallet]:[];
  const observed=usable?[...current]:[];
  const text=status==='failed'?'Could not connect your saved driver. Rejoin to try again.':!online?'Reconnect to see your driver’s awards.':status==='guest'?'Guest driver · save your driver to keep your awards and wallet.':status==='connecting'||status==='syncing'?'Connecting your saved driver and wallet…':wallet?'Awards confirmed in your wallet are saved to your driver.':'Waiting for your wallet…';
  return {saved,observed,text};
}

/** Only display intermediate progress the current simulation actually knows. */
export function awardProgress(id:AchievementId,player:Player|undefined,world:World):string {
  if(!player)return 'Connect to see this drive’s progress';
  const deliveryTarget=awardDeliveryTarget(id);
  if(deliveryTarget)return `${Math.min(player.delivery.completed,deliveryTarget)} / ${deliveryTarget} ${deliveryTarget===1?'delivery':'deliveries'}`;
  if(id==='park-it'||id==='queue-cutter'){
    const round=world.parking.rounds.find(item=>item.mode===(id==='park-it'?'park':'queue')&&item.entrants.some(e=>e.playerId===player.id));
    const entrant=round?.entrants.find(e=>e.playerId===player.id);
    return entrant&&round?.mode==='park'?`Hold in your space: ${Math.min(entrant.hold,2).toFixed(1)} / 2s`:entrant?'Find and claim a space':'Choose this game to start';
  }
  if(id==='race-finisher'||id==='race-winner'){
    const race=playerRace(world.races,player.id);
    if(!race)return 'Join a race to start';
    const course=RACE_COURSES.find(item=>item.id===race.round.courseId);
    return id==='race-winner'&&race.round.entrants.length<2?'Race another driver to compete for this award':course?`Checkpoint ${Math.min(race.entrant.nextGate,course.gates.length)} / ${course.gates.length}`:'Race in progress';
  }
  if(id==='to-mars')return world.mars.fund>=MARS_GOAL?(player.delivery.level<2?'Funded · unlock level 2 and board at Fremont':'Funded · board at Fremont'):`Mission fund: $${world.mars.fund.toLocaleString('en-US')} / $${MARS_GOAL.toLocaleString('en-US')}`;
  if(id==='bay-hopper'&&player.achievements.crossing?.crossedWater)return 'Over the water · reach the opposite shore';
  const participant=world.soccer.participants.find(item=>item.playerId===player.id);
  if(!participant)return 'Ready to earn';
  switch(id){
    case 'rocket-rookie':return participant.touches.roadster?'Ball touched · finish the match':'Ready to earn';
    case 'built-to-fly':return participant.touches.retrofit?'Ball touched · finish the match':'Ready to earn';
    case 'roadster-champion':return participant.goals.roadster>0?'Goal credited · win the match':participant.touches.roadster?'Ball touched · score and win':'Ready to earn';
    case 'garage-champion':return participant.goals.retrofit>0?'Goal credited · win the match':participant.touches.retrofit?'Ball touched · score and win':'Ready to earn';
    case 'no-rockets-needed':return participant.touches.roadster||participant.touches.retrofit?'Try a stock car next match':participant.goals.stock>0?'Stock-car goal · win the match':'Ready to earn';
    default:return 'Ready to earn';
  }
}
