/**
 * The device-facing bootstrap configuration (US-040).
 *
 * Mirrors `mobileConfigSchema` in the admin portal's contracts package. This is
 * what replaces the customer-specific half of `environment.ts`: the app ships
 * with a tenant slug and nothing else, asks the API where to send its calls, and
 * holds no customer's details in its bundle. One binary then serves every
 * tenant, which is the point.
 *
 * ### What is deliberately not here
 *
 * There is no `clientSecret`, and there cannot be. The Dynamics credential is a
 * `client_credentials` service principal with unrestricted access to the ERP;
 * the portal seals it server-side and calls D365 on the device's behalf. A
 * secret fetched over TLS by anyone holding a slug is exactly as extractable as
 * one baked into an APK, so moving it here would relocate the problem rather
 * than fix it. See `ApiService` for the proxy that replaced it.
 */
export interface MobileConfig {
  /** Which tenant answered, so the app can name the workspace before sign-in. */
  tenantSlug: string;
  tenantName: string;
  /** Where the app sends its API calls. The field that makes one build serve all. */
  apiBaseUrl: string;
  /**
   * The public Entra client, for tenants still on interactive Entra sign-in.
   *
   * Null once a tenant has cut over to portal-native sign-in, which this app
   * has — so it is carried for contract fidelity and never read.
   */
  userAuth: MobileUserAuth | null;
  /** The oldest build this tenant will serve. Null means no floor. */
  minimumAppVersion: string | null;
  /** When the configuration last changed, so a client can cache and re-check. */
  updatedAt: string;
}

export interface MobileUserAuth {
  clientId: string;
  authority: string;
  redirectUri: string;
  scopes: string[];
}

/** Where the configuration in force came from. Surfaced for diagnostics. */
export type MobileConfigSource = 'network' | 'cache' | 'bundled';

/**
 * Shape-checks a configuration read back from storage or the network.
 *
 * Checked rather than trusted for the same reason the session identity is: the
 * cached copy is user-writable, and `apiBaseUrl` in particular decides where
 * this device sends its access tokens. A half-written value must fall back to
 * the bundled default rather than redirect the app somewhere unintended.
 */
export function isMobileConfig(value: unknown): value is MobileConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MobileConfig>;
  return (
    typeof candidate.tenantSlug === 'string' &&
    typeof candidate.tenantName === 'string' &&
    typeof candidate.apiBaseUrl === 'string' &&
    isSafeApiBaseUrl(candidate.apiBaseUrl) &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.minimumAppVersion === null || typeof candidate.minimumAppVersion === 'string')
  );
}

/**
 * True for a URL this app may send access tokens to.
 *
 * `https` only, and no trailing slash so paths concatenate predictably. The API
 * refuses to store an `http://` base for the same reason — a bearer token on a
 * cleartext hop is a token that has been disclosed — but a cached value never
 * passed through that check, so it is re-checked here.
 */
export function isSafeApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !value.endsWith('/');
  } catch {
    return false;
  }
}

/**
 * True when `version` is older than `minimum`, comparing dotted numbers.
 *
 * Returns false when either is unparseable: refusing to run a build because a
 * version string could not be read would be a self-inflicted outage, and the
 * floor exists to block known-bad builds rather than unknown ones.
 */
export function isBelowMinimum(version: string, minimum: string | null): boolean {
  if (!minimum) return false;

  const parse = (value: string): number[] | null => {
    const parts = value.trim().split('.').map(part => Number.parseInt(part, 10));
    return parts.length && parts.every(Number.isFinite) ? parts : null;
  };

  const current = parse(version);
  const floor = parse(minimum);
  if (!current || !floor) return false;

  for (let index = 0; index < Math.max(current.length, floor.length); index++) {
    const a = current[index] ?? 0;
    const b = floor[index] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}
