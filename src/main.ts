import './style.css';
import { FleetPreview } from './fleet-preview';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from '../shared/vehicles';
import { GameScene } from './scene';
import { Session } from './session';
import { Controls } from './controls';
import { GameAudio } from './audio';
import { STATIONS } from '../shared/stations';
import { type Entity } from '../shared/game';
import { BRIDGES, MAP_BOUNDS, REGIONS, ROADS, STUNT_LOOP } from '../shared/map';
import { orderTarget, payoutFor, pickupBonusFor } from '../shared/delivery';
import { celebrateReward, resetCelebration } from './rewards';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import type { Ticket } from '../shared/delivery';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
<canvas id="world" aria-label="Poly AV 3D driving world"></canvas>
<div class="vignette"></div>
<header class="topbar"><a class="brand" href="/" aria-label="Poly AV home"><span class="brand-icon">↗</span> POLY<span class="brand-light">AV</span><span class="alpha">POLY AVENUE / 02</span></a><div class="top-actions"><span id="connection" class="pill"><i></i> SOLO PLAYGROUND</span><button id="sound-button" class="icon-button sound-button" aria-label="Sound settings" aria-haspopup="dialog">♫</button><button id="menu-button" class="icon-button" aria-label="Open menu">☰</button></div></header>
<section id="menu" class="menu">
 <div class="intro"><div class="eyebrow"><span class="line"></span> SAN FRANCISCO BAY AREA</div><h1>Many rides.<br>Zero <em>commitment.</em></h1><p class="intro-copy">A low-poly love letter to San Francisco.<br>Deliver food. Catch air. Make your own shortcuts.</p>
 <div class="feature-row"><span>01 / DRIVE</span><span>02 / FLY</span><span>03 / DELIVER</span></div>
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
 <div id="reward" class="reward" role="status" aria-live="polite" aria-atomic="true"><div class="confetti" aria-hidden="true"></div><div class="reward-card"><span id="reward-label"></span><strong id="reward-amount"></strong></div></div>
 <div id="achievement-toast" class="achievement-toast hidden" role="status" aria-live="polite"></div>
 <div class="mission" aria-live="polite"><span class="eyebrow" id="mission-label">PICK UP</span><strong id="mission">Find your first restaurant.</strong><span id="hint">Stop at the glowing marker.</span><span id="delivery-stats"></span><span id="police-status"></span></div>
 <div class="drive-actions"><button id="invite">↗ Invite</button><button id="camera">◉ Camera</button><button id="interact">F · Exit car</button><button id="recover">R · Unstuck</button><button id="autopilot" aria-pressed="false">V · AV off</button><button id="fleet">G · Fleet</button><button id="scores">L · Scores</button><button id="awards">T · Awards</button></div>
 <div class="map-panel"><div class="map-title">THE BAY <span>N ↑</span></div><canvas id="minimap" width="240" height="240" aria-label="Map: San Francisco, Oakland, Marin and bridges; mint dots are Superchargers, yellow ring is your delivery, red dots are police, orange arrow is you"></canvas><div class="map-key"><b>▲ YOU</b> <i></i> AIR STATIONS <span id="players">1 DRIVER</span></div></div>
 <div class="telemetry"><div class="vehicle-title"><span id="vehicle">TESLA ROADSTER</span><span id="flight" class="flight">GROUNDED</span></div><div id="handling" class="handling"></div><div class="speed"><strong id="speed">000</strong><span>KM/H<br><b id="altitude">0 M ALT</b></span></div><div class="meter-row"><span>AIR TANK</span><div class="meter"><i id="air-bar"></i></div><b id="air">100%</b></div><div class="meter-row health"><span>CONDITION</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div id="station-status">Find a Supercharger to refill</div></div>
 <div class="keyboard-help"><kbd>W A S D</kbd> drive / pitch / bank <kbd>SPACE</kbd> brake · steer to drift <kbd>J</kbd> jump <kbd>X</kbd> flip <kbd>H</kbd> hover <kbd>SHIFT</kbd> boost <kbd>Q / E</kbd> roll <kbd>V</kbd> autopilot <kbd>G</kbd> fleet <kbd>L</kbd> scores <kbd>T</kbd> awards</div>
 <div class="touch-controls"><div class="steering"><button data-control="KeyA" aria-label="Steer left">◀</button><button data-control="KeyD" aria-label="Steer right">▶</button><button data-control="KeyS" aria-label="Reverse; steer while moving forward to drift">REV</button><button data-control="Space" aria-label="Brake; steer while moving forward to drift">BRAKE</button></div><div class="touch-flight"><button data-control="KeyQ" aria-label="Roll left">↶</button><button data-control="KeyE" aria-label="Roll right">↷</button><button class="hover-control" data-control="KeyH" aria-label="Hold to hover">HOVER</button></div><div class="pedals"><button data-control="ShiftLeft">BOOST</button><button id="jump-control" data-control="KeyJ" aria-label="Jump">JUMP ↑</button><button id="drive-control" class="accelerate" data-control="KeyW" aria-label="Drive">DRIVE ↑</button></div></div>
