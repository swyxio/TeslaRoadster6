import './style.css';
import './identity.css';
import { createChatPanel } from './chat-panel';
import { GlobalChat } from './chat';
import { limitDriverNameInput } from './driver-name';
import { MAX_NAME_LENGTH } from '../worker/global-chat-core';
import mapSourceUrl from '../shared/bay-route-source.json?url';
import mapTraceUrl from '../shared/bay-highway-traces.ts?url&no-inline';
import mapBakeUrl from '../shared/bake-bay-highways.py?url&no-inline';
import { FleetPreview } from './fleet-preview';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from '../shared/vehicles';
import { GameScene } from './scene';
import { Session } from './session';
import { Controls } from './controls';
import { setupControlSettings } from './control-settings';
import { GameAudio } from './audio';
import { STATIONS, chargingStationAt } from '../shared/stations';
import { type Entity } from '../shared/game';
import { ferryDocked, ferrySecured, islandProtected, FERRY_DECK } from '../shared/ferry';
import { hasRocket } from '../shared/rocket';
import { PARKING_LOTS } from '../shared/parking-lots';
import { RACE_COURSES } from '../shared/race-courses';
import { playerRace } from '../shared/race';
import { LEVELS, orderTarget, payoutFor, pickupBonusFor, requiredLevelAt, type Level } from '../shared/delivery';
import { celebrateReward, resetCelebration } from './rewards';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import type { Ticket } from '../shared/delivery';
import { dayMinute } from '../shared/day';
import { DOME } from '../shared/dome';
import { BRIDGES, DISTRICTS, FERRY_DOCKS, HIGHWAYS, LANDMARKS, MAP_BOUNDS, REGIONS, ROADS, STUNT_LOOP, terrainHeight } from '../shared/map';
import { SHOPS, SHOP_RADIUS, UPGRADES, hasRockets, shopFor, type UpgradeId } from '../shared/upgrades';
import { currentAt, JET_STREAMS, THERMALS } from '../shared/sky-currents';
import { MAX_TANK_LEVEL, tankUpgradePrice } from '../shared/air-tank';
import { CURRENT_RELEASE, RELEASES } from '../content/releases';
import { browserStorage, readLastPlayed, writeLastPlayed } from './release-tracker';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
<canvas id="world" aria-label="Poly AV 3D driving world"></canvas>
<div class="vignette"></div>
<header class="topbar"><a class="brand" href="/" aria-label="Poly AV home"><span class="brand-icon">↗</span> POLY<span class="brand-light">AV</span><span class="alpha">POLY AVENUE / 02</span></a><div class="top-actions"><span id="connection" class="pill"><i></i> SOLO PLAYGROUND</span><button id="chat-button" class="icon-button chat-button" aria-label="Open global chat" aria-haspopup="dialog">💬<span id="chat-unread" class="chat-unread" hidden></span></button><button id="sound-button" class="icon-button sound-button" aria-label="Sound settings" aria-haspopup="dialog">♫</button><button id="menu-button" class="icon-button" aria-label="Open menu">☰</button></div></header>
<section id="menu" class="menu">
 <div class="intro"><div class="eyebrow"><span class="line"></span> SAN FRANCISCO BAY AREA</div><h1>Many rides.<br>Zero <em>commitment.</em></h1><p class="intro-copy">A low-poly love letter to San Francisco.<br>Deliver food. Catch air. Make your own shortcuts.</p>
 <div class="feature-row"><span>01 / DRIVE</span><span>02 / FLY</span><span>03 / DELIVER</span></div><p class="cockpit-invitation">Find a purple rocket to fly any car. Catch blue sky lanes for speed and air, or ride golden thermals upward. Try cockpit view with Actions → Camera.</p>
 <div class="launch-card"><div class="card-heading"><span class="eyebrow">YOUR NEXT DETOUR</span><span class="online-dot">● FREE ROAM</span></div>
 <label class="ride-select">STARTING RIDE<select id="starting-ride" aria-label="Starting vehicle"></select></label><p class="ride-note" id="starting-spec"></p>
 <div class="room-form"><label>DRIVER NAME<input id="name" maxlength="${MAX_NAME_LENGTH * 2}" placeholder="Your callsign" value="Driver" autocomplete="nickname"></label><label>ROOM CODE<input id="room" maxlength="32" placeholder="sunset-crew" pattern="[a-z0-9-]+" value="sunset-crew" autocapitalize="none" spellcheck="false"></label></div>
 <p class="driver-name-note">Names in use get a number. <button id="identity-button" type="button" aria-haspopup="dialog">Save or recover a driver</button></p>
 <button id="solo" class="primary">Take a solo drive <span>↗</span></button>
 <button id="join" class="secondary">Drive with friends <span>→</span></button><p class="form-note" id="form-note" role="status">Same room code, same playground. No account needed.</p>
 <button id="control-settings-menu" type="button" class="text-button">Controls &amp; gamepad</button><br><button id="resume" class="text-button hidden">← Back to your drive</button>
 </div>
 <div class="release-links"><span>${CURRENT_RELEASE.label}</span><a id="release-changelog" href="/changelog/">Changelog</a><a href="/blog/">Dev blog</a></div><p id="last-played" class="last-played">No earlier play recorded on this browser.</p>
 <p class="fine-print">An independent arcade prototype. Fictional flight & air service.<br>Real Supercharger sites. A deliberately remixed Bay Area.<br>Road data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL) · <a href="${mapSourceUrl}" download="bay-route-source.json">Source</a> · <a href="${mapTraceUrl}" download="bay-highway-traces.ts">Map data</a> · <a href="${mapBakeUrl}" download="bake-bay-highways.py">Bake</a>.</p>
 </div>
 <aside class="world-caption"><span class="eyebrow">37°46′ N &nbsp; 122°25′ W</span><h2>Open relationships.<br>Open roads.</h2><span class="caption-rule"></span><p>TESLA · WAYMO · CRUISE · ZOOX</p></aside>
</section>
<section id="hud" class="hidden" aria-label="Driving instruments">
 <div id="reward" class="reward" role="status" aria-live="polite" aria-atomic="true"><div class="confetti" aria-hidden="true"></div><div class="reward-card"><span id="reward-label"></span><strong id="reward-amount"></strong></div></div>
 <div id="achievement-toast" class="achievement-toast hidden" role="status" aria-live="polite"></div>
 <div class="mission" id="mission-panel" aria-live="polite"><span class="eyebrow" id="mission-label">PICK UP</span><strong id="mission">Find your first restaurant.</strong><span id="hint">Stop at the glowing marker.</span><span id="delivery-stats"></span><span id="region-progress"></span><span id="police-status"></span><span id="ferry-status"></span><span id="parking-status"></span><span id="race-status"></span></div>
 <div id="dome-score" class="dome-score hidden" role="status" aria-live="polite"><span class="eyebrow">CHINA BASIN / ROCKET DOME · GOAL RACE</span><strong><span id="dome-blue">BLUE 0</span><span aria-hidden="true"> — </span><span id="dome-orange">0 ORANGE</span></strong><span id="dome-status">Either goal counts · first color to 5 ends match</span><span id="dome-standings">Your goals: 0 · No leader yet</span><small>Last touch scores · most goals wins · ties share</small></div>
 <div class="action-drawer"><button id="actions-toggle" class="hud-toggle" aria-expanded="false" aria-controls="drive-actions">Actions <span aria-hidden="true">⌄</span></button><div id="drive-actions" class="drive-actions" hidden><button id="control-settings">⌨ Controls &amp; gamepad</button><button id="dome">⚽ Rocket Dome</button><button id="identity-action">◉ Driver identity</button><button id="invite">↗ Invite</button><button id="camera" aria-label="Camera: chase. Switch view">C · Chase</button><button id="interact">F · Exit car</button><button id="recover">K · Unstuck</button><button id="autopilot" aria-pressed="false">V · AV off</button><button id="fleet">G · Fleet</button><button id="shop">B · Shop</button><button id="scores">L · Scores</button><button id="awards">T · Awards</button><button id="parking-park">Park It</button><button id="parking-queue">Cut the queue</button><button id="parking-start">Start queue</button><button id="parking-leave">Leave parking game</button></div></div>
 <button id="shop-prompt" class="shop-prompt" hidden></button>
 <div id="cockpit-trim" class="cockpit-trim" hidden aria-hidden="true"></div>
 <div id="cockpit-dashboard" class="cockpit-dashboard" hidden><div class="cockpit-route"><span id="cockpit-phase">PICK UP</span><strong id="cockpit-target"></strong><small id="cockpit-estimate"></small></div><div class="cockpit-speed"><strong id="cockpit-speed">0</strong><span>KM/H</span></div></div>
 <div id="objective-sign" class="objective-sign" hidden aria-hidden="true"><span id="objective-phase"></span><strong id="objective-name"></strong><small id="objective-distance"></small></div>
 <div class="map-panel"><div class="map-title"><span id="map-label">LOCAL · TAP</span><span id="day-clock">06:00</span></div><button id="map-toggle" class="map-toggle" aria-label="Switch between local and Bay map" aria-pressed="false"><canvas id="minimap" width="240" height="240" aria-label="Map of the Bay; ferry docks are white diamonds, the ferry is a white boat, blue dashed arrows are sky lanes, gold rings are thermals, mint dots are Superchargers, purple diamonds are upgrade shops, lavender dots are rocket kits, yellow ring is your delivery, red dots are police, orange arrow is you"></canvas></button><div class="map-key"><b>▲ YOU</b> <i></i> AIR <b class="shop-key">◆ SHOP · KIT</b> <span id="players">1 DRIVER</span></div><div class="sky-key">┄ SKY LANES &nbsp; ◌ THERMALS</div></div>
 <div class="telemetry"><div class="vehicle-title"><span id="vehicle">TESLA ROADSTER</span><span id="flight" class="flight">GROUNDED</span></div><div id="handling" class="handling"></div><div id="rocket-status" hidden></div><div class="speed"><strong id="speed">000</strong><span>KM/H<br><b id="altitude">0 M ALT</b></span></div><div class="meter-row"><span id="air-label">AIR LV 1</span><div class="meter"><i id="air-bar"></i></div><b id="air">100%</b></div><div class="meter-row health"><span>CONDITION</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div id="station-status">Find a Supercharger to refill</div></div>
 <div class="control-guide"><button id="controls-toggle" class="hud-toggle" aria-expanded="false" aria-controls="keyboard-help">⌨ &nbsp;Controls</button><div id="keyboard-help" class="keyboard-help" hidden><strong>DRIVING CONTROLS</strong><p><kbd>W A S D</kbd> or arrows · drive and fly forward / back, steer</p><p><kbd>SPACE</kbd> brake / drift on the road · flip in the air</p><p><kbd>E</kbd> jump / hold to hover &nbsp; <kbd>X</kbd> flip</p><p><kbd>SHIFT</kbd> boost &nbsp; <kbd>Q / R</kbd> roll</p><p><kbd>F</kbd> enter / exit &nbsp; <kbd>K</kbd> unstuck &nbsp; <kbd>C</kbd> camera</p><p><kbd>V</kbd> autopilot &nbsp; <kbd>G</kbd> fleet &nbsp; <kbd>B</kbd> shop &nbsp; <kbd>L</kbd> scores &nbsp; <kbd>T</kbd> awards</p><small>Drive onto the SF ferry for Rocket Island. Purple pads grant temporary flight. At parking lots, use Actions for parking games. Blue lanes add speed and air; golden thermals lift and refill you.</small></div></div>
 <div class="touch-controls"><div class="steering"><button data-control="KeyA" aria-label="Steer left">◀</button><button data-control="KeyD" aria-label="Steer right">▶</button><button data-control="KeyS" aria-label="Reverse; steer while moving forward to drift">REV</button><button data-control="Space" aria-label="Brake; steer while moving forward to drift">BRAKE</button></div><div class="touch-flight"><button data-control="KeyQ" aria-label="Roll left">↶</button><button data-control="KeyR" aria-label="Roll right">↷</button><button class="flip-control" data-control="KeyX" aria-label="Flip">FLIP</button></div><div class="pedals"><button data-control="ShiftLeft">BOOST</button><button id="jump-control" data-control="KeyE" aria-label="Jump">JUMP ↑</button><button id="drive-control" class="accelerate" data-control="KeyW" aria-label="Drive">DRIVE ↑</button></div></div>
