import { Injectable, computed, inject, signal } from '@angular/core';
import { Platform } from '@ionic/angular';
import {
  Authenticated,
  PortalIdentity,
  isPortalIdentity,
} from './portal-auth.models';

/** Who is signed in. Not a credential, so a returning user sees their own name. */
const IDENTITY_KEY = 'gp_session_identity';

/** The only persisted credential. See the note on storage choice below. */
const REFRESH_KEY = 'gp_session_refresh';

/**
 * Who is signed in, as one set of signals the whole app reads.
 *
 * Kept separate from `UserAuthService` so the interceptor and the guards can
 * read and clear a session without importing the service that issues requests —
 * which would put a cycle between the interceptor and the thing it intercepts.
 *
 * Three things are stored in three different places, on purpose:
 *
 * - **Identity** (who you are) -> `localStorage`. Not a credential.
 * - **Access token** -> memory only. It lives fifteen minutes and is reissuable
 *   from the refresh token, so persisting it would add exposure and buy nothing.
 * - **Refresh token** -> `localStorage` on native, `sessionStorage` on web.
 *   A rep reopening the app on their phone should already be signed in; a shared
 *   warehouse desktop should not leave a live credential behind for the next
 *   person. Making this uniform is a one-line change to `refreshStorage()`.
 *
 * The access token is never written to storage of any kind.
 */
@Injectable({ providedIn: 'root' })
export class PortalSessionStore {
  private readonly platform = inject(Platform);
  private readonly isNative = this.platform.is('capacitor') || this.platform.is('cordova');

  private readonly identityState = signal<PortalIdentity | null>(this.restoreIdentity());
  private readonly accessTokenState = signal<string | null>(null);
  private readonly refreshTokenState = signal<string | null>(this.restoreRefreshToken());

  readonly identity = this.identityState.asReadonly();
  readonly accessToken = this.accessTokenState.asReadonly();
  readonly refreshToken = this.refreshTokenState.asReadonly();

  readonly user = computed(() => this.identityState()?.user ?? null);
  readonly tenant = computed(() => this.identityState()?.tenant ?? null);
  readonly isAuthenticated = computed(() => this.identityState() !== null);

  /** What this session may do. For rendering decisions only — never a gate. */
  readonly permissions = computed(() => this.identityState()?.permissions ?? []);

  /**
   * The workspace, as a person would say it.
   *
   * Sign-in does not ask which workspace you meant, so this is where the answer
   * surfaces. Falls back to the slug rather than to an empty string: a blank
   * where the organisation's name belongs reads as a broken shell.
   */
  readonly workspaceName = computed(() => {
    const tenant = this.tenant();
    return tenant?.name || tenant?.slug || '';
  });

  /** Display name derived from the address, since the API has no name field. */
  readonly displayName = computed(() => {
    const email = this.user()?.email;
    if (!email) return '';
    return email
      .split('@')[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  });

  readonly initials = computed(() => {
    const parts = this.displayName().split(' ').filter(Boolean);
    if (!parts.length) return '?';
    const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
    return letters.map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2);
  });

  /**
   * True when we know who the user is but hold no credential.
   *
   * The state a failed restore leaves behind. Admitting it would render the app
   * for someone who is not signed in: screens fill from stale state, then every
   * request 401s — which surfaces as mysteriously empty data rather than as
   * "you are signed out".
   */
  readonly needsCredential = computed(
    () => this.isAuthenticated() && this.accessTokenState() === null,
  );

  /** True when the session holds a specific permission. */
  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  /** Adopts a sign-in response: identity and refresh token persist, the access token does not. */
  set(session: Authenticated): void {
    const identity: PortalIdentity = {
      user: session.user,
      tenant: session.tenant,
      permissions: session.permissions,
    };
    this.identityState.set(identity);
    this.accessTokenState.set(session.accessToken);
    this.refreshTokenState.set(session.refreshToken);

    write(localStorage, IDENTITY_KEY, JSON.stringify(identity));
    write(this.refreshStorage(), REFRESH_KEY, session.refreshToken);
  }

  clear(): void {
    this.identityState.set(null);
    this.accessTokenState.set(null);
    this.refreshTokenState.set(null);

    write(localStorage, IDENTITY_KEY, null);
    write(this.refreshStorage(), REFRESH_KEY, null);
  }

  /** Where the refresh token lives on this platform. See the class note. */
  private refreshStorage(): Storage {
    return this.isNative ? localStorage : sessionStorage;
  }

  private restoreIdentity(): PortalIdentity | null {
    const raw = read(localStorage, IDENTITY_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPortalIdentity(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private restoreRefreshToken(): string | null {
    return read(this.refreshStorage(), REFRESH_KEY);
  }
}

/**
 * Storage access that cannot throw.
 *
 * Private browsing, a full quota and a WebView with site data blocked all throw
 * here. Losing persistence costs the user one sign-in; throwing costs them the
 * app. The same defensive pattern is used in `van-cart.service.ts`.
 */
function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // See `read`. The session still works until the app is reloaded.
  }
}
