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
const D365_PROXY_MESSAGES: Readonly<Record<string, string>> = {
  /** An administrator has not finished connecting this environment in the portal. */
  connection_not_configured:
    'The ERP connection is not set up yet. Ask your administrator to finish it in the admin portal.',
  /** The tenant has more than one environment and the request named no company. */
  company_required: 'This account covers more than one company. Choose one and try again.',
  /** Our ERP service principal was refused — nothing to do with the user's session. */
  d365_unauthorized: 'The server could not sign in to the ERP. Ask your administrator to check the connection.',
  d365_timeout: 'The ERP took too long to answer. Try again in a moment.',
  d365_unreachable: 'The ERP could not be reached. Try again in a moment.',
  not_found: 'That record no longer exists.',
};

/**
 * Turns a proxy failure into a sentence, or `null` if this is not one.
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
  return typeof code === 'string' ? (D365_PROXY_MESSAGES[code] ?? null) : null;
}
