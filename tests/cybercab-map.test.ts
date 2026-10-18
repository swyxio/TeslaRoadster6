import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('cab map follows live positions, pauses for map interaction and handles a lost location', async () => {
  let source = await readFile(new URL('../src/map-dialog.ts', import.meta.url), 'utf8');
  source = source.replace("import './map-dialog.css';", '');
  for (const name of ['map', 'tech-campuses', 'caltrain', 'east-south-additions', 'delivery', 'island-jumps', 'luxury', 'new-landmarks']) {
    source = source.replace(`'../shared/${name}'`, JSON.stringify(new URL(`../shared/${name}.ts`, import.meta.url).href));
  }
  const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const { createMapDialog } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

  class Element extends EventTarget {
    className = ''; textContent = ''; hidden = false; disabled = false; open = false;
    width = 0; height = 0; attributes = new Map<string, string>();
    selectors = new Map<string, Element>(); children: Element[] = [];
    onclick: (() => void) | null = null;
    paints: { text: string; x: number; y: number }[] = [];
    context = new Proxy({ measureText: (text: string) => ({ width: text.length * 6 }),
      fillText: (text: string, x: number, y: number) => this.paints.push({ text, x, y }) },
    { get: (target, key) => key in target ? Reflect.get(target, key) : () => {}, set: () => true });
    set innerHTML(_html: string) {
      for (const key of ['canvas', '.map-drive', '.map-lightbox-status', '.map-lightbox-cab', '.map-cab-status', '.map-cab-follow', '.map-cab-legend', '.map-close', '[data-map-zoom="in"]', '[data-map-zoom="out"]', '[data-map-center]']) this.selectors.set(key, new Element());
    }
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    querySelector(key: string) { return this.selectors.get(key); }
    getContext() { return this.context; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 180 }; }
    focus() {} setPointerCapture() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    click() { if (!this.disabled) this.onclick?.(); }
  }
  const previous = Object.fromEntries(['document', 'window', 'ResizeObserver', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let now = 0;
  const body = new Element();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body, createElement: () => new Element() } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} } });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  try {
    const destinations: {x:number;z:number}[] = [];
    const map = createMapDialog({ onDestination: (point: {x:number;z:number}) => { destinations.push(point); } });
    const dialog = body.children[0], canvas = dialog.querySelector('canvas')!, follow = dialog.querySelector('.map-cab-follow')!;
    const cabStatus = dialog.querySelector('.map-cab-status')!, status = dialog.querySelector('.map-lightbox-status')!;
    const fire = (type: string, values: Record<string, unknown>) => canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), values));
    const cabPaint = () => canvas.paints.filter(paint => paint.text === 'C').at(-1)!;

    map.openCab({x:0,z:0}, null, 0, {id:'cab-a',name:'Gold Cab',position:{x:100,z:200}}, true);
    assert.equal(map.trackedCabId(), 'cab-a');
    assert.equal(cabStatus.textContent, 'Gold Cab · Following');
    assert.equal(follow.attributes.get('aria-pressed'), 'true');
    assert.deepEqual(cabPaint(), {text:'C',x:160,y:90});

    now = 300; map.updateCab('cab-a', {x:120,z:220});
    assert.deepEqual(cabPaint(), {text:'C',x:160,y:90});
    map.updateCab('wrong-cab', null);
    assert.equal(cabStatus.textContent, 'Gold Cab · Following');

    fire('pointerdown', {button:0,pointerId:1,clientX:160,clientY:90});
    fire('pointermove', {pointerId:1,clientX:180,clientY:90});
    fire('pointerup', {pointerId:1,clientX:180,clientY:90});
    assert.equal(cabStatus.textContent, 'Gold Cab · Location shown');
    assert.equal(follow.attributes.get('aria-pressed'), 'false');
    now = 600; map.updateCab('cab-a', {x:130,z:220});
    assert.notEqual(cabPaint().x, 160, 'panning prevents subsequent updates from recentering');

    follow.click(); assert.equal(cabStatus.textContent, 'Gold Cab · Following');
    fire('pointerdown', {button:0,pointerId:2,clientX:100,clientY:70});
    fire('pointerup', {pointerId:2,clientX:100,clientY:70});
    assert.equal(cabStatus.textContent, 'Gold Cab · Location shown');
    assert.match(status.textContent, /Pin placed/);
    dialog.querySelector('.map-drive')!.click();
    assert.equal(destinations.length, 1, 'pin routing still invokes the original destination callback');
    assert.equal(map.trackedCabId(), null);

    map.openCab({x:0,z:0}, null, 0, {id:'cab-b',name:'Blue Cab',position:{x:1,z:1}}, true);
    map.updateCab('cab-b', null);
    assert.equal(cabStatus.textContent, 'Blue Cab · Location unavailable');
    assert.equal(follow.disabled, true);
    assert.equal(dialog.querySelector('.map-cab-legend')!.hidden, true);
    map.updateCab('cab-b', {x:2,z:2});
    assert.equal(cabStatus.textContent, 'Blue Cab · Location shown');
    assert.equal(follow.attributes.get('aria-pressed'), 'false', 'a restored location does not silently restart follow');
    map.open({x:0,z:0}, null, 0);
    assert.equal(map.trackedCabId(), null);
    assert.equal(dialog.querySelector('.map-lightbox-cab')!.hidden, true);
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
