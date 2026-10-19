// Record only control diagnostics; never persist identity or other message data.
export function controlEvent(direction, message, atMs) {
  if (!message || typeof message !== 'object' || !Number.isFinite(atMs)) return null;
  if (direction === 'sent' && message.type === 'input' &&
      [message.seq, message.targetTick, message.controlRevision, message.actionSeq, message.input?.jump].every(Number.isSafeInteger) &&
      typeof message.input?.hover === 'boolean' && (message.input.jump > 0 || message.input.hover)) {
    return { atMs, type: 'sent', seq: message.seq, targetTick: message.targetTick,
      controlRevision: message.controlRevision, actionSeq: message.actionSeq,
      jump: message.input.jump, hover: message.input.hover };
  }
  if (direction === 'received' && message.type === 'inputEdge' && message.kind === 'jump' &&
      Number.isSafeInteger(message.id) && Number.isSafeInteger(message.targetTick) &&
      ['accepted', 'rescheduled', 'processed', 'expired', 'superseded'].includes(message.status))
    return { atMs, type: 'edge', id: message.id, status: message.status, targetTick: message.targetTick };
  if (direction === 'received' && message.type === 'inputRejected' &&
      Number.isSafeInteger(message.seq) && Number.isSafeInteger(message.targetTick) &&
      ['epoch', 'revision', 'order', 'action', 'late', 'future'].includes(message.reason))
    return { atMs, type: 'rejected', seq: message.seq, targetTick: message.targetTick, reason: message.reason };
  return null;
}
