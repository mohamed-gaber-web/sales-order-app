import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { MobileConfigService } from './mobile-config.service';
import { MobileConfigStore } from './mobile-config.store';
import { PortalApiService } from './portal-api.service';
import { MobileConfig, isBelowMinimum, isMobileConfig, isSafeApiBaseUrl } from './mobile-config.models';

const CONFIG_KEY = 'gp_mobile_config';

function config(overrides: Partial<MobileConfig> = {}): MobileConfig {
  return {
    tenantSlug: 'acme',
    tenantName: 'Acme Distribution',
    apiBaseUrl: 'https://acme-api.example.com',
    userAuth: null,
    minimumAppVersion: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(native: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      MobileConfigStore,
      MobileConfigService,
      PortalApiService,
      { provide: Platform, useValue: { is: (name: string) => native && name === 'capacitor' } },
    ],
  });
  return {
    store: TestBed.inject(MobileConfigStore),
    service: TestBed.inject(MobileConfigService),
    api: TestBed.inject(PortalApiService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('mobile config bootstrap', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('first launch', () => {
    it('fetches by slug and adopts the API host it names', async () => {
      const { service, store, httpMock } = setup(true);

      const done = service.bootstrap();
      const request = httpMock.expectOne(
        r => r.url === `${environment.portalApiBaseUrl}/mobile/config`
      );
      expect(request.request.params.get('slug')).toBe(environment.tenantSlug);
      request.flush(config());
      await done;

      expect(store.apiBaseUrl()).toBe('https://acme-api.example.com');
      expect(store.tenantName()).toBe('Acme Distribution');
      expect(store.source()).toBe('network');
      httpMock.verify();
    });

    it('falls back to the bundled host when the network is unreachable', async () => {
      const { service, store, httpMock } = setup(true);

      const done = service.bootstrap();
      httpMock.expectOne(() => true).error(new ProgressEvent('offline'));
      await done;

      // A first launch in a warehouse basement still gets a working app.
      expect(store.apiBaseUrl()).toBe(environment.portalApiBaseUrl);
      expect(store.source()).toBe('bundled');
      httpMock.verify();
    });

    it('ignores a response that does not match the contract', async () => {
      const { service, store, httpMock } = setup(true);

      const done = service.bootstrap();
      httpMock.expectOne(() => true).flush({ tenantSlug: 'acme' });
      await done;

      expect(store.apiBaseUrl()).toBe(environment.portalApiBaseUrl);
      httpMock.verify();
    });

    it('refuses an http:// base — a bearer token on a cleartext hop is disclosed', async () => {
      const { service, store, httpMock } = setup(true);

      const done = service.bootstrap();
      httpMock.expectOne(() => true).flush(config({ apiBaseUrl: 'http://acme-api.example.com' }));
      await done;

      expect(store.apiBaseUrl()).toBe(environment.portalApiBaseUrl);
      httpMock.verify();
    });
  });

  describe('later launches', () => {
    it('starts from the cache without waiting on the network', async () => {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config()));
      const { service, store, httpMock } = setup(true);

      // Adopted before any request resolves — a launch never blocks on this.
      expect(store.apiBaseUrl()).toBe('https://acme-api.example.com');
      expect(store.source()).toBe('cache');

      await service.bootstrap();
      // Refreshed behind the cached answer.
      httpMock.expectOne(() => true).flush(config({ tenantName: 'Acme Ltd' }));
      httpMock.verify();
    });

    it('reports a tenant change so the caller can drop a foreign session', () => {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config()));
      const { store } = setup(true);

      expect(store.set(config({ tenantSlug: 'other', tenantName: 'Other' }))).toBeTrue();
      expect(store.set(config({ tenantSlug: 'other', tenantName: 'Renamed' }))).toBeFalse();
    });

    it('discards a hand-edited cache rather than trusting where it points', () => {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config(), apiBaseUrl: 'not a url' }));
      const { store } = setup(true);

      expect(store.apiBaseUrl()).toBe(environment.portalApiBaseUrl);
    });
  });

  describe('routing', () => {
    it('sends native requests to the configured host', () => {
      const { store, api } = setup(true);
      store.set(config());

      expect(api.url('/auth/login')).toBe('https://acme-api.example.com/auth/login');
      expect(api.owns('https://acme-api.example.com/companies')).toBeTrue();
    });

    it('keeps the proxy prefix on web, so no CORS entry is needed', () => {
      const { store, api } = setup(false);
      store.set(config());

      expect(api.url('/auth/login')).toBe('/api/portal/auth/login');
      expect(api.owns('/api/portal/companies')).toBeTrue();
    });

    it('bootstraps through the proxy prefix on web', async () => {
      const { service, httpMock } = setup(false);
      const done = service.bootstrap();
      httpMock.expectOne(r => r.url === '/api/portal/mobile/config').flush(config());
      await done;
      httpMock.verify();
    });
  });

  describe('version floor', () => {
    it('compares dotted numbers', () => {
      expect(isBelowMinimum('1.0.0', '1.2.0')).toBeTrue();
      expect(isBelowMinimum('1.2.0', '1.2.0')).toBeFalse();
      expect(isBelowMinimum('1.10.0', '1.9.0')).toBeFalse();
      expect(isBelowMinimum('2.0', '1.9.9')).toBeFalse();
    });

    it('never blocks on a null floor or an unreadable version', () => {
      expect(isBelowMinimum('1.0.0', null)).toBeFalse();
      // Refusing to run because a version string could not be parsed would be a
      // self-inflicted outage.
      expect(isBelowMinimum('nightly', '1.2.0')).toBeFalse();
    });
  });

  describe('guards', () => {
    it('accepts only https bases with no trailing slash', () => {
      expect(isSafeApiBaseUrl('https://a.example.com')).toBeTrue();
      expect(isSafeApiBaseUrl('https://a.example.com/')).toBeFalse();
      expect(isSafeApiBaseUrl('http://a.example.com')).toBeFalse();
      expect(isSafeApiBaseUrl('javascript:alert(1)')).toBeFalse();
    });

    it('requires every field the app reads', () => {
      expect(isMobileConfig(config())).toBeTrue();
      expect(isMobileConfig({ ...config(), tenantName: undefined })).toBeFalse();
      expect(isMobileConfig(null)).toBeFalse();
    });
  });
});
