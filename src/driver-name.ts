import { MAX_NAME_LENGTH } from '../worker/global-chat-core';

/** Keep editing bounded by the same code-point limit as the server. */
export function limitDriverNameInput(input: HTMLInputElement) {
  const bounded = Array.from(input.value).slice(0, MAX_NAME_LENGTH).join('');
  if (bounded === input.value) return;
  const start = Math.min(input.selectionStart ?? bounded.length, bounded.length);
  const end = Math.min(input.selectionEnd ?? bounded.length, bounded.length);
  input.value = bounded;
  input.setSelectionRange(start, end);
}
