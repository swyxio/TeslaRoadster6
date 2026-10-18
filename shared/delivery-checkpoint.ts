/** Repeatable delivery checkpoint; call only after a completed drop-off. */
export const DELIVERY_CHECKPOINT_INTERVAL = 3;
export const DELIVERY_CHECKPOINT_REWARD = 750;

export function deliveryCheckpointReward(completed:number):number {
  return completed > 0 && completed % DELIVERY_CHECKPOINT_INTERVAL === 0 ? DELIVERY_CHECKPOINT_REWARD : 0;
}

export function deliveriesUntilCheckpoint(completed:number):number {
  return DELIVERY_CHECKPOINT_INTERVAL - completed % DELIVERY_CHECKPOINT_INTERVAL;
}
