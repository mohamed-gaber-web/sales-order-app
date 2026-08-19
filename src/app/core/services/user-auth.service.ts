import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  API_ROUTES,
  isAuthenticated,
  isMfaRequired,
  type Authenticated,
  type MfaRequired,
  type SignInResponse,
} from '../api/api-contracts';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { SessionStore } from '../auth/session.store';
import { DeviceStorageService, STORAGE_KEYS } from '../storage/device-storage.service';

/**
 * Signing in, staying signed in, and signing out.
 *
 * Replaces a thirty-line stand-in that wrote an email address to `localStorage`
 * and called it a session — there was no server call, no token, and no password
 * check beyond a length test. Everything here now goes to the admin API, which
 * has held the real implementation since US-021.
 *
 * The app also used to hold a second, entirely separate "auth": a
 * `client_credentials` exchange that minted an ERP token from a secret shipped
 * in the bundle. That is gone. There is one identity now, it belongs to a
 * person, and the ERP credential lives on the server.
 */

/** What a sign-in attempt produced. */
export type SignInOutcome =
  | { status: 'authenticated' }
  /** A correct password and a second factor still to answer. */
  | { status: 'mfa_required'; challenge: MfaRequired };

@Injectable({ providedIn: 'root' })
export class UserAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly config = inject(RuntimeConfigService);
  private readonly storage = inject(DeviceStorageService);

  /**
   * The one in-flight refresh, if there is one.
   *
   * **Single flight is mandatory here, not an optimisation.** The refresh token
   * is single-use and a replay revokes the entire family, so two concurrent
   * refreshes would spend the token twice and sign the user out — and a screen
   * that fires six parallel OData calls is the normal case, not the edge one.
   */
  private inFlightRefresh: Promise<boolean> | null = null;

  isAuthenticated(): boolean {
    return this.session.isAuthenticated();
  }

  getUser(): Authenticated['user'] | null {
    return this.session.user();
  }

  /** The address last signed in with, so the login form can prefill it. */
  lastEmail(): Promise<string | null> {
    return this.storage.get(STORAGE_KEYS.lastEmail);
  }

  /**
   * Signs in with an address and a password.
   *
   * No tenant slug: `user.email` is unique across the installation, so the API
   * resolves the workspace from the address and returns it. That is what makes
   * "sign in first, configure after" possible at all.
   *
   * The response is a discriminated union and is **checked, not cast**. Reading
   * an access token off a challenge would defeat the second factor, so only the
   * `authenticated` branch is allowed to touch the session.
   */
  async signIn(email: string, password: string): Promise<SignInOutcome> {
    const response = await firstValueFrom(
      this.http.post<SignInResponse>(
        `${this.config.platformApiBaseUrl}${API_ROUTES.login}`,
        { email, password }
      )
    );

    if (isMfaRequired(response)) {
      // Deliberately nothing persisted. A challenge token proves a password was
      // correct and nothing more; treating it as a session, even briefly, is
      // exactly what the second factor exists to prevent.
      return { status: 'mfa_required', challenge: response };
    }

    if (!isAuthenticated(response)) {
      throw new Error('The sign-in response was not in a shape this app understands.');
    }

    await this.adopt(response, email);
    return { status: 'authenticated' };
  }

  /** Answers an MFA challenge. On success this is the moment a session begins. */
  async verifyMfa(challengeToken: string, code: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<Authenticated>(
        `${this.config.platformApiBaseUrl}${API_ROUTES.verifyMfa}`,
        { challengeToken, code }
      )
    );

    if (!isAuthenticated(response)) {
      throw new Error('The verification response was not in a shape this app understands.');
    }
    await this.adopt(response, response.user.email);
  }

  /** Asks for a reset link. Always resolves — the API answers identically either way. */
  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.config.platformApiBaseUrl}${API_ROUTES.requestPasswordReset}`,
        { email }
      )
    );
  }

  /**
   * Exchanges the stored refresh token for a fresh pair.
   *
   * Returns whether there is a usable session afterwards. A failure clears
   * everything rather than retrying: presenting a spent token is what revokes a
   * family, so a second attempt with the same token turns a recoverable failure
   * into a signed-out one.
   */
  refresh(): Promise<boolean> {
    if (this.inFlightRefresh) return this.inFlightRefresh;

    this.inFlightRefresh = this.performRefresh().finally(() => {
      this.inFlightRefresh = null;
    });
    return this.inFlightRefresh;
  }

  /** A valid access token, refreshing first if the one held is spent or close to it. */
  async getAccessToken(): Promise<string | null> {
    if (!this.session.needsRefresh()) return this.session.accessToken();
    const refreshed = await this.refresh();
    return refreshed ? this.session.accessToken() : null;
  }

  /**
   * Ends the session here and on the server.
   *
   * The server call is what makes this a sign-out rather than a screen change:
   * without it the refresh token stays exchangeable for its full fourteen days,
   * which on a shared warehouse device means the next person inherits a session.
   * Local state is cleared whether or not that call succeeds — a device that is
   * offline must still be able to hand itself to somebody else.
   */
  async signOut(): Promise<void> {
    const refreshToken = this.session.refreshToken();
    if (refreshToken) {
      try {
        await firstValueFrom(
          this.http.post(
            `${this.config.platformApiBaseUrl}${API_ROUTES.logout}`,
            { refreshToken }
          )
        );
      } catch {
        // Offline, or a token the server no longer recognises. Either way the
        // local half still has to happen.
      }
    }

    await this.session.clear();
    await this.config.clear();
    await this.router.navigateByUrl('/auth/login');
  }

  private async performRefresh(): Promise<boolean> {
    const refreshToken = this.session.refreshToken();
    if (!refreshToken) return false;

    try {
      const response = await firstValueFrom(
        this.http.post<Authenticated>(
          `${this.config.platformApiBaseUrl}${API_ROUTES.refresh}`,
          { refreshToken }
        )
      );
      if (!isAuthenticated(response)) {
        await this.session.clear();
        return false;
      }
      await this.session.set(response);
      return true;
    } catch {
      await this.session.clear();
      return false;
    }
  }

  /**
   * Takes up a session and learns where this tenant's API lives.
   *
   * The configuration fetch is awaited rather than fired and forgotten, because
   * the very next thing that happens is a request to `apiBaseUrl` — starting the
   * app against the platform origin and switching hosts underneath it a moment
   * later is a race with no upside.
   */
  private async adopt(session: Authenticated, email: string): Promise<void> {
    await this.session.set(session);
    await this.storage.set(STORAGE_KEYS.lastEmail, email);
    await this.config.hydrate(session.tenant.slug);
  }
}
