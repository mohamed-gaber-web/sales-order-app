import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MfaChallengeStore } from './mfa-challenge.store';
import { PortalApiService } from './portal-api.service';
import { PortalSessionStore } from './portal-session.store';
import { TenantConfigStore } from '../tenant/tenant-config.store';
import {
  AcceptedInvitation,
  Authenticated,
  PORTAL_ROUTES,
  PasswordResetCompleted,
  PasswordResetRequested,
  SignInResponse,
  isAuthenticated,
} from './portal-auth.models';

/**
 * Every authentication operation this app performs against the admin portal.
 *
 * Commands only — the *state* lives in `PortalSessionStore`, which components,
 * guards and the interceptor read directly. Keeping the two apart is what lets
 * the interceptor clear a dead session without importing the service that
 * issues requests.
 *
 * Distinct from `core/services/auth.service.ts`, which holds the D365 machine
 * identity. That one answers "may this app call Dynamics"; this one answers
 * "who is holding the phone".
 */
@Injectable({ providedIn: 'root' })
export class UserAuthService {
  private readonly api = inject(PortalApiService);
  private readonly session = inject(PortalSessionStore);
  private readonly challenge = inject(MfaChallengeStore);
  private readonly tenantConfig = inject(TenantConfigStore);
  private readonly router = inject(Router);

  /**
   * The refresh exchange currently in flight, if any.
   *
   * Load-bearing, not an optimisation. A refresh token is single use and the API
   * treats a second presentation as theft: it revokes the whole token family and
   * signs the session out. Two screens racing a 401 would do exactly that, so
   * every caller shares one exchange.
   */
  private inFlightRefresh: Promise<Authenticated | null> | null = null;

  /**
   * Signs in with an address and a password.
   *
   * No workspace slug: the address is globally unique and the API resolves the
   * tenant from it, returning the answer in `tenant`.
   *
   * Returns the response so the caller can branch. Only the `authenticated`
   * branch touches the session store — an MFA challenge is stashed and nothing
   * else, because a correct password alone must not reach tenant data.
   */
  async signIn(email: string, password: string): Promise<SignInResponse> {
    const response = await this.api.post<SignInResponse>(PORTAL_ROUTES.login, { email, password });
    this.adopt(response);
    return response;
  }

  /** Answers an MFA challenge. On success this is the moment a session begins. */
  async verifyMfa(code: string): Promise<Authenticated> {
    const challengeToken = this.challenge.token();
    if (!challengeToken) {
      throw new Error('No sign-in is waiting for a code.');
    }

    const session = await this.api.post<Authenticated>(PORTAL_ROUTES.verifyMfa, {
      challengeToken,
      code,
    });
    this.challenge.clear();
    this.session.set(session);
    return session;
  }

  /**
   * Exchanges the stored refresh token for a fresh pair.
   *
   * Serialised through `inFlightRefresh`, and a failure clears everything rather
   * than retrying: the token is either spent, expired, or was replayed, and
   * replay signs the session out by design. Retrying would at best repeat a
   * spent exchange and at worst look like an attack.
   *
   * Resolves to `null` when there was nothing to restore.
   */
  refresh(): Promise<Authenticated | null> {
    if (this.inFlightRefresh) return this.inFlightRefresh;

    const refreshToken = this.session.refreshToken();
    if (!refreshToken) return Promise.resolve(null);

    this.inFlightRefresh = this.api
      .post<Authenticated>(PORTAL_ROUTES.refresh, { refreshToken })
      .then(session => {
        this.session.set(session);
        return session;
      })
      .catch(() => {
        this.session.clear();
        return null;
      })
      .finally(() => {
        this.inFlightRefresh = null;
      });

    return this.inFlightRefresh;
  }

  /**
   * Ends the session, server-side as well as locally.
   *
   * The local half always happens: a sign-out that failed because the network
   * was down but left the user looking signed in is worse than one that leaves a
   * token to expire on its own. `POST /auth/logout` answers 204 for a live
   * token, an expired one and one that never existed alike, so there is nothing
   * to branch on.
   */
  async signOut(): Promise<void> {
    const refreshToken = this.session.refreshToken();

    this.session.clear();
    this.challenge.clear();
    // One tenant's environments must not be visible to the next person to sign in.
    this.tenantConfig.clear();

    if (refreshToken) {
      try {
        await this.api.postNoContent(PORTAL_ROUTES.logout, { refreshToken });
      } catch {
        // The session is already gone locally; the token expires on its own.
      }
    }

    await this.router.navigateByUrl('/auth/login');
  }

  /**
   * Asks for a reset link.
   *
   * Always resolves the same way. The API answers identically whether or not the
   * account exists, and the screen must not undo that by branching.
   */
  requestPasswordReset(email: string): Promise<PasswordResetRequested> {
    return this.api.post<PasswordResetRequested>(PORTAL_ROUTES.requestPasswordReset, { email });
  }

  /** Redeems a reset link. Returns no session: every refresh token was just revoked. */
  completePasswordReset(token: string, password: string): Promise<PasswordResetCompleted> {
    return this.api.post<PasswordResetCompleted>(PORTAL_ROUTES.completePasswordReset, {
      token,
      password,
    });
  }

  /** Redeems an invitation and sets a first password. Does not sign the user in. */
  acceptInvitation(token: string, password: string): Promise<AcceptedInvitation> {
    return this.api.post<AcceptedInvitation>(PORTAL_ROUTES.acceptInvitation, { token, password });
  }

  /** Narrowed on `status`: the challenge branch has no session to adopt. */
  private adopt(response: SignInResponse): void {
    if (isAuthenticated(response)) {
      this.challenge.clear();
      this.session.set(response);
    } else {
      this.challenge.set(response);
    }
  }
}
