import './style.css';
import { FleetPreview } from './fleet-preview';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from '../shared/vehicles';
import { GameScene } from './scene';
import { Session } from './session';
import { Controls } from './controls';
import { STATIONS } from '../shared/stations';
import { type Entity } from '../shared/game';
import { BRIDGES, MAP_BOUNDS, REGIONS, ROADS } from '../shared/map';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
<canvas id="world" aria-label="Poly AV 3D driving world"></canvas>
<div class="vignette"></div>
<header class="topbar"><a class="brand" href="/" aria-label="Poly AV home"><span class="brand-icon">↗</span> POLY<span class="brand-light">AV</span><span class="alpha">POLY AVENUE / 02</span></a><div class="top-actions"><span id="connection" class="pill"><i></i> SOLO PLAYGROUND</span><button id="menu-button" class="icon-button" aria-label="Open menu">☰</button></div></header>
<section id="menu" class="menu">
 <div class="intro"><div class="eyebrow"><span class="line"></span> SAN FRANCISCO BAY AREA</div><h1>Many rides.<br>Zero <em>commitment.</em></h1><p class="intro-copy">A low-poly love letter to San Francisco.<br>Catch a ride. Catch air. See other vehicles.</p>
 <div class="feature-row"><span>01 / DRIVE</span><span>02 / FLY</span><span>03 / AUTONOMY</span></div>
 <div class="launch-card"><div class="card-heading"><span class="eyebrow">YOUR NEXT DETOUR</span><span class="online-dot">● FREE ROAM</span></div>
 <label class="ride-select">STARTING RIDE<select id="starting-ride" aria-label="Starting vehicle"></select></label><p class="ride-note" id="starting-spec"></p>
 <button id="solo" class="primary">Take a solo drive <span>↗</span></button>
 <div class="room-form"><label>DRIVER NAME<input id="name" maxlength="24" placeholder="Your callsign" value="Driver" autocomplete="nickname"></label><label>ROOM CODE<input id="room" maxlength="32" placeholder="sunset-crew" pattern="[a-z0-9-]+" value="sunset-crew" autocapitalize="none" spellcheck="false"></label></div>
 <button id="join" class="secondary">Drive with friends <span>→</span></button><p class="form-note" id="form-note" role="status">Same room code, same playground. No account needed.</p>
 <button id="resume" class="text-button hidden">← Back to your drive</button>
 </div>
 <p class="fine-print">An independent arcade prototype. Fictional flight & air service.<br>Real Supercharger sites. A deliberately remixed Bay Area.</p>
 </div>
 <aside class="world-caption"><span class="eyebrow">37°46′ N &nbsp; 122°25′ W</span><h2>Open relationships.<br>Open roads.</h2><span class="caption-rule"></span><p>TESLA · WAYMO · CRUISE · ZOOX</p></aside>
</section>
<section id="hud" class="hidden" aria-label="Driving instruments">
 <div class="mission"><span class="eyebrow">NO ROUTE REQUIRED</span><strong id="mission">Hold SPACE to leave the road.</strong><span id="hint">Stop at a mint ring to refill your air tanks.</span></div>
 <div class="drive-actions"><button id="invite">↗ Invite</button><button id="camera">◉ Camera</button><button id="interact">F · Exit car</button><button id="recover">R · Unstuck</button><button id="autopilot" aria-pressed="false">V · AV off</button><button id="fleet">G · Fleet</button></div>
 <div class="map-panel"><div class="map-title">THE BAY <span>N ↑</span></div><canvas id="minimap" width="240" height="240" aria-label="Map: San Francisco, Oakland, Marin and bridges; mint dots are Superchargers, orange arrow is you"></canvas><div class="map-key"><i></i> AIR STATIONS <span id="players">1 DRIVER</span></div></div>
 <div class="telemetry"><div class="vehicle-title"><span id="vehicle">TESLA ROADSTER</span><span id="flight" class="flight">GROUNDED</span></div><div id="handling" class="handling"></div><div class="speed"><strong id="speed">000</strong><span>KM/H<br><b id="altitude">0 M ALT</b></span></div><div class="meter-row"><span>AIR TANK</span><div class="meter"><i id="air-bar"></i></div><b id="air">100%</b></div><div class="meter-row health"><span>CONDITION</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div id="station-status">Find a Supercharger to refill</div></div>
 <div class="keyboard-help"><kbd>W A S D</kbd> drive <kbd>SPACE</kbd> lift <kbd>SHIFT</kbd> boost <kbd>Q / E</kbd> roll <kbd>B</kbd> brake <kbd>V</kbd> autopilot <kbd>G</kbd> fleet</div>
 <div class="touch-controls"><div class="steering"><button data-control="KeyA" aria-label="Steer left">◀</button><button data-control="KeyD" aria-label="Steer right">▶</button><button data-control="KeyS" aria-label="Reverse">REV</button><button data-control="KeyB" aria-label="Brake">STOP</button></div><div class="touch-flight"><button data-control="KeyQ" aria-label="Roll left">↶</button><button data-control="KeyE" aria-label="Roll right">↷</button></div><div class="pedals"><button data-control="ShiftLeft">BOOST</button><button data-control="Space">LIFT ↑</button><button class="accelerate" data-control="KeyW">DRIVE ↑</button></div></div>
