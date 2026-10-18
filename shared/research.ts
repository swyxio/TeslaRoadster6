import type { Entity, Player } from './game';
import { LANDMARKS } from './map';
import { tankUpgradePrice } from './air-tank';
import { UPGRADES, type UpgradeId } from './upgrades';

// Short free-roam detours. Discounts apply only after the matching visit.
export const RESEARCH_SITES = [
  { landmark:'ucsf', achievement:'ucsf-research', cash:250, upgrade:null, discount:0 },
  { landmark:'berkeley', achievement:'berkeley-research', cash:400, upgrade:'economy', discount:.2 },
  { landmark:'stanford', achievement:'stanford-research', cash:600, upgrade:'motor', discount:.2 },
  { landmark:'sfo', achievement:'sfo-ground-crew', cash:600, upgrade:'tank', discount:.2 },
] as const;

export function researchArrival(site:typeof RESEARCH_SITES[number]) {
  return LANDMARKS.find(place=>place.id===site.landmark)!.arrival;
}

export function upgradePrice(player:Player, car:Entity, upgrade:UpgradeId):number {
  const base=upgrade==='tank'?tankUpgradePrice(car.tankLevel):UPGRADES[upgrade].price;
  const research=RESEARCH_SITES.find(site=>site.upgrade===upgrade&&player.achievements.unlocked.includes(site.achievement));
  return research?Math.round(base*(1-research.discount)):base;
}
