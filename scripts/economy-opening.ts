// An opening-session ledger using the actual delivery and achievement rules.
// Run: pnpm exec tsx scripts/economy-opening.ts [--json] [--write-chart]
import { writeFileSync } from 'node:fs';
import { initialAchievements, applyAchievementAwards, applyDeliveryAwards } from '../shared/achievements';
import { applyDeliveryStop, initialDelivery, orderTarget } from '../shared/delivery';
import type { Player } from '../shared/game';
import { terrainHeight } from '../shared/map';
import { OTA_FEE, setOta, updateOta } from '../shared/ota';
import { PAINTS } from '../shared/vehicle-style';

type Strategy = { name:string; pickup:number; dropoff:number; shop?:boolean };
const strategies:Strategy[] = [
  {name:'Quick delivery',pickup:10,dropoff:30},
  {name:'Steady delivery',pickup:20,dropoff:55},
  {name:'Steady + OTA and paint',pickup:20,dropoff:55,shop:true},
  {name:'Leisurely delivery',pickup:30,dropoff:90},
];

function run(strategy:Strategy) {
  const delivery=initialDelivery({x:0,z:0});
  const achievements=initialAchievements();
  const player={delivery} as Player;
  const startingCash=delivery.cash;
  let spent=0;
  if(strategy.shop) {
    // The driver begins at a workshop, applies Ember once and starts OTA.
    delivery.cash-=PAINTS.ember.price;
    spent+=PAINTS.ember.price;
    const before=delivery.cash;
    setOta(player,true,0);
    spent+=before-delivery.cash;
  }
  let nextEvent=strategy.pickup;
  const points:{minute:number;cash:number;gross:number;spent:number;deliveries:number;achievements:number}[]=[];
  for(let second=1;second<=300;second++) {
    const beforeOta=delivery.cash;
    updateOta(player,second);
    spent+=beforeOta-delivery.cash;
    if(second===nextEvent) {
      const stage=delivery.order.stage;
      const target=orderTarget(delivery.order);
      const y=terrainHeight(target.x,target.z);
      if(y===null||target.rooftop)throw new Error(`Expected a supported ground stop: ${target.name}`);
      delivery.order.elapsed=stage==='pickup'?strategy.pickup:strategy.dropoff;
      const paid=applyDeliveryStop(delivery,{x:target.x,y,z:target.z,vy:0,speed:0,supportId:'ground',kind:'roadster',canFly:false});
      if(!paid)throw new Error(`Failed to apply ${stage} at ${target.name}`);
      if(stage==='pickup') applyAchievementAwards(delivery,achievements,[]);
      else applyDeliveryAwards(delivery,achievements,false,undefined,true);
      nextEvent=second+(stage==='pickup'?strategy.dropoff:strategy.pickup);
    }
    if(second%60===0) {
      if(delivery.cash!==startingCash+delivery.lifetimeIncome-spent)throw new Error('Opening ledger does not balance');
      points.push({minute:second/60,cash:delivery.cash,gross:delivery.lifetimeIncome,spent,deliveries:delivery.completed,achievements:achievements.unlocked.length});
    }
  }
  return {name:strategy.name,pickupSeconds:strategy.pickup,dropoffSeconds:strategy.dropoff,startingCash,
    openingSpend:strategy.shop?PAINTS.ember.price+OTA_FEE:0,points};
}

const results=strategies.map(run);
if(process.argv.includes('--write-chart')) {
  const colors=['#1660a1','#13846d','#b05092','#9a5a1e'];
  const max=Math.ceil(Math.max(...results.flatMap(result=>result.points.map(point=>point.cash)))/5000)*5000;
  const x=(minute:number)=>90+minute*114, y=(cash:number)=>328-cash/max*235;
  const grid=Array.from({length:max/5000+1},(_,i)=>{
    const value=i*5000,at=y(value);
    return `<line x1="90" x2="660" y1="${at}" y2="${at}" stroke="#d5dfe4"/><text x="80" y="${at+5}" text-anchor="end" fill="#536575">$${value/1000}k</text>`;
  }).join('');
  const paths=results.map((result,index)=>{
    const points=[{minute:0,cash:result.startingCash-result.openingSpend},...result.points];
    return `<polyline fill="none" stroke="${colors[index]}" stroke-width="3" points="${points.map(point=>`${x(point.minute)},${y(point.cash).toFixed(1)}`).join(' ')}"/>`;
  }).join('');
  const ticks=Array.from({length:6},(_,i)=>`<text x="${x(i)}" y="353" text-anchor="middle" fill="#536575">${i}</text>`).join('');
  const legends=results.map((result,index)=>`<line x1="${index%2?365:90}" x2="${index%2?390:115}" y1="${385+Math.floor(index/2)*28}" y2="${385+Math.floor(index/2)*28}" stroke="${colors[index]}" stroke-width="4"/><text x="${index%2?399:124}" y="${390+Math.floor(index/2)*28}">${result.name}</text>`).join('');
  writeFileSync('public/blog/economy/opening-wallet.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 445" role="img" aria-labelledby="title description"><title id="title">The first five minutes</title><desc id="description">Four delivery paths show wallet cash at one-minute intervals, using current delivery and achievement rules and assumed task times. A steady delivery path with paint and OTA spends $1,050 by minute five.</desc><rect width="720" height="445" rx="16" fill="white"/><g font-family="system-ui,sans-serif" font-size="15" fill="#253441"><text x="24" y="37" font-size="25" font-weight="700">The first five minutes</text><text x="24" y="64" fill="#536575">Wallet cash at each minute · assumed delivery times</text>${grid}${paths}${ticks}<text x="375" y="374" text-anchor="middle" fill="#536575">Minutes of active play</text>${legends}</g></svg>\n`);
  writeFileSync('public/blog/economy/opening-wallet.json',JSON.stringify(results,null,2)+'\n');
}
if(process.argv.includes('--json'))console.log(JSON.stringify(results,null,2));
else console.table(results.map(({name,points})=>({name,cash1m:points[0].cash,gross1m:points[0].gross,awards1m:points[0].achievements,
  deliveries5m:points[4].deliveries,cash5m:points[4].cash,gross5m:points[4].gross,spent5m:points[4].spent,awards5m:points[4].achievements})));
