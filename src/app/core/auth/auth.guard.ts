import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { MfaChallengeStore } from './mfa-challenge.store';
import { PortalSessionStore } from './portal-session.store';

/**
 * Keeps signed-out visitors out of the app.
 *
 * A usability control, not the security boundary. Everything behind it is
 * rendered from data the API hands over, and the API decides for itself whether
 * to hand it over — the guard only spares people the sight of screens that would
 * fail to load. Treating a client-side guard as the access control is how an app
 * ends up shipping data to callers who should not have it.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const session = inject(PortalSessionStore);
  const router = inject(Router);

  // Identity alone is not a session. A stored identity with no live credential
  // is what a failed restore leaves behind; admitting it renders the app for
  // someone whose every request will 401, which surfaces as mysteriously empty
  // screens rather than as "you are signed out". Session restore runs as an app
  // initializer, so by the time a guard evaluates, a refresh token that could
  // have been exchanged already has been.
  if (session.isAuthenticated() && !session.needsCredential()) return true;

  // Leaving the stale identity on screen would keep the menu showing someone who
  // cannot make a request.
  if (session.needsCredential()) session.clear();

  // `returnUrl` so a deep link survives the detour through sign-in.
  return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Bounces an already-signed-in user away from the sign-in screen.
 *
 * Holds to the same definition of "signed in" as `authGuard`: bouncing someone
 * who has an identity but no credential would trap them, sending them to a
 * screen that cannot load and straight back again.
 */
export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
  const session = inject(PortalSessionStore);
  const router = inject(Router);

  return session.isAuthenticated() && !session.needsCredential()
    ? router.createUrlTree(['/dashboard'])
    : true;
};

/**
 * Keeps the code screen reachable only mid-sign-in.
 *
 * The challenge lives in memory, so a direct visit or a reload has nothing to
 * verify and would show a code field that could never succeed. Sending them back
 * to sign in is the only recovery.
 */
export const mfaChallengeGuard: CanActivateFn = (): boolean | UrlTree => {
  const challenge = inject(MfaChallengeStore);
  const router = inject(Router);

  return challenge.hasChallenge() ? true : router.createUrlTree(['/auth/login']);
};
