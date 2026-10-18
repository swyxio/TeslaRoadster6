import type { AchievementId, AchievementState } from '../shared/achievements';

/** Reports only awards earned in this room, including several between snapshots. */
export class AchievementEventTracker {
  private lastId = 0;

  reset(): void { this.lastId=0; }

  update(state: Pick<AchievementState, 'unlocked' | 'lastUnlock'>): AchievementId[] {
    const id=state.lastUnlock?.id??0;
    if(!Number.isSafeInteger(id)||id<=this.lastId)return [];
    // Saved awards have no room event. New awards append in event order.
    const count=Math.min(id-this.lastId,state.unlocked.length);
    this.lastId=id;
    return count?state.unlocked.slice(-count):[];
  }
}
