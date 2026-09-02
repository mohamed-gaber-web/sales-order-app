import { HttpErrorResponse } from '@angular/common/http';

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
      return new PortalApiError(0, 'Could not reach the server. Check your connection and try again.');
    }

    if (response.status === 429) {
      const retryAfter = retryAfterFrom(response);
      return new PortalApiError(429, throttleMessage(retryAfter), retryAfter);
    }

    return new PortalApiError(
      response.status,
      messageFrom(response.error) ?? defaultMessageFor(response.status),
    );
  }
}

/**
 * The sentence to show for any thrown value.
 *
 * Handles the case every `catch` block otherwise re-implements: a
 * `PortalApiError` carrying the server's own wording, and something that is not
 * one at all.
 */
export function describePortalError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof PortalApiError ? error.message : fallback;
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

function throttleMessage(retryAfter: number | null): string {
  if (!retryAfter) return 'Too many attempts. Wait a moment and try again.';
  const seconds = Math.ceil(retryAfter);
  const unit = seconds === 1 ? 'second' : 'seconds';
  return `Too many attempts. Try again in ${seconds} ${unit}.`;
}

/**
 * Wording of last resort, when the server gave a status and nothing else.
 *
 * 401 says "sign-in details" without saying which was wrong — matching the API,
 * which answers identically for a wrong password, an unknown email and a
 * disabled account precisely so the response cannot be used to enumerate
 * accounts. A friendlier message here would leak what the API works to hide.
 */
function defaultMessageFor(status: number): string {
  switch (status) {
    case 400:
      return 'That request was not valid. Check the details and try again.';
    case 401:
      return 'Those sign-in details are not correct.';
    case 403:
      return 'You do not have access to that.';
    case 404:
      return 'That was not found.';
    case 409:
      return 'That conflicts with something that already exists.';
    default:
      return status >= 500
        ? 'The server had a problem. Please try again shortly.'
        : 'Something went wrong. Please try again.';
  }
}
