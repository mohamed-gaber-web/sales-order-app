import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Platform } from '@ionic/angular';
import { authGuard, guestGuard, mfaChallengeGuard } from './auth.guard';
import { MfaChallengeStore } from './mfa-challenge.store';
import { PortalSessionStore } from './portal-session.store';
import { Authenticated } from './portal-auth.models';

function session(): Authenticated {
  return {
    status: 'authenticated',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'amelia.hart@acme.com' },
    tenant: { id: '22222222-2222-4222-8222-222222222222', slug: 'acme', name: 'Acme' },
    accessToken: 'access-1',
    tokenType: 'Bearer',
    expiresIn: 900,
    permissions: ['tenant.read'],
    refreshToken: 'refresh-1',
    refreshExpiresIn: 1_209_600,
  };
}

/** Runs a guard inside an injection context, as the router would. */
function run(guard: typeof authGuard, url = '/inventory/van-sales'): boolean | UrlTree {
  const state = { url } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(
    () => guard({} as never, state) as boolean | UrlTree,
  );
}

describe('auth guards', () => {
  let store: PortalSessionStore;
  let challenge: MfaChallengeStore;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        PortalSessionStore,
        MfaChallengeStore,
        { provide: Platform, useValue: { is: () => false } },
        {
          provide: Router,
          useValue: {
            createUrlTree: jasmine
              .createSpy('createUrlTree')
              .and.callFake((commands: string[], extras?: { queryParams?: object }) => ({
                commands,
                queryParams: extras?.queryParams,
              })),
          },
        },
      ],
    });

    store = TestBed.inject(PortalSessionStore);
    challenge = TestBed.inject(MfaChallengeStore);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('authGuard', () => {
    it('admits a live session', () => {
      store.set(session());
      expect(run(authGuard)).toBeTrue();
    });

    it('sends a signed-out visitor to sign-in, carrying the return URL', () => {
      run(authGuard, '/inventory/van-sales');

      expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
        queryParams: { returnUrl: '/inventory/van-sales' },
      });
    });

    it('refuses an identity that holds no credential, and clears it', () => {
      // What a failed session restore leaves behind. Admitting it would render
      // the app for someone whose every request will 401.
      store.set(session());
      const stale = TestBed.inject(PortalSessionStore);
      stale['accessTokenState'].set(null);

      expect(stale.needsCredential()).toBeTrue();
      expect(run(authGuard)).not.toBeTrue();
      expect(stale.isAuthenticated()).toBeFalse();
    });
  });

  describe('guestGuard', () => {
    it('lets a signed-out visitor reach sign-in', () => {
      expect(run(guestGuard)).toBeTrue();
    });

    it('bounces a signed-in user to the dashboard', () => {
      store.set(session());
      run(guestGuard);

      expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('mfaChallengeGuard', () => {
    it('admits a sign-in that is mid-challenge', () => {
      challenge.set({ status: 'mfa_required', challengeToken: 'c', expiresIn: 300 });
      expect(run(mfaChallengeGuard)).toBeTrue();
    });

    it('sends a direct visit back to sign-in', () => {
      run(mfaChallengeGuard);
      expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
    });

    it('treats an expired challenge as no challenge', () => {
      challenge.set({ status: 'mfa_required', challengeToken: 'c', expiresIn: -1 });
      expect(run(mfaChallengeGuard)).not.toBeTrue();
    });
  });
});
