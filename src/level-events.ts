import type { DeliveryState, Level } from '../shared/delivery';

type DeliveryLevel = Pick<DeliveryState, 'level' | 'lifetimeIncome' | 'lastReward'>;
type LevelBaseline = {level:number; eligibleIncome:number; afterSnapshot:number};

/** Distinguishes a loaded cash level from level changes earned in the room. */
export class LevelEventTracker {
  private level?: Level;
  private rewardId=0;
  private baseline?: LevelBaseline;

  reset(): void { this.level=undefined;this.rewardId=0;this.baseline=undefined; }
  restore(baseline:LevelBaseline): void { this.baseline=baseline; }

  update(delivery:DeliveryLevel,snapshot:number): 'up' | 'down' | null {
    const baseline=this.baseline;
    if(baseline&&snapshot<=baseline.afterSnapshot)return null;
    const freshReward=(delivery.lastReward?.id??0)>this.rewardId;
    let previous:number|undefined=this.level;
    // A reward already included in the binding wallet belongs to the current
    // guest, which can be saved while its latest room snapshot is still in flight.
    if(baseline&&!(freshReward&&delivery.lifetimeIncome<=baseline.eligibleIncome))previous=baseline.level;
    this.baseline=undefined;
    this.level=delivery.level;
    this.rewardId=Math.max(this.rewardId,delivery.lastReward?.id??0);
    if(previous===undefined)return null;
    if(delivery.level>previous&&freshReward)return 'up';
    if(delivery.level<previous)return 'down';
    return null;
  }
}