</section>
<dialog id="controls-dialog" class="controls-dialog" aria-labelledby="controls-title"><div class="fleet-header"><div><span class="eyebrow">YOUR DRIVE / INPUTS</span><h2 id="controls-title">Controls &amp; gamepad</h2></div><button id="controls-close" aria-label="Close controls">✕</button></div><div class="gamepad-guide"><strong>Controller · Xbox / PlayStation</strong><p id="gamepad-status" role="status"></p><p>Left stick steer · RT / R2 accelerate · LT / L2 brake, then reverse · A / ✕ jump / hold to hover · X / □ flip · B / ○ boost · LB / L1 and RB / R1 roll (or right stick).</p><p>D-pad: up enter / exit, down camera, left unstuck, right autopilot · Menu / Options opens the menu. Use mouse, keyboard or touch for menus.</p></div><div class="bindings-heading"><strong>Keyboard bindings</strong><button id="bindings-reset" type="button">Reset defaults</button></div><p class="form-note">Select either key to change it. Backspace clears; Escape cancels. Browser shortcuts stay available.</p><p id="bindings-feedback" class="bindings-feedback" role="status"></p><div id="bindings-list" class="bindings-list"></div></dialog>
<dialog id="fleet-dialog" aria-labelledby="fleet-title"><div class="fleet-header"><div><span class="eyebrow">THE POLYCULE / TESLA COLLECTION</span><h2 id="fleet-title">Choose your Tesla.</h2></div><button id="fleet-close" aria-label="Close fleet">✕</button></div><p class="fleet-intro">Choose a Tesla here. Waymo, Cruise and Zoox vehicles can only be taken from the street. Upgrades stay with each car; choosing a Tesla replaces your personal car.</p><div class="fleet-body"><div id="fleet-list" class="fleet-list"></div><aside class="fleet-detail"><span id="fleet-brand" class="eyebrow"></span><h3 id="fleet-name"></h3><p id="fleet-status"></p><canvas id="fleet-preview" aria-label="Selected low-poly vehicle model"></canvas><dl id="fleet-specs"></dl><p id="fleet-estimates"></p><a id="fleet-source" target="_blank" rel="noopener noreferrer">View design source ↗</a><button id="fleet-drive" class="primary">Take this ride →</button><p class="form-note" id="fleet-feedback" role="status">Stop on the ground before changing rides.</p></aside></div></dialog>
<dialog id="shop-dialog" class="shop-dialog" aria-labelledby="shop-title"><div class="fleet-header"><div><span class="eyebrow">FICTIONAL SPACEX / UPGRADE BAY</span><h2 id="shop-title">Make it yours.</h2></div><button id="shop-close" aria-label="Close shop">✕</button></div><p id="shop-location" class="fleet-intro"></p><div class="shop-wallet"><span id="shop-car"></span><strong id="shop-cash"></strong></div><div class="shop-item ota-plan"><div><strong>Remote shop · OTA</strong><p>$5 per game hour (2 real minutes). Use the shop anywhere. Upgrades cost extra. Pauses if renewal cannot be paid; resumes when you have $5. Session only.</p><p id="ota-status" role="status"></p></div><button id="ota-toggle"></button></div><div id="shop-items" class="shop-items"></div><p id="shop-feedback" class="form-note" role="status">Earn cash by delivering food. Upgrades stay on this car while it remains in the session. Fictional workshop; no affiliation implied.</p></dialog>
<dialog id="scores-dialog" aria-labelledby="scores-title"><div class="fleet-header"><div><span class="eyebrow">YOUR ROOM / ACTIVE DRIVERS</span><h2 id="scores-title">Delivery leaderboard</h2></div><button id="scores-close" aria-label="Close leaderboard">✕</button></div><p class="fleet-intro">Ranked by cash and active play. First-person time and deliveries are self-reported; a first-person delivery requires the whole active run in cockpit view. Scores last only for this session.</p><div class="score-head"><span>DRIVER</span><span>CASH</span><span>ACTIVE</span><span>PER MIN</span></div><ol id="scores-list" class="scores-list"></ol></dialog>
<dialog id="awards-dialog" aria-labelledby="awards-title"><div class="fleet-header"><div><span class="eyebrow">YOUR SESSION / LITTLE VICTORIES</span><h2 id="awards-title">Achievements</h2></div><button id="awards-close" aria-label="Close achievements">✕</button></div><p class="fleet-intro">Explore, play in the Rocket Dome, and earn these once per session.</p><ul id="awards-list" class="awards-list"></ul></dialog>
<dialog id="sound-dialog" class="sound-dialog" aria-labelledby="sound-title"><div class="fleet-header"><div><span class="eyebrow">YOUR MIX / POLY AV RADIO</span><h2 id="sound-title">Sound settings</h2></div><button id="sound-close" aria-label="Close sound settings">✕</button></div><p class="fleet-intro">An original little soundtrack, plus sounds for your drive. Adjust them anytime.</p><div class="sound-sliders"><label>Master <output id="master-value"></output><input id="master-volume" type="range" min="0" max="100" aria-label="Master volume"></label><label>Music <output id="music-value"></output><input id="music-volume" type="range" min="0" max="100" aria-label="Music volume"></label><label>Effects <output id="effects-value"></output><input id="effects-volume" type="range" min="0" max="100" aria-label="Effects volume"></label></div><div class="sound-actions"><button id="sound-mute" aria-pressed="false">Mute all</button><button id="sound-test">Test sound</button></div><p id="sound-status" class="form-note" role="status">Sound starts when you begin a drive.</p></dialog>
<dialog id="identity-dialog" class="identity-dialog" aria-labelledby="identity-title"><div class="fleet-header"><div><span class="eyebrow">YOUR DRIVER / OPTIONAL</span><h2 id="identity-title">Save your driver</h2></div><button id="identity-close" type="button" aria-label="Close driver identity">✕</button></div><p id="identity-current" class="identity-current">Connecting to chat…</p><p>Choose a name for this session. If another driver is using it, we add a number. Driver IDs are assigned automatically.</p><div class="identity-block"><strong>Keep this driver</strong><p>Create a recovery code to use this name and ID again. Your car, deliveries, and earnings are session-only.</p><button id="identity-save" type="button" class="identity-button">Get recovery code</button><div id="identity-code-group" hidden><label for="identity-code">Your recovery code · keep it private</label><textarea id="identity-code" readonly rows="3" spellcheck="false"></textarea><button id="identity-copy" type="button" class="identity-button">Copy code</button></div><label class="identity-remember"><input id="identity-remember" type="checkbox"> Remember this driver on this browser</label><p>Remembering a new driver replaces any driver previously saved in this browser.</p></div><form id="identity-recover" class="identity-block"><strong>Recover on this device</strong><p>Paste your recovery code. The same driver can be connected on one device at a time.</p><label for="identity-enter-code">Recovery code</label><textarea id="identity-enter-code" rows="2" maxlength="160" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="Paste your recovery code"></textarea><div class="identity-actions"><button type="submit" class="identity-button">Recover driver</button><button id="identity-guest" type="button" class="identity-button">Use a new guest</button></div></form><p id="identity-feedback" class="identity-feedback" role="status"></p></dialog>
<dialog id="ticket-dialog" class="ticket-dialog" aria-labelledby="ticket-title" aria-describedby="ticket-copy"><div class="ticket-icon" aria-hidden="true">!</div><span class="ticket-kicker">POLICE CITATION / FLIGHT ON PUBLIC ROADS</span><h2 id="ticket-title">Busted.</h2><p id="ticket-copy">Flying over public roads put people at risk. Police stopped your run and issued a citation.</p><strong id="ticket-amount" class="ticket-amount"></strong><div id="ticket-detail" class="ticket-detail"></div><p class="ticket-footnote">The fine has been deducted from your earnings. Longer, higher flights and repeat offenses cost more.</p><button id="ticket-acknowledge" class="primary">Acknowledge citation &amp; continue →</button></dialog>
<div id="notice" class="notice hidden" role="status"></div>
<div id="error" class="error hidden" role="alert"><h2>Let’s get you back on the road.</h2><p id="error-copy"></p><button id="retry" class="primary">Rejoin room</button><button id="error-solo" class="secondary">Drive solo</button><button id="error-menu" class="text-button">Back to menu</button></div>
`;
let selectedVehicle:VehicleId='roadster';
const startingSelect=$<HTMLSelectElement>('starting-ride');
const teslaIds=VEHICLE_IDS.filter(id=>VEHICLES[id].brand==='Tesla');
for(const id of teslaIds){const option=document.createElement('option');option.value=id;option.textContent=VEHICLES[id].name;startingSelect.append(option);}
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
$('sound-button').onclick=()=>{setDrawer(null);controls.clear();controls.enabled=false;refreshSoundSettings();soundDialog.showModal();};
function closeSound(){soundDialog.close();controls.clear();controls.enabled=!menu&&session.status!=='disconnected';}
$('sound-close').onclick=closeSound;soundDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status!=='disconnected';});
document.addEventListener('visibilitychange',()=>{void audio.visibility(document.hidden);});
for(const event of ['pointerdown','keydown'] as const)window.addEventListener(event,()=>{if(audio.initialized)void audio.unlock();},{capture:true});
refreshSoundSettings();
let scene: GameScene;
try { scene = new GameScene($<HTMLCanvasElement>('world')); }
catch { $('error').classList.remove('hidden'); $('error-copy').textContent='This device could not start WebGL. Enable hardware acceleration or try another browser.'; $('retry').hidden=true; $('error-solo').hidden=true; throw new Error('WebGL unavailable'); }
let menu = true, started = false, hudTime = 0, lastRewardId = 0, lastTicketCount = 0;
let lastLevel:Level|undefined,lastBlockedAt=-1,lastBlockedNoticeAt=-10;
let seenAchievements = new Set<AchievementId>(), achievementQueue:AchievementId[] = [], achievementTimer = 0;
let openDrawer: 'actions' | 'controls' | null = null;
function setDrawer(drawer: 'actions' | 'controls' | null) {
  openDrawer=drawer;
  for(const name of ['actions','controls'] as const){
    const open=drawer===name;
    $(name==='actions'?'drive-actions':'keyboard-help').hidden=!open;
    $(name+'-toggle').setAttribute('aria-expanded',String(open));
  }
  controls.clear();
  controls.enabled=!drawer&&!menu&&session.status!=='disconnected'&&!document.querySelector('dialog[open]');
}
$('actions-toggle').onclick=event=>{setDrawer(openDrawer==='actions'?null:'actions');if(event.detail&&!openDrawer)$('actions-toggle').blur();};
$('controls-toggle').onclick=event=>{setDrawer(openDrawer==='controls'?null:'controls');if(event.detail&&!openDrawer)$('controls-toggle').blur();};
$('drive-actions').addEventListener('click',event=>{if((event.target as HTMLElement).closest('button')){setDrawer(null);if(event.detail===0)$('actions-toggle').focus();}},{capture:true});
const controlSettings=setupControlSettings(controls,()=>{setDrawer(null);controls.clear();controls.enabled=false;},()=>{controls.clear();controls.enabled=!openDrawer&&!menu&&session.status!=='disconnected'&&!document.querySelector('dialog[open]');});
document.addEventListener('pointerdown',event=>{if(openDrawer&&!(event.target as HTMLElement).closest('.action-drawer, .control-guide'))setDrawer(null);},{capture:true});
window.addEventListener('keydown',event=>{if(openDrawer&&event.key==='Escape'){event.preventDefault();const toggle=$(openDrawer+'-toggle');setDrawer(null);toggle.focus();}});
const nameInput=$<HTMLInputElement>('name');
const identityDialog=$<HTMLDialogElement>('identity-dialog');
const rememberInput=$<HTMLInputElement>('identity-remember');
const identityCode=$<HTMLTextAreaElement>('identity-code');
const identityEntry=$<HTMLTextAreaElement>('identity-enter-code');
const storageKey='poly-av-driver-recovery';
let rememberedCode:string|undefined;
try { rememberedCode=localStorage.getItem(storageKey)||undefined; } catch { /* Browser storage is optional. */ }
let currentCode:string|undefined=rememberedCode;
let nameEdited=false, authError=false, pendingRecovery=false, pendingSave=false, unread=0;
let requestedName='Driver', rememberRequested=!!rememberedCode;
function identityFeedback(message:string){$('identity-feedback').textContent=message;}
function rememberCode(code:string){
  try { localStorage.setItem(storageKey,code);rememberedCode=code;return true; }
  catch { rememberRequested=false;rememberInput.checked=false;identityFeedback('Browser storage is unavailable. Copy your code somewhere safe.');return false; }
}
function refreshIdentity(){
  $('identity-current').textContent=chat.playerId&&chat.status==='online'?`${chat.name} · #${chat.playerId.slice(0,8)}`:chat.status==='connecting'?'Connecting to chat…':'Chat is offline';
  $('identity-code-group').hidden=!currentCode;
  identityCode.value=currentCode||'';
  rememberInput.checked=rememberRequested;
}
function updateChatBadge(){
  const badge=$('chat-unread');badge.hidden=unread===0;badge.textContent=unread>99?'99+':String(unread);
  $('chat-button').setAttribute('aria-label',unread?`Open global chat, ${unread} unread`:'Open global chat');
}
const chat=new GlobalChat({
  onStatus(status,detail){chatPanel.setConnection(status,detail);refreshIdentity();},
  onReady(id,name,messages){
    // A previous handshake may complete after the player has edited the name.
    // Start the requested guest session before applying any stale identity.
    if(nameEdited&&(nameInput.value.trim()||'Driver')!==requestedName){pendingRecovery=false;pendingSave=false;ensureChat();return;}
    currentCode=chat.code;authError=false;
    if(!nameEdited||nameInput.value.trim()===requestedName){nameInput.value=name;nameEdited=false;}
    chatPanel.setIdentity(id,name);chatPanel.setMessages(messages);session.setName(name);
    if(pendingRecovery){pendingRecovery=false;const stored=!rememberRequested||!currentCode||rememberCode(currentCode);identityEntry.value='';if(stored)identityFeedback(`Recovered ${name}.`);}
    refreshIdentity();
    if(pendingSave){pendingSave=false;if(!chat.save())identityFeedback('Could not request a code. Try again.');}
  },
  onMessage(message){chatPanel.append(message);if(!chatPanel.element.open&&message.playerId!==chat.playerId){unread++;updateChatBadge();}},
  onRecovery(code){currentCode=code;const stored=!rememberRequested||rememberCode(code);refreshIdentity();if(stored)identityFeedback('Recovery code ready. Keep it private and copy it somewhere safe.');},
  onError(message){
    if(chat.status==='offline'){authError=true;pendingSave=false;chatPanel.setConnection('offline',message);identityFeedback(message+' Retry the code or choose a new guest.');}
    else {identityFeedback(message);chatPanel.setConnection('online',message);}
  },
});
const chatPanel=createChatPanel({
  onSend:text=>chat.send(text),
  onOpenChange(open){
    if(open){unread=0;updateChatBadge();}
    controls.clear();controls.enabled=!open&&!openDrawer&&!menu&&session.status!=='disconnected'&&!document.querySelector('dialog[open]');
  },
});
document.body.append(chatPanel.element);
function ensureChat(){
  if(authError&&!nameEdited)return;
  const name=nameInput.value.trim()||'Driver';
  if(nameEdited){currentCode=undefined;rememberRequested=false;}
  requestedName=name;chat.connect(name,currentCode);
}
nameInput.addEventListener('input',event=>{nameEdited=true;if(!(event as InputEvent).isComposing)limitDriverNameInput(nameInput);});
nameInput.addEventListener('compositionend',()=>limitDriverNameInput(nameInput));
$('chat-button').onclick=()=>{setDrawer(null);ensureChat();chatPanel.open();};
function openIdentity(){setDrawer(null);ensureChat();refreshIdentity();identityDialog.showModal();controls.clear();controls.enabled=false;}
$('identity-button').onclick=openIdentity;$('identity-action').onclick=openIdentity;
$('identity-close').onclick=()=>identityDialog.close();
identityDialog.addEventListener('close',()=>{controls.clear();controls.enabled=!openDrawer&&!menu&&session.status!=='disconnected'&&!document.querySelector('dialog[open]');});
$('identity-save').onclick=()=>{
  if(chat.status!=='online'){if(authError){identityFeedback('Retry recovery or choose a new guest first.');return;}pendingSave=true;ensureChat();identityFeedback('Connecting before creating your code…');return;}
  if(!chat.save())identityFeedback('Could not request a code. Try again.');
};
$('identity-copy').onclick=async()=>{
  if(!currentCode)return;
  try {await navigator.clipboard.writeText(currentCode);identityFeedback('Recovery code copied. Keep it private.');}
  catch {identityCode.focus();identityCode.select();identityFeedback('Copy the selected recovery code and keep it private.');}
};
rememberInput.addEventListener('change',()=>{
  rememberRequested=rememberInput.checked;
  if(rememberInput.checked){if(currentCode){if(rememberCode(currentCode))identityFeedback('This browser will remember this driver.');}else identityFeedback('Create or recover a driver first.');}
  else if(currentCode&&rememberedCode===currentCode){try {localStorage.removeItem(storageKey);rememberedCode=undefined;identityFeedback('This browser will no longer remember this driver.');}catch {identityFeedback('Could not clear browser storage.');}}
});
$('identity-recover').addEventListener('submit',event=>{
  event.preventDefault();const code=identityEntry.value.trim();
  if(!code){identityFeedback('Paste a recovery code first.');return;}
  if(chat.status==='online'&&currentCode===code){identityFeedback('This driver is already connected.');return;}
  pendingRecovery=true;pendingSave=false;authError=false;nameEdited=false;requestedName=nameInput.value.trim()||'Driver';identityFeedback('Checking your recovery code…');chat.connect(requestedName,code,true);
});
$('identity-guest').onclick=()=>{
  pendingRecovery=false;pendingSave=false;authError=false;nameEdited=false;currentCode=undefined;rememberRequested=false;rememberInput.checked=false;requestedName=nameInput.value.trim()||'Driver';identityFeedback(rememberedCode?'Starting a new guest. This browser still remembers a different driver.':'Starting a new guest driver.');chat.connect(requestedName,undefined,true);
};
if(rememberedCode)ensureChat();

