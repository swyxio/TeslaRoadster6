import './luxury-ui.css';
import { isLuxuryVehicle } from '../shared/vehicles';
import { FleetPreview } from './fleet-preview';

export type LuxuryShowroomModel = {
  id: string;
  name: string;
  brand: string;
  price: number;
  description: string;
  owned: boolean;
  /** Level immediately after payment, before any achievement awards. */
  levelAfterPurchase?: number;
};

export type LuxuryShowroomState = {
  cash: number;
  vehicles: readonly LuxuryShowroomModel[];
  pending: boolean;
  /** Explain why the player cannot purchase or collect here, if applicable. */
  unavailableReason?: string;
  /** Feedback from the authoritative purchase or collection result. */
  status?: string;
};

type LuxuryShowroomOptions = {
  onPurchase: (id: string) => void;
  onCollect: (id: string) => void;
  onOpenChange: (open: boolean) => void;
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});

/** The caller owns the account, location checks, request lifecycle and results. */
export function createLuxuryShowroom(options: LuxuryShowroomOptions) {
  const element = document.createElement('dialog');
  element.className = 'luxury-dialog';
  element.setAttribute('aria-labelledby', 'luxury-title');
  element.innerHTML = `<header class="luxury-header"><div><span class="luxury-kicker">PALO ALTO / THE VAULT</span><h2 id="luxury-title">The extraordinary, collected.</h2></div><button type="button" class="luxury-close" aria-label="Close the showroom">✕</button></header>
    <p class="luxury-intro">A collection of exceptional cars and motorcycles. Find your favorite, then take it out on the Bay.</p>
    <div class="luxury-wallet"><span>YOUR CASH</span><strong class="luxury-cash"></strong><span class="luxury-count"></span></div>
    <div class="luxury-body"><section class="luxury-collection" aria-label="Showroom collection"><div class="luxury-section-title">THE COLLECTION <span>SELECT A VEHICLE</span></div><div class="luxury-list"></div></section>
      <section class="luxury-detail" aria-labelledby="luxury-model-name"><div class="luxury-detail-kicker"></div><h3 id="luxury-model-name"></h3><canvas class="luxury-preview" aria-label="Selected vehicle preview"></canvas><p class="luxury-description"></p><div class="luxury-detail-price"><span>PRICE</span><strong></strong></div><p class="luxury-after"></p><button type="button" class="primary luxury-action"></button>
        <div class="luxury-confirm" hidden><p>Confirm this purchase? Your cash and level can change after payment.</p><div><button type="button" class="primary luxury-confirm-buy">Confirm purchase</button><button type="button" class="luxury-cancel">Cancel</button></div></div></section></div>
    <p class="luxury-feedback" role="status" aria-live="polite"></p>`;
  const query = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
  const list = query<HTMLDivElement>('.luxury-list');
  const action = query<HTMLButtonElement>('.luxury-action');
  const confirm = query<HTMLDivElement>('.luxury-confirm');
  const confirmBuy = query<HTMLButtonElement>('.luxury-confirm-buy');
  const feedback = query<HTMLParagraphElement>('.luxury-feedback');
  let canvas = query<HTMLCanvasElement>('.luxury-preview');
  type Row = { button: HTMLButtonElement; brand: HTMLElement; name: HTMLElement; price: HTMLElement };
  const rows = new Map<string, Row>();
  let state: LuxuryShowroomState = { cash: 0, vehicles: [], pending: false };
  let selected = '';
  let confirming = false;
  let preview: FleetPreview | undefined;
  let shownPreview = '';
  let previewUnavailable = false;
  // Block duplicate taps even before the caller has published its pending state.
  let sent = false;
  let sawPending = false;

  function renderPreview() {
    if (!element.open || previewUnavailable || !isLuxuryVehicle(selected) || shownPreview === selected) return;
    try {
      preview ??= new FleetPreview(canvas);
      preview.show(selected);
      canvas.hidden = false;
      shownPreview = selected;
    } catch {
      preview?.dispose(); preview = undefined; previewUnavailable = true; canvas.hidden = true;
    }
  }

  function render() {
    const ids = new Set(state.vehicles.map(vehicle => vehicle.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.button.remove(); rows.delete(id); }
    if (!ids.has(selected)) { selected = state.vehicles[0]?.id ?? ''; confirming = false; }
    for (const vehicle of state.vehicles) {
      let row = rows.get(vehicle.id);
      if (!row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'luxury-model';
        const copy = document.createElement('span');
        const brand = document.createElement('span'); brand.className = 'luxury-model-brand';
        const name = document.createElement('strong'); name.className = 'luxury-model-name';
        const price = document.createElement('span'); price.className = 'luxury-model-price';
        copy.append(brand, name); button.append(copy, price);
        button.addEventListener('click', () => { selected = vehicle.id; confirming = false; render(); });
        row = { button, brand, name, price };
        rows.set(vehicle.id, row);
        list.append(button);
      }
      row.brand.textContent = vehicle.brand;
      row.name.textContent = vehicle.name;
      row.price.textContent = vehicle.owned ? 'OWNED' : dollars.format(vehicle.price);
      row.button.setAttribute('aria-pressed', String(selected === vehicle.id));
    }
    query<HTMLElement>('.luxury-cash').textContent = dollars.format(state.cash);
    query<HTMLElement>('.luxury-count').textContent = `${state.vehicles.filter(v => v.owned).length} / ${state.vehicles.length} OWNED`;
    const vehicle = state.vehicles.find(v => v.id === selected);
    const detail = query<HTMLElement>('.luxury-detail');
    detail.hidden = !vehicle;
    if (vehicle) {
      query<HTMLElement>('.luxury-detail-kicker').textContent = vehicle.brand;
      query<HTMLElement>('#luxury-model-name').textContent = vehicle.name;
      query<HTMLElement>('.luxury-description').textContent = vehicle.description;
      query<HTMLElement>('.luxury-detail-price strong').textContent = dollars.format(vehicle.price);
      const affordable = state.cash >= vehicle.price;
      const available = !state.unavailableReason;
      const busy = state.pending || sent;
      if (vehicle.owned || !affordable || !available || busy) confirming = false;
      const after = query<HTMLElement>('.luxury-after');
      if (vehicle.owned) after.textContent = 'In your collection. Collect it here to drive.';
      else if (!affordable) after.textContent = `${dollars.format(vehicle.price - state.cash)} more needed.`;
      else {
        const level = vehicle.levelAfterPurchase === undefined ? '' : ` · Level ${vehicle.levelAfterPurchase}`;
        after.textContent = `After payment: ${dollars.format(state.cash - vehicle.price)}${level}, before awards.`;
      }
      action.textContent = vehicle.owned ? 'Collect this ride →' : `Buy for ${dollars.format(vehicle.price)} →`;
      action.disabled = busy || !available || (!vehicle.owned && !affordable);
      action.hidden = confirming;
      confirm.hidden = !confirming;
      confirmBuy.disabled = busy || !available || !affordable;
    }
    feedback.textContent = state.unavailableReason || state.status || (state.pending || sent ? 'Contacting the showroom…' : '');
    renderPreview();
  }

  query<HTMLButtonElement>('.luxury-close').addEventListener('click', () => element.close());
  element.addEventListener('close', () => {
    confirming = false; preview?.dispose(); preview = undefined; shownPreview = ''; previewUnavailable = false;
    // A deliberately lost WebGL context cannot be reused by the next renderer.
    const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement; nextCanvas.hidden = false; canvas.replaceWith(nextCanvas); canvas = nextCanvas;
    options.onOpenChange(false);
  });
  action.addEventListener('click', () => {
    const vehicle = state.vehicles.find(v => v.id === selected);
    if (!vehicle || action.disabled) return;
    if (!vehicle.owned) { confirming = true; render(); confirmBuy.focus(); return; }
    sent = true; sawPending = false; render(); query<HTMLButtonElement>('.luxury-close').focus(); options.onCollect(vehicle.id);
  });
  confirmBuy.addEventListener('click', () => {
    const vehicle = state.vehicles.find(v => v.id === selected);
    if (!vehicle || vehicle.owned || confirmBuy.disabled) return;
    sent = true; sawPending = false; confirming = false; render(); query<HTMLButtonElement>('.luxury-close').focus(); options.onPurchase(vehicle.id);
  });
  query<HTMLButtonElement>('.luxury-cancel').addEventListener('click', () => { confirming = false; render(); action.focus(); });

  return {
    element,
    open() { if (!element.open) { render(); element.showModal(); renderPreview(); options.onOpenChange(true); } },
    close() { if (element.open) element.close(); },
    isOpen() { return element.open; },
    /** Publish pending=true when a request starts, then pending=false when it resolves. */
    update(next: LuxuryShowroomState) {
      if (sent && next.pending) sawPending = true;
      if (sent && sawPending && !next.pending) { sent = false; sawPending = false; }
      state = next;
      if (element.open) render();
    },
  };
}
