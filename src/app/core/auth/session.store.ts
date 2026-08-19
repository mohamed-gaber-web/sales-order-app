import { computed, inject, Injectable, signal } from '@angular/core';
import type { Authenticated } from '../api/api-contracts';
import { DeviceStorageService, STORAGE_KEYS } from '../storage/device-storage.service';

/** Who is signed in. Identity only — never a credential. */
export interface Identity {
  user: Authenticated['user'];
  tenant: Authenticated['tenant'];
  /**
   * What this session may do, as the API reported it at sign-in.
   *
   * A rendering input and nothing else: it decides which menu entries are drawn.
   * It is not an authorisation boundary and must never be treated as one — it is
   * persisted on the device, so it is editable, and editing it changes what this
   * app draws and nothing about what the API will do. Every request is re-checked
   * against the signed token claim.
   */
  permissions: string[];
}

/**
 * The session, split three ways on purpose.
 *
 * - **Identity** (who you are) → persisted. Not a credential, and keeping it
 *   means a returning user sees their own name and workspace rather than a
 *   blank shell while the token is being refreshed.
 * - **Access token** → memory only. It lives fifteen minutes and the refresh
 *   token can always rebuild it, so persisting it would add exposure and buy
 *   nothing. It is also the credential that reaches the ERP proxy.
 * - **Refresh token** → persisted. It has to be: a device that is offline
 *   overnight must not force a re-login in the morning.
 *
 * Kept separate from `UserAuthService` so the interceptor can read a token
 * without importing the service that issues the requests it intercepts.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly storage = inject(DeviceStorageService);

  private readonly identityState = signal<Identity | null>(null);
  private readonly accessTokenState = signal<string | null>(null);
  private readonly refreshTokenState = signal<string | null>(null);
  /** When the access token stops being usable, in epoch milliseconds. */
  private readonly expiresAtState = signal<number>(0);

  readonly identity = this.identityState.asReadonly();
  readonly refreshToken = this.refreshTokenState.asReadonly();

  readonly user = computed(() => this.identityState()?.user ?? null);
  readonly tenant = computed(() => this.identityState()?.tenant ?? null);
  readonly permissions = computed(() => this.identityState()?.permissions ?? []);

  /**
   * True when there is a session to work with.
   *
   * Holding only a refresh token counts. That is the state a cold start leaves
   * behind, and treating it as signed-out would bounce a user to the login
   * screen every morning with a perfectly good session in storage.
   */
  readonly isAuthenticated = computed(
    () => this.identityState() !== null && this.refreshTokenState() !== null
  );

  readonly workspaceName = computed(() => {
    const tenant = this.tenant();
    return tenant?.name || tenant?.slug || '';
  });

  /** Display name from the address, since the API's user DTO has no name field. */
  readonly displayName = computed(() => {
    const email = this.user()?.email;
    if (!email) return '';
    const [local] = email.split('@');
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  });

  accessToken(): string | null {
    return this.accessTokenState();
  }

  /** True when the access token is missing or close enough to expiry to replace. */
  needsRefresh(): boolean {
    if (this.accessTokenState() === null) return true;
    // Ninety seconds, not the five minutes the old D365 token used: that was a
    // third of this token's entire fifteen-minute life, and it would have this
    // app refreshing almost continuously.
    return Date.now() > this.expiresAtState() - 90_000;
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  /** Adopts a sign-in or a rotation. */
  async set(session: Authenticated): Promise<void> {
    const identity: Identity = {
      user: session.user,
      tenant: session.tenant,
      permissions: session.permissions,
    };
    this.identityState.set(identity);
    this.accessTokenState.set(session.accessToken);
    this.refreshTokenState.set(session.refreshToken);
    this.expiresAtState.set(Date.now() + session.expiresIn * 1000);

    await this.storage.setJson(STORAGE_KEYS.identity, identity);
    // Stored immediately, and this is load-bearing: the token just returned
    // replaced a single-use one. Losing it before it reaches storage loses the
    // session, because the token it replaced is already spent.
    await this.storage.set(STORAGE_KEYS.refreshToken, session.refreshToken);
  }

  /** Rebuilds what survived the last run. No access token — that is not stored. */
  async restore(): Promise<void> {
    const identity = await this.storage.getJson<Identity>(STORAGE_KEYS.identity);
    const refreshToken = await this.storage.get(STORAGE_KEYS.refreshToken);

    // Both or neither. An identity with no token cannot make a request, and a
    // token with no identity renders an app that does not know whose it is;
    // either half alone is a state no screen is written for.
    if (identity && refreshToken && isIdentity(identity)) {
      this.identityState.set(identity);
      this.refreshTokenState.set(refreshToken);
    } else {
      await this.clear();
    }
  }

  async clear(): Promise<void> {
    this.identityState.set(null);
    this.accessTokenState.set(null);
    this.refreshTokenState.set(null);
    this.expiresAtState.set(0);
    await this.storage.remove(STORAGE_KEYS.identity);
    await this.storage.remove(STORAGE_KEYS.refreshToken);
  }
}

/**
 * Shape-checks a restored identity.
 *
 * Checked rather than trusted: this value is user-writable, and a half-written
 * or hand-edited one would otherwise crash on the first render. Checked rather
 * than defaulted, too — an identity stored before `permissions` existed has
 * *unknown* permissions, and treating unknown as empty would show a returning
 * user an app with half its menu missing until they signed in again.
 */
function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Identity>;
  return (
    typeof candidate.user?.id === 'string' &&
    typeof candidate.user?.email === 'string' &&
    typeof candidate.tenant?.id === 'string' &&
    typeof candidate.tenant?.slug === 'string' &&
    typeof candidate.tenant?.name === 'string' &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every((permission) => typeof permission === 'string')
  );
}
