import { DAY_LENGTH_SECONDS } from './day';
import type { Player } from './game';
import { updateLevel } from './delivery';

export const OTA_FEE = 100;
export const OTA_INTERVAL = DAY_LENGTH_SECONDS / 24;
export type OtaSubscription = { enabled:boolean; active:boolean; renewAt:number|null; needsRenewalConsent:boolean };
export type SavedOtaSubscription = { enabled:boolean; active:boolean; remaining:number; needsRenewalConsent?:boolean };
export function initialOta():OtaSubscription { return {enabled:false,active:false,renewAt:null,needsRenewalConsent:false}; }
export function restoreOta(saved:SavedOtaSubscription,now:number):OtaSubscription {
  const needsRenewalConsent=saved.needsRenewalConsent??saved.enabled;
  const active=saved.active&&saved.remaining>0;
  return {enabled:saved.enabled&&!needsRenewalConsent,active,renewAt:active?now+saved.remaining:null,needsRenewalConsent};
}

// A paid period remains valid until renewal. Failed renewals never create debt.
export function updateOta(player:Player, now:number):void {
  const ota=player.delivery.ota;
  // A live state from before the price change has no consent flag. Keep its
  // paid period, but require an explicit subscription for the new rate.
  if(ota.needsRenewalConsent===undefined){ota.needsRenewalConsent=ota.enabled;ota.enabled=false;}
  if(!ota.enabled){
    if(ota.active && (ota.renewAt===null || now>=ota.renewAt)){ota.active=false;ota.renewAt=null;}
    return;
  }
  if(ota.active && ota.renewAt!==null && now<ota.renewAt)return;
  if(player.delivery.cash>=OTA_FEE){
    player.delivery.cash-=OTA_FEE;updateLevel(player.delivery);ota.active=true;ota.renewAt=now+OTA_INTERVAL;
  }else{ota.active=false;ota.renewAt=null;}
}
export function setOta(player:Player, enabled:boolean, now:number):void {
  const ota=player.delivery.ota;
  if(ota.needsRenewalConsent===undefined){ota.needsRenewalConsent=ota.enabled;ota.enabled=false;}
  if(ota.enabled===enabled)return;
  ota.enabled=enabled;ota.needsRenewalConsent=false;
  if(enabled)updateOta(player,now);
  else {ota.active=false;ota.renewAt=null;}
}