</section>
<dialog id="fleet-dialog" aria-labelledby="fleet-title"><div class="fleet-header"><div><span class="eyebrow">THE POLYCULE / VEHICLE COLLECTION</span><h2 id="fleet-title">See other vehicles.</h2></div><button id="fleet-close" aria-label="Close fleet">✕</button></div><p class="fleet-intro">Every model is driving around town and parked nearby. Borrow one, or choose your next ride here.</p><div class="fleet-body"><div id="fleet-list" class="fleet-list"></div><aside class="fleet-detail"><span id="fleet-brand" class="eyebrow"></span><h3 id="fleet-name"></h3><p id="fleet-status"></p><canvas id="fleet-preview" aria-label="Selected low-poly vehicle model"></canvas><dl id="fleet-specs"></dl><p id="fleet-estimates"></p><a id="fleet-source" target="_blank" rel="noopener noreferrer">View design source ↗</a><button id="fleet-drive" class="primary">Take this ride →</button><p class="form-note" id="fleet-feedback" role="status">Stop on the ground before changing rides.</p></aside></div></dialog>
<div id="notice" class="notice hidden" role="status"></div>
<div id="error" class="error hidden" role="alert"><h2>Let’s get you back on the road.</h2><p id="error-copy"></p><button id="retry" class="primary">Rejoin room</button><button id="error-solo" class="secondary">Drive solo</button><button id="error-menu" class="text-button">Back to menu</button></div>
`;
let selectedVehicle:VehicleId='roadster';
const startingSelect=$<HTMLSelectElement>('starting-ride');
for(const brand of ['Tesla','Waymo','Cruise','Zoox']){const group=document.createElement('optgroup');group.label=brand;for(const id of VEHICLE_IDS.filter(id=>VEHICLES[id].brand===brand)){const option=document.createElement('option');option.value=id;option.textContent=VEHICLES[id].name;group.append(option);}startingSelect.append(group);}
startingSelect.value=selectedVehicle;
function updateStarting(){selectedVehicle=startingSelect.value as VehicleId;const spec=VEHICLES[selectedVehicle];$('starting-spec').textContent=`${Math.round(spec.massKg).toLocaleString()} kg · ${spec.fourWheelSteering?'4-wheel':'Front-wheel'} steering · ${spec.airThrusters?'Air thrusters':'Autonomous cruise'}`;}
startingSelect.onchange=updateStarting;updateStarting();
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
  if(solo){session.solo(selectedVehicle);history.replaceState(null,'',location.pathname);}else{session.join(room,$<HTMLInputElement>('name').value.trim()||'Driver',selectedVehicle);history.replaceState(null,'',`?room=${encodeURIComponent(room)}`);}
  started=true;$('error').classList.add('hidden');toggleMenu(false);
}
$('solo').onclick=()=>begin(true);$('error-solo').onclick=()=>begin(true);$('join').onclick=()=>begin(false);$('retry').onclick=()=>begin(false);
$('resume').onclick=()=>toggleMenu(false);$('menu-button').onclick=()=>{if(started)toggleMenu(!menu);};
$('error-menu').onclick=()=>{$('error').classList.add('hidden');session.solo();toggleMenu(true);};
function action(type:'interact'|'reset'|'camera'|'menu'|'autopilot'|'fleet'){
  if(type==='fleet'){openFleet();return;}
  if(type==='menu')toggleMenu(!menu);else if(type==='camera')scene.wideCamera=!scene.wideCamera;else session.action(type);
}
controls.onAction=action;
$('autopilot').onclick=()=>action('autopilot');$('fleet').onclick=()=>openFleet();
$('interact').onclick=()=>action('interact');$('recover').onclick=()=>action('reset');$('camera').onclick=()=>action('camera');
let noticeTimer=0;
function notice(message:string){$('notice').textContent=message;$('notice').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=window.setTimeout(()=>$('notice').classList.add('hidden'),4000);}
$('invite').onclick=async()=>{
  if(session.status==='solo'){toggleMenu(true);notice('Choose a room and press Drive with friends first.');return;}
  try{await navigator.clipboard.writeText(location.href);notice('Invite link copied. Send it to your crew.');}catch{notice('Copy the address in your browser to invite a friend.');}
};
const map=$<HTMLCanvasElement>('minimap').getContext('2d')!;
const mapBase=document.createElement('canvas');mapBase.width=240;mapBase.height=240;
const base=mapBase.getContext('2d')!,scale=210/(MAP_BOUNDS.maxX-MAP_BOUNDS.minX);
const px=(x:number)=>15+(x-MAP_BOUNDS.minX)*scale,pz=(z:number)=>25+(z-MAP_BOUNDS.minZ)*scale;
base.fillStyle='#315965';base.fillRect(0,0,240,240);
for(const r of REGIONS){base.beginPath();r.points.forEach((p,i)=>i?base.lineTo(px(p.x),pz(p.z)):base.moveTo(px(p.x),pz(p.z)));base.closePath();base.fillStyle=r.id==='marin'||r.id==='yerba'?'#819981':'#b5b4a3';base.fill();}
base.fillStyle='#6e7b78';for(const road of ROADS)base.fillRect(px(road.x-road.w/2),pz(road.z-road.d/2),road.w*scale,road.d*scale);
base.strokeStyle='#d6c7a6';base.lineWidth=2;for(const b of BRIDGES){base.beginPath();if(b.axis==='x'){base.moveTo(px(b.start),pz(b.center));base.lineTo(px(b.end),pz(b.center));}else{base.moveTo(px(b.center),pz(b.start));base.lineTo(px(b.center),pz(b.end));}base.stroke();}
base.font='bold 7px system-ui';base.fillStyle='#eef0d9';base.fillText('MARIN',px(-300),pz(-460));base.fillText('SF',px(-120),pz(0));base.fillText('OAKLAND',px(385),pz(-150));
function minimap(entity:Entity|undefined){
  map.drawImage(mapBase,0,0);
  STATIONS.forEach(s=>{map.beginPath();map.arc(px(s.x),pz(s.z),2.8,0,Math.PI*2);map.fillStyle='#a8f1cb';map.fill();});
  session.world.entities.filter(e=>e.npc&&!e.driver).forEach(e=>{map.fillStyle='#71cdd5';map.fillRect(px(e.x)-1,pz(e.z)-1,2,2);});
  session.world.players.forEach(p=>{const e=session.world.entities.find(e=>e.id===p.entityId);if(!e||p.id===session.id)return;map.beginPath();map.arc(px(e.x),pz(e.z),3,0,Math.PI*2);map.fillStyle='#eee5ce';map.fill();});
  if(entity){map.save();map.translate(px(entity.x),pz(entity.z));map.rotate(-entity.yaw);map.beginPath();map.moveTo(0,-6);map.lineTo(-4,5);map.lineTo(0,3);map.lineTo(4,5);map.closePath();map.fillStyle='#ffbe66';map.fill();map.restore();}
}

const fleetDialog=$<HTMLDialogElement>('fleet-dialog');
let previewVehicle:VehicleId='roadster';
let fleetPreview:FleetPreview|undefined;
function showVehicle(id:VehicleId){
  previewVehicle=id;fleetPreview??=new FleetPreview($<HTMLCanvasElement>('fleet-preview'));fleetPreview.show(id);const spec=VEHICLES[id];$('fleet-brand').textContent=spec.brand;$('fleet-name').textContent=spec.name;$('fleet-status').textContent=spec.status;
  $('fleet-specs').replaceChildren();
  for(const [label,value] of [['Length × width × height',`${spec.length.toFixed(2)} × ${spec.width.toFixed(2)} × ${spec.height.toFixed(2)} m`],['Simulation mass',`${spec.massKg.toLocaleString()} kg`],['Wheelbase',`${spec.wheelbase.toFixed(2)} m`],['Steering',spec.fourWheelSteering?'Four-wheel steering':'Front-wheel steering'],['Arcade top speed',`${Math.round(spec.maxSpeed*3.6)} km/h`],['Air thrusters',spec.airThrusters?'Fictional flight enabled':'Not fitted']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('fleet-specs').append(dt,dd);}
  $('fleet-estimates').textContent=spec.estimates.join(' ');$<HTMLAnchorElement>('fleet-source').href=spec.sourceUrls[0];
  document.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.vehicle===id)));
}
for(const id of VEHICLE_IDS){const spec=VEHICLES[id],button=document.createElement('button');button.dataset.vehicle=id;button.textContent=spec.name;button.style.setProperty('--vehicle-color',`#${spec.color.toString(16).padStart(6,'0')}`);button.onclick=()=>showVehicle(id);$('fleet-list').append(button);}
function openFleet(){controls.clear();controls.enabled=false;const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);showVehicle(entity&&entity.kind!=='person'?entity.kind:selectedVehicle);fleetDialog.showModal();}
function closeFleet(){fleetDialog.close();controls.clear();controls.enabled=!menu;}
$('fleet-close').onclick=closeFleet;fleetDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu;});
$('fleet-drive').onclick=()=>{const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);if(!entity||entity.y>.5||Math.abs(entity.speed)>1){$('fleet-feedback').textContent='Brake to a stop on the ground, then choose your ride.';return;}session.selectVehicle(previewVehicle);selectedVehicle=previewVehicle;startingSelect.value=previewVehicle;updateStarting();closeFleet();notice('Ride requested. Manual controls are fictional on wheel-less robotaxis.');};
scene.start(dt=>{
  const input=controls.read();session.tick(dt,input);scene.render(session.world,session.id,dt,menu,input.lift);
  hudTime+=dt;if(hudTime<.1)return;hudTime=0;
  $('connection').textContent=session.status==='online'?`● LIVE / ${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`:session.status==='connecting'?'◌ JOINING ROOM…':session.status==='disconnected'?'○ DISCONNECTED':'● SOLO PLAYGROUND';
  if(session.status==='disconnected'){controls.clear();controls.enabled=false;$('error').classList.remove('hidden');$('error-copy').textContent=session.error;}
  const player=session.world.players.find(p=>p.id===session.id),e=session.world.entities.find(e=>e.id===player?.entityId);
  if(!e)return;
  $('speed').textContent=Math.round(Math.abs(e.speed)*3.6).toString().padStart(3,'0');$('altitude').textContent=`${Math.round(e.y)} M ALT`;
  const spec=e.kind==='person'?null:VEHICLES[e.kind];
  $('vehicle').textContent=spec?.name.toUpperCase()??'ON FOOT';
  $('handling').textContent=spec?`${Math.round(spec.massKg).toLocaleString()} kg · ${spec.fourWheelSteering?'4-wheel steer':'Front steer'}${e.autopilot?' · AUTONOMOUS':''}`:'';
  $('autopilot').textContent=e.autopilot?'V · AV on':'V · AV off';$('autopilot').setAttribute('aria-pressed',String(e.autopilot));$<HTMLButtonElement>('autopilot').disabled=e.kind==='person';
  $('flight').textContent=e.y>1?'AIRBORNE':'GROUNDED';$('flight').classList.toggle('flying',e.y>1);
  $('air').textContent=`${Math.round(e.air)}%`;$('air-bar').style.width=`${e.air}%`;$('health').textContent=`${Math.round(e.health)}%`;$('health-bar').style.width=`${e.health}%`;
  $('interact').textContent=e.kind==='person'?'F · Take nearby car':'F · Exit car';
  const nearest=STATIONS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const distance=Math.hypot(e.x-nearest.x,e.z-nearest.z),refilling=distance<9&&e.y<1&&Math.abs(e.speed)<1&&e.kind!=='person';
  $('station-status').textContent=refilling?`ϟ REFILLING AIR · ${nearest.name}`:`ϟ ${nearest.name} · ${Math.round(distance)} m`;
  $('station-status').classList.toggle('refilling',refilling);
  const touch=matchMedia('(pointer: coarse), (max-width: 800px)').matches;
  $('mission').textContent=e.kind==='person'?'Your next situationship has four wheels.':e.autopilot?'Hands off. The AV has this block.':e.y>2?'The sky is part of the street.':!spec?.airThrusters?'Try autonomous cruise on a street.':e.air<20?'Low air. Find a mint Supercharger ring.':touch?'Hold LIFT to leave the road.':'Hold SPACE to leave the road.';
  $('hint').textContent=e.kind==='person'?'Get near a parked or NPC car. Tap Take nearby car.':e.autopilot?'Steer, accelerate, or brake to take over.':!spec?.airThrusters?(touch?'Tap AV to cruise. Fleet lets you try every model.':'Press V to cruise. Press G to try every model.'):'Stop inside a mint ring to refill your air tanks.';
  if(e.kind!=='person'&&!e.autopilot&&e.y<2&&e.x>30&&e.x<80&&e.z>45&&e.z<75){$('mission').textContent='Cross the Bay Bridge to Oakland.';$('hint').textContent='Follow the road over the water.';}
  $('air').textContent=spec?.airThrusters?`${Math.round(e.air)}%`:'—';$('air-bar').style.width=spec?.airThrusters?`${e.air}%`:'0%';
  $('players').textContent=`${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`;minimap(e);
});
