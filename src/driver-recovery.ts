export const DRIVER_RECOVERY_KEY = 'poly-av-driver-recovery';
export const DRIVER_PENDING_KEY = 'poly-av-driver-pending-recovery';
export const DRIVER_REMEMBER_KEY = 'poly-av-driver-remember';

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type RecoverySnapshot = { remember: boolean; remembered?: string; pending?: string; available: boolean };

export function readDriverRecovery(storage: RecoveryStorage | null): RecoverySnapshot {
  try {
    if (!storage) throw new Error('Storage unavailable');
    if (storage.getItem(DRIVER_REMEMBER_KEY) === 'off') return { remember: false, available: true };
    return { remember: true, remembered: storage.getItem(DRIVER_RECOVERY_KEY) || undefined, pending: storage.getItem(DRIVER_PENDING_KEY) || undefined, available: true };
  } catch { return { remember: true, available: false }; }
}

// Do not discard another unfinished save: its bind might already have committed.
export function stageDriverRecovery(storage: RecoveryStorage | null, code: string): 'ok' | 'pending' | 'unavailable' {
  try {
    if (!storage) throw new Error('Storage unavailable');
    if (storage.getItem(DRIVER_RECOVERY_KEY) === code) return 'ok';
    const pending = storage.getItem(DRIVER_PENDING_KEY);
    if (pending && pending !== code) return 'pending';
    storage.setItem(DRIVER_PENDING_KEY, code);
    return 'ok';
  } catch { return 'unavailable'; }
}

// Called only after the room confirms the matching binding.
export function confirmDriverRecovery(storage: RecoveryStorage | null, code: string): { saved: boolean; cleared: boolean } {
  if (!storage) return { saved: false, cleared: false };
  try { storage.setItem(DRIVER_RECOVERY_KEY, code); } catch { return { saved: false, cleared: false }; }
  try {
    if (storage.getItem(DRIVER_PENDING_KEY) === code) storage.removeItem(DRIVER_PENDING_KEY);
    return { saved: true, cleared: true };
  } catch { return { saved: true, cleared: false }; }
}

export function setDriverRemember(storage: RecoveryStorage | null, remember: boolean): boolean {
  try {
    if (!storage) throw new Error('Storage unavailable');
    if (remember) storage.removeItem(DRIVER_REMEMBER_KEY);
    else {
      storage.setItem(DRIVER_REMEMBER_KEY, 'off');
      storage.removeItem(DRIVER_RECOVERY_KEY);
      storage.removeItem(DRIVER_PENDING_KEY);
    }
    return true;
  } catch { return false; }
}

export function forgetDriverRecovery(storage: RecoveryStorage | null): boolean {
  try {
    if (!storage) throw new Error('Storage unavailable');
    storage.removeItem(DRIVER_RECOVERY_KEY);
    storage.removeItem(DRIVER_PENDING_KEY);
    return true;
  } catch { return false; }
}
