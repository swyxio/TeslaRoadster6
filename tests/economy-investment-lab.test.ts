import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investmentModel } from '../public/blog/economy/investment-lab.js';

const assumptions = { deliveryHourly: 60000, cabPrice: 25000, utilization: 0.75, cosmetic: 0 };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('investment requires full cash before the award and earns only after buying', () => {
  const model = investmentModel(assumptions);
  near(model.buyTime, 0.375);
  near(model.cash(model.buyTime, true, false), 25000);
  near(model.cash(model.buyTime, true), 5000);
  near(model.earned(model.buyTime, true), 27500);
  near(model.cabHourly, 11250);
  near(model.paybackTime!, 0.375 + 20000 / 11250);
  near(model.cash(model.paybackTime!, true), model.cash(model.paybackTime!, false));
  near(model.cash(6, true), 405781.25);
  near(model.cash(6, false), 362500);
  near(model.earned(6, true), 428281.25);
});

test('an optional cosmetic is paid by both paths and delays the cash-gated cab', () => {
  const model = investmentModel({ ...assumptions, cosmetic: 15000 });
  near(model.cosmeticTime!, 12500 / 60000);
  near(model.cash(model.cosmeticTime!, true, false), 15000);
  near(model.cash(model.cosmeticTime!, true), 0);
  near(model.buyTime, 0.625);
  near(model.cash(model.buyTime, true, false), 25000);
  near(model.cash(model.buyTime, true), 5000);
  near(model.cash(model.buyTime, false), 25000);
  near(model.earned(model.buyTime, false), 37500);
});

test('zero cab utilization never pays back its net cost', () => {
  const model = investmentModel({ ...assumptions, utilization: 0 });
  assert.equal(model.paybackTime, null);
  near(model.cash(6, false) - model.cash(6, true), 20000);
});

test('invalid assumptions are rejected', () => {
  assert.throws(() => investmentModel({ ...assumptions, deliveryHourly: 0 }), RangeError);
  assert.throws(() => investmentModel({ ...assumptions, utilization: 1.1 }), RangeError);
  assert.throws(() => investmentModel({ ...assumptions, cabPrice: 4000 }), RangeError);
});
