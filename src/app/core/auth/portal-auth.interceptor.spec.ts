import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { PortalAuthInterceptor } from './portal-auth.interceptor';
import { PortalSessionStore } from './portal-session.store';
import { UserAuthService } from './user-auth.service';
import { Authenticated } from './portal-auth.models';

function session(accessToken = 'access-1'): Authenticated {
  return {
    status: 'authenticated',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'amelia.hart@acme.com' },
    tenant: { id: '22222222-2222-4222-8222-222222222222', slug: 'acme', name: 'Acme' },
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    permissions: ['tenant.read'],
    refreshToken: 'refresh-1',
    refreshExpiresIn: 1_209_600,
  };
}

describe('PortalAuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: PortalSessionStore;
  let auth: jasmine.SpyObj<UserAuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    auth = jasmine.createSpyObj<UserAuthService>('UserAuthService', ['refresh']);
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        PortalSessionStore,
        { provide: HTTP_INTERCEPTORS, useClass: PortalAuthInterceptor, multi: true },
        { provide: UserAuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: Platform, useValue: { is: () => false } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PortalSessionStore);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('attaches the access token to portal requests', () => {
    store.set(session());
    http.get('/api/portal/companies').subscribe();

    const request = httpMock.expectOne('/api/portal/companies');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush({});
  });

  it('leaves D365 requests alone: they belong to the other interceptor', () => {
    store.set(session());
    http.get('/data/Companies').subscribe();

    const request = httpMock.expectOne('/data/Companies');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({});
  });

  it('never sends a bearer to sign-in or refresh', () => {
    store.set(session());

    for (const url of ['/api/portal/auth/login', '/api/portal/auth/refresh', '/api/portal/auth/logout']) {
      http.post(url, {}).subscribe();
      const request = httpMock.expectOne(url);
      // Sending a stale token to /auth/refresh is the subtle one: that is the
      // request meant to replace it.
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({}, { status: 200, statusText: 'OK' });
    }
  });

  it('renews once on 401 and retries the original request', async () => {
    store.set(session('expired-token'));
    auth.refresh.and.callFake(async () => {
      store.set(session('fresh-token'));
      return session('fresh-token');
    });

    const response = firstResult(http.get<{ ok: boolean }>('/api/portal/companies'));

    httpMock
      .expectOne(request => request.headers.get('Authorization') === 'Bearer expired-token')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();

    const retry = httpMock.expectOne(
      request => request.headers.get('Authorization') === 'Bearer fresh-token',
    );
    retry.flush({ ok: true });

    expect(await response).toEqual({ ok: true });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('sends the user to sign-in when the session cannot be renewed', async () => {
    store.set(session('expired-token'));
    auth.refresh.and.resolveTo(null);

    const failed = firstResult(http.get('/api/portal/companies')).catch(() => 'rejected');

    httpMock.expectOne('/api/portal/companies').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(await failed).toBe('rejected');
    expect(store.isAuthenticated()).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('passes other failures through untouched', async () => {
    store.set(session());
    const failed = firstResult(http.get('/api/portal/companies')).catch(() => 'rejected');

    httpMock.expectOne('/api/portal/companies').flush(null, { status: 500, statusText: 'Server Error' });

    expect(await failed).toBe('rejected');
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});

/** Promise for the first value, without importing rxjs interop into every test. */
function firstResult<T>(source: { subscribe: (o: { next: (v: T) => void; error: (e: unknown) => void }) => void }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.subscribe({ next: resolve, error: reject });
  });
}
