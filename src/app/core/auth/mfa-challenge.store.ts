import { Injectable, computed, signal } from '@angular/core';
import { MfaRequired } from './portal-auth.models';

/**
 * The MFA challenge a sign-in is waiting on.
 *
 * **Memory only, and never persisted.** A challenge token proves a password was
 * correct and nothing more; treating it as a session, even briefly, would defeat
 * the second factor. It also carries a different audience from an access token,
 * so the API will not accept it anywhere but `/auth/mfa/verify`.
 *
 * The consequence is that a reload during the challenge loses it, which is why
 * `mfaChallengeGuard` sends a direct visit to `/auth/mfa` back to sign-in rather
 * than showing a code field that could never succeed.
 */
@Injectable({ providedIn: 'root' })
export class MfaChallengeStore {
  private readonly tokenState = signal<string | null>(null);
  private readonly expiresAtState = signal<number | null>(null);

  readonly token = this.tokenState.asReadonly();

  /** True while a challenge is outstanding and still inside its five-minute life. */
  readonly hasChallenge = computed(() => {
    const expiresAt = this.expiresAtState();
    return this.tokenState() !== null && expiresAt !== null && Date.now() < expiresAt;
  });

  set(challenge: MfaRequired): void {
    this.tokenState.set(challenge.challengeToken);
    this.expiresAtState.set(Date.now() + challenge.expiresIn * 1000);
  }

  clear(): void {
    this.tokenState.set(null);
    this.expiresAtState.set(null);
  }
}
