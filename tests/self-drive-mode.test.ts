import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('delivery and map share the next mode and switch safely when a rocket is unavailable', async () => {
  const source = (await readFile(new URL('../src/self-drive-mode.ts', import.meta.url), 'utf8')).replace("import './self-drive-mode.css';", '');
  const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const { createDriveModes } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  class Element extends EventTarget {
    classList = { add() {} }; children: Element[] = []; attributes = new Map<string, string>();
    id = ''; htmlFor = ''; className = ''; textContent = ''; value = ''; type = ''; disabled = false; hidden = false;
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    get options() { return this.children; }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  try {
    const delivery = new Element(), map = new Element();
    let unavailable = 0, interactions = 0, shopOpens = 0;
    const modes = createDriveModes([delivery, map], () => unavailable++, () => interactions++, () => shopOpens++);
    const deliverySelect = delivery.children[1], mapSelect = map.children[1];
    assert.equal(modes.mode(), 'road');
    assert.deepEqual(deliverySelect.options.map(option => option.disabled), [false, true, true]);
    assert.match(delivery.children[3].textContent, /Buy Ludicrous Leap and Maximum Plaid/);
    assert.match(delivery.children[3].textContent, /rocket-equipped/);
    delivery.children[2].dispatchEvent(new Event('click'));
    assert.equal(shopOpens, 1);

    modes.update({ rocket: true, jump: false, sky: false });
    assert.deepEqual(mapSelect.options.map(option => option.disabled), [false, true, true], 'a rocket alone does not unlock paid upgrades');
    modes.update({ rocket: true, jump: true, sky: false });
    assert.deepEqual(mapSelect.options.map(option => option.disabled), [false, false, true]);
    assert.match(map.children[3].textContent, /Maximum Plaid is available at SpaceX/);
    modes.update({ rocket: true, jump: true, sky: true });
    assert.deepEqual(mapSelect.options.map(option => option.disabled), [false, false, false]);
    assert.equal(map.children[2].hidden, true);
    mapSelect.value = 'sky'; mapSelect.dispatchEvent(new Event('change'));
    assert.equal(modes.mode(), 'sky');
    assert.equal(deliverySelect.value, 'sky');
    assert.match(delivery.children[3].textContent, /next trip/);
    deliverySelect.dispatchEvent(new Event('focus'));
    assert.equal(interactions, 1, 'focusing the selector neutralizes held controls');

    deliverySelect.value = 'jump'; deliverySelect.dispatchEvent(new Event('change'));
    assert.equal(mapSelect.value, 'jump');
    modes.update({ rocket: false, jump: true, sky: true });
    assert.equal(modes.mode(), 'road');
    assert.equal(mapSelect.value, 'road');
    assert.equal(deliverySelect.value, 'road');
    assert.equal(unavailable, 1);
    assert.match(delivery.children[3].textContent, /upgrades are installed.*rocket/);
    modes.update({ rocket: false, jump: true, sky: true });
    assert.equal(unavailable, 1, 'repeated frames do not repeat the notice');
    mapSelect.value = 'sky'; mapSelect.dispatchEvent(new Event('change'));
    assert.equal(modes.mode(), 'road', 'an unavailable option cannot be forced by a change event');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