</section>
<dialog id="fleet-dialog" aria-labelledby="fleet-title"><div class="fleet-header"><div><span class="eyebrow">THE POLYCULE / VEHICLE COLLECTION</span><h2 id="fleet-title">See other vehicles.</h2></div><button id="fleet-close" aria-label="Close fleet">✕</button></div><p class="fleet-intro">Every model is driving around town and parked nearby. Borrow one, or choose your next ride here.</p><div class="fleet-body"><div id="fleet-list" class="fleet-list"></div><aside class="fleet-detail"><span id="fleet-brand" class="eyebrow"></span><h3 id="fleet-name"></h3><p id="fleet-status"></p><canvas id="fleet-preview" aria-label="Selected low-poly vehicle model"></canvas><dl id="fleet-specs"></dl><p id="fleet-estimates"></p><a id="fleet-source" target="_blank" rel="noopener noreferrer">View design source ↗</a><button id="fleet-drive" class="primary">Take this ride →</button><p class="form-note" id="fleet-feedback" role="status">Stop on the ground before changing rides.</p></aside></div></dialog>
<dialog id="scores-dialog" aria-labelledby="scores-title"><div class="fleet-header"><div><span class="eyebrow">YOUR ROOM / ACTIVE DRIVERS</span><h2 id="scores-title">Delivery leaderboard</h2></div><button id="scores-close" aria-label="Close leaderboard">✕</button></div><p class="fleet-intro">Ranked by cash. The clock counts active play, with a short grace period when you stop. Scores last only while you are in this session.</p><div class="score-head"><span>DRIVER</span><span>CASH</span><span>ACTIVE</span><span>PER MIN</span></div><ol id="scores-list" class="scores-list"></ol></dialog>
<dialog id="awards-dialog" aria-labelledby="awards-title"><div class="fleet-header"><div><span class="eyebrow">YOUR SESSION / LITTLE VICTORIES</span><h2 id="awards-title">Achievements</h2></div><button id="awards-close" aria-label="Close achievements">✕</button></div><p class="fleet-intro">Explore, take the scenic route, and earn these once per session.</p><ul id="awards-list" class="awards-list"></ul></dialog>
<dialog id="sound-dialog" class="sound-dialog" aria-labelledby="sound-title"><div class="fleet-header"><div><span class="eyebrow">YOUR MIX / POLY AV RADIO</span><h2 id="sound-title">Sound settings</h2></div><button id="sound-close" aria-label="Close sound settings">✕</button></div><p class="fleet-intro">An original little soundtrack, plus sounds for your drive. Adjust them anytime.</p><div class="sound-sliders"><label>Master <output id="master-value"></output><input id="master-volume" type="range" min="0" max="100" aria-label="Master volume"></label><label>Music <output id="music-value"></output><input id="music-volume" type="range" min="0" max="100" aria-label="Music volume"></label><label>Effects <output id="effects-value"></output><input id="effects-volume" type="range" min="0" max="100" aria-label="Effects volume"></label></div><div class="sound-actions"><button id="sound-mute" aria-pressed="false">Mute all</button><button id="sound-test">Test sound</button></div><p id="sound-status" class="form-note" role="status">Sound starts when you begin a drive.</p></dialog>
<dialog id="ticket-dialog" class="ticket-dialog" aria-labelledby="ticket-title" aria-describedby="ticket-copy"><div class="ticket-icon" aria-hidden="true">!</div><span class="ticket-kicker">POLICE CITATION / FLIGHT ON PUBLIC ROADS</span><h2 id="ticket-title">Busted.</h2><p id="ticket-copy">Flying over public roads put people at risk. Police stopped your run and issued a citation.</p><strong id="ticket-amount" class="ticket-amount"></strong><div id="ticket-detail" class="ticket-detail"></div><p class="ticket-footnote">The fine has been deducted from your earnings. Longer, higher flights and repeat offenses cost more.</p><button id="ticket-acknowledge" class="primary">Acknowledge citation &amp; continue →</button></dialog>
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
const audio = new GameAudio();
const soundDialog=$<HTMLDialogElement>('sound-dialog');
function refreshSoundSettings(){
  for(const name of ['master','music','effects'] as const){$<HTMLInputElement>(`${name}-volume`).value=String(audio.settings[name]);$(`${name}-value`).textContent=`${audio.settings[name]}%`;}
  $('sound-mute').setAttribute('aria-pressed',String(audio.settings.muted));
  $('sound-button').textContent=audio.settings.muted?'♪̸':'♫';
}
for(const name of ['master','music','effects'] as const){
  $<HTMLInputElement>(`${name}-volume`).addEventListener('input',event=>{audio.setSettings({...audio.settings,[name]:Number((event.target as HTMLInputElement).value)});refreshSoundSettings();});
}
$('sound-mute').onclick=()=>{audio.setSettings({...audio.settings,muted:!audio.settings.muted});refreshSoundSettings();};
$('sound-test').onclick=()=>{void audio.unlock().then(ok=>{if(ok)audio.play('pickup');$('sound-status').textContent=!ok?'Sound is unavailable in this browser.':audio.settings.muted||!audio.settings.master||!audio.settings.effects?'Unmute and raise master and effects volume to hear the test.':'Test played.';});};
$('sound-button').onclick=()=>{controls.clear();controls.enabled=false;refreshSoundSettings();soundDialog.showModal();};
function closeSound(){soundDialog.close();controls.clear();controls.enabled=!menu&&session.status!=='disconnected';}
$('sound-close').onclick=closeSound;soundDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status!=='disconnected';});
document.addEventListener('visibilitychange',()=>{void audio.visibility(document.hidden);});
for(const event of ['pointerdown','keydown'] as const)window.addEventListener(event,()=>{if(audio.initialized)void audio.unlock();},{capture:true});
refreshSoundSettings();
let scene: GameScene;
try { scene = new GameScene($<HTMLCanvasElement>('world')); }
catch { $('error').classList.remove('hidden'); $('error-copy').textContent='This device could not start WebGL. Enable hardware acceleration or try another browser.'; $('retry').hidden=true; $('error-solo').hidden=true; throw new Error('WebGL unavailable'); }
let menu = true, started = false, hudTime = 0, lastRewardId = 0, lastTicketCount = 0;
let seenAchievements = new Set<AchievementId>(), achievementQueue:AchievementId[] = [], achievementTimer = 0;
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam && /^[a-z0-9][a-z0-9-]{0,31}$/.test(roomParam)) $<HTMLInputElement>('room').value=roomParam;
function toggleMenu(show: boolean) {menu=show;controls.enabled=!show;controls.clear();$('menu').classList.toggle('hidden',!show);$('hud').classList.toggle('hidden',show);$('resume').classList.toggle('hidden',!started);$('menu-button').setAttribute('aria-label',show?'Close menu':'Open menu');}
function begin(solo:boolean){
  const room=$<HTMLInputElement>('room').value.trim().toLowerCase();
  if(!solo&&!/^[a-z0-9][a-z0-9-]{0,31}$/.test(room)){ $('form-note').textContent='Start with a letter or number; use up to 32 lowercase letters, numbers, or hyphens.';return; }
  lastRewardId=0;lastTicketCount=0;resetCelebration();audio.reset();void audio.unlock();
  seenAchievements.clear();achievementQueue=[];clearTimeout(achievementTimer);achievementTimer=0;$('achievement-toast').classList.add('hidden');
  for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))dialog.close();
  controls.resetSequences();if(solo){session.solo(selectedVehicle);history.replaceState(null,'',location.pathname);}else{session.join(room,$<HTMLInputElement>('name').value.trim()||'Driver',selectedVehicle);history.replaceState(null,'',`?room=${encodeURIComponent(room)}`);}
  started=true;$('error').classList.add('hidden');toggleMenu(false);
}
$('solo').onclick=()=>begin(true);$('error-solo').onclick=()=>begin(true);$('join').onclick=()=>begin(false);$('retry').onclick=()=>begin(false);
$('resume').onclick=()=>toggleMenu(false);$('menu-button').onclick=()=>{if(started)toggleMenu(!menu);};
$('error-menu').onclick=()=>{$('error').classList.add('hidden');lastRewardId=0;resetCelebration();session.solo();toggleMenu(true);};
function action(type:'interact'|'reset'|'camera'|'menu'|'autopilot'|'fleet'|'scores'|'awards'){
  if(type==='awards'){openAwards();return;}
  if(type==='scores'){openScores();return;}
  if(type==='fleet'){openFleet();return;}
  if(type==='menu')toggleMenu(!menu);else if(type==='camera')scene.wideCamera=!scene.wideCamera;else session.action(type);
}
controls.onAction=action;
$('autopilot').onclick=()=>action('autopilot');$('fleet').onclick=()=>openFleet();$('scores').onclick=()=>openScores();$('awards').onclick=()=>openAwards();
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
base.fillStyle='#ffc77f';base.beginPath();base.arc(px(STUNT_LOOP.x),pz(STUNT_LOOP.z),3,0,Math.PI*2);base.fill();base.fillText('LOOP',px(STUNT_LOOP.x)+4,pz(STUNT_LOOP.z)-3);
function minimap(entity:Entity|undefined){
  map.drawImage(mapBase,0,0);
  STATIONS.forEach(s=>{map.beginPath();map.arc(px(s.x),pz(s.z),2.8,0,Math.PI*2);map.fillStyle='#a8f1cb';map.fill();});
  session.world.entities.filter(e=>e.npc&&!e.driver).forEach(e=>{map.fillStyle=e.police?'#ff7771':'#71cdd5';const size=e.police?4:2;map.fillRect(px(e.x)-size/2,pz(e.z)-size/2,size,size);});
  const player=session.world.players.find(p=>p.id===session.id);if(player){const target=orderTarget(player.delivery.order);map.beginPath();map.arc(px(target.x),pz(target.z),5,0,Math.PI*2);map.strokeStyle='#ffd384';map.lineWidth=2;map.stroke();}
  session.world.players.forEach(p=>{const e=session.world.entities.find(e=>e.id===p.entityId);if(!e||p.id===session.id)return;map.beginPath();map.arc(px(e.x),pz(e.z),3,0,Math.PI*2);map.fillStyle='#eee5ce';map.fill();});
  if(entity){
    map.save();map.translate(px(entity.x),pz(entity.z));
    const markerScale=Math.max(1,160/(map.canvas.clientWidth||160));map.scale(markerScale,markerScale);
    map.beginPath();map.arc(0,0,10,0,Math.PI*2);map.fillStyle='#17343bcc';map.fill();map.strokeStyle='#fff7de';map.lineWidth=2;map.stroke();
    map.rotate(-entity.yaw);map.beginPath();map.moveTo(0,-15);map.lineTo(-7,9);map.lineTo(0,5);map.lineTo(7,9);map.closePath();
    map.lineJoin='round';map.strokeStyle='#17343b';map.lineWidth=3;map.stroke();map.fillStyle='#ffbe66';map.fill();map.restore();
  }
}

