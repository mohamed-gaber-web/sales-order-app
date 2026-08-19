import { InjectionToken } from '@angular/core';

/**
 * Resolves once persisted session state has been read.
 *
 * Storage became asynchronous when it moved from `localStorage` to Capacitor
 * Preferences, and that turned a latent ordering assumption into a real bug:
 * `AuthGuard` answered synchronously, so a cold start that opened straight into
 * a deep link could be asked "is this user signed in" before the refresh token
 * had been read back. The honest answer at that instant is "not yet known", and
 * the guard needs somewhere to wait for it.
 *
 * A promise rather than a signal because the guard wants to *await* the answer
 * once, not react to it repeatedly.
 */
export interface SessionReady {
  readonly whenReady: Promise<void>;
  resolve(): void;
}

export const SESSION_READY = new InjectionToken<SessionReady>('SESSION_READY');

export function createSessionReady(): SessionReady {
  let resolve!: () => void;
  const whenReady = new Promise<void>((r) => {
    resolve = r;
  });
  return { whenReady, resolve };
}
