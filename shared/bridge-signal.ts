/** Arcade signal controlling the eastbound San Francisco approach to the Bay Bridge. */
export const BAY_BRIDGE_SIGNAL = {
  stopX: 50,
  centerZ: 60,
  halfWidth: 10,
  // A decorative light can stand on the right shoulder without blocking the road.
  lightX: 50,
  lightZ: 73,
  cycleSeconds: 48,
  greenSeconds: 30,
} as const;

/** Signal timing uses real simulation seconds, independently of the accelerated day. */
export function bayBridgeSignal(time:number):{state:'green'|'red';secondsRemaining:number}{
  const {cycleSeconds,greenSeconds}=BAY_BRIDGE_SIGNAL;
  const phase=((time%cycleSeconds)+cycleSeconds)%cycleSeconds;
  return phase<greenSeconds
    ? {state:'green',secondsRemaining:greenSeconds-phase}
    : {state:'red',secondsRemaining:cycleSeconds-phase};
}
