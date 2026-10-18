import type { Input } from '../shared/game';

/** The sole input adapter. UI/keyboard/touch emit intent, never world coordinates. */
export class Controls {
  private keys = new Set<string>();
  private pointers = new Map<number, string>();
  enabled = false;
  onAction: (action: 'interact' | 'reset' | 'camera' | 'menu' | 'autopilot' | 'fleet' | 'scores') => void = () => {};
  constructor() {
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).matches('input,textarea,select')) return;
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) {
        const action = {KeyF:'interact',KeyR:'reset',KeyC:'camera',KeyV:'autopilot',KeyG:'fleet',KeyL:'scores',Escape:'menu'}[e.code];
        if (action) this.onAction(action as 'interact');
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    document.querySelectorAll<HTMLElement>('[data-control]').forEach(button => {
      button.addEventListener('pointerdown', e => {
        e.preventDefault(); button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, button.dataset.control!); button.classList.add('pressed');
      });
      const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); button.classList.remove('pressed'); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }
  clear() { this.keys.clear(); this.pointers.clear(); document.querySelectorAll('.pressed').forEach(e => e.classList.remove('pressed')); }
  read(): Input {
    const down = (...codes: string[]) => this.enabled && codes.some(c => this.keys.has(c) || [...this.pointers.values()].includes(c));
    return { throttle: Number(down('KeyW','ArrowUp')) - Number(down('KeyS','ArrowDown')), steer: Number(down('KeyA','ArrowLeft')) - Number(down('KeyD','ArrowRight')), boost: down('ShiftLeft','ShiftRight'), lift: down('Space'), roll: Number(down('KeyQ')) - Number(down('KeyE')), brake: down('KeyB') };
  }
}
