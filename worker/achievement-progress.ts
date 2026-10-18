import { applyAchievementTierEvent, type AchievementTierId, type AchievementTierProgress } from '../shared/achievement-tiers';
import { evaluateAchievementEvidence, type AchievementEvidence } from '../shared/achievement-evidence';
import { applyAchievementAwards, applyDeliveryAwards, type AchievementState } from '../shared/achievements';
import { updateLevel, type DeliveryState, type Order } from '../shared/delivery';

/** The observation is produced by the room, never by a client claim. */
export function achievementTierFamilies(evidence:AchievementEvidence):AchievementTierId[] {
  switch(evidence.kind){
    case 'roof': return ['roof-landings'];
    case 'crossing': return evidence.crossedWater&&evidence.origin!==evidence.destination?['bay-crossings']:[];
    case 'parking': return evidence.finished?[evidence.mode==='park'?'parking-successes':'queue-successes']:[];
    case 'race':
      return evidence.status==='finished'
        ? evidence.rank===1&&evidence.starterCount>=2&&(evidence.phase==='active'||evidence.phase==='results')
          ? ['races-finished','races-won'] : ['races-finished']
        : [];
    case 'dome': {
      const touched=Object.values(evidence.touches).some(Boolean);
      return touched ? evidence.won&&Object.values(evidence.goals).some(n=>n>0)
        ? ['dome-matches','dome-wins'] : ['dome-matches'] : [];
    }
    case 'site': return [];
  }
}

/** Use the accepted order *before* the stop; matched stops change it in place. */
export function deliveryTierFamilies(order:Order,rooftop:boolean):AchievementTierId[] {
  if(order.stage==='pickup')return order.elapsed<order.pickupEstimate?['pickups','early-pickups']:['pickups'];
  const families:AchievementTierId[]=['deliveries'];
  if(order.elapsed<order.estimate)families.push('early-deliveries');
  if(rooftop)families.push('rooftop-deliveries');
  return families;
}

/** Project a tier event alongside its wallet transaction. */
export function applyTierProgress(delivery:DeliveryState,progress:AchievementTierProgress,ids:readonly AchievementTierId[],groupWithReward=false):AchievementTierProgress {
  const result=applyAchievementTierEvent(progress,ids);
  if(result.cash){
    delivery.cash+=result.cash;
    delivery.lifetimeIncome+=result.cash;
    updateLevel(delivery);
    const prior=delivery.lastReward;
    if(groupWithReward&&prior&&(prior.kind==='supply-repair'||prior.kind==='supply-air')){
      delivery.lastReward={...prior,amount:prior.amount+result.cash};
    }else if(groupWithReward&&prior&&['pickup','pickup-research','delivery','delivery-research'].includes(prior.kind)){
      delivery.lastReward={id:prior.id,kind:prior.kind==='pickup'||prior.kind==='pickup-research'?'pickup-research':'delivery-research',amount:prior.amount+result.cash};
    }else delivery.lastReward={id:(prior?.id??0)+1,kind:'research',amount:result.cash};
  }
  return result.progress;
}

/** Apply both legacy and repeatable rewards to the same accepted delivery. */
export function applyAcceptedDelivery(delivery:DeliveryState,state:AchievementState,progress:AchievementTierProgress,
  orderBefore:Order,rooftop:boolean,customer:string|undefined,sameTickReward:boolean){
  const before=state.unlocked.length;
  applyDeliveryAwards(delivery,state,rooftop,customer,sameTickReward);
  const next=applyTierProgress(delivery,progress,deliveryTierFamilies(orderBefore,rooftop),sameTickReward);
  applyAchievementAwards(delivery,state,[]);
  return {progress:next,awards:state.unlocked.slice(before)};
}

/** Apply one already validated, server-observed physical or match event. */
export function applyObservedAchievement(delivery:DeliveryState,state:AchievementState,progress:AchievementTierProgress,evidence:AchievementEvidence){
  const before=state.unlocked.length;
  applyAchievementAwards(delivery,state,evaluateAchievementEvidence(state.unlocked,evidence));
  const next=applyTierProgress(delivery,progress,achievementTierFamilies(evidence));
  applyAchievementAwards(delivery,state,[]);
  return {progress:next,awards:state.unlocked.slice(before)};
}
