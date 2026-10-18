const START_CASH = 2500;
const FIRST_CAB_AWARD = 5000;
const CAB_HOURLY = 15000;
const HORIZON = 6;

/** A continuous-income illustration of the cab purchase decision. */
export function investmentModel({ deliveryHourly, cabPrice, utilization, cosmetic }) {
  if (![deliveryHourly, cabPrice, utilization, cosmetic].every(Number.isFinite) || deliveryHourly <= 0 || cabPrice < FIRST_CAB_AWARD || utilization < 0 || utilization > 1 || cosmetic < 0) {
    throw new RangeError('Invalid investment model assumptions');
  }
  const cosmeticTime = cosmetic > 0 ? Math.max(0, (cosmetic - START_CASH) / deliveryHourly) : null;
  // A player must be able to pay the whole price before the award is credited.
  const buyTime = Math.max(0, cosmeticTime ?? 0, (cabPrice + cosmetic - START_CASH) / deliveryHourly);
  const cabHourly = CAB_HOURLY * utilization;
  const paybackTime = cabHourly > 0 ? buyTime + (cabPrice - FIRST_CAB_AWARD) / cabHourly : (cabPrice === FIRST_CAB_AWARD ? buyTime : null);

  function cash(time, buyCab, includeAtTime = true) {
    const hasOccurred = event => event !== null && (event < time || (includeAtTime && event === time));
    const spentOnCosmetic = hasOccurred(cosmeticTime) ? cosmetic : 0;
    const ownsCab = buyCab && hasOccurred(buyTime);
    const cabEarnings = ownsCab ? cabHourly * (time - buyTime) : 0;
    return START_CASH + deliveryHourly * time - spentOnCosmetic + (ownsCab ? FIRST_CAB_AWARD - cabPrice + cabEarnings : 0);
  }
  function earned(time, buyCab) {
    const ownsCab = buyCab && time >= buyTime;
    return deliveryHourly * time + (ownsCab ? FIRST_CAB_AWARD + cabHourly * (time - buyTime) : 0);
  }
  return { cosmeticTime, buyTime, paybackTime, cabHourly, cash, earned };
}

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const shortMoney = value => value === 0 ? '$0' : `${value < 0 ? '−' : ''}$${Math.abs(value) >= 1000 ? `${Math.round(Math.abs(value) / 1000)}k` : Math.round(Math.abs(value))}`;
const duration = hours => {
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} min`;
  const wholeHours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${wholeHours} h${rest ? ` ${rest} min` : ''}`;
};
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function chart(model, settings, narrow) {
  const width = narrow ? 350 : 640;
  const height = 325;
  const left = narrow ? 56 : 64;
  const right = width - 18;
  const top = 20;
  const upperBottom = 152;
  const lowerTop = 195;
  const lowerBottom = 274;
  const x = time => left + time / HORIZON * (right - left);
  const maxCash = Math.max(model.cash(HORIZON, true), model.cash(HORIZON, false));
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, maxCash)))) / 2;
  const ceiling = Math.ceil(maxCash / step) * step;
  const y = cash => upperBottom - cash / ceiling * (upperBottom - top);
  const before = model.cash(model.buyTime, true, false) - model.cash(model.buyTime, false, false);
  const after = model.cash(model.buyTime, true) - model.cash(model.buyTime, false);
  const endDifference = model.cash(HORIZON, true) - model.cash(HORIZON, false);
  const limit = Math.max(10000, Math.abs(before), Math.abs(after), Math.abs(endDifference));
  const diffStep = Math.pow(10, Math.floor(Math.log10(limit))) / 2;
  const diffCeiling = Math.ceil(limit / diffStep) * diffStep;
  const dy = value => lowerBottom - (value + diffCeiling) / (2 * diffCeiling) * (lowerBottom - lowerTop);
  const point = (time, value, yy) => `${x(time).toFixed(1)},${yy(value).toFixed(1)}`;

  function cashPath(buyCab) {
    const events = [model.cosmeticTime, buyCab ? model.buyTime : null].filter(time => time !== null && time >= 0 && time <= HORIZON).sort((a, b) => a - b);
    const points = [point(0, model.cash(0, buyCab, false), y)];
    for (const time of [...new Set(events)]) {
      points.push(point(time, model.cash(time, buyCab, false), y));
      points.push(point(time, model.cash(time, buyCab), y));
    }
    points.push(point(HORIZON, model.cash(HORIZON, buyCab), y));
    return points.join(' ');
  }
  const difference = model.buyTime <= HORIZON
    ? [point(0, 0, dy), point(model.buyTime, before, dy), point(model.buyTime, after, dy), point(HORIZON, endDifference, dy)].join(' ')
    : [point(0, 0, dy), point(HORIZON, 0, dy)].join(' ');
  const yTicks = [0, ceiling / 2, ceiling];
  const cashGrid = yTicks.map(tick => `<line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}" class="lab-grid"/><text x="${left - 7}" y="${y(tick) + 4}" text-anchor="end">${shortMoney(tick)}</text>`).join('');
  const diffGrid = [-diffCeiling, 0, diffCeiling].map(tick => `<line x1="${left}" x2="${right}" y1="${dy(tick)}" y2="${dy(tick)}" class="lab-grid"/><text x="${left - 7}" y="${dy(tick) + 4}" text-anchor="end">${shortMoney(tick)}</text>`).join('');
  const xTicks = [0, 2, 4, 6].map(tick => `<text x="${x(tick)}" y="294" text-anchor="middle">${tick}h</text>`).join('');
  const buyMark = model.buyTime <= HORIZON ? `<line x1="${x(model.buyTime)}" x2="${x(model.buyTime)}" y1="${top}" y2="${lowerBottom}" class="lab-purchase-line"/><circle cx="${x(model.buyTime)}" cy="${y(model.cash(model.buyTime, true))}" r="4" class="lab-purchase-dot"/>` : '';
  const crossing = model.paybackTime === null ? 'It never catches up when the cab earns nothing.' : `The cab path catches the saving path after ${duration(model.paybackTime)} of active play.`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Two model charts show wallet balances and the wallet difference over six active hours. The cab is purchased at ${duration(model.buyTime)}; its balance drops by ${money(settings.cabPrice - FIRST_CAB_AWARD)} after the award. ${crossing}">
    <text x="${left}" y="12" class="lab-chart-label">WALLET BALANCE</text>${cashGrid}${buyMark}
    <polyline points="${cashPath(false)}" class="lab-save-path"/><polyline points="${cashPath(true)}" class="lab-cab-path"/>
    <text x="${left}" y="185" class="lab-chart-label">CAB WALLET MINUS SAVE WALLET</text>${diffGrid}
    <polyline points="${difference}" class="lab-difference-path"/>${xTicks}
    <text x="${(left + right) / 2}" y="316" text-anchor="middle">Active play time</text>
  </svg>`;
}

function initialize(lab) {
  lab.innerHTML = `<div class="lab-head"><span>INTERACTIVE TEACHING MODEL</span><h3>Buy a cab, or keep the cash?</h3><p>Adjust the assumptions and watch what happens to your wallet.</p></div>
    <div class="lab-controls">
      <label for="lab-delivery"><span>Delivery income <output id="lab-delivery-out"></output> / active hour</span><input id="lab-delivery" type="range" min="20000" max="120000" step="5000" value="60000"></label>
      <label for="lab-price"><span>First Cybercab <output id="lab-price-out"></output></span><input id="lab-price" type="range" min="10000" max="100000" step="5000" value="25000"></label>
      <label for="lab-util"><span>Cab utilization <output id="lab-util-out"></output></span><input id="lab-util" type="range" min="0" max="100" step="5" value="75"></label>
      <label for="lab-cosmetic"><span>Optional cosmetic</span><select id="lab-cosmetic"><option value="0">None</option><option value="2000">Paint · $2,000</option><option value="5000">Decals · $5,000</option><option value="15000">Wheels · $15,000</option></select></label>
    </div>
    <div class="lab-legend" aria-label="Chart legend"><span class="lab-key lab-key-save">Save cash</span><span class="lab-key lab-key-cab">Buy one Cybercab</span><span class="lab-key lab-key-buy">Purchase</span></div>
    <div class="lab-graphic"></div><div class="lab-results" aria-live="polite" aria-atomic="true"></div>
    <p class="lab-assumptions">Both paths start with $2,500, earn deliveries at a constant rate and buy the chosen cosmetic when affordable. The cab earns $15,000 per active hour at full utilization; its $5,000 purchase award is paid once.</p>
    <button type="button" class="lab-reset">Reset assumptions</button>`;
  const delivery = lab.querySelector('#lab-delivery');
  const price = lab.querySelector('#lab-price');
  const utilization = lab.querySelector('#lab-util');
  const cosmetic = lab.querySelector('#lab-cosmetic');
  const controls = [delivery, price, utilization, cosmetic];
  function update() {
    const settings = { deliveryHourly: Number(delivery.value), cabPrice: Number(price.value), utilization: Number(utilization.value) / 100, cosmetic: Number(cosmetic.value) };
    const model = investmentModel(settings);
    lab.querySelector('#lab-delivery-out').textContent = money(settings.deliveryHourly);
    lab.querySelector('#lab-price-out').textContent = money(settings.cabPrice);
    lab.querySelector('#lab-util-out').textContent = `${Math.round(settings.utilization * 100)}%`;
    lab.querySelector('.lab-graphic').innerHTML = chart(model, settings, lab.clientWidth < 500);
    const buy = model.buyTime > HORIZON ? `Buy after ${duration(model.buyTime)} (outside the chart)` : `Buy after ${duration(model.buyTime)}`;
    const crossover = model.paybackTime === null ? 'No cash payback at zero utilization' : `Cash catches up after ${duration(model.paybackTime)}${model.paybackTime > HORIZON ? ' (outside the chart)' : ''}`;
    lab.querySelector('.lab-results').innerHTML = `<div><span>PURCHASE</span><strong>${escapeText(buy)}</strong></div><div><span>BREAK-EVEN</span><strong>${escapeText(crossover)}</strong></div><div><span>CASH AFTER 6 HOURS</span><strong>${money(model.cash(HORIZON, true))} cab · ${money(model.cash(HORIZON, false))} save</strong></div><div><span>CUMULATIVE EARNED AFTER 6 HOURS</span><strong>${money(model.earned(HORIZON, true))} cab · ${money(model.earned(HORIZON, false))} save</strong></div><p>“Earned” counts deliveries, the cab award and cab income. Wallet balance also reflects starting cash and purchases.</p>`;
  }
  controls.forEach(control => control.addEventListener('input', update));
  lab.querySelector('.lab-reset').addEventListener('click', () => { delivery.value = '60000'; price.value = '25000'; utilization.value = '75'; cosmetic.value = '0'; update(); });
  window.addEventListener('resize', update);
  update();
}

if (typeof document !== 'undefined') {
  const lab = document.getElementById('investment-lab');
  if (lab) initialize(lab);
}
