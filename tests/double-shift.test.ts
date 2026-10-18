import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../src/controls';
import { listenForDoubleShift } from '../src/double-shift';

function environment() {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const oldSetTimeout = globalThis.setTimeout, oldClearTimeout = globalThis.clearTimeout;
  const fakeWindow = new EventTarget() as EventTarget & { matches: () => boolean };
  fakeWindow.matches = () => false;
  const fakeDocument = new EventTarget() as EventTarget & {
    hidden: boolean; activeElement: EventTarget | null; dialogOpen: boolean;
    querySelector: (selector: string) => object | null; querySelectorAll: () => [];
  };
  fakeDocument.hidden = false; fakeDocument.activeElement = null; fakeDocument.dialogOpen = false;
  fakeDocument.querySelector = () => fakeDocument.dialogOpen ? {} : null;
  fakeDocument.querySelectorAll = () => [];
  let time = 0, nextTimer = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  Object.assign(globalThis, {
    window: fakeWindow, document: fakeDocument,
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++nextTimer; timers.set(id, { at: time + delay, callback }); return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const at = (next: number) => {
    assert.ok(next >= time);
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= next).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      time = due[1].at; timers.delete(due[0]); due[1].callback();
    }
    time = next;
  };
  const key = (type: 'keydown' | 'keyup', code = 'ShiftLeft', properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries({ code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...properties })) {
      Object.defineProperty(event, name, { value });
    }
    fakeWindow.dispatchEvent(event);
    return event;
  };
  const tap = (code = 'ShiftLeft') => { key('keydown', code); at(time + 40); key('keyup', code); at(time + 40); };
  return {
    window: fakeWindow, document: fakeDocument, key, tap,
    now: () => time, at, advance: (duration: number) => at(time + duration),
    restore: () => Object.assign(globalThis, { window: oldWindow, document: oldDocument, setTimeout: oldSetTimeout, clearTimeout: oldClearTimeout }),
  };
}

