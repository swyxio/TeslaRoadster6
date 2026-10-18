import './style.css';
import { GameScene } from './scene';
import { Session } from './session';
import { Controls } from './controls';
import { STATIONS } from '../shared/stations';
import { BUILDINGS, type Entity } from '../shared/game';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
<canvas id="world" aria-label="Bay Drive 3D driving world"></canvas>
<div class="vignette"></div>
<header class="topbar"><a class="brand" href="/" aria-label="Bay Drive home"><span class="brand-icon">↗</span> BAY<span class="brand-light">DRIVE</span><span class="alpha">PLAYGROUND / 01</span></a><div class="top-actions"><span id="connection" class="pill"><i></i> SOLO PLAYGROUND</span><button id="menu-button" class="icon-button" aria-label="Open menu">☰</button></div></header>
<section id="menu" class="menu">
 <div class="intro"><div class="eyebrow"><span class="line"></span> SAN FRANCISCO BAY AREA</div><h1>The road is<br>just the <em>start.</em></h1><p class="intro-copy">Take the Roadster beyond the asphalt.<br>Find your crew. Make your own way.</p>
 <div class="feature-row"><span>01 / DRIVE</span><span>02 / FLY</span><span>03 / EXPLORE</span></div>
 <div class="launch-card"><div class="card-heading"><span class="eyebrow">YOUR NEXT DETOUR</span><span class="online-dot">● FREE ROAM</span></div>
 <button id="solo" class="primary">Take a solo drive <span>↗</span></button>
 <div class="room-form"><label>DRIVER NAME<input id="name" maxlength="24" placeholder="Your callsign" value="Driver" autocomplete="nickname"></label><label>ROOM CODE<input id="room" maxlength="32" placeholder="sunset-crew" pattern="[a-z0-9-]+" value="sunset-crew" autocapitalize="none" spellcheck="false"></label></div>
 <button id="join" class="secondary">Drive with friends <span>→</span></button><p class="form-note" id="form-note" role="status">Same room code, same playground. No account needed.</p>
 <button id="resume" class="text-button hidden">← Back to your drive</button>
 </div>
 <p class="fine-print">An independent arcade prototype. Fictional flight & air service.<br>Real Supercharger sites. A deliberately remixed Bay Area.</p>
 </div>
 <aside class="world-caption"><span class="eyebrow">37°46′ N &nbsp; 122°25′ W</span><h2>A little less traffic.<br>A lot more possibility.</h2><span class="caption-rule"></span><p>TESLA ROADSTER / AIR THRUST EDITION</p></aside>
</section>
<section id="hud" class="hidden" aria-label="Driving instruments">
 <div class="mission"><span class="eyebrow">NO ROUTE REQUIRED</span><strong id="mission">Hold SPACE to leave the road.</strong><span id="hint">Stop at a mint ring to refill your air tanks.</span></div>
 <div class="drive-actions"><button id="invite">↗ Invite</button><button id="camera">◉ Camera</button><button id="interact">F · Exit car</button><button id="recover">R · Unstuck</button></div>
 <div class="map-panel"><div class="map-title">THE BAY <span>N ↑</span></div><canvas id="minimap" width="240" height="240" aria-label="Map: mint dots are Superchargers, orange arrow is you"></canvas><div class="map-key"><i></i> AIR STATIONS <span id="players">1 DRIVER</span></div></div>
 <div class="telemetry"><div class="vehicle-title"><span id="vehicle">TESLA ROADSTER</span><span id="flight" class="flight">GROUNDED</span></div><div class="speed"><strong id="speed">000</strong><span>KM/H<br><b id="altitude">0 M ALT</b></span></div><div class="meter-row"><span>AIR TANK</span><div class="meter"><i id="air-bar"></i></div><b id="air">100%</b></div><div class="meter-row health"><span>CONDITION</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div id="station-status">Find a Supercharger to refill</div></div>
 <div class="keyboard-help"><kbd>W A S D</kbd> drive <kbd>SPACE</kbd> lift <kbd>SHIFT</kbd> boost <kbd>Q / E</kbd> roll <kbd>B</kbd> brake</div>
 <div class="touch-controls"><div class="steering"><button data-control="KeyA" aria-label="Steer left">◀</button><button data-control="KeyD" aria-label="Steer right">▶</button><button data-control="KeyS" aria-label="Reverse">REV</button><button data-control="KeyB" aria-label="Brake">STOP</button></div><div class="touch-flight"><button data-control="KeyQ" aria-label="Roll left">↶</button><button data-control="KeyE" aria-label="Roll right">↷</button></div><div class="pedals"><button data-control="ShiftLeft">BOOST</button><button data-control="Space">LIFT ↑</button><button class="accelerate" data-control="KeyW">DRIVE ↑</button></div></div>
