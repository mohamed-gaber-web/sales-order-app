import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { erpConfiguredGuard, setupRequiredGuard } from './erp-configured.guard';
import { TenantConfigStore } from './tenant-config.store';
import { TenantCompany, TenantConnection, findErpBlocker } from './tenant-config.models';

function connection(overrides: Partial<TenantConnection> = {}): TenantConnection {
  return {
    environmentId: 'env-1',
    environmentName: 'GP Customers (Sandbox)',
    environmentKind: 'sandbox',
    url: 'https://gp-customers.sandbox.operations.eu.dynamics.com',
    entraTenantId: '26c58d65-b577-4f92-aed2-cec1395d146d',
    authorityHost: 'login.microsoftonline.com',
    clientId: 'db61ee09-84a1-4912-b319-709480fa243a',
    hasClientSecret: true,
    clientSecretUpdatedAt: null,
    clientSecretExpiresAt: null,
    daysUntilSecretExpiry: null,
    state: 'connected',
    checkedAt: '2026-09-02T11:06:32.762Z',
    error: null,
    tokenUrl: 'https://login.microsoftonline.com/26c58d65.../oauth2/v2.0/token',
    scope: 'https://gp-customers.sandbox.operations.eu.dynamics.com/.default',
    ...overrides,
  };
}

function company(overrides: Partial<TenantCompany> = {}): TenantCompany {
  return { id: 'co-1', name: 'USMF', dataAreaId: 'usmf', environmentId: 'env-1', ...overrides };
}

function makeStore(): { store: TenantConfigStore; router: Router } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      TenantConfigStore,
      {
        provide: Router,
        useValue: {
          createUrlTree: jasmine.createSpy('createUrlTree').and.callFake((c: string[]) => ({ commands: c })),
        },
      },
    ],
  });
  return { store: TestBed.inject(TenantConfigStore), router: TestBed.inject(Router) };
}

function run(guard: typeof erpConfiguredGuard): boolean | UrlTree {
  return TestBed.runInInjectionContext(
    () => guard({} as never, { url: '/dashboard' } as RouterStateSnapshot) as boolean | UrlTree
  );
}

describe('findErpBlocker', () => {
  it('names a tenant with no environment at all', () => {
    expect(findErpBlocker([], [])).toBe('no_environment');
  });

  it('names an environment with no credentials saved', () => {
    expect(findErpBlocker([connection({ state: 'not_configured' })], [])).toBe('not_configured');
  });

  it('names a credential the ERP is rejecting', () => {
    expect(findErpBlocker([connection({ state: 'failing' })], [company()])).toBe('failing');
  });

  it('names a connected environment with no legal entity', () => {
    expect(findErpBlocker([connection()], [])).toBe('no_company');
  });

  it('reports nothing wrong when everything is present', () => {
    expect(findErpBlocker([connection()], [company()])).toBeNull();
  });

  it('accepts one connected environment among several broken ones', () => {
    const connections = [connection({ environmentId: 'a', state: 'failing' }), connection()];
    expect(findErpBlocker(connections, [company()])).toBeNull();
  });
});

describe('TenantConfigStore', () => {
  it('knows nothing before the first load', () => {
    const { store } = makeStore();
    expect(store.loaded()).toBeFalse();
    expect(store.blocker()).toBeNull();
    expect(store.erpReady()).toBeFalse();
  });

  it('reads dataAreaId from the tenant rather than a constant', () => {
    const { store } = makeStore();
    store.set({
      connections: [connection()],
      companies: [company({ dataAreaId: 'acml', name: 'Acme Logistics' })],
      modules: [],
    });

    expect(store.dataAreaId()).toBe('acml');
    expect(store.erpReady()).toBeTrue();
  });

  it('picks the company belonging to the connected environment', () => {
    const { store } = makeStore();
    store.set({
      connections: [
        connection({ environmentId: 'broken', state: 'not_configured' }),
        connection({ environmentId: 'live' }),
      ],
      companies: [
        company({ id: 'c1', environmentId: 'broken', dataAreaId: 'wrong' }),
        company({ id: 'c2', environmentId: 'live', dataAreaId: 'right' }),
      ],
      modules: [],
    });

    expect(store.dataAreaId()).toBe('right');
    // Two environments means the API cannot resolve one on its own.
    expect(store.companyId()).toBe('c2');
  });

  it('omits the company header while there is only one environment', () => {
    const { store } = makeStore();
    store.set({ connections: [connection()], companies: [company()], modules: [] });
    expect(store.companyId()).toBeNull();
  });

  it('reports module entitlements', () => {
    const { store } = makeStore();
    store.set({
      connections: [connection()],
      companies: [company()],
      modules: [
        { key: 'van-sales', description: '', enabled: true, enabledAt: null },
        { key: 'warehouse', description: '', enabled: false, enabledAt: null },
      ],
    });

    expect(store.hasModule('van-sales')).toBeTrue();
    expect(store.hasModule('warehouse')).toBeFalse();
    expect(store.hasModule('nonexistent')).toBeFalse();
  });

  it('surfaces a message a person can act on', () => {
    const { store } = makeStore();
    store.set({ connections: [connection({ state: 'not_configured' })], companies: [], modules: [] });

    expect(store.blockerMessage()?.title).toContain('not finished');
    expect(store.blockerMessage()?.detail).toContain('administrator');
  });

  it('forgets everything on sign-out', () => {
    const { store } = makeStore();
    store.set({ connections: [connection()], companies: [company()], modules: [] });
    store.clear();

    // One tenant's environments must not leak to the next person to sign in.
    expect(store.connections()).toEqual([]);
    expect(store.loaded()).toBeFalse();
  });
});

describe('erpConfiguredGuard', () => {
  it('admits a working workspace', () => {
    const { store } = makeStore();
    store.set({ connections: [connection()], companies: [company()], modules: [] });
    expect(run(erpConfiguredGuard)).toBeTrue();
  });

  it('does NOT bounce before the config has loaded', () => {
    // Unknown is not broken. Bouncing here would flash the setup screen on
    // every launch while the first request is still in flight.
    const { store } = makeStore();
    expect(store.loaded()).toBeFalse();
    expect(run(erpConfiguredGuard)).toBeTrue();
  });

  it('redirects to the setup screen when the ERP is unusable', () => {
    const { store, router } = makeStore();
    store.set({ connections: [], companies: [], modules: [] });

    expect(run(erpConfiguredGuard)).not.toBeTrue();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/setup-required']);
  });
});

describe('setupRequiredGuard', () => {
  it('lets a broken workspace see the explanation', () => {
    const { store } = makeStore();
    store.set({ connections: [], companies: [], modules: [] });
    expect(run(setupRequiredGuard)).toBeTrue();
  });

  it('sends a fixed workspace back to the dashboard', () => {
    const { store, router } = makeStore();
    store.set({ connections: [connection()], companies: [company()], modules: [] });

    expect(run(setupRequiredGuard)).not.toBeTrue();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });
});
