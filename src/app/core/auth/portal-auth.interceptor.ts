import { Injectable, Injector, inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { PortalApiService } from './portal-api.service';
import { PortalSessionStore } from './portal-session.store';
import { UserAuthService } from './user-auth.service';
import { PORTAL_UNAUTHENTICATED_ROUTES } from './portal-auth.models';

/**
 * Attaches the portal access token, and renews it once when it has expired.
 *
 * Scoped to portal requests only. D365 traffic is handled by `AuthInterceptor`,
 * which carries the machine token and matches on `/data` and `/api/services` —
 * the two allowlists do not overlap, so neither token can reach the other's API.
 *
 * The token is read from the store per request rather than captured once, so a
 * refresh that rotates it takes effect on the next call without re-registering
 * anything.
 */
@Injectable()
export class PortalAuthInterceptor implements HttpInterceptor {
  private readonly api = inject(PortalApiService);
  private readonly session = inject(PortalSessionStore);
  private readonly router = inject(Router);

  /**
   * `UserAuthService` is resolved on demand rather than injected.
   *
   * It depends on `HttpClient`, which depends on this interceptor. Constructing
   * it here would close that circle at bootstrap; resolving it at the moment a
   * 401 arrives does not.
   */
  private readonly injector = inject(Injector);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.api.owns(request.url) || isUnauthenticatedRoute(request.url)) {
      return next.handle(request);
    }

    const token = this.session.accessToken();
    const authorised = token ? withBearer(request, token) : request;

    return next.handle(authorised).pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError(() => error);
        }
        return this.renewAndRetry(request, next);
      }),
    );
  }

  /**
   * One shared refresh, then the original request again.
   *
   * `UserAuthService.refresh()` serialises concurrent callers into a single
   * exchange — two of them would look like a replayed token to the API and
   * revoke the whole session. If it yields nothing the session is over, so the
   * user goes to sign-in rather than seeing a bare 401.
   */
  private renewAndRetry(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    const auth = this.injector.get(UserAuthService);

    return from(auth.refresh()).pipe(
      switchMap(session => {
        if (!session) {
          this.session.clear();
          void this.router.navigateByUrl('/auth/login');
          return throwError(
            () => new HttpErrorResponse({ status: 401, statusText: 'Session expired' }),
          );
        }
        return next.handle(withBearer(request, session.accessToken));
      }),
    );
  }
}

function withBearer(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/** True when the URL ends in a route that must never carry a bearer token. */
function isUnauthenticatedRoute(url: string): boolean {
  const path = url.split('?')[0];
  return PORTAL_UNAUTHENTICATED_ROUTES.some(route => path.endsWith(route));
}
