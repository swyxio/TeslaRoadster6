import { DAY_LENGTH_SECONDS } from './day';
import type { Player } from './game';
import { updateLevel } from './delivery';

export const OTA_FEE = 5;
export const OTA_INTERVAL = DAY_LENGTH_SECONDS / 24;
export type OtaSubscription = { enabled:boolean; active:boolean; renewAt:number|null };
export function initialOta():OtaSubscription { return {enabled:false,active:false,renewAt:null}; }

// A paid period remains valid until renewal. Failed renewals never create debt.
export function updateOta(player:Player, now:number):void {
  const ota=player.delivery.ota;
  if(!ota.enabled || (ota.active && ota.renewAt!==null && now<ota.renewAt))return;
  if(player.delivery.cash>=OTA_FEE){
    player.delivery.cash-=OTA_FEE;updateLevel(player.delivery);ota.active=true;ota.renewAt=now+OTA_INTERVAL;
  }else{ota.active=false;ota.renewAt=null;}
}
export function setOta(player:Player, enabled:boolean, now:number):void {
  const ota=player.delivery.ota;
  if(ota.enabled===enabled)return;
  ota.enabled=enabled;ota.active=false;ota.renewAt=null;
  if(enabled)updateOta(player,now);
}