const roomParam = new URLSearchParams(location.search).get('room');
const playStorage=browserStorage(),previousPlay=playStorage?readLastPlayed(playStorage):null;
if(previousPlay){
  const release=RELEASES.find(item=>item.version===previousPlay.version);
  $('last-played').textContent=`Last played ${new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(previousPlay.playedAt))} · ${release?.label??previousPlay.version}. Saved on this browser.`;
  $<HTMLAnchorElement>('release-changelog').href=`/changelog/?since=${encodeURIComponent(previousPlay.version)}`;
}else if(!playStorage){$('last-played').textContent='Last-played history is unavailable in this browser.';}
let playRecorded=false,lastPlayWrite=0,lastActiveSeconds=0,lastActiveAt=0;
function recordPlay(now:number){
  playRecorded=true;lastPlayWrite=now;
  if(!playStorage||!writeLastPlayed(playStorage,new Date(now))){$('last-played').textContent='Last-played history could not be saved on this browser.';}
}
window.addEventListener('pagehide',()=>{if(playRecorded&&Date.now()-lastActiveAt<10000)recordPlay(Date.now());});
if (roomParam && /^[a-z0-9][a-z0-9-]{0,31}$/.test(roomParam)) $<HTMLInputElement>('room').value=roomParam;
function toggleMenu(show: boolean) {menu=show;setDrawer(null);controls.clear();$('menu').classList.toggle('hidden',!show);$('hud').classList.toggle('hidden',show);$('resume').classList.toggle('hidden',!started);$('menu-button').setAttribute('aria-label',show?'Close menu':'Open menu');}
function begin(solo:boolean){
  const room=$<HTMLInputElement>('room').value.trim().toLowerCase();
  if(!solo&&!/^[a-z0-9][a-z0-9-]{0,31}$/.test(room)){ $('form-note').textContent='Start with a letter or number; use up to 32 lowercase letters, numbers, or hyphens.';return; }
  ensureChat();
  lastRewardId=0;lastTicketCount=0;lastLevel=undefined;lastBlockedAt=-1;lastBlockedNoticeAt=-10;clearTimeout(noticeTimer);$('notice').classList.add('hidden');resetCelebration();audio.reset();void audio.unlock();
  pendingShop=null;pendingOta=null;shopBusyUntil=0;
  seenAchievements.clear();achievementQueue=[];clearTimeout(achievementTimer);achievementTimer=0;$('achievement-toast').classList.add('hidden');
  for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))dialog.close();
  controls.resetSequences();if(solo){session.solo(selectedVehicle);history.replaceState(null,'',location.pathname);}else{session.join(room,$<HTMLInputElement>('name').value.trim()||'Driver',selectedVehicle);history.replaceState(null,'',`?room=${encodeURIComponent(room)}`);}
  playRecorded=false;lastActiveSeconds=0;lastActiveAt=0;
  session.setName(chat.status==='online'&&!nameEdited?chat.name:nameInput.value.trim()||'Driver');
  started=true;$('error').classList.add('hidden');toggleMenu(false);
}
$('solo').onclick=()=>begin(true);$('error-solo').onclick=()=>begin(true);$('join').onclick=()=>begin(false);$('retry').onclick=()=>begin(false);
$('resume').onclick=()=>{ensureChat();toggleMenu(false);};$('menu-button').onclick=()=>{if(started)toggleMenu(!menu);};
$('error-menu').onclick=()=>{$('error').classList.add('hidden');lastRewardId=0;resetCelebration();pendingShop=null;pendingOta=null;shopBusyUntil=0;session.solo();toggleMenu(true);};
function cameraLabel(onFoot:boolean){
  const label=scene.cameraMode==='cockpit'?'Cockpit':scene.cameraMode==='wide'?'Wide':'Chase';
  $('camera').textContent=`${controlSettings.label('camera')} · ${onFoot&&scene.cameraMode==='cockpit'?'Walk':label}`;
  $('camera').setAttribute('aria-label',onFoot&&scene.cameraMode==='cockpit'?'Camera: cockpit selected, chase view on foot. Switch view':`Camera: ${label}. Switch view`);
}
function action(type:'interact'|'reset'|'camera'|'menu'|'autopilot'|'fleet'|'scores'|'awards'|'shop'){
  if(type==='shop'){openShop();return;}
  if(type==='awards'){openAwards();return;}
  if(type==='scores'){openScores();return;}
  if(type==='fleet'){openFleet();return;}
  if(type==='menu')toggleMenu(!menu);else if(type==='camera'){
    scene.cycleCamera();const player=session.world.players.find(p=>p.id===session.id);cameraLabel(session.world.entities.find(e=>e.id===player?.entityId)?.kind==='person');
  }else session.action(type);
}
controls.onAction=action;
$('autopilot').onclick=()=>action('autopilot');$('fleet').onclick=()=>openFleet();$('scores').onclick=()=>openScores();$('awards').onclick=()=>openAwards();
$('shop').onclick=()=>openShop();$('shop-prompt').onclick=()=>openShop();
$('interact').onclick=()=>action('interact');$('recover').onclick=()=>action('reset');$('camera').onclick=()=>action('camera');
for(const action of ['park','queue','start','leave'] as const){
  $('parking-'+action).onclick=()=>{
    const joined=session.parkingAction(action);
    if(action==='park'||action==='queue'){
      notice(session.status==='solo'
        ? joined ? (action==='park'?'Park It joined · find your assigned stall.':'Queue joined · wait for the start.')
          : (action==='park'?'Could not join Park It · enter a parking lot in your car.':'Could not join · enter the marked queue approach in your car.')
        : 'Parking request sent · check the activity status.');
    }
  };
}
const activityHelp=document.createElement('p');activityHelp.className='activity-help';
activityHelp.textContent='Take the ferry from north SF to Rocket Island. Drive over a Rocket pad for temporary flight. At a parking lot, join Park It or enter the marked approach for Cut the queue. Race from an island start marker; cars can bump. Keyboard: use Tab and Enter to choose an action.';
const keyboardHelp=$('keyboard-help').querySelector('small');
if(keyboardHelp)keyboardHelp.textContent+=' Use Tab to reach Actions, Enter to open it, then Tab and Enter to choose a game.';
$('drive-actions').insertAdjacentHTML('beforeend','<label class="race-choice" for="race-course">RACE COURSE<select id="race-course"><option value="short">Short circuit</option><option value="oval">Speed oval</option></select></label><button id="race-join">Join race</button><button id="race-start">Start race</button><button id="race-leave">Leave race</button>');
$('drive-actions').append(activityHelp);
for(const action of ['join','start','leave'] as const){
  $('race-'+action).onclick=()=>{
    const active=playerRace(session.world.races,session.id);
    const course=(action==='join'?$<HTMLSelectElement>('race-course').value:active?.round.courseId??$<HTMLSelectElement>('race-course').value) as 'short'|'oval';
    session.raceAction(action,course);
    if(action==='join')notice('Race: join at the selected island start marker. Cars can bump.');
  };
}
let noticeTimer=0;
function notice(message:string){$('notice').textContent=message;$('notice').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=window.setTimeout(()=>$('notice').classList.add('hidden'),4000);}
let domeRequest=0;
$('dome').onclick=()=>{
  const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);
  if(!entity)return;
  const wasInDome=entity.inDome,request=++domeRequest;
  controls.clear();session.action('dome');
  window.setTimeout(()=>{
    const currentPlayer=session.world.players.find(p=>p.id===session.id),current=session.world.entities.find(e=>e.id===currentPlayer?.entityId);
    if(request===domeRequest&&current?.inDome===wasInDome)notice('Travel has not completed yet. Try again.');
  },session.status==='solo'?50:1500);
};
$('invite').onclick=async()=>{
  if(session.status==='solo'){toggleMenu(true);notice('Choose a room and press Drive with friends first.');return;}
  try{await navigator.clipboard.writeText(location.href);notice('Invite link copied. Send it to your crew.');}catch{notice('Copy the address in your browser to invite a friend.');}
};
const map=$<HTMLCanvasElement>('minimap').getContext('2d')!;
const mapBase=document.createElement('canvas');mapBase.width=240;mapBase.height=240;
const base=mapBase.getContext('2d')!;
// The overview grows with the player's unlocked world; the local view stays useful for navigation.
const mapExtents=[
  {minX:-530,maxX:700,minZ:-1050,maxZ:430},
  {minX:-550,maxX:850,minZ:-1050,maxZ:430},
  {minX:-1800,maxX:2400,minZ:-1050,maxZ:7600},
  MAP_BOUNDS,
] as const;
const localRoads=ROADS.filter(road=>road.kind!=='highway');
let mapLocal=true,mapKey='';
$('map-toggle').onclick=()=>{mapLocal=!mapLocal;mapKey='';$('map-label').textContent=mapLocal?'LOCAL · TAP':'BAY · TAP';$('map-toggle').setAttribute('aria-pressed',String(!mapLocal));};
function minimap(entity:Entity|undefined,level:Level){
  const cx=Math.round((entity?.x??0)/25)*25,cz=Math.round((entity?.z??0)/25)*25;
  const extent=mapExtents[level],mapWidth=extent.maxX-extent.minX,mapHeight=extent.maxZ-extent.minZ;
  const bayScale=Math.min(210/mapWidth,210/mapHeight),bayLeft=(240-mapWidth*bayScale)/2,bayTop=(240-mapHeight*bayScale)/2;
  const scale=mapLocal?240/800:bayScale;
  const px=mapLocal?(x:number)=>120+(x-cx)*scale:(x:number)=>bayLeft+(x-extent.minX)*scale;
  const pz=mapLocal?(z:number)=>120+(z-cz)*scale:(z:number)=>bayTop+(z-extent.minZ)*scale;
  const worldX=(x:number)=>mapLocal?cx+(x-120)/scale:extent.minX+(x-bayLeft)/scale;
  const worldZ=(z:number)=>mapLocal?cz+(z-120)/scale:extent.minZ+(z-bayTop)/scale;
  const visible=(x:number,z:number)=>requiredLevelAt(x,z)<=level;
  const key=mapLocal?`${level},${cx},${cz}`:`bay,${level}`;
  if(key!==mapKey){
    mapKey=key;base.fillStyle='#315965';base.fillRect(0,0,240,240);
    for(const r of REGIONS){base.beginPath();r.points.forEach((p,i)=>i?base.lineTo(px(p.x),pz(p.z)):base.moveTo(px(p.x),pz(p.z)));base.closePath();base.fillStyle=r.id==='marin'||r.id==='yerba'?'#819981':'#b5b4a3';base.fill();}
    base.fillStyle='#6e7b78';for(const road of localRoads){
      const x=px(road.x),z=pz(road.z),w=Math.max(.5,road.w*scale),d=Math.max(.5,road.d*scale),radius=Math.hypot(w,d)/2;
      if(x+radius<0||x-radius>240||z+radius<0||z-radius>240)continue;
      base.save();base.translate(x,z);base.rotate(-(road.angle??0));base.fillRect(-w/2,-d/2,w,d);base.restore();
    }
    base.strokeStyle='#e8d0a0';base.lineWidth=mapLocal?Math.max(2,32*scale):1.5;
    for(const highway of HIGHWAYS){base.beginPath();highway.points.forEach((p,i)=>i?base.lineTo(px(p.x),pz(p.z)):base.moveTo(px(p.x),pz(p.z)));base.stroke();}
    base.strokeStyle='#d6c7a6';base.lineWidth=mapLocal?Math.max(2,24*scale):2;
    for(const b of BRIDGES){base.beginPath();if(b.axis==='x'){base.moveTo(px(b.start),pz(b.center));base.lineTo(px(b.end),pz(b.center));}else{base.moveTo(px(b.center),pz(b.start));base.lineTo(px(b.center),pz(b.end));}base.stroke();}
    // Hide unreached districts instead of showing the complete Bay from the start.
    base.fillStyle='#193b48ee';for(let z=0;z<240;z+=6)for(let x=0;x<240;x+=6){if(!visible(worldX(x+3),worldZ(z+3)))base.fillRect(x,z,6,6);}
    base.font='bold 7px system-ui';base.fillStyle='#eef0d9';base.fillText('SF',px(-120)-12,pz(0));if(visible(385,-150))base.fillText('OAKLAND',px(385)+4,pz(-150));
    base.fillText('ROCKET ISLAND',px(200)-22,pz(-1650));
    for(const dock of Object.values(FERRY_DOCKS).filter(d=>visible(d.x,d.z))){
      const x=px(dock.x),z=pz(dock.z);base.beginPath();base.moveTo(x,z-4);base.lineTo(x+4,z);base.lineTo(x,z+4);base.lineTo(x-4,z);base.closePath();base.fillStyle='#e9f6ee';base.fill();
    }
    for(const lot of PARKING_LOTS.filter(l=>visible(l.area.x,l.area.z))){base.fillStyle='#ffd386';base.fillRect(px(lot.area.x)-2,pz(lot.area.z)-2,4,4);}
    for(const course of RACE_COURSES.filter(c=>visible(c.start.x,c.start.z))){base.fillStyle='#e6a6e6';base.fillRect(px(course.start.x)-2,pz(course.start.z)-2,4,4);}
    base.fillStyle='#eef0d9';
    for(const district of DISTRICTS.filter(d=>(d.id==='san-jose'||d.id==='fremont'||d.id==='palo-alto')&&visible(d.x,d.z)))base.fillText(district.name.toUpperCase(),px(district.x)+4,pz(district.z));
    for(const landmark of LANDMARKS.filter(l=>visible(l.arrival.x,l.arrival.z))){base.fillStyle='#fff2c6';base.beginPath();base.arc(px(landmark.arrival.x),pz(landmark.arrival.z),2.5,0,Math.PI*2);base.fill();if(mapLocal)base.fillText(landmark.name,px(landmark.arrival.x)+4,pz(landmark.arrival.z)-4);}
    if(visible(STUNT_LOOP.x,STUNT_LOOP.z)){base.fillStyle='#ffc77f';base.beginPath();base.arc(px(STUNT_LOOP.x),pz(STUNT_LOOP.z),3,0,Math.PI*2);base.fill();base.fillText('LOOP',px(STUNT_LOOP.x)+4,pz(STUNT_LOOP.z)-3);}
    base.fillStyle='#91dfff';base.beginPath();base.arc(px(DOME.x),pz(DOME.z),3,0,Math.PI*2);base.fill();base.fillText('ROCKET DOME',px(DOME.x)+4,pz(DOME.z)-3);
  }
  map.drawImage(mapBase,0,0);
  const ferry=session.world.ferry;
  map.save();map.translate(px(ferry.x),pz(ferry.z));map.fillStyle='#f8f8ed';map.strokeStyle='#23535b';map.lineWidth=1.5;map.beginPath();map.rect(-3,-6,6,12);map.fill();map.stroke();map.restore();
  const parkingRound=session.world.parking.rounds.find(r=>r.entrants.some(entrant=>entrant.playerId===session.id));
  const parkingEntrant=parkingRound?.entrants.find(entrant=>entrant.playerId===session.id);
  const stall=PARKING_LOTS.find(lot=>lot.id===parkingRound?.lotId)?.stalls.find(stall=>stall.id===parkingEntrant?.targetId);
  if(stall){map.beginPath();map.arc(px(stall.x),pz(stall.z),6,0,Math.PI*2);map.strokeStyle='#ffb858';map.lineWidth=2;map.stroke();}
  const racing=playerRace(session.world.races,session.id);
  const raceRound=racing?.round,racer=racing?.entrant;
  const gate=RACE_COURSES.find(course=>course.id===raceRound?.courseId)?.gates[racer?.nextGate??-1];
  if(gate){map.beginPath();map.arc(px(gate.x),pz(gate.z),7,0,Math.PI*2);map.strokeStyle='#efbaf1';map.lineWidth=2;map.stroke();}
  map.save();map.strokeStyle='#85e9ff';map.lineWidth=2;map.setLineDash([5,4]);
  for(const lane of JET_STREAMS){
    // Sample the shared access boundary so a wind lane cannot reveal locked areas.
    const points=Array.from({length:49},(_,i)=>({x:lane.start.x+(lane.end.x-lane.start.x)*i/48,z:lane.start.z+(lane.end.z-lane.start.z)*i/48}));
    let drawing=false;map.beginPath();
    for(const point of points){
      if(!visible(point.x,point.z)){drawing=false;continue;}
      if(drawing)map.lineTo(px(point.x),pz(point.z));else map.moveTo(px(point.x),pz(point.z));
      drawing=true;
    }
    map.stroke();
    const accessible=points.filter(point=>visible(point.x,point.z));
    if(accessible.length){
      const point=accessible[Math.floor(accessible.length/2)],angle=Math.atan2(lane.end.z-lane.start.z,lane.end.x-lane.start.x);
      map.save();map.translate(px(point.x),pz(point.z));map.rotate(angle);map.setLineDash([]);map.beginPath();map.moveTo(-4,-4);map.lineTo(1,0);map.lineTo(-4,4);map.stroke();map.restore();
    }
  }
  map.setLineDash([]);map.strokeStyle='#ffe2a1';map.lineWidth=2;
  for(const t of THERMALS.filter(t=>visible(t.x,t.z))){map.beginPath();map.arc(px(t.x),pz(t.z),4,0,Math.PI*2);map.stroke();}
  map.restore();
  STATIONS.filter(s=>visible(s.x,s.z)).forEach(s=>{map.beginPath();map.arc(px(s.x),pz(s.z),2.8,0,Math.PI*2);map.fillStyle='#a8f1cb';map.fill();});
  SHOPS.filter(s=>visible(s.x,s.z)).forEach(s=>{map.save();map.translate(px(s.x),pz(s.z));map.rotate(Math.PI/4);map.fillStyle='#cf99ff';map.fillRect(-3,-3,6,6);map.restore();});
  session.world.pickups.filter(p=>p.kind==='rocket'&&p.active&&visible(p.x,p.z)).forEach(p=>{map.beginPath();map.arc(px(p.x),pz(p.z),2,0,Math.PI*2);map.fillStyle='#f1caff';map.fill();});
  session.world.entities.filter(e=>e.npc&&!e.driver&&visible(e.x,e.z)).forEach(e=>{map.fillStyle=e.police?'#ff7771':'#71cdd5';const size=e.police?4:2;map.fillRect(px(e.x)-size/2,pz(e.z)-size/2,size,size);});
  const player=session.world.players.find(p=>p.id===session.id);if(player){const target=orderTarget(player.delivery.order);map.beginPath();map.arc(px(target.x),pz(target.z),5,0,Math.PI*2);map.strokeStyle='#ffd384';map.lineWidth=2;map.stroke();}
  session.world.players.forEach(p=>{const e=session.world.entities.find(e=>e.id===p.entityId);if(!e||p.id===session.id||!visible(e.x,e.z))return;map.beginPath();map.arc(px(e.x),pz(e.z),3,0,Math.PI*2);map.fillStyle='#eee5ce';map.fill();});
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
    const driver=document.createElement('span');driver.className='score-driver';
    const name=document.createElement('span');name.textContent=p.name+(p.id===session.id&&p.name!=='You'?' (you)':'');driver.append(name);
    if(p.cockpit.active||p.cockpit.activeSeconds>0||p.cockpit.deliveries>0){
      const badge=document.createElement('small');badge.textContent=`${p.cockpit.active?'● FIRST PERSON · ':'FIRST PERSON · '}${p.cockpit.deliveries} ${p.cockpit.deliveries===1?'run':'runs'} · ${clock(p.cockpit.activeSeconds)}`;driver.append(badge);
    }
    row.append(driver);
    for(const value of [money(p.delivery.cash),clock(p.delivery.activeSeconds),money(p.delivery.activeSeconds>=1?Math.round(p.delivery.cash*60/p.delivery.activeSeconds):0)]){
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
  setDrawer(null);
  if(awardsDialog.open)awardsDialog.close();if(scoresDialog.open)scoresDialog.close();if(fleetDialog.open)fleetDialog.close();if(soundDialog.open)soundDialog.close();if(shopDialog.open)shopDialog.close();if(identityDialog.open)identityDialog.close();chatPanel.close();
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
for(const id of teslaIds){const spec=VEHICLES[id],button=document.createElement('button');button.dataset.vehicle=id;button.textContent=spec.name;button.style.setProperty('--vehicle-color',`#${spec.color.toString(16).padStart(6,'0')}`);button.onclick=()=>showVehicle(id);$('fleet-list').append(button);}
function openFleet(){controls.clear();controls.enabled=false;const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);showVehicle(entity&&entity.kind!=='person'&&VEHICLES[entity.kind].brand==='Tesla'?entity.kind:selectedVehicle);fleetDialog.showModal();}
function closeFleet(){fleetDialog.close();controls.clear();controls.enabled=!menu;}
$('fleet-close').onclick=closeFleet;fleetDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu;});
$('fleet-drive').onclick=()=>{const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);if(!entity||entity.supportId===null||entity.supportId==='ferry'||entity.loopAngle!==null||Math.abs(entity.speed)>1){$('fleet-feedback').textContent=entity?.supportId==='ferry'?'Drive off the ferry and stop before choosing a ride.':'Brake to a stop on the ground, then choose your ride.';return;}session.selectVehicle(previewVehicle);selectedVehicle=previewVehicle;startingSelect.value=previewVehicle;updateStarting();closeFleet();notice('Ride requested. Manual controls are fictional on wheel-less robotaxis.');};
function updateActivities(e:Entity){
  const world=session.world,ferry=world.ferry,secured=ferrySecured(ferry,e);
  const nearDock=Object.values(FERRY_DOCKS).some(dock=>Math.hypot(e.x-dock.x,e.z-dock.z)<180);
  const occupancy=world.entities.filter(car=>car.supportId==='ferry'&&car.kind!=='person').length;
  let ferryText='';
  if(nearDock||e.supportId==='ferry'||secured){
    const where=ferry.phase==='sf'?'SF':ferry.phase==='island'?'Rocket Island':ferry.phase==='to-island'?'Rocket Island':'SF';
    const timing=ferry.blocked==='ramp'?'waiting: move fully onto the deck and stop':ferry.blocked==='capacity'?'waiting: too many cars aboard':ferry.blocked==='apron'?'waiting for a clear arrival area':`${ferryDocked(ferry)?'departs':'arrives'} in ${Math.ceil(ferry.remaining)}s`;
    ferryText=`FERRY · ${ferryDocked(ferry)?`At ${where}`:`To ${where}`} · ${timing} · ${occupancy}/${FERRY_DECK.vehicleCapacity} cars`;
    if(secured)ferryText+=' · SECURED: controls resume on arrival; Unstuck returns to shore';
  }
  $('ferry-status').textContent=ferryText;
  const round=world.parking.rounds.find(r=>r.entrants.some(entrant=>entrant.playerId===session.id));
  const entrant=round?.entrants.find(entrant=>entrant.playerId===session.id);
  const lot=PARKING_LOTS.find(lot=>lot.id===round?.lotId);
  let parkingText='';
  if(round&&entrant&&lot){
    const remaining=Math.max(0,Math.ceil(round.endsAt-world.time));
    const stall=lot.stalls.find(stall=>stall.id===entrant.targetId);
    if(entrant.finishedAt!==null){
      parkingText=round.mode==='park'?`PARK IT · Finished in ${entrant.elapsed?.toFixed(1)??'—'}s`:`QUEUE · Parked in ${entrant.elapsed?.toFixed(1)??'—'}s · ${entrant.overtakes??0} overtakes`;
    }else if(round.phase==='results')parkingText=`${round.mode==='park'?'PARK IT':'QUEUE'} · Round ended`;
    else if(round.mode==='park')parkingText=`PARK IT · Stall ${entrant.targetId??'—'}${stall?` · ${Math.round(Math.hypot(e.x-stall.x,e.z-stall.z))}m`:''} · hold ${entrant.hold.toFixed(1)}/2s · ${remaining}s left`;
    else if(round.phase==='waiting')parkingText=`QUEUE · Position ${round.entrants.findIndex(p=>p.playerId===session.id)+1} · starts in ${remaining}s${round.hostId===session.id?' · Actions: Start queue':''}`;
    else parkingText=`QUEUE · Find an empty stall · ${remaining}s left`;
  }else if(PARKING_LOTS.some(lot=>Math.hypot(e.x-lot.area.x,e.z-lot.area.z)<Math.max(lot.area.width,lot.area.length)/2+25)){
    parkingText='PARKING PLAYGROUND · Actions: Park It or Cut the queue';
  }
  $('parking-status').textContent=parkingText;
  const racing=playerRace(world.races,session.id);
  const race=racing?.round,racer=racing?.entrant;
  const course=RACE_COURSES.find(course=>course.id===race?.courseId);
  let raceText='';
  if(race&&racer&&course){
    const remaining=Math.max(0,Math.ceil(race.endsAt-world.time)),name=course.name.toUpperCase();
    if(racer.status==='finished')raceText=`${name} · Finished ${racer.elapsed?.toFixed(1)??'—'}s${racer.rank?` · #${racer.rank}`:''}`;
    else if(racer.status==='dnf')raceText=`${name} · Did not finish`;
    else if(race.phase==='lobby')raceText=`${name} · Lobby ${race.entrants.length}/8 · starts in ${remaining}s${race.hostId===session.id?' · Actions: Start race':''}`;
    else if(race.phase==='countdown')raceText=`${name} · Starting in ${remaining}s`;
    else{
      const gate=course.gates[racer.nextGate];
      const feedback=racer.feedback==='wrong-way'?' · WRONG WAY':racer.feedback==='missed-gate'?' · MISSED GATE: return to checkpoint':'';
      raceText=`${name} · Gate ${racer.nextGate+1}/${course.gates.length}${gate?` · ${Math.round(Math.hypot(e.x-gate.x,e.z-gate.z))}m`:''} · ${remaining}s left${feedback}`;
    }
  }else if(RACE_COURSES.some(course=>Math.hypot(e.x-course.start.x,e.z-course.start.z)<course.start.radius+20))raceText='RACE START · Choose a course in Actions. Cars can bump.';
  $('race-status').textContent=raceText;
}

