type ShiftCode = 'ShiftLeft' | 'ShiftRight';
type Options = {
  /** False whenever driving controls are suspended, including menus and drawers. */
  enabled: () => boolean;
  /** Reject a Shift key when it is rebound to an action other than boost. */
  allowed: (code: ShiftCode) => boolean;
  onDoubleTap: () => void;
  onTripleTap: () => void;
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
 * Wait for a possible third tap before dispatching the double tap. Neither
 * Shift events nor normal boost input are consumed by these shortcuts.
 */
export function listenForDoubleShift(options: Options) {
  const now = options.now ?? (() => performance.now());
  let previous: { code: ShiftCode; released: number; count: 1 | 2 } | null = null;
  let pressed: { code: ShiftCode; started: number; count: 1 | 2 | 3 } | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const cancelPending = () => { if (pending !== null) clearTimeout(pending); pending = null; };
  const reset = () => { cancelPending(); previous = null; pressed = null; };
  const contextAvailable = () => options.enabled() && !document.hidden &&
    !document.querySelector('dialog[open]') && !editable(document.activeElement);
  const available = (event: KeyboardEvent) => contextAvailable() && !editable(event.target) &&
    !event.ctrlKey && !event.altKey && !event.metaKey;
  const keydown = (event: KeyboardEvent) => {
    if (!available(event)) { reset(); return; }
    if (!isShift(event.code)) { if (!event.repeat) reset(); return; }
    if (!options.allowed(event.code)) { reset(); return; }
    if (event.repeat) return;
    if (pressed) { if (pressed.code !== event.code) reset(); return; }
    const time = now();
    const gap = previous ? time - previous.released : Infinity;
    const count: 1 | 2 | 3 = previous && previous.code === event.code && gap >= 0 && gap < MAX_GAP_MS
      ? (previous.count === 1 ? 2 : 3) : 1;
    // Cancel on keydown, not keyup: a held third tap must never start delivery.
    cancelPending();
    previous = null;
    pressed = { code: event.code, started: time, count };
  };
  const keyup = (event: KeyboardEvent) => {
    if (!available(event)) { reset(); return; }
    if (!isShift(event.code)) return;
    if (!options.allowed(event.code) || !pressed || pressed.code !== event.code) { reset(); return; }
    const time = now();
    const held = time - pressed.started;
    if (held < 0 || held > MAX_HOLD_MS) { reset(); return; }
    if (pressed.count === 3) { reset(); options.onTripleTap(); return; }
    previous = { code: event.code, released: time, count: pressed.count };
    pressed = null;
    if (previous.count === 2) {
      const code = previous.code;
      pending = setTimeout(() => {
        pending = null;
        previous = null;
        if (contextAvailable() && options.allowed(code)) options.onDoubleTap();
      }, MAX_GAP_MS);
    }
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
