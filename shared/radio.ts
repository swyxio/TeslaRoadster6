export type RadioEpisode = { title:string; audio:string; link:string; publishedAt:number };
export const RADIO_CATALOG_VERSION = 4;

/** Two UTC calendar months, clamped to the destination month's last day. */
export function radioCutoff(now:number):number {
  const date=new Date(now),day=date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()-2);
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,lastDay));
  return date.getTime();
}

export function isRecentRadioEpisode(publishedAt:number,now:number):boolean {
  return Number.isFinite(publishedAt)&&publishedAt>=radioCutoff(now)&&publishedAt<=now;
}
