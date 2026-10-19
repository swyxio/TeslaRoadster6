import { playtestMode } from '../shared/playtest';
import './style.css';
import './shop.css';
import './identity.css';
import './mobile-hud.css';
import './drive-feedback.css';
import { setupMobileHud } from './mobile-hud';
import { DriveFeedback } from './drive-feedback';
import { setupMinigames } from './minigames';
import { createProgressPanels } from './progress-panels';
import { confirmedGoalOwner, nextDeliveryAward, nextReachableTier, tierGoalLabel } from './next-goal';
import { listenForDoubleShift } from './double-shift';
import { createMapDialog } from './map-dialog';
import { createDriveModes } from './self-drive-mode';
import { createChatPanel } from './chat-panel';
import { GlobalChat } from './chat';
import { limitDriverNameInput } from './driver-name';
import { MAX_NAME_LENGTH, normalizeName } from '../worker/global-chat-core';
import mapSourceUrl from '../shared/bay-route-source.json?url';
import mapTraceUrl from '../shared/bay-highway-traces.ts?url&no-inline';
import mapBakeUrl from '../shared/bake-bay-highways.py?url&no-inline';
import { FleetPreview } from './fleet-preview';
import { createLuxuryShowroom } from './luxury-ui';
import { createCybercabUI } from './cybercab-ui';
import { createMarketUI } from './market-ui';
import { MarketClient } from './market-client';
import { propertyRoom, propertyRoomAssetId } from '../shared/property';
import { quoteCybercabPurchase } from '../shared/cybercabs';
import { LUXURY_CATALOG, LUXURY_SHOWROOM, atLuxuryShowroom, luxuryVehicle, type LuxuryVehicleId } from '../shared/luxury';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from '../shared/vehicles';
import { GameScene } from './scene';
import { DEFAULT_ROOM, Session, validRoom, type WalletView } from './session';
import { publicRoomNumber, roomEntry, roomLabel, roomSearch } from './room-address';
import { Controls } from './controls';
import { setupControlSettings } from './control-settings';
import { GameAudio } from './audio';
import { Radio, type RadioStation } from './radio';
import { STATIONS } from '../shared/stations';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { EAST_SOUTH_ADDITIONS } from '../shared/east-south-additions';
import { refillStationFor } from '../shared/charging';
import { type Entity } from '../shared/game';
import { ferryDocked, ferrySecured, islandProtected, FERRY_DECK } from '../shared/ferry';
import { PARKING_LOTS } from '../shared/parking-lots';
import { RACE_COURSES } from '../shared/race-courses';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { playerRace } from '../shared/race';
import { PAINTS, DECALS, type StyleChoice, type PaintId, type DecalId } from '../shared/vehicle-style';
import { OTA_FEE } from '../shared/ota';
import { marketPaintColor } from '../shared/market-catalog';
import { canAssignDeliveryRoof, LEVELS, PICKUP_STOP_ALLOWANCE, isOrderAccessible, levelForCash, orderTarget, payoutFor, pickupBonusFor, requiredLevelAt, type Level } from '../shared/delivery';
import { DELIVERY_CHECKPOINT_INTERVAL, DELIVERY_CHECKPOINT_REWARD, deliveriesUntilCheckpoint } from '../shared/delivery-checkpoint';
import { celebrateReward, resetCelebration } from './rewards';
import { upgradePrice } from '../shared/research';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import { selectAchievementTiers, type AchievementTierId, type AchievementTierRow } from '../shared/achievement-tiers';
import { AchievementEventTracker } from './achievement-events';
import { LevelEventTracker } from './level-events';
import { DeliveryGuidance, type GuidanceResponse } from './delivery-guidance';
import type { Ticket } from '../shared/delivery';
import { dayMinute } from '../shared/day';
import { DOME, chargingDomeWall } from '../shared/dome';
import { DOME_MATCH_CASH, DOME_WIN_CASH } from '../shared/earnings-events';
import { pulseShotRemaining } from '../shared/soccer';
import { BRIDGES, DISTRICTS, FERRY_DOCKS, FREMONT_SPACEPORT, HIGHWAYS, LANDMARKS, MAP_BOUNDS, REGIONS, ROADS, STUNT_LOOP, TESLAND_MONUMENTS } from '../shared/map';
import { createMarsUI } from './mars-ui';
import { StarshipClient } from './starship-client';
import { createEarningsBonusBadge } from './earnings-bonus-ui';
import './earnings-bonus-ui.css';
import { SHOPS, SHOP_RADIUS, UPGRADES, hasIntercity, hasRockets, shopFor, type UpgradeId } from '../shared/upgrades';
import { currentAt, currentBlockedByProgression, JET_STREAMS, THERMALS } from '../shared/sky-currents';
import { drawLockedAreas } from './access-overlay';
import { MAX_TANK_LEVEL, tankUpgradePrice } from '../shared/air-tank';
import { CURRENT_RELEASE, releaseLabel } from '../content/version';
import { browserStorage, readLastPlayed, writeLastPlayed } from './release-tracker';
import { readDriverRecovery, stageDriverRecovery, confirmDriverRecovery, setDriverRemember, forgetDriverRecovery, connectDriverWallet } from './driver-recovery';

