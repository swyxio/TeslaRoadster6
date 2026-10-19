/** Draw the article's map from the same polygons, roads and landmarks as the game.
 * Run: pnpm exec tsx scripts/economy-map.ts */
import { writeFileSync } from 'node:fs';
import { BRIDGES, BUILDINGS, FREMONT_SPACEPORT, HIGHWAYS, LANDMARKS, MAP_BOUNDS, REGIONS, ROCKET_ISLAND, type MapPoint } from '../shared/map';
import { DOME } from '../shared/dome';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { TECH_CAMPUSES } from '../shared/tech-campuses';
import { EAST_SOUTH_ADDITIONS } from '../shared/east-south-additions';
import { NEW_LANDMARKS } from '../shared/new-landmarks';

const width=1200, height=1530, scale=.103;
const x=(v:number)=>600+(v-300)*scale;
const y=(v:number)=>170+(v-MAP_BOUNDS.minZ)*scale;
const f=(v:number)=>v.toFixed(1);
const pt=(p:MapPoint)=>`${f(x(p.x))},${f(y(p.z))}`;
const place=(id:string)=>LANDMARKS.find(p=>p.id===id)!;
const building=(style:string)=>BUILDINGS.find(p=>p.style===style)!;
const station=(id:string)=>CALTRAIN_STOPS.find(p=>p.id===id)!;
const campus=(id:string)=>TECH_CAMPUSES.find(p=>p.id===id)!;
const destination=(id:string)=>EAST_SOUTH_ADDITIONS.find(p=>p.id===id)!;
const newPlace=(id:string)=>NEW_LANDMARKS.find(p=>p.id===id)!;
const markers=[
  {n:1,name:'North Bay Playground',sub:'Races, ramps & ferry',p:{x:200,z:-1700},side:'left',labelY:245},
  {n:2,name:'Golden Gate Bridge',sub:'Marin to San Francisco',p:{x:-240,z:-330},side:'left',labelY:315},
  {n:3,name:'UCSF · Homes Lab',sub:'Property & building',p:place('ucsf'),side:'left',labelY:385},
  {n:4,name:'Coit Tower',sub:'Telegraph Hill',p:building('coit'),side:'left',labelY:455},
  {n:5,name:'Salesforce Tower',sub:'Downtown San Francisco',p:building('salesforce'),side:'left',labelY:525},
  {n:6,name:'SFO · Flight Lab',sub:'Airport & flight research',p:place('sfo'),side:'left',labelY:650},
  {n:7,name:'Stanford · Speed Lab',sub:'Hoover Tower & the Quad',p:place('stanford'),side:'left',labelY:850},
  {n:8,name:'UC Berkeley · Energy Lab',sub:'The Campanile',p:place('berkeley'),side:'right',labelY:245},
  {n:9,name:'Oakland Tribune Tower',sub:'Downtown Oakland',p:building('tribune'),side:'right',labelY:315},
  {n:10,name:'Bay Bridge',sub:'San Francisco to Oakland',p:{x:195,z:60},side:'right',labelY:385},
  {n:11,name:'Ferry Building',sub:'San Francisco waterfront',p:building('ferry'),side:'right',labelY:455},
  {n:12,name:'Rocket Dome',sub:'China Basin',p:DOME,side:'right',labelY:525},
  {n:13,name:'Fremont Spaceport',sub:'Starship launch pad',p:FREMONT_SPACEPORT.entrance,side:'right',labelY:1070},
  {n:14,name:'San José City Hall',sub:'The South Bay',p:place('san-jose-city-hall'),side:'right',labelY:1340},
  {n:15,name:'Redwood City',sub:'Station, redwoods & downtown',p:station('redwood-city'),side:'left',labelY:740},
  {n:16,name:'Chabot Space Center',sub:'Oakland hills',p:destination('chabot-space'),side:'right',labelY:595},
  {n:17,name:'Oakland Zoo',sub:'East Bay',p:destination('oakland-zoo'),side:'right',labelY:665},
  {n:18,name:'NASA Ames',sub:'Mountain View',p:destination('nasa-ames'),side:'left',labelY:980},
  {n:19,name:'Levi’s Stadium',sub:'Santa Clara',p:destination('levis-stadium'),side:'right',labelY:1200},
  {n:20,name:'Apple Park',sub:'Cupertino',p:campus('apple'),side:'left',labelY:1180},
  {n:21,name:'Muir Woods',sub:'Marin-inspired grove',p:newPlace('muir-woods'),side:'left',labelY:595},
  {n:22,name:'USS Hornet Museum',sub:'Compressed East Bay',p:newPlace('new-uss-hornet'),side:'right',labelY:735},
] as const;
const polygon=(points:readonly MapPoint[])=>points.map(pt).join(' ');
const lines=HIGHWAYS.map(road=>`<polyline points="${polygon(road.points)}" fill="none" stroke="#e6bc7b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
const rail=`<polyline points="${polygon(CALTRAIN_TRACK)}" fill="none" stroke="#fff0cf" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>`;
const bridges=BRIDGES.map(b=>{
 const start=b.axis==='x'?{x:b.start,z:b.center}:{x:b.center,z:b.start};
 const end=b.axis==='x'?{x:b.end,z:b.center}:{x:b.center,z:b.end};
 return `<polyline points="${pt(start)} ${pt(end)}" fill="none" stroke="#f2c47d" stroke-width="3"/>`;
}).join('');
const regions=REGIONS.map(region=>`<polygon points="${polygon(region.points)}" fill="${region.id===ROCKET_ISLAND.id?'#a1bc98':'#b3c4a5'}" stroke="#d8dbc1" stroke-width="1.2"/>`).join('');
const labels=markers.map(m=>{
 const left=m.side==='left', cx=left?44:890, tx=cx+23, edge=left?325:875;
 const px=x(m.p.x),py=y(m.p.z);
 return `<path d="M${f(px)} ${f(py)} L${edge} ${m.labelY}" fill="none" stroke="#d1e1d1" stroke-opacity=".66" stroke-width="1.6"/><circle cx="${f(px)}" cy="${f(py)}" r="5" fill="#ffcc83" stroke="#153942" stroke-width="2"/><circle cx="${cx}" cy="${m.labelY}" r="14" fill="#ffcb83"/><text x="${cx}" y="${m.labelY+5}" text-anchor="middle" class="number">${m.n}</text><text x="${tx}" y="${m.labelY-3}" class="place">${m.name.replaceAll('&','&amp;')}</text><text x="${tx}" y="${m.labelY+17}" class="detail">${m.sub.replaceAll('&','&amp;')}</text>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">The Tesland Bay, from North Bay Playground to San José</title><desc id="desc">The game map connects San Francisco, the East Bay and the Peninsula to San José. Stops include Redwood City's station, the four research sites, Chabot, Oakland Zoo, NASA Ames, Levi’s Stadium, Apple Park, Muir Woods and the USS Hornet, along with bridges and fictional attractions. A dashed line shows the decorative Caltrain tracks.</desc>
<style>.eyebrow{font:700 15px system-ui;letter-spacing:3px;fill:#afd0bf}.heading{font:700 44px system-ui;fill:#fff0dc;letter-spacing:-1px}.place{font:700 19px system-ui;fill:#fff1df}.detail{font:15px system-ui;fill:#b6cebf}.number{font:700 13px system-ui;fill:#173b40}</style>
<rect width="${width}" height="${height}" rx="24" fill="#173b40"/><rect x="350" y="165" width="500" height="${f((MAP_BOUNDS.maxZ-MAP_BOUNDS.minZ)*scale)}" rx="12" fill="#2d6670"/>
<text x="44" y="58" class="eyebrow">EXPLORE THE BAY</text><text x="44" y="112" class="heading">A world full of destinations</text>
${regions}${lines}${rail}${bridges}${labels}
<line x1="44" y1="1454" x2="79" y2="1454" stroke="#fff0cf" stroke-width="2" stroke-dasharray="5 5"/><text x="90" y="1459" class="detail">Caltrain tracks (decorative)</text><text x="44" y="1480" class="detail">Coastlines, roads and locations follow Tesland's compressed game map.</text><text x="44" y="1510" class="detail">Road traces © OpenStreetMap contributors · openstreetmap.org/copyright</text></svg>`;
writeFileSync('public/blog/economy/bay-landmarks.svg',svg);
