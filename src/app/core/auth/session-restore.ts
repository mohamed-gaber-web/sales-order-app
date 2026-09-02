import { UserAuthService } from './user-auth.service';
import { PortalSessionStore } from './portal-session.store';

/**
 * Trades a stored refresh token for a live session.
 *
 * Without this the app has an odd half-state after every launch: the identity is
 * in storage so the user's name and workspace appear, but the access token was
 * memory-only and is gone — so the shell renders and every authenticated request
 * 401s.
 *
 * Called from the app initializer so it completes before the first route
 * resolves, which means `authGuard` sees a settled session rather than racing
 * it.
 *
 * A failure clears everything rather than retrying; `UserAuthService.refresh()`
 * already does that, because the token is single use and a replay signs the
 * whole session out by design.
 *
 * Takes its dependencies as arguments rather than calling `inject()`, so it
 * cannot silently break if it is ever awaited outside an injection context.
 */
export async function restoreSession(
  session: PortalSessionStore,
  auth: UserAuthService,
): Promise<void> {
  // Nothing to restore: a first launch, or a session that was signed out.
  if (!session.refreshToken()) return;

  const restored = await auth.refresh();

  // Belt and braces: an exchange that resolves without a session is not a
  // session, and leaving the stale identity on screen would be a lie.
  if (!restored) session.clear();
}
