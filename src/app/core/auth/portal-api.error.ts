import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';

/**
 * A failed portal request, normalised into something a template can render.
 *
 * Pages never see `HttpErrorResponse`. Its `message` reads "Http failure
 * response for /api/portal/auth/login: 401 Unauthorized", which is a fine log
 * line and a terrible thing to show a person, and it makes every caller dig
 * through `error.error.message` and guess at its shape.
 */
export class PortalApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never reached the server. */
    readonly status: number,
    message: string,
    /**
     * Set when the wording is **ours** and therefore translatable.
     *
     * Left undefined when the server supplied the text: we cannot translate a
     * string we have never seen, and the API's 401 in particular is wording it
     * chose deliberately — identical for a wrong password, an unknown address
     * and a disabled account — so it is shown verbatim.
     */
    readonly messageKey?: string,
    /** Interpolation values for `messageKey`. */
    readonly messageParams?: Record<string, unknown>,
    /** Seconds to wait, from the `Retry-After` header on a 429. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'PortalApiError';
  }

  /** True when retrying might work: a dropped connection, a throttle, a 5xx. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  static from(response: HttpErrorResponse): PortalApiError {
    // Status 0 means the network dropped it or the browser blocked it — the
    // server sent nothing, so there is no body to read.
    if (response.status === 0) {
      return new PortalApiError(0, 'Could not reach the server.', 'error.offline');
    }

    if (response.status === 429) {
      const retryAfter = retryAfterFrom(response);
      return retryAfter
        ? new PortalApiError(429, 'Too many attempts.', 'error.throttledSeconds',
            { seconds: Math.ceil(retryAfter) }, retryAfter)
        : new PortalApiError(429, 'Too many attempts.', 'error.throttled', undefined, null);
    }

    // The server's own wording wins when it gave any, because only it knows what
    // happened; ours is the fallback for a bare status.
    const serverMessage = messageFrom(response.error);
    return serverMessage
      ? new PortalApiError(response.status, serverMessage)
      : new PortalApiError(response.status, `Request failed with status ${response.status}.`,
          defaultMessageKeyFor(response.status));
  }
}

/**
 * The sentence to show a user for any thrown value, in their language.
 *
 * Three cases, which every `catch` block would otherwise re-implement: our own
 * wording (translated), the server's wording (shown verbatim — we cannot
 * translate what we have never seen), and something that is not a
 * `PortalApiError` at all.
 */
export function describePortalError(
  error: unknown,
  translate: TranslateService,
  fallbackKey = 'error.generic',
): string {
  if (error instanceof PortalApiError) {
    return error.messageKey
      ? (translate.instant(error.messageKey, error.messageParams) as string)
      : error.message;
  }
  return translate.instant(fallbackKey) as string;
}

/** Nest answers `{ statusCode, message, error }`, with `message` sometimes an array. */
function messageFrom(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) return body;
  if (!body || typeof body !== 'object') return null;

  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && message.length) return String(message[0]);
  return null;
}

function retryAfterFrom(response: HttpErrorResponse): number | null {
  const header = Number(response.headers?.get('Retry-After'));
  if (Number.isFinite(header) && header > 0) return header;

  const body = (response.error as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof body === 'number' && body > 0 ? body : null;
}

/**
 * Wording of last resort, when the server gave a status and nothing else.
 *
 * 401 says "sign-in details" without saying which was wrong — matching the API,
 * which answers identically for a wrong password, an unknown email and a
 * disabled account precisely so the response cannot be used to enumerate
 * accounts. A friendlier message here would leak what the API works to hide.
 */
function defaultMessageKeyFor(status: number): string {
  switch (status) {
    case 400:
      return 'error.badRequest';
    case 401:
      return 'error.unauthorized';
    case 403:
      return 'error.forbidden';
    case 404:
      return 'error.notFound';
    case 409:
      return 'error.conflict';
    default:
      return status >= 500 ? 'error.server' : 'error.generic';
  }
}