document.title=`Tesland · v${CURRENT_RELEASE.label}`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let deliveryGuide:DeliveryGuidance|undefined;
function roadGuidance():DeliveryGuidance {
  if(!deliveryGuide){
    let worker:Worker|undefined;
    deliveryGuide=new DeliveryGuidance(request=>worker?.postMessage(request));
    try {
      worker=new Worker(new URL('./delivery-guidance.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=(event:MessageEvent<GuidanceResponse>)=>deliveryGuide!.receive(event.data);
      worker.onerror=()=>deliveryGuide!.workerFailed();
      worker.onmessageerror=()=>deliveryGuide!.workerFailed();
    } catch {deliveryGuide.workerFailed();}
  }
  return deliveryGuide;
}
document.querySelector('#app')!.innerHTML = `
<canvas id="world" aria-label="Tesland 3D driving world"></canvas>
<div class="vignette"></div>
<header class="topbar"><div class="brand-build"><a class="brand" href="/" aria-label="Tesland home"><span class="brand-icon">↗</span> TES<span class="brand-light">LAND</span><span class="alpha">THE BAY / 2050</span></a><a class="build-version" href="/changelog/#${encodeURIComponent(CURRENT_RELEASE.version)}" target="_blank" rel="noopener noreferrer" aria-label="Tesland version ${CURRENT_RELEASE.label}; open changelog in a new tab">v${CURRENT_RELEASE.label}</a></div><div class="top-actions"><span id="connection" class="pill"><i></i> JOINING ROOM…</span><button id="chat-button" class="icon-button chat-button" aria-label="Open global chat" aria-haspopup="dialog">💬<span id="chat-unread" class="chat-unread" hidden></span></button><button id="sound-button" class="icon-button sound-button" aria-label="Sound settings" aria-haspopup="dialog">♫</button><button id="menu-button" class="icon-button" aria-label="Open menu">☰</button></div></header>
<section id="menu" class="menu">
 <div class="intro"><div class="eyebrow"><span class="line"></span> THE BAY AREA / 2050</div><h1>Welcome to<br><em>Tesland.</em></h1><p class="intro-copy">The Roadsters finally arrived. Tesla and SpaceX run the Bay. You have deliveries to make.<br>Catch air, find shortcuts, and make your own way.</p>
 <div class="feature-row"><span>01 / DRIVE</span><span>02 / FLY</span><span>03 / DELIVER</span></div><p class="cockpit-invitation">Find a purple rocket to fly any car. Catch blue sky lanes for speed and air, or ride golden thermals upward. Try cockpit view with Actions → Camera.</p>
 <div class="launch-card"><div class="card-heading"><span class="eyebrow">YOUR NEXT DETOUR</span><span class="online-dot">● FREE ROAM</span></div>
 <label class="ride-select">STARTING RIDE<select id="starting-ride" aria-label="Starting vehicle"></select></label><p class="ride-note" id="starting-spec"></p><button id="apply-ride" class="text-button" type="button" hidden>Change to this ride</button>
 <div class="room-form"><label>DRIVER NAME<input id="name" maxlength="${MAX_NAME_LENGTH * 2}" placeholder="Your callsign" value="Driver" autocomplete="nickname"></label><label>ROOM CODE<input id="room" maxlength="32" placeholder="bay" pattern="[a-z0-9-]+" value="${DEFAULT_ROOM}" autocapitalize="none" spellcheck="false"></label></div>
 <p class="driver-name-note">Names in use get a number. <button id="identity-button" type="button" aria-haspopup="dialog">Save or recover a driver</button></p>
 <button id="join" class="primary">Join room <span>↗</span></button>
 <p class="form-note" id="form-note" role="status">Join friends with a room code. Change rides here or use Actions → Fleet.</p>
 <button id="control-settings-menu" type="button" class="text-button">Controls &amp; gamepad</button><br><button id="mars-menu" type="button" class="text-button">🚀 Starship mission &amp; launch view</button><br><details class="playtest-menu"><summary>Playtest · start fresh or unlock everything</summary><p>Your saved driver stays safe. Practice progress is discarded when you leave.</p><div class="playtest-options"><button id="playtest-fresh" type="button">Fresh driver · level 1 tank</button><button id="playtest-sandbox" type="button">Sandbox · all cars &amp; upgrades</button><button id="playtest-return" type="button">Return to saved driver</button></div><p>Sandbox room code: <b>sandbox</b> (or sandbox-your-name). Includes unlimited spending and map teleport. Trading, passive businesses and the Mars fund stay in the main game.</p></details>
 <button id="resume" class="text-button hidden">← Back to your drive</button>
 </div>
 <div class="release-links"><span>${CURRENT_RELEASE.label}</span><a id="release-changelog" href="/changelog/">Changelog</a><a href="/blog/">Dev blog</a><a href="/lore/">The story</a></div><p id="last-played" class="last-played">No earlier play recorded on this browser.</p>
 <p class="fine-print">An independent, fictional satire. No Tesla or SpaceX affiliation.<br>Fictional flight & air service.<br>Real Supercharger sites. A deliberately remixed Bay Area.<br>Road data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL) · <a href="${mapSourceUrl}" download="bay-route-source.json">Source</a> · <a href="${mapTraceUrl}" download="bay-highway-traces.ts">Map data</a> · <a href="${mapBakeUrl}" download="bake-bay-highways.py">Bake</a>.</p>
 </div>
 <aside class="world-caption"><span class="eyebrow">37°46′ N &nbsp; 122°25′ W</span><h2>Your city.<br>Your <em>shortcut.</em></h2><span class="caption-rule"></span><p>FOOD · FLIGHT · THE FUTURE</p></aside>
</section>
<section id="hud" class="hidden" aria-label="Driving instruments">
 <div id="reward" class="reward" role="status" aria-live="polite" aria-atomic="true"><div class="confetti" aria-hidden="true"></div><div class="reward-card"><span id="reward-label"></span><strong id="reward-amount"></strong></div></div>
 <div id="achievement-toast" class="achievement-toast hidden" role="status" aria-live="polite"></div>
 <div class="mission" id="mission-panel" aria-live="polite"><span id="property-name" hidden></span><div class="mission-head"><span class="eyebrow" id="mission-label">PICK UP</span><strong id="mission">Find your first restaurant.</strong><button type="button" id="mission-panel-toggle" class="mobile-panel-toggle" aria-controls="mission-panel" aria-expanded="true">Details −</button></div><button type="button" id="mars-quick" class="mission-link" hidden>🚀 Fremont mission sign</button><span id="hint">Stop at the glowing marker.</span><span id="delivery-stats"></span><span id="region-progress"></span><span id="police-status"></span><span id="ferry-status"></span><button type="button" id="route-goal" class="mission-link" hidden></button><span id="route-advice" class="mission-advice" hidden></span><button type="button" id="next-award" class="mission-link" hidden></button><span id="parking-status"></span><span id="race-status"></span></div>
 <div id="dome-score" class="dome-score hidden" role="status" aria-live="polite"><span class="eyebrow">CHINA BASIN / ROCKET DOME · GOAL RACE</span><strong><span id="dome-blue">BLUE 0</span><span aria-hidden="true"> — </span><span id="dome-orange">0 ORANGE</span></strong><span id="dome-status">Either goal counts · first color to 5 ends match</span><span id="dome-standings">Your goals: 0 · No leader yet</span><small id="dome-powerups" aria-live="off">Touch the ball and finish to unlock Pulse Shot · Win to unlock Champion Charge</small><small>Touch + finish: $${DOME_MATCH_CASH} · Win: +$${DOME_WIN_CASH} · Bonuses apply</small><small>Last touch scores · gold walls refill air</small></div>
 <div class="action-drawer"><button id="actions-toggle" class="hud-toggle" aria-expanded="false" aria-controls="drive-actions">Actions <span aria-hidden="true">⌄</span></button><div id="drive-actions" class="drive-actions" hidden><button id="control-settings">⌨ Controls &amp; gamepad</button><button id="minigames">🎮 Mini-games</button><button id="delivery-drive">🚘 Self-drive to delivery</button><button id="charger-drive">ϟ Self-drive to charger</button><div id="delivery-drive-mode"></div><button id="mars-action">🚀 Mars mission</button><button id="identity-action">◉ Driver identity</button><button id="invite">↗ Invite</button><button id="return-bay" hidden>↩ Return to Bay</button><button id="camera" aria-label="Camera: chase. Switch view">C · Chase</button><button id="interact">F · Exit car</button><button id="recover">K · Unstuck</button><button id="autopilot" aria-pressed="false">V · AV off</button><button id="fleet">G · Fleet</button><button id="cybercabs">🚕 Cybercabs</button><button id="market">◈ Market</button><button id="shop">B · Shop</button><button id="scores">L · Scores</button><button id="awards">T · Awards</button></div></div>
 <button id="shop-prompt" class="shop-prompt" hidden></button>
 <div id="cockpit-trim" class="cockpit-trim" hidden aria-hidden="true"></div>
 <div id="cockpit-dashboard" class="cockpit-dashboard" hidden><div class="cockpit-route"><span id="cockpit-phase">PICK UP</span><strong id="cockpit-target"></strong><small id="cockpit-estimate"></small></div><div class="cockpit-speed"><strong id="cockpit-speed">0</strong><span>KM/H</span></div></div>
 <div id="objective-sign" class="objective-sign" hidden aria-hidden="true"><span id="objective-phase"></span><strong id="objective-name"></strong><small id="objective-distance"></small></div>
 <div class="map-panel" id="map-panel"><button type="button" id="map-panel-toggle" class="mobile-panel-toggle" aria-controls="map-toggle" aria-expanded="true">Map −</button><div class="map-title"><span id="map-label">LOCAL · TAP</span><span id="day-clock">06:00</span></div><button id="map-toggle" class="map-toggle" aria-label="Switch between local and Bay map" aria-pressed="false"><canvas id="minimap" width="240" height="240" aria-label="Map of the Bay; ferry docks are white diamonds, the ferry is a white boat, orange bars are island ramps, blue dashed arrows are sky lanes, gold rings are thermals, mint dots are Superchargers, purple diamonds are upgrade shops, lavender dots are rocket kits, yellow ring is your delivery, gold dots mark monuments, a gold diamond marks the Vault showroom, coral squares mark Caltrain stops, orange dot is the Fremont spaceport, red dots are police, orange arrow is you"></canvas></button><div class="map-key"><b>▲ YOU</b> <i></i> AIR <b class="shop-key">◆ SHOP · KIT</b> <span id="players">1 DRIVER</span></div><div class="sky-key">┄ SKY LANES &nbsp; ◌ THERMALS</div></div>
 <div class="telemetry" id="instrument-panel"><span id="drive-feedback" class="drive-feedback" role="status" aria-live="polite" aria-atomic="true" hidden></span><button type="button" id="instrument-panel-toggle" class="mobile-panel-toggle" aria-controls="instrument-panel" aria-expanded="true">Stats −</button><div class="vehicle-title"><span id="vehicle">TESLA ROADSTER</span><span id="flight" class="flight">GROUNDED</span></div><div id="handling" class="handling"></div><div class="speed"><strong id="speed">000</strong><span>KM/H<br><b id="altitude">0 M ALT</b></span></div><div class="meter-row"><span id="air-label">AIR LV 1</span><div class="meter"><i id="air-bar"></i></div><b id="air">100%</b></div><div class="meter-row health"><span>CONDITION</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div id="station-status">Find a Supercharger to refill</div></div>
 <div class="control-guide"><button id="controls-toggle" class="hud-toggle" aria-expanded="false" aria-controls="keyboard-help">⌨ &nbsp;Controls</button><div id="keyboard-help" class="keyboard-help" hidden><strong>DRIVING CONTROLS</strong><p><kbd>W A S D</kbd> or arrows · drive and fly forward / back, steer</p><p><kbd>SPACE</kbd> brake / drift on the road · flip in the air</p><p><kbd>E</kbd> jump / hold to hover &nbsp; <kbd>X</kbd> flip</p><p><kbd>SHIFT</kbd> boost · double-tap to self-drive to your delivery &nbsp; <kbd>Q / R</kbd> roll</p><p><kbd>F</kbd> enter / exit &nbsp; <kbd>K</kbd> unstuck &nbsp; <kbd>C</kbd> camera</p><p><kbd>V</kbd> autopilot &nbsp; <kbd>G</kbd> fleet &nbsp; <kbd>B</kbd> shop &nbsp; <kbd>L</kbd> scores &nbsp; <kbd>T</kbd> awards</p><small>Gold diamonds refill air and give $5; green diamonds repair and give $5. Purple pads grant flight for the session or refill an equipped car. Blue sky lanes add speed and refill air; golden thermals lift and refill air. Drive onto the SF ferry for North Bay Playground.</small></div></div>
 <div class="touch-controls"><div class="steering"><button data-control="KeyA" aria-label="Steer left">◀</button><button data-control="KeyD" aria-label="Steer right">▶</button><button data-control="KeyS" aria-label="Reverse; brake to drift">REV</button><button data-control="Space" aria-label="Brake; steer while moving forward to drift">BRAKE</button></div><div class="touch-flight"><button data-control="KeyQ" aria-label="Roll left">↶</button><button data-control="KeyR" aria-label="Roll right">↷</button><button class="flip-control" data-control="KeyX" aria-label="Flip">FLIP</button></div><div class="pedals"><button data-control="ShiftLeft">BOOST</button><button id="jump-control" data-control="KeyE" aria-label="Jump">JUMP ↑</button><button id="drive-control" class="accelerate" data-control="KeyW" aria-label="Drive">DRIVE ↑</button></div></div>
</section>
<dialog id="controls-dialog" class="controls-dialog" aria-labelledby="controls-title"><div class="fleet-header"><div><span class="eyebrow">YOUR DRIVE / INPUTS</span><h2 id="controls-title">Controls &amp; gamepad</h2></div><button id="controls-close" aria-label="Close controls">✕</button></div><div class="gamepad-guide"><strong>Controller · Xbox / PlayStation</strong><p id="gamepad-status" role="status"></p><p>Left stick steer · RT / R2 accelerate · LT / L2 brake, then reverse · A / ✕ jump / hold to hover · X / □ flip · B / ○ boost · LB / L1 and RB / R1 roll (or right stick).</p><p>D-pad: up enter / exit, down camera, left unstuck, right autopilot · Menu / Options opens the menu. Use mouse, keyboard or touch for menus.</p><p>Diamond markings show the inside HOV lanes on US 101 and I-880. Skyways add speed and air; highway patrols watch for speeds over 125 km/h.</p></div><div class="bindings-heading"><strong>Keyboard bindings</strong><button id="bindings-reset" type="button">Reset defaults</button></div><p class="form-note">Select either key to change it. Backspace clears; Escape cancels. Browser shortcuts stay available.</p><p id="bindings-feedback" class="bindings-feedback" role="status"></p><div id="bindings-list" class="bindings-list"></div></dialog>
<dialog id="fleet-dialog" aria-labelledby="fleet-title"><div class="fleet-header"><div><span class="eyebrow">TESLAND / TESLA COLLECTION</span><h2 id="fleet-title">Choose your Tesla.</h2></div><button id="fleet-close" aria-label="Close fleet">✕</button></div><p class="fleet-intro">Choose a Tesla here. Waymo, Cruise and Zoox vehicles can only be taken from the street. Upgrades stay with each car; choosing a Tesla replaces your personal car.</p><div class="fleet-body"><div id="fleet-list" class="fleet-list"></div><aside class="fleet-detail"><span id="fleet-brand" class="eyebrow"></span><h3 id="fleet-name"></h3><p id="fleet-status"></p><canvas id="fleet-preview" aria-label="Selected low-poly vehicle model"></canvas><dl id="fleet-specs"></dl><p id="fleet-estimates"></p><a id="fleet-source" target="_blank" rel="noopener noreferrer">View design source ↗</a><button id="fleet-drive" class="primary">Take this ride →</button><p class="form-note" id="fleet-feedback" role="status">Stop on the ground before changing rides.</p></aside></div></dialog>
<dialog id="shop-dialog" class="shop-dialog" aria-labelledby="shop-title">
 <header class="shop-header"><div><span class="shop-brand">✦ SpaceX workshop <small>Fictional in-game shop</small></span><h2 id="shop-title">Make it yours.</h2></div><button id="shop-close" aria-label="Close shop">✕</button></header>
 <div class="shop-layout">
  <aside class="shop-garage" aria-label="Your vehicle">
   <div class="shop-garage-heading"><div><span class="shop-caption">Your ride</span><h3 id="shop-car"></h3></div><span class="shop-bay-mark" aria-hidden="true">✦</span></div>
   <div class="shop-stage"><canvas id="style-preview" aria-label="Current car paint and decal preview"></canvas></div>
   <p id="shop-location" class="shop-location"></p>
   <div class="shop-wallet"><span>Available cash</span><strong id="shop-cash"></strong></div>
   <details id="shop-level-note" class="shop-level-note"><summary>Spending can change your level</summary><p>Cash determines your level. Spending can relock areas; ↓ LV shows your level after purchase. Finishes stay on your car.</p></details>
  </aside>
  <div class="shop-browse">
   <div class="shop-tabs" role="tablist" aria-label="Workshop sections"><button type="button" id="shop-tab-upgrades" role="tab" aria-controls="shop-upgrades" aria-selected="true">Upgrades</button><button type="button" id="shop-tab-paint" role="tab" aria-controls="shop-paint" aria-selected="false" tabindex="-1">Paint</button><button type="button" id="shop-tab-decals" role="tab" aria-controls="shop-decals" aria-selected="false" tabindex="-1">Decals</button><button type="button" id="shop-tab-remote" role="tab" aria-controls="shop-remote" aria-selected="false" tabindex="-1">Remote shop</button></div>
   <div class="shop-scroll">
    <section id="shop-upgrades" role="tabpanel" aria-labelledby="shop-tab-upgrades"><div class="shop-section-heading"><h3>Upgrade your ride</h3><p>More ways to drive, fly and explore.</p></div><section id="shop-collection" hidden aria-labelledby="shop-collection-title"><h4 id="shop-collection-title">Your collection</h4><p>Collect an owned vehicle at a workshop.</p><div id="shop-collection-items" class="shop-items"></div></section><div id="shop-items" class="shop-items"></div></section>
    <section id="shop-paint" class="style-shop" role="tabpanel" aria-labelledby="shop-tab-paint" hidden><div class="shop-section-heading"><h3>Find your color</h3><p id="style-paint-copy"></p></div><p id="style-level"></p><p id="style-market" hidden>Market paint is equipped. Unequip it in Market to show workshop paint.</p><h4>Paint</h4><div id="paint-options" class="style-options"></div></section>
    <section id="shop-decals" class="style-shop" role="tabpanel" aria-labelledby="shop-tab-decals" hidden><div class="shop-section-heading"><h3>Add your signature</h3><p id="style-decal-copy"></p></div><h4>Decals</h4><div id="decal-options" class="style-options"></div></section>
    <section id="shop-remote" role="tabpanel" aria-labelledby="shop-tab-remote" hidden><div class="shop-section-heading"><h3>Take the shop with you</h3><p>Get upgrades wherever your drive takes you.</p></div><div class="shop-item ota-plan"><div><strong>Remote shop subscription</strong><p id="ota-copy"></p><p id="ota-status" role="status"></p></div><button id="ota-toggle"></button></div></section>
   </div>
   <p id="shop-feedback" class="shop-feedback" role="status">Earn cash by delivering food. Your saved driver keeps purchased upgrades for this vehicle.</p>
  </div>
 </div>
</dialog>
<dialog id="scores-dialog" aria-labelledby="scores-title"></dialog>
<dialog id="awards-dialog" aria-labelledby="awards-title"></dialog>
<dialog id="sound-dialog" class="sound-dialog" aria-labelledby="sound-title"><div class="fleet-header"><div><span class="eyebrow">YOUR MIX / TESLAND RADIO</span><h2 id="sound-title">Sound settings</h2></div><button id="sound-close" aria-label="Close sound settings">✕</button></div><p class="fleet-intro">Choose a soundtrack for your drive. Sound effects stay on their own channel.</p><div class="radio-panel"><label for="radio-station">RADIO STATION</label><select id="radio-station"><option value="chiptune">Tesland 8-bit</option><option value="latent-space">Latent Space podcast</option><option value="thursdai">ThursdAI podcast</option></select><div id="radio-episode" class="radio-episode" hidden><span id="radio-label">UP NEXT</span><a id="radio-title" target="_blank" rel="noopener noreferrer"></a></div><div id="radio-controls" class="radio-controls" hidden><button id="radio-play" type="button">Play</button><button id="radio-next" type="button">Next random episode ↗</button></div><p id="radio-status" role="status"></p></div><div class="sound-sliders"><label>Master <output id="master-value"></output><input id="master-volume" type="range" min="0" max="100" aria-label="Master volume"></label><label>Music / radio <output id="music-value"></output><input id="music-volume" type="range" min="0" max="100" aria-label="Music and radio volume"></label><label>Effects <output id="effects-value"></output><input id="effects-volume" type="range" min="0" max="100" aria-label="Effects volume"></label></div><div class="sound-actions"><button id="sound-mute" aria-pressed="false">Mute all</button><button id="sound-test">Test sound</button></div><p id="sound-status" class="form-note" role="status">Sound starts when you begin a drive.</p></dialog>
<dialog id="identity-dialog" class="identity-dialog" aria-labelledby="identity-title"><div class="fleet-header"><div><span class="eyebrow">YOUR DRIVER</span><h2 id="identity-title">Driver identity</h2></div><button id="identity-close" type="button" aria-label="Close driver identity">✕</button></div><p id="identity-current" class="identity-current">Connecting to chat…</p><p id="identity-storage-warning" class="identity-feedback" role="alert" hidden></p><form id="identity-name-form" class="identity-block"><strong>Choose your driver name</strong><p>Other drivers will see this name in your room and in global chat. If it’s in use, we add a number.</p><label for="identity-name">Driver name</label><div class="identity-name-row"><input id="identity-name" maxlength="${MAX_NAME_LENGTH * 2}" autocomplete="nickname" placeholder="Your callsign"><button type="submit" class="identity-button">Use name</button></div><p>Change your name anytime; your driver ID stays the same.</p></form><div class="identity-block"><strong>Keep this driver</strong><p>This browser remembers your driver by default. Copy the recovery code to use the same ID on another device. Your wallet, delivery progress, achievements, and luxury collection follow your saved driver.</p><button id="identity-save" type="button" class="identity-button">Get recovery code</button><div id="identity-code-group" hidden><label for="identity-code">Your recovery code · keep it private</label><textarea id="identity-code" readonly rows="3" spellcheck="false"></textarea><button id="identity-copy" type="button" class="identity-button">Copy code</button></div><label class="identity-remember"><input id="identity-remember" type="checkbox"> Remember this driver on this browser</label><p>Starting a new driver replaces the driver remembered on this browser.</p></div><form id="identity-recover" class="identity-block"><strong>Recover on this device</strong><p>Save your current guest before switching, or its progress cannot be recovered. The same driver can be connected on one device at a time.</p><label for="identity-enter-code">Recovery code</label><textarea id="identity-enter-code" rows="2" maxlength="160" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="Paste your recovery code"></textarea><div class="identity-actions"><button type="submit" class="identity-button">Recover driver</button><button id="identity-guest" type="button" class="identity-button">Start a new driver</button></div><div class="identity-actions"><button id="identity-pending" type="button" class="identity-button" hidden>Recover unfinished driver</button><button id="identity-previous" type="button" class="identity-button" hidden>Use previously saved driver</button></div></form><p id="identity-feedback" class="identity-feedback" role="status"></p><button id="identity-rejoin" type="button" class="identity-button" hidden>Rejoin with this driver</button></dialog>
<dialog id="ticket-dialog" class="ticket-dialog" aria-labelledby="ticket-title" aria-describedby="ticket-copy"><div class="ticket-icon" aria-hidden="true">!</div><span id="ticket-kicker" class="ticket-kicker">POLICE CITATION</span><h2 id="ticket-title">Busted.</h2><p id="ticket-copy"></p><strong id="ticket-amount" class="ticket-amount"></strong><div id="ticket-detail" class="ticket-detail"></div><p class="ticket-footnote">The fine has been deducted from your earnings. Repeat offenses cost more.</p><button id="ticket-acknowledge" class="primary">Acknowledge citation &amp; continue →</button></dialog>
<div id="notice" class="notice hidden" role="status"></div>
<div id="joining" class="connection-wait hidden"><span id="joining-copy" role="status" aria-live="polite">Joining your room…</span><button id="joining-cancel" class="text-button" type="button">Cancel</button></div>
<div id="error" class="error hidden" role="alert"><h2 id="error-title">Let’s get you back on the road.</h2><p id="error-copy"></p><button id="retry" class="primary">Try this room again</button><label id="error-room-label" class="alternative-room">OR NAME ANOTHER ROOM<input id="error-room" maxlength="32" placeholder="my-crew" autocapitalize="none" spellcheck="false"></label><p id="error-room-note" class="form-note" role="status"></p><button id="error-join" class="secondary">Join another room</button><button id="mars-error" class="text-button" type="button">Starship mission &amp; launch view</button><button id="error-menu" class="text-button">Room settings</button></div>
`;
const mobileHud=setupMobileHud(browserStorage());
let selectedVehicle:VehicleId='roadster';
let startingRideChanged=false;
const startingSelect=$<HTMLSelectElement>('starting-ride');
const selectableIds=Object.keys(VEHICLES) as VehicleId[];
const teslaIds:VehicleId[]=VEHICLE_IDS.filter(id=>VEHICLES[id].brand==='Tesla');
for(const id of selectableIds){const option=document.createElement('option');option.value=id;option.textContent=VEHICLES[id].name;option.hidden=option.disabled=!teslaIds.includes(id);startingSelect.append(option);}
startingSelect.value=selectedVehicle;
function updateStarting(){selectedVehicle=startingSelect.value as VehicleId;const spec=VEHICLES[selectedVehicle];$('starting-spec').textContent=`${Math.round(spec.massKg).toLocaleString()} kg · ${spec.fourWheelSteering?'4-wheel':'Front-wheel'} steering · ${spec.airThrusters?'Air thrusters':'Autonomous cruise'}`;}
startingSelect.onchange=()=>{updateStarting();startingRideChanged=true;};updateStarting();
const controls = new Controls();
const session = new Session(undefined,()=>controls.edgeCounters());
controls.onEdge=(kind,id)=>session.queueEdge(kind,id);
const audio = new GameAudio();
const driveFeedback = new DriveFeedback($('drive-feedback'));
const soundDialog=$<HTMLDialogElement>('sound-dialog');
const radio = new Radio(refreshRadio);
function refreshRadio(){
  const isPodcast=radio.station!=='chiptune';
  $<HTMLSelectElement>('radio-station').value=radio.station;
  $('radio-controls').hidden=!isPodcast;
  $('radio-episode').hidden=!isPodcast||!radio.episode;
  $('radio-label').textContent=radio.playing?'NOW PLAYING':'UP NEXT';
  const title=$<HTMLAnchorElement>('radio-title');title.textContent=radio.episode?.title??'';
  if(radio.episode?.link)title.href=radio.episode.link;else title.removeAttribute('href');
  $<HTMLButtonElement>('radio-play').disabled=radio.loading;
  $<HTMLButtonElement>('radio-next').disabled=radio.loading||!radio.episode;
  $('radio-play').textContent=radio.playing?'Pause':'Play';
  $('radio-status').textContent=radio.status;
}
$<HTMLSelectElement>('radio-station').onchange=event=>{
  const station=(event.target as HTMLSelectElement).value as RadioStation;
  radio.select(station);audio.setMusicEnabled(station==='chiptune');
};
$('radio-play').onclick=()=>{if(radio.playing)radio.pause();else void radio.play();};
$('radio-next').onclick=()=>{void radio.next();};
audio.setMusicEnabled(radio.station==='chiptune');
function refreshSoundSettings(){
  for(const name of ['master','music','effects'] as const){$<HTMLInputElement>(`${name}-volume`).value=String(audio.settings[name]);$(`${name}-value`).textContent=`${audio.settings[name]}%`;}
  radio.setVolume(audio.settings);
  $('sound-mute').setAttribute('aria-pressed',String(audio.settings.muted));
  $('sound-button').textContent=audio.settings.muted?'♪̸':'♫';
}
for(const name of ['master','music','effects'] as const){
  $<HTMLInputElement>(`${name}-volume`).addEventListener('input',event=>{audio.setSettings({...audio.settings,[name]:Number((event.target as HTMLInputElement).value)});refreshSoundSettings();});
}
$('sound-mute').onclick=()=>{audio.setSettings({...audio.settings,muted:!audio.settings.muted});refreshSoundSettings();};
$('sound-test').onclick=()=>{void audio.unlock().then(ok=>{if(ok)audio.play('pickup');$('sound-status').textContent=!ok?'Sound is unavailable in this browser.':audio.settings.muted||!audio.settings.master||!audio.settings.effects?'Unmute and raise master and effects volume to hear the test.':'Test played.';});};
$('sound-button').onclick=()=>{setDrawer(null);controls.clear();controls.enabled=false;refreshSoundSettings();refreshRadio();soundDialog.showModal();void radio.prepare();};
function closeSound(){soundDialog.close();controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;}
$('sound-close').onclick=closeSound;soundDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;});
document.addEventListener('visibilitychange',()=>{void audio.visibility(document.hidden);radio.visibility(document.hidden);});
for(const event of ['pointerdown','keydown'] as const)window.addEventListener(event,()=>{if(started)void audio.unlock();},{capture:true});
refreshSoundSettings();refreshRadio();
let scene: GameScene;
try { scene = new GameScene($<HTMLCanvasElement>('world')); }
catch { $('error').classList.remove('hidden'); $('error-copy').textContent='This device could not start WebGL. Enable hardware acceleration or try another browser.'; $('retry').hidden=true; $('error-room-label').hidden=true; $('error-join').hidden=true; $('error-menu').hidden=true; throw new Error('WebGL unavailable'); }
let menu = true, started = false, hudTime = 0, lastTicketCount = 0;
let lastBlockedAt=-1,lastBlockedNoticeAt=-10,lastRerouteId=0;
const achievementEvents=new AchievementEventTracker();
const levelEvents=new LevelEventTracker();
let achievementQueue:AchievementId[] = [], achievementTimer = 0;
let openDrawer: 'actions' | 'controls' | null = null;
let walletWasBlocked=false,lastSessionStatus=session.status;
function setDrawer(drawer: 'actions' | 'controls' | null) {
  openDrawer=drawer;
  for(const name of ['actions','controls'] as const){
    const open=drawer===name;
    $(name==='actions'?'drive-actions':'keyboard-help').hidden=!open;
    $(name+'-toggle').setAttribute('aria-expanded',String(open));
  }
  controls.clear();
  controls.enabled=!drawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');
}
$('actions-toggle').onclick=event=>{setDrawer(openDrawer==='actions'?null:'actions');if(event.detail&&!openDrawer)$('actions-toggle').blur();};
$('controls-toggle').onclick=event=>{setDrawer(openDrawer==='controls'?null:'controls');if(event.detail&&!openDrawer)$('controls-toggle').blur();};
$('drive-actions').addEventListener('click',event=>{if((event.target as HTMLElement).closest('button')){setDrawer(null);if(event.detail===0)$('actions-toggle').focus();}},{capture:true});
const controlSettings=setupControlSettings(controls,()=>{setDrawer(null);controls.clear();controls.enabled=false;},()=>{controls.clear();controls.enabled=!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');});
document.addEventListener('pointerdown',event=>{if(openDrawer&&!(event.target as HTMLElement).closest('.action-drawer, .control-guide'))setDrawer(null);},{capture:true});
window.addEventListener('keydown',event=>{if(openDrawer&&event.key==='Escape'){event.preventDefault();const toggle=$(openDrawer+'-toggle');setDrawer(null);toggle.focus();}});
const nameInput=$<HTMLInputElement>('name');
const identityDialog=$<HTMLDialogElement>('identity-dialog');
const identityName=$<HTMLInputElement>('identity-name');
const rememberInput=$<HTMLInputElement>('identity-remember');
const identityCode=$<HTMLTextAreaElement>('identity-code');
const identityEntry=$<HTMLTextAreaElement>('identity-enter-code');
let driverStorage:Storage|null=null;
try { driverStorage=localStorage; } catch { /* Report unavailable storage in the identity panel. */ }
const recovery=readDriverRecovery(driverStorage);
let rememberedCode=recovery.remembered,stagedCode=recovery.pending,rememberRequested=recovery.remember;
let currentCode:string|undefined=rememberedCode||stagedCode;
let recoveryWarning='';
let warnedRecoveryCode:string|undefined;
let pendingRememberCode:string|undefined=currentCode===stagedCode&&stagedCode!==rememberedCode?stagedCode:undefined;
let walletBoundCode:string|undefined;
let identityRequestId=0,identityRequestCode:string|undefined;
function setWalletIdentity(code?:string){
  if(walletBoundCode!==code){walletBoundCode=undefined;resetCelebration();}
  identityRequestCode=code;identityRequestId=session.setIdentity(code);
}
setWalletIdentity(currentCode);
let nameEdited=false, identityNameDirty=false, authError=false, pendingRecovery=false, pendingSave=false, savingDriver=false, pendingName=false, renameInFlight=false, showRecoveryCode=false, pendingShowCode=false, unread=0;
let requestedName='Driver', renameTimer=0, nextRenameId=0, activeRenameId=0;
function identityFeedback(message:string){$('identity-feedback').textContent=message;}
function recoveryProblem(message:string){
  showRecoveryCode=!!currentCode;identityFeedback(message);
  if(!identityDialog.open)notice(message);
}
function rememberWhenBound(code:string|undefined){
  if(!rememberRequested||!code||code===rememberedCode){recoveryWarning='';warnedRecoveryCode=undefined;return true;}
  const staged=stageDriverRecovery(driverStorage,code);
  if(staged!=='ok'){
    recoveryWarning=staged==='pending'?'An unfinished driver is still saved here. Copy this recovery code; this browser cannot remember it yet.':'This browser could not remember your driver. Copy your recovery code to keep it.';
    const firstWarning=warnedRecoveryCode!==code;warnedRecoveryCode=code;
    recoveryProblem(recoveryWarning);
    if(firstWarning&&!identityDialog.open)openIdentity();
    return false;
  }
  recoveryWarning='';warnedRecoveryCode=undefined;
  stagedCode=code;pendingRememberCode=code;
  if(walletBoundCode===code)return rememberCode(code);
  return true;
}
function rememberCode(code:string){
  const result=confirmDriverRecovery(driverStorage,code);
  if(result.saved){rememberedCode=code;if(result.cleared&&stagedCode===code)stagedCode=undefined;pendingRememberCode=undefined;}
  if(!result.saved||!result.cleared){recoveryWarning='Browser storage could not finish saving your driver. Copy your recovery code.';recoveryProblem(recoveryWarning);return false;}
  recoveryWarning='';warnedRecoveryCode=undefined;
  return true;
}
function refreshIdentity(){
  $('identity-current').textContent=chat.playerId&&chat.status==='online'?`${chat.name} · #${chat.playerId.slice(0,8)}`:chat.status==='connecting'?'Connecting to chat…':'Chat is offline';
  $('identity-code-group').hidden=!currentCode||!showRecoveryCode;
  identityCode.value=showRecoveryCode?currentCode||'':'';
  $('identity-storage-warning').textContent=recoveryWarning;
  $('identity-storage-warning').hidden=!recoveryWarning;
  rememberInput.checked=rememberRequested;
  $<HTMLButtonElement>('identity-pending').hidden=!stagedCode||stagedCode===rememberedCode;
  $<HTMLButtonElement>('identity-previous').hidden=!rememberedCode||rememberedCode===currentCode;
}
function updateChatBadge(){
  const badge=$('chat-unread');badge.hidden=unread===0;badge.textContent=unread>99?'99+':String(unread);
  $('chat-button').setAttribute('aria-label',unread?`Open global chat, ${unread} unread`:'Open global chat');
}
const chat=new GlobalChat({
  onStatus(status,detail){chatPanel.setConnection(status,detail);refreshIdentity();if(status==='offline'){savingDriver=false;if(renameInFlight){activeRenameId=0;clearTimeout(renameTimer);renameInFlight=false;chatPanel.finishRename('Connection lost. Your name will be retried.',false);}if(pendingName)identityFeedback('Chat is offline. Your name will be retried.');}},
  onReady(id,name,messages){
    const desired=normalizeName(nameInput.value);
    const needsRename=nameEdited&&desired!==name;
    currentCode=chat.code;const stored=connectDriverWallet(currentCode,rememberWhenBound,setWalletIdentity);authError=false;
    if(!needsRename){nameInput.value=name;nameEdited=false;if(!identityNameDirty)identityName.value=name;}
    chatPanel.setIdentity(id,name);chatPanel.setMessages(messages);session.setName(name);
    if(pendingRecovery){pendingRecovery=false;if(stored){identityEntry.value='';identityFeedback(session.status==='disconnected'?`Recovered ${name}. Join a room to finish saving.`:'Checking your game wallet…');}}
    refreshIdentity();
    if((pendingSave||rememberRequested)&&!currentCode&&!playtestMode(new URLSearchParams(location.search).get('room')??'')){savingDriver=chat.save();if(!savingDriver)identityFeedback('Could not save your driver. Try again.');}
    else if(pendingSave){savingDriver=chat.save();if(!savingDriver)identityFeedback('Could not request a code. Try again.');}
    pendingSave=false;
    if(needsRename)requestName(desired);
    else if(pendingName){pendingName=false;chatPanel.finishRename('',true);identityFeedback(`Now going by ${name}.`);}
  },
  onRenamed(id,name,requestId){
    chatPanel.setIdentity(id,name);session.setName(name);
    if(requestId!==activeRenameId)return;
    activeRenameId=0;clearTimeout(renameTimer);renameInFlight=false;const newer=nameEdited&&normalizeName(nameInput.value)!==requestedName;
    chatPanel.finishRename('',true);
    if(!newer){nameInput.value=name;nameEdited=false;if(!identityNameDirty)identityName.value=name;pendingName=false;}
    identityFeedback(name===requestedName?`Now going by ${name}.`:`That name is in use. You’re ${name}.`);refreshIdentity();
    if(newer)requestName(normalizeName(nameInput.value));
  },
  onMessage(message){chatPanel.append(message);if(!chatPanel.element.open&&message.playerId!==chat.playerId){unread++;updateChatBadge();}},
  onRecovery(code){savingDriver=false;currentCode=code;if(pendingShowCode){showRecoveryCode=true;pendingShowCode=false;}const stored=connectDriverWallet(code,rememberWhenBound,setWalletIdentity);refreshIdentity();if(stored)identityFeedback(session.status==='disconnected'?'Join a room to finish saving your driver.':'Connecting your driver to the game wallet…');},
  onError(message,code,requestId){
    if(code==='save_failed')savingDriver=false;
    if(code==='rename_failed'&&requestId!==activeRenameId)return;
    if(renameInFlight&&code==='rename_failed'){activeRenameId=0;clearTimeout(renameTimer);renameInFlight=false;pendingName=false;chatPanel.finishRename(message,false);}
    if(chat.status==='offline'){authError=true;pendingSave=false;chatPanel.setConnection('offline',message);identityFeedback(message+' Retry the code or choose a new guest.');}
    else {const detail=code==='save_failed'?`${message} Your driver may not be remembered after disconnecting.`:message;identityFeedback(detail);chatPanel.setConnection('online',detail);}
  },
});
const chatPanel=createChatPanel({
  onSend:text=>chat.send(text),
  onRename:name=>{
    if(chat.status!=='online'||renameInFlight)return false;
    nameInput.value=name;nameEdited=true;identityNameDirty=false;pendingName=true;
    return requestName(name);
  },
  onOpenChange(open){
    if(open){unread=0;updateChatBadge();}
    controls.clear();controls.enabled=!open&&!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');
  },
});
document.body.append(chatPanel.element);
function ensureChat(){
  if(authError)return;
  const name=normalizeName(nameInput.value);
  if(chat.status==='online'){if(nameEdited&&!renameInFlight)requestName(name);return;}
  if(chat.status==='connecting'){if(nameEdited)pendingName=true;return;}
  requestedName=name;if(nameEdited)pendingName=true;chat.connect(name,currentCode);
}
function requestName(name:string){
  if(chat.status!=='online'||renameInFlight)return false;
  requestedName=name;pendingName=true;
  const requestId=++nextRenameId;
  if(!chat.rename(name,requestId)){pendingName=false;return false;}
  activeRenameId=requestId;renameInFlight=true;identityFeedback('Saving your name…');
  renameTimer=window.setTimeout(()=>{if(activeRenameId===requestId){activeRenameId=0;renameInFlight=false;pendingName=false;identityFeedback('Name change did not complete. Please try again.');chatPanel.finishRename('Name change did not complete. Please try again.',false);}},10_000);
  return true;
}
nameInput.addEventListener('input',event=>{nameEdited=true;if(!(event as InputEvent).isComposing)limitDriverNameInput(nameInput);});
nameInput.addEventListener('compositionend',()=>limitDriverNameInput(nameInput));
$('chat-button').onclick=()=>{setDrawer(null);ensureChat();chatPanel.open();};
function openIdentity(){
  if(session.playtest){notice('Playtest progress is not saved. Use Menu → Playtest → Return to saved driver to manage your identity.');return;}setDrawer(null);ensureChat();if(recoveryWarning&&currentCode)showRecoveryCode=true;refreshIdentity();identityName.value=nameInput.value;identityNameDirty=false;identityDialog.showModal();if(recoveryWarning)identityFeedback(recoveryWarning);else if(!recovery.available)identityFeedback('Browser storage is unavailable. Copy your recovery code to keep your driver.');controls.clear();controls.enabled=false;}
$('identity-button').onclick=openIdentity;$('identity-action').onclick=openIdentity;
$('identity-close').onclick=()=>identityDialog.close();
identityDialog.addEventListener('close',()=>{showRecoveryCode=false;pendingShowCode=false;refreshIdentity();controls.clear();controls.enabled=!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');});
identityName.addEventListener('input',event=>{identityNameDirty=true;if(!(event as InputEvent).isComposing)limitDriverNameInput(identityName);});
identityName.addEventListener('compositionend',()=>limitDriverNameInput(identityName));
$('identity-name-form').addEventListener('submit',event=>{
  event.preventDefault();const name=normalizeName(identityName.value);identityName.value=name;
  if(chat.status==='online'&&name===chat.name){identityNameDirty=false;identityFeedback(`You’re already ${name}.`);return;}
  if(authError){identityFeedback('Retry recovery or choose a new driver first.');return;}
  nameInput.value=name;nameEdited=true;identityNameDirty=false;pendingName=true;
  identityFeedback('Saving your name…');ensureChat();
});
$('identity-save').onclick=()=>{
  if(chat.status==='online'&&currentCode){showRecoveryCode=true;refreshIdentity();identityFeedback('Keep your recovery code private.');return;}
  pendingShowCode=true;
  if(chat.status!=='online'){if(authError){pendingShowCode=false;identityFeedback('Retry recovery or choose a new driver first.');return;}pendingSave=true;ensureChat();identityFeedback('Connecting before creating your code…');return;}
  if(savingDriver){identityFeedback('Preparing your recovery code…');return;}
  savingDriver=chat.save();if(!savingDriver)identityFeedback('Could not request a code. Try again.');
};
$('identity-copy').onclick=async()=>{
  if(!currentCode)return;
  try {await navigator.clipboard.writeText(currentCode);identityFeedback('Recovery code copied. Keep it private.');}
  catch {identityCode.focus();identityCode.select();identityFeedback('Copy the selected recovery code and keep it private.');}
};
rememberInput.addEventListener('change',()=>{
  const requested=rememberInput.checked;
  const updated=setDriverRemember(driverStorage,requested);
  if(!updated&&requested){
    rememberInput.checked=rememberRequested;recoveryProblem('Could not update browser storage. Copy your recovery code to keep your driver.');refreshIdentity();return;
  }
  rememberRequested=requested;
  if(rememberRequested){
    if(currentCode){if(rememberWhenBound(currentCode)){setWalletIdentity(currentCode);identityFeedback(pendingRememberCode?'The browser will remember this driver after the wallet connects.':'This browser will remember this driver.');}}
    else if(savingDriver)identityFeedback('Saving your driver…');
    else if(chat.status==='online'){savingDriver=chat.save();identityFeedback(savingDriver?'Saving your driver…':'Could not save this driver. Try again.');}
    else identityFeedback('Connect to chat to save this driver.');
  } else {
    rememberedCode=undefined;stagedCode=undefined;pendingRememberCode=undefined;recoveryWarning='';warnedRecoveryCode=undefined;
    if(currentCode)setWalletIdentity(currentCode);
    if(updated)identityFeedback('This browser will no longer remember this driver. Copy your recovery code to keep it.');
    else recoveryProblem('Browser storage could not be cleared. Copy your recovery code; older saved codes may remain on this browser.');
  }
  refreshIdentity();
});
function recoverDriver(code:string){
  if(!code){identityFeedback('Paste a recovery code first.');return;}
  if(chat.status==='online'&&currentCode===code&&walletBoundCode===code){identityFeedback('This driver is already connected.');return;}
  $<HTMLButtonElement>('identity-rejoin').hidden=true;
  clearTimeout(renameTimer);activeRenameId=0;renameInFlight=false;showRecoveryCode=false;pendingShowCode=false;pendingRecovery=true;pendingSave=false;savingDriver=false;pendingName=false;authError=false;nameEdited=false;requestedName=nameInput.value.trim()||'Driver';identityFeedback('Checking your recovery code…');chat.connect(requestedName,code,true);
}
$('identity-recover').addEventListener('submit',event=>{event.preventDefault();recoverDriver(identityEntry.value.trim());});
$('identity-pending').onclick=()=>{if(stagedCode)recoverDriver(stagedCode);};
$('identity-previous').onclick=()=>{if(rememberedCode)recoverDriver(rememberedCode);};
$('identity-guest').onclick=()=>{
  const wasSaved=!!currentCode;
  if(!forgetDriverRecovery(driverStorage)&&(rememberedCode||stagedCode)){recoveryProblem('Could not clear browser storage. Copy your recovery code before starting a new driver.');refreshIdentity();return;}
  clearTimeout(renameTimer);activeRenameId=0;showRecoveryCode=false;pendingShowCode=false;pendingRecovery=false;pendingSave=false;savingDriver=false;pendingName=false;renameInFlight=false;authError=false;nameEdited=false;currentCode=undefined;rememberedCode=undefined;stagedCode=undefined;pendingRememberCode=undefined;walletBoundCode=undefined;recoveryWarning='';warnedRecoveryCode=undefined;setWalletIdentity(undefined);
  requestedName=nameInput.value.trim()||'Driver';identityFeedback('Starting a new driver…');chat.connect(requestedName,undefined,true);
  if(wasSaved&&started&&session.status!=='disconnected'){session.disconnect();begin(false);}
};
$('identity-rejoin').onclick=()=>{session.disconnect();$<HTMLButtonElement>('identity-rejoin').hidden=true;begin(false);};
if(currentCode)ensureChat();

const initialEntry=roomEntry(location.search);
let selectedEntry=initialEntry??{room:DEFAULT_ROOM,automatic:false};
session.onRoomJoined=room=>{
  selectedEntry={room,automatic:false};
  $<HTMLInputElement>('room').value=publicRoomNumber(room)===null?room:roomLabel(room);
  history.replaceState(null,'',roomSearch(room));
};
const playStorage=browserStorage(),previousPlay=playStorage?readLastPlayed(playStorage):null;
if(previousPlay){
  $('last-played').textContent=`Last played ${new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(previousPlay.playedAt))} · ${releaseLabel(previousPlay.version)}. Saved on this browser.`;
  $<HTMLAnchorElement>('release-changelog').href=`/changelog/?since=${encodeURIComponent(previousPlay.version)}`;
}else if(!playStorage){$('last-played').textContent='Last-played history is unavailable in this browser.';}
let playRecorded=false,lastPlayWrite=0,lastActiveSeconds=0,lastActiveAt=0;
function recordPlay(now:number){
  playRecorded=true;lastPlayWrite=now;
  if(!playStorage||!writeLastPlayed(playStorage,new Date(now))){$('last-played').textContent='Last-played history could not be saved on this browser.';}
}
window.addEventListener('pagehide',()=>{if(playRecorded&&Date.now()-lastActiveAt<10000)recordPlay(Date.now());});
if(initialEntry)$<HTMLInputElement>('room').value=publicRoomNumber(initialEntry.room)===null?initialEntry.room:roomLabel(initialEntry.room);
let menuRidePending:{kind:VehicleId;closeOnSuccess:boolean;expires:number}|null=null;
function updateRideMenu(){
  const sandbox=playtestMode($<HTMLInputElement>('room').value.trim().toLowerCase())==='sandbox';
  for(const option of startingSelect.options)option.hidden=option.disabled=!sandbox&&!teslaIds.includes(option.value as VehicleId);
  if(!sandbox&&!teslaIds.includes(selectedVehicle)){startingSelect.value='roadster';updateStarting();}

  const sameRoom=session.status==='online'&&selectedEntry.room===session.room;
  $('apply-ride').hidden=!sameRoom;
  if(!menuRidePending)$('form-note').textContent=sameRoom?`You are in ${roomLabel(session.room)}. Choose a ride or return to your drive.`:'Join friends with a room code. Change rides here or use Actions → Fleet.';
}
function toggleMenu(show: boolean) {if(!show&&menuRidePending)return;if(show&&!menu){startingRideChanged=false;updateRideMenu();}menu=show;setDrawer(null);controls.clear();$('menu').classList.toggle('hidden',!show);$('hud').classList.toggle('hidden',show);$('resume').classList.toggle('hidden',!started||session.status==='disconnected');$('menu-button').setAttribute('aria-label',show?'Close menu':'Open menu');}
function requestMenuRide(closeOnSuccess:boolean){
  if(menuRidePending)return;
  const player=session.world.players.find(player=>player.id===session.id);
  const car=session.world.entities.find(entity=>entity.id===player?.entityId);
  if(car?.kind===selectedVehicle&&car.owner===session.id){
    startingRideChanged=false;
    if(closeOnSuccess)toggleMenu(false);else $('form-note').textContent='You are already driving this ride.';
    return;
  }
  session.selectVehicle(selectedVehicle);
  menuRidePending={kind:selectedVehicle,closeOnSuccess,expires:performance.now()+5000};
  startingSelect.disabled=true;
  $<HTMLButtonElement>('apply-ride').disabled=true;
  $('form-note').textContent='Requesting your ride…';
}
function begin(userGesture=true){
  const room=selectedEntry.room;
  if(!validRoom(room)&&publicRoomNumber(room)===null){ $('form-note').textContent='Start with a letter or number; use up to 32 lowercase letters, numbers, or hyphens.';return; }
  ensureChat();
  if(session.status==='online'&&session.room===room){
    session.join(room,chat.status==='online'&&!nameEdited?chat.name:nameInput.value.trim()||'Driver');
    if(userGesture)void audio.unlock();
    if(startingRideChanged)requestMenuRide(true);else toggleMenu(false);
    return;
  }
  menuRidePending=null;startingSelect.disabled=false;$<HTMLButtonElement>('apply-ride').disabled=false;
  lastTicketCount=0;levelEvents.reset();lastBlockedAt=-1;lastBlockedNoticeAt=-10;lastRerouteId=0;clearTimeout(noticeTimer);$('notice').classList.add('hidden');resetCelebration();audio.reset();if(userGesture)void audio.unlock();
  pendingShop=null;pendingOta=null;pendingStyle=null;pendingLuxury=null;luxuryStatus='';lastLuxuryKey='';stylePreviewKey='';pendingDestination=null;navigationDriving=false;shopBusyUntil=0;
  achievementEvents.reset();achievementQueue=[];clearTimeout(achievementTimer);achievementTimer=0;$('achievement-toast').classList.add('hidden');
  for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))dialog.close();
  if(publicRoomNumber(room)===null)$<HTMLInputElement>('room').value=room;controls.resetSequences();session.join(room,$<HTMLInputElement>('name').value.trim()||'Driver',selectedVehicle,selectedEntry.automatic);
  playRecorded=false;lastActiveSeconds=0;lastActiveAt=0;
  session.setName(chat.status==='online'&&!nameEdited?chat.name:nameInput.value.trim()||'Driver');
  started=true;$('error').classList.add('hidden');toggleMenu(false);
}
$('playtest-fresh').onclick=()=>{location.href=`?room=practice-${crypto.randomUUID().slice(0,8)}`;};
$('playtest-sandbox').onclick=()=>{location.href='?room=sandbox';};
$('playtest-return').onclick=()=>{location.href=location.pathname;};
updateRideMenu();
$('join').onclick=()=>begin();$('retry').onclick=()=>{if(session.walletBlocked)session.disconnect();begin();};
$('apply-ride').onclick=()=>requestMenuRide(false);
$<HTMLInputElement>('room').addEventListener('input',()=>{selectedEntry={room:$<HTMLInputElement>('room').value.trim().toLowerCase(),automatic:false};updateRideMenu();});
$('error-join').onclick=()=>{
  const room=$<HTMLInputElement>('error-room').value.trim().toLowerCase();
  if(!validRoom(room)){$('error-room-note').textContent='Start with a letter or number; use up to 32 lowercase letters, numbers, or hyphens.';return;}
  $('error-room-note').textContent='';$<HTMLInputElement>('room').value=room;selectedEntry={room,automatic:false};begin();
};
$('joining-cancel').onclick=()=>{session.disconnect();started=false;toggleMenu(true);};
$('resume').onclick=()=>{ensureChat();toggleMenu(false);};$('menu-button').onclick=()=>{if(started)toggleMenu(!menu);};
$('error-menu').onclick=()=>{$('error').classList.add('hidden');resetCelebration();pendingShop=null;pendingOta=null;pendingStyle=null;stylePreviewKey='';shopBusyUntil=0;session.disconnect();toggleMenu(true);};
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
const keyboardHelp=$('keyboard-help').querySelector('small');
if(keyboardHelp)keyboardHelp.textContent+=' Use Actions → Mini-games to jump straight into a game.';
const minigames=setupMinigames({session,controls,closeDrawer:()=>setDrawer(null),canDrive:()=>!menu&&!openDrawer&&session.status==='online'&&!session.walletBlocked,notice});
let noticeTimer=0;
function notice(message:string){$('notice').textContent=message;$('notice').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=window.setTimeout(()=>$('notice').classList.add('hidden'),4000);}
$('invite').onclick=async()=>{
  try{await navigator.clipboard.writeText(location.href);notice('Invite link copied. Send it to your crew.');}catch{notice('Copy the address in your browser to invite a friend.');}
};
const map=$<HTMLCanvasElement>('minimap').getContext('2d')!;
const mapBase=document.createElement('canvas');mapBase.width=240;mapBase.height=240;
const base=mapBase.getContext('2d')!;
// The overview grows with the player's unlocked world; the local view stays useful for navigation.
const mapExtents=[
  {minX:-530,maxX:700,minZ:MAP_BOUNDS.minZ,maxZ:430},
  {minX:-550,maxX:850,minZ:MAP_BOUNDS.minZ,maxZ:430},
  {minX:-1800,maxX:2400,minZ:MAP_BOUNDS.minZ,maxZ:1450},
  {minX:-1800,maxX:2400,minZ:MAP_BOUNDS.minZ,maxZ:3200},
  {minX:-1800,maxX:2400,minZ:MAP_BOUNDS.minZ,maxZ:4900},
  {minX:-1800,maxX:2400,minZ:MAP_BOUNDS.minZ,maxZ:7700},
  MAP_BOUNDS,
] as const;
const localRoads=ROADS.filter(road=>road.kind!=='highway');
let mapLocal=true,mapKey='';
let pendingDestination:{requestId:number;expires:number;success?:string;failure?:string}|null=null,navigationDriving=false;
let pendingTeleport:{requestId:number;expires:number}|null=null;
const mapDialog=createMapDialog({canTeleport:()=>session.sandbox,onTeleport(point){
  if(session.status!=='online'||session.walletBlocked)return 'Connect to sandbox first.';
  controls.clear();pendingTeleport={requestId:session.teleport(point.x,point.z),expires:performance.now()+5000};notice('Finding safe ground near your pin…');
},onDestination(point){
  if(session.status!=='online'||session.walletBlocked)return 'Connect your driver before starting self-driving.';
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car||car.kind==='person')return 'Get into a car to use self-driving.';
  if(car.supportId!=='ground'||car.inDome)return 'Land on the ground outside the Dome first.';
  if(requiredLevelAt(point.x,point.z)>player.delivery.level)return 'That area is locked. Keep delivering to open it.';
  updateDriveModes(car);const mode=driveModes.mode();
  controls.clear();const requestId=session.setDestination(point.x,point.z,mode);
  pendingDestination={requestId,expires:performance.now()+5000,success:`${driveModes.label(mode)} self-driving to your destination. Use the controls to take over.`,failure:'No route found. Choose an unlocked nearby destination or move to a clearer starting point.'};notice('Finding a route…');
}});
const driveModes=createDriveModes([$<HTMLElement>('delivery-drive-mode'),mapDialog.element.querySelector<HTMLElement>('.map-drive-mode')!],reason=>notice(`Street Pilot selected. ${reason}`),()=>controls.clear(),()=>{if(mapDialog.isOpen())mapDialog.close();setDrawer(null);openShop(true);});
function updateDriveModes(car:Entity){driveModes.update({rocket:hasRockets(car),intercity:hasIntercity(car.upgrades),jump:car.upgrades.autonomyJump,sky:car.upgrades.autonomySky});}
function driveToDelivery(){
  if(session.status!=='online'||session.walletBlocked){notice('Connect your driver before starting self-driving.');return;}
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car||car.kind==='person'){notice('Get into a car to self-drive to your delivery.');return;}
  if(car.supportId!=='ground'||car.inDome){notice('Land on the ground outside the Dome first.');return;}
  if(player.delivery.order.search){notice('Finding a safe delivery route.');return;}
  if(player.delivery.lastReroute?.reason==='unavailable'&&!isOrderAccessible(player.delivery.order,player.delivery.level,canAssignDeliveryRoof(car))){notice('Return to an open road to retry your delivery.');return;}
  const target=orderTarget(player.delivery.order);
  if(target.rooftop){notice('This delivery is on a rooftop. Fly there and land to finish it.');return;}
  if(requiredLevelAt(target.x,target.z)>player.delivery.level){notice('That delivery is in a locked area.');return;}
  updateDriveModes(car);const mode=driveModes.mode();
  controls.clear();const requestId=session.setDeliveryDestination(mode);
  const failure='No safe route to this delivery from here. Move to a clearer starting point or drive manually.';
  pendingDestination={requestId,expires:performance.now()+5000,success:`${driveModes.label(mode)} self-driving toward your delivery. Use the controls to take over.`,failure};
  notice('Finding a route to your delivery…');
}
$('delivery-drive').onclick=()=>{setDrawer(null);driveToDelivery();};
$('route-goal').onclick=()=>{setDrawer(null);driveToDelivery();};
function driveToCharger(){
  if(session.status!=='online'||session.walletBlocked){notice('Connect your driver before starting self-driving.');return;}
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car||car.kind==='person'){notice('Get into a car to self-drive to a charger.');return;}
  if(car.supportId!=='ground'||car.inDome){notice('Land on the ground outside the Dome first.');return;}
  updateDriveModes(car);const mode=driveModes.mode();controls.clear();const requestId=session.setChargerDestination(mode);
  pendingDestination={requestId,expires:performance.now()+5000,success:`${driveModes.label(mode)} self-driving to a charger. Use the controls to take over.`,failure:'No reachable open charging bay. Move to a clearer road and try again.'};
  notice('Finding a reachable charger…');
}
$('charger-drive').onclick=()=>{setDrawer(null);driveToCharger();};
listenForDoubleShift({enabled:()=>controls.enabled&&!menu&&!openDrawer&&session.status==='online'&&!session.walletBlocked,allowed:code=>!Object.entries(controls.bindings).some(([name,keys])=>name!=='boost'&&keys.includes(code)),onDoubleTap:driveToDelivery,onTripleTap:driveToCharger});
mapDialog.element.addEventListener('close',()=>{controls.clear();controls.enabled=!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');});
$('map-toggle').setAttribute('aria-label','Open the map and choose a self-driving destination');
$('map-toggle').removeAttribute('aria-pressed');$('map-label').textContent='MAP · TAP TO EXPLORE';
$('map-toggle').onclick=()=>{
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car)return;
  setDrawer(null);controls.clear();controls.enabled=false;mapDialog.open(car,car.navigation?.destination,player.delivery.level);
};
function minimap(entity:Entity|undefined,level:Level){
  const cx=Math.round((entity?.x??0)/25)*25,cz=Math.round((entity?.z??0)/25)*25;
  const drawLevel=Math.max(level,entity?requiredLevelAt(entity.x,entity.z):level);
  const extent=mapExtents[Math.min(drawLevel,mapExtents.length-1)],mapWidth=extent.maxX-extent.minX,mapHeight=extent.maxZ-extent.minZ;
  const bayScale=Math.min(210/mapWidth,210/mapHeight),bayLeft=(240-mapWidth*bayScale)/2,bayTop=(240-mapHeight*bayScale)/2;
  const scale=mapLocal?240/800:bayScale;
  const px=mapLocal?(x:number)=>120+(x-cx)*scale:(x:number)=>bayLeft+(x-extent.minX)*scale;
  const pz=mapLocal?(z:number)=>120+(z-cz)*scale:(z:number)=>bayTop+(z-extent.minZ)*scale;
  const visible=(x:number,z:number)=>requiredLevelAt(x,z)<=level;
  const key=mapLocal?`${level},${drawLevel},${cx},${cz}`:`bay,${level},${drawLevel}`;
  if(key!==mapKey){
    mapKey=key;base.fillStyle='#315965';base.fillRect(0,0,240,240);
    for(const r of REGIONS){base.beginPath();r.points.forEach((p,i)=>i?base.lineTo(px(p.x),pz(p.z)):base.moveTo(px(p.x),pz(p.z)));base.closePath();base.fillStyle=r.id==='marin'||r.id==='yerba'||r.id==='rocket-island'?'#819981':'#b5b4a3';base.fill();}
    base.strokeStyle='#cf806a';base.lineWidth=Math.max(1,4*scale);base.setLineDash([3,2]);base.beginPath();CALTRAIN_TRACK.forEach((p,i)=>i?base.lineTo(px(p.x),pz(p.z)):base.moveTo(px(p.x),pz(p.z)));base.stroke();base.setLineDash([]);
    base.fillStyle='#6e7b78';for(const road of localRoads){
      const x=px(road.x),z=pz(road.z),w=Math.max(.5,road.w*scale),d=Math.max(.5,road.d*scale),radius=Math.hypot(w,d)/2;
      if(x+radius<0||x-radius>240||z+radius<0||z-radius>240)continue;
      base.save();base.translate(x,z);base.rotate(-(road.angle??0));base.fillRect(-w/2,-d/2,w,d);base.restore();
    }
    base.strokeStyle='#e8d0a0';
    for(const highway of HIGHWAYS){base.lineWidth=mapLocal?Math.max(2,(highway.width??32)*scale):1.5;base.beginPath();highway.points.forEach((p,i)=>i?base.lineTo(px(p.x),pz(p.z)):base.moveTo(px(p.x),pz(p.z)));base.stroke();}
    base.strokeStyle='#d6c7a6';base.lineWidth=mapLocal?Math.max(2,24*scale):2;
    for(const b of BRIDGES){base.beginPath();if(b.axis==='x'){base.moveTo(px(b.start),pz(b.center));base.lineTo(px(b.end),pz(b.center));}else{base.moveTo(px(b.center),pz(b.start));base.lineTo(px(b.center),pz(b.end));}base.stroke();}
    // Hide unreached districts instead of showing the complete Bay from the start.
    drawLockedAreas(base,level,point=>({x:px(point.x),y:pz(point.z)}),'#193b48ee');
    base.font='bold 7px system-ui';base.fillStyle='#eef0d9';base.fillText('SF',px(-120)-12,pz(0));if(visible(385,-150))base.fillText('OAKLAND',px(385)+4,pz(-150));
    if(visible(200,-1650))base.fillText('NORTH BAY',px(200)-22,pz(-1650));
    for(const dock of Object.values(FERRY_DOCKS).filter(d=>visible(d.x,d.z))){
      const x=px(dock.x),z=pz(dock.z);base.beginPath();base.moveTo(x,z-4);base.lineTo(x+4,z);base.lineTo(x,z+4);base.lineTo(x-4,z);base.closePath();base.fillStyle='#e9f6ee';base.fill();
    }
    for(const lot of PARKING_LOTS.filter(l=>visible(l.area.x,l.area.z))){base.fillStyle='#ffd386';base.fillRect(px(lot.area.x)-2,pz(lot.area.z)-2,4,4);}
    for(const stop of CALTRAIN_STOPS.filter(s=>visible(s.x,s.z))){base.fillStyle='#e88470';base.fillRect(px(stop.x)-2,pz(stop.z)-2,4,4);if(mapLocal){base.fillStyle='#eef0d9';base.fillText(`CALTRAIN · ${stop.name.toUpperCase()}`,px(stop.x)+4,pz(stop.z)-4);}}
    for(const course of RACE_COURSES.filter(c=>visible(c.start.x,c.start.z))){base.fillStyle='#e6a6e6';base.fillRect(px(course.start.x)-2,pz(course.start.z)-2,4,4);}
    for(const jump of ISLAND_JUMPS){
      const center=(jump.start+jump.end)/2;if(!visible(center,jump.z))continue;
      const width=Math.max(3,(jump.end-jump.start)*scale),height=Math.max(2,jump.width*scale);
      base.fillStyle='#f1a66a';base.fillRect(px(center)-width/2,pz(jump.z)-height/2,width,height);
    }
    base.fillStyle='#eef0d9';
    for(const district of DISTRICTS.filter(d=>(d.id==='san-jose'||d.id==='fremont'||d.id==='palo-alto')&&visible(d.x,d.z)))base.fillText(district.name.toUpperCase(),px(district.x)+4,pz(district.z));
    for(const landmark of LANDMARKS.filter(l=>visible(l.arrival.x,l.arrival.z))){base.fillStyle='#fff2c6';base.beginPath();base.arc(px(landmark.arrival.x),pz(landmark.arrival.z),2.5,0,Math.PI*2);base.fill();if(mapLocal)base.fillText(landmark.name,px(landmark.arrival.x)+4,pz(landmark.arrival.z)-4);}
    for(const place of EAST_SOUTH_ADDITIONS.filter(p=>visible(p.x,p.z))){base.fillStyle='#e5b87a';base.beginPath();base.arc(px(place.x),pz(place.z),2.5,0,Math.PI*2);base.fill();if(mapLocal)base.fillText(place.name,px(place.x)+4,pz(place.z)-4);}
    for(const monument of TESLAND_MONUMENTS.filter(p=>visible(p.x,p.z))){base.fillStyle='#ffd080';base.beginPath();base.arc(px(monument.x),pz(monument.z),3,0,Math.PI*2);base.fill();if(mapLocal)base.fillText(monument.name.toUpperCase(),px(monument.x)+4,pz(monument.z)-4);}
    if(visible(LUXURY_SHOWROOM.arrival.x,LUXURY_SHOWROOM.arrival.z)){
      const x=px(LUXURY_SHOWROOM.arrival.x),z=pz(LUXURY_SHOWROOM.arrival.z);
      base.save();base.translate(x,z);base.rotate(Math.PI/4);base.fillStyle='#f4bf58';base.fillRect(-4,-4,8,8);base.restore();
      if(mapLocal){base.fillStyle='#263a34';base.fillText('THE VAULT',x+7,z-5);}
    }
    if(visible(FREMONT_SPACEPORT.entrance.x,FREMONT_SPACEPORT.entrance.z)){base.fillStyle='#ffad70';base.beginPath();base.arc(px(FREMONT_SPACEPORT.entrance.x),pz(FREMONT_SPACEPORT.entrance.z),4,0,Math.PI*2);base.fill();if(mapLocal)base.fillText('MARS SPACEPORT',px(FREMONT_SPACEPORT.entrance.x)+5,pz(FREMONT_SPACEPORT.entrance.z)-5);}
    if(visible(STUNT_LOOP.x,STUNT_LOOP.z)){base.fillStyle='#ffc77f';base.beginPath();base.arc(px(STUNT_LOOP.x),pz(STUNT_LOOP.z),3,0,Math.PI*2);base.fill();base.fillText('LOOP',px(STUNT_LOOP.x)+4,pz(STUNT_LOOP.z)-3);}
    base.fillStyle='#91dfff';base.beginPath();base.arc(px(DOME.x),pz(DOME.z),3,0,Math.PI*2);base.fill();base.fillText('ROCKET DOME',px(DOME.x)+4,pz(DOME.z)-3);
  }
  map.drawImage(mapBase,0,0);
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
  STATIONS.filter(s=>visible(s.x,s.z)).forEach(s=>{map.beginPath();map.arc(px(s.x),pz(s.z),2.8,0,Math.PI*2);map.fillStyle='#a8f1cb';map.fill();});
  SHOPS.filter(s=>visible(s.x,s.z)).forEach(s=>{map.save();map.translate(px(s.x),pz(s.z));map.rotate(Math.PI/4);map.fillStyle='#cf99ff';map.fillRect(-3,-3,6,6);map.restore();});
  session.world.pickups.filter(p=>p.kind==='rocket'&&p.active&&visible(p.x,p.z)).forEach(p=>{map.beginPath();map.arc(px(p.x),pz(p.z),2,0,Math.PI*2);map.fillStyle='#f1caff';map.fill();});
  session.world.entities.filter(e=>e.npc&&!e.driver&&visible(e.x,e.z)).forEach(e=>{map.fillStyle=e.police?'#ff7771':'#71cdd5';const size=e.police?4:2;map.fillRect(px(e.x)-size/2,pz(e.z)-size/2,size,size);});
  const player=session.world.players.find(p=>p.id===session.id);if(player&&!player.delivery.order.search&&!(player.delivery.lastReroute?.reason==='unavailable'&&!isOrderAccessible(player.delivery.order,player.delivery.level,!entity||entity.kind==='person'||canAssignDeliveryRoof(entity)))){const target=orderTarget(player.delivery.order);map.beginPath();map.arc(px(target.x),pz(target.z),5,0,Math.PI*2);map.strokeStyle='#ffd384';map.lineWidth=2;map.stroke();}
  if(entity?.navigation){const target=entity.navigation.destination;map.beginPath();map.arc(px(target.x),pz(target.z),5,0,Math.PI*2);map.strokeStyle='#ff7771';map.lineWidth=2;map.stroke();}
  session.world.players.forEach(p=>{const e=session.world.entities.find(e=>e.id===p.entityId);if(!e||p.id===session.id||!visible(e.x,e.z))return;map.beginPath();map.arc(px(e.x),pz(e.z),3,0,Math.PI*2);map.fillStyle='#eee5ce';map.fill();});
  if(entity){
    map.save();map.translate(px(entity.x),pz(entity.z));
    const markerScale=Math.max(1,160/(map.canvas.clientWidth||160));map.scale(markerScale,markerScale);
    map.beginPath();map.arc(0,0,10,0,Math.PI*2);map.fillStyle='#17343bcc';map.fill();map.strokeStyle='#fff7de';map.lineWidth=2;map.stroke();
    map.rotate(-entity.yaw);map.beginPath();map.moveTo(0,-15);map.lineTo(-7,9);map.lineTo(0,5);map.lineTo(7,9);map.closePath();
    map.lineJoin='round';map.strokeStyle='#17343b';map.lineWidth=3;map.stroke();map.fillStyle='#ffbe66';map.fill();map.restore();
  }
}

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const money=(amount:number)=>`${amount<0?'−':''}$${Math.abs(amount).toLocaleString('en-US')}`;
const starship=new StarshipClient(session);
const earningsBadge=createEarningsBonusBadge();$('mission-panel').append(earningsBadge.element);
const ticketDialog=$<HTMLDialogElement>('ticket-dialog');
const marsUi=createMarsUI(session,money,()=>{setDrawer(null);controls.clear();controls.enabled=false;},()=>{controls.clear();controls.enabled=!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');},starship);
for(const id of ['mars-action','mars-menu','mars-error','mars-quick'])$(id).onclick=()=>marsUi.open();
const progressPanels=createProgressPanels({
  session,
  driverId:()=>chat.playerId,
  onOpen:()=>{setDrawer(null);controls.clear();controls.enabled=false;},
  onClose:()=>{controls.clear();controls.enabled=!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');},
});
const {scoresDialog,awardsDialog}=progressPanels;
const openScores=progressPanels.openScores,openAwards=progressPanels.openAwards;
let nextAwardTarget:AchievementId|AchievementTierId|undefined;
let goalOwner:string|null=null,goalGeneration=-1,goalWallet:WalletView|null=null,goalTier:AchievementTierRow|null=null;
$('next-award').onclick=()=>{setDrawer(null);openAwards(nextAwardTarget);};
function announceAchievements(){
  const id=achievementQueue.shift();if(!id){achievementTimer=0;$('achievement-toast').classList.add('hidden');return;}
  $('achievement-toast').textContent=`★ ACHIEVEMENT UNLOCKED · ${ACHIEVEMENTS[id].name}`;$('achievement-toast').classList.remove('hidden');
  achievementTimer=window.setTimeout(announceAchievements,3500);
}
function showTicket(ticket:Ticket){
  // A citation takes precedence over informational dialogs.
  setDrawer(null);
  if(awardsDialog.open)awardsDialog.close();if(scoresDialog.open)scoresDialog.close();if(fleetDialog.open)fleetDialog.close();if(soundDialog.open)soundDialog.close();if(shopDialog.open)shopDialog.close();if(identityDialog.open)identityDialog.close();luxuryUi.close();cabUi.close();marketUi.close();marsUi.close();mapDialog.close();minigames.close();chatPanel.close();
  controls.clear();controls.enabled=false;
  $('ticket-amount').textContent=`−${money(ticket.amount)}`;
  const speeding=ticket.cause==='speeding';
  $('ticket-kicker').textContent=`POLICE CITATION / ${speeding?'HIGHWAY SPEEDING':'FLIGHT ON PUBLIC ROADS'}`;
  $('ticket-copy').textContent=speeding?'A highway patrol caught you speeding and stopped your run.':'Flying over public roads put people at risk. Police stopped your run and issued a citation.';
  $('ticket-detail').textContent=speeding
    ?`Offense #${ticket.offense} · ${ticket.speedKph} km/h recorded | Base $60 + speed $${ticket.speedFine??0} + flight $${ticket.durationFine+ticket.heightFine} + repeat $${ticket.repeatFine}`
    :`Offense #${ticket.offense} · ${ticket.flightSeconds}s airborne · ${ticket.peakHeight}m peak | Base $60 + flight $${ticket.durationFine+ticket.heightFine} + repeat $${ticket.repeatFine}`;
  ticketDialog.showModal();$<HTMLButtonElement>('ticket-acknowledge').focus();
}
ticketDialog.addEventListener('cancel',event=>event.preventDefault());
$('ticket-acknowledge').onclick=()=>{ticketDialog.close();controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;};

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
for(const id of selectableIds){const spec=VEHICLES[id],button=document.createElement('button');button.dataset.vehicle=id;button.textContent=spec.name;button.style.setProperty('--vehicle-color',`#${spec.color.toString(16).padStart(6,'0')}`);button.onclick=()=>showVehicle(id);$('fleet-list').append(button);}
function openFleet(){
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-vehicle]'))button.hidden=!session.sandbox&&!teslaIds.includes(button.dataset.vehicle as VehicleId);
  $('fleet-title').textContent=session.sandbox?'Sandbox · choose any ride.':'Choose your Tesla.';
  fleetDialog.querySelector('.fleet-intro')!.textContent=session.sandbox?'All models unlocked. Each ride starts with maximum upgrades. Progress is not saved.':'Choose a Tesla here. Waymo, Cruise and Zoox vehicles can only be taken from the street. Upgrades stay with each car.';
  controls.clear();controls.enabled=false;const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);showVehicle(entity&&entity.kind!=='person'&&VEHICLES[entity.kind].brand==='Tesla'?entity.kind:selectedVehicle);fleetDialog.showModal();}
function closeFleet(){fleetDialog.close();controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;}
$('fleet-close').onclick=closeFleet;fleetDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;});
$('fleet-drive').onclick=()=>{const player=session.world.players.find(p=>p.id===session.id),entity=session.world.entities.find(e=>e.id===player?.entityId);if(!entity||entity.supportId===null||entity.supportId==='ferry'||entity.supportId==='island-cliff'||entity.loopAngle!==null||Math.abs(entity.speed)>1){$('fleet-feedback').textContent=entity?.supportId==='ferry'?'Drive off the ferry and stop before choosing a ride.':'Brake to a stop on the ground, then choose your ride.';return;}session.selectVehicle(previewVehicle);selectedVehicle=previewVehicle;startingSelect.value=previewVehicle;updateStarting();closeFleet();notice(session.sandbox?'Sandbox ride requested with maximum upgrades.':'Tesla requested. Upgrades do not transfer between vehicles.');};
function updateActivities(e:Entity){
  const world=session.world,ferry=world.ferry,secured=ferrySecured(ferry,e);
  const nearDock=Object.values(FERRY_DOCKS).some(dock=>Math.hypot(e.x-dock.x,e.z-dock.z)<180);
  const occupancy=world.entities.filter(car=>car.supportId==='ferry'&&car.kind!=='person').length;
  let ferryText='';
  if(nearDock||e.supportId==='ferry'||secured){
    const where=ferry.phase==='sf'?'SF':ferry.phase==='island'?'North Bay Playground':ferry.phase==='to-island'?'North Bay Playground':'SF';
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
    }else if(round.phase==='results')parkingText=round.mode==='queue'&&round.claimedStallIds.length>=lot.stalls.length?'QUEUE · No stalls remain':`${round.mode==='park'?'PARK IT':'QUEUE'} · Round ended`;
    else if(round.mode==='park')parkingText=`PARK IT · Stall ${entrant.targetId??'—'}${stall?` · ${Math.round(Math.hypot(e.x-stall.x,e.z-stall.z))}m`:''} · hold ${entrant.hold.toFixed(1)}/2s · ${remaining}s left`;
    else if(round.phase==='waiting')parkingText=`QUEUE · Position ${round.entrants.findIndex(p=>p.playerId===session.id)+1} · starts in ${remaining}s`;
    else parkingText=`QUEUE · ${Math.max(0,lot.stalls.length-round.claimedStallIds.length)} unclaimed · red X = claimed · ${remaining}s left`;
  }else if(PARKING_LOTS.some(lot=>Math.hypot(e.x-lot.area.x,e.z-lot.area.z)<Math.max(lot.area.width,lot.area.length)/2+25)){
    parkingText='PARKING PLAYGROUND · Choose a game in Actions → Mini-games';
  }
  $('parking-status').textContent=parkingText;
  $('parking-status').classList.toggle('activity-active',!!round);
  const racing=playerRace(world.races,session.id);
  const race=racing?.round,racer=racing?.entrant;
  const course=RACE_COURSES.find(course=>course.id===race?.courseId);
  let raceText='';
  if(race&&racer&&course){
    const remaining=Math.max(0,Math.ceil(race.endsAt-world.time)),name=course.name.toUpperCase();
    if(racer.status==='finished')raceText=`${name} · Finished ${racer.elapsed?.toFixed(1)??'—'}s${racer.rank?` · #${racer.rank}`:''}`;
    else if(racer.status==='dnf')raceText=`${name} · Did not finish`;
    else if(race.phase==='lobby')raceText=`${name} · Lobby ${race.entrants.length}/8 · starts in ${remaining}s`;
    else if(race.phase==='countdown')raceText=`${name} · Starting in ${remaining}s`;
    else{
      const gate=course.gates[racer.nextGate];
      const feedback=racer.feedback==='wrong-way'?' · WRONG WAY':racer.feedback==='missed-gate'?' · MISSED GATE: return to checkpoint':'';
      raceText=`${name} · Gate ${racer.nextGate+1}/${course.gates.length}${gate?` · ${Math.round(Math.hypot(e.x-gate.x,e.z-gate.z))}m`:''} · ${remaining}s left${feedback}`;
    }
  }else if(RACE_COURSES.some(course=>Math.hypot(e.x-course.start.x,e.z-course.start.z)<course.start.radius+20))raceText='RACE START · Choose a game in Actions → Mini-games. Cars can bump.';
  $('race-status').textContent=raceText;
  $('race-status').classList.toggle('activity-active',!!racing);
}
const shopDialog=$<HTMLDialogElement>('shop-dialog');
let shopBusyUntil=0,lastRocketEntity='',lastRocketInstalled=false,lastSkyCurrent='';
let pendingLuxury:{requestId:number;action:'buy'|'collect';vehicle:LuxuryVehicleId;sentAt:number;source:'vault'|'workshop';result:typeof session.luxuryResult}|null=null;
let luxuryStatus='',lastLuxuryKey='';
const luxuryUi=createLuxuryShowroom({
  onPurchase:id=>requestLuxury('buy',id),
  onCollect:id=>requestLuxury('collect',id),
  onOpenChange(open){controls.clear();controls.enabled=!open&&!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');},
});
document.body.append(luxuryUi.element);
let pendingCabBuy:{requestId:number;count:number;code:string;generation:number;lost:boolean}|null=null;
let pendingCabPaint:{requestId:number;id:string;paint:PaintId;code:string;generation:number;lost:boolean}|null=null;
let cabStatus='',cabPaintStatus:{id:string;message:string}|null=null,lastCabKey='',lastCabMapUpdate=0;
function cabEntity(id:string){return session.world.entities.find(entity=>entity.owner===session.id&&entity.cab?.assetId===id);}
function openCabMap(id:string,follow:boolean){
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId),cab=cabEntity(id);
  const index=session.wallet?.cybercabs.assets.findIndex(asset=>asset.id===id)??-1;
  if(!player||!car||!cab||index<0)return;
  cabUi.close();setDrawer(null);controls.clear();controls.enabled=false;
  mapDialog.openCab(car,car.navigation?.destination,player.delivery.level,{id,name:`Cybercab ${index+1}`,position:{x:cab.x,z:cab.z}},follow);
}
const cabUi=createCybercabUI({
  onPurchase(){
    if(pendingCabBuy||!currentCode||!session.wallet)return false;
    const requestId=session.buyCab();if(requestId===null)return false;
    pendingCabBuy={requestId,count:session.wallet.cybercabs.assets.length,code:currentCode,generation:session.connectionGeneration,lost:false};cabStatus='';return true;
  },
  onFind:id=>openCabMap(id,false),onFollow:id=>openCabMap(id,true),
  onStyle(id,choice){
    if(pendingCabPaint||!currentCode||!Object.hasOwn(PAINTS,choice))return false;
    const paint=choice as PaintId,requestId=session.paintCab(id,paint);if(requestId===null)return false;
    pendingCabPaint={requestId,id,paint,code:currentCode,generation:session.connectionGeneration,lost:false};cabPaintStatus=null;return true;
  },
  onOpenChange(open){controls.clear();controls.enabled=!open&&!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');},
});
document.body.append(cabUi.element);
function updateCabs(){
  const ready=session.status==='online'&&session.walletStatus==='ready'&&!!session.wallet;
  if(pendingCabBuy){
    if(session.status!=='online'||session.connectionGeneration!==pendingCabBuy.generation)pendingCabBuy.lost=true;
    const result=session.cabBuyResult?.requestId===pendingCabBuy.requestId?session.cabBuyResult:null;
    const recovered=pendingCabBuy.lost&&ready;
    if((result&&!result.ok)||(result?.ok&&ready&&session.wallet!.cybercabs.assets.length>pendingCabBuy.count)||recovered){
      const same=currentCode===pendingCabBuy.code;
      const bought=same&&ready&&session.wallet!.cybercabs.assets.length>pendingCabBuy.count;
      cabStatus=!same?'Reconnect the previous saved driver to check its purchase.':bought?'Cybercab added to your fleet.':result?.reason==='unaffordable'?'Not enough cash for this Cybercab.':'Purchase was not confirmed. Review the offer before trying again.';
      pendingCabBuy=null;session.cabBuyResult=null;cabUi.resolvePurchase();
    }
  }
  if(pendingCabPaint){
    if(session.status!=='online'||session.connectionGeneration!==pendingCabPaint.generation)pendingCabPaint.lost=true;
    const result=session.cabPaintResult?.requestId===pendingCabPaint.requestId?session.cabPaintResult:null;
    const applied=ready&&currentCode===pendingCabPaint.code&&session.wallet!.cybercabs.assets.some(asset=>asset.id===pendingCabPaint!.id&&asset.style.paint===pendingCabPaint!.paint);
    if((result&&!result.ok)||(result?.ok&&applied)||(pendingCabPaint.lost&&ready)){
      const id=pendingCabPaint.id;
      cabPaintStatus={id,message:applied?'Paint updated.':result?.reason==='unaffordable'?'Not enough cash for that paint.':'Paint change was not confirmed.'};
      pendingCabPaint=null;session.cabPaintResult=null;cabUi.resolveStyle(id);
    }
  }
  const wallet=ready?session.wallet:null,player=session.world.players.find(p=>p.id===session.id);
  const quote=wallet&&quoteCybercabPurchase(wallet.cybercabs.assets.length,wallet.cybercabs.claimedOwnershipAwards);
  const projected=wallet&&quote?wallet.cash-quote.price+quote.award:null;
  const unavailable=session.status!=='online'?'Reconnect to see your fleet.':session.walletStatus==='guest'?'Save your driver in Actions → Driver identity to keep a fleet.':!wallet?'Connecting to your saved driver…':!quote?'Your fleet is complete.':wallet.cash<quote.price?'Earn more cash to buy the next Cybercab.':undefined;
  const cabs=(wallet?.cybercabs.assets??[]).map((asset,index)=>{
    const entity=cabEntity(asset.id),driver=entity?.driver?session.world.players.find(p=>p.id===entity.driver)?.name??'Driver':null;
    const active=!!entity&&!driver&&entity.npc&&entity.autopilot&&!!player&&session.world.time<=player.delivery.activeUntil;
    const detail=!entity?'Waiting for space in this room.':driver?'Income pauses while a player drives.':active?'Driving and earning while you are active.':'Income pauses while you are inactive or the cab is not autonomous.';
    return {id:asset.id,name:`Cybercab ${index+1}`,state:active?'operating' as const:'waiting' as const,stateDetail:detail,owner:player?.name??'You',driver,
      revenue:{label:'Lifetime cab income',amount:asset.gross},canFind:!!entity,canFollow:!!entity,
      style:{currentId:asset.style.paint,choices:(Object.keys(PAINTS) as PaintId[]).map(id=>{
        const paint=PAINTS[id],locked=levelForCash(wallet!.cash)<paint.level;
        return {id,label:`${locked?'🔒 ':''}${paint.name} · ${paint.price?money(paint.price):'FREE'}${paint.level?` · LV ${paint.level}`:''}`,disabled:locked};
      }),
        state:pendingCabPaint?'pending' as const:'ready' as const,detail:cabPaintStatus?.id===asset.id?cabPaintStatus.message:undefined}};
  });
  const next={cash:wallet?.cash??null,level:wallet?.level??null,purchase:{state:pendingCabBuy?'pending' as const:unavailable?'unavailable' as const:'ready' as const,
    quote:quote&&projected!==null?{price:quote.price,award:quote.award,projectedBalance:projected,projectedLevel:levelForCash(projected)}:null,
    detail:pendingCabBuy?.lost?'Rejoin with this saved driver to confirm the purchase.':unavailable||cabStatus},cabs};
  const key=JSON.stringify(next);if(key!==lastCabKey){lastCabKey=key;cabUi.update(next);}
}
$('cybercabs').onclick=()=>{setDrawer(null);controls.clear();controls.enabled=false;lastCabKey='';updateCabs();cabUi.open();};
const market=new MarketClient(driverStorage,request=>session.market(request));
let lastMarketKey='';
function updateMarket(){
  const owner=chat.status==='online'&&currentCode&&currentCode===chat.code&&currentCode===walletBoundCode?chat.playerId:null;
  const ready=!!owner&&session.status==='online'&&session.walletStatus==='ready'&&!!session.wallet;
  const refreshOnReady=market.setContext({owner,ready,generation:session.connectionGeneration,cash:ready?session.wallet!.cash:null});
  if(session.marketState){market.receiveState(session.marketState);session.marketState=null;}
  if(session.marketResult){market.receiveResult(session.marketResult);session.marketResult=null;}
  market.tick();
  if(marketUi.isOpen()){
    if(refreshOnReady)market.refresh();
    const next=market.view(),key=JSON.stringify(next);if(key!==lastMarketKey){lastMarketKey=key;marketUi.update(next);}
  }
}
const marketUi=createMarketUI({
  onAction:action=>market.start(action),onRefresh:()=>market.refresh(),onMore:()=>market.more(),onMoreOwned:()=>market.moreOwned(),
  onVisit(assetId){const room=propertyRoom(assetId);if(!room){notice('This home is unavailable. Refresh the market.');return;}$<HTMLInputElement>('room').value=room;selectedEntry={room,automatic:false};begin();},
  onOpenChange(open){controls.clear();controls.enabled=!open&&!openDrawer&&!menu&&session.status==='online'&&!session.walletBlocked&&!document.querySelector('dialog[open]');},
});
document.body.append(marketUi.element);
$('market').onclick=()=>{setDrawer(null);controls.clear();controls.enabled=false;lastMarketKey='';updateMarket();marketUi.open();};
$('return-bay').onclick=()=>{$<HTMLInputElement>('room').value=DEFAULT_ROOM;selectedEntry={room:DEFAULT_ROOM,automatic:true};begin();};
function requestLuxury(action:'buy'|'collect',id:string,source:'vault'|'workshop'='vault'){
  const vehicle=luxuryVehicle(id);if(!vehicle||pendingLuxury)return;
  luxuryStatus='';
  pendingLuxury={requestId:session.luxury(action,vehicle.id),action,vehicle:vehicle.id,sentAt:performance.now(),source,result:null};
  if(source==='workshop')$('shop-feedback').textContent='Requesting your vehicle…';
  lastLuxuryKey='';updateLuxury(false);updateLuxury();if(shopDialog.open)updateShop();
}
function updateLuxury(readResult=true){
  if(readResult&&pendingLuxury){
    const reply=session.luxuryResult;
    if(reply?.requestId===pendingLuxury.requestId&&reply.action===pendingLuxury.action&&reply.vehicle===pendingLuxury.vehicle){pendingLuxury.result=reply;session.luxuryResult=null;}
    const result=pendingLuxury.result;
    if(result&&(!result.ok||result.action==='collect'||session.wallet?.ownedLuxury.includes(result.vehicle))){
      const name=luxuryVehicle(result.vehicle)?.name??'Vehicle';
      luxuryStatus=result.ok?`${name} added to your collection${result.awards?.length?` · ${result.awards.length} achievements unlocked`:''}.`:result.reason||'The showroom could not complete that request. Please try again.';
      const source=pendingLuxury.source;
      pendingLuxury=null;
      if(result.ok&&result.action==='collect'){
        luxuryUi.close();if(source==='workshop'&&shopDialog.open)closeShop();notice(`${name} is ready to drive.`);
      }else if(source==='workshop'){
        $('shop-feedback').textContent=luxuryStatus;if(!shopDialog.open)notice(luxuryStatus);
      }
    }
  }
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId),wallet=session.wallet;
  const unavailableReason=session.status!=='online'?'Reconnect to visit the showroom.':!wallet?'Connecting to your wallet…':!car||!atLuxuryShowroom(car)?'Stop in the gold forecourt to shop or collect.':undefined;
  const status=pendingLuxury&&performance.now()-pendingLuxury.sentAt>10_000?'Still waiting for confirmation. Rejoin if the connection is lost.':luxuryStatus;
  if(pendingLuxury?.source==='workshop'&&status)$('shop-feedback').textContent=status;
  const key=JSON.stringify([wallet?.cash,wallet?.ownedLuxury,pendingLuxury?.requestId,unavailableReason,status]);
  if(key===lastLuxuryKey)return;
  lastLuxuryKey=key;
  luxuryUi.update({cash:wallet?.cash??0,pending:!!pendingLuxury,unavailableReason,status,
    vehicles:LUXURY_CATALOG.map(vehicle=>({...vehicle,owned:!!wallet?.ownedLuxury.includes(vehicle.id),levelAfterPurchase:wallet?levelForCash(Math.max(0,wallet.cash-vehicle.price)):undefined}))});
}
let pendingShop:{requestId:number;upgrade:UpgradeId;sentAt:number}|null=null;
let pendingOta:{requestId:number;enabled:boolean;sentAt:number}|null=null;
let pendingStyle:({requestId:number;sentAt:number}&StyleChoice)|null=null;
let stylePreview:FleetPreview|undefined,stylePreviewKey='';
const shopSections=['upgrades','paint','decals','remote'] as const;
type ShopSection=typeof shopSections[number];
function selectShopSection(section:ShopSection,focus=false){
  for(const name of shopSections){
    const tab=$<HTMLButtonElement>(`shop-tab-${name}`),selected=name===section;
    tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    $(`shop-${name}`).hidden=!selected;
    if(selected&&focus)tab.focus();
  }
  shopDialog.querySelector<HTMLElement>('.shop-scroll')!.scrollTop=0;
}
for(const [index,name] of shopSections.entries()){
  const tab=$<HTMLButtonElement>(`shop-tab-${name}`);
  tab.onclick=()=>selectShopSection(name);
  tab.onkeydown=event=>{
    const next=event.key==='ArrowRight'?(index+1)%shopSections.length:event.key==='ArrowLeft'?(index+shopSections.length-1)%shopSections.length:event.key==='Home'?0:event.key==='End'?shopSections.length-1:-1;
    if(next!==-1){event.preventDefault();selectShopSection(shopSections[next],true);}
  };
}
for(const vehicle of LUXURY_CATALOG){
  const row=document.createElement('div');row.className='shop-item';row.dataset.luxuryOwned=vehicle.id;
  const title=document.createElement('strong');title.textContent=`${vehicle.brand} ${vehicle.name}`;
  const button=document.createElement('button');button.type='button';button.dataset.luxuryCollect=vehicle.id;button.textContent='Collect';
  button.setAttribute('aria-label',`Collect ${vehicle.brand} ${vehicle.name}`);
  button.onclick=()=>requestLuxury('collect',vehicle.id,'workshop');
  row.append(title,button);$('shop-collection-items').append(row);
}
$('ota-toggle').onclick=()=>{
  const player=session.world.players.find(p=>p.id===session.id);if(!player||pendingOta||pendingStyle)return;
  const enabled=!player.delivery.ota.enabled,now=performance.now();shopBusyUntil=now+800;
  pendingOta={requestId:session.setOta(enabled),enabled,sentAt:now};updateShop();
};
const upgradePresentation:Record<UpgradeId,{group:string;icon:string}>={
  rocket:{group:'Flight',icon:'↗'},economy:{group:'Flight',icon:'≋'},tank:{group:'Flight',icon:'◒'},
  motor:{group:'Driving',icon:'⚡'},armor:{group:'Driving',icon:'⬡'},
  autonomyIntercity:{group:'Self-driving',icon:'⇢'},autonomyJump:{group:'Self-driving',icon:'↟'},autonomySky:{group:'Self-driving',icon:'✦'},
  service:{group:'Service',icon:'✚'}
};
let previousUpgradeGroup='';
for(const id of Object.keys(UPGRADES) as UpgradeId[]){
  const item=UPGRADES[id],presentation=upgradePresentation[id],row=document.createElement('div');row.className='shop-item';
  if(presentation.group!==previousUpgradeGroup){
    const heading=document.createElement('h4');heading.className='shop-group-heading';heading.textContent=presentation.group;
    $('shop-items').append(heading);previousUpgradeGroup=presentation.group;
  }
  const icon=document.createElement('span');icon.className='shop-item-icon';icon.textContent=presentation.icon;icon.setAttribute('aria-hidden','true');
  const copy=document.createElement('div'),title=document.createElement('strong'),description=document.createElement('p');title.dataset.upgradeTitle=id;
  title.textContent=item.name;description.textContent=item.description;copy.append(title,description);
  const button=document.createElement('button');button.dataset.upgrade=id;button.onclick=()=>{
    const now=performance.now();shopBusyUntil=now+800;
    pendingShop={requestId:session.buyUpgrade(id),upgrade:id,sentAt:now};
    $('shop-feedback').textContent='Checking purchase…';updateShop();
  };
  row.append(icon,copy,button);$('shop-items').append(row);
}
for(const category of ['paint','decal'] as const){
  const options=category==='paint'?PAINTS:DECALS;
  for(const choice of Object.keys(options)){
    const selection=(category==='paint'?{category,choice:choice as PaintId}:{category,choice:choice as DecalId}) as StyleChoice;
    const item=category==='paint'?PAINTS[choice as PaintId]:DECALS[choice as DecalId],button=document.createElement('button');
    button.dataset.styleCategory=category;button.dataset.styleChoice=choice;
    if(category==='paint'&&choice!=='stock')button.style.setProperty('--swatch',`#${PAINTS[choice as PaintId].color!.toString(16).padStart(6,'0')}`);
    button.onclick=()=>{
      const now=performance.now();shopBusyUntil=now+800;
      pendingStyle={...selection,requestId:session.buyVehicleStyle(selection),sentAt:now};
      $('shop-feedback').textContent='Checking purchase…';updateShop();
    };
    button.textContent=item.name;$(category==='paint'?'paint-options':'decal-options').append(button);
  }
}
function updateShop(){
  if(pendingStyle){
    const result=session.vehicleStyleResult;
    if(result?.requestId===pendingStyle.requestId){
      const item=pendingStyle.category==='paint'?PAINTS[pendingStyle.choice]:DECALS[pendingStyle.choice];
      $('shop-feedback').textContent=result.ok?`${item.name} applied to this car.`:'Purchase declined. Check your cash, car and workshop access.';
      pendingStyle=null;session.vehicleStyleResult=null;
    }else if(performance.now()-pendingStyle.sentAt>5000){
      $('shop-feedback').textContent='No reply yet. Check your cash and car before trying again.';pendingStyle=null;
    }
  }

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
  const personalCar=car.kind!=='person'&&car.owner===player.id;
  const available=personalCar&&(!!place||ota.active);
  const levelDrop=(price:number)=>price>0&&player.delivery.cash>=price&&levelForCash(player.delivery.cash-price)<levelForCash(player.delivery.cash)
    ? ` · ↓ LV ${levelForCash(player.delivery.cash-price)}` : '';
  const owned=session.wallet?.ownedLuxury??[];
  $('shop-collection').hidden=!owned.length;
  for(const vehicle of LUXURY_CATALOG){
    const row=document.querySelector<HTMLElement>(`[data-luxury-owned="${vehicle.id}"]`)!;
    row.hidden=!owned.includes(vehicle.id);
    const button=row.querySelector<HTMLButtonElement>('button')!;
    button.disabled=!place||session.status!=='online'||!!pendingLuxury||!!pendingShop||!!pendingOta||!!pendingStyle;
    button.textContent=pendingLuxury?.vehicle===vehicle.id?'CHECKING…':'Collect';
  }
  $('shop-location').textContent=!personalCar?'Choose your own car to customize it.':place?`${place.name} · Workshop connected.`:ota.active?'Remote shop connected · upgrades available anywhere.':'Visit a purple shop ring or subscribe for remote access.';
  $('shop-car').textContent=car.kind==='person'?'ON FOOT':VEHICLES[car.kind].name;
  $('shop-cash').textContent=session.sandbox?'∞':money(player.delivery.cash);
  $('shop-level-note').hidden=session.sandbox;
  $('style-paint-copy').textContent=session.playtest?'This finish lasts for the current playtest.':'Your driver keeps this finish on this vehicle. Each change costs the listed price.';
  $('style-decal-copy').textContent=session.playtest?'This decal lasts for the current playtest.':'Decals stay with this vehicle. Each change costs the listed price.';
  $('ota-copy').textContent=session.sandbox?'Remote shop access is included for this sandbox.':`${money(OTA_FEE)} per game hour (2 real minutes). Upgrades cost extra. Pauses if renewal cannot be paid; resumes when you have ${money(OTA_FEE)}.`;
  $('ota-status').textContent=session.sandbox?'SANDBOX · Remote access included':ota.needsRenewalConsent
    ? ota.active?`PREVIOUS PERIOD ACTIVE · Re-enroll at ${money(OTA_FEE)} per game hour for the next renewal.`:`RE-ENROLL · Previous subscription ended. Confirm ${money(OTA_FEE)} per game hour.`
    : !ota.enabled?'OFF · Subscribe to activate':ota.active?'ACTIVE · Next charge in '+Math.ceil(Math.max(0,(ota.renewAt??0)-session.world.time))+' seconds':`PAUSED · Waiting for ${money(OTA_FEE)}`;
  $('style-level').textContent=session.sandbox?'All finishes are unlocked in sandbox.':`Your level: ${levelForCash(player.delivery.cash)} · Earn cash to unlock more finishes.`;
  const marketPaint=marketPaintColor(car.marketPaint);$('style-market').hidden=marketPaint===null;
  const previewKey=car.kind==='person'?'person':`${car.kind}:${car.style.paint}:${car.style.decal}:${marketPaint??'base'}`;
  $<HTMLCanvasElement>('style-preview').hidden=car.kind==='person';
  if(car.kind!=='person'&&previewKey!==stylePreviewKey){stylePreview??=new FleetPreview($<HTMLCanvasElement>('style-preview'));stylePreview.show(car.kind,car.style,marketPaint);stylePreviewKey=previewKey;}
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-style-category]')){
    const category=button.dataset.styleCategory as 'paint'|'decal',choice=button.dataset.styleChoice!;
    const item=category==='paint'?PAINTS[choice as PaintId]:DECALS[choice as DecalId];
    const installed=car.style[category]===choice;
    const locked=levelForCash(player.delivery.cash)<item.level;
    button.textContent=`${item.name} · ${installed?(category==='paint'&&marketPaint!==null?'SAVED':'APPLIED'):`${locked?'🔒 ':''}${item.price?money(item.price):'FREE'}${item.level?` · LV ${item.level}`:''}${locked?'':levelDrop(item.price)}`}`;button.setAttribute('aria-pressed',String(installed));
    button.disabled=!available||installed||locked||(category==='paint'&&marketPaint!==null)||player.delivery.cash<item.price||!!pendingShop||!!pendingOta||!!pendingStyle||!!pendingLuxury||performance.now()<shopBusyUntil;
  }
  const otaButton=$<HTMLButtonElement>('ota-toggle');otaButton.textContent=session.sandbox?'INCLUDED':pendingOta?'CHECKING…':ota.enabled?'CANCEL':`${ota.needsRenewalConsent?'RE-ENROLL':'SUBSCRIBE'}${ota.active?'':levelDrop(OTA_FEE)}`;
  otaButton.disabled=session.sandbox||!!pendingOta||!!pendingShop||!!pendingStyle||!!pendingLuxury||performance.now()<shopBusyUntil;
  for(const id of Object.keys(UPGRADES) as UpgradeId[]){
    const button=document.querySelector<HTMLButtonElement>(`[data-upgrade="${id}"]`)!;
    const installed=id==='rocket'?rocket:id==='service'?car.health>=100&&car.air>=100:id==='tank'?car.tankLevel>=MAX_TANK_LEVEL:id==='autonomyIntercity'?hasIntercity(car.upgrades):car.upgrades[id];
    const needsRocket=(id==='economy'||id==='tank'||id==='autonomyJump'||id==='autonomySky')&&!rocket;
    const needsLeap=id==='autonomySky'&&!car.upgrades.autonomyJump;
    const needsIntercity=id==='autonomyJump'&&!hasIntercity(car.upgrades);
    const price=upgradePrice(player,car,id);
    const name=id==='tank'?`Air tank · Level ${car.tankLevel}${installed?' (max)':` → ${car.tankLevel+1}`}`:UPGRADES[id].name;
    document.querySelector<HTMLElement>(`[data-upgrade-title="${id}"]`)!.textContent=name;
    const fullPrice=id==='tank'?tankUpgradePrice(car.tankLevel):UPGRADES[id].price;
    const requirements=[needsIntercity?'Hyperloop':null,needsLeap?'Leap':null,needsRocket?'rockets':null].filter(Boolean).join(' & ');
    button.textContent=installed?(id==='service'?'Full':id==='tank'?'Max':'Installed'):requirements?`${money(price)} · Needs ${requirements}`:player.delivery.cash<price?`${money(price)} · Need cash`:`Add · ${money(price)}${price<fullPrice?' · Research':''}${levelDrop(price)}`;
    button.setAttribute('aria-label',`${name}: ${button.textContent}`);
    button.disabled=!available||installed||!!requirements||player.delivery.cash<price||!!pendingShop||!!pendingOta||!!pendingStyle||!!pendingLuxury||performance.now()<shopBusyUntil;
  }
}
function openShop(preferSpaceX=false){
  const player=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===player?.entityId);
  if(!player||!car)return;
  const vaultDistance=Math.hypot(car.x-LUXURY_SHOWROOM.arrival.x,car.z-LUXURY_SHOWROOM.arrival.z);
  if(!preferSpaceX&&vaultDistance<30){
    if(!atLuxuryShowroom(car)){notice('Stop in the gold forecourt to enter the Vault.');return;}
    setDrawer(null);controls.clear();controls.enabled=false;lastLuxuryKey='';updateLuxury();luxuryUi.open();return;
  }
  controls.clear();controls.enabled=false;
  if(preferSpaceX)selectShopSection('upgrades');
  if(!pendingShop)$('shop-feedback').textContent=session.playtest?'Playtest changes last only for this room.':'Earn cash by delivering food. Your saved driver keeps purchased upgrades for this vehicle.';
  updateShop();shopDialog.showModal();
}
function closeShop(){shopDialog.close();controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;}
$('shop-close').onclick=closeShop;shopDialog.addEventListener('cancel',()=>{controls.clear();controls.enabled=!menu&&session.status==='online'&&!session.walletBlocked;});

