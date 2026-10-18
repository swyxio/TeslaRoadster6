/** Shared validation rules for the room and global-chat display names. */
export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 240;

// Remove control, direction override, and zero-width formatting characters so
// names and messages remain legible. NFKC also collapses common width variants.
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
const codePoints = (value: string) => Array.from(value);

export function normalizeName(value: string): string {
  const cleaned = value.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
  return codePoints(cleaned).slice(0, MAX_NAME_LENGTH).join('') || 'Driver';
}

/** Active names are unique ignoring case; unsaved names are not reserved. */
export function chooseAvailableName(value: string, occupied: Iterable<string>): string {
  const name = normalizeName(value);
  const used = new Set(Array.from(occupied, entry => normalizeName(entry).toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` #${n}`;
    const candidate = codePoints(name).slice(0, MAX_NAME_LENGTH - suffix.length).join('').trimEnd() + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Empty or oversized messages are rejected rather than silently truncated. */
export function normalizeChatText(value: string): string | null {
  const text = value.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
  return text && codePoints(text).length <= MAX_CHAT_LENGTH ? text : null;
}

export function parseRecoveryCode(value: string): { playerId: string; secret: string } | null {
  const match = /^poly-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([0-9a-f]{64})$/i.exec(value.trim());
  return match ? { playerId: match[1].toLowerCase(), secret: match[2].toLowerCase() } : null;
}

export function createRecoveryCode(playerId: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `poly-${playerId}.${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function hashRecoverySecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