const shopDialog=$<HTMLDialogElement>('shop-dialog');
let shopBusyUntil=0,lastRocketEntity='',lastRocketInstalled=false;
let pendingShop:{requestId:number;upgrade:UpgradeId;sentAt:number}|null=null;
let pendingOta:{requestId:number;enabled:boolean;sentAt:number}|null=null;
$('ota-toggle').onclick=()=>{
  const player=session.world.players.find(p=>p.id===session.id);if(!player||pendingOta)return;
  const enabled=!player.delivery.ota.enabled,now=performance.now();shopBusyUntil=now+800;
  pendingOta={requestId:session.setOta(enabled),enabled,sentAt:now};updateShop();
};
for(const id of Object.keys(UPGRADES) as UpgradeId[]){
  const item=UPGRADES[id],row=document.createElement('div');row.className='shop-item';
  const copy=document.createElement('div'),title=document.createElement('strong'),description=document.createElement('p');title.dataset.upgradeTitle=id;
  title.textContent=item.name;description.textContent=item.description;copy.append(title,description);
  const button=document.createElement('button');button.dataset.upgrade=id;button.onclick=()=>{
    const now=performance.now();shopBusyUntil=now+800;
    pendingShop={requestId:session.buyUpgrade(id),upgrade:id,sentAt:now};
    $('shop-feedback').textContent='Checking purchase…';updateShop();
  };
  row.append(copy,button);$('shop-items').append(row);
}
function updateShop(){
  if(pendingShop){
    const result=session.upgradeResult;
    if(result?.requestId===pendingShop.requestId){
      $('shop-feedback').textContent=result.ok?`${UPGRADES[pendingShop.upgrade].name} ${pendingShop.upgrade==='service'?'complete':'installed'}.`:'Purchase declined. Check your cash, vehicle and position, then try again.';
      pendingShop=null;session.upgradeResult=null;
    }else if(performance.now()-pendingShop.sentAt>5000){
      $('shop-feedback').textContent='No reply yet. Check your cash and installed items before trying again.';pendingShop=null;
    }
  }
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car)return;
  if(pendingOta){
    const result=session.otaResult;
    if(result?.requestId===pendingOta.requestId&&!result.ok){$('shop-feedback').textContent='Subscription change declined. Please try again.';pendingOta=null;session.otaResult=null;}
    else if(result?.requestId===pendingOta.requestId&&player.delivery.ota.enabled===pendingOta.enabled){$('shop-feedback').textContent=pendingOta.enabled?'Subscription enabled. Remote access starts when paid.':'Subscription cancelled.';pendingOta=null;session.otaResult=null;}
    else if(performance.now()-pendingOta.sentAt>5000){$('shop-feedback').textContent='No reply yet. Check your subscription status before trying again.';pendingOta=null;}
  }
  const place=shopFor(car),rocket=hasRockets(car),ota=player.delivery.ota;
  const available=car.kind!=='person'&&(!!place||ota.active);
  $('shop-location').textContent=place?`${place.name} · Workshop connected.`:ota.active?'Remote shop connected · upgrades available anywhere.':'Visit a purple shop ring or subscribe for remote access.';
  $('shop-car').textContent=car.kind==='person'?'ON FOOT':VEHICLES[car.kind].name;
  $('shop-cash').textContent=`${money(player.delivery.cash)} available`;
  $('ota-status').textContent=!ota.enabled?'OFF · Subscribe to activate':ota.active?'ACTIVE · Next charge in '+Math.ceil(Math.max(0,(ota.renewAt??0)-session.world.time))+' seconds':'PAUSED · Waiting for $5';
  const otaButton=$<HTMLButtonElement>('ota-toggle');otaButton.textContent=pendingOta?'CHECKING…':ota.enabled?'CANCEL':'SUBSCRIBE';
  otaButton.disabled=!!pendingOta||!!pendingShop||performance.now()<shopBusyUntil;
  for(const id of Object.keys(UPGRADES) as UpgradeId[]){
    const button=document.querySelector<HTMLButtonElement>(`[data-upgrade="${id}"]`)!;
    const installed=id==='rocket'?rocket:id==='service'?car.health>=100&&car.air>=100:id==='tank'?car.tankLevel>=MAX_TANK_LEVEL:car.upgrades[id];
    const needsRocket=(id==='economy'||id==='tank')&&!rocket;
    const price=id==='tank'?tankUpgradePrice(car.tankLevel):UPGRADES[id].price;
    const name=id==='tank'?`Air tank · Level ${car.tankLevel}${installed?' (max)':` → ${car.tankLevel+1}`}`:UPGRADES[id].name;
    document.querySelector<HTMLElement>(`[data-upgrade-title="${id}"]`)!.textContent=name;
    button.textContent=installed?(id==='service'?'FULL':id==='tank'?'MAX':'INSTALLED'):needsRocket?'NEEDS ROCKET':money(price);
    button.setAttribute('aria-label',`${name}: ${button.textContent}`);
    button.disabled=!available||installed||needsRocket||player.delivery.cash<price||!!pendingShop||!!pendingOta||performance.now()<shopBusyUntil;
  }
}
function openShop(){
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car)return;
  controls.clear();controls.enabled=false;
  if(!pendingShop)$('shop-feedback').textContent='Earn cash by delivering food. Upgrades stay on this car while it remains in the session. Fictional workshop; no affiliation implied.';
  updateShop();shopDialog.showModal();
}
function closeShop(){shopDialog.close();controls.clear();controls.enabled=!menu&&session.status!=='disconnected';}
$('shop-close').onclick=closeShop;shopDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status!=='disconnected';});

