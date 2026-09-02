/**
 * Wire types and routes for the Grow Path Admin Portal API.
 *
 * Hand-mirrored from `packages/contracts/src/schemas/auth.ts` in the
 * admin-portal repo, which is the single source of truth. Those schemas are
 * `.strict()`, so a field added there without a matching change here is a field
 * this app silently ignores.
 *
 * Not to be confused with `core/services/auth.service.ts`, which holds the D365
 * *machine* identity (Azure AD client credentials). Everything here is about the
 * *person* using the app.
 */

/**
 * Portal route paths, mirroring `API_ROUTES`.
 *
 * The API mounts its controllers at the root — there is no `/api` prefix on the
 * server. `PortalApiService` is what prepends a base, so these stay verbatim.
 */
export const PORTAL_ROUTES = {
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  verifyMfa: '/auth/mfa/verify',
  requestPasswordReset: '/auth/forgot-password',
  completePasswordReset: '/auth/reset-password',
  acceptInvitation: '/auth/accept-invitation',
} as const;

/**
 * Routes that must never carry an `Authorization` header.
 *
 * Each is unauthenticated by necessity: the caller either has no credential yet
 * (login, invitation, reset), holds one that has expired (refresh, logout), or
 * holds one that is not an access token at all (the MFA challenge). Sending a
 * stale bearer to `/auth/refresh` is the subtle case — that is the very request
 * meant to replace it.
 */
export const PORTAL_UNAUTHENTICATED_ROUTES: readonly string[] = [
  PORTAL_ROUTES.login,
  PORTAL_ROUTES.refresh,
  PORTAL_ROUTES.logout,
  PORTAL_ROUTES.verifyMfa,
  PORTAL_ROUTES.requestPasswordReset,
  PORTAL_ROUTES.completePasswordReset,
  PORTAL_ROUTES.acceptInvitation,
];

/** Minimum password lengths the API enforces. Different on purpose — see the API schemas. */
export const MIN_INVITATION_PASSWORD_LENGTH = 8;
export const MIN_RESET_PASSWORD_LENGTH = 12;

// ── Identity ──────────────────────────────────────────────────────────────────

/** The signed-in person. The API carries no display name — only an address. */
export interface PortalUser {
  id: string;
  email: string;
}

/** The workspace the sign-in resolved to. Never supplied by the caller. */
export interface PortalTenant {
  id: string;
  slug: string;
  name: string;
}

// ── Sign-in ───────────────────────────────────────────────────────────────────

/** A live session: identity, what it may do, and both tokens. */
export interface Authenticated {
  status: 'authenticated';
  user: PortalUser;
  tenant: PortalTenant;
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds. Fifteen minutes — permissions are stamped in at sign-in. */
  expiresIn: number;
  /**
   * What this session may do, mirroring the token's own claim.
   *
   * For rendering decisions only. It lives in editable storage, and the API
   * re-checks the signed claim on every request — editing this changes which
   * buttons are drawn and nothing else.
   */
  permissions: string[];
  /** Single use. Exchanging it returns a new one; presenting it twice ends the session. */
  refreshToken: string;
  /** Seconds. Fourteen days. */
  refreshExpiresIn: number;
}

/**
 * A correct password on an account with MFA enabled.
 *
 * Deliberately carries no access or refresh token: a password alone must not
 * reach tenant data. The challenge opens nothing but the second-factor check.
 */
export interface MfaRequired {
  status: 'mfa_required';
  challengeToken: string;
  /** Seconds. Five minutes. */
  expiresIn: number;
}

/** Everything `POST /auth/login` can answer. */
export type SignInResponse = Authenticated | MfaRequired;

/**
 * Narrows a sign-in response to a real session.
 *
 * Discriminated on `status` so the MFA branch cannot be read for an
 * `accessToken` it does not have.
 */
export function isAuthenticated(response: SignInResponse): response is Authenticated {
  return response.status === 'authenticated';
}

// ── Other responses ───────────────────────────────────────────────────────────

/**
 * What a reset request returns — always this, whatever happened.
 *
 * There is deliberately no field that could differ between "we sent a link" and
 * "there is no such account".
 */
export interface PasswordResetRequested {
  status: 'accepted';
}

/** Redeeming a reset link. Returns no session: every refresh token was revoked. */
export interface PasswordResetCompleted {
  status: 'reset';
  email: string;
}

/** Redeeming an invitation. Sets a first password; does not sign the user in. */
export interface AcceptedInvitation {
  status: 'accepted';
  email: string;
}

// ── Local session shape ───────────────────────────────────────────────────────

/** Who is signed in. Identity only — never the credential. */
export interface PortalIdentity {
  user: PortalUser;
  tenant: PortalTenant;
  permissions: string[];
}

/**
 * Shape-checks an identity read back from storage.
 *
 * The stored value is user-writable, and a half-written or hand-edited one
 * would otherwise crash on first render. Fields are checked rather than
 * defaulted: an identity missing `permissions` is one whose permissions are
 * *unknown*, and treating unknown as empty would show a returning user an app
 * with half its navigation missing.
 */
export function isPortalIdentity(value: unknown): value is PortalIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PortalIdentity>;
  return (
    typeof candidate.user?.id === 'string' &&
    typeof candidate.user?.email === 'string' &&
    typeof candidate.tenant?.id === 'string' &&
    typeof candidate.tenant?.slug === 'string' &&
    typeof candidate.tenant?.name === 'string' &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every(permission => typeof permission === 'string')
  );
}
