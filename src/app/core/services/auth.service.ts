import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface TokenResponse {
  token_type: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  TOKEN_EXPIRY: 'token_expiry',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

  constructor(private http: HttpClient, private platform: Platform) {}

  /** Called once at app startup via APP_INITIALIZER */
  async initialize(): Promise<void> {
    if (this.isTokenValid()) {
      return;
    }
    await this.fetchToken();
  }

  /** Get the current access token (refreshes if expired) */
  async getToken(): Promise<string> {
    if (this.isTokenValid()) {
      return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)!;
    }
    await this.fetchToken();
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)!;
  }

  /** Check if the stored token is still valid */
  isTokenValid(): boolean {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
    if (!token || !expiry) return false;
    return Date.now() < Number(expiry) - this.REFRESH_BUFFER_MS;
  }

  /** Fetch a new token from Azure AD */
  private async fetchToken(): Promise<void> {
    const { clientId, clientSecret, scope, grantType } = environment.auth;

    const body = new HttpParams()
      .set('grant_type', grantType)
      .set('client_id', clientId)
      .set('client_secret', clientSecret)
      .set('scope', scope);

    // On native (Capacitor) → call Azure directly (no CORS issue)
    // On web (browser) → use proxy to avoid CORS
    const tokenUrl = this.isNativePlatform()
      ? environment.auth.tokenUrl
      : '/api/token';

    const response = await firstValueFrom(
      this.http.post<TokenResponse>(tokenUrl, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );

    this.storeToken(response);
  }

  /** Persist token and its expiry time */
  private storeToken(response: TokenResponse): void {
    const expiryTime = Date.now() + response.expires_in * 1000;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access_token);
    localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(expiryTime));
  }

  /** Clear stored token (useful for logout) */
  clearToken(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  }

  private isNativePlatform(): boolean {
    return this.platform.is('capacitor') || this.platform.is('cordova');
  }
}
