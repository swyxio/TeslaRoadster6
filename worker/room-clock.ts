const STEP_MS = 50;

/** Deadline for the next fixed room step, sampled once per timer callback. */
export class RoomClock {
  private deadline: number;

  constructor(now: number) {
    this.deadline = now + STEP_MS;
  }

  /** Advance one deadline, discarding all but one overdue step after a stall. */
  afterStep(now: number): number {
    if (now < this.deadline - STEP_MS) {
      // A wall-clock correction must not suspend a live room indefinitely.
      this.deadline = now + STEP_MS;
    } else {
      this.deadline = Math.max(this.deadline + STEP_MS, now);
    }
    return this.deadline - now;
  }
}
