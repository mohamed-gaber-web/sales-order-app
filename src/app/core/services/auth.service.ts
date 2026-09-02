import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { testPurchaseOrderEnv } from '../../../environments/test-purchase-order-env';

interface TokenResponse {
  token_type: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
}

const STORAGE_KEYS = {
  TEST_PO_ACCESS_TOKEN: 'test_po_access_token',
  TEST_PO_TOKEN_EXPIRY: 'test_po_token_expiry',
} as const;

/** Refresh 5 min before expiry, so a call never starts on a token about to die. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * The Azure AD `client_credentials` token for the **temporary Elsewedy sandbox**,
 * and nothing else.
 *
 * This class used to hold the machine identity for the main Dynamics
 * environment, with the client secret read out of `environment.auth`. That is
 * gone: ERP calls now travel through the admin portal's `/d365` proxy, which
 * holds the credential server-side, so no confidential secret ships in the
 * build. See `ApiService`.
 *
 * What remains is the separate sandbox tenant `PurchaseOrderService` uses behind
 * `testPurchaseOrderEnv.useTestPurchaseOrderEnv` — a different directory, a
 * different app registration, and a flag that is absent in production. It should
 * be deleted along with that flag once the sandbox testing is finished; until
 * then it is the one place a client secret still reaches the device, and it is
 * why `test-purchase-order-env.ts` must never be pointed at a real environment.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(Platform);

  async getTestPurchaseOrderToken(): Promise<string> {
    const cachedToken = localStorage.getItem(STORAGE_KEYS.TEST_PO_ACCESS_TOKEN);
    const cachedExpiry = localStorage.getItem(STORAGE_KEYS.TEST_PO_TOKEN_EXPIRY);
    if (cachedToken && cachedExpiry && Date.now() < Number(cachedExpiry) - REFRESH_BUFFER_MS) {
      return cachedToken;
    }

    const testAuth = testPurchaseOrderEnv.testPurchaseOrderAuth;
    if (!testAuth) {
      throw new Error('Test purchase-order auth is not configured in this environment.');
    }

    const { clientId, clientSecret, scope, grantType, tokenUrl } = testAuth;
    const body = new HttpParams()
      .set('grant_type', grantType)
      .set('client_id', clientId)
      .set('scope', scope)
      .set('client_secret', clientSecret);

    // On native there is no proxy, so Azure is called directly; on web the
    // `/api/test-token` dev-proxy route strips the Origin header Azure rejects.
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(
        this.isNativePlatform() ? tokenUrl : '/api/test-token',
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
    );

    localStorage.setItem(STORAGE_KEYS.TEST_PO_ACCESS_TOKEN, response.access_token);
    localStorage.setItem(
      STORAGE_KEYS.TEST_PO_TOKEN_EXPIRY,
      String(Date.now() + response.expires_in * 1000)
    );
    return response.access_token;
  }

  private isNativePlatform(): boolean {
    return this.platform.is('capacitor') || this.platform.is('cordova');
  }
}
