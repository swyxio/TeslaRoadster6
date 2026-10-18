type ShiftCode = 'ShiftLeft' | 'ShiftRight';
type Options = {
  /** False whenever driving controls are suspended, including menus and drawers. */
  enabled: () => boolean;
  /** Reject a Shift key when it is rebound to an action other than boost. */
  allowed: (code: ShiftCode) => boolean;
  onDoubleTap: () => void;
  now?: () => number;
};

const MAX_HOLD_MS = 300;
const MAX_GAP_MS = 350;
const isShift = (code: string): code is ShiftCode => code === 'ShiftLeft' || code === 'ShiftRight';
const editable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || !!element.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
};

/**
 * Listen after Controls is constructed, so it releases boost before the callback.
 * Call reset when changing control contexts and dispose when removing the listener.
 * Neither Shift events nor normal boost input are consumed by this shortcut.
 */
export function listenForDoubleShift(options: Options) {
  const now = options.now ?? (() => performance.now());
  let first: { code: ShiftCode; released: number } | null = null;
  let pressed: { code: ShiftCode; started: number; second: boolean } | null = null;
  const reset = () => { first = null; pressed = null; };
  const available = (event: KeyboardEvent) => options.enabled() && !document.hidden &&
    !document.querySelector('dialog[open]') && !editable(event.target) && !editable(document.activeElement) &&
    !event.ctrlKey && !event.altKey && !event.metaKey;
  const keydown = (event: KeyboardEvent) => {
    if (!available(event)) { reset(); return; }
    if (!isShift(event.code)) { if (!event.repeat) reset(); return; }
    if (!options.allowed(event.code)) { reset(); return; }
    if (event.repeat) return;
    if (pressed) { if (pressed.code !== event.code) reset(); return; }
    const time = now();
    const gap = first ? time - first.released : Infinity;
    const second = !!first && first.code === event.code && gap >= 0 && gap <= MAX_GAP_MS;
    if (!second) first = null;
    pressed = { code: event.code, started: time, second };
  };
  const keyup = (event: KeyboardEvent) => {
    if (!available(event)) { reset(); return; }
    if (!isShift(event.code)) return;
    if (!options.allowed(event.code) || !pressed || pressed.code !== event.code) { reset(); return; }
    const time = now();
    const held = time - pressed.started;
    if (held < 0 || held > MAX_HOLD_MS) { reset(); return; }
    if (pressed.second) { reset(); options.onDoubleTap(); return; }
    first = { code: event.code, released: time };
    pressed = null;
  };
  const visibility = () => { if (document.hidden) reset(); };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('focusin', reset);
  document.addEventListener('pointerdown', reset);
  return { reset, dispose() {
    reset();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', reset);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('focusin', reset);
    document.removeEventListener('pointerdown', reset);
  } };
}
