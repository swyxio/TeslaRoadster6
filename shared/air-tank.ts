/** Fictional arcade tank capacity relative to the original 100-unit tank. */
export type TankLevel = 1|2|3|4|5;
export const MAX_TANK_LEVEL:TankLevel=5;
export function tankCapacity(level:TankLevel):number{return 100*2**level;}
/** Air is represented as a percentage of this vehicle's installed tank. */
export function airCost(units:number,level:TankLevel):number{return units*100/tankCapacity(level);}
export function tankUpgradePrice(level:TankLevel):number{return 30*2**(level-1);}
