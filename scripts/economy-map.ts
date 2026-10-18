/** Draw the article's map from the same polygons, roads and landmarks as the game.
 * Run: pnpm exec tsx scripts/economy-map.ts */
import { writeFileSync } from 'node:fs';
import { BRIDGES, BUILDINGS, FREMONT_SPACEPORT, HIGHWAYS, LANDMARKS, MAP_BOUNDS, REGIONS, ROCKET_ISLAND, type MapPoint } from '../shared/map';
import { DOME } from '../shared/dome';

const width=1200, height=1530, scale=.103;
const x=(v:number)=>600+(v-300)*scale;
const y=(v:number)=>170+(v-MAP_BOUNDS.minZ)*scale;
const f=(v:number)=>v.toFixed(1);
const pt=(p:MapPoint)=>`${f(x(p.x))},${f(y(p.z))}`;
const place=(id:string)=>LANDMARKS.find(p=>p.id===id)!;
const building=(style:string)=>BUILDINGS.find(p=>p.style===style)!;
const markers=[
  {n:1,name:'North Bay Playground',sub:'Races, ramps & ferry',p:{x:200,z:-1700},side:'left',labelY:245},
  {n:2,name:'Golden Gate Bridge',sub:'Marin to San Francisco',p:{x:-240,z:-330},side:'left',labelY:323},
  {n:3,name:'UCSF · Homes Lab',sub:'Property & building',p:place('ucsf'),side:'left',labelY:401},
  {n:4,name:'Salesforce Tower',sub:'Downtown San Francisco',p:building('salesforce'),side:'left',labelY:479},
  {n:5,name:'SFO · Flight Lab',sub:'Airport & flight research',p:place('sfo'),side:'left',labelY:590},
  {n:6,name:'Stanford · Speed Lab',sub:'Hoover Tower & the Quad',p:place('stanford'),side:'left',labelY:864},
  {n:7,name:'UC Berkeley · Energy Lab',sub:'The Campanile',p:place('berkeley'),side:'right',labelY:245},
  {n:8,name:'Oakland Tribune Tower',sub:'Downtown Oakland',p:building('tribune'),side:'right',labelY:323},
  {n:9,name:'Bay Bridge',sub:'San Francisco to Oakland',p:{x:195,z:60},side:'right',labelY:401},
  {n:10,name:'Rocket Dome',sub:'China Basin',p:DOME,side:'right',labelY:479},
  {n:11,name:'Fremont Spaceport',sub:'Starship launch pad',p:FREMONT_SPACEPORT.entrance,side:'right',labelY:1070},
  {n:12,name:'San José City Hall',sub:'The South Bay',p:place('san-jose-city-hall'),side:'right',labelY:1340},
] as const;
const polygon=(points:MapPoint[])=>points.map(pt).join(' ');
const lines=HIGHWAYS.map(road=>`<polyline points="${polygon(road.points)}" fill="none" stroke="#e6bc7b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
const bridges=BRIDGES.map(b=>{
 const start=b.axis==='x'?{x:b.start,z:b.center}:{x:b.center,z:b.start};
 const end=b.axis==='x'?{x:b.end,z:b.center}:{x:b.center,z:b.end};
 return `<polyline points="${pt(start)} ${pt(end)}" fill="none" stroke="#f2c47d" stroke-width="3"/>`;
}).join('');
const regions=REGIONS.map(region=>`<polygon points="${polygon(region.points)}" fill="${region.id===ROCKET_ISLAND.id?'#a1bc98':'#b3c4a5'}" stroke="#d8dbc1" stroke-width="1.2"/>`).join('');
const labels=markers.map(m=>{
 const left=m.side==='left', cx=left?44:890, tx=cx+23, edge=left?325:875;
 const px=x(m.p.x),py=y(m.p.z);
 return `<path d="M${f(px)} ${f(py)} L${edge} ${m.labelY}" fill="none" stroke="#d1e1d1" stroke-opacity=".66" stroke-width="1.6"/><circle cx="${f(px)}" cy="${f(py)}" r="5" fill="#ffcc83" stroke="#153942" stroke-width="2"/><circle cx="${cx}" cy="${m.labelY}" r="14" fill="#ffcb83"/><text x="${cx}" y="${m.labelY+5}" text-anchor="middle" class="number">${m.n}</text><text x="${tx}" y="${m.labelY-3}" class="place">${m.name}</text><text x="${tx}" y="${m.labelY+17}" class="detail">${m.sub.replaceAll('&','&amp;')}</text>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">The Tesland Bay, from North Bay Playground to San José</title><desc id="desc">A labeled map showing four research sites, the Golden Gate and Bay bridges, downtown towers, Rocket Dome, Fremont Spaceport and San José City Hall.</desc>
<style>.eyebrow{font:700 15px system-ui;letter-spacing:3px;fill:#afd0bf}.heading{font:700 44px system-ui;fill:#fff0dc;letter-spacing:-1px}.place{font:700 19px system-ui;fill:#fff1df}.detail{font:15px system-ui;fill:#b6cebf}.number{font:700 13px system-ui;fill:#173b40}</style>
<rect width="${width}" height="${height}" rx="24" fill="#173b40"/><rect x="350" y="165" width="500" height="${f((MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ)*scale)}" rx="12" fill="#2d6670"/>
<text x="44" y="58" class="eyebrow">EXPLORE THE BAY</text><text x="44" y="112" class="heading">A world full of destinations</text>
${regions}${lines}${bridges}${labels}
<text x="44" y="1480" class="detail">Coastlines, roads and locations follow Tesland's compressed game map.</text></svg>`;
writeFileSync('public/blog/economy/bay-landmarks.svg',svg);
