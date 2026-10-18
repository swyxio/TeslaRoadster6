import assert from 'node:assert/strict';
import test from 'node:test';
import { BILLBOARDS, BILLBOARD_DESIGNS, BILLBOARD_WIDTH } from '../shared/billboards';
import { BUILDINGS, FERRY_DOCKS, REGIONS, ROADS, terrainHeight } from '../shared/map';
import { STATIONS } from '../shared/stations';
import { SHOPS } from '../shared/upgrades';
import { CUSTOMERS, RESTAURANTS } from '../shared/delivery';
import { PARKING_LOTS } from '../shared/parking-lots';
import { FERRY_DECK } from '../shared/ferry';
import { contact } from '../shared/physics';

// A billboard is decorative, so its footprint must not cover a paved road,
// blocking building or a visible service/delivery target.
test('fictional roadside billboards stay grounded and clear of shared gameplay',()=>{
  assert.ok(BILLBOARDS.length>=20);
  assert.ok(BILLBOARDS.some(board=>board.z<300),'a board is visible before the first regional unlock');
  assert.deepEqual(new Set(BILLBOARDS.map(board=>board.route)),new Set(['US 101','I-880']));
  assert.equal(new Set(BILLBOARD_DESIGNS.map(design=>design.company)).size,BILLBOARD_DESIGNS.length);
  for(const board of BILLBOARDS){
    assert.ok(BILLBOARD_DESIGNS[board.design]);
    const c=Math.cos(board.yaw),s=Math.sin(board.yaw);
    for(const offset of [-BILLBOARD_WIDTH/2,-4,0,4,BILLBOARD_WIDTH/2]){
      const x=board.x+c*offset,z=board.z-s*offset;
      assert.notEqual(terrainHeight(x,z),null);
      for(const r of ROADS){
        const angle=r.angle??0,dx=x-r.x,dz=z-r.z;
        const across=dx*Math.cos(angle)-dz*Math.sin(angle),along=dx*Math.sin(angle)+dz*Math.cos(angle);
        const distance=Math.hypot(Math.max(0,Math.abs(across)-r.w/2),Math.max(0,Math.abs(along)-r.d/2));
        assert.ok(distance>=3,`billboard over road at ${x}, ${z}`);
      }
      for(const b of BUILDINGS)assert.ok(Math.abs(x-b.x)>=b.w/2+8||Math.abs(z-b.z)>=b.d/2+8,`billboard overlaps building at ${x}, ${z}`);
      for(const marker of [...STATIONS,...SHOPS,...RESTAURANTS,...CUSTOMERS])assert.ok(Math.hypot(x-marker.x,z-marker.z)>=20,`billboard overlaps marker at ${x}, ${z}`);
    }
  }
});

test('billboard frames leave the parking lots, approaches and SF ferry dock clear',()=>{
  const apron=REGIONS.find(region=>region.id==='sf-ferry-apron')!;
  const xs=apron.points.map(point=>point.x),zs=apron.points.map(point=>point.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const areas=[
    ...PARKING_LOTS.flatMap(lot=>[{...lot.area,name:lot.id},{...lot.approach,name:`${lot.id} approach`}]),
    {name:'SF ferry apron',x:(minX+maxX)/2,z:(minZ+maxZ)/2,yaw:0,width:maxX-minX,length:maxZ-minZ},
    {name:'SF docked ferry',x:FERRY_DOCKS.sf.x,z:FERRY_DOCKS.sf.deckZ,yaw:0,width:FERRY_DECK.width,length:FERRY_DECK.length},
  ];
  for(const billboard of BILLBOARDS)for(const area of areas){
    const frame={x:billboard.x,z:billboard.z,yaw:billboard.yaw,w:BILLBOARD_WIDTH+.35,d:.35};
    const protectedArea={x:area.x,z:area.z,yaw:area.yaw,w:area.width+4,d:area.length+4};
    assert.equal(contact(frame,protectedArea),null,`${billboard.route} billboard overlaps ${area.name}`);
  }
});
