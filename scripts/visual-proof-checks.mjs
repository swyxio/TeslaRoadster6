// These observations describe the authoritative room, not rendered frames.
export function inspectGroundedBoost(manifest, poses, touch) {
  const events = manifest?.events;
  if (!Array.isArray(events) || !Array.isArray(poses) || manifest?.trajectory?.status !== 'available')
    return { status: 'unavailable', reason: 'Missing complete room trajectory or actions' };
  const start = touch ? events.filter(event => event.type === 'touchDown')[1]
    : events.find(event => event.type === 'keyDown' && event.key === 'Shift');
  const end = touch ? events.find(event => event.type === 'touchUp' && event.commandStartedAtMs > start?.commandStartedAtMs)
    : events.find(event => event.type === 'keyUp' && event.key === 'Shift' && event.commandStartedAtMs > start?.commandStartedAtMs);
  if (!start || !end || start.status !== 'ok' || end.status !== 'ok' ||
      !Number.isFinite(start.commandStartedAtMs) || !Number.isFinite(end.commandStartedAtMs))
    return { status: 'unavailable', reason: 'Missing successful boost press and release' };
  const grounded = poses.filter(pose => Number.isFinite(pose.atMs) && pose.atMs >= start.commandStartedAtMs &&
    pose.atMs < end.commandStartedAtMs && Number.isSafeInteger(pose.tick) && pose.supported === true &&
    Number.isSafeInteger(pose.thrusters) && (pose.thrusters & 1) !== 0 && Number.isFinite(pose.speed) && Math.abs(pose.speed) > 1);
  const durationMs = grounded.length ? grounded.at(-1).atMs - grounded[0].atMs : 0;
  const distinctTicks = new Set(grounded.map(pose => pose.tick)).size;
  return { status: grounded.length >= 3 && distinctTicks >= 3 && durationMs >= 250 ? 'observed' : 'not_observed',
    samples: grounded.length, distinctTicks, durationMs };
}

// A later successful retry must not hide a missed first jump.
export function inspectSingleJump(manifest, inputEvents, touch) {
  const actions = manifest?.events;
  if (!Array.isArray(actions) || !Array.isArray(inputEvents) || manifest?.inputEvents?.status === 'truncated')
    return { status: 'unavailable', reason: 'Missing actions or input-event trace' };
  const action = touch ? actions.filter(event => event.type === 'touchDown')[2]
    : actions.find(event => event.type === 'jumpUntilAirborne');
  if (!action || action.status !== 'ok' || !Number.isFinite(action.commandStartedAtMs))
    return { status: 'unavailable', reason: 'Missing successful jump action' };
  const events = inputEvents.filter(event => Number.isFinite(event.atMs) && event.atMs >= action.commandStartedAtMs);
  const sent = events.filter(event => event.type === 'sent' && Number.isSafeInteger(event.jump) && event.jump > 0);
  const outcomes = events.filter(event => event.type === 'edge' && Number.isSafeInteger(event.id) && event.id > 0);
  const ids = [...new Set([...sent.map(event => event.jump), ...outcomes.map(event => event.id)])];
  if (!ids.length || !sent.length || !outcomes.length)
    return { status: 'unavailable', reason: 'Missing sent jump or authoritative acknowledgement', ids, outcomes };
  const failed = ids.length !== 1 || outcomes.some(event => event.status === 'expired' || event.status === 'superseded');
  const processed = outcomes.some(event => event.id === ids[0] && event.status === 'processed');
  return { status: failed ? 'not_observed' : processed ? 'observed' : 'unavailable', ids, outcomes };
}
