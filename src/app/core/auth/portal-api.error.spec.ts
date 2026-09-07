import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { PortalApiError, describePortalError } from './portal-api.error';

describe('PortalApiError', () => {
  it('reports an unreachable server rather than a raw status', () => {
    const error = PortalApiError.from(new HttpErrorResponse({ status: 0 }));

    expect(error.status).toBe(0);
    expect(error.messageKey).toBe('error.offline');
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
    // No key: the server chose this wording, and we cannot translate what we
    // have never seen.
    expect(error.messageKey).toBeUndefined();
    expect(error.isUnauthorized).toBeTrue();
  });

  it('falls back to indistinguishable wording when a 401 carries no body', () => {
    const error = PortalApiError.from(new HttpErrorResponse({ status: 401 }));
    expect(error.messageKey).toBe('error.unauthorized');
  });

  it('turns a throttle into a wait the user can act on', () => {
    const error = PortalApiError.from(
      new HttpErrorResponse({
        status: 429,
        headers: new HttpHeaders({ 'Retry-After': '42' }),
      }),
    );

    expect(error.retryAfter).toBe(42);
    expect(error.messageKey).toBe('error.throttledSeconds');
    expect(error.messageParams).toEqual({ seconds: 42 });
    expect(error.isRetryable).toBeTrue();
  });

  it('reads Retry-After from the body when the header is absent', () => {
    const error = PortalApiError.from(
      new HttpErrorResponse({ status: 429, error: { retryAfter: 1 } }),
    );

    expect(error.messageParams).toEqual({ seconds: 1 });
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
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { error: { generic: 'Something went wrong.' } });
    translate.use('en');
  });

  it("shows the server's own wording verbatim when it gave any", () => {
    expect(describePortalError(new PortalApiError(401, 'Nope.'), translate)).toBe('Nope.');
  });

  it('translates our own wording', () => {
    const error = new PortalApiError(0, 'unused', 'error.generic');
    expect(describePortalError(error, translate)).toBe('Something went wrong.');
  });

  it('falls back for anything that is not a portal error', () => {
    expect(describePortalError(new TypeError('boom'), translate, 'error.generic'))
      .toBe('Something went wrong.');
  });
});
