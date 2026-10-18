import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitDriverNameInput } from '../src/driver-name';

test('driver name limit counts emoji as code points and retains the cursor', () => {
  let selection: number[] = [];
  const input = {
    value: '🚗'.repeat(21), selectionStart: 12, selectionEnd: 14,
    setSelectionRange(start: number, end: number) { selection = [start, end]; },
  } as HTMLInputElement;
  limitDriverNameInput(input);
  assert.equal(input.value, '🚗'.repeat(20));
  assert.deepEqual(selection, [12, 14]);
  input.value = '🚗'.repeat(20);
  selection = [];
  limitDriverNameInput(input);
  assert.deepEqual(selection, [], 'valid emoji names are left untouched');
});

test('chat composer preserves drafts rejected after normalization and accepts 240 emoji', async () => {
  // Exercise the actual panel without a browser DOM or a CSS loader.
  const { readFile } = await import('node:fs/promises');
  const ts = (await import('typescript')).default;
  let source = await readFile(new URL('../src/chat-panel.ts', import.meta.url), 'utf8');
  source = source.replace("import './chat.css';", '');
  source = source.replaceAll("'../worker/global-chat-core'", JSON.stringify(new URL('../worker/global-chat-core.ts', import.meta.url).href));
  source = source.replace("'./driver-name'", JSON.stringify(new URL('../src/driver-name.ts', import.meta.url).href));
  const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const { createChatPanel } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

  class Element extends EventTarget {
    children: Element[] = [];
    className = ''; id = ''; textContent = ''; value = '';
    maxLength = -1; disabled = false; hidden = false;
    dataset: Record<string, string> = {};
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute() {}
    focus() {}
  }
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  try {
    const sent: string[] = [];
    const renamed: string[] = [];
    const panel = createChatPanel({ onSend: (text: string) => { sent.push(text); return true; }, onRename: (name: string) => { renamed.push(name); return true; }, onOpenChange: () => {} });
    panel.setConnection('online');
    const find = (root: Element, predicate: (node: Element) => boolean): Element | undefined =>
      predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
    const form = find(panel.element, node => node.className === 'chat-compose')!;
    const input = find(panel.element, node => node.id === 'chat-input')!;
    const feedback = find(panel.element, node => node.className === 'chat-feedback')!;
    const nameForm = find(panel.element, node => node.className === 'chat-name-form')!;
    const nameInput = find(panel.element, node => node.id === 'chat-name-input')!;
    nameForm.hidden = false;
    nameInput.value = '  New  Name  ';
    nameForm.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.deepEqual(renamed, ['New Name']);
    panel.finishRename('Connection lost.', false);
    nameInput.value = 'Newer draft';
    panel.finishRename('', true);
    assert.equal(nameForm.hidden, false, 'recovery does not close an editor with an unsent draft');
    assert.equal(nameInput.value, 'Newer draft');
    nameForm.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.deepEqual(renamed, ['New Name', 'Newer draft']);
    panel.finishRename('', true);
    assert.equal(nameForm.hidden, true, 'the submitted draft closes on confirmation');
    nameForm.hidden = false;
    nameInput.value = 'Another draft';
    panel.finishRename('', true);
    assert.equal(nameForm.hidden, false, 'an unrelated name confirmation does not close the editor');
    assert.equal(input.maxLength, 480);
    const expanded = 'ﬃ'.repeat(81); // 81 visible ligatures normalize to 243 code points.
    input.value = expanded;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.deepEqual(sent, []);
    assert.equal(input.value, expanded);
    assert.match(feedback.textContent, /240 characters/);
    input.value = '🚗'.repeat(240);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.deepEqual(sent, ['🚗'.repeat(240)]);
    assert.equal(input.value, '');
    input.value = 'ﬃ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.equal(sent.at(-1), 'ffi');
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
  }
});
