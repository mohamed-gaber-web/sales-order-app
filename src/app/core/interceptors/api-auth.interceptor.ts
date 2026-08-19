import { Injectable, inject } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, from, switchMap, catchError, throwError } from 'rxjs';
import { API_ROUTES } from '../api/api-contracts';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { UserAuthService } from '../services/user-auth.service';

/**
 * Attaches this user's access token, and keeps it fresh.
 *
 * Replaces the interceptor that attached an *application* token to anything
 * whose URL started with `/data` — a token minted on the device from a client
 * secret in the bundle. There is one token now, it identifies a person, and it
 * goes to our API rather than to the customer's ERP.
 *
 * ### Refresh and replay, rather than sign out
 *
 * The portal's own interceptor clears the session on any 401. For a browser tab
 * that is merely irritating; for a picker three hours into a shift, crossing a
 * dozen fifteen-minute expiries, it is unusable. So a 401 here means refresh
 * once and replay — and because `UserAuthService.refresh()` is single-flight,
 * six screens failing at once produce one exchange rather than six.
 *
 * Six exchanges would not merely be wasteful: the refresh token is single-use
 * and a replay revokes the whole family, so the naive version signs the user out
 * precisely when it is trying not to.
 */

/**
 * Marks a request that has already been replayed once.
 *
 * Without it, a 401 on the replay would refresh and replay again, and a session
 * the server has genuinely ended would loop instead of failing.
 */
const REPLAYED = new HttpContextToken<boolean>(() => false);

/**
 * Routes that must never carry an Authorization header.
 *
 * Each is unauthenticated by necessity: the caller has no credential yet
 * (sign-in, reset), holds one that has expired (refresh), or holds something
 * that is not an access token at all (the MFA challenge). `refresh` is the
 * subtle one — sending a stale bearer to the request meant to replace it invites
 * a server that validates before reading the body to reject its own remedy.
 */
const UNAUTHENTICATED: readonly string[] = [
  API_ROUTES.login,
  API_ROUTES.refresh,
  API_ROUTES.logout,
  API_ROUTES.verifyMfa,
  API_ROUTES.requestPasswordReset,
  API_ROUTES.mobileConfig,
];

@Injectable()
export class ApiAuthInterceptor implements HttpInterceptor {
  private readonly auth = inject(UserAuthService);
  private readonly config = inject(RuntimeConfigService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isOurApi(request.url) || isUnauthenticated(request.url)) {
      return next.handle(request);
    }

    return from(this.auth.getAccessToken()).pipe(
      switchMap((token) => {
        const authorised = token ? withToken(request, token) : request;
        return next.handle(authorised).pipe(
          catchError((error: unknown) => {
            if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
              return throwError(() => error);
            }
            if (request.context.get(REPLAYED)) {
              // Already tried. The session is genuinely over.
              return from(this.auth.signOut()).pipe(
                switchMap(() => throwError(() => error))
              );
            }
            return this.refreshAndReplay(request, next, error);
          })
        );
      })
    );
  }

  private refreshAndReplay(
    request: HttpRequest<unknown>,
    next: HttpHandler,
    original: HttpErrorResponse
  ): Observable<HttpEvent<unknown>> {
    return from(this.auth.refresh()).pipe(
      switchMap((refreshed) => {
        if (!refreshed) {
          return from(this.auth.signOut()).pipe(
            switchMap(() => throwError(() => original))
          );
        }
        return from(this.auth.getAccessToken()).pipe(
          switchMap((token) => {
            if (!token) return throwError(() => original);
            const replay = withToken(
              request.clone({ context: request.context.set(REPLAYED, true) }),
              token
            );
            return next.handle(replay);
          })
        );
      })
    );
  }

  /**
   * Whether this request is going to our own API.
   *
   * Both base URLs count: tenant-scoped traffic goes to `apiBaseUrl`, while
   * sign-in and configuration go to the platform origin, and on the web build
   * both may be empty strings meaning same-origin. A relative URL is ours by
   * elimination — every third-party call this app makes is absolute.
   */
  private isOurApi(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) return true;
    const bases = [this.config.apiBaseUrl, this.config.platformApiBaseUrl].filter(Boolean);
    return bases.some((base) => url.startsWith(base));
  }
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function isUnauthenticated(url: string): boolean {
  const [path] = url.split('?', 1);
  return UNAUTHENTICATED.some((route) => path.endsWith(route));
}
