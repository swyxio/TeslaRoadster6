import { STARSHIP_GOAL } from '../shared/starship';

/** The visual is based only on the last confirmed global income, never room donations. */
export function constructionFraction(total:number|null):number|null {
  if(total===null||!Number.isFinite(total)||total<0)return null;
  return Math.min(1,total/STARSHIP_GOAL);
}
