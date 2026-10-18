import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../src/controls';
import { listenForDoubleShift } from '../src/double-shift';

function environment() {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const fakeWindow = new EventTarget() as EventTarget & { matches: () => boolean };
  fakeWindow.matches = () => false;
  const fakeDocument = new EventTarget() as EventTarget & {
    hidden: boolean; activeElement: EventTarget | null; dialogOpen: boolean;
    querySelector: (selector: string) => object | null; querySelectorAll: () => [];
  };
  fakeDocument.hidden = false; fakeDocument.activeElement = null; fakeDocument.dialogOpen = false;
  fakeDocument.querySelector = () => fakeDocument.dialogOpen ? {} : null;
  fakeDocument.querySelectorAll = () => [];
  Object.assign(globalThis, { window: fakeWindow, document: fakeDocument });
  let time = 0;
  const key = (type: 'keydown' | 'keyup', code = 'ShiftLeft', properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries({ code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...properties })) {
      Object.defineProperty(event, name, { value });
    }
    fakeWindow.dispatchEvent(event);
    return event;
  };
  return {
    window: fakeWindow, document: fakeDocument, key,
    now: () => time, at: (next: number) => { time = next; },
    restore: () => Object.assign(globalThis, { window: oldWindow, document: oldDocument }),
  };
}

test('two released Shift taps engage once without consuming normal boost or repeat events', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let triggered = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { triggered++; assert.equal(controls.read().boost, false); } });
    const down = env.key('keydown'); assert.equal(down.defaultPrevented, false); assert.equal(controls.read().boost, true);
    env.at(50); env.key('keydown', 'ShiftLeft', { repeat: true });
    env.at(100); env.key('keyup'); assert.equal(controls.read().boost, false); assert.equal(triggered, 0);
    env.at(200); env.key('keydown'); assert.equal(controls.read().boost, true); assert.equal(triggered, 0);
    env.at(250); const up = env.key('keyup'); assert.equal(up.defaultPrevented, false); assert.equal(triggered, 1);
    env.at(300); env.key('keydown'); env.at(350); env.key('keyup'); assert.equal(triggered, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('long holds, gaps, mismatched Shift keys and interrupted chords do not trigger', () => {
  const env = environment();
  try {
    let triggered = 0;
    const shortcut = listenForDoubleShift({ enabled: () => true, allowed: () => true, now: env.now, onDoubleTap: () => { triggered++; } });
    env.key('keydown'); env.at(301); env.key('keyup');
    env.at(350); env.key('keydown'); env.at(400); env.key('keyup'); assert.equal(triggered, 0);
    env.at(751); env.key('keydown'); env.at(800); env.key('keyup'); assert.equal(triggered, 0);
    env.at(850); env.key('keydown', 'ShiftRight'); env.at(900); env.key('keyup', 'ShiftRight'); assert.equal(triggered, 0);
    env.at(950); env.key('keydown', 'ShiftRight'); env.at(1251); env.key('keyup', 'ShiftRight'); assert.equal(triggered, 0);
    env.at(1300); env.key('keydown'); env.key('keydown', 'KeyA'); env.at(1350); env.key('keyup');
    env.at(1400); env.key('keydown'); env.at(1450); env.key('keyup'); assert.equal(triggered, 0);
    env.at(1500); env.key('keydown'); env.at(1550); env.key('keyup'); assert.equal(triggered, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});

test('editing, menus, modal dialogs, modifier chords and lost focus cancel a pending tap', () => {
  const env = environment();
  try {
    let enabled = true, allowed = true, triggered = 0;
    const shortcut = listenForDoubleShift({ enabled: () => enabled, allowed: () => allowed, now: env.now, onDoubleTap: () => { triggered++; } });
    const tap = () => { env.key('keydown'); env.at(env.now() + 40); env.key('keyup'); env.at(env.now() + 40); };
    tap(); env.document.activeElement = { isContentEditable: false, closest: () => ({}) } as unknown as EventTarget;
    tap(); env.document.activeElement = null; tap(); assert.equal(triggered, 0);
    env.document.dialogOpen = true; tap(); env.document.dialogOpen = false; tap(); assert.equal(triggered, 0);
    enabled = false; tap(); enabled = true; tap(); assert.equal(triggered, 0);
    allowed = false; tap(); allowed = true; tap(); assert.equal(triggered, 0);
    env.key('keydown', 'ShiftLeft', { ctrlKey: true }); env.key('keyup', 'ShiftLeft', { ctrlKey: true }); tap(); assert.equal(triggered, 0);
    env.window.dispatchEvent(new Event('blur')); tap(); assert.equal(triggered, 0);
    env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'));
    env.document.hidden = false; tap(); assert.equal(triggered, 0);
    env.document.dispatchEvent(new Event('focusin')); tap(); assert.equal(triggered, 0);
    env.document.dispatchEvent(new Event('pointerdown')); tap(); assert.equal(triggered, 0);
    shortcut.reset(); tap(); assert.equal(triggered, 0); tap(); assert.equal(triggered, 1);
    shortcut.dispose(); tap(); tap(); assert.equal(triggered, 1);
  } finally { env.restore(); }
});

test('double Shift clears held driving input until the driver makes a new press', () => {
  const env = environment();
  try {
    const controls = new Controls(() => []); controls.enabled = true;
    let triggered = 0;
    const shortcut = listenForDoubleShift({ enabled: () => controls.enabled, allowed: () => true, now: env.now,
      onDoubleTap: () => { triggered++; controls.clear(); } });
    env.key('keydown', 'KeyW'); assert.equal(controls.read().throttle, 1);
    env.key('keydown'); env.at(50); env.key('keyup');
    env.at(100); env.key('keydown'); env.at(150); env.key('keyup');
    assert.equal(triggered, 1); assert.equal(controls.read().throttle, 0);
    env.key('keydown', 'KeyW', { repeat: true }); assert.equal(controls.read().throttle, 0);
    env.key('keyup', 'KeyW'); env.key('keydown', 'KeyW'); assert.equal(controls.read().throttle, 1);
    shortcut.dispose();
  } finally { env.restore(); }
});
