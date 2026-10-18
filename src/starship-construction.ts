import { STARSHIP_GOAL } from '../shared/starship';

/** The visual is based only on the last confirmed global income, never room donations. */
export function constructionFraction(total:number|null):number|null {
  if(total===null||!Number.isFinite(total)||total<0)return null;
  return Math.min(1,total/STARSHIP_GOAL);
}

/** Radius at the top of the built portion of the 13 m tapered nose. */
export function constructionNoseRadius(height:number):number {
  return 4.5*(1-Math.max(0,Math.min(13,height))/13);
}
