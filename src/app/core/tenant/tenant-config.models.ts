/**
 * What the signed-in tenant is configured with, as the admin portal reports it.
 *
 * This is the other half of the move away from a bundled `environment.ts`. The
 * *device* half — which API host to call — comes from `/mobile/config` before
 * anyone signs in. This half is per-tenant and needs a session: which Dynamics
 * environment they have, whether its credential works, which legal entities
 * exist, and which modules they are entitled to.
 *
 * Mirrors `connection.ts`, `company.ts` and `module.ts` in the portal's
 * contracts package.
 */

/**
 * How the portal's last check of a D365 credential went.
 *
 * - `connected`      — a live check passed; the proxy will forward to it.
 * - `failing`        — configured, but the last check was rejected.
 * - `not_configured` — no client id or secret has been saved.
 *
 * Only `connected` environments are forwardable: `resolveProxyTarget` filters
 * on `connection_state <> 'not_configured'`, so anything else means ERP calls
 * come back 404 or 502 rather than data.
 */
export type ConnectionState = 'connected' | 'failing' | 'not_configured';

/**
 * A Dynamics environment belonging to this tenant.
 *
 * There is deliberately no `clientSecret`. The portal's read schema has nowhere
 * to put one — the credential is sealed server-side and used by the API on the
 * device's behalf. `hasClientSecret` answers the only question a screen needs:
 * whether one is configured, not what it is.
 */
export interface TenantConnection {
  environmentId: string;
  environmentName: string;
  environmentKind: string;
  /** The D365 instance URL. Shown so an administrator can confirm the target. */
  url: string;
  entraTenantId: string | null;
  authorityHost: string;
  clientId: string | null;
  hasClientSecret: boolean;
  clientSecretUpdatedAt: string | null;
  clientSecretExpiresAt: string | null;
  /** Days until the secret expires, computed server-side. Null when unknown. */
  daysUntilSecretExpiry: number | null;
  state: ConnectionState;
  checkedAt: string | null;
  /** Why the last check failed: `invalid_client`, `invalid_tenant`, … */
  error: string | null;
  tokenUrl: string | null;
  scope: string;
}

/**
 * A legal entity inside an environment.
 *
 * `dataAreaId` is the D365 company code every OData query scopes to — the value
 * the app used to hard-code as `'usmf'`.
 */
export interface TenantCompany {
  id: string;
  name: string;
  dataAreaId: string;
  environmentId: string;
}

/** A module this tenant is entitled to. Drives which navigation entries exist. */
export interface TenantModule {
  key: string;
  description: string;
  enabled: boolean;
  enabledAt: string | null;
}

/**
 * Why the ERP is unreachable, when it is.
 *
 * Distinguished so the screen can say something an administrator can act on
 * rather than "something went wrong".
 */
export type ErpBlocker =
  /** No environment row at all — the tenant was never provisioned one. */
  | 'no_environment'
  /** An environment exists, but no client id or secret has been saved. */
  | 'not_configured'
  /** Configured, but Entra or Dynamics rejected the last check. */
  | 'failing'
  /** No legal entity, so there is nothing to scope a query to. */
  | 'no_company';

/**
 * Works out what, if anything, stops this tenant reaching Dynamics.
 *
 * Returns null when everything needed is present. Ordered by what an
 * administrator would fix first: an environment must exist before it can carry
 * a credential, and a credential must work before a company is worth having.
 */
export function findErpBlocker(
  connections: readonly TenantConnection[],
  companies: readonly TenantCompany[],
): ErpBlocker | null {
  if (!connections.length) return 'no_environment';
  if (connections.every(connection => connection.state === 'not_configured')) return 'not_configured';
  if (!connections.some(connection => connection.state === 'connected')) return 'failing';
  if (!companies.length) return 'no_company';
  return null;
}

/** What to tell the user for each blocker. Written for a rep, not an operator. */
export const ERP_BLOCKER_MESSAGES: Readonly<Record<ErpBlocker, { title: string; detail: string }>> = {
  no_environment: {
    title: 'No ERP environment yet',
    detail:
      'Your workspace has not been connected to Dynamics 365. An administrator needs to add an environment in the admin portal before any data can load.',
  },
  not_configured: {
    title: 'ERP connection not finished',
    detail:
      'Your Dynamics environment exists but has no sign-in details saved. An administrator needs to add the client ID and secret in the admin portal, then run the connection test.',
  },
  failing: {
    title: 'ERP connection is not working',
    detail:
      'Dynamics rejected the saved sign-in details — usually an expired secret. An administrator needs to update them in the admin portal.',
  },
  no_company: {
    title: 'No company set up',
    detail:
      'Your Dynamics environment is connected, but no company has been added to it yet. An administrator needs to add one in the admin portal.',
  },
};
