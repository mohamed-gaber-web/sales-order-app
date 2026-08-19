/**
 * The admin API's DTOs, as much of them as this app uses.
 *
 * **Source of truth is `packages/contracts/src/schemas/` in the admin-portal
 * repo** — `auth.ts` and `mobile-config.ts` specifically. This is a transcription,
 * not a fork, and the reason it is a transcription is prosaic: that package is a
 * pnpm workspace member in a different repository on a different filesystem
 * path, so `workspace:*` cannot reach it and a `file:` dependency would work on
 * one machine and break CI. Publishing it to a private registry is the right
 * long-term answer and would replace this file wholesale.
 *
 * Drift is bounded and one-directional. This app only ever *reads* these shapes;
 * every schema is `.strict()` on the server and covered by
 * `tests/us003-contracts.test.ts`, so a breaking change fails the API's own tests
 * before it reaches a device.
 */

/** Route paths, mirroring `API_ROUTES`. */
export const API_ROUTES = {
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  verifyMfa: '/auth/mfa/verify',
  requestPasswordReset: '/auth/forgot-password',
  mobileConfig: '/mobile/config',
  companies: '/companies',
  modules: '/modules',
} as const;

/** Which company — and so which environment — a proxied ERP request means. */
export const D365_COMPANY_HEADER = 'x-d365-company';

/** The prefix every ERP call goes through. Mirrors `API_ROUTES.d365Data`. */
export const D365_PROXY_PREFIX = '/d365';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedTenant {
  id: string;
  slug: string;
  name: string;
}

/** A completed sign-in. */
export interface Authenticated {
  status: 'authenticated';
  user: AuthenticatedUser;
  tenant: AuthenticatedTenant;
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds. Deliberately small — 15 minutes at the time of writing. */
  expiresIn: number;
  permissions: string[];
  refreshToken: string;
  refreshExpiresIn: number;
}

/**
 * A correct password, and nothing more.
 *
 * Carries no access token and no refresh token by design: reaching tenant data
 * with only a password is exactly what the second factor exists to prevent.
 */
export interface MfaRequired {
  status: 'mfa_required';
  challengeToken: string;
  expiresIn: number;
}

/**
 * Everything sign-in can answer.
 *
 * A discriminated union rather than optional fields, so a caller cannot read
 * `accessToken` off a challenge — on that branch the type has none.
 */
export type SignInResponse = Authenticated | MfaRequired;

export interface MobileUserAuth {
  clientId: string;
  authority: string;
  redirectUri: string;
  scopes: string[];
}

/** What `GET /mobile/config?slug=` returns. Carries no credential of any kind. */
export interface MobileConfig {
  tenantSlug: string;
  tenantName: string;
  apiBaseUrl: string;
  /** Null once a tenant has cut over to portal-native sign-in, which this app uses. */
  userAuth: MobileUserAuth | null;
  minimumAppVersion: string | null;
  updatedAt: string;
}

/** A legal entity, from `GET /companies`. */
export interface TenantCompany {
  id: string;
  name: string;
  dataAreaId: string;
  environmentId: string;
}

/**
 * Narrows a sign-in response, checking the fields the branch is chosen on.
 *
 * The one place in this app where a wrong shape would be a security problem
 * rather than a rendering one: treating an `mfa_required` response as a session
 * would defeat the second factor, and treating a session as a challenge would
 * strand a user who has no authenticator. So this checks rather than casts.
 */
export function isAuthenticated(value: unknown): value is Authenticated {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Authenticated>;
  return (
    candidate.status === 'authenticated' &&
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.expiresIn === 'number' &&
    typeof candidate.user?.email === 'string' &&
    typeof candidate.tenant?.slug === 'string' &&
    Array.isArray(candidate.permissions)
  );
}

export function isMfaRequired(value: unknown): value is MfaRequired {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MfaRequired>;
  return (
    candidate.status === 'mfa_required' &&
    typeof candidate.challengeToken === 'string' &&
    candidate.challengeToken.length > 0
  );
}
