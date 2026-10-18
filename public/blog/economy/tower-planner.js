const floorCost = floor => floor === 1 ? 1200000 : Math.round(200000 * 1.1 ** (floor - 2) / 1000) * 1000;
const awards = [[1, 5000], [5, 10000], [10, 25000], [20, 50000]];
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function towerPlan(floors) {
  if (!Number.isInteger(floors) || floors < 1 || floors > 20) throw new RangeError('Choose 1–20 floors');
  const cost = 800000 + Array.from({ length: floors }, (_, i) => floorCost(i + 1)).reduce((a, b) => a + b, 0);
  const earned = awards.filter(([floor]) => floor <= floors).reduce((sum, [, award]) => sum + award, 0);
  return { cost, earned, net: cost - earned, next: floors < 20 ? floorCost(floors + 1) : null };
}

function initialize(planner) {
  planner.innerHTML = `<div class="tower-heading"><div><span>DEVELOPER'S DESK</span><h3>Build your skyline</h3><p>Start with an $800k plot and a $1.2m foundation. Add stories as your delivery career grows.</p></div><div class="tower-stack" aria-hidden="true"></div></div>
    <label class="tower-control" for="tower-floors"><strong>Stories</strong><output for="tower-floors">1</output></label>
    <input id="tower-floors" class="tower-range" type="range" min="1" max="20" value="1" step="1">
    <div class="tower-ticks" aria-hidden="true"><span>1</span><span>5</span><span>10</span><span>15</span><span>20</span></div>
    <div class="tower-results" aria-live="polite" aria-atomic="true"></div>
    <p class="tower-note">First development plot, including land. Milestone awards at floors 1, 5, 10 and 20 reduce the net cost. No rent is assumed.</p>`;
  const range = planner.querySelector('input');
  const output = planner.querySelector('output');
  const stack = planner.querySelector('.tower-stack');
  const results = planner.querySelector('.tower-results');
  function update() {
    const n = Number(range.value), plan = towerPlan(n);
    output.textContent = String(n);
    stack.innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i < n ? 'built' : ''}"></i>`).reverse().join('');
    results.innerHTML = `<div><span>LAND + BUILD</span><strong>${money(plan.cost)}</strong></div><div><span>AWARDS EARNED</span><strong>${money(plan.earned)}</strong></div><div><span>NET SPENT</span><strong>${money(plan.net)}</strong></div><div><span>NEXT STORY</span><strong>${plan.next === null ? 'Complete' : money(plan.next)}</strong></div>`;
  }
  range.addEventListener('input', update);
  update();
}
if (typeof document !== 'undefined') {
  const planner = document.getElementById('tower-planner');
  if (planner) initialize(planner);
}
