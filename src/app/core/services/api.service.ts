import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl: string;
  /** True on native (Capacitor/Cordova) — there's no dev/Vercel proxy available there. */
  readonly isNative: boolean;

  constructor(private http: HttpClient, private platform: Platform) {
    this.isNative = this.platform.is('capacitor') || this.platform.is('cordova');
    // On native: use the full D365 URL (no proxy available)
    // On web: use empty baseUrl so the dev proxy / Vercel handles routing
    this.baseUrl = this.isNative
      ? environment.d365BaseUrl
      : environment.apiBaseUrl;
  }

  get<T>(path: string, params?: Record<string, string>): Observable<T> {
    const httpParams = params
      ? new HttpParams({ fromObject: params })
      : undefined;
    return this.http.get<T>(`${this.baseUrl}${path}`, { params: httpParams });
  }

  getWithHeaders<T>(
    path: string,
    params: Record<string, string> | undefined,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    const httpParams = params
      ? new HttpParams({ fromObject: params })
      : undefined;
    return this.http.get<T>(`${baseUrlOverride ?? this.baseUrl}${path}`, { params: httpParams, headers });
  }

  getByUrl<T>(url: string): Observable<T> {
    return this.http.get<T>(url);
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body);
  }

  postWithHeaders<T>(
    path: string,
    body: unknown,
    headers: Record<string, string>,
    baseUrlOverride?: string
  ): Observable<T> {
    return this.http.post<T>(`${baseUrlOverride ?? this.baseUrl}${path}`, body, { headers });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body);
  }

  patchWithHeaders<T>(path: string, body: unknown, headers: Record<string, string>): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, { headers });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`);
  }
}
