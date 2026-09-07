import { HttpErrorResponse } from '@angular/common/http';

/**
 * The closed set of failures the admin portal's ERP pass-through reports.
 *
 * The proxy never leaks the underlying exception — those messages name the
 * customer's ERP host and carry DNS and TLS detail — so it answers with one of
 * these codes instead. Each is something a user or an administrator can act on.
 *
 * Mirrors `failure()` in the API's `d365-proxy.controller.ts`.
 */
const D365_PROXY_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  /** An administrator has not finished connecting this environment in the portal. */
  connection_not_configured: 'd365.connectionNotConfigured',
  /** The tenant has more than one environment and the request named no company. */
  company_required: 'd365.companyRequired',
  /** Our ERP service principal was refused — nothing to do with the user's session. */
  d365_unauthorized: 'd365.unauthorized',
  d365_timeout: 'd365.timeout',
  d365_unreachable: 'd365.unreachable',
  not_found: 'd365.notFound',
};

/**
 * Turns a proxy failure into a translation key, or `null` if this is not one.
 *
 * **The proxy never answers 401 for an ERP problem**, deliberately: an expired
 * ERP service-principal secret and an expired user session look identical to a
 * client, and passing the upstream 401 through would make `PortalAuthInterceptor`
 * read it as the session ending and sign a warehouse operator out. So a 401 here
 * always means the session, and every ERP failure arrives as 4xx/5xx with one of
 * the codes above.
 */
export function describeD365ProxyError(error: HttpErrorResponse): string | null {
  const code = (error.error as { error?: unknown } | null)?.error;
  return typeof code === 'string' ? (D365_PROXY_MESSAGE_KEYS[code] ?? null) : null;
}