const scoresDialog=$<HTMLDialogElement>('scores-dialog');
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const money=(amount:number)=>`${amount<0?'−':''}$${Math.abs(amount)}`;
function updateScores(){
  const list=$('scores-list');list.replaceChildren();
  for(const p of [...session.world.players].sort((a,b)=>b.delivery.cash-a.delivery.cash||a.delivery.activeSeconds-b.delivery.activeSeconds)){
    const row=document.createElement('li');
    for(const value of [p.name+(p.id===session.id&&p.name!=='You'?' (you)':''),money(p.delivery.cash),clock(p.delivery.activeSeconds),money(p.delivery.activeSeconds>=1?Math.round(p.delivery.cash*60/p.delivery.activeSeconds):0)]){
      const cell=document.createElement('span');cell.textContent=value;row.append(cell);
    }
    list.append(row);
  }
}
function openScores(){controls.clear();controls.enabled=false;updateScores();scoresDialog.showModal();}
function closeScores(){scoresDialog.close();controls.clear();controls.enabled=!menu;}
$('scores-close').onclick=closeScores;scoresDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu;});

const awardsDialog=$<HTMLDialogElement>('awards-dialog');
const ticketDialog=$<HTMLDialogElement>('ticket-dialog');
function updateAwards(){
  const player=session.world.players.find(p=>p.id===session.id),list=$('awards-list');list.replaceChildren();
  for(const [id,award] of Object.entries(ACHIEVEMENTS)){
    const unlocked=player?.achievements.unlocked.includes(id as AchievementId)??false;
    const row=document.createElement('li');row.className=unlocked?'unlocked':'';
    const badge=document.createElement('span');badge.className='award-icon';badge.textContent=unlocked?'★':'◇';
    const copy=document.createElement('div'),name=document.createElement('strong'),description=document.createElement('p');name.textContent=award.name;description.textContent=award.description;copy.append(name,description);
    const status=document.createElement('span');status.className='award-status';status.textContent=unlocked?'EARNED':'TO DISCOVER';row.append(badge,copy,status);list.append(row);
  }
}
function openAwards(){controls.clear();controls.enabled=false;updateAwards();awardsDialog.showModal();}
function closeAwards(){awardsDialog.close();controls.clear();controls.enabled=!menu&&session.status!=='disconnected';}
$('awards-close').onclick=closeAwards;awardsDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status!=='disconnected';});
function announceAchievements(){
  const id=achievementQueue.shift();if(!id){achievementTimer=0;$('achievement-toast').classList.add('hidden');return;}
  $('achievement-toast').textContent=`★ ACHIEVEMENT UNLOCKED · ${ACHIEVEMENTS[id].name}`;$('achievement-toast').classList.remove('hidden');
  achievementTimer=window.setTimeout(announceAchievements,3500);
}
function showTicket(ticket:Ticket){
  // A citation takes precedence over informational dialogs.
  if(awardsDialog.open)awardsDialog.close();if(scoresDialog.open)scoresDialog.close();if(fleetDialog.open)fleetDialog.close();if(soundDialog.open)soundDialog.close();
  controls.clear();controls.enabled=false;
  $('ticket-amount').textContent=`−${money(ticket.amount)}`;
  $('ticket-detail').textContent=`Offense #${ticket.offense} · ${ticket.flightSeconds}s airborne · ${ticket.peakHeight}m peak | Base $60 + flight $${ticket.durationFine+ticket.heightFine} + repeat $${ticket.repeatFine}`;
  ticketDialog.showModal();$<HTMLButtonElement>('ticket-acknowledge').focus();
}
ticketDialog.addEventListener('cancel',event=>event.preventDefault());
$('ticket-acknowledge').onclick=()=>{ticketDialog.close();controls.clear();controls.enabled=!menu&&session.status!=='disconnected';};

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
  const input=controls.read();session.tick(dt,input);audio.update(session.world,session.id,started&&!menu&&(session.status==='solo'||session.status==='online'));scene.render(session.world,session.id,dt,menu);
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
  const airborne=e.loopAngle===null&&e.y>.5;controls.airborne=airborne&&!!spec?.airThrusters;
  for(const control of ['KeyQ','KeyE','KeyH','ShiftLeft','KeyJ']){
    const button=document.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);if(button)button.disabled=!spec?.airThrusters;
  }
  $('flight').textContent=e.loopAngle!==null?'SUCTION':airborne?'AIRBORNE':'GROUNDED';$('flight').classList.toggle('flying',airborne||e.loopAngle!==null);
  $('jump-control').textContent=airborne?'AIR JUMP':'JUMP ↑';$('jump-control').setAttribute('aria-label',airborne?'Air jump':'Jump');
  $('drive-control').textContent=controls.airborne?'FLIP ↻':'DRIVE ↑';$('drive-control').setAttribute('aria-label',controls.airborne?'Flip':'Drive');
  document.querySelector('[data-control="KeyA"]')?.setAttribute('aria-label',airborne?'Bank left':'Steer left');document.querySelector('[data-control="KeyD"]')?.setAttribute('aria-label',airborne?'Bank right':'Steer right');
  $('air').textContent=`${Math.round(e.air)}%`;$('air-bar').style.width=`${e.air}%`;$('health').textContent=`${Math.round(e.health)}%`;$('health-bar').style.width=`${e.health}%`;
  $('interact').textContent=e.kind==='person'?'F · Take nearby car':'F · Exit car';
  const nearest=STATIONS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const distance=Math.hypot(e.x-nearest.x,e.z-nearest.z),refilling=distance<9&&e.y<1&&Math.abs(e.speed)<1&&e.kind!=='person';
  $('station-status').textContent=refilling?`ϟ FICTIONAL AIR REFILL · ${nearest.name}`:`ϟ AIR REFILL (GAME) · ${nearest.name} · ${Math.round(distance)} m`;
  $('station-status').classList.toggle('refilling',refilling);
  if(player){
    const d=player.delivery,order=d.order,target=orderTarget(order),distance=Math.round(Math.hypot(e.x-target.x,e.z-target.z));
    $('mission-label').textContent=order.stage==='pickup'?'PICK UP / FOOD RUN':target.rooftop?'DELIVER / ROOFTOP':'DELIVER / FOOD RUN';
    const bearing=Math.atan2(-(target.x-e.x),-(target.z-e.z))-e.yaw;
    const octant=(Math.round(Math.atan2(Math.sin(bearing),Math.cos(bearing))/(Math.PI/4))+8)%8;
    $('mission').textContent=`${['↑','↖','←','↙','↓','↘','→','↗'][octant]} ${target.name} · ${distance} m`;
    const paused=session.world.time>d.activeUntil;
    const pickupBonus=pickupBonusFor(order);
    $('hint').textContent=order.stage==='pickup'?`${clock(order.elapsed)} / ${clock(order.pickupEstimate)} pickup${paused?' · paused':''} · ${pickupBonus>0?`fast pickup +${money(pickupBonus)}`:'pickup bonus expired'}`:`${clock(order.elapsed)} / ${clock(order.estimate)} estimate${paused?' · paused':''} · ${money(payoutFor(order))} if delivered now${target.rooftop?` · land on roof ${Math.round(target.y)}m up`:''}`;
    if(d.lastReward&&d.lastReward.id>lastRewardId){lastRewardId=d.lastReward.id;celebrateReward(d.lastReward);}
    $('delivery-stats').textContent=`${money(d.cash)} earned · ${clock(d.activeSeconds)} active${d.lastPayout!==null?` · last delivery +${money(d.lastPayout)}`:''}`;
    const chased=session.world.entities.some(c=>c.police?.targetId===player.id);
    $('police-status').textContent=chased?'⚠ POLICE PURSUIT · LAND OR ESCAPE · FINE RISING':d.lastTicket!==null?`Last citation −${money(d.lastTicket.amount)} · repeat fines rise`:'Flying near police starts a chase.';
    $('police-status').classList.toggle('chased',chased);
    if(scoresDialog.open)updateScores();if(awardsDialog.open)updateAwards();
    const newAwards=player.achievements.unlocked.filter(id=>!seenAchievements.has(id));
    for(const id of newAwards){seenAchievements.add(id);achievementQueue.push(id);}
    if(newAwards.length&&!achievementTimer)announceAchievements();
    if(d.lastTicket&&d.tickets>lastTicketCount&&!menu&&session.status!=='disconnected'&&!ticketDialog.open){lastTicketCount=d.tickets;showTicket(d.lastTicket);}
  }
  $('air').textContent=spec?.airThrusters?`${Math.round(e.air)}%`:'—';$('air-bar').style.width=spec?.airThrusters?`${e.air}%`:'0%';
  $('players').textContent=`${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`;minimap(e);
});
