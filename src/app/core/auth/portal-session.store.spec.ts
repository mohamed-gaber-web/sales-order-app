import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { PortalSessionStore } from './portal-session.store';
import { Authenticated } from './portal-auth.models';

const IDENTITY_KEY = 'gp_session_identity';
const REFRESH_KEY = 'gp_session_refresh';

function session(overrides: Partial<Authenticated> = {}): Authenticated {
  return {
    status: 'authenticated',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'amelia.hart@acme.com' },
    tenant: { id: '22222222-2222-4222-8222-222222222222', slug: 'acme', name: 'Acme' },
    accessToken: 'access-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    permissions: ['tenant.read', 'user.read'],
    refreshToken: 'refresh-token',
    refreshExpiresIn: 1_209_600,
    ...overrides,
  };
}

/** Builds a store with `Platform.is()` answering for the platform under test. */
function storeFor(native: boolean): PortalSessionStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PortalSessionStore,
      { provide: Platform, useValue: { is: (name: string) => native && name === 'capacitor' } },
    ],
  });
  return TestBed.inject(PortalSessionStore);
}

describe('PortalSessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('adopts a sign-in and exposes the identity', () => {
    const store = storeFor(false);
    store.set(session());

    expect(store.isAuthenticated()).toBeTrue();
    expect(store.user()?.email).toBe('amelia.hart@acme.com');
    expect(store.workspaceName()).toBe('Acme');
    expect(store.permissions()).toEqual(['tenant.read', 'user.read']);
    expect(store.hasPermission('user.read')).toBeTrue();
    expect(store.hasPermission('user.write')).toBeFalse();
  });

  it('never writes the access token to storage', () => {
    const store = storeFor(false);
    store.set(session());

    const persisted = `${localStorage.getItem(IDENTITY_KEY)}${sessionStorage.getItem(REFRESH_KEY)}`;
    expect(persisted).not.toContain('access-token');
    expect(store.accessToken()).toBe('access-token');
  });

  it('keeps the refresh token in sessionStorage on web', () => {
    const store = storeFor(false);
    store.set(session());

    expect(sessionStorage.getItem(REFRESH_KEY)).toBe('refresh-token');
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('keeps the refresh token in localStorage on native, so it survives a restart', () => {
    const store = storeFor(true);
    store.set(session());

    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-token');
    expect(sessionStorage.getItem(REFRESH_KEY)).toBeNull();

    // A fresh store is what a relaunch produces.
    const relaunched = storeFor(true);
    expect(relaunched.refreshToken()).toBe('refresh-token');
    expect(relaunched.isAuthenticated()).toBeTrue();
  });

  it('reports needsCredential for a restored identity with no access token', () => {
    storeFor(true).set(session());

    const relaunched = storeFor(true);
    expect(relaunched.isAuthenticated()).toBeTrue();
    expect(relaunched.accessToken()).toBeNull();
    expect(relaunched.needsCredential()).toBeTrue();
  });

  it('rejects a hand-edited identity rather than rendering half of one', () => {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ user: { email: 'x@y.z' } }));

    expect(storeFor(false).isAuthenticated()).toBeFalse();
  });

  it('rejects an identity written before permissions existed', () => {
    // Unknown permissions are not the same as none: defaulting to empty would
    // show a returning user an app with half its navigation missing.
    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        user: { id: 'a', email: 'x@y.z' },
        tenant: { id: 'b', slug: 'acme', name: 'Acme' },
      }),
    );

    expect(storeFor(false).isAuthenticated()).toBeFalse();
  });

  it('survives unparseable stored state', () => {
    localStorage.setItem(IDENTITY_KEY, '{not json');

    expect(() => storeFor(false)).not.toThrow();
    expect(storeFor(false).isAuthenticated()).toBeFalse();
  });

  it('clears everything on sign-out', () => {
    const store = storeFor(false);
    store.set(session());
    store.clear();

    expect(store.isAuthenticated()).toBeFalse();
    expect(store.accessToken()).toBeNull();
    expect(store.refreshToken()).toBeNull();
    expect(localStorage.getItem(IDENTITY_KEY)).toBeNull();
    expect(sessionStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('falls back to the slug when a tenant has no name', () => {
    const store = storeFor(false);
    store.set(session({ tenant: { id: 'b', slug: 'acme', name: '' } }));

    expect(store.workspaceName()).toBe('acme');
  });

  it('derives a display name and initials from the address', () => {
    const store = storeFor(false);
    store.set(session());

    expect(store.displayName()).toBe('Amelia Hart');
    expect(store.initials()).toBe('AH');
  });
});