test('double Shift waits for a possible third tap while boost remains immediate', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let delivery = 0, charger = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; assert.equal(controls.read().boost, false); }, onTripleTap: () => { charger++; } });
    const down = env.key('keydown'); assert.equal(down.defaultPrevented, false); assert.equal(controls.read().boost, true);
    env.at(50); env.key('keydown', 'ShiftLeft', { repeat: true });
    env.at(100); env.key('keyup'); assert.equal(controls.read().boost, false);
    env.at(200); env.key('keydown'); assert.equal(controls.read().boost, true);
    env.at(250); const up = env.key('keyup'); assert.equal(up.defaultPrevented, false);
    assert.equal(delivery, 0); env.at(599); assert.equal(delivery, 0);
    env.at(600); assert.equal(delivery, 1); assert.equal(charger, 0);
    env.at(650); env.tap(); env.advance(400); assert.equal(delivery, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('triple Shift routes only to the charger, with no competing delivery', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let delivery = 0, charger = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; }, onTripleTap: () => { charger++; assert.equal(controls.read().boost, false); } });
    env.tap(); env.tap();
    const down = env.key('keydown'); assert.equal(down.defaultPrevented, false); assert.equal(controls.read().boost, true);
    env.advance(30); env.key('keydown', 'ShiftLeft', { repeat: true });
    env.advance(20); const up = env.key('keyup'); assert.equal(up.defaultPrevented, false);
    assert.equal(charger, 1); assert.equal(delivery, 0);
    env.advance(600); assert.equal(charger, 1); assert.equal(delivery, 0);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('holding the third Shift cancels delivery without delaying boost or starting a charger route', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let delivery = 0, charger = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; }, onTripleTap: () => { charger++; } });
    env.tap(); env.tap(); env.key('keydown'); assert.equal(controls.read().boost, true);
    env.advance(400); env.key('keydown', 'ShiftLeft', { repeat: true });
    assert.equal(controls.read().boost, true); assert.equal(delivery, 0); assert.equal(charger, 0);
    env.key('keyup'); env.advance(500);
    assert.equal(controls.read().boost, false); assert.equal(delivery, 0); assert.equal(charger, 0);
    env.tap(); env.tap(); env.advance(350); assert.equal(delivery, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('a third press just before the deadline owns the gesture even if released later', () => {
  const env = environment();
  try {
    let delivery = 0, charger = 0;
    const shortcut = listenForDoubleShift({ enabled: () => true, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; }, onTripleTap: () => { charger++; } });
    env.tap(); env.tap(); // The second release was 40 ms ago.
    env.advance(309); env.key('keydown'); env.advance(299); env.key('keyup');
    env.advance(400); assert.equal(delivery, 0); assert.equal(charger, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('manual driving during the decision window responds immediately and cancels delivery', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let delivery = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; }, onTripleTap: () => {} });
    env.tap(); env.tap(); env.key('keydown', 'KeyW');
    assert.equal(controls.read().throttle, 1);
    env.advance(400); assert.equal(delivery, 0); assert.equal(controls.read().throttle, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('long holds, gaps, mismatched Shift keys and interrupted chords do not form a shortcut', () => {
  const env = environment();
  try {
    let delivery = 0, charger = 0;
    const shortcut = listenForDoubleShift({ enabled: () => true, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; }, onTripleTap: () => { charger++; } });
    env.key('keydown'); env.advance(301); env.key('keyup'); env.tap();
    env.advance(351); env.tap(); env.tap('ShiftRight');
    env.key('keydown', 'ShiftRight'); env.advance(301); env.key('keyup', 'ShiftRight');
    env.key('keydown'); env.key('keydown', 'KeyA'); env.advance(40); env.key('keyup');
    env.tap(); env.advance(400); assert.equal(delivery, 0); assert.equal(charger, 0);
    env.tap(); env.tap(); env.key('keydown', 'ShiftRight'); env.key('keyup', 'ShiftRight');
    env.advance(400); assert.equal(delivery, 0); assert.equal(charger, 0);
    env.tap(); env.tap(); env.key('keydown', 'KeyW'); env.advance(400);
    assert.equal(delivery, 0); assert.equal(charger, 0);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('focus, menus, rebinding and disposal cancel pending shortcuts', () => {
  const env = environment();
  try {
    let enabled = true, allowed = true, delivery = 0, charger = 0;
    const shortcut = listenForDoubleShift({ enabled: () => enabled, allowed: () => allowed, now: env.now,
      onDoubleTap: () => { delivery++; }, onTripleTap: () => { charger++; } });
    const pending = () => { env.tap(); env.tap(); };
    const wait = () => { env.advance(400); assert.equal(delivery, 0); assert.equal(charger, 0); };
    pending(); enabled = false; wait(); enabled = true;
    pending(); allowed = false; wait(); allowed = true;
    pending(); env.document.dialogOpen = true; wait(); env.document.dialogOpen = false;
    pending(); env.document.activeElement = { isContentEditable: false, closest: () => ({}) } as unknown as EventTarget;
    wait(); env.document.activeElement = null;
    pending(); env.window.dispatchEvent(new Event('blur')); wait();
    pending(); env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange')); env.document.hidden = false; wait();
    pending(); env.document.dispatchEvent(new Event('focusin')); wait();
    pending(); env.document.dispatchEvent(new Event('pointerdown')); wait();
    pending(); shortcut.reset(); wait(); // Explicit reset on menu and binding transitions.
    env.key('keydown', 'ShiftLeft', { ctrlKey: true }); env.key('keyup', 'ShiftLeft', { ctrlKey: true }); env.tap(); wait();
    pending(); shortcut.dispose(); wait();
    env.tap(); env.tap(); env.tap(); wait();
  } finally { env.restore(); }
});

test('double Shift clears held driving input only once the gesture is confirmed', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let delivery = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { delivery++; controls.clear(); }, onTripleTap: () => {} });
    env.key('keydown', 'KeyW'); assert.equal(controls.read().throttle, 1);
    env.tap(); env.tap(); assert.equal(delivery, 0); assert.equal(controls.read().throttle, 1);
    env.advance(350); assert.equal(delivery, 1); assert.equal(controls.read().throttle, 0);
    env.key('keydown', 'KeyW', { repeat: true }); assert.equal(controls.read().throttle, 0);
    env.key('keyup', 'KeyW'); env.key('keydown', 'KeyW'); assert.equal(controls.read().throttle, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});