</section>
<div id="notice" class="notice hidden" role="status"></div>
<div id="error" class="error hidden" role="alert"><h2>Let’s get you back on the road.</h2><p id="error-copy"></p><button id="retry" class="primary">Rejoin room</button><button id="error-solo" class="secondary">Drive solo</button><button id="error-menu" class="text-button">Back to menu</button></div>
`;
const session = new Session();
const controls = new Controls();
let scene: GameScene;
try { scene = new GameScene($<HTMLCanvasElement>('world')); }
catch { $('error').classList.remove('hidden'); $('error-copy').textContent='This device could not start WebGL. Enable hardware acceleration or try another browser.'; $('retry').hidden=true; $('error-solo').hidden=true; throw new Error('WebGL unavailable'); }
let menu = true, started = false, hudTime = 0;
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam && /^[a-z0-9][a-z0-9-]{0,31}$/.test(roomParam)) $<HTMLInputElement>('room').value=roomParam;
function toggleMenu(show: boolean) {menu=show;controls.enabled=!show;controls.clear();$('menu').classList.toggle('hidden',!show);$('hud').classList.toggle('hidden',show);$('resume').classList.toggle('hidden',!started);$('menu-button').setAttribute('aria-label',show?'Close menu':'Open menu');}
function begin(solo:boolean){
  const room=$<HTMLInputElement>('room').value.trim().toLowerCase();
  if(!solo&&!/^[a-z0-9][a-z0-9-]{0,31}$/.test(room)){ $('form-note').textContent='Start with a letter or number; use up to 32 lowercase letters, numbers, or hyphens.';return; }
  if(solo){session.solo();history.replaceState(null,'',location.pathname);}else{session.join(room,$<HTMLInputElement>('name').value.trim()||'Driver');history.replaceState(null,'',`?room=${encodeURIComponent(room)}`);}
  started=true;$('error').classList.add('hidden');toggleMenu(false);
}
$('solo').onclick=()=>begin(true);$('error-solo').onclick=()=>begin(true);$('join').onclick=()=>begin(false);$('retry').onclick=()=>begin(false);
$('resume').onclick=()=>toggleMenu(false);$('menu-button').onclick=()=>{if(started)toggleMenu(!menu);};
$('error-menu').onclick=()=>{$('error').classList.add('hidden');session.solo();toggleMenu(true);};
function action(type:'interact'|'reset'|'camera'|'menu'){
  if(type==='menu')toggleMenu(!menu);else if(type==='camera')scene.wideCamera=!scene.wideCamera;else session.action(type);
}
controls.onAction=action;
$('interact').onclick=()=>action('interact');$('recover').onclick=()=>action('reset');$('camera').onclick=()=>action('camera');
let noticeTimer=0;
function notice(message:string){$('notice').textContent=message;$('notice').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=window.setTimeout(()=>$('notice').classList.add('hidden'),4000);}
$('invite').onclick=async()=>{
  if(session.status==='solo'){toggleMenu(true);notice('Choose a room and press Drive with friends first.');return;}
  try{await navigator.clipboard.writeText(location.href);notice('Invite link copied. Send it to your crew.');}catch{notice('Copy the address in your browser to invite a friend.');}
};
const map=$<HTMLCanvasElement>('minimap').getContext('2d')!;
function minimap(entity:Entity|undefined){
  const scale=.46,offset=120;
  map.fillStyle='#263c40';map.fillRect(0,0,240,240);
  map.fillStyle='#64706a';map.fillRect(9,9,222,222);
  map.strokeStyle='#34484b';map.lineWidth=6;
  for(let a=-180;a<=180;a+=60){map.beginPath();map.moveTo(a*scale+offset,9);map.lineTo(a*scale+offset,231);map.moveTo(9,a*scale+offset);map.lineTo(231,a*scale+offset);map.stroke();}
  map.fillStyle='#99a092';BUILDINGS.forEach(b=>map.fillRect((b.x-b.w/2)*scale+offset,(b.z-b.d/2)*scale+offset,b.w*scale,b.d*scale));
  STATIONS.forEach(s=>{map.beginPath();map.arc(s.x*scale+offset,s.z*scale+offset,3,0,Math.PI*2);map.fillStyle='#a8f1cb';map.fill();});
  session.world.players.forEach(p=>{const e=session.world.entities.find(e=>e.id===p.entityId);if(!e||p.id===session.id)return;map.beginPath();map.arc(e.x*scale+offset,e.z*scale+offset,3,0,Math.PI*2);map.fillStyle='#eee5ce';map.fill();});
  if(entity){map.save();map.translate(entity.x*scale+offset,entity.z*scale+offset);map.rotate(-entity.yaw);map.beginPath();map.moveTo(0,-6);map.lineTo(-4,5);map.lineTo(0,3);map.lineTo(4,5);map.closePath();map.fillStyle='#ffbe66';map.fill();map.restore();}
}
scene.start(dt=>{
  const input=controls.read();session.tick(dt,input);scene.render(session.world,session.id,dt,menu,input.lift);
  hudTime+=dt;if(hudTime<.1)return;hudTime=0;
  $('connection').textContent=session.status==='online'?`● LIVE / ${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`:session.status==='connecting'?'◌ JOINING ROOM…':session.status==='disconnected'?'○ DISCONNECTED':'● SOLO PLAYGROUND';
  if(session.status==='disconnected'){controls.clear();controls.enabled=false;$('error').classList.remove('hidden');$('error-copy').textContent=session.error;}
  const player=session.world.players.find(p=>p.id===session.id),e=session.world.entities.find(e=>e.id===player?.entityId);
  if(!e)return;
  $('speed').textContent=Math.round(Math.abs(e.speed)*3.6).toString().padStart(3,'0');$('altitude').textContent=`${Math.round(e.y)} M ALT`;
  $('vehicle').textContent={roadster:'TESLA ROADSTER',coupe:'GOLDEN COUPE',truck:'BAY UTILITY',person:'ON FOOT'}[e.kind];
  $('flight').textContent=e.y>1?'AIRBORNE':'GROUNDED';$('flight').classList.toggle('flying',e.y>1);
  $('air').textContent=`${Math.round(e.air)}%`;$('air-bar').style.width=`${e.air}%`;$('health').textContent=`${Math.round(e.health)}%`;$('health-bar').style.width=`${e.health}%`;
  $('interact').textContent=e.kind==='person'?'F · Take nearby car':'F · Exit car';
  const nearest=STATIONS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const distance=Math.hypot(e.x-nearest.x,e.z-nearest.z),refilling=distance<9&&e.y<1&&Math.abs(e.speed)<1&&e.kind!=='person';
  $('station-status').textContent=refilling?`ϟ REFILLING AIR · ${nearest.name}`:`ϟ ${nearest.name} · ${Math.round(distance)} m`;
  $('station-status').classList.toggle('refilling',refilling);
  const touch=matchMedia('(pointer: coarse), (max-width: 800px)').matches;
  $('mission').textContent=e.kind==='person'?'A different ride is around the corner.':e.y>2?'The sky is part of the street.':e.air<20?'Low air. Find a mint Supercharger ring.':touch?'Hold LIFT to leave the road.':'Hold SPACE to leave the road.';
  $('hint').textContent=e.kind==='person'?'Stop beside an empty car and tap Take nearby car.':e.y>2?(touch?'Hold ↶ / ↷ to roll. Release LIFT to land.':'Hold Q / E to roll. Release SPACE to land.'):'Stop inside a mint ring to refill your air tanks.';
  $('players').textContent=`${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`;minimap(e);
});
