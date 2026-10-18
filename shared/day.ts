/** A fictional Bay Area day, derived from authoritative simulation seconds. */
export const DAY_LENGTH_SECONDS = 48 * 60;
export const DAY_START_MINUTE = 6 * 60;

/** The clock advances 30 game seconds per real simulation second. */
export function dayMinute(time: number): number {
  const minute = DAY_START_MINUTE + time * 1440 / DAY_LENGTH_SECONDS;
  return ((minute % 1440) + 1440) % 1440;
}

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Arcade demand profile. Timings are fictional; values are not measured traffic. */
export function trafficDemand(time: number): { intensity: number; morning: number; evening: number } {
  const hour = dayMinute(time) / 60;
  const morning = smoothstep(6.5, 7.5, hour) * (1 - smoothstep(9, 10, hour));
  const evening = smoothstep(15.5, 16.5, hour) * (1 - smoothstep(18, 19, hour));
  const daylight = smoothstep(6, 7, hour) * (1 - smoothstep(20, 21, hour));
  return { intensity: .2 + .2 * daylight + .6 * Math.max(morning, evening), morning, evening };
}
