import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MobileConfigStore } from './mobile-config.store';
import { MobileConfig, isMobileConfig } from './mobile-config.models';
import { PORTAL_WEB_PREFIX } from './portal-api.service';

/** The device-facing bootstrap route. Unauthenticated by necessity. */
const MOBILE_CONFIG_PATH = '/mobile/config';

/**
 * How long a first launch may wait on the bootstrap endpoint.
 *
 * Only ever reached with no cached configuration, so this is a genuine
 * cold-start budget rather than a per-launch cost. Long enough for a slow mobile
 * connection, short enough that a rep is not staring at a splash screen.
 */
const BOOTSTRAP_TIMEOUT_MS = 8000;

/**
 * Fetches the runtime configuration that replaced the customer half of
 * `environment.ts`.
 *
 * ### Cache first, always
 *
 * A launch must never block on this when a cached answer exists. The device on a
 * van route is offline often, and a warehouse basement is exactly where an app
 * that waits for the network fails to start. So: adopt the cache immediately,
 * refresh in the background, and only block when there is nothing cached at all
 * — and even then, fall back to the bundled default rather than fail.
 *
 * ### Bootstrap host versus API host
 *
 * The bootstrap request goes to the bundled `portalApiBaseUrl`; everything after
 * goes to the `apiBaseUrl` this returns. For a single installation they are the
 * same host and nothing changes. They differ when a tenant is served from
 * somewhere else, which is the case this endpoint exists for.
 */
@Injectable({ providedIn: 'root' })
export class MobileConfigService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(Platform);
  private readonly store = inject(MobileConfigStore);

  private readonly isNative =
    this.platform.is('capacitor') || this.platform.is('cordova');

  /**
   * Resolves the configuration for launch.
   *
   * Never throws, and never leaves the app without somewhere to send requests.
   * Resolves to true when the tenant changed, so the caller can drop a session
   * that belonged to a different installation.
   */
  async bootstrap(): Promise<{ tenantChanged: boolean }> {
    const slug = this.store.tenantSlug();
    if (!slug) return { tenantChanged: false };

    // A cached configuration is good enough to start on. Refresh behind it so a
    // changed API URL is picked up by the next launch at the latest.
    if (this.store.config()) {
      void this.refresh(slug);
      return { tenantChanged: false };
    }

    const config = await this.fetch(slug);
    if (!config) {
      // First launch, no network. The bundled base URL carries the app until
      // the next attempt; `MobileConfigStore.source` still reports 'bundled'.
      return { tenantChanged: false };
    }

    return { tenantChanged: this.store.set(config) };
  }

  /** Re-fetches in the background. A failure leaves the configuration in force. */
  async refresh(slug = this.store.tenantSlug()): Promise<void> {
    if (!slug) return;
    const config = await this.fetch(slug);
    if (config) this.store.set(config);
  }

  /**
   * One bootstrap request. Resolves to null on any failure.
   *
   * A 404 means an unknown, archived or suspended tenant — all answered
   * identically on purpose — and is as recoverable as a timeout from here: the
   * app keeps whatever configuration it already had.
   */
  private async fetch(slug: string): Promise<MobileConfig | null> {
    // The bundled base on native; the proxy prefix on web, where the dev server
    // and Vercel both forward it and no CORS preflight happens.
    const url = this.isNative
      ? `${environment.portalApiBaseUrl}${MOBILE_CONFIG_PATH}`
      : `${PORTAL_WEB_PREFIX}${MOBILE_CONFIG_PATH}`;

    try {
      const response = await firstValueFrom(
        this.http
          .get<unknown>(url, { params: new HttpParams().set('slug', slug) })
          .pipe(timeout(BOOTSTRAP_TIMEOUT_MS))
      );

      if (!isMobileConfig(response)) {
        console.warn('Mobile config did not match its contract; keeping the current one.');
        return null;
      }
      return response;
    } catch {
      return null;
    }
  }
}
