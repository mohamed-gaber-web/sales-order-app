import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { MfaChallengeStore } from './mfa-challenge.store';
import { PortalApiError } from './portal-api.error';
import { PortalApiService } from './portal-api.service';
import { PortalSessionStore } from './portal-session.store';
import { UserAuthService } from './user-auth.service';
import { Authenticated, MfaRequired, PORTAL_ROUTES } from './portal-auth.models';

function session(accessToken = 'access-1', refreshToken = 'refresh-1'): Authenticated {
  return {
    status: 'authenticated',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'amelia.hart@acme.com' },
    tenant: { id: '22222222-2222-4222-8222-222222222222', slug: 'acme', name: 'Acme' },
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    permissions: ['tenant.read'],
    refreshToken,
    refreshExpiresIn: 1_209_600,
  };
}

const challenge: MfaRequired = {
  status: 'mfa_required',
  challengeToken: 'challenge-1',
  expiresIn: 300,
};

describe('UserAuthService', () => {
  let api: jasmine.SpyObj<PortalApiService>;
  let router: jasmine.SpyObj<Router>;
  let store: PortalSessionStore;
  let challengeStore: MfaChallengeStore;
  let auth: UserAuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    api = jasmine.createSpyObj<PortalApiService>('PortalApiService', ['post', 'postNoContent']);
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        UserAuthService,
        PortalSessionStore,
        MfaChallengeStore,
        { provide: PortalApiService, useValue: api },
        { provide: Router, useValue: router },
        { provide: Platform, useValue: { is: () => false } },
      ],
    });

    store = TestBed.inject(PortalSessionStore);
    challengeStore = TestBed.inject(MfaChallengeStore);
    auth = TestBed.inject(UserAuthService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('signIn', () => {
    it('adopts a session on the authenticated branch', async () => {
      api.post.and.resolveTo(session());

      await auth.signIn('amelia.hart@acme.com', 'correct horse');

      expect(api.post).toHaveBeenCalledWith(PORTAL_ROUTES.login, {
        email: 'amelia.hart@acme.com',
        password: 'correct horse',
      });
      expect(store.isAuthenticated()).toBeTrue();
      expect(store.accessToken()).toBe('access-1');
    });

    it('stashes the challenge and starts no session on the MFA branch', async () => {
      api.post.and.resolveTo(challenge);

      const response = await auth.signIn('amelia.hart@acme.com', 'correct horse');

      expect(response.status).toBe('mfa_required');
      // A correct password alone must not reach tenant data.
      expect(store.isAuthenticated()).toBeFalse();
      expect(store.accessToken()).toBeNull();
      expect(challengeStore.hasChallenge()).toBeTrue();
    });

    it('leaves no session behind when the credentials are refused', async () => {
      api.post.and.rejectWith(new PortalApiError(401, 'Those sign-in details are not correct.'));

      await expectAsync(auth.signIn('nobody@example.com', 'wrong')).toBeRejected();
      expect(store.isAuthenticated()).toBeFalse();
    });
  });

  describe('refresh', () => {
    it('resolves to null when there is nothing to restore', async () => {
      await expectAsync(auth.refresh()).toBeResolvedTo(null);
      expect(api.post).not.toHaveBeenCalled();
    });

    it('serialises concurrent callers into ONE exchange', async () => {
      store.set(session());

      // A refresh token is single use, and presenting it twice revokes the whole
      // family. Two screens racing a 401 must not produce two exchanges.
      let settle!: (value: Authenticated) => void;
      api.post.and.returnValue(new Promise<Authenticated>(resolve => (settle = resolve)));

      const first = auth.refresh();
      const second = auth.refresh();
      const third = auth.refresh();

      expect(api.post).toHaveBeenCalledTimes(1);

      settle(session('access-2', 'refresh-2'));
      const results = await Promise.all([first, second, third]);

      expect(results.every(result => result?.accessToken === 'access-2')).toBeTrue();
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(store.accessToken()).toBe('access-2');
      expect(store.refreshToken()).toBe('refresh-2');
    });

    it('starts a new exchange once the previous one has settled', async () => {
      store.set(session());
      api.post.and.resolveTo(session('access-2', 'refresh-2'));

      await auth.refresh();
      await auth.refresh();

      expect(api.post).toHaveBeenCalledTimes(2);
    });

    it('clears the session on failure rather than retrying', async () => {
      store.set(session());
      api.post.and.rejectWith(new PortalApiError(401, 'That session is no longer valid.'));

      await expectAsync(auth.refresh()).toBeResolvedTo(null);
      expect(store.isAuthenticated()).toBeFalse();
      expect(store.refreshToken()).toBeNull();
      expect(api.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyMfa', () => {
    it('exchanges the stashed challenge for a session', async () => {
      challengeStore.set(challenge);
      api.post.and.resolveTo(session());

      await auth.verifyMfa('123456');

      expect(api.post).toHaveBeenCalledWith(PORTAL_ROUTES.verifyMfa, {
        challengeToken: 'challenge-1',
        code: '123456',
      });
      expect(store.isAuthenticated()).toBeTrue();
      expect(challengeStore.hasChallenge()).toBeFalse();
    });

    it('refuses when no sign-in is waiting', async () => {
      await expectAsync(auth.verifyMfa('123456')).toBeRejected();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('revokes the session server-side and clears it locally', async () => {
      store.set(session());
      api.postNoContent.and.resolveTo();

      await auth.signOut();

      expect(api.postNoContent).toHaveBeenCalledWith(PORTAL_ROUTES.logout, {
        refreshToken: 'refresh-1',
      });
      expect(store.isAuthenticated()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });

    it('still signs out locally when the server cannot be reached', async () => {
      store.set(session());
      api.postNoContent.and.rejectWith(new PortalApiError(0, 'Could not reach the server.'));

      await auth.signOut();

      expect(store.isAuthenticated()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });
  });
});