function updateFlightLabel(e:Entity){
  const airborne=e.loopAngle===null&&e.supportId===null;
  const label=e.loopAngle!==null||e.supportId==='dome'?'SUCTION':airborne?'AIRBORNE':'GROUNDED';
  const flight=$('flight');
  if(flight.textContent!==label){flight.textContent=label;flight.classList.toggle('flying',label!=='GROUNDED');}
  $('jump-control').setAttribute('aria-label',airborne?'Tap to air jump, hold to hover':'Tap to jump, hold to hover');
}
function updateDriveControl(){
  $('drive-control').textContent=controls.airborne?'FLY ↑':'DRIVE ↑';
  $('drive-control').setAttribute('aria-label',controls.airborne?'Fly forward':'Drive');
}

scene.start(dt=>{
  starship.tick(marsUi.isOpen());
  if(session.walletBlocked&&!walletWasBlocked){
    controls.clear();controls.enabled=false;$('hud').classList.add('hidden');
    for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))if(dialog!==identityDialog&&dialog!==chatPanel.element)dialog.close();
  }
  if(session.walletBlocked){if(controls.enabled){controls.clear();controls.enabled=false;}}
  else if((walletWasBlocked||lastSessionStatus!=='online')&&session.status==='online'&&!menu&&!openDrawer&&!document.querySelector('dialog[open]'))controls.enabled=true;
  walletWasBlocked=session.walletBlocked;lastSessionStatus=session.status;
  const current=session.world.players.find(p=>p.id===session.id),car=session.world.entities.find(e=>e.id===current?.entityId);
  const cockpit=!!car&&car.kind!=='person'&&scene.cameraMode==='cockpit'&&!menu&&started;
  const input=controls.read();input.cockpit=cockpit&&!document.hidden&&document.hasFocus();
  const driving=started&&!menu&&session.status==='online'&&!session.walletBlocked;
  session.tick(dt,input);progressPanels.update();const soundEvents=audio.update(session.world,session.id,driving);
  if(pendingTeleport){
    if(session.teleportResult?.requestId===pendingTeleport.requestId){notice(session.teleportResult.ok?'Teleported · sandbox progress is not saved.':'No safe ground near that pin. Choose a road or open ground.');pendingTeleport=null;session.teleportResult=null;}
    else if(performance.now()>pendingTeleport.expires){notice('Teleport timed out. Check your connection and try again.');pendingTeleport=null;}
  }
  if(session.identityResult){
    const result=session.identityResult;session.identityResult=null;
    if(result.requestId===identityRequestId){
      if(result.ok){
        walletBoundCode=identityRequestCode;
        if(result.levelBaseline)levelEvents.restore(result.levelBaseline);
        const saved=pendingRememberCode===identityRequestCode&&pendingRememberCode&&rememberRequested?rememberCode(pendingRememberCode):true;
        $<HTMLButtonElement>('identity-rejoin').hidden=true;refreshIdentity();
        if(saved&&identityDialog.open)identityFeedback(result.message);
      }else{
        const message=result.message+(/rejoin/i.test(result.message)?' Your current progress remains in this room; rejoining leaves it behind unless you saved that driver first.':rememberedCode?' Your previous driver remains saved on this browser.':'');
        identityFeedback(message);$<HTMLButtonElement>('identity-rejoin').hidden=!/rejoin/i.test(result.message);
        if(!identityDialog.open)notice(message);
      }
    }
  }
  if(session.status==='disconnected'&&(pendingLuxury||luxuryUi.isOpen())){
    if(pendingLuxury?.source==='workshop')$('shop-feedback').textContent='Disconnected. Rejoin to collect your vehicle.';
    pendingLuxury=null;lastLuxuryKey='';updateLuxury();luxuryUi.close();
  }
  let feedbackCar:Entity|undefined,flightChanged=false,feedbackFerry=session.world.ferry;
  if(!marsUi.isViewing()){
    const renderWorld=session.renderWorld(),renderPlayer=renderWorld.players.find(p=>p.id===session.id);
    feedbackCar=renderWorld.entities.find(e=>e.id===renderPlayer?.entityId);
    feedbackFerry=renderWorld.ferry;
    for(const event of soundEvents){
      if(event.cue==='jump'||event.cue==='land'){flightChanged=true;if(car)updateFlightLabel(car);}
      if(event.cue==='land')scene.landed(event.strength??1);
    }
    scene.render(renderWorld,session.id,dt,menu,session.localPresentationActive,session.takePresentationSnap(),session.takeCameraSnap(),session.remotePresentationActive,{animation:starship.animation(performance.now(),false),total:starship.total()});
  }
  if(driveFeedback.update(feedbackCar,input,soundEvents,dt,driving&&!marsUi.isViewing(),feedbackFerry))audio.play('boost');
  const observedPlayer=session.world.players.find(p=>p.id===session.id),observedCar=session.world.entities.find(e=>e.id===observedPlayer?.entityId);
  if(navigationDriving&&observedCar?.navigation?.status==='arrived')notice(observedCar.navigation.chargerStationId?'Arrived at the charging bay. Refilling air.':'Arrived near your destination.');
  if(navigationDriving&&observedCar?.navigation?.status==='failed')notice('Self-driving could not get past an obstacle. Take over or use Unstuck (K) and try again.');
  navigationDriving=observedCar?.navigation?.status==='driving'&&observedCar.autopilot;
  if(observedCar)updateDriveModes(observedCar);
  if(mapDialog.isOpen()&&observedPlayer&&observedCar)mapDialog.update(observedCar,observedCar.navigation?.destination,observedPlayer.delivery.level);
  if(mapDialog.isOpen()&&performance.now()-lastCabMapUpdate>=250){
    const id=mapDialog.trackedCabId();if(id){const cab=cabEntity(id);mapDialog.updateCab(id,cab?{x:cab.x,z:cab.z}:null);}
    lastCabMapUpdate=performance.now();
  }
  if(cabUi.isOpen()||pendingCabBuy||pendingCabPaint)updateCabs();
  $('return-bay').hidden=!propertyRoomAssetId(session.room);
  const propertyName=$('property-name'),property=session.world.property;
  propertyName.hidden=!property;
  if(property){const label=`${property.ownerName} · HOME`;if(propertyName.textContent!==label)propertyName.textContent=label;}
  updateMarket();
  if(menuRidePending){
    const result=session.vehicleResult;
    if(result?.kind===menuRidePending.kind||session.status!=='online'||performance.now()>menuRidePending.expires){
      const confirmed=result?.kind===menuRidePending.kind&&result.ok;
      const message=confirmed?'Ride changed. Upgrades do not transfer between vehicles.':result?'Ride could not be changed. Stop off the ferry and try again where there is room to spawn.':'Could not confirm the ride change. Please try again.';
      const close=confirmed&&menuRidePending.closeOnSuccess;
      menuRidePending=null;session.vehicleResult=null;startingSelect.disabled=false;$<HTMLButtonElement>('apply-ride').disabled=false;
      if(confirmed)startingRideChanged=false;
      if(close&&menu){toggleMenu(false);notice(message);}else if(menu)$('form-note').textContent=message;else notice(message);
    }
  }
  if(pendingDestination){
    const result=session.destinationResult;
    if(result?.requestId===pendingDestination.requestId){notice(result.ok?(pendingDestination.success??'Self-driving to your destination. Use the controls to take over.'):(pendingDestination.failure??'No route found. Choose an unlocked nearby road and try again.'));pendingDestination=null;}
    else if(performance.now()>pendingDestination.expires){notice('Could not confirm the route. Please try again.');pendingDestination=null;}
  }
  if(started&&!menu&&!document.hidden&&session.status==='online'&&observedPlayer){
    const now=Date.now(),active=observedPlayer.delivery.activeSeconds;
    if(active>lastActiveSeconds)lastActiveAt=now;
    if(!playRecorded||(active>lastActiveSeconds&&now-lastPlayWrite>=10000))recordPlay(now);
    lastActiveSeconds=active;
  }
  if(observedCar)controls.observeFlight(hasRockets(observedCar)&&!ferrySecured(session.world.ferry,observedCar)&&observedCar.loopAngle===null&&observedCar.supportId===null,observedCar.lastJump,observedCar.speed);
  if(flightChanged)updateDriveControl();
  document.body.classList.toggle('cockpit-active',cockpit);
  $('cockpit-trim').hidden=!cockpit;$('cockpit-dashboard').hidden=!cockpit||!!car?.inDome;
  const marker=scene.objectiveScreen(),sign=$('objective-sign');sign.hidden=!cockpit||!!car?.inDome||!marker.visible;
  if(!sign.hidden){sign.style.left=`${Math.max(12,Math.min(88,marker.x*100))}%`;sign.style.top=`${Math.max(22,Math.min(75,marker.y*100))}%`;}
  hudTime+=dt;if(hudTime<.1)return;hudTime=0;controlSettings.refreshStatus();
  // A room switch clears the presentation world until an authoritative
  // snapshot arrives; do not leave the old room's instruments on screen.
  $('hud').classList.toggle('hidden',menu||session.status!=='online'||session.walletBlocked);
  $('connection').textContent=!started?'○ CHOOSE A ROOM':session.status==='online'&&session.walletStatus==='failed'?'○ WALLET NOT CONNECTED':session.status==='online'&&session.walletBlocked?'◌ CONNECTING WALLET…':session.status==='online'?`● ${session.playtest?`${session.sandbox?'SANDBOX':'PRACTICE'} · UNSAVED`:`LIVE / ${roomLabel(session.room).toUpperCase()} / ${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`}`:session.status==='connecting'?'◌ JOINING ROOM…':'○ DISCONNECTED';
  $('connection').title=session.status==='online'?`${session.playtest?'Progress is not saved. ':''}Room: ${session.room}`:'';
  const joiningWallet=session.status==='online'&&(session.walletStatus==='connecting'||session.walletStatus==='syncing');
  $('joining-copy').textContent=joiningWallet?'Connecting your wallet…':session.findingRoom?'Finding an open Bay…':'Joining your room…';
  $('joining').classList.toggle('hidden',!started||menu||!(session.status==='connecting'||joiningWallet));
  if(started&&!menu&&(session.status==='disconnected'||session.walletStatus==='failed')){
    if(shopDialog.open)shopDialog.close();controls.clear();controls.enabled=false;$('error').classList.remove('hidden');
    $('error-title').textContent=session.walletStatus==='failed'?'Could not connect your saved driver.':session.roomFull?(selectedEntry.automatic?'The Bay is busy.':'This room is full.'):'Let’s get you back on the road.';
    $('retry').textContent=selectedEntry.automatic?'Try finding a Bay again':'Try this room again';
    $('error-copy').textContent=session.walletStatus==='failed'?`${session.walletError} Retry, or choose a guest driver in room settings.`:session.error;
    if(identityDialog.open&&session.walletStatus==='failed'){
      identityFeedback(session.walletError);$<HTMLButtonElement>('identity-rejoin').hidden=false;
    }
  }
  const player=session.world.players.find(p=>p.id===session.id),e=session.world.entities.find(e=>e.id===player?.entityId);
  marsUi.update(e);
  if(session.playtest)earningsBadge.element.hidden=true;else earningsBadge.update(session.earningsBonus);
  $('mars-quick').hidden=!!session.playtest||!e||Math.hypot(e.x-FREMONT_SPACEPORT.entrance.x,e.z-FREMONT_SPACEPORT.entrance.z)>=65;
  if(session.walletBlocked)return;
  minigames.update();
  if(!e)return;
  cameraLabel(e.kind==='person');
  $('mission-panel').classList.toggle('hidden',e.inDome);$('dome-score').classList.toggle('hidden',!e.inDome);
  if(e.inDome){
    const soccer=session.world.soccer;
    const blue=`BLUE ${soccer.blueScore}`,orange=`${soccer.orangeScore} ORANGE`;
    const goalCount=(participant:typeof soccer.participants[number])=>participant.goals.roadster+participant.goals.retrofit+participant.goals.stock;
    const ownParticipant=soccer.participants.find(participant=>participant.playerId===session.id);
    const ownGoals=ownParticipant?goalCount(ownParticipant):0;
    const present=new Set(session.world.entities.filter(entity=>entity.inDome&&entity.driver).map(entity=>entity.driver));
    const eligible=soccer.participants.filter(participant=>present.has(participant.playerId));
    const topGoals=Math.max(0,...eligible.map(goalCount));
    const leaders=topGoals?eligible.filter(participant=>goalCount(participant)===topGoals):[];
    const driverName=(id:string)=>id===session.id?'You':session.world.players.find(player=>player.id===id)?.name??'Departed driver';
    const leader=leaders.length?`${driverName(leaders[0].playerId)}${leaders.length>1?` +${leaders.length-1}`:''} (${topGoals})`:'No leader yet';
    const standings=soccer.phase==='win'?`Your goals: ${ownGoals}`:`Your goals: ${ownGoals} · ${leaders.length?`Leader: ${leader}`:leader}`;
    const winner=soccer.winningPlayers;
    const status=soccer.phase==='win'?(winner.length===0?'Match complete · no credited winner':winner.includes(session.id)?`${winner.length>1?'You share':'You take'} the win! New match soon.`:`${driverName(winner[0])}${winner.length>1?` +${winner.length-1} share the win`:' wins'}! New match soon.`):soccer.phase==='goal'?`${soccer.lastScorer?.toUpperCase()} goal! Last touch gets credit.`:'Either goal counts · first color to 5 ends match';
    if($('dome-blue').textContent!==blue)$('dome-blue').textContent=blue;
    if($('dome-orange').textContent!==orange)$('dome-orange').textContent=orange;
    if($('dome-status').textContent!==status)$('dome-status').textContent=status;
    if($('dome-standings').textContent!==standings)$('dome-standings').textContent=standings;
    const unlocked=player?.achievements.unlocked??[];
    const remaining=Math.ceil(pulseShotRemaining(soccer,session.id,session.world.time));
    const pulse=unlocked.includes('dome-debut')?(remaining?`Pulse Shot ${remaining}s`:'Pulse Shot ready · stronger hit'):'Touch + finish to unlock Pulse Shot';
    const charge=unlocked.includes('dome-champion')?'Goal: +25 rocket air':'Win to unlock Champion Charge';
    const powerups=`${pulse} · ${charge}`;
    if($('dome-powerups').textContent!==powerups)$('dome-powerups').textContent=powerups;
  }
  const minute=Math.floor(dayMinute(session.world.time));$('day-clock').textContent=`${Math.floor(minute/60).toString().padStart(2,'0')}:${(minute%60).toString().padStart(2,'0')}`;
  $('speed').textContent=Math.round(Math.abs(e.speed)*3.6).toString().padStart(3,'0');$('altitude').textContent=`${Math.round(e.y)} M ALT`;
  $('cockpit-speed').textContent=String(Math.round(Math.abs(e.speed)*3.6));
  const spec=e.kind==='person'?null:VEHICLES[e.kind];
  $('vehicle').textContent=spec?.name.toUpperCase()??'ON FOOT';
  const rocket=hasRockets(e);
  if(lastRocketEntity===e.id&&!lastRocketInstalled&&rocket)notice('Rocket kit installed! Jump, hover, boost and flip are ready.');
  lastRocketEntity=e.id;lastRocketInstalled=rocket;
  $('handling').textContent=spec?`${Math.round(spec.massKg).toLocaleString()} kg · ${spec.fourWheelSteering?'4-wheel steer':'Front steer'}${rocket?' · ROCKET':''}${e.autopilot?' · AUTONOMOUS':''}`:'';
  $('autopilot').textContent=`${controlSettings.label('autopilot')} · AV ${e.autopilot?'on':'off'}`;$('autopilot').setAttribute('aria-pressed',String(e.autopilot));$<HTMLButtonElement>('autopilot').disabled=e.kind==='person';
  const secured=ferrySecured(session.world.ferry,e);
  const airborne=e.loopAngle===null&&e.supportId===null;
  for(const control of ['KeyQ','KeyR','KeyX','ShiftLeft','KeyE']){
    const button=document.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);if(button)button.disabled=!rocket||secured;
  }
  updateFlightLabel(e);
  $('jump-control').textContent='JUMP / HOVER';updateDriveControl();
  document.querySelector('[data-control="KeyA"]')?.setAttribute('aria-label',airborne?'Bank left':'Steer left');document.querySelector('[data-control="KeyD"]')?.setAttribute('aria-label',airborne?'Bank right':'Steer right');
  $('air-label').textContent=`AIR LV ${e.tankLevel}`;$('air').classList.toggle('air-low',rocket&&e.air<12);$('air').textContent=`${Math.round(e.air)}%`;$('air-bar').style.width=`${e.air}%`;$('health').textContent=`${Math.round(e.health)}%`;$('health-bar').style.width=`${e.health}%`;
  $('interact').textContent=`${controlSettings.label('interact')} · ${e.kind==='person'?'Take nearby car':'Exit car'}`;
  const nearest=STATIONS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const distance=Math.hypot(e.x-nearest.x,e.z-nearest.z),refilling=refillStationFor(e);
  const skyCurrent=currentAt(e);
  const skyGate=!!(skyCurrent?.kind==='jet'&&player&&currentBlockedByProgression(skyCurrent,e,player.delivery.level));
  const skyId=skyCurrent?.id??'';
  if(skyId&&skyId!==lastSkyCurrent&&!menu)notice(skyCurrent!.kind==='thermal'?'THERMAL · Lift + air refilling':skyGate?'SKY LANE · Air refilling · Locked area ahead':'SKY LANE · Speed + air refilling');
  lastSkyCurrent=skyId;
  const wallCharge=chargingDomeWall(e,rocket);
  $('station-status').textContent=e.inDome?(wallCharge?'ϟ WALL CHARGE · AIR REFILLING':rocket?'ϟ DRIVE UP THE GOLD WALLS TO REFILL':'ϟ ADD A ROCKET TO RIDE THE WALLS'):skyCurrent?`${skyCurrent.kind==='thermal'?'↑ THERMAL · LIFT + REFILLING AIR':skyGate?'➜ SKY LANE · REFILLING AIR · LOCKED AREA AHEAD':'➜ SKY LANE · SPEED + REFILLING AIR'} · ${skyCurrent.name}`:refilling?`ϟ FICTIONAL AIR REFILL · ${refilling.name} · ${refilling.venue}`:rocket&&e.air<12?`LOW AIR · ${nearest.name} refill · ${Math.round(distance)} m`:distance<24?`ϟ ${nearest.name} · ${nearest.venue}`:`ϟ AIR REFILL (GAME) · ${nearest.name} · ${Math.round(distance)} m`;
  $('station-status').title=`${nearest.venue} · ${nearest.address??'Fictional game location'}`;
  $('station-status').classList.toggle('refilling',!!refilling||!!skyCurrent||wallCharge);
  $('station-status').classList.toggle('air-warning',!e.inDome&&!skyCurrent&&!refilling&&rocket&&e.air<12);
  $('station-status').classList.toggle('sky-active',!!skyCurrent);
  $('station-status').classList.toggle('dome-active',e.inDome);
  const nearbyShop=SHOPS.reduce((a,b)=>Math.hypot(e.x-a.x,e.z-a.z)<Math.hypot(e.x-b.x,e.z-b.z)?a:b);
  const shopDistance=Math.hypot(e.x-nearbyShop.x,e.z-nearbyShop.z),shopReady=!!shopFor(e);
  const vaultDistance=Math.hypot(e.x-LUXURY_SHOWROOM.arrival.x,e.z-LUXURY_SHOWROOM.arrival.z),nearVault=vaultDistance<30;
  const prompt=$<HTMLButtonElement>('shop-prompt');
  prompt.hidden=menu||!started||shopDialog.open||luxuryUi.isOpen()||(!nearVault&&(e.kind==='person'||shopDistance>30));
  prompt.style.borderColor=nearVault?'#f4ca78':'';prompt.style.background=nearVault?'#3d3323ee':'';prompt.style.color=nearVault?'#fff1d0':'';
  prompt.textContent=nearVault?(atLuxuryShowroom(e)?`✦ ${controlSettings.label('shop')} · Enter the Vault`:vaultDistance<LUXURY_SHOWROOM.radius?'✦ Stop to enter the Vault':'✦ Gold forecourt · the Vault'):shopReady?`✦ ${controlSettings.label('shop')} · Enter shop · ${nearbyShop.name}`:shopDistance<SHOP_RADIUS?'✦ Stop to enter the shop':'✦ Purple ring · upgrade shop';
  if(luxuryUi.isOpen()||pendingLuxury)updateLuxury();
  if(shopDialog.open)updateShop();
  if(player){
    const d=player.delivery,order=d.order,target=orderTarget(order),distance=Math.round(Math.hypot(e.x-target.x,e.z-target.z));
    const searching=!!order.search,unavailable=d.lastReroute?.reason==='unavailable'&&!isOrderAccessible(order,d.level,e.kind==='person'||canAssignDeliveryRoof(e));
    const routeButton=$<HTMLButtonElement>('route-goal'),routeAdvice=$('route-advice');
    const advice=searching?'Finding a safe delivery route.':unavailable?'Return to an open road to retry.':session.status!=='online'||session.walletBlocked?'Connect your driver to self-drive.':e.kind==='person'?'Get in a car to self-drive.':target.rooftop?'Rooftop delivery · fly manually.':e.supportId!=='ground'||e.inDome?'Land on the ground outside the Dome to self-drive.':requiredLevelAt(target.x,target.z)>d.level?'This delivery is in a locked area.':'';
    const routeLabel=`↗ Self-drive to ${order.stage==='pickup'?'pickup':'dropoff'}`;
    routeButton.hidden=!!advice;routeAdvice.hidden=!advice;
    if(routeButton.textContent!==routeLabel)routeButton.textContent=routeLabel;
    if(routeAdvice.textContent!==advice)routeAdvice.textContent=advice;
    const awardButton=$<HTMLButtonElement>('next-award');
    const owner=confirmedGoalOwner({currentCode,boundCode:walletBoundCode,chatCode:chat.code,chatPlayerId:chat.playerId,pendingRecovery,roomOnline:session.status==='online',walletReady:session.walletStatus==='ready'});
    const wallet=owner&&session.walletStatus==='ready'?session.wallet:null;
    if(owner!==goalOwner||session.connectionGeneration!==goalGeneration){goalOwner=owner;goalGeneration=session.connectionGeneration;goalWallet=null;goalTier=null;}
    if(wallet!==goalWallet){goalWallet=wallet;goalTier=wallet?nextReachableTier(selectAchievementTiers(wallet.achievementTiers),goalTier):null;}
    const guestAward=session.walletStatus==='guest'?nextDeliveryAward(player.achievements.unlocked):null;
    nextAwardTarget=goalTier?.id??guestAward??undefined;
    const awardLabel=goalTier?tierGoalLabel(goalTier):guestAward?`★ Next award · ${ACHIEVEMENTS[guestAward].description.split(' Reward:')[0]}`:'';
    awardButton.hidden=!nextAwardTarget;if(awardButton.textContent!==awardLabel)awardButton.textContent=awardLabel;
    awardButton.title=guestAward?ACHIEVEMENTS[guestAward].description:'View this award';
    $('mission-label').textContent=searching?'FINDING DELIVERY':unavailable?'DELIVERY UNAVAILABLE':order.stage==='pickup'?'PICK UP / FOOD RUN':target.rooftop?'DELIVER / ROOFTOP':'DELIVER / FOOD RUN';
    const guidance=searching||unavailable?null:roadGuidance().update(e,target,d.level,performance.now());
    const waypoint=guidance?.waypoint;
    const bearing=waypoint?Math.atan2(-(waypoint.x-e.x),-(waypoint.z-e.z))-e.yaw:0;
    const octant=(Math.round(Math.atan2(Math.sin(bearing),Math.cos(bearing))/(Math.PI/4))+8)%8;
    $('mission').textContent=searching?'Finding a safe route…':unavailable?'Return to an open road to retry.':
      !waypoint?`${guidance?.status==='unavailable'?'No road route':'Finding road route'} · ${target.name} · ${distance} m`:
      `${['↑','↖','←','↙','↓','↘','→','↗'][octant]} ${target.name} · ${distance} m · ${guidance?.status==='flight'?'fly direct':guidance?.status==='overpass'?'exit overpass':'via road'}`;
    const protectedArea=islandProtected(e),paused=protectedArea||session.world.time>d.activeUntil;
    const pickupBonus=pickupBonusFor(order);
    $('hint').textContent=searching?'Your delivery clock is paused while we find your next route.':unavailable?'Your current delivery is paused until a safe route is available.':(protectedArea?'DELIVERY PAUSED · ':'')+(order.stage==='pickup'?`${clock(order.elapsed)} / ${clock(order.pickupEstimate)} pickup${paused&&!protectedArea?' · paused':''} · ${pickupBonus>0?`pickup bonus +${money(pickupBonus)} · up to ${PICKUP_STOP_ALLOWANCE}s past estimate`:'pickup bonus expired'}`:`${clock(order.elapsed)} / ${clock(order.estimate)} estimate${paused&&!protectedArea?' · paused':''} · ${money(payoutFor(order))} if delivered now${target.rooftop?` · land on roof ${Math.round(target.y)}m up`:''}`);
    $('cockpit-phase').textContent=searching?'FINDING DELIVERY':unavailable?'DELIVERY UNAVAILABLE':order.stage==='pickup'?'PICK UP':target.rooftop?'ROOFTOP DELIVERY':'DELIVER';
    $('cockpit-target').textContent=$('mission').textContent;$('cockpit-estimate').textContent=$('hint').textContent;
    $('objective-phase').textContent=$('cockpit-phase').textContent;$('objective-name').textContent=searching?'Finding a safe route':unavailable?'Delivery unavailable':target.name;$('objective-distance').textContent=searching||unavailable?'':`${distance} m`;
    $('delivery-drive').hidden=searching||unavailable;
    for(const reward of session.takeRewards())celebrateReward(reward);
    $('delivery-stats').textContent=`${(session.sandbox?'∞':money(d.cash))} cash · ${clock(d.activeSeconds)} active${d.lastPayout!==null?` · last delivery +${money(d.lastPayout)}`:''}`;
    const next=d.level<6?LEVELS[d.level+1]:undefined;
    const checkpointProgress=`${DELIVERY_CHECKPOINT_INTERVAL-deliveriesUntilCheckpoint(d.completed)}/${DELIVERY_CHECKPOINT_INTERVAL}`;
    const checkpointPaid=d.lastPayout!==null&&d.completed%DELIVERY_CHECKPOINT_INTERVAL===0;
    $('region-progress').textContent=session.sandbox?'SANDBOX · All areas and vehicle upgrades unlocked':(next?`LEVEL ${d.level} · ${next.name}: ${money(Math.min(d.cash,next.cash))} / ${money(next.cash)} cash`:`LEVEL ${d.level} · The Bay is open`)+(checkpointPaid?` · bonus +${money(DELIVERY_CHECKPOINT_REWARD)} · next ${checkpointProgress}`:` · bonus ${checkpointProgress} (+${money(DELIVERY_CHECKPOINT_REWARD)})`);
    const levelEvent=levelEvents.update(d,session.snapshotVersion);
    if(levelEvent==='up')notice(`${LEVELS[d.level].name} unlocked!`);
    if(levelEvent==='down')notice(`Level ${d.level} · Your purchases stay yours.`);
    if(d.lastReroute&&d.lastReroute.id>lastRerouteId){lastRerouteId=d.lastReroute.id;notice(d.lastReroute.reason==='searching'?'Finding a safe delivery route…':d.lastReroute.reason==='ready'?'Your next delivery is ready.':d.lastReroute.reason==='repeat'?'No new nearby route was available, so your last pickup is offered again.':d.lastReroute.reason==='ferry'?'Your delivery moved to an open area. Take the ferry to the mainland.':d.lastReroute.reason==='unavailable'?'No safe delivery route found. Return to an open road to retry.':'Your delivery was rerouted to an open area.');}
    if(d.lastBlocked&&d.lastBlocked.at>lastBlockedAt){lastBlockedAt=d.lastBlocked.at;if(session.world.time-lastBlockedNoticeAt>=5){lastBlockedNoticeAt=session.world.time;const goal=LEVELS[d.lastBlocked.level];notice(`${goal.name} opens at ${money(goal.cash)} cash.`);}}
    const chased=session.world.entities.some(c=>c.police?.targetId===player.id);
    $('police-status').textContent=chased?'⚠ POLICE PURSUIT · PULL OVER OR ESCAPE':protectedArea?'North Bay Playground and the ferry are police-free.':d.lastTicket!==null?`Last citation −${money(d.lastTicket.amount)} · repeat fines rise`:'Fly near police or exceed 125 km/h on a highway to start a chase.';
    $('police-status').classList.toggle('chased',chased);
    const newAwards=achievementEvents.update(player.achievements);
    if(!session.sandbox)achievementQueue.push(...newAwards);
    if(newAwards.length&&!achievementTimer)announceAchievements();
    if(d.lastTicket&&d.tickets>lastTicketCount&&!menu&&session.status!=='disconnected'&&!ticketDialog.open){lastTicketCount=d.tickets;showTicket(d.lastTicket);}
  }
  $('air').textContent=rocket?`${Math.round(e.air)}%`:'—';$('air-bar').style.width=rocket?`${e.air}%`:'0%';
  updateActivities(e);
  $('players').textContent=`${session.world.players.length} DRIVER${session.world.players.length===1?'':'S'}`;if(mobileHud.expanded('map'))minimap(e,player?.delivery.level??0);
});

// A malformed invite must not silently place friends in a different room.
if(!initialEntry){
  $('form-note').textContent='Invalid room link. Check the invite, or enter a room code to join.';
}else begin(false);
