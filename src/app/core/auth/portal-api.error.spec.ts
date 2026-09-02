import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { PortalApiError, describePortalError } from './portal-api.error';

describe('PortalApiError', () => {
  it('reports an unreachable server rather than a raw status', () => {
    const error = PortalApiError.from(new HttpErrorResponse({ status: 0 }));

    expect(error.status).toBe(0);
    expect(error.message).toContain('Could not reach the server');
    expect(error.isRetryable).toBeTrue();
  });

  it("shows the API's own 401 wording verbatim", () => {
    // The API answers identically for a wrong password, an unknown address and a
    // disabled account. Rewording it here would leak what that hides.
    const error = PortalApiError.from(
      new HttpErrorResponse({
        status: 401,
        error: { statusCode: 401, message: 'Those sign-in details are not correct.' },
      }),
    );

    expect(error.message).toBe('Those sign-in details are not correct.');
    expect(error.isUnauthorized).toBeTrue();
  });

  it('falls back to indistinguishable wording when a 401 carries no body', () => {
    const error = PortalApiError.from(new HttpErrorResponse({ status: 401 }));
    expect(error.message).toBe('Those sign-in details are not correct.');
  });

  it('turns a throttle into a wait the user can act on', () => {
    const error = PortalApiError.from(
      new HttpErrorResponse({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': '42' }),
      }),
    );

    expect(error.retryAfter).toBe(42);
    expect(error.message).toContain('42 seconds');
    expect(error.isRetryable).toBeTrue();
  });

  it('reads Retry-After from the body when the header is absent', () => {
    const error = PortalApiError.from(
      new HttpErrorResponse({ status: 429, error: { retryAfter: 1 } }),
    );

    expect(error.message).toContain('1 second');
  });

  it("takes the first message when Nest's validation pipe sends an array", () => {
    const error = PortalApiError.from(
      new HttpErrorResponse({ status: 400, error: { message: ['email must be an email'] } }),
    );

    expect(error.message).toBe('email must be an email');
  });

  it('marks 5xx retryable and 4xx not', () => {
    expect(PortalApiError.from(new HttpErrorResponse({ status: 503 })).isRetryable).toBeTrue();
    expect(PortalApiError.from(new HttpErrorResponse({ status: 404 })).isRetryable).toBeFalse();
  });
});

describe('describePortalError', () => {
  it('uses the error message when there is one', () => {
    expect(describePortalError(new PortalApiError(401, 'Nope.'))).toBe('Nope.');
  });

  it('falls back for anything that is not a portal error', () => {
    expect(describePortalError(new TypeError('boom'), 'Try again.')).toBe('Try again.');
  });
});
