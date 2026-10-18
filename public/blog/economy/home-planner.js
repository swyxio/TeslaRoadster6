const START_CASH = 2000000;
const PLOT_PRICE = 400000;
const BUILD_PRICE = 600000;
const PROPERTY_AWARDS = 20000;
const LEVEL_THRESHOLDS = [0, 10000, 50000, 250000, 500000, 1000000, 2000000, 4000000, 8000000];

const UPGRADES = [
  { id: 'furnishing', label: 'Furnishing', description: 'Give the house a look of its own.', price: 20000 },
  { id: 'charger', label: 'Home charger', description: 'Recharge before heading out.', price: 25000 },
  { id: 'garage', label: 'Third garage bay', description: 'Make room for another car.', price: 50000 },
  { id: 'launch', label: 'Launch pad or thermal', description: 'Take off toward the city.', price: 50000 }
];

/** Estimate the proposed purchase from exactly the property-market entry balance. */
export function homePlan(purchased, selected = []) {
  if (typeof purchased !== 'boolean' || !Array.isArray(selected) ||
      new Set(selected).size !== selected.length || selected.some(id => !UPGRADES.some(upgrade => upgrade.id === id)) ||
      (!purchased && selected.length)) {
    throw new RangeError('Invalid home plan');
  }
  const upgradeCost = UPGRADES.filter(upgrade => selected.includes(upgrade.id)).reduce((total, upgrade) => total + upgrade.price, 0);
  const cash = START_CASH - (purchased ? PLOT_PRICE + BUILD_PRICE - PROPERTY_AWARDS : 0) - upgradeCost;
  const level = LEVEL_THRESHOLDS.reduce((highest, threshold, index) => cash >= threshold ? index : highest, 0);
  return { cash, level, upgradeCost };
}

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

function initialize(planner) {
  planner.innerHTML = `<div class="home-planner-head"><span>HOME PLANNER</span><h3>Make a place your own</h3><p>Start at the $2 million property-market threshold. Plan a starter plot and build, then choose what to add.</p></div>
    <div class="home-planner-views" aria-label="Property concept art">
      <figure><img src="/blog/economy/home-starter-concept.webp" alt="Starter home with a two-car garage overlooking the Bay." loading="lazy"><figcaption>01 · STARTER HOME</figcaption></figure>
      <figure><img src="/blog/economy/home-concept.webp" alt="The same house imagined with a charger, furnished terrace and launch ramp." loading="lazy"><figcaption>02 · AN UPGRADED HOME</figcaption></figure>
    </div>
    <p class="home-planner-view-caption">Concept art: a starter home and one possible upgrade, with a charger, furnished terrace and launch pad.</p>
    <div class="home-planner-purchase"><div><span>FIRST HOME</span><strong>$400,000 plot + $600,000 build</strong><small>Includes a two-car garage and home teleport. First property awards return $20,000.</small></div><button type="button" class="home-planner-buy">Plan this home</button></div>
    <fieldset class="home-planner-upgrades" disabled><legend>Choose your upgrades</legend><div class="home-planner-options">${UPGRADES.map(upgrade => `<label><input type="checkbox" value="${upgrade.id}"><span><strong>${upgrade.label}</strong><small>${upgrade.description}</small></span><b>${money(upgrade.price)}</b></label>`).join('')}</div></fieldset>
    <div class="home-planner-results" aria-live="polite" aria-atomic="true"></div>
    <p class="home-planner-note">A purchase can lower your level. Your home and improvements stay yours. The plan counts the $20,000 first-property awards and leaves out future first-use rewards.</p>
    <button type="button" class="home-planner-reset">Reset plan</button>`;
  const buy = planner.querySelector('.home-planner-buy');
  const upgrades = planner.querySelector('.home-planner-upgrades');
  const checks = Array.from(upgrades.querySelectorAll('input'));
  let purchased = false;

  function update() {
    const selected = checks.filter(check => check.checked).map(check => check.value);
    const plan = homePlan(purchased, selected);
    upgrades.disabled = !purchased;
    buy.disabled = purchased;
    buy.textContent = purchased ? 'Home planned' : 'Plan this home';
    planner.querySelector('.home-planner-results').innerHTML = `<div><span>WALLET</span><strong>${money(plan.cash)}</strong></div><div><span>CURRENT LEVEL</span><strong>Level ${plan.level}</strong></div><div><span>UPGRADES</span><strong>${money(plan.upgradeCost)}</strong></div>`;
  }

  buy.addEventListener('click', () => { purchased = true; update(); checks[0].focus(); });
  checks.forEach(check => check.addEventListener('change', update));
  planner.querySelector('.home-planner-reset').addEventListener('click', () => { purchased = false; checks.forEach(check => { check.checked = false; }); update(); buy.focus(); });
  update();
}

if (typeof document !== 'undefined') {
  const planner = document.getElementById('home-planner');
  if (planner) initialize(planner);
}
