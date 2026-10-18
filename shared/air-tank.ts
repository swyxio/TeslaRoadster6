/** Fictional arcade tank capacity in shared air units. */
export type TankLevel = 1|2|3|4|5;
export const MAX_TANK_LEVEL:TankLevel=5;
export function tankCapacity(level:TankLevel):number{return 25*2**level;}
/** Air is represented as a percentage of this vehicle's installed tank. */
export function airCost(units:number,level:TankLevel):number{return units*100/tankCapacity(level);}
export function tankUpgradePrice(level:TankLevel):number{return 1_500*2**(level-1);}
/** Bounded fictional flight load, based on the fleet's in-game mass estimates. */
export function flightLoad(massKg:number):number{return Math.max(1,Math.min(1.2,Math.sqrt(massKg/2_000)));}
