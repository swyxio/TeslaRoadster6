import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CYBERCAB_INCOME_DENOMINATOR, firstCabRevenueAward, quoteCybercabPurchase, settleCybercabIncome } from '../shared/cybercabs';

test('five ordinal purchases have fixed prices and one-time ownership awards', () => {
  const prices = [25_000, 50_000, 100_000, 200_000, 400_000];
  const awards = [5_000, 10_000, 20_000, 40_000, 80_000];
  for (let count = 0; count < 5; count++) {
    assert.deepEqual(quoteCybercabPurchase(count, []), { ordinal: count + 1, price: prices[count], award: awards[count] });
    assert.deepEqual(quoteCybercabPurchase(count, [count + 1]), { ordinal: count + 1, price: prices[count], award: 0 });
  }
  const claimed = [1, 2];
  assert.equal(quoteCybercabPurchase(0, claimed)?.award, 0, 'reacquisition cannot pay the same milestone again');
  assert.deepEqual(claimed, [1, 2], 'quoting does not mutate saved milestones');
});

test('quotes fail closed for the sixth cab or invalid saved state', () => {
  for (const count of [-1, 1.5, 5, 6, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(quoteCybercabPurchase(count, []), null);
  for (const awards of [[0], [6], [1.5], [NaN], [1, 1]])
    assert.equal(quoteCybercabPurchase(0, awards), null);
});

test('the first cab revenue milestone pays once at $20,000 gross', () => {
  assert.equal(firstCabRevenueAward(19_999,false),0);
  assert.equal(firstCabRevenueAward(20_000,false),2_000);
  assert.equal(firstCabRevenueAward(20_001,true),0);
  for(const gross of [-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(firstCabRevenueAward(gross,false),null);
});

test('one operating hour pays the specified rate at every supported multiplier', () => {
  for (const [multiplier, amount] of [[1, 15_000], [1.5, 22_500], [2, 30_000], [3, 45_000]])
    assert.deepEqual(settleCybercabIncome(3_600_000, multiplier, true, 0), { amount, remainder: 0 });
});

test('fractional dollars survive settlement and multiplier changes', () => {
  const first = settleCybercabIncome(100, 1, true, 0)!;
  assert.deepEqual(first, { amount: 0, remainder: 200 });
  const second = settleCybercabIncome(100, 1.5, true, first.remainder)!;
  assert.deepEqual(second, { amount: 1, remainder: 20 });
  const third = settleCybercabIncome(115, 2, true, second.remainder)!;
  assert.deepEqual(third, { amount: 1, remainder: 0 });
  const segments = [1, 1.5, 2, 3].reduce((result, multiplier) => {
    const next = settleCybercabIncome(240, multiplier, true, result.remainder)!;
    return { amount: result.amount + next.amount, remainder: next.remainder };
  }, { amount: 0, remainder: 0 });
  assert.deepEqual(segments, { amount: 7, remainder: 240 });
});

test('splitting an interval into persisted settlements does not change pay', () => {
  for (const multiplier of [1, 1.5, 2, 3]) {
    const pieces = [17, 1_000, 23, 123_456, 7];
    const total = pieces.reduce((result, elapsedMs) => {
      const next = settleCybercabIncome(elapsedMs, multiplier, true, result.remainder)!;
      return { amount: result.amount + next.amount, remainder: next.remainder };
    }, { amount: 0, remainder: 317 });
    assert.deepEqual(total, settleCybercabIncome(pieces.reduce((a, b) => a + b, 0), multiplier, true, 317));
  }
});

test('inactive and zero-length intervals preserve the unpaid remainder', () => {
  assert.deepEqual(settleCybercabIncome(3_600_000, 3, false, 479), { amount: 0, remainder: 479 });
  assert.deepEqual(settleCybercabIncome(0, 1, true, 479), { amount: 0, remainder: 479 });
  assert.deepEqual(settleCybercabIncome(1, 1, true, 479), { amount: 1, remainder: 1 });
});

test('invalid input never produces income', () => {
  for (const duration of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(settleCybercabIncome(duration, 1, true, 0), null);
  for (const multiplier of [0, -1, 1.1, 2.5, 4, NaN, Infinity])
    assert.equal(settleCybercabIncome(1000, multiplier, true, 0), null);
  for (const remainder of [-1, .5, CYBERCAB_INCOME_DENOMINATOR, NaN, Infinity])
    assert.equal(settleCybercabIncome(1000, 1, true, remainder), null);
  assert.equal(settleCybercabIncome(1000, 1, 1 as unknown as boolean, 0), null);
  assert.equal(settleCybercabIncome(-1, 1, false, 0), null, 'inactive does not bypass validation');
});

test('safe integer duration cannot overflow intermediate arithmetic', () => {
  const duration = Number.MAX_SAFE_INTEGER;
  const units = BigInt(duration) * 6n + 479n;
  assert.deepEqual(settleCybercabIncome(duration, 3, true, 479), {
    amount: Number(units / 480n), remainder: Number(units % 480n),
  });
});
