import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import type { AchievementTierId, AchievementTierRow } from '../shared/achievement-tiers';
import { awardDeliveryTarget } from './progress-model';

const deliveryAwards=(Object.keys(ACHIEVEMENTS) as AchievementId[])
  .filter(id=>awardDeliveryTarget(id)!==null)
  .sort((a,b)=>awardDeliveryTarget(a)!-awardDeliveryTarget(b)!);

/** A delivery is always an actionable goal; use confirmed unlocks for saved drivers. */
export function nextDeliveryAward(unlocked:readonly AchievementId[]):AchievementId|null {
  const earned=new Set(unlocked);
  return deliveryAwards.find(id=>!earned.has(id))??null;
}

// These goals are possible during an ordinary delivery in any unlocked area,
// without assuming a rocket, another driver or a particular mini-game.
const reachableTiers:readonly AchievementTierId[]=['deliveries','pickups','early-pickups','early-deliveries'];
const tierActions:Partial<Record<AchievementTierId,string>>={
  deliveries:'Complete deliveries', pickups:'Pick up orders',
  'early-pickups':'Pick up before the estimate', 'early-deliveries':'Deliver before the estimate',
};

/** Keep a recommendation until its threshold is reached, even if another goal gets closer. */
export function nextReachableTier(rows:readonly AchievementTierRow[],previous:AchievementTierRow|null):AchievementTierRow|null {
  const candidates=reachableTiers.flatMap(id=>{
    const row=rows.find(item=>item.id===id);
    return row&&row.nextTarget!==null?[row]:[];
  });
  if(previous){
    const current=candidates.find(row=>row.id===previous.id&&row.nextTarget===previous.nextTarget);
    if(current)return current;
  }
  return candidates.sort((a,b)=>(a.nextTarget!-a.count)-(b.nextTarget!-b.count))[0]??null;
}

export function tierGoalLabel(row:AchievementTierRow):string {
  return `★ Next award · ${tierActions[row.id]??row.name}: ${row.count.toLocaleString('en-US')} / ${row.nextTarget?.toLocaleString('en-US')}`;
}
