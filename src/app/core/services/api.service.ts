import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { Observable, catchError, throwError } from 'rxjs';
import { PortalApiService } from '../auth';
import { describeD365ProxyError } from './d365-proxy.error';

/**
 * Which company — and therefore which D365 environment — a request means.
 *
 * A header rather than a query parameter: the path and query of a proxied
 * request belong to D365 and travel to the ERP verbatim, so anything added
 * there would change what the OData query means. The API strips this before
 * forwarding.
 */
export const D365_COMPANY_HEADER = 'x-d365-company';

/** The ERP pass-through's prefix on the admin portal API. */
const D365_PREFIX = '/d365';

/** Path families the portal proxies to D365. Everything else is left alone. */
function isD365Path(path: string): boolean {
  return path.startsWith('/data') || path.startsWith('/api/services');
}

/**
 * The single place this app reaches Dynamics 365.
 *
 * **Every ERP call goes through the admin portal**, not to D365 directly. The
 * portal holds the Dynamics service-principal credential and attaches it
 * server-side, which is what took the `client_credentials` secret out of the
 * installed build — an APK can be unzipped in seconds, so a confidential client
 * secret inside one is a secret that has been published.
 *
 * URLs therefore resolve the same way the rest of the portal API does: an
 * absolute address on native (CapacitorHttp sends it through the OS, so no CORS
 * preflight), and the `/api/portal` prefix on web, which the dev-server proxy
 * strips and Vercel rewrites.
 *
 *     /data/Companies  ->  /api/portal/d365/data/Companies          (web)
 *                      ->  https://<api>/d365/data/Companies        (native)
 *
 * `PortalAuthInterceptor` attaches the signed-in user's bearer token to these,
 * because they now sit under the portal's origin — so an ERP read is
 * authenticated as *the person*, and a request from a signed-out device is
 * refused before it ever reaches Dynamics.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(Platform);
  private readonly portal = inject(PortalApiService);

  /** True on native (Capacitor/Cordova) — there's no dev/Vercel proxy available there. */
  readonly isNative = this.platform.is('capacitor') || this.platform.is('cordova');

  /**
   * The company to scope ERP requests to, when the tenant has more than one
   * D365 environment.
   *
   * Left unset for a tenant with a single environment: the API resolves that one
   * on its own, and requiring the header would make every screen learn about
   * environments before it could ask for a sales order. With more than one
   * configured and nothing set here, the API answers 400 `company_required`
   * rather than guessing — posting an order into whichever environment sorted
   * first is not a failure anybody would notice quickly.
   */
  readonly companyId = signal<string | null>(null);

  get<T>(path: string, params?: Record<string, string>): Observable<T> {
    return this.request('GET', path, params, undefined, {});
  }

  getWithHeaders<T>(
    path: string,
    params: Record<string, string> | undefined,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    return this.request('GET', path, params, undefined, headers, baseUrlOverride);
  }

  getByUrl<T>(url: string): Observable<T> {
    return this.http.get<T>(url).pipe(catchError(translateD365Failure));
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.request('POST', path, undefined, body, {});
  }

  postWithHeaders<T>(
    path: string,
    body: unknown,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    return this.request('POST', path, undefined, body, headers, baseUrlOverride);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.request('PUT', path, undefined, body, {});
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.request('PATCH', path, undefined, body, {});
  }

  patchWithHeaders<T>(path: string, body: unknown, headers: Record<string, string>): Observable<T> {
    return this.request('PATCH', path, undefined, body, headers);
  }

  delete<T>(path: string): Observable<T> {
    return this.request('DELETE', path, undefined, undefined, {});
  }

  /**
   * Resolves a path to a URL.
   *
   * An explicit `baseUrlOverride` always wins — that is how the document reader
   * reaches `/api/ocr` and how the temporary Elsewedy sandbox reaches its own
   * D365 tenant directly. Only the two ERP path families are rewritten through
   * the portal; anything else keeps the relative path it was given, so the
   * sandbox's `/api/test-data` and `/api/test-services` proxy routes still work.
   */
  private url(path: string, baseUrlOverride?: string): string {
    if (baseUrlOverride !== undefined) return `${baseUrlOverride}${path}`;
    return isD365Path(path) ? this.portal.url(`${D365_PREFIX}${path}`) : path;
  }

  private request<T>(
    method: string,
    path: string,
    params: Record<string, string> | undefined,
    body: unknown,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    const company = this.companyId();
    const proxied = baseUrlOverride === undefined && isD365Path(path);

    return this.http
      .request<T>(method, this.url(path, baseUrlOverride), {
        body,
        params: params ? new HttpParams({ fromObject: params }) : undefined,
        headers:
          proxied && company ? { ...headers, [D365_COMPANY_HEADER]: company } : headers,
      })
      .pipe(catchError(translateD365Failure));
  }
}

/**
 * Replaces a proxy failure code with a sentence, keeping the error type.
 *
 * The 107 call sites downstream handle `HttpErrorResponse`, so this must not
 * change what they catch — only what the body says. Without it a misconfigured
 * ERP connection surfaces as a bare "failed to load", which sends whoever is
 * holding the device looking in entirely the wrong place.
 */
function translateD365Failure(error: unknown): Observable<never> {
  if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

  const message = describeD365ProxyError(error);
  if (!message) return throwError(() => error);

  return throwError(
    () =>
      new HttpErrorResponse({
        status: error.status,
        statusText: error.statusText,
        url: error.url ?? undefined,
        headers: error.headers,
        error: { ...(error.error as object), message },
      })
  );
}
