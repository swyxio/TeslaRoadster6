import './map-dialog.css';
import { BRIDGES, DISTRICTS, FREMONT_SPACEPORT, HIGHWAYS, LANDMARKS, MAP_BOUNDS, PARKS, REGIONS, ROADS, TESLAND_MONUMENTS, type MapPoint } from '../shared/map';
import { TECH_CAMPUSES } from '../shared/tech-campuses';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { requiredLevelAt, type Level } from '../shared/delivery';
import { ISLAND_JUMPS } from '../shared/island-jumps';

/** The dialog chooses a game-space point; routing and availability are decided by the session. */
export function createMapDialog({ onDestination }: { onDestination: (point: MapPoint) => string | void }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'map-lightbox';
  dialog.setAttribute('aria-labelledby', 'map-lightbox-title');
  dialog.innerHTML = `
    <header class="map-lightbox-header"><div><span>EXPLORE THE BAY</span><h2 id="map-lightbox-title">Where to?</h2></div><button type="button" class="map-close" aria-label="Close map">✕</button></header>
    <p class="map-lightbox-help" id="map-lightbox-help">Tap a place to drop a pin. Drag to move, pinch or use + / − to zoom. Shaded areas unlock as you play. The car stops at a connected road up to 100 m from your pin.</p>
    <div class="map-lightbox-view"><canvas class="map-lightbox-canvas" tabindex="0" role="application" aria-label="Bay map. Use arrow keys to move the destination pin; press Enter to drive there." aria-describedby="map-lightbox-help">Interactive map of the Bay.</canvas>
      <div class="map-lightbox-zoom" aria-label="Map controls"><button type="button" data-map-zoom="in" aria-label="Zoom in">+</button><button type="button" data-map-zoom="out" aria-label="Zoom out">−</button><button type="button" data-map-center aria-label="Center on your car">◎</button></div>
      <div class="map-lightbox-legend"><span><i></i> YOU</span><span><i></i> DESTINATION</span><span><i></i> LOCKED</span></div>
    </div>
    <footer class="map-lightbox-footer"><p class="map-lightbox-status" role="status" aria-live="polite">Choose a destination on the map.</p><button type="button" class="map-drive" disabled>Drive here →</button></footer>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d')!;
  const drive = dialog.querySelector<HTMLButtonElement>('.map-drive')!;
  const status = dialog.querySelector<HTMLElement>('.map-lightbox-status')!;
  let player: MapPoint = { x: 0, z: 0 }, selected: MapPoint | null = null, currentDestination: MapPoint | null = null;
  let level: Level = 0, center: MapPoint = { x: 0, z: 0 }, scale = .6, width = 0, height = 0, dpr = 1, dirty = true;
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false, pointerStart = { x: 0, y: 0 };

  const copy = (point: MapPoint): MapPoint => ({ x: point.x, z: point.z });
  const screen = (point: MapPoint) => ({ x: width / 2 + (point.x - center.x) * scale, y: height / 2 + (point.z - center.z) * scale });
  const world = (x: number, y: number): MapPoint => ({ x: center.x + (x - width / 2) / scale, z: center.z + (y - height / 2) / scale });
  const visible = (point: MapPoint) => requiredLevelAt(point.x, point.z) <= level;
  const bounds = (point: MapPoint): MapPoint => ({ x: Math.max(MAP_BOUNDS.minX, Math.min(MAP_BOUNDS.maxX, point.x)), z: Math.max(MAP_BOUNDS.minZ, Math.min(MAP_BOUNDS.maxZ, point.z)) });
  const local = (event: PointerEvent | WheelEvent) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!rect.width || !rect.height) return;
    if (width !== rect.width || height !== rect.height || dpr !== nextDpr) {
      width = rect.width; height = rect.height; dpr = nextDpr;
      canvas.width = base.width = Math.round(width * dpr); canvas.height = base.height = Math.round(height * dpr);
      dirty = true;
    }
  }
  function renderBase() {
    const c = baseCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, width, height); c.fillStyle = '#335b67'; c.fillRect(0, 0, width, height);
    for (const region of REGIONS) {
      c.beginPath(); region.points.forEach((point, i) => { const p = screen(point); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      c.closePath(); c.fillStyle = region.id === 'marin' || region.id === 'yerba' || region.id === 'rocket-island' ? '#829a81' : '#c4c1ab'; c.fill();
    }
    c.fillStyle = '#9eaf91';
    for (const park of PARKS) { const p = screen(park); c.fillRect(p.x - park.w * scale / 2, p.y - park.d * scale / 2, park.w * scale, park.d * scale); }
    c.strokeStyle = '#c46c5b'; c.lineWidth = Math.max(1, 4 * scale); c.setLineDash([4, 3]); c.beginPath();
    CALTRAIN_TRACK.forEach((point, i) => { const p = screen(point); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
    c.stroke(); c.setLineDash([]);
    c.fillStyle = '#7d8983';
    for (const road of ROADS) {
      if (road.kind === 'highway') continue;
      const p = screen(road), w = Math.max(.6, road.w * scale), h = Math.max(.6, road.d * scale), radius = Math.hypot(w, h) / 2;
      if (p.x + radius < 0 || p.x - radius > width || p.y + radius < 0 || p.y - radius > height) continue;
      c.save(); c.translate(p.x, p.y); c.rotate(-(road.angle ?? 0)); c.fillRect(-w / 2, -h / 2, w, h); c.restore();
    }
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#ead5ac';
    for (const highway of HIGHWAYS) { c.lineWidth = Math.max(2, (highway.width ?? 32) * scale); c.beginPath(); highway.points.forEach((point, i) => { const p = screen(point); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke(); }
    c.strokeStyle = '#e5d4b1'; c.lineWidth = Math.max(2, 24 * scale);
    for (const bridge of BRIDGES) {
      const a = bridge.axis === 'x' ? screen({ x: bridge.start, z: bridge.center }) : screen({ x: bridge.center, z: bridge.start });
      const b = bridge.axis === 'x' ? screen({ x: bridge.end, z: bridge.center }) : screen({ x: bridge.center, z: bridge.end });
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    // Show the actual launch-ramp footprints on Rocket Island.
    c.fillStyle = '#eac188';
    for (const jump of ISLAND_JUMPS) {
      const p = screen({x:(jump.start+jump.end)/2,z:jump.z});
      c.fillRect(p.x-(jump.end-jump.start)*scale/2,p.y-jump.width*scale/2,(jump.end-jump.start)*scale,jump.width*scale);
    }
    // Keep locked regions subdued while retaining their coastline silhouettes.
    c.fillStyle = '#193b48b8';
    for (let y = 0; y < height; y += 10) for (let x = 0; x < width; x += 10) if (!visible(world(x + 5, y + 5))) c.fillRect(x, y, 10, 10);
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    const playerScreen = screen(player);
    // Label actual shared routes in the part of the map the player can reach.
    if (scale > .06) {
      c.font = '700 10px system-ui'; c.textBaseline = 'middle';
      for (const highway of HIGHWAYS) {
        const textWidth = c.measureText(highway.name).width;
        const labelBox = (point: MapPoint) => {
          const p = screen(point);
          return { left: p.x + 4, top: p.y - 19, right: p.x + 14 + textWidth, bottom: p.y - 3 };
        };
        const candidates: MapPoint[] = [];
        for (let i = 1; i < highway.points.length; i++) {
          const a = highway.points[i - 1], b = highway.points[i];
          candidates.push(a, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        }
        const onScreen = candidates.filter(point => {
          if (!visible(point)) return false;
          const p = screen(point);
          return p.x > 20 && p.x + textWidth + 14 < width - 80 && p.y > 30 && p.y < height - 30;
        });
        onScreen.sort((a, b) => {
          const pa = screen(a), pb = screen(b);
          return Math.hypot(pa.x - width / 2, pa.y - height / 2) - Math.hypot(pb.x - width / 2, pb.y - height / 2);
        });
        const point = onScreen.find(candidate => {
          const box = labelBox(candidate);
          const clearPlayer = playerScreen.x < box.left - 8 || playerScreen.x > box.right + 8 || playerScreen.y < box.top - 8 || playerScreen.y > box.bottom + 8;
          return clearPlayer && placed.every(other => box.right + 6 < other.left || box.left - 6 > other.right || box.bottom + 6 < other.top || box.top - 6 > other.bottom);
        });
        if (!point) continue;
        const p = screen(point);
        c.fillStyle = '#1d3b3ae8'; c.fillRect(p.x + 4, p.y - 19, textWidth + 10, 16);
        c.fillStyle = '#fff5d9'; c.fillText(highway.name, p.x + 9, p.y - 11);
        placed.push(labelBox(point));
      }
    }
    // Prefer the first clear position near each marker, then omit crowded text
    // until the player zooms in. Markers themselves always remain visible.
    const drawLabel = (p: {x:number;y:number}, text:string, font:string, firstY:number) => {
      c.font = font; c.textBaseline = 'middle';
      const textWidth = c.measureText(text).width;
      for (const [dx,dy] of [[6,firstY],[6,-16],[6,25],[-textWidth-6,12],[-textWidth-6,-16]]) {
        const box={left:p.x+dx,top:p.y+dy-7,right:p.x+dx+textWidth,bottom:p.y+dy+7};
        if(box.left<2||box.right>width-2||box.top<2||box.bottom>height-2)continue;
        if(playerScreen.x>=box.left-7&&playerScreen.x<=box.right+7&&playerScreen.y>=box.top-7&&playerScreen.y<=box.bottom+7)continue;
        if(placed.some(other=>box.right+3>=other.left&&box.left-3<=other.right&&box.bottom+3>=other.top&&box.top-3<=other.bottom))continue;
        c.strokeStyle='#eee9d1';c.lineWidth=3;c.lineJoin='round';c.strokeText(text,box.left,p.y+dy);
        c.fillStyle='#173a40';c.fillText(text,box.left,p.y+dy);placed.push(box);return;
      }
    };
    c.font = '700 11px system-ui'; c.textBaseline = 'middle';
    const labels = [{ name: 'SAN FRANCISCO', x: -180, z: 0 }, { name: 'MARIN HEADLANDS', x: -310, z: -475 }, { name: 'OAKLAND', x: 450, z: -80 }, { name: 'NORTH BAY PLAYGROUND', x: 150, z: -1750 }, ...DISTRICTS.map(d => ({ name: d.name.toUpperCase(), x: d.x, z: d.z }))];
    for (const label of labels) {
      if (!visible(label)) continue;
      const p = screen(label); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      drawLabel(p,label.name,'700 11px system-ui',-7);
    }
    if (scale > .24) for (const place of LANDMARKS) {
      if (!visible(place.arrival)) continue;
      const p = screen(place.arrival); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#fff1c4'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
      drawLabel(p,place.name,'600 10px system-ui',12);
    }
    if (scale > .16) for (const campus of TECH_CAMPUSES) {
      if (!visible(campus)) continue;
      const p = screen(campus); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#b9a7dc'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
      drawLabel(p,campus.name,'600 10px system-ui',12);
    }
    for (const stop of CALTRAIN_STOPS) {
      if (!visible(stop)) continue;
      const p = screen(stop); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#cf6a57'; c.fillRect(p.x - 3, p.y - 3, 6, 6);
      if (scale > .12) drawLabel(p,`Caltrain · ${stop.name}`,'600 10px system-ui',12);
    }
    if (scale > .24) for (const place of TESLAND_MONUMENTS) {
      if (!visible(place)) continue;
      const p = screen(place); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#ffd080'; c.beginPath(); c.arc(p.x, p.y, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#173a40'; c.font = '600 10px system-ui'; c.fillText(place.name, p.x + 6, p.y + 5);
    }
    if(visible(FREMONT_SPACEPORT.entrance)){
      const p=screen(FREMONT_SPACEPORT.entrance);c.fillStyle='#ffad70';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();
      if(scale>.13){c.fillStyle='#173a40';c.font='700 10px system-ui';c.fillText('FREMONT MARS SPACEPORT',p.x+7,p.y+5);}
    }
    dirty = false;
  }
  function marker(point: MapPoint, color: string, size: number) {
    const p = screen(point); ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff7e5'; ctx.stroke();
  }
  function draw() {
    if (!dialog.open) return;
    resize(); if (!width || !height) return;
    if (dirty) renderBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    marker(player, '#f3a75d', 6);
    if (currentDestination && !selected) marker(currentDestination, '#e37472', 6);
    if (selected) {
      const p = screen(selected); ctx.fillStyle = '#f46d69'; ctx.strokeStyle = '#fff7e5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y - 5, 7, Math.PI, 0); ctx.lineTo(p.x, p.y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  function choose(point: MapPoint) {
    selected = copy(point); drive.disabled = false;
    status.textContent = `Pin placed · X ${Math.round(point.x)}, Z ${Math.round(point.z)} (game meters).`;
    draw();
  }
  function zoom(factor: number, at = { x: width / 2, y: height / 2 }) {
    const before = world(at.x, at.y);
    scale = Math.max(.035, Math.min(3, scale * factor));
    const after = world(at.x, at.y);
    center = bounds({ x: center.x + before.x - after.x, z: center.z + before.z - after.z });
    dirty = true; draw();
  }
  function start() {
    if (!selected) return;
    const error = onDestination(copy(selected));
    if (error) { status.textContent = error; return; }
    dialog.close();
  }
  drive.onclick = start;
  dialog.querySelector<HTMLButtonElement>('.map-close')!.onclick = () => dialog.close();
  function zoomTarget() {
    if (!selected) return undefined;
    const p = screen(selected);
    return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height ? p : undefined;
  }
  dialog.querySelector<HTMLButtonElement>('[data-map-zoom="in"]')!.onclick = () => zoom(1.5, zoomTarget());
  dialog.querySelector<HTMLButtonElement>('[data-map-zoom="out"]')!.onclick = () => zoom(1 / 1.5, zoomTarget());
  dialog.querySelector<HTMLButtonElement>('[data-map-center]')!.onclick = () => { center = copy(player); dirty = true; draw(); };
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.exp(-event.deltaY * .002), local(event)); }, { passive: false });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
    const point = local(event); pointers.set(event.pointerId, point);
    if (pointers.size === 1) { moved = false; pointerStart = point; } else moved = true;
  });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const next = local(event), entries = [...pointers.entries()], other = entries.find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const beforeDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
      const afterDistance = Math.hypot(next.x - other.x, next.y - other.y);
      const beforeMid = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
      const afterMid = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 };
      const anchor = world(beforeMid.x, beforeMid.y);
      if (beforeDistance > 0) scale = Math.max(.035, Math.min(3, scale * afterDistance / beforeDistance));
      center = bounds({ x: anchor.x - (afterMid.x - width / 2) / scale, z: anchor.z - (afterMid.y - height / 2) / scale });
      moved = true;
    } else {
      const dx = next.x - previous.x, dy = next.y - previous.y;
      if (Math.hypot(next.x - pointerStart.x, next.y - pointerStart.y) > 5) moved = true;
      if (moved) center = bounds({ x: center.x - dx / scale, z: center.z - dy / scale });
    }
    pointers.set(event.pointerId, next); dirty = true; draw();
  });
  function endPointer(event: PointerEvent, cancelled: boolean) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!cancelled && !moved && pointers.size === 0) choose(world(local(event).x, local(event).y));
    if (cancelled) moved = true;
  }
  canvas.addEventListener('pointerup', event => endPointer(event, false));
  canvas.addEventListener('pointercancel', event => endPointer(event, true));
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (selected) start(); else choose(player); return; }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.5); return; }
    if (event.key === '-') { event.preventDefault(); zoom(1 / 1.5); return; }
    const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = direction[event.key]; if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    const origin = selected ?? player, step = (event.shiftKey ? 40 : 12) / scale;
    const point = bounds({ x: origin.x + delta[0] * step, z: origin.z + delta[1] * step });
    const p = screen(point);
    if (p.x < 35 || p.x > width - 35 || p.y < 35 || p.y > height - 35) { center = copy(point); dirty = true; }
    choose(point);
  });
  const observer = new ResizeObserver(() => draw()); observer.observe(canvas);
  dialog.addEventListener('close', () => { pointers.clear(); });
  return {
    element: dialog,
    open(position: MapPoint, destination?: MapPoint | null, nextLevel: Level = 0) {
      player = copy(position); center = copy(position); currentDestination = destination ? copy(destination) : null;
      selected = destination ? copy(destination) : null; level = nextLevel; scale = .6; dirty = true;
      drive.disabled = !selected; status.textContent = selected ? 'Destination selected. Choose another place or start driving.' : 'Choose a destination on the map.';
      if (!dialog.open) dialog.showModal(); draw(); canvas.focus();
    },
    update(position: MapPoint, destination?: MapPoint | null, nextLevel: Level = 0) {
      player = copy(position); currentDestination = destination ? copy(destination) : null;
      if (level !== nextLevel) { level = nextLevel; dirty = true; }
      draw();
    },
    close() { if (dialog.open) dialog.close(); },
    isOpen() { return dialog.open; },
  };
}
