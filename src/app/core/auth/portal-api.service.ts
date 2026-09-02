import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { PortalApiError } from './portal-api.error';
import { MobileConfigStore } from './mobile-config.store';

/**
 * The path prefix the web build uses to reach the portal API.
 *
 * A prefix rather than the bare route, because the portal mounts its
 * controllers at the root (`/auth/login`, `/companies`) and those would collide
 * with this app's own paths. `proxy.conf.js` strips it in development and
 * `vercel.json` rewrites it in production, so the browser never makes a
 * cross-origin request and no CORS allowlist entry is needed.
 *
 * Exported so the interceptor can recognise a portal request by its URL.
 */
export const PORTAL_WEB_PREFIX = '/api/portal';

/**
 * The single place this app talks to the Grow Path Admin Portal API.
 *
 * Two jobs beyond wrapping `HttpClient`. It owns the base URL, so no other file
 * hard-codes a host — native goes straight to the deployed API (CapacitorHttp
 * sends requests through the OS, so there is no CORS preflight), while web goes
 * through the proxy prefix above. And it normalises every failure into a
 * `PortalApiError`, so callers never handle `HttpErrorResponse`.
 *
 * Promise-returning rather than Observable-returning, deliberately: every caller
 * is a one-shot command in an `async` page handler, and the auth flows need to
 * `await` each other (notably the serialised refresh in `UserAuthService`).
 */
@Injectable({ providedIn: 'root' })
export class PortalApiService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(Platform);
  private readonly config = inject(MobileConfigStore);

  /** True on native, where there is no dev-server or Vercel proxy to route through. */
  private readonly isNative = this.platform.is('capacitor') || this.platform.is('cordova');

  /**
   * Absolute URL for a portal route path, e.g. `/auth/login`.
   *
   * On native the host comes from the fetched mobile configuration, so one
   * build serves every tenant; it falls back to the bundled value until that
   * first bootstrap succeeds. On web the proxy prefix is kept instead — the
   * dev server and Vercel both rewrite it, which is what keeps the browser from
   * making a cross-origin request and needing a CORS allowlist entry.
   */
  url(path: string): string {
    return this.isNative ? `${this.config.apiBaseUrl()}${path}` : `${PORTAL_WEB_PREFIX}${path}`;
  }

  /** True when a request URL belongs to the portal API rather than D365. */
  owns(url: string): boolean {
    return this.isNative
      ? url.startsWith(this.config.apiBaseUrl())
      : url.startsWith(PORTAL_WEB_PREFIX);
  }

  get<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(this.url(path)).pipe(catchError(toPortalError)),
    );
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(this.url(path), body).pipe(catchError(toPortalError)),
    );
  }

  /** `post`, for the routes that answer 204 with no body. */
  async postNoContent(path: string, body: unknown): Promise<void> {
    await firstValueFrom(
      this.http
        .post(this.url(path), body, { observe: 'response', responseType: 'text' })
        .pipe(catchError(toPortalError)),
    );
  }
}

function toPortalError(error: unknown) {
  return throwError(() =>
    error instanceof HttpErrorResponse
      ? PortalApiError.from(error)
      : new PortalApiError(0, 'Something went wrong. Please try again.'),
  );
}
