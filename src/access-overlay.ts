import { ACCESS_ZONES } from '../shared/service-areas';
import type { MapPoint } from '../shared/map';

/** Fill the same polygons that define gameplay access, including the open SF lot. */
export function drawLockedAreas(ctx:CanvasRenderingContext2D,level:number,screen:(point:MapPoint)=>{x:number;y:number},color:string):void {
  const path=(points:readonly MapPoint[])=>{
    points.forEach((point,i)=>{const p=screen(point);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});
    ctx.closePath();
  };
  ctx.fillStyle=color;
  for(const zone of ACCESS_ZONES){
    if(zone.level<=level)continue;
    ctx.beginPath();path(zone.points);
    for(const hole of zone.holes??[])path(hole);
    ctx.fill('evenodd');
  }
}
