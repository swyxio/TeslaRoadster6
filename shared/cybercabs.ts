/** The five proposed prices and one-time ownership milestones, in game dollars. */
export const CYBERCAB_PRICES = [25_000, 50_000, 100_000, 200_000, 400_000] as const;
export const CYBERCAB_OWNERSHIP_AWARDS = [5_000, 10_000, 20_000, 40_000, 80_000] as const;

/**
 * Quote the next cab from server-owned state. Award milestones must be stored
 * permanently, even if ownership later falls. Debit, award, ownership, and
 * the claimed milestone must commit together; this function does not commit.
 */
export function quoteCybercabPurchase(ownedCount: number, claimedAwards: readonly number[]) {
  if (!Number.isSafeInteger(ownedCount) || ownedCount < 0 || ownedCount >= CYBERCAB_PRICES.length ||
      !Array.isArray(claimedAwards) || claimedAwards.some(n => !Number.isInteger(n) || n < 1 || n > CYBERCAB_OWNERSHIP_AWARDS.length) ||
      new Set(claimedAwards).size !== claimedAwards.length) return null;
  const ordinal = ownedCount + 1;
  return { ordinal, price: CYBERCAB_PRICES[ownedCount], award: claimedAwards.includes(ordinal) ? 0 : CYBERCAB_OWNERSHIP_AWARDS[ownedCount] };
}

/** One-time milestone for each cab's cumulative gross income. The claim is stored with that cab. */
export function cabRevenueAward(gross:number, claimed:boolean):number|null {
  if(!Number.isSafeInteger(gross)||gross<0||typeof claimed!=='boolean')return null;
  return !claimed&&gross>=20_000?2_000:0;
}

// Keep the same numerator units as the shared event accrual contract: hourly
// dollars times milliseconds times half-multiplier units. This remainder can
// be carried into event-aware settlement once event history is authoritative.
export const CYBERCAB_HOURLY_RATE = 15_000;
export const CYBERCAB_INCOME_DENOMINATOR = 2 * 60 * 60 * 1000;
export type CybercabIncome = { amount: number; remainder: number };

/**
 * Settle one server-measured interval for one operating cab. Persist remainder
 * alongside the credited amount so splitting intervals or reconnecting cannot
 * change the result. Eligibility and elapsed milliseconds must come from the
 * authoritative server, never a client; inactive intervals earn nothing.
 *
 * Inputs and outputs are safe integers. BigInt prevents intermediate overflow;
 * the wallet owner must separately check that adding amount remains safe.
 * Invalid state or unsupported rates return null and must not credit income.
 */
export function settleCybercabIncome(elapsedMs: number, multiplier: number, operating: boolean, remainder: number): CybercabIncome | null {
  const halfRate = multiplier === 1 ? 2 : multiplier === 1.5 ? 3 : multiplier === 2 ? 4 : multiplier === 3 ? 6 : 0;
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || !halfRate || typeof operating !== 'boolean' ||
      !Number.isSafeInteger(remainder) || remainder < 0 || remainder >= CYBERCAB_INCOME_DENOMINATOR) return null;
  if (!operating) return { amount: 0, remainder };
  const units = BigInt(CYBERCAB_HOURLY_RATE) * BigInt(elapsedMs) * BigInt(halfRate) + BigInt(remainder);
  const denominator = BigInt(CYBERCAB_INCOME_DENOMINATOR);
  const amount = units / denominator;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { amount: Number(amount), remainder: Number(units % denominator) };
}
