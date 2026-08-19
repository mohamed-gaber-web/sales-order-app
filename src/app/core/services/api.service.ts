import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { Observable } from 'rxjs';
import { D365_COMPANY_HEADER } from '../api/api-contracts';
import { RuntimeConfigService } from '../config/runtime-config.service';
import { CompanyContextService } from '../config/company-context.service';

/**
 * The HTTP wrapper every domain service builds its OData queries on.
 *
 * ### What changed, and why it is one line
 *
 * `baseUrl` used to be `isNative ? environment.d365BaseUrl : environment.apiBaseUrl` —
 * on a device, requests went straight to the customer's D365 instance carrying a
 * token minted from a client secret in the bundle; on the web they went through
 * a proxy that injected the secret server-side. Two paths, one of which shipped
 * a credential.
 *
 * Now there is one: our own API, which holds the credential and forwards to the
 * ERP. Because the proxy preserves D365's own paths, the ninety-five call sites
 * across the twenty domain services did not have to change at all — only what
 * their `/data/...` paths are appended to.
 *
 * The native/web branch is gone with it, which is the clearest sign the design
 * is right: there is no longer anything a device can do that a browser cannot.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly companies = inject(CompanyContextService);
  private readonly platform = inject(Platform);

  /**
   * True on native.
   *
   * No longer decides where requests go — it is kept because `DocumentOcrService`
   * still needs it: OCR is a Vercel function rather than part of the API, so it
   * is the one caller that still has a relative-versus-absolute problem.
   */
  readonly isNative: boolean;

  constructor() {
    this.isNative = this.platform.is('capacitor') || this.platform.is('cordova');
  }

  /**
   * Read per call rather than captured in the constructor.
   *
   * The old version computed this once at construction, which is exactly why it
   * could not be dynamic. A tenant's `apiBaseUrl` is not known until somebody
   * signs in, so a base URL fixed at construction would always be the wrong one.
   */
  private get baseUrl(): string {
    return this.config.d365BaseUrl;
  }

  /**
   * Which company — and so which of the tenant's environments — this call means.
   *
   * Omitted when nothing is selected, which is the common case: a tenant with a
   * single configured environment needs no disambiguation, and the API falls
   * back to it. With two, the API refuses rather than guessing.
   */
  private get scopeHeaders(): Record<string, string> {
    const companyId = this.companies.selectedCompanyId();
    return companyId ? { [D365_COMPANY_HEADER]: companyId } : {};
  }

  get<T>(path: string, params?: Record<string, string>): Observable<T> {
    const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      params: httpParams,
      headers: this.scopeHeaders,
    });
  }

  getWithHeaders<T>(
    path: string,
    params: Record<string, string> | undefined,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
    return this.http.get<T>(`${baseUrlOverride ?? this.baseUrl}${path}`, {
      params: httpParams,
      headers: { ...this.scopeHeaders, ...headers },
    });
  }

  getByUrl<T>(url: string): Observable<T> {
    return this.http.get<T>(url);
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, { headers: this.scopeHeaders });
  }

  postWithHeaders<T>(
    path: string,
    body: unknown,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    return this.http.post<T>(`${baseUrlOverride ?? this.baseUrl}${path}`, body, {
      headers: { ...this.scopeHeaders, ...headers },
    });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, { headers: this.scopeHeaders });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, { headers: this.scopeHeaders });
  }

  patchWithHeaders<T>(path: string, body: unknown, headers: Record<string, string>): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, {
      headers: { ...this.scopeHeaders, ...headers },
    });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, { headers: this.scopeHeaders });
  }
}
