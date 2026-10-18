import { CURRENT_RELEASE } from '../content/version';

export const LAST_PLAYED_KEY = 'polyav:last-played';
export type LastPlayed = { version: string; playedAt: string };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** A missing, blocked or malformed browser store must never stop the game. */
export function readLastPlayed(storage: StorageLike): LastPlayed | null {
  try {
    const raw = storage.getItem(LAST_PLAYED_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { version, playedAt } = value as Record<string, unknown>;
    if (typeof version !== 'string' || !/^[0-9A-Za-z.+-]{1,64}$/.test(version) ||
        typeof playedAt !== 'string' || !Number.isFinite(Date.parse(playedAt))) return null;
    return { version, playedAt };
  } catch { return null; }
}
export function writeLastPlayed(storage: StorageLike, now = new Date()): boolean {
  try {
    storage.setItem(LAST_PLAYED_KEY, JSON.stringify({ version: CURRENT_RELEASE.version, playedAt: now.toISOString() }));
    return true;
  } catch { return false; }
}
export function browserStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}