scene.start(dt=>{
  const current=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===current?.entityId);
  const cockpit=!!car&&car.kind!=='person'&&scene.cameraMode==='cockpit'&&!menu&&started;
  const input=controls.read();input.cockpit=cockpit&&!document.hidden&&document.hasFocus();
  session.tick(dt,input);audio.update(session.world,session.id,started&&!menu&&(session.status==='solo'||session.status==='online'));scene.render(session.world,session.id,dt,menu);
  const observedPlayer=session.world.players.find(p=>p.id===session.id),observedCar=session.world.entities.find(e=>e.id===observedPlayer?.entityId);
  if(started&&!menu&&!document.hidden&&(session.status==='solo'||session.status==='online')&&observedPlayer){
    const now=Date.now(),active=observedPlayer.delivery.activeSeconds;
    if(active>lastActiveSeconds)lastActiveAt=now;
    if(!playRecorded||(active>lastActiveSeconds&&now-lastPlayWrite>=10000))recordPlay(now);
    lastActiveSeconds=active;
  }
  if(observedCar)controls.observeFlight(hasRocket(observedCar,session.world.time)&&observedCar.loopAngle===null&&observedCar.supportId===null,observedCar.lastJump,observedCar.speed);
  document.body.classList.toggle('cockpit-active',cockpit);
  $('cockpit-trim').hidden=!cockpit;$('cockpit-dashboard').hidden=!cockpit||!!car?.inDome;
  const marker=scene.objectiveScreen(),sign=$('objective-sign');sign.hidden=!cockpit||!!car?.inDome||!marker.visible;
  if(!sign.hidden){sign.style.left=`${Math.max(12,Math.min(88,marker.x*100))}%`;sign.style.top=`${Math.max(22,Math.min(75,marker.y*100))}%`;}
  hudTime+=dt;if(hudTime<.1)return;hudTime=0;controlSettings.refreshStatus();
  $('connection').textContent=session.status==='online'?`● LIVE / ${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`:session.status==='connecting'?'◌ JOINING ROOM…':session.status==='disconnected'?'○ DISCONNECTED':'● SOLO PLAYGROUND';
  if(session.status==='disconnected'){if(shopDialog.open)shopDialog.close();controls.clear();controls.enabled=false;$('error').classList.remove('hidden');$('error-copy').textContent=session.error;}
  const player=session.world.players.find(p=>p.id===session.id),e=session.world.entities.find(e=>e.id===player?.entityId);
  if(!e)return;
  cameraLabel(e.kind==='person');
  $('mission-panel').classList.toggle('hidden',e.inDome);$('dome-score').classList.toggle('hidden',!e.inDome);
  const domeButton=$('dome'),domeLabel=e.inDome?'↩ Leave Dome':'⚽ Rocket Dome';
  const domeAria=e.inDome?`Leave Rocket Dome and return to ${e.domeReturn==='island'?'Rocket Island':'the Bay'}`:'Travel to China Basin Rocket Dome';
  if(domeButton.textContent!==domeLabel)domeButton.textContent=domeLabel;
  if(domeButton.getAttribute('aria-label')!==domeAria)domeButton.setAttribute('aria-label',domeAria);
  if(e.inDome){
    const soccer=session.world.soccer;
    const blue=`BLUE ${soccer.blueScore}`,orange=`${soccer.orangeScore} ORANGE`;
    const goalCount=(participant:typeof soccer.participants[number])=>participant.goals.roadster+participant.goals.retrofit+participant.goals.stock;
    const ownParticipant=soccer.participants.find(participant=>participant.playerId===session.id);
    const ownGoals=ownParticipant?goalCount(ownParticipant):0;
    const topGoals=Math.max(0,...soccer.participants.map(goalCount));
    const leaders=topGoals?soccer.participants.filter(participant=>goalCount(participant)===topGoals):[];
    const driverName=(id:string)=>id===session.id?'You':session.world.players.find(player=>player.id===id)?.name??'Driver';
    const leader=leaders.length?`${driverName(leaders[0].playerId)}${leaders.length>1?` +${leaders.length-1}`:''} (${topGoals})`:'No leader yet';
    const standings=`Your goals: ${ownGoals} · ${leaders.length?`Leader: ${leader}`:leader}`;
    const winner=soccer.winningPlayers;
    const status=soccer.phase==='win'?(winner.length===0?'Match complete · no credited winner':winner.includes(session.id)?`${winner.length>1?'You share':'You take'} the win! New match soon.`:`${driverName(winner[0])}${winner.length>1?` +${winner.length-1} share the win`:' wins'}! New match soon.`):soccer.phase==='goal'?`${soccer.lastScorer?.toUpperCase()} goal! Last touch gets credit.`:'Either goal counts · first color to 5 ends match';
    if($('dome-blue').textContent!==blue)$('dome-blue').textContent=blue;
    if($('dome-orange').textContent!==orange)$('dome-orange').textContent=orange;
    if($('dome-status').textContent!==status)$('dome-status').textContent=status;
    if($('dome-standings').textContent!==standings)$('dome-standings').textContent=standings;
  }
  const minute=Math.floor(dayMinute(session.world.time));$('day-clock').textContent=`${Math.floor(minute/60).toString().padStart(2,'0')}:${(minute%60).toString().padStart(2,'0')}`;
  $('speed').textContent=Math.round(Math.abs(e.speed)*3.6).toString().padStart(3,'0');$('altitude').textContent=`${Math.round(e.y)} M ALT`;
  $('cockpit-speed').textContent=String(Math.round(Math.abs(e.speed)*3.6));
  const spec=e.kind==='person'?null:VEHICLES[e.kind];
  $('vehicle').textContent=spec?.name.toUpperCase()??'ON FOOT';
  const rocket=hasRocket(e,session.world.time);
  if(lastRocketEntity===e.id&&!lastRocketInstalled&&rocket)notice('Rocket flight ready! Jump, hover, boost and flip.');
  lastRocketEntity=e.id;lastRocketInstalled=rocket;
  $('handling').textContent=spec?`${Math.round(spec.massKg).toLocaleString()} kg · ${spec.fourWheelSteering?'4-wheel steer':'Front steer'}${rocket?' · ROCKET':''}${e.autopilot?' · AUTONOMOUS':''}`:'';
  $('autopilot').textContent=`${controlSettings.label('autopilot')} · AV ${e.autopilot?'on':'off'}`;$('autopilot').setAttribute('aria-pressed',String(e.autopilot));$<HTMLButtonElement>('autopilot').disabled=e.kind==='person';
  const secured=ferrySecured(session.world.ferry,e);
  const airborne=e.loopAngle===null&&e.supportId===null;
  for(const control of ['KeyQ','KeyR','KeyX','ShiftLeft','KeyE']){
    const button=document.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);if(button)button.disabled=!rocket||secured;
  }
  $('rocket-status').hidden=!rocket||!!spec?.airThrusters||e.upgrades.rocket;
  $('rocket-status').textContent=rocket&&!spec?.airThrusters&&!e.upgrades.rocket?`TEMP ROCKET · ${Math.ceil(e.rocketUntil-session.world.time)}s`:'';
  $('flight').textContent=e.loopAngle!==null||e.supportId==='dome'?'SUCTION':airborne?'AIRBORNE':'GROUNDED';$('flight').classList.toggle('flying',airborne||e.loopAngle!==null||e.supportId==='dome');
  $('jump-control').textContent='JUMP / HOVER';$('jump-control').setAttribute('aria-label',airborne?'Tap to air jump, hold to hover':'Tap to jump, hold to hover');
  $('drive-control').textContent=controls.airborne?'FLY ↑':'DRIVE ↑';$('drive-control').setAttribute('aria-label',controls.airborne?'Fly forward':'Drive');
  document.querySelector('[data-control="KeyA"]')?.setAttribute('aria-label',airborne?'Bank left':'Steer left');document.querySelector('[data-control="KeyD"]')?.setAttribute('aria-label',airborne?'Bank right':'Steer right');
  $('air-label').textContent=`AIR LV ${e.tankLevel}`;$('air').classList.toggle('air-low',rocket&&e.air<12);$('air').textContent=`${Math.round(e.air)}%`;$('air-bar').style.width=`${e.air}%`;$('health').textContent=`${Math.round(e.health)}%`;$('health-bar').style.width=`${e.health}%`;
  $('interact').textContent=`${controlSettings.label('interact')} · ${e.kind==='person'?'Take nearby car':'Exit car'}`;
  const nearest=STATIONS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const distance=Math.hypot(e.x-nearest.x,e.z-nearest.z),station=chargingStationAt(e.x,e.z),refilling=!!station&&e.supportId==='ground'&&e.loopAngle===null&&Math.abs(e.y-(terrainHeight(station!.x,station!.z)??0))<1&&Math.abs(e.speed)<1&&e.kind!=='person';
  const skyCurrent=currentAt(e);
  $('station-status').textContent=skyCurrent?`${skyCurrent.kind==='thermal'?'↑ THERMAL · LIFT + AIR':'➜ SKY LANE · SPEED + AIR'} · ${skyCurrent.name}`:refilling?`ϟ FICTIONAL AIR REFILL · ${nearest.name}`:rocket&&e.air<12?`LOW AIR · ${nearest.name} refill · ${Math.round(distance)} m`:`ϟ AIR REFILL (GAME) · ${nearest.name} · ${Math.round(distance)} m`;
  $('station-status').classList.toggle('refilling',refilling||!!skyCurrent);
  $('station-status').classList.toggle('sky-active',!!skyCurrent);
  const nearbyShop=SHOPS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const shopDistance=Math.hypot(e.x-nearbyShop.x,e.z-nearbyShop.z),shopReady=!!shopFor(e);
  $('shop-prompt').hidden=menu||!started||e.kind==='person'||shopDistance>30||shopDialog.open;
  $('shop-prompt').textContent=shopReady?`✦ ${controlSettings.label('shop')} · Enter shop · ${nearbyShop.name}`:shopDistance<SHOP_RADIUS?'✦ Stop to enter the shop':'✦ Purple ring · upgrade shop';
  if(shopDialog.open)updateShop();
  if(player){
    const d=player.delivery,order=d.order,target=orderTarget(order),distance=Math.round(Math.hypot(e.x-target.x,e.z-target.z));
    $('mission-label').textContent=order.stage==='pickup'?'PICK UP / FOOD RUN':target.rooftop?'DELIVER / ROOFTOP':'DELIVER / FOOD RUN';
    const bearing=Math.atan2(-(target.x-e.x),-(target.z-e.z))-e.yaw;
    const octant=(Math.round(Math.atan2(Math.sin(bearing),Math.cos(bearing))/(Math.PI/4))+8)%8;
    $('mission').textContent=`${['↑','↖','←','↙','↓','↘','→','↗'][octant]} ${target.name} · ${distance} m`;
    const protectedArea=islandProtected(e),paused=protectedArea||session.world.time>d.activeUntil;
    const pickupBonus=pickupBonusFor(order);
    $('hint').textContent=(protectedArea?'DELIVERY PAUSED · ':'')+(order.stage==='pickup'?`${clock(order.elapsed)} / ${clock(order.pickupEstimate)} pickup${paused&&!protectedArea?' · paused':''} · ${pickupBonus>0?`fast pickup +${money(pickupBonus)}`:'pickup bonus expired'}`:`${clock(order.elapsed)} / ${clock(order.estimate)} estimate${paused&&!protectedArea?' · paused':''} · ${money(payoutFor(order))} if delivered now${target.rooftop?` · land on roof ${Math.round(target.y)}m up`:''}`);
    $('cockpit-phase').textContent=order.stage==='pickup'?'PICK UP':target.rooftop?'ROOFTOP DELIVERY':'DELIVER';
    $('cockpit-target').textContent=$('mission').textContent;$('cockpit-estimate').textContent=$('hint').textContent;
    $('objective-phase').textContent=$('cockpit-phase').textContent;$('objective-name').textContent=target.name;$('objective-distance').textContent=`${distance} m`;
    if(d.lastReward&&d.lastReward.id>lastRewardId){lastRewardId=d.lastReward.id;celebrateReward(d.lastReward);}
    $('delivery-stats').textContent=`${money(d.cash)} cash · ${clock(d.activeSeconds)} active${d.lastPayout!==null?` · last delivery +${money(d.lastPayout)}`:''}`;
    const next=LEVELS[d.level+1];
    $('region-progress').textContent=next?`LEVEL ${d.level} · ${next.name}: ${Math.min(d.completed,next.deliveries)}/${next.deliveries} deliveries · ${money(Math.min(d.earned,next.earned))}/${money(next.earned)} earned`:`LEVEL ${d.level} · The Bay is open`;
    if(lastLevel!==undefined&&d.level>lastLevel)notice(`${LEVELS[d.level].name} unlocked!`);
    lastLevel=d.level;
    if(d.lastBlocked&&d.lastBlocked.at>lastBlockedAt){lastBlockedAt=d.lastBlocked.at;if(session.world.time-lastBlockedNoticeAt>=5){lastBlockedNoticeAt=session.world.time;const goal=LEVELS[d.lastBlocked.level];notice(`${goal.name} opens at ${goal.deliveries} deliveries and ${money(goal.earned)} earned.`);}}
    const chased=session.world.entities.some(c=>c.police?.targetId===player.id);
    $('police-status').textContent=chased?'⚠ POLICE PURSUIT · LAND OR ESCAPE · FINE RISING':protectedArea?'Rocket Island and the ferry are police-free.':d.lastTicket!==null?`Last citation −${money(d.lastTicket.amount)} · repeat fines rise`:'Flying near police starts a chase.';
    $('police-status').classList.toggle('chased',chased);
    if(scoresDialog.open)updateScores();if(awardsDialog.open)updateAwards();
    const newAwards=player.achievements.unlocked.filter(id=>!seenAchievements.has(id));
    for(const id of newAwards){seenAchievements.add(id);achievementQueue.push(id);}
    if(newAwards.length&&!achievementTimer)announceAchievements();
    if(d.lastTicket&&d.tickets>lastTicketCount&&!menu&&session.status!=='disconnected'&&!ticketDialog.open){lastTicketCount=d.tickets;showTicket(d.lastTicket);}
  }
  $('air').textContent=rocket?`${Math.round(e.air)}%`:'—';$('air-bar').style.width=rocket?`${e.air}%`:'0%';
  updateActivities(e);
  $('players').textContent=`${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`;minimap(e,player?.delivery.level??0);
});
