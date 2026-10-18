import './map-dialog.css';
import { BRIDGES, DISTRICTS, HIGHWAYS, LANDMARKS, MAP_BOUNDS, PARKS, REGIONS, ROADS, TESLAND_MONUMENTS, type MapPoint } from '../shared/map';
import { requiredLevelAt, type Level } from '../shared/delivery';
import { ISLAND_JUMPS } from '../shared/island-jumps';

/** The dialog chooses a game-space point; routing and availability are decided by the session. */
export function createMapDialog({ onDestination }: { onDestination: (point: MapPoint) => string | void }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'map-lightbox';
  dialog.setAttribute('aria-labelledby', 'map-lightbox-title');
  dialog.innerHTML = `
    <header class="map-lightbox-header"><div><span>EXPLORE THE BAY</span><h2 id="map-lightbox-title">Where to?</h2></div><button type="button" class="map-close" aria-label="Close map">✕</button></header>
    <p class="map-lightbox-help" id="map-lightbox-help">Tap a place to drop a pin. Drag to move, pinch or use + / − to zoom. The car heads for a nearby supported road; locked or disconnected areas may be unavailable.</p>
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
      c.closePath(); c.fillStyle = region.id === 'marin' || region.id === 'yerba' ? '#829a81' : '#c4c1ab'; c.fill();
    }
    c.fillStyle = '#9eaf91';
    for (const park of PARKS) { const p = screen(park); c.fillRect(p.x - park.w * scale / 2, p.y - park.d * scale / 2, park.w * scale, park.d * scale); }
    c.fillStyle = '#7d8983';
    for (const road of ROADS) {
      if (road.kind === 'highway') continue;
      const p = screen(road), w = Math.max(.6, road.w * scale), h = Math.max(.6, road.d * scale), radius = Math.hypot(w, h) / 2;
      if (p.x + radius < 0 || p.x - radius > width || p.y + radius < 0 || p.y - radius > height) continue;
      c.save(); c.translate(p.x, p.y); c.rotate(-(road.angle ?? 0)); c.fillRect(-w / 2, -h / 2, w, h); c.restore();
    }
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#ead5ac'; c.lineWidth = Math.max(2, 32 * scale);
    for (const highway of HIGHWAYS) { c.beginPath(); highway.points.forEach((point, i) => { const p = screen(point); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.stroke(); }
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
    // Match the minimap's unlocked-world masking without moving the shared geometry.
    c.fillStyle = '#193b48e8';
    for (let y = 0; y < height; y += 10) for (let x = 0; x < width; x += 10) if (!visible(world(x + 5, y + 5))) c.fillRect(x, y, 10, 10);
    c.font = '700 11px system-ui'; c.textBaseline = 'middle';
    const labels = [{ name: 'SAN FRANCISCO', x: -180, z: 0 }, { name: 'OAKLAND', x: 450, z: -80 }, { name: 'ROCKET ISLAND', x: 150, z: -1750 }, ...DISTRICTS.map(d => ({ name: d.name.toUpperCase(), x: d.x, z: d.z }))];
    for (const label of labels) {
      if (!visible(label)) continue;
      const p = screen(label); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#173a40'; c.fillText(label.name, p.x + 7, p.y - 7);
    }
    if (scale > .13) for (const place of LANDMARKS) {
      if (!visible(place.arrival)) continue;
      const p = screen(place.arrival); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#fff1c4'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#173a40'; c.font = '600 10px system-ui'; c.fillText(place.name, p.x + 6, p.y + 5);
    }
    if (scale > .13) for (const place of TESLAND_MONUMENTS) {
      if (!visible(place)) continue;
      const p = screen(place); if (p.x < -120 || p.x > width || p.y < -10 || p.y > height + 10) continue;
      c.fillStyle = '#ffd080'; c.beginPath(); c.arc(p.x, p.y, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#173a40'; c.font = '600 10px system-ui'; c.fillText(place.name, p.x + 6, p.y + 5);
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
