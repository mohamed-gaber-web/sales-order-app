import { inject, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { provideAppInitializer } from '@angular/core';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import {
  ApiAuthInterceptor,
  CompanyContextService,
  DeviceStorageService,
  RuntimeConfigService,
  SessionStore,
} from './core';
import { SESSION_READY, createSessionReady } from './core/auth/session-ready';

/**
 * Startup.
 *
 * ### What this used to do, and why it could not stay
 *
 * It fetched a D365 application token and then loaded all Companies, all
 * Currencies and all CustomersV3 — three unpaged OData sweeps — **before the
 * login screen rendered**, swallowing every error so the app booted anyway. That
 * arrangement only worked because the app held an ERP credential and needed no
 * user. Both halves of that are now false: there is no credential on the device,
 * and those endpoints are behind a session.
 *
 * So startup does no network at all. It restores what the last run persisted and
 * resolves; the lookups happen after sign-in, where they can actually succeed.
 * That is also the right shape for the job — a van on a route is offline often,
 * and a launch that waits on the network is a launch that fails in a warehouse
 * basement.
 */
function initializeApp(): Promise<void> {
  const storage = inject(DeviceStorageService);
  const session = inject(SessionStore);
  const config = inject(RuntimeConfigService);
  const companies = inject(CompanyContextService);

  // Before anything else. The previous version left an application-level ERP
  // token in localStorage under `access_token`; an upgraded device that kept it
  // would keep a working credential in the storage this change exists to empty.
  storage.purgeLegacyCredentials();

  return Promise.all([session.restore(), config.restore(), companies.restore()]).then(
    () => undefined
  );
}

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi()),
    // Shared with AuthGuard, which must not decide anybody is signed out before
    // storage has been read — the restore is async now, and a cold-start deep
    // link would otherwise race it and bounce to the login screen.
    { provide: SESSION_READY, useFactory: createSessionReady },
    provideAppInitializer(() => {
      const ready = inject(SESSION_READY);
      return initializeApp().then(() => ready.resolve());
    }),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiAuthInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
