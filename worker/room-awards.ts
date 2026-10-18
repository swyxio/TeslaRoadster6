import type { AchievementId } from '../shared/achievements';

type Outbox = Record<string, AchievementId[]>;
type AwardBridge = { recordRoomAwards(playerId: string, achievementIds: AchievementId[]): Promise<unknown> };
const OUTBOX_KEY = 'award-outbox';
const RETRY_MS = 10_000;
const MAX_DRIVERS = 256;

/** A bounded, durable union of room-earned awards awaiting the identity hub. */
export class RoomAwardOutbox {
  private outbox: Outbox = {};
  private reservations = new Map<string, number>();
  private pending = new Map<string, number>();
  private writes: Promise<void> = Promise.resolve();
  private delivery: Promise<void> | null = null;

  constructor(private storage: DurableObjectStorage, private bridge: () => AwardBridge, private waitUntil: (promise: Promise<unknown>) => void) {}

  async load() { this.outbox = await this.storage.get<Outbox>(OUTBOX_KEY) ?? {}; }

  /** Reserve capacity before accepting a binding, including in-flight writes. */
  reserve(playerId: string): boolean {
    const ids = new Set([...Object.keys(this.outbox), ...this.reservations.keys(), ...this.pending.keys()]);
    if (!ids.has(playerId) && ids.size >= MAX_DRIVERS) return false;
    this.reservations.set(playerId, (this.reservations.get(playerId) ?? 0) + 1);
    return true;
  }
  release(playerId: string) { this.decrement(this.reservations, playerId); }
  private decrement(map: Map<string, number>, playerId: string) {
    const count = map.get(playerId) ?? 0;
    if (count <= 1) map.delete(playerId); else map.set(playerId, count - 1);
  }

  /** Resolve only after the union and its retry alarm are both durable. */
  async enqueue(playerId: string, ids: AchievementId[]) {
    if (!ids.length) return;
    this.pending.set(playerId, (this.pending.get(playerId) ?? 0) + 1);
    try {
      await this.mutate(outbox => { outbox[playerId] = [...new Set([...(outbox[playerId] ?? []), ...ids])]; });
    } finally { this.decrement(this.pending, playerId); }
    this.kick();
  }

  // Every outbox mutation, including acknowledgement, is serialized. A late
  // acknowledgement removes only the IDs it sent, preserving newer additions.
  private mutate(update: (outbox: Outbox) => void): Promise<void> {
    const operation = this.writes.then(async () => {
      const next: Outbox = Object.fromEntries(Object.entries(this.outbox).map(([id, values]) => [id, [...values]]));
      update(next);
      await this.storage.transaction(async transaction => {
        if (Object.keys(next).length) {
          await transaction.put(OUTBOX_KEY, next);
          await transaction.setAlarm(Date.now() + RETRY_MS);
        } else {
          await transaction.delete(OUTBOX_KEY);
          await transaction.deleteAlarm();
        }
      });
      this.outbox = next;
    });
    this.writes = operation.catch(() => {});
    return operation;
  }

  private kick(): Promise<void> {
    if (this.delivery) return this.delivery;
    const task = this.deliver().finally(() => { this.delivery = null; });
    this.delivery = task;
    this.waitUntil(task.catch(() => {}));
    return task;
  }

  private async deliver() {
    // Different identities are independent. A failed delivery stays in the
    // outbox for the alarm; an identical retry is safe at the identity hub.
    await this.writes;
    for (const [playerId, ids] of Object.entries(this.outbox).map(([id, values]) => [id, [...values]] as const)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Award delivery timed out')), 5_000);
          Promise.resolve(this.bridge().recordRoomAwards(playerId, [...ids])).then(
            () => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); },
          );
        });
      } catch { continue; }
      await this.mutate(outbox => {
        const remaining = (outbox[playerId] ?? []).filter(id => !ids.includes(id));
        if (remaining.length) outbox[playerId] = remaining; else delete outbox[playerId];
      });
    }
  }

  /** Alarms are consumed before invocation; re-arm durably before retrying. */
  async alarm() {
    await this.mutate(() => {});
    await this.kick();
  }
}
