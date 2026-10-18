import { deliveryCheckpointReward } from './delivery-checkpoint';

/** IDs are scoped to the server-owned driver wallet, not a room connection. */
export type DeliveryPayoutComponent = Readonly<{
  sourceId:string;
  kind:'pickup'|'delivery'|'checkpoint';
  /** Server-derived amount before any event multiplier. */
  amount:number;
}>;
/** null defers an arrival until the authoritative rate can be determined. */
export type DeliveryPayoutResolver = (component:DeliveryPayoutComponent)=>number|null;
export type ResolvedDeliveryPayout = Readonly<{component:DeliveryPayoutComponent;amount:number}>;

function component(deliveryNumber:number,kind:DeliveryPayoutComponent['kind'],amount:number):DeliveryPayoutComponent {
  if(!Number.isSafeInteger(deliveryNumber)||deliveryNumber<1||!Number.isSafeInteger(amount)||amount<0)
    throw new RangeError('Delivery number and base pay must be valid whole numbers');
  const suffix=kind==='delivery'?'dropoff':kind;
  return {sourceId:`delivery:${deliveryNumber}:${suffix}`,kind,amount};
}

export function pickupPayout(deliveryNumber:number,amount:number):DeliveryPayoutComponent {
  return component(deliveryNumber,'pickup',amount);
}

export function dropoffPayouts(deliveryNumber:number,amount:number):DeliveryPayoutComponent[] {
  const parts:DeliveryPayoutComponent[]=[component(deliveryNumber,'delivery',amount)];
  const checkpoint=deliveryCheckpointReward(deliveryNumber);
  if(checkpoint)parts.push(component(deliveryNumber,'checkpoint',checkpoint));
  return parts;
}

/** Resolve eligible base pay before changing cash or evaluating milestones. */
export function resolveDeliveryPayout(component:DeliveryPayoutComponent,resolve?:DeliveryPayoutResolver):number|null {
  const amount=component.kind==='checkpoint'||!resolve?component.amount:resolve(component);
  if(amount===null)return null;
  if(!Number.isSafeInteger(amount)||amount<0)throw new RangeError('Resolved delivery pay must be a nonnegative whole-dollar amount');
  return amount;
}
